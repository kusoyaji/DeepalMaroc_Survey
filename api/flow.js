const crypto = require('crypto');
const { initializeDatabase, saveSurveyResponse, getPhoneByFlowToken } = require('./db/postgres');
const { sendWhatsAppMessage, formatSurveyForWhatsApp } = require('./whatsapp-sender');
const { getContactFromChatwoot, getPhoneByFlowTokenFromChatwoot } = require('./chatwoot-helper');
const { initializeFlowQueue, getRecentPendingFlow } = require('./db/flow-queue');

let dbInitialized = false;

function decryptRequest(encryptedBody, privateKey, passphrase = '') {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = encryptedBody;
  
  // Decrypt AES key using RSA private key
  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      passphrase: passphrase,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  // Decrypt flow data using AES-GCM
  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');
  const TAG_LENGTH = 16;
  
  const encryptedFlowDataBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const encryptedFlowDataTag = flowDataBuffer.subarray(-TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(
    'aes-128-gcm',
    decryptedAesKey,
    initialVectorBuffer
  );
  decipher.setAuthTag(encryptedFlowDataTag);

  const decryptedJSONString = Buffer.concat([
    decipher.update(encryptedFlowDataBody),
    decipher.final(),
  ]).toString('utf-8');

  return {
    decryptedData: JSON.parse(decryptedJSONString),
    aesKey: decryptedAesKey,
    iv: initialVectorBuffer
  };
}

function encryptResponse(response, aesKey, iv) {
  // Flip IV bits (critical for WhatsApp Flows!)
  const flippedIv = Buffer.from(iv).map(b => ~b);
  
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf-8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([encrypted, tag]).toString('base64');
}

module.exports = async (req, res) => {
  console.log('========================================');
  console.log('Incoming request:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  // Initialize database on first request
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      await initializeFlowQueue();
      dbInitialized = true;
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  }

  if (req.method === 'GET') {
    return res.status(200).send('Deepal Maroc Webhook is running');
  }

  if (req.method === 'POST') {
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      console.error('PRIVATE_KEY not found in environment');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
      // Handle plain ping (unencrypted health check)
      if (req.body && req.body.action === 'ping') {
        console.log('Plain ping received');
        return res.status(200).json({ data: { status: 'active' } });
      }
      
      // Validate encrypted request
      if (!req.body.encrypted_aes_key || !req.body.encrypted_flow_data || !req.body.initial_vector) {
        console.error('Missing encryption fields');
        return res.status(400).json({ error: 'Invalid request format' });
      }
      
      console.log('Request body keys:', Object.keys(req.body));
      const { decryptedData, aesKey, iv } = decryptRequest(req.body, privateKey, '');
      console.log('Decrypted request:', JSON.stringify(decryptedData, null, 2));

      const { action, flow_token, data, version } = decryptedData;
      
      console.log('AES key length:', aesKey.length);
      console.log('IV length:', iv.length);

      if (action === 'ping') {
        console.log('Encrypted ping action received');
        const responseData = { 
          data: { 
            status: 'active' 
          } 
        };
        console.log('Response data:', JSON.stringify(responseData, null, 2));
        
        const encryptedResponse = encryptResponse(responseData, aesKey, iv);
        console.log('Encrypted response:', encryptedResponse);
        console.log('Encrypted response length:', encryptedResponse.length);
        
        // Return encrypted string directly (not wrapped in JSON)
        return res.status(200).send(encryptedResponse);
      }

      if (action === 'data_exchange') {
        console.log('========================================');
        console.log('✅ DATA EXCHANGE - DEEPAL SURVEY SUBMITTED');
        console.log('🎫 Flow Token:', flow_token);
        console.log('📊 Survey Data:', JSON.stringify(data, null, 2));
        console.log('========================================');
        
        // Get phone number - NEW PRIORITY ORDER WITH FLOW QUEUE:
        // 1. Flow queue (most reliable - tracks template sends) - PRIMARY
        // 2. Chatwoot conversation search (by flow_token) - FALLBACK
        // 3. Database lookup - FALLBACK
        // 4. Extract from flow_token pattern - LEGACY FALLBACK
        // 5. From data payload - LAST RESORT
        let phoneNumber = null;
        let contactName = null;
        let phoneSource = null;
        
        // METHOD 1: Check flow queue (NEW - MOST RELIABLE!)
        // This matches based on the outgoing template that was sent
        if (flow_token && ['unused', 'test', 'demo'].includes(flow_token.toLowerCase())) {
          console.log('🔍 PRIMARY METHOD: Checking flow queue for recent template send...');
          try {
            const queueResult = await getRecentPendingFlow(600); // Last 10 minutes
            if (queueResult && queueResult.phone) {
              phoneNumber = queueResult.phone;
              contactName = queueResult.name || null;
              phoneSource = 'flow_queue';
              console.log('✅ FLOW QUEUE SUCCESS: Phone:', phoneNumber, '| Name:', contactName);
            } else {
              console.log('⚠️ No pending flows in queue (might be too old or already consumed)');
            }
          } catch (queueError) {
            console.error('⚠️ Flow queue error:', queueError.message);
            // Continue to fallback methods
          }
        }
        
        // METHOD 2: Search Chatwoot for conversation containing this flow_token
        // This works regardless of flow_token format - NO DEPENDENCY ON ZOHO
        if (!phoneNumber && flow_token) {
          console.log('🔍 FALLBACK: Searching Chatwoot conversations for flow_token...');
          try {
            const chatwootResult = await getPhoneByFlowTokenFromChatwoot(flow_token);
            if (chatwootResult && chatwootResult.phone) {
              phoneNumber = chatwootResult.phone;
              contactName = chatwootResult.name || null;
              phoneSource = 'chatwoot_conversation_search';
              console.log('✅ CHATWOOT SUCCESS: Phone:', phoneNumber, '| Name:', contactName);
              console.log('📊 Conversation ID:', chatwootResult.conversationId);
            } else {
              console.log('⚠️ Chatwoot conversation search returned no results');
            }
          } catch (chatwootError) {
            console.error('⚠️ Chatwoot conversation search error:', chatwootError.message);
            // Continue to fallback methods
          }
        }
        
        // METHOD 3: Database lookup (phone captured when user opened Flow)
        // Now safe to use even for generic tokens since we have a separate mapping table
        if (!phoneNumber && flow_token) {
          console.log('🔍 FALLBACK: Checking database flow_token_mappings...');
          const dbResult = await getPhoneByFlowToken(flow_token);
          if (dbResult && dbResult.phone) {
            phoneNumber = dbResult.phone;
            contactName = dbResult.name || contactName;
            phoneSource = 'database_mapping';
            console.log('📞 Phone from DATABASE MAPPING:', phoneNumber, '| Name:', contactName);
          } else {
            console.log('⚠️ No mapping found in database for flow_token:', flow_token.substring(0, 30));
          }
        }
        
        // METHOD 3: Extract from flow_token pattern (LEGACY - depends on Zoho format)
        if (!phoneNumber && flow_token) {
          console.log('🔍 LEGACY FALLBACK: Attempting flow_token pattern extraction...');
          // deepal-212610059159-uuid format
          if (flow_token.startsWith('deepal-')) {
            const parts = flow_token.split('-');
            if (parts.length >= 3 && parts[1]) {
              phoneNumber = parts[1].startsWith('+') ? parts[1] : '+' + parts[1];
              phoneSource = 'flow_token_pattern';
              console.log('📞 Extracted from flow_token (pattern):', phoneNumber);
            }
          }
          // Regex fallback
          else {
            const phoneMatch = flow_token.match(/(\+?\d{10,15})/);
            if (phoneMatch) {
              phoneNumber = phoneMatch[1].startsWith('+') ? phoneMatch[1] : '+' + phoneMatch[1];
              phoneSource = 'flow_token_regex';
              console.log('📞 Extracted from flow_token (regex):', phoneNumber);
            }
          }
        }
        
        // METHOD 4: From data payload (last resort)
        if (!phoneNumber && data.phone_number) {
          phoneNumber = data.phone_number;
          phoneSource = 'data_payload';
          console.log('📞 Phone from DATA PAYLOAD:', phoneNumber);
        }
        
        console.log('📞 Final phone number:', phoneNumber);
        console.log('📍 Phone source:', phoneSource);
        
        // Fetch contact name from Chatwoot if not already obtained
        if (phoneNumber && !contactName) {
          console.log('👤 Fetching contact name from Chatwoot (by phone)...');
          try {
            const chatwootContact = await getContactFromChatwoot(phoneNumber);
            if (chatwootContact && chatwootContact.name) {
              contactName = chatwootContact.name;
              console.log('✅ Got name from Chatwoot:', contactName);
            } else {
              console.log('⚠️ No name found in Chatwoot for this phone');
            }
          } catch (chatwootError) {
            console.error('⚠️ Chatwoot lookup error:', chatwootError.message);
            // Non-blocking - continue without name
          }
        }
        
        // CRITICAL VALIDATION: Alert if phone number is missing
        if (!phoneNumber) {
          console.error('🚨🚨🚨 CRITICAL DATA INTEGRITY ALERT 🚨🚨🚨');
          console.error('❌ NO PHONE NUMBER FOUND!');
          console.error('Flow Token:', flow_token);
          console.error('Tried: database lookup, flow_token extraction, data payload');
          console.error('⚠️  This response will be saved WITHOUT phone number!');
          console.error('⚠️  It will be updated by Chatwoot webhook later');
          console.error('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
        } else {
          console.log(`✅ Phone number validated: ${phoneNumber} (source: ${phoneSource})`);
        }
        
        // CRITICAL: Add phone number to data object so it gets saved!
        if (phoneNumber) {
          data.phone_number = phoneNumber;
          console.log('📞 Added phone number to data payload:', phoneNumber);
        }
        
        // Save to database with phone and name
        try {
          const savedResponse = await saveSurveyResponse(flow_token, data, contactName);
          console.log('💾 Saved to database - ID:', savedResponse.id);
          console.log('📝 Saved data:', { phone: phoneNumber, name: contactName || '(no name)' });
          
          // Send formatted WhatsApp message (will appear in Chatwoot)
          if (phoneNumber) {
            try {
              const formattedMessage = formatSurveyForWhatsApp(data);
              await sendWhatsAppMessage(phoneNumber, formattedMessage);
              console.log('✅ Survey summary sent via WhatsApp (will appear in Chatwoot)');
            } catch (whatsappError) {
              console.error('⚠️ WhatsApp send error:', whatsappError.message);
              // Non-blocking - continue even if WhatsApp message fails
            }
          }
        } catch (dbError) {
          console.error('❌ Database save error:', dbError);
          // Continue anyway to send success response
        }

        const response = {
          screen: 'SUCCESS_SCREEN',
          data: {
            confirmation_message: 'Merci pour votre retour ! Votre avis compte beaucoup pour nous.'
          }
        };

        const encryptedResponse = encryptResponse(response, aesKey, iv);
        console.log('Data exchange encrypted response length:', encryptedResponse.length);
        
        // Return encrypted string directly
        return res.status(200).send(encryptedResponse);
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (error) {
      console.error('Error processing request:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

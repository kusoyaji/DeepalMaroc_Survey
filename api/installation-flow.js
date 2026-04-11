const crypto = require('crypto');
const { initializeInstallationDB, saveInstallationResponse, storeInstallationFlowMapping } = require('./db/installation-postgres');
const { getContactFromChatwoot, getPhoneByFlowTokenFromChatwoot } = require('./chatwoot-helper');
const { initializeFlowQueue, getRecentPendingFlow } = require('./db/flow-queue');

let dbInitialized = false;

function decryptRequest(encryptedBody, privateKey, passphrase = '') {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = encryptedBody;
  
  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      passphrase: passphrase,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');
  const TAG_LENGTH = 16;
  
  const encryptedFlowDataBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const encryptedFlowDataTag = flowDataBuffer.subarray(-TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv('aes-128-gcm', decryptedAesKey, initialVectorBuffer);
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
  console.log('📋 INSTALLATION FLOW - Request:', req.method);
  
  if (!dbInitialized) {
    try {
      await initializeInstallationDB();
      await initializeFlowQueue();
      dbInitialized = true;
    } catch (error) {
      console.error('DB init error:', error);
    }
  }

  if (req.method === 'GET') {
    return res.status(200).send('Deepal Installation Survey Webhook is running');
  }

  if (req.method === 'POST') {
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      console.error('PRIVATE_KEY not found');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
      if (req.body && req.body.action === 'ping') {
        return res.status(200).json({ data: { status: 'active' } });
      }
      
      if (!req.body.encrypted_aes_key || !req.body.encrypted_flow_data || !req.body.initial_vector) {
        return res.status(400).json({ error: 'Invalid request format' });
      }
      
      const { decryptedData, aesKey, iv } = decryptRequest(req.body, privateKey, '');
      console.log('📋 Installation decrypted:', JSON.stringify(decryptedData, null, 2));

      const { action, flow_token, data } = decryptedData;

      if (action === 'ping') {
        const encryptedResponse = encryptResponse({ data: { status: 'active' } }, aesKey, iv);
        return res.status(200).send(encryptedResponse);
      }

      if (action === 'data_exchange') {
        console.log('========================================');
        console.log('✅ INSTALLATION SURVEY SUBMITTED');
        console.log('🎫 Flow Token:', flow_token);
        console.log('� Data keys:', Object.keys(data || {}).join(', '));
        console.log('📊 Data values:', JSON.stringify(data));
        console.log('========================================');
        
        // ===== PHONE NUMBER CAPTURE (multiple fallback methods) =====
        let phoneNumber = null;
        let contactName = null;
        let phoneSource = null;
        
        // METHOD 1: Flow queue (tracks outgoing template sends) - ALWAYS check first
        console.log('🔍 Checking flow queue...');
        try {
          const queueResult = await getRecentPendingFlow(600); // 10 minutes
          if (queueResult && queueResult.phone) {
            phoneNumber = queueResult.phone;
            contactName = queueResult.name || null;
            phoneSource = 'flow_queue';
            console.log('✅ FLOW QUEUE: Phone:', phoneNumber);
          }
        } catch (err) {
          console.error('⚠️ Flow queue error:', err.message);
        }
        
        // METHOD 2: Chatwoot conversation search
        if (!phoneNumber && flow_token) {
          console.log('🔍 Searching Chatwoot...');
          try {
            const chatwootResult = await getPhoneByFlowTokenFromChatwoot(flow_token);
            if (chatwootResult && chatwootResult.phone) {
              phoneNumber = chatwootResult.phone;
              contactName = chatwootResult.name || null;
              phoneSource = 'chatwoot';
              console.log('✅ CHATWOOT: Phone:', phoneNumber);
            }
          } catch (err) {
            console.error('⚠️ Chatwoot search error:', err.message);
          }
        }
        
        // METHOD 3: Extract from flow_token pattern
        if (!phoneNumber && flow_token && !['unused', 'test', 'demo'].includes(flow_token.toLowerCase())) {
          if (flow_token.startsWith('deepal-')) {
            const parts = flow_token.split('-');
            if (parts.length >= 3 && parts[1]) {
              phoneNumber = parts[1].startsWith('+') ? parts[1] : '+' + parts[1];
              phoneSource = 'flow_token_pattern';
            }
          } else {
            const phoneMatch = flow_token.match(/(\+?\d{10,15})/);
            if (phoneMatch) {
              phoneNumber = phoneMatch[1].startsWith('+') ? phoneMatch[1] : '+' + phoneMatch[1];
              phoneSource = 'flow_token_regex';
            }
          }
        }
        
        // METHOD 4: From data payload
        if (!phoneNumber && data.phone_number) {
          phoneNumber = data.phone_number;
          phoneSource = 'data_payload';
        }
        
        console.log('📞 Final phone:', phoneNumber || 'MISSING', '| Source:', phoneSource || 'none');
        
        // Fetch contact name from Chatwoot if not already obtained
        if (phoneNumber && !contactName) {
          try {
            const contact = await getContactFromChatwoot(phoneNumber);
            if (contact && contact.name) {
              contactName = contact.name;
              console.log('👤 Name from Chatwoot:', contactName);
            }
          } catch (err) {
            console.error('⚠️ Contact lookup error:', err.message);
          }
        }
        
        if (!phoneNumber) {
          console.error('🚨 CRITICAL: NO PHONE NUMBER for installation survey!');
          console.error('   Flow Token:', flow_token);
        }
        
        // Add phone to data for DB save
        if (phoneNumber) {
          data.phone_number = phoneNumber;
        }
        
        // Save to database
        try {
          const saved = await saveInstallationResponse(flow_token, data, contactName);
          console.log('💾 Installation saved - ID:', saved.id, '| Phone:', saved.phone_number);
        } catch (dbError) {
          console.error('❌ Installation DB save error:', dbError);
        }

        const response = {
          screen: 'SUCCESS_SCREEN',
          data: {
            confirmation_message: 'Merci pour votre retour ! Votre avis compte beaucoup pour nous.'
          }
        };

        const encryptedResponse = encryptResponse(response, aesKey, iv);
        return res.status(200).send(encryptedResponse);
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (error) {
      console.error('Installation flow error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

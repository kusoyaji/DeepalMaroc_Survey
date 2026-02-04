// WhatsApp Webhook Handler - Captures phone numbers from Flow messages
// AND forwards all events to Chatwoot
const { storeFlowTokenMapping, initializeDatabase } = require('./db/postgres');

let dbInitialized = false;

// Chatwoot webhook URL - will auto-forward all WhatsApp events
const CHATWOOT_WEBHOOK = process.env.CHATWOOT_WEBHOOK_URL || '';

async function forwardToChatwoot(body) {
  if (!CHATWOOT_WEBHOOK) {
    console.log('⚠️  No Chatwoot webhook configured, skipping forward');
    return;
  }
  
  try {
    const response = await fetch(CHATWOOT_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });
    console.log('📤 Forwarded to Chatwoot:', response.status);
  } catch (error) {
    console.error('❌ Failed to forward to Chatwoot:', error.message);
  }
}

module.exports = async (req, res) => {
  console.log('🔔 Webhook received:', req.method);
  
  try {
    // Handle GET verification challenge from WhatsApp
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      
      console.log('📋 Verification params:', { mode, token, challenge });
      
      // Check verification token (should match what you set in WhatsApp settings)
      const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'deepal_maroc_verify_2026_secure';
      console.log('🔑 Expected token:', VERIFY_TOKEN);
      console.log('🔑 Received token:', token);
      console.log('🔍 Token types:', typeof VERIFY_TOKEN, typeof token);
      console.log('🔍 Tokens match (===):', token === VERIFY_TOKEN);
      console.log('🔍 Tokens match (==):', token == VERIFY_TOKEN);
      console.log('🔍 String comparison:', String(token) === String(VERIFY_TOKEN));
      
      // Use string comparison to handle any type issues
      if (mode === 'subscribe' && String(token).trim() === String(VERIFY_TOKEN).trim()) {
        console.log('✅ Webhook verified');
        return res.status(200).send(challenge);
      } else {
        console.log('❌ Webhook verification failed - mode:', mode, 'match:', String(token).trim() === String(VERIFY_TOKEN).trim());
        return res.status(403).send('Forbidden');
      }
    }
    
    // Handle POST webhook notifications
    if (req.method === 'POST') {
      const body = req.body;
      console.log('📨 Webhook payload:', JSON.stringify(body, null, 2));
      
      // Initialize database on first use
      if (!dbInitialized) {
        await initializeDatabase();
        dbInitialized = true;
      }
      
      // STEP 1: Process Flow events for our system
      let isFlowMessage = false;
      
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            const value = change.value;
            
            // Extract contact profile info (WhatsApp name)
            let whatsappName = null;
            if (value.contacts && value.contacts.length > 0) {
              const contact = value.contacts[0];
              whatsappName = contact.profile?.name || null;
              console.log('📋 Contact info received:', JSON.stringify(contact, null, 2));
              console.log('👤 Extracted WhatsApp name:', whatsappName || '(not provided)');
            }
            
            // Check for messages (including Flow messages)
            if (value.messages) {
              for (const message of value.messages) {
                const phoneNumber = message.from;
                const messageType = message.type;
                
                console.log(`📱 Message from ${phoneNumber}, type: ${messageType}`);
                if (whatsappName) {
                  console.log(`👤 WhatsApp Name: ${whatsappName}`);
                }
                
                // Log full message metadata for debugging
                console.log('📋 Message metadata:', JSON.stringify({
                  from: message.from,
                  id: message.id,
                  timestamp: message.timestamp,
                  type: messageType,
                  whatsapp_name: whatsappName
                }, null, 2));
                
                // If it's a Flow message, extract flow_token and store mapping
                if (messageType === 'interactive' && message.interactive?.type === 'nfm_reply') {
                  isFlowMessage = true;
                  const flowToken = message.interactive.nfm_reply.response_json;
                  
                  console.log('🔄 Flow interaction detected!');
                  console.log('📞 Phone:', phoneNumber);
                  console.log('🎫 Flow Token:', flowToken?.substring(0, 50) + '...');
                  
                  // Validate phone number format
                  if (!phoneNumber || !phoneNumber.match(/^\d{10,15}$/)) {
                    console.error('⚠️ Invalid phone number format:', phoneNumber);
                  } else {
                    console.log('✅ Valid phone number:', phoneNumber);
                  }
                  
                  // Parse flow_token if it's JSON string
                  let parsedToken = flowToken;
                  try {
                    if (typeof flowToken === 'string') {
                      parsedToken = JSON.parse(flowToken);
                    }
                  } catch (e) {
                    console.log('⚠️ Could not parse flow_token as JSON');
                  }
                  
                  // Extract actual flow_token from the response
                  const actualFlowToken = parsedToken?.flow_token || flowToken;
                  
                  if (actualFlowToken && phoneNumber) {
                    // Validate flow_token contains phone number
                    const tokenHasPhone = actualFlowToken.includes(phoneNumber.replace('+', ''));
                    if (!tokenHasPhone) {
                      console.warn('⚠️ Flow token does NOT contain phone number!');
                      console.warn('   Flow token:', actualFlowToken.substring(0, 50));
                      console.warn('   Phone:', phoneNumber);
                    }
                    
                    // Store the mapping WHEN USER STARTS THE FLOW
                    console.log('💾 Storing flow token mapping:', {
                      flowToken: actualFlowToken?.substring(0, 30) + '...',
                      phone: phoneNumber,
                      name: whatsappName || '(no name)'
                    });
                    const mappingResult = await storeFlowTokenMapping(actualFlowToken, phoneNumber, whatsappName);
                    console.log('✅ Flow token mapping storage result:', mappingResult);
                    console.log('✅ Stored phone→flow_token mapping:', phoneNumber, whatsappName ? `(${whatsappName})` : '', '→', actualFlowToken.substring(0, 20) + '...');
                  } else {
                    console.error('❌ Missing flow_token or phone_number for storage!');
                  }
                }
              }
            }
          }
        }
      }
      
      // STEP 2: Forward ALL events to Chatwoot (except Flow submissions)
      if (!isFlowMessage && CHATWOOT_WEBHOOK) {
        await forwardToChatwoot(body);
      }
      
      // Always respond 200 OK to WhatsApp
      return res.status(200).json({ status: 'received' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    console.error(error.stack);
    
    // Still return 200 to WhatsApp to avoid retries
    return res.status(200).json({ status: 'error', error: error.message });
  }
};

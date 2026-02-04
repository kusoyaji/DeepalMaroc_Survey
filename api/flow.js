const crypto = require('crypto');
const { initializeDatabase, saveSurveyResponse } = require('./db/postgres');

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
        console.log('Data exchange - Deepal Survey data received');
        console.log('Survey data:', JSON.stringify(data, null, 2));
        
        // Save to database
        try {
          const savedResponse = await saveSurveyResponse(flow_token, data);
          console.log('Database ID:', savedResponse.id);
        } catch (dbError) {
          console.error('Database save error:', dbError);
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

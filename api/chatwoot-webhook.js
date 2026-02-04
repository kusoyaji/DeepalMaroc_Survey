// Chatwoot Webhook - Captures Flow submissions with phone numbers
const { initializeDatabase, updatePhoneNumberByFlowToken } = require('./db/postgres');
const { sendSurveyToChatwoot } = require('./chatwoot-helper');

let dbInitialized = false;

function parseFlowSubmission(messageContent) {
  const lines = messageContent.split('\n');
  const data = {};
  
  for (const line of lines) {
    const match = line.match(/([^:]+):\s*(.+)/);
    if (match) {
      const fieldName = match[1].trim().toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[éèêë]/g, 'e')
        .replace(/[àâ]/g, 'a');
      const value = match[2].trim();
      
      const fieldMapping = {
        'phone_number': 'phone_number',
        'numero_de_telephone': 'phone_number',
        'q1_rating': 'q1_rating',
        'q1_comment': 'q1_comment',
        'q2_rating': 'q2_rating',
        'q2_comment': 'q2_comment',
        'q3_followup': 'q3_followup',
        'q4_rating': 'q4_rating',
        'q4_comment': 'q4_comment',
        'q5_rating': 'q5_rating',
        'q5_comment': 'q5_comment',
        'final_comments': 'final_comments'
      };
      
      const dbField = fieldMapping[fieldName];
      if (dbField) {
        data[dbField] = value;
      }
    }
  }
  
  return data;
}

module.exports = async (req, res) => {
  console.log('Chatwoot webhook triggered');
  
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const payload = req.body;
    
    if (!dbInitialized) {
      await initializeDatabase();
      dbInitialized = true;
    }
    
    const event = payload.event;
    const messageType = payload.message_type;
    const content = payload.content;
    
    if (event === 'message_created' && messageType === 'incoming' && content && content.includes('Form Submission')) {
      console.log('Flow submission detected');
      
      const phoneNumber = payload.sender?.phone_number || payload.sender?.identifier || 'unknown';
      const formData = parseFlowSubmission(content);
      const flowToken = payload.content_attributes?.form_data?.flow_token;
      
      if (Object.keys(formData).length > 0 && flowToken) {
        const updated = await updatePhoneNumberByFlowToken(flowToken, phoneNumber);
        
        if (updated) {
          console.log('Phone linked:', phoneNumber);
          
          try {
            await sendSurveyToChatwoot(phoneNumber, formData);
          } catch (error) {
            console.error('Error sending to Chatwoot:', error.message);
          }
          
          return res.status(200).json({ status: 'success', flowToken, phoneNumber });
        }
      }
      
      return res.status(200).json({ status: 'captured', phoneNumber });
    }
    
    return res.status(200).json({ status: 'ignored' });
    
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(200).json({ status: 'error', error: error.message });
  }
};

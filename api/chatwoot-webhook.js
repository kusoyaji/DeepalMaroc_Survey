// Chatwoot Webhook - Captures Flow submissions with phone numbers
const { initializeDatabase, updatePhoneNumberByFlowToken, storeFlowTokenMapping } = require('./db/postgres');
const { sendSurveyToChatwoot } = require('./chatwoot-helper');
const { initializeFlowQueue, addPendingFlow, cleanupFlowQueue } = require('./db/flow-queue');

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
  console.log('📦 Payload:', JSON.stringify(req.body, null, 2));
  
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const payload = req.body;
    
    if (!dbInitialized) {
      await initializeDatabase();
      await initializeFlowQueue();
      dbInitialized = true;
    }
    
    // Cleanup old queue entries periodically (1% chance per request)
    if (Math.random() < 0.01) {
      cleanupFlowQueue().catch(err => console.error('Cleanup error:', err));
    }
    
    const event = payload.event;
    const messageType = payload.message_type;
    const content = payload.content;
    
    console.log('📊 Event:', event, '| Type:', messageType);
    console.log('📱 Sender:', JSON.stringify(payload.sender || {}, null, 2));
    console.log('💬 Content:', content?.substring(0, 100));
    
    // ========================================
    // NEW: Track OUTGOING survey templates
    // ========================================
    if (event === 'message_created' && messageType === 'outgoing') {
      // Check if this is a survey template being sent
      const isSurveyTemplate = content?.includes('Deepal Family') || 
                              content?.includes('satisfaction') ||
                              content?.includes('5 courtes questions') ||
                              payload.additional_attributes?.template_params?.name === 'survey_vn';
      
      if (isSurveyTemplate) {
        // CRITICAL: For OUTGOING messages, the customer info is in conversation.meta.sender
        // NOT in payload.sender (which is the agent sending the message)
        const phoneNumber = payload.conversation?.meta?.sender?.phone_number || 
                           payload.conversation?.meta?.sender?.identifier;
        const whatsappName = payload.conversation?.meta?.sender?.name || null;
        const conversationId = payload.conversation?.id;
        const messageId = payload.id;
        
        if (phoneNumber) {
          console.log('📤 OUTGOING survey template detected!');
          console.log('   → Phone:', phoneNumber);
          console.log('   → Name:', whatsappName || '(no name)');
          console.log('   → Conversation ID:', conversationId);
          
          // Add to pending flow queue
          await addPendingFlow(phoneNumber, whatsappName, conversationId, messageId);
          
          return res.status(200).json({ status: 'template_tracked', phone: phoneNumber });
        }
      }
    }
    
    // ========================================
    // EXISTING: Handle INCOMING flow submissions
    // ========================================
    if (event === 'message_created' && messageType === 'incoming' && content && content.includes('Form Submission')) {
      console.log('Flow submission detected');
      
      const phoneNumber = payload.sender?.phone_number || payload.sender?.identifier || 'unknown';
      const whatsappName = payload.sender?.name || null;
      const flowToken = payload.content_attributes?.form_data?.flow_token;
      
      console.log('📞 Flow submission - Phone:', phoneNumber, '| Name:', whatsappName, '| Token:', flowToken);
      
      // CRITICAL: Store flow_token → phone + name mapping IMMEDIATELY
      // This happens BEFORE the flow endpoint processes the submission
      if (flowToken && phoneNumber && phoneNumber !== 'unknown') {
        try {
          await storeFlowTokenMapping(flowToken, phoneNumber, whatsappName);
          console.log('✅ Stored flow_token mapping in database');
          console.log('   → Token:', flowToken);
          console.log('   → Phone:', phoneNumber);
          console.log('   → Name:', whatsappName || '(no name)');
        } catch (dbError) {
          console.error('❌ Failed to store flow_token mapping:', dbError.message);
        }
      }
      
      // Legacy: Try to parse form data from message content (usually empty)
      const formData = parseFlowSubmission(content);
      
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

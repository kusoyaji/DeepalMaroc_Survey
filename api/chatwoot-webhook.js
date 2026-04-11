// Chatwoot Webhook - Captures Flow submissions with phone numbers
const { initializeDatabase, updatePhoneNumberByFlowToken, storeFlowTokenMapping } = require('./db/postgres');
const { sendSurveyToChatwoot } = require('./chatwoot-helper');
const { initializeFlowQueue, addPendingFlow, cleanupFlowQueue } = require('./db/flow-queue');
const { sendWhatsAppFlow } = require('./whatsapp-sender');

let dbInitialized = false;

// Installation survey flow config
const INSTALLATION_FLOW_ID = '960497796491131';
const INSTALLATION_TRIGGER = 'deepal new survey';

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
    // INSTALLATION SURVEY TRIGGER - Check BEFORE any other logic
    // ========================================
    const msgTextLower = (content || '').trim().toLowerCase();
    
    // Check trigger on ANY event type - Chatwoot might use different values
    if (msgTextLower === INSTALLATION_TRIGGER) {
      const phoneNumber = payload.conversation?.meta?.sender?.phone_number || 
                         payload.conversation?.meta?.sender?.identifier ||
                         payload.sender?.phone_number;
      const whatsappName = payload.conversation?.meta?.sender?.name || payload.sender?.name || null;
      const conversationId = payload.conversation?.id;
      const messageId = payload.id;

      console.log('🔔 TRIGGER MATCHED! event=' + event + ' type=' + messageType);
      console.log('🔔 Phone=' + phoneNumber + ' Name=' + whatsappName);

      if (phoneNumber) {
        try {
          await addPendingFlow(phoneNumber, whatsappName, conversationId, messageId);
          console.log('📝 Flow queue: ' + phoneNumber);
          
          // Strip + from phone for WhatsApp API
          const cleanPhone = phoneNumber.replace(/\+/g, '');
          console.log('📞 Sending flow to: ' + cleanPhone);
          
          await sendWhatsAppFlow(
            cleanPhone,
            INSTALLATION_FLOW_ID,
            'deepal_installation_survey',
            'Enquête Installation DEEPAL',
            'Bonjour, Merci d\'avoir choisi DEEPAL. Suite à l\'installation de votre borne de recharge, nous vous serions reconnaissants de bien vouloir partager votre expérience. Ce questionnaire ne vous prendra que quelques secondes.',
            'DEEPAL Maroc',
            'Répondre au questionnaire'
          );
          console.log('✅ FLOW SENT to: ' + cleanPhone);
          return res.status(200).json({ status: 'installation_flow_sent', phone: cleanPhone });
        } catch (flowError) {
          console.error('❌ FLOW SEND FAILED: ' + flowError.message);
          console.error('❌ Full error: ' + JSON.stringify(flowError));
          return res.status(200).json({ status: 'flow_send_error', error: flowError.message });
        }
      } else {
        console.error('❌ TRIGGER matched but NO PHONE found!');
        console.error('❌ conversation.meta.sender:', JSON.stringify(payload.conversation?.meta?.sender || {}));
        console.error('❌ sender:', JSON.stringify(payload.sender || {}));
      }
    }

    if (event === 'message_created' && messageType === 'outgoing') {
      const phoneNumber = payload.conversation?.meta?.sender?.phone_number || 
                         payload.conversation?.meta?.sender?.identifier;
      const whatsappName = payload.conversation?.meta?.sender?.name || null;
      const conversationId = payload.conversation?.id;
      const messageId = payload.id;

      // Check if this is a survey template being sent
      const isSurveyTemplate = content?.includes('Deepal Family') || 
                              content?.includes('satisfaction') ||
                              content?.includes('5 courtes questions') ||
                              content?.includes('borne de recharge') ||
                              content?.includes('borne DEEPAL') ||
                              payload.additional_attributes?.template_params?.name === 'survey_vn' ||
                              payload.additional_attributes?.template_params?.name === 'installation_survey';
      
      if (isSurveyTemplate) {
        // CRITICAL: For OUTGOING messages, the customer info is in conversation.meta.sender
        // NOT in payload.sender (which is the agent sending the message)
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

// Send formatted message to Chatwoot conversation
const CHATWOOT_ACCESS_TOKEN = process.env.CHATWOOT_ACCESS_TOKEN || 'j4qE9vZUww2LgHHNxDVJdpPp';
const CHATWOOT_BASE_URL = 'https://chat.voomdigital.net';
const CHATWOOT_ACCOUNT_ID = 14;

// Format survey data as readable message (Chatwoot style)
function formatSurveyData(data) {
  const ratingMap = {
    '5_etoiles': 'tres_satisfaisant',
    '4_etoiles': 'satisfaisant',
    '3_etoiles': 'neutre',
    '2_etoiles': 'peu_satisfait',
    '1_etoile': 'pas_satisfait'
  };

  let message = 'Form Submission:\n';

  message += `• Confirmation: Merci pour votre retour!\n`;

  if (data.q1_rating) {
    message += `• Accueil courtoisie: ${ratingMap[data.q1_rating] || data.q1_rating}\n`;
    message += `• Accueil courtoisie raison: ${data.q1_comment || ''}\n`;
  }

  if (data.q2_rating) {
    message += `• Livraison qualite: ${ratingMap[data.q2_rating] || data.q2_rating}\n`;
    message += `• Livraison qualite raison: ${data.q2_comment || ''}\n`;
  }

  if (data.q3_followup) {
    message += `• Delais respectes: ${data.q3_followup}\n`;
  }

  if (data.q4_rating) {
    message += `• Qualite service: ${ratingMap[data.q4_rating] || data.q4_rating}\n`;
    message += `• Qualite service raison: ${data.q4_comment || ''}\n`;
  }

  if (data.q5_rating) {
    const noteMap = {
      '5_etoiles': '10',
      '4_etoiles': '8',
      '3_etoiles': '6',
      '2_etoiles': '4',
      '1_etoile': '2'
    };
    message += `• Note recommandation: ${noteMap[data.q5_rating] || '0'}\n`;
  }

  if (data.q5_comment) {
    message += `• Commentaire recommandation: ${data.q5_comment}\n`;
  }

  if (data.final_comments) {
    message += `• Recontact: ${data.final_comments}\n`;
  } else {
    message += `• Recontact: non\n`;
  }

  return message;
}

// Get contact details from Chatwoot by phone number
async function getContactFromChatwoot(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
  
  try {
    console.log('🔍 Chatwoot: Looking up contact for phone:', cleanPhone);
    
    // Search for contact by phone number
    const response = await fetch(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(cleanPhone)}`,
      {
        method: 'GET',
        headers: {
          'api_access_token': CHATWOOT_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.log('⚠️ Chatwoot API error:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('📄 Chatwoot search results:', data.payload?.length || 0, 'contacts found');
    
    // Find exact match by phone number
    const contact = data.payload?.find(c => 
      c.phone_number === cleanPhone || 
      c.phone_number === phoneNumber ||
      c.identifier === cleanPhone
    );

    if (contact) {
      console.log('✅ Chatwoot contact found:', {
        name: contact.name,
        phone: contact.phone_number,
        email: contact.email
      });
      
      return {
        name: contact.name || null,
        phone: contact.phone_number || phoneNumber,
        email: contact.email || null,
        id: contact.id
      };
    }
    
    console.log('❌ No exact contact match in Chatwoot');
    return null;
  } catch (error) {
    console.error('❌ ERROR - fetching contact from Chatwoot:', error);
    return null;
  }
}

// Get conversation ID by phone number
async function getConversationByPhone(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
  
  try {
    const response = await fetch(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations?q=${encodeURIComponent(cleanPhone)}`,
      {
        method: 'GET',
        headers: {
          'api_access_token': CHATWOOT_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Chatwoot API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Find conversation with matching phone
    const conversation = data.payload?.find(conv => 
      conv.meta?.sender?.phone_number === cleanPhone ||
      conv.meta?.sender?.identifier === cleanPhone
    );

    return conversation?.id || null;
  } catch (error) {
    console.error('ERROR - finding conversation:', error);
    return null;
  }
}

// Send message to Chatwoot conversation
async function sendMessageToChatwoot(conversationId, content, isPrivate = false) {
  try {
    const response = await fetch(
      `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          'api_access_token': CHATWOOT_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content,
          message_type: 'outgoing',
          private: isPrivate
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chatwoot API error: ${response.status} - ${error}`);
    }

    return await response.json();
  } catch (error) {
    console.error('ERROR - sending message to Chatwoot:', error);
    throw error;
  }
}

// Send formatted survey response to Chatwoot
async function sendSurveyToChatwoot(phoneNumber, surveyData) {
  try {
    // Get conversation ID
    const conversationId = await getConversationByPhone(phoneNumber);
    
    if (!conversationId) {
      console.log('WARNING - No conversation found for phone:', phoneNumber);
      return { success: false, error: 'Conversation not found' };
    }

    console.log('INFO - Found conversation:', conversationId);

    // Format survey data
    const formattedMessage = formatSurveyData(surveyData);

    // Send as PRIVATE note (internal)
    const result = await sendMessageToChatwoot(conversationId, formattedMessage, true);

    console.log('SUCCESS - Formatted survey sent to Chatwoot conversation:', conversationId);
    return { success: true, conversationId, messageId: result.id };
  } catch (error) {
    console.error('ERROR - sending survey to Chatwoot:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  formatSurveyData,
  sendMessageToChatwoot,
  getConversationByPhone,
  sendSurveyToChatwoot,
  getContactFromChatwoot
};

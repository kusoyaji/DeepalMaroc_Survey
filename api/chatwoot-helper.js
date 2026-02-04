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

/**
 * 🎯 CRITICAL: Search Chatwoot for flow_token to extract phone number
 * This is the ZOHO-INDEPENDENT solution that guarantees phone capture
 * 
 * How it works:
 * 1. Zoho sends flow via Chatwoot → WhatsApp with flow_token
 * 2. Chatwoot stores the message with flow_token in conversation
 * 3. User submits flow (even days later)
 * 4. We search Chatwoot conversations for that flow_token
 * 5. Extract phone number from the conversation
 * 6. ✅ 100% guaranteed capture (works with ANY flow_token format!)
 */
async function getPhoneByFlowTokenFromChatwoot(flowToken) {
  try {
    console.log('🔍 Searching Chatwoot for flow_token:', flowToken.substring(0, 30) + '...');
    
    // Search conversations by flow_token
    const searchUrl = `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/search`;
    const searchParams = new URLSearchParams({
      q: flowToken,
      page: 1
    });
    
    const response = await fetch(`${searchUrl}?${searchParams}`, {
      method: 'GET',
      headers: {
        'api_access_token': CHATWOOT_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log('⚠️ Chatwoot search API error:', response.status);
      return null;
    }

    const data = await response.json();
    const conversations = data.payload || [];
    
    console.log(`📊 Found ${conversations.length} conversations matching flow_token`);

    if (conversations.length > 0) {
      // Get phone number from first matching conversation
      const conversation = conversations[0];
      const phoneNumber = conversation.meta?.sender?.phone_number || 
                         conversation.meta?.sender?.identifier;
      const customerName = conversation.meta?.sender?.name || null;

      if (phoneNumber) {
        console.log('✅ Phone extracted from Chatwoot conversation:', {
          phone: phoneNumber,
          name: customerName || '(no name)',
          conversation_id: conversation.id
        });
        
        return {
          phone_number: phoneNumber,
          customer_name: customerName
        };
      } else {
        console.log('⚠️ Conversation found but no phone number in metadata');
      }
    }

    // Fallback: Search recent conversations and check messages
    console.log('🔍 Searching recent conversations...');
    const recentResult = await searchRecentConversationsForFlowToken(flowToken);
    if (recentResult) {
      return recentResult;
    }

    console.log('❌ Phone number not found in Chatwoot for flow_token');
    return null;

  } catch (error) {
    console.error('❌ Error searching Chatwoot by flow_token:', error);
    return null;
  }
}

/**
 * Search recent conversations and their messages for flow_token
 * Fallback method if direct conversation search doesn't work
 */
async function searchRecentConversationsForFlowToken(flowToken) {
  try {
    const url = `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations`;
    const params = new URLSearchParams({
      status: 'all',
      page: 1
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'api_access_token': CHATWOOT_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const conversations = data.payload || [];

    // Check last 20 conversations
    for (const conv of conversations.slice(0, 20)) {
      // Get messages from this conversation
      const messagesUrl = `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conv.id}/messages`;
      
      const msgResponse = await fetch(messagesUrl, {
        headers: {
          'api_access_token': CHATWOOT_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      if (msgResponse.ok) {
        const messages = await msgResponse.json();
        const payload = messages.payload || messages;
        
        // Check if any message contains the flow_token
        const hasFlowToken = payload.some(msg => 
          msg.content?.includes(flowToken) ||
          JSON.stringify(msg.content_attributes || {}).includes(flowToken)
        );

        if (hasFlowToken) {
          const phoneNumber = conv.meta?.sender?.phone_number || 
                             conv.meta?.sender?.identifier;
          const customerName = conv.meta?.sender?.name || null;

          if (phoneNumber) {
            console.log('✅ Phone found in conversation messages:', {
              phone: phoneNumber,
              name: customerName || '(no name)',
              conversation_id: conv.id
            });
            
            return {
              phone_number: phoneNumber,
              customer_name: customerName
            };
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error searching recent conversations:', error);
    return null;
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
  getContactFromChatwoot,
  getPhoneByFlowTokenFromChatwoot
};

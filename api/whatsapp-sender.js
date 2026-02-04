// Send WhatsApp messages using Meta Graph API
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '875940088939317';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'EAAWqkyU5JYYBQjXOfEnzw1tO3APGrZAlkG8AaPFZArGheRPK0FpAqiCcdLRyjsBSkAU9jkERZB51gfXHFo9qH3ZA5X6DYlLhU3yIgbgYCWtDsvGnGOA6PR5QyliJEnbSgaidpEE1c3nVwGCioXzTcDLPFQdqlCf8aUNqmc1gc8KTeUM0XTYUpVRfzXlulwZDZD';

async function sendWhatsAppMessage(recipientPhone, messageText) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  
  const body = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'text',
    text: {
      body: messageText
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('WhatsApp API error:', result);
      throw new Error(`WhatsApp API failed: ${JSON.stringify(result)}`);
    }

    console.log('✅ WhatsApp message sent:', result.messages?.[0]?.id);
    return result;
  } catch (error) {
    console.error('❌ Failed to send WhatsApp message:', error);
    throw error;
  }
}

function formatSurveyForWhatsApp(data) {
  let message = '📋 Form Submission:\n';
  message += '• Confirmation: Merci pour votre retour!\n';

  const ratingMap = {
    '5_etoiles': 'tres_satisfaisant',
    '4_etoiles': 'satisfaisant', 
    '3_etoiles': 'neutre',
    '2_etoiles': 'peu_satisfait',
    '1_etoile': 'pas_satisfait'
  };

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

  if (data.final_comments) {
    message += `• Recontact: ${data.final_comments}\n`;
  } else {
    message += `• Recontact: non\n`;
  }

  return message;
}

module.exports = {
  sendWhatsAppMessage,
  formatSurveyForWhatsApp
};

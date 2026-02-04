// Minimal Chatwoot Webhook Test
module.exports = async (req, res) => {
  console.log('Chatwoot webhook test triggered');
  
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    return res.status(200).json({ 
      status: 'success',
      message: 'Webhook received' 
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};

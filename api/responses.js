const { getAllResponses } = require('./db/postgres');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  if (req.method === 'GET') {
    try {
      const responses = await getAllResponses();
      return res.status(200).json(responses);
    } catch (error) {
      console.error('Error fetching responses:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};

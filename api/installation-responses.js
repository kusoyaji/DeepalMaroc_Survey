const { initializeInstallationDB, getAllInstallationResponses } = require('./db/installation-postgres');

let dbInitialized = false;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  if (req.method === 'GET') {
    try {
      if (!dbInitialized) {
        await initializeInstallationDB();
        dbInitialized = true;
      }
      const responses = await getAllInstallationResponses();
      return res.status(200).json(responses);
    } catch (error) {
      console.error('Error fetching installation responses:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};

const { initializeInstallationDB, getAllInstallationResponses, updateInstallationResponse, deleteInstallationResponses } = require('./db/installation-postgres');

let dbInitialized = false;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    if (!dbInitialized) {
      await initializeInstallationDB();
      dbInitialized = true;
    }
    
    if (req.method === 'GET') {
      const responses = await getAllInstallationResponses();
      return res.status(200).json(responses);
    }
    
    if (req.method === 'PUT') {
      const { id, ...fields } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const result = await updateInstallationResponse(id, fields);
      return res.status(200).json(result);
    }
    
    if (req.method === 'DELETE') {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Missing ids array' });
      }
      const deleted = await deleteInstallationResponses(ids);
      return res.status(200).json({ deleted });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Installation responses API error:', error);
    return res.status(500).json({ error: error.message });
  }
};

const { initializeInstallationDB, getAllInstallationResponses } = require('./db/installation-postgres');

let dbInitialized = false;

function convertToCSV(data) {
  const headers = [
    'ID', 'Date', 'Heure', 'Nom', 'Téléphone',
    'NPS (0-10)', 'Satisfaction (1-10)', 'Délais Respectés',
    'Professionnalisme (1-10)', 'Remarques',
    'Score NPS', 'Satisfaction Moyenne', 'Promoteur', 'Passif', 'Détracteur', 'Suivi Requis',
    'Jour Semaine', 'Mois'
  ];

  const rows = data.map(row => [
    row.id,
    row.response_date || new Date(row.created_at).toLocaleDateString('fr-FR'),
    row.response_time || new Date(row.created_at).toLocaleTimeString('fr-FR'),
    row.whatsapp_name || '',
    row.phone_number || 'N/A',
    row.q1_nps || '',
    row.q2_satisfaction || '',
    row.q3_delais === 'oui' ? 'Oui' : row.q3_delais === 'non' ? 'Non' : '',
    row.q4_professionnalisme || '',
    row.q5_remarques || '',
    row.nps_score || '',
    row.satisfaction_avg ? Math.round(parseFloat(row.satisfaction_avg) * 100) + '%' : '',
    row.is_promoter ? 'Oui' : 'Non',
    row.is_passive ? 'Oui' : 'Non',
    row.is_detractor ? 'Oui' : 'Non',
    row.needs_followup ? 'Oui' : 'Non',
    (row.response_day_of_week || '').trim(),
    (row.response_month || '').trim()
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell =>
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
        ? `"${cell.replace(/"/g, '""')}"`
        : cell
    ).join(','))
  ].join('\n');

  return '\uFEFF' + csvContent;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET') {
    try {
      if (!dbInitialized) {
        await initializeInstallationDB();
        dbInitialized = true;
      }
      const responses = await getAllInstallationResponses();
      const csv = convertToCSV(responses);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=installation-survey-export.csv');
      return res.status(200).send(csv);
    } catch (error) {
      console.error('Export error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};

const { getAllResponses } = require('./db/postgres');

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  
  const translations = {
    '5_etoiles': 'Très Satisfait',
    '4_etoiles': 'Satisfait',
    '3_etoiles': 'Neutre',
    '2_etoiles': 'Peu Satisfait',
    '1_etoile': 'Pas du tout Satisfait',
    'oui': 'Oui',
    'non': 'Non',
    'positive': 'Positif',
    'negative': 'Negatif',
    'neutral': 'Neutre'
  };
  
  return translations[value] || value;
}

function convertToCSV(data) {
  const headers = [
    'ID', 'Date', 'Heure', 'Téléphone',
    'Q1 Accueil (Rating)', 'Q1 Commentaire',
    'Q2 Livraison (Rating)', 'Q2 Commentaire',
    'Q3 Appel Suivi',
    'Q4 Conseiller (Rating)', 'Q4 Commentaire',
    'Q5 Marque (Rating)', 'Q5 Commentaire',
    'Remarques Finales',
    'Score Satisfaction (%)', 'Promoteur', 'Detracteur', 'Suivi Requis', 'Sentiment',
    'Jour Semaine', 'Mois', 'Date Creation', 'Date MAJ'
  ];

  const rows = data.map(row => [
    row.id,
    row.response_date || new Date(row.created_at).toLocaleDateString('fr-FR'),
    row.response_time || new Date(row.created_at).toLocaleTimeString('fr-FR'),
    row.phone_number || 'N/A',
    formatValue(row.q1_rating),
    row.q1_comment || '',
    formatValue(row.q2_rating),
    row.q2_comment || '',
    formatValue(row.q3_followup),
    formatValue(row.q4_rating),
    row.q4_comment || '',
    formatValue(row.q5_rating),
    row.q5_comment || '',
    row.final_comments || '',
    row.satisfaction_score ? Math.round(row.satisfaction_score * 100) : '',
    formatValue(row.is_promoter),
    formatValue(row.is_detractor),
    formatValue(row.needs_followup),
    formatValue(row.sentiment),
    (row.response_day_of_week || '').trim(),
    (row.response_month || '').trim(),
    new Date(row.created_at).toLocaleString('fr-FR'),
    new Date(row.updated_at).toLocaleString('fr-FR')
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => 
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
        ? `"${cell.replace(/"/g, '""')}"`
        : cell
    ).join(','))
  ].join('\n');

  return '\uFEFF' + csvContent; // UTF-8 BOM for Excel
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET') {
    try {
      const responses = await getAllResponses();
      const csv = convertToCSV(responses);
      const filename = `deepal-survey-export-${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (error) {
      console.error('Error exporting data:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};

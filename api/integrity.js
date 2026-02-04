// Data Integrity Dashboard Endpoint
// Shows phone number capture statistics and missing data
const { 
  getDataIntegrityStats, 
  getResponsesWithoutPhone, 
  getRecentResponsesWithStats 
} = require('./db/postgres');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const hours = parseInt(req.query.hours) || 24;
    const showMissing = req.query.show_missing !== 'false';
    
    // Get overall statistics
    const stats = await getDataIntegrityStats();
    
    // Get recent responses
    const recentResponses = await getRecentResponsesWithStats(hours);
    
    // Get responses without phone numbers (if requested)
    const missingPhoneResponses = showMissing ? await getResponsesWithoutPhone(50) : [];
    
    // Build response
    const integrity = {
      timestamp: new Date().toISOString(),
      period_hours: hours,
      overall_stats: {
        total_responses: parseInt(stats.total_responses),
        responses_with_phone: parseInt(stats.with_phone),
        responses_missing_phone: parseInt(stats.missing_phone),
        phone_capture_rate: `${stats.phone_capture_rate_percent}%`,
        status: stats.phone_capture_rate_percent >= 95 ? '✅ EXCELLENT' : 
                stats.phone_capture_rate_percent >= 80 ? '⚠️ GOOD' : 
                stats.phone_capture_rate_percent >= 50 ? '⚠️ NEEDS ATTENTION' : 
                '🚨 CRITICAL'
      },
      recent_responses: recentResponses.map(r => ({
        id: r.id,
        phone_number: r.phone_number || '🚨 MISSING',
        phone_status: r.phone_status,
        flow_token: r.flow_token.substring(0, 40) + '...',
        satisfaction_score: r.satisfaction_score,
        is_promoter: r.is_promoter,
        is_detractor: r.is_detractor,
        created_at: r.created_at
      })),
      missing_phone_count: missingPhoneResponses.length,
      missing_phone_examples: showMissing ? missingPhoneResponses.slice(0, 10).map(r => ({
        id: r.id,
        flow_token: r.flow_token.substring(0, 50),
        created_at: r.created_at,
        has_data: !!(r.q1_rating || r.q2_rating || r.q4_rating || r.q5_rating)
      })) : []
    };
    
    // Add alert if capture rate is low
    if (stats.phone_capture_rate_percent < 95) {
      integrity.alert = {
        level: stats.phone_capture_rate_percent < 50 ? 'CRITICAL' : 'WARNING',
        message: `Phone capture rate is ${stats.phone_capture_rate_percent}%. Expected: 100%`,
        action: 'Check flow_token generation. Ensure all Flows are sent with properly formatted flow_tokens (deepal-{phone}-{uuid})'
      };
    }
    
    return res.status(200).json(integrity);
    
  } catch (error) {
    console.error('Data integrity check error:', error);
    return res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

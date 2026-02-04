const { neon } = require('@neondatabase/serverless');

async function initializeDatabase() {
  const sql = neon(process.env.DATABASE_URL);
  
  await sql`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id SERIAL PRIMARY KEY,
      flow_token TEXT UNIQUE NOT NULL,
      phone_number TEXT,
      
      -- Deepal Survey Fields
      q1_rating TEXT,
      q1_comment TEXT,
      q2_rating TEXT,
      q2_comment TEXT,
      q3_followup TEXT,
      q4_rating TEXT,
      q4_comment TEXT,
      q5_rating TEXT,
      q5_comment TEXT,
      final_comments TEXT,
      
      -- Analytics (auto-calculated)
      satisfaction_score DECIMAL(3,2),
      is_promoter BOOLEAN,
      is_detractor BOOLEAN,
      needs_followup BOOLEAN,
      sentiment TEXT,
      
      -- Metadata
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      response_date DATE DEFAULT CURRENT_DATE,
      response_time TIME DEFAULT CURRENT_TIME,
      response_day_of_week TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'Day'),
      response_month TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'Month')
    )
  `;
  
  console.log('Database initialized successfully');
}

async function saveSurveyResponse(flowToken, data) {
  const sql = neon(process.env.DATABASE_URL);
  
  // Get phone number directly from form data (GUARANTEED from PHONE_SCREEN)
  const phone_number = data.phone_number || null;
  
  // Calculate satisfaction score (0-1 scale) based on star ratings
  const starMap = {
    '5_etoiles': 1.0,
    '4_etoiles': 0.8,
    '3_etoiles': 0.6,
    '2_etoiles': 0.4,
    '1_etoile': 0.2
  };
  
  const scores = [
    starMap[data.q1_rating] || 0,
    starMap[data.q2_rating] || 0,
    starMap[data.q4_rating] || 0,
    starMap[data.q5_rating] || 0
  ].filter(s => s > 0);
  
  const satisfaction_score = scores.length > 0 
    ? scores.reduce((a, b) => a + b, 0) / scores.length 
    : null;
  
  // Calculate NPS metrics based on Q4 (recommend commercial) or Q5 (recommend brand)
  // Using 5-star scale: 5 stars = promoter, 4 stars = passive, 1-3 stars = detractor
  const promoterRatings = ['5_etoiles'];
  const detractorRatings = ['1_etoile', '2_etoiles', '3_etoiles'];
  
  const is_promoter = promoterRatings.includes(data.q4_rating) || promoterRatings.includes(data.q5_rating);
  const is_detractor = detractorRatings.includes(data.q4_rating) || detractorRatings.includes(data.q5_rating);
  
  // Determine if followup needed (MUST be boolean, not string)
  const needs_followup = !!(
    data.q1_comment || 
    data.q2_comment || 
    data.q4_comment || 
    data.q5_comment || 
    is_detractor ||
    data.q3_followup === 'non' // No follow-up call received
  );
  
  // Calculate sentiment
  let sentiment = 'neutral';
  if (satisfaction_score >= 0.75) sentiment = 'positive';
  else if (satisfaction_score < 0.5) sentiment = 'negative';
  
  const result = await sql`
    INSERT INTO survey_responses (
      flow_token,
      phone_number,
      q1_rating,
      q1_comment,
      q2_rating,
      q2_comment,
      q3_followup,
      q4_rating,
      q4_comment,
      q5_rating,
      q5_comment,
      final_comments,
      satisfaction_score,
      is_promoter,
      is_detractor,
      needs_followup,
      sentiment
    ) VALUES (
      ${flowToken},
      ${phone_number},
      ${data.q1_rating || null},
      ${data.q1_comment || null},
      ${data.q2_rating || null},
      ${data.q2_comment || null},
      ${data.q3_followup || null},
      ${data.q4_rating || null},
      ${data.q4_comment || null},
      ${data.q5_rating || null},
      ${data.q5_comment || null},
      ${data.final_comments || null},
      ${satisfaction_score},
      ${is_promoter},
      ${is_detractor},
      ${needs_followup},
      ${sentiment}
    )
    ON CONFLICT (flow_token) 
    DO UPDATE SET
      phone_number = EXCLUDED.phone_number,
      q1_rating = EXCLUDED.q1_rating,
      q1_comment = EXCLUDED.q1_comment,
      q2_rating = EXCLUDED.q2_rating,
      q2_comment = EXCLUDED.q2_comment,
      q3_followup = EXCLUDED.q3_followup,
      q4_rating = EXCLUDED.q4_rating,
      q4_comment = EXCLUDED.q4_comment,
      q5_rating = EXCLUDED.q5_rating,
      q5_comment = EXCLUDED.q5_comment,
      final_comments = EXCLUDED.final_comments,
      satisfaction_score = EXCLUDED.satisfaction_score,
      is_promoter = EXCLUDED.is_promoter,
      is_detractor = EXCLUDED.is_detractor,
      needs_followup = EXCLUDED.needs_followup,
      sentiment = EXCLUDED.sentiment,
      updated_at = NOW()
    RETURNING id
  `;
  
  return result[0];
}

async function getAllResponses() {
  const sql = neon(process.env.DATABASE_URL);
  const responses = await sql`
    SELECT * FROM survey_responses 
    ORDER BY created_at DESC
  `;
  return responses;
}

module.exports = {
  initializeDatabase,
  saveSurveyResponse,
  getAllResponses
};

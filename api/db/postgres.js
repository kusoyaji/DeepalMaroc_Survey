const { neon } = require('@neondatabase/serverless');

async function initializeDatabase() {
  const sql = neon(process.env.DATABASE_URL);
  
  await sql`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id SERIAL PRIMARY KEY,
      flow_token TEXT NOT NULL,
      phone_number TEXT,
      whatsapp_name TEXT,
      
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
  
  // DROP the UNIQUE constraint on flow_token (allow multiple submissions with same token)
  await sql`
    ALTER TABLE survey_responses 
    DROP CONSTRAINT IF EXISTS survey_responses_flow_token_key
  `;
  
  // Add phone_number column if it doesn't exist (migration)
  await sql`
    ALTER TABLE survey_responses 
    ADD COLUMN IF NOT EXISTS phone_number TEXT
  `;
  
  // Add whatsapp_name column if it doesn't exist (migration)
  await sql`
    ALTER TABLE survey_responses 
    ADD COLUMN IF NOT EXISTS whatsapp_name TEXT
  `;
  
  console.log('Database initialized successfully');
}

async function saveSurveyResponse(flowToken, data, whatsappName = null) {
  const sql = neon(process.env.DATABASE_URL);
  
  // Extract phone number from flow_token (format: deepal-212610059159-uuid)
  let phone_number = data.phone_number || null;
  
  if (!phone_number && flowToken) {
    if (flowToken.startsWith('deepal-')) {
      const parts = flowToken.split('-');
      if (parts.length >= 3 && parts[1]) {
        phone_number = parts[1].startsWith('+') ? parts[1] : '+' + parts[1];
        console.log(`📞 DB: Extracted phone from flow_token: ${phone_number}`);
      }
    } else {
      // Fallback: try to find phone number pattern
      const phoneMatch = flowToken.match(/(\+?\d{10,15})/);
      if (phoneMatch) {
        phone_number = phoneMatch[1].startsWith('+') ? phoneMatch[1] : '+' + phoneMatch[1];
        console.log(`📞 DB: Extracted phone via regex: ${phone_number}`);
      }
    }
  }
  
  // Log warning if no phone number
  if (!phone_number) {
    console.warn('⚠️  DB: Saving response WITHOUT phone number! Flow token:', flowToken.substring(0, 30));
  }
  
  // Log name if provided
  if (whatsappName) {
    console.log('👤 DB: Saving with WhatsApp name:', whatsappName);
  }
  
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
  
  // Try to UPDATE existing row first (created by Chatwoot webhook)
  // Use subquery to find the most recent row with this flow_token that has phone but no survey data
  const updateResult = await sql`
    UPDATE survey_responses
    SET 
      q1_rating = ${data.q1_rating || null},
      q1_comment = ${data.q1_comment || null},
      q2_rating = ${data.q2_rating || null},
      q2_comment = ${data.q2_comment || null},
      q3_followup = ${data.q3_followup || null},
      q4_rating = ${data.q4_rating || null},
      q4_comment = ${data.q4_comment || null},
      q5_rating = ${data.q5_rating || null},
      q5_comment = ${data.q5_comment || null},
      final_comments = ${data.final_comments || null},
      satisfaction_score = ${satisfaction_score},
      is_promoter = ${is_promoter},
      is_detractor = ${is_detractor},
      needs_followup = ${needs_followup},
      sentiment = ${sentiment},
      updated_at = NOW()
    WHERE id = (
      SELECT id 
      FROM survey_responses 
      WHERE flow_token = ${flowToken}
        AND q1_rating IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    )
    RETURNING id
  `;
  
  // If UPDATE succeeded, return that row
  if (updateResult.length > 0) {
    console.log('✅ Updated existing row with survey data, ID:', updateResult[0].id);
    return updateResult[0];
  }
  
  // Otherwise INSERT new row (fallback)
  console.log('📝 Creating new row (no existing row to update)');
  const result = await sql`
    INSERT INTO survey_responses (
      flow_token,
      phone_number,
      whatsapp_name,
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
      ${whatsappName},
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
    RETURNING id
  `;
  
  return result[0];
}

async function getAllResponses() {
  const sql = neon(process.env.DATABASE_URL);
  const responses = await sql`
    SELECT 
      id, flow_token, phone_number, whatsapp_name,
      q1_rating, q1_comment, q2_rating, q3_followup,
      q4_rating, q4_comment, q5_rating, q5_comment,
      satisfaction_score, is_promoter, is_detractor,
      sentiment, needs_followup, created_at, updated_at,
      response_date, response_time, response_day_of_week, response_month
    FROM survey_responses 
    ORDER BY created_at DESC
  `;
  console.log('📊 Retrieved', responses.length, 'responses (with whatsapp_name column)');
  return responses;
}

/**
 * Store flow_token → phone_number mapping
 * Called by /api/webhook when user starts a Flow
 */
async function storeFlowTokenMapping(flowToken, phoneNumber, whatsappName = null) {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    // Insert new record for EACH flow submission (no conflict check)
    await sql`
      INSERT INTO survey_responses (
        flow_token,
        phone_number,
        whatsapp_name
      ) VALUES (
        ${flowToken},
        ${phoneNumber},
        ${whatsappName}
      )
    `;
    
    console.log('✅ Flow token mapping stored:', {
      token: flowToken.substring(0, 20) + '...',
      phone: phoneNumber,
      name: whatsappName || '(no name provided)'
    });
    return { success: true };
  } catch (error) {
    console.error('❌ Error storing flow token mapping:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get phone number by flow_token from database
 * Primary method for phone lookup (more reliable than extraction)
 */
async function getPhoneByFlowToken(flowToken) {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const result = await sql`
      SELECT phone_number, whatsapp_name 
      FROM survey_responses 
      WHERE flow_token = ${flowToken}
      AND phone_number IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    if (result.length > 0 && result[0].phone_number) {
      console.log('✅ Found in DB for flow_token:', {
        token: flowToken.substring(0, 20) + '...',
        phone: result[0].phone_number,
        name: result[0].whatsapp_name || '(no name in DB)'
      });
      return result[0].phone_number;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error getting phone by flow_token:', error);
    return null;
  }
}

/**
 * Update phone number by flow_token
 * Called by /api/chatwoot-webhook after Flow submission
 */
async function updatePhoneNumberByFlowToken(flowToken, phoneNumber) {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const result = await sql`
      UPDATE survey_responses 
      SET 
        phone_number = ${phoneNumber},
        updated_at = NOW()
      WHERE flow_token = ${flowToken}
      RETURNING id
    `;
    
    if (result.length > 0) {
      console.log('✅ Phone number updated for flow_token:', flowToken.substring(0, 20) + '...');
      return true;
    } else {
      console.log('⚠️ No record found for flow_token:', flowToken.substring(0, 20) + '...');
      return false;
    }
  } catch (error) {
    console.error('❌ Error updating phone number:', error);
    return false;
  }
}

/**
 * Get data integrity statistics
 * Shows how many responses have phone numbers vs missing
 */
async function getDataIntegrityStats() {
  const sql = neon(process.env.DATABASE_URL);
  
  const stats = await sql`
    SELECT 
      COUNT(*) as total_responses,
      COUNT(phone_number) as with_phone,
      COUNT(*) - COUNT(phone_number) as missing_phone,
      ROUND(
        CASE 
          WHEN COUNT(*) > 0 THEN (COUNT(phone_number)::numeric / COUNT(*) * 100)
          ELSE 0
        END, 
        2
      ) as phone_capture_rate_percent
    FROM survey_responses
  `;
  
  return stats[0];
}

/**
 * Get responses without phone numbers
 * Critical for identifying data integrity issues
 */
async function getResponsesWithoutPhone(limit = 50) {
  const sql = neon(process.env.DATABASE_URL);
  
  const responses = await sql`
    SELECT 
      id, 
      flow_token, 
      created_at,
      q1_rating,
      q2_rating,
      q4_rating,
      q5_rating
    FROM survey_responses 
    WHERE phone_number IS NULL 
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  
  return responses;
}

/**
 * Get recent responses with stats
 * Useful for monitoring broadcasts
 */
async function getRecentResponsesWithStats(hours = 24) {
  const sql = neon(process.env.DATABASE_URL);
  
  const responses = await sql`
    SELECT 
      id,
      phone_number,
      flow_token,
      satisfaction_score,
      is_promoter,
      is_detractor,
      created_at,
      CASE 
        WHEN phone_number IS NULL THEN '🚨 MISSING'
        ELSE '✅ OK'
      END as phone_status
    FROM survey_responses 
    WHERE created_at >= NOW() - INTERVAL '1 hour' * ${hours}
    ORDER BY created_at DESC
  `;
  
  return responses;
}

module.exports = {
  initializeDatabase,
  saveSurveyResponse,
  getAllResponses,
  storeFlowTokenMapping,
  updatePhoneNumberByFlowToken,
  getPhoneByFlowToken,
  getDataIntegrityStats,
  getResponsesWithoutPhone,
  getRecentResponsesWithStats
};

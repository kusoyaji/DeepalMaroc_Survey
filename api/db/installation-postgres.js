const { neon } = require('@neondatabase/serverless');

async function initializeInstallationDB() {
  const sql = neon(process.env.DATABASE_URL);
  
  await sql`
    CREATE TABLE IF NOT EXISTS installation_survey_responses (
      id SERIAL PRIMARY KEY,
      flow_token TEXT NOT NULL,
      phone_number TEXT,
      whatsapp_name TEXT,
      
      -- Installation Survey Fields (mapped from star ratings to numeric)
      q1_nps TEXT,
      q2_satisfaction TEXT,
      q3_delais TEXT,
      q4_professionnalisme TEXT,
      q5_remarques TEXT,
      
      -- Analytics
      nps_score INTEGER,
      satisfaction_avg DECIMAL(3,2),
      is_promoter BOOLEAN DEFAULT FALSE,
      is_passive BOOLEAN DEFAULT FALSE,
      is_detractor BOOLEAN DEFAULT FALSE,
      needs_followup BOOLEAN DEFAULT FALSE,
      
      -- Metadata
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      response_date DATE DEFAULT CURRENT_DATE,
      response_time TIME DEFAULT CURRENT_TIME,
      response_day_of_week TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'Day'),
      response_month TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'Month')
    )
  `;
  
  console.log('✅ Installation survey database initialized');
}

// Map star ratings from WhatsApp Flow to 0-10 numeric scale
function starToNumeric(starRating) {
  const map = {
    '5_etoiles': 10,
    '4_etoiles': 8,
    '3_etoiles': 6,
    '2_etoiles': 4,
    '1_etoile': 2
  };
  return map[starRating] || null;
}

async function saveInstallationResponse(flowToken, data, whatsappName = null) {
  const sql = neon(process.env.DATABASE_URL);
  
  const phone_number = data.phone_number || null;
  
  if (!phone_number) {
    console.warn('⚠️ Installation DB: Saving response WITHOUT phone number! Token:', flowToken);
  }
  
  // Map star ratings to numeric scores
  const q1_nps = starToNumeric(data.q1_rating);
  const q2_sat = starToNumeric(data.q2_rating);
  const q4_pro = starToNumeric(data.q4_rating);
  const q5_nps_val = starToNumeric(data.q5_rating);
  
  // Q3: direct oui/non
  const q3_delais = data.q3_followup || null;
  
  // Combine all remarks/comments
  const remarks = [
    data.q1_comment,
    data.q2_comment,
    data.q4_comment,
    data.q5_comment,
    data.final_comments
  ].filter(c => c && c.trim()).join('; ') || null;
  
  // NPS score: from Q5 (recommend Deepal = classic NPS question)
  // If Q5 not answered, fallback to Q1
  const nps_score = q5_nps_val || q1_nps;
  
  // Satisfaction average (0-1 scale): average of all numeric ratings / 10
  const numericScores = [q1_nps, q2_sat, q4_pro].filter(s => s !== null);
  const satisfaction_avg = numericScores.length > 0
    ? numericScores.reduce((a, b) => a + b, 0) / numericScores.length / 10
    : null;
  
  // NPS classification (on 0-10 scale): 9-10 = promoter, 7-8 = passive, 0-6 = detractor
  const is_promoter = nps_score !== null && nps_score >= 9;
  const is_passive = nps_score !== null && nps_score >= 7 && nps_score < 9;
  const is_detractor = nps_score !== null && nps_score < 7;
  
  // Needs followup if detractor, low scores, or specific comments
  const needs_followup = !!(
    is_detractor ||
    (q1_nps !== null && q1_nps <= 4) ||
    (q2_sat !== null && q2_sat <= 4) ||
    (q4_pro !== null && q4_pro <= 4) ||
    q3_delais === 'non' ||
    data.q1_comment ||
    data.q2_comment ||
    data.q4_comment ||
    data.q5_comment
  );
  
  // Try to UPDATE existing placeholder row first (created by Chatwoot webhook or flow queue)
  const timeWindowSeconds = 600; // 10 minutes
  
  let updateResult = [];
  if (phone_number) {
    updateResult = await sql`
      UPDATE installation_survey_responses
      SET 
        q1_nps = ${q1_nps !== null ? String(q1_nps) : null},
        q2_satisfaction = ${q2_sat !== null ? String(q2_sat) : null},
        q3_delais = ${q3_delais},
        q4_professionnalisme = ${q4_pro !== null ? String(q4_pro) : null},
        q5_remarques = ${remarks},
        nps_score = ${nps_score},
        satisfaction_avg = ${satisfaction_avg},
        is_promoter = ${is_promoter},
        is_passive = ${is_passive},
        is_detractor = ${is_detractor},
        needs_followup = ${needs_followup},
        phone_number = COALESCE(phone_number, ${phone_number}),
        whatsapp_name = COALESCE(whatsapp_name, ${whatsappName}),
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM installation_survey_responses
        WHERE flow_token = ${flowToken}
          AND q1_nps IS NULL
          AND q2_satisfaction IS NULL
          AND phone_number = ${phone_number}
          AND created_at >= NOW() - (${timeWindowSeconds}::text || ' seconds')::INTERVAL
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id, phone_number, whatsapp_name
    `;
  }
  
  if (updateResult.length > 0) {
    console.log('✅ Installation: Updated existing row, ID:', updateResult[0].id);
    return updateResult[0];
  }
  
  // INSERT new row
  console.log('📝 Installation: Creating new row');
  const result = await sql`
    INSERT INTO installation_survey_responses (
      flow_token, phone_number, whatsapp_name,
      q1_nps, q2_satisfaction, q3_delais, q4_professionnalisme, q5_remarques,
      nps_score, satisfaction_avg, is_promoter, is_passive, is_detractor, needs_followup
    ) VALUES (
      ${flowToken}, ${phone_number}, ${whatsappName},
      ${q1_nps !== null ? String(q1_nps) : null},
      ${q2_sat !== null ? String(q2_sat) : null},
      ${q3_delais},
      ${q4_pro !== null ? String(q4_pro) : null},
      ${remarks},
      ${nps_score}, ${satisfaction_avg},
      ${is_promoter}, ${is_passive}, ${is_detractor}, ${needs_followup}
    )
    RETURNING id, phone_number, whatsapp_name
  `;
  
  console.log('✅ Installation: Saved with ID:', result[0].id, '| Phone:', result[0].phone_number);
  return result[0];
}

async function getAllInstallationResponses() {
  const sql = neon(process.env.DATABASE_URL);
  const responses = await sql`
    SELECT 
      id, flow_token, phone_number, whatsapp_name,
      q1_nps, q2_satisfaction, q3_delais, q4_professionnalisme, q5_remarques,
      nps_score, satisfaction_avg, is_promoter, is_passive, is_detractor, needs_followup,
      created_at, updated_at, response_date, response_time, response_day_of_week, response_month
    FROM installation_survey_responses
    ORDER BY created_at DESC
  `;
  console.log('📊 Installation: Retrieved', responses.length, 'responses');
  return responses;
}

/**
 * Store a placeholder row with phone number for installation survey
 * Called when incoming form submission is detected in Chatwoot webhook
 */
async function storeInstallationFlowMapping(flowToken, phoneNumber, whatsappName = null) {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    // Check for existing recent placeholder
    const existing = await sql`
      SELECT id FROM installation_survey_responses
      WHERE flow_token = ${flowToken}
        AND phone_number = ${phoneNumber}
        AND q1_nps IS NULL
        AND created_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    if (existing.length > 0) {
      console.log('✅ Installation placeholder already exists, ID:', existing[0].id);
      return { success: true, id: existing[0].id, existing: true };
    }
    
    const result = await sql`
      INSERT INTO installation_survey_responses (flow_token, phone_number, whatsapp_name)
      VALUES (${flowToken}, ${phoneNumber}, ${whatsappName})
      RETURNING id
    `;
    
    console.log('✅ Installation flow mapping stored, ID:', result[0].id, '| Phone:', phoneNumber);
    return { success: true, id: result[0].id };
  } catch (error) {
    console.error('❌ Installation flow mapping error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Backup: Update the most recent installation response that has no phone number
 * Called by Chatwoot webhook when it sees a Form Submission with a known phone
 */
async function updateInstallationPhoneByRecent(phoneNumber, whatsappName = null) {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const result = await sql`
      UPDATE installation_survey_responses
      SET 
        phone_number = ${phoneNumber},
        whatsapp_name = COALESCE(whatsapp_name, ${whatsappName}),
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM installation_survey_responses
        WHERE phone_number IS NULL
          AND created_at >= NOW() - INTERVAL '2 minutes'
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id, phone_number
    `;
    
    if (result.length > 0) {
      console.log('✅ Backup: Patched installation response ID:', result[0].id, 'with phone:', phoneNumber);
      return result[0];
    }
    
    console.log('ℹ️ No recent phoneless installation responses to patch');
    return null;
  } catch (error) {
    console.error('❌ updateInstallationPhoneByRecent error:', error.message);
    return null;
  }
}

module.exports = {
  initializeInstallationDB,
  saveInstallationResponse,
  getAllInstallationResponses,
  storeInstallationFlowMapping,
  updateInstallationPhoneByRecent
};

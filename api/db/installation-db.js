const { neon } = require('@neondatabase/serverless');

const PROJECT_INBOX_ID = 23;

async function initializeInstallationDB() {
  const sql = neon(process.env.DATABASE_URL);
  
  await sql`
    CREATE TABLE IF NOT EXISTS installation_survey_responses (
      id SERIAL PRIMARY KEY,
      flow_token TEXT NOT NULL,
      phone_number TEXT,
      whatsapp_name TEXT,
      inbox_id INTEGER DEFAULT 23,
      
      -- Installation Survey Fields
      q1_nps TEXT,
      q2_satisfaction TEXT,
      q3_delais TEXT,
      q4_professionnalisme TEXT,
      q5_remarques TEXT,
      
      -- Analytics (auto-calculated)
      nps_score INTEGER,
      satisfaction_avg DECIMAL(5,2),
      is_promoter BOOLEAN,
      is_passive BOOLEAN,
      is_detractor BOOLEAN,
      needs_followup BOOLEAN,
      
      -- Metadata
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      response_date DATE DEFAULT CURRENT_DATE,
      response_time TIME DEFAULT CURRENT_TIME,
      response_day_of_week TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'Day'),
      response_month TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'Month')
    )
  `;
  
  // Ensure flow_token_mappings table exists (shared with original survey)
  await sql`
    CREATE TABLE IF NOT EXISTS flow_token_mappings (
      id SERIAL PRIMARY KEY,
      flow_token TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      whatsapp_name TEXT,
      inbox_id INTEGER DEFAULT 23,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_flow_token_mappings_token_time 
    ON flow_token_mappings(flow_token, created_at DESC, inbox_id)
  `;
  
  console.log('✅ Installation survey database initialized');
}

async function saveInstallationResponse(flowToken, data, whatsappName = null) {
  const sql = neon(process.env.DATABASE_URL);
  
  let phone_number = data.phone_number || null;
  
  if (!phone_number && flowToken) {
    if (flowToken.startsWith('deepal-')) {
      const parts = flowToken.split('-');
      if (parts.length >= 3 && parts[1]) {
        phone_number = parts[1].startsWith('+') ? parts[1] : '+' + parts[1];
      }
    } else {
      const phoneMatch = flowToken.match(/(\+?\d{10,15})/);
      if (phoneMatch) {
        phone_number = phoneMatch[1].startsWith('+') ? phoneMatch[1] : '+' + phoneMatch[1];
      }
    }
  }
  
  // Parse numeric scores
  const npsScore = parseInt(data.q1_nps, 10);
  const satScore = parseInt(data.q2_satisfaction, 10);
  const proScore = parseInt(data.q4_professionnalisme, 10);
  
  // NPS categories (based on Q1: 0-10 scale)
  const is_promoter = npsScore >= 9;
  const is_passive = npsScore >= 7 && npsScore <= 8;
  const is_detractor = npsScore <= 6;
  
  // Average satisfaction (normalize all to 0-1 scale)
  const scores = [];
  if (!isNaN(npsScore)) scores.push(npsScore / 10);
  if (!isNaN(satScore)) scores.push(satScore / 10);
  if (!isNaN(proScore)) scores.push(proScore / 10);
  const satisfaction_avg = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null;
  
  // Needs followup: detractor OR delays not respected OR has remarks
  const needs_followup = !!(
    is_detractor ||
    data.q3_delais === 'non' ||
    (data.q5_remarques && data.q5_remarques.trim().length > 0) ||
    npsScore <= 5 ||
    satScore <= 5 ||
    proScore <= 5
  );
  
  // Try UPDATE existing row first (created by Chatwoot webhook)
  const isGenericToken = ['unused', 'test', 'demo'].includes((flowToken || '').toLowerCase());
  const timeWindowSeconds = isGenericToken ? 30 : 300;
  
  let updateResult;
  if (phone_number) {
    updateResult = await sql`
      UPDATE installation_survey_responses
      SET 
        q1_nps = ${data.q1_nps || null},
        q2_satisfaction = ${data.q2_satisfaction || null},
        q3_delais = ${data.q3_delais || null},
        q4_professionnalisme = ${data.q4_professionnalisme || null},
        q5_remarques = ${data.q5_remarques || null},
        phone_number = COALESCE(phone_number, ${phone_number}),
        whatsapp_name = COALESCE(whatsapp_name, ${whatsappName}),
        nps_score = ${isNaN(npsScore) ? null : npsScore},
        satisfaction_avg = ${satisfaction_avg},
        is_promoter = ${is_promoter},
        is_passive = ${is_passive},
        is_detractor = ${is_detractor},
        needs_followup = ${needs_followup},
        updated_at = NOW()
      WHERE id = (
        SELECT id 
        FROM installation_survey_responses 
        WHERE flow_token = ${flowToken}
          AND inbox_id = ${PROJECT_INBOX_ID}
          AND q1_nps IS NULL
          AND created_at >= NOW() - (${timeWindowSeconds}::text || ' seconds')::INTERVAL
          AND phone_number = ${phone_number}
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id, phone_number, whatsapp_name
    `;
  } else {
    updateResult = await sql`
      UPDATE installation_survey_responses
      SET 
        q1_nps = ${data.q1_nps || null},
        q2_satisfaction = ${data.q2_satisfaction || null},
        q3_delais = ${data.q3_delais || null},
        q4_professionnalisme = ${data.q4_professionnalisme || null},
        q5_remarques = ${data.q5_remarques || null},
        whatsapp_name = COALESCE(whatsapp_name, ${whatsappName}),
        nps_score = ${isNaN(npsScore) ? null : npsScore},
        satisfaction_avg = ${satisfaction_avg},
        is_promoter = ${is_promoter},
        is_passive = ${is_passive},
        is_detractor = ${is_detractor},
        needs_followup = ${needs_followup},
        updated_at = NOW()
      WHERE id = (
        SELECT id 
        FROM installation_survey_responses 
        WHERE flow_token = ${flowToken}
          AND inbox_id = ${PROJECT_INBOX_ID}
          AND q1_nps IS NULL
          AND created_at >= NOW() - (${timeWindowSeconds}::text || ' seconds')::INTERVAL
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id, phone_number, whatsapp_name
    `;
  }
  
  if (updateResult.length > 0) {
    console.log('✅ Updated existing installation row, ID:', updateResult[0].id);
    return updateResult[0];
  }
  
  // INSERT new row
  console.log('📝 Creating new installation survey row');
  const result = await sql`
    INSERT INTO installation_survey_responses (
      flow_token, phone_number, whatsapp_name, inbox_id,
      q1_nps, q2_satisfaction, q3_delais, q4_professionnalisme, q5_remarques,
      nps_score, satisfaction_avg, is_promoter, is_passive, is_detractor, needs_followup
    ) VALUES (
      ${flowToken}, ${phone_number}, ${whatsappName}, ${PROJECT_INBOX_ID},
      ${data.q1_nps || null}, ${data.q2_satisfaction || null}, ${data.q3_delais || null},
      ${data.q4_professionnalisme || null}, ${data.q5_remarques || null},
      ${isNaN(npsScore) ? null : npsScore}, ${satisfaction_avg},
      ${is_promoter}, ${is_passive}, ${is_detractor}, ${needs_followup}
    )
    RETURNING id
  `;
  
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
    WHERE inbox_id = ${PROJECT_INBOX_ID}
    ORDER BY created_at DESC
  `;
  console.log('📊 Retrieved', responses.length, 'installation survey responses');
  return responses;
}

module.exports = {
  initializeInstallationDB,
  saveInstallationResponse,
  getAllInstallationResponses
};

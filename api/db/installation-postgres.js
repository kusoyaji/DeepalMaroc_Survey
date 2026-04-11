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

// Convert any value to 0-10 numeric (handles star ratings AND direct numeric values)
function toNumeric(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  // Star rating format
  const starMap = {
    '5_etoiles': 10, '4_etoiles': 8, '3_etoiles': 6, '2_etoiles': 4, '1_etoile': 2
  };
  if (starMap[str] !== undefined) return starMap[str];
  // Direct numeric value
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0 && num <= 10) return Math.round(num);
  return null;
}

// Get value from data trying multiple possible field names
function getVal(data, ...keys) {
  for (const k of keys) {
    if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
  }
  return null;
}

async function saveInstallationResponse(flowToken, data, whatsappName = null) {
  const sql = neon(process.env.DATABASE_URL);
  
  const phone_number = data.phone_number || null;
  
  if (!phone_number) {
    console.warn('⚠️ Installation DB: Saving response WITHOUT phone number! Token:', flowToken);
  }
  
  // Log raw data for debugging
  console.log('🔑 Installation data keys:', Object.keys(data).join(', '));
  console.log('📊 Installation raw data:', JSON.stringify(data));
  
  // Flexible field extraction - try multiple possible field names
  // The installation flow may use q1_rating (like main flow) OR q1_nps etc.
  const q1_nps = toNumeric(getVal(data, 'q1_rating', 'q1_nps', 'nps', 'q1', 'recommandation'));
  const q2_sat = toNumeric(getVal(data, 'q2_rating', 'q2_satisfaction', 'satisfaction', 'q2'));
  const q4_pro = toNumeric(getVal(data, 'q4_rating', 'q4_professionnalisme', 'professionnalisme', 'q4'));
  
  // Q3: oui/non - try multiple field names
  const q3_delais = getVal(data, 'q3_followup', 'q3_delais', 'delais', 'q3');
  
  // Remarks: try final_comments first (like main flow), then specific names
  const remarks = getVal(data, 'final_comments', 'q5_comment', 'q5_remarques', 'remarques', 'commentaires')
    || [data.q1_comment, data.q2_comment, data.q4_comment, data.q5_comment].filter(c => c && c.trim()).join('; ')
    || null;
  
  // NPS score: Q1 is the NPS question in installation survey
  const nps_score = q1_nps;
  
  console.log('📊 Mapped: q1_nps=' + q1_nps + ', q2_sat=' + q2_sat + ', q3=' + q3_delais + ', q4=' + q4_pro + ', remarks=' + remarks);
  
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
    remarks
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
  updateInstallationPhoneByRecent,
  updateInstallationResponse,
  deleteInstallationResponses
};

async function updateInstallationResponse(id, fields) {
  const sql = neon(process.env.DATABASE_URL);
  
  const allowedFields = ['whatsapp_name', 'phone_number', 'q1_nps', 'q2_satisfaction', 'q3_delais', 'q4_professionnalisme', 'q5_remarques', 'needs_followup'];
  const setClauses = [];
  const values = [];
  
  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key)) {
      setClauses.push(key);
      values.push(value);
    }
  }
  
  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }
  
  // Build dynamic update using tagged template for each allowed field
  const result = await sql`
    UPDATE installation_survey_responses
    SET
      whatsapp_name = COALESCE(${fields.whatsapp_name !== undefined ? fields.whatsapp_name : null}, whatsapp_name),
      phone_number = COALESCE(${fields.phone_number !== undefined ? fields.phone_number : null}, phone_number),
      q1_nps = COALESCE(${fields.q1_nps !== undefined ? String(fields.q1_nps) : null}, q1_nps),
      q2_satisfaction = COALESCE(${fields.q2_satisfaction !== undefined ? String(fields.q2_satisfaction) : null}, q2_satisfaction),
      q3_delais = COALESCE(${fields.q3_delais !== undefined ? fields.q3_delais : null}, q3_delais),
      q4_professionnalisme = COALESCE(${fields.q4_professionnalisme !== undefined ? String(fields.q4_professionnalisme) : null}, q4_professionnalisme),
      q5_remarques = COALESCE(${fields.q5_remarques !== undefined ? fields.q5_remarques : null}, q5_remarques),
      needs_followup = ${fields.needs_followup !== undefined ? fields.needs_followup : null},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  
  if (result.length === 0) throw new Error('Response not found');
  console.log('✏️ Updated installation response ID:', id);
  return result[0];
}

async function deleteInstallationResponses(ids) {
  const sql = neon(process.env.DATABASE_URL);
  
  const result = await sql`
    DELETE FROM installation_survey_responses
    WHERE id = ANY(${ids}::int[])
    RETURNING id
  `;
  
  console.log('🗑️ Deleted', result.length, 'installation responses:', ids);
  return result.length;
}

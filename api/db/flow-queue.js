const { neon } = require('@neondatabase/serverless');

// Project identifier to isolate data (Deepal Maroc inbox ID)
const PROJECT_INBOX_ID = 23;

/**
 * Initialize the flow queue table
 * Stores pending flows that have been sent but not yet submitted
 */
async function initializeFlowQueue() {
  const sql = neon(process.env.DATABASE_URL);
  
  await sql`
    CREATE TABLE IF NOT EXISTS flow_queue (
      id SERIAL PRIMARY KEY,
      phone_number TEXT NOT NULL,
      whatsapp_name TEXT,
      conversation_id INTEGER,
      message_id INTEGER,
      inbox_id INTEGER DEFAULT 23,
      created_at TIMESTAMP DEFAULT NOW(),
      consumed BOOLEAN DEFAULT FALSE
    )
  `;
  
  // Add inbox_id column for project isolation (migration) - MUST BE FIRST
  await sql`
    ALTER TABLE flow_queue
    ADD COLUMN IF NOT EXISTS inbox_id INTEGER DEFAULT 23
  `;
  
  // Index for fast lookups - AFTER adding column
  await sql`
    CREATE INDEX IF NOT EXISTS idx_flow_queue_phone_consumed 
    ON flow_queue(phone_number, consumed, inbox_id, created_at DESC)
  `;
  
  console.log('✅ Flow queue table initialized');
}

/**
 * Add a pending flow when template is sent
 */
async function addPendingFlow(phoneNumber, whatsappName, conversationId = null, messageId = null) {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const result = await sql`
      INSERT INTO flow_queue (phone_number, whatsapp_name, conversation_id, message_id, inbox_id)
      VALUES (${phoneNumber}, ${whatsappName}, ${conversationId}, ${messageId}, ${PROJECT_INBOX_ID})
      RETURNING id
    `;
    
    console.log('📝 Added pending flow to queue:', {
      id: result[0].id,
      phone: phoneNumber,
      name: whatsappName
    });
    
    return result[0].id;
  } catch (error) {
    console.error('❌ Error adding pending flow:', error);
    return null;
  }
}

/**
 * Get and consume the most recent pending flow for a phone number
 * Returns phone and name, marks the entry as consumed
 */
async function consumePendingFlow(phoneNumber) {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    // Find the most recent unconsumed flow for this phone (within last 10 minutes)
    const result = await sql`
      UPDATE flow_queue
      SET consumed = TRUE
      WHERE id = (
        SELECT id 
        FROM flow_queue 
        WHERE phone_number = ${phoneNumber}
          AND inbox_id = ${PROJECT_INBOX_ID}
          AND consumed = FALSE
          AND created_at >= NOW() - INTERVAL '10 minutes'
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id, phone_number, whatsapp_name, created_at
    `;
    
    if (result.length > 0) {
      console.log('✅ Consumed pending flow from queue:', {
        queue_id: result[0].id,
        phone: result[0].phone_number,
        name: result[0].whatsapp_name,
        age_seconds: Math.round((Date.now() - new Date(result[0].created_at).getTime()) / 1000)
      });
      
      return {
        phone: result[0].phone_number,
        name: result[0].whatsapp_name
      };
    }
    
    console.log('⚠️ No pending flow found in queue for phone:', phoneNumber);
    return null;
  } catch (error) {
    console.error('❌ Error consuming pending flow:', error);
    return null;
  }
}

/**
 * Get the most recent pending flow (for generic tokens)
 * Used when we don't know the phone number yet
 */
async function getRecentPendingFlow(maxAgeSeconds = 60) {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const result = await sql`
      UPDATE flow_queue
      SET consumed = TRUE
      WHERE id = (
        SELECT id 
        FROM flow_queue 
        WHERE consumed = FALSE
          AND inbox_id = ${PROJECT_INBOX_ID}
          AND created_at >= NOW() - INTERVAL '1 second' * ${maxAgeSeconds}
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING id, phone_number, whatsapp_name, created_at
    `;
    
    if (result.length > 0) {
      console.log('✅ Consumed most recent pending flow:', {
        queue_id: result[0].id,
        phone: result[0].phone_number,
        name: result[0].whatsapp_name,
        age_seconds: Math.round((Date.now() - new Date(result[0].created_at).getTime()) / 1000)
      });
      
      return {
        phone: result[0].phone_number,
        name: result[0].whatsapp_name
      };
    }
    
    console.log('⚠️ No recent pending flows in queue');
    return null;
  } catch (error) {
    console.error('❌ Error getting recent pending flow:', error);
    return null;
  }
}

/**
 * Clean up old consumed or expired entries
 */
async function cleanupFlowQueue() {
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const result = await sql`
      DELETE FROM flow_queue
      WHERE created_at < NOW() - INTERVAL '24 hours'
        OR (consumed = TRUE AND created_at < NOW() - INTERVAL '1 hour')
      RETURNING id
    `;
    
    if (result.length > 0) {
      console.log(`🗑️ Cleaned up ${result.length} old flow queue entries`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up flow queue:', error);
  }
}

module.exports = {
  initializeFlowQueue,
  addPendingFlow,
  consumePendingFlow,
  getRecentPendingFlow,
  cleanupFlowQueue
};

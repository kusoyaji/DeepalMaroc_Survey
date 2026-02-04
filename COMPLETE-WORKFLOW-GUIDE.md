# WhatsApp Flow Complete Workflow Guide
## From Zero to Production - No Errors Edition

This guide documents the **exact successful workflow** used to create the Changan SAV WhatsApp Flow system. Follow this step-by-step to replicate the process for any new Flow without errors.

---

## 📋 STEP 0: Required Variables (MODIFY THESE)

Before starting, gather and prepare these variables. You'll need to modify them for each new project, (Done)

```plaintext
# WhatsApp Business Account Details
WHATSAPP_ACCESS_TOKEN=EAAWqkyU5JYYBQjXOfEnzw1tO3APGrZAlkG8AaPFZArGheRPK0FpAqiCcdLRyjsBSkAU9jkERZB51gfXHFo9qH3ZA5X6DYlLhU3yIgbgYCWtDsvGnGOA6PR5QyliJEnbSgaidpEE1c3nVwGCioXzTcDLPFQdqlCf8aUNqmc1gc8KTeUM0XTYUpVRfzXlulwZDZD
PHONE_NUMBER_ID=875940088939317
BUSINESS_PHONE_NUMBER=+212665423255

# Test User (WhatsApp number to receive test flows)
TEST_USER_PHONE=+212610059159

# Project Details
PROJECT_NAME=Deepal Maroc
PROJECT_DESCRIPTION=Deepal Janvier Customer Satisfaction Survey
FLOW_NAME=Deepal Janvier Survey

# Neon Database (create at https://neon.tech)
DATABASE_URL= help me generate it or let me know how, i'm already connected in other project to it

# Vercel Deployment
VERCEL_PROJECT_NAME=to be created after setting up, i have vercel cli installed so try create it ur self please.

# GitHub (optional)
GITHUB_REPO_URL=https://github.com/Kusoyaji/Deepal_Maroc
```

---

## 🚀 STEP 1: Create Project Structure

### 1.1 Create Project Directory

```powershell
# Create main project folder
mkdir YOUR_PROJECT_NAME
cd YOUR_PROJECT_NAME

# Initialize npm project
npm init -y
```

### 1.2 Install Required Packages

**CRITICAL**: Use `@neondatabase/serverless` NOT `@vercel/postgres` (deprecated)

```powershell
npm install @neondatabase/serverless
```

### 1.3 Create File Structure

```
your-project/
├── api/
│   ├── flow.js              # Main webhook endpoint
│   ├── responses.js         # Get all survey responses
│   ├── export.js           # Excel export
│   └── db/
│       └── postgres.js     # Database functions
├── public/
│   └── index.html          # Dashboard UI
├── scripts/
│   ├── generate-keys.js    # RSA key generation
│   ├── upload-public-key.ps1
│   └── send-test-flow.ps1
├── package.json
├── vercel.json
└── your-flow.json          # WhatsApp Flow definition
```

---

## 🔐 STEP 2: Generate Encryption Keys

### 2.1 Create Key Generation Script

Create `generate-keys.js`:

```javascript
const crypto = require('crypto');
const fs = require('fs');

// Generate RSA key pair (2048-bit)
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Save keys
fs.writeFileSync('public-key.pem', publicKey);
fs.writeFileSync('private-key.pem', privateKey);

console.log('RSA keys generated successfully!');
console.log('\nPublic Key (upload to WhatsApp):');
console.log(publicKey);
console.log('\nPrivate Key (add to Vercel env as PRIVATE_KEY):');
console.log(privateKey);
```

### 2.2 Run Key Generation

```powershell
node generate-keys.js
```

**SAVE**: Copy the private key - you'll need it for Vercel environment variables.

---

## 📱 STEP 3: Upload Public Key to WhatsApp

### 3.1 Create Upload Script

Create `upload-public-key.ps1`:

```powershell
# MODIFY THESE VARIABLES
$accessToken = "YOUR_ACCESS_TOKEN"
$phoneNumberId = "YOUR_PHONE_NUMBER_ID"

# Read public key
$publicKey = Get-Content -Path "public-key.pem" -Raw

# Upload to WhatsApp
$uri = "https://graph.facebook.com/v21.0/$phoneNumberId/whatsapp_business_encryption"
$body = @{
    business_public_key = $publicKey
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
} -Body $body

Write-Host "Public key uploaded successfully!"
Write-Host $response
```

### 3.2 Run Upload Script

```powershell
.\upload-public-key.ps1
```

**VERIFY**: You should see success response from WhatsApp API.

---

## 🗄️ STEP 4: Set Up Neon PostgreSQL Database

### 4.1 Create Neon Database

1. Go to https://neon.tech
2. Create new project
3. Copy connection string (format: `postgresql://user:password@host/database?sslmode=require`)
4. **IMPORTANT**: Remove any `psql '...'` wrapper if present

### 4.2 Create Database Functions File

Create `api/db/postgres.js`:

```javascript
const { neon } = require('@neondatabase/serverless');

async function initializeDatabase() {
  const sql = neon(process.env.DATABASE_URL);
  
  await sql`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id SERIAL PRIMARY KEY,
      flow_token TEXT UNIQUE NOT NULL,
      
      -- Survey Fields (customize based on your flow)
      accueil_courtoisie TEXT,
      accueil_courtoisie_raison TEXT,
      delais_respectes TEXT,
      qualite_service TEXT,
      qualite_service_raison TEXT,
      note_recommandation INTEGER,
      remarques TEXT,
      recontact TEXT,
      
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
  
  // Calculate satisfaction score (0-1 scale)
  const satisfactionMap = {
    'tres_satisfaisant': 1.0,
    'satisfaisant': 0.75,
    'peu_satisfaisant': 0.5,
    'pas_du_tout_satisfaisant': 0.25
  };
  
  const scores = [
    satisfactionMap[data.accueil_courtoisie] || 0,
    satisfactionMap[data.qualite_service] || 0
  ].filter(s => s > 0);
  
  const satisfaction_score = scores.length > 0 
    ? scores.reduce((a, b) => a + b, 0) / scores.length 
    : null;
  
  // Calculate NPS metrics
  const note = parseInt(data.note_recommandation) || 0;
  const is_promoter = note >= 9;
  const is_detractor = note <= 6;
  
  // Determine if followup needed
  const needs_followup = 
    data.recontact === 'oui' || 
    is_detractor || 
    data.accueil_courtoisie_raison || 
    data.qualite_service_raison;
  
  // Calculate sentiment
  let sentiment = 'neutral';
  if (satisfaction_score >= 0.75) sentiment = 'positive';
  else if (satisfaction_score < 0.5) sentiment = 'negative';
  
  const result = await sql`
    INSERT INTO survey_responses (
      flow_token,
      accueil_courtoisie,
      accueil_courtoisie_raison,
      delais_respectes,
      qualite_service,
      qualite_service_raison,
      note_recommandation,
      remarques,
      recontact,
      satisfaction_score,
      is_promoter,
      is_detractor,
      needs_followup,
      sentiment
    ) VALUES (
      ${flowToken},
      ${data.accueil_courtoisie || null},
      ${data.accueil_courtoisie_raison || null},
      ${data.delais_respectes || null},
      ${data.qualite_service || null},
      ${data.qualite_service_raison || null},
      ${note},
      ${data.remarques || null},
      ${data.recontact || null},
      ${satisfaction_score},
      ${is_promoter},
      ${is_detractor},
      ${needs_followup},
      ${sentiment}
    )
    ON CONFLICT (flow_token) 
    DO UPDATE SET
      accueil_courtoisie = EXCLUDED.accueil_courtoisie,
      accueil_courtoisie_raison = EXCLUDED.accueil_courtoisie_raison,
      delais_respectes = EXCLUDED.delais_respectes,
      qualite_service = EXCLUDED.qualite_service,
      qualite_service_raison = EXCLUDED.qualite_service_raison,
      note_recommandation = EXCLUDED.note_recommandation,
      remarques = EXCLUDED.remarques,
      recontact = EXCLUDED.recontact,
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
```

---

## 🔌 STEP 5: Create Webhook Endpoint

### ⚠️ CRITICAL: WhatsApp Flow Encryption Requirements

**READ THIS FIRST - Common Health Check Failure Causes:**

WhatsApp Flows require **EXACT** encryption implementation. The health check will fail if ANY of these requirements are not met:

#### 1. **IV Bit Flipping (MANDATORY for Response Encryption)**

When encrypting the response, you MUST flip all bits in the IV using bitwise NOT (`~`) operator:

```javascript
function encryptResponse(response, aesKey, iv) {
  // CRITICAL: Flip IV bits for response encryption
  const flippedIv = Buffer.from(iv).map(b => ~b);
  
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf-8'),
    cipher.final(),
  ]);
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64');
}
```

**Why?** WhatsApp uses this as a security measure to prevent replay attacks.

**Common Error:** Forgetting to flip IV will cause "Response body is not Base64 encoded" error.

#### 2. **Direct Base64 Response (NOT JSON-wrapped)**

Return the encrypted response as a **raw Base64 string**, NOT wrapped in JSON:

```javascript
// ✅ CORRECT
return res.status(200).send(encryptedResponse);

// ❌ WRONG - Will fail health check
return res.json({ encrypted_flow_data: encryptedResponse });
```

**Why?** WhatsApp expects the raw Base64 string in the HTTP body.

**Common Error:** Wrapping in `{encrypted_flow_data: ...}` will cause validation failure.

#### 3. **Preserve AES Key Across Functions**

Decrypt the AES key ONCE in `decryptRequest`, then pass it through to `encryptResponse`:

```javascript
function decryptRequest(encryptedBody, privateKey, passphrase = '') {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = encryptedBody;
  
  // Decrypt AES key using RSA private key
  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      passphrase: passphrase,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  // Return BOTH decrypted data AND the AES key + IV for response encryption
  return {
    decryptedData: JSON.parse(decryptedJSONString),
    aesKey: decryptedAesKey,
    iv: initialVectorBuffer
  };
}
```

**Common Error:** Decrypting `encrypted_aes_key` twice will produce wrong key for response.

#### 4. **Boolean Type Safety in Database**

When calculating boolean fields, ensure they are actual booleans, not strings:

```javascript
// ✅ CORRECT - Double negation ensures boolean
const needs_followup = !!(
  data.q1_comment || 
  data.q2_comment || 
  is_detractor
);

// ❌ WRONG - Can result in string value
const needs_followup = 
  data.q1_comment || 
  data.q2_comment || 
  is_detractor;
```

**Common Error:** PostgreSQL will throw `invalid input syntax for type boolean` if string is passed.

---

### 5.1 Complete Webhook Implementation

Create `api/flow.js`:

```javascript
const crypto = require('crypto');
const { initializeDatabase, saveSurveyResponse } = require('./db/postgres');

let dbInitialized = false;

function decryptRequest(encryptedBody, privateKey, passphrase = '') {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = encryptedBody;
  
  // Decrypt AES key using RSA private key
  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      passphrase: passphrase,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  // Decrypt flow data using AES-GCM
  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');
  const TAG_LENGTH = 16;
  
  const encryptedFlowDataBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const encryptedFlowDataTag = flowDataBuffer.subarray(-TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(
    'aes-128-gcm',
    decryptedAesKey,
    initialVectorBuffer
  );
  decipher.setAuthTag(encryptedFlowDataTag);

  const decryptedJSONString = Buffer.concat([
    decipher.update(encryptedFlowDataBody),
    decipher.final(),
  ]).toString('utf-8');

  const decryptedData = JSON.parse(decryptedJSONString);
  
  // CRITICAL: Return tuple with aesKey and iv for response encryption
  return { decryptedData, aesKey: decryptedAesKey, iv: initialVectorBuffer };
}

function encryptResponse(response, aesKey, iv) {
  // CRITICAL: Flip IV bits using bitwise NOT operator
  const flippedIv = Buffer.from(iv).map(b => ~b);
  
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf-8'),
    cipher.final(),
  ]);
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64');
}

module.exports = async (req, res) => {
  console.log('========================================');
  console.log('Incoming request:', req.method);
  
  // Initialize database on first request
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }

  if (req.method === 'GET') {
    return res.status(200).send('Webhook is running');
  }

  if (req.method === 'POST') {
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      console.error('PRIVATE_KEY not found in environment');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
      const { decryptedData, aesKey, iv } = decryptRequest(req.body, privateKey, '');
      console.log('Decrypted request:', JSON.stringify(decryptedData, null, 2));

      const { action, flow_token, data, version } = decryptedData;

      if (action === 'ping') {
        console.log('Ping received');
        const response = { version, data: { status: 'active' } };
        const encryptedResponse = encryptResponse(response, aesKey, iv);
        
        // CRITICAL: Return raw Base64 string, NOT JSON-wrapped
        console.log('Encrypted response length:', encryptedResponse.length);
        return res.status(200).send(encryptedResponse);
      }

      if (action === 'data_exchange') {
        console.log('Data exchange - Survey data received');
        
        // Save to database
        try {
          const savedResponse = await saveSurveyResponse(flow_token, data);
          console.log('Database ID:', savedResponse.id);
        } catch (dbError) {
          console.error('Database save error:', dbError);
          // Continue to send response even if DB save fails
        }

        const response = {
          version,
          screen: 'SUCCESS_SCREEN',
          data: {
            confirmation_message: 'Merci pour votre retour ! Votre avis compte beaucoup pour nous.'
          }
        };

        const encryptedResponse = encryptResponse(response, aesKey, iv);
        
        // CRITICAL: Return raw Base64 string, NOT JSON-wrapped
        console.log('Data exchange encrypted response length:', encryptedResponse.length);
        return res.status(200).send(encryptedResponse);
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (error) {
      console.error('Error processing request:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
```

---

## 📊 STEP 6: Create Additional API Endpoints

### 6.1 Create Responses Endpoint

Create `api/responses.js`:

```javascript
const { getAllResponses } = require('./db/postgres');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  if (req.method === 'GET') {
    try {
      const responses = await getAllResponses();
      return res.status(200).json(responses);
    } catch (error) {
      console.error('Error fetching responses:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};
```

### 6.2 Create Export Endpoint

Create `api/export.js`:

```javascript
const { getAllResponses } = require('./db/postgres');

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  
  const translations = {
    'tres_satisfaisant': 'Tres Satisfaisant',
    'satisfaisant': 'Satisfaisant',
    'peu_satisfaisant': 'Peu Satisfaisant',
    'pas_du_tout_satisfaisant': 'Pas du tout Satisfaisant',
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
    'ID', 'Date', 'Heure', 'Flow Token',
    'Accueil Courtoisie', 'Raison Accueil', 'Delais Respectes',
    'Qualite Service', 'Raison Qualite', 'Note Recommandation',
    'Remarques', 'Recontact',
    'Score Satisfaction (%)', 'Promoteur', 'Detracteur', 'Suivi Requis', 'Sentiment',
    'Jour Semaine', 'Mois', 'Date Creation', 'Date MAJ', 'Heure MAJ'
  ];

  const rows = data.map(row => [
    row.id,
    row.response_date || new Date(row.created_at).toLocaleDateString('fr-FR'),
    row.response_time || new Date(row.created_at).toLocaleTimeString('fr-FR'),
    row.flow_token,
    formatValue(row.accueil_courtoisie),
    row.accueil_courtoisie_raison || '',
    formatValue(row.delais_respectes),
    formatValue(row.qualite_service),
    row.qualite_service_raison || '',
    row.note_recommandation || '',
    row.remarques || '',
    formatValue(row.recontact),
    row.satisfaction_score ? Math.round(row.satisfaction_score * 100) : '',
    formatValue(row.is_promoter),
    formatValue(row.is_detractor),
    formatValue(row.needs_followup),
    formatValue(row.sentiment),
    (row.response_day_of_week || '').trim(),
    (row.response_month || '').trim(),
    new Date(row.created_at).toLocaleString('fr-FR'),
    new Date(row.updated_at).toLocaleString('fr-FR'),
    new Date(row.updated_at).toLocaleTimeString('fr-FR')
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
      const filename = `survey-export-${new Date().toISOString().split('T')[0]}.csv`;
      
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
```

---

## 🎨 STEP 7: Create Dashboard UI

Create `public/index.html`:

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Survey Analytics</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
        }
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .stat-card h3 {
            color: #666;
            font-size: 0.9rem;
            text-transform: uppercase;
            margin-bottom: 10px;
        }
        .stat-card .value {
            font-size: 2.5rem;
            font-weight: bold;
            color: #333;
        }
        .data-section {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .export-btn {
            background: #10b981;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            margin-bottom: 20px;
        }
        .export-btn:hover {
            background: #059669;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        th {
            background: #f9fafb;
            font-weight: 600;
            color: #374151;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Survey Analytics Dashboard</h1>
            <p>Real-time customer satisfaction insights</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Responses</h3>
                <div class="value" id="totalResponses">-</div>
            </div>
            <div class="stat-card">
                <h3>Today</h3>
                <div class="value" id="todayResponses">-</div>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <h3 style="color: rgba(255,255,255,0.9);">NPS Score</h3>
                <div class="value" style="color: white;" id="npsScore">-</div>
            </div>
            <div class="stat-card">
                <h3>Avg Satisfaction</h3>
                <div class="value" id="avgSatisfaction">-</div>
            </div>
            <div class="stat-card" style="background: #fef3c7;">
                <h3>Needs Followup</h3>
                <div class="value" id="needsFollowup">-</div>
            </div>
            <div class="stat-card">
                <h3>Last Response</h3>
                <div class="value" style="font-size: 1.2rem;" id="lastResponse">-</div>
            </div>
        </div>

        <div class="data-section">
            <button class="export-btn" onclick="exportToExcel()">Export to Excel</button>
            <div id="dataContainer" class="loading">Loading data...</div>
        </div>
    </div>

    <script>
        async function loadData() {
            try {
                const response = await fetch('/api/responses');
                const data = await response.json();
                
                updateStats(data);
                displayTable(data);
            } catch (error) {
                document.getElementById('dataContainer').innerHTML = 
                    '<p style="color: red;">Error loading data: ' + error.message + '</p>';
            }
        }

        function updateStats(data) {
            const total = data.length;
            const today = data.filter(r => {
                const responseDate = new Date(r.created_at).toDateString();
                return responseDate === new Date().toDateString();
            }).length;
            
            const promoters = data.filter(r => r.is_promoter).length;
            const detractors = data.filter(r => r.is_detractor).length;
            const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
            
            const avgSat = data.reduce((sum, r) => sum + (r.satisfaction_score || 0), 0) / (total || 1);
            const followupCount = data.filter(r => r.needs_followup).length;
            
            const lastResp = data[0] ? new Date(data[0].created_at).toLocaleString('fr-FR') : 'None';
            
            document.getElementById('totalResponses').textContent = total;
            document.getElementById('todayResponses').textContent = today;
            document.getElementById('npsScore').textContent = nps;
            document.getElementById('avgSatisfaction').textContent = Math.round(avgSat * 100) + '%';
            document.getElementById('needsFollowup').textContent = followupCount;
            document.getElementById('lastResponse').textContent = lastResp;
        }

        function displayTable(data) {
            const container = document.getElementById('dataContainer');
            
            if (data.length === 0) {
                container.innerHTML = '<p>No responses yet.</p>';
                return;
            }
            
            const table = `
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Note</th>
                            <th>Satisfaction</th>
                            <th>Accueil</th>
                            <th>Service</th>
                            <th>Recontact</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(r => `
                            <tr>
                                <td>${new Date(r.created_at).toLocaleString('fr-FR')}</td>
                                <td>${r.note_recommandation || '-'}</td>
                                <td>${Math.round((r.satisfaction_score || 0) * 100)}%</td>
                                <td>${r.accueil_courtoisie || '-'}</td>
                                <td>${r.qualite_service || '-'}</td>
                                <td>${r.recontact || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            container.innerHTML = table;
        }

        function exportToExcel() {
            window.location.href = '/api/export';
        }

        loadData();
        setInterval(loadData, 10000); // Refresh every 10 seconds
    </script>
</body>
</html>
```

---

## ⚙️ STEP 8: Configure Vercel

### 8.1 Create vercel.json

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/**/*.js",
      "use": "@vercel/node"
    },
    {
      "src": "public/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/public/$1"
    }
  ]
}
```

### 8.2 Update package.json

```json
{
  "name": "your-project-name",
  "version": "1.0.0",
  "description": "WhatsApp Flow Survey System",
  "main": "api/flow.js",
  "scripts": {
    "dev": "vercel dev",
    "deploy": "vercel --prod"
  },
  "dependencies": {
    "@neondatabase/serverless": "^1.0.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## 🚢 STEP 9: Deploy to Vercel

### 9.1 Install Vercel CLI

```powershell
npm install -g vercel
```

### 9.2 Login to Vercel

```powershell
vercel login
```

### 9.3 Deploy Project

```powershell
# First deployment (creates project)
vercel

# Production deployment
vercel --prod
```

### 9.4 Add Environment Variables

**CRITICAL**: Add these environment variables to Vercel (all 3 environments: production, preview, development)

```powershell
# Add private key (from generate-keys.js output)
$env:PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----
YOUR_PRIVATE_KEY_HERE
-----END PRIVATE KEY-----"

echo $env:PRIVATE_KEY | vercel env add PRIVATE_KEY production
echo $env:PRIVATE_KEY | vercel env add PRIVATE_KEY preview
echo $env:PRIVATE_KEY | vercel env add PRIVATE_KEY development

# Add database URL (from Neon dashboard)
$env:DATABASE_URL = "postgresql://user:pass@host/db?sslmode=require"

echo $env:DATABASE_URL | vercel env add DATABASE_URL production
echo $env:DATABASE_URL | vercel env add DATABASE_URL preview
echo $env:DATABASE_URL | vercel env add DATABASE_URL development
```

### 9.5 Redeploy After Adding Variables

```powershell
vercel --prod
```

**YOUR ENDPOINT URL**: `https://your-project.vercel.app/api/flow`

---

## 📝 STEP 10: Create WhatsApp Flow JSON

### 10.1 Create Flow Definition

Create your flow JSON file (see `whatsapp-sav-flow.json` as reference). Key points:

- **version**: "7.3"
- **data_api_version**: "3.0"
- Include `routing_model` for all screen transitions
- Use `data_exchange` action for final submission
- Match `data` field names with database columns

### 10.2 Create Flow via API

Create `create-flow.ps1`:

```powershell
# MODIFY THESE VARIABLES
$accessToken = "YOUR_ACCESS_TOKEN"
$phoneNumberId = "YOUR_PHONE_NUMBER_ID"

$uri = "https://graph.facebook.com/v21.0/$phoneNumberId/flows"
$body = @{
    name = "Your Flow Name"
    categories = @("SURVEY")
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
} -Body $body

Write-Host "Flow created! ID: $($response.id)"
```

Run: `.\create-flow.ps1`

**SAVE THE FLOW ID** returned in the response.

### 10.3 Upload Flow JSON

Create `upload-flow-json.ps1`:

```powershell
# MODIFY THESE VARIABLES
$accessToken = "YOUR_ACCESS_TOKEN"
$flowId = "YOUR_FLOW_ID"
$jsonFilePath = "your-flow.json"

$flowJson = Get-Content -Path $jsonFilePath -Raw

$uri = "https://graph.facebook.com/v21.0/$flowId/assets"
$body = @{
    name = "flow.json"
    asset_type = "FLOW_JSON"
    flow_json = $flowJson
} | ConvertTo-Json -Depth 50

$response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
} -Body $body

Write-Host "Flow JSON uploaded successfully!"
Write-Host $response
```

Run: `.\upload-flow-json.ps1`

### 10.4 Configure Flow Endpoint

Create `configure-flow-endpoint.ps1`:

```powershell
# MODIFY THESE VARIABLES
$accessToken = "YOUR_ACCESS_TOKEN"
$flowId = "YOUR_FLOW_ID"
$endpointUrl = "https://your-project.vercel.app/api/flow"

$uri = "https://graph.facebook.com/v21.0/$flowId"
$body = @{
    endpoint_uri = $endpointUrl
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
} -Body $body

Write-Host "Endpoint configured successfully!"
Write-Host $response
```

Run: `.\configure-flow-endpoint.ps1`

### 10.5 Publish Flow

Create `publish-flow.ps1`:

```powershell
# MODIFY THESE VARIABLES
$accessToken = "YOUR_ACCESS_TOKEN"
$flowId = "YOUR_FLOW_ID"

$uri = "https://graph.facebook.com/v21.0/$flowId/publish"

$response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
    "Authorization" = "Bearer $accessToken"
}

Write-Host "Flow published successfully!"
Write-Host $response
```

Run: `.\publish-flow.ps1`

---

## 🧪 STEP 11: Test the Flow

### 11.1 Create Test Script

Create `send-test-flow.ps1`:

```powershell
# MODIFY THESE VARIABLES
$accessToken = "YOUR_ACCESS_TOKEN"
$phoneNumberId = "YOUR_PHONE_NUMBER_ID"
$recipientPhone = "YOUR_TEST_PHONE"
$flowId = "YOUR_FLOW_ID"

$uri = "https://graph.facebook.com/v21.0/$phoneNumberId/messages"
$body = @{
    messaging_product = "whatsapp"
    to = $recipientPhone
    type = "interactive"
    interactive = @{
        type = "flow"
        header = @{
            type = "text"
            text = "Satisfaction Survey"
        }
        body = @{
            text = "We would love your feedback!"
        }
        footer = @{
            text = "Takes 2 minutes"
        }
        action = @{
            name = "flow"
            parameters = @{
                flow_message_version = "3"
                flow_token = "test-" + [guid]::NewGuid().ToString()
                flow_id = $flowId
                flow_cta = "Start Survey"
                flow_action = "navigate"
                flow_action_payload = @{
                    screen = "QUESTION_ONE"
                }
            }
        }
    }
} | ConvertTo-Json -Depth 10

$response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
} -Body $body

Write-Host "Test message sent!"
Write-Host "Message ID: $($response.messages[0].id)"
```

Run: `.\send-test-flow.ps1`

### 11.2 Check Vercel Logs

```powershell
vercel logs --follow
```

Watch for:
- ✅ Ping received
- ✅ Data exchange
- ✅ Database ID: [number]

### 11.3 Verify Dashboard

Open: `https://your-project.vercel.app`

Check:
- ✅ Stats update
- ✅ Response appears in table
- ✅ Excel export works

---

## 📤 STEP 12: Push to GitHub (Optional)

### 12.1 Create .gitignore

```
node_modules/
.env
.vercel/
*.log
private-key.pem
public-key.pem
.DS_Store
```

### 12.2 Initialize Git

```powershell
git init
git add .
git commit -m "feat: initial WhatsApp Flow system setup"
```

### 12.3 Push to GitHub

```powershell
# Create repo on GitHub first, then:
git remote add origin YOUR_GITHUB_REPO_URL
git branch -M main
git push -u origin main
```

---

## ✅ Verification Checklist

Before considering the setup complete, verify:

- [ ] Public key uploaded to WhatsApp
- [ ] Flow created and published
- [ ] Endpoint configured and responding to health checks
- [ ] Environment variables added (PRIVATE_KEY, DATABASE_URL)
- [ ] Database table auto-created on first submission
- [ ] Test survey completes successfully
- [ ] Data appears in dashboard
- [ ] Excel export downloads with correct data
- [ ] NPS and analytics calculate correctly
- [ ] No errors in Vercel logs

---

## 🎯 Quick Start for New Projects

1. **Copy this guide** to new VS Code workspace
2. **Modify STEP 0 variables** (access token, phone ID, database URL, etc.)
3. **Tell AI Agent**: "Follow COMPLETE-WORKFLOW-GUIDE.md step by step, using the variables I provided"
4. **Let AI execute** all steps automatically
5. **Verify** using the checklist above

---

## 🔧 Troubleshooting

### Database Connection Issues
- ✅ Use Neon PostgreSQL (not Vercel Postgres - deprecated)
- ✅ Remove `psql '...'` wrapper from connection string
- ✅ Keep `?sslmode=require` parameter
- ✅ Add DATABASE_URL to all 3 Vercel environments

### PowerShell Script Errors
- ✅ Remove Unicode emojis from scripts
- ✅ Use `echo $env:VAR | vercel env add` syntax
- ✅ Add to each environment separately (production, preview, development)

### Flow Not Receiving Data
- ✅ Verify endpoint URL is correct (ends with `/api/flow`)
- ✅ Check PRIVATE_KEY matches uploaded public key
- ✅ Ensure Flow is PUBLISHED (not draft)
- ✅ Verify `data_exchange` action payload matches database columns

### Table Not Created
- ✅ Expected - table auto-creates on FIRST survey submission
- ✅ Complete one test survey to trigger table creation
- ✅ Check logs after first submission (should see "Database ID: X")

---

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `api/flow.js` | Main webhook endpoint (handles encryption + saves data) |
| `api/db/postgres.js` | Database functions (init, save, get) |
| `api/responses.js` | API to fetch all responses |
| `api/export.js` | Excel export with analytics |
| `public/index.html` | Dashboard UI |
| `vercel.json` | Vercel configuration |
| `your-flow.json` | WhatsApp Flow definition |
| `generate-keys.js` | RSA key generation |
| `upload-public-key.ps1` | Upload public key to WhatsApp |
| `send-test-flow.ps1` | Send test Flow message |

---

## 🎓 What We Learned (Errors to Avoid)

1. ❌ **DON'T** use `@vercel/postgres` (deprecated) → ✅ Use `@neondatabase/serverless`
2. ❌ **DON'T** include `psql '...'` in DATABASE_URL → ✅ Extract just the connection string
3. ❌ **DON'T** use Unicode emojis in PowerShell scripts → ✅ Use plain ASCII only
4. ❌ **DON'T** batch environment variable additions → ✅ Add to each environment separately
5. ❌ **DON'T** expect table to exist before first submission → ✅ Auto-creates on first use
6. ❌ **DON'T** use `result.rows` with Neon client → ✅ Results are returned directly as array
7. ❌ **DON'T** forget to redeploy after adding env vars → ✅ Always `vercel --prod` after changes

---

## 🚀 Success Indicators

When everything is working correctly, you should see:

1. **Vercel Logs**: `POST 200 /api/flow` with "Database ID: X"
2. **Dashboard**: Real-time stats updating
3. **Excel Export**: Downloads with all 22 columns
4. **No Errors**: GET requests returning 200/304 with data
5. **WhatsApp**: Survey completes with success message

---

**Version**: 1.0  
**Last Updated**: February 3, 2026  
**Status**: Production-Ready ✅

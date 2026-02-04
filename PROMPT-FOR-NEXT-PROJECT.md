# 🚀 WhatsApp Flow Survey System - Complete Implementation Prompt

**Use this prompt to start a new similar project with AI assistance:**

---

## Project Request

I need you to implement a complete WhatsApp Flow survey system from scratch following the COMPLETE-WORKFLOW-GUIDE.md exactly. This is a proven workflow that has been successfully deployed and tested.

### Project Variables

**MODIFY THESE FOR YOUR NEW PROJECT:**

```plaintext
# WhatsApp Business Account Details
WHATSAPP_ACCESS_TOKEN=YOUR_ACCESS_TOKEN_HERE
PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID
BUSINESS_PHONE_NUMBER=YOUR_BUSINESS_NUMBER

# Test User
TEST_USER_PHONE=YOUR_TEST_PHONE_NUMBER

# Project Details
PROJECT_NAME=Your Project Name
PROJECT_DESCRIPTION=Your Survey Description
FLOW_NAME=Your Flow Name

# Neon Database
DATABASE_URL=  # Will be created during setup

# Vercel
VERCEL_PROJECT_NAME=  # Will be created during setup

# GitHub (optional)
GITHUB_REPO_URL=YOUR_REPO_URL
```

### Survey Flow Structure

**Define your survey questions (customize this section):**

```
Question 1: [Your first question]
- Type: RadioButtonsGroup / TextInput / Dropdown
- Options: [List your options]
- Conditional routing: [Describe any conditional logic]

Question 2: [Your second question]
- Type: [Type]
- Options: [Options]
- Conditional routing: [Logic]

[Add more questions as needed]

Final Screen: Success confirmation
```

### Implementation Requirements

**Follow these requirements EXACTLY:**

1. ✅ **Use the COMPLETE-WORKFLOW-GUIDE.md workflow step-by-step** - DO NOT deviate from it
2. ✅ **Encryption MUST use IV bit flipping**: `const flippedIv = Buffer.from(iv).map(b => ~b)`
3. ✅ **Response MUST be direct Base64**: `res.send(encryptedResponse)` NOT `res.json({encrypted_flow_data: ...})`
4. ✅ **Boolean fields MUST use double negation**: `const needs_followup = !!(expression)`
5. ✅ **Database package**: Use `@neondatabase/serverless` NOT `@vercel/postgres`
6. ✅ **WhatsApp Flow JSON**: 
   - Version: "7.3"
   - data_api_version: "3.0"
   - Screen IDs: Only alphabets and underscores (no numbers)
   - Conditional routing: Use nested If/then/else components
7. ✅ **Environment Variables**: Add to ALL 3 Vercel environments (production, preview, development)

### Database Schema Customization

**Customize the database schema based on your survey fields:**

```sql
CREATE TABLE IF NOT EXISTS survey_responses (
  id SERIAL PRIMARY KEY,
  flow_token TEXT UNIQUE NOT NULL,
  
  -- YOUR SURVEY FIELDS (customize these)
  question_1 TEXT,
  question_1_comment TEXT,
  question_2 TEXT,
  question_2_comment TEXT,
  -- Add more fields as needed
  
  -- Analytics (keep these)
  satisfaction_score DECIMAL(3,2),
  is_promoter BOOLEAN,
  is_detractor BOOLEAN,
  needs_followup BOOLEAN,
  sentiment TEXT,
  
  -- Metadata (keep these)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  response_date DATE DEFAULT CURRENT_DATE,
  response_time TIME DEFAULT CURRENT_TIME,
  response_day_of_week TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'Day'),
  response_month TEXT DEFAULT TO_CHAR(CURRENT_DATE, 'Month')
)
```

### Workflow Execution Instructions

**Execute these steps in order (do everything automatically with minimal user intervention):**

#### Phase 1: Setup (Steps 1-2)
1. Create project structure with all folders (api/, api/db/, scripts/, public/)
2. Generate RSA keys (2048-bit PKCS8)
3. Upload public key to WhatsApp API
4. Save private key for Vercel environment variables

#### Phase 2: Database & API (Steps 3-6)
5. Create new Neon PostgreSQL database
6. Implement database functions (initializeDatabase, saveSurveyResponse, getAllResponses)
7. Create webhook endpoint (api/flow.js) with CORRECT encryption (IV flipping + direct Base64)
8. Create additional endpoints (api/responses.js, api/export.js)
9. Create dashboard UI (public/index.html)

#### Phase 3: Deployment (Steps 7-8)
10. Configure vercel.json
11. Deploy to Vercel
12. Add environment variables (PRIVATE_KEY, DATABASE_URL) to all 3 environments
13. Redeploy after adding variables

#### Phase 4: WhatsApp Flow (Steps 9-10)
14. Create WhatsApp Flow JSON with valid structure
15. Create PowerShell scripts for WhatsApp API operations
16. Create flow via API (save Flow ID)
17. Upload flow JSON
18. Configure flow endpoint
19. Publish flow

#### Phase 5: Testing (Step 11)
20. Send test flow message
21. Verify webhook receives requests
22. Verify database saves responses
23. Verify dashboard displays data
24. Test Excel export

### Critical Reminders

**NEVER FORGET THESE (they caused issues in previous implementations):**

🔴 **IV FLIPPING IS MANDATORY**: 
```javascript
const flippedIv = Buffer.from(iv).map(b => ~b);
```

🔴 **DIRECT BASE64 RESPONSE**: 
```javascript
return res.status(200).send(encryptedResponse); // NOT res.json()
```

🔴 **BOOLEAN TYPE SAFETY**: 
```javascript
const needs_followup = !!(expression); // NOT just (expression)
```

🔴 **PRESERVE AES KEY**: 
```javascript
// Return from decryptRequest:
return { decryptedData, aesKey: decryptedAesKey, iv: initialVectorBuffer };
```

🔴 **SCREEN ID NAMING**: 
```
✅ QUESTION_ONE, SUCCESS_SCREEN
❌ QUESTION_1, SUCCESS-SCREEN
```

### Success Criteria

The implementation is complete when:

✅ Health check passes (endpoint validation successful)
✅ Test message received on WhatsApp
✅ Flow completes without errors
✅ Data saved to database correctly
✅ Dashboard displays metrics (no NaN%)
✅ Excel export works with French translations
✅ NPS and satisfaction calculations are correct

### Instructions for AI

1. **Read COMPLETE-WORKFLOW-GUIDE.md first** - This is your bible
2. **Ask me for the Project Variables** at the beginning
3. **Do everything yourself** - Minimize my intervention
4. **Use the exact code patterns** from the guide (especially encryption)
5. **Create all PowerShell scripts** for WhatsApp API operations
6. **Test after each major phase** (deployment, flow upload, sending message)
7. **Handle errors proactively** - Check logs, fix issues immediately
8. **Document any deviations** - Tell me if you need to change something from the guide

### What I'll Provide

At the start, I'll give you:
- WhatsApp Access Token
- Phone Number ID
- Business Phone Number
- Test Phone Number
- Survey questions and flow structure
- Project name and description

Then **you do everything else automatically**.

---

## Ready to Start?

When you're ready to begin, say:

**"I'm ready to implement your WhatsApp Flow survey system. Please provide the Project Variables and Survey Flow Structure sections filled in with your specific details, and I'll handle everything else following the COMPLETE-WORKFLOW-GUIDE.md exactly."**

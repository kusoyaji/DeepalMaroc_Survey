# 🔧 SETUP GUIDE: Deepal Maroc Survey - Phone Number Capture via Chatwoot

## ✅ **SOLUTION OVERVIEW**

Instead of relying on Meta's WhatsApp API to provide phone numbers (which it doesn't in Flow responses), we use **Chatwoot** as the intermediary:

1. **WhatsApp → Your Webhook** (`/api/webhook`) → Captures phone when user starts Flow
2. **User fills Flow** → Data goes to `/api/flow` endpoint (encrypted)
3. **Chatwoot receives Flow** → Formats it and sends to `/api/chatwoot-webhook`
4. **Your system links phone ↔ data** using `flow_token`

---

## 📋 **STEP-BY-STEP IMPLEMENTATION**

### **STEP 1: Add Environment Variables**

Add to your `.env` file (or Vercel environment variables):

```env
# Chatwoot Integration
CHATWOOT_ACCESS_TOKEN=j4qE9vZUww2LgHHNxDVJdpPp
CHATWOOT_WEBHOOK_URL=https://chat.voomdigital.net/webhooks/whatsapp/[YOUR_ENDPOINT]

# WhatsApp Webhook Verification Token
WEBHOOK_VERIFY_TOKEN=deepal_maroc_verify_2026_secure
```

---

### **STEP 2: Configure WhatsApp Business API Webhook**

Go to **Meta Business Manager → WhatsApp → Configuration → Webhooks**:

1. **Callback URL**: `https://your-vercel-app.vercel.app/api/webhook`
2. **Verify Token**: `deepal_maroc_verify_2026_secure`
3. **Subscribed Fields**: 
   - ✅ `messages`
   - ✅ `message_template_status_update`

Click **Verify and Save**.

---

### **STEP 3: Configure Chatwoot Webhook**

Go to **Chatwoot → Settings → Integrations → Webhooks**:
https://chat.voomdigital.net/app/accounts/14/settings/integrations/webhook

1. **Webhook URL**: `https://your-vercel-app.vercel.app/api/chatwoot-webhook`
2. **Events to Subscribe**:
   - ✅ `message_created`
3. Save the webhook

---

### **STEP 4: Update Flow JSON for Better Chatwoot Display**

Your Flow needs to send formatted data that Chatwoot can display properly. The final `data_exchange` should include ALL fields:

**Current QUESTION_SIX `data_exchange` payload is CORRECT** ✅

The issue is that Chatwoot needs to format the Flow response. We need to configure this in **Chatwoot's WhatsApp Channel Settings**.

---

### **STEP 5: Configure Chatwoot to Show Full Flow Data**

In Chatwoot, go to:
**Inbox Settings → WhatsApp Channel → Advanced Settings**

Enable:
- ✅ **"Show interactive message responses"**
- ✅ **"Format Flow submissions"**

If these options don't exist, we'll use a workaround (see Step 6).

---

### **STEP 6: Workaround - Custom Flow Response Formatting**

Since Chatwoot might not format Flow responses automatically, we'll create a script that sends a formatted message back to Chatwoot after receiving the Flow.

Create `/api/send-chatwoot-message.js`:

```javascript
// Send formatted Flow response to Chatwoot conversation
const CHATWOOT_ACCESS_TOKEN = process.env.CHATWOOT_ACCESS_TOKEN;

async function sendMessageToChatwoot(conversationId, content) {
  const response = await fetch(`https://chat.voomdigital.net/api/v1/accounts/14/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'api_access_token': CHATWOOT_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: content,
      message_type: 'outgoing',
      private: false
    })
  });

  if (!response.ok) {
    throw new Error(`Chatwoot API error: ${response.status}`);
  }

  return await response.json();
}

module.exports = { sendMessageToChatwoot };
```

Then update `/api/chatwoot-webhook.js` to send formatted messages.

---

## 🔄 **DATA FLOW DIAGRAM**

```
User (WhatsApp)
    ↓
[Starts Flow] → WhatsApp sends webhook to /api/webhook
    ↓
/api/webhook stores: flow_token → phone_number mapping
    ↓
User fills Flow
    ↓
[Submits] → Encrypted data goes to /api/flow
    ↓
/api/flow saves survey data (without phone initially)
    ↓
Chatwoot receives Flow response from WhatsApp
    ↓
Chatwoot formats and sends to /api/chatwoot-webhook
    ↓
/api/chatwoot-webhook:
  1. Extracts phone from sender
  2. Updates database record with phone using flow_token
    ↓
✅ Database now has complete record with phone number!
```

---

## 🧪 **TESTING STEPS**

### 1. **Test Webhook Verification**
```bash
curl "https://your-app.vercel.app/api/webhook?hub.mode=subscribe&hub.verify_token=deepal_maroc_verify_2026_secure&hub.challenge=TEST123"
```

Expected: `TEST123`

### 2. **Test Flow Endpoint**
Already working ✅

### 3. **Test Chatwoot Webhook**
```bash
curl -X POST https://your-app.vercel.app/api/chatwoot-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_created",
    "message_type": "incoming",
    "content": "📋 Form Submission:\n• Phone number: +212600000000\n• Q1 rating: 5_etoiles",
    "sender": {
      "phone_number": "+212600000000"
    }
  }'
```

---

## 🚨 **IMPORTANT: Remove Phone Input from Flow**

Since Chatwoot already provides the phone number, you can **optionally remove** the PHONE_SCREEN from your Flow JSON to make it shorter:

1. Remove `PHONE_SCREEN` from `screens` array
2. Update `routing_model` to start from `QUESTION_ONE`
3. Remove `phone_number` from all payloads

This makes the survey faster for users!

---

## 📊 **Verify Data Integrity**

After setup, check your database:

```sql
SELECT 
  id,
  phone_number,
  flow_token,
  q1_rating,
  created_at
FROM survey_responses
ORDER BY created_at DESC
LIMIT 10;
```

**Expected**: All records should have `phone_number` populated ✅

---

## 🐛 **Troubleshooting**

### Issue: Phone numbers still showing "N/A"

**Check**:
1. Verify `/api/webhook` receives WhatsApp webhooks (check Vercel logs)
2. Verify `/api/chatwoot-webhook` receives Chatwoot events (check logs)
3. Check database for `storeFlowTokenMapping` function execution

### Issue: Flow data not showing in Chatwoot

**Solution**: Chatwoot needs to be configured to forward Flow responses. Check with Chatwoot support or use the workaround in Step 6.

### Issue: Duplicate survey responses

**Solution**: Already handled with `ON CONFLICT (flow_token) DO UPDATE` in database ✅

---

## 🎯 **NEXT STEPS**

1. Deploy updated code to Vercel
2. Configure WhatsApp webhook
3. Configure Chatwoot webhook
4. Test with a real Flow submission
5. Verify phone numbers appear in dashboard

---

**Need help? Check Vercel logs:**
```bash
vercel logs --follow
```

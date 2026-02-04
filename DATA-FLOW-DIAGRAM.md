# 📊 VISUAL DATA FLOW DIAGRAM

## 🔄 Complete Flow Journey

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHONE NUMBER CAPTURE FLOW                        │
└─────────────────────────────────────────────────────────────────────┘

STEP 1: User Receives & Opens Flow
════════════════════════════════════════════════════════════════
📱 User (+212600123456)
    ↓ [Clicks Flow button]
    ↓
🌐 WhatsApp API
    ↓ [Sends webhook with phone number]
    ↓
📥 /api/webhook
    ↓ [Extracts: phone = +212600123456, flow_token = flow_abc123]
    ↓
💾 Database: INSERT flow_token ↔ phone_number mapping
    ↓
✅ PHONE CAPTURED ✅


STEP 2: User Fills & Submits Flow
════════════════════════════════════════════════════════════════
📱 User fills survey
    ↓ [Submits: Q1=5 stars, Q2=4 stars, etc.]
    ↓
🌐 WhatsApp API
    ↓ [Encrypts & sends to your endpoint]
    ↓
🔐 /api/flow (Data Exchange)
    ↓ [Decrypts payload]
    ↓ [Gets: flow_token = flow_abc123, data = {q1: 5_etoiles, ...}]
    ↓
💾 Database: INSERT/UPDATE survey data
    │ flow_token: flow_abc123
    │ phone_number: +212600123456 (already mapped!)
    │ q1_rating: 5_etoiles
    │ q2_rating: 4_etoiles
    │ ...
    ↓
✅ SURVEY SAVED ✅


STEP 3: Chatwoot Receives & Formats
════════════════════════════════════════════════════════════════
🌐 WhatsApp API
    ↓ [Forwards to Chatwoot]
    ↓
💬 Chatwoot
    ↓ [Receives: "📋 Form Submission: ..."]
    ↓ [Sends webhook to your endpoint]
    ↓
📥 /api/chatwoot-webhook
    ↓ [Parses formatted data]
    ↓ [Extracts: phone = +212600123456, flow_token = flow_abc123]
    ↓
💾 Database: UPDATE with phone (redundancy check)
    ↓
📤 Chatwoot Helper: Format & Send Back
    ↓
💬 Chatwoot Conversation
    │ 📋 Réponses du Questionnaire
    │ 📞 Téléphone: +212600123456
    │ 1️⃣ Accueil: ⭐⭐⭐⭐⭐
    │ 2️⃣ Livraison: ⭐⭐⭐⭐
    │ ...
    ↓
✅ FORMATTED MESSAGE SENT ✅


FINAL RESULT
════════════════════════════════════════════════════════════════
💾 Database Record:
┌─────────────────────────────────────────────────────────┐
│ id: 42                                                   │
│ flow_token: flow_abc123                                 │
│ phone_number: +212600123456 ✅                          │
│ q1_rating: 5_etoiles                                    │
│ q2_rating: 4_etoiles                                    │
│ satisfaction_score: 0.90                                │
│ is_promoter: true                                       │
│ created_at: 2026-02-04 14:39:06                        │
└─────────────────────────────────────────────────────────┘

📊 Dashboard Display:
┌─────────────────────────────────────────────────────────┐
│ Téléphone: +212600123456 ✅                             │
│ Date: 04/02/2026 14:39:06                              │
│ Accueil: ⭐⭐⭐⭐⭐ Excellent                           │
│ Livraison: ⭐⭐⭐⭐ Très bien                          │
│ Satisfaction: 90%                                       │
│ Suivi: ✓ Non                                           │
└─────────────────────────────────────────────────────────┘

💬 Chatwoot Conversation:
┌─────────────────────────────────────────────────────────┐
│ From: +212600123456                                     │
│ ────────────────────────────────────────────────────    │
│ 📋 Réponses du Questionnaire de Satisfaction           │
│                                                         │
│ 📞 Téléphone: +212600123456                            │
│                                                         │
│ 1️⃣ Accueil et Traitement Commercial                   │
│ ⭐⭐⭐⭐⭐ Excellent                                    │
│                                                         │
│ 2️⃣ Livraison du Véhicule                              │
│ ⭐⭐⭐⭐ Très bien                                     │
│ 💬 Service impeccable                                  │
│                                                         │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

---

## 🔍 Key Points

### Why 3 Endpoints?

1. **`/api/webhook`** (WhatsApp → You)
   - WhatsApp sends this BEFORE user fills the form
   - Contains phone number + flow_token
   - Stores the mapping

2. **`/api/flow`** (WhatsApp → You)
   - Encrypted Flow data exchange
   - Contains survey answers + flow_token
   - Saves survey data

3. **`/api/chatwoot-webhook`** (Chatwoot → You)
   - Formatted Flow response from Chatwoot
   - Contains phone number + survey data
   - Links phone to existing survey
   - Sends formatted message back

### Why This Works

- ✅ **Phone capture**: WhatsApp webhook has phone number
- ✅ **Data integrity**: flow_token links phone ↔ survey
- ✅ **No duplicates**: `ON CONFLICT` in database
- ✅ **Beautiful display**: Chatwoot shows formatted data
- ✅ **Redundancy**: Multiple checkpoints ensure phone is captured

---

## 🎯 Timeline

```
0:00  User clicks Flow
      ↓ /api/webhook fires
      ✅ Phone stored

0:30  User fills questions
      (No backend activity)

2:00  User submits
      ↓ /api/flow fires
      ✅ Survey saved

2:01  Chatwoot receives response
      ↓ /api/chatwoot-webhook fires
      ✅ Phone linked (if not already)
      ✅ Formatted message sent

Total time: ~2 seconds
```

---

## 🛡️ Failure Scenarios & Recovery

### Scenario 1: /api/webhook fails
- **Impact**: Phone not captured initially
- **Recovery**: Chatwoot webhook will capture phone when submission arrives
- **Result**: ✅ Phone still linked

### Scenario 2: /api/flow fails
- **Impact**: Survey not saved
- **Recovery**: User can resubmit Flow
- **Result**: ⚠️ User needs to resubmit

### Scenario 3: /api/chatwoot-webhook fails
- **Impact**: Formatted message not sent to Chatwoot
- **Recovery**: Phone already linked by webhook, data still in database
- **Result**: ✅ Data safe, just missing formatted display

---

## ✅ Data Integrity Guarantees

1. **Primary Key**: `flow_token` (unique per submission)
2. **Phone Capture**: 2 checkpoints (webhook + chatwoot-webhook)
3. **Duplicate Prevention**: `ON CONFLICT (flow_token) DO UPDATE`
4. **NULL Phone Prevention**: Chatwoot webhook ensures phone is always set
5. **Audit Trail**: All logs in Vercel for debugging

---

## 🚀 Performance

- **Total time**: ~2 seconds from submission to complete record
- **Database queries**: 3 total (insert mapping, save survey, update phone)
- **API calls**: 2 total (to Chatwoot for formatted message)
- **User experience**: Instant (no waiting, happens in background)

---

**All systems GO! 🎉**

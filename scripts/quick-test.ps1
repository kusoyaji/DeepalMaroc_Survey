# Quick Test - Deepal Maroc Webhooks
Write-Host "🧪 Testing Deepal Maroc Webhooks" -ForegroundColor Cyan
Write-Host ""

# Test 1: Flow endpoint
Write-Host "1️⃣  Testing Flow Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://deepalmarocwebhook.vercel.app/api/flow" -Method GET -UseBasicParsing
    Write-Host "✅ Flow endpoint: " -NoNewline -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
} catch {
    Write-Host "❌ Flow endpoint failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Chatwoot webhook
Write-Host "2️⃣  Testing Chatwoot Webhook..." -ForegroundColor Yellow
$testPayload = @{
    event = "message_created"
    message_type = "incoming"
    content = "📋 Form Submission:`n• Phone number: +212600999888`n• Q1 rating: 5_etoiles`n• Q2 rating: 4_etoiles"
    sender = @{
        phone_number = "+212600999888"
    }
    conversation = @{
        id = 99999
    }
    content_attributes = @{
        form_data = @{
            flow_token = "test_token_$(Get-Date -Format 'yyyyMMddHHmmss')"
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "https://deepalmarocwebhook.vercel.app/api/chatwoot-webhook" -Method POST -Body $testPayload -ContentType "application/json"
    Write-Host "✅ Chatwoot webhook response:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Compress) -ForegroundColor White
} catch {
    Write-Host "❌ Chatwoot webhook failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Tests complete! Check Vercel logs for details:" -ForegroundColor Green
Write-Host "   vercel logs" -ForegroundColor Gray

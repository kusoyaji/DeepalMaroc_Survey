# Test Chatwoot Webhook Locally
# Run this after deploying to Vercel

$WEBHOOK_URL = "https://deepalmarocwebhook.vercel.app/api/chatwoot-webhook"

# Test 1: Verify endpoint is accessible
Write-Host "🧪 Test 1: Endpoint Health Check" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri $WEBHOOK_URL.Replace("/api/chatwoot-webhook", "/api/flow") -Method GET
    Write-Host "✅ Endpoint is accessible: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "❌ Endpoint not accessible: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Send mock Chatwoot webhook
Write-Host "🧪 Test 2: Mock Flow Submission" -ForegroundColor Cyan

$mockPayload = @{
    event = "message_created"
    message_type = "incoming"
    content = @"
📋 Form Submission:
• Phone number: +212600123456
• Q1 rating: 5_etoiles
• Q1 comment: Excellent service
• Q2 rating: 4_etoiles
• Q2 comment: 
• Q3 followup: oui
• Q4 rating: 5_etoiles
• Q4 comment: Très professionnel
• Q5 rating: 5_etoiles
• Q5 comment: Meilleure marque
• Final comments: Merci beaucoup!
"@
    sender = @{
        phone_number = "+212600123456"
        identifier = "+212600123456"
    }
    conversation = @{
        id = 12345
        meta = @{
            sender = @{
                phone_number = "+212600123456"
            }
        }
    }
    content_attributes = @{
        form_data = @{
            flow_token = "test_flow_token_123"
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri $WEBHOOK_URL -Method POST -Body $mockPayload -ContentType "application/json"
    Write-Host "✅ Webhook response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "❌ Webhook test failed: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response | Out-String)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Check Vercel logs: vercel logs --follow" -ForegroundColor White
Write-Host "2. Verify database has the test record" -ForegroundColor White
Write-Host "3. Send a real Flow from Chatwoot to test end-to-end" -ForegroundColor White

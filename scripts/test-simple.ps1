# Quick Test - Deepal Maroc Webhooks
Write-Host "Testing Deepal Maroc Webhooks" -ForegroundColor Cyan
Write-Host ""

# Test 1: Flow endpoint
Write-Host "1. Testing Flow Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://deepalmarocwebhook.vercel.app/api/flow" -Method GET -UseBasicParsing
    Write-Host "SUCCESS - Flow endpoint: " -NoNewline -ForegroundColor Green
    Write-Host $response.Content -ForegroundColor White
} catch {
    Write-Host "FAILED - Flow endpoint: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Chatwoot webhook
Write-Host "2. Testing Chatwoot Webhook..." -ForegroundColor Yellow
$testPayload = @{
    event = "message_created"
    message_type = "incoming"
    content = "Form Submission: Phone +212600999888, Q1: 5 stars"
    sender = @{
        phone_number = "+212600999888"
    }
    conversation = @{
        id = 99999
    }
    content_attributes = @{
        form_data = @{
            flow_token = "test_token_" + (Get-Date -Format 'yyyyMMddHHmmss')
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "https://deepalmarocwebhook.vercel.app/api/chatwoot-webhook" -Method POST -Body $testPayload -ContentType "application/json"
    Write-Host "SUCCESS - Chatwoot webhook response:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Compress) -ForegroundColor White
} catch {
    Write-Host "FAILED - Chatwoot webhook: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Tests complete! Check Vercel logs for details:" -ForegroundColor Green
Write-Host "  vercel logs" -ForegroundColor Gray

Write-Host "Testing Chatwoot Webhook Directly..." -ForegroundColor Cyan

$payload = @{
    event = "message_created"
    message_type = "incoming"
    content = "Test message"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "https://deepalmarocwebhook.vercel.app/api/chatwoot-webhook" -Method POST -Body $payload -ContentType "application/json"
    Write-Host "SUCCESS!" -ForegroundColor Green
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message
    Write-Host "FAILED - Status: $statusCode" -ForegroundColor Red
    Write-Host "Error: $errorBody" -ForegroundColor Yellow
    
    # Try to get more details
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Gray
    }
}

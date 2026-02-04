# Configure Flow Endpoint
# VARIABLES
$accessToken = "EAAWqkyU5JYYBQjXOfEnzw1tO3APGrZAlkG8AaPFZArGheRPK0FpAqiCcdLRyjsBSkAU9jkERZB51gfXHFo9qH3ZA5X6DYlLhU3yIgbgYCWtDsvGnGOA6PR5QyliJEnbSgaidpEE1c3nVwGCioXzTcDLPFQdqlCf8aUNqmc1gc8KTeUM0XTYUpVRfzXlulwZDZD"

# Get Flow ID from file
if (Test-Path "flow-id.txt") {
    $flowId = Get-Content -Path "flow-id.txt" -Raw
    $flowId = $flowId.Trim()
} else {
    Write-Host "Error: flow-id.txt not found. Run create-flow.ps1 first!" -ForegroundColor Red
    exit
}

# Get endpoint URL from file (will be created after Vercel deployment)
if (Test-Path "vercel-url.txt") {
    $vercelUrl = Get-Content -Path "vercel-url.txt" -Raw
    $vercelUrl = $vercelUrl.Trim()
    $endpointUrl = "$vercelUrl/api/flow"
} else {
    Write-Host "Warning: vercel-url.txt not found. Please enter your Vercel URL:" -ForegroundColor Yellow
    $vercelUrl = Read-Host "Vercel URL (e.g., https://your-project.vercel.app)"
    $endpointUrl = "$vercelUrl/api/flow"
    $vercelUrl | Out-File -FilePath "vercel-url.txt" -NoNewline
}

$uri = "https://graph.facebook.com/v21.0/$flowId"
$body = @{
    endpoint_uri = $endpointUrl
} | ConvertTo-Json

Write-Host "Configuring endpoint for Flow ID: $flowId" -ForegroundColor Cyan
Write-Host "Endpoint URL: $endpointUrl" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
    } -Body $body

    Write-Host "Success! Endpoint configured!" -ForegroundColor Green
    Write-Host $response
} catch {
    Write-Host "Error configuring endpoint:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

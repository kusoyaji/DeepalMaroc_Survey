# Upload Flow JSON to WhatsApp
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

# Get the script's directory and navigate to parent
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
$jsonFilePath = Join-Path $projectRoot "deepal_survey_flow.json"

# Read flow JSON
$flowJson = Get-Content -Path $jsonFilePath -Raw

$uri = "https://graph.facebook.com/v21.0/$flowId/assets"
$body = @{
    name = "flow.json"
    asset_type = "FLOW_JSON"
    flow_json = $flowJson
} | ConvertTo-Json -Depth 50

Write-Host "Uploading Flow JSON to Flow ID: $flowId" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
    } -Body $body

    Write-Host "Success! Flow JSON uploaded!" -ForegroundColor Green
    Write-Host $response
} catch {
    Write-Host "Error uploading Flow JSON:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

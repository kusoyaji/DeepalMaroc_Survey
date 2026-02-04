# Publish WhatsApp Flow
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

$uri = "https://graph.facebook.com/v21.0/$flowId/publish"

Write-Host "Publishing Flow ID: $flowId" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
        "Authorization" = "Bearer $accessToken"
    }

    Write-Host "Success! Flow published!" -ForegroundColor Green
    Write-Host $response
} catch {
    Write-Host "Error publishing flow:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

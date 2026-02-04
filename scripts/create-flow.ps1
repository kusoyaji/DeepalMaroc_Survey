# Create WhatsApp Flow
# VARIABLES
$accessToken = "EAAWqkyU5JYYBQjXOfEnzw1tO3APGrZAlkG8AaPFZArGheRPK0FpAqiCcdLRyjsBSkAU9jkERZB51gfXHFo9qH3ZA5X6DYlLhU3yIgbgYCWtDsvGnGOA6PR5QyliJEnbSgaidpEE1c3nVwGCioXzTcDLPFQdqlCf8aUNqmc1gc8KTeUM0XTYUpVRfzXlulwZDZD"
$phoneNumberId = "875940088939317"

$uri = "https://graph.facebook.com/v21.0/$phoneNumberId/flows"
$body = @{
    name = "Deepal Janvier Survey"
    categories = @("SURVEY")
} | ConvertTo-Json

Write-Host "Creating WhatsApp Flow..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
    } -Body $body

    Write-Host "Success! Flow created!" -ForegroundColor Green
    Write-Host "Flow ID: $($response.id)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "SAVE THIS FLOW ID - You'll need it for the next scripts!" -ForegroundColor Red
    
    # Save to file for next scripts
    $response.id | Out-File -FilePath "flow-id.txt" -NoNewline
    Write-Host "Flow ID saved to flow-id.txt" -ForegroundColor Green
} catch {
    Write-Host "Error creating flow:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

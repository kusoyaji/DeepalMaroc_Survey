# Upload Public Key to WhatsApp Business
# VARIABLES
$accessToken = "EAAWqkyU5JYYBQjXOfEnzw1tO3APGrZAlkG8AaPFZArGheRPK0FpAqiCcdLRyjsBSkAU9jkERZB51gfXHFo9qH3ZA5X6DYlLhU3yIgbgYCWtDsvGnGOA6PR5QyliJEnbSgaidpEE1c3nVwGCioXzTcDLPFQdqlCf8aUNqmc1gc8KTeUM0XTYUpVRfzXlulwZDZD"
$phoneNumberId = "875940088939317"

# Get the script's directory and navigate to parent
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
$publicKeyPath = Join-Path $projectRoot "public-key.pem"

# Read public key and clean it (remove whitespace/newlines)
$publicKeyRaw = Get-Content -Path $publicKeyPath -Raw
$publicKey = $publicKeyRaw.Trim()

Write-Host "Public key length: $($publicKey.Length) characters" -ForegroundColor Yellow

# Upload to WhatsApp
$uri = "https://graph.facebook.com/v21.0/$phoneNumberId/whatsapp_business_encryption"
$body = @{
    business_public_key = $publicKey
} | ConvertTo-Json

Write-Host "Uploading public key to WhatsApp..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
    } -Body $body

    Write-Host "Success! Public key uploaded successfully!" -ForegroundColor Green
    Write-Host $response
} catch {
    Write-Host "Error uploading public key:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

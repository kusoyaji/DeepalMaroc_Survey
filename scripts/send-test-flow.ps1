# Send Test WhatsApp Flow Message
# VARIABLES
$accessToken = "EAAWqkyU5JYYBQjXOfEnzw1tO3APGrZAlkG8AaPFZArGheRPK0FpAqiCcdLRyjsBSkAU9jkERZB51gfXHFo9qH3ZA5X6DYlLhU3yIgbgYCWtDsvGnGOA6PR5QyliJEnbSgaidpEE1c3nVwGCioXzTcDLPFQdqlCf8aUNqmc1gc8KTeUM0XTYUpVRfzXlulwZDZD"
$phoneNumberId = "875940088939317"
$recipientPhone = "+212610059159"

# Get Flow ID from file or prompt
if (Test-Path "flow-id.txt") {
    $flowId = Get-Content -Path "flow-id.txt" -Raw
    $flowId = $flowId.Trim()
} else {
    Write-Host "flow-id.txt not found." -ForegroundColor Yellow
    $flowId = Read-Host "Enter your Flow ID"
    if ([string]::IsNullOrWhiteSpace($flowId)) {
        Write-Host "Error: Flow ID is required!" -ForegroundColor Red
        exit
    }
    # Save for future use
    $flowId | Out-File -FilePath "flow-id.txt" -NoNewline
    Write-Host "Flow ID saved to flow-id.txt" -ForegroundColor Green
}

$uri = "https://graph.facebook.com/v21.0/$phoneNumberId/messages"
# Include phone number in flow token for tracking
$flowToken = "deepal-" + $recipientPhone.Replace('+', '') + "-" + [guid]::NewGuid().ToString()

$body = @{
    messaging_product = "whatsapp"
    to = $recipientPhone
    type = "interactive"
    interactive = @{
        type = "flow"
        header = @{
            type = "text"
            text = "Enquete Satisfaction Deepal"
        }
        body = @{
            text = "Bonjour ! Nous aimerions connaitre votre avis sur votre experience avec Deepal Maroc."
        }
        footer = @{
            text = "2 minutes seulement"
        }
        action = @{
            name = "flow"
            parameters = @{
                flow_message_version = "3"
                flow_token = $flowToken
                flow_id = $flowId
                flow_cta = "Commencer l'enquete"
                flow_action = "navigate"
                flow_action_payload = @{
                    screen = "PHONE_SCREEN"
                }
            }
        }
    }
} | ConvertTo-Json -Depth 10

Write-Host "Sending test Flow message..." -ForegroundColor Cyan
Write-Host "Flow ID: $flowId" -ForegroundColor Yellow
Write-Host "Flow Token: $flowToken" -ForegroundColor Yellow
Write-Host "Recipient: $recipientPhone" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
    } -Body $body

    Write-Host ""
    Write-Host "Success! Test message sent!" -ForegroundColor Green
    Write-Host "Message ID: $($response.messages[0].id)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Check your WhatsApp to complete the survey!" -ForegroundColor Cyan
} catch {
    Write-Host "Error sending test message:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}

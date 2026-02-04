# Test Phone Number Integrity
# Run this before doing any broadcast to verify phone capture works

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Phone Number Integrity Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Flow Token Generation
Write-Host "Test 1: Flow Token Generation" -ForegroundColor Yellow
Write-Host "------------------------------"

$testPhones = @("+212610059159", "+212698765432", "+33612345678")

foreach ($phone in $testPhones) {
    $cleanPhone = $phone.Replace("+", "")
    $uuid = [guid]::NewGuid().ToString()
    $flowToken = "deepal-$cleanPhone-$uuid"
    
    Write-Host "Phone: $phone"
    Write-Host "Token: $($flowToken.Substring(0, 40))..." -ForegroundColor Green
    
    # Test extraction
    if ($flowToken -match "deepal-(\d+)-") {
        $extracted = "+$($matches[1])"
        if ($extracted -eq $phone) {
            Write-Host "Extraction: OK" -ForegroundColor Green
        } else {
            Write-Host "Extraction: FAILED" -ForegroundColor Red
            Write-Host "Expected: $phone, Got: $extracted"
        }
    }
    Write-Host ""
}

Write-Host ""

# Test 2: Check Database Integrity
Write-Host "Test 2: Database Integrity Check" -ForegroundColor Yellow
Write-Host "--------------------------------"

try {
    $integrityUrl = "https://deepalmarocwebhook.vercel.app/api/integrity"
    Write-Host "Checking: $integrityUrl"
    
    $response = Invoke-RestMethod -Uri $integrityUrl -Method GET -ErrorAction Stop
    
    Write-Host "Total Responses: $($response.overall_stats.total_responses)" -ForegroundColor Cyan
    Write-Host "With Phone: $($response.overall_stats.responses_with_phone)" -ForegroundColor Green
    Write-Host "Missing Phone: $($response.overall_stats.responses_missing_phone)" -ForegroundColor $(if ($response.overall_stats.responses_missing_phone -eq 0) { "Green" } else { "Red" })
    Write-Host "Capture Rate: $($response.overall_stats.phone_capture_rate)" -ForegroundColor $(if ($response.overall_stats.phone_capture_rate -eq "100%") { "Green" } else { "Yellow" })
    Write-Host "Status: $($response.overall_stats.status)" -ForegroundColor $(if ($response.overall_stats.status -match "EXCELLENT") { "Green" } else { "Yellow" })
    
    if ($response.alert) {
        Write-Host ""
        Write-Host "WARNING: $($response.alert.message)" -ForegroundColor Red
        Write-Host "Action: $($response.alert.action)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Recent Responses:" -ForegroundColor Cyan
    $response.recent_responses | Select-Object -First 5 | ForEach-Object {
        $phoneStatus = if ($_.phone_number -eq "🚨 MISSING") { "Red" } else { "Green" }
        Write-Host "  - ID: $($_.id) | Phone: $($_.phone_number) | Status: $($_.phone_status)" -ForegroundColor $phoneStatus
    }
    
} catch {
    Write-Host "Error checking integrity: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Check Recent Responses
Write-Host "Test 3: Recent Database Responses" -ForegroundColor Yellow
Write-Host "---------------------------------"

try {
    $responsesUrl = "https://deepalmarocwebhook.vercel.app/api/responses"
    Write-Host "Checking: $responsesUrl"
    
    $responses = Invoke-RestMethod -Uri $responsesUrl -Method GET -ErrorAction Stop
    
    Write-Host "Total in Database: $($responses.Count)" -ForegroundColor Cyan
    
    $withPhone = ($responses | Where-Object { $_.phone_number -ne $null }).Count
    $withoutPhone = ($responses | Where-Object { $_.phone_number -eq $null }).Count
    
    Write-Host "Responses with phone: $withPhone" -ForegroundColor Green
    Write-Host "Responses without phone: $withoutPhone" -ForegroundColor $(if ($withoutPhone -eq 0) { "Green" } else { "Red" })
    
    Write-Host ""
    Write-Host "Latest 5 Responses:" -ForegroundColor Cyan
    $responses | Select-Object -First 5 | ForEach-Object {
        $phoneDisplay = if ($_.phone_number) { $_.phone_number } else { "MISSING" }
        $color = if ($_.phone_number) { "Green" } else { "Red" }
        Write-Host "  - ID: $($_.id) | Phone: $phoneDisplay | Created: $($_.created_at)" -ForegroundColor $color
    }
    
} catch {
    Write-Host "Error checking responses: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Final Recommendation
Write-Host "Pre-Broadcast Checklist:" -ForegroundColor Yellow
Write-Host "------------------------"
Write-Host "- Phone capture rate is 100%" -ForegroundColor White
Write-Host "- No responses with missing phone numbers" -ForegroundColor White
Write-Host "- Flow token format is correct (deepal-{phone}-{uuid})" -ForegroundColor White
Write-Host "- Test with 5 real users first" -ForegroundColor White
Write-Host "- Chatwoot integration working" -ForegroundColor White
Write-Host "- Vercel logs show no CRITICAL alerts" -ForegroundColor White
Write-Host ""
Write-Host "If all checks pass, you're ready for broadcast!" -ForegroundColor Green

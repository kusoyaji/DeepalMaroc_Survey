# Add Environment Variables to Vercel
# This script adds PRIVATE_KEY and DATABASE_URL to all Vercel environments

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding Environment Variables to Vercel" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script's directory and navigate to parent
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
$privateKeyPath = Join-Path $projectRoot "private-key.pem"

# Read private key
$privateKey = Get-Content -Path $privateKeyPath -Raw
$privateKey = $privateKey.Trim()

Write-Host "Step 1: Adding PRIVATE_KEY to Vercel..." -ForegroundColor Yellow
Write-Host ""

# Add PRIVATE_KEY to production
Write-Host "Adding to PRODUCTION environment..." -ForegroundColor Cyan
$privateKey | vercel env add PRIVATE_KEY production

# Add PRIVATE_KEY to preview
Write-Host ""
Write-Host "Adding to PREVIEW environment..." -ForegroundColor Cyan
$privateKey | vercel env add PRIVATE_KEY preview

# Add PRIVATE_KEY to development
Write-Host ""
Write-Host "Adding to DEVELOPMENT environment..." -ForegroundColor Cyan
$privateKey | vercel env add PRIVATE_KEY development

Write-Host ""
Write-Host "PRIVATE_KEY added to all environments!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Step 2: Adding DATABASE_URL to Vercel..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Please enter your Neon PostgreSQL DATABASE_URL:" -ForegroundColor Cyan
Write-Host "(Format: postgresql://user:password@host/database?sslmode=require)" -ForegroundColor Gray
Write-Host ""
$databaseUrl = Read-Host "DATABASE_URL"

if ($databaseUrl) {
    Write-Host ""
    Write-Host "Adding DATABASE_URL to PRODUCTION environment..." -ForegroundColor Cyan
    $databaseUrl | vercel env add DATABASE_URL production
    
    Write-Host ""
    Write-Host "Adding DATABASE_URL to PREVIEW environment..." -ForegroundColor Cyan
    $databaseUrl | vercel env add DATABASE_URL preview
    
    Write-Host ""
    Write-Host "Adding DATABASE_URL to DEVELOPMENT environment..." -ForegroundColor Cyan
    $databaseUrl | vercel env add DATABASE_URL development
    
    Write-Host ""
    Write-Host "DATABASE_URL added to all environments!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "No DATABASE_URL provided. Skipping..." -ForegroundColor Red
    Write-Host "You can add it later by running this script again." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Environment variables setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next step: Redeploy to production with:" -ForegroundColor Yellow
Write-Host "vercel --prod" -ForegroundColor White

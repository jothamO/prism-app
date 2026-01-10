# Deploy telegram-bot-gateway edge function to Supabase
# PowerShell version for Windows

Write-Host "🚀 Deploying telegram-bot-gateway edge function..." -ForegroundColor Cyan

# Check if we're in the prism-app directory
if (-not (Test-Path "supabase/functions/telegram-bot-gateway")) {
    Write-Host "❌ Error: Must run from prism-app root directory" -ForegroundColor Red
    exit 1
}

# Get the Supabase project ref
$PROJECT_REF = "rjajxabpndmpcgssymxw"
$SUPABASE_URL = "https://${PROJECT_REF}.supabase.co"

# Try to get access token from edge function
Write-Host "📦 Fetching access token..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "${SUPABASE_URL}/functions/v1/get-supabase-access-token" -Method Get
    $ACCESS_TOKEN = $response.fullKey
} catch {
    $ACCESS_TOKEN = $null
}

if (-not $ACCESS_TOKEN) {
    Write-Host "⚠️  Could not fetch token from edge function." -ForegroundColor Yellow
    Write-Host "📝 Please set SUPABASE_ACCESS_TOKEN environment variable manually:" -ForegroundColor White
    Write-Host "   `$env:SUPABASE_ACCESS_TOKEN = 'your_token_here'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Or generate one at: https://supabase.com/dashboard/account/tokens" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Access token retrieved" -ForegroundColor Green

# Deploy the function
Write-Host "🔄 Deploying telegram-bot-gateway..." -ForegroundColor Cyan
$env:SUPABASE_ACCESS_TOKEN = $ACCESS_TOKEN
npx supabase functions deploy telegram-bot-gateway --project-ref $PROJECT_REF

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📌 Function URL: ${SUPABASE_URL}/functions/v1/telegram-bot-gateway" -ForegroundColor Cyan

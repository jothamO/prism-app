# Deploy get-supabase-access-token edge function to Supabase
# This is a bootstrap script - requires manual token first time

Write-Host "🚀 Deploying get-supabase-access-token edge function..." -ForegroundColor Cyan

# Check if we're in the prism-app directory
if (-not (Test-Path "supabase/functions/get-supabase-access-token")) {
    Write-Host "❌ Error: Must run from prism-app root directory" -ForegroundColor Red
    exit 1
}

$PROJECT_REF = "rjajxabpndmpcgssymxw"
$SUPABASE_URL = "https://${PROJECT_REF}.supabase.co"

# Check for access token in environment
if (-not $env:SUPABASE_ACCESS_TOKEN) {
    Write-Host "⚠️  SUPABASE_ACCESS_TOKEN not set in environment." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📝 First-time setup:" -ForegroundColor White
    Write-Host "   1. Go to: https://supabase.com/dashboard/account/tokens" -ForegroundColor Gray
    Write-Host "   2. Generate a new access token" -ForegroundColor Gray
    Write-Host "   3. Set it: `$env:SUPABASE_ACCESS_TOKEN = 'sbp_xxxxx'" -ForegroundColor Gray
    Write-Host "   4. Run this script again" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   After deployment, add the token as a secret in Supabase:" -ForegroundColor Gray
    Write-Host "   https://supabase.com/dashboard/project/${PROJECT_REF}/settings/functions" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Access token found in environment" -ForegroundColor Green

# Deploy the function
Write-Host "🔄 Deploying get-supabase-access-token..." -ForegroundColor Cyan
npx supabase functions deploy get-supabase-access-token --project-ref $PROJECT_REF

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📌 Function URL: ${SUPABASE_URL}/functions/v1/get-supabase-access-token" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  IMPORTANT: Add SUPABASE_ACCESS_TOKEN as a secret in Supabase dashboard" -ForegroundColor Yellow
Write-Host "   So other scripts can fetch it automatically." -ForegroundColor Gray

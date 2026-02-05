# Deploy all Supabase Edge Functions to self-hosted instance
# PowerShell version for Windows
# Usage: .\deploy-functions.ps1

$ErrorActionPreference = "Stop"

$PROJECT_REF = "mgozsryewbirhxjpcuvy"
$SUPABASE_URL = "https://${PROJECT_REF}.supabase.co"

Write-Host "🚀 Deploying Edge Functions to: ${SUPABASE_URL}" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Check if supabase CLI is installed
try {
    $null = Get-Command supabase -ErrorAction Stop
} catch {
    Write-Host "❌ Supabase CLI not found. Install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Gray
    exit 1
}

# Link to project
Write-Host "📦 Linking to project..." -ForegroundColor Yellow
supabase link --project-ref $PROJECT_REF

# All edge functions
$FUNCTIONS = @(
    "admin-bot-messaging"
    "admin-delete-user"
    "anti-avoidance-check"
    "api-documents"
    "api-gateway"
    "api-key-manager"
    "api-webhooks"
    "apply-code-proposal"
    "business-classifier"
    "cbn-rate-fetcher"
    "chat-assist"
    "check-expired-subscriptions"
    "classify-batch"
    "classify-transaction"
    "compliance-automations"
    "compliance-search"
    "create-github-release"
    "cross-border-tax"
    "dispatch-webhooks"
    "document-ocr"
    "generate-article-content"
    "generate-changelog-md"
    "generate-code-proposals"
    "generate-compliance-embeddings"
    "generate-deadline-content"
    "generate-insights"
    "generate-pdf-report"
    "generate-telegram-token"
    "get-lovable-key"
    "get-service-key"
    "get-supabase-access-token"
    "get-telegram-token"
    "import-nigeria-tax-act"
    "income-tax-calculator"
    "invoice-processor"
    "mono-connect-init"
    "mono-lookup-test"
    "mono-sync-transactions"
    "mono-webhook"
    "paystack-initialize"
    "paystack-portal"
    "paystack-subscribe"
    "paystack-verify"
    "paystack-webhook"
    "process-compliance-document"
    "process-multipart-document"
    "process-receipt"
    "project-funds"
    "recover-document-data"
    "regenerate-prism-impact"
    "register-business"
    "register-user"
    "scheduled-compliance-notifications"
    "seed-ml-data"
    "seed-test-data"
    "send-compliance-notifications"
    "simulate-nlu"
    "tax-calculate"
    "team-invite"
    "telegram-bot-gateway"
    "test-transaction-flow"
    "trigger-ml-training"
    "unlink-account"
    "usage-alerts"
    "vat-calculator"
    "vat-reconciliation"
    "verify-identity"
    "weekly-savings-email"
    "whatsapp-bot-gateway"
)

$TOTAL = $FUNCTIONS.Count
$CURRENT = 0
$FAILED = @()

foreach ($func in $FUNCTIONS) {
    $CURRENT++
    Write-Host ""
    Write-Host "[$CURRENT/$TOTAL] Deploying: $func" -ForegroundColor Cyan
    
    try {
        supabase functions deploy $func --project-ref $PROJECT_REF
        Write-Host "✅ $func deployed" -ForegroundColor Green
    } catch {
        Write-Host "❌ $func failed" -ForegroundColor Red
        $FAILED += $func
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "   Total: $TOTAL" -ForegroundColor White
Write-Host "   Failed: $($FAILED.Count)" -ForegroundColor $(if ($FAILED.Count -gt 0) { "Red" } else { "Green" })

if ($FAILED.Count -gt 0) {
    Write-Host ""
    Write-Host "❌ Failed functions:" -ForegroundColor Red
    foreach ($f in $FAILED) {
        Write-Host "   - $f" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "📌 Functions URL: ${SUPABASE_URL}/functions/v1/" -ForegroundColor Cyan

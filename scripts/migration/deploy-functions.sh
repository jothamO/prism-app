#!/bin/bash
# Deploy all Supabase Edge Functions to self-hosted instance
# Usage: ./deploy-functions.sh

set -e

PROJECT_REF="mgozsryewbirhxjpcuvy"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

echo "🚀 Deploying Edge Functions to: ${SUPABASE_URL}"
echo "================================================"

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if linked
echo "📦 Linking to project..."
supabase link --project-ref "$PROJECT_REF"

# Deploy all functions
FUNCTIONS=(
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

TOTAL=${#FUNCTIONS[@]}
CURRENT=0
FAILED=()

for func in "${FUNCTIONS[@]}"; do
    CURRENT=$((CURRENT + 1))
    echo ""
    echo "[$CURRENT/$TOTAL] Deploying: $func"
    
    if supabase functions deploy "$func" --project-ref "$PROJECT_REF"; then
        echo "✅ $func deployed"
    else
        echo "❌ $func failed"
        FAILED+=("$func")
    fi
done

echo ""
echo "================================================"
echo "🎉 Deployment Complete!"
echo "   Total: $TOTAL"
echo "   Failed: ${#FAILED[@]}"

if [ ${#FAILED[@]} -gt 0 ]; then
    echo ""
    echo "❌ Failed functions:"
    for f in "${FAILED[@]}"; do
        echo "   - $f"
    done
fi

echo ""
echo "📌 Functions URL: ${SUPABASE_URL}/functions/v1/"

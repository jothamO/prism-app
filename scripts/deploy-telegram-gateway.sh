#!/bin/bash
# Deploy telegram-bot-gateway edge function to Supabase
# This script fetches the access token from the edge function and deploys

set -e

echo "🚀 Deploying telegram-bot-gateway edge function..."

# Check if we're in the prism-app directory
if [ ! -d "supabase/functions/telegram-bot-gateway" ]; then
    echo "❌ Error: Must run from prism-app root directory"
    exit 1
fi

# Get the Supabase project ref from config
PROJECT_REF="rjajxabpndmpcgssymxw"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# Try to get access token from edge function
echo "📦 Fetching access token..."
TOKEN_RESPONSE=$(curl -s "${SUPABASE_URL}/functions/v1/get-supabase-access-token")
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"fullKey":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
    echo "⚠️  Could not fetch token from edge function."
    echo "📝 Please set SUPABASE_ACCESS_TOKEN environment variable manually:"
    echo "   export SUPABASE_ACCESS_TOKEN=your_token_here"
    echo ""
    echo "   Or add it as a secret in Supabase dashboard:"
    echo "   https://supabase.com/dashboard/project/${PROJECT_REF}/settings/vault"
    exit 1
fi

echo "✅ Access token retrieved"

# Deploy the function
echo "🔄 Deploying telegram-bot-gateway..."
SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN" npx supabase functions deploy telegram-bot-gateway --project-ref "$PROJECT_REF"

echo "✅ Deployment complete!"
echo ""
echo "📌 Function URL: ${SUPABASE_URL}/functions/v1/telegram-bot-gateway"

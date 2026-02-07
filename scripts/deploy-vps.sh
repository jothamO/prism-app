#!/bin/bash
# PRISM Multi-Environment Deployment Script
# Usage: bash deploy-vps.sh [production|staging|lab]

set -e

ENV=${1:-production}

echo "🚀 Starting PRISM Deployment for [$ENV] environment..."

case $ENV in
  production)
    APP_DIR="/var/www/prism-production"
    ;;
  staging)
    APP_DIR="/var/www/prism-staging"
    ;;
  lab)
    APP_DIR="/var/www/prism-lab"
    ;;
  *)
    echo "❌ Unknown environment: $ENV. Use: production, staging, or lab"
    exit 1
    ;;
esac

GATEWAY_DIR="$APP_DIR/gateway"
API_DIR="$APP_DIR/prism-api"
AUTOMATION_DIR="$APP_DIR/automation"

# Pull latest code
echo "📥 Pulling latest changes for $ENV..."
cd $APP_DIR
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
cd $GATEWAY_DIR
npm install --production
cd $API_DIR
npm install --production

# Build TypeScript
echo "🔨 Building TypeScript..."
cd $GATEWAY_DIR
npm run build
cd $API_DIR
npm run build

# Restart with PM2 (only the specific environment apps)
echo "🔄 Reloading PM2 apps for $ENV..."
cd $APP_DIR
if [ "$ENV" = "production" ]; then
  pm2 reload prism-gateway prism-api prism-worker --update-env
elif [ "$ENV" = "staging" ]; then
  pm2 reload prism-api-staging prism-gateway-staging --update-env
elif [ "$ENV" = "lab" ]; then
  pm2 reload prism-api-lab prism-gateway-lab --update-env
fi

# Restart Automation Stack (production only)
if [ "$ENV" = "production" ]; then
  echo "⚙️  Restarting Automation Infrastructure (n8n)..."
  cd $AUTOMATION_DIR
  docker compose pull
  docker compose up -d
fi

# Cleanup
echo "🧹 Cleaning up old build artifacts..."

echo "✅ Deployment complete for [$ENV]!"
pm2 status

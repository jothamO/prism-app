# PRISM VPS Deployment Script (PowerShell)
# Automates the update and restart of the PRISM ecosystem on Azure VPS (Windows compatible if needed)

$APP_DIR = "C:\var\www\prism-ecosystem"
$GATEWAY_DIR = "$APP_DIR\gateway"
$API_DIR = "$APP_DIR\prism-api"

Write-Host "🚀 Starting PRISM Deployment..." -ForegroundColor Cyan

# Navigate to app directory
Set-Location $APP_DIR

# Pull latest changes
Write-Host "📥 Pulling latest changes from Git..." -ForegroundColor Blue
git pull origin main

# Update Gateway
Write-Host "🛠️ Updating Gateway..." -ForegroundColor Blue
Set-Location $GATEWAY_DIR
npm install --legacy-peer-deps
npm run build

# Update API
Write-Host "🛠️ Updating PRISM API..." -ForegroundColor Blue
Set-Location $API_DIR
npm install --legacy-peer-deps
npm run build

# Restart with PM2
Write-Host "🔄 Reloading PM2 ecosystem..." -ForegroundColor Blue
Set-Location $APP_DIR
pm2 reload ecosystem.config.js --update-env

Write-Host "✅ Deployment Complete! PRISM is now running the latest version." -ForegroundColor Green
pm2 status

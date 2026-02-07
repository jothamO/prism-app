#!/bin/bash
# PRISM Azure VPS Bootstrap Script
# Run this ONCE on a fresh Ubuntu 22.04/24.04 VPS
# Usage: sudo bash bootstrap-vps.sh

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        PRISM VPS Bootstrap Script v1.0                       ║"
echo "║        Setting up Azure VPS for PRISM Ecosystem              ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ============================================================
# 1. SYSTEM UPDATE
# ============================================================
echo ""
echo "📦 [1/8] Updating system packages..."
apt update && apt upgrade -y

# ============================================================
# 2. ESSENTIAL BUILD TOOLS
# ============================================================
echo ""
echo "🔧 [2/8] Installing essential build tools..."
apt install -y \
    git \
    curl \
    wget \
    build-essential \
    python3 \
    python3-pip \
    software-properties-common \
    ca-certificates \
    gnupg \
    lsb-release \
    apache2-utils  # For htpasswd

# ============================================================
# 3. NODE.JS 24.x
# ============================================================
echo ""
echo "🟢 [3/8] Installing Node.js 24.x..."
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

echo "   Node version: $(node --version)"
echo "   NPM version: $(npm --version)"

# ============================================================
# 4. BUN RUNTIME
# ============================================================
echo ""
echo "🍞 [4/8] Installing Bun runtime..."
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Add to profile for future sessions
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc

echo "   Bun version: $(bun --version 2>/dev/null || echo 'Installed, restart shell to use')"

# ============================================================
# 5. PM2 PROCESS MANAGER
# ============================================================
echo ""
echo "⚙️  [5/8] Installing PM2 process manager..."
npm install -g pm2

# Enable PM2 startup on boot
pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER
echo "   PM2 version: $(pm2 --version)"

# ============================================================
# 6. DOCKER + DOCKER COMPOSE
# ============================================================
echo ""
echo "🐳 [6/8] Installing Docker and Docker Compose..."

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
usermod -aG docker $SUDO_USER

echo "   Docker version: $(docker --version)"
echo "   Docker Compose version: $(docker compose version)"

# ============================================================
# 7. NGINX + CERTBOT (SSL)
# ============================================================
echo ""
echo "🌐 [7/8] Installing Nginx and Certbot..."
apt install -y nginx certbot python3-certbot-nginx

# Enable and start Nginx
systemctl enable nginx
systemctl start nginx

echo "   Nginx version: $(nginx -v 2>&1)"
echo "   Certbot version: $(certbot --version)"

# ============================================================
# 8. CREATE DIRECTORY STRUCTURE
# ============================================================
echo ""
echo "📁 [8/8] Creating PRISM directory structure..."

# Multi-environment directories
mkdir -p /var/www/prism-production
mkdir -p /var/www/prism-staging
mkdir -p /var/www/prism-lab

# OpenClaw workspace (owner only)
mkdir -p /home/$SUDO_USER/openclaw/workspace

# Set permissions
chown -R $SUDO_USER:$SUDO_USER /var/www/prism-*
chown -R $SUDO_USER:$SUDO_USER /home/$SUDO_USER/openclaw

echo "   ✓ /var/www/prism-production"
echo "   ✓ /var/www/prism-staging"
echo "   ✓ /var/www/prism-lab"
echo "   ✓ /home/$SUDO_USER/openclaw/workspace"

# ============================================================
# COMPLETION
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ BOOTSTRAP COMPLETE!                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Installed:                                                   ║"
echo "║    • Git, Build Tools, Python3                               ║"
echo "║    • Node.js 24.x + NPM                                      ║"
echo "║    • Bun Runtime                                             ║"
echo "║    • PM2 Process Manager                                     ║"
echo "║    • Docker + Docker Compose                                 ║"
echo "║    • Nginx + Certbot (SSL)                                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Next Steps:                                                  ║"
echo "║    1. Log out and back in (for docker group)                 ║"
echo "║    2. Clone your repo to /var/www/prism-production           ║"
echo "║    3. Set up SSL: certbot --nginx -d prism.sh                ║"
echo "║    4. Copy .env files and configure secrets                  ║"
echo "║    5. Run: bash scripts/deploy-vps.sh production             ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# Version summary
echo ""
echo "📋 Installed Versions:"
echo "   Node.js:        $(node --version)"
echo "   NPM:            $(npm --version)"
echo "   PM2:            $(pm2 --version)"
echo "   Docker:         $(docker --version | cut -d' ' -f3 | tr -d ',')"
echo "   Docker Compose: $(docker compose version --short)"
echo "   Nginx:          $(nginx -v 2>&1 | cut -d'/' -f2)"
echo "   Git:            $(git --version | cut -d' ' -f3)"
echo ""

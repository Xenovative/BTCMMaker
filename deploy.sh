#!/bin/bash

# =============================================================================
# BTC 15-Minute Trading Bot - VPS Deployment Script
# =============================================================================
# Usage:
#   1. Copy this script to your VPS
#   2. chmod +x deploy.sh
#   3. ./deploy.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  BTC 15M Trading Bot - VPS Deployment  ${NC}"
echo -e "${GREEN}========================================${NC}"

# Configuration
APP_NAME="btc-mm-bot"
APP_DIR="/opt/$APP_NAME"
REPO_URL="${REPO_URL:-git@github.com:yourusername/BTCMMaker.git}"
NODE_VERSION="20"
PM2_INSTANCES=1

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo ./deploy.sh)${NC}"
    exit 1
fi

# =============================================================================
# Step 1: Install system dependencies
# =============================================================================
echo -e "\n${YELLOW}[1/7] Installing system dependencies...${NC}"

apt-get update
apt-get install -y curl git build-essential

# =============================================================================
# Step 2: Install Node.js
# =============================================================================
echo -e "\n${YELLOW}[2/7] Installing Node.js v${NODE_VERSION}...${NC}"

if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt $NODE_VERSION ]]; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# =============================================================================
# Step 3: Install PM2 globally
# =============================================================================
echo -e "\n${YELLOW}[3/7] Installing PM2...${NC}"

npm install -g pm2

# =============================================================================
# Step 4: Clone or update repository
# =============================================================================
echo -e "\n${YELLOW}[4/7] Setting up application...${NC}"

if [ -d "$APP_DIR" ]; then
    echo "Updating existing installation..."
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/main
else
    echo "Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# =============================================================================
# Step 5: Install dependencies and build
# =============================================================================
echo -e "\n${YELLOW}[5/7] Installing dependencies...${NC}"

npm ci --production=false
npm run build

# =============================================================================
# Step 6: Setup environment
# =============================================================================
echo -e "\n${YELLOW}[6/7] Setting up environment...${NC}"

if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo -e "${RED}⚠️  Please edit $APP_DIR/.env with your configuration!${NC}"
    echo -e "${RED}   nano $APP_DIR/.env${NC}"
fi

# =============================================================================
# Step 7: Start with PM2
# =============================================================================
echo -e "\n${YELLOW}[7/7] Starting application with PM2...${NC}"

# Stop existing instance if running
pm2 delete "$APP_NAME" 2>/dev/null || true

# Start the application
pm2 start npm --name "$APP_NAME" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!                  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Application directory: ${YELLOW}$APP_DIR${NC}"
echo -e "View logs:            ${YELLOW}pm2 logs $APP_NAME${NC}"
echo -e "Monitor:              ${YELLOW}pm2 monit${NC}"
echo -e "Restart:              ${YELLOW}pm2 restart $APP_NAME${NC}"
echo -e "Stop:                 ${YELLOW}pm2 stop $APP_NAME${NC}"
echo ""
echo -e "${RED}⚠️  Don't forget to configure your .env file!${NC}"
echo -e "   ${YELLOW}nano $APP_DIR/.env${NC}"

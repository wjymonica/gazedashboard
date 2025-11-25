#!/bin/bash

# Quick deployment script for DigitalOcean Droplet
# Usage: ./deploy-to-droplet.sh

DROPLET_IP="68.183.60.46"
DROPLET_USER="root"
DROPLET_PATH="/root/gazedashboard"

echo "🚀 Deploying optimized dashboard to droplet..."

# Step 1: Copy backend file
echo "📦 Copying backend code..."
scp backend/app.py ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/backend/

# Step 2: Copy optimized configs
echo "⚙️  Copying configuration files..."
scp dashboard-backend-optimized.service ${DROPLET_USER}@${DROPLET_IP}:/tmp/
scp nginx-optimized.conf ${DROPLET_USER}@${DROPLET_IP}:/tmp/

# Step 3: Build frontend locally
echo "🏗️  Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Step 4: Copy frontend build
echo "📤 Copying frontend build..."
scp -r frontend/dist/* ${DROPLET_USER}@${DROPLET_IP}:/tmp/dashboard-frontend/

# Step 5: Execute deployment on droplet
echo "🔧 Configuring droplet..."
ssh ${DROPLET_USER}@${DROPLET_IP} << 'ENDSSH'
set -e

echo "Updating systemd service..."
sudo cp /tmp/dashboard-backend-optimized.service /etc/systemd/system/dashboard-backend.service
sudo systemctl daemon-reload

echo "Updating nginx config..."
sudo cp /tmp/nginx-optimized.conf /etc/nginx/sites-available/dashboard

echo "Testing nginx config..."
sudo nginx -t

echo "Deploying frontend files..."
sudo rm -rf /var/www/gazedashboard/*
sudo cp -r /tmp/dashboard-frontend/* /var/www/gazedashboard/
sudo chown -R www-data:www-data /var/www/gazedashboard
sudo chmod -R 755 /var/www/gazedashboard

echo "Restarting services..."
sudo systemctl restart dashboard-backend
sudo systemctl restart nginx

echo "Checking service status..."
sudo systemctl status dashboard-backend --no-pager -l
sudo systemctl status nginx --no-pager -l

echo "✅ Deployment complete!"
echo "🌐 Visit: http://68.183.60.46"

ENDSSH

echo ""
echo "✨ All done! Your optimized dashboard is now live."
echo "🌐 URL: http://${DROPLET_IP}"
echo ""
echo "📊 To check logs:"
echo "   Backend: ssh ${DROPLET_USER}@${DROPLET_IP} 'sudo journalctl -u dashboard-backend -f'"
echo "   Nginx:   ssh ${DROPLET_USER}@${DROPLET_IP} 'sudo tail -f /var/log/nginx/error.log'"


# Deploy Updated Dashboard to DigitalOcean Droplet

## Step 1: Connect to Your Droplet

```bash
ssh root@68.183.60.46
```

## Step 2: Navigate to Project Directory

```bash
cd /root/gazedashboard
```

## Step 3: Pull Latest Changes from Git

If you've committed your changes to git:

```bash
git pull origin main
```

If you haven't committed yet, you'll need to either:
- Commit and push your local changes first, OR
- Manually copy the updated files (see Alternative Method below)

## Step 4: Update Backend

```bash
# Navigate to backend
cd /root/gazedashboard/backend

# Activate virtual environment
source /root/gazedashboard/venv/bin/activate

# Install any new dependencies (if requirements.txt changed)
pip install -r requirements.txt

# Restart the backend service
sudo systemctl restart dashboard-backend

# Check status
sudo systemctl status dashboard-backend
```

## Step 5: Update Frontend

```bash
# Navigate to frontend
cd /root/gazedashboard/frontend

# Install any new dependencies
npm install

# Build the frontend (without VITE_BACKEND_URL to use relative paths)
npm run build

# Copy built files to nginx directory
sudo rm -rf /var/www/gazedashboard/*
sudo cp -r dist/* /var/www/gazedashboard/

# Set proper permissions
sudo chown -R www-data:www-data /var/www/gazedashboard
sudo chmod -R 755 /var/www/gazedashboard
```

## Step 6: Restart Nginx

```bash
# Test nginx configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx
```

## Step 7: Verify Deployment

Visit your droplet IP in a browser:
```
http://68.183.60.46
```

You should see the new home page with folder selection buttons.

---

## Alternative Method: Manual File Transfer

If you haven't set up git, you can manually transfer files using `scp`:

### From your local machine:

```bash
# Transfer backend files
scp /Users/jingyingwang/Downloads/dashboard/backend/app.py root@68.183.60.46:/root/gazedashboard/backend/

# Transfer frontend files (build locally first)
cd /Users/jingyingwang/Downloads/dashboard/frontend
npm run build
scp -r dist/* root@68.183.60.46:/var/www/gazedashboard/
```

Then on the droplet:
```bash
# Restart services
sudo systemctl restart dashboard-backend
sudo systemctl restart nginx

# Fix permissions
sudo chown -R www-data:www-data /var/www/gazedashboard
sudo chmod -R 755 /var/www/gazedashboard
```

---

## Troubleshooting

### Check Backend Logs
```bash
sudo journalctl -u dashboard-backend -n 50 --no-pager
```

### Check Nginx Logs
```bash
sudo tail -f /var/log/nginx/error.log
```

### Check if Services are Running
```bash
sudo systemctl status dashboard-backend
sudo systemctl status nginx
```

### Test Backend API Directly
```bash
curl http://localhost:5000/api/folders
curl http://localhost:5000/api/health
```

### Common Issues

1. **500 Error on /api/folders**
   - Check backend logs: `sudo journalctl -u dashboard-backend -n 50`
   - Ensure backend has access to data directory
   - Verify backend is running: `sudo systemctl status dashboard-backend`

2. **404 on Static Files**
   - Verify files are in `/var/www/gazedashboard/`
   - Check permissions: `ls -la /var/www/gazedashboard/`
   - Ensure nginx config is correct

3. **Backend Not Starting**
   - Check systemd service: `sudo systemctl status dashboard-backend`
   - View detailed logs: `sudo journalctl -u dashboard-backend -n 100`
   - Verify python dependencies: `source /root/gazedashboard/venv/bin/activate && pip list`


# Deploy Optimized Video Streaming to DigitalOcean Droplet

## What's Being Optimized

1. **Backend (Flask)**: 
   - Proper HTTP range request handling for video streaming
   - Chunked streaming with 8KB blocks
   - Cache headers for better browser caching
   - Better error handling

2. **Gunicorn**: 
   - 4 workers with 4 threads each (16 concurrent requests)
   - gthread worker class for better I/O handling
   - Increased timeout for video streaming
   - Connection keepalive

3. **Nginx**: 
   - Disabled buffering for video endpoints (faster start time)
   - TCP optimizations (tcp_nodelay)
   - Range request forwarding
   - Separate caching rules for videos vs static assets

4. **Frontend**: 
   - Video preload="metadata" for faster initial load
   - Browser will request only needed chunks

---

## Deployment Steps

### Step 1: Connect to Droplet

```bash
ssh root@68.183.60.46
```

### Step 2: Update Backend Code

```bash
cd /root/gazedashboard

# Pull latest code (if using git)
git pull origin main

# OR manually copy app.py
# From local: scp /Users/jingyingwang/Downloads/dashboard/backend/app.py root@68.183.60.46:/root/gazedashboard/backend/
```

### Step 3: Update Systemd Service (Optimized Gunicorn)

```bash
# Backup current service file
sudo cp /etc/systemd/system/dashboard-backend.service /etc/systemd/system/dashboard-backend.service.backup

# Create new optimized service file
sudo nano /etc/systemd/system/dashboard-backend.service
```

Paste this content:

```ini
[Unit]
Description=Dashboard Flask Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/gazedashboard/backend
Environment="PORT=5000"
Environment="FLASK_CORS_ANY=1"

ExecStart=/root/gazedashboard/venv/bin/gunicorn \
    --workers 4 \
    --threads 4 \
    --worker-class gthread \
    --bind 127.0.0.1:5000 \
    --timeout 300 \
    --keepalive 5 \
    --access-logfile /var/log/dashboard-access.log \
    --error-logfile /var/log/dashboard-error.log \
    --log-level info \
    app:app

Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Save (Ctrl+O, Enter, Ctrl+X) and reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart dashboard-backend
sudo systemctl status dashboard-backend
```

### Step 4: Update Nginx Configuration

```bash
# Backup current config
sudo cp /etc/nginx/sites-available/dashboard /etc/nginx/sites-available/dashboard.backup

# Edit config
sudo nano /etc/nginx/sites-available/dashboard
```

Paste this optimized configuration:

```nginx
server {
    listen 80;
    server_name 68.183.60.46;

    root /var/www/gazedashboard;
    index index.html;

    client_max_body_size 500M;
    client_body_buffer_size 128k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 16k;

    location / {
        try_files $uri $uri/ /index.html;
        
        location ~* \.js$ {
            add_header Content-Type application/javascript;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        location ~* \.css$ {
            add_header Content-Type text/css;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        location ~* \.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600;
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }

    # CRITICAL: Optimized video streaming
    location ~ ^/api/(video|quickview) {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600;
        proxy_connect_timeout 10;
        proxy_send_timeout 3600;
        
        tcp_nodelay on;
        tcp_nopush off;
        proxy_force_ranges on;
        
        add_header Cache-Control "public, max-age=3600";
        add_header Accept-Ranges bytes;
    }
}
```

Save and test:

```bash
# Test configuration
sudo nginx -t

# If OK, restart nginx
sudo systemctl restart nginx
sudo systemctl status nginx
```

### Step 5: Update Frontend

```bash
cd /root/gazedashboard/frontend

# Install/update dependencies
npm install

# Build with optimizations
npm run build

# Deploy to nginx directory
sudo rm -rf /var/www/gazedashboard/*
sudo cp -r dist/* /var/www/gazedashboard/

# Set permissions
sudo chown -R www-data:www-data /var/www/gazedashboard
sudo chmod -R 755 /var/www/gazedashboard
```

### Step 6: Verify Everything Works

```bash
# Check backend is running
curl http://localhost:5000/api/health

# Check folders endpoint
curl http://localhost:5000/api/folders

# Test video endpoint (should return range support)
curl -I http://localhost:5000/api/video?folder=original

# Check services
sudo systemctl status dashboard-backend
sudo systemctl status nginx
```

### Step 7: Test in Browser

Open: `http://68.183.60.46`

The video should now:
- Start playing almost immediately (metadata loads first)
- Seek instantly to any position
- Buffer efficiently
- Show loading spinner briefly, not for long periods

---

## Performance Improvements Expected

- **Initial Load Time**: ~70-90% faster (metadata loads in <1s instead of full video)
- **Seek Performance**: Instant (range requests work properly)
- **Buffering**: Smooth, minimal interruptions
- **Memory Usage**: Lower (streaming vs loading entire file)

---

## Troubleshooting

### Video Still Slow?

1. **Check backend logs:**
```bash
sudo tail -f /var/log/dashboard-error.log
sudo journalctl -u dashboard-backend -f
```

2. **Check nginx logs:**
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

3. **Test range requests:**
```bash
# Should return 206 Partial Content
curl -I -H "Range: bytes=0-1023" http://localhost:5000/api/video?folder=original
```

4. **Check network speed:**
```bash
# From local machine, test download speed
time curl -o /dev/null http://68.183.60.46/api/video?folder=original
```

### Backend Not Starting?

```bash
# Check detailed logs
sudo journalctl -u dashboard-backend -n 100 --no-pager

# Test manually
cd /root/gazedashboard/backend
source /root/gazedashboard/venv/bin/activate
python app.py
```

### Nginx Config Error?

```bash
# Test config
sudo nginx -t

# If syntax error, restore backup
sudo cp /etc/nginx/sites-available/dashboard.backup /etc/nginx/sites-available/dashboard
sudo nginx -t
sudo systemctl restart nginx
```

---

## Additional Optimizations (Optional)

### 1. Enable Gzip Compression in Nginx

Add to `/etc/nginx/nginx.conf` in the `http` block:

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
```

Then: `sudo systemctl restart nginx`

### 2. Increase System File Limits

```bash
sudo nano /etc/security/limits.conf
```

Add:
```
* soft nofile 65536
* hard nofile 65536
```

### 3. Optimize TCP Settings

```bash
sudo nano /etc/sysctl.conf
```

Add:
```
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
```

Apply: `sudo sysctl -p`


# 🏥 Production Deployment & DevOps Playbook

> **Purpose:** Comprehensive, step-by-step documentation with exact commands for deploying modern Full-Stack microservices (Next.js Frontend, Node.js/Express Backend with Replicas, Redis, Nginx Reverse Proxy, Let's Encrypt SSL, and Jenkins CI/CD) to a cloud Virtual Private Server (VPS).
> **Target Audience:** DevOps Engineers, Software Engineers, and Interview Preparation.

---

## 📑 Table of Contents
1. [Cloud Infrastructure & Server Sizing](#1-cloud-infrastructure--server-sizing)
2. [Server Provisioning & Optimization (RAM / Swap)](#2-server-provisioning--optimization-ram--swap)
3. [Docker & Networking Architecture](#3-docker--networking-architecture)
4. [Custom Domain & DNS Setup](#4-custom-domain--dns-setup)
5. [SSL / TLS Certificate Setup (Let's Encrypt & Certbot)](#5-ssl--tls-certificate-setup-lets-encrypt--certbot)
6. [Unified Nginx Reverse Proxy Configuration](#6-unified-nginx-reverse-proxy-configuration)
7. [Environment Configuration & OAuth](#7-environment-configuration--oauth)
8. [Automated CI/CD Dual Deployment (Jenkins)](#8-automated-cicd-dual-deployment-jenkins)
9. [Operational Cheat Sheet (Scaling, Logs & Monitoring)](#9-operational-cheat-sheet-scaling-logs--monitoring)

---

## 1. Cloud Infrastructure & Server Sizing

| Parameter | Recommended Specification | Rationale / Benefits |
| :--- | :--- | :--- |
| **Cloud Provider** | Any Cloud (Azure, AWS, DigitalOcean, GCP) | General-purpose Linux VPS with standard networking. |
| **VM Sizing** | 2 vCPU, 1 GB to 2 GB RAM | Cost-effective tier; optimized with a swapfile for build spikes. |
| **Operating System** | Ubuntu 24.04 LTS (x64) | Long-term support, stable Linux kernel, modern systemd service management. |
| **Public IP** | Static Public IPv4 | Required for DNS A-Record mapping and Let's Encrypt verification. |
| **Authentication** | SSH Key Pair (RSA 2048/4096-bit or Ed25519) | Disabling password login in favor of SSH keys prevents brute-force attacks. |
| **Security / Firewall** | Ports `22` (SSH), `80` (HTTP), `443` (HTTPS) | Restrict all internal ports (e.g. database, Redis, microservices) to localhost/docker network. |

---

## 2. Server Provisioning & Optimization (RAM / Swap)

### Step 2.1: Connecting to the Server via SSH
```bash
ssh -i /path/to/your-private-key.pem <USERNAME>@<YOUR_SERVER_IP>
```

### Step 2.2: Updating System Packages
```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2.3: Creating a 4GB Swapfile (CRUCIAL for Budget VMs)
A 1GB or 2GB RAM VM can easily run out of memory (OOM) during Next.js builds or Docker image compilation. A 4GB swap space adds virtual memory headroom:
```bash
# 1. Allocate 4 Gigabytes file
sudo fallocate -l 4G /swapfile

# 2. Restrict permissions (root read/write only)
sudo chmod 600 /swapfile

# 3. Format as Linux Swap partition
sudo mkswap /swapfile

# 4. Activate Swap
sudo swapon /swapfile

# 5. Persist swap across server reboots
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 6. Verify total active memory
free -h
swapon --show
```

### Step 2.4: Installing Official Docker Engine & Compose Plugin
```bash
# Install prerequisites
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Set up Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker engine and compose
sudo apt update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow non-root user to run Docker commands
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

---

## 3. Docker & Networking Architecture

When orchestrating multiple separate repositories (Frontend and Backend), use a shared **external Docker bridge network** so containers can resolve each other by container name without exposing internal ports to the internet.

```
                              [ Internet ]
                                   │
                                   ▼
                       [ Nginx Reverse Proxy ]
                       (Port 80 HTTP / 443 HTTPS)
                                   │
       ┌───────────────────────────┴───────────────────────────┐
       ▼                                                       ▼
[ Next.js Frontend ]                                  [ Backend Cluster ]
(frontend_container:3000)                             (api_replica_1, api_replica_2:5000)
       │                                                       │
       └─────────────────── app_network ───────────────────────┘
                                   │
                                   ▼
                           [ Redis / Database ]
```

### Step 3.1: Create the External Shared Docker Network
```bash
docker network create app_network
```

### Step 3.2: Clone Application Repositories
```bash
cd ~
git clone <BACKEND_REPOSITORY_URL>
git clone <FRONTEND_REPOSITORY_URL>
```

### Step 3.3: Securely Copy Environment Files (`.env`)
Never commit `.env` files to git. Transfer them directly via **SCP**:
```bash
# Run from local terminal:
scp -i /path/to/your-key.pem .env <USERNAME>@<YOUR_SERVER_IP>:~/path-to-backend/.env
scp -i /path/to/your-key.pem .env <USERNAME>@<YOUR_SERVER_IP>:~/path-to-frontend/.env
```

---

## 4. Custom Domain & DNS Setup

To route your domain to the cloud server, configure DNS records at your domain registrar (e.g., Namecheap, Cloudflare, GoDaddy):

### Required DNS Records:
| Record Type | Host | Target / Value | TTL | Description |
| :--- | :--- | :--- | :--- | :--- |
| **A Record** | `@` | `<YOUR_SERVER_IP>` | Automatic / 1 min | Routes apex domain (`example.com`) to VPS IP |
| **CNAME Record** | `www` | `example.com.` | Automatic / 1 min | Routes `www.example.com` to apex domain |

### Verifying DNS Propagation:
```bash
nslookup <YOUR_DOMAIN>
ping <YOUR_DOMAIN>
```

---

## 5. SSL / TLS Certificate Setup (Let's Encrypt & Certbot)

### Step 5.1: Install Certbot on the Host Machine
```bash
sudo apt update
sudo apt install -y certbot
```

### Step 5.2: Stop Any Process Using Port 80
Certbot standalone mode temporarily opens port 80 to complete the Let's Encrypt HTTP-01 domain ownership challenge:
```bash
# If an Nginx container is currently running, stop it:
docker stop <NGINX_CONTAINER_NAME>
```

### Step 5.3: Request the SSL/TLS Certificate
```bash
sudo certbot certonly --standalone \
  -d <YOUR_DOMAIN> \
  -d www.<YOUR_DOMAIN> \
  --agree-tos \
  -m <YOUR_ADMIN_EMAIL> \
  --non-interactive
```
* **Output files generated:**
  - Public Certificate Chain: `/etc/letsencrypt/live/<YOUR_DOMAIN>/fullchain.pem`
  - Private Encryption Key: `/etc/letsencrypt/live/<YOUR_DOMAIN>/privkey.pem`

### Step 5.4: Automate Certificate Renewal (Cron Job)
Let's Encrypt certificates are valid for 90 days. Set up automatic renewal:
```bash
sudo crontab -e
```
Add the following line:
```bash
0 3,15 * * * certbot renew --quiet --post-hook "docker restart <NGINX_CONTAINER_NAME>"
```

---

## 6. Unified Nginx Reverse Proxy Configuration

Nginx terminates TLS/SSL on Port 443, forces HTTP-to-HTTPS redirect on Port 80, and proxies traffic internally.

### Step 6.1: Mount Host Certificates into Nginx Container (`docker-compose.yml`)
```yaml
services:
  nginx:
    image: nginx:alpine
    container_name: app_nginx
    restart: unless-stopped
    ports:
      - "80:80"    # HTTP
      - "443:443"  # HTTPS
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro   # Read-only mount of host SSL certificates
    networks:
      - app_network
```

### Step 6.2: Production `nginx.conf` Template
```nginx
# 1. HTTP Server - Redirect all unencrypted traffic to HTTPS
server {
    listen 80;
    server_name <YOUR_DOMAIN> www.<YOUR_DOMAIN>;
    return 301 https://$host$request_uri;
}

# 2. HTTPS Server - Secure SSL & Microservices Gateway
server {
    listen 443 ssl;
    http2 on;
    server_name <YOUR_DOMAIN> www.<YOUR_DOMAIN>;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/<YOUR_DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<YOUR_DOMAIN>/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Route 1: Frontend Application
    location / {
        proxy_pass http://<FRONTEND_CONTAINER_NAME>:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Route 2: Backend REST API Gateway
    location /api/ {
        proxy_pass http://<BACKEND_CONTAINER_NAME>:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Route 3: Real-Time WebSockets
    location /socket.io/ {
        proxy_pass http://<BACKEND_CONTAINER_NAME>:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

---

## 7. Environment Configuration & OAuth

### Step 7.1: OAuth Cloud Console Setup (Google / GitHub)
In your OAuth provider console (e.g. Google Cloud Console):
1. **Authorised JavaScript origins:**
   - `http://localhost:5000` (Local Backend)
   - `http://localhost:3000` (Local Frontend)
   - `https://<YOUR_DOMAIN>` (Production Domain)
   - `https://www.<YOUR_DOMAIN>` (Production WWW)

2. **Authorised redirect URIs:**
   - `http://localhost:5000/api/auth/callback/google`
   - `https://<YOUR_DOMAIN>/api/auth/callback/google`
   - `https://www.<YOUR_DOMAIN>/api/auth/callback/google`

### Step 7.2: Updating Production `.env` via Stream Editor (`sed`)
Modify environment variables cleanly from the terminal without interactive text editors:
```bash
# Update Backend Environment
sed -i 's|BETTER_AUTH_URL=.*|BETTER_AUTH_URL=https://<YOUR_DOMAIN>|g' ~/backend/.env
sed -i 's|GOOGLE_CALLBACK_URL=.*|GOOGLE_CALLBACK_URL=https://<YOUR_DOMAIN>/api/auth/callback/google|g' ~/backend/.env
sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=https://<YOUR_DOMAIN>|g' ~/backend/.env

# Update Frontend Environment
sed -i 's|NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=https://<YOUR_DOMAIN>/api/v1|g' ~/frontend/.env
sed -i 's|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://<YOUR_DOMAIN>/api/v1|g' ~/frontend/.env
```

---

## 8. Automated CI/CD Dual Deployment (Jenkins)

Automate continuous delivery so code pushes to GitHub trigger testing and rolling deployment both locally and to the remote VPS:

### Declarative Pipeline Stage Example (`Jenkinsfile`):
```groovy
stage('Dual Production Deployment') {
    steps {
        // Step 1: Deploy to Local Docker Cluster
        sh '''
            docker compose up -d --build --scale api=3 --remove-orphans
        '''

        // Step 2: Trigger Rolling Deployment on Remote Cloud VPS via SSH
        sh '''
            ssh -o StrictHostKeyChecking=no -i /var/jenkins_home/.ssh/server_key.pem <USERNAME>@<YOUR_SERVER_IP> "
                cd ~/backend &&
                git pull origin main &&
                docker compose up -d --build --scale api=1 --remove-orphans
            "
        '''
    }
}
```

---

## 9. Operational Cheat Sheet (Scaling, Logs & Monitoring)

### Monitoring Server Resources
```bash
# Check physical RAM & active Swap usage
free -h

# Check live CPU, memory, and I/O usage per container
docker stats

# Check disk storage
df -h
```

### Scaling API Replicas on High Traffic
```bash
# Scale to 3 replicas instantly during traffic surges
docker compose up -d --scale api=3 --no-recreate

# Scale down to 1 replica to conserve RAM
docker compose up -d --scale api=1 --no-recreate
```

### Checking Live Logs
```bash
# Stream API logs
docker logs -f <BACKEND_CONTAINER> --tail 50

# Stream Nginx routing & SSL logs
docker logs -f <NGINX_CONTAINER> --tail 50

# Stream Frontend logs
docker logs -f <FRONTEND_CONTAINER> --tail 50
```

### Stack Management
```bash
# Restart Nginx without downtime
docker restart <NGINX_CONTAINER>

# Rebuild a single container after code updates
docker compose up -d --build <SERVICE_NAME>
```

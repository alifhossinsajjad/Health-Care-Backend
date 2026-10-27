# 🤝 Contributing & Deployment Guideline

Thank you for your interest in contributing to the **Healthcare Telemedicine Platform**! Whether you are reporting an issue, proposing new features, or deploying the production microservices, this guide covers everything you need.

---

## 📑 Quick Navigation

- [1. Code of Conduct](#1-code-of-conduct)
- [2. Branching & Git Workflow](#2-branching--git-workflow)
- [3. Local Development Setup](#3-local-development-setup)
- [4. Docker & Multi-Container Architecture](#4-docker--multi-container-architecture)
- [5. Production VPS Deployment Playbook](#5-production-vps-deployment-playbook)
  - [5.1 Server Sizing & Swapfile](#51-server-sizing--swapfile)
  - [5.2 Docker Engine & Compose](#52-docker-engine--compose)
  - [5.3 DNS & SSL Setup (Certbot)](#53-dns--ssl-setup-certbot)
  - [5.4 Nginx Reverse Proxy Gateway](#54-nginx-reverse-proxy-gateway)
  - [5.5 Cloudflare AI Gateway (Gemini Geo-Bypass)](#55-cloudflare-ai-gateway-gemini-geo-bypass)
  - [5.6 Automated Jenkins CI/CD Dual Pipeline](#56-automated-jenkins-cicd-dual-pipeline)
- [6. Pull Request & Commit Conventions](#6-pull-request--commit-conventions)

---

## 1. Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

---

## 2. Branching & Git Workflow

We adhere to an enterprise **GitHub Flow** branching model:

```
[feature/xxx or fix/xxx] ──── PR ────> [dev] ──── Verified PR ────> [main] (Production)
```

1. **`main`**: Production-ready branch. Always deployable. Protected branch.
2. **`dev`**: Active staging/integration branch for upcoming releases.
3. **`feature/<name>`** or **`fix/<name>`**: Feature and bugfix branches branched off `dev`.

### Step-by-Step Workflow:
1. **Fork** or clone the repository:
   ```bash
   git clone https://github.com/alifhossinsajjad/Health-Care-Backend.git
   cd Health-Care-Backend
   ```
2. Create your feature branch from `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/amazing-feature
   ```
3. Commit your changes following [Conventional Commits](#6-pull-request--commit-conventions).
4. Push to your branch and open a **Pull Request (PR)** against `dev`.

---

## 3. Local Development Setup

### Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **Package Manager**: `npm`
- **PostgreSQL**: v15+ with `pgvector` extension enabled
- **Redis**: v7.x (Local or Docker)

### Step 3.1: Install Dependencies
```bash
npm install --legacy-peer-deps
```

### Step 3.2: Configure Environment Variables
Copy `.env.example` to `.env` and fill in required values:
```bash
cp .env.example .env
```

Key environment configurations:
```ini
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:password@localhost:5432/healthcare_db?schema=public"
REDIS_URL="redis://localhost:6379"

# Auth & Better-Auth
BETTER_AUTH_SECRET="your-strong-auth-secret"
BETTER_AUTH_URL="http://localhost:5000"

# AI Assistant (Google Gemini RAG)
GEMINI_API_KEY="your-gemini-api-key"
# Optional proxy/gateway (e.g. Cloudflare AI Gateway for restricted regions)
GEMINI_BASE_URL=""

# Stripe Payment
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

### Step 3.3: Database Migrations & Seeding
```bash
# Generate Prisma Client & Run Migrations
npx prisma generate
npx prisma migrate dev --name init

# Seed Database with Specialties, Doctors, & Super Admin
npx tsx src/app/db/seed.ts
```

### Step 3.4: Run the Development Server
```bash
npm run dev
```
The server will boot with hot-reload at `http://localhost:5000`.

---

## 4. Docker & Multi-Container Architecture

For running the full stack locally via Docker:

```bash
# Boot Redis, Backend API, and Nginx
docker compose up --build -d

# View real-time aggregated logs
docker compose logs -f

# Stop all containers
docker compose down
```

---

## 5. Production VPS Deployment Playbook

This playbook documents the exact production deployment architecture running live on cloud Virtual Private Servers (Azure, AWS, or DigitalOcean).

### 5.1 Server Sizing & Swapfile
- **Recommended VM**: 2 vCPU, 2GB–4GB RAM (e.g. Azure `Standard_B2als_v2`).
- **Create 4GB Swapfile** (Prevents Out-Of-Memory errors during container builds):
  ```bash
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  free -h
  ```

### 5.2 Docker Engine & Compose
Install Docker CE on Ubuntu:
```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

### 5.3 DNS & SSL Setup (Certbot)
1. **DNS Mapping**: Point `@` (A record) to `<YOUR_SERVER_IP>` and `www` (CNAME) to `yourdomain.com.`.
2. **Issue SSL Certificates**:
   ```bash
   sudo apt install -y certbot
   sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com --agree-tos -m admin@yourdomain.com --non-interactive
   ```
3. **Automate Certificate Renewal**:
   ```bash
   sudo crontab -e
   # Add daily renewal probe:
   0 3,15 * * * certbot renew --quiet --post-hook "docker restart healthcare_nginx"
   ```

### 5.4 Nginx Reverse Proxy Gateway
Nginx terminates TLS/SSL on Port 443, enforces HTTPS, and load-balances traffic internally across containers:
- `location /` ➔ Next.js Frontend (`healthcare_frontend:3000`)
- `location /api/` ➔ Backend Express Cluster (`backend_cluster:5000`)
- `location /socket.io/` ➔ WebRTC & Real-time Socket.io signaling
- `location /webhook` ➔ Stripe Webhook handler

Mount host certificates into `docker-compose.yml`:
```yaml
volumes:
  - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 5.5 Cloudflare AI Gateway (Gemini Geo-Bypass)
Google Gemini API blocks calls originating from certain cloud regions (e.g. Hong Kong / China). We route Gemini calls through **Cloudflare AI Gateway**:
1. Create a gateway in Cloudflare Dashboard: `gemini-gateway` (Google AI Studio provider).
2. Set in production `.env`:
   ```ini
   GEMINI_BASE_URL="https://gateway.ai.cloudflare.com/v1/<CLOUDFLARE_ACCOUNT_ID>/gemini-gateway/google-ai-studio"
   ```
3. Our backend SDK auto-detects `GEMINI_BASE_URL` in [embedding.service.ts](./src/app/modules/ai/embedding.service.ts) and routes calls through US edge proxies.

### 5.6 Automated Jenkins CI/CD Dual Pipeline
Our production pipeline (`Jenkinsfile`) automates testing and deployment:
1. **Checkout & Dependencies**: Pulls latest commit, runs `npm install`, and generates Prisma client.
2. **Quality Gates**: Runs `npm run lint` and TypeScript strict checks (`npx tsc --noEmit`).
3. **Docker Build**: Builds and tags immutable container images.
4. **Remote Deployment over SSH**: Pulls updates on VPS, rebuilds images, recreates containers, and runs HTTP healthcheck probes (`/health`).

---

## 6. Pull Request & Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

| Prefix | Usage | Example |
| :--- | :--- | :--- |
| `feat:` | A new feature | `feat(auth): add Google OAuth login with Better-Auth` |
| `fix:` | A bug fix | `fix(nginx): route internal SSR calls on port 80` |
| `docs:` | Documentation changes | `docs: add contributing and deployment guideline` |
| `refactor:` | Code change that neither fixes a bug nor adds a feature | `refactor(ai): modularize vector similarity search` |
| `perf:` | A code change that improves performance | `perf(stats): parallelize dashboard queries with Promise.all` |
| `chore:` | Build tasks, configs, package updates | `chore(deps): update prisma to latest version` |

### Pre-PR Checklist:
- [ ] Code compiles without errors: `npx tsc --noEmit`
- [ ] Code passes linter: `npm run lint`
- [ ] No sensitive credentials, keys, or `.env` files are tracked in git.
- [ ] Meaningful commit messages following conventional commits.

---

Thank you for contributing to make healthcare accessible, intelligent, and scalable! 🏥✨

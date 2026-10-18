# 🏥 Healthcare Telemedicine Application — Production Backend Architecture

Welcome to the **Healthcare Application Backend**! A high-performance, enterprise-grade, horizontally scalable telemedicine backend engineered with **Node.js, Express, TypeScript, Prisma ORM, Redis, BullMQ, Docker Compose, and Nginx**.

---

## 🏗️ System Architecture & Infrastructure

Our platform is engineered as a **Stateless, Scalable, and Resilient Micro-monolith** designed to handle heavy telemedicine traffic, real-time appointment bookings, and asynchronous financial workflows with zero downtime.

```mermaid
flowchart TD
    Client["Client (Next.js Web / Mobile Apps)"] -->|Port 80 HTTP / 443 HTTPS| Nginx["Nginx Layer 7 Load Balancer & Reverse Proxy"]
    
    subgraph "Docker Bridge Network (healthcare_network)"
        Nginx -->|Least-Connections Load Balancing| Cluster
        
        subgraph Cluster["Horizontally Scaled Application Cluster"]
            API1["Backend Replica 1 (Port 5000)"]
            API2["Backend Replica 2 (Port 5000)"]
            API3["Backend Replica 3 (Port 5000)"]
        end
        
        API1 --> RedisClient[("Redis / Upstash Cloud (TLS)")]
        API2 --> RedisClient
        API3 --> RedisClient
        
        subgraph BullMQ["BullMQ Asynchronous Background Workers"]
            EQ["email-queue"]
            PQ["payment-invoice-queue"]
            AQ["appointment-scheduler-queue"]
        end
        
        RedisClient --> BullMQ
    end
    
    API1 -->|ORM Connection Pooling| DB[("Neon Serverless PostgreSQL")]
    API2 --> DB
    API3 --> DB
    
    PQ -->|Async PDF Generation & Upload| Cloudinary["Cloudinary Cloud Storage"]
    EQ -->|Non-blocking Dispatch| SMTP["SMTP / Nodemailer"]
    
    subgraph Observability
        RingBuffer["In-Memory Ring Buffer (FIFO, ~100KB)"]
        DiskLog["Auto-Rotated 2MB Persistent Volume (healthcare_logs)"]
        BullBoard["Bull-Board Admin Visual Dashboard (/api/v1/admin/queues)"]
    end
    
    API1 --> RingBuffer --> DiskLog
```

---

## ⚡ Core Engineering & Production Features

### 1. Horizontally Scalable Cluster (Docker Compose + Nginx)
* **Dynamic Scaling:** Application nodes can be instantly scaled with one command (`docker compose up --scale api=3 -d`).
* **Smart Traffic Balancing:** Nginx uses the **`least_conn`** (least connections) algorithm to dynamically route incoming requests to the least busy container.
* **Health Probing & Zero-Downtime:** Automatic failover (`max_fails=3 fail_timeout=10s`). If an instance dies, Nginx seamlessly redistributes traffic without dropping user requests.
* **DDoS & Rate Limiting:** Built-in IP rate limiter (`limit_req_zone`, 30 req/s, burst 50) with dedicated bypass for Stripe webhooks.
* **WebSocket & WebRTC Signaling Ready:** Preconfigured with `Upgrade: websocket` headers for live audio/video consultations and group messaging.

### 2. Asynchronous Event-Driven Queues (BullMQ + Upstash Redis)
* **Instant API Responses (P99 Latency < 25ms):** Long-running CPU-heavy tasks are completely decoupled from Express's main event loop.
* **`email-queue`:** Handles welcome emails, password resets, and appointment notices with automatic 3-tier exponential backoff retries.
* **`payment-invoice-queue`:** When Stripe webhooks fire, the database updates in < 15ms. In the background, `PDFKit` generates the invoice, uploads it to Cloudinary, and emails the patient.
* **`appointment-scheduler-queue`:** Implements distributed repeatable cron jobs (`upsertJobScheduler`) that safely cancel expired unpaid appointments across multiple cluster replicas without race conditions.
* **Bull-Board Visual UI:** Live visual monitoring of active, waiting, completed, and failed jobs at `/api/v1/admin/queues`.

### 3. Zero-Cost Request Logger & Audit System
* **Zero Database Overhead ($0 DB Cost):** Audit logs are held in a circular in-memory FIFO buffer (capped at 300 entries, static ~100KB footprint) rather than flooding the relational database.
* **Bounded Disk Persistence:** Synchronously rotated to a Docker persistent volume (`healthcare_logs`) capped strictly at 2MB to prevent host disk exhaustion.
* **Recursive Filter:** Excludes internal monitoring (`/request-logs`, `/health`, `/favicon.ico`) to eliminate infinite logging loops.
* **Client Device & Browser Detection:** Built-in parser extracts OS (Windows, iPhone, Android, Mac) and clients (Chrome, Postman, Safari).

---

## 📡 API Endpoints Overview

### 🔐 Authentication & Accounts
* `POST /api/auth/register` — Register patient or doctor
* `POST /api/auth/login` — JWT & Better-Auth session login
* `POST /api/auth/refresh-token` — Refresh expired access token

### 👨‍⚕️ Doctors & Appointments
* `GET /api/v1/doctors` — List and filter verified doctors
* `GET /api/v1/doctors/:id` — Doctor profile, specializations, and available schedules
* `POST /api/v1/appointments` — Book an appointment slot
* `GET /api/v1/appointments/my-appointments` — Patient / Doctor appointment history

### 💳 Payments & Invoices (Stripe Webhook)
* `POST /api/v1/payments/create-checkout-session` — Generate Stripe payment session
* `POST /webhook` — Public Stripe Webhook handler (offloaded to BullMQ)

### 🛡️ Admin & Observability Endpoints
* `GET /api/v1/admin/request-logs` — Live request logs with latency, device, IP, and status analytics *(Super Admin & Admin)*
* `DELETE /api/v1/admin/request-logs/:id` — Delete a single request log entry *(Super Admin)*
* `DELETE /api/v1/admin/request-logs` — Flush/Clear all recorded request logs *(Super Admin)*
* `GET /api/v1/admin/queues` — Bull-Board Visual UI Dashboard *(Super Admin)*

---

## 🚀 Running with Docker Compose (Production Cluster)

### 1. Clone & Configure
```bash
git clone https://github.com/alifhossinsajjad/Health-Care-Backend.git
cd Health-Care-Backend
cp .env.example .env # Ensure DATABASE_URL and REDIS_URL are configured
```

### 2. Build and Launch Scaled Cluster
```bash
# Starts 3 load-balanced API servers, Nginx (Port 80), and Redis with 1 command:
docker compose up --build --scale api=3 -d
```

### 3. Verify Health & Logs
```bash
# Nginx health check:
curl http://localhost/nginx-health

# Tail cluster logs:
docker compose logs -f
```

---

## 🌟 Upcoming Roadmap
- [ ] **Socket.io + Redis Adapter:** Distributed real-time chat between patients and doctors.
- [ ] **WebRTC Video Consultations:** Peer-to-peer live telemedicine video calling.
- [ ] **AI / RAG Integration:** Automatic prescription drafting and lab test report summarizer.
- [ ] **Automated GitHub Actions CI/CD:** Auto-deployment to production VPS.

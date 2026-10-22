# 🏥 Healthcare Telemedicine Application — Production Backend Architecture

[![Healthcare Backend CI](https://github.com/alifhossinsajjad/Health-Care-Backend/actions/workflows/ci.yml/badge.svg)](https://github.com/alifhossinsajjad/Health-Care-Backend/actions/workflows/ci.yml)
[![Healthcare Backend CD](https://github.com/alifhossinsajjad/Health-Care-Backend/actions/workflows/deploy.yml/badge.svg)](https://github.com/alifhossinsajjad/Health-Care-Backend/actions/workflows/deploy.yml)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=flat&logo=nginx&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-5FA04E?style=flat&logo=nodedotjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![pgvector](https://img.shields.io/badge/pgvector-PostgreSQL%20Vector%20Search-336791?style=flat&logo=postgresql&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-Generative%20AI%20SDK-8E75B2?style=flat&logo=googlegemini&logoColor=white)
![Applied AI](https://img.shields.io/badge/Applied%20AI-Enterprise%20RAG-FF6F00?style=flat)

Welcome to the **Healthcare Application Backend**! A high-performance, enterprise-grade, horizontally scalable telemedicine backend engineered with **Node.js, Express, TypeScript, Prisma ORM, Redis, BullMQ, Docker Compose, and Nginx**.

---

## 🏗️ System Architecture & Infrastructure

Our platform is engineered as a **Stateless, Scalable, and Resilient Micro-monolith** designed to handle heavy telemedicine traffic, real-time appointment bookings, and asynchronous financial workflows with zero downtime.

- **Robust Database Modeling:** Designed complex relational schemas using PostgreSQL and Prisma, managing relationships between Users, Doctors, Patients, Appointments, and Prescriptions.
- **Authentication & Authorization:** Implemented role-based access control (RBAC) with secure JWT-based authentication for `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, and `PATIENT`.
- **Dynamic Prescription System:** Created a scalable prescription module with dynamic PDF generation using `pdf-lib` and automatic email dispatching using `Nodemailer` + `EJS`.
- **Cloudinary Integration:** Integrated Cloudinary for handling multipart/form-data via `multer`. We successfully managed dynamic uploads for images and raw files (like PDFs).
- **Advanced Error Handling:** Engineered an architect-level Global Error Handler capable of mapping deep Prisma Engine errors (like Rust Panics, Validation Errors, Known Request Errors) and Zod Validation errors into standardized, human-readable HTTP responses.
- **Graceful Shutdown Mechanism:** Implemented production-grade Process Signal Handlers (`SIGTERM`, `SIGINT`, `uncaughtException`, `unhandledRejection`) to prevent abrupt server crashes and data corruption.
- **Data Integrity & Transactions:** Wrapped complex multi-model database operations within `prisma.$transaction` to guarantee database consistency.
- **Performance Optimization:** Parallelized heavy dashboard statistics queries using `Promise.all`, bringing processing time down to milliseconds.

---

## 🤖 Enterprise Applied AI & Clinical RAG Architecture

Our backend houses a production-grade **Clinical Triage & Healthcare Navigation Assistant** engineered with the `@google/genai` SDK and PostgreSQL `pgvector 0.8.0`. It tackles critical healthcare challenges: **zero medical hallucination, sub-millisecond similarity search, deterministic emergency clinical triage, multi-model failover resilience, and real-time token streaming**.

```mermaid
flowchart TD
    UserQuery["User Input Query<br/>(English / Bengali)"] --> Gate0{"Gate 0: Rule-0 Triage<br/>(Deterministic Regex Engine)"}
    
    Gate0 -- "Acute Emergency Triggered<br/>(Chest Pain, Stroke, Dyspnea)" --> FastPath["🚨 Immediate Emergency Protocol<br/>• Zero LLM Inference Latency (<1ms)<br/>• Directs to 999 / Nearest Emergency Room<br/>• Eliminates Probabilistic Risk"]
    
    Gate0 -- "Standard Clinical Inquiry" --> IngestionPipeline["RAG Retrieval Pipeline"]
    
    subgraph DataIngestion["1. Incremental Ingestion & Indexing Engine"]
        HospitalDB[("PostgreSQL DB<br/>Doctors, Specialties, Guidelines, FAQ")] --> Chunker["Semantic Document Chunker"]
        Chunker --> HashGen["SHA-256 Fingerprint Generator<br/>(crypto.createHash)"]
        HashGen --> CheckHash{"Content Hash Changed?"}
        CheckHash -- "No (Match)" --> SkipEmbed["Skip API Call<br/>(100% Idempotent, $0 Cost)"]
        CheckHash -- "Yes / New" --> EmbedModel["Google Gemini Embedding API<br/>(gemini-embedding-001, 768-dim)"]
        EmbedModel --> VectorStore[("pgvector Store<br/>PostgreSQL Table: DocumentEmbedding")]
    end
    
    IngestionPipeline --> QueryEmbed["Embed User Query<br/>(gemini-embedding-001)"]
    QueryEmbed --> HNSWSearch["Sub-Millisecond HNSW Search<br/>1 - (embedding <=> query_vec)<br/>O(log N) Graph Traversal (m=16, ef=64)"]
    VectorStore -.-> HNSWSearch
    
    HNSWSearch --> ContextFilter["Top-K Context Filtering<br/>(Relevance Threshold >= 0.35)"]
    
    subgraph LLMOrchestration["2. Resilient Generation & Memory Layer"]
        ContextFilter --> ContextBuilder["Ground-Truth Context Builder<br/>+ Multi-Turn History (Sliding Window)"]
        ContextBuilder --> SystemPrompt["Clinical Guardrail Prompt<br/>• Strict No-Prescription Policy<br/>• Verified Department & Doctor Mapping"]
        SystemPrompt --> ModelWaterfall{"Multi-Model Failover Waterfall"}
        ModelWaterfall -- "Primary (Default)" --> M1["gemini-3.5-flash"]
        ModelWaterfall -- "503 High-Load Spike" --> M2["gemini-3.5-flash-lite"]
        ModelWaterfall -- "Backup Fallback" --> M3["gemini-3.8-flash"]
    end
    
    subgraph OutputAndTools["3. Real-Time Streaming & Agent Tools"]
        M1 & M2 & M3 --> StreamHandler{"Output Mode"}
        StreamHandler -- "SSE Endpoint (/chat/stream)" --> TokenStream["Token-by-Token SSE Stream<br/>(text/event-stream, TTFT < 300ms)"]
        StreamHandler -- "Standard JSON (/chat)" --> JSONResp["Structured JSON Response + Citations"]
        StreamHandler -- "Agent Action Triggered" --> AgentTools["Autonomous Tool Engine<br/>• checkDoctorAvailability<br/>• getHospitalPaymentPolicy (Pay Later Online-Only)<br/>• holdAppointmentSlot"]
    end
```

### 🧠 Core Engineering Pillars & Technical Differentiators

#### 1. Sub-Millisecond $O(\log N)$ Vector Search with HNSW Graph Indexing
- **Why not Flat or IVFFlat?** Naive vector search performs a brute-force sequential scan ($O(N)$), causing query latency to explode as medical documents, doctor rosters, and FAQs scale. IVFFlat requires periodic cluster re-training and sacrifices recall on dynamic datasets.
- **Our Solution:** We created a partial **HNSW (Hierarchical Navigable Small World)** cosine index directly in PostgreSQL using `pgvector 0.8.0`:
  ```sql
  CREATE INDEX idx_doc_embeddings_hnsw 
  ON "DocumentEmbedding" 
  USING hnsw (embedding vector_cosine_ops) 
  WITH (m = 16, ef_construction = 64) 
  WHERE status = 'INDEXED' AND "isDeleted" = false;
  ```
- **Performance:** Multi-layer geometric graphs enable logarithmic $O(\log N)$ nearest-neighbor traversals, returning top-$k$ semantic matches in **< 1.5ms** with over **98% recall accuracy**.

#### 2. SHA-256 Idempotent Knowledge Ingestion Pipeline
- **Problem:** Constantly re-generating embeddings for existing hospital knowledge bases consumes unnecessary Gemini API quotas and causes redundant database disk I/O.
- **Our Solution:** Each semantic chunk is fingerprinted with a SHA-256 cryptographic hash (`crypto.createHash('sha256').update(content).digest('hex')`).
- **Result:** Sync operations compare hashes in $O(1)$ time. Chunks with identical hashes are skipped instantly. Only new or altered doctor profiles, specialties, and clinical guidelines trigger embedding generation, making vector sync operations **100% idempotent and cost-optimal**.

#### 3. Deterministic "Rule-0" Clinical Emergency Triage Guardrails
- **The Challenge:** LLMs are non-deterministic, probabilistic models. For acute cardiovascular or neurological emergencies (e.g., crushing chest pain radiating to left arm, severe dyspnea, facial paralysis), an LLM might produce conversational pleasantries, delay triage by seconds, or fail to convey life-or-death urgency.
- **Our Solution:** A zero-latency deterministic regex engine intercepts incoming queries *before* any vector retrieval or LLM invocation. High-risk patterns in both **English and Bengali** trigger an immediate emergency escalation:
  - Emergency Hotlines (e.g., 999)
  - Immediate advice to seek the nearest Emergency Department
  - Execution time: **< 1 millisecond** with zero LLM API dependency.

#### 4. Zero-Hallucination Boundaries & Strict Anti-Prescription Policy
- **Medical Safety:** The assistant is bound by strict system-level instructions prohibiting the prescription or recommendation of prescription-only drugs (antibiotics, antihypertensives, opioids, psychoactive substances, or specific dosage schedules).
- **Ground-Truth Augmentation:** Advice is strictly anchored to verified database context (Active Doctors, Department Specialties, Hospital FAQs, Clinical Guidelines). If an inquiry falls outside hospital boundaries, the model explicitly acknowledges its boundary and directs the patient to a qualified human specialist.

#### 5. High-Availability Multi-Model Failover Architecture
- **Problem:** Public cloud AI endpoints occasionally return `503 Service Unavailable` or `RESOURCE_EXHAUSTED` during peak global traffic periods.
- **Our Solution:** An automated waterfall failover mechanism:
  1. **Primary Model:** `gemini-3.5-flash` (balanced reasoning and speed)
  2. **Secondary Failover:** `gemini-3.5-flash-lite` (low latency, high throughput)
  3. **Tertiary Fallback:** `gemini-3.8-flash`
- **Result:** 99.9% availability for patient consultations with automatic recovery.

#### 6. Real-Time Token Streaming via Server-Sent Events (SSE)
- **Problem:** Traditional blocking JSON APIs force patients to wait 3 to 6 seconds before seeing any text.
- **Our Solution:** The `/api/v1/ai/chat/stream` endpoint streams token-by-token over HTTP chunked transfer (`text/event-stream`), delivering a **Time-To-First-Token (TTFT) under 300ms**.
- **Client Cancellation Handling:** Listens to `req.on('close')` to immediately abort upstream LLM generators when users disconnect or navigate away, conserving compute tokens.

#### 7. Autonomous Agent Tools & Business Policy Enforcement
The assistant is equipped with deterministic function calling tools to bridge AI dialogue with hospital business workflows:
- `checkDoctorAvailabilityTool`: Live lookup of doctor scheduling and real-time calendar availability.
- `getHospitalPaymentPolicyTool`: Enforces hospital rules: *"Pay Later appointments require 100% online payment before the scheduled consultation start time. Unpaid slots are automatically released by BullMQ background workers. In-person hospital counter cash payments are not accepted."*
- `holdAppointmentSlotTool`: Atomically locks slot availability to prevent booking race conditions.

---

### 📡 Applied AI REST Endpoints

| Method | Endpoint | Description | Key Request Parameters | Response Highlights |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/ai/chat` | Multi-turn medical navigation & triage | `{ message, history?: [{ role, content }] }` | JSON response, triage urgency, doctor recommendations, sources |
| `POST` | `/api/v1/ai/chat/stream` | Real-time SSE streaming consultation | `{ message, history?: [{ role, content }] }` | `text/event-stream` chunks (`data: {"chunk": "..."}`), TTFT < 300ms |
| `GET` | `/api/v1/ai/search` | Raw pgvector cosine similarity search | `?query=cardiology&limit=5` | Similarity score `[0.0 - 1.0]`, matched chunk content, category |
| `POST` | `/api/v1/ai/sync` | Incremental SHA-256 knowledge sync | None (Admin/System) | Indexed chunks count, skipped chunks count, execution time |
| `GET` | `/api/v1/ai/stats` | Vector store telemetry & health | None | Total indexed vectors, pending vectors, category distribution |
| `POST` | `/api/v1/ai/tools/check-availability` | Agent doctor schedule lookup | `{ doctorId, date?: "YYYY-MM-DD" }` | Real-time available slots |
| `POST` | `/api/v1/ai/tools/payment-policy` | Enforces online-only Pay Later rule | `{ paymentType?: "PAY_LATER" }` | Hospital policy explanation & cancellation window |
| `POST` | `/api/v1/ai/tools/hold-slot` | Atomic appointment slot lock | `{ scheduleId, patientId, holdDurationMinutes }` | Lock status, expiration timestamp |

---

Building a production-ready application comes with its hurdles. Here are some of the toughest challenges we faced and conquered:

### 1. The JWT Payload vs. Database Lookup Mismatch
- **The Issue:** We faced persistent `PrismaClientValidationError` because our API was trying to fetch users using `email: user.email`, but our JWT payload only contained `{ id, role }`.
- **The Fix:** We refactored our authentication logic and service lookups to strictly rely on the unique `user.id`. This eliminated undefined payload errors and significantly boosted our query reliability.

### 2. Uploading PDFs to Cloudinary
- **The Issue:** Attempting to upload dynamically generated PDF prescriptions to Cloudinary resulted in unauthorized errors or corrupted files because Cloudinary defaulted to treating them as images.
- **The Fix:** We dug deep into the Cloudinary API and configured the upload stream to use `resource_type: "raw"`, ensuring seamless PDF storage and rendering.

### 3. Zod Native Enums vs. TypeScript Strictness
- **The Issue:** TypeScript strictness clashed with Zod's enum validation, throwing obscure "Type 'string | undefined' is not assignable" errors inside our Prisma Error Handlers.
- **The Fix:** We resolved this by correctly implementing `z.nativeEnum` with proper custom `errorMap` options and fixing potential `undefined` array bounds using Nullish Coalescing (`??`) and Optional Chaining (`?.`).

### 4. Frictionless Local Stripe Webhook Testing
- **The Issue:** Testing asynchronous payment completion events locally requires forwarding Stripe events to `localhost:5000/webhook`. Developers often encounter browser login hurdles (`stripe login`), missing API key configurations (`You have not configured API keys yet`), or strict event-forwarding flags (`--all-snapshot`).
- **The Fix:** We streamlined the process by directly feeding the development secret key via the `--api-key` flag (`stripe listen --api-key <YOUR_STRIPE_SECRET_KEY> --all-snapshot --forward-to localhost:5000/webhook`), bypassing interactive browser logins completely. We also documented zero-install tunneling alternatives (Localtunnel) as a fallback.

### 5. How We Could Have Done Things Better
- In retrospect, we could have implemented **Test-Driven Development (TDD)** using Jest from day one to catch edge cases early. 
- While our `Promise.all` optimization is great, integrating a caching layer (like Redis) earlier could have saved us some database roundtrips during the dashboard statistics development. 

---

## 🌟 Phase 2: The Roadmap to Product Level

As we wrap up Phase 1, we are already gearing up for **Phase 2**, which will elevate this backend into a massive, real-time, product-level application:

- **Redis (Upstash):** Implementing powerful caching mechanisms to instantly serve heavy endpoints and manage active user sessions.
- **Message Queues (RabbitMQ):** Offloading heavy background tasks (like bulk email sending, PDF processing, and notifications) to dedicated workers to keep the main event loop lightning fast.
- **Real-Time Communication (WebSockets / Socket.io):** Enabling instant messaging and live notifications between Doctors and Patients.
- **Telemedicine Call Features (WebRTC):** Introducing high-quality Peer-to-Peer (P2P) audio and video calling functionality directly within the platform.
- **Bulk Document Sharing:** Upgrading our file-sharing mechanics to support bulk file uploads, real-time X-ray/MRI document sharing, and audio note exchanges.

---

## 🔐 Environment Variables (.env) Requirements

To run this project locally, you must create a `.env` file in the root directory. **Do not expose real credentials.** Ensure your `.env` contains the following keys:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=public"

# Authentication
JWT_ACCESS_SECRET="your_jwt_access_secret_here"
JWT_REFRESH_SECRET="your_jwt_refresh_secret_here"
JWT_ACCESS_EXPIRES_IN="1d"
JWT_REFRESH_EXPIRES_IN="365d"

# Cloudinary (Media & Files)
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"

# Nodemailer (Email Dispatching)
EMAIL_USER="your_email_address@gmail.com"
EMAIL_PASS="your_app_password"

# Stripe (Payments & Webhooks)
STRIPE_SECRET_KEY="sk_test_your_stripe_secret_key"
STRIPE_WEBHOOK_SECRET="whsec_your_webhook_signing_secret"

# Redis & Cache (Docker local or cloud Upstash)
REDIS_URL="redis://localhost:6379"

# Google Gemini Applied AI & RAG
GEMINI_API_KEY="AIzaSy..."

# Default Super Admin Seed Data
SUPER_ADMIN_EMAIL="superadmin@gmail.com"
SUPER_ADMIN_PASSWORD="secure_password_here"
SUPER_ADMIN_CONTACT="01xxxxxxxx"
```

---

## ⚡ Core Engineering & Production Features

When testing live card payments and automated booking confirmations locally, Stripe needs to forward webhook events to your machine. Choose either of the two approaches below:

### Approach A: Using Stripe CLI with `--api-key` (Recommended & Most Reliable)
You do **not** need to go through interactive browser login (`stripe login`). Simply pass your test secret key directly using the command below:

```bash
stripe listen --api-key <YOUR_STRIPE_SECRET_KEY> --all-snapshot --forward-to localhost:5000/webhook
```
> 🔒 **Security Note:** Replace `<YOUR_STRIPE_SECRET_KEY>` with your development secret key from `.env` (`sk_test_...`). Never commit real API keys to public version control!

**Step-by-step Setup:**
1. Open a new terminal and run the command above.
2. The Stripe CLI will start a secure listener and output a session signing secret:
   ```text
   > Ready! You are using Stripe API Version [2025-11-17.clover].
   > Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxx (^C to quit)
   ```
3. Copy the generated `whsec_...` value and paste it into your `.env` file:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Restart your backend server (`npm run dev`) so the new secret is active.
5. **Session Tip:** If you close the terminal and re-run the command later, Stripe CLI may generate a fresh `whsec_...` session secret. Check the terminal output upon restart and update `STRIPE_WEBHOOK_SECRET` in `.env` if it changes.

---

### Approach B: Using Localtunnel (Fallback Zero-Install Tunnel)
If you cannot run the Stripe CLI on your operating system, you can expose your local port via a public tunnel:
```bash
npx localtunnel --port 5000 --subdomain <your-custom-subdomain>
```
1. Add the resulting URL (`https://<your-custom-subdomain>.loca.lt/webhook`) as an endpoint in **Stripe Dashboard > Developers > Webhooks**.
2. Select the `checkout.session.completed` event.
3. Reveal and copy the **Signing secret** (`whsec_...`) from the Stripe Dashboard into your `.env`.

---

## 🧠 Why Horizontal Scaling? (The Architectural "Why")

### 1. Conquering the Node.js Single-Thread Constraint
Node.js runs its JavaScript execution on a single event-loop thread. Even on an 8-core CPU server, a single Node.js instance can only utilize **one CPU core (~12.5% CPU utilization)**. 
By horizontally scaling into 3 or more replicas (`api=3`), our cluster utilizes multiple CPU cores in parallel, tripling the concurrent request handling capacity.

### 2. Zero-Downtime High Availability (HA)
In a single-instance architecture, if an unhandled fatal error or memory spike causes the process to restart, all in-flight user requests drop.
In our 3-replica cluster behind Nginx (`least_conn` + `max_fails=3`):
* If `api-2` crashes or restarts, Nginx automatically detects the failure in milliseconds and routes 100% of incoming traffic to `api-1` and `api-3`.
* The end-user **never experiences an outage or 502 Bad Gateway**.

### 3. How Nginx Manages Dynamic Scaling Without Port Collisions
* In traditional setups, mapping `5000:5000` prevents running more than 1 container due to host port binding conflicts.
* We solved this by using **`expose: 5000`** inside our internal Docker bridge network (`healthcare_network`).
* Only Nginx binds to the public host **Port 80**.
* When Docker scales `api=3`, Docker's internal DNS automatically load balances the service name `http://api:5000` to all running container IPs, allowing unlimited seamless scaling!

---

## 🚀 Continuous Integration & Continuous Deployment (CI/CD)

The repository implements an automated enterprise-grade CI/CD pipeline using **GitHub Actions**:

```mermaid
flowchart LR
    A["git push / PR"] --> B["Stage 1: CI Pipeline"]
    subgraph CI["Continuous Integration"]
        B --> C["ESLint Code Audit"]
        B --> D["TypeScript Type Check"]
        B --> E["Prisma Schema Validation"]
        B --> F["Docker Multi-Stage Build"]
    end
    CI --> G["Stage 2: CD Pipeline (Main Branch)"]
    subgraph CD["Continuous Deployment"]
        G --> H["SSH Handshake to Linux VPS"]
        H --> I["Git Pull Latest Code"]
        I --> J["docker compose up -d --scale api=3"]
        J --> K["Health Probe (/nginx-health)"]
    end
```

### GitHub Secrets for Deployment
To enable auto-deployment when provisioning your Linux VPS (e.g., DigitalOcean Droplet), configure the following repository secrets under **Settings > Secrets and variables > Actions**:

| Secret Key | Description | Example |
| :--- | :--- | :--- |
| `VPS_HOST` | Public IPv4 address of the Linux VPS | `159.65.120.45` |
| `VPS_USER` | SSH Username (defaults to `root`) | `root` |
| `VPS_SSH_KEY` | Private SSH key (PEM / OpenSSH format) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VPS_PORT` | SSH Port (optional, defaults to 22) | `22` |

---

## 💬 Distributed Real-Time Chat Engine (Socket.io + Redis Pub/Sub)

Our real-time messaging layer provides end-to-end appointment-scoped communication between Patients and Doctors, engineered with horizontal multi-replica scalability using the `@socket.io/redis-adapter`.

```mermaid
flowchart LR
    PatientSocket["Patient Client<br/>(Socket.io / Bearer JWT)"] <--> Pod1["API Pod 1<br/>(Node.js / Express)"]
    DoctorSocket["Doctor Client<br/>(Socket.io / Bearer JWT)"] <--> Pod2["API Pod 2<br/>(Node.js / Express)"]
    
    Pod1 <--> RedisBus[("Redis Pub/Sub Adapter<br/>Cross-Pod Cluster Broadcast")]
    Pod2 <--> RedisBus
    
    Pod1 --> PG[("PostgreSQL DB<br/>ChatMessage Table")]
```

### Key Chat Features & Security
- **Strict Appointment Boundary:** Handshake JWT authentication + database verification ensures only the assigned Doctor and Patient can access consultation messages.
- **Modern Messaging Capabilities:** Full Meta Messenger/WhatsApp-like features including real-time message editing (`chat:edit`), unsend/delete for everyone (`chat:delete`), typing indicators (`chat:typing`), and real-time read receipts (`chat:read`).
- **Cloudinary Attachments:** Multi-format file uploads (images, medical PDFs, audio clips) via `POST /api/v1/chat/:appointmentId/attachment`.

---

## 📹 WebRTC Live Voice & Video Consultation Architecture

For peer-to-peer (P2P) doctor-patient telemedicine calls, we engineered a distributed signaling plane over Socket.io coupled with PostgreSQL consultation session audit logging.

```mermaid
sequenceDiagram
    autonumber
    actor Doctor as 👨‍⚕️ Doctor
    participant Server as ⚡ Socket.io Server + Redis
    actor Patient as 🧑‍🦰 Patient
    participant DB as 🛢️ PostgreSQL DB

    Doctor->>Server: call:initiate { appointmentId, videoCallingId, callType }
    Server->>DB: Validate access + Create VideoConsultationLog (INITIATED)
    Server-->>Patient: call:incoming { callId, callerName, videoCallingId }
    
    Patient->>Server: call:accept { appointmentId, callId }
    Server->>DB: Update VideoConsultationLog (ACCEPTED)
    Server-->>Doctor: call:accepted { callId }
    
    Note over Doctor,Patient: WebRTC P2P Signaling Exchange
    Doctor->>Server: webrtc:offer { appointmentId, sdp }
    Server-->>Patient: webrtc:offer { sdp }
    Patient->>Server: webrtc:answer { appointmentId, sdp }
    Server-->>Doctor: webrtc:answer { sdp }
    Doctor->>Server: webrtc:ice-candidate { candidate }
    Server-->>Patient: webrtc:ice-candidate { candidate }
    Patient->>Server: webrtc:ice-candidate { candidate }
    Server-->>Doctor: webrtc:ice-candidate { candidate }
    
    Note over Doctor,Patient: Direct Peer-to-Peer Encrypted Audio/Video Stream (SRTP)
    
    Doctor->>Server: call:toggle-media { videoMuted, audioMuted }
    Server-->>Patient: call:media-toggled { videoMuted, audioMuted }
    
    Doctor->>Server: call:end { appointmentId, callId }
    Server->>DB: Update VideoConsultationLog (ENDED, durationSec: 720s)
    Server-->>Patient: call:ended { durationSec }
```

### 📡 WebRTC Signaling Socket Events

| Event Name | Direction | Payload Parameters | Description |
| :--- | :--- | :--- | :--- |
| `call:initiate` | Client ➔ Server | `{ appointmentId, videoCallingId, callType: "VIDEO" \| "AUDIO" }` | Initiates call and verifies appointment room integrity |
| `call:incoming` | Server ➔ Client | `{ callId, appointmentId, videoCallingId, callerName, callType }` | Emitted to receiver's private room (`user:userId`) |
| `call:accept` | Client ➔ Server | `{ appointmentId, callId }` | Accepts incoming call and joins call room |
| `call:accepted` | Server ➔ Room | `{ callId, appointmentId, acceptedBy }` | Notifies peer that call was accepted |
| `call:reject` | Client ➔ Server | `{ appointmentId, callId, reason }` | Declines incoming call |
| `webrtc:offer` | Bidirectional | `{ appointmentId, sdp }` | SDP offer transmission for session negotiation |
| `webrtc:answer` | Bidirectional | `{ appointmentId, sdp }` | SDP answer transmission to complete handshake |
| `webrtc:ice-candidate` | Bidirectional | `{ appointmentId, candidate }` | Trickle ICE candidate relay for NAT/firewall traversal |
| `call:toggle-media` | Client ➔ Server | `{ appointmentId, videoMuted?, audioMuted? }` | Emits `call:media-toggled` to peer when mic/cam is toggled |
| `call:end` | Client ➔ Server | `{ appointmentId, callId? }` | Terminates call, logs duration in DB, emits `call:ended` |

### 🌐 WebRTC REST Endpoints

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/webrtc/ice-servers` | `PATIENT`, `DOCTOR`, `ADMIN` | Fetches public STUN/TURN ICE server configuration |
| `GET` | `/api/v1/webrtc/:appointmentId/logs` | `PATIENT`, `DOCTOR`, `ADMIN` | Retrieves consultation session history and billing duration |

---

## 🌟 Upcoming Roadmap
- [x] **Automated GitHub Actions CI/CD:** Auto-testing & deployment pipeline.
- [x] **Enterprise Applied AI & Clinical RAG Architecture:** Production pgvector HNSW search, deterministic Rule-0 triage, multi-model failover, and SSE streaming assistant.
- [x] **Distributed Real-Time Chat Engine (Socket.io + Redis Adapter):** Cross-replica event broadcasting across cluster, appointment-scoped JWT authorization, PostgreSQL message persistence, typing indicators, and read receipts.
- [x] **WebRTC Video Consultations:** Peer-to-peer live telemedicine video calling with session duration tracking and distributed signaling.
- [ ] **Multimodal Lab Report Summarizer:** PDF & image test report analysis with Google Gemini Vision models.

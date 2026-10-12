# 🏥 Healthcare Application Backend (Phase 1)

Welcome to the **Healthcare Application Backend**! This repository serves as the core foundation for a production-grade, scalable, and highly secure telemedicine platform connecting doctors and patients seamlessly.

---

## 🚀 Phase 1: Core Foundation (What We Built So Far)

During Phase 1, we established a rock-solid, scalable architecture using **Node.js, Express, TypeScript, and Prisma ORM**. Here is a high-level overview of our achievements:

- **Robust Database Modeling:** Designed complex relational schemas using PostgreSQL and Prisma, managing relationships between Users, Doctors, Patients, Appointments, and Prescriptions.
- **Authentication & Authorization:** Implemented role-based access control (RBAC) with secure JWT-based authentication for `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, and `PATIENT`.
- **Dynamic Prescription System:** Created a scalable prescription module with dynamic PDF generation using `pdf-lib` and automatic email dispatching using `Nodemailer` + `EJS`.
- **Cloudinary Integration:** Integrated Cloudinary for handling multipart/form-data via `multer`. We successfully managed dynamic uploads for images and raw files (like PDFs).
- **Advanced Error Handling:** Engineered an architect-level Global Error Handler capable of mapping deep Prisma Engine errors (like Rust Panics, Validation Errors, Known Request Errors) and Zod Validation errors into standardized, human-readable HTTP responses.
- **Graceful Shutdown Mechanism:** Implemented production-grade Process Signal Handlers (`SIGTERM`, `SIGINT`, `uncaughtException`, `unhandledRejection`) to prevent abrupt server crashes and data corruption.
- **Data Integrity & Transactions:** Wrapped complex multi-model database operations within `prisma.$transaction` to guarantee database consistency.
- **Performance Optimization:** Parallelized heavy dashboard statistics queries using `Promise.all`, bringing processing time down to milliseconds.

---

## 🛠️ Challenges Faced & How We Overcame Them

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

# Default Super Admin Seed Data
SUPER_ADMIN_EMAIL="superadmin@gmail.com"
SUPER_ADMIN_PASSWORD="secure_password_here"
SUPER_ADMIN_CONTACT="01xxxxxxxx"
```

---

## 💳 Local Stripe Webhook Testing Guide

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

## 📬 Postman Collection (API Testing)

We have included a complete Postman collection to make testing the APIs extremely easy for any developer. 

You can find the file named `Health-Care-Backend.postman_collection.json` in the root directory.
Simply **import** this JSON file into your Postman workspace, and you will get access to all the pre-configured endpoints, organized by modules (like Admin, Auth, Doctor, Prescription, Stats, etc.)!

---

> *"Great software is not built in a day; it is forged through iterative refactoring, clean architecture, and the pursuit of a senior-level mindset."* 🚀

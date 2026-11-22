# FixMate — Backend REST API & Payment Service (Server)

Express.js and MongoDB REST API powering **FixMate**, providing JWT verification, role-based access control, server-side search/filter/sort, strict one-step job status transitions, ImgBB media proxying, and Stripe Checkout + Webhook payment processing.

---

## Live Deployment & Repositories

- **Live API Base URL (Render):** https://fixmate-server-65ai.onrender.com
- **Live Frontend URL (Vercel):** https://fixmate-client-inky.vercel.app
- **Server Repository:** https://github.com/abukausar-dev/fixmate-server
- **Client Repository:** https://github.com/abukausar-dev/fixmate-client

---

## Core Backend Features & Security

- **4 MongoDB Collections:** `users` (shared with BetterAuth), `services`, `bookings`, and `payments`.
- **JWT & RBAC Middlewares:** `verifyToken` (`401 Unauthorized` for missing/invalid tokens), `verifyCustomer`, `verifyTechnician`, and `verifyAdmin` (`403 Forbidden` for unauthorized roles), plus strict ownership checks so users can only access or modify their own records.
- **Server-Enforced Job Pipeline:** Rejects invalid status jumps (e.g., `requested → completed`), requires `finalAmount > 0` on completion, prevents duplicate active customer requests for the same service, and restricts payment creation strictly to `completed` + `unpaid` bookings owned by the requesting customer.
- **Idempotent Stripe Payments:** Calculates Checkout totals from database records (`finalAmount × 100` cents) and processes signed `checkout.session.completed` webhooks without creating duplicate payment records (`stripeSessionId` uniqueness).
- **Secure ImgBB Proxy:** Handles authenticated image uploads via `/api/uploads/image` so `IMGBB_API_KEY` is never exposed to clients.

---

## API Endpoints Overview

> *Cross-check every route path below against your `src/routes` files before committing.*

| Method | Endpoint | Access / Middleware | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/services` | Public | Server-side search, category/mode filter, and sort of approved available services |
| `GET` | `/api/services/:id` | Public | Fetch single approved service with technician summary |
| `POST` | `/api/services` | `verifyToken`, `verifyTechnician` | Create new service (`approvalStatus: 'pending'`) |
| `PATCH` | `/api/services/:id` | `verifyToken`, `verifyTechnician` | Update own service (resets `approvalStatus` to `'pending'`) or toggle availability |
| `DELETE` | `/api/services/:id` | `verifyToken`, `verifyTechnician` | Delete own service |
| `POST` | `/api/bookings` | `verifyToken`, `verifyCustomer` | Create repair request (blocks duplicate active requests) |
| `GET` | `/api/bookings/my` | `verifyToken`, `verifyCustomer` | Fetch logged-in customer's bookings |
| `PATCH` | `/api/bookings/:id/cancel` | `verifyToken`, `verifyCustomer` | Cancel own booking while status is `requested` |
| `GET` | `/api/bookings/technician` | `verifyToken`, `verifyTechnician` | Fetch repair requests assigned to logged-in technician |
| `PATCH` | `/api/bookings/:id/status` | `verifyToken`, `verifyTechnician` | Advance job status one step (`accepted`, `rejected`, `in-progress`, `completed` + `finalAmount`) |
| `POST` | `/api/payments/create-checkout-session` | `verifyToken`, `verifyCustomer` | Create Stripe Checkout session for own `completed` + `unpaid` booking |
| `POST` | `/api/payments/webhook` | Stripe Signature | Handle signed `checkout.session.completed` event idempotently |
| `GET` | `/api/admin/stats` | `verifyToken`, `verifyAdmin` | Fetch platform overview analytics |
| `GET` | `/api/admin/users` | `verifyToken`, `verifyAdmin` | List all users |
| `PATCH` | `/api/admin/users/:id/role` | `verifyToken`, `verifyAdmin` | Update user role (self-role change blocked) |
| `PATCH` | `/api/admin/services/:id/approval` | `verifyToken`, `verifyAdmin` | Approve or reject a service listing |
| `GET` | `/api/admin/bookings` | `verifyToken`, `verifyAdmin` | View all platform bookings |
| `GET` | `/api/admin/payments` | `verifyToken`, `verifyAdmin` | View all transactions and total revenue |
| `PATCH` | `/api/users/profile` | `verifyToken` | Update logged-in user's profile |
| `POST` | `/api/uploads/image` | `verifyToken` | Upload image securely through ImgBB proxy |

---

## Packages Used (Installed via pnpm)

> *Verify and update exact package names against your `fixmate-server/package.json`.*

| Package | Purpose |
| :--- | :--- |
| `express` | REST API server framework |
| `mongodb` | MongoDB Node.js driver |
| `cors` | Cross-origin access restricted to trusted frontend origin |
| `dotenv` | Environment variable loading |
| `stripe` | Stripe Checkout Sessions and webhook signature verification |
| `jose` | JWKS-based JWT signature, issuer, and audience verification |
| `multer` | Multipart form-data handling for image uploads |
| `typescript` / `tsx` | Type safety and TypeScript execution |

---

## Local Setup, Environment Variables & Run

### Prerequisites
- Node.js (LTS recommended)
- `pnpm`
- MongoDB Atlas connection string
- Stripe Test Mode keys & ImgBB API key

### 1. Clone and Install Dependencies
```bash
git clone https://github.com/abukausar-dev/fixmate-server
cd fixmate-server
pnpm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory (never commit real secrets):

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<db>
DB_NAME=fixmate

CLIENT_URL=http://localhost:3000
CLIENT_ORIGIN=http://localhost:3000

JWT_ISSUER=http://localhost:3000
JWT_AUDIENCE=http://localhost:3000

STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret

IMGBB_API_KEY=your_imgbb_api_key
```

### 3. Run Locally
```bash
pnpm dev
```
The API server starts on `http://localhost:5000`.

### 4. Production Build & Start
```bash
pnpm build
pnpm start
```

---

## Production Deployment Notes (Render & Stripe Webhook)
- Set `NODE_ENV=production` on Render.
- Set `CLIENT_URL`, `CLIENT_ORIGIN` (if used by CORS), `JWT_ISSUER`, and `JWT_AUDIENCE` to `https://fixmate-client-inky.vercel.app` (no trailing slash).
- In Stripe Dashboard (**Test Mode → Developers → Webhooks**), register `https://fixmate-server-65ai.onrender.com/api/payments/webhook` for `checkout.session.completed` and save the signing secret (`whsec_...`) to `STRIPE_WEBHOOK_SECRET` on Render.
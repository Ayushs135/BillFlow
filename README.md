# BillFlow

BillFlow is a modern invoicing SaaS platform built for freelancers and small studios to manage clients, create and track invoices, and accept payments with public shareable links.

---

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Server Actions & Route Handlers)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **ORM**: [Prisma ORM](https://www.prisma.io/)
- **PDF Generation**: [jsPDF](https://github.com/parallax/jsPDF) vector document generation
- **Authentication**: JWT via [jose](https://github.com/panva/jose) with HTTP-only secure cookies and [bcryptjs](https://github.com/dcodeIO/bcrypt.js) password encryption
- **Validation**: [Zod](https://zod.dev/) for strict server-side schema verification

---

## Features Implemented Across Phases

### Phase 2: Authentication, Client Management & Settings
- **Authentication & Sessions**: Registration (`/signup`), login (`/login`), logout (`/api/auth/logout`), HTTP-only encrypted JWT session cookies.
- **Route Guarding**: Next.js Edge Middleware protecting `/dashboard`, `/clients`, `/settings`, and `/invoices`.
- **Client Directory**: Multi-tenant CRUD operations with server-side debounced search and delete confirmation dialogs.
- **Settings & Branding**: Business name, currency configuration (USD, EUR, GBP, INR, CAD, AUD, JPY, SGD, AED), invoice prefixes, and logo URL management.

### Phase 3: Invoicing, Dynamic Line Items & Status Lifecycle
- **Interactive Invoice Creation (`/invoices/new`)**:
  - Client selection scoped strictly to authenticated user's client list.
  - Concurrency-safe sequential invoice numbers (e.g., `INV-0001`, `INV-0002`) based on tenant prefix.
  - Dynamic line items: add, edit, and remove rows with real-time row totals (`qty × rate`).
  - Fixed-amount Tax and Discount calculation with client-side preview and strict server-side Decimal re-computation.
  - Validation: due date cannot precede issue date; discount cannot exceed `subtotal + tax`.
- **Atomic Database Operations**: Creation and updates use Prisma `$transaction` ensuring invoices and line items are committed atomically.
- **Invoice Listing & Filtering (`/invoices`)**:
  - Server-side search across invoice numbers, client names, company names, and emails.
  - Server-side status filters: `ALL`, `DRAFT`, `SENT`, `PAID`, `OVERDUE`.
  - Client-specific invoice filtering.
  - Server-side sorting: Newest, Oldest, Due Date, Highest Amount, Lowest Amount.
  - Server-side pagination with metadata (`page`, `pageSize`, `totalCount`, `totalPages`).
  - Responsive desktop table and mobile card views.
- **Invoice Detail View (`/invoices/[id]`)**:
  - Full billing summary displaying user business branding, client contact details, line-item breakdown, and notes.
  - Quick action toolbar: Edit (`/invoices/[id]/edit`), Delete (with cascade confirmation modal), and Mark as Sent.
- **Automatic Overdue Detection**:
  - Real-time computation converts unpaid invoices (`DRAFT` or `SENT`) past their due date to `OVERDUE`.
  - Paid invoices (`PAID`) strictly remain `PAID` regardless of due date.

### Phase 4: Public Invoice Portal, Payment Simulation, PDFs & Dashboard Analytics
- **Public Invoice Portal (`/invoice/[token]`)**:
  - Unauthenticated access via unique `publicToken`.
  - Zero sensitive data exposure: no passwords, session tokens, or unrelated invoices leaked.
  - Responsive paper-styled layout displaying business branding, client details, line items, and totals.
  - One-click public link copying and browser print stylesheet.
- **Public Simulated Payment (`POST /api/public/invoices/[token]/pay`)**:
  - Interactive payment simulation modal with card inputs (Name, Card Number, Expiry, CVV).
  - *Note: Demo sandbox simulation mode only — no real card details are charged or stored.*
  - Concurrency-safe atomic status transition from unpaid/overdue states directly to `PAID`.
  - Double-payment protection rejecting repeated payment attempts on settled invoices.
- **PDF Generation & Export**:
  - Vector PDF engine ([`lib/pdf-generator.ts`](file:///D:/vs/BillFlow/lib/pdf-generator.ts)) generating client-ready invoices with headers, line items, totals, and branding.
  - Authenticated download (`GET /api/invoices/[id]/pdf`) with multi-tenant verification.
  - Public portal download (`GET /api/public/invoices/[token]/pdf`).
- **Dashboard Analytics & Income Chart (`/dashboard`)**:
  - Real-time aggregate metric cards: **Earned** (Sum of `PAID`), **Outstanding** (Sum of `SENT`), **Overdue** (Sum of past-due unpaid).
  - Responsive **Income Over Time** SVG bar chart visualizing settled revenue across the last 6 months.
  - **Recent Invoices** preview table with status badges and quick view actions.

---

## Local Setup & Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure your PostgreSQL database credentials:

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/billflow?schema=public"
JWT_SECRET="billflow-local-development-secret-jwt-key-32chars"
```

### 3. Apply Migrations & Seed Database

```bash
npm run prisma:migrate
npm run prisma:seed
```

#### Demo Credentials:
- **Email**: `demo@billflow.dev`
- **Password**: `DemoPassword123!`

### 4. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## API Endpoints

### Authentication
- `POST /api/auth/signup` — Register account and set session cookie.
- `POST /api/auth/login` — Authenticate and set session cookie.
- `POST /api/auth/logout` — Clear session cookie.
- `GET  /api/auth/me` — Get current user profile.

### Clients (Multi-Tenant Scoped)
- `GET    /api/clients` — List clients (supports `?search=...`).
- `POST   /api/clients` — Create new client.
- `GET    /api/clients/[id]` — Retrieve client details.
- `PUT    /api/clients/[id]` — Update client details.
- `DELETE /api/clients/[id]` — Delete client.

### Invoices (Multi-Tenant Scoped)
- `GET    /api/invoices` — List invoices (supports `?search=...`, `?status=...`, `?clientId=...`, `?sort=...`, `?page=...`).
- `POST   /api/invoices` — Atomically create invoice with line items.
- `GET    /api/invoices/next-number` — Fetch next sequential invoice number.
- `GET    /api/invoices/[id]` — Retrieve invoice details with line items and client info.
- `GET    /api/invoices/[id]/pdf` — Download authenticated vector invoice PDF.
- `PUT    /api/invoices/[id]` — Atomically update invoice and line items.
- `PATCH  /api/invoices/[id]/status` — Quick status update (e.g., mark `SENT`).
- `DELETE /api/invoices/[id]` — Delete invoice and associated line items.

### Public Invoices & Payments (Unauthenticated)
- `GET  /api/public/invoices/[token]` — Retrieve sanitized invoice details by public token.
- `POST /api/public/invoices/[token]/pay` — Execute simulated payment and atomically transition status to `PAID`.
- `GET  /api/public/invoices/[token]/pdf` — Download public invoice PDF.

### Settings (Multi-Tenant Scoped)
- `GET /api/settings` — Get user business settings.
- `PUT /api/settings` — Update business profile, currency, prefix, and logo.

---

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Starts Next.js development server on `http://localhost:3000` |
| `build` | `npm run build` | Builds production Next.js application |
| `start` | `npm run start` | Starts production server |
| `lint` | `npm run lint` | Runs ESLint checks |
| `test:phase2` | `npm run test:phase2` | Runs automated Phase 2 auth and client test suite |
| `test:phase3` | `npm run test:phase3` | Runs automated Phase 3 invoice creation, calculation, and filtering test suite |
| `test:concurrency` | `npm run test:concurrency` | Runs high-concurrency invoice sequence numbering test suite |
| `test:phase4` | `npm run test:phase4` | Runs automated Phase 4 public invoice, payment, analytics, and PDF test suite |
| `prisma:migrate` | `npm run prisma:migrate` | Applies Prisma migrations |
| `prisma:seed` | `npm run prisma:seed` | Seeds database with demo test data |
| `prisma:studio` | `npm run prisma:studio` | Opens Prisma Studio GUI |

---

## Multi-Tenant Security Guarantees

1. **Server-Derived Identity**: The `userId` is always extracted from the authenticated session JWT. Client-supplied user IDs are rejected.
2. **Compound Ownership Verification**: Every query on `Invoice`, `InvoiceItem`, and `Client` enforces `userId: currentUser.id`.
3. **Public Token Isolation**: Public routes strictly expose only the invoice mapped to the exact `publicToken`. Password hashes and internal account data are omitted.
4. **Precision Decimal Calculations**: All financial values are computed on the server using Prisma `Decimal` arithmetic.

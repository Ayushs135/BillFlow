# BillFlow

## Live Demo

- **Live Application:** [https://bill-flow-delta.vercel.app/](https://bill-flow-delta.vercel.app/)
- **Public Demo Invoice:** [https://bill-flow-delta.vercel.app/invoice/demo-token-inv-006-sent](https://bill-flow-delta.vercel.app/invoice/demo-token-inv-006-sent)


> **Note**: The public demo invoice is accessible anonymously without authentication.

---

## Project Overview

**BillFlow** is a modern multi-tenant invoicing SaaS platform designed for freelancers and small studios. It provides an end-to-end billing workflow to manage clients, create and customize invoices with dynamic line items, track payment statuses, share token-gated public portals with PDF exports, and monitor business revenue analytics.

---

## Key Features

- **Authentication & Protected Dashboard**: Secure stateless session cookies via JWT (`jose`), password hashing with `bcryptjs`, and Edge Middleware route protection.
- **Multi-Tenant Client Management**: Fully isolated client directory with server-side search across names, companies, and email addresses.
- **Invoice Lifecycle Management**: Complete invoice CRUD with dynamic line items and real-time status transitions across `DRAFT`, `SENT`, `PAID`, and `OVERDUE`.
- **Percentage-Based Tax & Discount Calculations**: Server-enforced exact calculations with Prisma Decimal arithmetic preventing floating-point rounding issues.
- **Concurrency-Safe Sequential Numbering**: Database-backed atomic sequence counter providing concurrency-safe, collision-free and tenant-scoped sequential numbering (e.g., `INV-0001`, `INV-0002`).
- **Multi-Currency Support**: Native currency formatting for USD, EUR, GBP, INR (₹), CAD, AUD, JPY, SGD, and AED.
- **PDF Generation & Browser Printing**: Vector PDF creation powered by `jspdf` and styled `@media print` stylesheets for high-resolution document printing.
- **Business Logo Upload & PostgreSQL Storage**: Logo image upload with binary (`BYTEA`) storage in PostgreSQL, rendered seamlessly on invoice views and vector PDFs.
- **Public Invoice Links**: Token-gated public client portal allowing clients to review invoices and download PDFs without logging in.
- **Gmail "Mail Invoice" Integration**: One-click Gmail compose integration with URL-encoded recipient, subject, and public invoice link.
- **Revenue Analytics Dashboard**: Real-time financial summary metrics (Total Earned, Outstanding, Overdue) and a 6-month monthly revenue distribution chart.
- **Demo Account & Seeded Data**: Pre-configured demo account populated with multi-month realistic invoicing data.

---

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Server Actions, Route Handlers)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) ([Neon](https://neon.tech/))
- **ORM**: [Prisma 6](https://www.prisma.io/)
- **Authentication & Security**: [jose](https://github.com/panva/jose) (JWT) & [bcryptjs](https://github.com/dcodeIO/bcrypt.js)
- **PDF Engine**: [jsPDF](https://github.com/parallax/jsPDF)
- **Deployment**: [Vercel](https://vercel.com/)

---

## Local Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Ayushs135/BillFlow.git
cd BillFlow
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="your-postgresql-connection-string"
JWT_SECRET="your-secret-key"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Setup Database & Seed Data

```bash
npx prisma migrate dev
npm run prisma:seed
```

### 4. Start Development Server

```bash
npm run dev
```

The application runs locally at [http://localhost:3000](http://localhost:3000).

---

## Production Deployment

- **GitHub to Vercel**: Connect the GitHub repository directly to Vercel for continuous deployment.
- **Production Database**: Provision a serverless PostgreSQL database using [Neon](https://neon.tech/).
- **Required Vercel Environment Variables**:
  - `DATABASE_URL`: Production PostgreSQL connection string from Neon.
  - `JWT_SECRET`: Secure 32+ character random string for signing session JWTs.
  - `NEXT_PUBLIC_APP_URL`: Production domain (`https://bill-flow-delta.vercel.app`).
- **Production Migrations**:
  ```bash
  npx prisma migrate deploy
  ```
- **Production Build**:
  The production build script is configured in `package.json` to ensure the Prisma Client is generated before compiling:
  ```json
  "build": "prisma generate && next build"
  ```

---

## Demo Credentials

Log in with the pre-seeded demo account to access the authenticated dashboard:

- **Email**: `demo@billflow.dev`
- **Password**: `DemoPassword123!`

---

## Verification

BillFlow includes comprehensive test suites, strict TypeScript validation, ESLint linting, and production build verification:

- `npm run test:surgical` — Pre-deployment verification suite
- `npm run test:phase2` — Authentication and client management tests
- `npm run test:phase3` — Invoicing engine, calculations, and search tests
- `npm run test:concurrency` — Concurrency-safe sequential invoice numbering tests
- `npm run test:phase4` — Public portal, simulated payment, and analytics tests
- `npm run test:polish` — Dashboard analytics and scaling tests
- `npm run test:mail` — Gmail compose integration and URL encoding tests
- `npx tsc --noEmit` — TypeScript type checking (0 errors)
- `npm run lint` — ESLint code quality checks (0 errors, 0 warnings)
- `npm run build` — Production build compilation

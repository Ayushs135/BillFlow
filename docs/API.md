# BillFlow API Documentation

This document provides comprehensive reference documentation for all HTTP API endpoints implemented in the **BillFlow** application.

---

## Table of Contents

1. [Overview & Conventions](#1-overview--conventions)
   - [Base URL](#base-url)
   - [Authentication & Sessions](#authentication--sessions)
   - [Standard Error Format](#standard-error-format)
   - [Status Code Conventions](#status-code-conventions)
2. [Authentication Endpoints](#2-authentication-endpoints)
   - `POST /api/auth/signup`
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
   - `GET /api/auth/me`
3. [Client Management Endpoints](#3-client-management-endpoints)
   - `GET /api/clients`
   - `POST /api/clients`
   - `GET /api/clients/:id`
   - `PUT /api/clients/:id`
   - `DELETE /api/clients/:id`
4. [Invoice Management Endpoints](#4-invoice-management-endpoints)
   - `GET /api/invoices`
   - `POST /api/invoices`
   - `GET /api/invoices/next-number`
   - `GET /api/invoices/:id`
   - `PUT /api/invoices/:id`
   - `DELETE /api/invoices/:id`
   - `PATCH /api/invoices/:id/status`
   - `GET /api/invoices/:id/pdf`
5. [Public Client Portal Endpoints (Unauthenticated)](#5-public-client-portal-endpoints-unauthenticated)
   - `GET /api/public/invoices/:token`
   - `POST /api/public/invoices/:token/pay`
   - `GET /api/public/invoices/:token/pdf`
6. [Settings & Branding Endpoints](#6-settings--branding-endpoints)
   - `GET /api/settings`
   - `PUT /api/settings`
   - `POST /api/upload/logo`

---

## 1. Overview & Conventions

### Base URL
All API endpoints are served relative to the origin root:
`http://localhost:3000` (development) or `https://<your-domain>` (production).

### Authentication & Sessions
- Authenticated endpoints require a valid `billflow_session` HTTP-only cookie containing a signed HS256 JWT.
- If the session cookie is missing or invalid, the API returns HTTP `401 Unauthorized`.
- Unauthenticated public endpoints operate strictly on unique, cryptographically random `publicToken` identifiers.

### Standard Error Format
All JSON error responses follow the standard payload schema:
```json
{
  "error": "Human-readable description of the error."
}
```

### Status Code Conventions
| Status Code | Description |
|---|---|
| `200 OK` | The request succeeded and returned the requested payload. |
| `201 Created` | A resource was successfully created. |
| `400 Bad Request` | Input validation failed, invalid query parameter, or business rule violation. |
| `401 Unauthorized` | Missing, expired, or invalid session cookie. |
| `404 Not Found` | The requested resource does not exist or does not belong to the tenant. |
| `500 Internal Server Error` | An unexpected error occurred on the server. |

---

## 2. Authentication Endpoints

### 2.1 Sign Up
- **Method**: `POST`
- **URL**: `/api/auth/signup`
- **Authentication**: None (Public)
- **Purpose**: Registers a new user tenant, hashes password with `bcryptjs`, and provisions initial default settings (`USD`, `INV-`).

#### Validation Rules (`signupSchema`):
- `name`: String, minimum 2 characters (trimmed).
- `email`: Valid email format (lowercased, trimmed). Must be unique in database.
- `password`: String, minimum 8 characters.
- `confirmPassword`: String, must match `password`.

#### Request Body:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "SecurePassword123!",
  "confirmPassword": "SecurePassword123!"
}
```

#### Response Example (`201 Created`):
```json
{
  "user": {
    "id": "673cf82a-2f4e-4e50-9c2b-e10db5678abc",
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "message": "User created successfully"
}
```
*Note: Sets the `billflow_session` HTTP-only cookie automatically.*

#### Error Codes:
- `400 Bad Request`: Validation failure or email already registered (`"An account with this email already exists."`).
- `500 Internal Server Error`: Unexpected database or hashing error.

---

### 2.2 Login
- **Method**: `POST`
- **URL**: `/api/auth/login`
- **Authentication**: None (Public)
- **Purpose**: Authenticates user credentials via bcrypt verification and establishes a signed session cookie.

#### Validation Rules (`loginSchema`):
- `email`: Valid email format (lowercased, trimmed).
- `password`: String, minimum 1 character.

#### Request Body:
```json
{
  "email": "demo@billflow.dev",
  "password": "DemoPassword123!"
}
```

#### Response Example (`200 OK`):
```json
{
  "user": {
    "id": "18f9ef9a-4c22-4467-ba7a-ef92ef2bc562",
    "name": "Alex Morgan",
    "email": "demo@billflow.dev"
  },
  "message": "Logged in successfully"
}
```
*Note: Sets the `billflow_session` HTTP-only cookie.*

#### Error Codes:
- `400 Bad Request`: Validation failure.
- `401 Unauthorized`: Invalid credentials (`"Invalid email or password."`).
- `500 Internal Server Error`: Server processing failure.

---

### 2.3 Logout
- **Method**: `POST`
- **URL**: `/api/auth/logout`
- **Authentication**: None (or Authenticated)
- **Purpose**: Clears the `billflow_session` cookie by setting `maxAge: 0`.

#### Request Body:
None.

#### Response Example (`200 OK`):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 2.4 Get Current User (`Me`)
- **Method**: `GET`
- **URL**: `/api/auth/me`
- **Authentication**: Required (`billflow_session`)
- **Purpose**: Returns the sanitized user profile for the currently active session. Excludes password hash.

#### Request Parameters:
None.

#### Response Example (`200 OK`):
```json
{
  "user": {
    "id": "18f9ef9a-4c22-4467-ba7a-ef92ef2bc562",
    "name": "Alex Morgan",
    "email": "demo@billflow.dev",
    "createdAt": "2026-09-01T08:00:00.000Z"
  }
}
```

#### Error Codes:
- `401 Unauthorized`: Session missing or expired.
- `500 Internal Server Error`: Server failure.

---

## 3. Client Management Endpoints

All client routes are strictly multi-tenant and enforce `userId: session.userId`.

### 3.1 List Clients
- **Method**: `GET`
- **URL**: `/api/clients`
- **Authentication**: Required
- **Purpose**: Lists all clients owned by the authenticated tenant with optional server-side search.

#### Query Parameters:
- `search` *(optional, string)*: Filters clients where `name`, `email`, or `company` contains the search query (case-insensitive).

#### Response Example (`200 OK`):
```json
{
  "clients": [
    {
      "id": "4c94f58e-0cf4-4ffb-871d-8b066cf6d3e1",
      "name": "Acme Corporation",
      "email": "billing@acmecorp.com",
      "company": "Acme Corp International",
      "address": "123 Innovation Way, Suite 400, San Francisco, CA",
      "phone": "+1 (555) 019-2834",
      "createdAt": "2026-09-01T08:00:00.000Z",
      "updatedAt": "2026-09-01T08:00:00.000Z",
      "_count": {
        "invoices": 4
      }
    }
  ]
}
```

#### Error Codes:
- `401 Unauthorized`: Unauthenticated request.
- `500 Internal Server Error`: Database query failure.

---

### 3.2 Create Client
- **Method**: `POST`
- **URL**: `/api/clients`
- **Authentication**: Required
- **Purpose**: Creates a new client profile belonging to the authenticated tenant.

#### Validation Rules (`clientSchema`):
- `name`: String, minimum 1 character (required).
- `email`: Valid email format or empty string (optional).
- `company`: String, max 100 chars (optional).
- `address`: String, max 300 chars (optional).
- `phone`: String, max 30 chars (optional).

#### Request Body:
```json
{
  "name": "Bright Horizon Media LLC",
  "email": "finance@brighthorizon.io",
  "company": "Bright Horizon Media",
  "address": "456 Market St, Austin, TX",
  "phone": "+1 (555) 345-6789"
}
```

#### Response Example (`201 Created`):
```json
{
  "client": {
    "id": "e456f912-1a2b-4c3d-8e9f-0123456789ab",
    "userId": "18f9ef9a-4c22-4467-ba7a-ef92ef2bc562",
    "name": "Bright Horizon Media LLC",
    "email": "finance@brighthorizon.io",
    "company": "Bright Horizon Media",
    "address": "456 Market St, Austin, TX",
    "phone": "+1 (555) 345-6789",
    "createdAt": "2026-09-03T10:00:00.000Z",
    "updatedAt": "2026-09-03T10:00:00.000Z"
  },
  "message": "Client created successfully"
}
```

#### Error Codes:
- `400 Bad Request`: Input validation failed.
- `401 Unauthorized`: Unauthenticated request.
- `500 Internal Server Error`: Database insertion failure.

---

### 3.3 Get Single Client
- **Method**: `GET`
- **URL**: `/api/clients/:id`
- **Authentication**: Required
- **Purpose**: Fetches single client details including associated invoice count.

#### URL Parameters:
- `id` *(required, UUID)*: Unique client identifier.

#### Response Example (`200 OK`):
```json
{
  "client": {
    "id": "4c94f58e-0cf4-4ffb-871d-8b066cf6d3e1",
    "userId": "18f9ef9a-4c22-4467-ba7a-ef92ef2bc562",
    "name": "Acme Corporation",
    "email": "billing@acmecorp.com",
    "company": "Acme Corp International",
    "address": "123 Innovation Way, Suite 400, San Francisco, CA",
    "phone": "+1 (555) 019-2834",
    "createdAt": "2026-09-01T08:00:00.000Z",
    "updatedAt": "2026-09-01T08:00:00.000Z",
    "_count": {
      "invoices": 4
    }
  }
}
```

#### Error Codes:
- `401 Unauthorized`: Unauthenticated request.
- `404 Not Found`: Client does not exist or belongs to another tenant.
- `500 Internal Server Error`: Server failure.

---

### 3.4 Update Client
- **Method**: `PUT`
- **URL**: `/api/clients/:id`
- **Authentication**: Required
- **Purpose**: Updates an existing client owned by the authenticated tenant.

#### URL Parameters:
- `id` *(required, UUID)*: Unique client identifier.

#### Request Body (`clientSchema`):
```json
{
  "name": "Acme Corporation Global",
  "email": "invoices@acmecorp.com",
  "company": "Acme Corp Global",
  "address": "123 Innovation Way, San Francisco, CA",
  "phone": "+1 (555) 019-2834"
}
```

#### Response Example (`200 OK`):
```json
{
  "client": {
    "id": "4c94f58e-0cf4-4ffb-871d-8b066cf6d3e1",
    "name": "Acme Corporation Global",
    "email": "invoices@acmecorp.com",
    "company": "Acme Corp Global",
    "address": "123 Innovation Way, San Francisco, CA",
    "phone": "+1 (555) 019-2834",
    "updatedAt": "2026-09-03T11:00:00.000Z"
  },
  "message": "Client updated successfully"
}
```

#### Error Codes:
- `400 Bad Request`: Input validation failed.
- `401 Unauthorized`: Unauthenticated request.
- `404 Not Found`: Client does not exist or belongs to another tenant.
- `500 Internal Server Error`: Database update failure.

---

### 3.5 Delete Client
- **Method**: `DELETE`
- **URL**: `/api/clients/:id`
- **Authentication**: Required
- **Purpose**: Deletes a client profile and cascades deletion to linked invoices.

#### URL Parameters:
- `id` *(required, UUID)*: Unique client identifier.

#### Response Example (`200 OK`):
```json
{
  "success": true,
  "message": "Client deleted successfully"
}
```

#### Error Codes:
- `401 Unauthorized`: Unauthenticated request.
- `404 Not Found`: Client does not exist or belongs to another tenant.
- `500 Internal Server Error`: Database deletion failure.

---

## 4. Invoice Management Endpoints

### 4.1 List Invoices
- **Method**: `GET`
- **URL**: `/api/invoices`
- **Authentication**: Required
- **Purpose**: Returns paginated, searchable, sorted, and filtered invoices scoped to the authenticated tenant. Includes real-time `effectiveStatus` computation.

#### Query Parameters:
- `page` *(optional, integer, default: 1)*: Page number.
- `pageSize` *(optional, integer, default: 20, max: 100)*: Items per page.
- `search` *(optional, string)*: Searches invoice number or client name (case-insensitive).
- `status` *(optional, enum: `DRAFT`, `SENT`, `PAID`, `OVERDUE`)*: Filters by status.
- `clientId` *(optional, UUID)*: Filters by client ID (tenant-validated).
- `sort` *(optional, enum: `newest`, `oldest`, `dueDate`, `amountHigh`, `amountLow`, default: `newest`)*: Sorting order.

#### Response Example (`200 OK`):
```json
{
  "invoices": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "userId": "18f9ef9a-4c22-4467-ba7a-ef92ef2bc562",
      "clientId": "4c94f58e-0cf4-4ffb-871d-8b066cf6d3e1",
      "invoiceNumber": "INV-0001",
      "issueDate": "2026-08-15T00:00:00.000Z",
      "dueDate": "2026-08-30T00:00:00.000Z",
      "status": "PAID",
      "effectiveStatus": "PAID",
      "subtotal": 3500.00,
      "tax": 350.00,
      "discount": 175.00,
      "total": 3675.00,
      "notes": "Thank you for your business!",
      "publicToken": "4c04f9d9-0d60-4d5b-9f75-18e8f2f5cb8b",
      "createdAt": "2026-08-15T10:00:00.000Z",
      "updatedAt": "2026-08-20T14:30:00.000Z",
      "client": {
        "id": "4c94f58e-0cf4-4ffb-871d-8b066cf6d3e1",
        "name": "Acme Corporation",
        "company": "Acme Corp International",
        "email": "billing@acmecorp.com",
        "phone": "+1 (555) 019-2834"
      },
      "items": [
        {
          "id": "item-1",
          "description": "Brand Identity Design",
          "quantity": 1,
          "rate": 3500.00,
          "amount": 3500.00
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 1,
    "totalPages": 1
  }
}
```

---

### 4.2 Create Invoice
- **Method**: `POST`
- **URL**: `/api/invoices`
- **Authentication**: Required
- **Purpose**: Atomically creates an invoice with line items, reserves consecutive invoice number, and calculates exact financials via Prisma Decimal engine.

#### Validation Rules (`createInvoiceSchema`):
- `clientId`: UUID (required, must belong to authenticated user).
- `invoiceNumber`: String (optional, if omitted the server atomically reserves next sequential number).
- `issueDate`: Date string (required).
- `dueDate`: Date string (required, must be $\ge$ `issueDate`).
- `items`: Array of line items (min 1 item):
  - `description`: String, min 1 character.
  - `quantity`: Number, strictly $> 0$.
  - `rate`: Number, strictly $\ge 0$.
- `tax`: Number, percentage from `0` to `100` (default: 0).
- `discount`: Number, percentage from `0` to `100` (default: 0).
- `notes`: String, max 2000 chars (optional).
- `status`: Enum (`DRAFT`, `SENT`, `PAID`, `OVERDUE`, default: `DRAFT`).

#### Request Body:
```json
{
  "clientId": "4c94f58e-0cf4-4ffb-871d-8b066cf6d3e1",
  "issueDate": "2026-09-01",
  "dueDate": "2026-09-15",
  "items": [
    {
      "description": "Full-Stack Web Development",
      "quantity": 40,
      "rate": 100.00
    },
    {
      "description": "Infrastructure Setup & CI/CD",
      "quantity": 1,
      "rate": 500.00
    }
  ],
  "tax": 10,
  "discount": 5,
  "notes": "Payment due within 14 days of issue date.",
  "status": "SENT"
}
```

#### Response Example (`201 Created`):
```json
{
  "invoice": {
    "id": "d7e8f9a0-1234-5678-9abc-def012345678",
    "invoiceNumber": "INV-0007",
    "issueDate": "2026-09-01T00:00:00.000Z",
    "dueDate": "2026-09-15T00:00:00.000Z",
    "status": "SENT",
    "effectiveStatus": "SENT",
    "subtotal": 4500.00,
    "tax": 450.00,
    "discount": 225.00,
    "total": 4725.00,
    "notes": "Payment due within 14 days of issue date.",
    "publicToken": "8f3b2a1c-9d0e-4f1a-b2c3-d4e5f6a7b8c9",
    "items": [
      {
        "id": "item-1",
        "description": "Full-Stack Web Development",
        "quantity": 40,
        "rate": 100.00,
        "amount": 4000.00
      },
      {
        "id": "item-2",
        "description": "Infrastructure Setup & CI/CD",
        "quantity": 1,
        "rate": 500.00,
        "amount": 500.00
      }
    ]
  },
  "message": "Invoice created successfully"
}
```

#### Error Codes:
- `400 Bad Request`: Validation failure or non-existent client.
- `401 Unauthorized`: Unauthenticated request.
- `500 Internal Server Error`: Transaction failure.

---

### 4.3 Peek Next Invoice Number
- **Method**: `GET`
- **URL**: `/api/invoices/next-number`
- **Authentication**: Required
- **Purpose**: Previews the upcoming sequential invoice number for the tenant without consuming or advancing the counter.

#### Response Example (`200 OK`):
```json
{
  "nextInvoiceNumber": "INV-0008"
}
```

---

### 4.4 Get Single Invoice
- **Method**: `GET`
- **URL**: `/api/invoices/:id`
- **Authentication**: Required
- **Purpose**: Fetches full invoice detail, line items, client details, and reconstructed PostgreSQL logo data URL.

#### URL Parameters:
- `id` *(required, UUID)*: Unique invoice identifier.

#### Response Example (`200 OK`):
```json
{
  "invoice": {
    "id": "d7e8f9a0-1234-5678-9abc-def012345678",
    "invoiceNumber": "INV-0007",
    "issueDate": "2026-09-01T00:00:00.000Z",
    "dueDate": "2026-09-15T00:00:00.000Z",
    "status": "SENT",
    "effectiveStatus": "SENT",
    "subtotal": 4500.00,
    "tax": 450.00,
    "discount": 225.00,
    "total": 4725.00,
    "notes": "Payment due within 14 days of issue date.",
    "publicToken": "8f3b2a1c-9d0e-4f1a-b2c3-d4e5f6a7b8c9",
    "client": {
      "id": "4c94f58e-0cf4-4ffb-871d-8b066cf6d3e1",
      "name": "Acme Corporation",
      "company": "Acme Corp International",
      "email": "billing@acmecorp.com",
      "address": "123 Innovation Way, San Francisco, CA",
      "phone": "+1 (555) 019-2834"
    },
    "user": {
      "name": "Alex Morgan",
      "email": "demo@billflow.dev",
      "settings": {
        "businessName": "Morgan Design & Development",
        "currency": "USD",
        "invoicePrefix": "INV-",
        "logoUrl": "data:image/png;base64,iVBORw0KGgo..."
      }
    },
    "items": [
      {
        "id": "item-1",
        "description": "Full-Stack Web Development",
        "quantity": 40,
        "rate": 100.00,
        "amount": 4000.00
      }
    ]
  }
}
```

#### Error Codes:
- `401 Unauthorized`: Unauthenticated request.
- `404 Not Found`: Invoice does not exist or belongs to another tenant.
- `500 Internal Server Error`: Server error.

---

### 4.5 Update Invoice
- **Method**: `PUT`
- **URL**: `/api/invoices/:id`
- **Authentication**: Required
- **Purpose**: Atomically updates invoice metadata, recalculates financials, and replaces line items in a database transaction.

#### Request Body (`updateInvoiceSchema`):
```json
{
  "clientId": "4c94f58e-0cf4-4ffb-871d-8b066cf6d3e1",
  "invoiceNumber": "INV-0007",
  "issueDate": "2026-09-01",
  "dueDate": "2026-09-20",
  "items": [
    {
      "description": "Full-Stack Web Development (Updated Scope)",
      "quantity": 45,
      "rate": 100.00
    }
  ],
  "tax": 10,
  "discount": 5,
  "notes": "Updated due date.",
  "status": "SENT"
}
```

#### Response Example (`200 OK`):
```json
{
  "invoice": {
    "id": "d7e8f9a0-1234-5678-9abc-def012345678",
    "invoiceNumber": "INV-0007",
    "total": 5242.50,
    "effectiveStatus": "SENT"
  },
  "message": "Invoice updated successfully"
}
```

---

### 4.6 Delete Invoice
- **Method**: `DELETE`
- **URL**: `/api/invoices/:id`
- **Authentication**: Required
- **Purpose**: Deletes an invoice and its line items. Does not reset or recycle sequential invoice numbers.

#### Response Example (`200 OK`):
```json
{
  "success": true,
  "message": "Invoice deleted successfully"
}
```

---

### 4.7 Update Invoice Status
- **Method**: `PATCH`
- **URL**: `/api/invoices/:id/status`
- **Authentication**: Required
- **Purpose**: Fast status transition (e.g. `DRAFT` $\rightarrow$ `SENT`, `SENT` $\rightarrow$ `PAID`).

#### Validation Rules:
- `status`: Enum (`DRAFT`, `SENT`, `PAID`, `OVERDUE`).

#### Request Body:
```json
{
  "status": "PAID"
}
```

#### Response Example (`200 OK`):
```json
{
  "invoice": {
    "id": "d7e8f9a0-1234-5678-9abc-def012345678",
    "status": "PAID",
    "effectiveStatus": "PAID"
  },
  "message": "Invoice status updated to PAID"
}
```

---

### 4.8 Download Authenticated Invoice PDF
- **Method**: `GET`
- **URL**: `/api/invoices/:id/pdf`
- **Authentication**: Required
- **Purpose**: Generates and streams vector A4 PDF invoice document with PostgreSQL-stored logo.

#### Headers:
- `Content-Type`: `application/pdf`
- `Content-Disposition`: `inline; filename="invoice-<number>.pdf"`

#### Response:
Raw binary PDF document stream (`application/pdf`).

---

## 5. Public Client Portal Endpoints (Unauthenticated)

These endpoints allow end-clients and evaluators to access invoices and test payment flows without authenticating or creating an account.

### 5.1 Get Public Invoice
- **Method**: `GET`
- **URL**: `/api/public/invoices/:token`
- **Authentication**: None (Public via token)
- **Purpose**: Resolves invoice data anonymously by `publicToken`. Excludes password hashes and internal database keys.

#### URL Parameters:
- `token` *(required, UUID / token string)*: The unique `publicToken` of the invoice.

#### Response Example (`200 OK`):
```json
{
  "invoice": {
    "invoiceNumber": "INV-006",
    "issueDate": "2026-08-20T00:00:00.000Z",
    "dueDate": "2026-09-04T00:00:00.000Z",
    "status": "SENT",
    "effectiveStatus": "SENT",
    "subtotal": 2400.00,
    "tax": 0.00,
    "discount": 0.00,
    "total": 2400.00,
    "notes": "Thank you for your business!",
    "publicToken": "demo-token-inv-006-sent",
    "createdAt": "2026-08-20T08:00:00.000Z",
    "business": {
      "name": "Morgan Design & Development",
      "email": "demo@billflow.dev",
      "logoUrl": "data:image/png;base64,iVBORw0KGgo...",
      "currency": "USD"
    },
    "client": {
      "name": "Bright Horizon Media LLC",
      "company": "Bright Horizon Media",
      "email": "finance@brighthorizon.io",
      "address": "456 Market St, Austin, TX",
      "phone": "+1 (555) 345-6789"
    },
    "items": [
      {
        "id": "it-1",
        "description": "Custom UI/UX Design Sprint",
        "quantity": 1,
        "rate": 2400.00,
        "amount": 2400.00
      }
    ]
  }
}
```

#### Error Codes:
- `404 Not Found`: Token not found or invalid.
- `500 Internal Server Error`: Server failure.

---

### 5.2 Simulate Public Invoice Payment
- **Method**: `POST`
- **URL**: `/api/public/invoices/:token/pay`
- **Authentication**: None (Public via token)
- **Purpose**: Simulates settling an invoice. Enforces atomic double-payment protection.

#### Request Body:
None required.

#### Response Example (`200 OK`):
```json
{
  "success": true,
  "message": "Invoice INV-006 has been successfully paid.",
  "status": "PAID"
}
```

#### Error Codes:
- `400 Bad Request`: Invoice has already been paid (`"This invoice has already been paid."`).
- `404 Not Found`: Token not found.
- `500 Internal Server Error`: Payment processing error.

---

### 5.3 Download Public Invoice PDF
- **Method**: `GET`
- **URL**: `/api/public/invoices/:token/pdf`
- **Authentication**: None (Public via token)
- **Purpose**: Generates and streams vector A4 PDF invoice document anonymously with embedded logo.

#### Headers:
- `Content-Type`: `application/pdf`
- `Content-Disposition`: `inline; filename="invoice-<number>.pdf"`

#### Response:
Raw binary PDF document stream (`application/pdf`).

---

## 6. Settings & Branding Endpoints

### 6.1 Get Settings
- **Method**: `GET`
- **URL**: `/api/settings`
- **Authentication**: Required
- **Purpose**: Returns the business branding and preferences for the authenticated tenant. Reconstructs PostgreSQL binary `logoData` into a base64 data URL.

#### Response Example (`200 OK`):
```json
{
  "settings": {
    "id": "setting-uuid",
    "userId": "18f9ef9a-4c22-4467-ba7a-ef92ef2bc562",
    "businessName": "Morgan Design & Development",
    "currency": "USD",
    "invoicePrefix": "INV-",
    "logoUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHg...",
    "createdAt": "2026-09-01T08:00:00.000Z",
    "updatedAt": "2026-09-03T10:00:00.000Z"
  }
}
```

---

### 6.2 Update Settings
- **Method**: `PUT`
- **URL**: `/api/settings`
- **Authentication**: Required
- **Purpose**: Updates business name, currency code, invoice numbering prefix, and manages logo data.

#### Validation Rules (`settingsSchema`):
- `businessName`: String, max 100 characters (optional).
- `currency`: String, 2 to 5 chars, default `USD` (supported: USD, EUR, GBP, INR, CAD, AUD, JPY, SGD, AED).
- `invoicePrefix`: String, 1 to 10 characters (required, default `INV-`).
- `logoUrl`: Base64 data URL or null (optional).

#### Request Body:
```json
{
  "businessName": "Morgan Design & Development Studio",
  "currency": "USD",
  "invoicePrefix": "INV-",
  "logoUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHg..."
}
```

#### Response Example (`200 OK`):
```json
{
  "settings": {
    "id": "setting-uuid",
    "userId": "18f9ef9a-4c22-4467-ba7a-ef92ef2bc562",
    "businessName": "Morgan Design & Development Studio",
    "currency": "USD",
    "invoicePrefix": "INV-",
    "logoUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHg..."
  },
  "message": "Settings updated successfully"
}
```

---

### 6.3 Upload Logo Binary to PostgreSQL
- **Method**: `POST`
- **URL**: `/api/upload/logo`
- **Authentication**: Required
- **Purpose**: Uploads business logo image, validates binary magic bytes, and stores raw binary directly into PostgreSQL (`BYTEA` column `logoData` & `logoMimeType`). Zero filesystem writes.

#### Request Format:
- `multipart/form-data` with `file` form field.

#### Validation Rules:
- **Max File Size**: 2 MB (`2 * 1024 * 1024` bytes).
- **Supported Formats**: PNG, JPEG, WebP.
- **Magic Byte Verification**:
  - PNG: `89 50 4E 47 0D 0A 1A 0A`
  - JPEG: `FF D8 FF`
  - WebP: `52 49 46 46 ... 57 45 42 50` (RIFF....WEBP)

#### Response Example (`200 OK`):
```json
{
  "logoUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHg...",
  "message": "Logo uploaded and saved to database successfully"
}
```

#### Error Codes:
- `400 Bad Request`: No file uploaded, file size $> 2$ MB, or invalid image format / magic bytes (`"Invalid image type. Only PNG, JPEG, and WebP are allowed."`).
- `401 Unauthorized`: Unauthenticated request.
- `500 Internal Server Error`: Database upload failure.

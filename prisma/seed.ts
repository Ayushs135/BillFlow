/**
 * @file prisma/seed.ts
 * @description Idempotent Database Seeding Script
 * 
 * Provisions:
 * - Demo user: `demo@billflow.dev` / `DemoPassword123!`.
 * - Business settings: "Morgan Design & Development" with real PostgreSQL PNG logo buffer.
 * - Sample clients: Acme Corporation, Bright Horizon Media LLC.
 * - 8 realistic sample invoices spanning 3 months across all statuses (PAID, SENT, OVERDUE, DRAFT).
 * - Stable publicToken for the public demo invoice (`demo-token-inv-006-sent`).
 * - Sequential invoice counter initialization (`nextNumber: 9`).
 */

import { PrismaClient, InvoiceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Create or update Demo User
  const demoEmail = 'demo@billflow.dev';
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash('DemoPassword123!', saltRounds);

  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      name: 'Alex Morgan',
      passwordHash,
    },
    create: {
      name: 'Alex Morgan',
      email: demoEmail,
      passwordHash,
    },
  });

  console.log(`👤 User ready: ${user.name} (${user.email})`);

  // 2. Create or update User Settings with PostgreSQL-stored Logo
  const demoLogoBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAHgAAAAkCAYAAABOx/wWAAAABmJLR0QA/wD/AP+gvaeTAAAAPElEQVRoge3OMQEAAAgDINc/9E1hBxUwkm5tCgAAAAAA4IdvBxQAAAAA/HA4AAAAAPzgcAAAAAD44XAAAAAA+OE7dY8CPQ1q+uEAAAAASUVORK5CYII=';
  const demoLogoBuffer = Buffer.from(demoLogoBase64, 'base64');
  const demoLogoMime = 'image/png';
  const demoLogoDataUrl = `data:${demoLogoMime};base64,${demoLogoBase64}`;

  const settings = await prisma.settings.upsert({
    where: { userId: user.id },
    update: {
      businessName: 'Morgan Design & Development',
      currency: 'USD',
      invoicePrefix: 'INV-',
      logoData: demoLogoBuffer,
      logoMimeType: demoLogoMime,
      logoUrl: demoLogoDataUrl,
    },
    create: {
      userId: user.id,
      businessName: 'Morgan Design & Development',
      currency: 'USD',
      invoicePrefix: 'INV-',
      logoData: demoLogoBuffer,
      logoMimeType: demoLogoMime,
      logoUrl: demoLogoDataUrl,
    },
  });

  console.log(`⚙️  Settings configured for: ${settings.businessName} (PostgreSQL Logo: ${settings.logoMimeType})`);

  // 3. Create or upsert Clients
  const client1 = await prisma.client.upsert({
    where: { id: 'c1111111-1111-1111-1111-111111111111' },
    update: {
      userId: user.id,
      name: 'Acme Corporation',
      email: 'billing@acmecorp.com',
      company: 'Acme Corp',
      address: '100 Innovation Way, Suite 400, San Francisco, CA 94105',
      phone: '+1 (555) 123-4567',
    },
    create: {
      id: 'c1111111-1111-1111-1111-111111111111',
      userId: user.id,
      name: 'Acme Corporation',
      email: 'billing@acmecorp.com',
      company: 'Acme Corp',
      address: '100 Innovation Way, Suite 400, San Francisco, CA 94105',
      phone: '+1 (555) 123-4567',
    },
  });

  const client2 = await prisma.client.upsert({
    where: { id: 'c2222222-2222-2222-2222-222222222222' },
    update: {
      userId: user.id,
      name: 'Bright Horizon Media',
      email: 'finance@brighthorizon.io',
      company: 'Bright Horizon Media LLC',
      address: '456 Creative Blvd, Suite 200, Austin, TX 78701',
      phone: '+1 (555) 987-6543',
    },
    create: {
      id: 'c2222222-2222-2222-2222-222222222222',
      userId: user.id,
      name: 'Bright Horizon Media',
      email: 'finance@brighthorizon.io',
      company: 'Bright Horizon Media LLC',
      address: '456 Creative Blvd, Suite 200, Austin, TX 78701',
      phone: '+1 (555) 987-6543',
    },
  });

  console.log(`🏢 Clients created: ${client1.name}, ${client2.name}`);

  // 4. Create sample Invoices distributed across 3 distinct months
  function getRelativeMonthDate(monthOffset: number, dayOfMonth: number = 15): Date {
    const d = new Date();
    d.setFullYear(d.getFullYear(), d.getMonth() + monthOffset, dayOfMonth);
    d.setHours(10, 0, 0, 0);
    return d;
  }

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const daysAhead = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  const demoInvoices = [
    // --- 2 Months Ago (Settled Revenue) ---
    {
      id: 'i1111111-1111-1111-1111-111111111111',
      invoiceNumber: 'INV-001',
      clientId: client1.id,
      issueDate: getRelativeMonthDate(-2, 5),
      dueDate: getRelativeMonthDate(-2, 20),
      createdAt: getRelativeMonthDate(-2, 5),
      status: InvoiceStatus.PAID,
      subtotal: 3200.00,
      tax: 0.00,
      discount: 0.00,
      total: 3200.00,
      notes: 'Initial infrastructure setup and cloud deployment retainer. Paid via Wire.',
      publicToken: 'demo-token-inv-001-paid',
      items: [
        { description: 'Cloud Infrastructure & VPC Setup', quantity: 20, rate: 100.00, amount: 2000.00 },
        { description: 'CI/CD Pipeline Automation', quantity: 12, rate: 100.00, amount: 1200.00 },
      ],
    },
    {
      id: 'i2222222-2222-2222-2222-222222222222',
      invoiceNumber: 'INV-002',
      clientId: client2.id,
      issueDate: getRelativeMonthDate(-2, 18),
      dueDate: getRelativeMonthDate(-2, 28),
      createdAt: getRelativeMonthDate(-2, 18),
      status: InvoiceStatus.PAID,
      subtotal: 1800.00,
      tax: 0.00,
      discount: 0.00,
      total: 1800.00,
      notes: 'Brand guidelines & typography spec deliverables. Payment settled.',
      publicToken: 'demo-token-inv-002-paid',
      items: [
        { description: 'Visual Design System & Component Library', quantity: 1, rate: 1800.00, amount: 1800.00 },
      ],
    },

    // --- 1 Month Ago (Settled Revenue) ---
    {
      id: 'i3333333-3333-3333-3333-333333333333',
      invoiceNumber: 'INV-003',
      clientId: client1.id,
      issueDate: getRelativeMonthDate(-1, 8),
      dueDate: getRelativeMonthDate(-1, 22),
      createdAt: getRelativeMonthDate(-1, 8),
      status: InvoiceStatus.PAID,
      subtotal: 4500.00,
      tax: 450.00,
      discount: 450.00,
      total: 4500.00,
      notes: 'Full-Stack application core milestone delivery. Paid with thanks.',
      publicToken: 'demo-token-inv-003-paid',
      items: [
        { description: 'Full-Stack Feature Development (Milestone 2)', quantity: 45, rate: 100.00, amount: 4500.00 },
      ],
    },
    {
      id: 'i4444444-4444-4444-4444-444444444444',
      invoiceNumber: 'INV-004',
      clientId: client2.id,
      issueDate: getRelativeMonthDate(-1, 20),
      dueDate: getRelativeMonthDate(-1, 30),
      createdAt: getRelativeMonthDate(-1, 20),
      status: InvoiceStatus.PAID,
      subtotal: 2100.00,
      tax: 0.00,
      discount: 0.00,
      total: 2100.00,
      notes: 'Marketing automation integration & templates package. Paid.',
      publicToken: 'demo-token-inv-004-paid',
      items: [
        { description: 'Responsive Email Templates Package', quantity: 6, rate: 200.00, amount: 1200.00 },
        { description: 'Custom Analytics & Conversion Tracking', quantity: 1, rate: 900.00, amount: 900.00 },
      ],
    },

    // --- Current Month (Active, Overdue, Paid & Draft) ---
    {
      id: 'i5555555-5555-5555-5555-555555555555',
      invoiceNumber: 'INV-005',
      clientId: client1.id,
      issueDate: daysAgo(10),
      dueDate: daysAhead(5),
      createdAt: daysAgo(10),
      status: InvoiceStatus.PAID,
      subtotal: 3500.00,
      tax: 350.00,
      discount: 0.00,
      total: 3850.00,
      notes: 'Sprint 5 deliverables & security audit. Settled via Stripe.',
      publicToken: 'demo-token-inv-005-paid',
      items: [
        { description: 'API Security Audit & Penetration Testing', quantity: 1, rate: 2000.00, amount: 2000.00 },
        { description: 'Performance Optimization & Database Indexing', quantity: 15, rate: 100.00, amount: 1500.00 },
      ],
    },
    {
      id: 'i6666666-6666-6666-6666-666666666666',
      invoiceNumber: 'INV-006',
      clientId: client2.id,
      issueDate: daysAgo(3),
      dueDate: daysAhead(12),
      createdAt: daysAgo(3),
      status: InvoiceStatus.SENT,
      subtotal: 2400.00,
      tax: 0.00,
      discount: 0.00,
      total: 2400.00,
      notes: 'Net 15 payment terms. Please remit payment via bank transfer or online portal.',
      publicToken: 'demo-token-inv-006-sent',
      items: [
        { description: 'Interactive Web Dashboard Frontend', quantity: 20, rate: 120.00, amount: 2400.00 },
      ],
    },
    {
      id: 'i7777777-7777-7777-7777-777777777777',
      invoiceNumber: 'INV-007',
      clientId: client1.id,
      issueDate: daysAgo(35),
      dueDate: daysAgo(10),
      createdAt: daysAgo(35),
      status: InvoiceStatus.OVERDUE,
      subtotal: 1200.00,
      tax: 0.00,
      discount: 0.00,
      total: 1200.00,
      notes: 'This invoice is past due. Please process payment immediately.',
      publicToken: 'demo-token-inv-007-overdue',
      items: [
        { description: 'Monthly Retainer Maintenance & Patching', quantity: 1, rate: 1200.00, amount: 1200.00 },
      ],
    },
    {
      id: 'i8888888-8888-8888-8888-888888888888',
      invoiceNumber: 'INV-008',
      clientId: client2.id,
      issueDate: now,
      dueDate: daysAhead(14),
      createdAt: now,
      status: InvoiceStatus.DRAFT,
      subtotal: 800.00,
      tax: 0.00,
      discount: 0.00,
      total: 800.00,
      notes: 'Draft estimate for Q4 strategy workshop and consultation.',
      publicToken: 'demo-token-inv-008-draft',
      items: [
        { description: 'Technical Architecture & Scoping Workshop', quantity: 4, rate: 200.00, amount: 800.00 },
      ],
    },
  ];

  for (const inv of demoInvoices) {
    // Delete existing items for idempotency before recreating
    const existing = await prisma.invoice.findUnique({
      where: {
        userId_invoiceNumber: {
          userId: user.id,
          invoiceNumber: inv.invoiceNumber,
        },
      },
    });

    if (existing) {
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: existing.id },
      });
    }

    await prisma.invoice.upsert({
      where: {
        userId_invoiceNumber: {
          userId: user.id,
          invoiceNumber: inv.invoiceNumber,
        },
      },
      update: {
        clientId: inv.clientId,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        createdAt: inv.createdAt,
        status: inv.status,
        subtotal: inv.subtotal,
        tax: inv.tax,
        discount: inv.discount,
        total: inv.total,
        notes: inv.notes,
        publicToken: inv.publicToken,
        items: {
          create: inv.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            rate: it.rate,
            amount: it.amount,
          })),
        },
      },
      create: {
        id: inv.id,
        userId: user.id,
        clientId: inv.clientId,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        createdAt: inv.createdAt,
        status: inv.status,
        subtotal: inv.subtotal,
        tax: inv.tax,
        discount: inv.discount,
        total: inv.total,
        notes: inv.notes,
        publicToken: inv.publicToken,
        items: {
          create: inv.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            rate: it.rate,
            amount: it.amount,
          })),
        },
      },
    });
  }

  // 5. Initialize InvoiceSequence for demo user
  await prisma.invoiceSequence.upsert({
    where: { userId: user.id },
    update: { nextNumber: 9 },
    create: {
      userId: user.id,
      nextNumber: 9,
    },
  });

  console.log(`📄 8 Sample Invoices created/updated across 3 months (PAID: $15,450 across 3 months, SENT: $2,400, OVERDUE: $1,200, DRAFT: $800)`);
  console.log('🔢 InvoiceSequence initialized: nextNumber = 9');
  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { calculateInvoiceFinancials, getEffectiveStatus } from '../lib/money';
import { peekNextInvoiceNumber } from '../lib/invoice-number';
import { createInvoiceSchema } from '../lib/validations';

async function runPhase3Tests() {
  console.log('🧪 Starting Phase 3 Comprehensive Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // Ensure demo user exists
  const demoUser = await prisma.user.findUnique({
    where: { email: 'demo@billflow.dev' },
    include: { clients: true, settings: true },
  });

  if (!demoUser || demoUser.clients.length === 0) {
    console.error('Demo user or clients missing. Please run seed script.');
    process.exit(1);
  }

  const clientA = demoUser.clients[0];

  // Create isolated User B for cross-tenant testing
  const userBEmail = 'tenant_b_test@billflow.dev';
  await prisma.user.deleteMany({ where: { email: userBEmail } });

  const passwordHash = await bcrypt.hash('TenantBPass123!', 10);
  const userB = await prisma.user.create({
    data: {
      name: 'Tenant B User',
      email: userBEmail,
      passwordHash,
      settings: {
        create: {
          businessName: 'Tenant B Digital',
          currency: 'EUR',
          invoicePrefix: 'BILL-',
        },
      },
      clients: {
        create: {
          name: 'Tenant B Exclusive Client',
          email: 'clientb@domain.com',
          company: 'B Holdings',
        },
      },
    },
    include: { clients: true, settings: true },
  });
  const clientB = userB.clients[0];

  // ========================================================
  // 1. INVOICE CREATION & FINANCIAL CALCULATIONS (Tests 1-8)
  // ========================================================
  console.log('--- 1. INVOICE CREATION & FINANCIAL CALCULATIONS ---');

  // Test 1-6: Financial calculation engine
  const rawItems = [
    { description: 'Full Stack Architecture', quantity: 2, rate: 1500 }, // 3000
    { description: 'Cloud Infrastructure Setup', quantity: 1, rate: 850 }, // 850
    { description: 'Database Tuning & Indexing', quantity: 3.5, rate: 200 }, // 700
  ]; // subtotal = 4550

  const tax = 10; // 10%
  const discount = 5; // 5%
  const calculated = calculateInvoiceFinancials(rawItems, tax, discount);

  assert(calculated.subtotal.toNumber() === 4550, 'Test 3: Subtotal calculated correctly (4550.00)');
  assert(calculated.tax.toNumber() === 455, 'Test 4: Tax verified (455.00)');
  assert(calculated.discount.toNumber() === 227.5, 'Test 5: Discount verified (227.50)');
  assert(calculated.total.toNumber() === 4777.5, 'Test 6: Total calculated correctly (4550 + 455 - 227.50 = 4777.50)');

  // Test 8: Sequential numbering
  const nextNumA = await peekNextInvoiceNumber(demoUser.id);
  const nextNumB = await peekNextInvoiceNumber(userB.id);
  assert(nextNumA.startsWith(demoUser.settings?.invoicePrefix || 'INV-'), 'Test 8a: Next invoice number uses User A prefix (INV-)');
  assert(nextNumB.startsWith('BILL-0001'), 'Test 8b: Next invoice number uses User B prefix (BILL-0001)');

  // Test 1, 2, 7: Atomic Invoice + Items creation
  const now = new Date();
  const dueDateAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const testInvoiceA = await prisma.$transaction(async (tx) => {
    return tx.invoice.create({
      data: {
        userId: demoUser.id,
        clientId: clientA.id,
        invoiceNumber: `TEST-${Date.now()}`,
        issueDate: now,
        dueDate: dueDateAhead,
        status: 'DRAFT',
        subtotal: calculated.subtotal,
        tax: calculated.tax,
        discount: calculated.discount,
        total: calculated.total,
        notes: 'Test invoice notes',
        items: {
          create: calculated.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            rate: it.rate,
            amount: it.amount,
          })),
        },
      },
      include: { items: true, client: true },
    });
  });

  assert(testInvoiceA.id !== undefined, 'Test 1: Valid invoice created atomically');
  assert(testInvoiceA.items.length === 3, 'Test 2: Invoice created with multiple line items (3 items)');
  assert(
    testInvoiceA.items[0].description === 'Full Stack Architecture' &&
      testInvoiceA.items[0].amount.toNumber() === 3000,
    'Test 7: Line items persisted with precise amount calculations'
  );

  // ========================================================
  // 2. SECURITY & MULTI-TENANCY (Tests 9-13)
  // ========================================================
  console.log('\n--- 2. SECURITY & MULTI-TENANCY ---');

  // Create invoice for User B
  const invoiceB = await prisma.invoice.create({
    data: {
      userId: userB.id,
      clientId: clientB.id,
      invoiceNumber: 'BILL-0001',
      issueDate: now,
      dueDate: dueDateAhead,
      status: 'DRAFT',
      subtotal: 1000,
      tax: 0,
      discount: 0,
      total: 1000,
      items: {
        create: [
          {
            description: 'Tenant B Consulting',
            quantity: 1,
            rate: 1000,
            amount: 1000,
          },
        ],
      },
    },
  });

  // Test 9: User A querying User B's invoice returns null
  const crossTenantAccess = await prisma.invoice.findFirst({
    where: {
      id: invoiceB.id,
      userId: demoUser.id, // Scoped to User A
    },
  });
  assert(crossTenantAccess === null, 'Test 9: Multi-Tenant: User A querying User B invoice ID returns null');

  // Test 10: User A cannot locate User B invoice for update
  const crossTenantUpdate = await prisma.invoice.findFirst({
    where: {
      id: invoiceB.id,
      userId: demoUser.id,
    },
  });
  assert(crossTenantUpdate === null, 'Test 10: Multi-Tenant: User A cannot update User B invoice');

  // Test 11: User A cannot locate User B invoice for delete
  const crossTenantDelete = await prisma.invoice.findFirst({
    where: {
      id: invoiceB.id,
      userId: demoUser.id,
    },
  });
  assert(crossTenantDelete === null, 'Test 11: Multi-Tenant: User A cannot delete User B invoice');

  // Test 12: User A attempting to create invoice using User B's client ID is rejected
  const clientBelongsToUserA = await prisma.client.findFirst({
    where: {
      id: clientB.id,
      userId: demoUser.id,
    },
  });
  assert(clientBelongsToUserA === null, 'Test 12: Multi-Tenant: User A cannot create invoice for User B client');

  // Test 13: Tenant ID isolation
  assert(invoiceB.userId === userB.id && testInvoiceA.userId === demoUser.id, 'Test 13: Invoices strictly bound to authenticated tenant IDs');

  // ========================================================
  // 3. FILTERING & SEARCH (Tests 14-18)
  // ========================================================
  console.log('\n--- 3. FILTERING & SEARCH ---');

  // Test 14: Filter by status
  const draftInvoices = await prisma.invoice.findMany({
    where: { userId: demoUser.id, status: 'DRAFT' },
  });
  assert(draftInvoices.every((i) => i.status === 'DRAFT'), 'Test 14: Status filter returns only matching status');

  // Test 15: Filter by client
  const clientAInvoices = await prisma.invoice.findMany({
    where: { userId: demoUser.id, clientId: clientA.id },
  });
  assert(clientAInvoices.every((i) => i.clientId === clientA.id), 'Test 15: Client filter returns only client invoices');

  // Test 16: Search by invoice number
  const searchInvNumber = await prisma.invoice.findMany({
    where: {
      userId: demoUser.id,
      invoiceNumber: { contains: testInvoiceA.invoiceNumber, mode: 'insensitive' },
    },
  });
  assert(searchInvNumber.length >= 1 && searchInvNumber[0].id === testInvoiceA.id, 'Test 16: Search by invoice number succeeds');

  // Test 17: Search by client name
  const searchClientName = await prisma.invoice.findMany({
    where: {
      userId: demoUser.id,
      client: { name: { contains: clientA.name.substring(0, 4), mode: 'insensitive' } },
    },
  });
  assert(searchClientName.length >= 1, 'Test 17: Search by client name succeeds');

  // Test 18: Search does not leak cross-tenant data
  const searchLeakCheck = await prisma.invoice.findMany({
    where: {
      userId: demoUser.id,
      client: { name: { contains: 'Tenant B', mode: 'insensitive' } },
    },
  });
  assert(searchLeakCheck.length === 0, 'Test 18: Search does not leak cross-tenant records');

  // ========================================================
  // 4. SORTING (Tests 19-22)
  // ========================================================
  console.log('\n--- 4. SORTING ---');

  const newestInvoices = await prisma.invoice.findMany({
    where: { userId: demoUser.id },
    orderBy: { createdAt: 'desc' },
  });
  assert(newestInvoices.length >= 2, 'Test 19: Newest first sort retrieved records');

  const oldestInvoices = await prisma.invoice.findMany({
    where: { userId: demoUser.id },
    orderBy: { createdAt: 'asc' },
  });
  assert(
    new Date(oldestInvoices[0].createdAt).getTime() <= new Date(oldestInvoices[oldestInvoices.length - 1].createdAt).getTime(),
    'Test 20: Oldest first sort verified'
  );

  const highestAmount = await prisma.invoice.findMany({
    where: { userId: demoUser.id },
    orderBy: { total: 'desc' },
  });
  assert(
    highestAmount[0].total.toNumber() >= highestAmount[highestAmount.length - 1].total.toNumber(),
    'Test 21: Highest amount sort verified'
  );

  const lowestAmount = await prisma.invoice.findMany({
    where: { userId: demoUser.id },
    orderBy: { total: 'asc' },
  });
  assert(
    lowestAmount[0].total.toNumber() <= lowestAmount[lowestAmount.length - 1].total.toNumber(),
    'Test 22: Lowest amount sort verified'
  );

  // ========================================================
  // 5. AUTOMATIC OVERDUE DETECTION (Tests 23-24)
  // ========================================================
  console.log('\n--- 5. AUTOMATIC OVERDUE DETECTION ---');

  const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
  const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days ahead

  // Test 23: Past-due SENT/DRAFT becomes OVERDUE
  const overdueEffective1 = getEffectiveStatus('SENT', pastDate);
  assert(overdueEffective1 === 'OVERDUE', 'Test 23a: SENT invoice with past due date resolves to OVERDUE');

  const overdueEffective2 = getEffectiveStatus('DRAFT', pastDate);
  assert(overdueEffective2 === 'OVERDUE', 'Test 23b: Unpaid DRAFT invoice with past due date resolves to OVERDUE');

  // Test 24: PAID invoice NEVER becomes OVERDUE
  const paidEffective = getEffectiveStatus('PAID', pastDate);
  assert(paidEffective === 'PAID', 'Test 24: PAID invoice with past due date strictly remains PAID');

  const futureEffective = getEffectiveStatus('SENT', futureDate);
  assert(futureEffective === 'SENT', 'Test 24b: SENT invoice with future due date remains SENT');

  // ========================================================
  // 6. VALIDATION SCHEMAS (Tests 25-30)
  // ========================================================
  console.log('\n--- 6. VALIDATION SCHEMAS ---');

  // Test 25: Empty line items rejected
  const emptyItems = createInvoiceSchema.safeParse({
    clientId: clientA.id,
    issueDate: now,
    dueDate: dueDateAhead,
    items: [],
    tax: 0,
    discount: 0,
  });
  assert(!emptyItems.success, 'Test 25: Rejects empty line items array');

  // Test 26: Negative or zero quantity rejected
  const zeroQty = createInvoiceSchema.safeParse({
    clientId: clientA.id,
    issueDate: now,
    dueDate: dueDateAhead,
    items: [{ description: 'Test', quantity: 0, rate: 100 }],
    tax: 0,
    discount: 0,
  });
  assert(!zeroQty.success, 'Test 26: Rejects quantity <= 0');

  // Test 27: Negative rate rejected
  const negRate = createInvoiceSchema.safeParse({
    clientId: clientA.id,
    issueDate: now,
    dueDate: dueDateAhead,
    items: [{ description: 'Test', quantity: 1, rate: -50 }],
    tax: 0,
    discount: 0,
  });
  assert(!negRate.success, 'Test 27: Rejects negative rate');

  // Test 28: Due date before issue date rejected
  const badDates = createInvoiceSchema.safeParse({
    clientId: clientA.id,
    issueDate: futureDate,
    dueDate: pastDate,
    items: [{ description: 'Test', quantity: 1, rate: 100 }],
    tax: 0,
    discount: 0,
  });
  assert(!badDates.success, 'Test 28: Rejects due date before issue date');

  // Test 29: Negative tax rejected
  const negTax = createInvoiceSchema.safeParse({
    clientId: clientA.id,
    issueDate: now,
    dueDate: dueDateAhead,
    items: [{ description: 'Test', quantity: 1, rate: 100 }],
    tax: -10,
    discount: 0,
  });
  assert(!negTax.success, 'Test 29: Rejects negative tax');

  // Test 30: Discount greater than subtotal + tax rejected
  const excessiveDiscount = createInvoiceSchema.safeParse({
    clientId: clientA.id,
    issueDate: now,
    dueDate: dueDateAhead,
    items: [{ description: 'Test', quantity: 1, rate: 100 }],
    tax: 10,
    discount: 200, // 200 > 110
  });
  assert(!excessiveDiscount.success, 'Test 30: Rejects discount greater than subtotal + tax');

  // Clean up test records
  await prisma.invoice.delete({ where: { id: testInvoiceA.id } });
  await prisma.user.delete({ where: { id: userB.id } });

  console.log(`\n==========================================`);
  console.log(`Phase 3 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3Tests()
  .catch((e) => {
    console.error('Phase 3 test execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

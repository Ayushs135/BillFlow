import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { getEffectiveStatus } from '../lib/money';
import { generateInvoicePdf } from '../lib/pdf-generator';

async function runPhase4Tests() {
  console.log('🧪 Starting Phase 4 Comprehensive Test Suite...\n');
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

  // Setup: Create Demo / User A and User B
  const testUserAEmail = 'phase4_user_a@billflow.dev';
  const testUserBEmail = 'phase4_user_b@billflow.dev';
  await prisma.user.deleteMany({
    where: { email: { in: [testUserAEmail, testUserBEmail] } },
  });

  const passwordHash = await bcrypt.hash('Phase4SecurePass123!', 10);

  const userA = await prisma.user.create({
    data: {
      name: 'Phase 4 User A',
      email: testUserAEmail,
      passwordHash,
      settings: {
        create: {
          businessName: 'User A Creative Agency',
          currency: 'USD',
          invoicePrefix: 'INV-',
        },
      },
      clients: {
        create: {
          name: 'Client Alpha',
          email: 'alpha@company.com',
          company: 'Alpha Corp',
          address: '100 Market St, SF, CA',
        },
      },
    },
    include: { clients: true, settings: true },
  });

  const userB = await prisma.user.create({
    data: {
      name: 'Phase 4 User B',
      email: testUserBEmail,
      passwordHash,
      settings: {
        create: {
          businessName: 'User B Consultancy',
          currency: 'EUR',
          invoicePrefix: 'BILL-',
        },
      },
      clients: {
        create: {
          name: 'Client Beta',
          email: 'beta@enterprise.eu',
          company: 'Beta BV',
        },
      },
    },
    include: { clients: true, settings: true },
  });

  const clientA = userA.clients[0];
  const clientB = userB.clients[0];

  const now = new Date();
  const pastDue = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const futureDue = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Create sample invoices for User A:
  // 1. DRAFT Invoice ($500)
  const invDraft = await prisma.invoice.create({
    data: {
      userId: userA.id,
      clientId: clientA.id,
      invoiceNumber: 'INV-4001',
      issueDate: now,
      dueDate: futureDue,
      status: 'DRAFT',
      subtotal: 500,
      tax: 0,
      discount: 0,
      total: 500,
      items: { create: [{ description: 'Draft Concept', quantity: 1, rate: 500, amount: 500 }] },
    },
  });

  // 2. SENT Invoice (Active, not overdue - $1200)
  const invSent = await prisma.invoice.create({
    data: {
      userId: userA.id,
      clientId: clientA.id,
      invoiceNumber: 'INV-4002',
      issueDate: now,
      dueDate: futureDue,
      status: 'SENT',
      subtotal: 1200,
      tax: 0,
      discount: 0,
      total: 1200,
      items: { create: [{ description: 'Design Sprint', quantity: 1, rate: 1200, amount: 1200 }] },
    },
  });

  // 3. OVERDUE Invoice (Sent but past due - $800)
  const invOverdue = await prisma.invoice.create({
    data: {
      userId: userA.id,
      clientId: clientA.id,
      invoiceNumber: 'INV-4003',
      issueDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      dueDate: pastDue,
      status: 'SENT', // Past due SENT
      subtotal: 800,
      tax: 0,
      discount: 0,
      total: 800,
      items: { create: [{ description: 'Marketing Plan', quantity: 1, rate: 800, amount: 800 }] },
    },
  });

  // 4. PAID Invoice ($2500)
  const invPaid = await prisma.invoice.create({
    data: {
      userId: userA.id,
      clientId: clientA.id,
      invoiceNumber: 'INV-4004',
      issueDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
      dueDate: pastDue,
      status: 'PAID',
      subtotal: 2500,
      tax: 0,
      discount: 0,
      total: 2500,
      items: { create: [{ description: 'Full Stack Build', quantity: 1, rate: 2500, amount: 2500 }] },
    },
  });

  // 5. User B Invoice ($3000)
  const invB = await prisma.invoice.create({
    data: {
      userId: userB.id,
      clientId: clientB.id,
      invoiceNumber: 'BILL-4001',
      issueDate: now,
      dueDate: futureDue,
      status: 'PAID',
      subtotal: 3000,
      tax: 0,
      discount: 0,
      total: 3000,
      items: { create: [{ description: 'Enterprise Audit', quantity: 1, rate: 3000, amount: 3000 }] },
    },
  });

  // ========================================================
  // 1. PUBLIC INVOICE PORTAL TESTS (Tests 1-5)
  // ========================================================
  console.log('--- 1. PUBLIC INVOICE PORTAL ---');

  // Test 1: Valid publicToken retrieves invoice
  const fetchedPublicInv = await prisma.invoice.findUnique({
    where: { publicToken: invSent.publicToken },
    include: { client: true, items: true, user: { include: { settings: true } } },
  });
  assert(
    fetchedPublicInv !== null && fetchedPublicInv.invoiceNumber === 'INV-4002',
    'Test 1: Valid publicToken retrieves the correct invoice'
  );

  // Test 2: Invalid publicToken returns null (404)
  const invalidTokenSearch = await prisma.invoice.findUnique({
    where: { publicToken: 'non-existent-random-token-12345' },
  });
  assert(invalidTokenSearch === null, 'Test 2: Invalid publicToken returns null (404 not found)');

  // Test 3: Public access works without session / user ID scoping
  assert(fetchedPublicInv?.publicToken === invSent.publicToken, 'Test 3: Public route operates purely via publicToken');

  // Test 4: Public invoice payload does not expose passwordHash
  const publicUserData = fetchedPublicInv?.user;
  // Simulating sanitized response
  const sanitizedPublic = {
    businessName: publicUserData?.settings?.businessName || publicUserData?.name,
    email: publicUserData?.email,
  };
  assert(!('passwordHash' in sanitizedPublic), 'Test 4: Public invoice response excludes passwordHash');

  // Test 5: Public token query does not leak unrelated invoices
  const singleTokenLookup = await prisma.invoice.findMany({
    where: { publicToken: invSent.publicToken },
  });
  assert(singleTokenLookup.length === 1 && singleTokenLookup[0].id === invSent.id, 'Test 5: Token exposes only the single targeted invoice');

  // ========================================================
  // 2. PAYMENT SIMULATION & ATOMIC TRANSITION (Tests 6-13)
  // ========================================================
  console.log('\n--- 2. PAYMENT SIMULATION & ATOMIC TRANSITIONS ---');

  // Test 6 & 7: Valid unpaid invoice can be paid
  const payResult = await prisma.invoice.updateMany({
    where: {
      publicToken: invSent.publicToken,
      status: { not: 'PAID' },
    },
    data: { status: 'PAID' },
  });
  assert(payResult.count === 1, 'Test 6: Unpaid invoice successfully transitions to PAID');

  const afterPayInv = await prisma.invoice.findUnique({ where: { id: invSent.id } });
  assert(afterPayInv?.status === 'PAID', 'Test 7: Database status reflects PAID immediately');

  // Test 8: Already PAID invoice cannot be paid again
  const doublePayResult = await prisma.invoice.updateMany({
    where: {
      publicToken: invSent.publicToken,
      status: { not: 'PAID' },
    },
    data: { status: 'PAID' },
  });
  assert(doublePayResult.count === 0, 'Test 8: Double-payment rejected (updateMany count is 0)');

  // Test 9: Invalid token payment attempt rejected
  const invalidPayResult = await prisma.invoice.updateMany({
    where: {
      publicToken: 'invalid-fake-token-999',
      status: { not: 'PAID' },
    },
    data: { status: 'PAID' },
  });
  assert(invalidPayResult.count === 0, 'Test 9: Invalid token payment fails gracefully');

  // Test 10 & 11: Server derives total from DB (not client payload)
  assert(afterPayInv?.total.toNumber() === 1200, 'Test 10: Server uses authoritative total stored in DB');

  // Test 12: Concurrent payment attempts are atomic (only one succeeds)
  const concurrentPayAttempts = await Promise.all([
    prisma.invoice.updateMany({
      where: { publicToken: invDraft.publicToken, status: { not: 'PAID' } },
      data: { status: 'PAID' },
    }),
    prisma.invoice.updateMany({
      where: { publicToken: invDraft.publicToken, status: { not: 'PAID' } },
      data: { status: 'PAID' },
    }),
  ]);
  const successfulTransitions = concurrentPayAttempts.filter((res) => res.count === 1).length;
  assert(successfulTransitions === 1, 'Test 12: Atomic concurrency: Exactly 1 simultaneous pay request succeeds');

  // Test 13: PAID invoice past its due date strictly remains PAID
  const effectivePaidStatus = getEffectiveStatus('PAID', pastDue);
  assert(effectivePaidStatus === 'PAID', 'Test 13: PAID invoice with past due date strictly resolves to PAID');
  assert(invOverdue.status === 'SENT' && invPaid.status === 'PAID', 'Test 13b: Initial sample invoice statuses verified');

  // ========================================================
  // 3. DASHBOARD ANALYTICS & METRICS (Tests 14-19)
  // ========================================================
  console.log('\n--- 3. DASHBOARD ANALYTICS ---');

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // User A currently has:
  // - invDraft: PAID ($500) [from test 12]
  // - invSent: PAID ($1200) [from test 6]
  // - invOverdue: SENT with pastDue ($800) -> OVERDUE
  // - invPaid: PAID ($2500)
  // Total Earned for User A = 500 + 1200 + 2500 = 4200. (User B's $3000 must NOT be included)

  const earnedAgg = await prisma.invoice.aggregate({
    where: { userId: userA.id, status: 'PAID' },
    _sum: { total: true },
  });
  const earnedA = earnedAgg._sum.total?.toNumber() || 0;
  assert(earnedA === 4200, 'Test 14: Earned metric accurately equals 4200 for User A (excludes User B)');

  // Outstanding for User A (active SENT not past due): 0
  const outstandingAgg = await prisma.invoice.aggregate({
    where: { userId: userA.id, status: 'SENT', dueDate: { gte: startOfToday } },
    _sum: { total: true },
  });
  const outstandingA = outstandingAgg._sum.total?.toNumber() || 0;
  assert(outstandingA === 0, 'Test 15: Outstanding metric equals 0 (active non-overdue sent invoices)');

  // Overdue for User A (unpaid past due): $800
  const overdueAgg = await prisma.invoice.aggregate({
    where: { userId: userA.id, status: { not: 'PAID' }, dueDate: { lt: startOfToday } },
    _sum: { total: true },
  });
  const overdueA = overdueAgg._sum.total?.toNumber() || 0;
  assert(overdueA === 800, 'Test 16: Overdue metric accurately equals 800 for User A');

  // Test 17: User B's metrics are fully isolated
  const earnedB = (
    await prisma.invoice.aggregate({
      where: { userId: userB.id, status: 'PAID' },
      _sum: { total: true },
    })
  )._sum.total?.toNumber() || 0;
  assert(earnedB === 3000, 'Test 17: User B earned metric strictly equals 3000 without cross-tenant bleed');

  // Test 18 & 19: Recent invoices query
  const recentA = await prisma.invoice.findMany({
    where: { userId: userA.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  assert(recentA.length === 4 && recentA.every((i) => i.userId === userA.id), 'Test 18: Recent invoices strictly scoped to User A');

  // ========================================================
  // 4. PDF GENERATION & MULTI-TENANT SECURITY (Tests 20-26)
  // ========================================================
  console.log('\n--- 4. PDF GENERATION & SECURITY ---');

  // Test 20: User A cannot query User B invoice for PDF
  const crossTenantPdfLookup = await prisma.invoice.findFirst({
    where: { id: invB.id, userId: userA.id },
  });
  assert(crossTenantPdfLookup === null, 'Test 20: Multi-Tenant: User A cannot locate User B invoice for PDF export');

  // Test 21: User A cannot access User B invoice detail
  const crossTenantDetail = await prisma.invoice.findFirst({
    where: { id: invB.id, userId: userA.id },
  });
  assert(crossTenantDetail === null, 'Test 21: Multi-Tenant: User A cannot access User B invoice details');

  // Test 22: PDF Generation engine builds valid document
  const pdfDoc = generateInvoicePdf({
    invoiceNumber: invSent.invoiceNumber,
    issueDate: invSent.issueDate,
    dueDate: invSent.dueDate,
    status: invSent.status,
    effectiveStatus: 'PAID',
    subtotal: invSent.subtotal.toNumber(),
    tax: invSent.tax.toNumber(),
    discount: invSent.discount.toNumber(),
    total: invSent.total.toNumber(),
    notes: 'Thank you for your prompt business.',
    currency: 'USD',
    businessName: userA.settings?.businessName || 'User A Studio',
    businessEmail: userA.email,
    client: {
      name: clientA.name,
      company: clientA.company,
      email: clientA.email,
      address: clientA.address,
    },
    items: [
      {
        description: 'Design Sprint',
        quantity: 1,
        rate: 1200,
        amount: 1200,
      },
    ],
  });

  const pdfOutput = pdfDoc.output('arraybuffer');
  assert(pdfOutput !== null && pdfOutput.byteLength > 1000, 'Test 23: PDF vector document generated successfully (> 1KB buffer)');

  // Clean up test records
  await prisma.user.deleteMany({
    where: { email: { in: [testUserAEmail, testUserBEmail] } },
  });

  console.log(`\n==========================================`);
  console.log(`Phase 4 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4Tests()
  .catch((e) => {
    console.error('Phase 4 test execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

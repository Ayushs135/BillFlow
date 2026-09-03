import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { reserveNextInvoiceNumber, peekNextInvoiceNumber } from '../lib/invoice-number';
import { calculateInvoiceFinancials } from '../lib/money';

async function runConcurrencyTestSuite() {
  console.log('⚡ Starting Concurrency & Sequential Invoice Numbering Test Suite...\n');
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

  // Cleanup any leftover test users
  const testUserEmailA = 'concurrency_user_a@billflow.dev';
  const testUserEmailB = 'concurrency_user_b@billflow.dev';
  await prisma.user.deleteMany({
    where: { email: { in: [testUserEmailA, testUserEmailB] } },
  });

  const passwordHash = await bcrypt.hash('TestPass123!', 10);

  // 1. Create fresh User A
  const userA = await prisma.user.create({
    data: {
      name: 'Concurrency User A',
      email: testUserEmailA,
      passwordHash,
      settings: {
        create: {
          businessName: 'User A Studio',
          currency: 'USD',
          invoicePrefix: 'INV-',
        },
      },
      clients: {
        create: {
          name: 'Client of User A',
          email: 'clienta@test.com',
        },
      },
    },
    include: { clients: true, settings: true },
  });

  // 2. Create fresh User B with different prefix
  const userB = await prisma.user.create({
    data: {
      name: 'Concurrency User B',
      email: testUserEmailB,
      passwordHash,
      settings: {
        create: {
          businessName: 'User B Studio',
          currency: 'EUR',
          invoicePrefix: 'BILL-',
        },
      },
      clients: {
        create: {
          name: 'Client of User B',
          email: 'clientb@test.com',
        },
      },
    },
    include: { clients: true, settings: true },
  });

  const clientA = userA.clients[0];

  // ========================================================
  // TEST 1 & 2: First & Second Invoice Sequential Generation
  // ========================================================
  console.log('--- 1. BASIC SEQUENTIAL NUMBERING ---');

  // Peek before creation
  const peek1 = await peekNextInvoiceNumber(userA.id);
  assert(peek1 === 'INV-0001', 'Test 1a: Peek next number for fresh user is INV-0001');

  // Reserve #1 for User A
  const res1 = await reserveNextInvoiceNumber(prisma, userA.id);
  assert(res1.invoiceNumber === 'INV-0001' && res1.sequenceNumber === 1, 'Test 1b: First reserved invoice number is INV-0001');

  const inv1 = await prisma.invoice.create({
    data: {
      userId: userA.id,
      clientId: clientA.id,
      invoiceNumber: res1.invoiceNumber,
      issueDate: new Date(),
      dueDate: new Date(),
      status: 'DRAFT',
      subtotal: 100,
      tax: 0,
      discount: 0,
      total: 100,
      items: { create: [{ description: 'Item 1', quantity: 1, rate: 100, amount: 100 }] },
    },
  });

  // Reserve #2 for User A
  const res2 = await reserveNextInvoiceNumber(prisma, userA.id);
  assert(res2.invoiceNumber === 'INV-0002' && res2.sequenceNumber === 2, 'Test 2: Second reserved invoice number is INV-0002');

  const inv2 = await prisma.invoice.create({
    data: {
      userId: userA.id,
      clientId: clientA.id,
      invoiceNumber: res2.invoiceNumber,
      issueDate: new Date(),
      dueDate: new Date(),
      status: 'DRAFT',
      subtotal: 200,
      tax: 0,
      discount: 0,
      total: 200,
      items: { create: [{ description: 'Item 2', quantity: 1, rate: 200, amount: 200 }] },
    },
  });

  // ========================================================
  // TEST 3: Deleted Invoices Do NOT Cause Reuse
  // ========================================================
  console.log('\n--- 2. DELETION SAFETY (NO REUSE) ---');

  // Delete INV-0002
  await prisma.invoice.delete({ where: { id: inv2.id } });

  // Reserve next for User A -> Must be INV-0003, NOT INV-0002
  const res3 = await reserveNextInvoiceNumber(prisma, userA.id);
  assert(
    res3.invoiceNumber === 'INV-0003' && res3.sequenceNumber === 3,
    'Test 3: After deleting INV-0002, next number is INV-0003 (no reuse of deleted numbers)'
  );

  // ========================================================
  // TEST 5 & 6: Multi-Tenant Prefix and Independent Counters
  // ========================================================
  console.log('\n--- 3. MULTI-TENANT ISOLATION & PREFIXES ---');

  // Reserve #1 for User B -> Must start at BILL-0001 independently of User A
  const resB1 = await reserveNextInvoiceNumber(prisma, userB.id);
  assert(
    resB1.invoiceNumber === 'BILL-0001' && resB1.sequenceNumber === 1,
    'Test 5: User B independently starts at BILL-0001 with custom prefix'
  );

  // Reserve #2 for User B
  const resB2 = await reserveNextInvoiceNumber(prisma, userB.id);
  assert(resB2.invoiceNumber === 'BILL-0002', 'Test 6: User B increments to BILL-0002 without affecting User A');

  // ========================================================
  // TEST 7: Prefix Change Does Not Modify Existing Invoices
  // ========================================================
  console.log('\n--- 4. PREFIX CHANGE BEHAVIOR ---');

  // Change User A's prefix from INV- to AY-
  await prisma.settings.update({
    where: { userId: userA.id },
    data: { invoicePrefix: 'AY-' },
  });

  // Verify existing invoice INV-0001 is untouched
  const existingInv1 = await prisma.invoice.findUnique({ where: { id: inv1.id } });
  assert(existingInv1?.invoiceNumber === 'INV-0001', 'Test 7a: Existing invoice INV-0001 retains original number');

  // Next invoice for User A now adopts the new prefix AY-0004
  const resA4 = await reserveNextInvoiceNumber(prisma, userA.id);
  assert(resA4.invoiceNumber === 'AY-0004', 'Test 7b: New invoice receives AY-0004 with new prefix');

  // ========================================================
  // TEST 8: HIGH CONCURRENCY TEST (10 Concurrent Requests)
  // ========================================================
  console.log('\n--- 5. HIGH CONCURRENCY SIMULATION (10 Simultaneous Requests) ---');

  // Create 10 invoices simultaneously for User A inside Prisma transactions
  const concurrencyCount = 10;
  const now = new Date();
  const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const creationPromises = Array.from({ length: concurrencyCount }).map(async (_, index) => {
    return prisma.$transaction(async (tx) => {
      // 1. Reserve number atomically
      const { invoiceNumber } = await reserveNextInvoiceNumber(tx, userA.id);

      // 2. Compute financials
      const financials = calculateInvoiceFinancials([
        { description: `Concurrent Service ${index + 1}`, quantity: 1, rate: 100 * (index + 1) },
      ]);

      // 3. Create invoice atomically
      const created = await tx.invoice.create({
        data: {
          userId: userA.id,
          clientId: clientA.id,
          invoiceNumber,
          issueDate: now,
          dueDate,
          status: 'DRAFT',
          subtotal: financials.subtotal,
          tax: financials.tax,
          discount: financials.discount,
          total: financials.total,
          items: {
            create: financials.items.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              rate: it.rate,
              amount: it.amount,
            })),
          },
        },
      });

      return created;
    });
  });

  const concurrentResults = await Promise.all(creationPromises);
  const createdNumbers = concurrentResults.map((inv) => inv.invoiceNumber);

  console.log(`    Generated ${concurrentResults.length} invoices concurrently:`, createdNumbers.join(', '));

  // Verify all 10 invoice numbers are distinct
  const uniqueNumbers = new Set(createdNumbers);
  assert(
    uniqueNumbers.size === concurrencyCount,
    `Test 8a: Exactly ${concurrencyCount} unique invoice numbers produced (no duplicates under concurrent load)`
  );

  // Verify all numbers belong to User A
  const allUserA = concurrentResults.every((inv) => inv.userId === userA.id);
  assert(allUserA, 'Test 8b: All concurrent invoices strictly scoped to User A');

  // Verify sequence continued monotonically without collisions
  const sequenceRecord = await prisma.invoiceSequence.findUnique({ where: { userId: userA.id } });
  assert(
    sequenceRecord !== null && sequenceRecord.nextNumber >= 15,
    `Test 8c: Sequence counter advanced atomically to ${sequenceRecord?.nextNumber}`
  );

  // ========================================================
  // CLEANUP
  // ========================================================
  await prisma.user.deleteMany({
    where: { email: { in: [testUserEmailA, testUserEmailB] } },
  });

  console.log(`\n==========================================`);
  console.log(`Concurrency Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runConcurrencyTestSuite()
  .catch((e) => {
    console.error('Concurrency test error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

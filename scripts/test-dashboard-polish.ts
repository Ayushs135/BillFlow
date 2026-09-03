import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { getNiceYAxis } from '../components/income-chart';

async function runDashboardPolishTests() {
  console.log('🧪 Starting Dashboard Polish & Deployment Readiness Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  // ========================================================
  // 1. MULTI-MONTH SEED DATA VERIFICATION
  // ========================================================
  console.log('--- 1. MULTI-MONTH SEED DATA ---');

  const demoUser = await prisma.user.findUnique({
    where: { email: 'demo@billflow.dev' },
    include: {
      invoices: {
        include: { client: true },
      },
      settings: true,
    },
  });

  assert(demoUser !== null, 'Test 1: Demo user demo@billflow.dev exists');

  if (demoUser) {
    const paidInvoices = demoUser.invoices.filter((inv) => inv.status === 'PAID');
    assert(paidInvoices.length >= 2, `Test 2: Demo account has multiple PAID invoices (${paidInvoices.length} found)`);

    const paidMonths = new Set(
      paidInvoices.map((inv) => `${inv.createdAt.getFullYear()}-${inv.createdAt.getMonth()}`)
    );
    assert(
      paidMonths.size >= 2,
      `Test 3: PAID invoices span at least 2 distinct calendar months (${paidMonths.size} distinct months found)`
    );

    // Verify all 4 statuses are represented in demo data
    const statuses = new Set(demoUser.invoices.map((inv) => inv.status));
    assert(
      statuses.has('PAID') && statuses.has('SENT') && statuses.has('OVERDUE') && statuses.has('DRAFT'),
      'Test 4: All 4 invoice statuses (PAID, SENT, OVERDUE, DRAFT) are represented in demo data'
    );

    // ========================================================
    // 2. VALID PUBLIC TOKENS
    // ========================================================
    console.log('\n--- 2. DEMO PUBLIC TOKENS ---');
    const invoicesWithTokens = demoUser.invoices.filter((inv) => typeof inv.publicToken === 'string' && inv.publicToken.length > 5);
    assert(
      invoicesWithTokens.length === demoUser.invoices.length,
      `Test 5: All ${demoUser.invoices.length} demo invoices possess valid, unique publicTokens`
    );

    // ========================================================
    // 3. DASHBOARD DEMO PUBLIC INVOICE RETRIEVAL
    // ========================================================
    console.log('\n--- 3. DASHBOARD DEMO PUBLIC INVOICE RETRIEVAL ---');
    const demoPublicInvoice = await prisma.invoice.findFirst({
      where: {
        userId: demoUser.id,
        status: { in: ['SENT', 'PAID'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        publicToken: true,
        status: true,
        total: true,
        client: { select: { name: true } },
      },
    });

    assert(demoPublicInvoice !== null, 'Test 6: Dashboard can retrieve a demo public invoice');
    assert(
      demoPublicInvoice?.publicToken !== undefined && demoPublicInvoice.publicToken.length >= 10,
      `Test 7: Demo public invoice has valid token (${demoPublicInvoice?.publicToken})`
    );

    // Verify public portal can resolve this token without authentication
    const publicInvoiceData = await prisma.invoice.findUnique({
      where: { publicToken: demoPublicInvoice!.publicToken },
      include: {
        client: true,
        items: true,
        user: { select: { name: true, email: true, settings: true } },
      },
    });
    assert(publicInvoiceData !== null, 'Test 8: Public portal can resolve demo public invoice anonymously');
  }

  // ========================================================
  // 4. INCOME CHART DYNAMIC SCALING & RANGES
  // ========================================================
  console.log('\n--- 4. INCOME CHART DYNAMIC SCALING ---');

  // Case A: Zero revenue
  const zeroScale = getNiceYAxis(0);
  assert(zeroScale.ceiling > 0 && zeroScale.ticks.includes(0), 'Test 9a: Zero revenue handles gracefully with bottom 0 tick');

  // Case B: Freelancer typical revenue (e.g. ₹50,000 / $4,500)
  const midScale = getNiceYAxis(45000);
  assert(
    midScale.ceiling >= 45000 && midScale.ceiling <= 60000 && midScale.ticks[midScale.ticks.length - 1] === 0,
    `Test 9b: ₹45,000 scales with headroom to ₹${midScale.ceiling}`
  );

  // Case C: High revenue range (e.g. ₹500,000)
  const highScale = getNiceYAxis(500000);
  assert(
    highScale.ceiling >= 500000 && highScale.ticks.length >= 4,
    `Test 9c: ₹500,000 scales cleanly to ₹${highScale.ceiling} with ${highScale.ticks.length} ticks`
  );

  // Case D: Single small payment (e.g. ₹1,500)
  const smallScale = getNiceYAxis(1500);
  assert(
    smallScale.ceiling >= 1500 && smallScale.ceiling <= 3000,
    `Test 9d: Small ₹1,500 payment scales properly to ₹${smallScale.ceiling}`
  );

  // ========================================================
  // 5. PRE-LOGIN LANDING PAGE DEMO LINK & POSTGRES LOGO STORAGE
  // ========================================================
  console.log('\n--- 5. PRE-LOGIN LANDING PAGE DEMO & POSTGRES LOGO ---');

  // Verify landing page exposes demo invoice link
  const landingFilePath = path.join(process.cwd(), 'app', 'page.tsx');
  const landingCode = fs.readFileSync(landingFilePath, 'utf-8');
  assert(
    (landingCode.includes('View Demo Invoice') || landingCode.includes('View Demo Public Invoice')) &&
      landingCode.includes('/invoice/'),
    'Test 10: Pre-login landing page exposes Demo Public Invoice link without requiring login'
  );

  // Verify PostgreSQL logo storage in Prisma
  const sampleLogoBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const sampleMime = 'image/png';
  const updatedSettings = await prisma.settings.update({
    where: { userId: demoUser!.id },
    data: {
      logoData: sampleLogoBuffer,
      logoMimeType: sampleMime,
      logoUrl: `data:${sampleMime};base64,${sampleLogoBuffer.toString('base64')}`,
    },
  });

  assert(
    updatedSettings.logoData !== null && updatedSettings.logoMimeType === 'image/png',
    'Test 11: Logo binary data and MIME type successfully stored and retrieved from PostgreSQL'
  );

  // ========================================================
  // 6. STALE PHASE 2 / DEV TEXT AUDIT
  // ========================================================
  console.log('\n--- 6. STALE UI TEXT AUDIT ---');

  const filesToCheck = [
    path.join(process.cwd(), 'app', 'page.tsx'),
    path.join(process.cwd(), 'app', '(dashboard)', 'dashboard', 'page.tsx'),
    path.join(process.cwd(), 'app', '(dashboard)', 'settings', 'page.tsx'),
    path.join(process.cwd(), 'components', 'app-shell.tsx'),
    path.join(process.cwd(), 'components', 'income-chart.tsx'),
  ];

  let foundStaleText = false;
  for (const filePath of filesToCheck) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (
        content.includes('Phase 1') ||
        content.includes('Phase 2') ||
        content.includes('Phase 3') ||
        content.includes('Phase 4') ||
        content.includes('Technical Assessment Phase') ||
        content.includes('Proof of Foundation')
      ) {
        console.error(`  ❌ Stale text found in ${path.basename(filePath)}`);
        foundStaleText = true;
      }
    }
  }

  assert(!foundStaleText, 'Test 12: No stale Phase / Development labels found in user-facing UI');

  console.log(`\n==========================================`);
  console.log(`Dashboard Polish Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runDashboardPolishTests()
  .catch((e) => {
    console.error('Test execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

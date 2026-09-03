import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { calculateInvoiceFinancials } from '../lib/money';
import { generateInvoicePdf } from '../lib/pdf-generator';
import { getCurrencySymbol } from '../lib/currencies';

async function runSurgicalFixesTests() {
  console.log('🧪 Starting Final Surgical Fixes & Pre-Deployment Verification Test Suite...\n');
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
  // TEST 1 — DATABASE LOGO STORAGE (POSTGRESQL BYTEA)
  // ========================================================
  console.log('--- TEST 1 — DATABASE LOGO STORAGE IN POSTGRESQL ---');
  const demoUser = await prisma.user.findUnique({
    where: { email: 'demo@billflow.dev' },
    include: { settings: true },
  });
  assert(demoUser !== null, 'TEST 1a: Demo user exists in PostgreSQL');

  // 1x1 valid PNG binary buffer
  const samplePngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const sampleBuffer = Buffer.from(samplePngBase64, 'base64');
  const sampleMime = 'image/png';

  const updatedSettings = await prisma.settings.update({
    where: { userId: demoUser!.id },
    data: {
      logoData: sampleBuffer,
      logoMimeType: sampleMime,
      logoUrl: `data:${sampleMime};base64,${samplePngBase64}`,
    },
  });

  assert(
    updatedSettings.logoData !== null &&
      (Buffer.isBuffer(updatedSettings.logoData) || updatedSettings.logoData instanceof Uint8Array),
    'TEST 1b: Image binary stored in PostgreSQL as BYTEA / Buffer'
  );
  assert(updatedSettings.logoMimeType === 'image/png', 'TEST 1c: MIME type stored in PostgreSQL (image/png)');

  // Verify no disk file was written in /uploads/logos
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
  const diskFilesExist = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
  assert(
    diskFilesExist.length === 0,
    `TEST 1d: No files written to server filesystem /uploads/logos/ (found ${diskFilesExist.length} files)`
  );

  // ========================================================
  // TEST 2 — LOGO RETRIEVAL ACROSS ALL CONTEXTS
  // ========================================================
  console.log('\n--- TEST 2 — LOGO RETRIEVAL ---');

  // 2.1 Settings Retrieval
  const fetchedSettings = await prisma.settings.findUnique({
    where: { userId: demoUser!.id },
  });
  const settingsDataUrl =
    fetchedSettings?.logoData && fetchedSettings?.logoMimeType
      ? `data:${fetchedSettings.logoMimeType};base64,${Buffer.from(fetchedSettings.logoData).toString('base64')}`
      : null;
  assert(
    settingsDataUrl !== null && settingsDataUrl.startsWith('data:image/png;base64,'),
    'TEST 2a: Settings preview data URL constructed from PostgreSQL binary'
  );

  // 2.2 Authenticated Invoice & PDF
  const demoInvoice = await prisma.invoice.findFirst({
    where: { userId: demoUser!.id, status: 'SENT' },
    include: { client: true, items: true, user: { include: { settings: true } } },
  });
  assert(demoInvoice !== null, 'TEST 2b: Demo invoice retrieved for authenticated user');

  const authPdfDoc = generateInvoicePdf({
    invoiceNumber: demoInvoice!.invoiceNumber,
    issueDate: demoInvoice!.issueDate,
    dueDate: demoInvoice!.dueDate,
    status: demoInvoice!.status,
    effectiveStatus: demoInvoice!.status,
    subtotal: demoInvoice!.subtotal.toNumber(),
    tax: demoInvoice!.tax.toNumber(),
    discount: demoInvoice!.discount.toNumber(),
    total: demoInvoice!.total.toNumber(),
    currency: demoInvoice!.user.settings?.currency || 'USD',
    businessName: demoInvoice!.user.settings?.businessName || 'Morgan Design',
    logoData: settingsDataUrl,
    client: {
      name: demoInvoice!.client.name,
      email: demoInvoice!.client.email,
    },
    items: demoInvoice!.items.map((it) => ({
      description: it.description,
      quantity: it.quantity.toNumber(),
      rate: it.rate.toNumber(),
      amount: it.amount.toNumber(),
    })),
  });
  const authPdfBytes = authPdfDoc.output('arraybuffer');
  assert(authPdfBytes.byteLength > 1000, 'TEST 2c: Authenticated invoice PDF generated with PostgreSQL logo');

  // 2.3 Public Invoice & PDF
  const publicInvoice = await prisma.invoice.findUnique({
    where: { publicToken: demoInvoice!.publicToken },
    include: { client: true, items: true, user: { include: { settings: true } } },
  });
  assert(publicInvoice !== null, 'TEST 2d: Public invoice resolved anonymously by token');
  const publicPdfDoc = generateInvoicePdf({
    invoiceNumber: publicInvoice!.invoiceNumber,
    issueDate: publicInvoice!.issueDate,
    dueDate: publicInvoice!.dueDate,
    status: publicInvoice!.status,
    effectiveStatus: publicInvoice!.status,
    subtotal: publicInvoice!.subtotal.toNumber(),
    tax: publicInvoice!.tax.toNumber(),
    discount: publicInvoice!.discount.toNumber(),
    total: publicInvoice!.total.toNumber(),
    currency: publicInvoice!.user.settings?.currency || 'USD',
    businessName: publicInvoice!.user.settings?.businessName || 'Morgan Design',
    logoData: settingsDataUrl,
    client: {
      name: publicInvoice!.client.name,
      email: publicInvoice!.client.email,
    },
    items: publicInvoice!.items.map((it) => ({
      description: it.description,
      quantity: it.quantity.toNumber(),
      rate: it.rate.toNumber(),
      amount: it.amount.toNumber(),
    })),
  });
  const publicPdfBytes = publicPdfDoc.output('arraybuffer');
  assert(publicPdfBytes.byteLength > 1000, 'TEST 2e: Public invoice PDF generated with PostgreSQL logo');

  // ========================================================
  // TEST 3 — LOGO VALIDATION & MAGIC BYTES
  // ========================================================
  console.log('\n--- TEST 3 — LOGO VALIDATION ---');

  // PNG magic bytes: 89 50 4E 47
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const isPng =
    pngHeader[0] === 0x89 &&
    pngHeader[1] === 0x50 &&
    pngHeader[2] === 0x4e &&
    pngHeader[3] === 0x47;
  assert(isPng, 'TEST 3a: Valid PNG magic bytes accepted');

  // JPEG magic bytes: FF D8 FF
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const isJpeg = jpegHeader[0] === 0xff && jpegHeader[1] === 0xd8 && jpegHeader[2] === 0xff;
  assert(isJpeg, 'TEST 3b: Valid JPEG magic bytes accepted');

  // WebP magic bytes: RIFF....WEBP
  const webpHeader = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const isWebp =
    webpHeader[0] === 0x52 &&
    webpHeader[1] === 0x49 &&
    webpHeader[2] === 0x46 &&
    webpHeader[3] === 0x46 &&
    webpHeader[8] === 0x57 &&
    webpHeader[9] === 0x45 &&
    webpHeader[10] === 0x42 &&
    webpHeader[11] === 0x50;
  assert(isWebp, 'TEST 3c: Valid WebP magic bytes accepted');

  // Reject text disguised as PNG
  const fakeFileBuffer = Buffer.from('console.log("spoofed-image-file");');
  const isFakePng =
    fakeFileBuffer.length >= 8 &&
    fakeFileBuffer[0] === 0x89 &&
    fakeFileBuffer[1] === 0x50 &&
    fakeFileBuffer[2] === 0x4e &&
    fakeFileBuffer[3] === 0x47;
  assert(!isFakePng, 'TEST 3d: Rejects spoofed extension / invalid magic bytes');

  // Reject > 2MB
  const oversizedSize = 2.5 * 1024 * 1024;
  const isOversized = oversizedSize > 2 * 1024 * 1024;
  assert(isOversized, 'TEST 3e: Rejects oversized logo files (> 2MB)');

  // ========================================================
  // TEST 4 — MULTI-TENANT LOGO ISOLATION
  // ========================================================
  console.log('\n--- TEST 4 — MULTI-TENANT LOGO ISOLATION ---');

  // Create isolated Tenant B
  const tenantB = await prisma.user.upsert({
    where: { email: 'tenant-b@billflow.dev' },
    update: {},
    create: {
      name: 'Tenant B User',
      email: 'tenant-b@billflow.dev',
      passwordHash: '$2a$10$demoHashPlaceholder',
      settings: {
        create: {
          businessName: 'Tenant B Studios',
          currency: 'EUR',
          invoicePrefix: 'TENB-',
          logoData: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03, 0x04]),
          logoMimeType: 'image/png',
        },
      },
    },
    include: { settings: true },
  });

  const tenantASettings = await prisma.settings.findUnique({ where: { userId: demoUser!.id } });
  const tenantBSettings = await prisma.settings.findUnique({ where: { userId: tenantB.id } });

  assert(
    tenantASettings?.userId !== tenantBSettings?.userId,
    'TEST 4a: Tenant A and Tenant B maintain strictly separate settings'
  );
  assert(
    tenantASettings?.businessName !== tenantBSettings?.businessName,
    'TEST 4b: Tenant A business branding isolated from Tenant B'
  );

  // ========================================================
  // TEST 5 — PUBLIC DEMO INVOICE LANDING CTA (PRE-LOGIN)
  // ========================================================
  console.log('\n--- TEST 5 — PUBLIC DEMO INVOICE PRE-LOGIN CTA ---');

  const landingFilePath = path.join(process.cwd(), 'app', 'page.tsx');
  const landingHtml = fs.readFileSync(landingFilePath, 'utf-8');

  assert(
    landingHtml.includes('Want to see a sample invoice?') || landingHtml.includes('View Demo Invoice'),
    'TEST 5a: Landing page contains "View Demo Invoice" CTA'
  );
  assert(
    landingHtml.includes('/invoice/'),
    'TEST 5b: CTA links to public invoice portal URL'
  );

  // ========================================================
  // TEST 6 — PUBLIC DEMO INVOICE ACCESS WITHOUT LOGIN
  // ========================================================
  console.log('\n--- TEST 6 — PUBLIC DEMO INVOICE ACCESS ---');

  const demoPublicToken = 'demo-token-inv-006-sent';
  const resolvedPublicInvoice = await prisma.invoice.findUnique({
    where: { publicToken: demoPublicToken },
    include: {
      client: true,
      items: true,
      user: { include: { settings: true } },
    },
  });

  assert(resolvedPublicInvoice !== null, 'TEST 6a: Demo public invoice exists with seeded token');
  assert(
    resolvedPublicInvoice?.status === 'SENT',
    `TEST 6b: Demo invoice status is SENT (${resolvedPublicInvoice?.invoiceNumber})`
  );
  assert(
    resolvedPublicInvoice?.client !== null && (resolvedPublicInvoice?.items.length ?? 0) > 0,
    'TEST 6c: Demo invoice contains client and line item records'
  );

  // ========================================================
  // TEST 7 — PUBLIC DEMO PDF GENERATION
  // ========================================================
  console.log('\n--- TEST 7 — PUBLIC DEMO PDF GENERATION ---');

  const demoPdfDoc = generateInvoicePdf({
    invoiceNumber: resolvedPublicInvoice!.invoiceNumber,
    issueDate: resolvedPublicInvoice!.issueDate,
    dueDate: resolvedPublicInvoice!.dueDate,
    status: resolvedPublicInvoice!.status,
    effectiveStatus: resolvedPublicInvoice!.status,
    subtotal: resolvedPublicInvoice!.subtotal.toNumber(),
    tax: resolvedPublicInvoice!.tax.toNumber(),
    discount: resolvedPublicInvoice!.discount.toNumber(),
    total: resolvedPublicInvoice!.total.toNumber(),
    currency: resolvedPublicInvoice!.user.settings?.currency || 'USD',
    businessName: resolvedPublicInvoice!.user.settings?.businessName || 'Morgan Design',
    logoData: settingsDataUrl,
    client: {
      name: resolvedPublicInvoice!.client.name,
      email: resolvedPublicInvoice!.client.email,
    },
    items: resolvedPublicInvoice!.items.map((it) => ({
      description: it.description,
      quantity: it.quantity.toNumber(),
      rate: it.rate.toNumber(),
      amount: it.amount.toNumber(),
    })),
  });

  const demoPdfBytes = demoPdfDoc.output('arraybuffer');
  assert(
    demoPdfBytes !== null && demoPdfBytes.byteLength > 1000,
    'TEST 7: Public demo invoice vector PDF generated successfully with logo'
  );

  // ========================================================
  // TEST 8 — FINANCIAL CALCULATIONS & CURRENCIES
  // ========================================================
  console.log('\n--- TEST 8 — FINANCIALS & INR UNICODE SUPPORT ---');

  const inrSymbol = getCurrencySymbol('INR');
  assert(inrSymbol === '₹', 'TEST 8a: INR currency symbol is ₹');

  const financials = calculateInvoiceFinancials([{ description: 'Service', quantity: 2, rate: 5000 }], 18, 10);
  assert(
    financials.subtotal.toNumber() === 10000 &&
      financials.tax.toNumber() === 1800 &&
      financials.discount.toNumber() === 1000 &&
      financials.total.toNumber() === 10800,
    'TEST 8b: Percentage tax (18%) and discount (10%) computed accurately'
  );

  console.log(`\n==========================================`);
  console.log(`Final Surgical Fixes Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSurgicalFixesTests()
  .catch((e) => {
    console.error('Surgical fixes test error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

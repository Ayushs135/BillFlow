import fs from 'fs';
import path from 'path';
import { buildInvoiceMailData, getPublicInvoiceUrl } from '../lib/invoice-mail';

async function runMailInvoiceTests() {
  console.log('🧪 Starting Mail Invoice Button Test Suite...\n');
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

  // 1. RECIPIENT RESOLUTION
  console.log('--- 1. RECIPIENT RESOLUTION ---');
  const mail1 = buildInvoiceMailData({
    invoiceNumber: 'INV-001',
    businessName: 'Acme Design',
    clientEmail: '  sarah.connor@cyberdyne.com  ',
    publicToken: 'tok-12345',
    appUrl: 'https://bill-flow-delta.vercel.app',
  });

  assert(
    mail1.to === 'sarah.connor@cyberdyne.com',
    'Test 1a: Recipient email is trimmed and extracted correctly'
  );
  assert(
    mail1.gmailComposeUrl.includes('to=sarah.connor%40cyberdyne.com'),
    'Test 1b: Gmail compose URL contains properly encoded recipient'
  );
  assert(
    mail1.hasClientEmail === true,
    'Test 1c: hasClientEmail is true for valid email'
  );

  // 2. SUBJECT FORMAT & ENCODING
  console.log('\n--- 2. SUBJECT LINE FORMAT & ENCODING ---');
  assert(
    mail1.subject === 'Invoice INV-001 — Acme Design',
    'Test 2a: Subject matches exact format "Invoice {invoiceNumber} — {businessName}"'
  );
  assert(
    mail1.gmailComposeUrl.includes('su=Invoice%20INV-001%20%E2%80%94%20Acme%20Design'),
    'Test 2b: Subject em-dash and spaces are properly URL-encoded'
  );

  // Test special characters in business name
  const mailSpecial = buildInvoiceMailData({
    invoiceNumber: 'INV-999',
    businessName: 'A&B Studio / R&D + Design',
    clientEmail: 'client@test.org',
    publicToken: 'tok-special',
    appUrl: 'https://bill-flow-delta.vercel.app',
  });
  assert(
    mailSpecial.subject === 'Invoice INV-999 — A&B Studio / R&D + Design',
    'Test 2c: Special characters (&, +, /) supported in business name'
  );
  assert(
    mailSpecial.gmailComposeUrl.includes('su=' + encodeURIComponent('Invoice INV-999 — A&B Studio / R&D + Design')),
    'Test 2d: Special characters in subject safely encoded for URL'
  );

  // 3. PUBLIC INVOICE URL INCLUSION
  console.log('\n--- 3. PUBLIC INVOICE URL INCLUSION ---');
  assert(
    mail1.publicInvoiceUrl === 'https://bill-flow-delta.vercel.app/invoice/tok-12345',
    'Test 3a: Public invoice URL properly formed from base URL and publicToken'
  );
  assert(
    mail1.body.includes('https://bill-flow-delta.vercel.app/invoice/tok-12345'),
    'Test 3b: Email body contains the full public invoice URL'
  );
  assert(
    mail1.body.includes('Hello,\n\nPlease find your invoice INV-001 from Acme Design.\n\nYou can view the invoice online here:\nhttps://bill-flow-delta.vercel.app/invoice/tok-12345\n\nThank you,\nAcme Design'),
    'Test 3c: Email body matches exact required copy and line breaks'
  );

  // Test trailing slash normalization
  const urlWithSlash = getPublicInvoiceUrl('tok-abc', 'https://bill-flow-delta.vercel.app/');
  assert(
    urlWithSlash === 'https://bill-flow-delta.vercel.app/invoice/tok-abc',
    'Test 3d: Base URL trailing slash is stripped safely'
  );

  // 4. URL ENCODING & FORMAT
  console.log('\n--- 4. GMAIL COMPOSE URL & MAILTO FALLBACK ---');
  assert(
    mail1.gmailComposeUrl.startsWith('https://mail.google.com/mail/?view=cm&fs=1&'),
    'Test 4a: Gmail compose URL uses official view=cm & fs=1 parameters'
  );
  assert(
    mail1.mailtoUrl.startsWith('mailto:sarah.connor%40cyberdyne.com?subject='),
    'Test 4b: Standard mailto URL fallback is generated'
  );

  // 5. MISSING CLIENT EMAIL HANDLING
  console.log('\n--- 5. MISSING CLIENT EMAIL HANDLING ---');
  const mailNull = buildInvoiceMailData({
    invoiceNumber: 'INV-002',
    businessName: 'Acme Design',
    clientEmail: null,
    publicToken: 'tok-no-email',
  });
  assert(
    mailNull.hasClientEmail === false,
    'Test 5a: hasClientEmail is false when clientEmail is null'
  );
  assert(
    mailNull.gmailComposeUrl === '',
    'Test 5b: Gmail compose URL is empty string when clientEmail is null (no broken link)'
  );
  assert(
    mailNull.mailtoUrl === '',
    'Test 5c: mailtoUrl is empty string when clientEmail is null'
  );

  const mailEmpty = buildInvoiceMailData({
    invoiceNumber: 'INV-003',
    businessName: 'Acme Design',
    clientEmail: '   ',
    publicToken: 'tok-spaces',
  });
  assert(
    mailEmpty.hasClientEmail === false,
    'Test 5d: Whitespace-only clientEmail is treated as missing'
  );
  assert(
    mailEmpty.gmailComposeUrl === '',
    'Test 5e: Gmail compose URL is empty string for whitespace email'
  );

  // 6. UI CODE AUDIT IN INVOICE DETAIL VIEW
  console.log('\n--- 6. UI INTEGRATION IN INVOICE DETAIL VIEW ---');
  const invoiceViewPath = path.join(process.cwd(), 'app', '(dashboard)', 'invoices', '[id]', 'page.tsx');
  const invoiceViewCode = fs.readFileSync(invoiceViewPath, 'utf-8');

  assert(
    invoiceViewCode.includes('buildInvoiceMailData'),
    'Test 6a: Invoice detail view imports and uses buildInvoiceMailData'
  );
  assert(
    invoiceViewCode.includes('mailData.gmailComposeUrl'),
    'Test 6b: Invoice detail view links Mail button to Gmail compose URL'
  );
  assert(
    invoiceViewCode.includes('Client email is unavailable.'),
    'Test 6c: Invoice detail view handles missing email with disabled button and clear tooltip message'
  );
  assert(
    invoiceViewCode.includes('<Mail') || invoiceViewCode.includes('Mail className'),
    'Test 6d: Invoice detail view renders Mail icon'
  );

  console.log(`\n==========================================`);
  console.log(`Mail Invoice Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runMailInvoiceTests().catch((e) => {
  console.error('Mail invoice test failure:', e);
  process.exit(1);
});


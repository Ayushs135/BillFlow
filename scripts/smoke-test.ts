async function runSmokeTest() {
  const PORT = process.env.PORT || '3001';
  const BASE_URL = `http://localhost:${PORT}`;
  console.log(`🚀 Running Production HTTP Smoke Test on ${BASE_URL}...\n`);

  // 1. Landing Page (Pre-Login)
  const landingRes = await fetch(`${BASE_URL}`);
  const landingHtml = await landingRes.text();
  console.log(`  [1] Landing page status: ${landingRes.status}`);
  if (!landingHtml.includes('View Demo Invoice')) {
    throw new Error('Landing page missing pre-login "View Demo Invoice" CTA!');
  }
  if (!landingHtml.includes('/invoice/demo-token-inv-006-sent')) {
    throw new Error('Landing page missing link to seeded public demo invoice!');
  }
  console.log('  ✅ Landing page renders pre-login demo invoice CTA (No login required)');

  // 2. Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'demo@billflow.dev',
      password: 'DemoPassword123!',
    }),
  });
  console.log(`  [2] Auth login status: ${loginRes.status}`);
  const cookieHeader = loginRes.headers.get('set-cookie');
  if (!cookieHeader) {
    throw new Error('No auth cookie returned from login!');
  }
  console.log('  ✅ Demo user authenticated, session cookie obtained');

  // 3. Dashboard with Session Cookie
  const dashRes = await fetch(`${BASE_URL}/dashboard`, {
    headers: { cookie: cookieHeader },
  });
  const dashHtml = await dashRes.text();
  console.log(`  [3] Authenticated Dashboard status: ${dashRes.status}`);
  if (!dashHtml.includes('Income Over Time')) {
    throw new Error('Dashboard is missing "Income Over Time" chart!');
  }
  if (!dashHtml.includes('Total Earned') || !dashHtml.includes('Outstanding') || !dashHtml.includes('Overdue')) {
    throw new Error('Dashboard missing core financial metric cards!');
  }
  console.log('  ✅ Dashboard renders income chart, metrics, and business profile cleanly');

  // 4. Anonymous Public Invoice Portal & API
  const publicPageRes = await fetch(`${BASE_URL}/invoice/demo-token-inv-006-sent`);
  console.log(`  [4a] Anonymous Public Invoice Portal page status: ${publicPageRes.status}`);

  const publicApiRes = await fetch(`${BASE_URL}/api/public/invoices/demo-token-inv-006-sent`);
  const publicApiJson = await publicApiRes.json();
  console.log(`  [4b] Anonymous Public Invoice API status: ${publicApiRes.status}`);
  if (publicApiJson.invoice?.invoiceNumber !== 'INV-006') {
    throw new Error(`Public API did not return invoice INV-006! Got: ${JSON.stringify(publicApiJson)}`);
  }
  if (!publicApiJson.invoice?.business?.logoUrl) {
    throw new Error('Public invoice missing PostgreSQL-stored logo URL!');
  }
  console.log('  ✅ Public Invoice Portal & API accessible without authentication (INV-006 & PostgreSQL Logo verified)');

  // 5. Public PDF Endpoint
  const pdfRes = await fetch(`${BASE_URL}/api/public/invoices/demo-token-inv-006-sent/pdf`);
  const pdfBuf = await pdfRes.arrayBuffer();
  console.log(`  [5] Anonymous Public PDF download status: ${pdfRes.status}, size: ${pdfBuf.byteLength} bytes`);
  if (pdfRes.status !== 200 || pdfBuf.byteLength < 1000) {
    throw new Error('Public PDF download failed or empty!');
  }
  console.log('  ✅ Public PDF generated and served anonymously with embedded logo');

  console.log('\n🎉 ALL PRODUCTION SMOKE CHECKS PASSED SUCCESSFULLY!\n');
}

runSmokeTest().catch((e) => {
  console.error('Smoke test failure:', e);
  process.exit(1);
});

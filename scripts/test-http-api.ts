async function main() {
  console.log('🌐 Starting HTTP API Route Verification (Phases 1-4)...');
  const baseUrl = 'http://localhost:3000';

  let sessionCookie = '';

  async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/billflow_session=[^;]+/);
      if (match) {
        sessionCookie = match[0];
      }
    }

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      data = await res.arrayBuffer();
    }

    return { status: res.status, data, headers: res.headers };
  }

  // 1. Unauthenticated /api/clients -> 401
  const unauthClients = await apiRequest('/api/clients');
  console.log(`1. Unauthenticated /api/clients: HTTP ${unauthClients.status} (Expected 401)`);
  if (unauthClients.status !== 401) throw new Error('Unauthenticated access was not 401');

  // 2. Login as Demo User
  const loginRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'demo@billflow.dev',
      password: 'DemoPassword123!',
    }),
  });
  console.log(`2. Login Demo User: HTTP ${loginRes.status}, User: ${loginRes.data?.user?.name}`);
  if (loginRes.status !== 200 || !loginRes.data?.user) throw new Error('Login failed');

  // 3. GET /api/clients
  const clientsRes = await apiRequest('/api/clients');
  console.log(`3. GET /api/clients: HTTP ${clientsRes.status}, Found ${clientsRes.data?.clients?.length} clients`);
  if (clientsRes.status !== 200 || clientsRes.data.clients.length === 0) throw new Error('GET /api/clients failed');
  const testClientId = clientsRes.data.clients[0].id;

  // 4. GET /api/invoices/next-number
  const nextNumRes = await apiRequest('/api/invoices/next-number');
  console.log(`4. GET /api/invoices/next-number: HTTP ${nextNumRes.status}, Next: ${nextNumRes.data?.nextInvoiceNumber}`);
  if (nextNumRes.status !== 200 || !nextNumRes.data?.nextInvoiceNumber) throw new Error('Next number failed');

  // 5. POST /api/invoices (Create Invoice with line items)
  const now = new Date();
  const dueDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const createInvRes = await apiRequest('/api/invoices', {
    method: 'POST',
    body: JSON.stringify({
      clientId: testClientId,
      issueDate: now.toISOString(),
      dueDate: dueDate.toISOString(),
      items: [
        { description: 'API Development & Verification', quantity: 2, rate: 750 },
        { description: 'Code Review & QA Testing', quantity: 1, rate: 500 },
      ],
      tax: 200,
      discount: 100,
      notes: 'Payment net 15 days.',
      status: 'SENT',
    }),
  });
  console.log(
    `5. POST /api/invoices: HTTP ${createInvRes.status}, Invoice: ${createInvRes.data?.invoice?.invoiceNumber}, Total: ${createInvRes.data?.invoice?.total}`
  );
  if (createInvRes.status !== 201 || !createInvRes.data?.invoice?.id) throw new Error('POST /api/invoices failed');
  const createdInvId = createInvRes.data.invoice.id;
  const publicToken = createInvRes.data.invoice.publicToken;

  // 6. GET /api/invoices/[id]/pdf (Authenticated PDF download)
  const authPdfRes = await apiRequest(`/api/invoices/${createdInvId}/pdf`);
  console.log(`6. GET /api/invoices/[id]/pdf: HTTP ${authPdfRes.status}, Content-Type: ${authPdfRes.headers.get('content-type')}`);
  if (authPdfRes.status !== 200 || !authPdfRes.headers.get('content-type')?.includes('application/pdf')) {
    throw new Error('Authenticated PDF generation failed');
  }

  // 7. Phase 4: Public Invoice Portal Endpoint (No Session Cookie)
  const publicInvRes = await fetch(`http://localhost:3000/api/public/invoices/${publicToken}`);
  const publicInvData = await publicInvRes.json();
  console.log(`7. GET /api/public/invoices/[token]: HTTP ${publicInvRes.status}, Client: ${publicInvData.invoice?.client?.name}`);
  if (publicInvRes.status !== 200 || !publicInvData.invoice?.invoiceNumber) throw new Error('Public invoice GET failed');
  if (publicInvData.invoice.passwordHash || publicInvData.invoice.user?.passwordHash) {
    throw new Error('Security violation: passwordHash exposed in public endpoint');
  }

  // 8. Phase 4: Public Invalid Token -> 404
  const invalidPublicRes = await fetch(`http://localhost:3000/api/public/invoices/random-invalid-token-12345`);
  console.log(`8. GET /api/public/invoices/invalid: HTTP ${invalidPublicRes.status} (Expected 404)`);
  if (invalidPublicRes.status !== 404) throw new Error('Invalid public token did not return 404');

  // 9. Phase 4: Public PDF Download (No Session Cookie)
  const publicPdfRes = await fetch(`http://localhost:3000/api/public/invoices/${publicToken}/pdf`);
  console.log(`9. GET /api/public/invoices/[token]/pdf: HTTP ${publicPdfRes.status}, Size: ${(await publicPdfRes.arrayBuffer()).byteLength} bytes`);
  if (publicPdfRes.status !== 200) throw new Error('Public PDF download failed');

  // 10. Phase 4: Public Payment Simulation (No Session Cookie)
  const payRes = await fetch(`http://localhost:3000/api/public/invoices/${publicToken}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ simulated: true }),
  });
  const payData = await payRes.json();
  console.log(`10. POST /api/public/invoices/[token]/pay: HTTP ${payRes.status}, Status: ${payData.status}`);
  if (payRes.status !== 200 || payData.status !== 'PAID') throw new Error('Payment simulation failed');

  // 11. Phase 4: Duplicate Payment Attempt -> 400
  const dupPayRes = await fetch(`http://localhost:3000/api/public/invoices/${publicToken}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ simulated: true }),
  });
  console.log(`11. POST /api/public/invoices/[token]/pay (duplicate): HTTP ${dupPayRes.status} (Expected 400)`);
  if (dupPayRes.status !== 400) throw new Error('Duplicate payment did not return 400');

  // 12. Clean up test invoice
  const deleteInvRes = await apiRequest(`/api/invoices/${createdInvId}`, {
    method: 'DELETE',
  });
  console.log(`12. DELETE /api/invoices/[id]: HTTP ${deleteInvRes.status}`);

  // 13. POST /api/auth/logout
  const logoutRes = await apiRequest('/api/auth/logout', { method: 'POST' });
  console.log(`13. POST /api/auth/logout: HTTP ${logoutRes.status}`);

  console.log('\n🎉 ALL HTTP ENDPOINT TESTS (PHASES 1-4) PASSED SUCCESSFULLY!\n');
}

main().catch((e) => {
  console.error('HTTP test failed:', e);
  process.exit(1);
});

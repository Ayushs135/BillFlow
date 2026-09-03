import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { signToken, verifyToken } from '../lib/auth';
import { signupSchema, settingsSchema } from '../lib/validations';

async function runTests() {
  console.log('🧪 Starting Phase 2 Comprehensive Test Suite...\n');
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

  // ==========================================
  // 1. AUTHENTICATION & SECURITY TESTS
  // ==========================================
  console.log('--- 1. AUTHENTICATION & SECURITY TESTS ---');

  // Test 1.1: Demo user exists from seed
  const demoUser = await prisma.user.findUnique({
    where: { email: 'demo@billflow.dev' },
    include: { settings: true },
  });
  assert(demoUser !== null, 'Demo user demo@billflow.dev exists in database');
  
  if (demoUser) {
    const isDemoPassCorrect = await bcrypt.compare('DemoPassword123!', demoUser.passwordHash);
    assert(isDemoPassCorrect, 'Demo user password verified with bcrypt');
    assert(demoUser.settings !== null, 'Demo user has linked settings record');
    assert(demoUser.settings?.currency === 'USD', 'Demo settings currency is USD');
  }

  // Test 1.2: Signup validation
  const invalidSignup1 = signupSchema.safeParse({
    name: 'A',
    email: 'invalid-email',
    password: '123',
    confirmPassword: '456',
  });
  assert(!invalidSignup1.success, 'Rejects invalid signup (short name, bad email, mismatched password)');

  const validSignup = signupSchema.safeParse({
    name: 'Test Freelancer',
    email: 'testfreelancer@example.com',
    password: 'Password123!',
    confirmPassword: 'Password123!',
  });
  assert(validSignup.success, 'Accepts valid signup payload');

  // Test 1.3: Create a second user (User B) for Multi-Tenant Isolation Testing
  const userBEmail = 'user_b_test@billflow.dev';
  // Cleanup if exists from previous test run
  await prisma.user.deleteMany({ where: { email: { in: [userBEmail, 'testfreelancer@example.com'] } } });

  const hashedPassB = await bcrypt.hash('SecretPass123!', 10);
  const userB = await prisma.user.create({
    data: {
      name: 'User B (Second Tenant)',
      email: userBEmail,
      passwordHash: hashedPassB,
      settings: {
        create: {
          businessName: 'User B Studio',
          currency: 'EUR',
          invoicePrefix: 'UB-',
        },
      },
    },
    include: { settings: true },
  });
  assert(userB.id !== undefined && userB.email === userBEmail, 'User B created with isolated settings');

  // Test 1.4: Session token generation & verification
  const tokenA = await signToken({ userId: demoUser!.id });
  const verifiedPayloadA = await verifyToken(tokenA);
  assert(verifiedPayloadA?.userId === demoUser!.id, 'JWT session token signs and verifies correctly for User A');

  const tokenB = await signToken({ userId: userB.id });
  const verifiedPayloadB = await verifyToken(tokenB);
  assert(verifiedPayloadB?.userId === userB.id, 'JWT session token signs and verifies correctly for User B');

  const invalidToken = await verifyToken('invalid-tampered-token');
  assert(invalidToken === null, 'Rejects invalid or tampered JWT tokens');

  // ==========================================
  // 2. CLIENT MANAGEMENT & MULTI-TENANT ISOLATION
  // ==========================================
  console.log('\n--- 2. CLIENT MANAGEMENT & MULTI-TENANT ISOLATION ---');

  // Test 2.1: Create client for User A
  const clientA1 = await prisma.client.create({
    data: {
      userId: demoUser!.id,
      name: 'Client Alpha of User A',
      email: 'alpha@usera.com',
      company: 'Alpha Industries',
      phone: '+1 555-0100',
      address: '100 Alpha St',
    },
  });
  assert(clientA1.userId === demoUser!.id, 'Client A1 created under User A tenant');

  // Test 2.2: Create client for User B
  const clientB1 = await prisma.client.create({
    data: {
      userId: userB.id,
      name: 'Client Beta of User B',
      email: 'beta@userb.com',
      company: 'Beta Technologies',
      phone: '+44 20 7946 0999',
      address: '200 Beta Lane, London',
    },
  });
  assert(clientB1.userId === userB.id, 'Client B1 created under User B tenant');

  // Test 2.3: User A queries clients (Multi-tenant list check)
  const userAClients = await prisma.client.findMany({
    where: { userId: demoUser!.id },
  });
  const hasUserBClientInUserAList = userAClients.some((c) => c.id === clientB1.id);
  assert(!hasUserBClientInUserAList, 'Multi-Tenant Isolation: User A cannot see User B clients in list');

  // Test 2.4: User B queries clients
  const userBClients = await prisma.client.findMany({
    where: { userId: userB.id },
  });
  const hasUserAClientInUserBList = userBClients.some((c) => c.id === clientA1.id);
  assert(!hasUserAClientInUserBList, 'Multi-Tenant Isolation: User B cannot see User A clients in list');
  assert(userBClients.length === 1 && userBClients[0].name === 'Client Beta of User B', 'User B sees only their 1 client');

  // Test 2.5: User A attempts to access/read User B's client ID directly
  const crossTenantRead = await prisma.client.findFirst({
    where: {
      id: clientB1.id,
      userId: demoUser!.id, // Scoped to User A
    },
  });
  assert(crossTenantRead === null, 'Multi-Tenant Security: User A querying User B client ID returns NULL');

  // Test 2.6: User B attempts to update User A's client ID
  const crossTenantUpdateCheck = await prisma.client.findFirst({
    where: {
      id: clientA1.id,
      userId: userB.id, // Scoped to User B
    },
  });
  assert(crossTenantUpdateCheck === null, 'Multi-Tenant Security: User B cannot locate User A client for update');

  // Test 2.7: Update Client for authorized user
  const updatedClientA1 = await prisma.client.update({
    where: { id: clientA1.id },
    data: { name: 'Client Alpha Updated', company: 'Alpha Global' },
  });
  assert(updatedClientA1.name === 'Client Alpha Updated' && updatedClientA1.company === 'Alpha Global', 'Client updated successfully for authorized owner');

  // Test 2.8: Search Clients with case-insensitivity
  const searchResults = await prisma.client.findMany({
    where: {
      userId: demoUser!.id,
      OR: [
        { name: { contains: 'alpha', mode: 'insensitive' } },
        { company: { contains: 'alpha', mode: 'insensitive' } },
        { email: { contains: 'alpha', mode: 'insensitive' } },
      ],
    },
  });
  assert(searchResults.length >= 1 && searchResults[0].id === clientA1.id, 'Client search filters correctly by name/company/email for current user');

  // Test 2.9: Delete Client for authorized user
  await prisma.client.delete({
    where: { id: clientA1.id },
  });
  const verifyDeleted = await prisma.client.findUnique({ where: { id: clientA1.id } });
  assert(verifyDeleted === null, 'Client deleted successfully');

  // ==========================================
  // 3. SETTINGS MANAGEMENT TESTS
  // ==========================================
  console.log('\n--- 3. SETTINGS MANAGEMENT TESTS ---');

  // Test 3.1: Settings validation
  const invalidSettings = settingsSchema.safeParse({
    invoicePrefix: '', // required
    currency: 'USD',
  });
  assert(!invalidSettings.success, 'Rejects settings with empty invoice prefix');

  const validSettings = settingsSchema.safeParse({
    businessName: 'Acme Design Corp',
    currency: 'INR',
    invoicePrefix: 'BILL-',
    logoUrl: 'https://example.com/logo.png',
  });
  assert(validSettings.success, 'Accepts valid settings configuration');

  // Test 3.2: Update User B settings
  const updatedSettingsB = await prisma.settings.update({
    where: { userId: userB.id },
    data: {
      businessName: 'User B New Brand',
      currency: 'GBP',
      invoicePrefix: 'UK-',
      logoUrl: 'https://userb.com/logo.svg',
    },
  });
  assert(updatedSettingsB.businessName === 'User B New Brand', 'Business name updated');
  assert(updatedSettingsB.currency === 'GBP', 'Currency updated to GBP');
  assert(updatedSettingsB.invoicePrefix === 'UK-', 'Invoice prefix updated to UK-');
  assert(updatedSettingsB.logoUrl === 'https://userb.com/logo.svg', 'Logo URL updated');

  // Test 3.3: Verify Demo User settings remain unaffected by User B changes
  const demoSettingsCheck = await prisma.settings.findUnique({ where: { userId: demoUser!.id } });
  assert(demoSettingsCheck?.currency === 'USD', 'User A settings isolated from User B changes');

  // Clean up test User B
  await prisma.user.delete({ where: { id: userB.id } });
  const verifyUserBDeleted = await prisma.user.findUnique({ where: { id: userB.id } });
  assert(verifyUserBDeleted === null, 'Test tenant cleaned up cleanly with cascade');

  console.log(`\n==========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error('Test execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

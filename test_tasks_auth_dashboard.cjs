const fs = require('fs');
const path = require('path');
const authModulesPath = path.join(__dirname, 'server', 'auth-service', 'node_modules');
const jwt = require(path.join(authModulesPath, 'jsonwebtoken'));
const bcrypt = require(path.join(authModulesPath, 'bcryptjs'));

process.env.NODE_ENV = 'test';

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING VERIFICATION FOR TASKS 1-5');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TASK 1: DASHBOARD ACTIVE SERVICES CARD REMOVAL
  // ----------------------------------------------------
  console.log('TASK 1: Dashboard UI & Grid Layout Checks');
  const dashboardPath = path.join(__dirname, 'src', 'pages', 'Dashboard.jsx');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

  assert(!dashboardCode.includes('label="Active Services"'), 'Active Services card removed from Dashboard.jsx');
  assert(!dashboardCode.includes('activeServices ='), 'activeServices variable calculation removed from Dashboard.jsx');
  assert(!dashboardCode.includes('CheckCircle'), 'CheckCircle import removed from Dashboard.jsx');

  const cardMatches = dashboardCode.match(/<StatsCard/g) || [];
  assert(cardMatches.length === 6, `Exactly 6 summary cards remain in Dashboard.jsx (found ${cardMatches.length})`);

  const expectedLabels = [
    'Total Services',
    'Real Services',
    'Simulated Services',
    'Avg Response Time',
    'Error Rate',
    'Services Down',
  ];
  for (const label of expectedLabels) {
    assert(dashboardCode.includes(`label="${label}"`), `Dashboard retains card: "${label}"`);
  }

  const cssPath = path.join(__dirname, 'src', 'css', 'Dashboard.css');
  const cssCode = fs.readFileSync(cssPath, 'utf8');
  assert(cssCode.includes('repeat(6, 1fr)'), 'Dashboard.css includes 6-column grid for ultra-wide screens (>=1440px)');
  assert(cssCode.includes('repeat(3, 1fr)'), 'Dashboard.css includes 3-column grid for standard desktop (1024-1439px)');
  assert(cssCode.includes('repeat(2, 1fr)'), 'Dashboard.css includes 2-column grid for tablet (641-1023px)');
  assert(cssCode.includes('grid-template-columns: 1fr'), 'Dashboard.css includes 1-column stack for mobile (<=640px)');

  // ----------------------------------------------------
  // TASK 2 & 3: AUTHENTICATION SERVICE ACCOUNTS & PROFILE
  // ----------------------------------------------------
  console.log('\nTASK 2 & 3: Authentication Accounts & Identity Verification');
  
  // Dynamically import ESM auth-service module
  const authModulePath = path.join(__dirname, 'server', 'auth-service', 'index.js');
  const { app, USERS, seedAccounts } = await import('file:///' + authModulePath.replace(/\\/g, '/'));

  assert(Array.isArray(USERS), 'USERS array exists in auth-service');
  assert(USERS.length >= 3, `USERS array has at least 3 users (found ${USERS.length})`);

  // Check Mathan account
  const mathan = USERS.find(u => u.email.toLowerCase() === 'mathan@gmail.com');
  assert(Boolean(mathan), 'mathan@gmail.com exists in USERS repository');
  assert(mathan && mathan.name === 'Mathan', 'Mathan account name is "Mathan"');
  assert(mathan && mathan.passwordHash && !mathan.password, 'Mathan password is stored strictly as bcrypt hash, not plaintext');
  const mathanPwMatch = mathan ? bcrypt.compareSync('mathan@156', mathan.passwordHash) : false;
  assert(mathanPwMatch, 'Mathan password hash matches specified password');
  const mathanBadPw = mathan ? bcrypt.compareSync('wrongpass', mathan.passwordHash) : true;
  assert(!mathanBadPw, 'Mathan rejects incorrect password');

  // Check Vaishak account
  const vaishak = USERS.find(u => u.email.toLowerCase() === 'vaishak@gmail.com');
  assert(Boolean(vaishak), 'vaishak@gmail.com exists in USERS repository');
  assert(vaishak && vaishak.name === 'Vaishak', 'Vaishak account name is "Vaishak"');
  assert(vaishak && vaishak.passwordHash && !vaishak.password, 'Vaishak password is stored strictly as bcrypt hash, not plaintext');
  const vaishakPwMatch = vaishak ? bcrypt.compareSync('vk@18', vaishak.passwordHash) : false;
  assert(vaishakPwMatch, 'Vaishak password hash matches specified password');
  const vaishakBadPw = vaishak ? bcrypt.compareSync('wrongpass', vaishak.passwordHash) : true;
  assert(!vaishakBadPw, 'Vaishak rejects incorrect password');

  // Check Admin account preserved
  const admin = USERS.find(u => u.email.toLowerCase() === 'admin@example.com');
  assert(Boolean(admin), 'admin@example.com account is preserved in USERS repository');
  const adminPwMatch = admin ? bcrypt.compareSync('password', admin.passwordHash) : false;
  assert(adminPwMatch, 'Admin password hash matches default password');

  // Check Idempotency of seedAccounts
  const userCountBefore = USERS.length;
  seedAccounts();
  seedAccounts();
  const userCountAfter = USERS.length;
  assert(userCountBefore === userCountAfter, `seedAccounts is idempotent (calling repeatedly kept count at ${userCountAfter})`);

  // ----------------------------------------------------
  // SIMULATE API REQUESTS
  // ----------------------------------------------------
  console.log('\nTASK 3 & 4: API Responses, JWT Generation & Security Verification');

  // Start test server on random port
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Mathan Login
    const mRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mathan@gmail.com', password: 'mathan@156' }),
    });
    assert(mRes.status === 200, 'POST /api/login for Mathan returns 200 OK');
    const mData = await mRes.json();
    assert(Boolean(mData.token), 'Mathan login returns signed JWT token');
    assert(mData.user && mData.user.email === 'mathan@gmail.com', 'Mathan login returns correct user email');
    assert(mData.user && mData.user.name === 'Mathan', 'Mathan login returns correct user name');
    assert(!mData.user.password && !mData.user.passwordHash && !mData.password, 'Mathan login NEVER exposes password or passwordHash in response');

    // 2. Mathan Profile /api/me
    const mMeRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${mData.token}` },
    });
    assert(mMeRes.status === 200, 'GET /api/me with Mathan Bearer token returns 200 OK');
    const mMeData = await mMeRes.json();
    assert(mMeData.user.name === 'Mathan' && mMeData.user.email === 'mathan@gmail.com', 'GET /api/me returns Mathan identity');
    assert(!mMeData.user.password && !mMeData.user.passwordHash, 'GET /api/me NEVER exposes password or passwordHash');

    // 3. Vaishak Login
    const vRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'vaishak@gmail.com', password: 'vk@18' }),
    });
    assert(vRes.status === 200, 'POST /api/login for Vaishak returns 200 OK');
    const vData = await vRes.json();
    assert(Boolean(vData.token), 'Vaishak login returns signed JWT token');
    assert(vData.user && vData.user.email === 'vaishak@gmail.com', 'Vaishak login returns correct user email');
    assert(vData.user && vData.user.name === 'Vaishak', 'Vaishak login returns correct user name');
    assert(!vData.user.password && !vData.user.passwordHash && !vData.password, 'Vaishak login NEVER exposes password or passwordHash in response');

    // 4. Vaishak Profile /api/me
    const vMeRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${vData.token}` },
    });
    assert(vMeRes.status === 200, 'GET /api/me with Vaishak Bearer token returns 200 OK');
    const vMeData = await vMeRes.json();
    assert(vMeData.user.name === 'Vaishak' && vMeData.user.email === 'vaishak@gmail.com', 'GET /api/me returns Vaishak identity');
    assert(!vMeData.user.password && !vMeData.user.passwordHash, 'GET /api/me NEVER exposes password or passwordHash');

    // 5. Account Isolation: Mathan token does not equal Vaishak token
    assert(mData.token !== vData.token, 'Distinct JWT tokens generated for different accounts');

    // 6. Rejected logins
    const badPwRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mathan@gmail.com', password: 'incorrectPassword' }),
    });
    assert(badPwRes.status === 401, 'POST /api/login with wrong password returns 401 Unauthorized');

    const badEmailRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@user.com', password: 'anyPassword' }),
    });
    assert(badEmailRes.status === 401, 'POST /api/login with unregistered email returns 401 Unauthorized');

    // 7. Protected endpoint rejection
    const noTokenRes = await fetch(`${baseUrl}/api/me`);
    assert(noTokenRes.status === 401, 'GET /api/me without token returns 401 Unauthorized');

    const fakeTokenRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: 'Bearer fake.invalid.token' },
    });
    assert(fakeTokenRes.status === 401, 'GET /api/me with forged token returns 401 Unauthorized');

  } finally {
    server.close();
  }

  // ----------------------------------------------------
  // TASK 3: FRONTEND NAVBAR & LOGIN SYNCHRONIZATION
  // ----------------------------------------------------
  console.log('\nTASK 3: Frontend Navbar & Session Switching Checks');
  const navbarPath = path.join(__dirname, 'src', 'components', 'Navbar.jsx');
  const navbarCode = fs.readFileSync(navbarPath, 'utf8');
  assert(navbarCode.includes('auth_user_updated'), 'Navbar listens to auth_user_updated event for dynamic sync');
  assert(navbarCode.includes('setUser(null)'), 'handleLogout explicitly resets user state to null');
  assert(navbarCode.includes('localStorage.removeItem(\'authToken\')'), 'handleLogout removes authToken from localStorage');
  assert(navbarCode.includes('localStorage.removeItem(\'authUser\')'), 'handleLogout removes authUser from localStorage');

  const loginPath = path.join(__dirname, 'src', 'pages', 'Login.jsx');
  const loginCode = fs.readFileSync(loginPath, 'utf8');
  assert(loginCode.includes('auth_user_updated'), 'Login.jsx dispatches auth_user_updated event upon successful authentication');

  // Summary
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

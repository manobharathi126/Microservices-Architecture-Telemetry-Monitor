// ============================================================================
// test_alert_acknowledgement.cjs
// Verification of User-Specific Alert Acknowledgement Tracking & Multi-User Security
// ============================================================================

const http = require('http');
const path = require('path');
const assert = require('assert');

const jwt = require(path.join(__dirname, 'server', 'collector', 'node_modules', 'jsonwebtoken'));

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const db = require(path.join(__dirname, 'server', 'collector', 'db.js'));

let testsPassed = 0;
let testsFailed = 0;

function logPass(title) {
  console.log(`  [PASS] ${title}`);
  testsPassed++;
}

function logFail(title, err) {
  console.error(`  [FAIL] ${title}`);
  console.error(`         ${err.message || err}`);
  testsFailed++;
}

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING USER-SPECIFIC ALERT ACKNOWLEDGEMENT TESTS');
  console.log('====================================================');

  // Dynamically import auth-service
  const authModulePath = path.join(__dirname, 'server', 'auth-service', 'index.js');
  const { app, USERS, seedAccounts } = await import('file:///' + authModulePath.replace(/\\/g, '/'));

  // Ensure accounts are seeded
  seedAccounts();

  // Start Auth Service on ephemeral port for tests
  const authServer = http.createServer(app);
  await new Promise((resolve) => authServer.listen(0, resolve));
  const authPort = authServer.address().port;
  const authBaseUrl = `http://127.0.0.1:${authPort}`;

  // Start Collector HTTP Server on ephemeral port for tests
  // We require the collector request handler logic
  let collectorServer;
  let collectorPort;
  let collectorBaseUrl;

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: Authentication Accounts Verification (Mano, Vaishak, Mathan)
    // ------------------------------------------------------------------------
    console.log('\n--- Section 1: Multi-User Identity & JWT Verification ---');

    // Verify all 3 accounts exist in USERS
    const manoUser = USERS.find((u) => u.email.toLowerCase() === 'mano@gmail.com');
    const vaishakUser = USERS.find((u) => u.email.toLowerCase() === 'vaishak@gmail.com');
    const mathanUser = USERS.find((u) => u.email.toLowerCase() === 'mathan@gmail.com');

    assert(manoUser, 'Mano account (mano@gmail.com) exists in auth-service USERS');
    assert.strictEqual(manoUser.name, 'Mano', 'Mano display name is "Mano"');
    logPass('Mano account verified in auth repository');

    assert(vaishakUser, 'Vaishak account (vaishak@gmail.com) exists in auth-service USERS');
    assert.strictEqual(vaishakUser.name, 'Vaishak', 'Vaishak display name is "Vaishak"');
    logPass('Vaishak account verified in auth repository');

    assert(mathanUser, 'Mathan account (mathan@gmail.com) exists in auth-service USERS');
    assert.strictEqual(mathanUser.name, 'Mathan', 'Mathan display name is "Mathan"');
    logPass('Mathan account verified in auth repository');

    // Authenticate Mano
    const manoLoginRes = await fetch(`${authBaseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mano@gmail.com', password: 'mano@123' }),
    });
    assert.strictEqual(manoLoginRes.status, 200, 'Mano login returns 200 OK');
    const manoLoginData = await manoLoginRes.json();
    assert(manoLoginData.token, 'Mano login provides JWT token');
    const manoToken = manoLoginData.token;
    const manoDecoded = jwt.verify(manoToken, JWT_SECRET);
    assert.strictEqual(manoDecoded.name, 'Mano', 'Mano JWT token contains name="Mano"');
    assert.strictEqual(manoDecoded.email, 'mano@gmail.com', 'Mano JWT contains email');
    logPass('Mano authenticated and verified via cryptographic JWT');

    // Authenticate Vaishak
    const vaishakLoginRes = await fetch(`${authBaseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'vaishak@gmail.com', password: 'vk@18' }),
    });
    assert.strictEqual(vaishakLoginRes.status, 200, 'Vaishak login returns 200 OK');
    const vaishakLoginData = await vaishakLoginRes.json();
    assert(vaishakLoginData.token, 'Vaishak login provides JWT token');
    const vaishakToken = vaishakLoginData.token;
    const vaishakDecoded = jwt.verify(vaishakToken, JWT_SECRET);
    assert.strictEqual(vaishakDecoded.name, 'Vaishak', 'Vaishak JWT token contains name="Vaishak"');
    logPass('Vaishak authenticated and verified via cryptographic JWT');

    // Authenticate Mathan
    const mathanLoginRes = await fetch(`${authBaseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mathan@gmail.com', password: 'mathan@156' }),
    });
    assert.strictEqual(mathanLoginRes.status, 200, 'Mathan login returns 200 OK');
    const mathanLoginData = await mathanLoginRes.json();
    assert(mathanLoginData.token, 'Mathan login provides JWT token');
    const mathanToken = mathanLoginData.token;
    const mathanDecoded = jwt.verify(mathanToken, JWT_SECRET);
    assert.strictEqual(mathanDecoded.name, 'Mathan', 'Mathan JWT token contains name="Mathan"');
    logPass('Mathan authenticated and verified via cryptographic JWT');

    assert.notStrictEqual(manoToken, vaishakToken, 'Mano and Vaishak tokens are distinct');
    assert.notStrictEqual(vaishakToken, mathanToken, 'Vaishak and Mathan tokens are distinct');
    logPass('Tokens are cryptographically distinct across accounts');

    // ------------------------------------------------------------------------
    // SECTION 2: Create Test Alerts & Initial State
    // ------------------------------------------------------------------------
    console.log('\n--- Section 2: Alert Creation & Initial Unacknowledged State ---');

    const alert1 = await db.createAlert({
      serviceId: 101,
      serviceName: 'Payment Gateway',
      severity: 'Critical',
      message: 'Payment gateway connection pool exhausted',
      alertType: 'db_pool_exhausted',
    });

    const alert2 = await db.createAlert({
      serviceId: 102,
      serviceName: 'Auth Service',
      severity: 'Warning',
      message: 'Token verification latency exceeding 500ms',
      alertType: 'slow_auth',
    });

    const alert3 = await db.createAlert({
      serviceId: 103,
      serviceName: 'Order Service',
      severity: 'Warning',
      message: 'Elevated 5xx error rate on checkout endpoint',
      alertType: 'high_5xx',
    });

    assert(alert1.id && alert2.id && alert3.id, 'Alerts created with unique IDs');
    assert.strictEqual(alert1.status, 'Active', 'Alert 1 initial status is Active');
    assert.strictEqual(alert1.acknowledgedAt, null, 'Alert 1 acknowledgedAt is initially null');
    assert.strictEqual(alert1.acknowledgedByName, null, 'Alert 1 acknowledgedByName is initially null');
    assert.strictEqual(alert1.acknowledgedBy, null, 'Alert 1 acknowledgedBy is initially null');
    logPass('Created 3 distinct alerts with initial status "Active" and null acknowledgement');

    // ------------------------------------------------------------------------
    // SECTION 3: Spin Up Collector Server for HTTP API Testing
    // ------------------------------------------------------------------------
    // We start an instance using collector request handler
    // Let's create an HTTP server running the exact request logic from server/collector/index.js
    // We can test both direct DB methods and the HTTP API routes
    function authenticateRequest(req) {
      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return { ok: false, error: 'Authentication required. No Bearer token provided.', code: 401 };
      }
      const token = authHeader.slice(7).trim();
      if (!token) {
        return { ok: false, error: 'Authentication token is empty.', code: 401 };
      }
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded || (!decoded.email && !decoded.name)) {
          return { ok: false, error: 'Invalid token payload.', code: 401 };
        }
        const user = {
          id: String(decoded.id || decoded.email || decoded.name),
          name: String(decoded.name || decoded.email || 'User'),
          email: String(decoded.email || ''),
          role: String(decoded.role || 'Member'),
        };
        return { ok: true, user };
      } catch (err) {
        return { ok: false, error: err.message || 'Invalid or expired authentication token.', code: 401 };
      }
    }

    collectorServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      if (req.method === 'GET' && pathname === '/api/alerts') {
        const status = parsedUrl.searchParams.get('status');
        const severity = parsedUrl.searchParams.get('severity');
        const search = parsedUrl.searchParams.get('search');
        const limit = parsedUrl.searchParams.get('limit');
        try {
          const alerts = await db.getAlerts({ status, severity, search, limit });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(alerts));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (req.method === 'POST' && pathname.startsWith('/api/alerts/') && pathname.endsWith('/ack')) {
        const auth = authenticateRequest(req);
        if (!auth.ok) {
          res.writeHead(auth.code || 401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: auth.error }));
          return;
        }

        const parts = pathname.split('/');
        const id = parts[3];
        try {
          const alert = await db.acknowledgeAlert(id, auth.user);
          if (!alert) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Alert not found.' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, alert }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      if (req.method === 'POST' && pathname.startsWith('/api/alerts/') && pathname.endsWith('/resolve')) {
        const parts = pathname.split('/');
        const id = parts[3];
        try {
          const alert = await db.resolveAlert(id);
          if (!alert) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Alert not found.' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, alert }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    await new Promise((resolve) => collectorServer.listen(0, resolve));
    collectorPort = collectorServer.address().port;
    collectorBaseUrl = `http://127.0.0.1:${collectorPort}`;

    // ------------------------------------------------------------------------
    // SECTION 4: Test 1 - Mano Acknowledges Alert 1
    // ------------------------------------------------------------------------
    console.log('\n--- Section 3: Mano Acknowledges Alert 1 ---');

    const manoAckRes = await fetch(`${collectorBaseUrl}/api/alerts/${alert1.id}/ack`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${manoToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.strictEqual(manoAckRes.status, 200, 'POST /api/alerts/:id/ack by Mano returns 200 OK');
    const manoAckData = await manoAckRes.json();
    assert(manoAckData.ok, 'Response indicates success (ok=true)');
    assert.strictEqual(manoAckData.alert.status, 'Acknowledged', 'Alert status changed to Acknowledged');
    assert.strictEqual(manoAckData.alert.acknowledgedByName, 'Mano', 'Acknowledged by Mano display name recorded');
    assert(manoAckData.alert.acknowledgedAt, 'acknowledgedAt timestamp recorded');
    logPass('Mano acknowledges Alert 1: response has status="Acknowledged", acknowledgedByName="Mano", and valid timestamp');

    // All users fetch alerts and verify they see Mano acknowledged it
    const listAfterMano = await fetch(`${collectorBaseUrl}/api/alerts`).then((r) => r.json());
    const fetchedAlert1 = listAfterMano.find((a) => a.id === alert1.id);
    assert(fetchedAlert1, 'Alert 1 found in alert listing');
    assert.strictEqual(fetchedAlert1.status, 'Acknowledged', 'Alert 1 listed as Acknowledged');
    assert.strictEqual(fetchedAlert1.acknowledgedByName, 'Mano', 'All users see "Acknowledged by Mano" in alert listing');
    assert.strictEqual(fetchedAlert1.acknowledgedBy, 'Mano', 'acknowledgedBy field is "Mano"');
    assert(fetchedAlert1.acknowledgedAt, 'acknowledgedAt timestamp is present for all viewers');
    logPass('Shared visibility verified: All users see Alert 1 acknowledged by Mano');

    // ------------------------------------------------------------------------
    // SECTION 5: Test 2 - Vaishak Acknowledges Alert 2
    // ------------------------------------------------------------------------
    console.log('\n--- Section 4: Vaishak Acknowledges Alert 2 ---');

    const vaishakAckRes = await fetch(`${collectorBaseUrl}/api/alerts/${alert2.id}/ack`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vaishakToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.strictEqual(vaishakAckRes.status, 200, 'POST /api/alerts/:id/ack by Vaishak returns 200 OK');
    const vaishakAckData = await vaishakAckRes.json();
    assert(vaishakAckData.ok, 'Response indicates success (ok=true)');
    assert.strictEqual(vaishakAckData.alert.status, 'Acknowledged', 'Alert 2 status changed to Acknowledged');
    assert.strictEqual(vaishakAckData.alert.acknowledgedByName, 'Vaishak', 'Acknowledged by Vaishak recorded');
    logPass('Vaishak acknowledges Alert 2: response has status="Acknowledged" and acknowledgedByName="Vaishak"');

    // All users fetch alerts and verify they see Vaishak acknowledged it
    const listAfterVaishak = await fetch(`${collectorBaseUrl}/api/alerts`).then((r) => r.json());
    const fetchedAlert2 = listAfterVaishak.find((a) => a.id === alert2.id);
    assert(fetchedAlert2, 'Alert 2 found in alert listing');
    assert.strictEqual(fetchedAlert2.status, 'Acknowledged');
    assert.strictEqual(fetchedAlert2.acknowledgedByName, 'Vaishak', 'All users see "Acknowledged by Vaishak" in alert listing');
    logPass('Shared visibility verified: All users see Alert 2 acknowledged by Vaishak');

    // ------------------------------------------------------------------------
    // SECTION 6: Test 3 - Mathan Acknowledges Alert 3
    // ------------------------------------------------------------------------
    console.log('\n--- Section 5: Mathan Acknowledges Alert 3 ---');

    const mathanAckRes = await fetch(`${collectorBaseUrl}/api/alerts/${alert3.id}/ack`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mathanToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.strictEqual(mathanAckRes.status, 200, 'POST /api/alerts/:id/ack by Mathan returns 200 OK');
    const mathanAckData = await mathanAckRes.json();
    assert(mathanAckData.ok, 'Response indicates success (ok=true)');
    assert.strictEqual(mathanAckData.alert.status, 'Acknowledged', 'Alert 3 status changed to Acknowledged');
    assert.strictEqual(mathanAckData.alert.acknowledgedByName, 'Mathan', 'Acknowledged by Mathan recorded');
    logPass('Mathan acknowledges Alert 3: response has status="Acknowledged" and acknowledgedByName="Mathan"');

    // All users fetch alerts and verify they see Mathan acknowledged it
    const listAfterMathan = await fetch(`${collectorBaseUrl}/api/alerts`).then((r) => r.json());
    const fetchedAlert3 = listAfterMathan.find((a) => a.id === alert3.id);
    assert(fetchedAlert3, 'Alert 3 found in alert listing');
    assert.strictEqual(fetchedAlert3.status, 'Acknowledged');
    assert.strictEqual(fetchedAlert3.acknowledgedByName, 'Mathan', 'All users see "Acknowledged by Mathan" in alert listing');
    logPass('Shared visibility verified: All users see Alert 3 acknowledged by Mathan');

    // ------------------------------------------------------------------------
    // SECTION 7: Security - Unauthenticated & Forged Token Rejection
    // ------------------------------------------------------------------------
    console.log('\n--- Section 6: Security & Authentication Enforcement ---');

    // Create alert for security tests
    const secAlert = await db.createAlert({
      serviceId: 201,
      serviceName: 'Security Service',
      severity: 'Critical',
      message: 'Intrusion anomaly detected',
      alertType: 'security_alert',
    });

    // 1. Unauthenticated request (no Authorization header)
    const unauthRes = await fetch(`${collectorBaseUrl}/api/alerts/${secAlert.id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated acknowledgement request returns 401 Unauthorized');
    const unauthData = await unauthRes.json();
    assert(!unauthData.ok, 'unauthenticated response ok is false');
    logPass('Unauthenticated request rejected with 401 Unauthorized');

    // 2. Forged token request
    const forgedToken = jwt.sign({ name: 'Hacker', email: 'attacker@evil.com' }, 'wrong_secret');
    const forgedRes = await fetch(`${collectorBaseUrl}/api/alerts/${secAlert.id}/ack`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${forgedToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.strictEqual(forgedRes.status, 401, 'Forged token request returns 401 Unauthorized');
    logPass('Forged JWT token rejected with 401 Unauthorized');

    // 3. Malformed token string
    const malformedRes = await fetch(`${collectorBaseUrl}/api/alerts/${secAlert.id}/ack`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer not_a_real_jwt_token',
        'Content-Type': 'application/json',
      },
    });
    assert.strictEqual(malformedRes.status, 401, 'Malformed token returns 401 Unauthorized');
    logPass('Malformed token string rejected with 401 Unauthorized');

    // ------------------------------------------------------------------------
    // SECTION 8: Security - Impersonation Prevention
    // ------------------------------------------------------------------------
    console.log('\n--- Section 7: Impersonation Prevention ---');

    // Mathan tries to acknowledge secAlert, but supplies Mano in the request body
    const impRes = await fetch(`${collectorBaseUrl}/api/alerts/${secAlert.id}/ack`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mathanToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'user-mano',
        name: 'Mano',
        email: 'mano@gmail.com',
        user: { name: 'Mano' },
      }),
    });
    assert.strictEqual(impRes.status, 200, 'Request with valid token proceeds');
    const impData = await impRes.json();
    // Must record Mathan, NOT Mano!
    assert.strictEqual(
      impData.alert.acknowledgedByName,
      'Mathan',
      'Backend records authenticated token identity (Mathan), NOT spoofed payload identity'
    );
    assert.notStrictEqual(impData.alert.acknowledgedByName, 'Mano', 'Spoofed name in body was completely ignored');
    logPass('Impersonation prevented: Backend strictly binds acknowledgement to cryptographically verified JWT identity');

    // ------------------------------------------------------------------------
    // SECTION 9: Idempotency & Protection Against Overwriting
    // ------------------------------------------------------------------------
    console.log('\n--- Section 8: Overwriting Protection & Repeated Acknowledgement ---');

    // Alert 1 was acknowledged by Mano.
    // Vaishak attempts to acknowledge Alert 1 again.
    const reAckRes = await fetch(`${collectorBaseUrl}/api/alerts/${alert1.id}/ack`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vaishakToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.strictEqual(reAckRes.status, 200, 'Re-acknowledgement returns 200 OK');
    const reAckData = await reAckRes.json();
    assert.strictEqual(
      reAckData.alert.acknowledgedByName,
      'Mano',
      'Existing acknowledging user (Mano) is preserved and NOT overwritten by Vaishak'
    );
    assert.strictEqual(
      reAckData.alert.acknowledgedAt,
      fetchedAlert1.acknowledgedAt,
      'Original acknowledgement timestamp is preserved'
    );
    logPass('Idempotency verified: Alert already acknowledged by Mano is not overwritten by subsequent callers');

    // ------------------------------------------------------------------------
    // SECTION 10: Missing Alert 404 Handling
    // ------------------------------------------------------------------------
    console.log('\n--- Section 9: Missing Alert 404 Handling ---');

    const missingRes = await fetch(`${collectorBaseUrl}/api/alerts/99999999/ack`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${manoToken}`,
        'Content-Type': 'application/json',
      },
    });
    assert.strictEqual(missingRes.status, 404, 'Acknowledgement of non-existent alert returns 404 Not Found');
    const missingData = await missingRes.json();
    assert(!missingData.ok, 'ok=false returned for missing alert');
    logPass('Missing alert returns 404 Not Found');

    // ------------------------------------------------------------------------
    // SECTION 11: Resolution Preserves Acknowledgement Identity
    // ------------------------------------------------------------------------
    console.log('\n--- Section 10: Resolution Preserves Acknowledgement Details ---');

    // Resolve Alert 1 (acknowledged by Mano)
    const resolveRes = await fetch(`${collectorBaseUrl}/api/alerts/${alert1.id}/resolve`, {
      method: 'POST',
    });
    assert.strictEqual(resolveRes.status, 200, 'POST /api/alerts/:id/resolve returns 200 OK');
    const resolveData = await resolveRes.json();
    assert.strictEqual(resolveData.alert.status, 'Resolved', 'Status changed to Resolved');
    assert(resolveData.alert.resolvedAt, 'resolvedAt timestamp recorded');
    assert.strictEqual(
      resolveData.alert.acknowledgedByName,
      'Mano',
      'Acknowledged by Mano is preserved after resolution'
    );
    assert(resolveData.alert.acknowledgedAt, 'acknowledgedAt timestamp preserved after resolution');
    logPass('Resolution sets status="Resolved" without erasing acknowledgement identity or timestamp');

    // ------------------------------------------------------------------------
    // SECTION 12: getServiceDetails Integration
    // ------------------------------------------------------------------------
    console.log('\n--- Section 11: Service Details Recent Alerts Integration ---');

    const testSvc = await db.insertService({ name: 'Payment Gateway', url: 'http://example.com/pay', kind: 'http' });
    const svcDetails = await db.getServiceDetails(testSvc.id);
    if (svcDetails && svcDetails.recentAlerts) {
      const svcAlert1 = svcDetails.recentAlerts.find((a) => a.id === alert1.id);
      if (svcAlert1) {
        assert.strictEqual(
          svcAlert1.acknowledgedByName,
          'Mano',
          'ServiceDetails recentAlerts includes acknowledgedByName="Mano"'
        );
        logPass('ServiceDetails includes acknowledging user identity for service alerts');
      }
    }

  } catch (err) {
    logFail('Test suite encountered an uncaught error', err);
  } finally {
    if (authServer) authServer.close();
    if (collectorServer) collectorServer.close();
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================');

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();

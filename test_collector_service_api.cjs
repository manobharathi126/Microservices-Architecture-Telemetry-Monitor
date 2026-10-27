// ============================================================================
// test_collector_service_api.cjs — Integration Tests for Collector Service API
// Tests HTTP POST /api/services/verify, POST /api/services, PUT /api/services/:id
// ============================================================================

const assert = require('assert');
const http = require('http');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          passedTests++;
          console.log(`  ✓ PASS: ${name}`);
        })
        .catch((err) => {
          failedTests++;
          console.error(`  ✗ FAIL: ${name}`);
          console.error(`    ${err.message}`);
        });
    }
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

function makeRequest(port, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('\n=== RUNNING COLLECTOR SERVICE API INTEGRATION TESTS ===\n');

  // Launch collector in isolated port
  process.env.PORT = '6101';
  process.env.DB_HOST = '127.0.0.1'; // Force in-memory fallback fast
  process.env.DB_PORT = '3306';

  const collector = require('./server/collector/index.js');
  // Wait a moment for collector to listen
  await new Promise((r) => setTimeout(r, 600));

  // 1. Test POST /api/services/verify with reachable URL
  await test('POST /api/services/verify returns 200 for reachable public URL', async () => {
    const res = await makeRequest(6101, 'POST', '/api/services/verify', { url: 'https://pypi.org' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.strictEqual(res.data.normalizedUrl, 'https://pypi.org/');
  });

  // 2. Test POST /api/services/verify with nonexistent domain
  await test('POST /api/services/verify returns 400 for nonexistent domain', async () => {
    const res = await makeRequest(6101, 'POST', '/api/services/verify', {
      url: 'https://nonexistent-fake-domain-xyz123456.org',
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.ok, false);
    assert.strictEqual(res.data.error, 'This domain could not be found. Please check the URL.');
  });

  // 3. Test POST /api/services/verify with SSRF loopback
  await test('POST /api/services/verify blocks loopback/private IP', async () => {
    const res = await makeRequest(6101, 'POST', '/api/services/verify', {
      url: 'http://127.0.0.1:8080/admin',
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.ok, false);
    assert.strictEqual(res.data.error, 'This URL points to a restricted or internal network address.');
  });

  // 4. Test POST /api/services creates verified service
  let createdId = null;
  await test('POST /api/services creates a verified service', async () => {
    const res = await makeRequest(6101, 'POST', '/api/services', {
      name: 'Integration Test Service',
      url: 'https://registry.npmjs.org',
      kind: 'ping',
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.ok, true);
    assert.ok(res.data.service.id);
    createdId = res.data.service.id;
  });

  // 5. Test POST /api/services rejects duplicate URL
  await test('POST /api/services rejects duplicate URL', async () => {
    const res = await makeRequest(6101, 'POST', '/api/services', {
      name: 'Duplicate NPM',
      url: 'https://registry.npmjs.org/',
      kind: 'ping',
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.data.ok, false);
    assert.ok(res.data.error.includes('already being monitored'));
  });

  // 6. Test PUT /api/services/:id updates service name and verifies new URL
  await test('PUT /api/services/:id updates service with verified URL', async () => {
    assert.ok(createdId);
    const res = await makeRequest(6101, 'PUT', `/api/services/${createdId}`, {
      name: 'Updated NPM Service',
      url: 'https://pypi.org',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.strictEqual(res.data.service.name, 'Updated NPM Service');
    assert.strictEqual(res.data.service.url, 'https://pypi.org/');
  });

  // 7. Test PUT /api/services/:id rejects invalid URL and does not modify service
  await test('PUT /api/services/:id rejects SSRF URL and keeps existing', async () => {
    assert.ok(createdId);
    const res = await makeRequest(6101, 'PUT', `/api/services/${createdId}`, {
      url: 'http://169.254.169.254/meta',
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.ok, false);
    assert.strictEqual(res.data.error, 'This URL points to a restricted or internal network address.');
  });

  // Clean up created service via DELETE
  await makeRequest(6101, 'DELETE', `/api/services/${createdId}`);

  console.log('\n============================================================');
  console.log(`API TEST RESULTS: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('============================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal API test error:', err);
  process.exit(1);
});

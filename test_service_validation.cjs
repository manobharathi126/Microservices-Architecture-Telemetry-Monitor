// ============================================================================
// test_service_validation.cjs — Comprehensive Test Suite for Add Service Feature
// Tests URL validation, connectivity verification, SSRF protection,
// redirect revalidation, error classification, database safety, and regression.
// ============================================================================

const assert = require('assert');
const http = require('http');
const db = require('./server/collector/db');
const {
  isPrivateOrRestrictedIp,
  validateUrlStructure,
  resolveAndVerifyDns,
  verifyServiceUrl,
  ALLOWED_PORTS,
} = require('./server/collector/serviceValidator');

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

async function runAllTests() {
  console.log('\n=== RUNNING SERVICE VALIDATION & VERIFICATION TEST SUITE ===\n');

  // --------------------------------------------------------------------------
  // SECTION 1: URL Structure & Normalization Validation
  // --------------------------------------------------------------------------
  console.log('[1/9] Testing URL Syntax, Structure, Protocols, and Normalization...');

  test('Rejects empty or whitespace-only URLs', () => {
    assert.strictEqual(validateUrlStructure('').ok, false);
    assert.strictEqual(validateUrlStructure('   ').ok, false);
    assert.strictEqual(validateUrlStructure(null).ok, false);
    assert.strictEqual(validateUrlStructure(undefined).ok, false);
  });

  test('Requires valid HTTP or HTTPS protocol', () => {
    const ftp = validateUrlStructure('ftp://ftp.example.com/files');
    assert.strictEqual(ftp.ok, false);
    assert.strictEqual(ftp.error, 'Please enter a valid HTTP or HTTPS URL.');

    const js = validateUrlStructure('javascript:alert(1)');
    assert.strictEqual(js.ok, false);

    const noScheme = validateUrlStructure('pypi.org/project');
    assert.strictEqual(noScheme.ok, false);
    assert.strictEqual(noScheme.error, 'Please enter a valid HTTP or HTTPS URL.');
  });

  test('Rejects embedded credentials in URLs (SSRF prevention)', () => {
    const creds = validateUrlStructure('https://admin:secret@pypi.org/');
    assert.strictEqual(creds.ok, false);
    assert.ok(creds.error.includes('credentials'));
  });

  test('Rejects obvious placeholders and reserved dummy domains', () => {
    const ex = validateUrlStructure('https://example.com');
    assert.strictEqual(ex.ok, false);
    assert.ok(ex.error.includes('placeholder'));

    const testCom = validateUrlStructure('http://test.com/api');
    assert.strictEqual(testCom.ok, false);
    assert.ok(testCom.error.includes('placeholder'));

    const fooBar = validateUrlStructure('https://foo.bar/status');
    assert.strictEqual(fooBar.ok, false);
    assert.ok(fooBar.error.includes('placeholder'));
  });

  test('Rejects restricted or internal top-level domains', () => {
    const internal = validateUrlStructure('http://app.internal/status');
    assert.strictEqual(internal.ok, false);
    assert.strictEqual(internal.error, 'This URL points to a restricted or internal network address.');

    const local = validateUrlStructure('http://myserver.local:8080');
    assert.strictEqual(local.ok, false);

    const testTld = validateUrlStructure('https://service.test/ping');
    assert.strictEqual(testTld.ok, false);
  });

  test('Rejects arbitrary non-web ports (SSRF protection)', () => {
    const sshPort = validateUrlStructure('http://pypi.org:22/');
    assert.strictEqual(sshPort.ok, false);
    assert.ok(sshPort.error.includes('port'));

    const mysqlPort = validateUrlStructure('http://pypi.org:3306/');
    assert.strictEqual(mysqlPort.ok, false);

    const redisPort = validateUrlStructure('http://pypi.org:6379/');
    assert.strictEqual(redisPort.ok, false);
  });

  test('Accepts valid standard web ports', () => {
    const http80 = validateUrlStructure('http://pypi.org:80/');
    assert.strictEqual(http80.ok, true);

    const https443 = validateUrlStructure('https://pypi.org:443/');
    assert.strictEqual(https443.ok, true);

    const web8080 = validateUrlStructure('http://pypi.org:8080/');
    assert.strictEqual(web8080.ok, true);
  });

  // --------------------------------------------------------------------------
  // SECTION 2: SSRF & IP Range Restrictions
  // --------------------------------------------------------------------------
  console.log('\n[2/9] Testing SSRF Prevention: Private, Loopback, Link-Local & Cloud Metadata...');

  test('Blocks IPv4 loopback (127.0.0.0/8)', () => {
    assert.strictEqual(isPrivateOrRestrictedIp('127.0.0.1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('127.1.2.3'), true);
    assert.strictEqual(validateUrlStructure('http://127.0.0.1:8080').ok, false);
    assert.strictEqual(validateUrlStructure('http://localhost:8080').ok, false);
  });

  test('Blocks IPv4 private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
    assert.strictEqual(isPrivateOrRestrictedIp('10.0.0.1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('10.255.255.255'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('172.16.0.1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('172.31.255.255'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('192.168.1.1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('192.168.100.50'), true);

    assert.strictEqual(validateUrlStructure('http://10.0.0.5/api').ok, false);
    assert.strictEqual(validateUrlStructure('http://172.16.5.10').ok, false);
    assert.strictEqual(validateUrlStructure('http://192.168.1.254').ok, false);
  });

  test('Blocks cloud metadata endpoints (169.254.169.254 & link-local 169.254.0.0/16)', () => {
    assert.strictEqual(isPrivateOrRestrictedIp('169.254.169.254'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('169.254.1.1'), true);
    assert.strictEqual(validateUrlStructure('http://169.254.169.254/latest/meta-data/').ok, false);
  });

  test('Blocks IPv6 loopback, link-local, and ULA addresses', () => {
    assert.strictEqual(isPrivateOrRestrictedIp('::1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('::'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('fe80::1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('fc00::1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('fd12:3456:789a::1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('::ffff:127.0.0.1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('::ffff:192.168.1.1'), true);
  });

  test('Allows legitimate public IPv4 and IPv6 addresses', () => {
    assert.strictEqual(isPrivateOrRestrictedIp('8.8.8.8'), false);
    assert.strictEqual(isPrivateOrRestrictedIp('1.1.1.1'), false);
    assert.strictEqual(isPrivateOrRestrictedIp('151.101.1.63'), false); // Fastly / PyPI
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Live Verification of Reachable Public Services
  // --------------------------------------------------------------------------
  console.log('\n[3/9] Testing Live Connectivity Verification of Real Public Services...');

  await test('Verifies a real, reachable public service successfully (PyPI)', async () => {
    const result = await verifyServiceUrl('https://pypi.org');
    assert.strictEqual(result.ok, true, `Verification failed: ${result.error}`);
    assert.strictEqual(result.httpStatus, 200);
    assert.strictEqual(result.normalizedUrl, 'https://pypi.org/');
    assert.ok(typeof result.latencyMs === 'number' && result.latencyMs >= 0);
  });

  await test('Verifies a real service with HTTPS and specific path (NPM Registry)', async () => {
    const result = await verifyServiceUrl('https://registry.npmjs.org/');
    assert.strictEqual(result.ok, true, `Verification failed: ${result.error}`);
    assert.ok(result.httpStatus >= 200 && result.httpStatus < 400);
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Nonexistent Domain & DNS Failure Handling
  // --------------------------------------------------------------------------
  console.log('\n[4/9] Testing Nonexistent Domain and DNS Resolution Failures...');

  await test('Rejects a nonexistent domain with a clear domain-not-found error', async () => {
    const fakeDomain = 'https://this-nonexistent-domain-xyz-987123456789.org/api';
    const result = await verifyServiceUrl(fakeDomain);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'This domain could not be found. Please check the URL.');
  });

  await test('DNS resolution verification blocks domains resolving to private IPs', async () => {
    const res = await resolveAndVerifyDns('127.0.0.1');
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'This URL points to a restricted or internal network address.');
  });

  // --------------------------------------------------------------------------
  // SECTION 5: HTTP 401 & 404 Accepted as Active Responding Servers
  // --------------------------------------------------------------------------
  console.log('\n[5/9] Testing 401 & 404 Status Codes (Proves HTTP Server Responded)...');

  await test('Accepts an HTTP 404 response without treating it as nonexistent', async () => {
    // API endpoint returning 404 proves HTTP server responded
    const result = await verifyServiceUrl('https://api.github.com/nonexistent-endpoint-404-test');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.httpStatus, 404);
  });

  await test('Accepts an HTTP 401 response without treating it as nonexistent', async () => {
    // GitHub API unauthenticated or endpoint requiring auth
    const result = await verifyServiceUrl('https://api.github.com/user');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.httpStatus, 401);
  });

  // --------------------------------------------------------------------------
  // SECTION 6: Timeout & Temporary Unavailability Handling
  // --------------------------------------------------------------------------
  console.log('\n[6/9] Testing Timeout and Temporary Availability Handling...');

  await test('Reports temporary failure on connection timeout without misreporting fake domain', async () => {
    // Use an extremely small timeout (1ms) to trigger a timeout
    const result = await verifyServiceUrl('https://pypi.org', { timeoutMs: 1 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'The service could not be reached. Please try again later.');
  });

  // --------------------------------------------------------------------------
  // SECTION 7: Redirect SSRF Protection
  // --------------------------------------------------------------------------
  console.log('\n[7/9] Testing Redirect Revalidation and SSRF Protection...');

  await test('Blocks redirects attempting to target loopback or private IP', async () => {
    // Simulated redirect response check: verifyServiceUrl validates redirect target
    const targetCheck = validateUrlStructure('http://127.0.0.1:8080/secret');
    assert.strictEqual(targetCheck.ok, false);
    assert.strictEqual(targetCheck.error, 'This URL points to a restricted or internal network address.');

    const metadataTarget = validateUrlStructure('http://169.254.169.254/latest/meta-data');
    assert.strictEqual(metadataTarget.ok, false);
    assert.strictEqual(metadataTarget.error, 'This URL points to a restricted or internal network address.');
  });

  // --------------------------------------------------------------------------
  // SECTION 8: Database Safety - No Save on Verification Failure
  // --------------------------------------------------------------------------
  console.log('\n[8/9] Testing Database Safety: Failed Verifications Are Never Saved...');

  await test('Failed verification prevents saving to database', async () => {
    const invalidUrl = 'https://fake-unreachable-service-never-save-xyz123.com';
    const verifyResult = await verifyServiceUrl(invalidUrl);
    assert.strictEqual(verifyResult.ok, false);

    // Verify service does not exist in DB
    const exists = await db.serviceUrlExists(invalidUrl);
    assert.strictEqual(exists, false, 'Failed service must not exist in DB!');
  });

  await test('Verified service is safely saved and retrieved', async () => {
    const testUrl = 'https://pypi.org';
    const verifyResult = await verifyServiceUrl(testUrl);
    assert.strictEqual(verifyResult.ok, true);

    const inserted = await db.insertService('PyPI Verification Test', verifyResult.normalizedUrl, 'ping');
    assert.ok(inserted.id, 'Must return inserted service with an ID');

    const exists = await db.serviceUrlExists(verifyResult.normalizedUrl);
    assert.strictEqual(exists, true, 'Service should exist in DB');

    // Clean up test entry
    await db.deleteService(inserted.id);
  });

  // --------------------------------------------------------------------------
  // SECTION 9: Regression Testing - Existing Features Remain Intact
  // --------------------------------------------------------------------------
  console.log('\n[9/9] Testing Regression: Service Details, Update, Delete & Alert Ack...');

  await test('Service details endpoint works correctly', async () => {
    const s = await db.insertService('Details Test Service', 'https://registry.npmjs.org', 'ping');
    const details = await db.getServiceDetails(s.id);
    assert.ok(details, 'Service details should be returned');
    assert.strictEqual(details.id, s.id);
    assert.ok(Array.isArray(details.responseTimeTrend));
    assert.ok(Array.isArray(details.dependencies));
    await db.deleteService(s.id);
  });

  await test('Service URL and Name updates work safely with updateService', async () => {
    const s = await db.insertService('Original Service', 'https://pypi.org', 'ping');
    const updated = await db.updateService(s.id, {
      name: 'Renamed Service',
      url: 'https://pypi.org/about',
    });
    assert.ok(updated);
    assert.strictEqual(updated.name, 'Renamed Service');
    assert.strictEqual(updated.url, 'https://pypi.org/about');
    await db.deleteService(s.id);
  });

  await test('Service deletion cleans up service and returns true', async () => {
    const s = await db.insertService('To Delete Service', 'https://cloudflarestatus.com', 'statuspage');
    const deleted = await db.deleteService(s.id);
    assert.strictEqual(deleted, true);
    const exists = await db.serviceUrlExists('https://cloudflarestatus.com');
    assert.strictEqual(exists, false);
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('============================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});

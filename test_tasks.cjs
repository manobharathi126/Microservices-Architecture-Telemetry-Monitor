// test_tasks.cjs — Tests for the 3 tasks:
// 1. Service Details uninstrumented metrics removal & layout
// 2. Analytics 6h default range & API request
// 3. Global dashboard search across real services, traces, and logs

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const db = require('./server/collector/db.js');

let passCount = 0;
let failCount = 0;

function pass(name) {
  console.log(`[PASS] ${name}`);
  passCount++;
}

function fail(name, err) {
  console.error(`[FAIL] ${name}:`, err.message || err);
  failCount++;
}

async function runTests() {
  console.log('============================================================');
  console.log('RUNNING TELEMETRYOPS TASKS 1, 2, 3 TEST SUITE');
  console.log('============================================================\n');

  // ------------------------------------------------------------
  // SECTION 1: TASK 1 — Service Details UI & Metrics
  // ------------------------------------------------------------
  console.log('--- TASK 1: SERVICE DETAILS METRICS AUDIT ---');

  const serviceDetailsCode = fs.readFileSync(
    path.join(__dirname, 'src', 'pages', 'ServiceDetails.jsx'),
    'utf-8'
  );

  // Check 1.1: Verify CPU Usage card is removed
  try {
    assert(!serviceDetailsCode.includes("label: 'CPU Usage'"), 'CPU Usage card should be removed');
    pass('Test 1.1: CPU Usage card removed from metrics array');
  } catch (err) { fail('Test 1.1', err); }

  // Check 1.2: Verify Memory Usage card is removed
  try {
    assert(!serviceDetailsCode.includes("label: 'Memory Usage'"), 'Memory Usage card should be removed');
    pass('Test 1.2: Memory Usage card removed from metrics array');
  } catch (err) { fail('Test 1.2', err); }

  // Check 1.3: Verify Network card is removed
  try {
    assert(!serviceDetailsCode.includes("label: 'Network'"), 'Network card should be removed');
    pass('Test 1.3: Network card removed from metrics array');
  } catch (err) { fail('Test 1.3', err); }

  // Check 1.4: Verify Disk Usage card is removed
  try {
    assert(!serviceDetailsCode.includes("label: 'Disk Usage'"), 'Disk Usage card should be removed');
    pass('Test 1.4: Disk Usage card removed from metrics array');
  } catch (err) { fail('Test 1.4', err); }

  // Check 1.5: Verify uninstrumented host chart cards are removed
  try {
    assert(!serviceDetailsCode.includes('Host CPU Usage Trend'), 'Host CPU chart card should be removed');
    assert(!serviceDetailsCode.includes('Host Memory Usage Trend'), 'Host Memory chart card should be removed');
    pass('Test 1.5: Host uninstrumented chart cards removed from charts grid');
  } catch (err) { fail('Test 1.5', err); }

  // Check 1.6: Verify the 5 required cards are preserved
  try {
    assert(serviceDetailsCode.includes("label: 'Health Status'"), 'Health Status must be preserved');
    assert(serviceDetailsCode.includes("label: 'Response Time'"), 'Response Time must be preserved');
    assert(serviceDetailsCode.includes("label: 'Health Checks'"), 'Health Checks must be preserved');
    assert(serviceDetailsCode.includes("label: 'Failed Checks'"), 'Failed Checks must be preserved');
    assert(serviceDetailsCode.includes("label: 'Uptime'"), 'Uptime must be preserved');
    pass('Test 1.6: All 5 real measured metric cards preserved (Health, Response Time, Checks, Failures, Uptime)');
  } catch (err) { fail('Test 1.6', err); }

  // Check 1.7: Verify charts and bottom sections are preserved
  try {
    assert(serviceDetailsCode.includes('ResponseTimeChart'), 'ResponseTimeChart must be preserved');
    assert(serviceDetailsCode.includes('RequestTrendChart'), 'RequestTrendChart must be preserved');
    assert(serviceDetailsCode.includes('Recent Health Check Logs'), 'Recent Logs must be preserved');
    assert(serviceDetailsCode.includes('Recent Alerts'), 'Recent Alerts must be preserved');
    assert(serviceDetailsCode.includes('Cluster Services'), 'Dependencies/Peers must be preserved');
    pass('Test 1.7: Response Time Trend, Health Check Volume, Recent Logs, Recent Alerts, and Dependencies preserved');
  } catch (err) { fail('Test 1.7', err); }

  // Check 1.8: Check CSS layout adjustments for 5 columns
  const servicesCss = fs.readFileSync(
    path.join(__dirname, 'src', 'css', 'Services.css'),
    'utf-8'
  );
  try {
    assert(servicesCss.includes('.detail-metrics-grid'), '.detail-metrics-grid class must exist');
    assert(servicesCss.includes('repeat(5, 1fr)'), 'Desktop 5-column layout must be defined');
    assert(servicesCss.includes('@media (max-width: 640px)'), 'Mobile responsive media query must be defined');
    pass('Test 1.8: Responsive layout grid adjusted with 5 equal desktop columns and mobile wrap');
  } catch (err) { fail('Test 1.8', err); }

  // ------------------------------------------------------------
  // SECTION 2: TASK 2 — Analytics Default Range to 6 Hours
  // ------------------------------------------------------------
  console.log('\n--- TASK 2: ANALYTICS DEFAULT TIME RANGE ---');

  const analyticsCode = fs.readFileSync(
    path.join(__dirname, 'src', 'pages', 'Analytics.jsx'),
    'utf-8'
  );

  // Check 2.1: Verify initial state in Analytics.jsx
  try {
    assert(analyticsCode.includes("useState('6h')"), "Analytics initial state must be '6h'");
    assert(!analyticsCode.includes("useState('24h')"), "Analytics initial state must not be '24h'");
    pass("Test 2.1: Analytics component initial time-range state is '6h'");
  } catch (err) { fail('Test 2.1', err); }

  // Check 2.2: Verify all 5 ranges are preserved
  try {
    const rangeMatch = analyticsCode.includes("const RANGES = ['1h', '6h', '24h', '7d', '30d']");
    assert(rangeMatch, 'All 5 ranges (1h, 6h, 24h, 7d, 30d) must be preserved');
    pass('Test 2.2: Preserved all 5 standard ranges: 1h, 6h, 24h, 7d, 30d');
  } catch (err) { fail('Test 2.2', err); }

  // Check 2.3: Verify api.js default range
  const apiCode = fs.readFileSync(
    path.join(__dirname, 'src', 'utils', 'api.js'),
    'utf-8'
  );
  try {
    assert(apiCode.includes("fetchAnalytics(range = '6h')"), "fetchAnalytics default param must be '6h'");
    pass("Test 2.3: api.js fetchAnalytics default parameter updated to '6h'");
  } catch (err) { fail('Test 2.3', err); }

  // Check 2.4: Verify collector index.js default range
  const collectorIndexCode = fs.readFileSync(
    path.join(__dirname, 'server', 'collector', 'index.js'),
    'utf-8'
  );
  try {
    assert(collectorIndexCode.includes("parsedUrl.searchParams.get('range') || '6h'"), "Collector analytics endpoint default must be '6h'");
    pass("Test 2.4: Collector backend default analytics query param updated to '6h'");
  } catch (err) { fail('Test 2.4', err); }

  // Check 2.5: Backend db.getAnalyticsData('6h') executes successfully
  try {
    const analyticsResult = await db.getAnalyticsData('6h');
    assert(analyticsResult, 'Analytics data object returned');
    assert.strictEqual(analyticsResult.range, '6h');
    pass("Test 2.5: Backend getAnalyticsData('6h') returns range='6h' payload correctly");
  } catch (err) { fail('Test 2.5', err); }

  // ------------------------------------------------------------
  // SECTION 3: TASK 3 — Global Dashboard Search
  // ------------------------------------------------------------
  console.log('\n--- TASK 3: GLOBAL DASHBOARD SEARCH ---');

  // Insert real test entities for search verification
  const testSvcName = `SearchTarget-${Date.now()}`;
  const svc = await db.insertService(testSvcName, `https://${testSvcName.toLowerCase()}.org/health`, 'ping');

  const testTraceId = `trace-search-${Date.now()}`;
  await db.recordTrace({
    id: testTraceId,
    name: 'Telemetry Poll Cycle',
    status: 'Success',
    duration: 185,
    spans: [{ serviceId: svc.id, service: testSvcName, status: 'Success', duration: 185, start: 0 }],
  });

  const testLogMsg = `HealthCheck probe successful for ${testSvcName} code 200`;
  await db.recordLog({
    serviceId: svc.id,
    serviceName: testSvcName,
    level: 'INFO',
    message: testLogMsg,
  });

  // Check 3.1: Search actual service by service name
  try {
    const res = await db.searchAll(testSvcName);
    assert(res.services.length > 0, 'Should find service by name');
    const match = res.services.find(s => s.name === testSvcName);
    assert(match, 'Matched service should have correct name');
    assert.strictEqual(match.id, svc.id);
    pass(`Test 3.1: Search finds actual service by name ("${testSvcName}")`);
  } catch (err) { fail('Test 3.1', err); }

  // Check 3.2: Search actual trace by trace ID
  try {
    const res = await db.searchAll(testTraceId);
    assert(res.traces.length > 0, 'Should find trace by trace ID');
    const match = res.traces.find(t => t.id === testTraceId);
    assert(match, 'Matched trace should have correct trace ID');
    assert.strictEqual(match.status, 'Success');
    assert.strictEqual(match.duration, 185);
    pass(`Test 3.2: Search finds actual trace by trace ID ("${testTraceId}")`);
  } catch (err) { fail('Test 3.2', err); }

  // Check 3.3: Search actual trace by request/operation name
  try {
    const res = await db.searchAll('Telemetry Poll Cycle');
    assert(res.traces.length > 0, 'Should find traces by operation name');
    pass('Test 3.3: Search finds actual traces by request/operation name ("Telemetry Poll Cycle")');
  } catch (err) { fail('Test 3.3', err); }

  // Check 3.4: Search actual log by log message text
  try {
    const res = await db.searchAll('probe successful');
    assert(res.logs.length > 0, 'Should find log by contained phrase');
    const match = res.logs.find(l => l.message.includes('probe successful'));
    assert(match, 'Matched log contains expected text');
    assert.strictEqual(match.service, testSvcName);
    pass('Test 3.4: Search finds actual logs by message phrase ("probe successful")');
  } catch (err) { fail('Test 3.4', err); }

  // Check 3.5: Search actual log by service name
  try {
    const res = await db.searchAll(testSvcName);
    assert(res.logs.length > 0, 'Should find logs for service name');
    const match = res.logs.find(l => l.service === testSvcName);
    assert(match, 'Matched log has service name');
    pass(`Test 3.5: Search finds actual logs by service name ("${testSvcName}")`);
  } catch (err) { fail('Test 3.5', err); }

  // Check 3.6: Search for nonexistent query
  try {
    const res = await db.searchAll('zzzzNonExistentTerm99999');
    assert.strictEqual(res.services.length, 0);
    assert.strictEqual(res.traces.length, 0);
    assert.strictEqual(res.logs.length, 0);
    assert.strictEqual(res.total, 0);
    pass('Test 3.6: Nonexistent search term returns empty groups without crashing');
  } catch (err) { fail('Test 3.6', err); }

  // Check 3.7: Search with empty / whitespace query
  try {
    const res1 = await db.searchAll('');
    assert.strictEqual(res1.total, 0);
    const res2 = await db.searchAll('   ');
    assert.strictEqual(res2.total, 0);
    pass('Test 3.7: Empty or whitespace query returns zero results without unnecessary queries');
  } catch (err) { fail('Test 3.7', err); }

  // Check 3.8: Navbar component verification
  const navbarCode = fs.readFileSync(
    path.join(__dirname, 'src', 'components', 'Navbar.jsx'),
    'utf-8'
  );
  try {
    assert(navbarCode.includes('searchGlobal'), 'Navbar imports searchGlobal');
    assert(navbarCode.includes('showSearchDropdown'), 'Navbar tracks showSearchDropdown state');
    assert(navbarCode.includes('selectedSearchIndex'), 'Navbar tracks selectedSearchIndex for keyboard navigation');
    assert(navbarCode.includes("e.key === 'ArrowDown'"), 'Navbar handles ArrowDown keyboard navigation');
    assert(navbarCode.includes("e.key === 'ArrowUp'"), 'Navbar handles ArrowUp keyboard navigation');
    assert(navbarCode.includes("e.key === 'Escape'"), 'Navbar handles Escape key to dismiss dropdown');
    assert(navbarCode.includes('handleClearSearch'), 'Navbar provides clear search button');
    assert(navbarCode.includes('navbar-search-clear'), 'Navbar renders clear button');
    assert(navbarCode.includes('navbar-search-spinner'), 'Navbar renders loading spinner');
    assert(navbarCode.includes('search-status-message'), 'Navbar displays searching loading state');
    assert(navbarCode.includes('search-empty-state'), 'Navbar displays empty state when no results match');
    assert(navbarCode.includes('search-error-state'), 'Navbar displays error state if search fails');
    pass('Test 3.8: Navbar component includes debouncing, clear, keyboard navigation, loading, and error states');
  } catch (err) { fail('Test 3.8', err); }

  // Check 3.9: Navigation target pages read useSearchParams
  const tracingCode = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'Tracing.jsx'), 'utf-8');
  const logsPageCode = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'Logs.jsx'), 'utf-8');
  const servicesPageCode = fs.readFileSync(path.join(__dirname, 'src', 'pages', 'Services.jsx'), 'utf-8');
  try {
    assert(tracingCode.includes('useSearchParams'), 'Tracing.jsx reads useSearchParams');
    assert(logsPageCode.includes('useSearchParams'), 'Logs.jsx reads useSearchParams');
    assert(servicesPageCode.includes('useSearchParams'), 'Services.jsx reads useSearchParams');
    pass('Test 3.9: Target pages (Tracing, Logs, Services) automatically pre-fill search from URL query parameter');
  } catch (err) { fail('Test 3.9', err); }

  // Clean up test service
  await db.deleteService(svc.id);

  console.log('\n============================================================');
  console.log(`TASKS 1, 2, 3 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('============================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

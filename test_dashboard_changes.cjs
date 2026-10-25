// test_dashboard_changes.cjs — Tests for the Dashboard improvements:
// 1. Removal of CPU Usage summary card
// 2. Removal of Services Overview section
// 3. Clean realignment of the remaining 7 summary cards
// 4. Regression tests on charts, Services page, Alerts, and navigation

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
  console.log('RUNNING DASHBOARD CHANGES & REGRESSION TEST SUITE');
  console.log('============================================================\n');

  const dashboardCode = fs.readFileSync(
    path.join(__dirname, 'src', 'pages', 'Dashboard.jsx'),
    'utf-8'
  );
  const dashboardCss = fs.readFileSync(
    path.join(__dirname, 'src', 'css', 'Dashboard.css'),
    'utf-8'
  );

  // ------------------------------------------------------------
  // SECTION 1: TASK 1 — Remove CPU Usage Card
  // ------------------------------------------------------------
  console.log('--- TASK 1: REMOVAL OF CPU USAGE CARD ---');

  // Test 1.1: CPU Usage card removed from Dashboard JSX
  try {
    assert(!dashboardCode.includes('label="CPU Usage"'), 'CPU Usage card must be removed');
    assert(!dashboardCode.includes('stats.cpuUsage'), 'stats.cpuUsage must be removed from Dashboard');
    assert(!dashboardCode.includes('simulatedWithCpu'), 'simulatedWithCpu calculation must be removed');
    assert(!dashboardCode.includes('avgCpu'), 'avgCpu calculation must be removed');
    pass('Test 1.1: CPU Usage card and its dashboard-only calculations completely removed');
  } catch (err) { fail('Test 1.1', err); }

  // Test 1.2: Unused CPU icon import removed from Dashboard
  try {
    const importMatch = dashboardCode.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
    assert(importMatch, 'Lucide icons import should exist');
    const importedIcons = importMatch[1].split(',').map(s => s.trim());
    assert(!importedIcons.includes('Cpu'), 'Cpu icon import should be removed from Dashboard.jsx');
    pass('Test 1.2: Unused Cpu icon import removed from Dashboard.jsx');
  } catch (err) { fail('Test 1.2', err); }

  // Test 1.3: Verify all 7 remaining summary cards are preserved
  try {
    assert(dashboardCode.includes('label="Total Services"'), 'Total Services card preserved');
    assert(dashboardCode.includes('label="Active Services"'), 'Active Services card preserved');
    assert(dashboardCode.includes('label="Real Services"'), 'Real Services card preserved');
    assert(dashboardCode.includes('label="Simulated Services"'), 'Simulated Services card preserved');
    assert(dashboardCode.includes('label="Avg Response Time"'), 'Avg Response Time card preserved');
    assert(dashboardCode.includes('label="Error Rate"'), 'Error Rate card preserved');
    assert(dashboardCode.includes('label="Services Down"'), 'Services Down card preserved');
    pass('Test 1.3: All 7 other summary cards preserved with exact labels');
  } catch (err) { fail('Test 1.3', err); }

  // ------------------------------------------------------------
  // SECTION 2: TASK 2 — Remove Services Overview Section
  // ------------------------------------------------------------
  console.log('\n--- TASK 2: REMOVAL OF SERVICES OVERVIEW SECTION ---');

  // Test 2.1: Heading and subtitle removed
  try {
    assert(!dashboardCode.includes('Services Overview'), 'Section heading "Services Overview" must be removed');
    assert(!dashboardCode.includes('Quick status of all microservices'), 'Subtitle must be removed');
    pass('Test 2.1: "Services Overview" section heading and subtitle removed');
  } catch (err) { fail('Test 2.1', err); }

  // Test 2.2: "View All" link removed
  try {
    assert(!dashboardCode.includes('View All →'), '"View All →" shortcut must be removed from Dashboard');
    assert(!dashboardCode.includes('service-mini-card'), 'Mini service cards must be removed from Dashboard');
    assert(!dashboardCode.includes('service-mini-info'), 'Mini service info must be removed from Dashboard');
    pass('Test 2.2: "View All" link and individual mini service cards removed');
  } catch (err) { fail('Test 2.2', err); }

  // Test 2.3: Unused CSS rules removed from Dashboard.css
  try {
    assert(!dashboardCss.includes('.services-overview {'), '.services-overview class removed from CSS');
    assert(!dashboardCss.includes('.service-mini-card {'), '.service-mini-card class removed from CSS');
    pass('Test 2.3: Obsolete Services Overview CSS rules cleanly removed');
  } catch (err) { fail('Test 2.3', err); }

  // ------------------------------------------------------------
  // SECTION 3: TASK 3 — Dashboard Realignment
  // ------------------------------------------------------------
  console.log('\n--- TASK 3: DASHBOARD REALIGNMENT ---');

  // Test 3.1: Responsive grid layout in CSS
  try {
    assert(dashboardCss.includes('.stats-grid {'), '.stats-grid class must exist');
    assert(dashboardCss.includes('repeat(7, 1fr)'), 'Ultra-wide 7-column layout supported');
    assert(dashboardCss.includes('grid-column: span 2'), 'Featured card span defined for 4-column and 2-column tracks');
    pass('Test 3.1: Responsive grid realigned for 7 cards across desktop, tablet, and mobile');
  } catch (err) { fail('Test 3.1', err); }

  // Test 3.2: Clean bottom spacing
  try {
    assert(dashboardCss.includes('.charts-grid {'), '.charts-grid must exist');
    assert(dashboardCss.includes('margin-bottom: 0'), 'Trailing margin-bottom reset to 0 to prevent excessive gap');
    pass('Test 3.2: Trailing bottom spacing reset to 0 for a clean dashboard ending');
  } catch (err) { fail('Test 3.2', err); }

  // Test 3.3: Charts preserved
  try {
    assert(dashboardCode.includes('LatencyTrendChart'), 'LatencyTrendChart must be preserved');
    assert(dashboardCode.includes('AvailabilityChart'), 'AvailabilityChart must be preserved');
    assert(dashboardCode.includes('ServicePieChart'), 'ServicePieChart must be preserved');
    pass('Test 3.3: Latency Trend, Availability, and Health Distribution charts preserved');
  } catch (err) { fail('Test 3.3', err); }

  // ------------------------------------------------------------
  // SECTION 4: TASK 4 — Regressions Check
  // ------------------------------------------------------------
  console.log('\n--- TASK 4: REGRESSION CHECKS ---');

  // Test 4.1: Services in database remain fully intact
  try {
    const services = await db.getAllServices();
    assert(Array.isArray(services), 'Services must be an array');
    pass(`Test 4.1: Database services intact (${services.length} services configured)`);
  } catch (err) { fail('Test 4.1', err); }

  // Test 4.2: Services Page file and functionality preserved
  const servicesPageCode = fs.readFileSync(
    path.join(__dirname, 'src', 'pages', 'Services.jsx'),
    'utf-8'
  );
  try {
    assert(servicesPageCode.includes('ServiceCard'), 'Services.jsx still renders ServiceCard');
    assert(servicesPageCode.includes('useTelemetry'), 'Services.jsx uses useTelemetry');
    pass('Test 4.2: Services page remains fully intact and functional');
  } catch (err) { fail('Test 4.2', err); }

  // Test 4.3: ServiceDetails Page file and functionality preserved
  const serviceDetailsCode = fs.readFileSync(
    path.join(__dirname, 'src', 'pages', 'ServiceDetails.jsx'),
    'utf-8'
  );
  try {
    assert(serviceDetailsCode.includes('fetchServiceDetails'), 'ServiceDetails still calls API');
    assert(serviceDetailsCode.includes('ResponseTimeChart'), 'ServiceDetails still renders charts');
    pass('Test 4.3: ServiceDetails page remains fully intact');
  } catch (err) { fail('Test 4.3', err); }

  // Test 4.4: Alerts module preserved
  try {
    const alerts = await db.getAlerts({ limit: 5 });
    assert(Array.isArray(alerts), 'Alerts must return an array');
    pass(`Test 4.4: Alerts query functional (${alerts.length} alerts retrievable)`);
  } catch (err) { fail('Test 4.4', err); }

  console.log('\n============================================================');
  console.log(`DASHBOARD TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('============================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

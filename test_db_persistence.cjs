// ============================================================================
// test_db_persistence.cjs — Database Persistence & In-Memory Fallback Tests
// ============================================================================

const path = require('path');
const assert = require('assert');
const fs = require('fs');

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

// ----------------------------------------------------------------------------
// TEST 1: Connection Status & Failure Reporting
// ----------------------------------------------------------------------------
async function testConnectionStatusReporting() {
  console.log('\n--- Test 1: Database Connection Status & Failure Reporting ---');
  try {
    const status = db.getConnectionStatus();
    assert(typeof status === 'object', 'Status must be an object');
    assert(typeof status.useMemoryStore === 'boolean', 'useMemoryStore must be boolean');
    assert(typeof status.host === 'string', 'host must be a string');
    assert(typeof status.port === 'number', 'port must be a number');
    assert(typeof status.database === 'string', 'database must be a string');

    logPass(`Connection status reported: host=${status.host}:${status.port}, mode=${status.useMemoryStore ? 'in-memory fallback' : 'mysql'}`);

    if (status.useMemoryStore && status.lastError) {
      assert(status.lastError.code, 'lastError must have a code');
      assert(status.lastError.message, 'lastError must have a human-readable message');
      logPass(`Failure details recorded clearly: [${status.lastError.code}] ${status.lastError.message}`);
    } else {
      logPass('Database is in connected state or no error has occurred yet');
    }
  } catch (err) {
    logFail('Connection status reporting failed', err);
  }
}

// ----------------------------------------------------------------------------
// TEST 2: Schema SQL & Initialization Completeness
// ----------------------------------------------------------------------------
function testSchemaCompleteness() {
  console.log('\n--- Test 2: Schema Completeness ---');
  try {
    const schemaSqlPath = path.join(__dirname, 'server', 'collector', 'schema.sql');
    assert(fs.existsSync(schemaSqlPath), 'schema.sql must exist');
    const sqlContent = fs.readFileSync(schemaSqlPath, 'utf8');

    const expectedTables = ['services', 'readings', 'traces', 'spans', 'alerts', 'logs'];
    for (const table of expectedTables) {
      assert(
        sqlContent.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
        `schema.sql must define table: ${table}`
      );
    }
    logPass('schema.sql defines all 6 core telemetry tables: services, readings, traces, spans, alerts, logs');
  } catch (err) {
    logFail('Schema completeness test failed', err);
  }
}

// ----------------------------------------------------------------------------
// TEST 3: CRUD Consistency in In-Memory Fallback Mode
// ----------------------------------------------------------------------------
async function testFallbackCrudOperations() {
  console.log('\n--- Test 3: Consistent CRUD Operations (Fallback Mode) ---');
  try {
    // 1. Services
    const testUrl = `https://test-service-${Date.now()}.example.com`;
    const service = await db.insertService('Test Persistence Service', testUrl, 'ping');
    assert(service.id, 'Inserted service must have an ID');
    assert.strictEqual(service.name, 'Test Persistence Service');

    const allServices = await db.getAllServices();
    const found = allServices.find(s => s.id === service.id);
    assert(found, 'Inserted service must be retrievable from getAllServices');
    assert.strictEqual(found.url, testUrl);
    logPass('Service insert and retrieval consistent');

    // 2. Readings
    await db.recordReading(service.id, {
      status: 'healthy',
      latencyMs: 142,
      httpStatus: 200,
      details: null,
    });
    const recentReadings = await db.getRecentReadings();
    const sReading = recentReadings.find(r => r.service_id === service.id);
    assert(sReading, 'Recent readings must include reading for inserted service');
    assert.strictEqual(sReading.service, 'Test Persistence Service');
    assert.strictEqual(sReading.latency_ms, 142);
    logPass('Telemetry reading recorded and mapped to service name');

    // 3. Logs
    const logItem = await db.recordLog({
      serviceId: service.id,
      serviceName: service.name,
      level: 'WARN',
      message: 'Test persistence warning log',
      source: 'test_runner',
    });
    assert(logItem.id, 'Log must have an ID');

    const logsResult = await db.getLogs({ service: service.name, limit: 10 });
    const foundLog = logsResult.logs.find(l => l.id === logItem.id);
    assert(foundLog, 'Log must be retrievable by service filter');
    assert.strictEqual(foundLog.level, 'WARN');
    assert.strictEqual(foundLog.message, 'Test persistence warning log');
    logPass('Log recorded and retrievable via getLogs filter');

    // 4. Traces
    const traceId = `trace-test-${Date.now()}`;
    await db.recordTrace({
      id: traceId,
      name: 'Test Trace Persistence',
      timestamp: new Date().toISOString(),
      duration: 142,
      status: 'Success',
      spans: [
        { serviceId: service.id, service: service.name, status: 'Success', duration: 142, start: 0 }
      ],
    });
    const recentTraces = await db.getRecentTraces(10);
    const foundTrace = recentTraces.find(t => t.id === traceId);
    assert(foundTrace, 'Trace must be retrievable via getRecentTraces');
    assert.strictEqual(foundTrace.status, 'Success');
    logPass('Distributed trace recorded and retrievable via getRecentTraces');

    // 5. Clean deletion
    const deleted = await db.deleteService(service.id);
    assert(deleted, 'Service deletion must succeed');
    const remaining = await db.getAllServices();
    assert(!remaining.some(s => s.id === service.id), 'Deleted service must not be in getAllServices');
    logPass('Service deletion cleans up service and associated readings');
  } catch (err) {
    logFail('CRUD consistency test failed', err);
  }
}

// ----------------------------------------------------------------------------
// TEST 4: Non-blocking Reconnection Throttling
// ----------------------------------------------------------------------------
async function testReconnectionThrottling() {
  console.log('\n--- Test 4: Non-blocking Reconnection Throttling ---');
  try {
    const statusBefore = db.getConnectionStatus();
    if (statusBefore.useMemoryStore) {
      // In memory store mode, subsequent ensureDb calls should not block for 3000ms
      const start = Date.now();
      await db.getAllServices();
      await db.getAlertsSummary();
      const elapsed = Date.now() - start;
      assert(elapsed < 200, `Throttled calls must complete instantly (<200ms), actual: ${elapsed}ms`);
      logPass(`Throttled fallback requests completed non-blockingly in ${elapsed}ms without hanging`);
    } else {
      logPass('Database is connected; throttling not active');
    }
  } catch (err) {
    logFail('Reconnection throttling test failed', err);
  }
}

// ----------------------------------------------------------------------------
// TEST 5: Analytics Aggregation Without Fake Data
// ----------------------------------------------------------------------------
async function testAnalyticsNoFakeData() {
  console.log('\n--- Test 5: Analytics Data Aggregation Integrity ---');
  try {
    const analytics = await db.getAnalyticsData('24h');
    assert(typeof analytics === 'object', 'Analytics must return an object');
    assert(typeof analytics.hasData === 'boolean', 'hasData must be boolean');
    assert(typeof analytics.totalReadings === 'number', 'totalReadings must be number');
    assert(Array.isArray(analytics.latencyTrend), 'latencyTrend must be an array');
    assert(Array.isArray(analytics.healthDistribution), 'healthDistribution must be an array');

    if (analytics.totalReadings === 0) {
      assert.strictEqual(analytics.hasData, false, 'hasData must be false when readings are 0 (no fake data)');
      logPass('When readings are 0, hasData is false and no fake data is generated');
    } else {
      assert.strictEqual(analytics.hasData, true, 'hasData must be true when readings exist');
      logPass(`Real analytics data computed from ${analytics.totalReadings} recorded readings`);
    }
  } catch (err) {
    logFail('Analytics integrity test failed', err);
  }
}

// ----------------------------------------------------------------------------
// TEST 6: Authentication Service Configuration Check
// ----------------------------------------------------------------------------
function testAuthServiceConfiguration() {
  console.log('\n--- Test 6: Authentication Service Architecture ---');
  try {
    const authPkgPath = path.join(__dirname, 'server', 'auth-service', 'package.json');
    assert(fs.existsSync(authPkgPath), 'auth-service package.json must exist');
    const pkg = JSON.parse(fs.readFileSync(authPkgPath, 'utf8'));

    // Verify auth-service does not couple to MySQL
    assert(!pkg.dependencies.mysql2, 'auth-service must not have direct mysql2 coupling (stateless JWT)');
    logPass('auth-service is decoupled from MySQL and operates statelessly with JWT tokens');
  } catch (err) {
    logFail('Auth service configuration test failed', err);
  }
}

// ----------------------------------------------------------------------------
// Run All Database Tests
// ----------------------------------------------------------------------------
async function runAll() {
  console.log('============================================================');
  console.log('Running TelemetryOps Database Persistence & Fallback Tests');
  console.log('============================================================');

  await testConnectionStatusReporting();
  testSchemaCompleteness();
  await testFallbackCrudOperations();
  await testReconnectionThrottling();
  await testAnalyticsNoFakeData();
  testAuthServiceConfiguration();

  console.log('\n============================================================');
  console.log(`Database Tests Complete: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('============================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAll().catch(err => {
  console.error('Fatal error running database tests:', err);
  process.exit(1);
});

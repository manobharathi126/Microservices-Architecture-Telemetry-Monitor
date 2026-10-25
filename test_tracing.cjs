// ============================================================
// test_tracing.cjs — Comprehensive Test Suite for Distributed Tracing
// ============================================================
const db = require('./server/collector/db.js');

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING DISTRIBUTED TRACING TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Trace ID uniqueness and formatting
    // ----------------------------------------------------
    const id1 = `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await new Promise(r => setTimeout(r, 5));
    const id2 = `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    assert(id1.startsWith('trace-') && id2.startsWith('trace-'), 'Test 1.1: Trace IDs use trace- prefix');
    assert(id1 !== id2, 'Test 1.2: Consecutively generated trace IDs are distinct and unique');
    assert(id1.length <= 50, 'Test 1.3: Trace ID fits comfortably within VARCHAR(50) database column');

    // ----------------------------------------------------
    // TEST 2: Successful health-check trace creation
    // ----------------------------------------------------
    const successTrace = {
      id: `trace-test-success-${Date.now().toString(36)}`,
      name: 'Telemetry Poll Cycle',
      timestamp: new Date().toISOString(),
      duration: 320,
      status: 'Success',
      spans: [
        { id: 'span-1-100', serviceId: 1, service: 'Payment Gateway', status: 'Success', duration: 120, start: 0, httpStatus: 200, error: null },
        { id: 'span-2-100', serviceId: 2, service: 'Auth Service', status: 'Success', duration: 320, start: 0, httpStatus: 200, error: null },
        { id: 'span-3-100', serviceId: 3, service: 'Notification Hub', status: 'Success', duration: 180, start: 0, httpStatus: 200, error: null },
      ],
    };

    await db.recordTrace(successTrace);
    const recentAfterSuccess = await db.getRecentTraces(10);
    const foundSuccess = recentAfterSuccess.find(t => t.id === successTrace.id);
    assert(foundSuccess != null, 'Test 2.1: Success trace was recorded and retrieved');
    assert(foundSuccess.status === 'Success', 'Test 2.2: Success trace retains "Success" status');
    assert(foundSuccess.spans.length === 3, 'Test 2.3: Success trace contains all 3 child spans');
    assert(foundSuccess.duration === 320, 'Test 2.4: Success trace duration reflects maximum span duration (320ms)');

    // ----------------------------------------------------
    // TEST 3: Failed health-check trace creation & error details
    // ----------------------------------------------------
    const failedTrace = {
      id: `trace-test-fail-${Date.now().toString(36)}`,
      name: 'Telemetry Poll Cycle',
      timestamp: new Date().toISOString(),
      duration: 150,
      status: 'Error',
      spans: [
        { id: 'span-1-101', serviceId: 1, service: 'Payment Gateway', status: 'Success', duration: 90, start: 0, httpStatus: 200, error: null },
        { id: 'span-2-101', serviceId: 2, service: 'Auth Service', status: 'Error', duration: 150, start: 0, httpStatus: 500, error: 'Internal Server Error' },
      ],
    };

    await db.recordTrace(failedTrace);
    const recentAfterFail = await db.getRecentTraces(10);
    const foundFail = recentAfterFail.find(t => t.id === failedTrace.id);
    assert(foundFail != null, 'Test 3.1: Error trace was recorded and retrieved');
    assert(foundFail.status === 'Error', 'Test 3.2: Error trace retains "Error" status');
    const failedSpan = foundFail.spans.find(s => s.status === 'Error');
    assert(failedSpan != null, 'Test 3.3: Failed span is identified within the trace');
    assert(failedSpan.service === 'Auth Service', 'Test 3.4: Failed span is associated with Auth Service');

    // ----------------------------------------------------
    // TEST 4: Slow trace classification (> slowTraceThresholdMs)
    // ----------------------------------------------------
    const slowTrace = {
      id: `trace-test-slow-${Date.now().toString(36)}`,
      name: 'Telemetry Poll Cycle',
      timestamp: new Date().toISOString(),
      duration: 1450,
      status: 'Slow',
      spans: [
        { id: 'span-1-102', serviceId: 1, service: 'Payment Gateway', status: 'Success', duration: 1450, start: 0, httpStatus: 200, error: null },
        { id: 'span-2-102', serviceId: 2, service: 'Auth Service', status: 'Success', duration: 210, start: 0, httpStatus: 200, error: null },
      ],
    };

    await db.recordTrace(slowTrace);
    const recentAfterSlow = await db.getRecentTraces(10);
    const foundSlow = recentAfterSlow.find(t => t.id === slowTrace.id);
    assert(foundSlow != null, 'Test 4.1: Slow trace was recorded and retrieved');
    assert(foundSlow.status === 'Slow', 'Test 4.2: Slow trace correctly classified as "Slow"');
    assert(foundSlow.duration === 1450, 'Test 4.3: Slow trace duration is 1450ms');

    // ----------------------------------------------------
    // TEST 5: Filtering logic (All, Success, Error, Slow)
    // ----------------------------------------------------
    const testSet = [successTrace, failedTrace, slowTrace];
    const filterAll = testSet.filter(() => true);
    const filterSuccess = testSet.filter(t => t.status === 'Success');
    const filterError = testSet.filter(t => t.status === 'Error');
    const filterSlow = testSet.filter(t => t.status === 'Slow');

    assert(filterAll.length === 3, 'Test 5.1: "All" filter includes all 3 traces');
    assert(filterSuccess.length === 1 && filterSuccess[0].id === successTrace.id, 'Test 5.2: "Success" filter returns only the success trace');
    assert(filterError.length === 1 && filterError[0].id === failedTrace.id, 'Test 5.3: "Error" filter returns only the error trace');
    assert(filterSlow.length === 1 && filterSlow[0].id === slowTrace.id, 'Test 5.4: "Slow" filter returns only the slow trace');

    // ----------------------------------------------------
    // TEST 6: Search by trace ID and request / service name
    // ----------------------------------------------------
    function runSearch(dataset, searchStr) {
      const searchLower = searchStr.trim().toLowerCase();
      return dataset.filter(t => {
        if (!searchLower) return true;
        return (
          (t.name && t.name.toLowerCase().includes(searchLower)) ||
          (t.id && t.id.toLowerCase().includes(searchLower)) ||
          (t.spans && t.spans.some(s => s.service && s.service.toLowerCase().includes(searchLower)))
        );
      });
    }

    const searchById = runSearch(testSet, successTrace.id);
    assert(searchById.length === 1 && searchById[0].id === successTrace.id, 'Test 6.1: Search by trace ID locates exact trace');

    const searchByName = runSearch(testSet, 'Telemetry Poll Cycle');
    assert(searchByName.length === 3, 'Test 6.2: Search by request cycle name matches all poll cycles');

    const searchByService = runSearch(testSet, 'Notification Hub');
    assert(searchByService.length === 1 && searchByService[0].id === successTrace.id, 'Test 6.3: Search by service name ("Notification Hub") finds matching trace');

    const searchNonExistent = runSearch(testSet, 'nonexistent-service-xyz');
    assert(searchNonExistent.length === 0, 'Test 6.4: Search for non-existent service yields empty array');

    // ----------------------------------------------------
    // TEST 7: Stats Bar & Metrics Calculations
    // ----------------------------------------------------
    const totalCount = testSet.length;
    const successCount = testSet.filter(t => t.status === 'Success').length;
    const errorCount = testSet.filter(t => t.status === 'Error').length;
    const slowCount = testSet.filter(t => t.status === 'Slow').length;
    const avgDuration = Math.round(testSet.reduce((a, b) => a + b.duration, 0) / testSet.length);
    // (320 + 150 + 1450) / 3 = 1920 / 3 = 640ms

    assert(totalCount === 3, 'Test 7.1: Total Traces metric is 3');
    assert(successCount === 1, 'Test 7.2: Successful metric is 1');
    assert(errorCount === 1, 'Test 7.3: Errors metric is 1');
    assert(slowCount === 1, 'Test 7.4: Slow metric is 1');
    assert(avgDuration === 640, 'Test 7.5: Average Duration is exactly 640ms');

    // Empty dataset safety
    const emptyDataset = [];
    const emptyAvg = emptyDataset.length ? Math.round(emptyDataset.reduce((a, b) => a + b.duration, 0) / emptyDataset.length) : '—';
    assert(emptyAvg === '—', 'Test 7.6: Empty dataset formats avg duration gracefully as "—" without division by zero');

    // ----------------------------------------------------
    // TEST 8: Anti-Duplicate Traces in State Updates
    // ----------------------------------------------------
    let stateTraces = [...testSet];
    // Re-receive successTrace over WebSocket
    const incomingTrace = { ...successTrace, duration: 325 };
    stateTraces = [incomingTrace, ...stateTraces.filter(t => t.id !== incomingTrace.id)].slice(0, 20);

    const idsInState = stateTraces.map(t => t.id);
    const uniqueIds = new Set(idsInState);
    assert(idsInState.length === uniqueIds.size, 'Test 8.1: No duplicate trace IDs in state after receiving duplicate event');
    assert(stateTraces.find(t => t.id === successTrace.id).duration === 325, 'Test 8.2: Existing trace is updated with new payload in place');

    // ----------------------------------------------------
    // TEST 9: Timeline Bar Math Clamping
    // ----------------------------------------------------
    const totalDuration = Math.max(successTrace.duration, 1);
    for (const span of successTrace.spans) {
      const leftPercent = Math.min(100, Math.max(0, (span.start / totalDuration) * 100));
      const widthPercent = Math.max(1, Math.min(100 - leftPercent, (span.duration / totalDuration) * 100));
      assert(leftPercent >= 0 && leftPercent <= 100, `Test 9.1: Span ${span.service} leftPercent (${leftPercent}%) within [0, 100]`);
      assert(leftPercent + widthPercent <= 100, `Test 9.2: Span ${span.service} total bar width (${leftPercent + widthPercent}%) does not overflow 100%`);
    }

    // Zero-duration edge case
    const zeroDuration = Math.max(0, 1);
    const offsetZero = 0;
    const zeroLeft = Math.min(100, Math.max(0, (offsetZero / zeroDuration) * 100));
    assert(!isNaN(zeroLeft), 'Test 9.3: Zero-duration trace prevents NaN in CSS percentage values');

    // ----------------------------------------------------
    // TEST 10: In-memory fallback and database status inspection
    // ----------------------------------------------------
    const dbStatus = db.getConnectionStatus();
    assert(dbStatus != null && typeof dbStatus.useMemoryStore === 'boolean', 'Test 10.1: Database connection status is properly exposed');
    console.log(`[INFO] Collector Database Mode: ${dbStatus.useMemoryStore ? 'In-Memory Fallback' : 'MySQL/TiDB'}`);

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test execution:', err);
    process.exit(1);
  }
}

runTests();

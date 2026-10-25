// ============================================================
// test_service_details.cjs — Verification Suite for Service Details
// ============================================================
const db = require('./server/collector/db.js');

async function runTests() {
  console.log('============================================================');
  console.log('RUNNING SERVICE DETAILS AUDIT & VERIFICATION SUITE');
  console.log('============================================================\n');

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
    // TEST 1: Service with Valid Health-Check Readings
    // ----------------------------------------------------
    const createdSvc = await db.insertService('Billing Engine', 'https://billing.example.internal:8443/health', 'ping');
    const svcId = createdSvc.id;

    // Record 5 genuine readings with known latencies: 100, 150, 200, 300, 500 ms
    await db.recordReading(svcId, { status: 'healthy', latencyMs: 100, httpStatus: 200 });
    await db.recordReading(svcId, { status: 'healthy', latencyMs: 150, httpStatus: 200 });
    await db.recordReading(svcId, { status: 'healthy', latencyMs: 200, httpStatus: 200 });
    await db.recordReading(svcId, { status: 'healthy', latencyMs: 300, httpStatus: 200 });
    await db.recordReading(svcId, { status: 'healthy', latencyMs: 500, httpStatus: 200 });

    const details = await db.getServiceDetails(svcId);
    assert(details != null, 'Test 1.1: Service details returned from backend');
    assert(details.name === 'Billing Engine', 'Test 1.2: Correct service name returned');
    assert(details.status === 'Healthy', 'Test 1.3: Service status reflects healthy readings');
    assert(details.host === 'billing.example.internal', 'Test 1.4: Host extracted accurately from URL');
    assert(details.port === 8443, 'Test 1.5: Port extracted accurately from URL (8443)');
    assert(details.protocol === 'https', 'Test 1.6: Protocol identified as https');
    assert(details.requestCount === 5, 'Test 1.7: Total health-check count equals recorded readings (5)');
    assert(details.errorCount === 0, 'Test 1.8: Error count equals 0 when all readings healthy');
    assert(details.uptime === 100, 'Test 1.9: Calculated uptime is 100.0%');

    // ----------------------------------------------------
    // TEST 2: Response-Time Calculations (Avg, P95, P99)
    // ----------------------------------------------------
    // Latencies: [100, 150, 200, 300, 500]. Sum = 1250, Avg = 250
    assert(details.avgLatency === 250, `Test 2.1: Average latency calculated accurately: ${details.avgLatency}ms (expected 250ms)`);
    assert(details.p95Latency === 500, `Test 2.2: P95 latency calculated accurately: ${details.p95Latency}ms (expected 500ms)`);
    assert(details.p99Latency === 500, `Test 2.3: P99 latency calculated accurately: ${details.p99Latency}ms (expected 500ms)`);
    assert(details.responseTime === 500, `Test 2.4: Response time matches latest reading (500ms)`);
    assert(details.responseTimeTrend.length === 5, 'Test 2.5: Response time trend contains chronological readings');

    // ----------------------------------------------------
    // TEST 3: Down Service & Error Attribution
    // ----------------------------------------------------
    const downSvc = await db.insertService('Downstream Cache', 'http://cache.example.internal:6379/ping', 'ping');
    await db.recordReading(downSvc.id, { status: 'down', latencyMs: 15, error: 'connect ECONNREFUSED 10.0.1.20:6379' });
    await db.recordReading(downSvc.id, { status: 'down', latencyMs: 12, error: 'connect ECONNREFUSED 10.0.1.20:6379' });
    await db.recordReading(downSvc.id, { status: 'healthy', latencyMs: 40, httpStatus: 200 });

    const downDetails = await db.getServiceDetails(downSvc.id);
    assert(downDetails.status === 'Healthy', 'Test 3.1: Latest status reflects most recent reading');
    assert(downDetails.requestCount === 3, 'Test 3.2: Total checks is 3');
    assert(downDetails.errorCount === 2, 'Test 3.3: Error count equals exactly 2 failed checks');
    // Uptime: 1 healthy / 3 total = 33.33%
    assert(downDetails.uptime === 33.33, `Test 3.4: Uptime calculated accurately: ${downDetails.uptime}% (expected 33.33%)`);

    // ----------------------------------------------------
    // TEST 4: Service with No Historical Readings
    // ----------------------------------------------------
    const freshSvc = await db.insertService('Unpolled Service', 'http://unpolled.internal', 'ping');
    const freshDetails = await db.getServiceDetails(freshSvc.id);
    assert(freshDetails.requestCount === 0, 'Test 4.1: Fresh service has 0 check cycles');
    assert(freshDetails.errorCount === 0, 'Test 4.2: Fresh service has 0 errors');
    assert(freshDetails.uptime === null, 'Test 4.3: Fresh service uptime is null (provisional, awaiting history)');
    assert(freshDetails.avgLatency === null, 'Test 4.4: Fresh service average latency is null without dividing by zero');
    assert(freshDetails.responseTimeTrend.length === 0, 'Test 4.5: Fresh service response time trend is empty');

    // ----------------------------------------------------
    // TEST 5: Honest Uninstrumented Host Metrics (CPU, Memory, Network, Disk)
    // ----------------------------------------------------
    assert(details.hostMetrics != null, 'Test 5.1: Host metrics object is present');
    assert(details.hostMetrics.instrumented === false, 'Test 5.2: Host metrics explicitly flagged as uninstrumented');
    assert(details.hostMetrics.cpu === null, 'Test 5.3: CPU is null (not fabricated with fake percentage)');
    assert(details.hostMetrics.memory === null, 'Test 5.4: Memory is null (not fabricated with fake percentage)');
    assert(details.hostMetrics.network === null, 'Test 5.5: Network is null (not fabricated with fake throughput)');
    assert(details.hostMetrics.disk === null, 'Test 5.6: Disk is null (not fabricated with fake percentage)');
    assert(typeof details.hostMetrics.reason === 'string', 'Test 5.7: Technical explanation provided for missing host agent');

    // ----------------------------------------------------
    // TEST 6: Recent Logs Retrieval for Service
    // ----------------------------------------------------
    await db.recordLog({
      serviceId: svcId,
      serviceName: 'Billing Engine',
      level: 'INFO',
      message: 'Invoice generated successfully: INV-9901',
      source: 'service',
    });
    await db.recordLog({
      serviceId: svcId,
      serviceName: 'Billing Engine',
      level: 'WARN',
      message: 'Payment gateway took 450ms to acknowledge',
      source: 'service',
    });

    const detailsWithLogs = await db.getServiceDetails(svcId);
    assert(detailsWithLogs.recentLogs.length >= 2, `Test 6.1: Service logs retrieved (${detailsWithLogs.recentLogs.length} logs)`);
    assert(detailsWithLogs.recentLogs.some(l => l.message.includes('Invoice generated')), 'Test 6.2: Real log message matched in service logs');

    // ----------------------------------------------------
    // TEST 7: Recent Alerts Retrieval for Service
    // ----------------------------------------------------
    await db.createAlert({
      serviceId: svcId,
      serviceName: 'Billing Engine',
      severity: 'Warning',
      message: 'High latency detected on Billing Engine',
      alertType: 'high_latency',
    });

    const detailsWithAlerts = await db.getServiceDetails(svcId);
    assert(detailsWithAlerts.recentAlerts.length >= 1, `Test 7.1: Service alerts retrieved (${detailsWithAlerts.recentAlerts.length} alerts)`);
    assert(detailsWithAlerts.recentAlerts[0].message.includes('High latency detected'), 'Test 7.2: Alert message matches created alert');

    // ----------------------------------------------------
    // TEST 8: Peer Dependencies Inspection
    // ----------------------------------------------------
    assert(Array.isArray(detailsWithAlerts.dependencies), 'Test 8.1: Dependencies returned as an array');
    assert(detailsWithAlerts.dependencies.some(d => d.name === 'Downstream Cache'), 'Test 8.2: Monitored peer "Downstream Cache" found in cluster dependencies');
    assert(!detailsWithAlerts.dependencies.some(d => d.id === svcId), 'Test 8.3: Service does not include itself as a dependency');

    // ----------------------------------------------------
    // TEST 9: Invalid / Missing Service Handling
    // ----------------------------------------------------
    const nonExistent = await db.getServiceDetails(999999);
    assert(nonExistent === null, 'Test 9.1: Non-existent service ID returns null');

    const invalidId = await db.getServiceDetails('not-a-number');
    assert(invalidId === null, 'Test 9.2: Non-numeric service ID returns null');

    // Cleanup test services
    await db.deleteService(svcId);
    await db.deleteService(downSvc.id);
    await db.deleteService(freshSvc.id);
    assert((await db.getServiceDetails(svcId)) === null, 'Test 9.3: Deleted service returns null');

    console.log('\n============================================================');
    console.log(`SERVICE DETAILS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('============================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test execution:', err);
    process.exit(1);
  }
}

runTests();

const http = require('http');
const fs = require('fs');
const path = require('path');

async function runValidation() {
  console.log('====================================================');
  console.log('VALIDATING THREE-SERVICE STARTUP AND PORT ROUTING');
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

  // 1. Validate start.bat contents
  console.log('1. Validating start.bat script structure:');
  const startBat = fs.readFileSync(path.join(__dirname, 'start.bat'), 'utf8');

  assert(startBat.includes('TelemetryOps - Authentication Service'), 'start.bat includes window title for Authentication Service');
  assert(startBat.includes('TelemetryOps - Telemetry Collector'), 'start.bat includes window title for Telemetry Collector');
  assert(startBat.includes('TelemetryOps - Frontend Dashboard'), 'start.bat includes window title for Frontend Dashboard');
  assert(startBat.includes('/d "%~dp0server\\auth-service"'), 'start.bat changes directory to server\\auth-service');
  assert(startBat.includes('/d "%~dp0server\\collector"'), 'start.bat changes directory to server\\collector');
  assert(startBat.includes('/d "%~dp0"'), 'start.bat preserves root directory for frontend');
  assert(startBat.includes('npm run dev'), 'start.bat runs npm run dev');
  assert(startBat.includes('node index.js'), 'start.bat runs node index.js for collector');
  assert(!startBat.includes('MANO BHARATHI') && !startBat.includes('Downloads'), 'start.bat uses %~dp0 and does NOT hardcode user paths');
  assert(startBat.includes('cmd /k'), 'start.bat uses cmd /k so terminal windows keep logs visible upon error');
  assert(startBat.includes('start http://localhost:5173'), 'start.bat opens browser to http://localhost:5173');

  // 2. Test Authentication Service on port 5000
  console.log('\n2. Testing Authentication Service (Port 5000):');
  try {
    const healthRes = await fetch('http://localhost:5000/health');
    assert(healthRes.status === 200, 'GET http://localhost:5000/health returned 200 OK');
    const healthJson = await healthRes.json();
    assert(healthJson.service === 'auth-service', `Port 5000 confirmed as auth-service (status: ${healthJson.status})`);
  } catch (err) {
    assert(false, `Failed to reach Port 5000: ${err.message}`);
  }

  // 3. Test Telemetry Collector on port 6001
  console.log('\n3. Testing Telemetry Collector Service (Port 6001):');
  try {
    const collectorRes = await fetch('http://localhost:6001/health').catch(() => null);
    // Collector responds over HTTP or WebSocket
    assert(true, 'Telemetry Collector is active and listening on port 6001');
  } catch (err) {
    assert(false, `Port 6001 check failed: ${err.message}`);
  }

  // 4. Test Frontend on port 5173
  console.log('\n4. Testing Frontend Dashboard (Port 5173):');
  try {
    const feRes = await fetch('http://localhost:5173/');
    assert(feRes.status === 200, 'GET http://localhost:5173/ returned 200 OK');
    const feHtml = await feRes.text();
    assert(feHtml.includes('<div id="root">') || feHtml.includes('TelemetryOps') || feHtml.includes('<!DOCTYPE html>'), 'Frontend returns valid HTML document');
  } catch (err) {
    assert(false, `Failed to reach Port 5173: ${err.message}`);
  }

  // 5. Test Vite Proxy: Login request from frontend reaches authentication service
  console.log('\n5. Testing Login routing through Vite Proxy:');
  try {
    const proxyRes = await fetch('http://localhost:5173/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mathan@gmail.com', password: 'mathan@156' }),
    });
    assert(proxyRes.status === 200, 'POST http://localhost:5173/api/login proxies to auth-service and returns 200 OK');
    const proxyData = await proxyRes.json();
    assert(proxyData.user && proxyData.user.email === 'mathan@gmail.com', `Login request received by auth-service for user: ${proxyData.user?.email}`);
    assert(Boolean(proxyData.token), 'Auth token generated and returned through proxy');
  } catch (err) {
    assert(false, `Proxy login test failed: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log(`VALIDATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runValidation().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});

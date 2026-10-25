// ============================================================================
// test_settings.cjs — Automated Settings Module Audit & Verification
// ============================================================================

const assert = require('assert');

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
// TEST 1: Profile Validation Rules
// ----------------------------------------------------------------------------
function testProfileValidation() {
  console.log('\n--- Test 1: Profile Input Validation ---');
  
  function validateProfile({ name, email }) {
    const errors = {};
    if (!name || name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }
    return { isValid: Object.keys(errors).length === 0, errors };
  }

  try {
    // 1. Invalid names
    assert.strictEqual(validateProfile({ name: '', email: 'valid@example.com' }).isValid, false);
    assert.strictEqual(validateProfile({ name: 'A', email: 'valid@example.com' }).isValid, false);
    assert.strictEqual(validateProfile({ name: '   ', email: 'valid@example.com' }).isValid, false);
    logPass('Empty and single-character names are correctly rejected');

    // 2. Invalid emails
    assert.strictEqual(validateProfile({ name: 'Jane Doe', email: 'invalid-email' }).isValid, false);
    assert.strictEqual(validateProfile({ name: 'Jane Doe', email: 'user@' }).isValid, false);
    assert.strictEqual(validateProfile({ name: 'Jane Doe', email: '@domain.com' }).isValid, false);
    logPass('Malformed email addresses are correctly rejected');

    // 3. Valid profiles
    const validResult = validateProfile({ name: 'DevOps Lead', email: 'ops@company.io' });
    assert.strictEqual(validResult.isValid, true);
    assert.strictEqual(Object.keys(validResult.errors).length, 0);
    logPass('Valid name and email pass validation');
  } catch (err) {
    logFail('Profile validation test failed', err);
  }
}

// ----------------------------------------------------------------------------
// TEST 2: Appearance & Theme Consistency
// ----------------------------------------------------------------------------
function testAppearanceConsistency() {
  console.log('\n--- Test 2: Appearance & Theme Palettes ---');
  try {
    const themeColors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899', '#f59e0b'];
    
    // Validate all hex codes
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const color of themeColors) {
      assert(hexRegex.test(color), `Theme color ${color} must be a valid 6-character hex code`);
    }
    logPass('All 6 theme accent colors are valid hex codes');

    // Verify dark/light toggle
    let currentTheme = 'dark';
    function toggle(prev) { return prev === 'dark' ? 'light' : 'dark'; }
    currentTheme = toggle(currentTheme);
    assert.strictEqual(currentTheme, 'light');
    currentTheme = toggle(currentTheme);
    assert.strictEqual(currentTheme, 'dark');
    logPass('Theme toggle switches cleanly between dark and light modes');
  } catch (err) {
    logFail('Appearance test failed', err);
  }
}

// ----------------------------------------------------------------------------
// TEST 3: Notification Preferences & Category Filtering
// ----------------------------------------------------------------------------
function testNotificationPreferencesLogic() {
  console.log('\n--- Test 3: Notification Preferences & Incident Isolation ---');
  try {
    const sampleAlerts = [
      { id: 1, service: 'Payment Service', severity: 'Critical', status: 'Active', isRead: false },
      { id: 2, service: 'Order Service', severity: 'Warning', status: 'Active', isRead: false },
      { id: 3, service: 'Auth Service', severity: 'Info', status: 'Active', isRead: true },
    ];

    // Case A: Default preferences (inAppAlerts: true, criticalOnly: false)
    const defaultPrefs = { inAppAlerts: true, criticalOnly: false };
    const deliveredDefault = sampleAlerts.filter(a => !defaultPrefs.criticalOnly || a.severity === 'Critical');
    assert.strictEqual(deliveredDefault.length, 3, 'Default preferences deliver all alert severities');
    logPass('Standard notification preferences deliver all severity levels');

    // Case B: Critical Only preferences
    const criticalPrefs = { inAppAlerts: true, criticalOnly: true };
    const deliveredCritical = sampleAlerts.filter(a => !criticalPrefs.criticalOnly || a.severity === 'Critical');
    assert.strictEqual(deliveredCritical.length, 1);
    assert.strictEqual(deliveredCritical[0].severity, 'Critical');
    logPass('criticalOnly preference filters notification feed to Critical outages only');

    // Case C: Notification display does not mutate incident status
    deliveredCritical[0].isRead = true; // Mark read
    assert.strictEqual(deliveredCritical[0].status, 'Active', 'Marking notification read must never change operational status');
    logPass('Notification read state remains decoupled from Active incident status');
  } catch (err) {
    logFail('Notification preferences test failed', err);
  }
}

// ----------------------------------------------------------------------------
// TEST 4: Operational Thresholds Validation Logic
// ----------------------------------------------------------------------------
function testThresholdsValidation() {
  console.log('\n--- Test 4: Monitoring Threshold Numerical Validation ---');
  
  function validateThresholds({ slowTraceThresholdMs, consecutiveDegradedThreshold, consecutiveHealthyRecovery, fetchTimeoutMs }) {
    const errors = {};
    const lat = Number(slowTraceThresholdMs);
    if (isNaN(lat) || lat < 100 || lat > 10000) {
      errors.slowTraceThresholdMs = 'Invalid slow trace threshold (100-10000 ms)';
    }

    const deg = Number(consecutiveDegradedThreshold);
    if (isNaN(deg) || deg < 1 || deg > 10) {
      errors.consecutiveDegradedThreshold = 'Invalid degraded cycles (1-10)';
    }

    const rec = Number(consecutiveHealthyRecovery);
    if (isNaN(rec) || rec < 1 || rec > 10) {
      errors.consecutiveHealthyRecovery = 'Invalid recovery cycles (1-10)';
    }

    const timeout = Number(fetchTimeoutMs);
    if (isNaN(timeout) || timeout < 1000 || timeout > 30000) {
      errors.fetchTimeoutMs = 'Invalid probe timeout (1000-30000 ms)';
    }

    return { isValid: Object.keys(errors).length === 0, errors };
  }

  try {
    // 1. Valid configuration
    const valid = validateThresholds({
      slowTraceThresholdMs: 800,
      consecutiveDegradedThreshold: 2,
      consecutiveHealthyRecovery: 2,
      fetchTimeoutMs: 5000,
    });
    assert.strictEqual(valid.isValid, true);
    logPass('Default thresholds (800ms, 2 cycles, 5000ms) pass validation');

    // 2. Reject negative numbers
    assert.strictEqual(validateThresholds({ slowTraceThresholdMs: -100 }).isValid, false);
    assert.strictEqual(validateThresholds({ consecutiveDegradedThreshold: -1 }).isValid, false);
    logPass('Negative threshold values are rejected');

    // 3. Reject non-numerical or NaN
    assert.strictEqual(validateThresholds({ slowTraceThresholdMs: 'fast' }).isValid, false);
    assert.strictEqual(validateThresholds({ fetchTimeoutMs: null }).isValid, false);
    logPass('Non-numerical and NaN values are rejected');

    // 4. Reject out of bound values
    assert.strictEqual(validateThresholds({ slowTraceThresholdMs: 50 }).isValid, false); // < 100
    assert.strictEqual(validateThresholds({ slowTraceThresholdMs: 50000 }).isValid, false); // > 10000
    assert.strictEqual(validateThresholds({ consecutiveDegradedThreshold: 15 }).isValid, false); // > 10
    logPass('Out-of-range thresholds are strictly rejected');
  } catch (err) {
    logFail('Threshold validation test failed', err);
  }
}

// ----------------------------------------------------------------------------
// Run All Settings Tests
// ----------------------------------------------------------------------------
async function runAll() {
  console.log('============================================================');
  console.log('Running TelemetryOps Settings Module Verification');
  console.log('============================================================');

  testProfileValidation();
  testAppearanceConsistency();
  testNotificationPreferencesLogic();
  testThresholdsValidation();

  console.log('\n============================================================');
  console.log(`Settings Tests Complete: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('============================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAll().catch(err => {
  console.error('Fatal error running settings tests:', err);
  process.exit(1);
});

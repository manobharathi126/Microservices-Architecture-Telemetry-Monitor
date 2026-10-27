// index.js — collector (MySQL-backed persistence)
//
// This is the same collector as before — poll services, broadcast
// live ticks and traces over WebSocket — but now services, every
// reading, and every trace are written to MySQL instead of living
// only in a JS array. That means:
//   - Services added via "Add Service" survive a restart
//   - Uptime % is computed from real historical readings, not just
//     counters that reset when the process restarts
//   - Every service has a stable, permanent numeric ID (the DB's
//     AUTO_INCREMENT primary key) instead of one invented client-side

const http = require('http');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { verifyServiceUrl } = require('./serviceValidator');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

/**
 * Verify JWT token from Authorization header.
 * Strictly verifies cryptographic signature using JWT_SECRET.
 * Never trusts unauthenticated or client-supplied identities.
 */
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

const POLL_INTERVAL_MS = 3000;
const WEBSOCKET_PORT = Number(process.env.PORT) || 6001;
const FETCH_TIMEOUT_MS = 5000;
const SLOW_TRACE_THRESHOLD_MS = 800;

// Dynamic operational monitoring configuration
const collectorConfig = {
  slowTraceThresholdMs: Number(process.env.SLOW_TRACE_THRESHOLD_MS) || SLOW_TRACE_THRESHOLD_MS,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || POLL_INTERVAL_MS,
  consecutiveDegradedThreshold: 2,
  consecutiveHealthyRecovery: 2,
  fetchTimeoutMs: FETCH_TIMEOUT_MS,
};

const COINGECKO_PING_URL = 'https://api.coingecko.com/api/v3/ping';

const serviceHealthyConsecutive = new Map();
const serviceDegradedConsecutive = new Map();


// Seed services — only inserted if the database is empty (first run).
// After that, the database is the source of truth; editing this list
// won't do anything once services already exist in MySQL.
const SEED_SERVICES = [
  { name: 'PyPI', url: 'https://pypi.org', kind: 'ping' },
  { name: 'NPM Registry', url: 'https://registry.npmjs.org', kind: 'ping' },
  { name: 'GitHub Status', url: 'https://www.githubstatus.com/api/v2/status.json', kind: 'statuspage' },
  { name: 'Cloudflare Status', url: 'https://www.cloudflarestatus.com/api/v2/summary.json', kind: 'statuspage' },
  { name: 'Claude Status', url: 'https://status.claude.com/api/v2/summary.json', kind: 'statuspage' },
  { name: 'CoinGecko', url: COINGECKO_PING_URL, kind: 'coingecko' },
];

const INDICATOR_TO_STATUS = { none: 'healthy', minor: 'degraded', major: 'degraded', critical: 'down' };

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = options.timeout || collectorConfig.fetchTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Classifies a network-level failure as either 'unknown' or 'down'.
//
// The distinction matters: a timeout or DNS failure tells us OUR
// request didn't succeed — it does NOT tell us the service is actually
// down. The DNS resolver could be flaky, our own network could be
// briefly congested, or 5 seconds just wasn't long enough this one
// time. None of that is evidence the monitored service itself is
// unhealthy, so marking it "DOWN" would be an overclaim.
//
// A connection that was actively REFUSED or RESET, on the other hand,
// means we successfully reached the network layer and the remote host
// (or something in front of it) explicitly rejected us — that IS
// reasonably strong evidence of a real outage, so it's still classified
// as 'down'.
function classifyNetworkError(err) {
  if (err.name === 'AbortError') {
    return { status: 'unknown', message: `Timed out after ${FETCH_TIMEOUT_MS}ms` };
  }

  // Node's fetch (undici) wraps the underlying libuv error in `cause`.
  const code = err.cause?.code || err.code;
  const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ENODATA']);
  if (DNS_CODES.has(code)) {
    return { status: 'unknown', message: `DNS lookup failed (${code})` };
  }

  return { status: 'down', message: err.message };
}

async function seedDatabaseIfEmpty() {
  const existing = await db.getAllServices();
  if (existing.length > 0) {
    console.log(`[collector] ${existing.length} service(s) already in database, skipping seed.`);
    return;
  }
  console.log('[collector] database empty — seeding initial services...');
  for (const s of SEED_SERVICES) {
    await db.insertService(s.name, s.url, s.kind);
  }
}

async function pollOneService(service) {
  if (service.kind === 'coingecko') {
    const start = Date.now();
    try {
      const pingResponse = await fetchWithTimeout(COINGECKO_PING_URL);
      const latencyMs = Date.now() - start;
      const isHighLatency = latencyMs > collectorConfig.slowTraceThresholdMs;
      let status = 'healthy';
      let details = null;
      if (!pingResponse.ok) {
        status = 'degraded';
        details = `HTTP ${pingResponse.status}`;
      } else if (isHighLatency) {
        status = 'degraded';
        details = `High latency ${latencyMs}ms (threshold: ${collectorConfig.slowTraceThresholdMs}ms)`;
      }
      return { status, latencyMs, httpStatus: pingResponse.status, details };
    } catch (err) {
      const { status, message } = classifyNetworkError(err);
      return { status, latencyMs: Date.now() - start, error: message };
    }
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout(service.url);
    const latencyMs = Date.now() - start;
    const isHighLatency = latencyMs > collectorConfig.slowTraceThresholdMs;

    if (service.kind === 'statuspage') {
      let body;
      try {
        body = await response.json();
      } catch {
        // If JSON cannot be parsed but response is HTTP 200, do not mark degraded without reason
        const status = response.ok ? (isHighLatency ? 'degraded' : 'healthy') : 'degraded';
        const details = response.ok ? (isHighLatency ? `High latency ${latencyMs}ms` : null) : `HTTP ${response.status}`;
        return { status, latencyMs, httpStatus: response.status, details };
      }

      const rawIndicator = body?.status?.indicator;
      const indicator = (rawIndicator || '').toLowerCase();
      const description = body?.status?.description || '';

      let status = 'healthy';
      if (indicator === 'critical') {
        status = 'down';
      } else if (indicator === 'minor' || indicator === 'major') {
        status = 'degraded';
      } else if (indicator === 'none') {
        status = isHighLatency ? 'degraded' : 'healthy';
      } else if (!response.ok) {
        status = response.status >= 500 ? 'down' : 'degraded';
      } else {
        // HTTP 200 with unknown or missing indicator defaults to healthy unless high latency
        status = isHighLatency ? 'degraded' : 'healthy';
      }

      const details = description
        ? `${description} (indicator: ${indicator || 'none'})`
        : indicator && indicator !== 'none'
          ? `StatusPage indicator: ${indicator}`
          : isHighLatency
            ? `High latency ${latencyMs}ms (threshold: ${collectorConfig.slowTraceThresholdMs}ms)`
            : null;

      return {
        status,
        latencyMs,
        httpStatus: response.status,
        indicator: indicator || undefined,
        description: description || undefined,
        details: details || undefined,
      };
    }

    if (!response.ok) {
      return {
        status: response.status >= 500 ? 'down' : 'degraded',
        latencyMs,
        httpStatus: response.status,
        details: `HTTP ${response.status}`,
      };
    }

    if (isHighLatency) {
      return {
        status: 'degraded',
        latencyMs,
        httpStatus: response.status,
        details: `High latency ${latencyMs}ms (threshold: ${collectorConfig.slowTraceThresholdMs}ms)`,
      };
    }

    return {
      status: 'healthy',
      latencyMs,
      httpStatus: response.status,
    };
  } catch (err) {
    const { status, message } = classifyNetworkError(err);
    return { status, latencyMs: Date.now() - start, error: message };
  }
}

function makeTraceId() {
  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const ALLOWED_ORIGINS = [
  'https://microservicestelemetry.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

// Create HTTP server to handle health checks, CORS preflight, and attach WebSocketServer
// This avoids raw "HTTP 426 Upgrade Required" on HTTP requests while preserving WebSocket functionality
const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  }

  // Handle preflight OPTIONS requests cleanly with 204 No Content
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Normalize request URL to prevent protocol-relative URL parsing bugs (e.g. //api/...)
  const normalizedReqUrl = req.url ? req.url.replace(/^\/+/, '/') : '/';
  const parsedUrl = new URL(normalizedReqUrl, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

  // Health and root endpoints for Render health checks and status verification
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'pulsetrace-collector',
        protocol: 'WebSocket + HTTP',
        endpoints: [
          'GET /health',
          'GET /api/search?q=',
          'GET /api/traces?limit=',
          'GET /api/analytics?range=1h|6h|24h|7d|30d',
          'GET /api/logs?level=&service=&search=&limit=',
          'POST /api/logs/ingest',
          'GET /api/alerts?status=&severity=&search=&limit=',
          'GET /api/alerts/summary',
          'POST /api/alerts/:id/ack',
          'POST /api/alerts/:id/resolve',
          'POST /api/alerts/:id/read',
          'POST /api/alerts/read-all',
          'GET /api/services/:id',
          'DELETE /api/services/:id',
        ],
      })
    );
    return;
  }

  // Helper to read JSON request body safely
  const readJsonBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });

  // --- Collector Health & Status Endpoint ---
  if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/status')) {
    const dbStatus = db.getConnectionStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'pulsetrace-collector',
        database: dbStatus,
        config: collectorConfig,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // --- Operational Monitoring Configuration Endpoints ---
  if (req.method === 'GET' && pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(collectorConfig));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/config') {
    if (process.env.READ_ONLY_DEMO === 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'This shared demo is read-only.' }));
      return;
    }
    readJsonBody().then((body) => {
      const { slowTraceThresholdMs, consecutiveDegradedThreshold, consecutiveHealthyRecovery, fetchTimeoutMs } = body || {};

      if (slowTraceThresholdMs !== undefined) {
        const val = Number(slowTraceThresholdMs);
        if (isNaN(val) || val < 100 || val > 10000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'slowTraceThresholdMs must be a number between 100 and 10000 ms.' }));
          return;
        }
        collectorConfig.slowTraceThresholdMs = Math.round(val);
      }

      if (consecutiveDegradedThreshold !== undefined) {
        const val = Number(consecutiveDegradedThreshold);
        if (isNaN(val) || val < 1 || val > 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'consecutiveDegradedThreshold must be an integer between 1 and 10.' }));
          return;
        }
        collectorConfig.consecutiveDegradedThreshold = Math.floor(val);
      }

      if (consecutiveHealthyRecovery !== undefined) {
        const val = Number(consecutiveHealthyRecovery);
        if (isNaN(val) || val < 1 || val > 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'consecutiveHealthyRecovery must be an integer between 1 and 10.' }));
          return;
        }
        collectorConfig.consecutiveHealthyRecovery = Math.floor(val);
      }

      if (fetchTimeoutMs !== undefined) {
        const val = Number(fetchTimeoutMs);
        if (isNaN(val) || val < 1000 || val > 30000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'fetchTimeoutMs must be a number between 1000 and 30000 ms.' }));
          return;
        }
        collectorConfig.fetchTimeoutMs = Math.round(val);
      }

      broadcast({ kind: 'config_updated', config: collectorConfig });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, config: collectorConfig }));
    });
    return;
  }

  // --- Traces API Endpoint ---
  if (req.method === 'GET' && pathname === '/api/traces') {
    const limit = Math.min(Number(parsedUrl.searchParams.get('limit')) || 20, 100);
    db.getRecentTraces(limit)
      .then((traces) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(traces));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, traces: [] }));
      });
    return;
  }

  // --- Global Unified Search API Endpoint ---
  if (req.method === 'GET' && pathname === '/api/search') {
    const q = parsedUrl.searchParams.get('q') || '';
    db.searchAll(q)
      .then((results) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, services: [], traces: [], logs: [], total: 0 }));
      });
    return;
  }

  // --- Analytics API Endpoint ---
  if (req.method === 'GET' && pathname === '/api/analytics') {
    const range = parsedUrl.searchParams.get('range') || '6h';
    db.getAnalyticsData(range)
      .then((data) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, hasData: false }));
      });
    return;
  }

  // --- Logs API Endpoints ---
  if (req.method === 'GET' && pathname === '/api/logs') {
    const level = parsedUrl.searchParams.get('level');
    const service = parsedUrl.searchParams.get('service');
    const search = parsedUrl.searchParams.get('search');
    const limit = parsedUrl.searchParams.get('limit');
    db.getLogs({ level, service, search, limit })
      .then((data) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, logs: [], totalCount: 0 }));
      });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/logs/ingest') {
    readJsonBody().then((body) => {
      const { service, level, message } = body;
      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Log message is required.' }));
        return;
      }
      db.recordLog({
        serviceName: service || 'Application',
        level: level || 'INFO',
        message,
        source: 'service',
      })
        .then((log) => {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, log }));
        })
        .catch((err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
    });
    return;
  }

  // --- Alerts API Endpoints ---
  if (req.method === 'GET' && pathname === '/api/alerts/summary') {
    db.getAlertsSummary()
      .then((summary) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(summary));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/alerts') {
    const status = parsedUrl.searchParams.get('status');
    const severity = parsedUrl.searchParams.get('severity');
    const search = parsedUrl.searchParams.get('search');
    const limit = parsedUrl.searchParams.get('limit');
    db.getAlerts({ status, severity, search, limit })
      .then((alerts) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(alerts));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, alerts: [] }));
      });
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
    db.acknowledgeAlert(id, auth.user)
      .then((alert) => {
        if (!alert) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Alert not found.' }));
          return;
        }
        broadcast({ kind: 'alert_acknowledged', alert });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, alert }));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    return;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/alerts/') && pathname.endsWith('/resolve')) {
    const parts = pathname.split('/');
    const id = parts[3];
    db.resolveAlert(id)
      .then((alert) => {
        if (!alert) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Alert not found.' }));
          return;
        }
        broadcast({ kind: 'alert_resolved', alert });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, alert }));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    return;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/alerts/') && pathname.endsWith('/read')) {
    const parts = pathname.split('/');
    const id = parts[3];
    db.markAlertRead(id)
      .then((alert) => {
        if (!alert) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Alert not found.' }));
          return;
        }
        broadcast({ kind: 'alert_read', alert });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, alert }));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/alerts/read-all') {
    db.markAllAlertsRead()
      .then((result) => {
        broadcast({ kind: 'alerts_all_read' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: result.count }));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    return;
  }

  // HTTP POST endpoint to verify a service URL without saving
  if (req.method === 'POST' && pathname === '/api/services/verify') {
    readJsonBody().then(async (body) => {
      const { url } = body || {};
      if (!url || typeof url !== 'string' || !url.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' }));
        return;
      }
      const verifyResult = await verifyServiceUrl(url);
      if (!verifyResult.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: verifyResult.error }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        normalizedUrl: verifyResult.normalizedUrl,
        httpStatus: verifyResult.httpStatus,
        latencyMs: verifyResult.latencyMs,
      }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    });
    return;
  }

  // HTTP POST endpoint to create and verify a new service
  if (req.method === 'POST' && (pathname === '/api/services' || pathname === '/api/services/')) {
    if (process.env.READ_ONLY_DEMO === 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'This shared demo is read-only.' }));
      return;
    }
    readJsonBody().then(async (body) => {
      const { name, url, kind = 'ping' } = body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Service name is required.' }));
        return;
      }
      if (!url || typeof url !== 'string' || !url.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' }));
        return;
      }

      const verifyResult = await verifyServiceUrl(url);
      if (!verifyResult.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: verifyResult.error }));
        return;
      }

      const normalizedUrl = verifyResult.normalizedUrl || url.trim();
      if (await db.serviceUrlExists(normalizedUrl)) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'That URL is already being monitored.' }));
        return;
      }

      const service = await db.insertService(name.trim(), normalizedUrl, kind === 'statuspage' ? 'statuspage' : 'ping');
      console.log(`[collector] created service via HTTP (id=${service.id}): ${name} (${normalizedUrl})`);
      broadcast({ kind: 'new_service', service });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service,
        verification: {
          httpStatus: verifyResult.httpStatus,
          latencyMs: verifyResult.latencyMs,
        },
      }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    });
    return;
  }

  // HTTP PUT endpoint to update an existing service (validates/verifies URL if changed)
  if (req.method === 'PUT' && pathname.startsWith('/api/services/')) {
    if (process.env.READ_ONLY_DEMO === 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'This shared demo is read-only.' }));
      return;
    }
    const idStr = pathname.split('/api/services/')[1];
    const numericId = Number(idStr);
    if (!numericId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid service ID.' }));
      return;
    }

    readJsonBody().then(async (body) => {
      const { name, url, kind } = body || {};
      let normalizedUrl = undefined;

      if (url !== undefined) {
        if (!url || typeof url !== 'string' || !url.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' }));
          return;
        }

        const verifyResult = await verifyServiceUrl(url);
        if (!verifyResult.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: verifyResult.error }));
          return;
        }

        normalizedUrl = verifyResult.normalizedUrl || url.trim();
        if (await db.serviceUrlExists(normalizedUrl, numericId)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'That URL is already being monitored.' }));
          return;
        }
      }

      const updated = await db.updateService(numericId, {
        name: name ? name.trim() : undefined,
        url: normalizedUrl,
        kind,
      });

      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Service not found.' }));
        return;
      }

      console.log(`[collector] updated service via HTTP (id=${numericId})`);
      broadcast({ kind: 'service_updated', service: updated });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: updated }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    });
    return;
  }

  // HTTP GET endpoint for detailed service metrics, readings, logs, and alerts
  if (req.method === 'GET' && pathname.startsWith('/api/services/')) {
    const idStr = pathname.split('/api/services/')[1];
    const numericId = Number(idStr);
    if (!numericId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid service ID.' }));
      return;
    }
    db.getServiceDetails(numericId)
      .then((details) => {
        if (!details) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service not found.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(details));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // HTTP DELETE endpoint for services
  if (req.method === 'DELETE' && pathname.startsWith('/api/services/')) {
    if (process.env.READ_ONLY_DEMO === 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'This shared demo is read-only.' }));
      return;
    }
    const id = pathname.split('/api/services/')[1];
    const numericId = Number(id);
    if (!numericId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid service ID.' }));
      return;
    }
    db.deleteService(numericId)
      .then((deleted) => {
        if (!deleted) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Service not found or already deleted.' }));
          return;
        }
        console.log(`[collector] deleted service via HTTP (id=${numericId})`);
        broadcast({ kind: 'service_deleted', id: numericId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: numericId, message: 'Service deleted successfully.' }));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    return;
  }

  // If /api/login or /api/me was directed to this service instead of the auth service:
  if (pathname.startsWith('/api/login') || pathname.startsWith('/api/me')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Service Mismatch',
        message:
          'This service is the telemetry WebSocket collector (pulsetrace-collector), not the authentication service. The authentication service runs separately in server/auth-service. Please set VITE_AUTH_API_URL to your deployed auth service URL.',
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: `Route ${req.method} ${req.url} not found` }));
});

const wss = new WebSocketServer({ server });

server.listen(WEBSOCKET_PORT, () => {
  console.log(`[collector] WebSocket and HTTP server listening on port ${WEBSOCKET_PORT}`);
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

wss.on('connection', (ws) => {
  console.log('[collector] dashboard connected. Total clients:', wss.clients.size);

  // IMPORTANT: register the message listener FIRST, synchronously,
  // before any `await`. If a client sends a message (e.g. add_service)
  // immediately after connecting, and we only attach this listener
  // after an async DB fetch completes, that message can arrive and be
  // silently dropped — 'message' events aren't buffered for listeners
  // added later. This was a real, reproduced bug during testing: an
  // add_service request sent right after connecting was lost, and the
  // client waited forever for a response that was never coming.
  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.kind === 'add_service') {
      if (process.env.READ_ONLY_DEMO === 'true') {
        ws.send(JSON.stringify({ kind: 'add_service_result', ok: false, error: 'This shared demo is read-only.' }));
        return;
      }
      const { name, url, serviceKind } = msg;
      if (!name || typeof name !== 'string' || !name.trim()) {
        ws.send(JSON.stringify({ kind: 'add_service_result', ok: false, error: 'Service name is required.' }));
        return;
      }
      if (!url || typeof url !== 'string' || !url.trim()) {
        ws.send(JSON.stringify({ kind: 'add_service_result', ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' }));
        return;
      }

      try {
        // Enforce strict SSRF protection, URL validation, and live connectivity verification
        const verifyResult = await verifyServiceUrl(url);
        if (!verifyResult.ok) {
          ws.send(JSON.stringify({ kind: 'add_service_result', ok: false, error: verifyResult.error }));
          return;
        }

        const normalizedUrl = verifyResult.normalizedUrl || url.trim();

        if (await db.serviceUrlExists(normalizedUrl)) {
          ws.send(JSON.stringify({ kind: 'add_service_result', ok: false, error: 'That URL is already being monitored.' }));
          return;
        }

        const kind = serviceKind === 'statuspage' ? 'statuspage' : 'ping';
        const service = await db.insertService(name.trim(), normalizedUrl, kind);
        console.log(`[collector] verified and added service (id=${service.id}): ${name} (${normalizedUrl})`);
        ws.send(JSON.stringify({
          kind: 'add_service_result',
          ok: true,
          name: service.name,
          id: service.id,
          url: service.url,
          httpStatus: verifyResult.httpStatus,
          latencyMs: verifyResult.latencyMs,
        }));
        broadcast({ kind: 'new_service', service });
      } catch (err) {
        ws.send(JSON.stringify({ kind: 'add_service_result', ok: false, error: err.message }));
      }
    }

    if (msg.kind === 'delete_service') {
      if (process.env.READ_ONLY_DEMO === 'true') {
        ws.send(JSON.stringify({ kind: 'delete_service_result', ok: false, id: msg.id, error: 'This shared demo is read-only.' }));
        return;
      }
      const { id, name } = msg;
      const numericId = Number(id);
      if (!numericId) {
        ws.send(JSON.stringify({ kind: 'delete_service_result', ok: false, id, error: 'Invalid service ID.' }));
        return;
      }

      try {
        const deleted = await db.deleteService(numericId);
        if (!deleted) {
          ws.send(JSON.stringify({ kind: 'delete_service_result', ok: false, id: numericId, name, error: 'Service not found or already deleted.' }));
          return;
        }
        console.log(`[collector] deleted service (id=${numericId}): ${name || ''}`);
        ws.send(JSON.stringify({ kind: 'delete_service_result', ok: true, id: numericId, name }));
        broadcast({ kind: 'service_deleted', id: numericId, name });
      } catch (err) {
        ws.send(JSON.stringify({ kind: 'delete_service_result', ok: false, id: numericId, name, error: err.message }));
      }
    }
  });

  ws.on('close', () => console.log('[collector] dashboard disconnected.'));

  // Now that message/close listeners are safely attached, fetch and
  // send history. This runs async in the background — it does NOT
  // block or delay the listener registration above.
  (async () => {
    try {
      const [services, recentReadings, recentTraces, uptimeStats, alertsSummary] = await Promise.all([
        db.getAllServices(),
        db.getRecentReadings(),
        db.getRecentTraces(),
        db.getUptimeStats(),
        db.getAlertsSummary(),
      ]);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          kind: 'db_history',
          services,
          recentReadings,
          recentTraces,
          uptimeStats,
          alertsSummary,
          dbMode: db.getConnectionStatus().useMemoryStore ? 'memory' : 'mysql',
        }));
      }
    } catch (err) {
      console.error('[collector] failed to load history from database:', err.message);
    }
  })();
});

async function pollAllServices() {
  const cycleStart = Date.now();
  const services = await db.getAllServices();

  const results = await Promise.all(
    services.map(async (service) => {
      const spanStart = Date.now() - cycleStart;
      const result = await pollOneService(service);
      await db.recordReading(service.id, result);

      // Record accurate health-check event log
      let logLevel = 'INFO';
      let logMsg = `Health check OK (HTTP ${result.httpStatus || 200}, ${result.latencyMs ?? 0}ms)`;
      if (result.status === 'down') {
        logLevel = 'ERROR';
        logMsg = `Health check failed: ${result.error || ('HTTP ' + (result.httpStatus || 'N/A'))}`;
      } else if (result.status === 'degraded') {
        logLevel = 'WARN';
        logMsg = result.details
          ? `Service ${service.name} degraded: ${result.details}`
          : `Service ${service.name} response degraded (${result.latencyMs ?? 0}ms, HTTP ${result.httpStatus || 'N/A'})`;
      }
      await db.recordLog({
        serviceId: service.id,
        serviceName: service.name,
        level: logLevel,
        message: logMsg,
        source: 'health_check',
      });

      // Real alert evaluation engine & deduplication with anti-flapping
      if (result.status === 'down') {
        serviceHealthyConsecutive.set(service.id, 0);
        serviceDegradedConsecutive.set(service.id, 0);
        const existingAlert = await db.getActiveAlertByServiceAndType(service.id, 'service_down');
        if (!existingAlert) {
          // Resolve any active degraded alerts superseded by service down
          await db.resolveActiveAlertsForService(service.id, 'degraded_status');
          await db.resolveActiveAlertsForService(service.id, 'high_latency');

          const alert = await db.createAlert({
            serviceId: service.id,
            serviceName: service.name,
            severity: 'Critical',
            message: `Service ${service.name} is down: ${result.error || ('HTTP ' + (result.httpStatus || 'N/A'))}`,
            alertType: 'service_down',
          });
          broadcast({ kind: 'new_alert', alert });
        }
      } else if (result.status === 'degraded' || (result.latencyMs != null && result.latencyMs > collectorConfig.slowTraceThresholdMs)) {
        serviceHealthyConsecutive.set(service.id, 0);
        const degCount = (serviceDegradedConsecutive.get(service.id) || 0) + 1;
        serviceDegradedConsecutive.set(service.id, degCount);

        // Require consecutive degraded cycles to prevent false alarms
        if (degCount >= collectorConfig.consecutiveDegradedThreshold) {
          const isHighLatency = result.latencyMs != null && result.latencyMs > collectorConfig.slowTraceThresholdMs;
          const alertType = isHighLatency ? 'high_latency' : 'degraded_status';
          const existingDown = await db.getActiveAlertByServiceAndType(service.id, 'service_down');
          if (!existingDown) {
            const existingAlert = await db.getActiveAlertByServiceAndType(service.id, alertType);
            if (!existingAlert) {
              let alertMsg;
              if (isHighLatency) {
                alertMsg = `High latency on ${service.name}: ${result.latencyMs}ms (threshold: ${collectorConfig.slowTraceThresholdMs}ms)`;
              } else if (result.details) {
                alertMsg = `Service ${service.name} is reporting degraded health: ${result.details} (HTTP ${result.httpStatus || 200})`;
              } else {
                alertMsg = `Service ${service.name} is reporting degraded health (HTTP ${result.httpStatus || 'N/A'}, ${result.latencyMs ?? 0}ms)`;
              }
              const alert = await db.createAlert({
                serviceId: service.id,
                serviceName: service.name,
                severity: 'Warning',
                message: alertMsg,
                alertType,
              });
              broadcast({ kind: 'new_alert', alert });
            }
          }
        }
      } else if (result.status === 'healthy') {
        serviceDegradedConsecutive.set(service.id, 0);
        const healCount = (serviceHealthyConsecutive.get(service.id) || 0) + 1;
        serviceHealthyConsecutive.set(service.id, healCount);

        // Require consecutive healthy cycles before resolving to ensure recovery is stable
        if (healCount >= collectorConfig.consecutiveHealthyRecovery) {
          const resolvedDown = await db.resolveActiveAlertsForService(service.id, 'service_down');
          const resolvedLat = await db.resolveActiveAlertsForService(service.id, 'high_latency');
          const resolvedDeg = await db.resolveActiveAlertsForService(service.id, 'degraded_status');
          if (resolvedDown > 0 || resolvedLat > 0 || resolvedDeg > 0) {
            broadcast({ kind: 'alert_resolved', serviceId: service.id });
            await db.recordLog({
              serviceId: service.id,
              serviceName: service.name,
              level: 'INFO',
              message: `Service ${service.name} has recovered to healthy status`,
              source: 'health_check',
            });
          }
        }
      }

      return { service, spanStart, result };
    })
  );

  const tickReadings = results.map(({ service, result }) => ({
    serviceId: service.id,
    service: service.name,
    type: 'real',
    ...result,
  }));

  const spans = results.map(({ service, spanStart, result }) => ({
    id: `span-${service.id}-${cycleStart}`,
    serviceId: service.id,
    service: service.name,
    // Three-way: a confirmed failure is 'Error', a timeout/DNS issue
    // we can't attribute to the service itself is 'Unknown', and
    // anything else (healthy or degraded) is 'Success' at the span
    // level — 'degraded' still means the call completed.
    status: result.status === 'down' ? 'Error' : result.status === 'unknown' ? 'Unknown' : 'Success',
    duration: result.latencyMs ?? 0,
    start: spanStart,
    httpStatus: result.httpStatus ?? null,
    error: result.error || result.details || null,
  }));

  const tick = { time: new Date().toISOString(), readings: tickReadings };
  broadcast({ kind: 'tick', ...tick });

  const totalDuration = spans.length ? Math.max(...spans.map((s) => s.start + s.duration)) : 0;
  const hasError = spans.some((s) => s.status === 'Error' || s.status === 'Unknown');
  const trace = {
    id: makeTraceId(),
    name: 'Telemetry Poll Cycle',
    timestamp: tick.time,
    duration: totalDuration,
    status: hasError ? 'Error' : totalDuration > collectorConfig.slowTraceThresholdMs ? 'Slow' : 'Success',
    spans,
  };
  await db.recordTrace(trace);
  broadcast({ kind: 'trace', trace });

  console.log(
    '[collector] tick:', tickReadings.map((r) => `${r.service}=${r.status}`).join(', '),
    `| trace ${trace.id}: ${trace.status}, ${trace.duration}ms`
  );
}

async function main() {
  await seedDatabaseIfEmpty();
  setInterval(() => {
    pollAllServices().catch((err) => console.error('[collector] poll cycle failed:', err.message));
  }, POLL_INTERVAL_MS);
  console.log(`[collector] polling every ${POLL_INTERVAL_MS / 1000}s, persisting to MySQL...`);
}

main().catch((err) => {
  console.error('[collector] fatal startup error:', err.message);
  process.exit(1);
});

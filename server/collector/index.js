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

const { WebSocketServer } = require('ws');
const db = require('./db');

const POLL_INTERVAL_MS = 3000;
const WEBSOCKET_PORT = Number(process.env.PORT) || 6001;
const FETCH_TIMEOUT_MS = 5000;
const SLOW_TRACE_THRESHOLD_MS = 800;

const COINGECKO_PING_URL = 'https://api.coingecko.com/api/v3/ping';
const COINGECKO_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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
      let status = 'healthy';
      try {
        await fetchWithTimeout(COINGECKO_PRICE_URL);
      } catch {
        status = 'degraded';
      }
      return { status: pingResponse.ok ? status : 'degraded', latencyMs, httpStatus: pingResponse.status };
    } catch (err) {
      const { status, message } = classifyNetworkError(err);
      return { status, latencyMs: Date.now() - start, error: message };
    }
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout(service.url);
    const latencyMs = Date.now() - start;

    if (service.kind === 'statuspage') {
      const body = await response.json();
      const indicator = body?.status?.indicator ?? 'unknown';
      return { status: INDICATOR_TO_STATUS[indicator] ?? 'degraded', latencyMs, httpStatus: response.status };
    }

    return { status: response.ok ? 'healthy' : 'degraded', latencyMs, httpStatus: response.status };
  } catch (err) {
    const { status, message } = classifyNetworkError(err);
    return { status, latencyMs: Date.now() - start, error: message };
  }
}

function makeTraceId() {
  return 'trace-' + Math.random().toString(36).slice(2, 10);
}

const wss = new WebSocketServer({ port: WEBSOCKET_PORT });

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
      if (!name || !url) return;

      try {
        if (await db.serviceUrlExists(url)) {
          ws.send(JSON.stringify({ kind: 'add_service_result', ok: false, error: 'That URL is already being monitored.' }));
          return;
        }
        const service = await db.insertService(name, url, serviceKind === 'statuspage' ? 'statuspage' : 'ping');
        console.log(`[collector] added new service (id=${service.id}): ${name} (${url})`);
        ws.send(JSON.stringify({ kind: 'add_service_result', ok: true, name, id: service.id }));
      } catch (err) {
        ws.send(JSON.stringify({ kind: 'add_service_result', ok: false, error: err.message }));
      }
    }
  });

  ws.on('close', () => console.log('[collector] dashboard disconnected.'));

  // Now that message/close listeners are safely attached, fetch and
  // send history. This runs async in the background — it does NOT
  // block or delay the listener registration above.
  (async () => {
    try {
      const [services, recentReadings, recentTraces, uptimeStats] = await Promise.all([
        db.getAllServices(),
        db.getRecentReadings(),
        db.getRecentTraces(),
        db.getUptimeStats(),
      ]);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ kind: 'db_history', services, recentReadings, recentTraces, uptimeStats }));
      }
    } catch (err) {
      console.error('[collector] failed to load history from database:', err.message);
    }
  })();
});

async function pollAllServices() {
  const cycleStart = Date.now();
  const services = await db.getAllServices();

  // Run every service check CONCURRENTLY instead of sequentially.
  // Previously this was a `for...of` loop with `await` inside — meaning
  // if one service took 5 seconds to respond (or hit the timeout), every
  // service polled after it had to wait for that one to finish first,
  // even though they have nothing to do with each other. A single slow
  // or hanging service could delay the entire poll cycle by seconds.
  //
  // Promise.all fires all requests at once; the cycle now takes roughly
  // as long as the SLOWEST single service, not the SUM of all of them.
  const results = await Promise.all(
    services.map(async (service) => {
      const spanStart = Date.now() - cycleStart; // ~0 for all, since they start together
      const result = await pollOneService(service);
      await db.recordReading(service.id, result);
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
    serviceId: service.id,
    service: service.name,
    // Three-way: a confirmed failure is 'Error', a timeout/DNS issue
    // we can't attribute to the service itself is 'Unknown', and
    // anything else (healthy or degraded) is 'Success' at the span
    // level — 'degraded' still means the call completed.
    status: result.status === 'down' ? 'Error' : result.status === 'unknown' ? 'Unknown' : 'Success',
    duration: result.latencyMs ?? 0,
    start: spanStart,
  }));

  const tick = { time: new Date().toISOString(), readings: tickReadings };
  broadcast({ kind: 'tick', ...tick });

  const totalDuration = spans.length ? Math.max(...spans.map((s) => s.start + s.duration)) : 0;
  const hasError = spans.some((s) => s.status === 'Error');
  const trace = {
    id: makeTraceId(),
    name: 'Telemetry Poll Cycle',
    timestamp: tick.time,
    duration: totalDuration,
    status: hasError ? 'Error' : totalDuration > SLOW_TRACE_THRESHOLD_MS ? 'Slow' : 'Success',
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
  console.log(`[collector] WebSocket server listening on port ${WEBSOCKET_PORT}`);
}

main().catch((err) => {
  console.error('[collector] fatal startup error:', err.message);
  process.exit(1);
});

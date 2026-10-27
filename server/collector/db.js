// db.js — MySQL connection pool and query helpers with automatic in-memory fallback
//
// If MySQL is online and reachable, all services, readings, and traces are persisted to MySQL.
// If MySQL is unreachable or times out, it gracefully falls back to in-memory persistence
// so the collector NEVER crashes and live telemetry remains fully operational.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

const caPath = path.join(__dirname, 'ca.pem');

if (!fs.existsSync(caPath)) {
  throw new Error('TiDB CA certificate not found: ' + caPath);
}

const sslConfig = {
  ca: fs.readFileSync(caPath),
  minVersion: 'TLSv1.2',
  rejectUnauthorized: true,
  servername: process.env.DB_HOST,
};

let pool;
try {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'pulsetrace_app',
    password: process.env.DB_PASSWORD || 'pulsetrace_pw',
    database: process.env.DB_NAME || 'pulsetrace',
    ssl: sslConfig,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 3000,
  });
} catch (err) {
  console.warn('[collector] Failed to create MySQL pool:', err.message);
}

// In-memory fallback storage
let useMemoryStore = false;
let dbCheckDone = false;
let lastDbCheckTime = 0;
let lastDbError = null;
const RECONNECT_INTERVAL_MS = 30000; // Throttle reconnection attempts to 30s to avoid API latency
const memServices = [];
let nextServiceId = 1;
const memReadings = [];
const memTraces = [];
const memAlerts = [];
let nextAlertId = 1;
const memLogs = [];
let nextLogId = 1;

async function initTablesIfConnected() {
  if (!pool) return;
  try {
    // 1. Services
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        kind ENUM('ping', 'statuspage', 'coingecko') NOT NULL DEFAULT 'ping',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_url (url(255))
      )
    `);

    // 2. Readings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS readings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        service_id INT NOT NULL,
        status ENUM('healthy', 'degraded', 'down', 'unknown') NOT NULL,
        latency_ms INT NULL,
        http_status INT NULL,
        error_message VARCHAR(500) NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        INDEX idx_service_time (service_id, recorded_at)
      )
    `);

    // 3. Traces
    await pool.query(`
      CREATE TABLE IF NOT EXISTS traces (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        status ENUM('Success', 'Error', 'Slow') NOT NULL,
        duration_ms INT NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_trace_time (recorded_at)
      )
    `);

    // 4. Spans
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spans (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        trace_id VARCHAR(50) NOT NULL,
        service_id INT NOT NULL,
        status ENUM('Success', 'Error', 'Unknown') NOT NULL,
        duration_ms INT NOT NULL,
        start_offset_ms INT NOT NULL,
        FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      )
    `);

    // 5. Alerts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        service_id INT NULL,
        service_name VARCHAR(255) NOT NULL,
        severity ENUM('Critical', 'Warning', 'Info') NOT NULL DEFAULT 'Warning',
        status ENUM('Active', 'Acknowledged', 'Resolved') NOT NULL DEFAULT 'Active',
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        message TEXT NOT NULL,
        alert_type VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        acknowledged_at TIMESTAMP NULL,
        acknowledged_by_id VARCHAR(100) NULL,
        acknowledged_by_name VARCHAR(255) NULL,
        acknowledged_by_email VARCHAR(255) NULL,
        resolved_at TIMESTAMP NULL,
        read_at TIMESTAMP NULL,
        INDEX idx_alert_status (status),
        INDEX idx_alert_is_read (is_read),
        INDEX idx_alert_service (service_id)
      )
    `);
    try {
      await pool.query('ALTER TABLE alerts ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE');
    } catch { /* column already exists */ }
    try {
      await pool.query('ALTER TABLE alerts ADD COLUMN read_at TIMESTAMP NULL');
    } catch { /* column already exists */ }
    try {
      await pool.query('ALTER TABLE alerts ADD COLUMN acknowledged_by_id VARCHAR(100) NULL');
    } catch { /* column already exists */ }
    try {
      await pool.query('ALTER TABLE alerts ADD COLUMN acknowledged_by_name VARCHAR(255) NULL');
    } catch { /* column already exists */ }
    try {
      await pool.query('ALTER TABLE alerts ADD COLUMN acknowledged_by_email VARCHAR(255) NULL');
    } catch { /* column already exists */ }

    // 6. Logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        service_id INT NULL,
        service_name VARCHAR(255) NOT NULL,
        level ENUM('INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG') NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        source VARCHAR(50) NOT NULL DEFAULT 'health_check',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_log_time (created_at),
        INDEX idx_log_level (level),
        INDEX idx_log_service (service_id)
      )
    `);
  } catch (err) {
    console.warn('[collector] Table initialization note:', err.message);
  }
}

function getConnectionStatus() {
  return {
    useMemoryStore,
    connected: !useMemoryStore && Boolean(pool),
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'pulsetrace',
    lastError: lastDbError,
    lastChecked: lastDbCheckTime ? new Date(lastDbCheckTime).toISOString() : null,
  };
}

async function ensureDb() {
  const now = Date.now();
  if (dbCheckDone) {
    if (!useMemoryStore) return true;
    // Throttle reconnect attempts to avoid stalling incoming API requests
    if (now - lastDbCheckTime < RECONNECT_INTERVAL_MS) {
      return false;
    }
  }

  lastDbCheckTime = now;
  dbCheckDone = true;

  if (!pool) {
    useMemoryStore = true;
    console.warn('[collector] Running in in-memory mode (no MySQL pool configured).');
    return false;
  }

  try {
    const conn = await pool.getConnection();
    conn.release();
    const wasMemory = useMemoryStore;
    useMemoryStore = false;
    lastDbError = null;
    if (wasMemory) {
      console.log('[collector] Restored connection to MySQL database.');
    } else {
      console.log('[collector] Connected to MySQL database.');
    }
    await initTablesIfConnected();
    return true;
  } catch (err) {
    const isFirstFailure = !useMemoryStore;
    useMemoryStore = true;
    const errorMsg = err.message || (err.code === 'ETIMEDOUT' ? 'Connection timed out while reaching database host' : 'Database connection error');
    lastDbError = {
      code: err.code || 'UNKNOWN',
      message: errorMsg,
      sqlState: err.sqlState,
      time: new Date().toISOString(),
    };

    if (isFirstFailure) {
      console.error('[collector] MySQL connection failed!');
      console.error('Host:', `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
      console.error('Error code:', lastDbError.code);
      console.error('Error message:', lastDbError.message);
      if (err.sqlState) console.error('SQL state:', err.sqlState);

      console.warn(
        '[collector] Running in in-memory fallback mode so live telemetry data works uninterrupted.'
      );
    }

    return false;
  }
}

// --- Services ---

async function deleteService(id) {
  const numericId = Number(id);
  if (!numericId) return false;

  const memIdx = memServices.findIndex((s) => s.id === numericId);
  if (memIdx !== -1) {
    memServices.splice(memIdx, 1);
  }

  // Purge any in-memory readings for this service so they don't linger as zombie readings
  for (let i = memReadings.length - 1; i >= 0; i--) {
    if (memReadings[i].serviceId === numericId) {
      memReadings.splice(i, 1);
    }
  }

  // Purge any trace spans for this service
  for (const trace of memTraces) {
    if (trace.spans) {
      trace.spans = trace.spans.filter((span) => span.serviceId !== numericId);
    }
  }

  if (await ensureDb()) {
    try {
      const [result] = await pool.query('DELETE FROM services WHERE id = ?', [numericId]);
      return result.affectedRows > 0 || memIdx !== -1;
    } catch (err) {
      console.warn('[collector] MySQL delete failed:', err.message);
      useMemoryStore = true;
      return memIdx !== -1;
    }
  }
  return memIdx !== -1;
}

async function getAllServices() {
  if (await ensureDb()) {
    try {
      const [rows] = await pool.query('SELECT id, name, url, kind FROM services ORDER BY id');
      // Synchronize in-memory mirror so fallback mode never has empty/missing services
      memServices.length = 0;
      memServices.push(...rows);
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map((r) => r.id || 0));
        if (maxId >= nextServiceId) nextServiceId = maxId + 1;
      }
      return rows;
    } catch (err) {
      console.warn('[collector] MySQL query failed, falling back to memory store:', err.message);
      useMemoryStore = true;
    }
  }
  return [...memServices];
}

async function insertService(name, url, kind) {
  if (await ensureDb()) {
    try {
      const [result] = await pool.query(
        'INSERT INTO services (name, url, kind) VALUES (?, ?, ?)',
        [name, url, kind]
      );
      const inserted = { id: result.insertId, name, url, kind };
      const existingIdx = memServices.findIndex((s) => s.id === inserted.id);
      if (existingIdx !== -1) {
        memServices[existingIdx] = inserted;
      } else {
        memServices.push(inserted);
      }
      if (inserted.id >= nextServiceId) nextServiceId = inserted.id + 1;
      return inserted;
    } catch (err) {
      console.warn('[collector] MySQL insert failed, saving to memory store:', err.message);
      useMemoryStore = true;
    }
  }
  const id = nextServiceId++;
  const service = { id, name, url, kind };
  memServices.push(service);
  return service;
}

async function serviceUrlExists(url, excludeId = null) {
  if (await ensureDb()) {
    try {
      let query = 'SELECT id FROM services WHERE url = ?';
      const params = [url];
      if (excludeId) {
        query += ' AND id != ?';
        params.push(Number(excludeId));
      }
      const [rows] = await pool.query(query, params);
      return rows.length > 0;
    } catch {
      useMemoryStore = true;
    }
  }
  return memServices.some((s) => s.url === url && (excludeId ? s.id !== Number(excludeId) : true));
}

async function updateService(id, { name, url, kind }) {
  const numericId = Number(id);
  if (!numericId) return null;

  if (await ensureDb()) {
    try {
      const updates = [];
      const values = [];
      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (url !== undefined) { updates.push('url = ?'); values.push(url); }
      if (kind !== undefined) { updates.push('kind = ?'); values.push(kind); }
      if (updates.length > 0) {
        values.push(numericId);
        await pool.query(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`, values);
      }
      const [rows] = await pool.query('SELECT id, name, url, kind FROM services WHERE id = ?', [numericId]);
      if (rows.length > 0) {
        const updated = rows[0];
        const idx = memServices.findIndex((s) => s.id === numericId);
        if (idx !== -1) memServices[idx] = updated;
        else memServices.push(updated);
        return updated;
      }
    } catch (err) {
      console.warn('[collector] MySQL updateService failed, updating memory store:', err.message);
      useMemoryStore = true;
    }
  }

  const idx = memServices.findIndex((s) => s.id === numericId);
  if (idx !== -1) {
    if (name !== undefined) memServices[idx].name = name;
    if (url !== undefined) memServices[idx].url = url;
    if (kind !== undefined) memServices[idx].kind = kind;
    return memServices[idx];
  }
  return null;
}

async function getServiceDetails(serviceId) {
  const numericId = Number(serviceId);
  if (!numericId) return null;

  let service = null;
  let readings = [];
  let alerts = [];
  let logs = [];
  let allOtherServices = [];

  if (await ensureDb()) {
    try {
      const [svcRows] = await pool.query('SELECT id, name, url, kind, created_at FROM services WHERE id = ?', [numericId]);
      if (svcRows.length > 0) {
        service = svcRows[0];

        const [readingRows] = await pool.query(
          'SELECT status, latency_ms, http_status, error_message, recorded_at FROM readings WHERE service_id = ? ORDER BY recorded_at DESC LIMIT 500',
          [numericId]
        );
        readings = readingRows;

        const [alertRows] = await pool.query(
          'SELECT id, service_id, service_name, severity, status, message, alert_type, created_at, acknowledged_at, acknowledged_by_id, acknowledged_by_name, acknowledged_by_email, resolved_at FROM alerts WHERE service_id = ? OR service_name = ? ORDER BY created_at DESC LIMIT 10',
          [numericId, service.name]
        );
        alerts = alertRows;

        const [logRows] = await pool.query(
          'SELECT id, level, message, source, created_at FROM logs WHERE service_id = ? OR service_name = ? ORDER BY created_at DESC LIMIT 10',
          [numericId, service.name]
        );
        logs = logRows;

        const [peerRows] = await pool.query('SELECT id, name, url, kind FROM services WHERE id != ? ORDER BY id ASC', [numericId]);
        allOtherServices = peerRows;
      }
    } catch {
      useMemoryStore = true;
    }
  }

  if (!service) {
    service = memServices.find((s) => s.id === numericId);
    if (!service) return null;

    readings = memReadings
      .filter((r) => r.serviceId === numericId)
      .map((r) => ({
        status: r.status,
        latency_ms: r.latencyMs,
        http_status: r.httpStatus,
        error_message: r.error,
        recorded_at: r.recordedAt,
      }))
      .reverse();

    alerts = memAlerts
      .filter((a) => a.service_id === numericId || a.service_name === service.name)
      .slice(0, 10);

    logs = memLogs
      .filter((l) => l.service_id === numericId || l.service_name === service.name)
      .slice(0, 10);

    allOtherServices = memServices.filter((s) => s.id !== numericId);
  }

  // Parse URL for host and port
  let host = null;
  let port = null;
  let protocol = 'http';
  try {
    const parsedUrl = new URL(service.url);
    host = parsedUrl.hostname;
    port = parsedUrl.port ? Number(parsedUrl.port) : (parsedUrl.protocol === 'https:' ? 443 : 80);
    protocol = parsedUrl.protocol.replace(':', '');
  } catch {
    host = service.url;
  }

  // Calculated metrics from genuine readings
  const totalChecks = readings.length;
  const errorChecks = readings.filter((r) => r.status === 'down' || r.status === 'unknown' || r.error_message != null).length;
  const healthyChecks = readings.filter((r) => r.status === 'healthy').length;
  const uptime = totalChecks > 0 ? +((healthyChecks / totalChecks) * 100).toFixed(2) : null;

  const latestReading = readings.length > 0 ? readings[0] : null;
  const currentStatus = latestReading
    ? (latestReading.status === 'healthy' ? 'Healthy' : latestReading.status === 'degraded' ? 'Warning' : latestReading.status === 'down' ? 'Down' : 'Unknown')
    : 'Healthy';
  const latestLatency = latestReading ? latestReading.latency_ms : null;
  const latestHttpStatus = latestReading ? latestReading.http_status : null;
  const latestError = latestReading ? latestReading.error_message : null;
  const lastUpdated = latestReading
    ? new Date(latestReading.recorded_at).toISOString()
    : (service.created_at ? new Date(service.created_at).toISOString() : new Date().toISOString());

  // Latency percentiles
  const validLatencies = readings
    .map((r) => r.latency_ms)
    .filter((l) => typeof l === 'number' && !isNaN(l))
    .sort((a, b) => a - b);

  let avgLatency = null;
  let p95Latency = null;
  let p99Latency = null;
  if (validLatencies.length > 0) {
    const sum = validLatencies.reduce((a, b) => a + b, 0);
    avgLatency = Math.round(sum / validLatencies.length);
    const p95Idx = Math.floor(validLatencies.length * 0.95);
    p95Latency = validLatencies[Math.min(p95Idx, validLatencies.length - 1)];
    const p99Idx = Math.floor(validLatencies.length * 0.99);
    p99Latency = validLatencies[Math.min(p99Idx, validLatencies.length - 1)];
  }

  // Response time trend (chronological, up to 20 recent points)
  const recentChronological = readings.slice(0, 20).reverse();
  const responseTimeTrend = recentChronological.map((r) => {
    const timeLabel = new Date(r.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const lat = r.latency_ms ?? 0;
    return {
      time: timeLabel,
      avg: lat,
      p95: lat,
      p99: lat,
    };
  });

  // Health check volume trend (chronological)
  const healthCheckTrend = recentChronological.map((r) => ({
    time: new Date(r.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    requests: 1,
    errors: r.status === 'down' || r.status === 'unknown' ? 1 : 0,
  }));

  // Cluster dependencies / peers
  const dependencies = allOtherServices.map((peer) => {
    let peerLatency = null;
    let peerStatus = 'Healthy';
    const peerReading = memReadings.find((r) => r.serviceId === peer.id);
    if (peerReading) {
      peerLatency = peerReading.latencyMs;
      peerStatus = peerReading.status === 'healthy' ? 'Healthy' : peerReading.status === 'degraded' ? 'Warning' : 'Down';
    }
    return {
      id: peer.id,
      name: peer.name,
      status: peerStatus,
      latency: peerLatency,
      url: peer.url,
      kind: peer.kind,
    };
  });

  return {
    id: service.id,
    name: service.name,
    url: service.url,
    kind: service.kind,
    status: currentStatus,
    host,
    port,
    protocol,
    lastUpdated,
    // Real health check metrics
    responseTime: latestLatency,
    avgLatency,
    p95Latency,
    p99Latency,
    requestCount: totalChecks,
    errorCount: errorChecks,
    uptime,
    httpStatus: latestHttpStatus,
    error: latestError,
    // Host metrics: explicitly not instrumented
    hostMetrics: {
      instrumented: false,
      reason: 'Host metrics (CPU, Memory, Network, Disk) require an OS telemetry agent (such as Prometheus node_exporter or cAdvisor) installed on the target host. Endpoint HTTP health checks do not expose host hardware telemetry.',
      cpu: null,
      memory: null,
      network: null,
      disk: null,
    },
    // Real trend chart series
    responseTimeTrend,
    healthCheckTrend,
    // Real logs, alerts, dependencies
    recentLogs: logs.map((l) => ({
      id: l.id,
      time: new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      level: l.level,
      message: l.message,
    })),
    recentAlerts: alerts.map((a) => ({
      id: a.id,
      time: new Date(a.created_at || a.rawTimestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      severity: a.severity,
      message: a.message,
      status: a.status,
      acknowledgedAt: a.acknowledged_at || a.acknowledgedAt || null,
      acknowledgedById: a.acknowledged_by_id || a.acknowledgedById || null,
      acknowledgedByName: a.acknowledged_by_name || a.acknowledgedByName || null,
      acknowledgedBy: a.acknowledged_by_name || a.acknowledgedByName || (a.status === 'Acknowledged' ? 'User' : null),
    })),
    dependencies,
  };
}

// --- Readings ---

async function recordReading(serviceId, { status, latencyMs, httpStatus, error, details }) {
  const errMsg = error || details || null;
  memReadings.push({
    serviceId,
    status,
    latencyMs: latencyMs ?? null,
    httpStatus: httpStatus ?? null,
    error: errMsg,
    recordedAt: new Date(),
  });
  if (memReadings.length > 2000) {
    memReadings.shift();
  }

  if (await ensureDb()) {
    try {
      await pool.query(
        `INSERT INTO readings (service_id, status, latency_ms, http_status, error_message)
         VALUES (?, ?, ?, ?, ?)`,
        [serviceId, status, latencyMs ?? null, httpStatus ?? null, errMsg]
      );
    } catch (err) {
      if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
        // Service was deleted while poll was in flight; safe to ignore
        return;
      }
      useMemoryStore = true;
    }
  }
}

async function getUptimeStats() {
  if (await ensureDb()) {
    try {
      const [rows] = await pool.query(`
        SELECT s.id, s.name,
               COUNT(CASE WHEN r.status != 'unknown' THEN 1 END) AS total,
               SUM(CASE WHEN r.status = 'healthy' THEN 1 ELSE 0 END) AS healthy
        FROM services s
        LEFT JOIN readings r ON r.service_id = s.id
        GROUP BY s.id, s.name
      `);
      return rows.map((row) => ({
        name: row.name,
        value: row.total > 0 ? +((row.healthy / row.total) * 100).toFixed(1) : 0,
      }));
    } catch (err) {
      useMemoryStore = true;
    }
  }

  return memServices.map((s) => {
    const serviceReadings = memReadings.filter((r) => r.serviceId === s.id && r.status !== 'unknown');
    const healthy = serviceReadings.filter((r) => r.status === 'healthy').length;
    const total = serviceReadings.length;
    return {
      name: s.name,
      value: total > 0 ? +((healthy / total) * 100).toFixed(1) : 100,
    };
  });
}

async function getRecentReadings(limitPerService = 20) {
  if (await ensureDb()) {
    try {
      const [rows] = await pool.query(`
        SELECT r.service_id, s.name AS service, r.latency_ms, r.recorded_at
        FROM readings r
        JOIN services s ON s.id = r.service_id
        WHERE r.recorded_at >= (NOW() - INTERVAL 10 MINUTE)
        ORDER BY r.recorded_at ASC
      `);
      return rows;
    } catch (err) {
      useMemoryStore = true;
    }
  }

  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const activeServicesMap = new Map(memServices.map((s) => [s.id, s.name]));
  return memReadings
    .filter((r) => r.recordedAt.getTime() >= tenMinutesAgo && activeServicesMap.has(r.serviceId))
    .map((r) => ({
      service_id: r.serviceId,
      service: activeServicesMap.get(r.serviceId),
      latency_ms: r.latencyMs,
      recorded_at: r.recordedAt.toISOString(),
    }));
}

// --- Traces & spans ---

async function recordTrace(trace) {
  memTraces.unshift(trace);
  if (memTraces.length > 50) {
    memTraces.pop();
  }

  if (await ensureDb()) {
    try {
      await pool.query(
        'INSERT INTO traces (id, name, status, duration_ms) VALUES (?, ?, ?, ?)',
        [trace.id, trace.name, trace.status, trace.duration]
      );
      for (const span of trace.spans) {
        if (span.serviceId) {
          await pool.query(
            `INSERT INTO spans (trace_id, service_id, status, duration_ms, start_offset_ms)
             VALUES (?, ?, ?, ?, ?)`,
            [trace.id, span.serviceId, span.status, span.duration, span.start]
          );
        }
      }
    } catch (err) {
      if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
        // Service was deleted while poll was in flight; safe to ignore
        return;
      }
      useMemoryStore = true;
    }
  }
}

async function getRecentTraces(limit = 20) {
  const maxLimit = Math.min(Number(limit) || 20, 100);

  if (await ensureDb()) {
    try {
      const [traces] = await pool.query(
        'SELECT id, name, status, duration_ms AS duration, recorded_at AS timestamp FROM traces ORDER BY recorded_at DESC LIMIT ?',
        [maxLimit]
      );
      for (const trace of traces) {
        const [spans] = await pool.query(
          `SELECT sp.id, sp.service_id AS serviceId, sp.status, sp.duration_ms AS duration, sp.start_offset_ms AS start, COALESCE(s.name, 'Unknown Service') AS service
           FROM spans sp
           LEFT JOIN services s ON s.id = sp.service_id
           WHERE sp.trace_id = ? ORDER BY sp.start_offset_ms ASC`,
          [trace.id]
        );
        trace.spans = spans;
        if (trace.timestamp instanceof Date) {
          trace.timestamp = trace.timestamp.toISOString();
        }
      }
      return traces;
    } catch (err) {
      useMemoryStore = true;
    }
  }

  return memTraces.slice(0, maxLimit);
}

// --- Logs & Health Check Events ---

async function recordLog({ serviceId, serviceName, level = 'INFO', message, source = 'health_check' }) {
  const logItem = {
    id: nextLogId++,
    service_id: serviceId ?? null,
    service_name: serviceName || 'System',
    level: String(level).toUpperCase(),
    message: String(message || ''),
    source,
    created_at: new Date(),
  };

  memLogs.unshift(logItem);
  if (memLogs.length > 2000) {
    memLogs.pop();
  }

  if (await ensureDb()) {
    try {
      await pool.query(
        'INSERT INTO logs (service_id, service_name, level, message, source) VALUES (?, ?, ?, ?, ?)',
        [logItem.service_id, logItem.service_name, logItem.level, logItem.message, logItem.source]
      );
    } catch (err) {
      useMemoryStore = true;
    }
  }

  return logItem;
}

async function getLogs({ level, service, search, limit = 100 }) {
  const maxLimit = Math.min(Number(limit) || 100, 500);

  if (await ensureDb()) {
    try {
      let query = 'SELECT id, service_id, service_name, level, message, source, created_at FROM logs WHERE 1=1';
      const params = [];

      if (level && level !== 'All') {
        query += ' AND level = ?';
        params.push(level.toUpperCase());
      }
      if (service && service !== 'All') {
        query += ' AND (service_name = ? OR service_id = ?)';
        params.push(service, Number(service) || -1);
      }
      if (search && search.trim()) {
        query += ' AND (message LIKE ? OR service_name LIKE ?)';
        const term = `%${search.trim()}%`;
        params.push(term, term);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(maxLimit);

      const [rows] = await pool.query(query, params);

      // Level summary counts
      const [countRows] = await pool.query('SELECT level, COUNT(*) as count FROM logs GROUP BY level');
      const levelCounts = {};
      for (const r of countRows) {
        levelCounts[r.level] = Number(r.count);
      }

      return {
        logs: rows.map(r => ({
          id: r.id,
          serviceId: r.service_id,
          service: r.service_name,
          level: r.level,
          message: r.message,
          source: r.source,
          timestamp: r.created_at,
        })),
        totalCount: rows.length,
        levelCounts,
      };
    } catch (err) {
      useMemoryStore = true;
    }
  }

  // In-memory fallback
  let filtered = [...memLogs];

  if (level && level !== 'All') {
    filtered = filtered.filter(l => l.level === level.toUpperCase());
  }
  if (service && service !== 'All') {
    filtered = filtered.filter(l => l.service_name === service || String(l.service_id) === String(service));
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(l => (l.message && l.message.toLowerCase().includes(q)) || (l.service_name && l.service_name.toLowerCase().includes(q)));
  }

  const levelCounts = {};
  for (const l of memLogs) {
    levelCounts[l.level] = (levelCounts[l.level] || 0) + 1;
  }

  const sliced = filtered.slice(0, maxLimit);
  return {
    logs: sliced.map(l => ({
      id: l.id,
      serviceId: l.service_id,
      service: l.service_name,
      level: l.level,
      message: l.message,
      source: l.source,
      timestamp: l.created_at,
    })),
    totalCount: filtered.length,
    levelCounts,
  };
}

// --- Alerts Engine Persistence ---

function mapAlertRow(row) {
  if (!row) return null;
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const ackAt = row.acknowledged_at ? new Date(row.acknowledged_at) : null;
  const resAt = row.resolved_at ? new Date(row.resolved_at) : null;
  const readAt = row.read_at ? new Date(row.read_at) : null;

  const ackById = row.acknowledged_by_id || null;
  const ackByName = row.acknowledged_by_name || null;
  const ackByEmail = row.acknowledged_by_email || null;
  const ackBy = ackByName || ackByEmail || (row.status === 'Acknowledged' ? 'User' : null);

  return {
    id: row.id,
    serviceId: row.service_id ?? row.serviceId ?? null,
    service: row.service_name || row.service || 'System',
    severity: row.severity,
    status: row.status,
    isRead: Boolean(row.is_read || row.isRead),
    readAt: readAt ? readAt.toISOString() : null,
    message: row.message,
    alertType: row.alert_type || row.alertType || '',
    time: createdAt.toLocaleString(),
    rawTimestamp: createdAt.toISOString(),
    acknowledgedAt: ackAt ? ackAt.toISOString() : null,
    acknowledgedById: ackById,
    acknowledgedByName: ackByName,
    acknowledgedByEmail: ackByEmail,
    acknowledgedBy: ackBy,
    resolvedAt: resAt ? resAt.toISOString() : null,
  };
}

async function createAlert({ serviceId, serviceName, severity = 'Warning', message, alertType }) {
  const alert = {
    id: nextAlertId++,
    service_id: serviceId ?? null,
    service_name: serviceName || 'System',
    severity,
    status: 'Active',
    is_read: false,
    message,
    alert_type: alertType,
    created_at: new Date(),
    updated_at: new Date(),
    acknowledged_at: null,
    acknowledged_by_id: null,
    acknowledged_by_name: null,
    acknowledged_by_email: null,
    resolved_at: null,
    read_at: null,
  };

  memAlerts.unshift(alert);
  if (memAlerts.length > 500) {
    memAlerts.pop();
  }

  if (await ensureDb()) {
    try {
      const [res] = await pool.query(
        'INSERT INTO alerts (service_id, service_name, severity, status, is_read, message, alert_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [alert.service_id, alert.service_name, alert.severity, alert.status, false, alert.message, alert.alert_type]
      );
      alert.id = res.insertId;
    } catch {
      useMemoryStore = true;
    }
  }

  return mapAlertRow(alert);
}

async function getActiveAlertByServiceAndType(serviceId, alertType) {
  if (await ensureDb()) {
    try {
      const [rows] = await pool.query(
        'SELECT id, service_id, service_name, severity, status, message, alert_type, created_at FROM alerts WHERE service_id = ? AND alert_type = ? AND status IN ("Active", "Acknowledged") LIMIT 1',
        [serviceId, alertType]
      );
      return rows[0] || null;
    } catch {
      useMemoryStore = true;
    }
  }

  return memAlerts.find(a => a.service_id === serviceId && a.alert_type === alertType && (a.status === 'Active' || a.status === 'Acknowledged')) || null;
}

async function resolveActiveAlertsForService(serviceId, alertType) {
  const now = new Date();
  let resolvedCount = 0;

  for (const a of memAlerts) {
    if (a.service_id === serviceId && (!alertType || a.alert_type === alertType) && (a.status === 'Active' || a.status === 'Acknowledged')) {
      a.status = 'Resolved';
      a.resolved_at = now;
      a.updated_at = now;
      resolvedCount++;
    }
  }

  if (await ensureDb()) {
    try {
      let q = 'UPDATE alerts SET status = "Resolved", resolved_at = NOW(), updated_at = NOW() WHERE service_id = ? AND status IN ("Active", "Acknowledged")';
      const params = [serviceId];
      if (alertType) {
        q += ' AND alert_type = ?';
        params.push(alertType);
      }
      const [res] = await pool.query(q, params);
      resolvedCount = Math.max(resolvedCount, res.affectedRows || 0);
    } catch {
      useMemoryStore = true;
    }
  }

  return resolvedCount;
}

async function acknowledgeAlert(id, user = {}) {
  const numericId = Number(id);
  const now = new Date();

  const ackUserId = (user && (user.id || user.email)) ? String(user.id || user.email) : 'system';
  const ackUserName = (user && (user.name || user.email)) ? String(user.name || user.email) : 'System';
  const ackUserEmail = (user && user.email) ? String(user.email) : '';

  const memAlert = memAlerts.find(a => a.id === numericId);
  if (memAlert) {
    if (memAlert.status === 'Acknowledged' && memAlert.acknowledged_by_name) {
      // Already acknowledged; do not overwrite original acknowledging user
      return mapAlertRow(memAlert);
    }
    memAlert.status = 'Acknowledged';
    memAlert.acknowledged_at = memAlert.acknowledged_at || now;
    memAlert.acknowledged_by_id = memAlert.acknowledged_by_id || ackUserId;
    memAlert.acknowledged_by_name = memAlert.acknowledged_by_name || ackUserName;
    memAlert.acknowledged_by_email = memAlert.acknowledged_by_email || ackUserEmail;
    memAlert.updated_at = now;
  }

  if (await ensureDb()) {
    try {
      const [existingRows] = await pool.query('SELECT * FROM alerts WHERE id = ?', [numericId]);
      if (existingRows.length === 0) {
        return null;
      }
      const existing = existingRows[0];
      if (existing.status === 'Acknowledged' && existing.acknowledged_by_name) {
        // Already acknowledged; do not overwrite original acknowledging user
        return mapAlertRow(existing);
      }

      const finalAckId = existing.acknowledged_by_id || ackUserId;
      const finalAckName = existing.acknowledged_by_name || ackUserName;
      const finalAckEmail = existing.acknowledged_by_email || ackUserEmail;

      await pool.query(
        'UPDATE alerts SET status = "Acknowledged", acknowledged_at = COALESCE(acknowledged_at, NOW()), acknowledged_by_id = ?, acknowledged_by_name = ?, acknowledged_by_email = ?, updated_at = NOW() WHERE id = ?',
        [finalAckId, finalAckName, finalAckEmail, numericId]
      );

      const [rows] = await pool.query('SELECT * FROM alerts WHERE id = ?', [numericId]);
      if (rows[0]) {
        return mapAlertRow(rows[0]);
      }
    } catch {
      useMemoryStore = true;
    }
  }

  return memAlert ? mapAlertRow(memAlert) : null;
}

async function markAlertRead(id) {
  const numericId = Number(id);
  const now = new Date();

  const memAlert = memAlerts.find(a => a.id === numericId);
  if (memAlert) {
    memAlert.is_read = true;
    memAlert.read_at = now;
    memAlert.updated_at = now;
  }

  if (await ensureDb()) {
    try {
      const [res] = await pool.query(
        'UPDATE alerts SET is_read = TRUE, read_at = NOW(), updated_at = NOW() WHERE id = ?',
        [numericId]
      );
      if (res.affectedRows > 0) {
        const [rows] = await pool.query('SELECT * FROM alerts WHERE id = ?', [numericId]);
        if (rows[0]) {
          return mapAlertRow(rows[0]);
        }
      }
    } catch {
      useMemoryStore = true;
    }
  }

  return memAlert ? mapAlertRow(memAlert) : null;
}

async function markAllAlertsRead() {
  const now = new Date();
  let count = 0;

  for (const a of memAlerts) {
    if (!a.is_read) {
      a.is_read = true;
      a.read_at = now;
      a.updated_at = now;
      count++;
    }
  }

  if (await ensureDb()) {
    try {
      const [res] = await pool.query(
        'UPDATE alerts SET is_read = TRUE, read_at = NOW(), updated_at = NOW() WHERE is_read = FALSE OR is_read = 0'
      );
      count = Math.max(count, res.affectedRows || 0);
    } catch {
      useMemoryStore = true;
    }
  }

  return { ok: true, count };
}

async function resolveAlert(id) {
  const numericId = Number(id);
  const now = new Date();

  const memAlert = memAlerts.find(a => a.id === numericId);
  if (memAlert) {
    memAlert.status = 'Resolved';
    memAlert.resolved_at = now;
    memAlert.updated_at = now;
  }

  if (await ensureDb()) {
    try {
      const [res] = await pool.query(
        'UPDATE alerts SET status = "Resolved", resolved_at = NOW(), updated_at = NOW() WHERE id = ?',
        [numericId]
      );
      if (res.affectedRows > 0) {
        const [rows] = await pool.query('SELECT * FROM alerts WHERE id = ?', [numericId]);
        if (rows[0]) {
          return mapAlertRow(rows[0]);
        }
      }
    } catch {
      useMemoryStore = true;
    }
  }

  return memAlert ? mapAlertRow(memAlert) : null;
}

async function getAlerts({ status, severity, search, limit = 50 }) {
  const maxLimit = Math.min(Number(limit) || 50, 200);

  if (await ensureDb()) {
    try {
      let q = 'SELECT id, service_id, service_name, severity, status, is_read, read_at, message, alert_type, created_at, acknowledged_at, acknowledged_by_id, acknowledged_by_name, acknowledged_by_email, resolved_at FROM alerts WHERE 1=1';
      const params = [];

      if (status && status !== 'All') {
        q += ' AND status = ?';
        params.push(status);
      }
      if (severity && severity !== 'All') {
        q += ' AND severity = ?';
        params.push(severity);
      }
      if (search && search.trim()) {
        q += ' AND (message LIKE ? OR service_name LIKE ?)';
        const term = `%${search.trim()}%`;
        params.push(term, term);
      }

      q += ' ORDER BY created_at DESC LIMIT ?';
      params.push(maxLimit);

      const [rows] = await pool.query(q, params);
      return rows.map(mapAlertRow);
    } catch {
      useMemoryStore = true;
    }
  }

  let list = [...memAlerts];
  if (status && status !== 'All') {
    list = list.filter(a => a.status === status);
  }
  if (severity && severity !== 'All') {
    list = list.filter(a => a.severity === severity);
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(a => (a.message && a.message.toLowerCase().includes(q)) || (a.service_name && a.service_name.toLowerCase().includes(q)));
  }

  return list.slice(0, maxLimit).map(mapAlertRow);
}

async function getAlertsSummary() {
  if (await ensureDb()) {
    try {
      const [rows] = await pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'Acknowledged' THEN 1 ELSE 0 END) as acknowledged,
          SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
          SUM(CASE WHEN severity = 'Critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN severity = 'Warning' THEN 1 ELSE 0 END) as warning,
          SUM(CASE WHEN severity = 'Info' THEN 1 ELSE 0 END) as info,
          SUM(CASE WHEN is_read = 0 OR is_read IS FALSE THEN 1 ELSE 0 END) as unread
        FROM alerts
      `);
      const row = rows[0] || {};
      return {
        total: Number(row.total || 0),
        active: Number(row.active || 0),
        acknowledged: Number(row.acknowledged || 0),
        resolved: Number(row.resolved || 0),
        critical: Number(row.critical || 0),
        warning: Number(row.warning || 0),
        info: Number(row.info || 0),
        unread: Number(row.unread || 0),
      };
    } catch (err) {
      useMemoryStore = true;
    }
  }

  return {
    total: memAlerts.length,
    active: memAlerts.filter(a => a.status === 'Active').length,
    acknowledged: memAlerts.filter(a => a.status === 'Acknowledged').length,
    resolved: memAlerts.filter(a => a.status === 'Resolved').length,
    critical: memAlerts.filter(a => a.severity === 'Critical').length,
    warning: memAlerts.filter(a => a.severity === 'Warning').length,
    info: memAlerts.filter(a => a.severity === 'Info').length,
    unread: memAlerts.filter(a => !a.is_read).length,
  };
}

// --- Analytics Aggregation ---

async function getAnalyticsData(range = '24h') {
  const rangeConfig = {
    '1h': { ms: 60 * 60 * 1000, bucketMs: 2 * 60 * 1000 },
    '6h': { ms: 6 * 60 * 60 * 1000, bucketMs: 10 * 60 * 1000 },
    '24h': { ms: 24 * 60 * 60 * 1000, bucketMs: 30 * 60 * 1000 },
    '7d': { ms: 7 * 24 * 60 * 60 * 1000, bucketMs: 4 * 60 * 60 * 1000 },
    '30d': { ms: 30 * 24 * 60 * 60 * 1000, bucketMs: 12 * 60 * 60 * 1000 },
  };

  const config = rangeConfig[range] || rangeConfig['24h'];
  const now = Date.now();
  const startTime = new Date(now - config.ms);

  let allReadings = [];
  const services = await getAllServices();
  const serviceNameMap = new Map(services.map(s => [s.id, s.name]));

  if (await ensureDb()) {
    try {
      const [rows] = await pool.query(
        `SELECT r.service_id, s.name as service_name, r.status, r.latency_ms, r.http_status, r.recorded_at
         FROM readings r
         JOIN services s ON s.id = r.service_id
         WHERE r.recorded_at >= ?
         ORDER BY r.recorded_at ASC`,
        [startTime]
      );
      allReadings = rows.map(r => ({
        serviceId: r.service_id,
        service: r.service_name,
        status: r.status,
        latencyMs: r.latency_ms,
        httpStatus: r.http_status,
        recordedAt: new Date(r.recorded_at),
      }));
    } catch (err) {
      useMemoryStore = true;
    }
  }

  if (allReadings.length === 0) {
    allReadings = memReadings
      .filter(r => r.recordedAt >= startTime && serviceNameMap.has(r.serviceId))
      .map(r => ({
        serviceId: r.serviceId,
        service: serviceNameMap.get(r.serviceId),
        status: r.status,
        latencyMs: r.latencyMs,
        httpStatus: r.httpStatus,
        recordedAt: r.recordedAt,
      }));
  }

  if (allReadings.length === 0) {
    return {
      range,
      hasData: false,
      totalReadings: 0,
      timeWindow: { start: startTime.toISOString(), end: new Date(now).toISOString() },
      latencyTrend: [],
      responseTimeTrend: [],
      healthCheckTrend: [],
      serviceAvailability: [],
      topSlowServices: [],
      topErrorServices: [],
      healthDistribution: [],
    };
  }

  // Bucket aggregation
  const buckets = new Map();
  const startBucketTs = Math.floor(startTime.getTime() / config.bucketMs) * config.bucketMs;
  const numBuckets = Math.ceil(config.ms / config.bucketMs);

  function formatBucketTime(d) {
    if (range === '7d' || range === '30d') {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  for (let i = 0; i <= numBuckets; i++) {
    const bucketTs = startBucketTs + i * config.bucketMs;
    if (bucketTs > now + config.bucketMs) break;
    buckets.set(bucketTs, {
      ts: bucketTs,
      time: formatBucketTime(new Date(bucketTs)),
      readings: [],
    });
  }

  for (const r of allReadings) {
    const bucketTs = Math.floor(r.recordedAt.getTime() / config.bucketMs) * config.bucketMs;
    if (buckets.has(bucketTs)) {
      buckets.get(bucketTs).readings.push(r);
    }
  }

  const latencyTrend = [];
  const responseTimeTrend = [];
  const healthCheckTrend = [];

  for (const [, bucket] of buckets.entries()) {
    if (bucket.readings.length === 0) continue;

    const latPoint = { time: bucket.time };
    const byService = {};
    const latencies = [];
    let errorsCount = 0;

    for (const r of bucket.readings) {
      if (r.latencyMs != null) {
        latencies.push(r.latencyMs);
        if (!byService[r.service]) byService[r.service] = [];
        byService[r.service].push(r.latencyMs);
      }
      if (r.status === 'down' || (r.httpStatus && r.httpStatus >= 500)) {
        errorsCount++;
      }
    }

    for (const [srv, vals] of Object.entries(byService)) {
      latPoint[srv] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    latencyTrend.push(latPoint);

    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      const p95Idx = Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1);
      const p99Idx = Math.min(Math.floor(latencies.length * 0.99), latencies.length - 1);
      responseTimeTrend.push({
        time: bucket.time,
        avg,
        p95: latencies[p95Idx] ?? avg,
        p99: latencies[p99Idx] ?? avg,
      });
    }

    healthCheckTrend.push({
      time: bucket.time,
      requests: bucket.readings.length,
      errors: errorsCount,
    });
  }

  const serviceStats = new Map();
  for (const s of services) {
    serviceStats.set(s.name, {
      name: s.name,
      total: 0,
      healthy: 0,
      latencies: [],
      errors: 0,
    });
  }

  let healthyCount = 0;
  let degradedCount = 0;
  let downCount = 0;

  for (const r of allReadings) {
    let stat = serviceStats.get(r.service);
    if (!stat) {
      stat = { name: r.service, total: 0, healthy: 0, latencies: [], errors: 0 };
      serviceStats.set(r.service, stat);
    }
    stat.total++;
    if (r.status === 'healthy') {
      stat.healthy++;
      healthyCount++;
    } else if (r.status === 'degraded') {
      degradedCount++;
    } else if (r.status === 'down') {
      stat.errors++;
      downCount++;
    }

    if (r.latencyMs != null) {
      stat.latencies.push(r.latencyMs);
    }
    if (r.httpStatus && r.httpStatus >= 500) {
      stat.errors++;
    }
  }

  const serviceAvailability = [];
  const topSlowServices = [];
  const topErrorServices = [];

  for (const stat of serviceStats.values()) {
    if (stat.total > 0) {
      const avail = Number(((stat.healthy / stat.total) * 100).toFixed(1));
      serviceAvailability.push({ name: stat.name, value: avail });

      const avgLat = stat.latencies.length > 0
        ? Math.round(stat.latencies.reduce((a, b) => a + b, 0) / stat.latencies.length)
        : 0;
      topSlowServices.push({ name: stat.name, latency: avgLat });
      topErrorServices.push({ name: stat.name, errors: stat.errors });
    }
  }

  topSlowServices.sort((a, b) => b.latency - a.latency);
  topErrorServices.sort((a, b) => b.errors - a.errors);

  const healthDistribution = [
    { name: 'Healthy', value: healthyCount, color: '#10b981' },
    { name: 'Degraded', value: degradedCount, color: '#f59e0b' },
    { name: 'Down', value: downCount, color: '#ef4444' },
  ];

  return {
    range,
    hasData: true,
    totalReadings: allReadings.length,
    timeWindow: { start: startTime.toISOString(), end: new Date(now).toISOString() },
    latencyTrend,
    responseTimeTrend,
    healthCheckTrend,
    serviceAvailability,
    topSlowServices: topSlowServices.slice(0, 10),
    topErrorServices: topErrorServices.slice(0, 10),
    healthDistribution,
  };
}

// --- Global Dashboard Search Across Services, Traces, and Logs ---

async function searchAll(q) {
  if (!q || !q.trim()) {
    return { services: [], traces: [], logs: [], total: 0 };
  }
  const term = q.trim();
  const lowerTerm = term.toLowerCase();
  const likeTerm = `%${term}%`;

  let matchedServices = [];
  let matchedTraces = [];
  let matchedLogs = [];

  if (await ensureDb()) {
    try {
      // 1. Services
      const [svcRows] = await pool.query(
        `SELECT s.id, s.name, s.url, s.kind,
                COALESCE(r.status, 'healthy') AS status,
                r.latency_ms AS latency
         FROM services s
         LEFT JOIN (
           SELECT r1.service_id, r1.status, r1.latency_ms
           FROM readings r1
           INNER JOIN (
             SELECT service_id, MAX(id) as max_id FROM readings GROUP BY service_id
           ) r2 ON r1.id = r2.max_id
         ) r ON r.service_id = s.id
         WHERE s.name LIKE ? OR s.url LIKE ?
         LIMIT 6`,
        [likeTerm, likeTerm]
      );
      matchedServices = svcRows.map(r => ({
        id: r.id,
        name: r.name,
        url: r.url,
        kind: r.kind,
        status: r.status,
        latency: r.latency,
      }));

      // 2. Traces (by ID or Operation/Request Name)
      const [trRows] = await pool.query(
        'SELECT id, name, status, duration_ms AS duration, recorded_at AS timestamp FROM traces WHERE id LIKE ? OR name LIKE ? ORDER BY recorded_at DESC LIMIT 6',
        [likeTerm, likeTerm]
      );
      matchedTraces = trRows.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status,
        duration: r.duration,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
      }));

      // 3. Logs (by Message or Service Name)
      const [logRows] = await pool.query(
        'SELECT id, service_name, level, message, created_at AS timestamp FROM logs WHERE message LIKE ? OR service_name LIKE ? ORDER BY created_at DESC LIMIT 6',
        [likeTerm, likeTerm]
      );
      matchedLogs = logRows.map(r => ({
        id: r.id,
        service: r.service_name,
        level: r.level,
        message: r.message,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
      }));

      return {
        services: matchedServices,
        traces: matchedTraces,
        logs: matchedLogs,
        total: matchedServices.length + matchedTraces.length + matchedLogs.length,
      };
    } catch (err) {
      useMemoryStore = true;
    }
  }

  // In-memory fallback
  matchedServices = memServices
    .filter(s => (s.name && s.name.toLowerCase().includes(lowerTerm)) || (s.url && s.url.toLowerCase().includes(lowerTerm)))
    .slice(0, 6)
    .map(s => {
      // Find latest reading if available
      const lastR = memReadings.filter(r => r.service_id === s.id).slice(-1)[0];
      return {
        id: s.id,
        name: s.name,
        url: s.url,
        kind: s.kind || 'ping',
        status: s.status || lastR?.status || 'healthy',
        latency: s.responseTime ?? s.avgLatency ?? lastR?.latency_ms ?? 0,
      };
    });

  matchedTraces = memTraces
    .filter(t => (t.id && t.id.toLowerCase().includes(lowerTerm)) || (t.name && t.name.toLowerCase().includes(lowerTerm)))
    .slice(0, 6)
    .map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      duration: t.duration,
      timestamp: t.timestamp,
    }));

  matchedLogs = memLogs
    .filter(l => (l.message && l.message.toLowerCase().includes(lowerTerm)) || (l.service_name && l.service_name.toLowerCase().includes(lowerTerm)))
    .slice(0, 6)
    .map(l => ({
      id: l.id,
      service: l.service_name,
      level: l.level,
      message: l.message,
      timestamp: l.created_at instanceof Date ? l.created_at.toISOString() : l.created_at,
    }));

  return {
    services: matchedServices,
    traces: matchedTraces,
    logs: matchedLogs,
    total: matchedServices.length + matchedTraces.length + matchedLogs.length,
  };
}

module.exports = {
  pool,
  searchAll,
  getAllServices,
  insertService,
  updateService,
  deleteService,
  serviceUrlExists,
  getServiceDetails,
  recordReading,
  getUptimeStats,
  getRecentReadings,
  recordTrace,
  getRecentTraces,
  recordLog,
  getLogs,
  createAlert,
  getActiveAlertByServiceAndType,
  resolveActiveAlertsForService,
  acknowledgeAlert,
  markAlertRead,
  markAllAlertsRead,
  resolveAlert,
  getAlerts,
  getAlertsSummary,
  getAnalyticsData,
  getConnectionStatus,
};


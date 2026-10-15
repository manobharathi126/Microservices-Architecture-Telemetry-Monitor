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
const memServices = [];
let nextServiceId = 1;
const memReadings = [];
const memTraces = [];

async function ensureDb() {
  if (dbCheckDone) return !useMemoryStore;
  dbCheckDone = true;
  if (!pool) {
    useMemoryStore = true;
    console.warn('[collector] Running in in-memory mode (no MySQL pool configured).');
    return false;
  }
  try {
    const conn = await pool.getConnection();
    conn.release();
    useMemoryStore = false;
    console.log('[collector] Connected to MySQL database.');
    return true;
  } catch (err) {
  useMemoryStore = true;

  console.error('[collector] MySQL connection failed!');
  console.error('Error code:', err.code);
  console.error('Error message:', err.message);
  console.error('SQL state:', err.sqlState);

  console.warn(
    '[collector] Running in in-memory mode so live telemetry data works uninterrupted.'
  );

  return false;
}
}

// --- Services ---

async function getAllServices() {
  if (await ensureDb()) {
    try {
      const [rows] = await pool.query('SELECT id, name, url, kind FROM services ORDER BY id');
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
      if (!memServices.some(s => s.id === inserted.id)) {
        memServices.push(inserted);
      }
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

async function serviceUrlExists(url) {
  if (await ensureDb()) {
    try {
      const [rows] = await pool.query('SELECT id FROM services WHERE url = ?', [url]);
      return rows.length > 0;
    } catch (err) {
      useMemoryStore = true;
    }
  }
  return memServices.some((s) => s.url === url);
}

// --- Readings ---

async function recordReading(serviceId, { status, latencyMs, httpStatus, error }) {
  memReadings.push({
    serviceId,
    status,
    latencyMs: latencyMs ?? null,
    httpStatus: httpStatus ?? null,
    error: error ?? null,
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
        [serviceId, status, latencyMs ?? null, httpStatus ?? null, error ?? null]
      );
    } catch (err) {
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
  return memReadings
    .filter((r) => r.recordedAt.getTime() >= tenMinutesAgo)
    .map((r) => {
      const s = memServices.find((srv) => srv.id === r.serviceId);
      return {
        service_id: r.serviceId,
        service: s ? s.name : 'Service ' + r.serviceId,
        latency_ms: r.latencyMs,
        recorded_at: r.recordedAt.toISOString(),
      };
    });
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
        await pool.query(
          `INSERT INTO spans (trace_id, service_id, status, duration_ms, start_offset_ms)
           VALUES (?, ?, ?, ?, ?)`,
          [trace.id, span.serviceId, span.status, span.duration, span.start]
        );
      }
    } catch (err) {
      useMemoryStore = true;
    }
  }
}

async function getRecentTraces(limit = 20) {
  if (await ensureDb()) {
    try {
      const [traces] = await pool.query(
        'SELECT id, name, status, duration_ms AS duration, recorded_at AS timestamp FROM traces ORDER BY recorded_at DESC LIMIT ?',
        [limit]
      );
      for (const trace of traces) {
        const [spans] = await pool.query(
          `SELECT sp.status, sp.duration_ms AS duration, sp.start_offset_ms AS start, s.name AS service
           FROM spans sp JOIN services s ON s.id = sp.service_id
           WHERE sp.trace_id = ? ORDER BY sp.start_offset_ms ASC`,
          [trace.id]
        );
        trace.spans = spans;
      }
      return traces;
    } catch (err) {
      useMemoryStore = true;
    }
  }

  return memTraces.slice(0, limit);
}

module.exports = {
  pool,
  getAllServices,
  insertService,
  serviceUrlExists,
  recordReading,
  getUptimeStats,
  getRecentReadings,
  recordTrace,
  getRecentTraces,
};

// ============================================================
// useTelemetry — connects to the collector's WebSocket and exposes
// live services, latency/memory/uptime chart data, and traces.
//
// The collector now persists everything in MySQL, so services have
// REAL, STABLE, PERMANENT ids (the database's AUTO_INCREMENT primary
// key) — not ids invented client-side that reset on every page load.
//
// Messages from the collector:
//   { kind: 'db_history', services, recentReadings, recentTraces, uptimeStats }
//     — sent once, right after connecting, with everything already
//     persisted in the database (survives collector restarts)
//   { kind: 'tick', time, readings }   — live, every poll cycle
//   { kind: 'trace', trace }           — live, every poll cycle
//   { kind: 'add_service_result', ok, name, id?, error? }
// ============================================================
import { useEffect, useRef, useState } from 'react';

const COLLECTOR_WS_URL = import.meta.env.VITE_COLLECTOR_WS_URL || 'ws://localhost:6001';
const MAX_CHART_POINTS = 20;
const MAX_TRACES = 20;

function toDisplayStatus(rawStatus) {
  if (rawStatus === 'healthy') return 'Healthy';
  if (rawStatus === 'degraded') return 'Warning';
  if (rawStatus === 'down') return 'Down';
  if (rawStatus === 'unknown') return 'Unknown';
  return 'Warning';
}

// Turns one raw reading into the shape ServiceCard.jsx expects. Now
// uses the reading's REAL database id (reading.serviceId) instead of
// a client-invented one.
function normalizeReading(reading) {
  return {
    id: reading.serviceId,
    name: reading.service,
    type: 'real',
    status: toDisplayStatus(reading.status),
    lastUpdated: 'just now',
    cpu: null,
    memory: null,
    avgLatency: reading.latencyMs ?? reading.latency_ms,
    host: null,
    port: null,
    requestCount: null,
    errorCount: null,
    version: null,
    uptime: null,
    httpStatus: reading.httpStatus ?? reading.http_status,
    error: reading.error ?? reading.error_message,
    raw: reading,
  };
}

function shortTime(isoString) {
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function tickToLatencyPoint(tick) {
  const point = { time: shortTime(tick.time) };
  for (const reading of tick.readings) {
    if (reading.latencyMs != null) point[reading.service] = reading.latencyMs;
  }
  return point;
}

export function useTelemetry() {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [servicesById, setServicesById] = useState({});
  const [latencyChartData, setLatencyChartData] = useState([]);
  const [uptimeChartData, setUptimeChartData] = useState([]);
  const [traces, setTraces] = useState([]);
  const socketRef = useRef(null);
  const [addServiceStatus, setAddServiceStatus] = useState(null);

  const applyTick = (tick) => {
    setServicesById((prev) => {
      const next = { ...prev };
      for (const reading of tick.readings) {
        next[reading.serviceId] = normalizeReading(reading);
      }
      return next;
    });
    setLatencyChartData((prev) => [...prev, tickToLatencyPoint(tick)].slice(-MAX_CHART_POINTS));
  };

  useEffect(() => {
    let isCurrent = true;
    const socket = new WebSocket(COLLECTOR_WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      if (isCurrent) setConnectionStatus('connected');
    };

    socket.onmessage = (event) => {
      if (!isCurrent) return;
      const message = JSON.parse(event.data);

      if (message.kind === 'db_history') {
        // Seed everything from the database — real persisted state,
        // survives collector restarts, unlike the old in-memory version.
        const byId = {};
        for (const s of message.services) {
          byId[s.id] = normalizeReading({ serviceId: s.id, service: s.name, status: 'healthy' });
        }
        // Overlay each service's most recent actual reading, if we have one
        const latestByService = {};
        for (const r of message.recentReadings) {
          latestByService[r.service_id] = r; // recentReadings is ordered ASC, so last write wins = most recent
        }
        for (const [id, r] of Object.entries(latestByService)) {
          byId[id] = normalizeReading({
            serviceId: Number(id),
            service: r.service,
            status: r.status,
            latencyMs: r.latency_ms,
            httpStatus: r.http_status,
          });
        }
        setServicesById(byId);
        setUptimeChartData(message.uptimeStats);
        setTraces(message.recentTraces);

        // Rebuild recent latency chart points from persisted readings,
        // grouped by timestamp (rounded to the second) into ticks.
        const grouped = {};
        for (const r of message.recentReadings) {
          const key = new Date(r.recorded_at).toISOString().slice(0, 19);
          if (!grouped[key]) grouped[key] = { time: shortTime(r.recorded_at) };
          grouped[key][r.service] = r.latency_ms;
        }
        setLatencyChartData(Object.values(grouped).slice(-MAX_CHART_POINTS));
      } else if (message.kind === 'tick') {
        applyTick(message);
      } else if (message.kind === 'trace') {
        setTraces((prev) => [message.trace, ...prev].slice(0, MAX_TRACES));
      } else if (message.kind === 'add_service_result') {
        setAddServiceStatus(message);
      }
    };

    socket.onerror = () => {
      if (isCurrent) setConnectionStatus('error');
    };

    socket.onclose = () => {
      if (isCurrent) setConnectionStatus('disconnected');
    };

    return () => {
      isCurrent = false;
      socketRef.current = null;
      socket.close();
    };
  }, []);

  const addService = (name, url, serviceKind = 'ping') => {
    if (!socketRef.current || socketRef.current.readyState !== 1) {
      setAddServiceStatus({ ok: false, error: 'Not connected to collector yet.' });
      return;
    }
    socketRef.current.send(JSON.stringify({ kind: 'add_service', name, url, serviceKind }));
  };

  return {
    services: Object.values(servicesById),
    latencyChartData,
    uptimeChartData,
    traces,
    connectionStatus,
    addService,
    addServiceStatus,
  };
}

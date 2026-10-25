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
  const pendingDeletePromises = useRef(new Map());
  const deletedServiceIds = useRef(new Set());

  const applyTick = (tick) => {
    setServicesById((prev) => {
      const next = { ...prev };
      for (const reading of tick.readings) {
        if (deletedServiceIds.current.has(reading.serviceId)) {
          delete next[reading.serviceId];
          continue;
        }
        if (next[reading.serviceId]) {
          next[reading.serviceId] = normalizeReading(reading);
        }
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
        // Seed only legitimate services from the database
        const byId = {};
        for (const s of message.services) {
          if (!deletedServiceIds.current.has(s.id)) {
            byId[s.id] = normalizeReading({ serviceId: s.id, service: s.name, status: 'healthy' });
          }
        }
        // Overlay each registered service's most recent reading (DO NOT create phantom services from orphaned readings)
        const latestByService = {};
        for (const r of message.recentReadings) {
          if (byId[r.service_id]) {
            latestByService[r.service_id] = r;
          }
        }
        for (const [id, r] of Object.entries(latestByService)) {
          if (byId[id]) {
            byId[id] = normalizeReading({
              serviceId: Number(id),
              service: byId[id].name,
              status: r.status,
              latencyMs: r.latency_ms,
              httpStatus: r.http_status,
            });
          }
        }
        setServicesById(byId);
        setUptimeChartData(message.uptimeStats);
        // Deduplicate initial traces by ID
        const seenTraceIds = new Set();
        const initialTraces = (message.recentTraces || []).filter((t) => {
          if (!t || !t.id || seenTraceIds.has(t.id)) return false;
          seenTraceIds.add(t.id);
          return true;
        });
        setTraces(initialTraces.slice(0, MAX_TRACES));

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
        if (message.trace && message.trace.id) {
          setTraces((prev) => {
            const filtered = prev.filter((t) => t.id !== message.trace.id);
            return [message.trace, ...filtered].slice(0, MAX_TRACES);
          });
        }
      } else if (message.kind === 'add_service_result') {
        setAddServiceStatus(message);
        if (message.ok && message.id) {
          deletedServiceIds.current.delete(Number(message.id));
        }
      } else if (message.kind === 'service_deleted') {
        const delId = Number(message.id);
        deletedServiceIds.current.add(delId);
        setServicesById((prev) => {
          const next = { ...prev };
          delete next[delId];
          return next;
        });
      } else if (message.kind === 'delete_service_result') {
        const pending = pendingDeletePromises.current.get(message.id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingDeletePromises.current.delete(message.id);
          if (message.ok) {
            deletedServiceIds.current.add(Number(message.id));
            setServicesById((prev) => {
              const next = { ...prev };
              delete next[message.id];
              return next;
            });
            pending.resolve(message);
          } else {
            deletedServiceIds.current.delete(Number(message.id));
            pending.reject(new Error(message.error || 'Failed to delete service.'));
          }
        }
      } else if (
        message.kind === 'new_alert' ||
        message.kind === 'alert_resolved' ||
        message.kind === 'alert_acknowledged' ||
        message.kind === 'alert_read' ||
        message.kind === 'alerts_all_read'
      ) {
        window.dispatchEvent(new CustomEvent('alert_updated', { detail: message }));
      }
    };

    socket.onerror = () => {
      if (isCurrent) setConnectionStatus('error');
    };

    socket.onclose = () => {
      if (isCurrent) setConnectionStatus('disconnected');
      // Reject any pending delete promises on disconnect
      for (const [, pending] of pendingDeletePromises.current.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Collector connection closed before deletion completed.'));
      }
      pendingDeletePromises.current.clear();
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

  const deleteService = (id, name) => {
    return new Promise((resolve, reject) => {
      const numericId = Number(id);
      if (!numericId) {
        reject(new Error('Invalid service ID.'));
        return;
      }
      if (!socketRef.current || socketRef.current.readyState !== 1) {
        reject(new Error('Not connected to collector service. Please verify collector is running.'));
        return;
      }

      deletedServiceIds.current.add(numericId);
      setServicesById((prev) => {
        const next = { ...prev };
        delete next[numericId];
        return next;
      });

      const timeoutId = setTimeout(() => {
        pendingDeletePromises.current.delete(numericId);
        deletedServiceIds.current.delete(numericId);
        reject(new Error('Delete request timed out. Please try again.'));
      }, 6000);

      pendingDeletePromises.current.set(numericId, { resolve, reject, timeoutId });
      socketRef.current.send(JSON.stringify({ kind: 'delete_service', id: numericId, name }));
    });
  };

  return {
    services: Object.values(servicesById),
    latencyChartData,
    uptimeChartData,
    traces,
    connectionStatus,
    addService,
    addServiceStatus,
    deleteService,
  };
}

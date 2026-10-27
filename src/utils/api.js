// ============================================================
// api.js — Centralized API Client for Telemetry Collector
// ============================================================

const resolveCollectorApiUrl = () => {
  const explicitApi = import.meta.env.VITE_COLLECTOR_API_URL;
  if (explicitApi && typeof explicitApi === 'string' && explicitApi.trim()) {
    return explicitApi.trim().replace(/\/+$/, '');
  }
  const wsUrl = import.meta.env.VITE_COLLECTOR_WS_URL;
  if (wsUrl && typeof wsUrl === 'string' && wsUrl.trim()) {
    return wsUrl.trim().replace(/\/+$/, '').replace(/^ws(s?):\/\//i, 'http$1://');
  }
  return 'http://localhost:6001';
};

export const COLLECTOR_API_URL = resolveCollectorApiUrl();

/**
 * Safe fetch helper with timeout and JSON error handling
 */
async function apiFetch(endpoint, options = {}) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${COLLECTOR_API_URL}${cleanEndpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const headers = {
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status} (${response.statusText})`;
      try {
        const errJson = await response.json();
        if (errJson.error || errJson.message) {
          errorMsg = errJson.error || errJson.message;
        }
      } catch {
        // Response was not JSON
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check collector connection.');
    }
    throw err;
  }
}

/**
 * Fetch recent collector poll traces
 * @param {number} limit
 */
export async function fetchTraces(limit = 20) {
  return apiFetch(`/api/traces?limit=${encodeURIComponent(limit)}`);
}

/**
 * Fetch detailed metrics, readings, logs, and alerts for a single service
 * @param {number|string} id
 */
export async function fetchServiceDetails(id) {
  return apiFetch(`/api/services/${encodeURIComponent(id)}`);
}

/**
 * Fetch historical analytics data for a selected time range
 * @param {'1h' | '6h' | '24h' | '7d' | '30d'} range
 */
export async function fetchAnalytics(range = '6h') {
  return apiFetch(`/api/analytics?range=${encodeURIComponent(range)}`);
}

/**
 * Fetch real collector health check logs & system events
 */
export async function fetchLogs({ level, service, search, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (level && level !== 'All') params.append('level', level);
  if (service && service !== 'All') params.append('service', service);
  if (search && search.trim()) params.append('search', search.trim());
  if (limit) params.append('limit', limit);

  const qs = params.toString();
  return apiFetch(`/api/logs${qs ? `?${qs}` : ''}`);
}

/**
 * Fetch real stored alerts
 */
export async function fetchAlerts({ status, severity, search, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'All') params.append('status', status);
  if (severity && severity !== 'All') params.append('severity', severity);
  if (search && search.trim()) params.append('search', search.trim());
  if (limit) params.append('limit', limit);

  const qs = params.toString();
  return apiFetch(`/api/alerts${qs ? `?${qs}` : ''}`);
}

/**
 * Fetch dynamic alert summary statistics
 */
export async function fetchAlertsSummary() {
  return apiFetch('/api/alerts/summary');
}

/**
 * Acknowledge an alert by ID
 */
export async function acknowledgeAlert(id) {
  return apiFetch(`/api/alerts/${encodeURIComponent(id)}/ack`, {
    method: 'POST',
  });
}

/**
 * Resolve an alert by ID
 */
export async function resolveAlert(id) {
  return apiFetch(`/api/alerts/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
  });
}

/**
 * Mark a single alert notification as read
 */
export async function markAlertRead(id) {
  return apiFetch(`/api/alerts/${encodeURIComponent(id)}/read`, {
    method: 'POST',
  });
}

/**
 * Mark all alert notifications as read
 */
export async function markAllAlertsRead() {
  return apiFetch('/api/alerts/read-all', {
    method: 'POST',
  });
}

/**
 * Fetch operational monitoring configuration from collector
 */
export async function fetchCollectorConfig() {
  return apiFetch('/api/config');
}

/**
 * Update operational monitoring thresholds on collector
 */
export async function updateCollectorConfig(config) {
  return apiFetch('/api/config', {
    method: 'POST',
    body: config,
  });
}

/**
 * Fetch collector operational and database status
 */
export async function fetchCollectorStatus() {
  return apiFetch('/api/status');
}

/**
 * Global search across actual services, traces, and logs
 * @param {string} query
 */
export async function searchGlobal(query) {
  if (!query || !query.trim()) {
    return { services: [], traces: [], logs: [], total: 0 };
  }
  return apiFetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
}



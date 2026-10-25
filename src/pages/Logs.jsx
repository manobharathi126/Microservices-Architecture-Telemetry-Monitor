// ============================================================
// Logs Page — Real Collector Health-Check Events & System Activity
// ============================================================
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, AlertCircle, Play, Pause, Info } from 'lucide-react';
import { fetchLogs } from '../utils/api';
import '../css/Pages.css';
import '../css/Services.css';

const LEVELS = ['All', 'INFO', 'WARN', 'ERROR'];

/**
 * Logs page with Kibana-style interface — connected to real backend event logs
 */
const Logs = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [levelCounts, setLevelCounts] = useState({});
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [levelFilter, setLevelFilter] = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');

  useEffect(() => {
    const q = searchParams.get('search');
    if (q != null) setSearch(q);
  }, [searchParams]);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const isFetchingRef = useRef(false);

  const loadLogs = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isInitial) setLoading(true);

    try {
      const data = await fetchLogs({
        level: levelFilter,
        service: serviceFilter,
        search,
        limit: 150,
      });

      setLogs(data.logs || []);
      setTotalCount(data.totalCount || (data.logs ? data.logs.length : 0));
      setLevelCounts(data.levelCounts || {});
      setLastRefreshed(new Date().toLocaleTimeString());
      setError(null);
    } catch (err) {
      console.error('[Logs] Failed to fetch real logs:', err);
      if (isInitial || logs.length === 0) {
        setError(err.message || 'Unable to retrieve event logs from collector.');
      }
    } finally {
      if (isInitial) setLoading(false);
      isFetchingRef.current = false;
    }
  }, [levelFilter, serviceFilter, search, logs.length]);

  // Initial fetch and fetch when filters change
  useEffect(() => {
    loadLogs(true);
  }, [levelFilter, serviceFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Functional 5-second polling interval
  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => {
      loadLogs(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [isAutoRefresh, loadLogs]);

  // Dynamic services list extracted from returned logs
  const availableServices = useMemo(() => {
    const set = new Set();
    logs.forEach(l => {
      if (l.service) set.add(l.service);
    });
    return ['All', ...Array.from(set).sort()];
  }, [logs]);

  const formatTimestamp = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return String(ts || '');
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Log Stream</h2>
          <p className="page-subtitle">
            Real health-check execution events, latency anomalies, and collector system activity
          </p>
        </div>

        {/* Live indicator & refresh controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              background: isAutoRefresh ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${isAutoRefresh ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
              borderRadius: 'var(--radius-full)',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                background: isAutoRefresh ? 'var(--status-healthy)' : 'var(--status-warning)',
                borderRadius: '50%',
                animation: isAutoRefresh ? 'pulse-ring 2s infinite' : 'none',
              }}
            />
            <span
              style={{
                fontSize: '0.78rem',
                color: isAutoRefresh ? 'var(--status-healthy)' : 'var(--status-warning)',
                fontWeight: 600,
              }}
            >
              {isAutoRefresh ? 'LIVE (5s Polling)' : 'PAUSED'}
            </span>
          </div>

          <button
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            title={isAutoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-secondary)',
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            {isAutoRefresh ? <Pause size={13} /> : <Play size={13} />}
            <span>{isAutoRefresh ? 'Pause' : 'Resume'}</span>
          </button>

          <button
            onClick={() => loadLogs(false)}
            title="Manual refresh"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-secondary)',
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Distinction explanation banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 16,
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
        }}
      >
        <Info size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
        <span>
          Displaying recorded <strong>HTTP health-check events</strong> and <strong>collector runtime activity</strong>.
          (Microservice structured log ingestion is supported via <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>POST /api/logs/ingest</code>).
        </span>
      </div>

      {/* Level counts summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {['INFO', 'WARN', 'ERROR'].map((lvl) => (
          <div
            key={lvl}
            onClick={() => setLevelFilter(levelFilter === lvl ? 'All' : lvl)}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              background: levelFilter === lvl ? 'rgba(99,102,241,0.2)' : 'var(--bg-card)',
              border: `1px solid ${levelFilter === lvl ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span className={`log-level ${lvl}`}>{lvl}</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontWeight: 700 }}>
              {levelCounts[lvl] || 0}
            </span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="logs-toolbar">
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="search-input"
            style={{ paddingLeft: 40, maxWidth: '100%', width: '100%' }}
            placeholder="Search health checks and events..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Level Filter */}
        <select
          className="filter-select"
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
        >
          {LEVELS.map(l => <option key={l} value={l}>{l === 'All' ? 'All Levels' : l}</option>)}
        </select>

        {/* Service Filter */}
        <select
          className="filter-select"
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value)}
        >
          {availableServices.map(s => <option key={s} value={s}>{s === 'All' ? 'All Services' : s}</option>)}
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '16px 20px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--status-error)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '0.875rem' }}>{error}</span>
          </div>
          <button
            onClick={() => loadLogs(true)}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'transparent',
              color: 'var(--status-error)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Log Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="log-table-container">
          <table className="log-table logs-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>Timestamp</th>
                <th style={{ width: 160 }}>Service</th>
                <th style={{ width: 80 }}>Level</th>
                <th style={{ width: 110 }}>Source</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(10).fill(null).map((_, i) => (
                  <tr key={i}>
                    {Array(5).fill(null).map((_, j) => (
                      <td key={j} style={{ padding: '10px 14px' }}>
                        <div className="skeleton" style={{ height: 14, width: j === 4 ? '80%' : '60%', borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    No log events match your filters
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="log-timestamp">{formatTimestamp(log.timestamp)}</td>
                    <td style={{ color: 'var(--accent-primary)', fontSize: '0.78rem', fontWeight: 600 }}>
                      {log.service}
                    </td>
                    <td>
                      <span className={`log-level ${log.level}`}>{log.level}</span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: log.source === 'service' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)',
                        color: log.source === 'service' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {log.source || 'health_check'}
                      </span>
                    </td>
                    <td className="log-message">{log.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}>
          <span>Showing {logs.length} of {totalCount} events</span>
          <span>{lastRefreshed ? `Last sync: ${lastRefreshed}` : 'Connecting...'}</span>
        </div>
      </div>
    </div>
  );
};

export default Logs;

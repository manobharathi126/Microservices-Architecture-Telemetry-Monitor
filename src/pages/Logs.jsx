// ============================================================
// Logs Page — Kibana-inspired log viewer
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { Search } from 'lucide-react';
import { logsData } from '../data/dummyData';
import '../css/Pages.css';
import '../css/Services.css';

const LEVELS = ['All', 'INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG'];
const SERVICES = ['All', ...Array.from(new Set(logsData.map(l => l.service)))];
const TIME_RANGES = ['All', 'Last 5 mins', 'Last 15 mins', 'Last 1 hour'];

/**
 * Logs page with Kibana-style interface — searchable, filterable log stream
 */
const Logs = () => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  const formatTimestamp = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const filtered = useMemo(() => {
    return logsData.filter((log) => {
      const matchSearch = log.message.toLowerCase().includes(search.toLowerCase()) ||
        log.service.toLowerCase().includes(search.toLowerCase());
      const matchLevel = levelFilter === 'All' || log.level === levelFilter;
      const matchService = serviceFilter === 'All' || log.service === serviceFilter;
      return matchSearch && matchLevel && matchService;
    });
  }, [search, levelFilter, serviceFilter]);

  const levelCounts = useMemo(() => {
    const counts = {};
    logsData.forEach(l => { counts[l.level] = (counts[l.level] || 0) + 1; });
    return counts;
  }, []);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Log Stream</h2>
          <p className="page-subtitle">Real-time log aggregation from all microservices</p>
        </div>
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-full)' }}>
          <div style={{ width: 8, height: 8, background: 'var(--status-healthy)', borderRadius: '50%', animation: 'pulse-ring 2s infinite' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--status-healthy)', fontWeight: 600 }}>LIVE</span>
        </div>
      </div>

      {/* Level counts summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(levelCounts).map(([level, count]) => (
          <div
            key={level}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-secondary)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span className={`log-level ${level}`}>{level}</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontWeight: 700 }}>{count}</span>
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
            placeholder="Search log messages..."
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
          {SERVICES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Services' : s}</option>)}
        </select>
      </div>

      {/* Log Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="log-table-container">
          <table className="log-table logs-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>Timestamp</th>
                <th style={{ width: 160 }}>Service</th>
                <th style={{ width: 80 }}>Level</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(10).fill(null).map((_, i) => (
                  <tr key={i}>
                    {Array(4).fill(null).map((_, j) => (
                      <td key={j} style={{ padding: '10px 14px' }}>
                        <div className="skeleton" style={{ height: 14, width: j === 3 ? '80%' : '60%', borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    No logs match your filters
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="log-timestamp">{formatTimestamp(log.timestamp)}</td>
                    <td style={{ color: 'var(--accent-primary)', fontSize: '0.78rem', fontWeight: 600 }}>
                      {log.service}
                    </td>
                    <td>
                      <span className={`log-level ${log.level}`}>{log.level}</span>
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
          <span>Showing {filtered.length} of {logsData.length} entries</span>
          <span>Auto-refresh: 5s</span>
        </div>
      </div>
    </div>
  );
};

export default Logs;

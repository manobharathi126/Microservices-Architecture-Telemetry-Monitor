// ============================================================
// Distributed Tracing Page
// ============================================================
import { useState, useEffect } from 'react';
import { ChevronDown, GitBranch, Search } from 'lucide-react';
import { tracesData } from '../data/dummyData';
import '../css/Pages.css';

/**
 * Trace card with expandable timeline view
 */
const TraceCard = ({ trace, index }) => {
  const [expanded, setExpanded] = useState(false);

  // Calculate total duration for proportional bar rendering
  const totalDuration = trace.duration;

  const getBarColor = (status) => {
    if (status === 'Error') return 'error';
    if (status === 'Slow') return 'slow';
    return 'success';
  };

  const getStatusStyle = (status) => {
    if (status === 'Error') return 'badge-error';
    if (status === 'Slow') return 'badge-warning';
    return 'badge-success';
  };

  const formatTimestamp = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div
      className="trace-card"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="trace-card-header" onClick={() => setExpanded(!expanded)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="trace-id">{trace.id}</div>
          <div className="trace-name">{trace.name}</div>
        </div>
        <div className="trace-meta">
          <span className={`badge ${getStatusStyle(trace.status)}`}>{trace.status}</span>
          <span className="trace-duration">{trace.duration}ms</span>
          <span className="trace-time">{formatTimestamp(trace.timestamp)}</span>
          <span className="trace-expand-icon" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}>
            <ChevronDown size={18} />
          </span>
        </div>
      </div>

      {expanded && (
        <div className="trace-timeline">
          <div className="timeline-title">Span Timeline ({trace.spans.length} spans)</div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px', gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Service</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Timeline</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Duration</span>
          </div>

          <div className="timeline-spans">
            {trace.spans.map((span, i) => {
              const leftPercent = (span.start / totalDuration) * 100;
              const widthPercent = Math.max((span.duration / totalDuration) * 100, 1);

              return (
                <div key={i} className="span-item">
                  <div className="span-service">
                    {i > 0 && <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>↳</span>}
                    {span.service}
                  </div>
                  <div className="span-bar-container">
                    <div
                      className={`span-bar ${getBarColor(span.status)}`}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        animationDelay: `${i * 50}ms`,
                      }}
                    />
                  </div>
                  <div className="span-duration">{span.duration}ms</div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total: </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{trace.duration}ms</span>
            </div>
            <div style={{ fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Spans: </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{trace.spans.length}</span>
            </div>
            <div style={{ fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status: </span>
              <span className={`badge ${getStatusStyle(trace.status)}`} style={{ fontSize: '0.68rem' }}>{trace.status}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Distributed Tracing page — shows all request traces
 */
const Tracing = () => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  const filtered = tracesData.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Distributed Tracing</h2>
          <p className="page-subtitle">End-to-end request traces across all microservices</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['All', 'Success', 'Error', 'Slow'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${statusFilter === s ? 'var(--border-hover)' : 'var(--border-secondary)'}`,
                background: statusFilter === s ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: statusFilter === s ? 'var(--accent-primary)' : 'var(--text-muted)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s', fontFamily: 'var(--font-sans)',
              }}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          className="search-input"
          style={{ paddingLeft: 40, maxWidth: '100%', width: '100%' }}
          placeholder="Search by trace ID or request name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Traces', value: tracesData.length, color: 'var(--accent-primary)' },
          { label: 'Successful', value: tracesData.filter(t => t.status === 'Success').length, color: 'var(--status-healthy)' },
          { label: 'Errors', value: tracesData.filter(t => t.status === 'Error').length, color: 'var(--status-error)' },
          { label: 'Slow', value: tracesData.filter(t => t.status === 'Slow').length, color: 'var(--status-warning)' },
          { label: 'Avg Duration', value: `${Math.round(tracesData.reduce((a, b) => a + b.duration, 0) / tracesData.length)}ms`, color: 'var(--text-muted)' },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '8px 16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{stat.label}: </span>
            <span style={{ color: stat.color, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Traces */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array(4).fill(null).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : (
        <div className="traces-list">
          {filtered.map((trace, i) => (
            <TraceCard key={trace.id} trace={trace} index={i} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Tracing;

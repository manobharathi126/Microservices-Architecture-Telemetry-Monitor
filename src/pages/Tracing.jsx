// ============================================================
// Distributed Tracing Page
// ============================================================
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, GitBranch, Search, WifiOff, AlertTriangle } from 'lucide-react';
import { useTelemetry } from '../hooks/useTelemetry';
import '../css/Pages.css';

/**
 * Trace card with expandable timeline view
 */
const TraceCard = ({ trace, index }) => {
  const [expanded, setExpanded] = useState(false);

  // Safe duration calculation for proportional bar rendering
  const totalDuration = Math.max(Number(trace.duration) || 0, 1);

  const getBarColor = (status, duration = 0) => {
    if (status === 'Error') return 'error';
    if (status === 'Unknown') return 'unknown';
    if (status === 'Slow' || duration > 800) return 'slow';
    return 'success';
  };

  const getStatusStyle = (status) => {
    if (status === 'Error') return 'badge-error';
    if (status === 'Slow') return 'badge-warning';
    if (status === 'Unknown') return 'badge-unknown';
    return 'badge-success';
  };

  const formatTimestamp = (ts) => {
    if (!ts || isNaN(new Date(ts).getTime())) return '—';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const spans = trace.spans || [];

  return (
    <div
      className="trace-card"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div
        className="trace-card-header"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Toggle trace details for ${trace.id}`}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="trace-id">{trace.id}</div>
          <div className="trace-name">{trace.name}</div>
        </div>
        <div className="trace-meta">
          <span className={`badge ${getStatusStyle(trace.status)}`}>{trace.status}</span>
          <span className="trace-duration">{trace.duration}ms</span>
          <span className="trace-time">{formatTimestamp(trace.timestamp)}</span>
          <span
            className="trace-expand-icon"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.25s ease',
            }}
          >
            <ChevronDown size={18} />
          </span>
        </div>
      </div>

      {expanded && (
        <div className="trace-timeline">
          <div className="timeline-title">
            Span Timeline ({spans.length} {spans.length === 1 ? 'span' : 'spans'})
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 90px', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Service</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Timeline</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Duration</span>
          </div>

          <div className="timeline-spans">
            {spans.map((span, i) => {
              const startOffset = Math.max(0, Number(span.start) || 0);
              const spanDuration = Math.max(0, Number(span.duration) || 0);
              const leftPercent = Math.min(100, Math.max(0, (startOffset / totalDuration) * 100));
              const widthPercent = Math.max(1, Math.min(100 - leftPercent, (spanDuration / totalDuration) * 100));

              return (
                <div key={span.id || `span-${i}`} className="span-item" style={{ gridTemplateColumns: '180px 1fr 90px' }}>
                  <div className="span-service" title={span.error || span.service}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          display: 'inline-block',
                          backgroundColor:
                            span.status === 'Error'
                              ? 'var(--status-error)'
                              : span.status === 'Unknown'
                              ? 'var(--text-muted)'
                              : spanDuration > 800
                              ? 'var(--status-warning)'
                              : 'var(--status-healthy)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {span.service}
                      </span>
                    </div>
                    {span.error && (
                      <div
                        style={{
                          fontSize: '0.66rem',
                          color: 'var(--status-error)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          paddingLeft: 13,
                        }}
                        title={span.error}
                      >
                        {span.httpStatus ? `HTTP ${span.httpStatus} — ` : ''}{span.error}
                      </div>
                    )}
                  </div>
                  <div className="span-bar-container" title={`${span.service}: ${spanDuration}ms (${span.status})`}>
                    <div
                      className={`span-bar ${getBarColor(span.status, spanDuration)}`}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        animationDelay: `${i * 40}ms`,
                      }}
                    />
                  </div>
                  <div className="span-duration" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {spanDuration}ms
                  </div>
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
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{spans.length}</span>
            </div>
            <div style={{ fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status: </span>
              <span className={`badge ${getStatusStyle(trace.status)}`} style={{ fontSize: '0.68rem' }}>{trace.status}</span>
            </div>
            {trace.status === 'Slow' && (
              <div style={{ fontSize: '0.78rem', color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={13} />
                <span>Exceeded slow latency threshold</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Distributed Tracing page — records the collector's real telemetry polling
 * cycles as root traces, with each target service health-check measured as a
 * concurrent child span with genuine latency and status.
 */
const Tracing = () => {
  const { traces: tracesData, connectionStatus } = useTelemetry();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const q = searchParams.get('search');
    if (q != null) setSearch(q);
  }, [searchParams]);

  const loading = connectionStatus === 'connecting' && tracesData.length === 0;

  const filtered = tracesData.filter((t) => {
    const searchLower = search.trim().toLowerCase();
    const matchSearch =
      !searchLower ||
      (t.name && t.name.toLowerCase().includes(searchLower)) ||
      (t.id && t.id.toLowerCase().includes(searchLower)) ||
      (t.spans && t.spans.some((s) => s.service && s.service.toLowerCase().includes(searchLower)));
    const matchStatus = statusFilter === 'All' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Distributed Tracing</h2>
          <p className="page-subtitle">
            Real spans across each poll cycle's concurrent service calls
            {connectionStatus !== 'connected' && (
              <span style={{ color: '#f59e0b', marginLeft: 8 }}>
                <WifiOff size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                collector {connectionStatus}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['All', 'Success', 'Error', 'Slow'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
              aria-label={`Filter traces by ${s}`}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${statusFilter === s ? 'var(--border-hover)' : 'var(--border-secondary)'}`,
                background: statusFilter === s ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: statusFilter === s ? 'var(--accent-primary)' : 'var(--text-muted)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 380 }}>
        <Search
          size={15}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }}
        />
        <input
          className="search-input"
          style={{ paddingLeft: 40, maxWidth: '100%', width: '100%' }}
          placeholder="Search by trace ID, cycle, or service name..."
          value={search}
          aria-label="Search traces"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Traces', value: tracesData.length, color: 'var(--accent-primary)' },
          {
            label: 'Successful',
            value: tracesData.filter((t) => t.status === 'Success').length,
            color: 'var(--status-healthy)',
          },
          {
            label: 'Errors',
            value: tracesData.filter((t) => t.status === 'Error').length,
            color: 'var(--status-error)',
          },
          {
            label: 'Slow',
            value: tracesData.filter((t) => t.status === 'Slow').length,
            color: 'var(--status-warning)',
          },
          {
            label: 'Avg Duration',
            value: tracesData.length
              ? `${Math.round(tracesData.reduce((a, b) => a + (Number(b.duration) || 0), 0) / tracesData.length)}ms`
              : '—',
            color: 'var(--text-muted)',
          },
        ].map((stat, i) => (
          <div
            key={i}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{stat.label}: </span>
            <span style={{ color: stat.color, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Traces */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array(4)
            .fill(null)
            .map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-lg)' }} />
            ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <GitBranch size={28} />
          </div>
          <p className="empty-state-text">
            {tracesData.length === 0 ? 'Waiting for the first trace...' : 'No traces match your search criteria'}
          </p>
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

// ============================================================
// Alerts Page — Connected to Real Persistence & Alert Engine
// ============================================================
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, Check } from 'lucide-react';
import { fetchAlerts, fetchAlertsSummary, acknowledgeAlert, resolveAlert } from '../utils/api';
import '../css/Pages.css';
import toast from 'react-hot-toast';

const SEVERITIES = ['All', 'Critical', 'Warning', 'Info'];
const STATUSES = ['All', 'Active', 'Acknowledged', 'Resolved'];

/**
 * Alerts management page with real backend persistence and state evaluation
 */
const Alerts = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    acknowledged: 0,
    resolved: 0,
    critical: 0,
    warning: 0,
    info: 0,
  });
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [actionPending, setActionPending] = useState({});

  const loadAlertsData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const [alertsData, summaryData] = await Promise.all([
        fetchAlerts({
          status: statusFilter,
          severity: severityFilter,
          search,
        }),
        fetchAlertsSummary(),
      ]);

      setAlerts(alertsData || []);
      if (summaryData) setSummary(summaryData);
      setError(null);
    } catch (err) {
      console.error('[Alerts] Failed to fetch alerts:', err);
      if (isInitial || alerts.length === 0) {
        setError(err.message || 'Unable to retrieve alerts from collector.');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [statusFilter, severityFilter, search, alerts.length]);

  useEffect(() => {
    loadAlertsData(true);
  }, [statusFilter, severityFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh alerts every 6 seconds to track active failures and recoveries
  useEffect(() => {
    const interval = setInterval(() => {
      loadAlertsData(false);
    }, 6000);
    return () => clearInterval(interval);
  }, [loadAlertsData]);

  // Synchronize immediately on cross-component alert events (e.g. mark all read in Navbar or WebSocket broadcast)
  useEffect(() => {
    const handleUpdate = (e) => {
      if (e?.detail?.alert) {
        const updated = e.detail.alert;
        setAlerts((prev) =>
          prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
        );
      }
      loadAlertsData(false);
    };
    window.addEventListener('alert_updated', handleUpdate);
    return () => window.removeEventListener('alert_updated', handleUpdate);
  }, [loadAlertsData]);

  const handleAcknowledge = async (id) => {
    setActionPending((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await acknowledgeAlert(id);
      if (res && res.ok && res.alert) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...res.alert, status: 'Acknowledged' } : a))
        );
        setSummary((prev) => ({
          ...prev,
          active: Math.max(0, prev.active - 1),
          acknowledged: prev.acknowledged + 1,
        }));
        window.dispatchEvent(new CustomEvent('alert_updated', { detail: { alert: res.alert } }));
        const ackUser = res.alert.acknowledgedByName || res.alert.acknowledgedBy || 'User';
        toast.success(`Alert #${id} acknowledged by ${ackUser}`, {
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-hover)',
          },
        });
      }
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
      toast.error(err.message || 'Failed to acknowledge alert', {
        style: {
          background: 'var(--bg-card)',
          color: 'var(--status-error)',
          border: '1px solid var(--border-hover)',
        },
      });
    } finally {
      setActionPending((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleResolve = async (id) => {
    setActionPending((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await resolveAlert(id);
      if (res && res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'Resolved' } : a))
        );
        setSummary((prev) => ({
          ...prev,
          acknowledged: Math.max(0, prev.acknowledged - 1),
          resolved: prev.resolved + 1,
        }));
        window.dispatchEvent(new CustomEvent('alert_updated'));
        toast.success(`Alert #${id} resolved`, {
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-hover)',
          },
        });
      }
    } catch (err) {
      console.error('Failed to resolve alert:', err);
      toast.error(err.message || 'Failed to resolve alert');
    } finally {
      setActionPending((prev) => ({ ...prev, [id]: false }));
    }
  };

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      const matchSearch =
        (a.message && a.message.toLowerCase().includes(search.toLowerCase())) ||
        (a.service && a.service.toLowerCase().includes(search.toLowerCase()));
      const matchSeverity = severityFilter === 'All' || a.severity === severityFilter;
      const matchStatus = statusFilter === 'All' || a.status === statusFilter;
      return matchSearch && matchSeverity && matchStatus;
    });
  }, [alerts, search, severityFilter, statusFilter]);

  const SeverityIcon = ({ severity }) => {
    if (severity === 'Critical') return <AlertCircle size={13} />;
    if (severity === 'Warning') return <AlertTriangle size={13} />;
    return <CheckCircle2 size={13} />;
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Alerts</h2>
          <p className="page-subtitle">Real-time incident management driven by collector threshold evaluation</p>
        </div>
        <button
          onClick={() => loadAlertsData(false)}
          title="Refresh alerts"
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-secondary)',
            background: 'var(--bg-card)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.8rem',
          }}
        >
          <RefreshCw size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary cards calculated dynamically */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Total Incidents', value: summary.total, color: 'var(--text-primary)', bg: 'var(--bg-card)' },
          { label: 'Active Alerts', value: summary.active, color: 'var(--status-error)', bg: 'rgba(239,68,68,0.08)' },
          { label: 'Acknowledged', value: summary.acknowledged, color: 'var(--accent-primary)', bg: 'rgba(99,102,241,0.1)' },
          { label: 'Critical Outages', value: summary.critical, color: 'var(--status-error)', bg: 'rgba(239,68,68,0.1)' },
          { label: 'Latency Warnings', value: summary.warning, color: 'var(--status-warning)', bg: 'rgba(245,158,11,0.1)' },
          { label: 'Resolved', value: summary.resolved, color: 'var(--status-healthy)', bg: 'rgba(16,185,129,0.08)' },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              background: s.bg,
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)' }}>
              {s.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="search-input"
            style={{ paddingLeft: 40, maxWidth: '100%', width: '100%' }}
            placeholder="Search alerts by service or message..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Severity Filter */}
        <select className="filter-select" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
          {SEVERITIES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Severities' : s}</option>)}
        </select>

        {/* Status Filter */}
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
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
            onClick={() => loadAlertsData(true)}
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

      {/* Alerts Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="alerts-table-container">
          <table className="alerts-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Service</th>
                <th>Message</th>
                <th>Time</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(6).fill(null).map((_, i) => (
                  <tr key={i}>
                    {Array(6).fill(null).map((_, j) => (
                      <td key={j} style={{ padding: '14px 16px' }}>
                        <div className="skeleton" style={{ height: 14, width: '80%', borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    No alerts match your current filters. Monitored services are operating within normal parameters.
                  </td>
                </tr>
              ) : (
                filtered.map((alert) => (
                  <tr
                    key={alert.id}
                    style={{
                      borderLeft: `2px solid ${
                        alert.severity === 'Critical'
                          ? 'var(--status-error)'
                          : alert.severity === 'Warning'
                          ? 'var(--status-warning)'
                          : 'var(--status-healthy)'
                      }`,
                    }}
                  >
                    <td>
                      <span className={`severity-badge ${alert.severity ? alert.severity.toLowerCase() : 'warning'}`}>
                        <SeverityIcon severity={alert.severity} />
                        {alert.severity}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{alert.service}</td>
                    <td style={{ color: 'var(--text-secondary)', maxWidth: 320 }}>{alert.message}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {alert.time}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className={`alert-status-badge ${alert.status ? alert.status.toLowerCase() : 'active'}`}>
                          {alert.status}
                        </span>
                        {alert.status === 'Acknowledged' && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                            <span>Acknowledged by </span>
                            <strong style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                              {alert.acknowledgedByName || alert.acknowledgedBy || 'User'}
                            </strong>
                            {alert.acknowledgedAt && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                {new Date(alert.acknowledgedAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}
                        {alert.status === 'Resolved' && (alert.acknowledgedByName || alert.acknowledgedBy) && (
                          <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                            Ack by {alert.acknowledgedByName || alert.acknowledgedBy}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {alert.status === 'Active' ? (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          disabled={actionPending[alert.id]}
                          style={{
                            padding: '4px 10px',
                            background: 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.3)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--accent-primary)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: actionPending[alert.id] ? 'not-allowed' : 'pointer',
                            opacity: actionPending[alert.id] ? 0.6 : 1,
                            transition: 'all 0.2s',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {actionPending[alert.id] ? 'Saving...' : 'Acknowledge'}
                        </button>
                      ) : alert.status === 'Acknowledged' ? (
                        <button
                          onClick={() => handleResolve(alert.id)}
                          disabled={actionPending[alert.id]}
                          style={{
                            padding: '4px 10px',
                            background: 'rgba(16,185,129,0.15)',
                            border: '1px solid rgba(16,185,129,0.3)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--status-healthy)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: actionPending[alert.id] ? 'not-allowed' : 'pointer',
                            opacity: actionPending[alert.id] ? 0.6 : 1,
                            transition: 'all 0.2s',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {actionPending[alert.id] ? 'Saving...' : 'Resolve'}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--status-healthy)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={13} />
                          Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Alerts;

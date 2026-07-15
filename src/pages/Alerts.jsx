// ============================================================
// Alerts Page
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { Search, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { alertsData } from '../data/dummyData';
import '../css/Pages.css';
import toast from 'react-hot-toast';

const SEVERITIES = ['All', 'Critical', 'Warning', 'Healthy'];
const STATUSES = ['All', 'Active', 'Acknowledged', 'Resolved'];

/**
 * Alerts management page with color-coded severity and status filters
 */
const Alerts = () => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    return alertsData.filter((a) => {
      const matchSearch = a.message.toLowerCase().includes(search.toLowerCase()) ||
        a.service.toLowerCase().includes(search.toLowerCase());
      const matchSeverity = severityFilter === 'All' || a.severity === severityFilter;
      const matchStatus = statusFilter === 'All' || a.status === statusFilter;
      return matchSearch && matchSeverity && matchStatus;
    });
  }, [search, severityFilter, statusFilter]);

  const counts = useMemo(() => ({
    total: alertsData.length,
    critical: alertsData.filter(a => a.severity === 'Critical').length,
    warning: alertsData.filter(a => a.severity === 'Warning').length,
    active: alertsData.filter(a => a.status === 'Active').length,
  }), []);

  const handleAcknowledge = (id) => {
    toast.success('Alert acknowledged', { style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-hover)' } });
  };

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
          <p className="page-subtitle">Active alerts and incident management</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Alerts', value: counts.total, color: 'var(--text-primary)', bg: 'var(--bg-card)' },
          { label: 'Critical', value: counts.critical, color: 'var(--status-error)', bg: 'rgba(239,68,68,0.1)' },
          { label: 'Warning', value: counts.warning, color: 'var(--status-warning)', bg: 'rgba(245,158,11,0.1)' },
          { label: 'Active', value: counts.active, color: 'var(--status-error)', bg: 'rgba(239,68,68,0.08)' },
        ].map((s, i) => (
          <div key={i} style={{
            background: s.bg,
            border: '1px solid var(--border-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</div>
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
            placeholder="Search alerts..."
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
                Array(8).fill(null).map((_, i) => (
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
                    No alerts match your filters
                  </td>
                </tr>
              ) : (
                filtered.map((alert) => (
                  <tr key={alert.id} style={{
                    borderLeft: `2px solid ${alert.severity === 'Critical' ? 'var(--status-error)' : alert.severity === 'Warning' ? 'var(--status-warning)' : 'var(--status-healthy)'}`,
                  }}>
                    <td>
                      <span className={`severity-badge ${alert.severity.toLowerCase()}`}>
                        <SeverityIcon severity={alert.severity} />
                        {alert.severity}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{alert.service}</td>
                    <td style={{ color: 'var(--text-secondary)', maxWidth: 320 }}>{alert.message}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{alert.time}</td>
                    <td>
                      <span className={`alert-status-badge ${alert.status.toLowerCase()}`}>{alert.status}</span>
                    </td>
                    <td>
                      {alert.status === 'Active' && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          style={{
                            padding: '4px 10px',
                            background: 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.3)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--accent-primary)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          Acknowledge
                        </button>
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

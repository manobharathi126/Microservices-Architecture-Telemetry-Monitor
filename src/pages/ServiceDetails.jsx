// ============================================================
// Service Details Page — Connected to Real Collector Backend
// ============================================================
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Clock, Activity, AlertTriangle, TrendingUp, Tag, Globe,
  RefreshCw, Info, CheckCircle2, XCircle
} from 'lucide-react';
import { RequestTrendChart, ResponseTimeChart } from '../components/Charts';
import { fetchServiceDetails } from '../utils/api';
import '../css/Services.css';

/**
 * Detailed view for a single microservice with real measured telemetry
 */
const ServiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDetails = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const data = await fetchServiceDetails(id);
      setService(data);
    } catch (err) {
      setError(err.message || 'Failed to load service details.');
    } finally {
      if (!isSilent) setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetails();
    // Auto-refresh every 8 seconds for live telemetry synchronization
    const timer = setInterval(() => {
      loadDetails(true);
    }, 8000);
    return () => clearInterval(timer);
  }, [loadDetails]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadDetails(true);
  };

  if (loading) {
    return (
      <div className="fade-in" style={{ padding: '40px 0' }}>
        <button className="back-btn" onClick={() => navigate('/services')} style={{ marginBottom: 24 }}>
          <ArrowLeft size={16} /> Back to Services
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-lg)' }} />
          <div className="detail-metrics-grid">
            {Array(9).fill(null).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 110, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-lg)' }} />
            <div className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-lg)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: '80px 24px' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>
          {error ? 'Unable to Load Service' : 'Service Not Found'}
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, maxWidth: 480, margin: '0 auto 24px' }}>
          {error || 'The requested service does not exist or has been removed from the monitoring registry.'}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="back-btn" onClick={() => navigate('/services')}>
            <ArrowLeft size={16} /> Back to Services
          </button>
          <button
            onClick={() => loadDetails()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.82rem',
            }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const statusClass = (service.status || 'unknown').toLowerCase();

  const metrics = [
    {
      label: 'Health Status',
      value: service.status,
      icon: <Activity size={14} />,
      badge: true,
      subtext: service.httpStatus ? `HTTP ${service.httpStatus}` : 'Health Check',
    },
    {
      label: 'Response Time',
      value: service.responseTime != null ? `${service.responseTime}ms` : '—',
      icon: <Clock size={14} />,
      subtext: service.avgLatency != null ? `Avg: ${service.avgLatency}ms` : 'Latest check latency',
    },
    {
      label: 'Health Checks',
      value: service.requestCount != null ? service.requestCount.toLocaleString() : '0',
      icon: <Activity size={14} />,
      subtext: 'Collector check cycles',
    },
    {
      label: 'Failed Checks',
      value: service.errorCount ?? 0,
      icon: <AlertTriangle size={14} />,
      subtext: service.errorCount > 0 ? 'Failed health checks' : 'Zero failures detected',
      isError: service.errorCount > 0,
    },
    {
      label: 'Uptime',
      value: service.uptime != null ? `${service.uptime}%` : 'Provisional',
      icon: <TrendingUp size={14} />,
      subtext: service.uptime != null ? 'Calculated from checks' : 'Awaiting check history',
    },
  ];

  return (
    <div className="fade-in">
      {/* Top Navigation & Live Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <button className="back-btn" onClick={() => navigate('/services')}>
          <ArrowLeft size={16} /> Back to Services
        </button>
        <button
          onClick={handleManualRefresh}
          disabled={refreshing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-secondary)',
            color: 'var(--text-secondary)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.78rem',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
          title="Refresh telemetry"
        >
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Updating...' : 'Live Synced'}
        </button>
      </div>

      {/* Header */}
      <div className="service-detail-header">
        <div className="service-detail-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
            <h1>{service.name}</h1>
            <span className={`badge badge-${statusClass}`}>{service.status}</span>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '2px 8px',
                borderRadius: 4,
                fontWeight: 700,
                letterSpacing: '0.04em',
                background: 'rgba(59,130,246,0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(59,130,246,0.3)',
              }}
            >
              REAL ENDPOINT
            </span>
          </div>
          <div className="service-detail-meta">
            <span className="service-detail-meta-item">
              <Globe size={13} /> {service.host ? `${service.host}:${service.port}` : 'External Target'}
            </span>
            <span className="service-detail-meta-item">
              <Tag size={13} /> {service.protocol?.toUpperCase() || 'HTTP'} · {service.kind || 'ping'}
            </span>
            <span className="service-detail-meta-item" title={service.url} style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--text-muted)' }}>URL:</span> {service.url}
            </span>
            <span className="service-detail-meta-item">
              <Clock size={13} /> Last Polled {service.lastUpdated ? new Date(service.lastUpdated).toLocaleTimeString() : 'just now'}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="detail-metrics-grid">
        {metrics.map((m, i) => (
          <div
            key={i}
            className="detail-metric-card"
            style={{
              borderColor: m.isError ? 'rgba(239, 68, 68, 0.4)' : undefined,
              background: m.isError ? 'rgba(239, 68, 68, 0.03)' : undefined,
            }}
          >
            <div className="detail-metric-label">
              {m.icon} {m.label}
            </div>
            {m.badge ? (
              <span className={`badge badge-${m.value.toLowerCase()}`} style={{ marginTop: 4 }}>
                {m.value}
              </span>
            ) : (
              <div
                className="detail-metric-value"
                style={{ color: m.isError ? 'var(--status-error)' : 'var(--text-primary)' }}
              >
                {m.value}
              </div>
            )}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 8 }}>
              {m.subtext}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
        {/* Real Response Time Trend */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Response Time Trend</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Measured round-trip latency (ms) across recent health checks
              </div>
            </div>
            {service.p95Latency != null && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                P95: <span style={{ color: 'var(--status-warning)', fontWeight: 700 }}>{service.p95Latency}ms</span>
              </div>
            )}
          </div>
          {service.responseTimeTrend && service.responseTimeTrend.length > 0 ? (
            <ResponseTimeChart data={service.responseTimeTrend} />
          ) : (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Clock size={24} style={{ margin: '0 auto 8px', opacity: 0.5, display: 'block' }} />
              No latency readings recorded yet for this service.
            </div>
          )}
        </div>

        {/* Real Health Check Volume */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Health Check Volume</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Polling cycles and detected errors over time
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Checks: <strong style={{ color: 'var(--text-primary)' }}>{service.requestCount}</strong>
            </div>
          </div>
          {service.healthCheckTrend && service.healthCheckTrend.length > 0 ? (
            <RequestTrendChart data={service.healthCheckTrend} />
          ) : (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Activity size={24} style={{ margin: '0 auto 8px', opacity: 0.5, display: 'block' }} />
              No health check volume history recorded yet.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sections: Real Logs, Real Alerts, Real Cluster Peers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Real Recent Logs */}
        <div className="chart-card" style={{ gridColumn: '1 / 3' }}>
          <div className="chart-title" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Recent Health Check Logs</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              {service.recentLogs?.length || 0} recorded
            </span>
          </div>
          {service.recentLogs && service.recentLogs.length > 0 ? (
            <div className="log-table-container">
              <table className="log-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Level</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {service.recentLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {log.time}
                      </td>
                      <td>
                        <span className={`log-level ${log.level}`}>{log.level}</span>
                      </td>
                      <td className="log-message">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              <Info size={20} style={{ margin: '0 auto 6px', display: 'block', opacity: 0.5 }} />
              No logs recorded yet for this service.
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Real Recent Alerts */}
          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Recent Alerts</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                {service.recentAlerts?.length || 0} active/recent
              </span>
            </div>
            {service.recentAlerts && service.recentAlerts.length > 0 ? (
              <div className="alert-list">
                {service.recentAlerts.map((alert) => (
                  <div key={alert.id} className={`alert-item ${alert.severity.toLowerCase()}`}>
                    <div className="alert-item-content">
                      <div className="alert-item-msg">{alert.message}</div>
                      <div className="alert-item-time">
                        {alert.severity} · {alert.time} ({alert.status})
                        {alert.status === 'Acknowledged' && (alert.acknowledgedByName || alert.acknowledgedBy) && (
                          <span style={{ marginLeft: 6, color: 'var(--accent-primary)', fontWeight: 600 }}>
                            · Ack by {alert.acknowledgedByName || alert.acknowledgedBy}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <CheckCircle2 size={20} style={{ color: 'var(--status-healthy)', margin: '0 auto 6px', display: 'block' }} />
                No active or recent alerts for this service.
              </div>
            )}
          </div>

          {/* Real Cluster Dependencies / Peers */}
          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Cluster Services</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                {service.dependencies?.length || 0} monitored peers
              </span>
            </div>
            {service.dependencies && service.dependencies.length > 0 ? (
              <div className="dependencies-list">
                {service.dependencies.map((dep) => (
                  <div
                    key={dep.id}
                    className="dependency-item"
                    onClick={() => navigate(`/services/${dep.id}`)}
                    style={{ cursor: 'pointer' }}
                    title={`View details for ${dep.name}`}
                  >
                    <div>
                      <div className="dependency-name">{dep.name}</div>
                      <div className="dependency-latency">
                        {dep.latency != null ? `${dep.latency}ms` : '—'} · {dep.kind || 'ping'}
                      </div>
                    </div>
                    <span className={`badge badge-${dep.status.toLowerCase()}`}>
                      {dep.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <XCircle size={20} style={{ margin: '0 auto 6px', display: 'block', opacity: 0.5 }} />
                No cluster peer services registered.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceDetails;

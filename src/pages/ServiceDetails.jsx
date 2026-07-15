// ============================================================
// Service Details Page
// ============================================================
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  ArrowLeft, Cpu, HardDrive, Wifi, Database,
  Clock, Activity, AlertTriangle, TrendingUp, MapPin, Tag, Globe
} from 'lucide-react';
import {
  RequestTrendChart, MemoryTrendChart, CpuTrendChart, ResponseTimeChart
} from '../components/Charts';
import {
  servicesData, serviceRecentLogs, serviceRecentAlerts, serviceDependencies,
  requestTrendData, cpuTrendData, memoryTrendData, responseTimeTrendData
} from '../data/dummyData';
import '../css/Services.css';

/**
 * Detailed view for a single microservice
 */
const ServiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  const service = servicesData.find(s => s.id === parseInt(id));

  if (!service) {
    return (
      <div className="fade-in" style={{ textAlign: 'center', padding: '80px 24px' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>Service Not Found</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
          The requested service does not exist.
        </p>
        <button className="back-btn" onClick={() => navigate('/services')}>
          <ArrowLeft size={16} /> Back to Services
        </button>
      </div>
    );
  }

  const statusClass = service.status.toLowerCase();

  const metrics = [
    { label: 'Health Status', value: service.status, icon: <Activity size={14} />, badge: true },
    { label: 'CPU Usage', value: `${service.cpu}%`, icon: <Cpu size={14} />, progress: service.cpu },
    { label: 'Memory Usage', value: `${service.memory}%`, icon: <HardDrive size={14} />, progress: service.memory },
    { label: 'Network', value: `${service.network} MB/s`, icon: <Wifi size={14} /> },
    { label: 'Disk Usage', value: `${service.disk}%`, icon: <Database size={14} />, progress: service.disk },
    { label: 'Response Time', value: `${service.responseTime}ms`, icon: <Clock size={14} /> },
    { label: 'Request Count', value: service.requestCount.toLocaleString(), icon: <Activity size={14} /> },
    { label: 'Error Count', value: service.errorCount, icon: <AlertTriangle size={14} /> },
    { label: 'Uptime', value: `${service.uptime}%`, icon: <TrendingUp size={14} /> },
  ];

  return (
    <div className="fade-in">
      {/* Back */}
      <button className="back-btn" onClick={() => navigate('/services')}>
        <ArrowLeft size={16} /> Back to Services
      </button>

      {/* Header */}
      <div className="service-detail-header">
        <div className="service-detail-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <h1>{service.name}</h1>
            <span className={`badge badge-${statusClass}`}>{service.status}</span>
          </div>
          <div className="service-detail-meta">
            <span className="service-detail-meta-item">
              <Globe size={13} /> {service.host}:{service.port}
            </span>
            <span className="service-detail-meta-item">
              <MapPin size={13} /> {service.region}
            </span>
            <span className="service-detail-meta-item">
              <Tag size={13} /> {service.version}
            </span>
            <span className="service-detail-meta-item">
              <Clock size={13} /> Updated {service.lastUpdated}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="detail-metrics-grid">
        {metrics.map((m, i) => (
          <div key={i} className="detail-metric-card">
            <div className="detail-metric-label">
              {m.icon} {m.label}
            </div>
            {m.badge ? (
              <span className={`badge badge-${m.value.toLowerCase()}`} style={{ marginTop: 4 }}>
                {m.value}
              </span>
            ) : (
              <>
                <div className="detail-metric-value">{m.value}</div>
                {m.progress !== undefined && (
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div
                      className={`progress-fill ${m.progress > 80 ? 'error' : m.progress > 60 ? 'warning' : 'healthy'}`}
                      style={{ width: `${m.progress}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">CPU Usage Trend</div>
          </div>
          <CpuTrendChart data={cpuTrendData} />
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Memory Usage Trend</div>
          </div>
          <MemoryTrendChart data={memoryTrendData} />
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Response Time</div>
          </div>
          <ResponseTimeChart data={responseTimeTrendData} />
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Request Volume</div>
          </div>
          <RequestTrendChart data={requestTrendData} />
        </div>
      </div>

      {/* Bottom Sections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Recent Logs */}
        <div className="chart-card" style={{ gridColumn: '1 / 3' }}>
          <div className="chart-title" style={{ marginBottom: 14 }}>Recent Logs</div>
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
                {serviceRecentLogs.map((log, i) => (
                  <tr key={i}>
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
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Recent Alerts */}
          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: 14 }}>Recent Alerts</div>
            <div className="alert-list">
              {serviceRecentAlerts.map((alert, i) => (
                <div key={i} className={`alert-item ${alert.severity.toLowerCase()}`}>
                  <div className="alert-item-content">
                    <div className="alert-item-msg">{alert.message}</div>
                    <div className="alert-item-time">{alert.severity} · {alert.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dependencies */}
          <div className="chart-card">
            <div className="chart-title" style={{ marginBottom: 14 }}>Dependencies</div>
            <div className="dependencies-list">
              {serviceDependencies.map((dep, i) => (
                <div key={i} className="dependency-item">
                  <div>
                    <div className="dependency-name">{dep.name}</div>
                    <div className="dependency-latency">{dep.latency}ms avg</div>
                  </div>
                  <span className={`badge badge-${dep.status.toLowerCase()}`}>{dep.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceDetails;

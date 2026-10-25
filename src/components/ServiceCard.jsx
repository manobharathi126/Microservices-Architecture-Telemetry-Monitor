// ============================================================
// ServiceCard Component — Card for each microservice
// ============================================================
import { Link } from 'react-router-dom';
import { Clock, Activity, AlertCircle, Cpu, HardDrive, Trash2 } from 'lucide-react';
import '../css/Services.css';

/**
 * Displays a microservice card with metrics and status
 * @param {Object} props.service - Service data object
 * @param {number} [props.index] - Index for staggered animations
 * @param {Function} [props.onDelete] - Callback when user clicks delete button
 */
const ServiceCard = ({ service, index = 0, onDelete }) => {
  const statusClass = service.status.toLowerCase();
  // Real (external) services don't report CPU/memory — we can't
  // observe another site's internals, so we only show what we
  // genuinely measured (latency, HTTP status).
  const isReal = service.type === 'real';

  const getUptimeColor = (uptime) => {
    if (uptime >= 99) return 'healthy';
    if (uptime >= 95) return 'warning';
    return 'error';
  };

  const getValueColor = (value) => {
    if (value > 80) return 'error';
    if (value > 60) return 'warning';
    return '';
  };

  return (
    <Link
      to={`/services/${service.id}`}
      className={`service-card ${statusClass}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Header */}
      <div className="service-card-header">
        <div>
          <div className="service-card-name">
            {service.name}
            <span
              style={{
                marginLeft: 8,
                fontSize: '0.65rem',
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 700,
                letterSpacing: '0.03em',
                background: isReal ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                color: isReal ? '#60a5fa' : '#c084fc',
              }}
            >
              {isReal ? 'REAL' : 'SIMULATED'}
            </span>
          </div>
          <div className="service-card-host">
            {service.host ? `${service.host}:${service.port}` : (isReal ? 'external service' : '—')}
          </div>
        </div>
        <div className="service-card-header-actions">
          <span className={`badge badge-${statusClass}`}>
            {service.status}
          </span>
          {onDelete && !service.isProtected && (
            <button
              type="button"
              className="service-delete-btn"
              title="Delete service"
              aria-label={`Delete service ${service.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(service);
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="service-card-metrics">
        {/* CPU/Memory only exist for simulated services — for real
            services we genuinely have no way to measure this, so we
            omit the bars entirely rather than showing a fake 0%. */}
        {!isReal && (
          <>
            <div className="service-metric">
              <span className="service-metric-label">CPU</span>
              <div>
                <span className={`service-metric-value ${getValueColor(service.cpu)}`}>
                  {service.cpu != null ? `${service.cpu}%` : '—'}
                </span>
                {service.cpu != null && (
                  <div className="progress-bar" style={{ marginTop: 4 }}>
                    <div
                      className={`progress-fill ${service.cpu > 80 ? 'error' : service.cpu > 60 ? 'warning' : 'healthy'}`}
                      style={{ width: `${service.cpu}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="service-metric">
              <span className="service-metric-label">Memory</span>
              <div>
                <span className="service-metric-value">
                  {service.memory != null ? `${Math.round(service.memory)}MB` : '—'}
                </span>
              </div>
            </div>
          </>
        )}

        <div className="service-metric">
          <span className="service-metric-label">
            {isReal ? 'HTTP Status' : 'Requests'}
          </span>
          <span className="service-metric-value">
            {isReal
              ? (service.httpStatus ?? '—')
              : (service.requestCount != null ? service.requestCount.toLocaleString() : '—')}
          </span>
        </div>

        <div className="service-metric">
          <span className="service-metric-label">Latency</span>
          <span className={`service-metric-value ${service.avgLatency > 150 ? 'warning' : ''}`}>
            {service.avgLatency != null ? `${Math.round(service.avgLatency)}ms` : '—'}
          </span>
        </div>

        {!isReal && (
          <>
            <div className="service-metric">
              <span className="service-metric-label">Errors</span>
              <span className={`service-metric-value ${service.errorCount > 50 ? 'error' : ''}`}>
                {service.errorCount ?? 0}
              </span>
            </div>

            <div className="service-metric">
              <span className="service-metric-label">Version</span>
              <span className="service-metric-value">{service.version ?? '—'}</span>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="service-card-footer">
        <span className="service-card-updated">
          <Clock size={11} />
          {service.lastUpdated}
        </span>
        {service.uptime != null ? (
          <span className={`service-card-uptime ${getUptimeColor(service.uptime)}`}>
            ↑ {service.uptime}% uptime
          </span>
        ) : (
          <span className="service-card-uptime">—</span>
        )}
      </div>
    </Link>
  );
};

export default ServiceCard;

// ============================================================
// ServiceCard Component — Card for each microservice
// ============================================================
import { Link } from 'react-router-dom';
import { Clock, Activity, AlertCircle, Cpu, HardDrive } from 'lucide-react';
import '../css/Services.css';

/**
 * Displays a microservice card with metrics and status
 * @param {Object} props.service - Service data object
 */
const ServiceCard = ({ service, index = 0 }) => {
  const statusClass = service.status.toLowerCase();

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
          <div className="service-card-name">{service.name}</div>
          <div className="service-card-host">{service.host}:{service.port}</div>
        </div>
        <span className={`badge badge-${statusClass}`}>
          {service.status}
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="service-card-metrics">
        <div className="service-metric">
          <span className="service-metric-label">CPU</span>
          <div>
            <span className={`service-metric-value ${getValueColor(service.cpu)}`}>
              {service.cpu}%
            </span>
            <div className="progress-bar" style={{ marginTop: 4 }}>
              <div
                className={`progress-fill ${service.cpu > 80 ? 'error' : service.cpu > 60 ? 'warning' : 'healthy'}`}
                style={{ width: `${service.cpu}%` }}
              />
            </div>
          </div>
        </div>

        <div className="service-metric">
          <span className="service-metric-label">Memory</span>
          <div>
            <span className={`service-metric-value ${getValueColor(service.memory)}`}>
              {service.memory}%
            </span>
            <div className="progress-bar" style={{ marginTop: 4 }}>
              <div
                className={`progress-fill ${service.memory > 80 ? 'error' : service.memory > 60 ? 'warning' : 'healthy'}`}
                style={{ width: `${service.memory}%` }}
              />
            </div>
          </div>
        </div>

        <div className="service-metric">
          <span className="service-metric-label">Requests</span>
          <span className="service-metric-value">
            {service.requestCount.toLocaleString()}
          </span>
        </div>

        <div className="service-metric">
          <span className="service-metric-label">Avg Latency</span>
          <span className={`service-metric-value ${service.avgLatency > 150 ? 'warning' : ''}`}>
            {service.avgLatency}ms
          </span>
        </div>

        <div className="service-metric">
          <span className="service-metric-label">Errors</span>
          <span className={`service-metric-value ${service.errorCount > 50 ? 'error' : ''}`}>
            {service.errorCount}
          </span>
        </div>

        <div className="service-metric">
          <span className="service-metric-label">Version</span>
          <span className="service-metric-value">{service.version}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="service-card-footer">
        <span className="service-card-updated">
          <Clock size={11} />
          {service.lastUpdated}
        </span>
        <span className={`service-card-uptime ${getUptimeColor(service.uptime)}`}>
          ↑ {service.uptime}% uptime
        </span>
      </div>
    </Link>
  );
};

export default ServiceCard;

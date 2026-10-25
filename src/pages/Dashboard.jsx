// ============================================================
// Dashboard Page
// ============================================================
import {
  Server, Activity, Zap, Clock, AlertTriangle
} from 'lucide-react';
import StatsCard from '../components/StatsCard';
import { LatencyTrendChart, AvailabilityChart, ServicePieChart } from '../components/Charts';
import { DashboardSkeleton } from '../components/SkeletonLoader';
import { useTelemetry } from '../hooks/useTelemetry';
import '../css/Dashboard.css';

/**
 * Main Dashboard page — shows system overview, stats, and key charts.
 * Everything here — stats grid, pie chart, and the latency/uptime charts —
 * is computed live from the collector's WebSocket feed (useTelemetry).
 */
const Dashboard = () => {
  const { services: servicesData, latencyChartData, uptimeChartData, connectionStatus } = useTelemetry();
  const loading = connectionStatus === 'connecting' && servicesData.length === 0;

  if (loading) return <DashboardSkeleton />;

  // Compute aggregate stats live from whatever services are currently
  // reporting, instead of reading a hardcoded dashboardStats object.
  const totalServices = servicesData.length;
  const downServices = servicesData.filter(s => s.status === 'Down').length;

  const servicesWithLatency = servicesData.filter(s => s.avgLatency != null);
  const avgLatency = servicesWithLatency.length
    ? Math.round(servicesWithLatency.reduce((sum, s) => sum + s.avgLatency, 0) / servicesWithLatency.length)
    : 0;

  const errorRate = totalServices > 0 ? +((downServices / totalServices) * 100).toFixed(1) : 0;

  const stats = {
    totalServices,
    avgResponseTime: avgLatency,
    errorRate,
  };

  // Live pie chart data, replacing the hardcoded pieData import
  const healthyCount = servicesData.filter(s => s.status === 'Healthy').length;
  const warningCount = servicesData.filter(s => s.status === 'Warning').length;
  const livePieData = [
    { name: 'Healthy', value: healthyCount, color: '#10b981' },
    { name: 'Warning', value: warningCount, color: '#f59e0b' },
    { name: 'Down', value: downServices, color: '#ef4444' },
  ];

  const hasIssues = downServices > 0 || stats.errorRate > 5;

  return (
    <div className="fade-in">
      {/* Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-content">
          <div className="welcome-text">
            <h1>
              Welcome to <span>TelemetryOps</span> Monitor
            </h1>
            <p>Microservices Architecture Telemetry & Distributed Tracing Analytics Panel</p>
          </div>
          <div className={`system-status-pill ${hasIssues || connectionStatus !== 'connected' ? 'warning' : ''}`}>
            <div
              className="status-pulse"
              style={{
                background: connectionStatus !== 'connected'
                  ? 'var(--status-error)'
                  : hasIssues ? 'var(--status-warning)' : 'var(--status-healthy)',
              }}
            />
            {connectionStatus !== 'connected'
              ? `Collector ${connectionStatus}`
              : hasIssues
                ? `${downServices} Service(s) Down — Attention Required`
                : 'All Systems Operational'}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatsCard
          icon={<Server size={20} />}
          label="Total Services"
          value={stats.totalServices}
          color="primary"
          trend="neutral"
          animationDelay={0}
        />
        <StatsCard
          icon={<Activity size={20} />}
          label="Real Services"
          value={servicesData.filter(s => s.type === 'real').length}
          color="cyan"
          trend="neutral"
          animationDelay={60}
        />
        <StatsCard
          icon={<Zap size={20} />}
          label="Simulated Services"
          value={servicesData.filter(s => s.type !== 'real').length}
          color="primary"
          trend="neutral"
          animationDelay={120}
        />
        <StatsCard
          icon={<Clock size={20} />}
          label="Avg Response Time"
          value={stats.avgResponseTime}
          unit="ms"
          color="orange"
          trend="down"
          trendValue="-12ms"
          animationDelay={180}
        />
        <StatsCard
          icon={<AlertTriangle size={20} />}
          label="Error Rate"
          value={stats.errorRate}
          unit="%"
          color="red"
          trend="down"
          trendValue="-0.3%"
          animationDelay={240}
        />
        <StatsCard
          icon={<AlertTriangle size={20} />}
          label="Services Down"
          value={downServices}
          color={downServices > 0 ? 'red' : 'green'}
          trend="neutral"
          animationDelay={300}
        />
      </div>

      {/* Charts — all live now, sourced from useTelemetry's rolling history */}
      <div className="charts-grid">
        <div className="chart-card full-width">
          <div className="chart-header">
            <div>
              <div className="chart-title">Latency Trend — All Services</div>
              <div className="chart-subtitle">
                Live latency (ms) per service, last {latencyChartData.length} polls
              </div>
            </div>
          </div>
          {latencyChartData.length > 0 ? (
            <LatencyTrendChart data={latencyChartData} />
          ) : (
            <p style={{ color: 'var(--text-muted)', padding: '2rem 0', textAlign: 'center' }}>
              Waiting for enough data points to draw a trend...
            </p>
          )}
        </div>

        <div className="chart-card full-width">
          <div className="chart-header">
            <div>
              <div className="chart-title">Uptime by Service</div>
              <div className="chart-subtitle">
                % of polls that came back healthy, since this session started
              </div>
            </div>
          </div>
          {uptimeChartData.length > 0 ? (
            <AvailabilityChart data={uptimeChartData} />
          ) : (
            <p style={{ color: 'var(--text-muted)', padding: '2rem 0', textAlign: 'center' }}>
              Collecting data...
            </p>
          )}
        </div>

        <div className="chart-card full-width">
          <div className="chart-header">
            <div>
              <div className="chart-title">Service Health Distribution</div>
              <div className="chart-subtitle">Status across all services</div>
            </div>
          </div>
          <ServicePieChart data={livePieData} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

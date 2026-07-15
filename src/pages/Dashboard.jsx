// ============================================================
// Dashboard Page
// ============================================================
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Server, Activity, Zap, Clock, AlertTriangle,
  Cpu, HardDrive, Wifi, TrendingUp, CheckCircle
} from 'lucide-react';
import StatsCard from '../components/StatsCard';
import { RequestTrendChart, CpuTrendChart, MemoryTrendChart, ResponseTimeChart, ServicePieChart } from '../components/Charts';
import { DashboardSkeleton } from '../components/SkeletonLoader';
import {
  dashboardStats, servicesData,
  requestTrendData, cpuTrendData, memoryTrendData, responseTimeTrendData, pieData
} from '../data/dummyData';
import '../css/Dashboard.css';

/**
 * Main Dashboard page — shows system overview, stats, and key charts
 */
const Dashboard = () => {
  const [loading, setLoading] = useState(true);

  // Simulate data loading
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  if (loading) return <DashboardSkeleton />;

  const stats = dashboardStats;
  const downServices = servicesData.filter(s => s.status === 'Down').length;
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
          <div className={`system-status-pill ${hasIssues ? 'warning' : ''}`}>
            <div className="status-pulse" style={{ background: hasIssues ? 'var(--status-warning)' : 'var(--status-healthy)' }} />
            {hasIssues ? `${downServices} Service(s) Down — Attention Required` : 'All Systems Operational'}
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
          icon={<CheckCircle size={20} />}
          label="Active Services"
          value={stats.activeServices}
          color="green"
          trend="neutral"
          trendValue={`${stats.activeServices}/${stats.totalServices}`}
          animationDelay={60}
        />
        <StatsCard
          icon={<Activity size={20} />}
          label="Total Requests"
          value={(stats.totalRequests / 1000).toFixed(0) + 'K'}
          color="cyan"
          trend="up"
          trendValue="+18.2%"
          animationDelay={120}
        />
        <StatsCard
          icon={<Zap size={20} />}
          label="Requests / sec"
          value={stats.requestsPerSecond.toLocaleString()}
          unit="/s"
          color="primary"
          trend="up"
          trendValue="+5.4%"
          animationDelay={180}
        />
        <StatsCard
          icon={<Clock size={20} />}
          label="Avg Response Time"
          value={stats.avgResponseTime}
          unit="ms"
          color="orange"
          trend="down"
          trendValue="-12ms"
          animationDelay={240}
        />
        <StatsCard
          icon={<AlertTriangle size={20} />}
          label="Error Rate"
          value={stats.errorRate}
          unit="%"
          color="red"
          trend="down"
          trendValue="-0.3%"
          animationDelay={300}
        />
        <StatsCard
          icon={<Cpu size={20} />}
          label="CPU Usage"
          value={stats.cpuUsage}
          unit="%"
          color="purple"
          progress={stats.cpuUsage}
          trend="neutral"
          animationDelay={360}
        />
        <StatsCard
          icon={<HardDrive size={20} />}
          label="Memory Usage"
          value={stats.memoryUsage}
          unit="%"
          color="cyan"
          progress={stats.memoryUsage}
          trend="up"
          trendValue="+3%"
          animationDelay={420}
        />
        <StatsCard
          icon={<Wifi size={20} />}
          label="Network Usage"
          value={stats.networkUsage}
          unit=" MB/s"
          color="primary"
          trend="up"
          trendValue="+8%"
          animationDelay={480}
        />
        <StatsCard
          icon={<TrendingUp size={20} />}
          label="Uptime"
          value={stats.uptime}
          unit="%"
          color="green"
          trend="neutral"
          animationDelay={540}
        />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card full-width">
          <div className="chart-header">
            <div>
              <div className="chart-title">Request Trends</div>
              <div className="chart-subtitle">Requests & errors over 24 hours</div>
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#6366f1' }} />Requests
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#ef4444' }} />Errors
              </div>
            </div>
          </div>
          <RequestTrendChart data={requestTrendData} />
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">CPU Usage by Service</div>
              <div className="chart-subtitle">24-hour CPU trend per service</div>
            </div>
          </div>
          <CpuTrendChart data={cpuTrendData} />
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Memory Trend</div>
              <div className="chart-subtitle">Avg memory utilization</div>
            </div>
          </div>
          <MemoryTrendChart data={memoryTrendData} />
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Response Time Distribution</div>
              <div className="chart-subtitle">Avg, P95, P99 latency</div>
            </div>
          </div>
          <ResponseTimeChart data={responseTimeTrendData} />
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Service Health Distribution</div>
              <div className="chart-subtitle">Status across all services</div>
            </div>
          </div>
          <ServicePieChart data={pieData} />
        </div>
      </div>

      {/* Services Overview */}
      <div className="chart-card" style={{ marginBottom: 0 }}>
        <div className="chart-header" style={{ marginBottom: 16 }}>
          <div>
            <div className="chart-title">Services Overview</div>
            <div className="chart-subtitle">Quick status of all microservices</div>
          </div>
          <Link to="/services" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', textDecoration: 'none' }}>
            View All →
          </Link>
        </div>
        <div className="services-overview">
          {servicesData.map((service) => {
            const dotColor = service.status === 'Healthy' ? 'var(--status-healthy)' : service.status === 'Warning' ? 'var(--status-warning)' : 'var(--status-error)';
            return (
              <Link key={service.id} to={`/services/${service.id}`} className="service-mini-card">
                <div className="service-mini-dot" style={{ background: dotColor }} />
                <div className="service-mini-info">
                  <div className="service-mini-name">{service.name}</div>
                  <div className="service-mini-stat">{service.avgLatency}ms · {service.cpu}% CPU</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

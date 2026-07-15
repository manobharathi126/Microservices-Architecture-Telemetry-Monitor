// ============================================================
// Analytics Page
// ============================================================
import { useState, useEffect } from 'react';
import {
  RequestTrendChart, CpuTrendChart, MemoryTrendChart, ResponseTimeChart,
  AvailabilityChart, SlowServicesChart, ErrorServicesChart, TrafficChart, ServicePieChart
} from '../components/Charts';
import {
  requestTrendData, cpuTrendData, memoryTrendData, responseTimeTrendData,
  serviceAvailabilityData, topSlowServicesData, topErrorServicesData,
  trafficTrendData, pieData
} from '../data/dummyData';
import '../css/Pages.css';
import '../css/Dashboard.css';

/**
 * Wrapper for consistent chart card display
 */
const ChartCard = ({ title, subtitle, children, full = false }) => (
  <div className={`chart-card ${full ? 'full' : ''}`} style={{ gridColumn: full ? '1 / -1' : undefined }}>
    <div className="chart-header">
      <div>
        <div className="chart-title">{title}</div>
        {subtitle && <div className="chart-subtitle">{subtitle}</div>}
      </div>
    </div>
    {children}
  </div>
);

/**
 * Analytics page — all charts and telemetry trends
 */
const Analytics = () => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('24h');

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  const ranges = ['1h', '6h', '24h', '7d', '30d'];

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Analytics</h2>
          <p className="page-subtitle">System-wide telemetry charts and performance analytics</p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {ranges.map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${timeRange === r ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                background: timeRange === r ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: timeRange === r ? 'var(--accent-primary)' : 'var(--text-muted)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s', fontFamily: 'var(--font-sans)',
              }}
            >{r}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="analytics-grid">
          {Array(8).fill(null).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 280, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : (
        <div className="analytics-grid">
          {/* Request Trends */}
          <ChartCard title="Request Trends" subtitle="Total requests & errors over time" full>
            <RequestTrendChart data={requestTrendData} />
          </ChartCard>

          {/* Traffic */}
          <ChartCard title="Traffic Trend" subtitle="Inbound & outbound network traffic (MB/s)">
            <TrafficChart data={trafficTrendData} />
          </ChartCard>

          {/* Service Availability */}
          <ChartCard title="Service Availability" subtitle="Uptime % per service">
            <AvailabilityChart data={serviceAvailabilityData} />
          </ChartCard>

          {/* CPU Trends */}
          <ChartCard title="CPU Trend" subtitle="CPU utilization by key services" full>
            <CpuTrendChart data={cpuTrendData} />
          </ChartCard>

          {/* Memory Trend */}
          <ChartCard title="Memory Trend" subtitle="Average memory utilization across all services">
            <MemoryTrendChart data={memoryTrendData} />
          </ChartCard>

          {/* Response Time */}
          <ChartCard title="Response Time Trend" subtitle="Average, P95 and P99 latency">
            <ResponseTimeChart data={responseTimeTrendData} />
          </ChartCard>

          {/* Top Slow Services */}
          <ChartCard title="Top Slow Services" subtitle="Services ranked by average latency">
            <SlowServicesChart data={topSlowServicesData} />
          </ChartCard>

          {/* Top Error Services */}
          <ChartCard title="Top Error Services" subtitle="Services ranked by error count">
            <ErrorServicesChart data={topErrorServicesData} />
          </ChartCard>

          {/* Service Status Pie */}
          <ChartCard title="Service Health Distribution" subtitle="Healthy / Warning / Down breakdown">
            <ServicePieChart data={pieData} />
          </ChartCard>
        </div>
      )}
    </div>
  );
};

export default Analytics;

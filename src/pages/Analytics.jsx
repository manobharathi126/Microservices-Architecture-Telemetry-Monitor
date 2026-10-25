// ============================================================
// Analytics Page — Driven by Real Historical Telemetry Data
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import {
  RequestTrendChart, ResponseTimeChart, LatencyTrendChart,
  AvailabilityChart, SlowServicesChart, ErrorServicesChart, ServicePieChart
} from '../components/Charts';
import { fetchAnalytics } from '../utils/api';
import { AlertCircle, RefreshCw, BarChart2 } from 'lucide-react';
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

const RANGES = ['1h', '6h', '24h', '7d', '30d'];

/**
 * Analytics page — Powered by real telemetry stored in collector database
 */
const Analytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('6h');
  const [analyticsData, setAnalyticsData] = useState(null);

  const loadData = useCallback(async (range) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnalytics(range);
      setAnalyticsData(result);
    } catch (err) {
      console.error('[Analytics] Failed to fetch telemetry analytics:', err);
      setError(err.message || 'Unable to retrieve historical analytics from collector.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(timeRange);
  }, [timeRange, loadData]);

  const hasData = analyticsData && analyticsData.hasData && analyticsData.totalReadings > 0;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Analytics</h2>
          <p className="page-subtitle">
            System performance trends and availability calculated from actual collector telemetry
          </p>
        </div>

        {/* Time-range filter buttons */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              disabled={loading}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${timeRange === r ? 'var(--accent-primary)' : 'var(--border-secondary)'}`,
                background: timeRange === r ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: timeRange === r ? 'var(--accent-primary)' : 'var(--text-muted)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.2s',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {r}
            </button>
          ))}
          <button
            onClick={() => loadData(timeRange)}
            title="Refresh analytics data"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-secondary)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '16px 20px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 20,
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
            onClick={() => loadData(timeRange)}
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

      {/* Loading state skeleton */}
      {loading ? (
        <div className="analytics-grid">
          {Array(6).fill(null).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 280, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : !hasData ? (
        /* Empty state when no historical readings exist for this range */
        <div className="card" style={{
          textAlign: 'center',
          padding: '60px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(99,102,241,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-primary)',
          }}>
            <BarChart2 size={24} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            No Historical Telemetry for {timeRange}
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 480, fontSize: '0.875rem', lineHeight: 1.5 }}>
            No historical telemetry readings are available for this time range yet. The collector is actively running health checks and accumulating data. Try selecting a shorter range such as <strong>1h</strong> or <strong>6h</strong>.
          </p>
          <button
            onClick={() => setTimeRange('1h')}
            style={{
              marginTop: 10,
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--accent-primary)',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Switch to 1 Hour Range
          </button>
        </div>
      ) : (
        /* Real data charts */
        <div className="analytics-grid">
          {/* Health Check Trends (Requests vs Errors) */}
          <ChartCard
            title="Health Check Trends"
            subtitle={`Total checks (${analyticsData.totalReadings.toLocaleString()}) and failures over ${timeRange}`}
            full
          >
            <RequestTrendChart data={analyticsData.healthCheckTrend} />
          </ChartCard>

          {/* Response Time Percentiles */}
          <ChartCard
            title="Response Time Trends"
            subtitle="Measured Average, P95, and P99 latency percentiles"
          >
            <ResponseTimeChart data={analyticsData.responseTimeTrend} />
          </ChartCard>

          {/* Latency by Service */}
          <ChartCard
            title="Latency by Monitored Service"
            subtitle="Measured response time per service over time"
          >
            <LatencyTrendChart data={analyticsData.latencyTrend} />
          </ChartCard>

          {/* Service Availability */}
          <ChartCard
            title="Service Availability SLA"
            subtitle={`Uptime % based on health checks in the past ${timeRange}`}
          >
            <AvailabilityChart data={analyticsData.serviceAvailability} />
          </ChartCard>

          {/* Top Slow Services */}
          <ChartCard
            title="Slowest Monitored Services"
            subtitle="Services ranked by average measured latency"
          >
            <SlowServicesChart data={analyticsData.topSlowServices} />
          </ChartCard>

          {/* Top Failing Services */}
          <ChartCard
            title="Health Check Failure Rankings"
            subtitle="Services with the highest count of failed checks"
          >
            <ErrorServicesChart data={analyticsData.topErrorServices} />
          </ChartCard>

          {/* Service Status Pie */}
          <ChartCard
            title="Service Health Distribution"
            subtitle="Healthy, Degraded, and Down breakdown"
          >
            <ServicePieChart data={analyticsData.healthDistribution} />
          </ChartCard>
        </div>
      )}
    </div>
  );
};

export default Analytics;

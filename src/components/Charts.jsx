// ============================================================
// Charts Component — Reusable chart wrappers using Recharts
// ============================================================
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ============================================================
// Custom Tooltip Style
// ============================================================
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-hover)',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '0.78rem',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {label && (
          <p style={{ color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</p>
        )}
        {payload.map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 8, height: 8, background: entry.color, borderRadius: '50%', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{entry.name}:</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// ============================================================
// Request Trend Area Chart
// ============================================================
export const RequestTrendChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={220}>
    <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
      <defs>
        <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="gradErrors" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
      <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} />
      <Area type="monotone" dataKey="requests" name="Requests" stroke="#6366f1" strokeWidth={2} fill="url(#gradRequests)" dot={false} activeDot={{ r: 4 }} />
      <Area type="monotone" dataKey="errors" name="Errors" stroke="#ef4444" strokeWidth={2} fill="url(#gradErrors)" dot={false} activeDot={{ r: 4 }} />
    </AreaChart>
  </ResponsiveContainer>
);

// ============================================================
// CPU Trend Multi-Line Chart
// ============================================================
// ============================================================
// Latency Trend Chart — dynamic multi-line chart
//
// Unlike CpuTrendChart below (which hardcodes 4 fixed service keys:
// gateway/auth/order/inventory), this chart doesn't know service names
// in advance — real monitored services (GitHub, PyPI, etc.) aren't
// fixed at build time. So it reads whatever keys exist on each data
// point (other than "time") and draws one line per key automatically.
// ============================================================
const LINE_COLOR_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'];

export const LatencyTrendChart = ({ data }) => {
  const seriesKeys = data && data.length > 0
    ? Object.keys(data[0]).filter((key) => key !== 'time')
    : [];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} unit="ms" />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} />
        {seriesKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={key}
            stroke={LINE_COLOR_PALETTE[i % LINE_COLOR_PALETTE.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

export const CpuTrendChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={220}>
    <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
      <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} />
      <Line type="monotone" dataKey="gateway" name="Gateway" stroke="#6366f1" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="auth" name="Auth" stroke="#10b981" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="order" name="Order" stroke="#f59e0b" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="inventory" name="Inventory" stroke="#06b6d4" strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>
);

// ============================================================
// Memory Trend Area Chart
// ============================================================
export const MemoryTrendChart = ({ data, unit = '%' }) => (
  <ResponsiveContainer width="100%" height={220}>
    <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
      <defs>
        <linearGradient id="gradMemory" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
      <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} unit={unit} />
      <Tooltip content={<CustomTooltip />} />
      <Area type="monotone" dataKey="usage" name={`Memory ${unit}`} stroke="#8b5cf6" strokeWidth={2} fill="url(#gradMemory)" dot={false} activeDot={{ r: 4 }} />
    </AreaChart>
  </ResponsiveContainer>
);

// ============================================================
// Response Time Line Chart (avg, p95, p99)
// ============================================================
export const ResponseTimeChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={220}>
    <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
      <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} unit="ms" />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} />
      <Line type="monotone" dataKey="avg" name="Avg" stroke="#10b981" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="p95" name="P95" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
      <Line type="monotone" dataKey="p99" name="P99" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 2" />
    </LineChart>
  </ResponsiveContainer>
);

// ============================================================
// Service Availability Bar Chart
// ============================================================
export const AvailabilityChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={220}>
    <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 40 }} barSize={18}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
      <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} />
      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
      <Tooltip content={<CustomTooltip />} />
      <Bar dataKey="value" name="Availability" radius={[4, 4, 0, 0]}>
        {data.map((entry, index) => (
          <Cell key={index} fill={entry.value >= 99 ? '#10b981' : entry.value >= 97 ? '#f59e0b' : '#ef4444'} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

// ============================================================
// Top Slow Services Bar Chart
// ============================================================
export const SlowServicesChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={220}>
    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }} barSize={14}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
      <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} unit="ms" />
      <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} width={120} />
      <Tooltip content={<CustomTooltip />} />
      <Bar dataKey="latency" name="Latency (ms)" fill="#f59e0b" radius={[0, 4, 4, 0]}>
        {data.map((entry, index) => (
          <Cell key={index} fill={entry.latency > 200 ? '#ef4444' : entry.latency > 100 ? '#f59e0b' : '#10b981'} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

// ============================================================
// Top Error Services Bar Chart
// ============================================================
export const ErrorServicesChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={220}>
    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }} barSize={14}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
      <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} width={120} />
      <Tooltip content={<CustomTooltip />} />
      <Bar dataKey="errors" name="Errors" fill="#ef4444" radius={[0, 4, 4, 0]}>
        {data.map((entry, index) => (
          <Cell key={index} fill={entry.errors > 100 ? '#dc2626' : entry.errors > 20 ? '#f59e0b' : '#10b981'} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

// ============================================================
// Traffic Area Chart (inbound/outbound)
// ============================================================
export const TrafficChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={220}>
    <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
      <defs>
        <linearGradient id="gradInbound" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="gradOutbound" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
      <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} unit=" MB" />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} />
      <Area type="monotone" dataKey="inbound" name="Inbound" stroke="#06b6d4" strokeWidth={2} fill="url(#gradInbound)" dot={false} />
      <Area type="monotone" dataKey="outbound" name="Outbound" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradOutbound)" dot={false} />
    </AreaChart>
  </ResponsiveContainer>
);

// ============================================================
// Service Status Pie Chart
// ============================================================
export const ServicePieChart = ({ data }) => {
  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={4}
          dataKey="value"
          labelLine={false}
          label={renderLabel}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-hover)',
            borderRadius: '8px',
            fontSize: '0.78rem',
          }}
          itemStyle={{ color: 'var(--text-secondary)' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
          formatter={(value, entry) => (
            <span style={{ color: entry.color, fontWeight: 600 }}>{value}: {entry.payload.value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

// ============================================================
// Mini sparkline (used in service details)
// ============================================================
export const SparklineChart = ({ data, dataKey, color, height = 80 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
      <defs>
        <linearGradient id={`sparkGrad${dataKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.3} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#sparkGrad${dataKey})`} dot={false} />
    </AreaChart>
  </ResponsiveContainer>
);

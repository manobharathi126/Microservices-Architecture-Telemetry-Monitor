// ============================================================
// Loading Skeleton Component
// ============================================================

/**
 * Skeleton loader for cards, tables, and various layouts
 */

// Simple box skeleton
export const SkeletonBox = ({ width = '100%', height = '20px', radius = '8px', style = {} }) => (
  <div
    className="skeleton"
    style={{ width, height, borderRadius: radius, ...style }}
  />
);

// Skeleton stat card
export const SkeletonStatCard = () => (
  <div className="stat-card primary" style={{ gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <SkeletonBox width="42px" height="42px" radius="10px" />
      <SkeletonBox width="50px" height="22px" radius="20px" />
    </div>
    <div>
      <SkeletonBox width="80px" height="28px" style={{ marginBottom: 8 }} />
      <SkeletonBox width="100px" height="14px" />
    </div>
    <SkeletonBox width="100%" height="6px" radius="20px" />
  </div>
);

// Skeleton service card
export const SkeletonServiceCard = () => (
  <div className="service-card healthy" style={{ cursor: 'default' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <div>
        <SkeletonBox width="140px" height="18px" style={{ marginBottom: 6 }} />
        <SkeletonBox width="100px" height="12px" />
      </div>
      <SkeletonBox width="70px" height="24px" radius="20px" />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
      {Array(6).fill(null).map((_, i) => (
        <div key={i}>
          <SkeletonBox width="60px" height="10px" style={{ marginBottom: 6 }} />
          <SkeletonBox width="80px" height="16px" />
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid var(--border-secondary)' }}>
      <SkeletonBox width="80px" height="12px" />
      <SkeletonBox width="90px" height="12px" />
    </div>
  </div>
);

// Skeleton table row
export const SkeletonTableRow = ({ cols = 5 }) => (
  <tr>
    {Array(cols).fill(null).map((_, i) => (
      <td key={i} style={{ padding: '12px 16px' }}>
        <SkeletonBox height="14px" width={i === 0 ? '60px' : '120px'} />
      </td>
    ))}
  </tr>
);

// Full page loading skeleton for dashboard
export const DashboardSkeleton = () => (
  <div style={{ padding: 24 }}>
    <SkeletonBox width="100%" height="120px" radius="24px" style={{ marginBottom: 24 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
      {Array(10).fill(null).map((_, i) => <SkeletonStatCard key={i} />)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
      {Array(4).fill(null).map((_, i) => (
        <SkeletonBox key={i} height="280px" radius="16px" />
      ))}
    </div>
  </div>
);

export default SkeletonBox;

// ============================================================
// StatsCard Component — Animated metric display card
// ============================================================
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * Animated statistics card for dashboard metrics
 * @param {Object} props
 * @param {React.ReactNode} props.icon - Icon component
 * @param {string} props.label - Metric label
 * @param {string|number} props.value - Display value
 * @param {string} props.unit - Optional unit suffix
 * @param {string} props.trend - 'up' | 'down' | 'neutral'
 * @param {string} props.trendValue - Trend label like '+12%'
 * @param {string} props.color - 'primary' | 'cyan' | 'green' | 'red' | 'orange' | 'purple'
 * @param {number} props.progress - Optional 0-100 progress value
 * @param {number} props.animationDelay - CSS animation delay in ms
 */
const StatsCard = ({
  icon,
  label,
  value,
  unit = '',
  trend = 'neutral',
  trendValue = '',
  color = 'primary',
  progress,
  animationDelay = 0,
}) => {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  const getProgressColor = () => {
    if (progress === undefined) return 'primary';
    if (progress > 80) return 'error';
    if (progress > 60) return 'warning';
    return color;
  };

  return (
    <div
      className={`stat-card ${color}`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="stat-card-header">
        <div className={`stat-card-icon ${color}`}>
          {icon}
        </div>
        {trendValue && (
          <div className={`stat-trend ${trend}`}>
            <TrendIcon size={11} />
            {trendValue}
          </div>
        )}
      </div>

      <div>
        <div className="stat-card-value">
          {value}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>
        </div>
        <div className="stat-card-label">{label}</div>
      </div>

      {progress !== undefined && (
        <div className="stat-card-progress">
          <div className="progress-bar">
            <div
              className={`progress-fill ${getProgressColor()}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsCard;

// ============================================================
// 404 Not Found Page
// ============================================================
import { Link } from 'react-router-dom';
import { Home, AlertCircle } from 'lucide-react';

/**
 * 404 page shown when route is not found
 */
const NotFound = () => {
  return (
    <div
      className="fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        padding: '40px 24px',
      }}
    >
      {/* Glowing icon */}
      <div
        style={{
          width: 80,
          height: 80,
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
        }}
      >
        <AlertCircle size={36} color="var(--status-error)" />
      </div>

      {/* 404 Number */}
      <div
        style={{
          fontSize: '7rem',
          fontWeight: 900,
          lineHeight: 1,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 8,
          fontFamily: 'var(--font-mono)',
        }}
      >
        404
      </div>

      <h2
        style={{
          fontSize: '1.4rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 10,
        }}
      >
        Page Not Found
      </h2>

      <p
        style={{
          fontSize: '0.9rem',
          color: 'var(--text-muted)',
          maxWidth: 400,
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        The page you're looking for doesn't exist or has been moved.
        Let's get you back to monitoring your services.
      </p>

      <Link
        to="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 24px',
          background: 'var(--gradient-primary)',
          color: 'white',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
          fontSize: '0.875rem',
          textDecoration: 'none',
          boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      >
        <Home size={16} />
        Back to Dashboard
      </Link>
    </div>
  );
};

export default NotFound;

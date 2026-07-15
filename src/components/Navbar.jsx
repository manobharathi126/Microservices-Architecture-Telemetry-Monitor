// ============================================================
// Navbar Component
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { Search, Bell, Moon, Sun, Menu, X, ChevronDown } from 'lucide-react';
import '../css/Navbar.css';

const notifications = [
  { id: 1, msg: 'Payment Service is DOWN — circuit breaker open', time: '10m ago', color: '#ef4444' },
  { id: 2, msg: 'Order Service CPU at 78% — critical threshold', time: '5m ago', color: '#f59e0b' },
  { id: 3, msg: 'Analytics Service latency exceeds SLA', time: '8m ago', color: '#f59e0b' },
  { id: 4, msg: 'Deployment completed: Auth Service v1.8.4', time: '20m ago', color: '#10b981' },
];

/**
 * Top navigation bar with search, notifications, profile, and clock
 */
const Navbar = ({ collapsed, onMobileMenuOpen }) => {
  const [time, setTime] = useState(new Date());
  const [showNotif, setShowNotif] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const notifRef = useRef(null);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Close notifications on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <nav className={`navbar ${collapsed ? 'collapsed' : ''}`}>
      {/* Left */}
      <div className="navbar-left">
        <button className="mobile-menu-btn" onClick={onMobileMenuOpen}>
          <Menu size={18} />
        </button>

        <div className="navbar-search-wrapper">
          <Search className="navbar-search-icon" size={16} />
          <input
            className="navbar-search"
            type="text"
            placeholder="Search services, traces, logs..."
          />
        </div>
      </div>

      {/* Right */}
      <div className="navbar-right">
        {/* Clock */}
        <div className="navbar-time">
          <span>{formatDate(time)} · {formatTime(time)}</span>
        </div>

        {/* Dark Mode Toggle */}
        <button
          className="dark-mode-toggle"
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="navbar-icon-btn"
            onClick={() => setShowNotif(!showNotif)}
          >
            <Bell size={16} />
            <span className="notification-badge">4</span>
          </button>

          {showNotif && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <h3>Notifications</h3>
                <button className="notifications-clear">Mark all read</button>
              </div>
              {notifications.map((n) => (
                <div key={n.id} className="notification-item">
                  <div
                    className="notification-dot"
                    style={{ backgroundColor: n.color }}
                  />
                  <div className="notification-item-text">
                    <div className="notification-item-msg">{n.msg}</div>
                    <div className="notification-item-time">{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="navbar-profile">
          <div className="profile-avatar">AK</div>
          <div className="profile-info">
            <span className="profile-name">Arjun Kumar</span>
            <span className="profile-role">SRE Engineer</span>
          </div>
          <ChevronDown size={14} color="var(--text-muted)" />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

// ============================================================
// Navbar Component
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { Search, Bell, Moon, Sun, Menu, ChevronDown, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import '../css/Navbar.css';

const notifications = [
  { id: 1, msg: 'Payment Service is DOWN — circuit breaker open', time: '10m ago', color: '#ef4444' },
  { id: 2, msg: 'Order Service CPU at 78% — critical threshold', time: '5m ago', color: '#f59e0b' },
  { id: 3, msg: 'Analytics Service latency exceeds SLA', time: '8m ago', color: '#f59e0b' },
  { id: 4, msg: 'Deployment completed: Auth Service v1.8.4', time: '20m ago', color: '#10b981' },
];

/**
 * Helper to compute user initials
 */
const getInitials = (name) => {
  if (!name) return 'AD';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

/**
 * Top navigation bar with search, notifications, dynamic profile, theme toggle, and clock
 */
const Navbar = ({ collapsed, onMobileMenuOpen }) => {
  const [time, setTime] = useState(new Date());
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  // Read authenticated user details from localStorage (or fallback to decoded token)
  const [user] = useState(() => {
    try {
      const stored = localStorage.getItem('authUser');
      if (stored) return JSON.parse(stored);
      const token = localStorage.getItem('authToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return {
          name: payload.name || 'Admin',
          email: payload.email || 'admin@example.com',
          role: payload.role || 'Administrator',
        };
      }
    } catch (e) {
      console.error('Failed to parse user profile', e);
    }
    return {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'Administrator',
    };
  });

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotif(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setShowProfile(false);
    toast.success('Logged out successfully');
    navigate('/login');
  };

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

  const initials = getInitials(user?.name);

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

        {/* Dark / Light Mode Toggle */}
        <button
          className="dark-mode-toggle"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="navbar-icon-btn"
            onClick={() => setShowNotif(!showNotif)}
            aria-label="Notifications"
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

        {/* Profile Dropdown & Logout */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <div
            className="navbar-profile"
            onClick={() => setShowProfile(!showProfile)}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            aria-haspopup="true"
            aria-expanded={showProfile}
          >
            <div className="profile-avatar">{initials}</div>
            <div className="profile-info">
              <span className="profile-name">{user?.name}</span>
              <span className="profile-role">{user?.role}</span>
            </div>
            <ChevronDown
              size={14}
              color="var(--text-muted)"
              style={{
                transform: showProfile ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            />
          </div>

          {showProfile && (
            <div className="profile-dropdown">
              <div className="profile-dropdown-header">
                <div className="profile-avatar">{initials}</div>
                <div className="profile-dropdown-details">
                  <span className="profile-dropdown-name">{user?.name}</span>
                  <span className="profile-dropdown-email">{user?.email}</span>
                  <span className="profile-dropdown-badge">{user?.role}</span>
                </div>
              </div>
              <div className="profile-dropdown-body">
                <button
                  className="profile-dropdown-item"
                  onClick={() => {
                    setShowProfile(false);
                    navigate('/settings');
                  }}
                >
                  <SettingsIcon size={15} />
                  <span>Settings</span>
                </button>
                <button
                  className="profile-dropdown-item logout"
                  onClick={handleLogout}
                >
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

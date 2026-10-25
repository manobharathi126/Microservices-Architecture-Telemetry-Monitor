// ============================================================
// Navbar Component — Connected to Real Alerts & Dynamic Badge
// ============================================================
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, Bell, Moon, Sun, Menu, ChevronDown, LogOut, Settings as SettingsIcon,
  ExternalLink, X, Loader2, Server, GitBranch, FileText, AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import { fetchAlerts, fetchAlertsSummary, markAlertRead, markAllAlertsRead, searchGlobal } from '../utils/api';
import '../css/Navbar.css';

/**
 * Helper to compute user initials
 */
const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

/**
 * Top navigation bar with search, live notifications, dynamic profile, theme toggle, and clock
 */
const Navbar = ({ collapsed, onMobileMenuOpen, onAlertsCountChange }) => {
  const [time, setTime] = useState(new Date());
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1);
  const searchWrapperRef = useRef(null);
  const latestSearchReqIdRef = useRef(0);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isClearing, setIsClearing] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  // Read authenticated user details from localStorage (or fallback to decoded token)
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('authUser');
      if (stored) return JSON.parse(stored);
      const token = localStorage.getItem('authToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return {
          name: payload.name || 'User',
          email: payload.email || '',
          role: payload.role || 'Member',
        };
      }
    } catch (e) {
      console.error('Failed to parse user profile', e);
    }
    return null;
  });

  // Keep Navbar profile synchronized with login, logout, and Settings edits
  useEffect(() => {
    const handleUserUpdate = (e) => {
      if (e && e.detail !== undefined) {
        setUser(e.detail);
      } else {
        try {
          const stored = localStorage.getItem('authUser');
          if (stored) {
            setUser(JSON.parse(stored));
          } else {
            const token = localStorage.getItem('authToken');
            if (token) {
              const payload = JSON.parse(atob(token.split('.')[1]));
              setUser({
                name: payload.name || 'User',
                email: payload.email || '',
                role: payload.role || 'Member',
              });
            } else {
              setUser(null);
            }
          }
        } catch {
          setUser(null);
        }
      }
    };
    window.addEventListener('auth_user_updated', handleUserUpdate);
    return () => window.removeEventListener('auth_user_updated', handleUserUpdate);
  }, []);

  // Load real alerts and summary statistics, respecting notification preferences
  const loadAlerts = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([
        fetchAlerts({ limit: 10 }),
        fetchAlertsSummary(),
      ]);

      let prefs = { inAppAlerts: true, criticalOnly: false };
      try {
        const storedPrefs = localStorage.getItem('telemetry_notification_prefs');
        if (storedPrefs) prefs = { ...prefs, ...JSON.parse(storedPrefs) };
      } catch {}

      if (!prefs.inAppAlerts) {
        setAlerts([]);
        setUnreadCount(0);
        return;
      }

      let displayedList = list || [];
      if (prefs.criticalOnly) {
        displayedList = displayedList.filter((a) => a.severity === 'Critical');
      }

      setAlerts(displayedList);
      const unread = prefs.criticalOnly
        ? displayedList.filter((a) => !a.isRead).length
        : (sum?.unread ?? displayedList.filter((a) => !a.isRead).length);
      const active = sum?.active ?? (list ? list.filter((a) => a.status === 'Active').length : 0);
      setUnreadCount(unread);
      onAlertsCountChange?.(active);
    } catch {
      // Collector might be starting up; ignore network warning
    }
  }, [onAlertsCountChange]);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 6000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  // Synchronize immediately on cross-component alert and preference events
  useEffect(() => {
    const handleUpdate = () => loadAlerts();
    window.addEventListener('alert_updated', handleUpdate);
    window.addEventListener('notification_prefs_updated', handleUpdate);
    return () => {
      window.removeEventListener('alert_updated', handleUpdate);
      window.removeEventListener('notification_prefs_updated', handleUpdate);
    };
  }, [loadAlerts]);

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
    setUser(null);
    window.dispatchEvent(new CustomEvent('auth_user_updated', { detail: null }));
    setShowProfile(false);
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) {
      toast.success('No unread notifications');
      return;
    }

    setIsClearing(true);
    try {
      await markAllAlertsRead();
      setAlerts(prev => prev.map(a => ({ ...a, isRead: true })));
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('alert_updated'));
      toast.success('All notifications marked as read');
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
      toast.error('Failed to mark notifications as read');
    } finally {
      setIsClearing(false);
    }
  };

  const handleNotificationClick = async (n) => {
    setShowNotif(false);
    if (!n.isRead) {
      try {
        await markAlertRead(n.id);
        setAlerts(prev => prev.map(a => a.id === n.id ? { ...a, isRead: true } : a));
        setUnreadCount(prev => Math.max(0, prev - 1));
        window.dispatchEvent(new CustomEvent('alert_updated'));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    navigate('/alerts');
  };

  // Debounced search across services, traces, and logs
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      setIsSearching(false);
      setSearchError(null);
      setShowSearchDropdown(false);
      setSelectedSearchIndex(-1);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setShowSearchDropdown(true);

    const reqId = ++latestSearchReqIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await searchGlobal(trimmed);
        if (reqId === latestSearchReqIdRef.current) {
          setSearchResults(data);
          setSelectedSearchIndex(-1);
          setIsSearching(false);
        }
      } catch (err) {
        if (reqId === latestSearchReqIdRef.current) {
          console.error('[Navbar Search] Query error:', err);
          setSearchError(err.message || 'Search request failed.');
          setIsSearching(false);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Flattened results for keyboard navigation
  const flatResults = useMemo(() => {
    if (!searchResults) return [];
    const items = [];
    (searchResults.services || []).forEach((s) =>
      items.push({ type: 'service', data: s, key: `s-${s.id}` })
    );
    (searchResults.traces || []).forEach((t) =>
      items.push({ type: 'trace', data: t, key: `t-${t.id}` })
    );
    (searchResults.logs || []).forEach((l) =>
      items.push({ type: 'log', data: l, key: `l-${l.id}` })
    );
    return items;
  }, [searchResults]);

  const handleSelectResult = (item) => {
    setShowSearchDropdown(false);
    if (item.type === 'service') {
      navigate(`/services/${item.data.id}`);
    } else if (item.type === 'trace') {
      navigate(`/tracing?search=${encodeURIComponent(item.data.id)}`);
    } else if (item.type === 'log') {
      navigate(`/logs?search=${encodeURIComponent(item.data.message || item.data.service)}`);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setShowSearchDropdown(false);
    setSelectedSearchIndex(-1);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowSearchDropdown(false);
      setSelectedSearchIndex(-1);
      return;
    }

    if (showSearchDropdown && flatResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSearchIndex((prev) => (prev + 1) % flatResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSearchIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedSearchIndex >= 0 && selectedSearchIndex < flatResults.length) {
          handleSelectResult(flatResults[selectedSearchIndex]);
          return;
        }
        if (searchQuery.trim()) {
          setShowSearchDropdown(false);
          navigate(`/services?search=${encodeURIComponent(searchQuery.trim())}`);
        }
        return;
      }
    }

    if (e.key === 'Enter' && searchQuery.trim()) {
      setShowSearchDropdown(false);
      navigate(`/services?search=${encodeURIComponent(searchQuery.trim())}`);
    }
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

  const getSeverityColor = (severity) => {
    if (severity === 'Critical') return 'var(--status-error)';
    if (severity === 'Warning') return 'var(--status-warning)';
    return 'var(--status-healthy)';
  };

  const initials = getInitials(user?.name);

  return (
    <nav className={`navbar ${collapsed ? 'collapsed' : ''}`}>
      {/* Left */}
      <div className="navbar-left">
        <button className="mobile-menu-btn" onClick={onMobileMenuOpen}>
          <Menu size={18} />
        </button>

        <div className="navbar-search-wrapper" ref={searchWrapperRef}>
          <Search className="navbar-search-icon" size={16} />
          <input
            className="navbar-search"
            type="text"
            placeholder="Search services, traces, logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchQuery.trim()) setShowSearchDropdown(true);
            }}
            onKeyDown={handleSearchKeyDown}
            aria-label="Global search services, traces, logs"
            aria-autocomplete="list"
            aria-expanded={showSearchDropdown}
          />
          {isSearching && (
            <Loader2 className="navbar-search-spinner" size={15} />
          )}
          {!isSearching && searchQuery && (
            <button
              className="navbar-search-clear"
              onClick={handleClearSearch}
              type="button"
              aria-label="Clear search query"
            >
              <X size={14} />
            </button>
          )}

          {/* Interactive Search Results Dropdown */}
          {showSearchDropdown && (
            <div className="navbar-search-dropdown" role="listbox">
              {isSearching && !searchResults && (
                <div className="search-status-message">
                  <Loader2 size={16} className="search-spinner-inline" />
                  Searching services, traces, and logs...
                </div>
              )}

              {searchError && (
                <div className="search-error-state">
                  <AlertCircle size={18} style={{ color: 'var(--status-error)', margin: '0 auto 6px', display: 'block' }} />
                  <div>{searchError}</div>
                </div>
              )}

              {!isSearching && !searchError && flatResults.length === 0 && (
                <div className="search-empty-state">
                  <Search size={20} style={{ margin: '0 auto 6px', opacity: 0.4, display: 'block' }} />
                  <div>No matching services, traces, or logs found for "{searchQuery}"</div>
                </div>
              )}

              {/* Matching Services */}
              {searchResults?.services?.length > 0 && (
                <div className="search-group">
                  <div className="search-group-title">
                    <Server size={12} /> Services ({searchResults.services.length})
                  </div>
                  {searchResults.services.map((s) => {
                    const itemIndex = flatResults.findIndex((r) => r.key === `s-${s.id}`);
                    const isSelected = selectedSearchIndex === itemIndex;
                    return (
                      <div
                        key={`s-${s.id}`}
                        className={`search-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectResult({ type: 'service', data: s })}
                        onMouseEnter={() => setSelectedSearchIndex(itemIndex)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div className="search-item-primary">
                          <div className={`status-dot ${s.status?.toLowerCase() || 'unknown'}`} />
                          <div className="search-item-info">
                            <div className="search-item-title">{s.name}</div>
                            <div className="search-item-sub">{s.url}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {s.latency != null && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {s.latency}ms
                            </span>
                          )}
                          <span className={`badge badge-${s.status?.toLowerCase() || 'unknown'}`} style={{ fontSize: '0.65rem' }}>
                            {s.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Matching Traces */}
              {searchResults?.traces?.length > 0 && (
                <div className="search-group">
                  <div className="search-group-title">
                    <GitBranch size={12} /> Distributed Traces ({searchResults.traces.length})
                  </div>
                  {searchResults.traces.map((t) => {
                    const itemIndex = flatResults.findIndex((r) => r.key === `t-${t.id}`);
                    const isSelected = selectedSearchIndex === itemIndex;
                    return (
                      <div
                        key={`t-${t.id}`}
                        className={`search-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectResult({ type: 'trace', data: t })}
                        onMouseEnter={() => setSelectedSearchIndex(itemIndex)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div className="search-item-primary">
                          <GitBranch size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                          <div className="search-item-info">
                            <div className="search-item-title" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                              {t.id}
                            </div>
                            <div className="search-item-sub">{t.name}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {t.duration}ms
                          </span>
                          <span className={`badge badge-${t.status === 'Error' ? 'error' : t.status === 'Slow' ? 'warning' : 'healthy'}`} style={{ fontSize: '0.65rem' }}>
                            {t.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Matching Logs */}
              {searchResults?.logs?.length > 0 && (
                <div className="search-group">
                  <div className="search-group-title">
                    <FileText size={12} /> Event Logs ({searchResults.logs.length})
                  </div>
                  {searchResults.logs.map((l) => {
                    const itemIndex = flatResults.findIndex((r) => r.key === `l-${l.id}`);
                    const isSelected = selectedSearchIndex === itemIndex;
                    return (
                      <div
                        key={`l-${l.id}`}
                        className={`search-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectResult({ type: 'log', data: l })}
                        onMouseEnter={() => setSelectedSearchIndex(itemIndex)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <div className="search-item-primary">
                          <span className={`log-level ${l.level}`} style={{ fontSize: '0.65rem', padding: '2px 5px' }}>
                            {l.level}
                          </span>
                          <div className="search-item-info">
                            <div className="search-item-title" style={{ fontSize: '0.8rem' }}>
                              {l.service}
                            </div>
                            <div className="search-item-sub">{l.message}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                          {l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {flatResults.length > 0 && (
                <div className="search-dropdown-footer">
                  <span>Press <kbd>↑</kbd><kbd>↓</kbd> to navigate · <kbd>↵</kbd> to select</span>
                  <span><kbd>Esc</kbd> to close</span>
                </div>
              )}
            </div>
          )}
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
            title="System Alert Notifications"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {showNotif && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <h3>System Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    className="notifications-clear"
                    onClick={handleMarkAllRead}
                    disabled={isClearing}
                  >
                    {isClearing ? 'Marking...' : 'Mark all read'}
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                {alerts.length === 0 ? (
                  <div style={{
                    padding: '28px 20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                  }}>
                    No active alert notifications. All monitored services are healthy.
                  </div>
                ) : (
                  alerts.map((n) => (
                    <div
                      key={n.id}
                      className={`notification-item ${n.isRead ? 'read' : 'unread'}`}
                      onClick={() => handleNotificationClick(n)}
                      title="Click to view alert details and mark read"
                    >
                      <div
                        className="notification-dot"
                        style={{ backgroundColor: getSeverityColor(n.severity) }}
                      />
                      <div className="notification-item-text">
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 2,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {!n.isRead && (
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  backgroundColor: 'var(--accent-primary)',
                                  display: 'inline-block',
                                }}
                                title="Unread notification"
                              />
                            )}
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                              {n.service}
                            </span>
                          </div>
                          <span style={{
                            fontSize: '0.68rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: n.status === 'Active' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                            color: n.status === 'Active' ? 'var(--status-error)' : 'var(--status-healthy)',
                            fontWeight: 600,
                          }}>
                            {n.status}
                          </span>
                        </div>
                        <div className="notification-item-msg">{n.message}</div>
                        <div className="notification-item-time">{n.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{
                padding: '10px 16px',
                borderTop: '1px solid var(--border-secondary)',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                justifyContent: 'center',
              }}>
                <button
                  onClick={() => {
                    setShowNotif(false);
                    navigate('/alerts');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>View all incidents & alert rules</span>
                  <ExternalLink size={12} />
                </button>
              </div>
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
              <span className="profile-name">{user?.name || user?.email || 'User'}</span>
              <span className="profile-role">{user?.role || 'Member'}</span>
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
                  <span className="profile-dropdown-name">{user?.name || 'User'}</span>
                  <span className="profile-dropdown-email">{user?.email || 'No email'}</span>
                  <span className="profile-dropdown-badge">{user?.role || 'Member'}</span>
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

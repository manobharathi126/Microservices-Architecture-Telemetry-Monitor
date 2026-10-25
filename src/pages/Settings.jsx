// ============================================================
// Settings Page — Operational & User Configuration
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import {
  User, Palette, Bell, Activity, Info, Check, RotateCcw,
  Shield, Server
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import { fetchCollectorConfig, updateCollectorConfig, fetchCollectorStatus } from '../utils/api';
import '../css/Pages.css';

const settingsSections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'monitoring', label: 'Monitoring & Alerts', icon: Activity },
  { id: 'about', label: 'About', icon: Info },
];

const themeColors = [
  { color: '#6366f1', name: 'Indigo' },
  { color: '#8b5cf6', name: 'Purple' },
  { color: '#06b6d4', name: 'Cyan' },
  { color: '#10b981', name: 'Emerald' },
  { color: '#ec4899', name: 'Pink' },
  { color: '#f59e0b', name: 'Amber' },
];

const DEFAULT_PROFILE = {
  name: 'Admin',
  email: 'admin@example.com',
  role: 'Administrator',
  team: 'Platform Engineering',
};

const DEFAULT_NOTIFICATIONS = {
  inAppAlerts: true,
  criticalOnly: false,
  sound: false,
  desktop: false,
};

const DEFAULT_MONITORING = {
  slowTraceThresholdMs: 800,
  consecutiveDegradedThreshold: 2,
  consecutiveHealthyRecovery: 2,
  fetchTimeoutMs: 5000,
};

const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
};

const Settings = () => {
  const [activeSection, setActiveSection] = useState('profile');

  // --- Profile State & Validation ---
  const [profile, setProfile] = useState(() => {
    try {
      const raw = localStorage.getItem('authUser');
      if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
      const token = localStorage.getItem('authToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return {
          ...DEFAULT_PROFILE,
          name: payload.name || DEFAULT_PROFILE.name,
          email: payload.email || DEFAULT_PROFILE.email,
          role: payload.role || DEFAULT_PROFILE.role,
        };
      }
    } catch {
      // JSON parse fallback
    }
    return DEFAULT_PROFILE;
  });
  const [profileErrors, setProfileErrors] = useState({});

  // --- Appearance State ---
  const {
    isDark,
    toggleTheme,
    accentColor,
    setAccentColor,
    compactMode,
    setCompactMode,
    animations,
    setAnimations,
    resetAppearance,
  } = useTheme();

  // --- Notification Preferences ---
  const [notifications, setNotifications] = useState(() => {
    try {
      const stored = localStorage.getItem('telemetry_notification_prefs');
      if (stored) return { ...DEFAULT_NOTIFICATIONS, ...JSON.parse(stored) };
    } catch {
      // JSON parse fallback
    }
    return DEFAULT_NOTIFICATIONS;
  });

  // --- Monitoring Configuration ---
  const [monitoringConfig, setMonitoringConfig] = useState(DEFAULT_MONITORING);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [monitoringSaving, setMonitoringSaving] = useState(false);
  const [collectorStatus, setCollectorStatus] = useState(null);
  const [monitoringErrors, setMonitoringErrors] = useState({});

  // Load collector config and health status on mount
  const loadMonitoringData = useCallback(async () => {
    setMonitoringLoading(true);
    try {
      const [configData, statusData] = await Promise.allSettled([
        fetchCollectorConfig(),
        fetchCollectorStatus(),
      ]);
      if (configData.status === 'fulfilled' && configData.value) {
        setMonitoringConfig({
          slowTraceThresholdMs: configData.value.slowTraceThresholdMs ?? 800,
          consecutiveDegradedThreshold: configData.value.consecutiveDegradedThreshold ?? 2,
          consecutiveHealthyRecovery: configData.value.consecutiveHealthyRecovery ?? 2,
          fetchTimeoutMs: configData.value.fetchTimeoutMs ?? 5000,
        });
      }
      if (statusData.status === 'fulfilled' && statusData.value) {
        setCollectorStatus(statusData.value);
      }
    } catch {
      // Silent error during startup
    } finally {
      setMonitoringLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'monitoring' || activeSection === 'about') {
      loadMonitoringData();
    }
  }, [activeSection, loadMonitoringData]);

const getAuthApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_AUTH_API_URL || import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
};

  // --- Profile Actions ---
  const handleSaveProfile = () => {
    const errors = {};
    if (!profile.name || profile.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!profile.email || !emailRegex.test(profile.email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      toast.error('Please correct the validation errors in your profile.');
      return;
    }

    setProfileErrors({});
    const updated = {
      name: profile.name.trim(),
      email: profile.email.trim().toLowerCase(),
      role: profile.role,
      team: profile.team?.trim() || 'Platform Engineering',
    };

    localStorage.setItem('authUser', JSON.stringify(updated));
    localStorage.setItem(`user_profile_${updated.email}`, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('auth_user_updated', { detail: updated }));

    // Persist to authentication backend
    const token = localStorage.getItem('authToken');
    if (token) {
      const apiBase = getAuthApiBaseUrl();
      fetch(`${apiBase}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: updated.name, role: updated.role }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.token) {
            localStorage.setItem('authToken', data.token);
          }
        })
        .catch(() => {
          // Backend offline fallback handled via local persistence
        });
    }

    toast.success('Profile updated successfully!', {
      style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-hover)' },
    });
  };

  const handleResetProfile = () => {
    try {
      const stored = localStorage.getItem('authUser');
      if (stored) {
        setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(stored) });
      } else {
        setProfile(DEFAULT_PROFILE);
      }
    } catch {
      setProfile(DEFAULT_PROFILE);
    }
    setProfileErrors({});
    toast('Profile reset to saved values', { icon: '🔄' });
  };

  // --- Notifications Actions ---
  const handleSaveNotifications = () => {
    localStorage.setItem('telemetry_notification_prefs', JSON.stringify(notifications));
    window.dispatchEvent(new CustomEvent('notification_prefs_updated', { detail: notifications }));
    toast.success('Notification preferences saved!', {
      style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-hover)' },
    });
  };

  const handleResetNotifications = () => {
    setNotifications(DEFAULT_NOTIFICATIONS);
    localStorage.setItem('telemetry_notification_prefs', JSON.stringify(DEFAULT_NOTIFICATIONS));
    window.dispatchEvent(new CustomEvent('notification_prefs_updated', { detail: DEFAULT_NOTIFICATIONS }));
    toast('Notification preferences reset to defaults', { icon: '🔄' });
  };

  const handleDesktopToggle = (enabled) => {
    if (enabled && 'Notification' in window) {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          setNotifications((prev) => ({ ...prev, desktop: true }));
          toast.success('Browser notification permission granted');
        } else {
          setNotifications((prev) => ({ ...prev, desktop: false }));
          toast.error('Browser notification permission was denied or blocked.');
        }
      });
    } else {
      setNotifications((prev) => ({ ...prev, desktop: enabled }));
    }
  };

  // --- Monitoring Config Actions ---
  const handleSaveMonitoring = async () => {
    const errors = {};
    const lat = Number(monitoringConfig.slowTraceThresholdMs);
    if (isNaN(lat) || lat < 100 || lat > 10000) {
      errors.slowTraceThresholdMs = 'Threshold must be between 100ms and 10,000ms.';
    }

    const deg = Number(monitoringConfig.consecutiveDegradedThreshold);
    if (isNaN(deg) || deg < 1 || deg > 10) {
      errors.consecutiveDegradedThreshold = 'Cycles must be an integer between 1 and 10.';
    }

    const rec = Number(monitoringConfig.consecutiveHealthyRecovery);
    if (isNaN(rec) || rec < 1 || rec > 10) {
      errors.consecutiveHealthyRecovery = 'Cycles must be an integer between 1 and 10.';
    }

    const timeout = Number(monitoringConfig.fetchTimeoutMs);
    if (isNaN(timeout) || timeout < 1000 || timeout > 30000) {
      errors.fetchTimeoutMs = 'Timeout must be between 1,000ms and 30,000ms.';
    }

    if (Object.keys(errors).length > 0) {
      setMonitoringErrors(errors);
      toast.error('Please resolve validation errors in threshold values.');
      return;
    }

    setMonitoringErrors({});
    setMonitoringSaving(true);
    try {
      const payload = {
        slowTraceThresholdMs: Math.round(lat),
        consecutiveDegradedThreshold: Math.floor(deg),
        consecutiveHealthyRecovery: Math.floor(rec),
        fetchTimeoutMs: Math.round(timeout),
      };
      const res = await updateCollectorConfig(payload);
      if (res && res.ok) {
        setMonitoringConfig(res.config);
        toast.success('Collector monitoring thresholds updated successfully!');
      } else {
        throw new Error(res?.error || 'Failed to update configuration.');
      }
    } catch (err) {
      toast.error(err.message || 'Unable to update collector configuration.');
    } finally {
      setMonitoringSaving(false);
    }
  };

  const handleResetMonitoring = async () => {
    setMonitoringSaving(true);
    try {
      const res = await updateCollectorConfig(DEFAULT_MONITORING);
      if (res && res.ok) {
        setMonitoringConfig(res.config);
        setMonitoringErrors({});
        toast('Monitoring thresholds reset to system defaults', { icon: '🔄' });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to reset configuration.');
    } finally {
      setMonitoringSaving(false);
    }
  };

  // --- Panels Renderers ---
  const renderPanel = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div>
            <div className="settings-panel-title">Profile Information</div>
            <div className="settings-panel-subtitle">Manage your operator account details and workspace identity</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div className="profile-big-avatar">{getInitials(profile.name)}</div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{profile.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{profile.email}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Shield size={12} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-primary)' }}>{profile.role}</span>
                </div>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Full Name</div>
                <div className="settings-row-desc">Used on dashboard header, traces, and operator signatures</div>
              </div>
              <div>
                <input
                  className="settings-input"
                  style={{ borderColor: profileErrors.name ? 'var(--status-error)' : undefined }}
                  value={profile.name}
                  onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                />
                {profileErrors.name && (
                  <div style={{ color: 'var(--status-error)', fontSize: '0.72rem', marginTop: 4 }}>{profileErrors.name}</div>
                )}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Email Address</div>
                <div className="settings-row-desc">Operational contact for security notices and audit logs</div>
              </div>
              <div>
                <input
                  type="email"
                  className="settings-input"
                  style={{ borderColor: profileErrors.email ? 'var(--status-error)' : undefined }}
                  value={profile.email}
                  onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                />
                {profileErrors.email && (
                  <div style={{ color: 'var(--status-error)', fontSize: '0.72rem', marginTop: 4 }}>{profileErrors.email}</div>
                )}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Assigned Role</div>
                <div className="settings-row-desc">Managed by identity authentication service; read-only for security</div>
              </div>
              <input
                className="settings-input"
                value={profile.role}
                readOnly
                disabled
                style={{ opacity: 0.7, cursor: 'not-allowed', background: 'var(--bg-card)' }}
              />
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Team / Organization</div>
                <div className="settings-row-desc">Department responsible for monitored microservices</div>
              </div>
              <input
                className="settings-input"
                value={profile.team || ''}
                onChange={(e) => setProfile((prev) => ({ ...prev, team: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="save-btn" onClick={handleSaveProfile}>
                <Check size={14} />
                <span>Save Profile</span>
              </button>
              <button className="reset-btn" onClick={handleResetProfile}>
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div>
            <div className="settings-panel-title">Appearance & Theme</div>
            <div className="settings-panel-subtitle">Customize application color scheme, density, and animation behavior</div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Dark Theme</div>
                <div className="settings-row-desc">Switch between high-contrast Dark mode and clean Light mode</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={isDark} onChange={toggleTheme} />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row" style={{ alignItems: 'flex-start' }}>
              <div className="settings-row-info">
                <div className="settings-row-label">Brand Accent Color</div>
                <div className="settings-row-desc">Applies instantly across buttons, charts, badges, and focus rings</div>
              </div>
              <div className="theme-options">
                {themeColors.map((t) => (
                  <div
                    key={t.color}
                    className={`theme-option ${accentColor === t.color ? 'selected' : ''}`}
                    style={{ background: t.color }}
                    onClick={() => {
                      setAccentColor(t.color);
                      toast.success(`Theme accent set to ${t.name}`);
                    }}
                    title={t.name}
                  />
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Compact Density</div>
                <div className="settings-row-desc">Reduce card margins and spacing for higher data density on large displays</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={compactMode}
                  onChange={(e) => setCompactMode(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Interface Animations</div>
                <div className="settings-row-desc">Enable smooth page transitions, hover states, and chart animations</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={animations}
                  onChange={(e) => setAnimations(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="reset-btn" onClick={resetAppearance}>
                <RotateCcw size={14} />
                <span>Reset to Defaults</span>
              </button>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div>
            <div className="settings-panel-title">Notification Preferences</div>
            <div className="settings-panel-subtitle">Configure in-app alert banners, audio cues, and browser notifications</div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">In-App Alert Banners & Dropdown</div>
                <div className="settings-row-desc">Show notification badge and dropdown feed in the top navigation bar</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notifications.inAppAlerts}
                  onChange={(e) => setNotifications((prev) => ({ ...prev, inAppAlerts: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Critical Outages Only</div>
                <div className="settings-row-desc">Filter notification bell badge to Critical service failures only (suppresses minor latency warnings)</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notifications.criticalOnly}
                  onChange={(e) => setNotifications((prev) => ({ ...prev, criticalOnly: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Audio Alert Chime</div>
                <div className="settings-row-desc">Play an audible cue when a critical outage is broadcast over WebSocket</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notifications.sound}
                  onChange={(e) => setNotifications((prev) => ({ ...prev, sound: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Browser Push Notifications</div>
                <div className="settings-row-desc">Trigger standard desktop notification banners when the browser tab is in the background</div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notifications.desktop}
                  onChange={(e) => handleDesktopToggle(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div style={{
              padding: '14px 18px',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              borderRadius: 'var(--radius-md)',
              margin: '20px 0',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}>
              <strong>Operational Note:</strong> External email/Slack relay requires enterprise webhook configuration. In this environment, notifications are delivered through real-time WebSockets and browser notifications without simulated data.
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="save-btn" onClick={handleSaveNotifications}>
                <Check size={14} />
                <span>Save Preferences</span>
              </button>
              <button className="reset-btn" onClick={handleResetNotifications}>
                <RotateCcw size={14} />
                <span>Reset Defaults</span>
              </button>
            </div>
          </div>
        );

      case 'monitoring':
        return (
          <div>
            <div className="settings-panel-title">Monitoring & Alert Thresholds</div>
            <div className="settings-panel-subtitle">Tune live collector health probe criteria, anti-flapping filters, and recovery triggers</div>

            {collectorStatus && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 20,
                border: '1px solid var(--border-secondary)',
              }}>
                <Server size={16} style={{ color: 'var(--accent-primary)' }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Storage Engine: <strong style={{ color: 'var(--text-primary)' }}>
                    {collectorStatus.database?.useMemoryStore ? 'In-Memory Fallback' : 'MySQL Persistent Storage'}
                  </strong>
                  {' · '}Target Host: <code style={{ color: 'var(--accent-cyan)' }}>{collectorStatus.database?.host}:{collectorStatus.database?.port}</code>
                </div>
              </div>
            )}

            {monitoringLoading ? (
              <div style={{ padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Fetching active collector thresholds...
              </div>
            ) : (
              <>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-label">Slow Response Threshold (ms)</div>
                    <div className="settings-row-desc">Latency above this value classifies a service probe as degraded / high-latency warning</div>
                  </div>
                  <div>
                    <input
                      type="number"
                      className="settings-input"
                      style={{ borderColor: monitoringErrors.slowTraceThresholdMs ? 'var(--status-error)' : undefined }}
                      value={monitoringConfig.slowTraceThresholdMs}
                      onChange={(e) => setMonitoringConfig((prev) => ({ ...prev, slowTraceThresholdMs: e.target.value }))}
                      min="100"
                      max="10000"
                      step="50"
                    />
                    {monitoringErrors.slowTraceThresholdMs && (
                      <div style={{ color: 'var(--status-error)', fontSize: '0.72rem', marginTop: 4 }}>
                        {monitoringErrors.slowTraceThresholdMs}
                      </div>
                    )}
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-label">Anti-Flapping Sensitivity (Cycles)</div>
                    <div className="settings-row-desc">Number of consecutive degraded probe failures required before spawning a persistent alert (prevents jitter)</div>
                  </div>
                  <div>
                    <input
                      type="number"
                      className="settings-input"
                      style={{ borderColor: monitoringErrors.consecutiveDegradedThreshold ? 'var(--status-error)' : undefined }}
                      value={monitoringConfig.consecutiveDegradedThreshold}
                      onChange={(e) => setMonitoringConfig((prev) => ({ ...prev, consecutiveDegradedThreshold: e.target.value }))}
                      min="1"
                      max="10"
                    />
                    {monitoringErrors.consecutiveDegradedThreshold && (
                      <div style={{ color: 'var(--status-error)', fontSize: '0.72rem', marginTop: 4 }}>
                        {monitoringErrors.consecutiveDegradedThreshold}
                      </div>
                    )}
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-label">Recovery Confirmation (Cycles)</div>
                    <div className="settings-row-desc">Consecutive healthy checks required before an active incident is automatically transitioned to Resolved</div>
                  </div>
                  <div>
                    <input
                      type="number"
                      className="settings-input"
                      style={{ borderColor: monitoringErrors.consecutiveHealthyRecovery ? 'var(--status-error)' : undefined }}
                      value={monitoringConfig.consecutiveHealthyRecovery}
                      onChange={(e) => setMonitoringConfig((prev) => ({ ...prev, consecutiveHealthyRecovery: e.target.value }))}
                      min="1"
                      max="10"
                    />
                    {monitoringErrors.consecutiveHealthyRecovery && (
                      <div style={{ color: 'var(--status-error)', fontSize: '0.72rem', marginTop: 4 }}>
                        {monitoringErrors.consecutiveHealthyRecovery}
                      </div>
                    )}
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-label">Health Probe Timeout (ms)</div>
                    <div className="settings-row-desc">Abort probe request if remote microservice fails to respond within this time window</div>
                  </div>
                  <div>
                    <input
                      type="number"
                      className="settings-input"
                      style={{ borderColor: monitoringErrors.fetchTimeoutMs ? 'var(--status-error)' : undefined }}
                      value={monitoringConfig.fetchTimeoutMs}
                      onChange={(e) => setMonitoringConfig((prev) => ({ ...prev, fetchTimeoutMs: e.target.value }))}
                      min="1000"
                      max="30000"
                      step="500"
                    />
                    {monitoringErrors.fetchTimeoutMs && (
                      <div style={{ color: 'var(--status-error)', fontSize: '0.72rem', marginTop: 4 }}>
                        {monitoringErrors.fetchTimeoutMs}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="save-btn" onClick={handleSaveMonitoring} disabled={monitoringSaving}>
                    <Check size={14} />
                    <span>{monitoringSaving ? 'Saving...' : 'Save Configuration'}</span>
                  </button>
                  <button className="reset-btn" onClick={handleResetMonitoring} disabled={monitoringSaving}>
                    <RotateCcw size={14} />
                    <span>Reset Defaults</span>
                  </button>
                </div>
              </>
            )}
          </div>
        );

      case 'about':
        return (
          <div>
            <div className="settings-panel-title">About TelemetryOps</div>
            <div className="settings-panel-subtitle">Platform architecture, runtime versions, and system metadata</div>

            <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', marginBottom: 20 }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>
                TelemetryOps Monitor
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Real-Time Microservices Telemetry, Distributed Tracing & Predictive Observability Platform
              </div>
            </div>

            {[
              { label: 'Platform Version', value: 'v2.5.0' },
              { label: 'Active Database Mode', value: collectorStatus?.database?.useMemoryStore ? 'In-Memory Fallback Engine' : 'MySQL Persistent Storage' },
              { label: 'Collector Port', value: '6001 (WebSocket / HTTP)' },
              { label: 'Authentication Architecture', value: 'Stateless JWT / bcrypt Token Verification' },
              { label: 'Frontend Framework', value: 'React 18 + Vite 8' },
              { label: 'Runtime Environment', value: 'Node.js 20+' },
            ].map((item, i) => (
              <div key={i} className="settings-row">
                <div className="settings-row-label" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600 }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-subtitle">Configure your personal profile, appearance, alert rules, and telemetry thresholds</p>
        </div>
      </div>

      <div className="settings-layout">
        {/* Settings Navigation Sidebar */}
        <div className="settings-sidebar">
          {settingsSections.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className={`settings-nav-item ${activeSection === id ? 'active' : ''}`}
              onClick={() => setActiveSection(id)}
              role="button"
              tabIndex={0}
              aria-label={label}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveSection(id);
                }
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Settings Display Panel */}
        <div className="settings-panel">
          {renderPanel()}
        </div>
      </div>
    </div>
  );
};

export default Settings;

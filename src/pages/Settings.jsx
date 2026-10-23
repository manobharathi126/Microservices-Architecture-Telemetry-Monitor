// ============================================================
// Settings Page
// ============================================================
import { useState } from 'react';
import {
  User, Palette, RefreshCw, Bell, Mail, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import '../css/Pages.css';

const settingsSections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'refresh', label: 'Refresh Interval', icon: RefreshCw },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'alerts', label: 'Email Alerts', icon: Mail },
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

/**
 * Settings page with profile, appearance, and notification options
 */
const Settings = () => {
  const [activeSection, setActiveSection] = useState('profile');
  const [selectedTheme, setSelectedTheme] = useState('#6366f1');
  const [refreshInterval, setRefreshInterval] = useState('30');
  const [notifications, setNotifications] = useState({
    desktop: true,
    sound: false,
    email: true,
    criticalOnly: false,
  });
  const { isDark, toggleTheme } = useTheme();
  const [profile, setProfile] = useState(() => {
    try {
      const raw = localStorage.getItem('authUser');
      if (raw) {
        const u = JSON.parse(raw);
        return {
          name: u.name || 'Admin',
          email: u.email || 'admin@example.com',
          role: u.role || 'Administrator',
          team: 'Platform Engineering',
        };
      }
      const token = localStorage.getItem('authToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return {
          name: payload.name || 'Admin',
          email: payload.email || 'admin@example.com',
          role: payload.role || 'Administrator',
          team: 'Platform Engineering',
        };
      }
    } catch (e) {}
    return {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'Administrator',
      team: 'Platform Engineering',
    };
  });

  const getInitials = (name) => {
    if (!name) return 'AD';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  };

  const handleSave = () => {
    try {
      localStorage.setItem('authUser', JSON.stringify({
        name: profile.name,
        email: profile.email,
        role: profile.role,
      }));
    } catch (e) {}
    toast.success('Settings saved successfully!', {
      style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-hover)' }
    });
  };

  const renderPanel = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div>
            <div className="settings-panel-title">Profile Information</div>
            <div className="settings-panel-subtitle">Update your personal account details</div>

            <div className="profile-big-avatar">{getInitials(profile.name)}</div>

            {Object.entries(profile).map(([key, val]) => (
              <div key={key} className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-label">{key.charAt(0).toUpperCase() + key.slice(1)}</div>
                </div>
                <input
                  className="settings-input"
                  value={val}
                  onChange={e => setProfile(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}

            <button className="save-btn" onClick={handleSave}>Save Changes</button>
          </div>
        );

      case 'appearance':
        return (
          <div>
            <div className="settings-panel-title">Appearance</div>
            <div className="settings-panel-subtitle">Customize the look and feel of the dashboard</div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Dark Mode</div>
                <div className="settings-row-desc">Enable dark theme for the interface</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={isDark} onChange={toggleTheme} />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row" style={{ alignItems: 'flex-start' }}>
              <div className="settings-row-info">
                <div className="settings-row-label">Accent Color</div>
                <div className="settings-row-desc">Choose the primary accent color</div>
              </div>
              <div className="theme-options">
                {themeColors.map((t) => (
                  <div
                    key={t.color}
                    className={`theme-option ${selectedTheme === t.color ? 'selected' : ''}`}
                    style={{ background: t.color }}
                    onClick={() => setSelectedTheme(t.color)}
                    title={t.name}
                  />
                ))}
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Compact Mode</div>
                <div className="settings-row-desc">Reduce card padding and spacing</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Animations</div>
                <div className="settings-row-desc">Enable smooth card and page transitions</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked />
                <span className="toggle-slider" />
              </label>
            </div>

            <button className="save-btn" onClick={handleSave}>Apply Changes</button>
          </div>
        );

      case 'refresh':
        return (
          <div>
            <div className="settings-panel-title">Refresh Interval</div>
            <div className="settings-panel-subtitle">Configure how often the dashboard auto-refreshes data</div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Auto Refresh</div>
                <div className="settings-row-desc">Automatically fetch new data at set intervals</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Refresh Interval</div>
                <div className="settings-row-desc">Set the interval in seconds</div>
              </div>
              <select
                className="settings-input"
                value={refreshInterval}
                onChange={e => setRefreshInterval(e.target.value)}
              >
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="300">5 minutes</option>
              </select>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Background Refresh</div>
                <div className="settings-row-desc">Refresh data even when tab is not focused</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" />
                <span className="toggle-slider" />
              </label>
            </div>

            <button className="save-btn" onClick={handleSave}>Save</button>
          </div>
        );

      case 'notifications':
        return (
          <div>
            <div className="settings-panel-title">Notifications</div>
            <div className="settings-panel-subtitle">Control how you receive alerts and updates</div>

            {[
              { key: 'desktop', label: 'Desktop Notifications', desc: 'Show browser push notifications for alerts' },
              { key: 'sound', label: 'Sound Alerts', desc: 'Play a sound for critical alerts' },
              { key: 'email', label: 'Email Notifications', desc: 'Receive alert summaries via email' },
              { key: 'criticalOnly', label: 'Critical Only', desc: 'Only notify for critical severity alerts' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-label">{label}</div>
                  <div className="settings-row-desc">{desc}</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={notifications[key]}
                    onChange={e => setNotifications(prev => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}

            <button className="save-btn" onClick={handleSave}>Save Preferences</button>
          </div>
        );

      case 'alerts':
        return (
          <div>
            <div className="settings-panel-title">Email Alert Configuration</div>
            <div className="settings-panel-subtitle">Configure email recipients and alert conditions</div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Alert Email</div>
              </div>
              <input className="settings-input" defaultValue={profile.email} type="email" />
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">CC Team</div>
              </div>
              <input className="settings-input" defaultValue="platform-team@company.io" type="email" />
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Alert Threshold</div>
                <div className="settings-row-desc">Minimum severity to trigger email</div>
              </div>
              <select className="settings-input">
                <option>Critical</option>
                <option>Warning</option>
                <option>All</option>
              </select>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <div className="settings-row-label">Digest Mode</div>
                <div className="settings-row-desc">Batch alerts into a single daily digest email</div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" />
                <span className="toggle-slider" />
              </label>
            </div>

            <button className="save-btn" onClick={handleSave}>Save Alert Config</button>
          </div>
        );

      case 'about':
        return (
          <div>
            <div className="settings-panel-title">About TelemetryOps</div>
            <div className="settings-panel-subtitle">Platform information and version details</div>

            <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', marginBottom: 16 }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>
                TelemetryOps Monitor
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Microservices Architecture Telemetry & Distributed Tracing Analytics Panel</div>
            </div>

            {[
              { label: 'Version', value: 'v2.4.1' },
              { label: 'Build', value: '#4821' },
              { label: 'Release Date', value: 'July 15, 2026' },
              { label: 'Node.js', value: 'v20.5.0' },
              { label: 'React', value: 'v18.3.1' },
              { label: 'Recharts', value: 'v2.x' },
            ].map((item, i) => (
              <div key={i} className="settings-row">
                <div className="settings-row-label" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600 }}>{item.value}</span>
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
          <p className="page-subtitle">Manage your preferences and account configuration</p>
        </div>
      </div>

      <div className="settings-layout">
        {/* Settings Sidebar */}
        <div className="settings-sidebar">
          {settingsSections.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className={`settings-nav-item ${activeSection === id ? 'active' : ''}`}
              onClick={() => setActiveSection(id)}
            >
              <Icon size={16} />
              {label}
            </div>
          ))}
        </div>

        {/* Settings Panel */}
        <div className="settings-panel">
          {renderPanel()}
        </div>
      </div>
    </div>
  );
};

export default Settings;

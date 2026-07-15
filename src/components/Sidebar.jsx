// ============================================================
// Sidebar Component
// ============================================================
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Server, GitBranch, BarChart3,
  FileText, Bell, Settings, ChevronLeft, ChevronRight,
  Zap, X
} from 'lucide-react';
import '../css/Sidebar.css';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'MAIN' },
  { path: '/services', icon: Server, label: 'Services', section: 'MAIN' },
  { path: '/tracing', icon: GitBranch, label: 'Distributed Tracing', section: 'OBSERVABILITY' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics', section: 'OBSERVABILITY' },
  { path: '/logs', icon: FileText, label: 'Logs', section: 'OBSERVABILITY' },
  { path: '/alerts', icon: Bell, label: 'Alerts', badge: '4', section: 'OBSERVABILITY' },
  { path: '/settings', icon: Settings, label: 'Settings', section: 'CONFIG' },
];

/**
 * Sidebar navigation component with collapsible support
 * @param {Object} props - collapsed, onToggle, mobileOpen, onMobileClose
 */
const Sidebar = ({ collapsed, onToggle, mobileOpen, onMobileClose }) => {
  let lastSection = null;

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`}
        onClick={onMobileClose}
      />

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Zap size={20} color="white" />
          </div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">TelemetryOps</span>
            <span className="sidebar-logo-subtitle">Monitoring Platform</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const showSection = item.section !== lastSection;
            lastSection = item.section;
            const Icon = item.icon;

            return (
              <div key={item.path}>
                {showSection && (
                  <div className="sidebar-section-label">{item.section}</div>
                )}
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={onMobileClose}
                >
                  <span className="nav-icon">
                    <Icon size={18} />
                  </span>
                  <span className="nav-label">{item.label}</span>
                  {item.badge && (
                    <span className="nav-badge">{item.badge}</span>
                  )}
                </NavLink>
              </div>
            );
          })}
        </nav>

        {/* Status */}
        <div className="sidebar-footer">
          <div className="sidebar-status-dot" />
          <span className="sidebar-status-text">All systems nominal</span>
        </div>

        {/* Toggle Button */}
        <div className="sidebar-toggle">
          <button className="toggle-btn" onClick={onToggle}>
            {collapsed
              ? <ChevronRight size={16} />
              : <><ChevronLeft size={16} /><span className="nav-label">Collapse</span></>
            }
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

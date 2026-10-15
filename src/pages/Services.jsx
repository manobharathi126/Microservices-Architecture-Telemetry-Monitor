// ============================================================
// Services Page
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, Server, WifiOff, Plus, X, Check, AlertCircle } from 'lucide-react';
import ServiceCard from '../components/ServiceCard';
import { SkeletonServiceCard } from '../components/SkeletonLoader';
import { useTelemetry } from '../hooks/useTelemetry';
import '../css/Services.css';

/**
 * Services list page with search and status filtering.
 * Data now comes live from the collector's WebSocket (via useTelemetry)
 * instead of the static dummyData — services appear here the moment
 * the collector starts reporting readings for them.
 */
const Services = () => {
  const readOnlyDemo = import.meta.env.VITE_READ_ONLY_DEMO === 'true';
  const { services: servicesData, connectionStatus, addService, addServiceStatus } = useTelemetry();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newKind, setNewKind] = useState('ping');

  // "Loading" now means genuinely waiting for the first live reading,
  // not a fixed artificial delay.
  const loading = connectionStatus === 'connecting' && servicesData.length === 0;

  // When the collector confirms the add worked (or failed), clear the
  // form on success and show the result either way.
  useEffect(() => {
    if (addServiceStatus?.ok) {
      setNewName('');
      setNewUrl('');
      const t = setTimeout(() => setShowAddForm(false), 1200);
      return () => clearTimeout(t);
    }
  }, [addServiceStatus]);

  const handleAddService = (e) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    addService(newName.trim(), newUrl.trim(), newKind);
  };

  const filtered = useMemo(() => {
    return servicesData.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.host ?? '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, servicesData]);

  const counts = useMemo(() => ({
    All: servicesData.length,
    Healthy: servicesData.filter(s => s.status === 'Healthy').length,
    Warning: servicesData.filter(s => s.status === 'Warning').length,
    Down: servicesData.filter(s => s.status === 'Down').length,
    Unknown: servicesData.filter(s => s.status === 'Unknown').length,
  }), [servicesData]);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Microservices</h2>
          <p className="page-subtitle">
            {servicesData.length} services registered in the cluster
            {connectionStatus !== 'connected' && (
              <span style={{ color: '#f59e0b', marginLeft: 8 }}>
                <WifiOff size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                collector {connectionStatus}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['All', 'Healthy', 'Warning', 'Down', 'Unknown'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${statusFilter === status ? 'var(--border-hover)' : 'var(--border-secondary)'}`,
                background: statusFilter === status ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: statusFilter === status ? 'var(--accent-primary)' : 'var(--text-muted)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {status} ({counts[status]})
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="services-toolbar" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div className="search-wrapper">
          <Search className="search-icon" size={15} />
          <input
            className="search-input"
            type="text"
            placeholder="Search by name or host..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {!readOnlyDemo && <button
          onClick={() => setShowAddForm((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-hover)',
            background: showAddForm ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          {showAddForm ? <X size={14} /> : <Plus size={14} />}
          {showAddForm ? 'Cancel' : 'Add Service'}
        </button>}
      </div>

      {/* Add Service form — sends a live message to the collector over
          the existing WebSocket connection. No backend restart needed;
          the new service shows up in the next poll cycle (~3s). */}
      {!readOnlyDemo && showAddForm && (
        <form
          onSubmit={handleAddService}
          style={{
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
            background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
            border: '1px solid var(--border-secondary)',
            borderRadius: 'var(--radius-lg, 10px)',
            padding: '14px 16px', marginBottom: 20,
          }}
        >
          <input
            type="text"
            placeholder="Display name (e.g. Discord Status)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            style={{
              flex: '1 1 200px', padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border-secondary)', background: 'transparent',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
            }}
          />
          <input
            type="url"
            placeholder="https://example.com/api/status"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            required
            style={{
              flex: '2 1 280px', padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border-secondary)', background: 'transparent',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
            }}
          />
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border-secondary)', background: 'transparent',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
            }}
          >
            <option value="ping">Plain ping (latency + HTTP status)</option>
            <option value="statuspage">Statuspage.io format (reads real status.indicator)</option>
          </select>
          <button
            type="submit"
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: 'var(--accent-primary)', color: '#fff',
              fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            Start Monitoring
          </button>

          {addServiceStatus && (
            <span
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.8rem',
                color: addServiceStatus.ok ? 'var(--status-healthy, #10b981)' : 'var(--status-error, #ef4444)',
              }}
            >
              {addServiceStatus.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              {addServiceStatus.ok ? `Now monitoring "${addServiceStatus.name}"` : addServiceStatus.error}
            </span>
          )}
        </form>
      )}

      {/* Services Grid */}
      {loading ? (
        <div className="services-grid">
          {Array(6).fill(null).map((_, i) => <SkeletonServiceCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Server size={28} />
          </div>
          <p className="empty-state-text">No services match your search criteria</p>
        </div>
      ) : (
        <div className="services-grid">
          {filtered.map((service, i) => (
            <ServiceCard key={service.id} service={service} index={i} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Services;

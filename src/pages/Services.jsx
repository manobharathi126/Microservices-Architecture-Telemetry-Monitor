// ============================================================
// Services Page
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Server } from 'lucide-react';
import ServiceCard from '../components/ServiceCard';
import { SkeletonServiceCard } from '../components/SkeletonLoader';
import { servicesData } from '../data/dummyData';
import '../css/Services.css';

/**
 * Services list page with search and status filtering
 */
const Services = () => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    return servicesData.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.host.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  const counts = useMemo(() => ({
    All: servicesData.length,
    Healthy: servicesData.filter(s => s.status === 'Healthy').length,
    Warning: servicesData.filter(s => s.status === 'Warning').length,
    Down: servicesData.filter(s => s.status === 'Down').length,
  }), []);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Microservices</h2>
          <p className="page-subtitle">{servicesData.length} services registered in the cluster</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['All', 'Healthy', 'Warning', 'Down'].map((status) => (
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
      <div className="services-toolbar">
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
      </div>

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

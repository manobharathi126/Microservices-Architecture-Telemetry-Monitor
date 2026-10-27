// ============================================================
// Services Page
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Server, WifiOff, Plus, X, Check, AlertCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
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
  const { services: servicesData, connectionStatus, addService, addServiceStatus, deleteService } = useTelemetry();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const q = searchParams.get('search');
    if (q != null) setSearch(q);
  }, [searchParams]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newKind, setNewKind] = useState('ping');
  const [isVerifying, setIsVerifying] = useState(false);
  const [clientValidationMsg, setClientValidationMsg] = useState(null);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Close modal on Escape key
  useEffect(() => {
    if (!serviceToDelete) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting) {
        setServiceToDelete(null);
        setDeleteError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [serviceToDelete, isDeleting]);

  // "Loading" now means genuinely waiting for the first live reading,
  // not a fixed artificial delay.
  const loading = connectionStatus === 'connecting' && servicesData.length === 0;

  // When the collector confirms the add worked (or failed), clear the
  // form only on success and preserve inputs on failure.
  useEffect(() => {
    if (addServiceStatus) {
      setIsVerifying(false);
      if (addServiceStatus.ok) {
        setNewName('');
        setNewUrl('');
        setClientValidationMsg(null);
        const t = setTimeout(() => setShowAddForm(false), 1500);
        return () => clearTimeout(t);
      }
    }
  }, [addServiceStatus]);

  const handleAddService = (e) => {
    e.preventDefault();
    setClientValidationMsg(null);

    const nameTrimmed = newName.trim();
    const urlTrimmed = newUrl.trim();

    if (!nameTrimmed) {
      setClientValidationMsg('Please enter a service name.');
      return;
    }
    if (!urlTrimmed) {
      setClientValidationMsg('Please enter a valid HTTP or HTTPS URL.');
      return;
    }
    if (!/^https?:\/\//i.test(urlTrimmed)) {
      setClientValidationMsg('Please enter a valid HTTP or HTTPS URL.');
      return;
    }

    setIsVerifying(true);
    addService(nameTrimmed, urlTrimmed, newKind);
  };

  const handleInitiateDelete = (service) => {
    if (service.isProtected) {
      toast.error(`Service "${service.name}" is protected and cannot be deleted.`);
      return;
    }
    setServiceToDelete(service);
    setDeleteError(null);
  };

  const handleCancelDelete = () => {
    if (isDeleting) return;
    setServiceToDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!serviceToDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteService(serviceToDelete.id, serviceToDelete.name);
      toast.success(`Service "${serviceToDelete.name}" deleted successfully.`);
      setServiceToDelete(null);
    } catch (err) {
      const msg = err.message || `Failed to delete service "${serviceToDelete.name}".`;
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
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
            id="service-name-input"
            type="text"
            placeholder="Display name (e.g. Discord Status)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isVerifying}
            required
            style={{
              flex: '1 1 200px', padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border-secondary)', background: 'transparent',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
              opacity: isVerifying ? 0.6 : 1,
            }}
          />
          <input
            id="service-url-input"
            type="text"
            placeholder="https://status.example.com/api"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            disabled={isVerifying}
            required
            style={{
              flex: '2 1 280px', padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border-secondary)', background: 'transparent',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
              opacity: isVerifying ? 0.6 : 1,
            }}
          />
          <select
            id="service-kind-select"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value)}
            disabled={isVerifying}
            style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border-secondary)', background: 'transparent',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
              opacity: isVerifying ? 0.6 : 1,
            }}
          >
            <option value="ping">Plain ping (latency + HTTP status)</option>
            <option value="statuspage">Statuspage.io format (reads real status.indicator)</option>
          </select>
          <button
            id="submit-service-btn"
            type="submit"
            disabled={isVerifying}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: isVerifying ? 'var(--text-muted)' : 'var(--accent-primary)',
              color: '#fff',
              fontSize: '0.85rem', fontWeight: 600,
              cursor: isVerifying ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: isVerifying ? 0.7 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            {isVerifying ? 'Verifying...' : 'Start Monitoring'}
          </button>

          {/* Clear inline status feedback - no browser alert popups */}
          {isVerifying && (
            <span
              id="service-verifying-status"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.82rem',
                color: 'var(--accent-primary, #6366f1)',
                padding: '4px 10px', borderRadius: 6,
                background: 'rgba(99,102,241,0.08)',
              }}
            >
              <span
                style={{
                  width: 12, height: 12,
                  border: '2px solid currentColor',
                  borderRightColor: 'transparent',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.75s linear infinite',
                }}
              />
              Verifying service connectivity...
            </span>
          )}

          {!isVerifying && clientValidationMsg && (
            <span
              id="service-validation-error"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.82rem',
                color: 'var(--status-error, #ef4444)',
                padding: '4px 10px', borderRadius: 6,
                background: 'rgba(239,68,68,0.08)',
              }}
            >
              <AlertCircle size={14} />
              {clientValidationMsg}
            </span>
          )}

          {!isVerifying && !clientValidationMsg && addServiceStatus && (
            <span
              id="service-add-result"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.82rem',
                color: addServiceStatus.ok ? 'var(--status-healthy, #10b981)' : 'var(--status-error, #ef4444)',
                padding: '4px 10px', borderRadius: 6,
                background: addServiceStatus.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              }}
            >
              {addServiceStatus.ok ? <Check size={14} /> : <AlertCircle size={14} />}
              {addServiceStatus.ok
                ? (addServiceStatus.name ? `Service "${addServiceStatus.name}" verified successfully and added.` : 'Service verified successfully and added.')
                : addServiceStatus.error}
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
            <ServiceCard
              key={service.id}
              service={service}
              index={i}
              onDelete={!readOnlyDemo ? handleInitiateDelete : undefined}
            />
          ))}
        </div>
      )}

      {/* Delete Service Confirmation Modal */}
      {serviceToDelete && (
        <div
          className="modal-overlay"
          onClick={handleCancelDelete}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <div className="delete-modal-icon-wrapper">
                <Trash2 size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 id="delete-dialog-title" className="delete-modal-title">Delete Service</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Confirm removal from cluster monitoring
                </span>
              </div>
              <button
                type="button"
                className="delete-modal-close-btn"
                onClick={handleCancelDelete}
                disabled={isDeleting}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="delete-modal-body">
              Are you sure you want to delete the service <strong className="delete-modal-service-name">'{serviceToDelete.name}'</strong>? This action cannot be undone.
            </div>

            {deleteError && (
              <div className="delete-modal-error">
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="delete-modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-delete-confirm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="spinner-inline" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Services;

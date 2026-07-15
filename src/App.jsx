// ============================================================
// App.jsx — Root application with routing and layout
// ============================================================
import { useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import ScrollToTop from './components/ScrollToTop';

// Lazy-loaded pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Services = lazy(() => import('./pages/Services'));
const ServiceDetails = lazy(() => import('./pages/ServiceDetails'));
const Tracing = lazy(() => import('./pages/Tracing'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Logs = lazy(() => import('./pages/Logs'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Page transition loading fallback
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60vh',
    gap: 12,
  }}>
    <div style={{
      width: 32,
      height: 32,
      border: '3px solid var(--border-secondary)',
      borderTopColor: 'var(--accent-primary)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading...</span>
  </div>
);

/**
 * Root App component — manages layout state and routing
 */
function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <BrowserRouter>
      {/* Toast Notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-hover)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
          },
        }}
      />

      <div className="app-layout">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        {/* Main Content */}
        <main className={`main-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {/* Navbar */}
          <Navbar
            collapsed={sidebarCollapsed}
            onMobileMenuOpen={() => setMobileMenuOpen(true)}
          />

          {/* Page Content */}
          <div className="page-content">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/services" element={<Services />} />
                <Route path="/services/:id" element={<ServiceDetails />} />
                <Route path="/tracing" element={<Tracing />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </div>

          {/* Scroll to top */}
          <ScrollToTop />
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

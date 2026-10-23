// ============================================================
// App.jsx — Root application with routing and layout
// ============================================================
import { useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import ScrollToTop from './components/ScrollToTop';
import { ThemeProvider } from './context/ThemeContext';

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
const Login = lazy(() => import('./pages/Login'));

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
 * Inner layout component that conditionally renders sidebar/navbar
 * based on whether we're on the login page or not.
 */
function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  // Login page renders without the dashboard chrome
  if (isLoginPage) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </Suspense>
    );
  }

  return (
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
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/services" element={<PrivateRoute><Services /></PrivateRoute>} />
              <Route path="/services/:id" element={<PrivateRoute><ServiceDetails /></PrivateRoute>} />
              <Route path="/tracing" element={<PrivateRoute><Tracing /></PrivateRoute>} />
              <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
              <Route path="/logs" element={<PrivateRoute><Logs /></PrivateRoute>} />
              <Route path="/alerts" element={<PrivateRoute><Alerts /></PrivateRoute>} />
              <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </div>

        {/* Scroll to top */}
        <ScrollToTop />
      </main>
    </div>
  );
}

/**
 * Root App component
 */
function App() {
  return (
    <ThemeProvider>
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
        <AppLayout />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;


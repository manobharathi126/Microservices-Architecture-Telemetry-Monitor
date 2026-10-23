import { Navigate, useLocation } from 'react-router-dom';

/**
 * PrivateRoute component ensures that the child component is only rendered
 * when the user is authenticated (i.e., a valid token exists in localStorage).
 * If not authenticated, the user is redirected to the login page.
 */
export default function PrivateRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem('authToken');
  const isAuthenticated = Boolean(token);
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

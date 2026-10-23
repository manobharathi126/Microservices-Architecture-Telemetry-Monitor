import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import '../css/Login.css';

/**
 * Resolve the authentication backend base URL.
 * In production (Netlify), it uses VITE_AUTH_API_URL or VITE_API_URL pointing to the Render backend.
 * In local development, defaults to empty string so requests use the Vite server proxy.
 */
const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_AUTH_API_URL || import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
};

/**
 * Login page component.
 * Matches the existing dashboard theme using shared CSS variables.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please fill in both fields.');
      return;
    }
    setLoading(true);

    const apiBase = getApiBaseUrl();
    const endpoint = `${apiBase}/api/login`;

    try {
      let resp;
      try {
        resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });
      } catch (networkErr) {
        throw new Error(
          `Unable to reach authentication server at ${endpoint || '/api/login'}. Please ensure the backend is running and CORS is enabled.`
        );
      }

      // Inspect Content-Type before parsing to avoid JSON.parse unexpected character errors
      const contentType = resp.headers.get('content-type') || '';
      let data = {};

      if (contentType.includes('application/json')) {
        try {
          data = await resp.json();
        } catch (jsonErr) {
          throw new Error('Received malformed JSON from the authentication server.');
        }
      } else {
        // Handle non-JSON responses (e.g., Netlify SPA index.html fallback, 502/503 HTML pages)
        const text = await resp.text();
        if (text.includes('<!doctype') || text.includes('<html')) {
          throw new Error(
            'Authentication endpoint returned HTML instead of JSON. If deployed on Netlify, please ensure the VITE_AUTH_API_URL environment variable is set to your Render backend URL.'
          );
        }
        throw new Error(text || `Server returned non-JSON response (${resp.status})`);
      }

      if (!resp.ok) {
        throw new Error(data.message || `Login failed (${resp.status})`);
      }

      // Store token and user profile
      localStorage.setItem('authToken', data.token);
      if (data.user) {
        localStorage.setItem('authUser', JSON.stringify(data.user));
      }
      toast.success('Logged in successfully');
      navigate(from, { replace: true });
    } catch (err) {
      const errMsg = err.message || 'Login failed';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page glass">
      <form className="login-form" onSubmit={handleSubmit}>
        <h2 className="login-title">Sign In</h2>
        {error && <div className="login-error">{error}</div>}
        <div className="login-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="login-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

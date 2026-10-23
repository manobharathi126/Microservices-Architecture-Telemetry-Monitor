import dotenv from 'dotenv';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';

dotenv.config();

const app = express();

// Enable CORS for Netlify frontend, Render services, and localhost
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);
app.options('*', cors());

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Authorized users list — add more entries here for additional users.
// Each entry: { email, passwordHash, name, role }
const USERS = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    passwordHash:
      process.env.ADMIN_PASSWORD_HASH ||
      '$2a$10$mggTnpQX9/lT2VYhduG7FOXExjvtWqis.feixlhaK.wBEc5OmXOdG', // hash for 'password'
    name: process.env.ADMIN_NAME || 'Admin',
    role: process.env.ADMIN_ROLE || 'Administrator',
  },
];

// Health check endpoint for Render / monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint for verification
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'auth-service',
    message: 'TelemetryOps Authentication Service is running',
    endpoints: ['POST /api/login', 'GET /api/me', 'GET /health'],
  });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      console.warn('[auth-service] Login rejected: email and password required');
      return res.status(400).json({ message: 'Email and password required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    console.log(`[auth-service] Login attempt for: ${trimmedEmail}`);

    // Find user by email (case-insensitive)
    const user = USERS.find((u) => u.email.toLowerCase() === trimmedEmail);
    if (!user) {
      console.warn(`[auth-service] Login failed: user not found (${trimmedEmail})`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      console.warn(`[auth-service] Login failed: invalid password (${trimmedEmail})`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Include profile data in JWT and response
    const token = jwt.sign(
      { email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    console.log(`[auth-service] Login successful: ${user.email} (${user.role})`);
    return res.status(200).json({
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[auth-service] Unexpected error during login:', err);
    return res.status(500).json({ message: 'Internal server error during authentication' });
  }
});

// Profile verification endpoint
app.get('/api/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = USERS.find((u) => u.email.toLowerCase() === decoded.email?.toLowerCase());
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// 404 JSON fallback for unmatched routes
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
});

// Global error handler — always returns JSON
app.use((err, req, res, next) => {
  console.error('[auth-service] Global error handler caught:', err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[auth-service] listening on port ${PORT}`);
});

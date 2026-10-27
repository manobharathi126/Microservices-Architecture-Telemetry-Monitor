import dotenv from 'dotenv';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';

dotenv.config();

const app = express();

// Allowed origins whitelist — exact Netlify frontend origin + localhost for dev
const ALLOWED_ORIGINS = [
  'https://microservicestelemetry.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without Origin header (curl, health checks, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[auth-service] CORS blocked unauthorized origin: ${origin}`);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Authorized users list — in-memory repository initialized with administrator and provisioned accounts
const USERS = [
  {
    id: 'user-admin',
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    passwordHash:
      process.env.ADMIN_PASSWORD_HASH ||
      '$2a$10$mggTnpQX9/lT2VYhduG7FOXExjvtWqis.feixlhaK.wBEc5OmXOdG', // hash for 'password'
    name: process.env.ADMIN_NAME || 'Admin',
    role: process.env.ADMIN_ROLE || 'Administrator',
  },
];

// Seed accounts provisioned with precomputed bcrypt hashes (10 rounds)
const SEED_USERS = [
  {
    id: 'user-mathan',
    email: 'mathan@gmail.com',
    passwordHash: '$2a$10$F0sOlkAQjrR5aQW0VZ583e92Ph3ZrgZn9CcDxvGx73wjKXE7ALPfW',
    name: 'Mathan',
    role: 'Engineer',
  },
  {
    id: 'user-vaishak',
    email: 'vaishak@gmail.com',
    passwordHash: '$2a$10$a1PaYPrJ/lC13ch2uRd4zuQ6koRv2J6xYEnmD08Ip0nqzrgaCXqya',
    name: 'Vaishak',
    role: 'Engineer',
  },
  {
    id: 'user-mano',
    email: 'mano@gmail.com',
    passwordHash: '$2a$10$agFIqXAdbjYl9v73NajzmuWVfAh9Q2c9cgYfIksCk4t7VeJjvl2K2',
    name: 'Mano',
    role: 'Engineer',
  },
];

/**
 * Idempotently seed user accounts without creating duplicates.
 * Safe to run multiple times on service startup or during tests.
 * @param {Array} accountsToSeed - List of user objects to seed
 * @returns {{ total: number, added: number }}
 */
function seedAccounts(accountsToSeed = SEED_USERS) {
  let added = 0;
  for (const account of accountsToSeed) {
    const exists = USERS.some(
      (u) => u.email.toLowerCase() === account.email.trim().toLowerCase()
    );
    if (!exists) {
      USERS.push({
        id: account.id || account.email.trim().toLowerCase(),
        email: account.email.trim().toLowerCase(),
        passwordHash: account.passwordHash,
        name: account.name,
        role: account.role || 'Engineer',
      });
      added++;
    }
  }
  return { total: USERS.length, added };
}

// Initial account seeding
seedAccounts();

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
      { id: user.id || user.email, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    console.log(`[auth-service] Login successful: ${user.email} (${user.role})`);
    return res.status(200).json({
      token,
      user: {
        id: user.id || user.email,
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
        id: user.id || user.email,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// Profile update endpoint
app.put(['/api/profile', '/api/me'], (req, res) => {
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
    const { name, role } = req.body || {};
    if (name && typeof name === 'string' && name.trim().length >= 2) {
      user.name = name.trim();
    }
    if (role && typeof role === 'string' && role.trim()) {
      user.role = role.trim();
    }

    const newToken = jwt.sign(
      { id: user.id || user.email, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    console.log(`[auth-service] Profile updated for ${user.email}: name="${user.name}", role="${user.role}"`);
    return res.status(200).json({
      message: 'Profile updated successfully',
      token: newToken,
      user: {
        id: user.id || user.email,
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
  if (err && err.message && err.message.includes('CORS')) {
    return res.status(403).json({ message: err.message });
  }
  console.error('[auth-service] Global error handler caught:', err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
// Only start listening if run directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[auth-service] listening on port ${PORT}`);
  });
}

export { app, USERS, seedAccounts };


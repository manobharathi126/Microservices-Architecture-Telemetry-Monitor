import dotenv from 'dotenv';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';

dotenv.config({ path: new URL('.env', import.meta.url).pathname });

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Authorized users list — add more entries here for additional users.
// Each entry: { email, passwordHash, name, role }
const USERS = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '$2a$10$mggTnpQX9/lT2VYhduG7FOXExjvtWqis.feixlhaK.wBEc5OmXOdG', // hash for 'password'
    name: process.env.ADMIN_NAME || 'Admin',
    role: process.env.ADMIN_ROLE || 'Administrator',
  },
];

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  // Find user by email
  const user = USERS.find((u) => u.email === email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Include profile data in JWT and response
  const token = jwt.sign(
    { email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

app.get('/api/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = USERS.find((u) => u.email === decoded.email);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[auth-service] listening on port ${PORT}`);
});

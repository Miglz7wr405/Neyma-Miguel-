import jwt from 'jsonwebtoken';
import { findUser, userById } from './users.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function login(phone, password) {
  const user = findUser(phone, password);
  if (!user) return null;
  const token = jwt.sign({ id: user.id, name: user.name }, SECRET, { expiresIn: '365d' });
  return { token, user: { id: user.id, name: user.name, phone: user.phone } };
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return userById(payload.id) || null;
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const user = token && verifyToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

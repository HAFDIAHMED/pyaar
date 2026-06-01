import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try { return jwt.verify(token, config.jwtSecret); } catch { return null; }
}

export function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (t) { const u = verifyToken(t); if (u) req.user = u; }
  next();
}

export function authRequired(req, res, next) {
  authOptional(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'authentication required' });
    next();
  });
}

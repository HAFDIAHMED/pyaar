import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { usersRepo } from '../db/store.js';
import { signToken } from '../auth.js';

const r = Router();

// Basic email format check — RFC 5322 in spirit, not in spec.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{2,24}$/;

// Derive a friendly default username from an email's local part.
function suggestUsername(email) {
  const local = (email.split('@')[0] || '').toLowerCase();
  const cleaned = local.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 18) || 'player';
  return cleaned;
}

// Step-1 of the new register flow: client sends an email, server confirms
// it's free and proposes a default username (appending digits if taken).
r.post('/check-email', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    if (typeof usersRepo.findByEmail === 'function' && await usersRepo.findByEmail(email)) {
      return res.status(409).json({ error: 'That email is already registered — sign in instead.' });
    }
    let base = suggestUsername(email), candidate = base, n = 0;
    while (await usersRepo.findByUsername(candidate)) {
      n++;
      candidate = base.slice(0, 18 - String(n).length) + n;
      if (n > 50) { candidate = base + Math.floor(Math.random() * 9000 + 1000); break; }
    }
    res.json({ ok: true, suggestedUsername: candidate });
  } catch (e) { res.status(500).json({ error: 'Lookup failed.' }); }
});

r.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 2–24 letters, digits, or underscore.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  try {
    if (typeof usersRepo.findByEmail === 'function' && await usersRepo.findByEmail(email)) {
      return res.status(409).json({ error: 'That email is already registered — sign in instead.' });
    }
    if (await usersRepo.findByUsername(username)) {
      return res.status(409).json({ error: 'That username is taken — try another.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const id = await usersRepo.create(username, hash, email);
    const user = { id, username, email };
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: 'Registration failed.' }); }
});

r.post('/login', async (req, res) => {
  // Accept either username or email as the identifier.
  const identifier = String(req.body?.username || req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  try {
    let u = await usersRepo.findByUsername(identifier);
    if (!u && identifier.includes('@') && typeof usersRepo.findByEmail === 'function') {
      u = await usersRepo.findByEmail(identifier.toLowerCase());
    }
    if (!u) return res.status(401).json({ error: 'Invalid credentials.' });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });
    const user = { id: u.id, username: u.username, email: u.email };
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: 'Login failed.' }); }
});

export default r;

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { usersRepo } from '../db/store.js';
import { signToken } from '../auth.js';

const r = Router();

r.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || String(username).trim().length < 2 || String(password).length < 4)
    return res.status(400).json({ error: 'username ≥2 chars and password ≥4 chars required' });
  const name = String(username).trim();
  try {
    if (await usersRepo.findByUsername(name)) return res.status(409).json({ error: 'username already taken' });
    const hash = await bcrypt.hash(String(password), 10);
    const id = await usersRepo.create(name, hash);
    const user = { id, username: name };
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: 'registration failed' }); }
});

r.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const u = await usersRepo.findByUsername(String(username || '').trim());
    if (!u) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(String(password || ''), u.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const user = { id: u.id, username: u.username };
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: 'login failed' }); }
});

export default r;

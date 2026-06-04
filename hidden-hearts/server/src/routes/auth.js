import { Router } from 'express';
import { usersRepo } from '../db/store.js';
import { signToken } from '../auth.js';

const r = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{2,24}$/;

// Tiny placeholder so the existing NOT-NULL password_hash column is satisfied.
// PYAAR is intentionally password-less — anyone can claim any unused name;
// the value is local to a device.
const PLACEHOLDER_PW_HASH = '!no-password-required!';

// Used by the client while the user types — returns whether a name is free.
r.get('/check-username', async (req, res) => {
  const username = String(req.query?.u || '').trim();
  if (!USERNAME_RE.test(username)) {
    return res.json({ ok: false, valid: false, reason: 'Pick 2–24 letters, digits, or underscore.' });
  }
  try {
    const exists = !!(await usersRepo.findByUsername(username));
    res.json({ ok: true, valid: true, available: !exists });
  } catch (e) {
    res.status(500).json({ ok: false, reason: 'Lookup failed.' });
  }
});

// One-screen flow: hit /api/auth/continue with a username — if it's free,
// we create the account; if it exists, we sign the user in. Either way the
// client gets a fresh token.
r.post('/continue', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 2–24 letters, digits, or underscore.' });
  }
  try {
    let u = await usersRepo.findByUsername(username);
    let created = false;
    if (!u) {
      const id = await usersRepo.create(username, PLACEHOLDER_PW_HASH, null);
      u = { id, username };
      created = true;
    }
    const user = { id: u.id, username: u.username };
    res.json({ token: signToken(user), user, created });
  } catch (e) {
    res.status(500).json({ error: 'Could not sign you in.' });
  }
});

// Keep /register and /login as thin aliases of /continue so older clients
// (and the existing /api routes) keep working without a flag day.
r.post('/register', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 2–24 letters, digits, or underscore.' });
  }
  try {
    if (await usersRepo.findByUsername(username)) {
      return res.status(409).json({ error: 'That name is taken — try another.' });
    }
    const id = await usersRepo.create(username, PLACEHOLDER_PW_HASH, null);
    const user = { id, username };
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: 'Registration failed.' }); }
});

r.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  try {
    const u = await usersRepo.findByUsername(username);
    if (!u) return res.status(404).json({ error: 'No player with that name. Try /continue to create one.' });
    const user = { id: u.id, username: u.username };
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ error: 'Login failed.' }); }
});

export default r;

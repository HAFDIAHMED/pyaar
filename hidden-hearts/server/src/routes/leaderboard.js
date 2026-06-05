import { Router } from 'express';
import { leaderboardRepo, backend } from '../db/store.js';

const r = Router();

// Accept ?limit=N to cap the result; otherwise return ALL players who have
// at least one finished game. Server-side cap of 1000 prevents abuse.
r.get('/', async (req, res) => {
  const raw = req.query?.limit;
  const limit = Math.min(1000, Math.max(1, parseInt(raw, 10) || 1000));
  try { res.json({ rows: await leaderboardRepo.top(limit), backend: backend() }); }
  catch (e) { res.status(500).json({ error: 'leaderboard unavailable' }); }
});

export default r;

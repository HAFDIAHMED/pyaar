import { Router } from 'express';
import { leaderboardRepo, backend } from '../db/store.js';

const r = Router();

r.get('/', async (_req, res) => {
  try { res.json({ rows: await leaderboardRepo.top(20), backend: backend() }); }
  catch (e) { res.status(500).json({ error: 'leaderboard unavailable' }); }
});

export default r;

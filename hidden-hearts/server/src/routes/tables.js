import { Router } from 'express';
import { listOpenTables } from '../game/rooms.js';

const r = Router();

// The casino floor — list every live table with enough metadata for the home
// screen to render its little felt-card preview. Anonymous endpoint; nothing
// sensitive is exposed (no userIds, no clientIds, no game state).
r.get('/', (_req, res) => {
  try { res.json({ tables: listOpenTables() }); }
  catch (e) { res.status(500).json({ error: 'tables unavailable' }); }
});

export default r;

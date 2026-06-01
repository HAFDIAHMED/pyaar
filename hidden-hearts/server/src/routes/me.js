import { Router } from 'express';
import { authRequired } from '../auth.js';
import { usersRepo, gamesRepo } from '../db/store.js';

const r = Router();

r.get('/', authRequired, async (req, res) => {
  try {
    const user = await usersRepo.findById(req.user.id);
    const history = await gamesRepo.historyForUser(req.user.id, 20);
    res.json({ user, history });
  } catch (e) { res.status(500).json({ error: 'profile unavailable' }); }
});

export default r;

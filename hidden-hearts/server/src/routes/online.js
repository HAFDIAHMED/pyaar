import { Router } from 'express';
import { listOnlineUsers } from '../game/rooms.js';

const r = Router();

// Who's at the casino right now — names only, used by the home-page friends
// strip so a player can see other humans they could invite.
r.get('/', (_req, res) => {
  try { res.json({ users: listOnlineUsers() }); }
  catch (e) { res.status(500).json({ error: 'online unavailable' }); }
});

export default r;

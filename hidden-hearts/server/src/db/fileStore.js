// Zero-install JSON-file persistence — the fallback used when Oracle isn't
// connected, so accounts & leaderboard work out of the box (no Docker, no install).
// Same method shapes as the Oracle repos in repos.js. Small-scale/dev use.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '../../../data');
const file = join(dataDir, 'store.json');

let db = { users: [], games: [], seq: { users: 0, games: 0 } };
try {
  if (existsSync(file)) db = JSON.parse(readFileSync(file, 'utf8'));
  else { mkdirSync(dataDir, { recursive: true }); save(); }
} catch { /* start fresh */ }

function save() { try { mkdirSync(dataDir, { recursive: true }); writeFileSync(file, JSON.stringify(db, null, 2)); } catch {} }

export const usersRepo = {
  async create(username, passwordHash, email) {
    const id = ++db.seq.users;
    db.users.push({ id, username, email: email ? String(email).toLowerCase() : null, passwordHash, createdAt: new Date().toISOString() });
    save(); return id;
  },
  async findByUsername(username) {
    const u = db.users.find(x => x.username.toLowerCase() === String(username).toLowerCase());
    return u ? { id: u.id, username: u.username, email: u.email || null, passwordHash: u.passwordHash } : null;
  },
  async findByEmail(email) {
    const e = String(email || '').toLowerCase();
    if (!e) return null;
    const u = db.users.find(x => (x.email || '').toLowerCase() === e);
    return u ? { id: u.id, username: u.username, email: u.email, passwordHash: u.passwordHash } : null;
  },
  async findById(id) {
    const u = db.users.find(x => x.id === id);
    return u ? { id: u.id, username: u.username, email: u.email || null, createdAt: u.createdAt } : null;
  },
};

export const gamesRepo = {
  async record(game) {
    const id = ++db.seq.games;
    db.games.push({
      id, code: game.code || null, endReason: game.endReason || null,
      winnerName: game.winnerName || null, endedAt: new Date().toISOString(),
      players: game.players.map(p => ({ userId: p.userId ?? null, seat: p.seat, name: p.name, isAI: !!p.isAI, score: p.score ?? 0, heart: p.heart, soulmate: !!p.soulmate, isWinner: !!p.isWinner })),
    });
    save(); return id;
  },
  async historyForUser(userId, limit = 20) {
    const out = [];
    for (const g of db.games) {
      const mine = g.players.find(p => p.userId === userId);
      if (mine) out.push({ gameId: g.id, endedAt: g.endedAt, players: g.players.length, score: mine.score, heart: mine.heart, won: mine.isWinner ? 1 : 0, soulmate: mine.soulmate ? 1 : 0 });
    }
    return out.sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1)).slice(0, limit);
  },
};

export const leaderboardRepo = {
  async top(limit = 20) {
    const agg = new Map();
    for (const g of db.games) for (const p of g.players) {
      if (p.userId == null) continue;
      const u = db.users.find(x => x.id === p.userId); if (!u) continue;
      const cur = agg.get(p.userId) || { username: u.username, games: 0, wins: 0, soulmates: 0, totalScore: 0 };
      cur.games++; cur.wins += p.isWinner ? 1 : 0; cur.soulmates += p.soulmate ? 1 : 0; cur.totalScore += p.score || 0;
      agg.set(p.userId, cur);
    }
    return [...agg.values()].sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore).slice(0, limit);
  },
};

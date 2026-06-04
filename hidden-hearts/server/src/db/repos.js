import { query, oracledb } from './pool.js';

export const usersRepo = {
  async create(username, passwordHash, email) {
    const r = await query(
      `INSERT INTO users (username, password_hash, email) VALUES (:u, :h, :e)
       RETURNING id INTO :id`,
      {
        u: username, h: passwordHash, e: email ? String(email).toLowerCase() : null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    return r.outBinds.id[0];
  },
  async findByUsername(username) {
    const r = await query(
      `SELECT id AS "id", username AS "username", email AS "email", password_hash AS "passwordHash"
       FROM users WHERE LOWER(username) = LOWER(:u)`, { u: username });
    return r.rows[0] || null;
  },
  async findByEmail(email) {
    const e = String(email || '').toLowerCase();
    if (!e) return null;
    const r = await query(
      `SELECT id AS "id", username AS "username", email AS "email", password_hash AS "passwordHash"
       FROM users WHERE LOWER(email) = :e`, { e });
    return r.rows[0] || null;
  },
  async findById(id) {
    const r = await query(
      `SELECT id AS "id", username AS "username", email AS "email", created_at AS "createdAt"
       FROM users WHERE id = :id`, { id });
    return r.rows[0] || null;
  },
};

export const gamesRepo = {
  // Persist a finished game and its players in one transaction-ish batch.
  async record(game) {
    const r = await query(
      `INSERT INTO games (code, status, num_players, winner_name, end_reason)
       VALUES (:code, 'finished', :n, :winner, :reason)
       RETURNING id INTO :id`,
      {
        code: game.code || null, n: game.players.length,
        winner: game.winnerName || null, reason: game.endReason || null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    const gameId = r.outBinds.id[0];
    for (const p of game.players) {
      await query(
        `INSERT INTO game_players (game_id, user_id, seat, name, is_ai, score, heart, soulmate, is_winner)
         VALUES (:g, :uid, :seat, :name, :ai, :score, :heart, :soul, :win)`,
        {
          g: gameId, uid: p.userId ?? null, seat: p.seat, name: p.name,
          ai: p.isAI ? 1 : 0, score: p.score ?? 0, heart: p.heart || null,
          soul: p.soulmate ? 1 : 0, win: p.isWinner ? 1 : 0,
        }
      );
    }
    return gameId;
  },
  async historyForUser(userId, limit = 20) {
    const r = await query(
      `SELECT g.id AS "gameId", g.ended_at AS "endedAt", g.num_players AS "players",
              gp.score AS "score", gp.heart AS "heart", gp.is_winner AS "won", gp.soulmate AS "soulmate"
       FROM game_players gp JOIN games g ON g.id = gp.game_id
       WHERE gp.user_id = :uid
       ORDER BY g.ended_at DESC
       FETCH FIRST :lim ROWS ONLY`, { uid: userId, lim: limit });
    return r.rows;
  },
};

export const leaderboardRepo = {
  async top(limit = 20) {
    const r = await query(
      `SELECT u.username AS "username",
              COUNT(gp.id) AS "games",
              SUM(gp.is_winner) AS "wins",
              SUM(gp.soulmate) AS "soulmates",
              SUM(gp.score) AS "totalScore"
       FROM game_players gp JOIN users u ON u.id = gp.user_id
       WHERE gp.user_id IS NOT NULL
       GROUP BY u.username
       ORDER BY "wins" DESC, "totalScore" DESC
       FETCH FIRST :lim ROWS ONLY`, { lim: limit });
    return r.rows;
  },
};

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { config } from './config.js';
import { initDb, hasDb, closeDb } from './db/pool.js';
import { authOptional } from './auth.js';
import authRoutes from './routes/auth.js';
import leaderboardRoutes from './routes/leaderboard.js';
import meRoutes from './routes/me.js';
import { attachRooms, roomCount } from './game/rooms.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '../../client');

async function main() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));   // CSP off so the inline-asset client runs; tighten later
  app.use(cors());
  app.use(express.json());
  app.use(authOptional);

  // --- API ---
  app.get('/api/health', (_req, res) => res.json({ ok: true, db: hasDb(), persistence: hasDb() ? 'oracle' : 'file', rooms: roomCount(), env: config.env }));
  app.use('/api/auth', authRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/me', meRoutes);

  // --- static client ---
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

  // --- DB (optional — server still boots without it) ---
  try {
    await initDb();
    console.log('  ✓ Oracle connected:', config.db.connectString);
  } catch (e) {
    console.warn('  ⚠ Oracle not connected — using the local file store for accounts & leaderboard.');
    console.warn('    reason:', e.message.split('\n')[0]);
    console.warn('    (set DB_* in .env + run `npm run migrate` to switch to Oracle)');
  }

  const server = http.createServer(app);
  attachRooms(server);
  server.listen(config.port, () => {
    console.log(`\nPYAAR — Hidden Hearts server`);
    console.log(`  http://localhost:${config.port}   (env: ${config.env})`);
    console.log(`  persistence: ${hasDb() ? 'Oracle' : 'local file store (data/store.json)'}\n`);
  });

  const shutdown = async () => { console.log('\nshutting down…'); await closeDb(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}

main().catch(e => { console.error('fatal:', e); process.exit(1); });

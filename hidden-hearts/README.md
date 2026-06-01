# PYAAR — Hidden Hearts (full-stack)

The card game, as a real project: a **Node + Express + WebSocket** backend, an **Oracle**
data layer, and a browser client. Online multiplayer is authoritative (the server runs the
game engine); accounts, game history, and a leaderboard persist to Oracle.

```
hidden-hearts/
├─ shared/engine.js        # pure game rules (no DOM/audio) — used by server (and reusable by client)
├─ server/
│  └─ src/
│     ├─ index.js          # Express app + static client + WebSocket attach + graceful DB boot
│     ├─ config.js         # env config
│     ├─ auth.js           # JWT helpers + middleware
│     ├─ routes/           # /api/auth, /api/leaderboard, /api/me
│     ├─ game/rooms.js     # WebSocket room manager (authoritative multiplayer + AI pacing)
│     └─ db/               # pool (oracledb Thin mode), schema.sql, migrate.js, repos.js
├─ client/index.html       # the game UI (served at /)
├─ docker-compose.yml      # OPTIONAL local Oracle (not required)
└─ .env.example
```

## Run on another machine — just click (Windows)

After you pull the repo on any machine:

1. Install **Node.js 20+** once (https://nodejs.org).
2. Open the `hidden-hearts` folder and **double-click `run.bat`**.
3. Type a **port** (or press Enter for 8080). Your browser opens to the game.

The first run installs dependencies automatically (needs internet once); after that it
starts instantly and works offline. No `.env` needed — it boots with sensible defaults
and the local file store. **macOS/Linux:** run `bash run.sh` instead.

## Run locally with npm (developers)

```bash
cd hidden-hearts
npm install
cp .env.example .env          # optional: edit JWT_SECRET; DB can stay default
npm start                     # → http://localhost:8080
PORT=3000 npm start           # choose a port
```

The server **boots without a database**. Online multiplayer and the client work immediately;
**accounts & leaderboard stay disabled** until you attach Oracle (below) and run migrations.

`npm run dev` runs with `--watch` (auto-restart on edits).

## Attaching Oracle (no Docker)

The backend talks to Oracle purely through `DB_CONNECT_STRING` (+ optional wallet) — it does
not care where Oracle runs. `node-oracledb` runs in **Thin mode**, so **no Oracle Instant
Client install is required** on this machine or on the server.

### Option A — Oracle Cloud Free Tier (recommended; also solves Hostinger)
1. Create a free **Autonomous Database** at cloud.oracle.com (Always Free tier).
2. Download its **wallet** (a zip); unzip somewhere private, e.g. `./wallet/`.
3. In `.env`:
   ```
   DB_USER=ADMIN
   DB_PASSWORD=your-admin-password
   DB_CONNECT_STRING=yourdb_high        # a TNS alias from the wallet's tnsnames.ora
   ORACLE_WALLET_DIR=/absolute/path/to/wallet
   ```
4. `npm run migrate` then `npm start`.

The same wallet + connection string work unchanged from a Hostinger server — that's why this
is the recommended path.

### Option B — Local Oracle XE (native install)
Install Oracle Database XE 21c for Windows, create an app user, then set
`DB_CONNECT_STRING=localhost:1521/XEPDB1` (and matching `DB_USER`/`DB_PASSWORD`) in `.env`,
`npm run migrate`, `npm start`.

> A `docker-compose.yml` is included for anyone who later wants a containerised local Oracle
> (`npm run db:up`), but Docker is **not** required.

## Deploying to Hostinger (when ready)

Hostinger **cannot host Oracle Database itself** (shared hosting is MySQL/MariaDB; a VPS could
run anything but Oracle XE is heavy/licensing-limited). So: host the **Node app** on Hostinger
and point it at a **hosted Oracle** (Option A above).

**On a Hostinger VPS (recommended for Node + WebSocket):**
1. Install Node 20+: `nvm install 20` (or distro packages).
2. `git clone` this repo, `cd hidden-hearts`, `npm ci`.
3. Create `.env` with `NODE_ENV=production`, a strong `JWT_SECRET`, and the Oracle Cloud
   wallet settings; upload the wallet folder; `npm run migrate`.
4. Run under a process manager: `pm2 start server/src/index.js --name pyaar` (`pm2 save`,
   `pm2 startup`).
5. Put **nginx** in front as a reverse proxy to `localhost:8080`, **proxying WebSocket
   upgrades** for `/ws`, and add HTTPS via Let's Encrypt (certbot).

WebSocket nginx snippet:
```nginx
location /ws {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
```

> Hostinger's Node "web hosting" tier may not support long-lived WebSockets or custom ports —
> the **VPS** plan is the reliable target for this app.

## API

| Method | Path | Notes |
|---|---|---|
| GET  | `/api/health` | `{ ok, db, rooms, env }` |
| POST | `/api/auth/register` | `{username,password}` → `{token,user}` |
| POST | `/api/auth/login` | `{username,password}` → `{token,user}` |
| GET  | `/api/me` | auth required — profile + recent games |
| GET  | `/api/leaderboard` | top players |
| WS   | `/ws` | multiplayer rooms (see `server/src/game/rooms.js`) |

### WebSocket protocol (quick reference)
Client→server: `create`, `join {code}`, `addAI`, `begin`, `setSecret {guard,crush}`, `action {action}`.
Server→client: `hello {clientId}`, `room {seats,...}`, `state {view}`, `private {kind,text}`, `error`.

## Status / roadmap
- ✅ Backend: auth (JWT+bcrypt), leaderboard, profile, authoritative WS rooms, Oracle persistence, graceful no-DB boot.
- ✅ Shared pure engine (rules + AI) used by the server.
- 🔜 Client: currently the single-file local-play UI. Next: lobby + online-table UI wired to `/ws`, and login/leaderboard screens.

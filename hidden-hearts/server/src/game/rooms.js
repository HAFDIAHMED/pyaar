import { WebSocketServer } from 'ws';
import { customAlphabet } from 'nanoid';
import * as engine from '../../../shared/engine.js';
import { verifyToken } from '../auth.js';
import { gamesRepo, usersRepo } from '../db/store.js';

const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);
const rooms = new Map();          // code -> room
const presence = new Map();       // userId -> ws  (signed-in users with an open socket)
let nextClient = 1;

// Register / refresh a user's presence map entry. Returns the user record or null.
function bindPresence(ws, token) {
  const u = userFrom(token);
  if (!u) return null;
  // Drop any stale entry for this socket
  if (ws.userId && presence.get(ws.userId) === ws) presence.delete(ws.userId);
  ws.userId = u.id;
  ws.username = u.username;
  presence.set(u.id, ws);
  return u;
}

// room = { code, hostClient, seats:[{clientId,name,userId,isAI}], started, state, sockets:Map, aiTimer, recorded }
function newRoom(code) {
  return { code, hostClient: null, seats: [], started: false, state: null, sockets: new Map(), aiTimer: null, recorded: false };
}
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const seatOf = (room, clientId) => room.seats.findIndex(s => s.clientId === clientId);

export function attachRooms(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.id = 'c' + (nextClient++); ws.roomCode = null;
    ws.on('message', (buf) => { let m; try { m = JSON.parse(buf.toString()); } catch { return; } handle(ws, m); });
    ws.on('close', () => onClose(ws));
    send(ws, { type: 'hello', clientId: ws.id });
  });
  console.log('  WebSocket room server ready on /ws');
}

function userFrom(token) { const u = token ? verifyToken(token) : null; return u || null; }

function handle(ws, m) {
  switch (m.type) {
    case 'create': return onCreate(ws, m);
    case 'join': return onJoin(ws, m);
    case 'addAI': return onAddAI(ws, m);
    case 'leave': return onClose(ws);
    case 'begin': return onBegin(ws);            // host: lobby -> setup (deal secrets)
    case 'setSecret': return onSetSecret(ws, m);
    case 'action': return onAction(ws, m);
    case 'inviteUser': return onInviteUser(ws, m);
    case 'identify': return bindPresence(ws, m.token);   // a signed-in user opens the app
    default: send(ws, { type: 'error', error: 'unknown message' });
  }
}

// Invite an online registered user to your current room. They get a push toast.
async function onInviteUser(ws, m) {
  const room = rooms.get(ws.roomCode);
  if (!room) return send(ws, { type: 'inviteResult', ok: false, reason: 'You are not in a room.' });
  if (room.started) return send(ws, { type: 'inviteResult', ok: false, reason: 'Game already started.' });
  if (!ws.username) return send(ws, { type: 'inviteResult', ok: false, reason: 'Sign in to invite players.' });
  const target = String(m.username || '').trim();
  if (!target) return send(ws, { type: 'inviteResult', ok: false, reason: 'Type a username.' });
  if (target.toLowerCase() === ws.username.toLowerCase())
    return send(ws, { type: 'inviteResult', ok: false, reason: "You can't invite yourself." });
  let user;
  try { user = await usersRepo.findByUsername(target); }
  catch { return send(ws, { type: 'inviteResult', ok: false, reason: 'Lookup failed.' }); }
  if (!user) return send(ws, { type: 'inviteResult', ok: false, reason: `No player named "${target}".` });
  const targetWs = presence.get(user.id);
  if (!targetWs || targetWs.readyState !== 1)
    return send(ws, { type: 'inviteResult', ok: false, reason: `${user.username} is not online right now.` });
  if (targetWs.roomCode === room.code)
    return send(ws, { type: 'inviteResult', ok: false, reason: `${user.username} is already at your table.` });
  // Push the invite to them and confirm to the sender
  send(targetWs, { type: 'invite', code: room.code, from: ws.username, seats: room.seats.length });
  send(ws, { type: 'inviteResult', ok: true, message: `Invite sent to ${user.username}.` });
}

function onCreate(ws, m) {
  let code; do { code = makeCode(); } while (rooms.has(code));
  const room = newRoom(code);
  const u = bindPresence(ws, m.token);
  room.seats.push({ clientId: ws.id, name: (m.name || u?.username || 'Host').slice(0, 14), userId: u?.id ?? null, isAI: false });
  room.hostClient = ws.id;
  room.sockets.set(ws.id, ws);
  rooms.set(code, room);
  ws.roomCode = code;
  broadcastRoom(room);
}

function onJoin(ws, m) {
  const room = rooms.get((m.code || '').toUpperCase());
  if (!room) return send(ws, { type: 'error', error: 'room not found' });
  if (room.started) return send(ws, { type: 'error', error: 'game already started' });
  if (room.seats.length >= 7) return send(ws, { type: 'error', error: 'table is full (7 max)' });
  const u = bindPresence(ws, m.token);
  room.seats.push({ clientId: ws.id, name: (m.name || u?.username || 'Player').slice(0, 14), userId: u?.id ?? null, isAI: false });
  room.sockets.set(ws.id, ws);
  ws.roomCode = room.code;
  broadcastRoom(room);
}

function onAddAI(ws, m) {
  const room = rooms.get(ws.roomCode); if (!room) return;
  if (room.hostClient !== ws.id || room.started) return;
  if (room.seats.length >= 7) return send(ws, { type: 'error', error: 'table is full' });
  const aiNames = ['Rumi', 'Layla', 'Kai', 'Sol', 'Vera', 'Ash'];
  room.seats.push({ clientId: null, name: aiNames[room.seats.length % aiNames.length], userId: null, isAI: true });
  broadcastRoom(room);
}

function onBegin(ws) {
  const room = rooms.get(ws.roomCode); if (!room) return;
  if (room.hostClient !== ws.id || room.started) return;
  if (room.seats.length < 3) return send(ws, { type: 'error', error: 'need at least 3 players' });
  room.started = true;
  room.state = engine.createGame({ players: room.seats.map(s => ({ name: s.name, isAI: s.isAI, userId: s.userId })) });
  // AI seats pick their secret immediately
  room.seats.forEach((s, i) => { if (s.isAI) engine.aiSecret(room.state, i); });
  broadcastRoom(room);
  broadcastState(room);
  maybeStartPlay(room);
}

function onSetSecret(ws, m) {
  const room = rooms.get(ws.roomCode); if (!room || !room.started || room.state.phase !== 'setup') return;
  const seat = seatOf(room, ws.id); if (seat < 0) return;
  if (!engine.setSecret(room.state, seat, { crush: m.crush }))
    return send(ws, { type: 'error', error: 'invalid secret choice' });
  broadcastState(room);
  maybeStartPlay(room);
}

function maybeStartPlay(room) {
  if (room.state.phase === 'setup' && engine.allSecretsSet(room.state)) {
    engine.startPlay(room.state);
    broadcastState(room);
    driveAI(room);
  }
}

function onAction(ws, m) {
  const room = rooms.get(ws.roomCode); if (!room || !room.started) return;
  const seat = seatOf(room, ws.id); if (seat < 0) return;
  if (room.state.turn !== seat) return send(ws, { type: 'error', error: 'not your turn' });
  const res = engine.applyAction(room.state, seat, m.action || {});
  if (!res.ok) return send(ws, { type: 'error', error: res.error || 'illegal move' });
  deliverPrivate(room, res.privateOut);
  broadcastState(room);
  afterTurn(room);
}

// pace AI turns so humans can follow
function driveAI(room) {
  if (room.aiTimer) return;
  const step = () => {
    room.aiTimer = null;
    if (!room.state || room.state.over) return finish(room);
    const cur = room.seats[room.state.turn];
    if (!cur || !cur.isAI) return;            // human's turn — wait
    const action = engine.aiAction(room.state, room.state.turn);
    let res = engine.applyAction(room.state, room.state.turn, action);
    if (!res.ok) res = engine.applyAction(room.state, room.state.turn, { cardIndex: 0, discard: true }); // safety: never stall
    deliverPrivate(room, res.privateOut);
    broadcastState(room);
    afterTurn(room);
  };
  // ~1.3–2.1s of "thinking" per AI turn so a human can actually read each move
  // (and see their own play land) before the table moves on.
  room.aiTimer = setTimeout(step, 1300 + Math.floor(Math.random() * 800));
}

function afterTurn(room) {
  if (room.state.over) return finish(room);
  const cur = room.seats[room.state.turn];
  if (cur && cur.isAI) driveAI(room);
}

function finish(room) {
  if (room.state && room.state.over && !room.recorded) {
    room.recorded = true;
    persist(room).catch(e => console.error('persist failed:', e.message));
    broadcastState(room);
  }
}

async function persist(room) {
  const s = room.state;
  await gamesRepo.record({
    code: room.code, endReason: s.endReason, winnerName: s.players[s.winnerId]?.name,
    players: room.seats.map((seat, i) => {
      const p = s.players[i];
      return { userId: seat.userId, seat: i, name: p.name, isAI: p.isAI, score: p.score,
        heart: engine.statusOf(p), soulmate: p.soulmate, isWinner: i === s.winnerId };
    }),
  });
}

function deliverPrivate(room, privateOut) {
  for (const pm of (privateOut || [])) {
    const seat = room.seats[pm.to];
    if (seat && seat.clientId) send(room.sockets.get(seat.clientId), { type: 'private', kind: pm.kind, text: pm.text });
  }
}

function broadcastRoom(room) {
  const lobby = {
    type: 'room', code: room.code, started: room.started,
    hostSeat: room.seats.findIndex(s => s.clientId === room.hostClient),
    seats: room.seats.map(s => ({ name: s.name, isAI: s.isAI, registered: !!s.userId })),
  };
  for (const [cid, ws] of room.sockets) send(ws, { ...lobby, youSeat: seatOf(room, cid) });
}

function broadcastState(room) {
  if (!room.state) return;
  for (const [cid, ws] of room.sockets) {
    const seat = seatOf(room, cid);
    send(ws, { type: 'state', view: engine.publicView(room.state, seat) });
  }
}

function onClose(ws) {
  // Drop presence first so invites don't try to land on a dead socket.
  if (ws.userId && presence.get(ws.userId) === ws) presence.delete(ws.userId);
  const room = rooms.get(ws.roomCode); if (!room) return;
  room.sockets.delete(ws.id);
  // if no human sockets remain, tear the room down
  if (room.sockets.size === 0) {
    if (room.aiTimer) clearTimeout(room.aiTimer);
    rooms.delete(room.code);
  } else {
    broadcastRoom(room);
  }
}

export function roomCount() { return rooms.size; }

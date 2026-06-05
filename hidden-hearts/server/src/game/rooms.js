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

// room = { code, hostClient, seats:[{clientId,name,userId,isAI}], started, state,
//          sockets:Map, aiTimer, recorded, visibility, pending:Map(clientId -> {name, userId}) }
function newRoom(code, visibility = 'public') {
  return {
    code, hostClient: null, seats: [], started: false, state: null,
    sockets: new Map(), aiTimer: null, recorded: false,
    visibility,                          // 'public' = anyone on the floor can join, 'private' = invite/request only
    pending: new Map(),                  // clientId -> { name, userId } — guests waiting for host approval
  };
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
    case 'requestJoin': return onRequestJoin(ws, m);     // guest asks host to seat them at a private table
    case 'joinResponse': return onJoinResponse(ws, m);   // host approves / declines a pending request
    case 'setVisibility': return onSetVisibility(ws, m); // host flips public / private
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
  // Default visibility = 'public' (anyone on the floor can sit down) but the
  // "Invite a friend" flow on the home page sets visibility:'private' so the
  // table is locked from strangers.
  const vis = (m.visibility === 'private') ? 'private' : 'public';
  const room = newRoom(code, vis);
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
  // Private table: stranger can't walk in. They must request and have the host approve.
  // The exception is `m.approved === true`, which only the server itself sets when the
  // host clicks Accept on a pending request (see onJoinResponse).
  if (room.visibility === 'private' && !m.approved) {
    return queueJoinRequest(ws, room, m);
  }
  room.seats.push({ clientId: ws.id, name: (m.name || u?.username || 'Player').slice(0, 14), userId: u?.id ?? null, isAI: false });
  room.sockets.set(ws.id, ws);
  ws.roomCode = room.code;
  broadcastRoom(room);
}

// Guest asked to join a private table — queue the request and ping the host.
function onRequestJoin(ws, m) {
  const room = rooms.get((m.code || '').toUpperCase());
  if (!room) return send(ws, { type: 'requestResult', ok: false, reason: 'Table not found.' });
  if (room.started) return send(ws, { type: 'requestResult', ok: false, reason: 'Game already started.' });
  if (room.seats.length >= 7) return send(ws, { type: 'requestResult', ok: false, reason: 'Table is full.' });
  return queueJoinRequest(ws, room, m);
}

function queueJoinRequest(ws, room, m) {
  const u = bindPresence(ws, m.token);
  const name = (m.name || u?.username || 'Guest').slice(0, 14);
  room.pending.set(ws.id, { name, userId: u?.id ?? null });
  ws.requestedRoom = room.code;
  // Wire this guest into the room socket map (low-cost) so we can push
  // them the join when the host approves, without forcing a reconnect.
  if (!room.sockets.has(ws.id)) room.sockets.set(ws.id, ws);
  send(ws, { type: 'requestResult', ok: true, message: 'Waiting for the host…' });
  // Notify the host
  const hostWs = room.sockets.get(room.hostClient);
  send(hostWs, { type: 'joinRequest', clientId: ws.id, name, userId: u?.id ?? null, code: room.code });
}

// Host decided on a pending join request.
function onJoinResponse(ws, m) {
  const room = rooms.get(ws.roomCode); if (!room) return;
  if (room.hostClient !== ws.id) return;
  const cid = m.clientId; const pending = room.pending.get(cid);
  if (!pending) return;
  const guestWs = room.sockets.get(cid);
  room.pending.delete(cid);
  if (!guestWs || guestWs.readyState !== 1) return broadcastRoom(room);
  if (m.accept) {
    // Seat them now (skip the private-gate via the synthetic `approved` flag).
    room.seats.push({ clientId: cid, name: pending.name, userId: pending.userId, isAI: false });
    guestWs.roomCode = room.code;
    guestWs.requestedRoom = null;
    send(guestWs, { type: 'requestResult', ok: true, message: 'Host accepted! Sitting you down…' });
    broadcastRoom(room);
  } else {
    send(guestWs, { type: 'requestResult', ok: false, declined: true, reason: 'Host declined your request.' });
    if (room.sockets.get(cid) === guestWs && guestWs.roomCode !== room.code) {
      // they weren't a real seat yet — remove from socket map
      room.sockets.delete(cid);
    }
    broadcastRoom(room);
  }
}

// Host flips a table's visibility public <-> private.
function onSetVisibility(ws, m) {
  const room = rooms.get(ws.roomCode); if (!room) return;
  if (room.hostClient !== ws.id || room.started) return;
  room.visibility = (m.visibility === 'private') ? 'private' : 'public';
  broadcastRoom(room);
}

// Public, lightweight snapshot of every live room — used by /api/tables and
// by the home-screen casino-floor view.
export function listOpenTables() {
  const out = [];
  for (const [, room] of rooms) {
    const host = room.seats.find(s => s.clientId === room.hostClient);
    out.push({
      code: room.code,
      hostName: host ? host.name : '—',
      seatCount: room.seats.length,
      maxSeats: 7,
      started: room.started,
      visibility: room.visibility,
      // Names only — never expose userId/clientId to anonymous floor visitors.
      seats: room.seats.map(s => ({ name: s.name, isAI: s.isAI })),
    });
  }
  // Newest-feeling tables first: not started before started, more open seats before fewer.
  out.sort((a, b) => (a.started - b.started) || ((b.maxSeats - b.seatCount) - (a.maxSeats - a.seatCount)));
  return out;
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
    if (!seat || !seat.clientId) continue;
    // Forward both legacy 'text' and the new structured 'event' so the
    // client can translate via i18n. New games will carry pm.event.
    send(room.sockets.get(seat.clientId), { type: 'private', kind: pm.kind, text: pm.text, event: pm.event });
  }
}

function broadcastRoom(room) {
  const lobby = {
    type: 'room', code: room.code, started: room.started,
    hostSeat: room.seats.findIndex(s => s.clientId === room.hostClient),
    visibility: room.visibility,
    seats: room.seats.map(s => ({ name: s.name, isAI: s.isAI, registered: !!s.userId })),
  };
  // Only the host sees the pending-requests list.
  const hostPending = Array.from(room.pending.entries()).map(([cid, p]) => ({ clientId: cid, name: p.name }));
  for (const [cid, ws] of room.sockets) {
    const isHost = cid === room.hostClient;
    const youSeat = seatOf(room, cid);
    // A guest waiting on a private table has no seat yet (youSeat === -1) but
    // is in the socket map. They get the lobby preview without a seat.
    send(ws, { ...lobby, youSeat, pending: isHost ? hostPending : undefined });
  }
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
  // If this guest was waiting on a private table, drop the pending request too.
  if (ws.requestedRoom) {
    const r = rooms.get(ws.requestedRoom);
    if (r && r.pending.delete(ws.id)) { r.sockets.delete(ws.id); broadcastRoom(r); }
    ws.requestedRoom = null;
  }
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

// List currently-online signed-in users — used by the home-page friends strip.
// We only know about users who hit `identify` with a valid token, so the list
// is a real "who's at the casino right now". No userIds leak, just usernames.
export function listOnlineUsers() {
  const out = [];
  for (const [, ws] of presence) {
    if (ws && ws.readyState === 1 && ws.username) out.push({ username: ws.username });
  }
  return out;
}

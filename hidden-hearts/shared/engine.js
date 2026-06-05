// ============================================================================
// PYAAR — BUILD YOUR LOVE · pure game engine (crush-central edition).
// Build your romance up 3 stages, then COMMIT — you only win if your secret
// crush loves you back (Soulmates). Scout with Glance, chase with Sway, sabotage
// with Heartbreak, shield with Guardian. No DOM/audio/network.
// ============================================================================

export const SEATS = [
  { name: 'Rose', icon: '🌹' }, { name: 'Lotus', icon: '🪷' }, { name: 'Moon', icon: '🌙' },
  { name: 'Flame', icon: '🔥' }, { name: 'Peacock', icon: '🦚' }, { name: 'Jasmine', icon: '🌼' },
  { name: 'Star', icon: '⭐' }, { name: 'Dove', icon: '🕊️' },
];

export const STAGES = ['', '✨', '🌹', '💋'];                          // 0..3 (3 = ready to commit)
export const STAGE_NAMES = ['—', 'Spark', 'Dating', 'Crazy for them'];
export const READY = 3;                                                // commit from here

export const CARD = {
  MOMENT:     { icon: '❤️', fam: 'love',     needsTarget: 'self',  tag: 'Grow closer.',      desc: 'Advance your romance. At stage 3, Commit to win — if they love you back.' },
  GLANCE:     { icon: '👀', fam: 'info',     needsTarget: 'other', tag: 'Scout a heart.',    desc: 'Secretly see who a player fancies — check before you commit!' },
  SWAY:       { icon: '💘', fam: 'self2',    needsTarget: 'other', tag: 'Fall for another.', desc: 'Re-aim your crush at someone new (your romance cools one stage).' },
  HEARTBREAK: { icon: '💔', fam: 'attack',   needsTarget: 'other', tag: 'Break a heart.',    desc: 'Knock any rival back one stage.' },
  JEALOUSY:   { icon: '💚', fam: 'jealousy', needsTarget: 'other', tag: 'Green with envy.',  desc: "Hit a rival at Dating or closer: knock them back a stage AND expose their secret crush to everyone." },
  GUARDIAN:   { icon: '🛡️', fam: 'block',    needsTarget: 'self',  tag: 'Guard your love.',  desc: 'Block the next Heartbreak, Jealousy or Friendzone on you.' },
  FRIENDZONE: { icon: '🤝', fam: 'block2',   needsTarget: 'other', tag: 'Just friends.',     desc: 'A rival loses their next turn.' },
};
// 52-card deck (sim-tuned, config "D3"). Guardian scarce (4, down from 6) so setbacks land;
// Jealousy (4) is the gated anti-leader/expose card; Heartbreak eased to 5 and Moment raised
// to 21 so players can still close. Yields ~93/70/44% decisive (Commit) endings at 3/4/5p,
// winner in mutual love 98/86/74%, seats fair to ~3pt, 0 illegal actions.
export const DECK_COMP = { MOMENT: 21, GLANCE: 8, SWAY: 5, HEARTBREAK: 5, JEALOUSY: 4, GUARDIAN: 4, FRIENDZONE: 5 };

const rndInt = (rng, n) => Math.floor(rng() * n);
const pick = (rng, a) => a[rndInt(rng, a.length)];
function shuffle(rng, a) { for (let i = a.length - 1; i > 0; i--) { const j = rndInt(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const byId = (s, id) => (id == null ? null : s.players.find(p => p.id === id));
const others = (s, p) => s.players.filter(q => q.id !== p.id);
const current = (s) => s.players[s.turn];
const mutual = (s, p) => p.crush != null && byId(s, p.crush)?.crush === p.id;
function log(s, m) { s.log.unshift(m); if (s.log.length > 60) s.log.pop(); }
function newDeck(rng) { const d = []; for (const [k, n] of Object.entries(DECK_COMP)) for (let i = 0; i < n; i++) d.push(k); return shuffle(rng, d); }
export { current, mutual };

export function createGame({ players, code = null, rng = Math.random }) {
  const ps = players.map((p, i) => ({
    id: i, name: p.name, isAI: !!p.isAI, userId: p.userId ?? null, seat: SEATS[i % SEATS.length],
    hand: [], crush: null, stage: 0, shield: false, frozen: false, hbImmune: false, skipNext: false, revealed: false,
    score: 0, soulmate: false, won: false,
  }));
  return { code, players: ps, deck: newDeck(rng), discard: [], turn: 0, startSeat: 0,
    phase: 'setup', over: false, winnerId: null, endReason: null, log: [], _privateOut: [], _rng: rng };
}
export function setSecret(s, playerId, { crush }) {
  const p = byId(s, playerId);
  if (!p || s.phase !== 'setup' || crush === playerId || !byId(s, crush)) return false;
  p.crush = crush; return true;
}
export function aiSecret(s, playerId, rng = Math.random) { const p = byId(s, playerId); return setSecret(s, playerId, { crush: pick(rng, others(s, p)).id }); }
export function allSecretsSet(s) { return s.players.every(p => p.crush != null); }

export function startPlay(s, rng = Math.random) {
  if (s.phase !== 'setup' || !allSecretsSet(s)) return false;
  for (const p of s.players) draw(s, p, 3);
  s.startSeat = rndInt(rng, s.players.length); s.turn = s.startSeat; s.phase = 'play';
  log(s, { k: 'firstMove', icon: current(s).seat.icon, name: current(s).name });
  beginTurn(s); return true;
}
function draw(s, p, n = 1) { let g = 0; for (let i = 0; i < n; i++) { if (!s.deck.length) break; p.hand.push(s.deck.pop()); g++; } return g; }

function beginTurn(s) {
  if (s.over) return;
  if (s.deck.length === 0) { endGame(s, 'timeout'); return; }
  const p = current(s);
  p.hbImmune = false;
  if (p.frozen || p.skipNext) { const k = p.frozen ? 'skipFrozen' : 'skipBroken'; p.frozen = false; p.skipNext = false; log(s, { k, icon: p.seat.icon, name: p.name }); advance(s); return; }
  draw(s, p);
}
function advance(s) { s.turn = (s.turn + 1) % s.players.length; beginTurn(s); }
function endTurn(s) { advance(s); }

export function legalActions(s, playerId) {
  if (s.over || s.phase !== 'play' || s.turn !== playerId) return [];
  const p = byId(s, playerId);
  const someProgress = others(s, p).some(q => q.stage > 0 && !q.hbImmune && !q.shield);
  const someRival = others(s, p).some(q => q.stage >= 2);                 // someone Dating+ to envy
  return p.hand.map((card, i) => {
    let disabled = false;
    if (card === 'GUARDIAN') disabled = p.shield;
    if (card === 'HEARTBREAK') disabled = !someProgress;
    if (card === 'JEALOUSY') disabled = !someRival;
    return { cardIndex: i, card, needsTarget: CARD[card].needsTarget, isCommit: card === 'MOMENT' && p.stage >= READY, disabled };
  });
}

export function applyAction(s, playerId, action, rng = Math.random) {
  if (s.over || s.phase !== 'play') return { ok: false, error: 'not in play' };
  if (s.turn !== playerId) return { ok: false, error: 'not your turn' };
  const p = byId(s, playerId);
  const idx = action.cardIndex;
  if (idx == null || idx < 0 || idx >= p.hand.length) return { ok: false, error: 'bad card' };
  const card = p.hand[idx];

  s._privateOut = [];
  if (action.discard) { p.hand.splice(idx, 1); s.discard.push(card); log(s, { k: 'discard', icon: p.seat.icon, name: p.name }); endTurn(s); return { ok: true, privateOut: [] }; }

  const t = (CARD[card].needsTarget === 'other') ? byId(s, action.target) : null;
  if (CARD[card].needsTarget === 'other' && (!t || t.id === p.id)) return { ok: false, error: 'choose another player' };

  p.hand.splice(idx, 1); s.discard.push(card);

  // Every log event is a structured object so the client can translate it
  // via i18n. Shape: { k: 'eventKey', ...params }.
  const A = { aIcon: p.seat.icon, aName: p.name };
  const T = t ? { tIcon: t.seat.icon, tName: t.name } : {};
  if (card === 'MOMENT') {
    if (p.stage < READY) { p.stage++; log(s, { k: 'grow', ...A, stage: p.stage }); }
    else {                                  // COMMIT — the gamble
      const o = byId(s, p.crush);
      const oTag = { tIcon: o.seat.icon, tName: o.name };
      if (mutual(s, p)) { log(s, { k: 'commitMutual', ...A, ...oTag }); endGame(s, 'devotion', p.id); }
      else { p.stage = READY - 1; p.skipNext = true; p.revealed = true; log(s, { k: 'commitReject', ...A, ...oTag }); }
    }
  } else if (card === 'GLANCE') {
    const o = byId(s, t.crush);
    // Send structured event so the client can render in the user's language.
    s._privateOut.push({
      to: p.id, kind: 'peek',
      event: o
        ? { k: 'peekKnown', tIcon: t.seat.icon, tName: t.name, oIcon: o.seat.icon, oName: o.name }
        : { k: 'peekEmpty', tIcon: t.seat.icon, tName: t.name },
    });
    log(s, { k: 'glance', ...A });
  } else if (card === 'SWAY') {
    p.crush = t.id; p.stage = Math.max(0, p.stage - 1);
    log(s, { k: 'sway', ...A, stage: p.stage });
  } else if (card === 'HEARTBREAK') {
    if (t.shield) { t.shield = false; log(s, { k: 'breakShield', ...A, ...T }); }
    else if (t.hbImmune) { log(s, { k: 'breakImmune', ...A, ...T }); }
    else if (t.stage > 0) { t.stage--; t.hbImmune = true; log(s, { k: 'breakHit', ...A, ...T, stage: t.stage }); }
    else log(s, { k: 'breakNone', ...A, ...T });
  } else if (card === 'JEALOUSY') {
    if (t.shield) { t.shield = false; log(s, { k: 'jealousyShield', ...A, ...T }); }
    else {
      const wasHidden = !t.revealed;
      t.revealed = true;                                   // the spite: their crush is now public
      const o = byId(s, t.crush);
      const exposeFields = o ? { cIcon: o.seat.icon, cName: o.name } : {};
      const hasCrush = !!o;
      if (!t.hbImmune && t.stage > 0) { t.stage--; t.hbImmune = true; log(s, { k: hasCrush ? 'jealousyHitExpose' : 'jealousyHitExposeEmpty', ...A, ...T, ...exposeFields, stage: t.stage }); }
      else log(s, { k: (wasHidden ? (hasCrush ? 'jealousyExposeNew' : 'jealousyExposeNewEmpty') : (hasCrush ? 'jealousyExposeAgain' : 'jealousyExposeAgainEmpty')), ...A, ...T, ...exposeFields });
    }
  } else if (card === 'GUARDIAN') {
    p.shield = true; log(s, { k: 'guardian', ...A });
  } else if (card === 'FRIENDZONE') {
    if (t.shield) { t.shield = false; log(s, { k: 'friendzoneShield', ...A, ...T }); }
    else { t.frozen = true; log(s, { k: 'friendzoneHit', ...A, ...T }); }
  }

  if (!s.over) endTurn(s);
  const out = s._privateOut; s._privateOut = [];
  return { ok: true, privateOut: out };
}

// ---------- AI (sees full state; humans must scout) ----------
export function aiAction(s, playerId, rng = Math.random) {
  const p = byId(s, playerId); const hand = p.hand; const has = k => hand.indexOf(k);
  const A = (c, e = {}) => ({ cardIndex: c, ...e });
  const foes = others(s, p);
  const hittable = q => q.stage > 0 && !q.shield && !q.hbImmune;
  const enviable = q => q.stage >= 2 && !q.shield && !q.hbImmune;        // Jealousy lands a knockback here
  const lead = list => list.slice().sort((a, b) => b.stage - a.stage || (rng() - 0.5))[0];
  const admirers = foes.filter(q => q.crush === p.id);

  // 1) win: at the brink and it's mutual → commit
  if (has('MOMENT') >= 0 && p.stage >= READY && mutual(s, p)) return A(has('MOMENT'));
  // 2) stop a rival at the brink who is mutual (about to win)
  const threats = foes.filter(q => q.stage >= READY && mutual(s, q));
  if (threats.length && has('HEARTBREAK') >= 0) { const h = threats.filter(hittable); if (h.length) return A(has('HEARTBREAK'), { target: pick(rng, h).id }); }
  if (threats.length && has('JEALOUSY') >= 0) { const j = threats.filter(enviable); if (j.length) return A(has('JEALOUSY'), { target: pick(rng, j).id }); }
  if (threats.length && has('FRIENDZONE') >= 0) { const f = threats.filter(q => !q.frozen && !q.shield); if (f.length) return A(has('FRIENDZONE'), { target: pick(rng, f).id }); }
  // 3) shield when at the brink & threatened
  if (has('GUARDIAN') >= 0 && !p.shield && p.stage >= READY - 1 && foes.some(q => q.stage >= p.stage - 1)) return A(has('GUARDIAN'));
  // 4) if not mutual, sometimes steer toward a mutual: aim at an admirer (cheaper while low).
  //    Gated by chance so the AI doesn't *reliably* reciprocate whoever fancies it —
  //    that made soulmates near-guaranteed (especially for a human, who keeps one crush).
  if (!mutual(s, p) && admirers.length && has('SWAY') >= 0 && (p.stage <= 1 || p.crush == null) && rng() < 0.35) return A(has('SWAY'), { target: pick(rng, admirers).id });
  // 5) build
  if (has('MOMENT') >= 0 && (p.stage < READY || mutual(s, p))) return A(has('MOMENT'));
  // 6) knock back the leader — Jealousy first (also exposes them) when they're Dating+
  if (has('JEALOUSY') >= 0) { const opts = foes.filter(enviable); if (opts.length) return A(has('JEALOUSY'), { target: lead(opts).id }); }
  if (has('HEARTBREAK') >= 0) { const opts = foes.filter(hittable); if (opts.length) return A(has('HEARTBREAK'), { target: lead(opts).id }); }
  // 7) still not mutual & stuck at the brink → sometimes pivot to an admirer
  if (!mutual(s, p) && admirers.length && has('SWAY') >= 0 && rng() < 0.35) return A(has('SWAY'), { target: pick(rng, admirers).id });
  if (has('FRIENDZONE') >= 0) { const opts = foes.filter(q => !q.frozen && q.stage > 0 && !q.shield); if (opts.length) return A(has('FRIENDZONE'), { target: lead(opts).id }); }
  if (has('GLANCE') >= 0) return A(has('GLANCE'), { target: pick(rng, foes).id });
  if (has('GUARDIAN') >= 0 && !p.shield) return A(has('GUARDIAN'));
  // fallback
  for (let i = 0; i < hand.length; i++) {
    const k = hand[i];
    if (k === 'GUARDIAN' && p.shield) continue;
    if (k === 'HEARTBREAK' && !foes.some(hittable)) continue;
    if (k === 'JEALOUSY' && !foes.some(q => q.stage >= 2)) continue;     // no one Dating+ to envy
    if (k === 'MOMENT' && p.stage >= READY && !mutual(s, p)) continue;   // don't commit into a sure rejection
    const a = { cardIndex: i };
    if (CARD[k].needsTarget === 'other') {
      let tgt;
      if (k === 'HEARTBREAK') tgt = lead(foes.filter(hittable));
      else if (k === 'JEALOUSY') tgt = lead(foes.filter(q => q.stage >= 2));
      else if (k === 'SWAY' && admirers.length && rng() < 0.5) tgt = pick(rng, admirers);
      else tgt = pick(rng, foes);
      a.target = (tgt || pick(rng, foes)).id;
    }
    return a;
  }
  return A(0, { discard: true });
}

function endGame(s, reason, winnerId = null) {
  if (s.over) return;
  s.over = true; s.endReason = reason; s.phase = 'over';
  for (const p of s.players) if (mutual(s, p)) p.soulmate = true;
  if (reason === 'devotion') {
    const w = byId(s, winnerId); w.won = true; w.score = 5; w.soulmate = true; s.winnerId = w.id;
    const o = byId(s, w.crush); if (o) { o.soulmate = true; o.score = Math.max(o.score, 3); }
  } else {
    const mx = Math.max(...s.players.map(p => p.stage));
    const cands = s.players.filter(p => p.stage === mx);
    const souls = cands.filter(p => p.soulmate);
    const pool = souls.length ? souls : cands;
    const w = pool[Math.floor((s._rng || Math.random)() * pool.length)];
    w.won = true; w.score = 3; s.winnerId = w.id;
    log(s, { k: 'deckOut', icon: w.seat.icon, name: w.name });
  }
}

export function publicView(s, viewerId) {
  return {
    code: s.code, phase: s.phase, turn: s.turn, over: s.over, winnerId: s.winnerId, endReason: s.endReason,
    deckCount: s.deck.length, discardTop: s.discard[s.discard.length - 1] || null,
    log: s.log.slice(0, 8), youAre: viewerId,
    players: s.players.map(p => {
      const me = p.id === viewerId; const reveal = s.over || me || p.revealed;
      return {
        id: p.id, name: p.name, isAI: p.isAI, seat: p.seat,
        stage: p.stage, ready: p.stage >= READY, shield: p.shield, frozen: p.frozen, revealed: p.revealed,
        crush: reveal ? p.crush : undefined,
        handCount: p.hand.length, hand: me ? p.hand : undefined,
        won: s.over ? p.won : undefined, soulmate: s.over ? p.soulmate : undefined, score: s.over ? p.score : undefined,
      };
    }),
  };
}

export function statusOf(p) { return p.won ? 'won' : p.soulmate ? 'mutual' : `stage ${p.stage}`; }

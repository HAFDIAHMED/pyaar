// ============================================================================
// PYAAR — Hidden Hearts · pure game engine (framework-agnostic).
// No DOM, no audio, no network. Used by the server authoritatively and can be
// reused by the client for local/AI play. ESM — works in Node and the browser.
// ============================================================================

export const SEATS = [
  { name: 'Rose', icon: '🌹' }, { name: 'Lotus', icon: '🪷' }, { name: 'Moon', icon: '🌙' },
  { name: 'Flame', icon: '🔥' }, { name: 'Peacock', icon: '🦚' }, { name: 'Jasmine', icon: '🌼' }, { name: 'Star', icon: '⭐' },
];

export const CHARACTERS = {
  WARRIOR:  { icon: '⚔', name: 'Warrior',  perk: 'Bodyguard — cancel the 1st Heartbreak on you.' },
  SAGE:     { icon: '✦', name: 'Sage',     perk: "Insight — peek a rival's crush at setup." },
  TRAITOR:  { icon: '⚯', name: 'Traitor',  perk: 'Spite — if you break, drag down an attacker.' },
  FOOL:     { icon: '◊', name: 'Fool',     perk: 'Slippery — immune to the 1st Friendzone.' },
  GUARDIAN: { icon: '⚜', name: 'Guardian', perk: 'Fortress — needs 3 hits to break, not 2.' },
  DREAMER:  { icon: '☾', name: 'Dreamer',  perk: 'Vanish — once, be untouchable for a round.' },
  SOLDIER:  { icon: '⚑', name: 'Soldier',  perk: 'Vanguard — draw +1 on your first 3 turns.' },
};
export const CHAR_KEYS = Object.keys(CHARACTERS);

export const CARD = {
  HEARTBREAK: { icon: '💔', fam: 'attack',     tag: 'Break a heart.',  needsTarget: 'other' },
  SOLDIER:    { icon: '⚑', fam: 'attack',     tag: 'Advance.',        needsTarget: 'other' },
  WARRIOR:    { icon: '⚔', fam: 'defense',    tag: 'Shield.',         needsTarget: 'self' },
  FRIENDZONE: { icon: '🤝', fam: 'defense',    tag: 'Just friends.',   needsTarget: 'other' },
  DREAMER:    { icon: '☾', fam: 'defense',    tag: 'Daydream.',       needsTarget: 'self' },
  SAGE:       { icon: '✦', fam: 'info',       tag: 'Insight.',        needsTarget: 'peek' },
  TRAITOR:    { icon: '⚯', fam: 'disruption', tag: 'Betrayal.',       needsTarget: 'other' },
  FOOL:       { icon: '◊', fam: 'disruption', tag: 'Wild.',           needsTarget: 'wild' },
  CRUSH:      { icon: '💘', fam: 'love',       tag: 'Send a sign.',    needsTarget: 'other' },
  DEVOTION:   { icon: '💍', fam: 'devotion',   tag: 'True love.',      needsTarget: 'devotion' },
};
export const DECK_COMP = { HEARTBREAK: 9, SOLDIER: 8, WARRIOR: 9, FRIENDZONE: 8, DREAMER: 6, SAGE: 7, TRAITOR: 7, FOOL: 6, CRUSH: 7, DEVOTION: 3 };

// ---------- helpers ----------
const rndInt = (rng, n) => Math.floor(rng() * n);
const pick = (rng, a) => a[rndInt(rng, a.length)];
function shuffle(rng, a) { for (let i = a.length - 1; i > 0; i--) { const j = rndInt(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function heartState(p) {
  const threshold = p.guard === 'GUARDIAN' ? 3 : 2;
  if (p.hits <= 0) return 'whole';
  return p.hits >= threshold ? 'broken' : 'cracked';
}
const alive = (p) => heartState(p) !== 'broken';
const others = (s, p) => s.players.filter(q => q.id !== p.id);
const byId = (s, id) => s.players.find(p => p.id === id);
function log(s, msg) { s.log.unshift(msg); if (s.log.length > 60) s.log.pop(); }
function isVoided(s, a, b) { return s.voided.some(([x, y]) => (x === a && y === b) || (x === b && y === a)); }

function newDeck(rng) {
  const d = [];
  for (const [k, n] of Object.entries(DECK_COMP)) for (let i = 0; i < n; i++) d.push(k);
  return shuffle(rng, d);
}

// ---------- lifecycle ----------
export function createGame({ players, code = null, rng = Math.random }) {
  const ps = players.map((p, i) => ({
    id: i, name: p.name, isAI: !!p.isAI, userId: p.userId ?? null, seat: SEATS[i],
    hand: [], guard: null, crush: null,
    hits: 0, protectors: 0, untouchable: false,
    usedBodyguard: false, usedSlippery: false, sagePeeked: false,
    turnsTaken: 0, publicCrushesFrom: [], crushedTrueTarget: false, soulmate: false,
  }));
  return {
    code, players: ps, deck: newDeck(rng), discard: [],
    turn: 0, phase: 'setup', voided: [], log: [],
    over: false, winnerId: null, endReason: null,
  };
}

export function setSecret(s, playerId, { guard, crush }) {
  const p = byId(s, playerId);
  if (!p || s.phase !== 'setup') return false;
  if (!CHAR_KEYS.includes(guard)) return false;
  if (crush === playerId || !byId(s, crush)) return false;
  p.guard = guard; p.crush = crush;
  return true;
}
export function allSecretsSet(s) { return s.players.every(p => p.guard != null && p.crush != null); }

// AI fills its own secret choices
export function aiSecret(s, playerId, rng = Math.random) {
  const p = byId(s, playerId);
  return setSecret(s, playerId, { guard: pick(rng, CHAR_KEYS), crush: pick(rng, others(s, p)).id });
}

export function startPlay(s, rng = Math.random) {
  if (s.phase !== 'setup' || !allSecretsSet(s)) return false;
  for (const p of s.players) for (let i = 0; i < 5; i++) draw(s, p);
  // Randomise who opens — removes the systematic last-mover seat advantage.
  s.startSeat = Math.floor(rng() * s.players.length);
  s.phase = 'play'; s.turn = s.startSeat;
  log(s, `All hearts are set. ${s.players[s.turn].seat.icon} ${s.players[s.turn].name} opens — let the courting begin.`);
  beginTurn(s);
  return true;
}

function draw(s, p, n = 1) { let got = 0; for (let i = 0; i < n; i++) { if (!s.deck.length) break; p.hand.push(s.deck.pop()); got++; } return got; }

// Called at the start of a player's turn (single deck pass = the game clock).
function beginTurn(s) {
  if (s.over) return;
  if (s.deck.length === 0) { endGame(s, 'the cards have run out'); return; }
  const p = s.players[s.turn];
  const extra = (p.guard === 'SOLDIER' && p.turnsTaken < 3) ? 1 : 0;
  draw(s, p, 1 + extra);
  p.untouchable = false;
  // Sage perk: a one-time private peek (delivered as a private event by the caller)
  if (p.guard === 'SAGE' && !p.sagePeeked) {
    p.sagePeeked = true;
    if (s._privateOut && !p.isAI) {
      const t = others(s, p)[rndIntDeterministic(s, others(s, p).length)];
      const obj = byId(s, t.crush);
      s._privateOut.push({ to: p.id, kind: 'peek', text: `${t.seat.icon} ${t.name}'s heart secretly points at ${obj.seat.icon} ${obj.name}.` });
    }
  }
}
// minimal deterministic-ish index for the sage peek (avoids needing rng here)
function rndIntDeterministic(s, n) { return (s.turn * 7 + s.players[s.turn].turnsTaken) % Math.max(1, n); }

export const current = (s) => s.players[s.turn];

// ---------- legality ----------
// All cards in hand are playable on your turn; targets are chosen by the player.
// This returns the hand with per-card targeting metadata for the UI.
export function legalActions(s, playerId) {
  if (s.over || s.phase !== 'play' || s.turn !== playerId) return [];
  const p = byId(s, playerId);
  return p.hand.map((card, i) => ({
    cardIndex: i, card, needsTarget: CARD[card].needsTarget,
    targets: CARD[card].needsTarget === 'other' || CARD[card].needsTarget === 'wild'
      ? others(s, p).map(q => q.id) : [],
  }));
}

// ---------- apply an action ----------
// action: { cardIndex, target?, as?, peek?:{what,target}, mode?:'repair'|'declare' }
// Returns { ok, error?, privateOut:[{to,kind,text}] }
export function applyAction(s, playerId, action, rng = Math.random) {
  if (s.over || s.phase !== 'play') return { ok: false, error: 'not in play' };
  if (s.turn !== playerId) return { ok: false, error: 'not your turn' };
  const p = byId(s, playerId);
  const idx = action.cardIndex;
  if (idx == null || idx < 0 || idx >= p.hand.length) return { ok: false, error: 'bad card' };
  const card = p.hand[idx];

  s._privateOut = [];

  // FOOL copies another card; resolve as that key (no second discard)
  let key = card, opt = action;
  if (card === 'FOOL') {
    key = action.as || 'HEARTBREAK';
    if (!CARD[key] || key === 'FOOL' || key === 'DEVOTION') key = 'HEARTBREAK';
  }

  // remove played card → discard
  p.hand.splice(idx, 1); s.discard.push(card);

  const ok = applyEffect(s, p, key, opt, rng);
  if (!ok.ok) { /* effect still consumed the card; treat as played-but-fizzled */ }

  if (!s.over) endTurn(s, rng);
  const out = s._privateOut; s._privateOut = null;
  return { ok: true, privateOut: out };
}

function applyEffect(s, me, key, opt, rng) {
  if (key === 'WARRIOR') { me.protectors++; log(s, `${me.seat.icon} ${me.name} raises a ⚔ Warrior. (🛡×${me.protectors})`); return { ok: true }; }
  if (key === 'DREAMER') { me.untouchable = true; log(s, `${me.seat.icon} ${me.name} drifts into a ☾ daydream — untouchable.`); return { ok: true }; }
  if (key === 'SAGE') {
    const peek = opt.peek; const t = peek && byId(s, peek.target);
    if (t) {
      const text = peek.what === 'guard'
        ? `${t.seat.icon} ${t.name} is guarded by ${CHARACTERS[t.guard].icon} the ${CHARACTERS[t.guard].name}.`
        : `${t.seat.icon} ${t.name}'s heart points at ${byId(s, t.crush).seat.icon} ${byId(s, t.crush).name}.`;
      s._privateOut.push({ to: me.id, kind: 'peek', text });
    }
    log(s, `${me.seat.icon} ${me.name} studies a secret. ✦`);
    return { ok: true };
  }
  if (key === 'DEVOTION') {
    if (opt.mode === 'declare') {
      const obj = byId(s, me.crush);
      const mutual = obj.crush === me.id && !isVoided(s, me.id, obj.id);
      log(s, `${me.seat.icon} ${me.name} declares true love for ${obj.seat.icon} ${obj.name}!`);
      if (mutual) { me.soulmate = true; obj.soulmate = true; me.crushedTrueTarget = true; endGame(s, 'a Soulmate bond was declared'); }
      return { ok: true };
    }
    if (me.hits > 0) me.hits--;
    log(s, `${me.seat.icon} ${me.name} renews their Heart with devotion. ❤️`);
    return { ok: true };
  }

  const t = byId(s, opt.target);
  if (!t) return { ok: false, error: 'bad target' };

  if (key === 'CRUSH') {
    t.publicCrushesFrom.push(me.id);
    if (t.id === me.crush) me.crushedTrueTarget = true;
    log(s, `${me.seat.icon} ${me.name} sends a 💘 to ${t.seat.icon} ${t.name}…`);
    return { ok: true };
  }
  if (key === 'FRIENDZONE') {
    if (t.guard === 'FOOL' && !t.usedSlippery) { t.usedSlippery = true; log(s, `${t.seat.icon} ${t.name} slips the Friendzone (Fool).`); return { ok: true }; }
    s.voided.push([me.id, t.id]);
    log(s, `${me.seat.icon} ${me.name} 🤝 friendzones ${t.seat.icon} ${t.name}.`);
    return { ok: true };
  }
  if (key === 'TRAITOR') {
    if (t.untouchable) { log(s, `${me.seat.icon} ${me.name}'s betrayal finds only mist.`); return { ok: true }; }
    if (t.hand.length) { const stolen = t.hand.splice(rndInt(rng, t.hand.length), 1)[0]; me.hand.push(stolen); log(s, `${me.seat.icon} ${me.name} ⚯ steals a card from ${t.seat.icon} ${t.name}.`); }
    else log(s, `${me.seat.icon} ${me.name} finds ${t.seat.icon} ${t.name}'s hand empty.`);
    return { ok: true };
  }
  if (key === 'HEARTBREAK' || key === 'SOLDIER') {
    if (t.untouchable) { log(s, `${t.seat.icon} ${t.name} is untouchable — the blow misses.`); return { ok: true }; }
    if (key === 'HEARTBREAK' && t.guard === 'WARRIOR' && !t.usedBodyguard) { t.usedBodyguard = true; log(s, `${t.seat.icon} ${t.name}'s ⚔ Bodyguard turns aside the first Heartbreak.`); return { ok: true }; }
    if (t.protectors > 0) { t.protectors--; log(s, `${me.seat.icon} ${me.name} ${CARD[key].icon} strips a Protector from ${t.seat.icon} ${t.name}. (🛡×${t.protectors})`); return { ok: true }; }
    if (key === 'SOLDIER') { log(s, `${me.seat.icon} ${me.name}'s ⚑ Soldier advances — the bare Heart holds.`); return { ok: true }; }
    t.hits++;
    const st = heartState(t);
    log(s, `${me.seat.icon} ${me.name} 💔 wounds ${t.seat.icon} ${t.name}'s Heart — now ${st}.`);
    if (st === 'broken') {
      log(s, `💔 ${t.seat.icon} ${t.name}'s Heart is BROKEN.`);
      if (t.guard === 'TRAITOR') {
        if (me.protectors > 0) { me.protectors--; log(s, `${t.seat.icon} ${t.name}'s ⚯ Spite tears a Protector from ${me.seat.icon} ${me.name}!`); }
        else { me.hits++; log(s, `${t.seat.icon} ${t.name}'s ⚯ Spite wounds ${me.seat.icon} ${me.name}!`); }
      }
      if (s.players.filter(alive).length <= 1) endGame(s, 'only one heart still beats');
    }
    return { ok: true };
  }
  return { ok: false, error: 'unknown card' };
}

function endTurn(s, rng) {
  const p = current(s);
  p.turnsTaken++;
  while (p.hand.length > 7) s.discard.push(p.hand.splice(rndInt(rng, p.hand.length), 1)[0]);
  if (s.over) return;
  s.turn = (s.turn + 1) % s.players.length;
  beginTurn(s);
}

// ---------- AI ----------
export function aiAction(s, playerId, rng = Math.random) {
  const p = byId(s, playerId);
  const hand = p.hand;
  const foes = others(s, p).filter(alive);
  const pool = foes.length ? foes : others(s, p);
  const has = k => hand.indexOf(k);
  const A = (cardIndex, extra = {}) => ({ cardIndex, ...extra });

  if (p.hits > 0 && has('WARRIOR') >= 0 && p.protectors < 2) return A(has('WARRIOR'));
  if (p.protectors === 0 && has('WARRIOR') >= 0 && rng() < 0.5) return A(has('WARRIOR'));
  if (p.hits > 0 && has('DEVOTION') >= 0 && rng() < 0.6) return A(has('DEVOTION'), { mode: 'repair' });
  if (has('CRUSH') >= 0 && rng() < 0.55) { const tgt = alive(byId(s, p.crush)) ? p.crush : pick(rng, pool).id; return A(has('CRUSH'), { target: tgt }); }
  if (has('HEARTBREAK') >= 0 && foes.length) {
    const bare = foes.filter(q => q.protectors === 0 && !q.untouchable);
    let t;
    if (bare.length) { const mx = Math.max(...bare.map(q => q.hits)); t = pick(rng, bare.filter(q => q.hits === mx)); } // random among most-wounded (no seat bias)
    else t = pick(rng, foes);
    return A(has('HEARTBREAK'), { target: t.id });
  }
  if (has('SOLDIER') >= 0) { const wp = foes.filter(q => q.protectors > 0); if (wp.length) return A(has('SOLDIER'), { target: pick(rng, wp).id }); }
  if (has('TRAITOR') >= 0 && others(s, p).some(q => q.hand.length)) { const t = pick(rng, others(s, p).filter(q => q.hand.length)); return A(has('TRAITOR'), { target: t.id }); }
  if (has('SAGE') >= 0) { const t = pick(rng, others(s, p)); return A(has('SAGE'), { peek: { what: 'crush', target: t.id } }); }
  if (has('DREAMER') >= 0 && rng() < 0.3) return A(has('DREAMER'));
  // fallback: dump something reasonable
  const order = ['SOLDIER', 'FRIENDZONE', 'FOOL', 'CRUSH', 'SAGE', 'DREAMER', 'TRAITOR', 'WARRIOR', 'HEARTBREAK', 'DEVOTION'];
  let idx = 0; for (const k of order) { if (has(k) >= 0) { idx = has(k); break; } }
  const key = hand[idx];
  if (key === 'FOOL') return A(idx, { as: 'HEARTBREAK', target: pick(rng, pool).id });
  if (CARD[key].needsTarget === 'other') return A(idx, { target: pick(rng, pool).id });
  if (key === 'SAGE') return A(idx, { peek: { what: 'crush', target: pick(rng, others(s, p)).id } });
  if (key === 'DEVOTION') return A(idx, { mode: 'repair' });
  return A(idx);
}

// ---------- end / scoring ----------
function endGame(s, reason) {
  if (s.over) return;
  s.over = true; s.endReason = reason; s.phase = 'over';
  log(s, `The game ends — ${reason}.`);
  scoreAll(s);
  const ranked = [...s.players].sort((a, b) => b.score - a.score || a.hits - b.hits || b.publicCrushesFrom.length - a.publicCrushesFrom.length);
  s.winnerId = ranked[0].id;
}

export function scoreAll(s) {
  for (const p of s.players) {
    const st = heartState(p);
    p.score = st === 'whole' ? 3 : st === 'cracked' ? 1 : -2;
    const obj = byId(s, p.crush);
    const mutual = obj.crush === p.id && !isVoided(s, p.id, obj.id);
    if (mutual) { p.score += 5; p.soulmate = true; if (p.crushedTrueTarget) p.score += 2; }
  }
}

// ---------- redacted view for a given viewer (hide others' hands & secrets) ----------
export function publicView(s, viewerId) {
  return {
    code: s.code, phase: s.phase, turn: s.turn, over: s.over,
    winnerId: s.winnerId, endReason: s.endReason,
    deckCount: s.deck.length, discardTop: s.discard[s.discard.length - 1] || null,
    log: s.log.slice(0, 8),
    youAre: viewerId,
    players: s.players.map(p => {
      const me = p.id === viewerId;
      const reveal = s.over || me;
      return {
        id: p.id, name: p.name, isAI: p.isAI, seat: p.seat,
        heart: heartState(p), protectors: p.protectors, untouchable: p.untouchable,
        publicCrushes: p.publicCrushesFrom.length, soulmate: s.over ? p.soulmate : (me ? p.soulmate : false),
        score: s.over ? p.score : undefined,
        handCount: p.hand.length,
        hand: me ? p.hand : undefined,
        crush: reveal ? p.crush : undefined,
        guard: reveal ? p.guard : undefined,
      };
    }),
  };
}

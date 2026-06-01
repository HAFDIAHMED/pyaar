import { Net, api } from './net.js';
import { SFX } from './sfx.js';
import { SEATS, CHARACTERS, CHAR_KEYS, CARD, heartGlyph, title } from './cards.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const S = {
  token: localStorage.getItem('hh_token') || null,
  user: JSON.parse(localStorage.getItem('hh_user') || 'null'),
  net: null, room: null, view: null, mySeat: null,
  mode: null, soloCount: 4, secretSent: false,
  lastLogTop: null, wasMyTurn: false, sungWin: false,
};

// ---------- toast & modal ----------
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toast-host').appendChild(t); setTimeout(() => t.remove(), 2400); }
function modal(inner, wire) { $('#modal-host').innerHTML = `<div class="overlay"><div class="modal">${inner}</div></div>`; wire && wire(); }
function closeModal() { $('#modal-host').innerHTML = ''; }

// ---------- top bar ----------
function refreshWho() { $('#who').textContent = S.user ? `👤 ${S.user.username}` : 'Sign in'; }
$('#mute').onclick = () => { const m = SFX.toggle(); $('#mute').textContent = m ? '🔇' : '🔊'; };
$('#who').onclick = () => S.user ? accountMenu() : authModal();
$('#home-link').onclick = () => leaveToHome();

// ============================================================ SCREENS
function renderHome() {
  S.screen = 'home';
  app.innerHTML = `
    <section class="hero">
      <div class="logo">⚜</div>
      <h1 class="title">PYAAR</h1>
      <div class="subtitle">HIDDEN HEARTS</div>
      <p class="tagline">Protect your heart. Aim it at someone. Pray they aimed back.</p>
    </section>
    <section class="menu">
      <div class="count-row">
        <span>vs Computer</span>
        <div class="stepper"><button id="cminus">−</button><b id="cval">${S.soloCount}</b><button id="cplus">+</button></div>
        <span class="muted small">players</span>
      </div>
      <button class="btn primary big" id="play-ai">▶ Play vs Computer</button>
      <div class="grid2">
        <button class="btn" id="create">＋ Create room</button>
        <button class="btn" id="join">⌨ Join with code</button>
      </div>
      <div class="grid2">
        <button class="btn ghost" id="lb">🏆 Leaderboard</button>
        <button class="btn ghost" id="rules">📖 How to play</button>
      </div>
    </section>
    <div class="foot">PYAAR · Hidden Hearts — play solo, or invite friends with a room code.</div>`;
  $('#cminus').onclick = () => { if (S.soloCount > 3) { S.soloCount--; $('#cval').textContent = S.soloCount; } };
  $('#cplus').onclick = () => { if (S.soloCount < 7) { S.soloCount++; $('#cval').textContent = S.soloCount; } };
  $('#play-ai').onclick = playVsComputer;
  $('#create').onclick = createRoom;
  $('#join').onclick = joinPrompt;
  $('#lb').onclick = showLeaderboard;
  $('#rules').onclick = showRules;
}

function renderLobby() {
  const r = S.room; if (!r) return;
  const isHost = r.youSeat === r.hostSeat;
  app.innerHTML = `
    <section class="panel center">
      <div class="muted small">Room code — share it</div>
      <div class="roomcode" id="code">${esc(r.code)}</div>
      <button class="btn sm" id="copy">Copy code</button>
    </section>
    <section class="panel">
      <h3 class="center">At the table (${r.seats.length}/7)</h3>
      <div class="seatlist">
        ${r.seats.map((s, i) => `<div class="seatline ${i === r.youSeat ? 'you' : ''}">
          <span class="si">${SEATS[i].icon}</span><span class="sn">${esc(s.name)}${i === r.hostSeat ? ' <span class="hosttag">host</span>' : ''}${s.isAI ? ' <span class="ai-badge">AI</span>' : ''}${i === r.youSeat ? ' <span class="muted">(you)</span>' : ''}</span>
        </div>`).join('')}
      </div>
      ${isHost ? `
        <div class="grid2" style="margin-top:12px">
          <button class="btn" id="addai" ${r.seats.length >= 7 ? 'disabled' : ''}>＋ Add computer</button>
          <button class="btn primary" id="begin" ${r.seats.length < 3 ? 'disabled' : ''}>Begin (${r.seats.length}/3+)</button>
        </div>` : `<p class="center muted">Waiting for the host to begin…</p>`}
    </section>
    <button class="btn ghost" id="leave">← Leave room</button>`;
  $('#copy').onclick = () => { navigator.clipboard?.writeText(r.code); toast('Code copied'); };
  $('#leave').onclick = leaveToHome;
  if (isHost) { $('#addai').onclick = () => { SFX.click(); S.net.send({ type: 'addAI' }); }; $('#begin').onclick = () => { SFX.resume(); SFX.shuffle(); S.net.send({ type: 'begin' }); }; }
}

function renderWaiting(msg) { app.innerHTML = `<section class="panel center waiting"><div class="spinner">⚜</div><p>${esc(msg)}</p></section>`; }

function renderSetup() {
  const v = S.view; const me = v.players[v.youAre];
  const stage = S._setupStage || 'guard';
  if (stage === 'guard') {
    app.innerHTML = `<section class="panel">
      <h3 class="center">${me.seat.icon} Choose your Protector</h3>
      <p class="center muted small">Secret — each character guards your Heart differently.</p>
      <div class="char-grid">
        ${CHAR_KEYS.map(k => `<div class="char-opt ${S._guard === k ? 'on' : ''}" data-g="${k}">
          <div class="ci">${CHARACTERS[k].icon}</div><div class="cn">${CHARACTERS[k].name}</div>
          <div class="cp">${esc(CHARACTERS[k].perk)}</div></div>`).join('')}
      </div>
      <button class="btn primary" id="gnext" ${S._guard ? '' : 'disabled'}>Confirm Protector →</button>
    </section>`;
    app.querySelectorAll('[data-g]').forEach(el => el.onclick = () => { S._guard = el.dataset.g; SFX.click(); renderSetup(); });
    $('#gnext').onclick = () => { S._setupStage = 'crush'; renderSetup(); };
  } else {
    const others = v.players.filter(p => p.id !== v.youAre);
    app.innerHTML = `<section class="panel">
      <h3 class="center">Aim your Heart 💘</h3>
      <p class="center muted small">Secretly choose the one you fancy. No one will know — until the Reveal.</p>
      <div class="picker">
        ${others.map(p => `<button class="btn pick ${S._crush === p.id ? 'on' : ''}" data-c="${p.id}"><span class="bi">${p.seat.icon}</span> ${esc(p.name)}</button>`).join('')}
      </div>
      <button class="btn primary" id="lock" ${S._crush != null ? '' : 'disabled'}>Lock my secret 💘</button>
    </section>`;
    app.querySelectorAll('[data-c]').forEach(el => el.onclick = () => { S._crush = +el.dataset.c; renderSetup(); });
    $('#lock').onclick = () => { SFX.crush(); S.net.send({ type: 'setSecret', guard: S._guard, crush: S._crush }); S.secretSent = true; renderWaiting('Secret locked. Waiting for the others…'); };
  }
}

// ---------- the felt table ----------
function renderTable() {
  const v = S.view; const n = v.players.length; const me = v.players[v.youAre];
  const myTurn = v.turn === v.youAre;
  let chips = '';
  const aiming = !!S.sel && myTurn;
  for (const p of v.players) {
    const rel = (p.id - v.youAre + n) % n;                 // you at the bottom
    const ang = (90 + rel * (360 / n)) * Math.PI / 180;
    const x = 50 + 41 * Math.cos(ang), y = 50 + 43 * Math.sin(ang);
    const tgt = aiming && p.id !== v.youAre ? ' targetable' : '';
    chips += `<div class="chip-pos${tgt}" data-seat="${p.id}" style="left:${x}%;top:${y}%">${chipHTML(p, v.turn, v.youAre)}</div>`;
  }
  const aimCard = aiming ? (S.sel.as || S.sel.key) : null;
  app.innerHTML = `
    <div class="table-status"><span>${v.players.filter(p => p.heart !== 'broken').length}♥ beating · ${v.deckCount} cards${v.deckCount <= n ? ' · final!' : ''}</span>
      <span class="${myTurn ? 'turnnow' : 'muted'}">${myTurn ? 'Your turn' : 'Turn: ' + v.players[v.turn].name}</span></div>
    ${aiming ? `<div class="aim-banner">${CARD[aimCard].icon} <b>${title(aimCard)}</b> — tap a player ${aimCard === 'SAGE' ? 'to peek' : ''}<button id="aim-cancel">Cancel</button></div>` : ''}
    <div class="table-wrap${aiming ? ' aiming' : ''}"><div class="felt">
      <div class="table-center">
        <div class="piles">
          <div class="pile deck"><span class="pc">${v.deckCount}</span><span class="pl">draw</span></div>
          <div class="pile disc">${v.discardTop ? `<span class="corner">${CARD[v.discardTop].icon}</span>${CARD[v.discardTop].icon}` : '—'}<span class="pl">played</span></div>
        </div>
        <div class="talk">${v.log[0] || 'The table is set…'}</div>
      </div>${chips}
    </div></div>
    <div class="hand-area ${myTurn ? '' : 'idle'}">
      <div class="secret-strip">Your secret 💘 <b>${v.players[me.crush].seat.icon} ${esc(v.players[me.crush].name)}</b> · guarded by ${CHARACTERS[me.guard].icon} ${CHARACTERS[me.guard].name}</div>
      <div class="hand fan">${(me.hand || []).map((k, i) => cardHTML(k, i)).join('')}</div>
      <div class="hint-line">${myTurn ? 'Tap a card to play it.' : 'Waiting for your turn…'}</div>
    </div>
    <div class="log">${v.log.slice(0, 4).map(e => `<div class="e">${e}</div>`).join('')}</div>`;
  if (myTurn) {
    app.querySelectorAll('.pcard[data-play]').forEach(el => el.onclick = () => playCard(+el.dataset.play));
    if (S.sel) {
      app.querySelectorAll('.chip-pos.targetable').forEach(el => el.onclick = () => finishTarget(+el.dataset.seat));
      const cancel = document.getElementById('aim-cancel'); if (cancel) cancel.onclick = clearSel;
      const selCard = app.querySelector('.pcard[data-play="' + S.sel.index + '"]'); if (selCard) selCard.classList.add('sel');
    }
  }
  layoutFan();
}

function chipHTML(p, activeId, meId) {
  const b = [];
  if (p.protectors) b.push(`🛡${p.protectors}`);
  if (p.untouchable) b.push('☾');
  if (p.publicCrushes) b.push(`💘${p.publicCrushes}`);
  if (p.soulmate) b.push('💞');
  // opponents show a little fan of face-down card-backs (their hand)
  const fan = (p.id !== meId)
    ? `<div class="minihand">${'<span class="mb"></span>'.repeat(Math.min(5, p.handCount || 0))}<span class="mhc">${p.handCount || 0}</span></div>`
    : '';
  return `<div class="chip ${p.id === activeId ? 'active' : ''} ${p.heart === 'broken' ? 'broken' : ''}">
    ${fan}
    <div class="avatar">${p.seat.icon}<span class="hs">${heartGlyph(p.heart)}</span></div>
    <div class="cnm">${esc(p.name)}${p.isAI ? ' <span class="ai-badge">AI</span>' : ''}</div>
    <div class="badges">${b.length ? b.map(x => `<span class="bdg">${x}</span>`).join('') : '<span class="bdg dim">—</span>'}</div>
  </div>`;
}
// a Solitaire-style playing card: white face, corner indices, big centre motif
function cardHTML(key, i) {
  const d = CARD[key];
  return `<div class="pcard f-${d.fam}" data-play="${i}">
    <span class="corner tl">${d.icon}</span>
    <div class="ic">${d.icon}</div>
    <div class="ti">${title(key)}</div>
    <div class="tg">${esc(d.tag)}</div>
    <div class="bd">${esc(d.desc)}</div>
    <span class="corner br">${d.icon}</span>
  </div>`;
}

// Fan the hand into an overlapping arc that fits the width — all cards visible.
function layoutFan() {
  const wrap = document.querySelector('.hand.fan');
  if (!wrap) return;
  const cards = [...wrap.querySelectorAll('.pcard')];
  const n = cards.length; if (!n) return;
  const cardW = 108;
  const W = wrap.clientWidth || 360;
  const spacing = n > 1 ? Math.min((W - cardW) / (n - 1), 84) : 0;   // fit width; cap so cards overlap like a held hand
  const total = (n - 1) * spacing + cardW;
  const start = Math.max(0, (W - total) / 2);
  const mid = (n - 1) / 2;
  cards.forEach((c, i) => {
    const off = i - mid;
    c.style.left = (start + i * spacing) + 'px';
    c.style.setProperty('--rot', (off * 4) + 'deg');
    c.style.setProperty('--ty', (Math.abs(off) * Math.abs(off) * 1.4) + 'px');
    c.style.setProperty('--z', i + 1);
  });
}

// ---------- playing a card: tap a card, then tap a player on the table ----------
function act(action) { S.net.send({ type: 'action', action }); }
function clearSel() { S.sel = null; renderTable(); }
function enterTarget(index, key, extra) { S.sel = { index, key, ...(extra || {}) }; SFX.click(); renderTable(); }
function finishTarget(seatId) {
  const sel = S.sel; if (!sel) return;
  const a = { cardIndex: sel.index };
  const eff = sel.as || sel.key;
  if (eff === 'SAGE') a.peek = { what: 'crush', target: seatId };
  else a.target = seatId;
  if (sel.as) a.as = sel.as;
  S.sel = null;
  act(a);
}
function playCard(i) {
  const v = S.view; if (v.turn !== v.youAre) return;
  const key = v.players[v.youAre].hand[i];
  if (S.sel && S.sel.index === i) return clearSel();          // tap the selected card again to cancel
  if (key === 'WARRIOR' || key === 'DREAMER') { S.sel = null; SFX.click(); return act({ cardIndex: i }); }
  if (key === 'DEVOTION') return devotionSheet(i);
  if (key === 'FOOL') return foolSheet(i);
  if (key === 'SAGE') return enterTarget(i, 'SAGE');          // then tap a player to peek their crush
  return enterTarget(i, key);                                  // Heartbreak / Soldier / Crush / Friendzone / Traitor
}
function devotionSheet(i) {
  const v = S.view; const obj = v.players[v.players[v.youAre].crush];
  sheet(`<div class="sheet-title">💍 Devotion</div>
    <button class="btn pick" data-d="repair">❤️ Repair your Heart one step</button>
    <button class="btn pick" data-d="declare">💘 Declare your love for ${obj.seat.icon} ${esc(obj.name)} — if mutual, Soulmates!</button>
    <button class="btn ghost" id="sx">Cancel</button>`, () => {
    document.querySelectorAll('[data-d]').forEach(el => el.onclick = () => { const mode = el.dataset.d; closeModal(); S.sel = null; act({ cardIndex: i, mode }); });
    document.getElementById('sx').onclick = closeModal;
  });
}
function foolSheet(i) {
  const opts = ['HEARTBREAK', 'SOLDIER', 'WARRIOR', 'FRIENDZONE', 'SAGE', 'TRAITOR', 'DREAMER'];
  sheet(`<div class="sheet-title">◊ Fool — copy a character</div>
    <div class="sheet-grid">${opts.map(k => `<button class="btn pick fool f-${CARD[k].fam}" data-as="${k}"><span class="fic">${CARD[k].icon}</span><b>${title(k)}</b></button>`).join('')}</div>
    <button class="btn ghost" id="sx">Cancel</button>`, () => {
    document.querySelectorAll('[data-as]').forEach(el => el.onclick = () => {
      const as = el.dataset.as; closeModal();
      if (as === 'WARRIOR' || as === 'DREAMER') { S.sel = null; return act({ cardIndex: i, as }); }
      enterTarget(i, 'FOOL', { as });        // SAGE or an attack → tap a player
    });
    document.getElementById('sx').onclick = closeModal;
  });
}
function sheet(inner, wire) { $('#modal-host').innerHTML = `<div class="overlay sheet-overlay"><div class="sheet">${inner}</div></div>`; wire && wire(); }

// ---------- reveal ----------
function renderReveal() {
  const v = S.view;
  const ranked = [...v.players].sort((a, b) => b.score - a.score);
  const winner = v.players[v.winnerId];
  const pairs = [];
  for (const p of v.players) { const o = v.players[p.crush]; if (p.soulmate && o.crush === p.id && p.id < o.id) pairs.push([p, o]); }
  app.innerHTML = `
    <section class="panel center">
      <h2>The Reveal</h2>
      <div class="bigseat">${winner.seat.icon}</div>
      <h3 class="gold">${esc(winner.name)} protected their love best</h3>
      ${winner.soulmate ? '<div class="muted">…and found a Soulmate 💞</div>' : ''}
    </section>
    ${pairs.length ? `<section class="panel center"><h3>💞 Soulmates</h3>${pairs.map(([a, b]) => `<div class="pairline">${a.seat.icon} ${esc(a.name)} 💘 ${b.seat.icon} ${esc(b.name)}</div>`).join('')}</section>` : ''}
    <section class="panel"><h3 class="center">Hearts revealed</h3>
      ${ranked.map(p => { const o = v.players[p.crush]; const mutual = p.soulmate; return `<div class="revealline">
        <span class="si">${p.seat.icon}</span>
        <div class="rl-main"><b>${esc(p.name)}</b>${p.isAI ? ' <span class="ai-badge">AI</span>' : ''}
          <div class="muted small">${heartGlyph(p.heart)} ${p.heart} · 💘 ${o.seat.icon} ${esc(o.name)}${mutual ? ' · <b class="pink">mutual!</b>' : ''} · ${CHARACTERS[p.guard].icon} ${CHARACTERS[p.guard].name}</div></div>
        <div class="rl-score">${p.score >= 0 ? '+' : ''}${p.score}</div></div>`; }).join('')}
    </section>
    <button class="btn primary big" id="again">Play again ❤️</button>`;
  $('#again').onclick = leaveToHome;
}

// ---------- leaderboard ----------
async function showLeaderboard() {
  SFX.click(); renderWaiting('Loading leaderboard…');
  const { data } = await api.get('/api/leaderboard');
  const rows = data.rows || [];
  app.innerHTML = `<section class="panel"><h3 class="center">🏆 Leaderboard</h3>
    ${rows.length ? `<table class="lb"><thead><tr><th>#</th><th>Player</th><th>Wins</th><th>💞</th><th>Score</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.username)}</td><td>${r.wins || 0}</td><td>${r.soulmates || 0}</td><td>${r.totalScore || 0}</td></tr>`).join('')}</tbody></table>`
      : `<p class="center muted">${esc(data.note || 'No games recorded yet.')}<br/>Sign in and play to climb the board.</p>`}
    </section><button class="btn ghost" id="back">← Back</button>`;
  $('#back').onclick = renderHome;
}

// ---------- auth ----------
function authModal(tab = 'login') {
  modal(`<h3 class="center">${tab === 'login' ? 'Sign in' : 'Create account'}</h3>
    <div class="tabs"><button class="tab ${tab === 'login' ? 'on' : ''}" id="tab-login">Sign in</button><button class="tab ${tab === 'register' ? 'on' : ''}" id="tab-reg">Register</button></div>
    <input class="inp" id="u" placeholder="username" autocomplete="username" />
    <input class="inp" id="p" type="password" placeholder="password" autocomplete="current-password" />
    <button class="btn primary" id="go">${tab === 'login' ? 'Sign in' : 'Register'}</button>
    <button class="btn ghost" id="x">Cancel</button>
    <div class="err" id="err"></div>`, () => {
    $('#tab-login').onclick = () => authModal('login');
    $('#tab-reg').onclick = () => authModal('register');
    $('#x').onclick = closeModal;
    $('#go').onclick = async () => {
      const username = $('#u').value.trim(), password = $('#p').value;
      const path = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const { status, data } = await api.post(path, { username, password });
      if (status === 200) { S.token = data.token; S.user = data.user; localStorage.setItem('hh_token', S.token); localStorage.setItem('hh_user', JSON.stringify(S.user)); refreshWho(); closeModal(); toast(`Welcome, ${S.user.username}!`); }
      else { $('#err').textContent = data.error || 'failed'; if (status === 503) $('#err').textContent = 'Accounts need a database — connect Oracle to enable sign-in. You can still play as a guest.'; }
    };
  });
}
function accountMenu() {
  modal(`<h3 class="center">👤 ${esc(S.user.username)}</h3>
    <button class="btn" id="lb">🏆 Leaderboard</button>
    <button class="btn ghost" id="out">Sign out</button>
    <button class="btn ghost" id="x">Close</button>`, () => {
    $('#lb').onclick = () => { closeModal(); showLeaderboard(); };
    $('#out').onclick = () => { S.token = null; S.user = null; localStorage.removeItem('hh_token'); localStorage.removeItem('hh_user'); refreshWho(); closeModal(); };
    $('#x').onclick = closeModal;
  });
}
function showRules() {
  modal(`<h3>How to play</h3><p class="small">Everyone secretly <b>aims their Heart at another player</b> (your crush) and picks a <b>Protector</b>. On your turn: <b>draw 1, play 1.</b></p>
    <ul class="small"><li>💔 Heartbreak — strip a Protector or crack a bare Heart</li><li>⚔ Warrior — add a 🛡 Protector to your Heart</li><li>🤝 Friendzone — void a crush on you</li><li>☾ Dreamer — be untouchable</li><li>✦ Sage — peek a secret</li><li>⚯ Traitor — steal a card</li><li>◊ Fool — copy any character</li><li>💘 Crush — public flirt; mutual scores +2</li><li>💍 Devotion — repair, or declare your crush (mutual = Soulmates)</li></ul>
    <p class="small">Deck runs out → Reveal. Whole +3 · Cracked +1 · Broken −2 · Mutual +5. Most points wins.</p>
    <button class="btn primary" id="x">Got it</button>`, () => $('#x').onclick = closeModal);
}

// ============================================================ NET FLOW
async function connect() {
  if (S.net) return;
  S.net = new Net(onMsg);
  try { await S.net.connect(); } catch { toast('Could not reach the server'); S.net = null; throw new Error('no server'); }
}
function name() { return S.user?.username || 'You'; }

async function playVsComputer() { SFX.resume(); SFX.click(); S.mode = 'solo'; S.secretSent = false; resetGameState(); try { await connect(); S.net.send({ type: 'create', name: name(), token: S.token }); } catch {} }
async function createRoom() { SFX.resume(); SFX.click(); S.mode = 'private'; S.secretSent = false; resetGameState(); try { await connect(); S.net.send({ type: 'create', name: name(), token: S.token }); } catch {} }
function joinPrompt() {
  SFX.resume();
  modal(`<h3 class="center">Join a room</h3><input class="inp" id="code" placeholder="ROOM CODE" maxlength="5" style="text-transform:uppercase;text-align:center;letter-spacing:4px;font-size:22px" />
    <button class="btn primary" id="go">Join</button><button class="btn ghost" id="x">Cancel</button>`, () => {
    $('#x').onclick = closeModal;
    $('#go').onclick = async () => { const code = $('#code').value.trim().toUpperCase(); if (code.length < 4) return; closeModal(); S.mode = 'join'; S.secretSent = false; resetGameState(); try { await connect(); S.net.send({ type: 'join', code, token: S.token }); } catch {} };
  });
}
function resetGameState() { S.view = null; S.room = null; S.mySeat = null; S._guard = null; S._crush = null; S._setupStage = 'guard'; S.lastLogTop = null; S.wasMyTurn = false; S.sungWin = false; S.sel = null; }

function leaveToHome() {
  if (S.net) { S.net.send({ type: 'leave' }); S.net.close(); S.net = null; }
  resetGameState(); S.mode = null; closeModal(); renderHome();
}

function onMsg(m) {
  switch (m.type) {
    case 'hello': return;
    case 'room': {
      S.room = m; S.mySeat = m.youSeat;
      if (S.mode === 'solo' && !m.started) {
        if (m.seats.length < S.soloCount) S.net.send({ type: 'addAI' });
        else S.net.send({ type: 'begin' });
        return;
      }
      if (!m.started) renderLobby();
      return;
    }
    case 'state': {
      const prev = S.view; S.view = m.view; S.mySeat = m.view.youAre;
      cues(prev, m.view);
      if (m.view.over) { if (!S.sungWin) { S.sungWin = true; SFX.win(); if (m.view.players.some(p => p.soulmate)) SFX.soulmate(); } return renderReveal(); }
      if (m.view.phase === 'setup') {
        if (m.view.players[m.view.youAre].guard == null && !S.secretSent) return renderSetup();
        return renderWaiting('Secret locked. Waiting for the others…');
      }
      return renderTable();
    }
    case 'private': return modal(`<h3>✦ You alone see…</h3><p>${esc(m.text)}</p><button class="btn primary" id="x">Keep the secret</button>`, () => $('#x').onclick = closeModal);
    case 'error': return toast(m.error || 'error');
    case 'closed': { S.net = null; if (S.view && !S.view.over) { toast('Disconnected from the room'); leaveToHome(); } return; }
  }
}

// sound cues based on what changed between states
function cues(prev, v) {
  if (!prev || prev.phase !== 'play' || v.phase !== 'play') { if (v.phase === 'play' && v.turn === v.youAre) SFX.turn(); S.wasMyTurn = v.turn === v.youAre; return; }
  const top = v.log[0];
  if (top && top !== S.lastLogTop) {
    if (/BROKEN|💔 wounds/.test(top)) SFX.hit();
    else if (/sends a 💘/.test(top)) SFX.crush();
    else if (/raises a ⚔/.test(top)) SFX.shield();
    else if (/friendzones/.test(top)) SFX.friendzone();
    else SFX.play();
  }
  S.lastLogTop = top;
  const myTurn = v.turn === v.youAre;
  if (myTurn && !S.wasMyTurn) SFX.turn();
  S.wasMyTurn = myTurn;
}

// ---------- boot ----------
window.addEventListener('resize', () => { if (document.querySelector('.hand.fan')) layoutFan(); });
refreshWho();
$('#mute').textContent = SFX.isMuted() ? '🔇' : '🔊';
renderHome();

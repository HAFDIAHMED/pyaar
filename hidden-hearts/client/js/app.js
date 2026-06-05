import { Net, api } from './net.js';
import { SFX } from './sfx.js';
import { SEATS, CARD, title, STAGES, STAGE_NAMES, READY } from './cards.js';
import { t, getLang, toggleLang, onLangChange } from './i18n.js';

// Format a single engine log entry. Engine now emits structured event
// objects ({k, ...params}) instead of pre-formatted English. Legacy
// string entries still render as-is (defence against stale game state).
function formatLogEvent(e) {
  if (typeof e === 'string') return e;
  if (!e || typeof e !== 'object' || !e.k) return '';
  // Stage params come from the engine as a number index — translate via STAGE_NAMES
  const params = { ...e };
  if (typeof params.stage === 'number') {
    const ic = STAGES[params.stage] || '';
    params.stage = (STAGE_NAMES[params.stage] || '') + (ic ? ' ' + ic : '');
  }
  return t('log.' + e.k, params);
}

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
function refreshWho() {
  const el = $('#who');
  if (S.user) el.innerHTML = `${avatarFor(S.user.username, { size: 24 })}<span class="who-name">${esc(S.user.username)}</span>`;
  else el.textContent = t('topbar.signIn');
}
function refreshLangButton() {
  const lb = $('#lang');
  if (!lb) return;
  // Show the CURRENT language (flag + code) — tap to switch to the other one.
  const cur = getLang();
  const flag = cur === 'en' ? '🇺🇸' : '🇫🇷';
  const code = cur.toUpperCase();
  lb.innerHTML = `<span class="lang-flag">${flag}</span><span class="lang-code">${code}</span>`;
  lb.title = t('langLabel');
}
$('#mute').onclick = () => { const m = SFX.toggle(); $('#mute').textContent = m ? '🔇' : '🔊'; };
$('#who').onclick = () => S.user ? accountMenu() : authModal();
$('#home-link').onclick = () => leaveToHome();
$('#lang').onclick = () => { SFX.click?.(); toggleLang(); };

// When the user toggles language, re-render whichever screen we're on so the
// new strings paint immediately without a full reload.
onLangChange(() => {
  refreshWho();
  refreshLangButton();
  rerenderCurrentScreen();
});
refreshLangButton();

function rerenderCurrentScreen() {
  // Map screen → render function. Some screens depend on server state we
  // already have (S.room, S.view); others are static like 'home'.
  switch (S.screen) {
    case 'home':           return renderHome();
    case 'floor':          return showFloor();
    case 'waiting-host':   return renderWaitingForHost(S.pendingTableCode || '');
    default: break;
  }
  if (S.view) {
    if (S.view.over) return renderReveal();
    if (S.view.phase === 'setup') return renderSetup();
    if (S.view.phase === 'play')  return renderTable();
  }
  if (S.room && !S.room.started) return renderLobby();
}

// Stable emoji per username — used by the home greeting card.
// Deterministic so the same name always shows the same little icon.
function heartFor(name) {
  const palette = ['🌹','🪷','🌙','🔥','🦚','🌼','⭐','💞','✨','🌷','🍀','🌊'];
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

// ---------- avatars ----------
// Each user gets a circular gradient avatar with a face emoji on top. Derived
// from the username so it's stable across devices, but the user can click
// their own avatar on the home screen to cycle through variations (the
// "reroll" offset lives in localStorage and is purely client-side).
const AVATAR_FACES = [
  '🦊','🐼','🐯','🦁','🐻','🐮','🐸','🐧','🦄','🐺',
  '🦉','🐵','🐱','🐶','🐹','🦒','🦔','🐨','🐰','🐲',
  '🦖','🦕','🐙','🦋','🐝','🐢','🐳','🦩','🦦','🦜',
];
const AVATAR_PALETTES = [
  ['#ff6b9d','#c2407f'], ['#f7b801','#f18701'], ['#3e92cc','#2a628f'],
  ['#7b2cbf','#5a189a'], ['#06d6a0','#118ab2'], ['#ef476f','#ffd166'],
  ['#43aa8b','#577590'], ['#f15bb5','#9b5de5'], ['#00bbf9','#00f5d4'],
  ['#fb5607','#ffbe0b'], ['#8338ec','#3a86ff'], ['#ff006e','#fb5607'],
  ['#22c55e','#0ea5e9'], ['#a855f7','#ec4899'], ['#facc15','#22d3ee'],
];
function avatarSeed(name, applyReroll = true) {
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  if (applyReroll && S.user && name === S.user.username) {
    h = (h + (+(localStorage.getItem('hh_avatarSeed') || 0))) >>> 0;
  }
  return h;
}
// Returns a self-contained HTML string for an avatar — drop it anywhere.
//   opts: { size, clickable, id, withRing }
function avatarFor(name, opts = {}) {
  const size = opts.size || 36;
  const seed = avatarSeed(name);
  const face = AVATAR_FACES[seed % AVATAR_FACES.length];
  const palette = AVATAR_PALETTES[(seed >>> 4) % AVATAR_PALETTES.length];
  const [c1, c2] = palette;
  const fontSize = Math.round(size * 0.58);
  const cls = ['user-avatar', opts.clickable ? 'clickable' : '', opts.withRing ? 'ring' : ''].filter(Boolean).join(' ');
  const id = opts.id ? ` id="${opts.id}"` : '';
  const t = opts.clickable ? ' title="Click to change look"' : '';
  return `<span class="${cls}"${id}${t} style="width:${size}px;height:${size}px;background:linear-gradient(135deg,${c1},${c2});font-size:${fontSize}px;">${face}</span>`;
}
function rerollAvatar() {
  const cur = +(localStorage.getItem('hh_avatarSeed') || 0);
  localStorage.setItem('hh_avatarSeed', String((cur + 1) % 240));
  SFX.click?.();
  refreshWho();
  if (S.screen === 'home') renderHome();
}

// Drifting hearts behind the home menu — pure decoration, scoped to home so
// they vanish when you enter a game. ~18 emojis, varied size/sway/speed.
function spawnFloaters() {
  // Remove any previous instance so re-renders don't pile up.
  document.querySelectorAll('.floaters').forEach(n => n.remove());
  const wrap = document.createElement('div');
  wrap.className = 'floaters';
  const glyphs = ['❤','💗','💖','💓','♥','🌹','🌸','✨','🪷','💫'];
  const N = 18;
  for (let i = 0; i < N; i++) {
    const h = document.createElement('span');
    h.className = 'h';
    h.textContent = glyphs[Math.floor(((i * 73) % glyphs.length))];
    const left = ((i * 53) % 100);                      // pseudo-random column
    const dur  = 11 + ((i * 17) % 10);                  // 11–20s
    const delay = -((i * 9) % 18);                       // negative so they're mid-flight on load
    const size = 14 + ((i * 11) % 22);                   // 14–35px
    const sway = (i % 2 === 0 ? 1 : -1) * (20 + ((i * 13) % 60));
    h.style.left = left + 'vw';
    h.style.fontSize = size + 'px';
    h.style.animationDuration = dur + 's';
    h.style.animationDelay = delay + 's';
    h.style.setProperty('--sway', sway + 'px');
    h.style.opacity = (0.35 + ((i % 5) * 0.07)).toFixed(2);
    wrap.appendChild(h);
  }
  document.body.appendChild(wrap);
}
// Tear down the floaters whenever we leave home (covers playVsComputer,
// joining a room, opening leaderboard etc — they all call into render*).
function clearFloaters() { document.querySelectorAll('.floaters').forEach(n => n.remove()); }

// ============================================================ SCREENS
function renderHome() {
  S.screen = 'home';
  const greeting = S.user ? `
    <section class="home-greeting">
      <div class="gi">${avatarFor(S.user.username, { size: 56, clickable: true, withRing: true, id: 'home-avatar' })}</div>
      <div class="gtxt">
        <div class="hi">Signed in</div>
        <div class="nm">${esc(S.user.username)}</div>
        <div class="reroll-hint">🎲 tap your avatar to change look</div>
      </div>
      <div class="badge">● online</div>
    </section>` : '';
  // Pre-build the seat ring: user at seat 0, AI bots at seats 1..(soloCount-1),
  // remaining seats empty. 7 total because the felt has 7 chip positions.
  const seatHTML = [];
  const TOTAL_SEATS = 7;
  for (let i = 0; i < TOTAL_SEATS; i++) {
    if (i === 0 && S.user) {
      seatHTML.push(`<div class="ring-seat you" style="--n:${i}; --of:${TOTAL_SEATS}">${avatarFor(S.user.username, { size: 44, withRing: true })}<div class="ring-name">${esc(S.user.username)}</div></div>`);
    } else if (i === 0) {
      seatHTML.push(`<div class="ring-seat empty" style="--n:${i}; --of:${TOTAL_SEATS}"><div class="ring-blank">?</div><div class="ring-name muted">${t('home.youGuest')}</div></div>`);
    } else if (i < S.soloCount) {
      const botName = ['Rumi','Layla','Kai','Sol','Vera','Ash'][i - 1] || ('bot' + i);
      seatHTML.push(`<div class="ring-seat bot" style="--n:${i}; --of:${TOTAL_SEATS}">${avatarFor(botName, { size: 36 })}<div class="ring-name muted">${esc(botName)}</div></div>`);
    } else {
      seatHTML.push(`<div class="ring-seat empty" style="--n:${i}; --of:${TOTAL_SEATS}"><div class="ring-blank">+</div></div>`);
    }
  }

  app.innerHTML = `
    ${greeting}
    <section class="hero compact">
      <h1 class="title">PYAAR</h1>
      <div class="marquee" aria-hidden="true">
        <span class="bulb"></span><span class="bulb"></span><span class="bulb"></span><span class="bulb"></span>
        <span class="bulb"></span><span class="bulb"></span><span class="bulb"></span><span class="bulb"></span>
      </div>
      <div class="subtitle">THE LOVE CARD GAME</div>
    </section>

    <!-- THE TABLE — a real felt with you + bots seated around it and the
         play chip in the centre. This is the home; everything else is a tab. -->
    <section class="lobby-table-wrap">
      <div class="lobby-table">
        <div class="lobby-felt">
          <div class="felt-rail"></div>
          <div class="seat-ring">${seatHTML.join('')}</div>
          <div class="table-center">
            <div class="card-stack" aria-hidden="true">
              <span class="csc c1"></span><span class="csc c2"></span><span class="csc c3"></span>
            </div>
            <button class="play-chip" id="play-ai">
              <span class="pc-ic">▶</span>
              <span class="pc-lbl">${t('home.play')}</span>
              <span class="pc-sub">${t('home.botsCount', { n: `<b id="pc-count">${S.soloCount}</b>` })}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="seat-counter">
        <button class="seat-pm" id="cminus" aria-label="fewer">−</button>
        <div class="seat-counter-mid"><b id="cval">${S.soloCount}</b><span class="muted small"> ${t('home.seatsAt')}</span></div>
        <button class="seat-pm" id="cplus" aria-label="more">+</button>
      </div>
    </section>

    <!-- Friends / online strip. Tap a face → invite them to your table. -->
    <section class="friends-strip">
      <div class="friends-head">
        <span class="fh-label">👥 ${t('home.online')}</span>
        <span class="muted small" id="online-count"></span>
      </div>
      <div class="friends-row" id="friends-row">
        <div class="muted small" style="padding:14px">${t('home.lookingAround')}</div>
      </div>
    </section>

    <!-- Tiny floating stats strip — much less obtrusive than the old plaques -->
    <section class="mini-stats" id="mini-stats">
      <div class="ms-pill" id="my-stats-pill">${t('stats.lineDash')}</div>
      <div class="ms-pill ghost"><span class="muted small">🏆 top:</span> <span id="mini-top">…</span></div>
    </section>

    <!-- Bottom tab bar — five icons, fixed -->
    <nav class="tab-bar">
      <button class="tab active" data-tab="home"><span class="ic">🏠</span><span class="lbl">${t('nav.home')}</span></button>
      <button class="tab" data-tab="floor"><span class="ic">🎰</span><span class="lbl">${t('nav.floor')}</span></button>
      <button class="tab tab-plus" data-tab="new"><span class="ic">＋</span><span class="lbl">${t('nav.table')}</span></button>
      <button class="tab" data-tab="lb"><span class="ic">🏆</span><span class="lbl">${t('nav.top')}</span></button>
      <button class="tab" data-tab="rules"><span class="ic">📖</span><span class="lbl">${t('nav.rules')}</span></button>
    </nav>`;
  spawnFloaters();
  refreshHomeStatsCompact();
  refreshOnlineStrip();
  maybeRunHomeTour();
  const bump = () => { const el = $('#cval'); el.classList.remove('bumped'); void el.offsetWidth; el.classList.add('bumped'); $('#pc-count').textContent = S.soloCount; if (S.screen === 'home') renderHome(); };
  $('#cminus').onclick = () => { if (S.soloCount > 3) { S.soloCount--; bump(); SFX.click?.(); } };
  $('#cplus').onclick  = () => { if (S.soloCount < 7) { S.soloCount++; bump(); SFX.click?.(); } };
  $('#play-ai').onclick = playVsComputer;
  const ha = $('#home-avatar'); if (ha) ha.onclick = rerollAvatar;
  // Tab bar wiring
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => onTabClick(t.dataset.tab));
}

// ---- new compact home helpers --------------------------------------------

function onTabClick(tab) {
  SFX.click?.();
  switch (tab) {
    case 'home':  return;                                  // already here
    case 'floor': return showFloor();
    case 'new':   return showNewTableSheet();              // bottom-sheet with all the create/join/invite options
    case 'lb':    return showLeaderboard();
    case 'rules': return showRules();
  }
}

// Bottom-sheet with the three "make-a-table" options, so the home doesn't
// have to show a separate button for each.
function showNewTableSheet() {
  modal(`<h3 class="center">${t('newTable.title')}</h3>
    <div class="nt-list">
      <button class="nt-row" id="nt-invite">
        <div class="nt-ic" style="background:linear-gradient(135deg,#e85c86,#a61e44)">👋</div>
        <div class="nt-txt"><b>${t('newTable.inviteFriend')}</b><span>${t('newTable.inviteFriendDesc')}</span></div>
      </button>
      <button class="nt-row" id="nt-public">
        <div class="nt-ic" style="background:linear-gradient(135deg,#4cb878,#1f6a44)">🎰</div>
        <div class="nt-txt"><b>${t('newTable.publicTable')}</b><span>${t('newTable.publicTableDesc')}</span></div>
      </button>
      <button class="nt-row" id="nt-code">
        <div class="nt-ic" style="background:linear-gradient(135deg,#e0a458,#8a5a1a)">⌨</div>
        <div class="nt-txt"><b>${t('newTable.joinCode')}</b><span>${t('newTable.joinCodeDesc')}</span></div>
      </button>
    </div>
    <button class="btn ghost" id="nt-x">${t('common.neverMind')}</button>`, () => {
    $('#nt-invite').onclick = () => { closeModal(); inviteFriendFromHome(); };
    $('#nt-public').onclick = () => { closeModal(); createRoom(); };
    $('#nt-code').onclick   = () => { closeModal(); joinPrompt(); };
    $('#nt-x').onclick = closeModal;
  });
}

// Compact stats — small pills above the tab bar, not big plaques.
async function refreshHomeStatsCompact() {
  try {
    const { data } = await api.get('/api/leaderboard');
    const rows = (data?.rows || []).slice(0, 1);
    const el = $('#mini-top');
    if (el) el.innerHTML = rows.length ? `${avatarFor(rows[0].username, { size: 18 })} <b style="color:#e0a458">${esc(rows[0].username)}</b> <span class="muted small">${rows[0].wins || 0}w</span>` : '<span class="muted small">no champ yet</span>';
  } catch {}
  if (S.user && S.token) {
    try {
      const { data } = await api.get('/api/me', S.token);
      const h = data?.history || [];
      const games = h.length;
      const wins = h.filter(g => g.won).length;
      const soulmates = h.filter(g => g.soulmate).length;
      const el = $('#my-stats-pill');
      if (el) el.innerHTML = t('stats.line', { games, wins, soulmates });
    } catch {}
  } else {
    const el = $('#my-stats-pill');
    if (el) el.innerHTML = '<span class="muted small">sign in to track your record</span>';
  }
}

// Friends strip — show every online user (minus yourself) as a tappable avatar.
// Tap = invite-to-table flow (creates a private table if you aren't in one,
// then sends them an invite via the existing inviteUser WS message).
async function refreshOnlineStrip() {
  let users = [];
  try { const { data } = await api.get('/api/online'); users = data?.users || []; }
  catch { /* server hiccup — leave skeleton */ return; }
  const others = users.filter(u => !(S.user && u.username === S.user.username));
  const el = $('#friends-row'); if (!el) return;
  const countEl = $('#online-count'); if (countEl) countEl.textContent = others.length ? t('home.onlineCount', { n: others.length }) : t('home.noneOnline');
  const bubbles = others.slice(0, 12).map(u => `
    <button class="friend-bubble" data-name="${esc(u.username)}" data-tip="${t('lobby.inviteSent', { name: esc(u.username) })}">
      ${avatarFor(u.username, { size: 52, withRing: true })}
      <span class="fb-dot" aria-label="online"></span>
      <span class="fb-name">${esc(u.username)}</span>
    </button>`).join('');
  const inviteByName = `
    <button class="friend-bubble add" id="fb-add" title="${t('home.byName')}">
      <span class="fb-plus">＋</span>
      <span class="fb-name">${t('home.byName')}</span>
    </button>`;
  if (!others.length) {
    el.innerHTML = `<div class="friends-empty">
      <div class="big">🌙</div>
      <div>${t('home.onlyOne')}</div>
      <div class="muted small">${t('home.tapByName')}</div>
    </div>${inviteByName}`;
  } else {
    el.innerHTML = bubbles + inviteByName;
  }
  el.querySelectorAll('.friend-bubble').forEach(b => {
    if (b.id === 'fb-add') { b.onclick = inviteByNameFromHome; return; }
    b.onclick = () => inviteOnlineFriend(b.dataset.name);
  });
  // Light auto-refresh every 8s while on home
  if (!S.onlineTimer) S.onlineTimer = setInterval(() => { if (S.screen === 'home') refreshOnlineStrip(); else { clearInterval(S.onlineTimer); S.onlineTimer = null; } }, 8000);
}

// Tap an online friend → spin up a private table and immediately send them
// the invite. Same backend as the username-invite flow; just pre-filled.
async function inviteOnlineFriend(targetName) {
  if (!S.user) { toast(t('home.signInFirst')); authModal(); return; }
  SFX.click?.();
  S.mode = 'private';
  S.secretSent = false;
  S.openInviteOnLobby = false;
  S.pendingInviteTarget = targetName;       // consumed by onMsg when the lobby lands
  resetGameState();
  try {
    await connect();
    S.net.send({ type: 'create', name: name(), token: S.token, visibility: 'private' });
  } catch { toast(t('errors.serverUnreachable')); S.pendingInviteTarget = null; }
}

function inviteByNameFromHome() {
  if (!S.user) { toast(t('errors.signInFirst')); authModal(); return; }
  inviteFriendFromHome();
}

// Pull personal record + top-3 mini leaderboard for the home cards. Failures
// are silent — the home page must still feel snappy on a slow / offline server.
async function refreshHomeStats() {
  // Top-3 from the global leaderboard (also used by /leaderboard page).
  try {
    const { data } = await api.get('/api/leaderboard');
    const rows = (data?.rows || []).slice(0, 3);
    const el = $('#mini-lb');
    if (!el) return;
    el.innerHTML = rows.length ? rows.map((r, i) => `
      <div class="mini-row">
        <div class="rank">${['🥇','🥈','🥉'][i] || (i + 1)}</div>
        ${avatarFor(r.username, { size: 28 })}
        <div class="who">${esc(r.username)}</div>
        <div class="w">${r.wins || 0}<span class="muted small"> w</span></div>
      </div>`).join('') : '<div class="muted small">no rounds played yet — be the first.</div>';
  } catch { /* server down — keep the loading skeleton */ }
  // Personal record, only if signed in.
  if (S.user && S.token) {
    try {
      const { data } = await api.get('/api/me', S.token);
      const h = data?.history || [];
      const games = h.length;
      const wins = h.filter(g => g.won).length;
      const soulmates = h.filter(g => g.soulmate).length;
      const el = $('#my-stats');
      if (el) el.innerHTML = `
        <div class="stat"><div class="v">${games}</div><div class="k">games</div></div>
        <div class="stat"><div class="v">${wins}</div><div class="k">wins</div></div>
        <div class="stat"><div class="v">${soulmates}</div><div class="k">💞</div></div>`;
    } catch { /* not signed in or no history yet — leave the dashes */ }
  } else {
    const el = $('#my-stats');
    if (el) el.innerHTML = `<div class="stat full"><div class="v">—</div><div class="k">sign in to track your record</div></div>`;
  }
}

// Home → "Invite a friend to play": must be signed in (so the invite has a
// sender name), then open a private room and immediately show the invite
// dialog so the user lands on "type your friend's name" in one tap.
async function inviteFriendFromHome() {
  SFX.click?.();
  if (!S.user) {
    toast(t('home.nameMissing'));
    authModal();
    return;
  }
  S.mode = 'private';
  S.secretSent = false;
  S.openInviteOnLobby = true;   // consumed by onMsg when the 'room' message lands
  resetGameState();
  try {
    await connect();
    // The "Invite a friend" flow defaults to a PRIVATE table — strangers on
    // the floor see it as 🔒 locked and have to be approved.
    S.net.send({ type: 'create', name: name(), token: S.token, visibility: 'private' });
    return;
  } catch { toast(t('errors.serverUnreachable')); S.openInviteOnLobby = false; return; }
}


// Build a shareable join link for a table code.
// Using ?join=CODE so the URL is human-readable and one-click on phones.
function tableShareUrl(code) {
  const u = new URL(window.location.href);
  u.search = '?join=' + encodeURIComponent(code);
  u.hash = '';
  return u.toString();
}

function renderLobby() {
  clearFloaters();
  const r = S.room; if (!r) return;
  const isHost = r.youSeat === r.hostSeat;
  const isPrivate = r.visibility === 'private';
  const pending = isHost ? (r.pending || []) : [];
  const TOTAL_SEATS = 7;
  const free = TOTAL_SEATS - r.seats.length;
  const canBegin = r.seats.length >= 3;
  const shareUrl = tableShareUrl(r.code);

  // Build the seat ring HTML — actual taken seats with avatars + names,
  // free seats as dashed "+ open seat" chairs.
  const seatRing = [];
  for (let i = 0; i < TOTAL_SEATS; i++) {
    const s = r.seats[i];
    if (!s) {
      seatRing.push(`<div class="ring-seat empty" style="--n:${i}; --of:${TOTAL_SEATS}"><div class="ring-blank">+</div><div class="ring-name muted">open</div></div>`);
      continue;
    }
    const tag = i === r.hostSeat ? '<span class="ring-host">★</span>' : '';
    const me = i === r.youSeat;
    const ai = s.isAI;
    if (ai) {
      seatRing.push(`<div class="ring-seat bot" style="--n:${i}; --of:${TOTAL_SEATS}">${avatarFor(s.name, { size: 40 })}${tag}<div class="ring-name muted">${esc(s.name)} <span class="ai-badge">AI</span></div></div>`);
    } else {
      seatRing.push(`<div class="ring-seat ${me ? 'you' : ''}" style="--n:${i}; --of:${TOTAL_SEATS}">${avatarFor(s.name, { size: 44, withRing: me })}${tag}<div class="ring-name ${me ? '' : 'muted'}">${esc(s.name)}${me ? ' (you)' : ''}</div></div>`);
    }
  }

  app.innerHTML = `
    <!-- BIG ROOM CODE HEADER — front and center so the host can share it instantly -->
    <section class="code-banner">
      <div class="cb-label">${t('lobby.yourTable')}</div>
      <div class="cb-code">
        <span class="cb-letters" id="cb-letters">${esc(r.code)}</span>
        <button class="cb-iconbtn" id="copy" data-tip="${t('lobby.copyTip')}">📋</button>
        <button class="cb-iconbtn" id="share" data-tip="${t('lobby.shareTip')}">🔗</button>
      </div>
      <div class="cb-meta">
        <button class="cb-chip ${isPrivate ? 'private' : 'public'}" id="vis-toggle" ${isHost ? '' : 'disabled'} data-tip="${isHost ? t('lobby.visTipHost') : t('lobby.visTipGuest')}">
          ${isPrivate ? t('lobby.visPrivate') : t('lobby.visPublic')}
        </button>
        <span class="cb-seat-count">${t('lobby.seatCount', { n: r.seats.length, max: TOTAL_SEATS, free })}</span>
      </div>
    </section>

    <!-- THE TABLE — real felt with seats arranged in a ring -->
    <section class="lobby-table-wrap">
      <div class="lobby-table lobby-live">
        <div class="lobby-felt">
          <div class="felt-rail"></div>
          <div class="seat-ring">${seatRing.join('')}</div>
          <div class="table-center">
            <div class="card-stack" aria-hidden="true">
              <span class="csc c1"></span><span class="csc c2"></span><span class="csc c3"></span>
            </div>
            <div class="lobby-table-msg">
              ${canBegin ? `<b>${t('lobby.ready')}</b>` : `<b>${t('lobby.needMore', { n: 3 - r.seats.length })}</b>`}
              <span>${t('lobby.seated', { n: r.seats.length, max: TOTAL_SEATS })}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    ${pending.length ? `
    <section class="panel pending-panel">
      <h4 class="center">${t('lobby.waitingDoor')}</h4>
      <div class="pending-list">
        ${pending.map(p => `<div class="pending-row" data-cid="${esc(p.clientId)}">
          ${avatarFor(p.name, { size: 36 })}
          <span class="pending-name">${esc(p.name)}</span>
          <button class="btn sm primary p-ok" data-cid="${esc(p.clientId)}">✅</button>
          <button class="btn sm ghost p-no" data-cid="${esc(p.clientId)}">✖</button>
        </div>`).join('')}
      </div>
    </section>` : ''}

    ${isHost && free > 0 ? `
    <!-- INVITE PLAYERS — embedded friends strip + name search + add bot -->
    <section class="invite-stage">
      <div class="invite-head">
        <span class="ih-label">${t('lobby.invitePlayers')}</span>
        <span class="muted small" id="lobby-online-count"></span>
      </div>
      <div class="friends-row lobby-friends" id="lobby-friends">
        <div class="muted small" style="padding:14px">${t('home.lookingAround')}</div>
      </div>
      <div class="invite-actions">
        <button class="btn" id="inviteUser">${t('lobby.inviteByName')}</button>
        <button class="btn" id="addai" ${free <= 0 ? 'disabled' : ''}>${t('lobby.addComputer')}</button>
      </div>
    </section>` : ''}

    ${isHost ? `
      <button class="btn primary big begin-btn" id="begin" ${canBegin ? '' : 'disabled'}>
        ${canBegin ? t('lobby.beginGame') : t('lobby.beginNeed', { n: 3 - r.seats.length })}
      </button>` : `<p class="center muted">${t('lobby.waitingHost')}</p>`}

    <button class="btn ghost" id="leave">${t('lobby.leaveTable')}</button>`;

  $('#copy').onclick = () => copyTableCode(r.code);
  $('#share').onclick = () => shareTableLink(r.code, shareUrl);
  $('#leave').onclick = leaveToHome;
  if (isHost) {
    $('#begin')?.addEventListener('click', () => { if (!canBegin) return; SFX.resume(); SFX.shuffle(); S.net.send({ type: 'begin' }); });
    $('#addai')?.addEventListener('click', () => { SFX.click(); S.net.send({ type: 'addAI' }); });
    $('#inviteUser')?.addEventListener('click', openInviteUserModal);
    $('#vis-toggle')?.addEventListener('click', () => {
      SFX.click?.();
      S.net.send({ type: 'setVisibility', visibility: isPrivate ? 'public' : 'private' });
    });
    document.querySelectorAll('.p-ok').forEach(b => b.onclick = () => { SFX.click?.(); S.net.send({ type: 'joinResponse', clientId: b.dataset.cid, accept: true  }); });
    document.querySelectorAll('.p-no').forEach(b => b.onclick = () => { SFX.click?.(); S.net.send({ type: 'joinResponse', clientId: b.dataset.cid, accept: false }); });
    if (free > 0) refreshLobbyFriends();
  }
}

// Copy with a satisfying flash on the code letters.
function copyTableCode(code) {
  SFX.click?.();
  navigator.clipboard?.writeText(code);
  toast(t('lobby.copied'));
  const el = $('#cb-letters'); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}

// Use the OS share sheet if available (mobile), otherwise copy the link.
async function shareTableLink(code, url) {
  SFX.click?.();
  const text = t('lobby.shareText', { code });
  if (navigator.share) {
    try { await navigator.share({ title: t('lobby.shareTitle', { code }), text, url }); return; }
    catch { /* user dismissed */ }
  }
  try { await navigator.clipboard.writeText(url); toast(t('lobby.linkCopied')); }
  catch { toast(t('lobby.shareFail')); }
}

// Friends strip inside the lobby — tap a face → send them an invite to THIS table.
async function refreshLobbyFriends() {
  let users = [];
  try { const { data } = await api.get('/api/online'); users = data?.users || []; }
  catch { return; }
  // Hide anyone already seated at this table, plus the user themselves.
  const seated = new Set((S.room?.seats || []).map(s => (s.name || '').toLowerCase()));
  const others = users.filter(u => {
    if (S.user && u.username === S.user.username) return false;
    return !seated.has(u.username.toLowerCase());
  });
  const el = $('#lobby-friends'); if (!el) return;
  const countEl = $('#lobby-online-count'); if (countEl) countEl.textContent = others.length ? `${others.length} online` : 'no one else online';
  if (!others.length) {
    el.innerHTML = `<div class="friends-empty">
      <div class="big">🌙</div>
      <div>No one else online right now.</div>
      <div class="muted small">Use <b>📋 Copy</b> or <b>🔗 Share</b> above to send your friend the table code.</div>
    </div>`;
    return;
  }
  el.innerHTML = others.slice(0, 12).map(u => `
    <button class="friend-bubble" data-name="${esc(u.username)}" data-tip="Invite ${esc(u.username)}">
      ${avatarFor(u.username, { size: 52, withRing: true })}
      <span class="fb-dot" aria-label="online"></span>
      <span class="fb-name">${esc(u.username)}</span>
    </button>`).join('');
  el.querySelectorAll('.friend-bubble').forEach(b => {
    b.onclick = () => {
      SFX.click?.();
      const target = b.dataset.name;
      // Use the existing WS invite — we're already in our own room.
      S.net.send({ type: 'inviteUser', username: target });
      // Optimistic UI: dim the bubble + show "invited"
      b.classList.add('invited');
      const orig = b.querySelector('.fb-name'); if (orig) orig.textContent = '✓ invited';
    };
  });
  // Light auto-refresh while in the lobby
  if (!S.lobbyOnlineTimer) S.lobbyOnlineTimer = setInterval(() => {
    if (S.room && S.screen !== 'home') refreshLobbyFriends();
    else { clearInterval(S.lobbyOnlineTimer); S.lobbyOnlineTimer = null; }
  }, 8000);
}

// Host clicks "Invite a player by username" — prompt for the name, send via WS.
function openInviteUserModal() {
  if (!S.user) { toast(t('errors.signInFirstToInvite')); return; }
  modal(`<h3>${t('inviteUser.title')}</h3>
    <p class="muted small">${t('inviteUser.hint')}</p>
    <input id="inv-name" class="input" placeholder="@username" autocomplete="off" autofocus style="margin:8px 0; padding:10px; width:100%; box-sizing:border-box; background:#160d1a; border:1px solid #3c2a42; color:#f3e9df; border-radius:8px; font-size:15px;" />
    <div class="grid2" style="margin-top:10px">
      <button class="btn ghost" id="inv-cancel">${t('common.cancel')}</button>
      <button class="btn primary" id="inv-send">${t('inviteUser.send')}</button>
    </div>`, () => {
      const input = document.getElementById('inv-name');
      input?.focus();
      const submit = () => {
        const username = (input?.value || '').trim().replace(/^@/, '');
        if (!username) { toast(t('inviteUser.typeFirst')); return; }
        S.net.send({ type: 'inviteUser', username });
        closeModal();
      };
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      document.getElementById('inv-send').onclick = submit;
      document.getElementById('inv-cancel').onclick = closeModal;
    });
}

// Show the invitee's "X invites you to play" prompt and let them Join or Decline.
function showIncomingInvite(payload) {
  SFX.crush?.();
  modal(`<h3>${t('incoming.title', { from: esc(payload.from) })}</h3>
    <p>${payload.seats ? t('incoming.seatedSoFar', { code: esc(payload.code), seats: payload.seats }) : t('incoming.roomOnly', { code: esc(payload.code) })}</p>
    <div class="grid2" style="margin-top:10px">
      <button class="btn ghost" id="inv-no">${t('incoming.notNow')}</button>
      <button class="btn primary" id="inv-yes">${t('incoming.joinNow')}</button>
    </div>`, () => {
      document.getElementById('inv-no').onclick = closeModal;
      document.getElementById('inv-yes').onclick = async () => {
        closeModal();
        S.mode = 'join'; S.secretSent = false;
        try { resetGameState(); } catch {}
        try {
          if (!S.net) await connect();
          try { S.net.send({ type: 'leave' }); } catch {}
          S.net.send({ type: 'join', code: payload.code, name: name(), token: S.token });
        } catch { toast(t('incoming.couldNotJoin')); }
      };
    });
}

function renderWaiting(msg) { clearFloaters(); app.innerHTML = `<section class="panel center waiting"><div class="spinner">⚜</div><p>${esc(msg)}</p></section>`; }

function renderSetup() {
  clearFloaters();
  // First-time onboarding chain: concept intro → cards guide → spotlight
  // setup tutorial. Each step is independently gated by its own
  // localStorage flag, so returning players see nothing.
  maybeRunConceptIntro(() => maybeRunCardsGuide(() => maybeRunSetupTutorial()));
  const v = S.view;
  const others = v.players.filter(p => p.id !== v.youAre);
  const sel = (S._crush != null) ? v.players[S._crush] : null;

  app.innerHTML = `
    <section class="aim-stage">
      <div class="aim-hero">
        <div class="aim-emoji">💘</div>
        <h2 class="aim-title">${t('setup.title')}</h2>
        <p class="aim-sub">${t('setup.sub1')}<br><b>${t('setup.sub2')}</b></p>
      </div>

      <div class="aim-grid">
        ${others.map(p => `
          <button class="aim-card ${S._crush === p.id ? 'on' : ''}" data-c="${p.id}">
            <div class="aim-av">${avatarFor(p.name, { size: 64, withRing: S._crush === p.id })}</div>
            <div class="aim-seat">${p.seat.icon}</div>
            <div class="aim-name">${esc(p.name)}${p.isAI ? ' <span class="ai-badge">AI</span>' : ''}</div>
            ${S._crush === p.id ? '<div class="aim-mark">💘</div>' : ''}
          </button>`).join('')}
      </div>

      <div class="aim-preview ${sel ? 'shown' : ''}">
        ${sel ? `
          <div class="aim-prev-row">
            ${avatarFor(S.user?.username || 'me', { size: 38, withRing: true })}
            <span class="aim-prev-arrow">💞</span>
            ${avatarFor(sel.name, { size: 38, withRing: true })}
          </div>
          <div class="aim-prev-text">${t('setup.previewFancy', { seat: sel.seat.icon, name: esc(sel.name) })}<br>
          <span class="muted">${t('setup.previewWin', { name: esc(sel.name) })}</span></div>
        ` : `<div class="aim-prev-text muted">${t('setup.tapToChoose')}</div>`}
      </div>

      <button class="btn primary big aim-lock" id="lock" ${sel ? '' : 'disabled'}>${sel ? t('setup.lockReady', { name: esc(sel.name) }) : t('setup.lockPrompt')}</button>
    </section>`;
  app.querySelectorAll('[data-c]').forEach(el => el.onclick = () => { SFX.click?.(); S._crush = +el.dataset.c; renderSetup(); });
  $('#lock').onclick = () => { SFX.crush(); S.net.send({ type: 'setSecret', crush: S._crush }); S.secretSent = true; renderWaiting(t('setup.locked')); };
}

// ---------- the felt table ----------
function renderTable() {
  clearFloaters();
  const v = S.view; const n = v.players.length; const me = v.players[v.youAre];
  // Fire the play-phase tutorial once, on the first turn that's actually
  // ours so the user can see their hand before being asked to "tap a card".
  if (v.turn === v.youAre && !S.playTourFired) { S.playTourFired = true; setTimeout(() => maybeRunPlayTutorial(), 300); }
  const myTurn = v.turn === v.youAre;
  let chips = '';
  const aiming = !!S.sel && myTurn;
  for (const p of v.players) {
    const rel = (p.id - v.youAre + n) % n;                 // you at the bottom
    const ang = (90 + rel * (360 / n)) * Math.PI / 180;
    // Radii tuned so the WHOLE chip (mini-hand on top + avatar + name + love-line
    // + badges) sits clear of the wooden rim. The vertical radius is the tighter
    // one because the chip is taller than it is wide; we also pad the horizontal
    // a touch so side chips don't kiss the rim either.
    const x = 50 + 36 * Math.cos(ang), y = 50 + 30 * Math.sin(ang);
    const validTgt = aiming && p.id !== v.youAre
      && (S.sel.key !== 'HEARTBREAK' || p.stage > 0)
      && (S.sel.key !== 'JEALOUSY' || p.stage >= 2);     // only the envy-worthy (Dating+)
    const tgt = validTgt ? ' targetable' : '';
    chips += `<div class="chip-pos${tgt}" data-seat="${p.id}" style="left:${x}%;top:${y}%">${chipHTML(p, v.turn, v.youAre)}</div>`;
  }
  const aimCard = aiming ? S.sel.key : null;
  const aimHint = { GLANCE: t('game.aimGlance'), SWAY: t('game.aimSway'), HEARTBREAK: t('game.aimBreak'), JEALOUSY: t('game.aimExpose'), FRIENDZONE: t('game.aimFreeze') };
  app.innerHTML = `
    <div class="table-status">
      <span data-tip="${t('game.deckCountTip')}">${t('game.cardsLeft', { n: v.deckCount })}${v.deckCount <= n ? ' ' + t('game.finalRound') : ''}</span>
      <span class="${myTurn ? 'turnnow' : 'muted'}">${myTurn ? t('game.yourTurn') : t('game.turnOf', { name: v.players[v.turn].name })}</span>
      <button class="help-btn" id="game-help" data-tip="${t('game.helpTip')}" aria-label="Help">🎓</button>
    </div>
    ${aiming ? `<div class="aim-banner">${CARD[aimCard].icon} <b>${title(aimCard)}</b> — ${aimHint[aimCard] || ''}<button id="aim-cancel">${t('common.cancel')}</button></div>` : ''}
    <div class="table-wrap${aiming ? ' aiming' : ''}"><div class="felt">
      <div class="table-center">
        <div class="piles">
          <div class="pile deck" data-tip="${t('game.drawTip')}"><span class="pc">${v.deckCount}</span><span class="pl">draw</span></div>
          <div class="pile disc" data-tip="${t('game.discardTip')}">${v.discardTop ? `<span class="corner">${CARD[v.discardTop].icon}</span>${CARD[v.discardTop].icon}` : '—'}<span class="pl">played</span></div>
        </div>
        <div class="talk">${v.log[0] ? formatLogEvent(v.log[0]) : t('game.tableSet')}</div>
      </div>${chips}
    </div></div>
    <div class="hand-area ${myTurn ? '' : 'idle'}">
      <!-- Always-visible goal hint so new players never lose track of the win condition -->
      <div class="goal-hint">${t('goal.reminder')}</div>
      <div class="love-bar" data-tip="${t('loveBar.tip')}">
        <div class="lb-head">
          <span class="lb-secret">${t('loveBar.secret')} 💘 ${avatarFor(v.players[me.crush].name, { size: 22 })}<b>${esc(v.players[me.crush].name)}</b></span>
          <span class="lb-stage">${STAGE_NAMES[me.stage]}</span>
        </div>
        <div class="lb-track">
          <div class="lb-fill" style="width:${(me.stage / 3) * 100}%"></div>
          <div class="lb-pip ${me.stage >= 1 ? 'lit' : ''}" data-tip="${t('loveBar.pipSpark')}">✨</div>
          <div class="lb-pip ${me.stage >= 2 ? 'lit' : ''}" data-tip="${t('loveBar.pipDating')}">🌹</div>
          <div class="lb-pip ${me.stage >= 3 ? 'lit' : ''}" data-tip="${t('loveBar.pipCrazy')}">💋</div>
          <div class="lb-pip commit ${me.ready ? 'ready' : ''} ${me.won ? 'lit' : ''}" data-tip="${me.ready ? t('loveBar.pipReady') : t('loveBar.pipCommit')}">💍</div>
        </div>
        ${me.ready ? (
          (me.hand || []).includes('MOMENT')
            ? `<button class="lb-confess-btn" id="confess-now" type="button">${t('loveBar.confessNow')}</button>`
            : `<div class="lb-confess wait">${t('loveBar.confessWait')}</div>`
        ) : ''}
      </div>
      <div class="hand fan">${(me.hand || []).map((k, i) => cardHTML(k, i)).join('')}</div>
      <div class="hint-line">${myTurn ? t('game.tapCard') : t('game.waiting')}</div>
    </div>
    <aside class="log" aria-label="game log">${v.log.slice(0, 8).map(e => `<div class="e">${formatLogEvent(e)}</div>`).join('')}</aside>`;
  const helpBtn = $('#game-help'); if (helpBtn) helpBtn.onclick = () => replayTour('play');
  // Wire the new "💍 CONFESS YOUR LOVE" button: auto-find the first ❤️ Moment
  // card in the player's hand and trigger the same commit flow as tapping it.
  const cb = $('#confess-now'); if (cb) cb.onclick = () => {
    SFX.click?.();
    const me2 = S.view?.players?.[S.view?.youAre];
    if (!me2) return;
    const idx = (me2.hand || []).indexOf('MOMENT');
    if (idx >= 0) commitSheet(idx);
  };
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
  const stageTips = [t('loveBar.pipSpark'), t('loveBar.pipDating'), t('loveBar.pipCrazy')];
  const line = STAGES.slice(1).map((ic, idx) =>
    `<span class="st ${p.stage >= idx + 1 ? 'lit' : ''}" data-tip="${stageTips[idx]}">${ic}</span>`).join('')
    + `<span class="st commit ${p.won ? 'lit' : (p.ready ? 'ready' : '')}" data-tip="${p.won ? t('loveBar.pipMutual') : t('loveBar.pipCommit')}">💍</span>`;
  const b = [];
  if (p.shield) b.push({ ic: '🛡️', tip: t('badges.shield') });
  if (p.frozen) b.push({ ic: '🤝', tip: t('badges.frozen') });
  if (p.soulmate) b.push({ ic: '💞', tip: t('badges.soulmate') });
  const fan = (p.id !== meId)
    ? `<div class="minihand">${'<span class="mb"></span>'.repeat(Math.min(2, p.handCount || 0))}<span class="mhc">${p.handCount || 0}</span></div>`
    : '';
  // Exposed crush pill — when Jealousy lands, p.revealed flips to true and
  // publicView populates p.crush for everyone. Show it as a green-tinted tag
  // under the love-line so the whole table can see who they pine for.
  const exposed = (p.revealed && p.id !== meId && S.view && S.view.players[p.crush])
    ? `<div class="exposed" title="Their secret crush was exposed">💚 fancies ${S.view.players[p.crush].seat.icon} ${esc(S.view.players[p.crush].name)}</div>`
    : '';
  const classes = ['chip',
    p.id === activeId ? 'active' : '',
    p.frozen ? 'frozen' : '',
    p.won ? 'won' : '',
    p.revealed && p.id !== meId ? 'exposed-chip' : '',
  ].filter(Boolean).join(' ');
  return `<div class="${classes}">
    ${fan}
    <div class="avatar">${p.seat.icon}</div>
    <div class="cnm">${esc(p.name)}${p.isAI ? ' <span class="ai-badge">AI</span>' : ''}</div>
    <div class="loveline">${line}</div>
    ${exposed}
    <div class="badges">${b.length ? b.map(x => `<span class="bdg" data-tip="${x.tip}">${x.ic}</span>`).join('') : '<span class="bdg dim">·</span>'}</div>
  </div>`;
}
// a Solitaire-style playing card: white face, corner indices, big centre motif
// A playing card built for instant recognition:
//   ┌────────────────────┐
//   │  GROW          ME │   ← big action verb + a target badge
//   │  ╔════════════╗   │
//   │  ║    ❤️    ║   │   ← framed art panel
//   │  ╚════════════╝   │
//   │  +1 stage on me   │   ← precise effect
//   │  Hearts race.     │   ← italic flavour
//   └────────────────────┘
// The action verb is the VERY FIRST thing a new player reads. The target
// badge (ME / RIVAL / SEE) tells them WHO the card affects in one glance.
// Long description still lives in the data-tip tooltip.
function cardHTML(key, i) {
  const d = CARD[key];
  // Tone label now pulls from i18n (tone.self / tone.attack / tone.info)
  // so it switches with the rest of the UI: ME/RIVAL/SEE ↔ MOI/RIVAL/VOIR.
  const toneLabel = t(`tone.${d.tone}`);
  return `<div class="pcard f-${d.fam}" data-play="${i}" data-tip="${esc(d.desc)}">
    <div class="pc-top">
      <span class="pc-action">${esc(d.action)}</span>
      <span class="pc-tone ${d.tone}">${toneLabel}</span>
    </div>
    <div class="pc-art">
      <div class="pc-glow"></div>
      <div class="pc-icon">${d.icon}</div>
      <div class="pc-name">${title(key)}</div>
    </div>
    <div class="pc-effect">${esc(d.short)}</div>
    <div class="pc-tag">${esc(d.tag)}</div>
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
  S.sel = null;
  act({ cardIndex: sel.index, target: seatId });
}
function unplayable(me, v, key) {
  if (key === 'GUARDIAN' && me.shield) return 'your heart is already guarded';
  if (key === 'HEARTBREAK' && !v.players.some(p => p.id !== v.youAre && p.stage > 0)) return 'no one has any love to break yet';
  if (key === 'JEALOUSY' && !v.players.some(p => p.id !== v.youAre && p.stage >= 2)) return 'no rival is Dating yet — no one to envy';
  return null;
}
function playCard(i) {
  const v = S.view; const me = v.players[v.youAre]; if (v.turn !== v.youAre) return;
  const key = me.hand[i];
  if (S.sel && S.sel.index === i) return clearSel();          // tap the selected card again to cancel
  const why = unplayable(me, v, key);
  if (why) return discardSheet(i, key, why);
  if (key === 'MOMENT' && me.stage >= READY) return commitSheet(i);   // at 💋 → the commit gamble
  if (CARD[key].needsTarget === 'self') { S.sel = null; SFX.click(); return act({ cardIndex: i }); }  // Moment(<3) / Guardian
  return enterTarget(i, key);                                  // Heartbreak / Friendzone / Glance / Sway → tap a player
}
function commitSheet(i) {
  const v = S.view; const me = v.players[v.youAre]; const obj = v.players[me.crush];
  sheet(`<div class="sheet-title">${t('commit.title', { name: `${obj.seat.icon} ${esc(obj.name)}` })}</div>
    <p class="center" style="font-size:14px;line-height:1.5">${t('commit.body', { name: esc(obj.name) })}</p>
    <div class="commit-outcomes">
      <div class="co-row good">${t('commit.ifYes')}</div>
      <div class="co-row bad">${t('commit.ifNo')}</div>
    </div>
    <p class="center muted small" style="margin:8px 0 4px">${t('commit.tipGlance')}</p>
    <button class="btn primary big" id="docommit">${t('commit.doConfess')}</button>
    <button class="btn ghost" id="sx">${t('commit.notYet')}</button>`, () => {
    document.getElementById('docommit').onclick = () => { closeModal(); S.sel = null; act({ cardIndex: i }); };
    document.getElementById('sx').onclick = closeModal;
  });
}
function discardSheet(i, key, why) {
  S.sel = null;
  sheet(`<div class="sheet-title">${CARD[key].icon} Can't play ${title(key)}</div>
    <p class="center small">${esc(why.charAt(0).toUpperCase() + why.slice(1))}. You must play a card — discard this one, or pick another from your hand.</p>
    <button class="btn primary" id="dodiscard">Discard ${title(key)}</button>
    <button class="btn ghost" id="sx">Pick another card</button>`, () => {
    document.getElementById('dodiscard').onclick = () => { closeModal(); act({ cardIndex: i, discard: true }); };
    document.getElementById('sx').onclick = closeModal;
  });
}
function sheet(inner, wire) { $('#modal-host').innerHTML = `<div class="overlay sheet-overlay"><div class="sheet">${inner}</div></div>`; wire && wire(); }

// ---------- reveal ----------
function renderReveal() {
  clearFloaters();
  const v = S.view;
  const winner = v.players[v.winnerId];
  const byDevotion = v.endReason === 'devotion';
  const headline = byDevotion
    ? t('reveal.byDevotion', { name: esc(winner.name) })
    : t('reveal.byDeck', { name: esc(winner.name) });
  const pairs = [];
  for (const p of v.players) { const o = v.players[p.crush]; if (p.soulmate && o.crush === p.id && p.id < o.id) pairs.push([p, o]); }
  app.innerHTML = `
    <section class="panel center">
      <h2>${t('reveal.soulmatesHeader').replace('💞 ', '')}</h2>
      <div class="bigseat">${winner.seat.icon}</div>
      <h3 class="gold">${headline}</h3>
      ${winner.soulmate ? `<div class="muted">${t('reveal.soulmateLine')}</div>` : ''}
    </section>
    ${pairs.length ? `<section class="panel center"><h3>${t('reveal.soulmatesHeader')}</h3>${pairs.map(([a, b]) => `<div class="pairline">${a.seat.icon} ${esc(a.name)} 💘 ${b.seat.icon} ${esc(b.name)}</div>`).join('')}</section>` : ''}
    <section class="panel">
      ${[...v.players].sort((a, b) => b.stage - a.stage).map(p => { const o = v.players[p.crush]; return `<div class="revealline">
        <span class="si">${p.seat.icon}</span>
        <div class="rl-main"><b>${esc(p.name)}</b>${p.isAI ? ' <span class="ai-badge">AI</span>' : ''}${p.id === v.winnerId ? ' <span class="hosttag">winner</span>' : ''}
          <div class="muted small">${STAGES[p.stage] || '—'} ${STAGE_NAMES[p.stage]} · 💘 ${o.seat.icon} ${esc(o.name)}${p.soulmate ? ` · <b class="pink">${t('reveal.mutualTag')}</b>` : ''}</div></div>
      </div>`; }).join('')}
    </section>
    <button class="btn primary big" id="again">${t('reveal.playAgain')}</button>`;
  $('#again').onclick = leaveToHome;
}

// ---------- THE FLOOR (casino-style table browser) ----------
// Polls /api/tables and renders one little felt-card per live table. A guest
// can click a public table to sit down, or "request to join" a private one —
// the host then sees an Accept/Decline popup in their lobby.
let floorPollTimer = null;
async function showFloor() {
  SFX.click?.();
  clearFloaters();
  S.screen = 'floor';
  app.innerHTML = `<section class="panel floor-panel">
    <div class="floor-head">
      <h3>${t('floor.title')}</h3>
      <button class="btn ghost sm" id="floor-back">${t('common.back')}</button>
    </div>
    <p class="muted small center" style="margin-top:-6px">${t('floor.blurb')}</p>
    <div class="floor-grid" id="floor-grid"><div class="muted small center" style="padding:30px 0">${t('floor.loading')}</div></div>
    <button class="btn ghost sm" id="floor-refresh">${t('floor.refresh')}</button>
  </section>`;
  $('#floor-back').onclick = leaveToHome;
  $('#floor-refresh').onclick = () => { SFX.click?.(); refreshFloor(); };
  await refreshFloor();
  // Light auto-poll so the floor stays alive while the user thinks.
  if (floorPollTimer) clearInterval(floorPollTimer);
  floorPollTimer = setInterval(() => { if (S.screen === 'floor') refreshFloor(); else { clearInterval(floorPollTimer); floorPollTimer = null; } }, 5000);
}

async function refreshFloor() {
  let tables = [];
  try { const { data } = await api.get('/api/tables'); tables = data?.tables || []; }
  catch { /* server hiccup — keep prior render */ return; }
  const el = $('#floor-grid'); if (!el) return;
  if (!tables.length) {
    el.innerHTML = `<div class="floor-empty">
      <div class="big">🎲</div>
      <div>${t('floor.empty')}</div>
      <div class="muted small">${t('floor.emptyHint')}</div>
    </div>`;
    return;
  }
  el.innerHTML = tables.map(renderTableCard).join('');
  // Wire each card's CTA. Disabled buttons just no-op.
  el.querySelectorAll('[data-table-action]').forEach(btn => {
    if (btn.disabled) return;
    btn.onclick = () => onTableCardClick(btn.dataset.code, btn.dataset.tableAction);
  });
}

// Build one little felt-card from a table snapshot. (Parameter renamed from
// `t` to `card` so it doesn't shadow the imported i18n t() function.)
function renderTableCard(card) {
  const free = card.maxSeats - card.seatCount;
  const isPrivate = card.visibility === 'private';
  const isStarted = !!card.started;
  let statusClass, statusLabel, action, actionLabel, disabled = false;
  if (isStarted) {
    statusClass = 'in-game'; statusLabel = t('floor.inGame');
    action = 'none'; actionLabel = t('floor.inGame'); disabled = true;
  } else if (free <= 0) {
    statusClass = 'full'; statusLabel = t('floor.full');
    action = 'none'; actionLabel = t('floor.full'); disabled = true;
  } else if (isPrivate) {
    statusClass = 'locked'; statusLabel = t('floor.private', { n: card.seatCount, max: card.maxSeats });
    action = 'request'; actionLabel = t('floor.requestJoin');
  } else {
    statusClass = 'open'; statusLabel = t('floor.open', { n: card.seatCount, max: card.maxSeats });
    action = 'join'; actionLabel = t('floor.takeSeat');
  }
  // The mini-felt: an oval with up to 7 seat dots (avatars for humans).
  const seatDots = Array.from({ length: card.maxSeats }, (_, i) => {
    const seat = card.seats[i];
    if (!seat) return `<span class="seat-dot empty" style="--n:${i}"></span>`;
    if (seat.isAI) return `<span class="seat-dot ai" style="--n:${i}" title="${esc(seat.name)} (AI)">🤖</span>`;
    return `<span class="seat-dot" style="--n:${i}" title="${esc(seat.name)}">${avatarFor(seat.name, { size: 26 })}</span>`;
  }).join('');
  return `<div class="table-card ${statusClass} ${disabled ? 'disabled' : ''}">
    <div class="felt">
      <div class="felt-inner">
        <div class="felt-code">${esc(card.code)}</div>
        <div class="felt-dots" style="--seats:${card.maxSeats}">${seatDots}</div>
      </div>
    </div>
    <div class="table-meta">
      <div class="table-host">${avatarFor(card.hostName, { size: 24 })} <span>${esc(card.hostName)}</span></div>
      <div class="table-status ${statusClass}">${statusLabel}</div>
    </div>
    <button class="btn ${action === 'join' ? 'primary' : ''} ${action === 'request' ? 'locked-btn' : ''}"
            data-table-action="${action}" data-code="${esc(card.code)}" ${disabled ? 'disabled' : ''}>
      ${actionLabel}
    </button>
  </div>`;
}

async function onTableCardClick(code, action) {
  SFX.click?.();
  if (action === 'join') {
    // Walk up like a regular code-join — server lets us in because it's public.
    S.mode = 'public';
    S.secretSent = false;
    resetGameState();
    try {
      await connect();
      S.net.send({ type: 'join', code, name: name(), token: S.token });
    } catch { toast(t('errors.serverUnreachable')); }
  } else if (action === 'request') {
    // Ping the host and wait for them to accept/decline.
    try {
      await connect();
      S.pendingTableCode = code;
      S.net.send({ type: 'requestJoin', code, name: name(), token: S.token });
      // Optimistic UI: open a "waiting for host" screen so the user sees
      // their request is in flight.
      renderWaitingForHost(code);
    } catch { toast(t('errors.serverUnreachable')); }
  }
}

function renderWaitingForHost(code) {
  S.screen = 'waiting-host';
  S.pendingTableCode = code;
  app.innerHTML = `<section class="panel center">
    <div class="big-emoji">🚪</div>
    <h3>${t('floor.knocking', { code: `<b>${esc(code)}</b>` })}</h3>
    <p class="muted small">${t('floor.knockingHint')}</p>
    <div class="spinner inline">⚜</div>
    <button class="btn ghost" id="cancel">${t('floor.goBack')}</button>
  </section>`;
  $('#cancel').onclick = () => {
    if (S.net) try { S.net.send({ type: 'leave' }); S.net.close?.(); S.net = null; } catch {}
    S.pendingTableCode = null;
    showFloor();
  };
}

// ---------- leaderboard ----------
async function showLeaderboard() {
  SFX.click(); renderWaiting(t('common.loading'));
  // No limit param → server returns up to 1000 players (effectively all).
  const { data } = await api.get('/api/leaderboard');
  const rows = data.rows || [];
  // Find the current user's row so we can highlight + scroll to it.
  const meIdx = S.user ? rows.findIndex(r => r.username === S.user.username) : -1;
  // Medals for the top 3, plain rank for the rest.
  const rankCell = (i) => ['🥇','🥈','🥉'][i] || `<span class="lb-rank">${i + 1}</span>`;
  app.innerHTML = `<section class="panel lb-panel"><h3 class="center">${t('leaderboard.title')}</h3>
    ${rows.length ? `
      <div class="lb-meta">${t('leaderboard.totalPlayers', { n: rows.length })}</div>
      <div class="lb-scroll">
        <table class="lb">
          <thead><tr><th>#</th><th>${t('leaderboard.player')}</th><th>${t('leaderboard.wins')}</th><th>💞</th><th>${t('leaderboard.score')}</th></tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr class="${i === meIdx ? 'me' : ''} ${i < 3 ? 'top' : ''}">
              <td>${rankCell(i)}</td>
              <td><span class="lb-player">${avatarFor(r.username, { size: 28 })}<span>${esc(r.username)}${i === meIdx ? ' <span class="lb-you">' + t('leaderboard.you') + '</span>' : ''}</span></span></td>
              <td>${r.wins || 0}</td>
              <td>${r.soulmates || 0}</td>
              <td>${r.totalScore || 0}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`
      : `<p class="center muted">${esc(data.note || t('leaderboard.empty'))}<br/>${t('leaderboard.emptyHint')}</p>`}
    </section><button class="btn ghost" id="back">${t('common.back')}</button>`;
  $('#back').onclick = renderHome;
  // Scroll the user's row into view if they're on the board but below the fold.
  if (meIdx >= 0) {
    requestAnimationFrame(() => {
      const me = document.querySelector('.lb tr.me');
      if (me) me.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
}

// ---------- auth ----------
// Password-less: one field, one button. If the name exists, sign the user in;
// otherwise create the account. Either way they get a token and a game.

function authModal() { renderAuthOne(); }

function renderAuthOne() {
  modal(`<h3 class="center">${t('welcome.pickName')}</h3>
    <p class="muted small center" style="margin:6px 0 12px;">${t('welcome.pickBlurb')}</p>
    <input id="auth-name" class="auth-input" placeholder="${t('welcome.placeholder')}" maxlength="24" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <div id="auth-hint" class="hint" style="font-size:12px; margin:-2px 0 6px;">${t('welcome.hint')}</div>
    <div class="err" id="auth-err" style="color:#e85c86; font-size:13px; min-height:18px; margin:4px 0;"></div>
    <button class="btn primary" id="auth-go">${t('welcome.continue')}</button>
    <button class="btn ghost" id="auth-x">${t('common.cancel')}</button>`, () => {
    const input = document.getElementById("auth-name");
    const hint  = document.getElementById("auth-hint");
    const err   = document.getElementById("auth-err");
    const go    = document.getElementById("auth-go");
    input.focus();
    let lastChecked = null;
    let checkTimer = null;
    const validate = v => /^[a-zA-Z0-9_]{2,24}$/.test(v);
    const onType = () => {
      const v = input.value.trim();
      err.textContent = "";
      if (!v) { hint.textContent = t('welcome.hint'); hint.classList.remove("ok"); return; }
      if (!validate(v)) { hint.textContent = t('welcome.onlyChars'); hint.classList.remove("ok"); return; }
      hint.textContent = t('welcome.lookingUp'); hint.classList.remove("ok");
      clearTimeout(checkTimer);
      checkTimer = setTimeout(async () => {
        if (input.value.trim() !== v) return;
        const r = await fetch("/api/auth/check-username?u=" + encodeURIComponent(v)).then(x => x.json()).catch(() => ({}));
        if (input.value.trim() !== v) return;
        if (r.available)      { hint.textContent = t('welcome.nameFree'); hint.classList.add("ok"); }
        else if (r.valid === false) { hint.textContent = r.reason || t('welcome.invalidName'); hint.classList.remove("ok"); }
        else                  { hint.textContent = t('welcome.nameTaken'); hint.classList.remove("ok"); }
        lastChecked = v;
      }, 220);
    };
    input.addEventListener("input", onType);
    input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
    document.getElementById("auth-x").onclick = closeModal;
    go.onclick = submit;
    async function submit() {
      const username = input.value.trim();
      if (!validate(username)) { err.textContent = t('welcome.pickRules'); return; }
      go.disabled = true; go.textContent = "…";
      const { status, data } = await api.post("/api/auth/continue", { username });
      if (status === 200) {
        S.token = data.token; S.user = data.user;
        localStorage.setItem("hh_token", S.token);
        localStorage.setItem("hh_user", JSON.stringify(S.user));
        refreshWho();
        ensurePresenceConnection();
        showWelcomeBurst(S.user.username);
      } else {
        err.textContent = data.error || t('welcome.couldNotSign');
        go.disabled = false; go.textContent = t('welcome.continue');
      }
    }
  });
}

// Show a celebratory "welcome" burst then drop the user into a solo game.
function showWelcomeBurst(username) {
  const host = document.getElementById("modal-host");
  if (!host) return;
  host.innerHTML = `<div class="overlay"><div class="modal" style="position:relative; overflow:visible;">
    <div class="welcome-burst">
      <div class="heart">💞</div>
      <h2>${t('welcome.burstTitle')}</h2>
      <div class="who">${esc(username)} <span class="muted small">· ${t('welcome.burstYouIn')}</span></div>
      <div class="sub">${t('welcome.burstSub')}</div>
    </div>
    <div id="confetti-host" style="position:absolute; inset:0; pointer-events:none; overflow:hidden;"></div>
  </div></div>`;
  const cf = document.getElementById("confetti-host");
  if (cf) {
    const emojis = ["💗","💖","💞","✨","🌹","💕"];
    for (let i = 0; i < 16; i++) {
      const span = document.createElement("span");
      span.className = "confetti";
      span.textContent = emojis[i % emojis.length];
      span.style.left = "50%"; span.style.top = "30%";
      span.style.setProperty("--cx", ((Math.random() * 280 - 140) | 0) + "px");
      span.style.setProperty("--cy", ((Math.random() * 220 + 80) | 0) + "px");
      span.style.setProperty("--cr", (((Math.random() * 720) - 360) | 0) + "deg");
      span.style.animationDelay = (Math.random() * 0.25).toFixed(2) + "s";
      cf.appendChild(span);
    }
  }
  setTimeout(() => {
    closeModal();
    // If they signed in to follow a shared invite link, jump straight to
    // that table instead of dealing a solo game.
    if (S.pendingDeepJoin) {
      const code = S.pendingDeepJoin; S.pendingDeepJoin = null;
      toast(t('welcome.welcomeJoining', { name: username, code }));
      try { joinTableByCode(code); } catch { renderHome(); }
      return;
    }
    toast(t('welcome.welcomeDealing', { name: username }));
    try { playVsComputer(); } catch (e) { renderHome(); }
  }, 1500);
}
function accountMenu() {
  modal(`<div class="account-head">
      ${avatarFor(S.user.username, { size: 80, clickable: true, withRing: true, id: 'acct-avatar' })}
      <div class="account-name">${esc(S.user.username)}</div>
      <div class="muted small">${t('auth.tapAvatarHint')}</div>
    </div>
    <button class="btn" id="lb">${t('auth.myLeaderboard')}</button>
    <button class="btn ghost" id="out">${t('auth.signOut')}</button>
    <button class="btn ghost" id="x">${t('common.close')}</button>`, () => {
    $('#acct-avatar').onclick = () => { rerollAvatar(); closeModal(); accountMenu(); };
    $('#lb').onclick = () => { closeModal(); showLeaderboard(); };
    $('#out').onclick = () => { S.token = null; S.user = null; localStorage.removeItem('hh_token'); localStorage.removeItem('hh_user'); refreshWho(); closeModal(); if (S.screen === 'home') renderHome(); };
    $('#x').onclick = closeModal;
  });
}
function showRules() {
  modal(`<h3>${t('rules.title')}</h3>
    <div class="rules-tour-row">
      <button class="btn primary sm" id="rt-intro">${t('intro.replayBtn')}</button>
      <button class="btn primary sm" id="rt-cards">${t('cardGuide.replayBtn')}</button>
      <button class="btn sm" id="rt-home">${t('rules.tourHome')}</button>
      <button class="btn sm" id="rt-play">${t('rules.tourPlay')}</button>
    </div>

    <div class="rules-section">
      <div class="rules-step"><span class="rs-num">1</span><div><b>${t('rules.step1Title')}</b> ${t('rules.step1Body')}</div></div>
      <div class="rules-step"><span class="rs-num">2</span><div><b>${t('rules.step2Title')}</b> ${t('rules.step2Body')}</div></div>
      <div class="rules-step"><span class="rs-num">3</span><div><b>${t('rules.step3Title')}</b> ${t('rules.step3Body')}</div></div>
      <div class="rules-step"><span class="rs-num">4</span><div><b>${t('rules.step4Title')}</b> ${t('rules.step4Body')}</div></div>
    </div>

    <div class="rules-heading">${t('rules.cardsHeading')}</div>
    <div class="rules-cards">
      <div class="rc"><span class="rc-ic">❤️</span>${t('rules.rcGrow')}</div>
      <div class="rc"><span class="rc-ic">👀</span>${t('rules.rcPeek')}</div>
      <div class="rc"><span class="rc-ic">💘</span>${t('rules.rcSwitch')}</div>
      <div class="rc"><span class="rc-ic">💔</span>${t('rules.rcBreak')}</div>
      <div class="rc"><span class="rc-ic">💚</span>${t('rules.rcExpose')}</div>
      <div class="rc"><span class="rc-ic">🛡️</span>${t('rules.rcShield')}</div>
      <div class="rc"><span class="rc-ic">🤝</span>${t('rules.rcFreeze')}</div>
    </div>

    <p class="small muted" style="margin-top:8px;">${t('rules.foot')}</p>
    <button class="btn primary" id="x">${t('common.gotIt')}</button>`, () => {
    $('#x').onclick = closeModal;
    $('#rt-intro').onclick = () => { closeModal(); localStorage.removeItem('pyaar_concept_v1'); showConceptIntro(); };
    $('#rt-cards').onclick = () => { closeModal(); localStorage.removeItem('pyaar_cardguide_v1'); showCardsGuide(); };
    $('#rt-home').onclick = () => replayTour('home');
    $('#rt-play').onclick = () => replayTour('play');
  });
}

// ============================================================ NET FLOW
async function connect() {
  if (S.net) return;
  S.net = new Net(onMsg);
  try { await S.net.connect(); } catch { toast(t('errors.serverUnreachable')); S.net = null; throw new Error('no server'); }
  // Register presence right away so other players can invite us by username.
  if (S.token) S.net.send({ type: 'identify', token: S.token });
}

// Keep a long-lived WS open whenever a user is signed in, so they can receive
// game invites from friends while sitting on the home screen.
async function ensurePresenceConnection() {
  if (!S.token) return;
  try {
    if (!S.net) await connect();
    else S.net.send({ type: 'identify', token: S.token });
  } catch {}
}
function name() { return S.user?.username || 'You'; }

async function playVsComputer() { SFX.resume(); SFX.click(); S.mode = 'solo'; S.secretSent = false; resetGameState(); try { await connect(); S.net.send({ type: 'create', name: name(), token: S.token }); } catch {} }
async function createRoom() { SFX.resume(); SFX.click(); S.mode = 'private'; S.secretSent = false; resetGameState(); try { await connect(); S.net.send({ type: 'create', name: name(), token: S.token }); } catch {} }
function joinPrompt() {
  SFX.resume();
  modal(`<h3 class="center">${t('join.title')}</h3><input class="inp" id="code" placeholder="${t('join.placeholder')}" maxlength="5" style="text-transform:uppercase;text-align:center;letter-spacing:4px;font-size:22px" />
    <button class="btn primary" id="go">${t('join.join')}</button><button class="btn ghost" id="x">${t('common.cancel')}</button>`, () => {
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
      if (!m.started) {
        renderLobby();
        // If the user came from "Invite a friend to play" on home, open
        // the invite dialog as soon as the lobby is on screen.
        if (S.openInviteOnLobby) {
          S.openInviteOnLobby = false;
          setTimeout(() => { try { openInviteUserModal(); } catch {} }, 100);
        }
        // If the user tapped a specific online friend's bubble, auto-send
        // the invite for them (no prompt).
        if (S.pendingInviteTarget) {
          const tgt = S.pendingInviteTarget; S.pendingInviteTarget = null;
          setTimeout(() => {
            try { S.net.send({ type: 'inviteUser', username: tgt }); toast(t('joinReq.inviteSent', { name: tgt })); } catch {}
          }, 150);
        }
      }
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
    case 'private': {
      // Prefer the structured event (translatable), fall back to the legacy
      // pre-formatted string if an old server sends it.
      const body = m.event ? formatLogEvent(m.event) : esc(m.text || '');
      return modal(`<h3>${t('privateMsg.title')}</h3><p>${body}</p><button class="btn primary" id="x">${t('privateMsg.keepSecret')}</button>`, () => $('#x').onclick = closeModal);
    }
    case 'invite': return showIncomingInvite(m);
    case 'inviteResult': return toast(m.message || m.reason || (m.ok ? t('errors.inviteOk') : t('errors.inviteFailed')));
    // The host of a private table sees someone requesting to sit down.
    case 'joinRequest': return showJoinRequest(m);
    // We requested a seat at a private table — server tells us whether the
    // host accepted (we then wait for the 'room' message to land us in the lobby),
    // declined (back to the floor), or is still considering (initial ack).
    case 'requestResult': return handleRequestResult(m);
    case 'error': return toast(m.error || 'error');
    case 'closed': { S.net = null; if (S.view && !S.view.over) { toast('Disconnected from the room'); leaveToHome(); } return; }
  }
}

// Host-side: a guest asked to sit at our private table. Show an Accept/Decline.
function showJoinRequest(m) {
  SFX.click?.();
  modal(`<h3 class="center">${t('joinReq.title')}</h3>
    <div class="center" style="margin:14px 0 6px">${avatarFor(m.name, { size: 64, withRing: true })}</div>
    <div class="center" style="font-family:Georgia,serif; font-size:22px; color:#e0a458;">${esc(m.name)}</div>
    <p class="center muted small">${t('joinReq.body', { code: esc(m.code) })}</p>
    <div class="grid2" style="margin-top:14px">
      <button class="btn primary" id="acc">${t('joinReq.accept')}</button>
      <button class="btn ghost" id="dec">${t('joinReq.decline')}</button>
    </div>`, () => {
    $('#acc').onclick = () => { S.net.send({ type: 'joinResponse', clientId: m.clientId, accept: true });  closeModal(); };
    $('#dec').onclick = () => { S.net.send({ type: 'joinResponse', clientId: m.clientId, accept: false }); closeModal(); };
  });
}

// Guest-side: result of our requestJoin. Three shapes:
//   { ok:true, message:"Waiting for the host…" }       — initial ack, just toast
//   { ok:true, message:"Host accepted! …" }            — seat coming, the 'room' msg lands us
//   { ok:false, declined:true, reason:"..." }          — declined, fall back to the floor
//   { ok:false, reason:"Table is full." }              — couldn't even queue
function handleRequestResult(m) {
  if (m.ok) {
    toast(m.message || 'Request sent');
    return;
  }
  S.pendingTableCode = null;
  toast(m.reason || 'Request failed');
  if (S.screen === 'waiting-host') showFloor();
}

// Detect which players got newly exposed between two states — used by cues()
// to fire a flashy reveal banner the instant Jealousy lands.
function newlyExposedIds(prev, v) {
  if (!prev || !prev.players) return [];
  const out = [];
  for (const p of v.players) {
    const before = prev.players[p.id];
    if (before && !before.revealed && p.revealed) out.push(p.id);
  }
  return out;
}

// Big, theatrical reveal banner for a freshly-exposed crush. Auto-closes.
function flashExposed(v, ids) {
  if (!ids.length) return;
  // If multiple got exposed in the same tick, show one banner per — staggered.
  ids.forEach((id, i) => {
    const p = v.players[id];
    const o = v.players[p.crush];
    if (!p || !o) return;
    setTimeout(() => {
      SFX.hit?.();
      const host = $('#modal-host');
      const node = document.createElement('div');
      node.className = 'expose-flash';
      node.innerHTML = `
        <div class="expose-card">
          <div class="ef-title">💚 EXPOSED</div>
          <div class="ef-row">
            <div class="ef-who">
              ${avatarFor(p.name, { size: 56, withRing: true })}
              <div class="ef-name">${esc(p.name)}</div>
            </div>
            <div class="ef-arrow">→</div>
            <div class="ef-who">
              ${avatarFor(o.name, { size: 56, withRing: true })}
              <div class="ef-name">${esc(o.name)}</div>
            </div>
          </div>
          <div class="ef-sub">…secretly fancies ${o.seat.icon} <b>${esc(o.name)}</b></div>
        </div>`;
      host.appendChild(node);
      setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 500); }, 2400);
    }, i * 350);
  });
}

// sound cues based on what changed between states
function cues(prev, v) {
  // Always check newly-exposed crushes — works even across phase changes.
  const exposed = newlyExposedIds(prev, v);
  if (exposed.length) flashExposed(v, exposed);
  if (!prev || prev.phase !== 'play' || v.phase !== 'play') { if (v.phase === 'play' && v.turn === v.youAre) SFX.turn(); S.wasMyTurn = v.turn === v.youAre; return; }
  const top = v.log[0];
  if (top && top !== S.lastLogTop) {
    if (/green with envy|💚/.test(top)) SFX.hit();
    else if (/breaks .*heart|💔/.test(top)) SFX.hit();
    else if (/grows closer/.test(top)) SFX.crush();
    else if (/guards their heart/.test(top)) SFX.shield();
    else if (/friendzones/.test(top)) SFX.friendzone();
    else if (/eye wanders|reads the room/.test(top)) SFX.click();
    else SFX.play();
  }
  S.lastLogTop = top;
  const myTurn = v.turn === v.youAre;
  if (myTurn && !S.wasMyTurn) SFX.turn();
  S.wasMyTurn = myTurn;
}

// ============================================================
// TIPS — shared tooltip element that works on touch AND desktop
// One element appended to body; positioned next to whichever element
// is currently hovered (desktop) or tapped (touch). Auto-dismisses
// after 3s; tapping elsewhere closes it too. Replaces the old CSS
// ::after tooltips which never worked on mobile.
// ============================================================
const Tip = (() => {
  let el = null, hideTimer = null, currentTarget = null;
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'tip-bubble';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }
  function showAt(target, text) {
    if (!target || !text) return;
    ensure();
    el.textContent = text;
    el.classList.add('show');
    currentTarget = target;
    // Measure after the text is in so width is correct.
    el.style.left = '-9999px'; el.style.top = '-9999px';
    requestAnimationFrame(() => {
      const r = target.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      el.style.maxWidth = Math.min(240, vw - 24) + 'px';
      const tw = el.offsetWidth, th = el.offsetHeight;
      let left = r.left + r.width / 2 - tw / 2;
      left = Math.max(10, Math.min(left, vw - tw - 10));
      let top = r.top - th - 10;
      let flip = false;
      if (top < 8) { top = r.bottom + 10; flip = true; }
      if (top + th > vh - 10) top = Math.max(10, vh - th - 10);
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.classList.toggle('below', flip);
    });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 3000);
  }
  function hide() {
    if (!el) return;
    el.classList.remove('show');
    currentTarget = null;
    clearTimeout(hideTimer);
  }
  // Desktop: hover via pointer events. Skip on touch (would double-fire).
  if (!isTouch) {
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (!t) return;
      // Don't fight with the play-card click target — only show on info bits.
      showAt(t, t.dataset.tip);
    });
    document.addEventListener('pointerout', (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (t === currentTarget) hide();
    });
  }
  // Touch + click handler — long-press equivalent: tap a tooltip-bearing
  // element to surface the tip. Tapping elsewhere closes it.
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-tip]');
    // Special-case the playing cards: a tap on .pcard PLAYS the card.
    // Tap-to-tip only fires if the card is part of a non-active hand
    // (i.e. it isn't your turn) so we never block the primary action.
    if (t && t.classList?.contains('pcard') && t.closest('.hand-area:not(.idle)')) return;
    if (t) showAt(t, t.dataset.tip);
    else hide();
  }, true);
  window.addEventListener('resize', hide);
  window.addEventListener('scroll', hide, true);
  return { show: showAt, hide };
})();

// ============================================================
// TUTORIAL — spotlight tour engine + onboarding flows
// A self-contained tour: dark overlay with a transparent "spotlight"
// box around the target element, plus a bubble nearby explaining what
// it is. Steps are { targetSel?, title, body, prefer?, onEnter? }.
// If targetSel is omitted, the bubble is a centred modal-style card.
// Saved-once flags live in localStorage so each tour auto-fires the
// first time only, but can be re-run from the Rules / Help button.
// ============================================================
const Tour = (() => {
  let steps = [], idx = 0, onClose = null;
  function start(stepList, opts = {}) {
    if (!stepList?.length) return;
    steps = stepList; idx = 0; onClose = opts.onClose || null;
    document.body.classList.add('tour-active');
    render();
    // Re-position on scroll/resize without re-rendering text.
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
  }
  function end() {
    document.body.classList.remove('tour-active');
    const host = document.getElementById('tour-host'); if (host) host.remove();
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    const cb = onClose; onClose = null;
    if (cb) try { cb(); } catch {}
  }
  function next() {
    if (idx >= steps.length - 1) return end();
    idx++; render();
  }
  function prev() { if (idx > 0) { idx--; render(); } }
  function reposition() {
    const step = steps[idx]; if (!step) return;
    const spot = document.querySelector('#tour-host .tour-spot');
    const bubble = document.querySelector('#tour-host .tour-bubble');
    if (!step.targetSel) { if (spot) spot.style.display = 'none'; if (bubble) { bubble.style.top = '50%'; bubble.style.left = '50%'; bubble.style.transform = 'translate(-50%, -50%)'; bubble.classList.add('center'); } return; }
    const t = document.querySelector(step.targetSel);
    if (!t || !spot || !bubble) return;
    const r = t.getBoundingClientRect();
    spot.style.display = '';
    spot.style.top = (r.top - 8) + 'px';
    spot.style.left = (r.left - 8) + 'px';
    spot.style.width = (r.width + 16) + 'px';
    spot.style.height = (r.height + 16) + 'px';
    // Place the bubble on the side with the most space.
    bubble.classList.remove('center', 'above', 'below', 'left', 'right');
    const vw = window.innerWidth, vh = window.innerHeight;
    const spaceAbove = r.top, spaceBelow = vh - r.bottom;
    const place = (step.prefer === 'above' && spaceAbove > 180) ? 'above'
                : (step.prefer === 'below' && spaceBelow > 180) ? 'below'
                : (spaceBelow > 180 ? 'below' : (spaceAbove > 180 ? 'above' : 'below'));
    bubble.classList.add(place);
    bubble.style.transform = '';
    const bw = Math.min(320, vw - 24);
    bubble.style.width = bw + 'px';
    let bl = r.left + r.width / 2 - bw / 2;
    bl = Math.max(12, Math.min(bl, vw - bw - 12));
    bubble.style.left = bl + 'px';
    if (place === 'below') bubble.style.top = (r.bottom + 16) + 'px';
    else bubble.style.top = (r.top - 16 - bubble.offsetHeight) + 'px';
  }
  function render() {
    let host = document.getElementById('tour-host');
    if (!host) { host = document.createElement('div'); host.id = 'tour-host'; document.body.appendChild(host); }
    const s = steps[idx];
    const last = idx === steps.length - 1;
    host.innerHTML = `
      <div class="tour-overlay"></div>
      <div class="tour-spot" aria-hidden="true"></div>
      <div class="tour-bubble" role="dialog" aria-live="polite">
        <div class="tb-step">${idx + 1} / ${steps.length}</div>
        <div class="tb-title">${s.title}</div>
        <div class="tb-body">${s.body}</div>
        <div class="tb-actions">
          <button class="btn ghost sm" id="tb-skip">${t('common.skip')}</button>
          <button class="btn ghost sm" id="tb-prev" ${idx === 0 ? 'disabled' : ''}>${t('common.back')}</button>
          <button class="btn primary sm" id="tb-next">${last ? t('common.gotIt') + ' 🎉' : t('common.next')}</button>
        </div>
      </div>`;
    document.getElementById('tb-skip').onclick = end;
    document.getElementById('tb-prev').onclick = prev;
    document.getElementById('tb-next').onclick = next;
    if (s.onEnter) try { s.onEnter(); } catch {}
    // Defer reposition to next frame so the bubble has measured size.
    requestAnimationFrame(() => requestAnimationFrame(reposition));
  }
  return { start, end, isActive: () => !!steps.length && document.body.classList.contains('tour-active') };
})();

// Tour steps are rebuilt fresh each invocation so they pull the CURRENT
// language from i18n — switching FR↔EN mid-tour would show stale text
// otherwise.
function homeTourSteps() {
  return [
    { title: t('tour.home1Title'), body: t('tour.home1Body') },
    { targetSel: '.lobby-table',          prefer: 'below', title: t('tour.home2Title'), body: t('tour.home2Body') },
    { targetSel: '.play-chip',            prefer: 'above', title: t('tour.home3Title'), body: t('tour.home3Body') },
    { targetSel: '.seat-counter',         prefer: 'above', title: t('tour.home4Title'), body: t('tour.home4Body') },
    { targetSel: '.friends-strip',        prefer: 'above', title: t('tour.home5Title'), body: t('tour.home5Body') },
    { targetSel: '.tab.tab-plus',         prefer: 'above', title: t('tour.home6Title'), body: t('tour.home6Body') },
    { targetSel: '[data-tab="floor"]',    prefer: 'above', title: t('tour.home7Title'), body: t('tour.home7Body') },
    { targetSel: '[data-tab="rules"]',    prefer: 'above', title: t('tour.home8Title'), body: t('tour.home8Body') },
  ];
}

function setupTutorialSteps() {
  return [
    { title: t('tour.setup1Title'), body: t('tour.setup1Body') },
    { targetSel: '.aim-grid', prefer: 'above', title: t('tour.setup2Title'), body: t('tour.setup2Body') },
  ];
}

function playTutorialSteps() {
  return [
    { title: t('tour.play1Title'), body: t('tour.play1Body') },
    { targetSel: '.hand.fan',     prefer: 'above', title: t('tour.play2Title'), body: t('tour.play2Body') },
    { targetSel: '.love-bar',     prefer: 'below', title: t('tour.play3Title'), body: t('tour.play3Body') },
    { targetSel: '.table-wrap',   prefer: 'below', title: t('tour.play4Title'), body: t('tour.play4Body') },
    { title: t('tour.play5Title'), body: t('tour.play5Body') },
  ];
}

// ============================================================
// CONCEPT INTRO — a 5-slide visual story that teaches the IDEA of
// PYAAR, not the mechanics. Auto-fires once on the user's first game
// (gated by localStorage.pyaar_concept_v1), replayable from Rules.
// Designed to make the principle click for friends who play and
// say "I still don't get it" even after a match.
// ============================================================
function conceptSlides() {
  // Use distinct seeds for the four "table players" so their avatars vary.
  const sampleAv = (seed, size = 48, ring = false) => avatarFor(seed, { size, withRing: ring });
  return [
    // SLIDE 1 — opening: PYAAR title + drifting hearts
    { title: t('intro.s1Title'), body: t('intro.s1Body'), scene: `
      <div class="ci-scene s1">
        <div class="ci-floaters" aria-hidden="true">
          <span style="--n:0">💞</span><span style="--n:1">💗</span>
          <span style="--n:2">💖</span><span style="--n:3">💕</span>
          <span style="--n:4">✨</span><span style="--n:5">💘</span>
        </div>
        <div class="ci-brand-logo">❤</div>
        <div class="ci-brand-name">PYAAR</div>
      </div>` },

    // SLIDE 2 — table of 4 players, each with a hidden-crush thought bubble
    { title: t('intro.s2Title'), body: t('intro.s2Body'), scene: `
      <div class="ci-scene s2">
        <div class="ci-table-ring">
          ${['alpha','bravo','charlie','delta'].map((seed, i) => `
            <div class="ci-ring-seat" style="--n:${i}">
              ${sampleAv(seed, 52)}
              <div class="ci-think-bubble">${t('intro.s2Bubble')}</div>
            </div>`).join('')}
          <div class="ci-table-mid">🎴</div>
        </div>
      </div>` },

    // SLIDE 3 — YOU + heart arrow → your crush
    { title: t('intro.s3Title'), body: t('intro.s3Body'), scene: `
      <div class="ci-scene s3">
        <div class="ci-pair">
          <div class="ci-pair-side">
            ${sampleAv('me', 80, true)}
            <div class="ci-pair-label you">${t('intro.s3You')}</div>
          </div>
          <div class="ci-pair-arrow">
            <span class="ci-heart-arrow">💘</span>
            <span class="ci-question">?</span>
          </div>
          <div class="ci-pair-side">
            ${sampleAv('them', 80, true)}
            <div class="ci-pair-label crush">${t('intro.s3Crush')}</div>
          </div>
        </div>
      </div>` },

    // SLIDE 4 — love stage progression with ❤️ cards flying in
    { title: t('intro.s4Title'), body: t('intro.s4Body'), scene: `
      <div class="ci-scene s4">
        <div class="ci-stage-row">
          <div class="ci-stage-pip lit">✨</div>
          <div class="ci-stage-arrow">→</div>
          <div class="ci-stage-pip lit">🌹</div>
          <div class="ci-stage-arrow">→</div>
          <div class="ci-stage-pip lit pulse">💋</div>
        </div>
        <div class="ci-stage-hint">${t('intro.s4HintGrow')}</div>
        <div class="ci-mini-hand">
          <span class="ci-mini-card love">❤️</span>
          <span class="ci-mini-card love">❤️</span>
          <span class="ci-mini-card love">❤️</span>
        </div>
      </div>` },

    // SLIDE 5 — two outcomes side by side
    { title: t('intro.s5Title'), body: t('intro.s5Body'), scene: `
      <div class="ci-scene s5">
        <div class="ci-outcomes-row">
          <div class="ci-outcome good">
            <div class="ci-out-emoji">💞</div>
            <div class="ci-out-cap">${t('intro.s5Mutual')}</div>
            <div class="ci-out-res">${t('intro.s5MutualResult')}</div>
          </div>
          <div class="ci-vs">vs</div>
          <div class="ci-outcome bad">
            <div class="ci-out-emoji">💔</div>
            <div class="ci-out-cap">${t('intro.s5NotMutual')}</div>
            <div class="ci-out-res">${t('intro.s5NotMutualResult')}</div>
          </div>
        </div>
      </div>` },
  ];
}

function showConceptIntro(opts = {}) {
  const onDone = opts.onDone;
  const slides = conceptSlides();
  let idx = 0;
  function end() {
    closeModal();
    localStorage.setItem('pyaar_concept_v1', 'done');
    if (onDone) try { onDone(); } catch {}
  }
  function render() {
    const last = idx === slides.length - 1;
    const s = slides[idx];
    modal(`<div class="concept-intro">
      <div class="ci-skip-row"><button class="link-btn sm" id="ci-skip">${t('intro.skip')}</button></div>
      <div class="ci-stage" data-i="${idx}">${s.scene}</div>
      <div class="ci-text">
        <div class="ci-title">${s.title}</div>
        <div class="ci-body">${s.body}</div>
      </div>
      <div class="ci-controls">
        <button class="btn ghost sm" id="ci-prev" ${idx === 0 ? 'disabled' : ''}>${t('common.back')}</button>
        <div class="ci-dots">${slides.map((_, j) => `<span class="${j === idx ? 'on' : ''}"></span>`).join('')}</div>
        <button class="btn primary sm" id="ci-next">${last ? t('intro.startBtn') + ' 🃏' : t('common.next')}</button>
      </div>
    </div>`, () => {
      $('#ci-skip').onclick = end;
      $('#ci-prev').onclick = () => { if (idx > 0) { idx--; SFX.click?.(); render(); } };
      $('#ci-next').onclick = () => { if (last) end(); else { idx++; SFX.click?.(); render(); } };
    });
  }
  render();
}

function maybeRunConceptIntro(onDone) {
  if (localStorage.getItem('pyaar_concept_v1') === 'done') { if (onDone) onDone(); return; }
  showConceptIntro({ onDone });
}

// ============================================================
// CARDS GUIDE — one slide per card, with a big preview of the
// actual playing card + a 'before → after' demo + a strategic
// 'when to use it' tip. Auto-fires after the concept intro on
// the user's first play, replayable from Rules anytime.
// ============================================================
const CARD_ORDER = ['MOMENT', 'GLANCE', 'SWAY', 'HEARTBREAK', 'JEALOUSY', 'GUARDIAN', 'FRIENDZONE'];

// A non-clickable big preview of one card — same visual language as
// the in-hand .pcard, just bigger and no data-play hook.
function cardPreview(key) {
  const d = CARD[key];
  const toneLabel = d.tone === 'attack' ? 'RIVAL' : d.tone === 'info' ? 'SEE' : 'ME';
  // Use the live translated tone label
  const tlabel = t(`tone.${d.tone}`);
  return `<div class="pcard f-${d.fam} cg-card-preview">
    <div class="pc-top">
      <span class="pc-action">${esc(d.action)}</span>
      <span class="pc-tone ${d.tone}">${tlabel}</span>
    </div>
    <div class="pc-art">
      <div class="pc-glow"></div>
      <div class="pc-icon">${d.icon}</div>
      <div class="pc-name">${title(key)}</div>
    </div>
    <div class="pc-effect">${esc(d.short)}</div>
    <div class="pc-tag">${esc(d.tag)}</div>
  </div>`;
}

// Hand-crafted 'before → after' visual for each card. Uses the game's
// own visual language (love bar pips, avatars, badges) so the example
// matches what the player will see at the actual table.
function cardScene(key) {
  const av = (seed, size = 36) => avatarFor(seed, { size });
  switch (key) {
    case 'MOMENT': return `
      <div class="cg-demo">
        <div class="cg-side">
          <div class="cg-mini-bar">
            <span class="cg-pip lit">✨</span>
            <span class="cg-pip">🌹</span>
            <span class="cg-pip">💋</span>
          </div>
          <div class="cg-side-lbl">before</div>
        </div>
        <div class="cg-go">❤️ →</div>
        <div class="cg-side">
          <div class="cg-mini-bar">
            <span class="cg-pip lit">✨</span>
            <span class="cg-pip lit pulse">🌹</span>
            <span class="cg-pip">💋</span>
          </div>
          <div class="cg-side-lbl gold">after</div>
        </div>
      </div>`;
    case 'GLANCE': return `
      <div class="cg-demo">
        <div class="cg-side">
          ${av('sol')}
          <div class="cg-thought">💘 ?</div>
          <div class="cg-side-lbl">before</div>
        </div>
        <div class="cg-go">👀 →</div>
        <div class="cg-side">
          ${av('sol')}
          <div class="cg-thought revealed">💘 🌙 Kai</div>
          <div class="cg-side-lbl gold">after</div>
        </div>
      </div>`;
    case 'SWAY': return `
      <div class="cg-demo">
        <div class="cg-side">
          <div class="cg-pair-mini">${av('me', 32)}<span>💘</span>${av('kai', 32)}</div>
          <div class="cg-side-lbl">crush: 🌙 Kai · 🌹</div>
        </div>
        <div class="cg-go">💘 →</div>
        <div class="cg-side">
          <div class="cg-pair-mini">${av('me', 32)}<span>💘</span>${av('sol', 32)}</div>
          <div class="cg-side-lbl gold">crush: 🔥 Sol · ✨</div>
        </div>
      </div>`;
    case 'HEARTBREAK': return `
      <div class="cg-demo">
        <div class="cg-side">
          <div class="cg-mini-bar">
            <span class="cg-pip lit">✨</span>
            <span class="cg-pip lit">🌹</span>
            <span class="cg-pip lit pulse">💋</span>
          </div>
          <div class="cg-side-lbl">rival ready</div>
        </div>
        <div class="cg-go bad">💔 →</div>
        <div class="cg-side">
          <div class="cg-mini-bar">
            <span class="cg-pip lit">✨</span>
            <span class="cg-pip lit">🌹</span>
            <span class="cg-pip">💋</span>
          </div>
          <div class="cg-side-lbl gold">rival knocked back</div>
        </div>
      </div>`;
    case 'JEALOUSY': return `
      <div class="cg-demo">
        <div class="cg-side">
          ${av('kai')}
          <div class="cg-mini-bar small">
            <span class="cg-pip lit">✨</span>
            <span class="cg-pip lit">🌹</span>
          </div>
          <div class="cg-thought">💘 ?</div>
        </div>
        <div class="cg-go bad">💚 →</div>
        <div class="cg-side">
          ${av('kai')}
          <div class="cg-mini-bar small">
            <span class="cg-pip lit">✨</span>
            <span class="cg-pip">🌹</span>
          </div>
          <div class="cg-thought revealed">💘 🌹 Layla</div>
        </div>
      </div>`;
    case 'GUARDIAN': return `
      <div class="cg-demo">
        <div class="cg-side">
          ${av('me')}
          <div class="cg-side-lbl">unguarded</div>
        </div>
        <div class="cg-go">🛡️ →</div>
        <div class="cg-side">
          ${av('me')}
          <div class="cg-shield-badge">🛡️</div>
          <div class="cg-side-lbl gold">next attack blocked</div>
        </div>
      </div>`;
    case 'FRIENDZONE': return `
      <div class="cg-demo">
        <div class="cg-side">
          ${av('rival')}
          <div class="cg-side-lbl">their turn next</div>
        </div>
        <div class="cg-go bad">🤝 →</div>
        <div class="cg-side">
          ${av('rival')}
          <div class="cg-frozen-badge">🤝</div>
          <div class="cg-side-lbl gold">they skip it!</div>
        </div>
      </div>`;
  }
  return '';
}

function cardGuideSlides() {
  return CARD_ORDER.map(key => {
    const d = CARD[key];
    return {
      key,
      title: `${d.icon} ${d.action}`,
      preview: cardPreview(key),
      scene: cardScene(key),
      useWhen: t(`cardGuide.${key}.useWhen`),
      example: t(`cardGuide.${key}.example`),
    };
  });
}

function showCardsGuide(opts = {}) {
  const onDone = opts.onDone;
  const slides = cardGuideSlides();
  let idx = 0;
  function end() {
    closeModal();
    localStorage.setItem('pyaar_cardguide_v1', 'done');
    if (onDone) try { onDone(); } catch {}
  }
  function render() {
    const last = idx === slides.length - 1;
    const s = slides[idx];
    modal(`<div class="card-guide">
      <div class="cg-skip-row">
        <span class="cg-header-title">${t('cardGuide.title')}</span>
        <button class="link-btn sm" id="cg-skip">${t('intro.skip')}</button>
      </div>
      <div class="cg-slide-title">${s.title}</div>
      <div class="cg-content">
        <div class="cg-card-wrap">${s.preview}</div>
        <div class="cg-info">
          <div class="cg-label">${t('cardGuide.useWhenLabel')}</div>
          <div class="cg-usewhen">${s.useWhen}</div>
          <div class="cg-label">${t('cardGuide.exampleLabel')}</div>
          <div class="cg-example">${s.example}</div>
        </div>
      </div>
      <div class="cg-scene-row">${s.scene}</div>
      <div class="ci-controls">
        <button class="btn ghost sm" id="cg-prev" ${idx === 0 ? 'disabled' : ''}>${t('common.back')}</button>
        <div class="ci-dots">${slides.map((_, j) => `<span class="${j === idx ? 'on' : ''}"></span>`).join('')}</div>
        <button class="btn primary sm" id="cg-next">${last ? t('intro.startBtn') + ' 🃏' : t('common.next')}</button>
      </div>
    </div>`, () => {
      $('#cg-skip').onclick = end;
      $('#cg-prev').onclick = () => { if (idx > 0) { idx--; SFX.click?.(); render(); } };
      $('#cg-next').onclick = () => { if (last) end(); else { idx++; SFX.click?.(); render(); } };
    });
  }
  render();
}

function maybeRunCardsGuide(onDone) {
  if (localStorage.getItem('pyaar_cardguide_v1') === 'done') { if (onDone) onDone(); return; }
  showCardsGuide({ onDone });
}

// Auto-fire helpers — each tour is gated by a localStorage flag.
function maybeRunHomeTour() {
  if (localStorage.getItem('pyaar_tour_home_v1') === 'done') return;
  // Wait a beat so the table animation can settle before the spotlight lands.
  setTimeout(() => {
    if (S.screen !== 'home') return;
    Tour.start(homeTourSteps(), { onClose: () => localStorage.setItem('pyaar_tour_home_v1', 'done') });
  }, 600);
}
function maybeRunSetupTutorial() {
  if (localStorage.getItem('pyaar_tour_setup_v1') === 'done') return;
  setTimeout(() => Tour.start(setupTutorialSteps(), { onClose: () => localStorage.setItem('pyaar_tour_setup_v1', 'done') }), 300);
}
function maybeRunPlayTutorial() {
  if (localStorage.getItem('pyaar_tour_play_v1') === 'done') return;
  setTimeout(() => Tour.start(playTutorialSteps(), { onClose: () => localStorage.setItem('pyaar_tour_play_v1', 'done') }), 400);
}
// Manual replay — wipes the flag for that tour and re-runs it.
function replayTour(which) {
  closeModal();
  if (which === 'home')  { localStorage.removeItem('pyaar_tour_home_v1');  Tour.start(homeTourSteps(),  { onClose: () => localStorage.setItem('pyaar_tour_home_v1','done') }); }
  if (which === 'setup') { localStorage.removeItem('pyaar_tour_setup_v1'); Tour.start(setupTutorialSteps(), { onClose: () => localStorage.setItem('pyaar_tour_setup_v1','done') }); }
  if (which === 'play')  { localStorage.removeItem('pyaar_tour_play_v1');  Tour.start(playTutorialSteps(),  { onClose: () => localStorage.setItem('pyaar_tour_play_v1','done') }); }
}

// Mount the four gold filigree corner ornaments once. They're purely
// decorative (pointer-events:none, fixed in the viewport corners).
function mountFiligree() {
  if (document.querySelector('.filigree')) return;
  for (const c of ['tl','tr','bl','br']) {
    const el = document.createElement('div');
    el.className = 'filigree ' + c;
    document.body.appendChild(el);
  }
}

// Pick up a ?join=CODE deep link in the URL and try to join automatically.
// Designed for share-sheet flows: "Come play PYAAR — table ABCDE".
async function tryDeepLinkJoin() {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get('join') || '').trim().toUpperCase();
  if (!code) return false;
  // Strip the query param so a refresh doesn't keep re-joining.
  const cleanUrl = window.location.pathname + window.location.hash;
  history.replaceState(null, '', cleanUrl);
  if (!S.user) {
    // Need a name first — open the one-screen auth, then queue the join.
    S.pendingDeepJoin = code;
    authModal();
    return true;
  }
  joinTableByCode(code);
  return true;
}

async function joinTableByCode(code) {
  S.mode = null;
  S.secretSent = false;
  resetGameState();
  try {
    await connect();
    S.net.send({ type: 'join', code, name: name(), token: S.token });
  } catch { toast(t('errors.serverUnreachable')); }
}

// ---------- boot ----------
window.addEventListener('resize', () => { if (document.querySelector('.hand.fan')) layoutFan(); });
mountFiligree();
refreshWho();
$('#mute').textContent = SFX.isMuted() ? '🔇' : '🔊';
// Deep-link join takes priority over the home screen — if we have a ?join=CODE,
// land the user directly on the lobby (or sign-in if they're anonymous).
// tryDeepLinkJoin() is ASYNC — it returns a Promise. The old form
// `if (!tryDeepLinkJoin())` evaluated `!Promise` (always false → home never
// rendered on fresh page loads). Await the result properly.
tryDeepLinkJoin()
  .then(handled => { if (!handled) renderHome(); })
  .catch(() => renderHome());
ensurePresenceConnection();   // if a token is already in localStorage, register us as online

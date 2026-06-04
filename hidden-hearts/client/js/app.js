import { Net, api } from './net.js';
import { SFX } from './sfx.js';
import { SEATS, CARD, title, STAGES, STAGE_NAMES, READY } from './cards.js';

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
      <div class="logo">❤</div>
      <h1 class="title">PYAAR</h1>
      <div class="subtitle">THE LOVE CARD GAME</div>
      <p class="tagline">Build your love. Race to Devotion. Don't let them break your heart.</p>
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
    <div class="foot">PYAAR · the love card game — play solo, or invite friends with a room code.</div>`;
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
        </div>
        <button class="btn" id="inviteUser" style="margin-top:8px" ${r.seats.length >= 7 ? 'disabled' : ''}>👋 Invite a player by username</button>
        ` : `<p class="center muted">Waiting for the host to begin…</p>`}
    </section>
    <button class="btn ghost" id="leave">← Leave room</button>`;
  $('#copy').onclick = () => { navigator.clipboard?.writeText(r.code); toast('Code copied'); };
  $('#leave').onclick = leaveToHome;
  if (isHost) {
    $('#addai').onclick = () => { SFX.click(); S.net.send({ type: 'addAI' }); };
    $('#begin').onclick = () => { SFX.resume(); SFX.shuffle(); S.net.send({ type: 'begin' }); };
    $('#inviteUser').onclick = openInviteUserModal;
  }
}

// Host clicks "Invite a player by username" — prompt for the name, send via WS.
function openInviteUserModal() {
  if (!S.user) { toast('Sign in first to invite players.'); return; }
  modal(`<h3>Invite a player</h3>
    <p class="muted small">Type their PYAAR username. They must be signed in and online to receive the invite.</p>
    <input id="inv-name" class="input" placeholder="@username" autocomplete="off" autofocus style="margin:8px 0; padding:10px; width:100%; box-sizing:border-box; background:#160d1a; border:1px solid #3c2a42; color:#f3e9df; border-radius:8px; font-size:15px;" />
    <div class="grid2" style="margin-top:10px">
      <button class="btn ghost" id="inv-cancel">Cancel</button>
      <button class="btn primary" id="inv-send">Send invite</button>
    </div>`, () => {
      const input = document.getElementById('inv-name');
      input?.focus();
      const submit = () => {
        const username = (input?.value || '').trim().replace(/^@/, '');
        if (!username) { toast('Type a username first.'); return; }
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
  modal(`<h3>💌 ${esc(payload.from)} invites you to play</h3>
    <p>Room <b>${esc(payload.code)}</b>${payload.seats ? ` · ${payload.seats} seated so far` : ''}.</p>
    <div class="grid2" style="margin-top:10px">
      <button class="btn ghost" id="inv-no">Not now</button>
      <button class="btn primary" id="inv-yes">Join now</button>
    </div>`, () => {
      document.getElementById('inv-no').onclick = closeModal;
      document.getElementById('inv-yes').onclick = async () => {
        closeModal();
        S.mode = 'join'; S.secretSent = false;
        try { resetGameState(); } catch {}
        try {
          if (!S.net) await connect();
          // leave any prior room first
          try { S.net.send({ type: 'leave' }); } catch {}
          S.net.send({ type: 'join', code: payload.code, name: name(), token: S.token });
        } catch { toast('Could not join the room'); }
      };
    });
}

function renderWaiting(msg) { app.innerHTML = `<section class="panel center waiting"><div class="spinner">⚜</div><p>${esc(msg)}</p></section>`; }

function renderSetup() {
  const v = S.view;
  const others = v.players.filter(p => p.id !== v.youAre);
  app.innerHTML = `<section class="panel">
    <h3 class="center">Aim your Heart 💘</h3>
    <p class="center muted small">Secretly choose the one you fancy. No one knows — until someone confesses.</p>
    <div class="picker">
      ${others.map(p => `<button class="btn pick ${S._crush === p.id ? 'on' : ''}" data-c="${p.id}"><span class="bi">${p.seat.icon}</span> ${esc(p.name)}</button>`).join('')}
    </div>
    <button class="btn primary" id="lock" ${S._crush != null ? '' : 'disabled'}>Lock my secret 💘</button>
  </section>`;
  app.querySelectorAll('[data-c]').forEach(el => el.onclick = () => { S._crush = +el.dataset.c; renderSetup(); });
  $('#lock').onclick = () => { SFX.crush(); S.net.send({ type: 'setSecret', crush: S._crush }); S.secretSent = true; renderWaiting('Secret locked. Waiting for the others…'); };
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
    const validTgt = aiming && p.id !== v.youAre
      && (S.sel.key !== 'HEARTBREAK' || p.stage > 0)
      && (S.sel.key !== 'JEALOUSY' || p.stage >= 2);     // only the envy-worthy (Dating+)
    const tgt = validTgt ? ' targetable' : '';
    chips += `<div class="chip-pos${tgt}" data-seat="${p.id}" style="left:${x}%;top:${y}%">${chipHTML(p, v.turn, v.youAre)}</div>`;
  }
  const aimCard = aiming ? S.sel.key : null;
  const aimHint = { GLANCE: 'to peek their heart', SWAY: 'to aim your heart at', HEARTBREAK: 'to break their heart', JEALOUSY: 'to expose & rattle (Dating+)', FRIENDZONE: 'to friendzone' };
  app.innerHTML = `
    <div class="table-status"><span>💌 ${v.deckCount} cards left${v.deckCount <= n ? ' · final round!' : ''}</span>
      <span class="${myTurn ? 'turnnow' : 'muted'}">${myTurn ? 'Your turn' : 'Turn: ' + v.players[v.turn].name}</span></div>
    ${aiming ? `<div class="aim-banner">${CARD[aimCard].icon} <b>${title(aimCard)}</b> — tap a player ${aimHint[aimCard] || ''}<button id="aim-cancel">Cancel</button></div>` : ''}
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
      <div class="secret-strip">secret 💘 <b>${v.players[me.crush].seat.icon} ${esc(v.players[me.crush].name)}</b> · you're at <b>${STAGE_NAMES[me.stage]} ${STAGES[me.stage] || ''}</b>${me.ready ? ' — 💍 tap ❤️ to Commit!' : ''}</div>
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
  const line = STAGES.slice(1).map((ic, idx) => `<span class="st ${p.stage >= idx + 1 ? 'lit' : ''}">${ic}</span>`).join('')
    + `<span class="st commit ${p.won ? 'lit' : (p.ready ? 'ready' : '')}">💍</span>`;
  const b = [];
  if (p.shield) b.push('🛡️');
  if (p.frozen) b.push('🤝');
  if (p.soulmate) b.push('💞');
  const fan = (p.id !== meId)
    ? `<div class="minihand">${'<span class="mb"></span>'.repeat(Math.min(2, p.handCount || 0))}<span class="mhc">${p.handCount || 0}</span></div>`
    : '';
  return `<div class="chip ${p.id === activeId ? 'active' : ''} ${p.frozen ? 'frozen' : ''} ${p.won ? 'won' : ''}">
    ${fan}
    <div class="avatar">${p.seat.icon}</div>
    <div class="cnm">${esc(p.name)}${p.isAI ? ' <span class="ai-badge">AI</span>' : ''}</div>
    <div class="loveline">${line}</div>
    <div class="badges">${b.length ? b.map(x => `<span class="bdg">${x}</span>`).join('') : '<span class="bdg dim">·</span>'}</div>
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
  sheet(`<div class="sheet-title">💍 Commit to ${obj.seat.icon} ${esc(obj.name)}?</div>
    <p class="center small">You pour your heart out. If they secretly fancy you back → <b class="gold">you both win — Soulmates! 💞</b><br/>
    If not → you're <b>rejected</b>: your secret is out and you're knocked back a stage.<br/><span class="muted">Tip: 👀 Glance them first to be sure.</span></p>
    <button class="btn primary" id="docommit">💍 Commit — say it!</button>
    <button class="btn ghost" id="sx">Not yet</button>`, () => {
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
  const v = S.view;
  const winner = v.players[v.winnerId];
  const byDevotion = v.endReason === 'devotion';
  const headline = byDevotion
    ? `${esc(winner.name)} reached 💍 Devotion — they won the love!`
    : `${esc(winner.name)} got closest to love — they win the night 🌹`;
  const pairs = [];
  for (const p of v.players) { const o = v.players[p.crush]; if (p.soulmate && o.crush === p.id && p.id < o.id) pairs.push([p, o]); }
  app.innerHTML = `
    <section class="panel center">
      <h2>The Reveal</h2>
      <div class="bigseat">${winner.seat.icon}</div>
      <h3 class="gold">${headline}</h3>
      ${winner.soulmate ? '<div class="muted">…and it was meant to be — a Soulmate win 💞</div>' : ''}
    </section>
    ${pairs.length ? `<section class="panel center"><h3>💞 Soulmates</h3>${pairs.map(([a, b]) => `<div class="pairline">${a.seat.icon} ${esc(a.name)} 💘 ${b.seat.icon} ${esc(b.name)}</div>`).join('')}</section>` : ''}
    <section class="panel"><h3 class="center">How far each heart got</h3>
      ${[...v.players].sort((a, b) => b.stage - a.stage).map(p => { const o = v.players[p.crush]; return `<div class="revealline">
        <span class="si">${p.seat.icon}</span>
        <div class="rl-main"><b>${esc(p.name)}</b>${p.isAI ? ' <span class="ai-badge">AI</span>' : ''}${p.id === v.winnerId ? ' <span class="hosttag">winner</span>' : ''}
          <div class="muted small">${STAGES[p.stage] || '—'} ${STAGE_NAMES[p.stage]} · 💘 ${o.seat.icon} ${esc(o.name)}${p.soulmate ? ' · <b class="pink">mutual! 💞</b>' : ''}</div></div>
      </div>`; }).join('')}
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
      if (status === 200) { S.token = data.token; S.user = data.user; localStorage.setItem('hh_token', S.token); localStorage.setItem('hh_user', JSON.stringify(S.user)); refreshWho(); closeModal(); toast(`Welcome, ${S.user.username}!`); ensurePresenceConnection(); }
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
  modal(`<h3>How to play</h3>
    <p class="small">You secretly <b>fancy one player</b>. On your turn: <b>draw 1, play 1.</b> Build your romance ✨ <b>Spark</b> → 🌹 <b>Dating</b> → 💋 <b>Crazy for them</b>, then <b>Commit</b> — but you only win if <b>they love you back</b> (Soulmates 💞).</p>
    <ul class="small">
      <li>❤️ <b>Moment</b> — grow your romance one stage. At 💋, play it again to <b>Commit / confess</b>.</li>
      <li>👀 <b>Glance</b> — secretly see who a player fancies (scout before you commit!).</li>
      <li>💘 <b>Sway</b> — re-aim your own secret crush (your romance cools one stage).</li>
      <li>💔 <b>Heartbreak</b> — knock any rival <b>back</b> one stage.</li>
      <li>💚 <b>Jealousy</b> — hit a rival who's Dating or closer: knock them back <b>and expose their secret crush to everyone</b>.</li>
      <li>🛡️ <b>Guardian</b> — shield yourself from the next Heartbreak, Jealousy or Friendzone.</li>
      <li>🤝 <b>Friendzone</b> — a rival loses their next turn.</li>
    </ul>
    <p class="small">Confess at 💋 and it's mutual → <b>you win, Soulmates 💞</b>. Confess unrequited → you're <b>rejected</b> (cool off, miss a turn, your crush is revealed). Deck runs out → whoever got closest to love wins.</p>
    <button class="btn primary" id="x">Got it</button>`, () => $('#x').onclick = closeModal);
}

// ============================================================ NET FLOW
async function connect() {
  if (S.net) return;
  S.net = new Net(onMsg);
  try { await S.net.connect(); } catch { toast('Could not reach the server'); S.net = null; throw new Error('no server'); }
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
    case 'invite': return showIncomingInvite(m);
    case 'inviteResult': return toast(m.message || m.reason || (m.ok ? 'Invite sent' : 'Invite failed'));
    case 'error': return toast(m.error || 'error');
    case 'closed': { S.net = null; if (S.view && !S.view.over) { toast('Disconnected from the room'); leaveToHome(); } return; }
  }
}

// sound cues based on what changed between states
function cues(prev, v) {
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

// ---------- boot ----------
window.addEventListener('resize', () => { if (document.querySelector('.hand.fan')) layoutFan(); });
refreshWho();
$('#mute').textContent = SFX.isMuted() ? '🔇' : '🔊';
renderHome();
ensurePresenceConnection();   // if a token is already in localStorage, register us as online

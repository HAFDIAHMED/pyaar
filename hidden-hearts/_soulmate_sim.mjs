import * as engine from './shared/engine.js';

// Model player 0 as a HUMAN: picks a crush at setup and NEVER sways (keeps building).
// Players 1..n-1 are AI using the real aiAction. Measure how often each player ends
// up a soulmate (mutual) and how often each wins.
function humanPolicy(s, id) {
  const a = engine.aiAction(s, id);
  const hand = s.players[id].hand;
  const card = hand[a.cardIndex];
  if (card !== 'SWAY') return a;                 // forbid swaying — humans keep their crush
  let i = hand.indexOf('MOMENT');                // prefer to build
  if (i >= 0) return { cardIndex: i };
  for (let j = 0; j < hand.length; j++) {
    if (hand[j] === 'SWAY') continue;
    return { cardIndex: j, target: s.players.find(p => p.id !== id).id };
  }
  return { cardIndex: 0, discard: true };
}

function run(nPlayers, trials) {
  const soulmate = Array(nPlayers).fill(0);
  const wins = Array(nPlayers).fill(0);
  for (let g = 0; g < trials; g++) {
    const s = engine.createGame({ players: Array.from({ length: nPlayers }, (_, i) => ({ name: 'P' + i, isAI: true })) });
    for (let i = 0; i < nPlayers; i++) engine.aiSecret(s, i);
    engine.startPlay(s);
    let guard = 0;
    while (!s.over && guard++ < 8000) {
      const t = s.turn;
      const action = t === 0 ? humanPolicy(s, t) : engine.aiAction(s, t);
      let res = engine.applyAction(s, t, action);
      if (!res.ok) engine.applyAction(s, t, { cardIndex: 0, discard: true });
    }
    for (let i = 0; i < nPlayers; i++) { if (s.players[i].soulmate) soulmate[i]++; }
    if (s.winnerId != null) wins[s.winnerId]++;
  }
  const pct = a => a.map(x => (100 * x / trials).toFixed(1) + '%');
  console.log(`\n=== ${nPlayers} players, ${trials} games (P0 = human, never sways) ===`);
  console.log('Soulmate rate per player:', pct(soulmate).join('  '), `   (fair share = ${(100/nPlayers).toFixed(1)}%)`);
  console.log('Win rate per player:     ', pct(wins).join('  '));
}

run(3, 3000);
run(4, 3000);
run(5, 3000);

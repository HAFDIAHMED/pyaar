import * as engine from './shared/engine.js';

// P0 = HUMAN model: picks a crush at setup and NEVER sways (keeps building toward it).
// P1..n-1 are AI using the real aiAction. We measure fairness, decisiveness, length,
// and whether the new JEALOUSY card actually gets used / doesn't stall the game.
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
  let devotion = 0, timeout = 0, illegal = 0, moves = 0, jealousy = 0, heartbreak = 0, winnerInLove = 0;
  for (let g = 0; g < trials; g++) {
    const s = engine.createGame({ players: Array.from({ length: nPlayers }, (_, i) => ({ name: 'P' + i, isAI: true })) });
    for (let i = 0; i < nPlayers; i++) engine.aiSecret(s, i);
    engine.startPlay(s);
    let guard = 0;
    while (!s.over && guard++ < 8000) {
      const t = s.turn;
      const action = t === 0 ? humanPolicy(s, t) : engine.aiAction(s, t);
      const card = s.players[t].hand[action.cardIndex];
      const res = engine.applyAction(s, t, action);
      if (!res.ok) { illegal++; engine.applyAction(s, t, { cardIndex: 0, discard: true }); }
      else if (!action.discard) { moves++; if (card === 'JEALOUSY') jealousy++; if (card === 'HEARTBREAK') heartbreak++; }
    }
    if (s.endReason === 'devotion') devotion++; else if (s.endReason === 'timeout') timeout++;
    for (let i = 0; i < nPlayers; i++) if (s.players[i].soulmate) soulmate[i]++;
    if (s.winnerId != null) { wins[s.winnerId]++; if (s.players[s.winnerId].soulmate) winnerInLove++; }
  }
  const pct = a => a.map(x => (100 * x / trials).toFixed(1) + '%');
  const winPcts = wins.map(x => 100 * x / trials);
  const spread = (Math.max(...winPcts) - Math.min(...winPcts)).toFixed(1);
  console.log(`\n=== ${nPlayers} players · ${trials} games  (P0 = human, never sways) ===`);
  console.log('Soulmate rate/player :', pct(soulmate).join('  '), `   (fair = ${(100 / nPlayers).toFixed(1)}%)`);
  console.log('Win rate/player      :', pct(wins).join('  '), `   seat spread = ${spread}pt`);
  console.log(`Decisive (Commit win): ${(100 * devotion / trials).toFixed(1)}%   ·   Ran out of cards: ${(100 * timeout / trials).toFixed(1)}%`);
  console.log(`Winner was in mutual love: ${(100 * winnerInLove / trials).toFixed(1)}%`);
  console.log(`Avg moves/game: ${(moves / trials).toFixed(1)}   ·   Jealousy played/game: ${(jealousy / trials).toFixed(2)}   ·   Heartbreak/game: ${(heartbreak / trials).toFixed(2)}`);
  console.log(`Illegal actions across all games: ${illegal}`);
}

run(3, 4000);
run(4, 4000);
run(5, 4000);
run(6, 2000);

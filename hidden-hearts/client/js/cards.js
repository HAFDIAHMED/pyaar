// UI constants for PYAAR — BUILD YOUR LOVE (crush-central).
export const SEATS = [
  { name: 'Rose', icon: '🌹' }, { name: 'Lotus', icon: '🪷' }, { name: 'Moon', icon: '🌙' },
  { name: 'Flame', icon: '🔥' }, { name: 'Peacock', icon: '🦚' }, { name: 'Jasmine', icon: '🌼' },
  { name: 'Star', icon: '⭐' }, { name: 'Dove', icon: '🕊️' },
];

export const STAGES = ['', '✨', '🌹', '💋'];                       // 0..3
export const STAGE_NAMES = ['—', 'Spark', 'Dating', 'Crazy for them'];
export const READY = 3;

// Each card carries everything the UI needs:
//   icon   — the big emoji shown in the card art
//   fam    — colour family for the border + background
//   action — one bold verb at the top of the card (the principle: what does it DO?)
//   short  — the precise one-line effect ("+1 me", "−1 a rival", etc.)
//   tag    — the small italic flavour line under the effect
//   desc   — the fuller rules text (shown in the long-press tooltip)
//   tone   — 'self' | 'attack' | 'info' — drives the corner chip + colour
export const CARD = {
  MOMENT:     { icon: '❤️', fam: 'love',     needsTarget: 'self',  tone: 'self',
    action: 'GROW',    short: '+1 stage on me',          tag: 'Hearts race.',      desc: 'Climb one stage of love. At 💋 play it again to Confess — you win if they fancy you back.' },
  GLANCE:     { icon: '👀', fam: 'info',     needsTarget: 'other', tone: 'info',
    action: 'PEEK',    short: "See who they fancy",      tag: 'Scout a heart.',    desc: 'Secretly see that player\'s crush. Only YOU see the answer.' },
  SWAY:       { icon: '💘', fam: 'self2',    needsTarget: 'other', tone: 'self',
    action: 'SWITCH',  short: 'Pick a NEW crush (−1 me)',tag: 'Fall for another.', desc: 'Point your secret love at someone new. Your own love cools one stage.' },
  HEARTBREAK: { icon: '💔', fam: 'attack',   needsTarget: 'other', tone: 'attack',
    action: 'BREAK',   short: '−1 stage on a rival',     tag: 'Break a heart.',    desc: 'Drop any rival down one stage of love.' },
  JEALOUSY:   { icon: '💚', fam: 'jealousy', needsTarget: 'other', tone: 'attack',
    action: 'EXPOSE',  short: '−1 + reveal their crush', tag: 'Green with envy.',  desc: 'Hit a rival at Dating or closer — drop them a stage AND reveal who they fancy to everyone.' },
  GUARDIAN:   { icon: '🛡️', fam: 'block',    needsTarget: 'self',  tone: 'self',
    action: 'SHIELD',  short: 'Block next attack on me', tag: 'Guard your love.',  desc: 'Block the next Heartbreak, Jealousy or Friendzone aimed at you.' },
  FRIENDZONE: { icon: '🤝', fam: 'block2',   needsTarget: 'other', tone: 'attack',
    action: 'FREEZE',  short: 'Rival skips next turn',   tag: 'Just friends.',     desc: 'A rival loses their next turn entirely.' },
};

export const title = (k) => k[0] + k.slice(1).toLowerCase();

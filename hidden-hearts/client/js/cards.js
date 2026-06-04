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
//   icon  — the big emoji shown in the card art
//   fam   — colour family for the border + background
//   short — one-line headline shown on the card face (what new players read first)
//   tag   — the small italic flavour line under the title
//   desc  — the fuller rules text (now hidden behind a [?] tooltip on the card)
//   tone  — 'self' | 'other' | 'attack' | 'info' — drives the small target chip
export const CARD = {
  MOMENT:     { icon: '❤️', fam: 'love',     needsTarget: 'self',  tone: 'self',   short: 'Grow love +1',          tag: 'Grow closer.',       desc: 'Climb a stage of romance. At 💋 play it again to Commit — you win if they love you back.' },
  GLANCE:     { icon: '👀', fam: 'info',     needsTarget: 'other', tone: 'info',   short: "Peek a rival's crush",  tag: 'Scout a heart.',     desc: 'Secretly see who that player fancies. Only you see the answer.' },
  SWAY:       { icon: '💘', fam: 'self2',    needsTarget: 'other', tone: 'self',   short: 'Re-aim your crush',     tag: 'Fall for another.',  desc: 'Point your secret love at someone new. Your romance cools one stage.' },
  HEARTBREAK: { icon: '💔', fam: 'attack',   needsTarget: 'other', tone: 'attack', short: 'Knock a rival back',    tag: 'Break a heart.',     desc: 'Drop any rival down one stage.' },
  JEALOUSY:   { icon: '💚', fam: 'jealousy', needsTarget: 'other', tone: 'attack', short: 'Knock back + expose',   tag: 'Green with envy.',   desc: 'Hit a rival at Dating or closer — drop them a stage AND expose their secret crush to everyone.' },
  GUARDIAN:   { icon: '🛡️', fam: 'block',    needsTarget: 'self',  tone: 'self',   short: 'Block next attack',     tag: 'Guard your love.',   desc: 'Block the next Heartbreak, Jealousy or Friendzone aimed at you.' },
  FRIENDZONE: { icon: '🤝', fam: 'block2',   needsTarget: 'other', tone: 'attack', short: 'Skip their next turn',  tag: 'Just friends.',      desc: 'A rival loses their next turn entirely.' },
};

export const title = (k) => k[0] + k.slice(1).toLowerCase();

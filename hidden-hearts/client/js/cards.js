// UI constants for PYAAR — BUILD YOUR LOVE (crush-central).
export const SEATS = [
  { name: 'Rose', icon: '🌹' }, { name: 'Lotus', icon: '🪷' }, { name: 'Moon', icon: '🌙' },
  { name: 'Flame', icon: '🔥' }, { name: 'Peacock', icon: '🦚' }, { name: 'Jasmine', icon: '🌼' },
  { name: 'Star', icon: '⭐' }, { name: 'Dove', icon: '🕊️' },
];

export const STAGES = ['', '✨', '🌹', '💋'];                       // 0..3
export const STAGE_NAMES = ['—', 'Spark', 'Dating', 'Crazy for them'];
export const READY = 3;

export const CARD = {
  MOMENT:     { icon: '❤️', fam: 'love',     needsTarget: 'self',  tag: 'Grow closer.',      desc: 'Advance your romance. At 💋 you can Commit — win if they love you back.' },
  GLANCE:     { icon: '👀', fam: 'info',     needsTarget: 'other', tag: 'Scout a heart.',    desc: 'Secretly see who a player fancies. Check before you commit!' },
  SWAY:       { icon: '💘', fam: 'self2',    needsTarget: 'other', tag: 'Fall for another.', desc: 'Re-aim your crush at someone new (your romance cools one stage).' },
  HEARTBREAK: { icon: '💔', fam: 'attack',   needsTarget: 'other', tag: 'Break a heart.',    desc: 'Knock any rival back one stage.' },
  JEALOUSY:   { icon: '💚', fam: 'jealousy', needsTarget: 'other', tag: 'Green with envy.',  desc: 'Hit a rival at Dating or closer: knock them back AND expose their secret crush to everyone.' },
  GUARDIAN:   { icon: '🛡️', fam: 'block',    needsTarget: 'self',  tag: 'Guard your love.',  desc: 'Block the next Heartbreak, Jealousy or Friendzone on you.' },
  FRIENDZONE: { icon: '🤝', fam: 'block2',   needsTarget: 'other', tag: 'Just friends.',     desc: 'A rival loses their next turn.' },
};

export const title = (k) => k[0] + k.slice(1).toLowerCase();

// UI-side constants (labels + descriptions). Rules live on the server.
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
  HEARTBREAK: { icon: '💔', fam: 'attack',     tag: 'Break a heart.', needsTarget: 'other',    desc: 'Remove a Protector, or crack a bare Heart.' },
  SOLDIER:    { icon: '⚑', fam: 'attack',     tag: 'Advance.',       needsTarget: 'other',    desc: 'Remove a Protector. No effect on a bare Heart.' },
  WARRIOR:    { icon: '⚔', fam: 'defense',    tag: 'Shield.',        needsTarget: 'self',     desc: 'Place on your Heart as a Protector.' },
  FRIENDZONE: { icon: '🤝', fam: 'defense',    tag: 'Just friends.',  needsTarget: 'other',    desc: "Void that player's crush on you." },
  DREAMER:    { icon: '☾', fam: 'defense',    tag: 'Daydream.',      needsTarget: 'self',     desc: 'Be Untouchable until your next turn.' },
  SAGE:       { icon: '✦', fam: 'info',       tag: 'Insight.',       needsTarget: 'peek',     desc: 'Secretly peek a crush or a Protector.' },
  TRAITOR:    { icon: '⚯', fam: 'disruption', tag: 'Betrayal.',      needsTarget: 'other',    desc: 'Steal a random card from a hand.' },
  FOOL:       { icon: '◊', fam: 'disruption', tag: 'Wild.',          needsTarget: 'wild',     desc: "Copy any one character's effect." },
  CRUSH:      { icon: '💘', fam: 'love',       tag: 'Send a sign.',   needsTarget: 'other',    desc: 'A public, deniable flirt. Mutual scores +2.' },
  DEVOTION:   { icon: '💍', fam: 'devotion',   tag: 'True love.',     needsTarget: 'devotion', desc: 'Repair your Heart, or declare your crush.' },
};

export const heartGlyph = (st) => st === 'whole' ? '❤️' : st === 'cracked' ? '💛' : '💔';
export const title = (k) => k[0] + k.slice(1).toLowerCase();

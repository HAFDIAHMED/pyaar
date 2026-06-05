// UI constants for PYAAR — BUILD YOUR LOVE (crush-central).
import { t } from './i18n.js';

export const SEATS = [
  { name: 'Rose', icon: '🌹' }, { name: 'Lotus', icon: '🪷' }, { name: 'Moon', icon: '🌙' },
  { name: 'Flame', icon: '🔥' }, { name: 'Peacock', icon: '🦚' }, { name: 'Jasmine', icon: '🌼' },
  { name: 'Star', icon: '⭐' }, { name: 'Dove', icon: '🕊️' },
];

export const STAGES = ['', '✨', '🌹', '💋'];                       // 0..3
// Live-translated stage names — derived from i18n so they switch language with the rest of the UI.
export const STAGE_NAMES = new Proxy([], {
  get(_, idx) {
    const n = +idx;
    if (n === 0) return '—';
    if (n === 1) return t('stages.spark');
    if (n === 2) return t('stages.dating');
    if (n === 3) return t('stages.crazy');
    return undefined;
  }
});
export const READY = 3;

// Each card is a getter-driven object: structural fields (icon / fam / tone /
// needsTarget) are static, but action/name/short/tag/desc come from the i18n
// layer so they switch language with the rest of the UI.
function liveCard(key, base) {
  return Object.assign({}, base, {
    get action() { return t(`cards.${key}.action`); },
    get name()   { return t(`cards.${key}.name`);   },
    get short()  { return t(`cards.${key}.short`);  },
    get tag()    { return t(`cards.${key}.tag`);    },
    get desc()   { return t(`cards.${key}.desc`);   },
  });
}
export const CARD = {
  MOMENT:     liveCard('MOMENT',     { icon: '❤️', fam: 'love',     needsTarget: 'self',  tone: 'self'   }),
  GLANCE:     liveCard('GLANCE',     { icon: '👀', fam: 'info',     needsTarget: 'other', tone: 'info'   }),
  SWAY:       liveCard('SWAY',       { icon: '💘', fam: 'self2',    needsTarget: 'other', tone: 'self'   }),
  HEARTBREAK: liveCard('HEARTBREAK', { icon: '💔', fam: 'attack',   needsTarget: 'other', tone: 'attack' }),
  JEALOUSY:   liveCard('JEALOUSY',   { icon: '💚', fam: 'jealousy', needsTarget: 'other', tone: 'attack' }),
  GUARDIAN:   liveCard('GUARDIAN',   { icon: '🛡️', fam: 'block',    needsTarget: 'self',  tone: 'self'   }),
  FRIENDZONE: liveCard('FRIENDZONE', { icon: '🤝', fam: 'block2',   needsTarget: 'other', tone: 'attack' }),
};

// The card's display title comes from i18n now (e.g. 'Moment' → 'Instant' in French).
export const title = (k) => CARD[k]?.name ?? (k[0] + k.slice(1).toLowerCase());

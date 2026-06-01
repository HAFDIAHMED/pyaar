// Smooth synthesized sounds via Web Audio. Everything routes through a master
// gain → gentle low-pass → compressor/limiter, with click-free envelopes
// (soft attack + exponential setTargetAtTime decay). Sine/triangle only.
let ctx = null, master = null, muted = false;
try { muted = localStorage.getItem('pyaar_mute') === '1'; } catch {}

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.3;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      master.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
    } catch { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch {} }
  return ctx;
}

// a smooth tone: soft attack, exponential decay (no clicks)
function tone(freq, dur, { type = 'sine', gain = 0.12, when = 0, glide = 0 } = {}) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + glide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.018);           // ~18ms attack
  g.gain.setTargetAtTime(0.0001, t + 0.02, dur * 0.45);      // smooth tail
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.4);
}

// a soft filtered-noise swish (for card moves) with a fade so it never clicks
function swish(dur, { gain = 0.05, freq = 1300, when = 0 } = {}) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + when;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
  g.gain.setTargetAtTime(0.0001, t + dur * 0.35, dur * 0.4);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
}

const chord = (notes, dur, opt = {}) => notes.forEach((f, i) => tone(f, dur, { ...opt, when: (opt.when || 0) + i * (opt.stagger ?? 0.11) }));

export const SFX = {
  isMuted: () => muted,
  resume() { ac(); },
  toggle() { muted = !muted; try { localStorage.setItem('pyaar_mute', muted ? '1' : '0'); } catch {} if (!muted) { ac(); this.click(); } return muted; },
  click() { tone(440, 0.08, { gain: 0.06 }); },
  deal(n) { const k = Math.min(Math.max(1, n || 1), 4); for (let i = 0; i < k; i++) swish(0.16, { gain: 0.045, freq: 1200 + i * 120, when: i * 0.1 }); },
  shuffle() { swish(0.34, { gain: 0.05, freq: 1000 }); swish(0.3, { gain: 0.04, freq: 1500, when: 0.12 }); },
  play() { swish(0.13, { gain: 0.05, freq: 1500 }); tone(300, 0.1, { gain: 0.05, glide: -90 }); },     // soft card "tup"
  shield() { tone(540, 0.16, { gain: 0.08 }); tone(810, 0.18, { gain: 0.06, when: 0.07 }); },
  hit() { tone(130, 0.34, { type: 'sine', gain: 0.13, glide: -40 }); tone(90, 0.3, { gain: 0.09, when: 0.02 }); },
  crush() { tone(880, 0.2, { gain: 0.08 }); tone(1320, 0.26, { gain: 0.06, when: 0.1 }); },
  friendzone() { tone(430, 0.18, { gain: 0.07 }); tone(300, 0.22, { gain: 0.055, when: 0.09 }); },
  turn() { tone(620, 0.16, { gain: 0.07 }); tone(930, 0.18, { gain: 0.055, when: 0.08 }); },
  join() { tone(520, 0.14, { gain: 0.06 }); tone(780, 0.16, { gain: 0.05, when: 0.07 }); },
  soulmate() { chord([523, 659, 784, 1047, 1319], 0.6, { gain: 0.085, stagger: 0.12 }); },
  win() { chord([392, 523, 659, 784, 1047], 0.5, { type: 'triangle', gain: 0.08, stagger: 0.1 }); },
};

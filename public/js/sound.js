/* Mudra Magic: all sound is synthesised live (no recordings, no copyright).
   A tanpura-style drone on Sa–Pa, bell chimes on swaras, and spell textures. */
const SA = 138.59; // C#3
const SWARA = [0, 2, 4, 5, 7, 9, 11, 12, 14]; // Sa Re Ga Ma Pa Dha Ni Sa' Re'
const hz = (i) => SA * Math.pow(2, SWARA[i] / 12);

let ctx = null, master = null, verb = null, droneGain = null, droneTimer = null;
let muted = false;
try { muted = localStorage.getItem('mm-muted') === '1'; } catch {}

function impulse(c, secs = 3.2) {
  const len = Math.floor(c.sampleRate * secs), buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  return buf;
}
function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  verb = ctx.createConvolver(); verb.buffer = impulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.38; verb.connect(wet).connect(master);
  droneGain = ctx.createGain(); droneGain.gain.value = 0; droneGain.connect(master); droneGain.connect(verb);
  return ctx;
}
function out(node, dry = 1, wet = 0.6) {
  const g1 = ctx.createGain(); g1.gain.value = dry; node.connect(g1).connect(master);
  const g2 = ctx.createGain(); g2.gain.value = wet; node.connect(g2).connect(verb);
}

/* --- tanpura: plucked strings with buzzy harmonics, cycling Pa Sa' Sa' Sa --- */
function pluck(freq, t, vol = 0.06) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = freq; o2.frequency.value = freq * 1.003;
  f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + 3.5); f.Q.value = 3;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
  o.connect(f); o2.connect(f); f.connect(g).connect(droneGain);
  o.start(t); o2.start(t); o.stop(t + 4.3); o2.stop(t + 4.3);
}
function startDrone() {
  if (!ctx || droneTimer) return;
  droneGain.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
  const seq = [hz(4) / 2, SA, SA, SA / 2];
  let i = 0, next = ctx.currentTime + 0.1;
  const tick = () => {
    while (next < ctx.currentTime + 0.6) { pluck(seq[i % 4], next, i % 4 === 3 ? 0.07 : 0.05); next += 1.15; i++; }
  };
  tick(); droneTimer = setInterval(tick, 250);
}

/* --- bell: FM synthesis --- */
function bell(freq, t, vol = 0.22, dur = 3.2) {
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = freq; mod.frequency.value = freq * 3.5;
  mg.gain.setValueAtTime(freq * 2.2, t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur);
  mod.connect(mg).connect(car.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g); out(g, 0.8, 0.9);
  car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
}
function noise(t, dur, { type = 'bandpass', from = 800, to = 3000, q = 1, vol = 0.2, attack = 0.02 } = {}) {
  const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g); out(g, 1, 0.5); s.start(t);
}
function sub(t, from, to, dur, vol = 0.4) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); out(g, 1, 0.2); o.start(t); o.stop(t + dur + 0.05);
}

export const Sound = {
  get muted() { return muted; },
  unlock() { if (init()) startDrone(); },
  toggle() {
    muted = !muted; try { localStorage.setItem('mm-muted', muted ? '1' : '0'); } catch {}
    if (init()) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    return muted;
  },
  /** Spell sound for a mudra id. */
  cast(id, note) {
    if (!init() || muted) return;
    const t = ctx.currentTime + 0.01;
    bell(hz(note), t, 0.2); bell(hz(note) * 2, t + 0.06, 0.08, 2.4);
    if (id === 'pataka') { noise(t, 1.6, { from: 300, to: 4000, q: 0.7, vol: 0.25 }); sub(t, 90, 30, 1.4, 0.45); noise(t + 0.05, 0.25, { type: 'highpass', from: 3000, to: 6000, vol: 0.3, attack: 0.002 }); }
    if (id === 'alapadma') { [0, 2, 4, 7].forEach((n, i) => bell(hz(n) * 2, t + 0.12 + i * 0.09, 0.07, 2.8)); noise(t, 1.2, { from: 2000, to: 8000, q: 2, vol: 0.06 }); }
    if (id === 'shikhara') { noise(t, 1.8, { type: 'lowpass', from: 300, to: 2500, q: 0.5, vol: 0.35, attack: 0.15 }); sub(t, 70, 45, 1.2, 0.3); }
    if (id === 'mayura') { [5, 7, 8, 5].forEach((n, i) => bell(hz(n) * 2, t + 0.1 + i * 0.07, 0.07, 2.2)); noise(t, 0.9, { from: 900, to: 5000, q: 1.5, vol: 0.12 }); }
    if (id === 'mushti') { sub(t, 120, 28, 1.6, 0.7); noise(t, 1.2, { type: 'lowpass', from: 900, to: 80, q: 0.8, vol: 0.5, attack: 0.005 }); }
    if (id === 'nataraja') { [0, 4, 7, 9, 7, 4, 0].forEach((n, i) => bell(hz(n) * 2, t + i * 0.12, 0.12, 3)); sub(t, 80, 35, 2.5, 0.5); noise(t, 3, { from: 200, to: 6000, q: 0.6, vol: 0.2, attack: 0.4 }); }
  },
  /** Rising tone while a mudra charges (0..1). */
  charge(p) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = SA * 2 * Math.pow(2, p);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); out(g, 1, 0.3); o.start(t); o.stop(t + 0.15);
  },
  unlock_achievement() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    [0, 2, 4, 7, 9, 12].forEach((s, i) => bell(SA * 2 * Math.pow(2, s / 12), t + i * 0.08, 0.09, 2));
  },
  release() { if (!init() || muted) return; noise(ctx.currentTime, 0.5, { from: 4000, to: 600, q: 1, vol: 0.08 }); },
};

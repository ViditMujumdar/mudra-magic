/* Mudra Magic: app flow. Camera → MediaPipe hand landmarks → mudra classifier → spells. */
import { createMagic } from './magic.js';
import { MUDRAS, CORE, POSES, classify, features, drawPoseIcon } from './mudras.js';
import { Sound } from './sound.js';
import { COLLEGES } from './colleges.js';

const $ = (s) => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).has('debug');
const LS = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- identity ---------------- */
let sid = LS.get('mm-sid');
if (!sid) { sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20); LS.set('mm-sid', sid); }
let college = LS.get('mm-college') || '';
let unlocked = new Set(JSON.parse(LS.get('mm-unlocked') || '[]'));
let wall = null;

/* ---------------- engine ---------------- */
const video = $('#cam');
const magic = createMagic($('#stage'), { video });
window.__magic = magic;

/* ---------------- static UI ---------------- */
COLLEGES.forEach((c) => { const o = document.createElement('option'); o.value = c; $('#college-list').appendChild(o); });
$('#college').value = college; $('#college2').value = college;
function setCollege(v) {
  college = v.trim().slice(0, 64); LS.set('mm-college', college);
  $('#college').value = college; $('#college2').value = college;
}
$('#college').addEventListener('change', (e) => setCollege(e.target.value));
$('#college2').addEventListener('change', (e) => { setCollege(e.target.value); toast(college ? `Casting for ${college} ⚔️` : 'College removed'); renderWall(); });

function icon(id, size = 96) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  drawPoseIcon(c, id, MUDRAS[id].color); return c;
}
CORE.forEach((id) => {
  const m = MUDRAS[id], d = document.createElement('div');
  d.className = 'sc'; d.appendChild(icon(id)); d.insertAdjacentHTML('beforeend', `<b>${m.deva}</b><small>${m.name}</small>`);
  $('#spell-strip').appendChild(d);
});
function renderBook(popId) {
  const b = $('#book'); b.innerHTML = '';
  [...CORE, 'nataraja'].forEach((id) => {
    const m = MUDRAS[id], el = document.createElement('div');
    el.className = 'bi' + (unlocked.has(id) ? ' on' : '') + (id === popId ? ' pop' : '');
    el.style.setProperty('--c', m.color);
    el.title = m.name;
    if (id === 'nataraja' && !unlocked.has(id)) { el.classList.add('secret'); el.textContent = '?'; } else el.appendChild(icon(id, 56));
    b.appendChild(el);
  });
}
renderBook();

function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), ms); }
function status(text) { $('#status').hidden = !text; if (text) $('#status-t').textContent = text; }

/* ---------------- coach: suggests the next locked mudra ---------------- */
let coachIdx = 0, coachTimer = null;
function coach(forceId) {
  const locked = CORE.filter((id) => !unlocked.has(id));
  let id = forceId;
  if (!id) {
    if (!locked.length && !unlocked.has('nataraja')) id = 'nataraja';
    else id = (locked.length ? locked : CORE)[coachIdx++ % (locked.length || CORE.length)];
  }
  const m = MUDRAS[id];
  drawPoseIcon($('#coach-icon'), id, m.color);
  $('#coach-t').textContent = `${unlocked.has(id) ? 'Cast' : 'Try'} ${m.name} (${m.deva}) · ${m.spell}`;
  $('#coach-d').textContent = mode === 'touch' && id !== 'nataraja' ? `Pick ${m.name} below, then touch and hold the screen.` : m.how;
}
function startCoach() { coach(); clearInterval(coachTimer); coachTimer = setInterval(() => coach(), 6500); }

/* ---------------- sheets ---------------- */
document.querySelectorAll('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) s.hidden = true; }));
function renderGuide() {
  const g = $('#glist'); g.innerHTML = '';
  $('#g-count').textContent = `(${CORE.filter((id) => unlocked.has(id)).length}/5)`;
  [...CORE, 'nataraja'].forEach((id) => {
    const m = MUDRAS[id], on = unlocked.has(id), r = wall?.mudras?.[id];
    const el = document.createElement('div');
    el.className = 'gi' + (on ? ' on' : ''); el.style.setProperty('--c', m.color);
    el.appendChild(icon(id, 152));
    el.insertAdjacentHTML('beforeend', `<div><div class="gd">${m.deva}</div><div class="gn">${m.name} <small>· ${m.meaning}</small></div>
      <p><b>How:</b> ${esc(m.how)}</p><p><b>Spell:</b> ${esc(m.spell)}. ${esc(m.desc)}</p>
      <span class="gs">${on ? '✅ Unlocked' : '🔒 Locked'}${r && wall.casters >= 20 ? ` · ${Math.max(1, Math.round(r.rarity * 100))}% of sorcerers have it` : ''}</span></div>`);
    g.appendChild(el);
  });
}
$('#guide-btn').addEventListener('click', () => { renderGuide(); $('#guide').hidden = false; });
$('#wall-btn').addEventListener('click', () => { renderWall(); $('#wall').hidden = false; refreshWall(); });

/* ---------------- wall ---------------- */
async function refreshWall() {
  try { const r = await fetch('/api/wall', { cache: 'no-store' }); if (r.ok) { wall = await r.json(); renderWall(); } } catch {}
}
function renderWall() {
  if (!wall) return;
  $('#i-casts').textContent = fmt(wall.casts); $('#i-sorc').textContent = fmt(wall.casters);
  $('#w-casts').textContent = fmt(wall.casts); $('#w-sorc').textContent = fmt(wall.casters);
  const rr = $('#rarity'); rr.innerHTML = '';
  [...CORE, 'nataraja'].forEach((id) => {
    const m = MUDRAS[id], r = wall.mudras[id] || { rarity: 0 };
    const pct = wall.casters ? Math.round(r.rarity * 100) : 0;
    rr.insertAdjacentHTML('beforeend', `<div class="rr" style="--c:${m.color}"><b>${m.deva}</b><div class="bar"><span style="width:${Math.max(2, pct)}%"></span></div><em>${pct}%</em></div>`);
  });
  const cb = $('#cboard'); cb.innerHTML = '';
  if (!wall.colleges.length) cb.innerHTML = '<li class="empty">No college on the wall yet. Cast a spell to put yours first.</li>';
  const mine = college.toLowerCase().replace(/[^a-z0-9]/g, '');
  wall.colleges.slice(0, 10).forEach((c, i) => {
    cb.insertAdjacentHTML('beforeend', `<li class="${c.key === mine ? 'me' : ''}"><span class="r">${['१', '२', '३'][i] || i + 1}</span><span class="n">${esc(c.name)}<small>${fmt(c.casters)} sorcerer${c.casters === 1 ? '' : 's'}</small></span><span class="p">${fmt(c.casts)} ✨</span></li>`);
  });
  const fd = $('#feed'); fd.innerHTML = '';
  if (!wall.feed.length) fd.innerHTML = '<li>Nobody yet. You could be the first!</li>';
  wall.feed.slice(0, 8).forEach((f) => {
    const m = MUDRAS[f.mudra];
    fd.insertAdjacentHTML('beforeend', `<li>✨ Someone${f.college ? ` from <b>${esc(f.college)}</b>` : ''} unlocked <b>${m.name} ${m.deva}</b> · ${ago(f.t)}</li>`);
  });
}
function ago(t) { const s = Math.max(1, (Date.now() - t) / 1000 | 0); return s < 60 ? `${s}s ago` : s < 3600 ? `${s / 60 | 0}m ago` : s < 86400 ? `${s / 3600 | 0}h ago` : `${s / 86400 | 0}d ago`; }
refreshWall();
setInterval(() => { if (!document.hidden) refreshWall(); }, 8000);

async function reportCast(id) {
  try {
    const r = await fetch('/api/cast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, mudra: id, college }) });
    const j = await r.json();
    if (j.wall) { wall = j.wall; renderWall(); }
    return j;
  } catch { return null; }
}

/* ---------------- casting state machine (per hand) ---------------- */
const slots = [mkSlot(), mkSlot()];
function mkSlot() { return { cand: null, candT: 0, current: null, lostT: 0, prevPalm: null, smooth: null, lastTick: 0 }; }
const HOLD = 0.42, LOSE = 0.28;
let lastCastAt = 0, lastShot = null, shotTimer = null;

function onCast(hi, id, h) {
  magic.cast(hi, id, h);
  Sound.cast(id, MUDRAS[id].note);
  lastCastAt = performance.now();
  showName(id, 1);
  const first = !unlocked.has(id);
  if (first) unlock(id);
  reportCast(id);
  clearTimeout(shotTimer);
  shotTimer = setTimeout(async () => { lastShot = { id, canvas: await magic.snapshot() }; $('#card-btn').disabled = false; }, 1100);
  checkNataraja();
}
function unlock(id) {
  unlocked.add(id); LS.set('mm-unlocked', JSON.stringify([...unlocked]));
  const m = MUDRAS[id];
  setTimeout(() => {
    const u = $('#unlock');
    u.style.setProperty('--c', m.color);
    $('#u-deva').textContent = m.deva; $('#u-en').textContent = m.name;
    const r = wall?.mudras?.[id];
    $('#u-r').textContent = r && wall.casters >= 20 ? `Only ${Math.max(1, Math.round(r.rarity * 100))}% of sorcerers have unlocked this` : `${m.meaning} · ${m.spell}`;
    u.hidden = true; void u.offsetWidth; u.hidden = false;
    clearTimeout(u._t); u._t = setTimeout(() => (u.hidden = true), 2800);
    Sound.unlock_achievement();
    renderBook(id);
    coach();
    if (CORE.every((x) => unlocked.has(x)) && !unlocked.has('nataraja') && id !== 'nataraja') {
      setTimeout(() => toast(mode === 'touch' ? '🔥 All five mastered! Tap “Awaken Nataraja” below.' : '🔥 All five mastered! Raise Alapadma with BOTH hands to awaken Nataraja.', 5000), 2900);
      if (mode === 'touch') buildDock();
    }
  }, 500);
}
let natCooldown = 0;
function checkNataraja(force) {
  if (!CORE.every((x) => unlocked.has(x))) return;
  const both = slots[0].current === 'alapadma' && slots[1].current === 'alapadma';
  if ((both || force) && performance.now() > natCooldown) {
    natCooldown = performance.now() + 8000;
    const hs = hands.filter(Boolean);
    const cx = hs.length ? hs.reduce((a, h) => a + h.palm[0], 0) / hs.length : 0, cy = hs.length ? hs.reduce((a, h) => a + h.palm[1], 0) / hs.length : 0;
    setTimeout(() => {
      magic.nataraja(cx, cy); Sound.cast('nataraja', 0); showName('nataraja', 1);
      if (!unlocked.has('nataraja')) unlock('nataraja');
      reportCast('nataraja');
      clearTimeout(shotTimer);
      shotTimer = setTimeout(async () => { lastShot = { id: 'nataraja', canvas: await magic.snapshot() }; $('#card-btn').disabled = false; }, 900);
    }, 250);
  }
}

let nameTimer = null;
function showName(id, charge) {
  const m = MUDRAS[id], cn = $('#cast-name');
  cn.style.setProperty('--c', m.color);
  $('#cn-deva').textContent = m.deva; $('#cn-en').textContent = m.name; $('#cn-spell').textContent = `${m.meaning} · ${m.spell}`;
  $('#cn-bar').style.width = `${Math.round(Math.min(1, charge) * 100)}%`;
  cn.classList.add('show');
  clearTimeout(nameTimer); nameTimer = setTimeout(() => cn.classList.remove('show'), charge >= 1 ? 1800 : 400);
  $('#coach').classList.add('dim'); clearTimeout(coach._d); coach._d = setTimeout(() => $('#coach').classList.remove('dim'), 4000);
}

/** Advance one hand slot with this frame's recognised mudra. */
function step(hi, h, id, dt) {
  const s = slots[hi];
  if (!h) {
    if (s.current) { s.lostT += dt; if (s.lostT > LOSE) { endSpell(hi); } }
    s.cand = null; s.candT = 0; return;
  }
  if (id && id === s.current) { s.lostT = 0; s.cand = null; s.candT = 0; return; }
  if (s.current) { s.lostT += dt; if (s.lostT > LOSE) endSpell(hi); }
  if (!id) { s.cand = null; s.candT = 0; return; }
  if (id !== s.cand) { s.cand = id; s.candT = 0; }
  s.candT += dt;
  const p = s.candT / HOLD;
  showName(id, p);
  if (performance.now() - s.lastTick > 90) { s.lastTick = performance.now(); Sound.charge(Math.min(1, p)); }
  if (p >= 1) {
    if (s.current) endSpell(hi, true);
    s.current = id; s.lostT = 0; s.cand = null; s.candT = 0;
    onCast(hi, id, h);
  }
}
function endSpell(hi, silent) {
  const s = slots[hi];
  const r = magic.release(hi, silent);
  if (r === 'shatter') Sound.cast('mushti', MUDRAS.mushti.note);
  else if (!silent) Sound.release();
  s.current = null; s.lostT = 0;
}

/* ---------------- hands → world ---------------- */
let hands = [null, null];
function toHand(pts, ghost, color) {
  const palm = [0, 5, 9, 13, 17].reduce((a, i) => [a[0] + pts[i][0] / 5, a[1] + pts[i][1] / 5], [0, 0]);
  const size = Math.hypot(pts[9][0] - pts[0][0], pts[9][1] - pts[0][1]);
  const dl = size || 1, dir = [(pts[9][0] - pts[0][0]) / dl, (pts[9][1] - pts[0][1]) / dl];
  return { pts, palm, size: Math.max(40, size), dir, ghost, color };
}

/* ---------------- camera mode ---------------- */
let mode = null, landmarker = null, lastVideoTime = -1, running = false;
async function startCamera() {
  mode = 'camera';
  enterHud();
  status('Asking for your camera…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    status('');
    toast('Camera unavailable, so switching to touch mode 👆', 3500);
    return startTouch();
  }
  magic.setVideo(true);
  status('Loading the hand-tracking AI (one time)…');
  try {
    const { FilesetResolver, HandLandmarker } = await import('/vendor/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { landmarker = await HandLandmarker.createFromOptions(files, opts('GPU')); }
    catch { landmarker = await HandLandmarker.createFromOptions(files, opts('CPU')); }
  } catch (err) {
    console.error(err);
    status('');
    toast('Hand tracking could not start on this device. Switching to touch mode 👆', 4000);
    return startTouch();
  }
  status('');
  toast('Show your hand to the camera ✋', 2500);
  running = true;
  requestAnimationFrame(loop);
}

let lastT = performance.now(), noHandT = 0;
function loop(now) {
  if (!running) return;
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    let res = null;
    try { res = landmarker.detectForVideo(video, now); } catch (e) { console.warn(e); }
    const found = res ? res.landmarks.map((lm, i) => ({ lm, wl: res.worldLandmarks[i] })) : [];
    // keep hand identity stable across frames: match by nearest previous palm
    const next = [null, null], ids = [null, null];
    const cand = found.map((f) => {
      const pts = f.lm.map((p) => magic.videoToWorld(p.x, p.y));
      return { pts, f };
    });
    const used = new Set();
    for (let hi = 0; hi < 2; hi++) {
      const prev = slots[hi].prevPalm;
      let best = -1, bd = Infinity;
      cand.forEach((c, ci) => {
        if (used.has(ci)) return;
        const d = prev ? Math.hypot(c.pts[0][0] - prev[0], c.pts[0][1] - prev[1]) : ci * 1000;
        if (d < bd) { bd = d; best = ci; }
      });
      if (best >= 0) {
        used.add(best);
        const c = cand[best], s = slots[hi];
        // smooth landmark positions to kill jitter
        if (s.smooth && bd < 200) c.pts = c.pts.map((p, j) => [s.smooth[j][0] + (p[0] - s.smooth[j][0]) * 0.55, s.smooth[j][1] + (p[1] - s.smooth[j][1]) * 0.55]);
        s.smooth = c.pts; s.prevPalm = c.pts[0];
        const cls = classify(c.f.wl && c.f.wl.length ? c.f.wl : c.f.lm);
        ids[hi] = cls ? cls.id : null;
        next[hi] = toHand(c.pts, false, ids[hi] ? MUDRAS[ids[hi]].color : null);
        if (DEBUG && hi === 0) {
          const ft = features(c.f.wl && c.f.wl.length ? c.f.wl : c.f.lm);
          $('#debug').hidden = false;
          $('#debug').textContent = `mudra: ${ids[hi] || '-'}\nratio: ${ft.ratio.map((r) => r.toFixed(2)).join(' ')}\nspread: ${ft.spread.toFixed(2)}  thumbOut: ${ft.thumbOut.toFixed(2)}\nthumbRing: ${ft.thumbRing.toFixed(2)}  thumbLen: ${ft.thumbLen.toFixed(2)}\nfx: ${JSON.stringify(magic.debugStats())}`;
        }
      } else { slots[hi].prevPalm = null; slots[hi].smooth = null; }
    }
    hands = next;
    magic.setHands(hands);
    noHandT = hands.some(Boolean) ? 0 : noHandT + dt;
    for (let hi = 0; hi < 2; hi++) step(hi, hands[hi], ids[hi], dt);
    if (slots[0].current === 'alapadma' && slots[1].current === 'alapadma') checkNataraja();
  }
  requestAnimationFrame(loop);
}

/* ---------------- touch mode ---------------- */
let selected = 'alapadma', touching = false, touchPt = null;
function startTouch() {
  mode = 'touch';
  running = false;
  magic.setVideo(false);
  enterHud();
  buildDock();
  coach();
  toast('Pick a mudra below, then touch and hold anywhere ✨', 3000);
}
function buildDock() {
  const d = $('#dock'); d.hidden = false; d.innerHTML = '';
  CORE.forEach((id) => {
    const m = MUDRAS[id], b = document.createElement('button');
    b.type = 'button'; b.style.setProperty('--c', m.color); b.setAttribute('aria-pressed', String(id === selected));
    b.appendChild(icon(id, 68)); b.insertAdjacentHTML('beforeend', `<small>${m.name}</small>`);
    b.addEventListener('click', () => { selected = id; buildDock(); coach(id); Sound.unlock(); });
    d.appendChild(b);
  });
  if (CORE.every((x) => unlocked.has(x))) {
    const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', MUDRAS.nataraja.color);
    b.innerHTML = '<span style="font-size:24px">🔥</span><small>Awaken</small>';
    b.addEventListener('click', () => checkNataraja(true));
    d.appendChild(b);
  }
}
function ghostHand(x, y, id, scale = 1) {
  const pose = POSES[id], S = 210 * scale;
  const pts = pose.map(([px, py]) => [x + (px - 0.5) * S, y - (py - 0.62) * S]);
  return toHand(pts, true, MUDRAS[id].color);
}
const stageEl = $('#stage');
function touchWorld(e) { return [e.clientX - innerWidth / 2, innerHeight / 2 - e.clientY]; }
stageEl.addEventListener('pointerdown', (e) => {
  if (mode !== 'touch') return;
  Sound.unlock();
  touching = true; touchPt = touchWorld(e); stageEl.setPointerCapture(e.pointerId);
  slots[0].cand = null; slots[0].candT = 0;
  if (!touchLoopOn) { touchLoopOn = true; requestAnimationFrame(touchLoop); }
});
stageEl.addEventListener('pointermove', (e) => { if (touching) touchPt = touchWorld(e); });
const endTouch = () => { touching = false; };
stageEl.addEventListener('pointerup', endTouch); stageEl.addEventListener('pointercancel', endTouch);
let touchLoopOn = false, tLast = performance.now();
function touchLoop(now) {
  const dt = Math.min(0.1, (now - tLast) / 1000); tLast = now;
  if (mode !== 'touch') { touchLoopOn = false; return; }
  if (touching && touchPt) {
    const h = ghostHand(touchPt[0], touchPt[1], selected);
    hands = [h, null]; magic.setHands(hands);
    step(0, h, selected, dt * 1.15);
  } else {
    hands = [null, null]; magic.setHands(hands);
    if (slots[0].current) endSpell(0);
  }
  requestAnimationFrame(touchLoop);
}

/* ---------------- screens ---------------- */
function enterHud() {
  Sound.unlock();
  $('#intro').classList.remove('is-on');
  $('#hud').classList.add('is-on');
  document.body.classList.add('playing');
  setMute();
  startCoach();
}
$('#go-cam').addEventListener('click', () => { setCollege($('#college').value); startCamera(); });
$('#go-touch').addEventListener('click', () => { setCollege($('#college').value); startTouch(); });
$('#back').addEventListener('click', () => {
  running = false; mode = null;
  if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
  magic.setVideo(false); hands = [null, null]; magic.setHands(hands);
  [0, 1].forEach((i) => { if (slots[i].current) endSpell(i, true); });
  $('#dock').hidden = true; $('#hud').classList.remove('is-on'); $('#intro').classList.add('is-on'); document.body.classList.remove('playing');
  clearInterval(coachTimer);
});
function setMute() { $('#mute').textContent = Sound.muted ? '🔇' : '🔊'; }
$('#mute').addEventListener('click', () => { Sound.toggle(); setMute(); });

/* ---------------- spell card ---------------- */
async function makeCard() {
  try { await Promise.all([document.fonts.load('80px "Rozha One"'), document.fonts.load('600 30px Poppins'), document.fonts.load('400 30px Poppins')]); } catch {}
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const id = lastShot.id, m = MUDRAS[id], shot = lastShot.canvas;
  x.fillStyle = '#05030c'; x.fillRect(0, 0, W, H);
  // shot, cover-cropped into the top 1300px
  const tw = W, th = 1300, sa = shot.width / shot.height, ta = tw / th;
  let sw = shot.width, sh = shot.height, sx = 0, sy = 0;
  if (sa > ta) { sw = sh * ta; sx = (shot.width - sw) / 2; } else { sh = sw / ta; sy = (shot.height - sh) / 2; }
  x.drawImage(shot, sx, sy, sw, sh, 0, 0, tw, th);
  const g = x.createLinearGradient(0, 900, 0, 1420); g.addColorStop(0, 'rgba(5,3,12,0)'); g.addColorStop(1, 'rgba(5,3,12,1)');
  x.fillStyle = g; x.fillRect(0, 900, W, 520);
  // ornate border
  x.strokeStyle = 'rgba(255,200,97,0.55)'; x.lineWidth = 3; x.strokeRect(36, 36, W - 72, H - 72);
  x.strokeStyle = 'rgba(255,200,97,0.25)'; x.lineWidth = 1.5; x.strokeRect(50, 50, W - 100, H - 100);
  for (const [cx, cy] of [[36, 36], [W - 36, 36], [36, H - 36], [W - 36, H - 36]]) { x.fillStyle = '#ffc861'; x.beginPath(); x.arc(cx, cy, 9, 0, Math.PI * 2); x.fill(); }
  // header
  x.textAlign = 'center'; x.fillStyle = 'rgba(255,240,220,0.85)'; x.font = '600 30px Poppins';
  x.fillText('M U D R A   M A G I C', W / 2, 120);
  // names
  const gold = x.createLinearGradient(0, 1250, 0, 1450); gold.addColorStop(0, '#fff1c4'); gold.addColorStop(0.5, '#ffc861'); gold.addColorStop(1, '#ff9a3c');
  x.shadowColor = m.color; x.shadowBlur = 40;
  x.fillStyle = gold; x.font = '230px "Rozha One"'; x.fillText(m.deva, W / 2, 1440);
  x.shadowBlur = 0;
  x.fillStyle = m.color; x.font = '70px "Rozha One"'; x.fillText(m.name.toUpperCase().split('').join(' '), W / 2, 1540);
  x.fillStyle = 'rgba(255,240,220,0.8)'; x.font = '400 36px Poppins'; x.fillText(`${m.meaning} · ${m.spell}`, W / 2, 1600);
  // stats
  const r = wall?.mudras?.[id];
  const rarity = r && wall.casters >= 20 ? `Only ${Math.max(1, Math.round(r.rarity * 100))}% of sorcerers have unlocked it` : `One of the first ${r && r.unlocked ? fmt(r.unlocked) : 'few'} sorcerers to unlock it`;
  x.fillStyle = '#fff'; x.font = '600 34px Poppins'; x.fillText(rarity, W / 2, 1680);
  if (college) { x.fillStyle = 'rgba(255,240,220,0.7)'; x.font = '400 32px Poppins'; x.fillText(`Cast for ${college}`, W / 2, 1730); }
  x.fillStyle = '#ffc861'; x.font = '600 34px Poppins'; x.fillText(`Can your hands do this? ✦ ${location.host}`, W / 2, 1810);
  // mudra icon
  const ic = icon(id, 170); x.globalAlpha = 0.95; x.drawImage(ic, W - 230, 150, 170, 170); x.globalAlpha = 1;
  return c;
}
let cardFile = null;
$('#card-btn').addEventListener('click', async () => {
  if (!lastShot) return;
  // if a spell is still glowing, capture this exact moment instead
  const live = slots.find((s) => s.current);
  if (live) lastShot = { id: live.current, canvas: await magic.snapshot() };
  const c = await makeCard();
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const url = URL.createObjectURL(blob);
  cardFile = new File([blob], `mudra-magic-${lastShot.id}.png`, { type: 'image/png' });
  $('#card-img').src = url; $('#card-dl').href = url; $('#card-dl').download = cardFile.name;
  $('#cardsheet').hidden = false;
});
$('#card-share').addEventListener('click', async () => {
  const m = MUDRAS[lastShot.id];
  const data = { files: [cardFile], title: 'Mudra Magic', text: `I cast ${m.name} (${m.deva}) with my bare hand ✨ Can yours? ${location.origin}` };
  if (navigator.canShare && navigator.canShare(data)) { try { await navigator.share(data); } catch {} }
  else { $('#card-dl').click(); toast('Saved! Post it and tag your friends ✨'); }
});

/* ---------------- test hooks (used by automated screenshots only) ---------------- */
window.__mm = {
  ghostCast(id, x = 0, y = -60, hold = 1500) {
    mode = 'touch'; enterHud(); selected = id; buildDock();
    touchPt = [x, y]; touching = true;
    if (!touchLoopOn) { touchLoopOn = true; requestAnimationFrame(touchLoop); }
    setTimeout(() => (touching = false), hold);
  },
};

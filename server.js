// Mudra Magic: dependency-free server. Serves /public and the live "Mudra Wall" API.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'wall.json');
const PUBLIC = path.join(__dirname, 'public');
const MUDRAS = ['pataka', 'alapadma', 'shikhara', 'mayura', 'mushti', 'nataraja'];

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- storage ---------------- */
let db = { casts: 0, casters: {}, mudras: {}, colleges: {}, feed: [] };
try {
  const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (raw && typeof raw.casts === 'number') db = Object.assign(db, raw);
} catch { /* first start */ }
for (const m of MUDRAS) if (!db.mudras[m]) db.mudras[m] = { casts: 0, by: {} };

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), (err) => { if (!err) fs.rename(tmp, DB_FILE, () => {}); });
  }, 1500);
}

/* ---------------- helpers ---------------- */
const BAD = /(fuck|shit|bitch|chut|madarc|bhosd|bsdk|lund|gand|randi|porn|sex|nigg|cunt|dick|asshole)/i;
function cleanCollege(s) {
  if (typeof s !== 'string') return null;
  s = s.normalize('NFKC').replace(/[^\p{L}\p{N} .,&()'\-]/gu, '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 64 || !/\p{L}/u.test(s) || BAD.test(s)) return null;
  return s;
}
const keyOf = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const validSid = (s) => typeof s === 'string' && /^[a-z0-9]{12,40}$/i.test(s);

function wallState() {
  const casters = Object.keys(db.casters).length || 0;
  const mudras = {};
  for (const m of MUDRAS) {
    const u = Object.keys(db.mudras[m].by).length;
    mudras[m] = { casts: db.mudras[m].casts, unlocked: u, rarity: casters ? u / casters : 0 };
  }
  const colleges = Object.values(db.colleges)
    .map((c) => ({ name: c.name, key: c.key, casts: c.casts, casters: Object.keys(c.by).length }))
    .sort((a, b) => b.casts - a.casts).slice(0, 25);
  return { casts: db.casts, casters, mudras, colleges, feed: db.feed.slice(0, 12), now: Date.now() };
}

/* ---------------- rate limit ---------------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

/* ---------------- http ---------------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.ico': 'image/x-icon' };
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2048) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/api/wall' && req.method === 'GET') return send(res, 200, wallState());

  if (p === '/api/cast' && req.method === 'POST') {
    const ip = ipOf(req);
    if (limited(ip, 400, 3600e3)) return send(res, 429, { error: 'So much magic! Take a breath and try again soon.' });
    const b = await readBody(req);
    if (!b || !validSid(b.sid) || !MUDRAS.includes(b.mudra)) return send(res, 400, { error: 'Bad request' });
    if (limited('s:' + b.sid, 120, 600e3)) return send(res, 429, { error: 'Slow down, sorcerer!' });
    const now = Date.now();
    const first = !db.mudras[b.mudra].by[b.sid];
    db.casts += 1;
    db.casters[b.sid] = now;
    db.mudras[b.mudra].casts += 1;
    db.mudras[b.mudra].by[b.sid] = 1;
    const college = cleanCollege(b.college);
    if (college) {
      const k = keyOf(college);
      const c = db.colleges[k] || (db.colleges[k] = { key: k, name: college, casts: 0, by: {} });
      c.casts += 1; c.by[b.sid] = 1;
    }
    if (first || b.mudra === 'nataraja') {
      db.feed.unshift({ mudra: b.mudra, college: college || null, t: now });
      db.feed = db.feed.slice(0, 40);
    }
    save();
    return send(res, 200, { ok: true, first, wall: wallState() });
  }

  if (p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });

  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    else if (err) file = path.join(PUBLIC, 'index.html');
    fs.readFile(file, (e2, data) => {
      if (e2) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(file);
      const heavy = file.includes(path.sep + 'vendor' + path.sep) || file.includes(path.sep + 'models' + path.sep);
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': heavy ? 'public, max-age=604800' : 'no-cache' });
      res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Mudra Magic on :${PORT}`));

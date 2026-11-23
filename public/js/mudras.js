/* Mudra Magic: mudra definitions, canonical poses and the rule-based classifier.
   Landmark indices follow MediaPipe Hands: 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20. */

export const MUDRAS = {
  pataka: {
    id: 'pataka', name: 'Pataka', deva: 'पताका', meaning: 'The Flag',
    spell: 'Storm of Vayu', desc: 'In dance, Pataka paints clouds, wind and waves. Here it calls lightning and a roaring wind.',
    how: 'Flat palm, all four fingers straight and pressed together, thumb folded in.',
    color: '#6fd6ff', color2: '#ffffff', note: 2, // Re
  },
  alapadma: {
    id: 'alapadma', name: 'Alapadma', deva: 'अलपद्म', meaning: 'The Bloomed Lotus',
    spell: 'Lotus of Light', desc: 'Alapadma is a lotus in full bloom. Open it and a lotus of light unfolds in your palm.',
    how: 'Open palm, all five fingers spread wide like petals.',
    color: '#ff7ac8', color2: '#ffe3a3', note: 0, // Sa
  },
  shikhara: {
    id: 'shikhara', name: 'Shikhara', deva: 'शिखर', meaning: 'The Spire',
    spell: 'Spire of Agni', desc: 'Shikhara is a peak, a pillar. Raise it and a pillar of fire climbs from your thumb.',
    how: 'Make a fist and point your thumb straight up.',
    color: '#ff8a1f', color2: '#ffe066', note: 4, // Pa
  },
  mayura: {
    id: 'mayura', name: 'Mayura', deva: 'मयूर', meaning: 'The Peacock',
    spell: 'Peacock’s Crown', desc: 'Mayura is the peacock. Touch thumb to ring finger and a royal fan of feathers opens above you.',
    how: 'Touch your thumb tip to your ring-finger tip. Keep the other three fingers straight.',
    color: '#22e0c8', color2: '#3b6bff', note: 5, // Dha
  },
  mushti: {
    id: 'mushti', name: 'Mushti', deva: 'मुष्टि', meaning: 'The Fist',
    spell: 'Earthshatter', desc: 'Mushti means steadiness and strength. Hold the fist to charge it, then open to shatter the ground.',
    how: 'Close a tight fist with your thumb wrapped over your fingers.',
    color: '#ffc23d', color2: '#ff4d2e', note: 3, // Ma
  },
  nataraja: {
    id: 'nataraja', name: 'Nataraja', deva: 'नटराज', meaning: 'Lord of the Dance',
    spell: 'Cosmic Dance', desc: 'Master all five mudras to awaken the cosmic dance: a blazing ring of fire, the prabha mandala.',
    how: 'Unlock all five mudras, then raise Alapadma with BOTH hands (or tap “Awaken” in touch mode).',
    color: '#ff5a1f', color2: '#ffd75e', note: 7, secret: true,
  },
};
export const CORE = ['pataka', 'alapadma', 'shikhara', 'mayura', 'mushti'];

/* Canonical poses (normalised image coords, palm facing camera, fingers up). Used for the
   guide icons and the touch-mode ghost hand. */
const OPEN = [[0.50, 0.95], [0.37, 0.86], [0.27, 0.76], [0.20, 0.66], [0.14, 0.57], [0.38, 0.55], [0.34, 0.40], [0.31, 0.30], [0.28, 0.21], [0.50, 0.53], [0.50, 0.36], [0.50, 0.25], [0.50, 0.15], [0.61, 0.55], [0.65, 0.39], [0.68, 0.29], [0.71, 0.20], [0.71, 0.60], [0.77, 0.48], [0.81, 0.40], [0.85, 0.32]];
export const POSES = {
  alapadma: OPEN,
  pataka: [[0.50, 0.95], [0.40, 0.86], [0.36, 0.77], [0.40, 0.70], [0.45, 0.65], [0.40, 0.55], [0.40, 0.39], [0.40, 0.29], [0.40, 0.20], [0.48, 0.54], [0.48, 0.37], [0.48, 0.26], [0.48, 0.16], [0.56, 0.55], [0.56, 0.39], [0.56, 0.29], [0.56, 0.21], [0.63, 0.58], [0.64, 0.45], [0.64, 0.37], [0.64, 0.30]],
  shikhara: [[0.50, 0.95], [0.40, 0.86], [0.34, 0.74], [0.33, 0.58], [0.33, 0.42], [0.40, 0.58], [0.43, 0.48], [0.46, 0.56], [0.45, 0.63], [0.50, 0.57], [0.52, 0.47], [0.54, 0.56], [0.53, 0.64], [0.59, 0.59], [0.61, 0.50], [0.62, 0.58], [0.61, 0.65], [0.67, 0.63], [0.69, 0.55], [0.69, 0.62], [0.67, 0.67]],
  mushti: [[0.50, 0.95], [0.40, 0.86], [0.35, 0.76], [0.40, 0.66], [0.48, 0.62], [0.40, 0.58], [0.43, 0.48], [0.46, 0.56], [0.45, 0.63], [0.50, 0.57], [0.52, 0.47], [0.54, 0.56], [0.53, 0.64], [0.59, 0.59], [0.61, 0.50], [0.62, 0.58], [0.61, 0.65], [0.67, 0.63], [0.69, 0.55], [0.69, 0.62], [0.67, 0.67]],
  mayura: [[0.50, 0.95], [0.38, 0.86], [0.32, 0.76], [0.38, 0.66], [0.50, 0.58], [0.38, 0.55], [0.35, 0.40], [0.33, 0.30], [0.31, 0.21], [0.50, 0.53], [0.50, 0.36], [0.50, 0.25], [0.50, 0.15], [0.61, 0.55], [0.60, 0.44], [0.56, 0.52], [0.51, 0.58], [0.71, 0.60], [0.76, 0.48], [0.79, 0.40], [0.82, 0.32]],
};
POSES.nataraja = OPEN;
export const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

/* ---------------- classifier ---------------- */
const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];

/** L: 21 points {x,y,z} in any consistent metric space (MediaPipe world landmarks preferred). */
export function features(L) {
  const d = (a, b) => Math.hypot(L[a].x - L[b].x, L[a].y - L[b].y, (L[a].z || 0) - (L[b].z || 0));
  const palm = d(0, 9) || 1e-6;
  const ratio = FINGERS.map(([m, p, , t]) => d(t, 0) / Math.max(1e-6, d(p, 0)));
  const g = (a, b) => d(a, b) / palm;
  return {
    palm,
    ratio,                                        // >1.15 extended, <1.0 curled
    spread: (g(8, 12) + g(12, 16) + g(16, 20)) / 3,
    thumbOut: g(4, 5),
    thumbFar: Math.min(g(4, 6), g(4, 10)),
    thumbRing: g(4, 16),
    thumbIndex: g(4, 8),
    thumbLen: d(4, 0) / Math.max(1e-6, d(2, 0)),
  };
}

/** Returns { id, score } for the best matching mudra, or null. */
export function classify(L) {
  const f = features(L);
  const ext = f.ratio.map((r) => r > 1.17);
  const curl = f.ratio.map((r) => r < 1.02);
  const allExt = ext.every(Boolean), allCurl = curl.every(Boolean);
  const c = [];
  if (allCurl) {
    // A raised thumb is long relative to its base; a thumb wrapped over the fist is short.
    if (f.thumbLen > 1.62) c.push({ id: 'shikhara', score: Math.min(1, 0.6 + (f.thumbLen - 1.62)) });
    else if (f.thumbLen < 1.52) c.push({ id: 'mushti', score: Math.min(1, 0.6 + (1.52 - f.thumbLen)) });
  }
  if (ext[0] && ext[1] && ext[3] && f.thumbRing < 0.38 && f.ratio[2] < 1.3) {
    c.push({ id: 'mayura', score: Math.min(1, 0.65 + (0.38 - f.thumbRing)) });
  }
  if (allExt) {
    if (f.spread > 0.36 && f.thumbOut > 0.5 && f.thumbRing > 0.45) c.push({ id: 'alapadma', score: Math.min(1, 0.6 + (f.spread - 0.36)) });
    else if (f.spread < 0.28 && f.thumbRing > 0.3) c.push({ id: 'pataka', score: Math.min(1, 0.6 + (0.28 - f.spread)) });
  }
  if (!c.length) return null;
  c.sort((a, b) => b.score - a.score);
  return c[0];
}

/** Draw a glowing skeleton icon of a pose onto a 2D canvas. */
export function drawPoseIcon(canvas, poseId, color) {
  const pose = POSES[poseId];
  const x = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  x.clearRect(0, 0, W, H);
  const P = pose.map(([px, py]) => [px * W, py * H]);
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.shadowColor = color; x.shadowBlur = W * 0.08;
  x.strokeStyle = color; x.lineWidth = W * 0.035;
  x.beginPath();
  for (const [a, b] of BONES) { x.moveTo(P[a][0], P[a][1]); x.lineTo(P[b][0], P[b][1]); }
  x.stroke();
  x.shadowBlur = W * 0.05; x.fillStyle = '#fff';
  for (const [i, p] of P.entries()) { x.beginPath(); x.arc(p[0], p[1], W * (i % 4 === 0 && i ? 0.028 : 0.02), 0, Math.PI * 2); x.fill(); }
}

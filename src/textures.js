import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Plum blossoms: near-white petals, tinted pink by vertex colors.
export function blossomTexture(rng) {
  const [c, g] = makeCanvas(256, 256);
  const flowers = [];
  for (let k = 0; k < 9; k++) {
    flowers.push({ x: 36 + rng.next() * 184, y: 36 + rng.next() * 184, r: 17 + rng.next() * 15, rot: rng.next() * Math.PI });
  }
  for (const f of flowers) {
    for (let p = 0; p < 5; p++) {
      const a = f.rot + (p * Math.PI * 2) / 5;
      const px = f.x + Math.cos(a) * f.r * 0.52;
      const py = f.y + Math.sin(a) * f.r * 0.52;
      const grd = g.createRadialGradient(px, py, 0, px, py, f.r * 0.62);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.65, '#f8eef0');
      grd.addColorStop(1, '#e4c6cd');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(px, py, f.r * 0.55, f.r * 0.46, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#b84a62';
    g.beginPath();
    g.arc(f.x, f.y, f.r * 0.22, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f2cf78';
    g.lineWidth = 1.4;
    for (let s = 0; s < 10; s++) {
      const a = (s / 10) * Math.PI * 2 + rng.next() * 0.3;
      g.beginPath();
      g.moveTo(f.x, f.y);
      g.lineTo(f.x + Math.cos(a) * f.r * 0.4, f.y + Math.sin(a) * f.r * 0.4);
      g.stroke();
    }
  }
  for (let k = 0; k < 7; k++) {
    g.fillStyle = rng.chance(0.5) ? '#d9708a' : '#e999ab';
    g.beginPath();
    g.arc(20 + rng.next() * 216, 20 + rng.next() * 216, 5 + rng.next() * 4, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c);
}

// Pine needle tufts (greyscale-ish, hue comes from vertex colors).
export function needleTexture(rng) {
  const [c, g] = makeCanvas(256, 256);
  g.lineCap = 'round';
  for (let t = 0; t < 34; t++) {
    const ang = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.next()) * 92;
    const cx = 128 + Math.cos(ang) * rad;
    const cy = 128 + Math.sin(ang) * rad;
    const n = 16 + Math.floor(rng.next() * 8);
    for (let k = 0; k < n; k++) {
      const a = rng.next() * Math.PI * 2;
      const len = 14 + rng.next() * 22;
      const l = 150 + Math.floor(rng.next() * 105);
      g.strokeStyle = `rgb(${l - 10},${l},${l - 25})`;
      g.lineWidth = 2 + rng.next() * 1.4;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.stroke();
    }
  }
  return toTexture(c);
}

// Small broad leaves cluster for shrubs and vines.
export function leafTexture(rng) {
  const [c, g] = makeCanvas(256, 256);
  for (let k = 0; k < 46; k++) {
    const ang = rng.next() * Math.PI * 2;
    const rad = Math.sqrt(rng.next()) * 96;
    const x = 128 + Math.cos(ang) * rad;
    const y = 128 + Math.sin(ang) * rad;
    const rot = rng.next() * Math.PI * 2;
    const L = 15 + rng.next() * 11;
    const l = 165 + Math.floor(rng.next() * 90);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const grd = g.createLinearGradient(-L, 0, L, 0);
    grd.addColorStop(0, `rgb(${l - 40},${l - 25},${l - 50})`);
    grd.addColorStop(1, `rgb(${l},${l},${l - 20})`);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-L, 0);
    g.quadraticCurveTo(0, -L * 0.55, L, 0);
    g.quadraticCurveTo(0, L * 0.55, -L, 0);
    g.fill();
    g.strokeStyle = 'rgba(70,80,60,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-L, 0);
    g.lineTo(L * 0.9, 0);
    g.stroke();
    g.restore();
  }
  return toTexture(c);
}

// A single fern frond, base at the bottom (v = 0), tip at the top (v = 1).
export function fernTexture(rng) {
  const [c, g] = makeCanvas(128, 512);
  const spineX = (t) => 64 + Math.sin(t * 2.4) * 6;
  g.strokeStyle = '#c7cfb5';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = spineX(t), y = 508 - t * 496;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  for (let i = 2; i < 44; i++) {
    const t = i / 46;
    const y = 508 - t * 496;
    const x = spineX(t);
    const len = 56 * Math.pow(1 - t, 0.75) * Math.min(1, t * 6) + 4;
    for (const side of [-1, 1]) {
      const l = 175 + Math.floor(rng.next() * 70);
      g.fillStyle = `rgb(${l - 20},${l},${l - 40})`;
      g.save();
      g.translate(x, y);
      g.rotate(side * (1.05 - t * 0.3));
      g.beginPath();
      g.ellipse(0, -len / 2, 4.6 * (1 - t * 0.5) + 1.5, len / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  return toTexture(c);
}

// Grass tuft: blades rising from the bottom edge.
export function grassTexture(rng) {
  const [c, g] = makeCanvas(256, 256);
  for (let k = 0; k < 46; k++) {
    const x0 = 128 + rng.gauss() * 48;
    const h = 90 + rng.next() * 150;
    const lean = rng.gauss() * 40;
    const w = 3 + rng.next() * 4;
    const l = 160 + Math.floor(rng.next() * 90);
    g.fillStyle = `rgb(${l - 15},${l},${l - 45})`;
    g.beginPath();
    g.moveTo(x0 - w, 256);
    g.quadraticCurveTo(x0 + lean * 0.3, 256 - h * 0.6, x0 + lean, 256 - h);
    g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.4, 256 - h * 0.6, x0 + w, 256);
    g.fill();
  }
  return toTexture(c);
}

// Cumulus puff for billboards: dense billowy top, flat shaded underside.
export function cloudTexture(rng) {
  const W = 512, H = 256;
  const [c, g] = makeCanvas(W, H);
  const blobs = [];
  for (let k = 0; k < 46; k++) {
    let x = W / 2 + rng.gauss() * 105;
    const spread = 1 - Math.min(1, Math.abs(x - W / 2) / 250);
    const r = (26 + rng.next() * 40) * (0.5 + spread * 0.7);
    x = Math.min(W - r - 6, Math.max(r + 6, x));
    let y = 190 - r * 0.6 - Math.abs(rng.gauss()) * 50 * spread;
    y = Math.max(r + 6, y);
    blobs.push({ x, y, r });
  }
  // body
  for (const b of blobs) {
    const grd = g.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fill();
  }
  // shading: lit from upper-left, cool shadow underneath and on the right
  g.globalCompositeOperation = 'source-atop';
  for (const b of blobs) {
    const grd = g.createRadialGradient(b.x + b.r * 0.35, b.y + b.r * 0.45, 0, b.x + b.r * 0.35, b.y + b.r * 0.45, b.r * 1.1);
    grd.addColorStop(0, 'rgba(140,158,176,0.22)');
    grd.addColorStop(1, 'rgba(140,158,176,0)');
    g.fillStyle = grd;
    g.fillRect(b.x - b.r * 2, b.y - b.r * 2, b.r * 4, b.r * 4);
  }
  const sh = g.createLinearGradient(0, 120, 0, 230);
  sh.addColorStop(0, 'rgba(150,166,184,0)');
  sh.addColorStop(1, 'rgba(138,156,176,0.55)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);
  // soft bottom fade so puffs melt into the layer below, plus a guaranteed soft border
  g.globalCompositeOperation = 'destination-out';
  for (const [x0, y0, x1, y1] of [[0, 0, 24, 0], [W, 0, W - 24, 0], [0, 0, 0, 16]]) {
    const e = g.createLinearGradient(x0, y0, x1, y1);
    e.addColorStop(0, 'rgba(0,0,0,1)');
    e.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = e;
    g.fillRect(0, 0, W, H);
  }
  const fade = g.createLinearGradient(0, 175, 0, 256);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);
  return toTexture(c);
}

// Weathered red shrine banner with a torn hem and a faded talisman.
export function bannerTexture(rng) {
  const [c, g] = makeCanvas(128, 512);
  g.fillStyle = '#8a1d19';
  g.fillRect(0, 0, 128, 512);
  for (let k = 0; k < 900; k++) {
    const l = rng.next();
    g.fillStyle = l < 0.5 ? `rgba(40,5,5,${0.05 + rng.next() * 0.12})` : `rgba(200,90,70,${0.03 + rng.next() * 0.08})`;
    g.fillRect(rng.next() * 128, rng.next() * 512, 2 + rng.next() * 6, 2 + rng.next() * 14);
  }
  // folds
  for (let x = 0; x < 128; x += 2) {
    const v = Math.sin(x * 0.11) * 0.5 + Math.sin(x * 0.27 + 1.3) * 0.3;
    g.fillStyle = v > 0 ? `rgba(255,140,120,${v * 0.08})` : `rgba(20,0,0,${-v * 0.18})`;
    g.fillRect(x, 0, 2, 512);
  }
  // hems
  g.fillStyle = 'rgba(30,5,5,0.55)';
  g.fillRect(0, 0, 128, 18);
  g.fillStyle = 'rgba(210,150,80,0.35)';
  g.fillRect(0, 18, 128, 3);
  // talisman glyph
  g.strokeStyle = 'rgba(25,8,8,0.55)';
  g.lineCap = 'round';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(64, 70); g.lineTo(64, 300);
  g.moveTo(36, 110); g.lineTo(92, 110);
  g.moveTo(42, 160); g.quadraticCurveTo(64, 140, 88, 168);
  g.moveTo(40, 210); g.lineTo(88, 200);
  g.moveTo(48, 250); g.quadraticCurveTo(70, 280, 52, 300);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 340, 18, 0, Math.PI * 2);
  g.stroke();
  // torn hem and holes
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(0, 512);
  let x = 0;
  while (x <= 128) {
    const y = 430 + rng.next() * 70 - (x > 40 && x < 80 ? 40 * rng.next() : 0);
    g.lineTo(x, y);
    x += 5 + rng.next() * 9;
  }
  g.lineTo(128, 512);
  g.closePath();
  g.fill();
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.ellipse(10 + rng.next() * 108, 200 + rng.next() * 220, 2 + rng.next() * 5, 4 + rng.next() * 10, rng.next(), 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c);
}

export function petalTexture() {
  const [c, g] = makeCanvas(64, 64);
  const grd = g.createRadialGradient(32, 40, 2, 32, 34, 30);
  grd.addColorStop(0, '#fff6f8');
  grd.addColorStop(0.7, '#f6c4d0');
  grd.addColorStop(1, '#e9a2b5');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(32, 60);
  g.bezierCurveTo(6, 40, 10, 8, 28, 6);
  g.lineTo(32, 12);
  g.lineTo(36, 6);
  g.bezierCurveTo(54, 8, 58, 40, 32, 60);
  g.fill();
  return toTexture(c);
}

export function softDotTexture() {
  const [c, g] = makeCanvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

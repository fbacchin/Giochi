"use strict";
/* ============================================================
   ASSALTO ALLA MORTE NERA
   Fan game arcade ispirato a Guerre Stellari.
   Grafica vettoriale disegnata su canvas, audio sintetizzato
   con WebAudio: nessuna risorsa esterna.
   ============================================================ */

// ---------------------------------------------------------- canvas
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1, MINWH = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  MINWH = Math.min(W, H);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------- utilità
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poly(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function text(str, x, y, size, color, align, bold) {
  ctx.fillStyle = color;
  ctx.font = (bold ? "bold " : "") + size + "px 'Courier New', monospace";
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}

const fmtScore = (n) => String(Math.max(0, Math.floor(n))).padStart(6, "0");
const NARROW = () => W < 700; // schermi stretti (telefono in verticale)

// testo con a capo automatico dentro maxW; ritorna il numero di righe
function textWrap(str, x, y, size, color, align, bold, maxW, lineH) {
  ctx.font = (bold ? "bold " : "") + size + "px 'Courier New', monospace";
  const words = String(str).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (ctx.measureText(trial).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = trial;
  }
  if (cur) lines.push(cur);
  const lh = lineH || size * 1.3;
  lines.forEach((ln, i) => text(ln, x, y + i * lh, size, color, align, bold));
  return lines.length;
}

// ---------------------------------------------------------- audio (WebAudio sintetizzato)
const AudioFX = {
  ctx: null, master: null, muted: false, noiseBuf: null, humOsc: null, humGain: null,

  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 1.2);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch (e) { /* niente audio, il gioco continua */ }
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },

  blip(f0, f1, dur, type, vol) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  },

  noise(dur, vol, f0, f1) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const flt = this.ctx.createBiquadFilter();
      flt.type = "lowpass";
      flt.frequency.setValueAtTime(f0, t);
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.05);
    } catch (e) {}
  },

  laser()      { this.blip(1500, 320, 0.11, "sawtooth", 0.16); },
  enemyLaser() { this.blip(760, 190, 0.16, "square", 0.10); },
  boom()       { this.noise(0.5, 0.5, 2400, 120); this.blip(220, 40, 0.4, "triangle", 0.25); },
  hit()        { this.blip(300, 70, 0.25, "triangle", 0.3); this.noise(0.2, 0.25, 1600, 300); },
  torpedo()    { this.blip(180, 70, 0.6, "sine", 0.3); this.noise(0.45, 0.12, 900, 200); },
  lock()       { this.blip(880, 880, 0.07, "square", 0.12); },
  warn()       { this.blip(520, 300, 0.09, "square", 0.09); },
  force()      { this.blip(392, 392, 0.6, "sine", 0.12); this.blip(587, 587, 0.85, "sine", 0.08); },
  swing()      { this.noise(0.18, 0.22, 3200, 500); },
  clash()      { this.blip(1250, 950, 0.16, "square", 0.18); this.blip(1900, 1500, 0.2, "sawtooth", 0.1); this.noise(0.14, 0.28, 4200, 900); },
  thud()       { this.blip(170, 55, 0.22, "triangle", 0.34); this.noise(0.12, 0.2, 900, 250); },
  breath()     { this.noise(0.55, 0.2, 850, 280); },
  forceP()     { this.blip(70, 150, 0.7, "sine", 0.3); this.noise(0.5, 0.18, 400, 1800); },
  ignite()     { this.blip(90, 820, 0.4, "sawtooth", 0.18); this.noise(0.25, 0.1, 500, 2400); },
  throwW()     { this.noise(0.5, 0.2, 2400, 700); this.blip(300, 170, 0.5, "square", 0.08); },
  sting()      { this.blip(98, 62, 0.9, "sawtooth", 0.28); this.blip(147, 96, 1.1, "sawtooth", 0.18); },
  land()       { this.blip(150, 70, 0.12, "triangle", 0.16); },
  hitTick()    { this.blip(1100, 600, 0.05, "square", 0.09); },
  wave()       { this.blip(440, 660, 0.18, "square", 0.14); },
  bigBoom() {
    this.noise(2.8, 0.8, 3200, 60);
    this.blip(120, 24, 2.2, "sine", 0.5);
    this.blip(90, 30, 2.6, "triangle", 0.3);
  },

  humStart() {
    if (!this.ctx || this.humOsc) return;
    try {
      this.humOsc = this.ctx.createOscillator();
      this.humGain = this.ctx.createGain();
      this.humOsc.type = "sawtooth";
      this.humOsc.frequency.value = 52;
      this.humGain.gain.value = 0.028;
      this.humOsc.connect(this.humGain); this.humGain.connect(this.master);
      this.humOsc.start();
    } catch (e) { this.humOsc = null; }
  },
  humStop() {
    try { if (this.humOsc) { this.humOsc.stop(); } } catch (e) {}
    this.humOsc = null; this.humGain = null;
  },
};

// ---------------------------------------------------------- input
const keys = {};
const pressedCodes = new Set();
let touchTapped = false;
let hasTouch = false;

const GAME_KEYS = ["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

window.addEventListener("keydown", (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  AudioFX.init();
  if (!e.repeat) {
    pressedCodes.add(e.code);
    if (e.code === "KeyM") AudioFX.setMuted(!AudioFX.muted);
  }
  keys[e.code] = true;
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });
window.addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
  if (G.screen === "space" || G.screen === "trench") G.paused = true;
});

const popKey = (code) => (pressedCodes.has(code) ? (pressedCodes.delete(code), true) : false);
const anyStartPressed = () => {
  const p = popKey("Enter") || popKey("Space") || touchTapped;
  touchTapped = false;
  return p;
};

// Touch: trascina a sinistra per muoverti, pulsanti a destra per sparare.
const touchState = { moveId: null, mx: 0, my: 0, fireId: null, torpId: null };
const fireBtn = () => ({ x: W - 74, y: H - 88, r: 46 });
const torpBtn = () => ({ x: W - 74, y: H - 205, r: 40 });

function inCircle(x, y, c) { return dist2(x, y, c.x, c.y) < c.r * c.r; }

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  hasTouch = true;
  AudioFX.init();
  if (G.paused || G.screen === "title" || G.screen === "crawl" ||
      G.screen === "victory" || G.screen === "gameover") {
    touchTapped = true;
  }
  for (const t of e.changedTouches) {
    if (inCircle(t.clientX, t.clientY, fireBtn())) {
      touchState.fireId = t.identifier;
      if (G.screen === "duel") pressedCodes.add("Space"); // tap = fendente / martella nei lock
    } else if ((G.screen === "trench" || G.screen === "duel") && inCircle(t.clientX, t.clientY, torpBtn())) {
      touchState.torpId = t.identifier;
      if (G.screen === "trench") pressedCodes.add("KeyX");
    } else if (t.clientX < W * 0.62 && touchState.moveId === null) {
      touchState.moveId = t.identifier;
      touchState.mx = t.clientX; touchState.my = t.clientY;
    } else touchState.fireId = t.identifier;
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touchState.moveId) {
      const dx = t.clientX - touchState.mx;
      const dy = t.clientY - touchState.my;
      touchState.mx = t.clientX; touchState.my = t.clientY;
      onTouchDrag(dx, dy);
    }
  }
}, { passive: false });

function touchEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touchState.moveId) touchState.moveId = null;
    if (t.identifier === touchState.fireId) touchState.fireId = null;
    if (t.identifier === touchState.torpId) touchState.torpId = null;
  }
}
canvas.addEventListener("touchend", touchEnd, { passive: false });
canvas.addEventListener("touchcancel", touchEnd, { passive: false });

// Un click del mouse equivale a INVIO nelle schermate di menu (e sblocca l'audio).
canvas.addEventListener("mousedown", () => {
  AudioFX.init();
  if (G.paused || G.screen === "title" || G.screen === "crawl" ||
      G.screen === "victory" || G.screen === "gameover") {
    touchTapped = true;
  }
});

function onTouchDrag(dx, dy) {
  if (G.screen === "space" && space) {
    space.player.x = clamp(space.player.x + dx * 1.5, 22, W - 22);
    space.player.y = clamp(space.player.y + dy * 1.5, H * 0.35, H - 34);
  } else if (G.screen === "trench" && trench) {
    trench.ship.x = clamp(trench.ship.x + dx * 0.005, -0.8, 0.8);
    trench.ship.y = clamp(trench.ship.y - dy * 0.005, 0.08, 1.12);
  } else if (G.screen === "duel" && duel) {
    duel.luke.x = clamp(duel.luke.x + dx * 1.4, W * 0.06, W * 0.94);
    duel.luke.moving = 0.15;
    if (dy < -16) pressedCodes.add("ArrowUp"); // trascina in su = salto
  }
}

const fireHeld = () => keys["Space"] || touchState.fireId !== null;
const blockHeld = () =>
  keys["ArrowDown"] || keys["KeyS"] || keys["KeyX"] ||
  keys["ControlLeft"] || keys["ControlRight"] || touchState.torpId !== null;

// ---------------------------------------------------------- stato globale
const G = {
  screen: "title",       // title | crawl | space | approach | trench | vseq | victory | gameover
  score: 0,
  hi: 0,
  paused: false,
  shake: 0,
  msg: null, msgT: 0, msgDur: 1,
  overReason: "",
  spaceStartScore: 0,
  trenchStartScore: 0,
  duelStartScore: 0,
  spacePhase: "xwing",
  diedIn: "space",
  time: 0,
};

try { G.hi = parseInt(localStorage.getItem("mortenera-hi") || "0", 10) || 0; } catch (e) {}
function saveHi() {
  if (G.score > G.hi) {
    G.hi = G.score;
    try { localStorage.setItem("mortenera-hi", String(G.hi)); } catch (e) {}
  }
}

function showMsg(m, dur) {
  G.msg = m; G.msgDur = dur || 2.2; G.msgT = G.msgDur;
}

// ---------------------------------------------------------- campo stellare
let stars = [];
function makeStars() {
  stars = [];
  const n = Math.floor((W * H) / 4200);
  for (let i = 0; i < n; i++) {
    stars.push({ x: Math.random(), y: Math.random(), z: rand(0.25, 1), tw: rand(0, TAU) });
  }
}
makeStars();
window.addEventListener("resize", makeStars);

function drawStars(scrollY, speedMul) {
  for (const s of stars) {
    const sy = ((s.y + scrollY * s.z * (speedMul || 1)) % 1 + 1) % 1;
    const a = 0.35 + 0.65 * s.z * (0.75 + 0.25 * Math.sin(G.time * 2 + s.tw));
    ctx.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
    const sz = s.z > 0.8 ? 2 : 1;
    ctx.fillRect(s.x * W, sy * H, sz, sz);
  }
}

// ---------------------------------------------------------- Morte Nera
const dsFeatures = (() => {
  const rng = mulberry32(20771977);
  const out = [];
  for (let i = 0; i < 150; i++) {
    let x, y;
    do { x = rng() * 2 - 1; y = rng() * 2 - 1; } while (x * x + y * y > 0.92);
    out.push({ x, y, w: 0.015 + rng() * 0.05, h: 0.008 + rng() * 0.03, a: 0.08 + rng() * 0.2 });
  }
  return out;
})();

function drawDeathStar(x, y, r, alpha, dmg) {
  if (r < 2 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, "#aeb6c2");
  g.addColorStop(0.55, "#767f8d");
  g.addColorStop(1, "#3a414c");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();

  // pannellature superficiali
  for (const f of dsFeatures) {
    ctx.fillStyle = "rgba(20,24,32," + f.a.toFixed(3) + ")";
    ctx.fillRect(f.x * r, f.y * r, Math.max(1, f.w * r), Math.max(1, f.h * r));
  }
  // trincea equatoriale
  ctx.fillStyle = "rgba(18,22,30,0.85)";
  ctx.fillRect(-r, r * 0.02, 2 * r, Math.max(2, r * 0.07));
  ctx.fillStyle = "rgba(150,160,175,0.25)";
  ctx.fillRect(-r, r * 0.015, 2 * r, 1.5);

  // superlaser
  const dx = -r * 0.38, dy = -r * 0.32, dr = r * 0.235;
  const dg = ctx.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, dr * 0.1, dx, dy, dr);
  dg.addColorStop(0, "#4d5560");
  dg.addColorStop(1, "#2a3039");
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.arc(dx, dy, dr, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(190,200,215,0.5)";
  ctx.lineWidth = Math.max(1, r * 0.008);
  ctx.beginPath(); ctx.arc(dx, dy, dr, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(dx, dy, dr * 0.55, 0, TAU); ctx.stroke();
  ctx.fillStyle = "rgba(200,210,225,0.7)";
  ctx.beginPath(); ctx.arc(dx, dy, Math.max(1.2, dr * 0.09), 0, TAU); ctx.fill();

  // ombra del terminatore
  const sh = ctx.createRadialGradient(r * 0.55, r * 0.55, r * 0.2, 0, 0, r * 1.25);
  sh.addColorStop(0, "rgba(0,0,0,0.55)");
  sh.addColorStop(0.5, "rgba(0,0,0,0.12)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);

  // lampi di danno durante l'esplosione finale
  if (dmg > 0) {
    ctx.strokeStyle = "rgba(255,240,180," + Math.min(1, dmg).toFixed(2) + ")";
    ctx.lineWidth = Math.max(1.5, r * 0.012);
    const rng = mulberry32(77);
    for (let i = 0; i < 7; i++) {
      const a0 = rng() * TAU;
      ctx.beginPath();
      let px = Math.cos(a0) * r * 0.15, py = Math.sin(a0) * r * 0.15;
      ctx.moveTo(px, py);
      for (let k = 0; k < 5; k++) {
        px += (rng() - 0.5) * r * 0.5; py += (rng() - 0.5) * r * 0.5;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(160,170,185,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------- disegno navi
function drawPlayerTop(x, y, vx, flick) {
  ctx.save();
  ctx.translate(x, y);
  const b = clamp(vx / 380, -1, 1);
  ctx.rotate(b * 0.14);
  ctx.scale(1 - Math.abs(b) * 0.12, 1);

  // motori
  const fl = 8 + Math.random() * 7;
  ctx.fillStyle = "rgba(120,190,255,0.8)";
  poly([[-7, 15], [-3.5, 15], [-5.2, 15 + fl]]); ctx.fill();
  poly([[7, 15], [3.5, 15], [5.2, 15 + fl]]); ctx.fill();

  // ali (doppie, stile S-foil)
  ctx.fillStyle = "#9aa1b4";
  poly([[-3, 1], [-24, -6], [-24, -2], [-3, 6]]); ctx.fill();
  poly([[3, 1], [24, -6], [24, -2], [3, 6]]); ctx.fill();
  ctx.fillStyle = "#c9cedd";
  poly([[-3, 4], [-26, 12], [-26, 16], [-3, 10]]); ctx.fill();
  poly([[3, 4], [26, 12], [26, 16], [3, 10]]); ctx.fill();

  // strisce rosse
  ctx.fillStyle = "#c43b3b";
  ctx.fillRect(-19, 9.2, 7, 3.4);
  ctx.fillRect(12, 9.2, 7, 3.4);

  // cannoni alle estremità
  ctx.strokeStyle = "#7e8598";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-25, 12); ctx.lineTo(-25, 0);
  ctx.moveTo(25, 12); ctx.lineTo(25, 0);
  ctx.moveTo(-23, -4); ctx.lineTo(-23, -13);
  ctx.moveTo(23, -4); ctx.lineTo(23, -13);
  ctx.stroke();

  // fusoliera
  ctx.fillStyle = "#e3e6f0";
  poly([[0, -27], [4, -8], [3.2, 15], [-3.2, 15], [-4, -8]]); ctx.fill();
  ctx.strokeStyle = "#5d6478"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#28303f";
  ctx.fillRect(-2.2, -6, 4.4, 7); // cockpit
  ctx.fillStyle = "#c43b3b";
  poly([[0, -27], [1.8, -18], [-1.8, -18]]); ctx.fill(); // muso
  ctx.restore();
}

function drawFalconTop(x, y, vx) {
  ctx.save();
  ctx.translate(x, y);
  const b = clamp((vx || 0) / 340, -1, 1);
  ctx.rotate(b * 0.1);

  // scia dei motori
  const fl = 8 + Math.random() * 6;
  const eg = ctx.createLinearGradient(0, 26, 0, 32 + fl);
  eg.addColorStop(0, "rgba(140,200,255,0.85)");
  eg.addColorStop(1, "rgba(140,200,255,0)");
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.moveTo(-17, 25);
  ctx.quadraticCurveTo(0, 31, 17, 25);
  ctx.lineTo(13, 30 + fl);
  ctx.quadraticCurveTo(0, 34 + fl, -13, 30 + fl);
  ctx.closePath(); ctx.fill();

  // gola scura tra le mandibole
  ctx.fillStyle = "#141821";
  ctx.fillRect(-8.5, -38, 17, 26);

  // silhouette unica: disco + mandibole
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(-21, -38);
    ctx.lineTo(-24.5, -14);
    ctx.bezierCurveTo(-28, -6, -28, 12, -19, 22);
    ctx.bezierCurveTo(-10, 28.5, 10, 28.5, 19, 22);
    ctx.bezierCurveTo(28, 12, 28, -6, 24.5, -14);
    ctx.lineTo(21, -38);
    ctx.lineTo(8.5, -38);
    ctx.lineTo(7, -15);
    ctx.quadraticCurveTo(0, -11, -7, -15);
    ctx.lineTo(-8.5, -38);
    ctx.closePath();
  };
  const g = ctx.createRadialGradient(0, -2, 6, 0, 4, 44);
  g.addColorStop(0, "#ced2da");
  g.addColorStop(0.6, "#b4bac6");
  g.addColorStop(1, "#8a90a0");
  hull(); ctx.fillStyle = g; ctx.fill();
  // luce morbida da alto-sinistra, ritagliata dentro lo scafo
  ctx.save();
  hull(); ctx.clip();
  const hl = ctx.createRadialGradient(-10, -10, 2, -10, -10, 34);
  hl.addColorStop(0, "rgba(255,255,255,0.14)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(-30, -40, 60, 75);
  ctx.restore();
  hull(); ctx.strokeStyle = "#565d6e"; ctx.lineWidth = 1.2; ctx.stroke();

  // piastre in fondo alla gola
  ctx.strokeStyle = "#3d4453";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6.5, -17); ctx.lineTo(6.5, -17);
  ctx.moveTo(-6, -20.5); ctx.lineTo(6, -20.5);
  ctx.stroke();

  // giunture e punte delle mandibole
  ctx.strokeStyle = "rgba(70,78,94,0.55)";
  ctx.beginPath();
  ctx.moveTo(-14.5, -37); ctx.lineTo(-16, -14);
  ctx.moveTo(14.5, -37); ctx.lineTo(16, -14);
  ctx.stroke();
  ctx.fillStyle = "rgba(70,78,94,0.35)";
  ctx.fillRect(-21, -38, 12.5, 3);
  ctx.fillRect(8.5, -38, 12.5, 3);

  // bande circolari e pannellature radiali (solo sul settore visibile del disco)
  ctx.strokeStyle = "rgba(70,78,94,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 4, 22.5, -0.2 * Math.PI, 1.2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 4, 12, -0.15 * Math.PI, 1.15 * Math.PI); ctx.stroke();
  for (let i = 0; i < 9; i++) {
    if (Math.abs(i - 4) <= 2) continue; // salta il settore coperto dalle mandibole
    const a = -0.5 * Math.PI + (i - 4) * 0.32;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 12, 4 + Math.sin(a) * 12);
    ctx.lineTo(Math.cos(a) * 22.5, 4 + Math.sin(a) * 22.5);
    ctx.stroke();
  }

  // usura e lastre sostituite: il fascino del "carretto spaziale"
  const rust = [
    [-15, 10, 5, 3, "rgba(122,103,76,0.35)"],
    [8, 14, 6, 3.5, "rgba(110,97,82,0.3)"],
    [16, -2, 4, 5, "rgba(122,103,76,0.28)"],
    [-19, -2, 4, 4, "rgba(96,86,74,0.3)"],
    [-4, 18, 7, 3, "rgba(110,97,82,0.28)"],
  ];
  for (const [px, py, pw, ph, col] of rust) { ctx.fillStyle = col; ctx.fillRect(px, py, pw, ph); }
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(-11, 6, 6, 4);
  ctx.fillRect(4, -4, 5, 6);

  // anelli di attracco laterali
  ctx.fillStyle = "#9aa0ad";
  ctx.strokeStyle = "#565d6e";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(-25.6, 4, 1.9, 4.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(25.6, 4, 1.9, 4.6, 0, 0, TAU); ctx.fill(); ctx.stroke();

  // striscia dei motori lungo la poppa
  ctx.lineCap = "round";
  const pulse = 0.7 + 0.3 * Math.sin(G.time * 30);
  ctx.strokeStyle = "rgba(150,210,255," + (0.8 * pulse).toFixed(2) + ")";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 2, 25.5, 0.3 * Math.PI, 0.7 * Math.PI); ctx.stroke();
  ctx.strokeStyle = "rgba(225,242,255,0.9)";
  ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.arc(0, 2, 25.5, 0.3 * Math.PI, 0.7 * Math.PI); ctx.stroke();

  // riflesso sul fianco sinistro (senza invadere le mandibole)
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, 4, 26.2, 0.82 * Math.PI, 1.16 * Math.PI); ctx.stroke();

  // torretta quadrilaser centrale
  ctx.fillStyle = "#7e8494";
  ctx.beginPath(); ctx.arc(0, 3, 4.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#3d4453"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#3d4453";
  ctx.fillRect(-0.9, -3.6, 1.8, 4.2);
  ctx.fillRect(-2.8, -2.8, 1.4, 3.2);

  // parabola del sensore con crocera
  ctx.fillStyle = "#c9cdd6";
  ctx.strokeStyle = "#565d6e";
  ctx.beginPath(); ctx.ellipse(-9.5, -6, 6, 5.4, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(86,93,110,0.6)";
  ctx.beginPath(); ctx.ellipse(-9.5, -6, 3.4, 3, -0.3, 0, TAU); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-14.8, -8.6); ctx.lineTo(-4.2, -3.4);
  ctx.moveTo(-11.5, -11); ctx.lineTo(-7.5, -1);
  ctx.stroke();
  ctx.fillStyle = "#3d4453";
  ctx.beginPath(); ctx.arc(-9.5, -6, 1.1, 0, TAU); ctx.fill();

  // cockpit cilindrico sul fianco destro
  ctx.fillStyle = "#b4bac6";
  ctx.strokeStyle = "#565d6e";
  ctx.lineWidth = 1;
  poly([[21, 8], [25.5, 8], [28, -8], [28, -14], [24, -14], [21, -4]]);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(70,78,94,0.5)";
  ctx.beginPath(); ctx.moveTo(23, 6); ctx.lineTo(25, -12); ctx.stroke();
  // vetrata della cabina
  ctx.fillStyle = "#28303f";
  ctx.beginPath();
  ctx.moveTo(24, -14); ctx.lineTo(28, -14);
  ctx.quadraticCurveTo(27.6, -19.5, 26, -20);
  ctx.quadraticCurveTo(24.4, -19.5, 24, -14);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#9aa0ad"; ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(26, -20); ctx.lineTo(26, -14);
  ctx.moveTo(24.5, -17.5); ctx.lineTo(27.5, -17.5);
  ctx.stroke();

  ctx.restore();
}

function drawTIE(x, y, scl) {
  ctx.save();
  ctx.translate(x, y);
  if (scl && scl !== 1) ctx.scale(scl, scl);
  ctx.fillStyle = "#2c3347";
  ctx.strokeStyle = "#5a6785";
  ctx.lineWidth = 1.5;
  poly([[-12, -15], [-18, -10], [-18, 10], [-12, 15]]); ctx.fill(); ctx.stroke();
  poly([[12, -15], [18, -10], [18, 10], [12, 15]]); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#4a5570";
  ctx.fillRect(-12, -2, 24, 4);
  ctx.fillStyle = "#39415a";
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#6b7899"; ctx.stroke();
  ctx.fillStyle = "rgba(140,170,215,0.8)";
  ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawXWingBack(sx, sy, size, bank, flick, tick) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(bank);
  if (flick) ctx.globalAlpha = 0.45 + 0.3 * Math.sin(G.time * 30);
  const s = size;

  // 4 ali a X
  const wings = [[-1, -0.62], [1, -0.62], [-1, 0.62], [1, 0.62]];
  for (const [wx, wy] of wings) {
    ctx.fillStyle = wy < 0 ? "#c9cedd" : "#aab0c2";
    poly([
      [wx * s * 0.12, wy * s * 0.05],
      [wx * s, wy * s * 0.55],
      [wx * s, wy * s * 0.72],
      [wx * s * 0.12, wy * s * 0.22],
    ]);
    ctx.fill();
    ctx.strokeStyle = "#59607a"; ctx.lineWidth = 1; ctx.stroke();
    // striscia rossa
    ctx.fillStyle = "#c43b3b";
    ctx.fillRect(wx * s * 0.55 - s * 0.06, wy * s * 0.36 - s * 0.02, s * 0.12, s * 0.07);
    // cannone di estremità
    ctx.fillStyle = "#39415a";
    ctx.beginPath(); ctx.arc(wx * s, wy * s * 0.63, Math.max(1.4, s * 0.045), 0, TAU); ctx.fill();
  }

  // motori incandescenti
  const eg = 0.55 + 0.45 * Math.sin((tick || 0) * 21);
  for (const [wx, wy] of wings) {
    const ex = wx * s * 0.34, ey = wy * s * 0.30;
    const gr = ctx.createRadialGradient(ex, ey, 0, ex, ey, s * 0.11);
    gr.addColorStop(0, "rgba(255,150,150," + (0.85 * eg + 0.15) + ")");
    gr.addColorStop(0.5, "rgba(255,90,70,0.6)");
    gr.addColorStop(1, "rgba(255,90,70,0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(ex, ey, s * 0.11, 0, TAU); ctx.fill();
  }

  // fusoliera vista da dietro
  ctx.fillStyle = "#e3e6f0";
  ctx.beginPath(); ctx.arc(0, 0, s * 0.15, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#59607a"; ctx.stroke();
  ctx.fillStyle = "#28303f";
  ctx.beginPath(); ctx.arc(0, -s * 0.04, s * 0.07, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------- laser & particelle (schermo)
function drawBolt(x, y, dx, dy, len, color, coreColor, width) {
  const nx = dx, ny = dy;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = width * 2.6;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - nx * len, y - ny * len); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - nx * len, y - ny * len); ctx.stroke();
}

function spawnBurst(list, x, y, n, cols, speed, life) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(speed * 0.25, speed);
    list.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: rand(life * 0.5, life), maxLife: life,
      col: cols[Math.floor(Math.random() * cols.length)],
      size: rand(1.5, 3.5),
    });
  }
}

function updateParts(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.985; p.vy *= 0.985;
    p.life -= dt;
    if (p.life <= 0) list.splice(i, 1);
  }
}

function drawParts(list) {
  for (const p of list) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

const EXPL_COLS = ["#ffd98a", "#ff9d4d", "#ff5c33", "#ffffff", "#ffe9c9"];

// ============================================================
// FASE 1 — BATTAGLIA SPAZIALE
// ============================================================
let space = null;

function initSpace(shipType, carryLives) {
  const falcon = shipType === "falcon";
  space = {
    shipType: falcon ? "falcon" : "xwing",
    player: { x: W / 2, y: H * 0.8, lives: carryLives || 3, shield: falcon ? 4 : 3, inv: 0 },
    lasers: [], ebolts: [], enemies: [], parts: [],
    wave: 1, state: "intro", stateT: falcon ? 1.8 : 3.4, t: 0,
    queue: [], fireCd: 0, tip: 0,
    scroll: 0, kills: 0,
    hitR: falcon ? 23 : 17,
  };
  G.spacePhase = space.shipType;
  G.spaceStartScore = G.score;
  buildWave(1);
  if (!falcon) showYoda(3.2);
}

function buildWave(n) {
  const q = [];
  const falcon = space.shipType === "falcon";
  if (!falcon && n === 1) {
    const lanes = [0.25, 0.75, 0.4, 0.6, 0.3, 0.7, 0.5, 0.55];
    lanes.forEach((lx, i) => q.push({ t: i * 1.05, type: "drift", x: lx, sp: 95, amp: 55 }));
  } else if (!falcon) {
    for (let i = 0; i < 6; i++) q.push({ t: i * 0.9, type: "drift", x: 0.2 + 0.6 * ((i * 37) % 100) / 100, sp: 115, amp: 75 });
    for (let i = 0; i < 5; i++) q.push({ t: 2 + i * 1.5, type: "diver", x: 0.15 + 0.7 * ((i * 53) % 100) / 100 });
  } else if (n === 1) {
    for (let i = 0; i < 11; i++) q.push({ t: i * 0.7, type: "drift", x: 0.15 + 0.7 * ((i * 41) % 100) / 100, sp: 120, amp: 80 });
    for (let i = 0; i < 3; i++) q.push({ t: 2.5 + i * 2, type: "diver", x: 0.15 + 0.7 * ((i * 53) % 100) / 100 });
  } else {
    for (let i = 0; i < 10; i++) q.push({ t: i * 0.65, type: "drift", x: 0.15 + 0.7 * ((i * 41) % 100) / 100, sp: 135, amp: 95 });
    for (let i = 0; i < 7; i++) q.push({ t: 1.5 + i * 1.15, type: "diver", x: 0.1 + 0.8 * ((i * 67) % 100) / 100 });
  }
  q.sort((a, b) => a.t - b.t);
  space.queue = q;
  space.t = 0;
}

function spawnEnemy(spec) {
  const e = {
    type: spec.type,
    x: spec.x * W, y: -40,
    baseX: spec.x * W,
    t: rand(0, TAU),
    hp: 1,
    fireCd: rand(1.2, 2.8) + (3 - space.wave) * 0.5,
  };
  if (spec.type === "drift") { e.sp = spec.sp; e.amp = spec.amp; }
  else { e.state = "enter"; e.hoverY = rand(H * 0.16, H * 0.3); e.hoverT = rand(0.5, 1.0); e.vx = 0; e.vy = 0; }
  space.enemies.push(e);
}

function spaceHitPlayer() {
  const p = space.player;
  if (p.inv > 0) return;
  p.shield--;
  AudioFX.hit();
  G.shake = 12;
  spawnBurst(space.parts, p.x, p.y, 10, ["#7fd4ff", "#ffffff"], 160, 0.5);
  if (p.shield < 0) {
    p.lives--;
    spawnBurst(space.parts, p.x, p.y, 30, EXPL_COLS, 260, 0.9);
    AudioFX.boom();
    if (p.lives <= 0) {
      gameOver("space", "Il tuo caccia è stato abbattuto tra le stelle.");
      return;
    }
    p.shield = space.shipType === "falcon" ? 4 : 3;
    p.inv = 2.5;
    p.x = W / 2; p.y = H * 0.85;
  } else {
    p.inv = 1.4;
  }
}

function updateSpace(dt) {
  const sp = space, p = sp.player;
  sp.scroll += dt * 0.045;
  p.inv = Math.max(0, p.inv - dt);

  if (sp.state === "intro") {
    sp.stateT -= dt;
    if (sp.stateT <= 0) {
      sp.state = "run";
      showMsg("ONDATA " + sp.wave + " / 2", 1.5);
      AudioFX.wave();
    }
  } else if (sp.state === "clear") {
    sp.stateT -= dt;
    if (sp.stateT <= 0) {
      pressedCodes.clear();
      touchTapped = false;
      if (sp.shipType === "xwing") {
        falconIntro = { t: 0 };
        G.screen = "falconIntro";
      } else {
        duelIntro = { t: 0, b1: false, b2: false, b3: false };
        G.screen = "duelIntro";
      }
      return;
    }
  }

  // movimento giocatore (tastiera)
  const mv = 380 * dt;
  if (keys["ArrowLeft"] || keys["KeyA"]) p.x -= mv;
  if (keys["ArrowRight"] || keys["KeyD"]) p.x += mv;
  if (keys["ArrowUp"] || keys["KeyW"]) p.y -= mv;
  if (keys["ArrowDown"] || keys["KeyS"]) p.y += mv;
  p.x = clamp(p.x, 22, W - 22);
  p.y = clamp(p.y, H * 0.35, H - 34);
  p.vx = (keys["ArrowLeft"] || keys["KeyA"]) ? -380 : (keys["ArrowRight"] || keys["KeyD"]) ? 380 : 0;

  // fuoco giocatore (bolt rossi come i caccia ribelli)
  sp.fireCd -= dt;
  if (fireHeld() && sp.fireCd <= 0 && sp.state === "run") {
    if (sp.shipType === "falcon") {
      // torretta quadrilaser: rosata a tre colpi
      for (const spr of [-0.16, 0, 0.16]) {
        sp.lasers.push({ x: p.x + spr * 60, y: p.y - 26, vy: -600, vx: spr * 220 });
      }
      sp.fireCd = 0.2;
    } else {
      const tips = [[-25, -2], [25, -2], [-23, -14], [23, -14]];
      const tp = tips[sp.tip % 4]; sp.tip++;
      sp.lasers.push({ x: p.x + tp[0], y: p.y + tp[1], vy: -640 });
      sp.fireCd = 0.15;
    }
    AudioFX.laser();
  }

  // spawn nemici
  if (sp.state === "run") {
    sp.t += dt;
    while (sp.queue.length && sp.queue[0].t <= sp.t) spawnEnemy(sp.queue.shift());
  }

  // nemici
  for (let i = sp.enemies.length - 1; i >= 0; i--) {
    const e = sp.enemies[i];
    e.t += dt;
    if (e.type === "drift") {
      e.y += e.sp * dt;
      e.x = e.baseX + Math.sin(e.t * 1.7) * e.amp;
    } else {
      if (e.state === "enter") {
        e.y += 150 * dt;
        if (e.y >= e.hoverY) e.state = "hover";
      } else if (e.state === "hover") {
        e.hoverT -= dt;
        e.x += Math.sin(e.t * 3) * 40 * dt;
        if (e.hoverT <= 0) {
          e.state = "dive";
          const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
          e.vx = ((p.x - e.x) / d) * 330;
          e.vy = ((p.y - e.y) / d) * 330;
          AudioFX.enemyLaser();
        }
      } else {
        e.x += e.vx * dt; e.y += e.vy * dt;
      }
    }

    // fuoco nemico (bolt verdi imperiali)
    e.fireCd -= dt;
    if (e.fireCd <= 0 && e.y > 0 && e.y < H * 0.7 && sp.ebolts.length < 8 + sp.wave * 4) {
      const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
      const spd = 230 + sp.wave * 25;
      const spread = rand(-0.12, 0.12);
      const ca = Math.cos(spread), sa = Math.sin(spread);
      const dx = (p.x - e.x) / d, dy = (p.y - e.y) / d;
      sp.ebolts.push({ x: e.x, y: e.y, vx: (dx * ca - dy * sa) * spd, vy: (dx * sa + dy * ca) * spd });
      e.fireCd = rand(1.3, 2.9) - sp.wave * 0.15;
      AudioFX.enemyLaser();
    }

    if (e.y > H + 60 || e.x < -80 || e.x > W + 80) { sp.enemies.splice(i, 1); continue; }

    // collisione con il giocatore
    if (p.inv <= 0 && dist2(e.x, e.y, p.x, p.y) < (sp.hitR + 13) * (sp.hitR + 13)) {
      sp.enemies.splice(i, 1);
      spawnBurst(sp.parts, e.x, e.y, 22, EXPL_COLS, 240, 0.8);
      spaceHitPlayer();
      continue;
    }
  }

  // laser giocatore
  for (let i = sp.lasers.length - 1; i >= 0; i--) {
    const l = sp.lasers[i];
    l.y += l.vy * dt;
    l.x += (l.vx || 0) * dt;
    if (l.y < -40 || l.x < -40 || l.x > W + 40) { sp.lasers.splice(i, 1); continue; }
    for (let j = sp.enemies.length - 1; j >= 0; j--) {
      const e = sp.enemies[j];
      if (dist2(l.x, l.y, e.x, e.y) < 22 * 22) {
        sp.lasers.splice(i, 1);
        sp.enemies.splice(j, 1);
        sp.kills++;
        G.score += e.type === "diver" ? 150 : 100;
        spawnBurst(sp.parts, e.x, e.y, 24, EXPL_COLS, 260, 0.85);
        AudioFX.boom();
        break;
      }
    }
  }

  // bolt nemici
  for (let i = sp.ebolts.length - 1; i >= 0; i--) {
    const b = sp.ebolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y > H + 40 || b.x < -40 || b.x > W + 40) { sp.ebolts.splice(i, 1); continue; }
    if (p.inv <= 0 && dist2(b.x, b.y, p.x, p.y) < sp.hitR * sp.hitR) {
      sp.ebolts.splice(i, 1);
      spaceHitPlayer();
    }
  }

  updateParts(sp.parts, dt);

  // ondata completata
  if (sp.state === "run" && sp.queue.length === 0 && sp.enemies.length === 0) {
    if (sp.wave < 2) {
      sp.wave++;
      buildWave(sp.wave);
      sp.state = "intro"; sp.stateT = 1.6;
    } else {
      sp.state = "clear"; sp.stateT = 2.6;
      G.score += 500;
      showMsg(sp.shipType === "xwing"
        ? "Ondate respinte! Il Millennium Falcon è in arrivo…"
        : "Spazio libero! Ma i sensori rilevano una presenza oscura…", 2.6);
    }
  }
}

function drawSpace() {
  const sp = space, p = sp.player;
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  drawStars(sp.scroll, 1);

  // La Morte Nera cresce all'orizzonte man mano che avanzi
  const phaseIdx = (sp.shipType === "falcon" ? 2 : 0) + sp.wave;
  const dsR = MINWH * (0.06 + phaseIdx * 0.032);
  drawDeathStar(W * 0.8, H * 0.16, dsR, 0.85, 0);

  // bolt nemici (verdi)
  for (const b of sp.ebolts) {
    const d = Math.hypot(b.vx, b.vy) || 1;
    drawBolt(b.x, b.y, b.vx / d, b.vy / d, 18, "rgba(80,255,120,0.9)", "#d8ffe0", 3);
  }
  // laser giocatore (rossi)
  for (const l of sp.lasers) drawBolt(l.x, l.y, 0, -1, 26, "rgba(255,70,60,0.9)", "#ffd9d5", 3);

  for (const e of sp.enemies) drawTIE(e.x, e.y);

  const flick = p.inv > 0 && Math.sin(G.time * 26) > 0;
  if (!flick) {
    if (sp.shipType === "falcon") drawFalconTop(p.x, p.y, p.vx || 0);
    else drawPlayerTop(p.x, p.y, p.vx || 0, false);
  }

  drawParts(sp.parts);
  drawHUD();
  text((sp.shipType === "falcon" ? "MILLENNIUM FALCON" : "X-WING") + " · ONDATA " + sp.wave + "/2",
       W / 2, NARROW() ? 60 : 26, NARROW() ? 13 : 15, "#8fa2c5");
}

// ============================================================
// CUTSCENE — ARRIVA IL MILLENNIUM FALCON
// ============================================================
let falconIntro = null;

function updateFalconIntro(dt) {
  falconIntro.t += dt;
  if (falconIntro.t > 3.2 || anyStartPressed()) {
    initSpace("falcon", space ? space.player.lives : 3);
    G.screen = "space";
  }
}

function drawFalconIntro() {
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  drawStars(G.time * 0.004, 1);
  const t = falconIntro.t;

  // il Falcon plana in scena
  const k = clamp(t / 2.2, 0, 1);
  const ek = 1 - (1 - k) * (1 - k);
  const fx = lerp(-W * 0.2, W * 0.5, ek);
  const fy = H * 0.58 + Math.sin(t * 2.2) * 8;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(2.2, 2.2);
  drawFalconTop(0, 0, 120);
  ctx.restore();

  text("IL MILLENNIUM FALCON", W / 2, H * 0.22, Math.max(20, Math.min(MINWH * 0.05, W * 0.075)), "#ffe81f", "center", true);
  text("SI UNISCE ALLA BATTAGLIA!", W / 2, H * 0.29, Math.max(15, Math.min(MINWH * 0.036, W * 0.055)), "#ffe81f", "center", true);
  if (t > 1)
    textWrap("Han ti lascia i comandi: quadrilaser a rosata e scudi potenziati!", W / 2, H * 0.37, Math.max(12, Math.min(MINWH * 0.022, W * 0.035)), "#c5cde0", "center", false, W * 0.9);
  text("INVIO per continuare", W / 2, H - 20, 11, "#4d5670");
}

// ============================================================
// CUTSCENE — UNA PRESENZA OSCURA
// ============================================================
let duelIntro = null;

function updateDuelIntro(dt) {
  const d = duelIntro;
  d.t += dt;
  if (!d.b1 && d.t > 0.4) { d.b1 = true; AudioFX.breath(); }
  if (!d.b2 && d.t > 1.5) { d.b2 = true; AudioFX.breath(); }
  if (!d.b3 && d.t > 2.6) { d.b3 = true; AudioFX.breath(); }
  if (d.t > 3.8 || anyStartPressed()) {
    initDuel();
    G.screen = "duel";
  }
}

function drawDuelIntro() {
  const t = duelIntro.t;
  drawCorridor();
  const S = MINWH / 420, GY = H * 0.74;

  // Vader avanza dall'ombra
  const k = clamp(t / 2.4, 0, 1);
  const ek = 1 - (1 - k) * (1 - k);
  const vx = lerp(W * 1.12, W * 0.7, ek);
  drawVaderChar({ x: vx, face: -1, armAng: -0.55, walkT: t * 6, hurtT: 0, staggerT: 0, kneel: 0, alpha: 1, bladeK: 0, hasBlade: true, state: "approach" }, S, GY);

  textWrap("Atterri nella Morte Nera per sabotare il raggio traente…", W / 2, H * 0.18, Math.max(12, Math.min(MINWH * 0.024, W * 0.036)), "#c5cde0", "center", false, W * 0.9);
  if (t > 1.6)
    textWrap("DARTH VADER TI SBARRA LA STRADA", W / 2, H * 0.29, Math.max(17, Math.min(MINWH * 0.04, W * 0.06)), "#ff5c5c", "center", true, W * 0.94);
  text("INVIO per continuare", W / 2, H - 20, 11, "#4d5670");
}

// ============================================================
// IL DUELLO — LUKE SKYWALKER contro DARTH VADER
// ============================================================
let duel = null;

const VADER_QUOTES = [
  "« Ora il cerchio è completo. »",
  "« La Forza è potente in te. »",
  "« Impressionante… davvero impressionante. »",
  "« La tua mancanza di fede è disturbante. »",
];

function initDuel() {
  duel = {
    luke: {
      x: W * 0.28, hp: 5, state: "idle", t: 0, atkCd: 0,
      blocking: false, blockT: 9, face: 1, hurtT: 0, armAng: -0.5,
      walkT: 0, moving: 0, didHit: false, pushVx: 0,
      airY: 0, vy: 0, rot: 0, landLag: 0, stunT: 0, bladeK: 0,
    },
    vader: {
      x: W * 0.72, hp: 8, state: "idle", t: 0, cd: 1.4,
      forceCd: 7, face: -1, hurtT: 0, armAng: -0.65,
      walkT: 0, staggerT: 0, quote: null, quoteT: 0, quoteCd: 4,
      combo: false, kneel: 0, alpha: 1, pushVx: 0, windupDur: 0.5,
      bladeK: 0, hasBlade: true, phase2: false, throwCd: 3,
    },
    saber: null,           // spada lanciata in volo
    trailL: [], trailV: [],
    sparks: [], rings: [], floats: [],
    lock: null,
    introT: 2.0, overT: 0,
    hitStop: 0, slowmo: 0, phase2Cine: 0,
    mercyUsed: false, crackleT: 0,
    igV: false, igL: false,
  };
  G.duelStartScore = G.score;
  AudioFX.humStart(); // ronzio delle lame
}

function addFloat(x, y, txt, col) {
  duel.floats.push({ x, y, txt, col, t: 0 });
}

function duelSpark(x, y, cols, n) {
  spawnBurst(duel.sparks, x, y, n || 16, cols, 280, 0.5);
}

// punti della lama in coordinate mondo (per scie, lock e riflessi)
function bladePts(f, S, GY, isVader) {
  const sc = isVader ? S * 1.16 : S;
  const shx = f.x + f.face * sc * (isVader ? 10 : 8);
  const shy = GY + (f.airY || 0) - sc * (isVader ? 82 : 80) + (isVader ? (f.kneel || 0) * S * 22 : 0);
  const hx = shx + f.face * Math.cos(f.armAng) * sc * (isVader ? 28 : 26);
  const hy = shy + Math.sin(f.armAng) * sc * (isVader ? 28 : 26);
  const len = (isVader ? sc * 92 : sc * 88) * (f.bladeK !== undefined ? f.bladeK : 1) * (isVader ? 1 - (f.kneel || 0) * 0.9 : 1);
  return { hx, hy, tx: hx + f.face * Math.cos(f.armAng) * len, ty: hy + Math.sin(f.armAng) * len };
}

function lukeTakesHit(cause) {
  const d = duel, l = d.luke;
  const S = MINWH / 420, GY = H * 0.74;
  l.hp--;
  l.hurtT = 0.35;
  AudioFX.thud();
  duelSpark(l.x, GY + l.airY - S * 70, ["#ff5c33", "#ffe9c9"]);
  l.pushVx = (l.x > d.vader.x ? 1 : -1) * 300;
  G.shake = 10;
  d.hitStop = 0.07;
  if (l.hp <= 0) {
    gameOver("duel", cause);
    return true;
  }
  // la Forza ti sostiene, una volta sola
  if (l.hp === 1 && !d.mercyUsed) {
    d.mercyUsed = true;
    l.hp = 2;
    d.slowmo = 0.9;
    showYoda(2.6, "« Usa la Forza, Luke… »");
    addFloat(l.x, GY - S * 150, "+1 CUORE", "#bfe6a8");
  }
  return false;
}

function startLock() {
  const d = duel;
  d.lock = { t: 0, meter: 0.55 };
  d.luke.state = "idle";
  d.luke.blocking = false;
  d.vader.state = "lock";
  AudioFX.clash();
  G.shake = 8;
}

function updateDuel(rdt) {
  const d = duel;
  if (!d) return;
  if (d.hitStop > 0) { d.hitStop -= rdt; return; }
  d.slowmo = Math.max(0, d.slowmo - rdt);
  const dt = rdt * (d.slowmo > 0 ? 0.35 : 1);

  const l = d.luke, v = d.vader;
  const S = MINWH / 420, GY = H * 0.74;
  const reach = S * 140;

  updateParts(d.sparks, dt);
  for (let i = d.rings.length - 1; i >= 0; i--) {
    d.rings[i].r += dt * MINWH * 0.9;
    d.rings[i].a -= dt * 2.2;
    if (d.rings[i].a <= 0) d.rings.splice(i, 1);
  }
  for (let i = d.floats.length - 1; i >= 0; i--) {
    d.floats[i].t += rdt;
    if (d.floats[i].t > 1.15) d.floats.splice(i, 1);
  }
  const decayTrail = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].life -= rdt * 4.5;
      if (arr[i].life <= 0) arr.splice(i, 1);
    }
  };
  decayTrail(d.trailL); decayTrail(d.trailV);

  // ---- accensione delle lame ----
  if (d.introT > 0) {
    d.introT -= rdt;
    const el = 2.0 - Math.max(0, d.introT);
    if (!d.igV && el > 0.15) { d.igV = true; AudioFX.ignite(); }
    if (!d.igL && el > 0.75) { d.igL = true; AudioFX.ignite(); }
    v.bladeK = clamp((el - 0.15) / 0.4, 0, 1);
    l.bladeK = clamp((el - 0.75) / 0.4, 0, 1);
    return;
  }
  l.bladeK = 1;
  if (v.hasBlade) v.bladeK = Math.min(1, v.bladeK + dt * 6);

  // ---- vittoria: Vader si ritira ----
  if (d.overT > 0) {
    d.overT += rdt;
    v.kneel = clamp(v.kneel + rdt * 1.2, 0, 1);
    if (d.overT > 1.2) v.alpha = clamp(v.alpha - rdt * 0.9, 0, 1);
    if (d.overT > 2.6) {
      AudioFX.humStop();
      pressedCodes.clear();
      touchTapped = false;
      G.screen = "approach";
      approach = { t: 0 };
    }
    return;
  }

  // ---- cinematica fase 2 ----
  if (d.phase2Cine > 0) {
    d.phase2Cine -= rdt;
    v.armAng = lerp(v.armAng, -1.15, Math.min(1, rdt * 4));
    if (d.phase2Cine <= 0) showMsg("Vader libera il lato oscuro: attento alla spada lanciata!", 2.6);
    return;
  }

  l.face = v.x > l.x ? 1 : -1;
  v.face = l.x > v.x ? 1 : -1;
  const atkPressed = popKey("Space");
  const jumpPressed = popKey("ArrowUp") || popKey("KeyW");
  l.hurtT = Math.max(0, l.hurtT - dt);
  v.hurtT = Math.max(0, v.hurtT - dt);
  l.atkCd = Math.max(0, l.atkCd - dt);
  l.moving = Math.max(0, l.moving - dt);
  l.landLag = Math.max(0, l.landLag - dt);
  l.stunT = Math.max(0, l.stunT - dt);

  // ---- BLADE LOCK: lame incrociate, martella SPAZIO ----
  if (d.lock) {
    const Lk = d.lock;
    Lk.t += dt;
    const dir = v.x > l.x ? 1 : -1;
    const mid = (l.x + v.x) / 2;
    l.x = lerp(l.x, mid - dir * S * 52, Math.min(1, dt * 10));
    v.x = lerp(v.x, mid + dir * S * 52, Math.min(1, dt * 10));
    l.armAng = lerp(l.armAng, -1.0, Math.min(1, dt * 12));
    v.armAng = lerp(v.armAng, -2.1, Math.min(1, dt * 12));
    l.airY = 0; l.vy = 0;
    if (atkPressed) Lk.meter = clamp(Lk.meter + 0.075, 0, 1);
    Lk.meter = clamp(Lk.meter - dt * (v.phase2 ? 0.3 : 0.24), 0, 1);
    d.crackleT -= dt;
    const cp = { x: mid, y: GY - S * 86 };
    if (d.crackleT <= 0) {
      d.crackleT = 0.09;
      duelSpark(cp.x + rand(-6, 6), cp.y + rand(-8, 8), ["#ffe9c9", "#7fd4ff", "#ffffff"], 5);
      AudioFX.blip(1300 + Math.random() * 700, 900, 0.05, "sawtooth", 0.05);
    }
    G.shake = Math.max(G.shake, 2.2);
    if (Lk.meter >= 0.98 || (Lk.t > 2.8 && Lk.meter >= 0.55)) {
      d.lock = null;
      v.staggerT = 1.4;
      v.pushVx = dir * 430;
      d.slowmo = 0.5;
      d.hitStop = 0.06;
      duelSpark(cp.x, cp.y, ["#ffffff", "#bfe6a8", "#7fd4ff"], 30);
      AudioFX.clash();
      addFloat(mid, GY - S * 130, "RESPINTO!", "#bfe6a8");
    } else if (Lk.t > 2.8) {
      d.lock = null;
      l.pushVx = -dir * 480;
      l.stunT = 0.55;
      v.state = "recover"; v.t = 0; v.cd = 0.35;
      AudioFX.thud();
      addFloat(mid, GY - S * 130, "SOPRAFFATTO!", "#ff8c85");
    }
    return;
  }

  // ---- LUKE ----
  // fisica del salto (capriola jedi)
  const grounded = l.airY >= 0 && l.vy === 0;
  if (!grounded || l.vy !== 0) {
    l.vy += S * 2600 * dt;
    l.airY += l.vy * dt;
    if (l.state !== "plunge") l.rot -= l.face * dt * 9;
    if (l.airY >= 0) {
      l.airY = 0; l.vy = 0; l.rot = 0;
      AudioFX.land();
      spawnBurst(d.sparks, l.x, GY, 6, ["#8b90a0"], 90, 0.3);
      if (l.state === "plunge") {
        // colpo dall'alto: spezza la guardia
        l.state = "idle"; l.atkCd = 0.5;
        if (Math.abs(v.x - l.x) < reach && v.alpha > 0.5) {
          if (v.staggerT <= 0 && (v.state === "block" || Math.random() < 0.55)) {
            v.staggerT = 1.15;
            AudioFX.clash();
            duelSpark(v.x, GY - S * 85, ["#ffffff", "#ffe9c9"], 26);
            addFloat(v.x, GY - S * 140, "GUARDIA SPEZZATA!", "#ffe81f");
            d.hitStop = 0.1;
            G.shake = 10;
          } else {
            v.hp--; v.hurtT = 0.3;
            G.score += 250;
            AudioFX.thud();
            duelSpark(v.x, GY - S * 80, ["#ff9d4d", "#ff5c33"], 22);
            addFloat(v.x, GY - S * 140, "+250", "#ffe9c9");
            v.pushVx = l.face * 320;
            d.hitStop = 0.08;
            G.shake = 9;
          }
        } else {
          l.landLag = 0.3; // a vuoto: punibile
        }
      } else l.landLag = 0.12;
    }
  }
  if (grounded && jumpPressed && l.state === "idle" && !l.blocking && l.stunT <= 0 && l.landLag <= 0) {
    l.vy = -S * 950;
    l.airY = -0.01;
    AudioFX.swing();
  }

  // movimento
  const mv = (grounded ? 300 : 260) * dt;
  if (l.state !== "atk" && l.state !== "plunge" && l.stunT <= 0) {
    if (keys["ArrowLeft"] || keys["KeyA"]) { l.x -= mv; l.moving = 0.1; }
    if (keys["ArrowRight"] || keys["KeyD"]) { l.x += mv; l.moving = 0.1; }
  }
  l.x += l.pushVx * dt;
  l.pushVx *= Math.pow(0.001, dt);
  l.x = clamp(l.x, W * 0.06, W * 0.94);
  l.walkT += dt * (l.moving > 0 ? 1 : 0);

  // parata (solo a terra)
  const wasBlocking = l.blocking;
  l.blocking = grounded && l.state !== "atk" && l.stunT <= 0 && blockHeld();
  l.blockT = l.blocking ? (wasBlocking ? l.blockT + dt : 0) : 9;

  // attacchi
  if (atkPressed && l.stunT <= 0) {
    if (!grounded && l.state !== "plunge") {
      l.state = "plunge";
      l.vy = Math.max(l.vy, S * 1500);
      l.rot = 0;
      AudioFX.swing();
    } else if (grounded && l.state === "idle" && !l.blocking && l.atkCd <= 0 && l.landLag <= 0) {
      l.state = "atk"; l.t = 0; l.didHit = false; l.atkCd = 0.55;
      AudioFX.swing();
    }
  }

  if (l.state === "atk") {
    l.t += dt;
    const k = clamp(l.t / 0.34, 0, 1);
    l.armAng = lerp(-2.2, 0.55, k * k * (3 - 2 * k));
    if (!l.didHit && l.t > 0.13) {
      l.didHit = true;
      if (Math.abs(v.x - l.x) < reach && v.alpha > 0.5) {
        if (v.state === "windup" && v.staggerT <= 0) {
          // le lame si incontrano a mezz'aria: LOCK!
          startLock();
          return;
        }
        if (v.staggerT <= 0 && (v.state === "idle" || v.state === "approach") && Math.random() < 0.42) {
          if (Math.random() < 0.3) { startLock(); return; }
          v.state = "block"; v.t = 0;
          AudioFX.clash();
          duelSpark((l.x + v.x) / 2, GY - S * 80, ["#ffe9c9", "#7fd4ff", "#ffffff"]);
          l.pushVx = (l.x > v.x ? 1 : -1) * 240;
          G.shake = 6;
          d.hitStop = 0.05;
        } else {
          v.hp--; v.hurtT = 0.3;
          G.score += 250;
          AudioFX.thud();
          duelSpark(v.x - v.face * S * 20, GY - S * 75, ["#ff9d4d", "#ff5c33", "#ffe9c9"]);
          addFloat(v.x, GY - S * 140, "+250", "#ffe9c9");
          v.x += l.face * S * 26;
          G.shake = 7;
          d.hitStop = 0.07;
        }
      }
    }
    if (l.t >= 0.34) { l.state = "idle"; l.armAng = -0.5; }
  } else if (l.state === "plunge") {
    l.armAng = lerp(l.armAng, 1.15, Math.min(1, dt * 14));
  } else if (!grounded) {
    l.armAng = lerp(l.armAng, -0.9, Math.min(1, dt * 8));
  } else if (l.blocking) {
    l.armAng = lerp(l.armAng, -1.35, Math.min(1, dt * 14));
  } else {
    l.armAng = lerp(l.armAng, -0.5 + Math.sin(G.time * 2) * 0.06, Math.min(1, dt * 8));
  }

  // scia della lama di Luke
  if (l.state === "atk" || l.state === "plunge") {
    const bp = bladePts(l, S, GY, false);
    d.trailL.push({ ...bp, life: 1 });
    if (d.trailL.length > 14) d.trailL.shift();
  }

  // fine del duello?
  if (v.hp <= 0 && d.overT === 0) {
    d.overT = 0.01;
    G.score += 2000;
    saveHi();
    showMsg("Fener vacilla e si ritira: la via è libera!", 2.6);
    return;
  }

  // ---- spada lanciata (boomerang) ----
  if (d.saber) {
    const s = d.saber;
    s.spin += dt * 24;
    s.x += s.vx * dt;
    const vhand = v.x + v.face * S * 14;
    if (s.phase === "out" && ((s.vx > 0 && s.x > s.turnX) || (s.vx < 0 && s.x < s.turnX))) {
      s.phase = "back"; s.hitDone = false;
    }
    if (s.phase === "back") {
      s.vx = lerp(s.vx, (vhand > s.x ? 1 : -1) * S * 620, Math.min(1, dt * 3.5));
      if (Math.abs(s.x - vhand) < S * 26) {
        d.saber = null;
        v.hasBlade = true; v.bladeK = 0.4;
        v.throwCd = rand(6, 9);
      }
    }
    if (d.saber && !s.hitDone && Math.abs(s.x - l.x) < S * 32) {
      if (l.airY < -S * 50) {
        s.hitDone = true;
        addFloat(l.x, GY - S * 160, "SCHIVATO!", "#7fd4ff");
      } else if (l.blocking) {
        s.hitDone = true;
        AudioFX.clash();
        duelSpark(l.x + l.face * S * 20, GY - S * 80, ["#ffe9c9", "#ffffff"]);
        s.phase = "back";
        l.pushVx = (l.x > v.x ? 1 : -1) * 200;
      } else {
        s.hitDone = true;
        if (lukeTakesHit("Trafitto dalla lama volante di Vader…")) return;
      }
    }
  }

  // ---- VADER ----
  v.walkT += dt;
  v.x += v.pushVx * dt;
  v.pushVx *= Math.pow(0.001, dt);
  v.x = clamp(v.x, W * 0.06, W * 0.94);
  v.forceCd -= dt;
  v.throwCd -= dt;
  v.quoteT = Math.max(0, v.quoteT - dt);
  v.quoteCd -= dt;
  if (v.quoteCd <= 0 && v.state === "idle" && v.quoteT <= 0) {
    v.quote = VADER_QUOTES[Math.floor(Math.random() * VADER_QUOTES.length)];
    v.quoteT = 2.2;
    v.quoteCd = rand(5, 8);
    AudioFX.breath();
  }

  // risveglio del lato oscuro
  if (!v.phase2 && v.hp <= 4) {
    v.phase2 = true;
    d.phase2Cine = 1.4;
    v.quote = "« Non conosci il potere del lato oscuro. »";
    v.quoteT = 2.8;
    AudioFX.sting();
    AudioFX.breath();
    G.shake = 6;
    return;
  }

  if (v.staggerT > 0) {
    v.staggerT -= dt;
    v.armAng = lerp(v.armAng, 0.9, Math.min(1, dt * 6));
    return;
  }

  const dist = Math.abs(l.x - v.x);
  switch (v.state) {
    case "lock": // risolto sopra: rientra in idle
      v.state = "idle";
      break;
    case "idle":
    case "approach": {
      v.cd -= dt;
      const want = S * 125;
      if (dist > want) { v.x += (l.x > v.x ? 1 : -1) * (v.phase2 ? 165 : 135) * dt; v.state = "approach"; }
      else v.state = "idle";
      v.armAng = lerp(v.armAng, -0.65 + Math.sin(G.time * 1.6) * 0.05, Math.min(1, dt * 6));
      if (!v.hasBlade) break; // aspetta il ritorno della spada
      if (v.phase2 && v.throwCd <= 0 && !d.saber && dist > S * 230) {
        v.state = "throwTele"; v.t = 0;
        break;
      }
      if (v.forceCd <= 0 && dist < S * 330 && Math.random() < 0.5) {
        v.state = "forceTele"; v.t = 0;
        v.forceCd = v.phase2 ? rand(4.5, 7) : rand(7, 10);
      } else if (v.cd <= 0 && dist < S * 165) {
        v.state = "windup"; v.t = 0;
        v.windupDur = v.combo ? 0.24 : (v.phase2 ? 0.4 : 0.5);
        v.combo = false;
      }
      break;
    }
    case "windup": {
      v.t += dt;
      v.armAng = lerp(v.armAng, -2.35, Math.min(1, dt * 10));
      if (v.t > v.windupDur * 0.6) v.armAng += Math.sin(G.time * 45) * 0.03;
      if (v.t >= v.windupDur) { v.state = "strike"; v.t = 0; v.didHit = false; AudioFX.swing(); }
      break;
    }
    case "strike": {
      v.t += dt;
      const k = clamp(v.t / 0.3, 0, 1);
      v.armAng = lerp(-2.35, 0.6, k * k * (3 - 2 * k));
      const bp = bladePts(v, S, GY, true);
      d.trailV.push({ ...bp, life: 1 });
      if (d.trailV.length > 14) d.trailV.shift();
      if (!v.didHit && v.t > 0.1) {
        v.didHit = true;
        if (Math.abs(l.x - v.x) < reach) {
          if (l.airY < -S * 45) {
            addFloat(l.x, GY + l.airY - S * 130, "SCHIVATO!", "#7fd4ff");
            v.cd = 0.7; // ha colpito l'aria: punibile
          } else if (l.blocking) {
            if (l.blockT < 0.2) {
              v.staggerT = 1.15;
              AudioFX.clash();
              addFloat((l.x + v.x) / 2, GY - S * 140, "PARATA PERFETTA!", "#bfe6a8");
              duelSpark((l.x + v.x) / 2, GY - S * 82, ["#7fd4ff", "#ffffff", "#bfe6a8"], 24);
              G.shake = 8;
              d.slowmo = 0.45;
              d.hitStop = 0.06;
            } else {
              AudioFX.clash();
              duelSpark((l.x + v.x) / 2, GY - S * 80, ["#ffe9c9", "#ffffff"]);
              l.pushVx = (l.x > v.x ? 1 : -1) * 260;
              G.shake = 6;
              d.hitStop = 0.05;
            }
          } else {
            if (lukeTakesHit("Il lato oscuro ha prevalso… questa volta.")) return;
          }
        }
      }
      if (v.t >= 0.3) {
        v.state = "recover"; v.t = 0;
        if (v.hp <= 4 && Math.random() < (v.phase2 ? 0.6 : 0.45)) v.combo = true;
      }
      break;
    }
    case "recover": {
      v.t += dt;
      v.armAng = lerp(v.armAng, -0.65, Math.min(1, dt * 5));
      if (v.t >= (v.combo ? 0.13 : v.phase2 ? 0.35 : 0.5)) {
        v.state = v.combo ? "windup" : "idle";
        if (v.combo) { v.t = 0; v.windupDur = 0.24; v.combo = false; }
        v.cd = v.phase2 ? rand(0.35, 0.8) : rand(0.5, 1.3);
      }
      break;
    }
    case "forceTele": {
      v.t += dt;
      v.armAng = lerp(v.armAng, -1.7, Math.min(1, dt * 8));
      if (v.t > 0.6) {
        v.state = "recover"; v.t = 0;
        AudioFX.forceP();
        d.rings.push({ x: v.x + (l.x > v.x ? 1 : -1) * S * 20, y: GY - S * 78, r: S * 20, a: 0.8 });
        if (Math.abs(l.x - v.x) < S * 340) {
          if (l.airY < -S * 40) {
            addFloat(l.x, GY + l.airY - S * 130, "SCHIVATO!", "#7fd4ff");
          } else {
            l.pushVx = (l.x > v.x ? 1 : -1) * 780;
            G.shake = 9;
          }
        }
      }
      break;
    }
    case "throwTele": {
      v.t += dt;
      v.armAng = lerp(v.armAng, -2.6, Math.min(1, dt * 9));
      if (v.t > 0.45) {
        v.state = "recover"; v.t = 0;
        v.hasBlade = false; v.bladeK = 0;
        AudioFX.throwW();
        d.saber = {
          x: v.x + v.face * S * 20,
          vx: (l.x > v.x ? 1 : -1) * S * 560,
          turnX: l.x + (l.x > v.x ? 1 : -1) * S * 80,
          phase: "out", spin: 0, hitDone: false,
        };
      }
      break;
    }
    case "block": {
      v.t += dt;
      v.armAng = lerp(v.armAng, -1.4, Math.min(1, dt * 14));
      if (v.t > 0.45) v.state = "idle";
      break;
    }
  }
}

// ---------------------------------------------------------- disegno duello
let duelReflectPass = false;

const duelDust = (() => {
  const rng = mulberry32(7777);
  const out = [];
  for (let i = 0; i < 34; i++) out.push({ x: rng(), y: rng(), s: 0.3 + rng() * 0.7, ph: rng() * TAU });
  return out;
})();

const hangarStars = (() => {
  const rng = mulberry32(24680);
  const out = [];
  for (let i = 0; i < 42; i++) out.push({ x: rng(), y: rng(), a: 0.25 + rng() * 0.7 });
  return out;
})();

// il Falcon parcheggiato in lontananza, visto di profilo
function drawFalconSilhouette(cx, cy, w) {
  const h = w * 0.3;
  ctx.fillStyle = "#151821";
  ctx.strokeStyle = "#262b38";
  ctx.lineWidth = 1;
  // carrelli
  ctx.fillRect(cx - w * 0.24, cy - h * 0.16, w * 0.05, h * 0.16);
  ctx.fillRect(cx + w * 0.16, cy - h * 0.16, w * 0.05, h * 0.16);
  // scafo lenticolare
  ctx.beginPath();
  ctx.ellipse(cx, cy - h * 0.5, w / 2, h * 0.38, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  // torretta e cockpit
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.05, cy - h * 0.86, w * 0.1, h * 0.14, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.4, cy - h * 0.5, w * 0.08, h * 0.16, 0, 0, TAU);
  ctx.fill();
  // luci di posizione
  ctx.fillStyle = "rgba(150,200,255,0.7)";
  for (const lx of [-0.32, -0.1, 0.14, 0.34]) {
    ctx.fillRect(cx + w * lx, cy - h * 0.5, 1.6, 1.6);
  }
  // bagliore dei motori in stand-by
  ctx.fillStyle = "rgba(120,190,255," + (0.12 + 0.06 * Math.sin(G.time * 2)).toFixed(2) + ")";
  ctx.fillRect(cx - w * 0.42, cy - h * 0.58, w * 0.1, h * 0.16);
}

function drawCorridor() {
  const GY = H * 0.74;
  ctx.fillStyle = "#06070c";
  ctx.fillRect(0, 0, W, H);

  // striscia d'allarme
  ctx.fillStyle = "rgba(255,45,45," + (0.22 + 0.18 * Math.sin(G.time * 4)).toFixed(2) + ")";
  ctx.fillRect(0, 0, W, H * 0.014);

  // apertura dell'hangar: stelle e Falcon in attesa
  const ox0 = W * 0.34, ox1 = W * 0.66, oy0 = H * 0.16;
  ctx.fillStyle = "#04050a";
  ctx.fillRect(ox0, oy0, ox1 - ox0, GY - oy0);
  for (const st of hangarStars) {
    const tw = 0.6 + 0.4 * Math.sin(G.time * 1.5 + st.x * 9);
    ctx.fillStyle = "rgba(255,255,255," + (st.a * tw * 0.8).toFixed(2) + ")";
    ctx.fillRect(ox0 + st.x * (ox1 - ox0), oy0 + st.y * (GY - oy0) * 0.75, 1.5, 1.5);
  }
  drawFalconSilhouette(W * 0.5, GY - 2, (ox1 - ox0) * 0.56);
  // cornice luminosa dell'apertura
  for (const ex of [ox0 - 5, ox1 + 1]) {
    const fl = 0.22 + 0.08 * Math.sin(G.time * 3 + ex);
    const g = ctx.createLinearGradient(0, oy0, 0, GY);
    g.addColorStop(0, "rgba(170,200,255," + (fl * 0.5).toFixed(2) + ")");
    g.addColorStop(0.5, "rgba(170,200,255," + fl.toFixed(2) + ")");
    g.addColorStop(1, "rgba(170,200,255," + (fl * 0.4).toFixed(2) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(ex, oy0, 4, GY - oy0);
  }
  ctx.fillStyle = "rgba(170,200,255,0.16)";
  ctx.fillRect(ox0 - 5, oy0 - 4, ox1 - ox0 + 10, 4);

  // pannellature delle pareti laterali
  ctx.strokeStyle = "rgba(90,110,150,0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const px = (W / 8) * i;
    if (px > ox0 - 10 && px < ox1 + 10) continue;
    ctx.beginPath(); ctx.moveTo(px, H * 0.06); ctx.lineTo(px, GY); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, H * 0.3); ctx.lineTo(ox0 - 5, H * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox1 + 5, H * 0.3); ctx.lineTo(W, H * 0.3); ctx.stroke();

  // colonne di luce laterali
  for (const cx of [W * 0.1, W * 0.24, W * 0.76, W * 0.9]) {
    const fl = 0.09 + 0.05 * Math.sin(G.time * 3 + cx);
    const g = ctx.createLinearGradient(0, H * 0.08, 0, GY);
    g.addColorStop(0, "rgba(170,200,255," + (fl * 0.6).toFixed(2) + ")");
    g.addColorStop(0.5, "rgba(170,200,255," + fl.toFixed(2) + ")");
    g.addColorStop(1, "rgba(170,200,255," + (fl * 0.4).toFixed(2) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(cx - 4, H * 0.08, 8, GY - H * 0.08);
  }

  // pulviscolo nei fasci di luce
  for (const m of duelDust) {
    const my = H * 0.08 + ((m.y + G.time * 0.008 * m.s) % 1) * (GY - H * 0.1);
    const mx = m.x * W + Math.sin(G.time * 0.5 + m.ph) * 6;
    ctx.fillStyle = "rgba(200,220,255," + (0.04 + 0.05 * (0.5 + 0.5 * Math.sin(G.time + m.ph))).toFixed(3) + ")";
    ctx.fillRect(mx, my, 1.5, 1.5);
  }

  // pavimento nero lucido
  ctx.fillStyle = "#04050a";
  ctx.fillRect(0, GY, W, H - GY);
  ctx.strokeStyle = "rgba(120,150,200,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(W, GY); ctx.stroke();
}

function drawSaberBlade(hx, hy, ang, len, rgb, S) {
  const tx = hx + Math.cos(ang) * len, ty = hy + Math.sin(ang) * len;
  ctx.lineCap = "round";
  for (const [w, a] of [[13, 0.1], [7, 0.25], [3.6, 0.8]]) {
    ctx.strokeStyle = "rgba(" + rgb + "," + a + ")";
    ctx.lineWidth = S * w;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = S * 1.7;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
  return { tx, ty };
}

function drawSaberGroundGlow(x, GY, rgb) {
  const g = ctx.createRadialGradient(x, GY + 6, 0, x, GY + 6, MINWH * 0.09);
  g.addColorStop(0, "rgba(" + rgb + ",0.18)");
  g.addColorStop(1, "rgba(" + rgb + ",0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, GY + 6, MINWH * 0.09, MINWH * 0.018, 0, 0, TAU); ctx.fill();
}

function drawSaberTrail(arr, rgb) {
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1], b = arr[i];
    const al = Math.min(a.life, b.life) * 0.16;
    if (al <= 0.01) continue;
    ctx.fillStyle = "rgba(" + rgb + "," + al.toFixed(3) + ")";
    poly([[a.hx, a.hy], [a.tx, a.ty], [b.tx, b.ty], [b.hx, b.hy]]);
    ctx.fill();
  }
}

function drawFlyingSaber(s, S, GY) {
  const y = GY - S * 75;
  ctx.save();
  ctx.translate(s.x, y);
  // alone circolare della rotazione
  ctx.strokeStyle = "rgba(255,60,50,0.15)";
  ctx.lineWidth = S * 7;
  ctx.beginPath(); ctx.arc(0, 0, S * 44, 0, TAU); ctx.stroke();
  ctx.rotate(s.spin);
  // elsa al centro, lama da un lato
  ctx.strokeStyle = "#9aa0ad";
  ctx.lineWidth = S * 4;
  ctx.beginPath(); ctx.moveTo(-S * 12, 0); ctx.lineTo(0, 0); ctx.stroke();
  drawSaberBlade(0, 0, 0, S * 80, "255,60,50", S);
  ctx.restore();
}

// arto con articolazione (gomito/ginocchio) calcolata sulla perpendicolare
function limbSeg(x1, y1, x2, y2, bend, color, w) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ex = mx - (dy / len) * bend, ey = my + (dx / len) * bend;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(ex, ey);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  return [ex, ey];
}

function drawLukeChar(l, S, GY) {
  ctx.save();
  ctx.translate(l.x, GY + (l.airY || 0));
  if (l.rot) {
    ctx.translate(0, -S * 50);
    ctx.rotate(l.rot);
    ctx.translate(0, S * 50);
  }
  ctx.scale(l.face, 1);
  if (l.hurtT > 0 && Math.sin(G.time * 40) > 0) ctx.globalAlpha *= 0.55;
  const airborne = (l.airY || 0) < -1;
  const walk = !airborne && l.moving > 0 ? Math.sin(l.walkT * 11) : 0;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const PANT = "#b7ac91", BOOT = "#4a3f33", TUNIC = "#ddd6c2", TUNIC2 = "#cbc4ae",
        SKIN = "#e8c39e", HAIR = "#d9b26a", BELT = "#6b5136";

  // ---- gambe con ginocchia ----
  if (airborne) {
    limbSeg(-S * 2, -S * 46, S * 8, -S * 16, S * 8, PANT, S * 7.5);
    limbSeg(-S * 2, -S * 46, -S * 9, -S * 20, -S * 8, PANT, S * 7.5);
    // stivali raccolti
    ctx.strokeStyle = BOOT; ctx.lineWidth = S * 8;
    ctx.beginPath(); ctx.moveTo(S * 8, -S * 16); ctx.lineTo(S * 11, -S * 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-S * 9, -S * 20); ctx.lineTo(-S * 12, -S * 16); ctx.stroke();
  } else {
    const f1 = S * (10 + walk * 7), f2 = S * (-11 - walk * 7);
    limbSeg(-S * 2, -S * 46, f1, -S * 6, S * 6, PANT, S * 7.5);
    limbSeg(-S * 2, -S * 46, f2, -S * 6, -S * 5, PANT, S * 7.5);
    // stivali con punta
    ctx.strokeStyle = BOOT; ctx.lineWidth = S * 8;
    ctx.beginPath(); ctx.moveTo(f1, -S * 13); ctx.lineTo(f1, -S * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(f2, -S * 13); ctx.lineTo(f2, -S * 2); ctx.stroke();
    ctx.fillStyle = BOOT;
    ctx.beginPath(); ctx.ellipse(f1 + S * 3.5, -S * 2, S * 5, S * 2.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(f2 + S * 3.5, -S * 2, S * 5, S * 2.6, 0, 0, TAU); ctx.fill();
  }

  // ---- braccio posteriore (doppia presa, dietro il torso) ----
  const shx = S * 8, shy = -S * 80;
  const hx = shx + Math.cos(l.armAng) * S * 26;
  const hy = shy + Math.sin(l.armAng) * S * 26;
  const bhx = hx - Math.cos(l.armAng) * S * 6;
  const bhy = hy - Math.sin(l.armAng) * S * 6;
  limbSeg(-S * 7, -S * 79, bhx, bhy, -S * 6, TUNIC2, S * 5.5);

  // ---- tunica con falda ----
  ctx.fillStyle = TUNIC;
  ctx.strokeStyle = "#a39c88";
  ctx.lineWidth = S * 1.2;
  ctx.beginPath();
  ctx.moveTo(-S * 11, -S * 84);
  ctx.lineTo(S * 11, -S * 84);
  ctx.quadraticCurveTo(S * 10.5, -S * 62, S * 8.5, -S * 52);
  ctx.lineTo(S * 12, -S * 37);
  ctx.lineTo(-S * 12, -S * 37);
  ctx.lineTo(-S * 8.5, -S * 52);
  ctx.quadraticCurveTo(-S * 10.5, -S * 62, -S * 11, -S * 84);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // spacco della falda
  ctx.strokeStyle = "#b8b09a";
  ctx.beginPath(); ctx.moveTo(0, -S * 50); ctx.lineTo(0, -S * 38); ctx.stroke();
  // risvolti a V
  ctx.fillStyle = "#eae4d2";
  poly([[-S * 6.5, -S * 84], [0, -S * 66], [-S * 1.8, -S * 64], [-S * 9, -S * 84]]);
  ctx.fill();
  poly([[S * 6.5, -S * 84], [0, -S * 66], [S * 1.8, -S * 64], [S * 9, -S * 84]]);
  ctx.fill();
  ctx.fillStyle = SKIN;
  poly([[-S * 3.5, -S * 84], [S * 3.5, -S * 84], [0, -S * 75]]);
  ctx.fill();
  // cintura con fibbia
  ctx.fillStyle = BELT;
  ctx.fillRect(-S * 10, -S * 55, S * 20, S * 5.5);
  ctx.fillStyle = "#c9b37a";
  ctx.fillRect(-S * 2.2, -S * 54.6, S * 4.4, S * 4.7);

  // ---- testa di profilo ----
  ctx.strokeStyle = SKIN;
  ctx.lineWidth = S * 5;
  ctx.beginPath(); ctx.moveTo(S * 1, -S * 84); ctx.lineTo(S * 2, -S * 90); ctx.stroke(); // collo
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.ellipse(S * 2.5, -S * 99, S * 9.5, S * 10.5, 0, 0, TAU); ctx.fill();
  // naso e mento
  poly([[S * 11, -S * 102], [S * 13.6, -S * 98.5], [S * 10.5, -S * 96.5]]);
  ctx.fill();
  // orecchio
  ctx.fillStyle = "#d8b28c";
  ctx.beginPath(); ctx.ellipse(S * 0.5, -S * 98, S * 2, S * 3, 0, 0, TAU); ctx.fill();
  // occhio e sopracciglio
  ctx.fillStyle = "#3a3226";
  ctx.beginPath(); ctx.ellipse(S * 8, -S * 100.5, S * 1.3, S * 1.7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#8a6f3f";
  ctx.lineWidth = S * 1.1;
  ctx.beginPath(); ctx.moveTo(S * 6, -S * 103.5); ctx.lineTo(S * 10.5, -S * 103); ctx.stroke();
  // bocca
  ctx.strokeStyle = "#b98d6d";
  ctx.beginPath(); ctx.moveTo(S * 8.5, -S * 94.5); ctx.lineTo(S * 11, -S * 94); ctx.stroke();
  // capelli con ciuffo
  ctx.fillStyle = HAIR;
  ctx.strokeStyle = "#b28f4d";
  ctx.lineWidth = S * 0.9;
  ctx.beginPath();
  ctx.moveTo(S * 10.5, -S * 105);
  ctx.quadraticCurveTo(S * 12, -S * 109, S * 8, -S * 110.5);
  ctx.quadraticCurveTo(S * 3, -S * 112.5, -S * 3, -S * 110);
  ctx.quadraticCurveTo(-S * 8.5, -S * 107.5, -S * 7.5, -S * 100);
  ctx.quadraticCurveTo(-S * 7.8, -S * 94, -S * 5.5, -S * 91);
  ctx.quadraticCurveTo(-S * 4.5, -S * 97, -S * 5.5, -S * 102);
  ctx.quadraticCurveTo(S * 0, -S * 106.5, S * 5, -S * 105.5);
  ctx.quadraticCurveTo(S * 8, -S * 104.5, S * 10.5, -S * 105);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // ---- braccio anteriore con gomito + spada ----
  limbSeg(shx, shy, hx, hy, S * 6, TUNIC, S * 6);
  ctx.strokeStyle = "#9aa0ad";
  ctx.lineWidth = S * 4;
  ctx.beginPath();
  ctx.moveTo(hx - Math.cos(l.armAng) * S * 9, hy - Math.sin(l.armAng) * S * 9);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  const lk = l.bladeK !== undefined ? l.bladeK : 1;
  if (lk > 0.02) drawSaberBlade(hx, hy, l.armAng, S * 88 * lk, "80,255,110", S);
  // mani sull'elsa
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.arc(hx, hy, S * 3.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(bhx, bhy, S * 3, 0, TAU); ctx.fill();

  ctx.restore();
  if (!duelReflectPass && (l.airY || 0) > -S * 20)
    drawSaberGroundGlow(l.x + l.face * Math.cos(l.armAng) * S * 60, GY, "80,255,110");
}

function drawVaderChar(v, S, GY) {
  ctx.save();
  ctx.translate(v.x, GY);
  ctx.globalAlpha *= v.alpha !== undefined ? v.alpha : 1;
  ctx.scale(v.face, 1);
  if (v.hurtT > 0 && Math.sin(G.time * 40) > 0) ctx.globalAlpha *= 0.6;
  const kneel = v.kneel || 0;
  ctx.translate(0, kneel * S * 22);
  ctx.rotate(kneel * 0.18);
  const VS = S * 1.16;
  const walk = v.state === "approach" ? Math.sin(v.walkT * 9) : 0;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const SUIT = "#14141a", ARMOR = "#1c1c26", EDGE = "#34343f", GLOVE = "#0a0a0f";

  // ---- mantello a due strati, ondeggia ----
  const sway = Math.sin(G.time * 2.1) * VS * (v.state === "approach" ? 8 : 4);
  ctx.fillStyle = "#060609";
  ctx.beginPath();
  ctx.moveTo(VS * 8, -VS * 88);
  ctx.quadraticCurveTo(-VS * 14 - sway * 0.4, -VS * 60, -VS * 24 - sway, -VS * 4);
  ctx.quadraticCurveTo(-VS * 12 - sway * 0.5, -VS * 14, -VS * 2, -VS * 10);
  ctx.lineTo(VS * 4, -VS * 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#101018";
  ctx.beginPath();
  ctx.moveTo(VS * 6, -VS * 86);
  ctx.quadraticCurveTo(-VS * 8 - sway * 0.3, -VS * 52, -VS * 14 - sway * 0.7, -VS * 8);
  ctx.quadraticCurveTo(-VS * 4, -VS * 16, VS * 3, -VS * 24);
  ctx.closePath();
  ctx.fill();

  // ---- gambe pesanti con ginocchia ----
  limbSeg(-VS * 2, -VS * 46, VS * (10 + walk * 5), -VS * 5, VS * 6, SUIT, VS * 9);
  limbSeg(-VS * 2, -VS * 46, VS * (-11 - walk * 5), -VS * 5, -VS * 5, SUIT, VS * 9);
  ctx.fillStyle = GLOVE;
  ctx.beginPath(); ctx.ellipse(VS * (10 + walk * 5) + VS * 3, -VS * 2, VS * 6, VS * 3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(VS * (-11 - walk * 5) + VS * 3, -VS * 2, VS * 6, VS * 3, 0, 0, TAU); ctx.fill();

  // ---- tabarro frontale ----
  ctx.fillStyle = "#0e0e14";
  poly([[-VS * 8, -VS * 50], [VS * 8, -VS * 50], [VS * 6, -VS * 24], [-VS * 6, -VS * 24]]);
  ctx.fill();

  // ---- torso corazzato con spalle larghe ----
  ctx.fillStyle = SUIT;
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = VS * 1.3;
  ctx.beginPath();
  ctx.moveTo(-VS * 16, -VS * 86);
  ctx.lineTo(VS * 16, -VS * 86);
  ctx.quadraticCurveTo(VS * 14, -VS * 66, VS * 11, -VS * 50);
  ctx.lineTo(-VS * 11, -VS * 50);
  ctx.quadraticCurveTo(-VS * 14, -VS * 66, -VS * 16, -VS * 86);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // trapunta della tuta
  ctx.strokeStyle = "rgba(60,60,75,0.5)";
  ctx.lineWidth = VS * 0.9;
  ctx.beginPath();
  ctx.moveTo(-VS * 9, -VS * 62); ctx.lineTo(VS * 9, -VS * 64);
  ctx.moveTo(-VS * 10, -VS * 56); ctx.lineTo(VS * 10, -VS * 58);
  ctx.stroke();
  // spallacci (bassi, coperti al centro dalla gonna dell'elmo)
  ctx.fillStyle = ARMOR;
  ctx.strokeStyle = EDGE;
  ctx.beginPath();
  ctx.moveTo(-VS * 17, -VS * 84);
  ctx.quadraticCurveTo(-VS * 10, -VS * 91.5, VS * 0, -VS * 89.5);
  ctx.quadraticCurveTo(VS * 10, -VS * 91.5, VS * 17, -VS * 84);
  ctx.quadraticCurveTo(VS * 8, -VS * 87, 0, -VS * 86.5);
  ctx.quadraticCurveTo(-VS * 8, -VS * 87, -VS * 17, -VS * 84);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // ---- scatola pettorale ----
  ctx.fillStyle = "#262630";
  ctx.strokeStyle = EDGE;
  ctx.fillRect(-VS * 7, -VS * 80, VS * 13, VS * 11);
  ctx.strokeRect(-VS * 7, -VS * 80, VS * 13, VS * 11);
  ctx.fillStyle = "#ff4b4b"; ctx.fillRect(-VS * 5.4, -VS * 78, VS * 2.2, VS * 2.2);
  ctx.fillStyle = "#59ff8a"; ctx.fillRect(-VS * 1.8, -VS * 78, VS * 2.2, VS * 2.2);
  ctx.fillStyle = "#7fd4ff"; ctx.fillRect(VS * 1.8, -VS * 78, VS * 2.2, VS * 2.2);
  ctx.fillStyle = "#3d3d4a";
  ctx.fillRect(-VS * 5.4, -VS * 74.5, VS * 9.4, VS * 1.6);
  ctx.fillRect(-VS * 5.4, -VS * 72, VS * 6.4, VS * 1.6);
  // cintura con fibbia
  ctx.fillStyle = "#0b0b10";
  ctx.fillRect(-VS * 12.5, -VS * 53, VS * 25, VS * 6);
  ctx.fillStyle = "#3d3d4a";
  ctx.fillRect(-VS * 3.6, -VS * 52.5, VS * 7.2, VS * 5);
  ctx.fillStyle = "#1c1c26";
  ctx.fillRect(-VS * 11, -VS * 52.2, VS * 4.6, VS * 4.4);
  ctx.fillRect(VS * 6.6, -VS * 52.2, VS * 4.6, VS * 4.4);

  // ---- elmo iconico ----
  // gonna del collo, larga fino alle spalle
  ctx.fillStyle = "#101018";
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = VS * 1.1;
  ctx.beginPath();
  ctx.moveTo(-VS * 16, -VS * 85);
  ctx.quadraticCurveTo(-VS * 14, -VS * 97, -VS * 7, -VS * 100);
  ctx.lineTo(VS * 7, -VS * 100);
  ctx.quadraticCurveTo(VS * 13, -VS * 97, VS * 15, -VS * 85);
  ctx.quadraticCurveTo(VS * 0, -VS * 92, -VS * 16, -VS * 85);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // maschera frontale grande (la cupola si ferma sopra la fronte)
  ctx.fillStyle = "#232330";
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = VS * 1;
  ctx.beginPath();
  ctx.moveTo(-VS * 2, -VS * 107.5);
  ctx.lineTo(VS * 13.5, -VS * 106.5);
  ctx.quadraticCurveTo(VS * 15.5, -VS * 98, VS * 12, -VS * 92.5);
  ctx.quadraticCurveTo(VS * 9, -VS * 88.8, VS * 4, -VS * 89.2);
  ctx.quadraticCurveTo(-VS * 1.5, -VS * 90.5, -VS * 2.5, -VS * 97);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // cupola: calotta su cranio e nuca, bordo netto sopra la fronte
  ctx.fillStyle = "#15151f";
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = VS * 1.1;
  ctx.beginPath();
  ctx.moveTo(-VS * 13, -VS * 96);
  ctx.bezierCurveTo(-VS * 17, -VS * 112, -VS * 8, -VS * 124.5, VS * 2, -VS * 124.5);
  ctx.bezierCurveTo(VS * 11.5, -VS * 124.5, VS * 16, -VS * 113, VS * 13.8, -VS * 106);
  ctx.quadraticCurveTo(VS * 6, -VS * 104, VS * 0, -VS * 106);
  ctx.quadraticCurveTo(-VS * 6, -VS * 108, -VS * 13, -VS * 96);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // riflesso della cupola
  ctx.strokeStyle = "rgba(150,160,190,0.28)";
  ctx.lineWidth = VS * 1.6;
  ctx.beginPath();
  ctx.moveTo(-VS * 9, -VS * 107);
  ctx.quadraticCurveTo(-VS * 6, -VS * 119, VS * 2, -VS * 121);
  ctx.stroke();
  // lenti a mandorla (sempre accese, brillano di piu' nella fase 2)
  const p2 = v.phase2;
  {
    const lg = p2 ? 0.5 + 0.5 * Math.sin(G.time * 6) : 0.4 + 0.15 * Math.sin(G.time * 2.5);
    ctx.fillStyle = "rgba(255,40,40," + ((p2 ? 0.3 : 0.13) * lg).toFixed(3) + ")";
    ctx.beginPath();
    ctx.ellipse(VS * 2.5, -VS * 100, VS * 4.6, VS * 3.6, -0.15, 0, TAU);
    ctx.ellipse(VS * 9.5, -VS * 99.5, VS * 4.4, VS * 3.4, 0.15, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = p2 ? "#8e1218" : "#241014";
  ctx.strokeStyle = "#454552";
  ctx.lineWidth = VS * 1;
  ctx.beginPath(); ctx.ellipse(VS * 2.5, -VS * 100.5, VS * 3.6, VS * 2.8, -0.18, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(VS * 10, -VS * 100, VS * 3.4, VS * 2.7, 0.18, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,120,120,0.16)";
  ctx.beginPath(); ctx.arc(VS * 1.6, -VS * 100.8, VS * 0.5, 0, TAU); ctx.arc(VS * 8.6, -VS * 100.3, VS * 0.5, 0, TAU); ctx.fill();
  // naso triangolare
  ctx.fillStyle = "#0c0c12";
  poly([[VS * 4.5, -VS * 96.5], [VS * 7.5, -VS * 96.3], [VS * 6, -VS * 93.8]]);
  ctx.fill();
  // griglia della bocca
  ctx.fillStyle = "#16161e";
  ctx.strokeStyle = EDGE;
  poly([[VS * 3, -VS * 93.5], [VS * 9.5, -VS * 93.2], [VS * 8.5, -VS * 90], [VS * 4, -VS * 90.2]]);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#2c2c38";
  ctx.lineWidth = VS * 0.8;
  ctx.beginPath();
  ctx.moveTo(VS * 4.8, -VS * 93.3); ctx.lineTo(VS * 5.1, -VS * 90.2);
  ctx.moveTo(VS * 6.3, -VS * 93.3); ctx.lineTo(VS * 6.5, -VS * 90.1);
  ctx.moveTo(VS * 7.8, -VS * 93.2); ctx.lineTo(VS * 7.9, -VS * 90.1);
  ctx.stroke();

  // ---- braccio con gomito, guanto e spada ----
  const shx = VS * 10, shy = -VS * 82;
  const hx = shx + Math.cos(v.armAng) * VS * 28;
  const hy = shy + Math.sin(v.armAng) * VS * 28;
  limbSeg(shx, shy, hx, hy, -VS * 6, SUIT, VS * 7);
  ctx.strokeStyle = "#9aa0ad";
  ctx.lineWidth = VS * 4;
  ctx.beginPath();
  ctx.moveTo(hx - Math.cos(v.armAng) * VS * 9, hy - Math.sin(v.armAng) * VS * 9);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  const hasBlade = v.hasBlade !== false;
  const bk = (v.bladeK !== undefined ? v.bladeK : 1) * (1 - kneel * 0.9);
  if (hasBlade && bk > 0.02) drawSaberBlade(hx, hy, v.armAng, VS * 92 * bk, "255,60,50", VS);
  ctx.fillStyle = GLOVE;
  ctx.beginPath(); ctx.arc(hx, hy, VS * 3.8, 0, TAU); ctx.fill();

  ctx.restore();
  if (!duelReflectPass && (v.alpha === undefined || v.alpha > 0.3) && !(v.kneel > 0.5) && v.hasBlade !== false)
    drawSaberGroundGlow(v.x + v.face * Math.cos(v.armAng) * S * 62, GY, "255,60,50");
}

function drawDuel() {
  const d = duel, l = d.luke, v = d.vader;
  const S = MINWH / 420, GY = H * 0.74;

  drawCorridor();

  // riflessi sul pavimento lucido (duellanti capovolti, in dissolvenza)
  duelReflectPass = true;
  ctx.save();
  ctx.translate(0, 2 * GY);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.16;
  if (d.saber) drawFlyingSaber(d.saber, S, GY);
  drawVaderChar(v, S, GY);
  drawLukeChar(l, S, GY);
  ctx.restore();
  ctx.globalAlpha = 1;
  duelReflectPass = false;
  const rg = ctx.createLinearGradient(0, GY, 0, H);
  rg.addColorStop(0, "rgba(4,5,10,0.25)");
  rg.addColorStop(1, "rgba(4,5,10,0.95)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, GY, W, H - GY);

  // vignetta rossa quando il lato oscuro si risveglia
  if (v.phase2 || d.phase2Cine > 0) {
    const k = d.phase2Cine > 0 ? 0.5 + 0.5 * Math.sin(G.time * 10) : 0.6;
    const vg = ctx.createRadialGradient(W / 2, H / 2, MINWH * 0.25, W / 2, H / 2, MINWH * 0.75);
    vg.addColorStop(0, "rgba(255,40,40,0)");
    vg.addColorStop(1, "rgba(255,40,40," + (0.12 * k).toFixed(3) + ")");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // anelli della spinta di Forza
  for (const r of d.rings) {
    ctx.strokeStyle = "rgba(190,120,255," + r.a.toFixed(2) + ")";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }

  // scie delle lame
  drawSaberTrail(d.trailV, "255,60,50");
  drawSaberTrail(d.trailL, "80,255,110");

  if (d.saber) drawFlyingSaber(d.saber, S, GY);

  drawVaderChar(v, S, GY);
  drawLukeChar(l, S, GY);

  // alone delle lame nell'aria
  const hazes = [[bladePts(l, S, GY, false), "80,255,110", l.bladeK]];
  if (v.hasBlade !== false && v.bladeK > 0.05) hazes.push([bladePts(v, S, GY, true), "255,60,50", 1]);
  for (const [bp, col, k] of hazes) {
    if (!k || k < 0.05) continue;
    const mx = (bp.hx + bp.tx) / 2, my = (bp.hy + bp.ty) / 2;
    const hg = ctx.createRadialGradient(mx, my, 0, mx, my, S * 170);
    hg.addColorStop(0, "rgba(" + col + ",0.1)");
    hg.addColorStop(1, "rgba(" + col + ",0)");
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(mx, my, S * 170, 0, TAU); ctx.fill();
  }

  drawParts(d.sparks);

  // testi fluttuanti
  for (const f of d.floats) {
    ctx.globalAlpha = clamp(1 - f.t / 1.15, 0, 1);
    text(f.txt, f.x, f.y - f.t * 46, Math.max(13, MINWH * 0.022), f.col, "center", true);
  }
  ctx.globalAlpha = 1;

  // barre dei duellanti (lampeggiano quando colpiti)
  ctx.globalAlpha = l.hurtT > 0 && Math.sin(G.time * 30) > 0 ? 0.5 : 1;
  text("LUKE SKYWALKER", 18, 24, 13, "#bfe6a8", "left", true);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < l.hp ? "#59ff8a" : "rgba(120,130,160,0.25)";
    ctx.fillRect(18 + i * 26, 34, 22, 9);
  }
  ctx.globalAlpha = v.hurtT > 0 && Math.sin(G.time * 30) > 0 ? 0.5 : 1;
  text("DARTH VADER", W - 18, 24, 13, "#ff8c85", "right", true);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i < v.hp ? "#ff5c5c" : "rgba(120,130,160,0.25)";
    ctx.fillRect(W - 18 - (i + 1) * 22, 34, 18, 9);
  }
  ctx.globalAlpha = 1;
  if (NARROW()) text("PUNTI  " + fmtScore(G.score), W / 2, H - 14, 13, "#8fa2c5");
  else text("PUNTI  " + fmtScore(G.score), W / 2, 24, 13, "#8fa2c5");

  // incrocio di lame: barra di contesa
  if (d.lock) {
    const bw = MINWH * 0.4, bx = W / 2 - bw / 2, by = H * 0.17;
    text("INCROCIO DI LAME!", W / 2, by - 26, Math.max(16, MINWH * 0.03), "#ffe81f", "center", true);
    if (Math.sin(G.time * 12) > -0.4)
      text("MARTELLA SPAZIO!", W / 2, by + 30, Math.max(13, MINWH * 0.024), "#ffffff", "center", true);
    ctx.fillStyle = "rgba(120,130,160,0.25)";
    ctx.fillRect(bx, by, bw, 12);
    ctx.fillStyle = d.lock.meter >= 0.55 ? "#59ff8a" : "#ff8c85";
    ctx.fillRect(bx, by, bw * d.lock.meter, 12);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx + bw * 0.55, by - 3); ctx.lineTo(bx + bw * 0.55, by + 15); ctx.stroke();
  }

  // battuta di Vader
  if (v.quoteT > 0 && d.overT === 0) {
    ctx.globalAlpha = clamp(v.quoteT / 0.4, 0, 1);
    text(v.quote, clamp(v.x, W * 0.2, W * 0.8), GY - S * 155, Math.max(12, MINWH * 0.02), "#c5cde0");
    ctx.globalAlpha = 1;
  }

  if (d.introT > 0 && d.introT < 1.3) {
    text("DUELLO!", W / 2, H * 0.3, Math.max(30, MINWH * 0.07), "#ffe81f", "center", true);
    textWrap("SPAZIO attacco · SU salto (e SPAZIO in volo: colpo dall'alto) · GIÙ/S parata", W / 2, H * 0.4, Math.max(11, Math.min(MINWH * 0.019, W * 0.03)), "#c5cde0", "center", false, W * 0.9);
  }
  if (d.overT > 0.4)
    text("La via è libera: corri al tuo caccia!", W / 2, H * 0.3, Math.max(15, MINWH * 0.028), "#ffe81f", "center", true);

  // lampo dei colpi
  if (d.hitStop > 0.045) {
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(0, 0, W, H);
  }

  if (AudioFX.muted) text("AUDIO OFF (M)", W - 18, H - 12, 10, "#4d5670", "right");

  // pulsanti touch
  if (hasTouch) {
    const fb = fireBtn(), tb = torpBtn();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#ff8c85"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r, 0, TAU); ctx.stroke();
    text("ATTACCO", fb.x, fb.y, 12, "#ff8c85");
    ctx.strokeStyle = "#7fd4ff";
    ctx.beginPath(); ctx.arc(tb.x, tb.y, tb.r, 0, TAU); ctx.stroke();
    text("PARATA", tb.x, tb.y, 12, "#7fd4ff");
    ctx.globalAlpha = 1;
    text("trascina in su = salto", W * 0.3, H - 16, 10, "#4d5670");
  }
}

// ============================================================
// CUTSCENE — AVVICINAMENTO
// ============================================================
let approach = null;

function updateApproach(dt) {
  approach.t += dt;
  if (approach.t > 3.4) {
    initTrench();
    G.screen = "trench";
    AudioFX.humStart();
  }
}

function drawApproach() {
  const t = approach.t;
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);

  // stelle che filano (pseudo-iperspazio)
  const cx = W / 2, cy = H / 2;
  for (const s of stars) {
    const sx = s.x * W, sy = s.y * H;
    const dx = sx - cx, dy = sy - cy;
    const stretch = 1 + t * 3 * s.z;
    ctx.strokeStyle = "rgba(200,220,255," + (0.25 + 0.5 * s.z) + ")";
    ctx.lineWidth = s.z > 0.7 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + dx, cy + dy);
    ctx.lineTo(cx + dx * stretch, cy + dy * stretch);
    ctx.stroke();
  }

  const k = clamp(t / 3.0, 0, 1);
  const r = lerp(MINWH * 0.22, MINWH * 1.35, k * k);
  drawDeathStar(W / 2, H * (0.35 + 0.45 * k), r, 1, 0);

  if (t > 2.6) {
    ctx.fillStyle = "rgba(255,255,255," + clamp((t - 2.6) / 0.8, 0, 1) + ")";
    ctx.fillRect(0, 0, W, H);
  }
  text("IN AVVICINAMENTO ALLA SUPERFICIE…", W / 2, H * 0.12, Math.max(15, MINWH * 0.025), "#ffe81f", "center", true);
  drawHUD();
}

// ============================================================
// FASE 2 — LA TRINCEA
// ============================================================
let trench = null;
const TR = { CAMBACK: 1.6, TOPH: 1.35, SPAWN: 50, HORIZON: 0.40, F: 800 };

const trenchGreebles = (() => {
  const rng = mulberry32(424242);
  const out = [];
  for (let i = 0; i < 46; i++) {
    out.push({
      type: "wall",
      side: rng() < 0.5 ? -1 : 1,
      y: 0.12 + rng() * 1.0,
      h: 0.06 + rng() * 0.22,
      zOff: rng() * 56,
      len: 0.8 + rng() * 2.6,
      a: 0.1 + rng() * 0.22,
    });
  }
  // strisce sul pavimento: rafforzano la sensazione di velocità e il piano del suolo
  for (let i = 0; i < 14; i++) {
    out.push({
      type: "floor",
      x: -0.85 + rng() * 1.64,
      w: 0.05 + rng() * 0.06,
      zOff: rng() * 56,
      len: 1 + rng() * 2.2,
      a: 0.08 + rng() * 0.14,
    });
  }
  return out;
})();

function initTrench() {
  trench = {
    ship: { x: 0, y: 0.55, vx: 0, vy: 0, lives: 3, shield: 3, inv: 0 },
    speed: 26,
    dist: 0,
    portAt: 1150,
    firstPortAt: 1150,
    nextSpawn: 34,
    rng: mulberry32(99173),
    obstacles: [], turrets: [], ties: [], bolts: [], lasers: [], torps: [], parts3: [], parts: [],
    skyBolts: [],
    nextTieAt: 55,
    port: null,
    portWarned: false,
    torpedoes: 8,
    fireCd: 0, tip: 0,
    locked: false,
    passes: 0,
    warnObs: null,
    slowT: 0,
    hintT: 3.6,
    aimTarget: null,
    aimLocked: false,
    hitMarkT: 0,
    floats3: [],
  };
  G.trenchStartScore = G.score;
  showYoda(3.2);
}

function proj(px, py, pz) {
  const denom = Math.max(0.18, pz + TR.CAMBACK);
  const f = TR.F;
  return {
    x: W / 2 + (px - trench.camX) * f / denom,
    y: H * TR.HORIZON - (py - trench.camY) * f / denom,
    s: f / denom,
  };
}

function trenchHitPlayer() {
  const sh = trench.ship;
  if (sh.inv > 0) return;
  sh.shield--;
  AudioFX.hit();
  G.shake = 14;
  trench.slowT = 0.9; // breve rallentamento per riprendere il controllo
  if (sh.shield < 0) {
    sh.lives--;
    AudioFX.boom();
    spawnBurst(trench.parts, W / 2, H * 0.62, 30, EXPL_COLS, 280, 0.9);
    if (sh.lives <= 0) {
      AudioFX.humStop();
      gameOver("trench", "R2 non risponde… il caccia è perduto nella trincea.");
      return;
    }
    sh.shield = 3;
    sh.inv = 2.6;
    sh.x = 0; sh.y = 0.55;
  } else {
    sh.inv = 1.5;
  }
}

function trenchSpawn() {
  const t = trench, rng = t.rng;
  const prog = clamp(t.dist / t.firstPortAt, 0, 1);
  const z = TR.SPAWN;

  // piccole sporgenze attaccate alle pareti: 1 o 2 (su lati opposti, sfalsate)
  const n = rng() < 0.45 + prog * 0.25 ? 2 : 1;
  let firstLeft = rng() < 0.5;
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? firstLeft : !firstLeft;
    const len = rand2(rng, lerp(0.3, 0.38, prog), lerp(0.48, 0.62, prog));
    const yc = rand2(rng, 0.26, 1.06);
    const h = rand2(rng, 0.28, 0.44);
    const o = {
      kind: "stub",
      y0: Math.max(0.02, yc - h / 2),
      y1: Math.min(1.28, yc + h / 2),
      z: z + i * rand2(rng, 2.5, 4.5),
      hitDone: false,
    };
    if (left) { o.x0 = -1.06; o.x1 = -1 + len; o.innerEdge = o.x1; }
    else { o.x0 = 1 - len; o.x1 = 1.06; o.innerEdge = o.x0; }
    t.obstacles.push(o);
  }

  // ogni tanto una torretta accompagna le sporgenze
  if (rng() < 0.35 + prog * 0.25) {
    const side = rng() < 0.6 ? (rng() < 0.5 ? "left" : "right") : "floor";
    t.turrets.push({
      side,
      x: side === "left" ? -0.9 : side === "right" ? 0.9 : rand2(rng, -0.55, 0.55),
      y: side === "floor" ? 0.09 : rand2(rng, 0.3, 0.95),
      z: z + rand2(rng, 3, 6),
      hp: 2,
      fireCd: rand2(rng, 0.7, 1.6),
      hitDone: false,
    });
  }

  t.nextSpawn = t.dist + lerp(rand2(rng, 9, 13), rand2(rng, 6.5, 10), prog);
}

const rand2 = (rng, a, b) => a + rng() * (b - a);

function fireTorpedo() {
  const t = trench;
  if (t.torpedoes <= 0) { AudioFX.hit(); showMsg("SILURI ESAURITI!", 1.2); return; }
  t.torpedoes--;
  AudioFX.torpedo();
  t.torps.push({ x: t.ship.x, y: t.ship.y - 0.05, z: 0.3, vx: 0, vy: 0 });
}

function updateTrench(dt) {
  const t = trench, sh = t.ship;
  sh.inv = Math.max(0, sh.inv - dt);
  t.slowT = Math.max(0, t.slowT - dt);
  const spd = t.slowT > 0 ? t.speed * 0.55 : t.speed;
  if (t.hintT > 0) {
    t.hintT -= dt;
    if (t.hintT <= 0) showMsg("Il quadrato aggancia i bersagli: allinea la guida laser e fai fuoco!", 3.5);
  }
  t.camX = sh.x * 0.5;
  t.camY = sh.y * 0.5 + 0.55;
  TR.F = H * 1.05;

  // guida
  const acc = 3.4;
  let ax = 0, ay = 0;
  if (keys["ArrowLeft"] || keys["KeyA"]) ax -= acc;
  if (keys["ArrowRight"] || keys["KeyD"]) ax += acc;
  if (keys["ArrowUp"] || keys["KeyW"]) ay += acc;
  if (keys["ArrowDown"] || keys["KeyS"]) ay -= acc;
  sh.vx = clamp(sh.vx + ax * dt, -1.05, 1.05);
  sh.vy = clamp(sh.vy + ay * dt, -0.9, 0.9);
  if (!ax) sh.vx *= Math.pow(0.0009, dt);
  if (!ay) sh.vy *= Math.pow(0.0009, dt);
  sh.x = clamp(sh.x + sh.vx * dt, -0.8, 0.8);
  sh.y = clamp(sh.y + sh.vy * dt, 0.08, 1.12);

  // avanzamento
  t.dist += spd * dt;

  // spawn ostacoli finché non siamo in zona condotto
  if (!t.port && t.dist < t.portAt - 85 && t.dist >= t.nextSpawn) trenchSpawn();

  // avviso condotto
  if (!t.portWarned && t.portAt - t.dist < 70) {
    t.portWarned = true;
    showMsg("CONDOTTO DI SCARICO IN AVVICINAMENTO — SILURI PRONTI (X)", 3);
    AudioFX.lock();
  }

  // comparsa condotto
  if (!t.port && t.dist >= t.portAt) {
    t.port = { x: 0, y: 0.1, z: TR.SPAWN + 2 };
  }

  // laser (X-wing: rossi)
  t.fireCd -= dt;
  if (fireHeld() && t.fireCd <= 0) {
    const tips = [[-0.11, 0.075], [0.11, 0.075], [-0.11, -0.055], [0.11, -0.055]];
    const tp = tips[t.tip % 4]; t.tip++;
    t.lasers.push({ x: sh.x + tp[0], y: sh.y + tp[1], z: 0.4, vz: 58 });
    t.fireCd = 0.14;
    AudioFX.laser();
  }

  // siluro protonico
  if (popKey("KeyX") || popKey("ControlLeft") || popKey("ControlRight")) fireTorpedo();

  // ostacoli
  for (let i = t.obstacles.length - 1; i >= 0; i--) {
    const o = t.obstacles[i];
    o.z -= spd * dt;
    if (o.z < -1) { t.obstacles.splice(i, 1); continue; }
    if (!o.hitDone && o.z < 0.9 && o.z > -0.6 &&
        sh.x + 0.115 > o.x0 && sh.x - 0.115 < o.x1 &&
        sh.y + 0.08 > o.y0 && sh.y - 0.08 < o.y1) {
      o.hitDone = true;
      trenchHitPlayer();
      if (G.screen !== "trench") return;
    }
  }

  // rotta di collisione: l'ostacolo più vicino che colpiresti mantenendo la rotta
  t.warnObs = null;
  let warnZ = Infinity;
  for (const o of t.obstacles) {
    if (o.z > 1.2 && o.z < 30 && o.z < warnZ &&
        sh.x + 0.115 > o.x0 && sh.x - 0.115 < o.x1 &&
        sh.y + 0.08 > o.y0 && sh.y - 0.08 < o.y1) {
      warnZ = o.z; t.warnObs = o;
    }
  }
  if (t.warnObs && !t.warnObs.warned && t.warnObs.z < 22) {
    t.warnObs.warned = true;
    AudioFX.warn();
  }

  // caccia TIE in arrivo frontale al centro della trincea
  if (t.dist >= t.nextTieAt && t.dist < t.portAt - 85) {
    const prog2 = clamp(t.dist / t.firstPortAt, 0, 1);
    const nT = t.rng() < prog2 * 0.6 ? 2 : 1;
    for (let i = 0; i < nT; i++) {
      t.ties.push({
        baseX: rand(-0.45, 0.45),
        baseY: rand(0.35, 0.95),
        x: 0, y: 0.6,
        z: TR.SPAWN + 4 + i * 6,
        wob: rand(0, TAU),
        fireCd: rand(0.9, 1.7),
      });
    }
    t.nextTieAt = t.dist + lerp(rand(125, 170), rand(85, 120), prog2);
  }
  for (let i = t.ties.length - 1; i >= 0; i--) {
    const e = t.ties[i];
    e.z -= (spd + 9) * dt;
    e.baseX += (sh.x - e.baseX) * 0.25 * dt; // deriva verso la tua corsia
    e.x = clamp(e.baseX + Math.sin(G.time * 2.2 + e.wob) * 0.16, -0.8, 0.8);
    e.y = clamp(e.baseY + Math.sin(G.time * 1.9 + e.wob) * 0.12, 0.12, 1.2);
    e.fireCd -= dt;
    if (e.fireCd <= 0 && e.z > 6 && e.z < 34 && t.bolts.length < 12) {
      const closing = spd + 11;
      const tt2 = e.z / closing;
      t.bolts.push({
        x: e.x, y: e.y, z: e.z,
        vx: (clamp(sh.x + sh.vx * tt2 * 0.6 + rand(-0.12, 0.12), -0.95, 0.95) - e.x) / tt2,
        vy: (clamp(sh.y + sh.vy * tt2 * 0.6 + rand(-0.1, 0.1), 0.05, 1.2) - e.y) / tt2,
        vz: -11,
      });
      e.fireCd = rand(1.1, 2.0);
      AudioFX.enemyLaser();
    }
    if (e.z < -0.8) { t.ties.splice(i, 1); continue; }
    if (sh.inv <= 0 && Math.abs(e.z) < 0.6 &&
        Math.abs(e.x - sh.x) < 0.17 && Math.abs(e.y - sh.y) < 0.13) {
      t.ties.splice(i, 1);
      spawn3Burst(t, e.x, e.y, 0.4, 20, EXPL_COLS);
      trenchHitPlayer();
      if (G.screen !== "trench") return;
    }
  }

  // torrette
  for (let i = t.turrets.length - 1; i >= 0; i--) {
    const tur = t.turrets[i];
    tur.z -= spd * dt;
    if (tur.z < -1) { t.turrets.splice(i, 1); continue; }
    tur.fireCd -= dt;
    const prog = clamp(t.dist / t.firstPortAt, 0, 1);
    if (tur.fireCd <= 0 && tur.z > 7 && tur.z < 38 && t.bolts.length < 10) {
      const closing = spd + 11;
      const tt = tur.z / closing;
      const txp = clamp(sh.x + sh.vx * tt * 0.7 + rand(-0.14, 0.14), -0.95, 0.95);
      const typ = clamp(sh.y + sh.vy * tt * 0.7 + rand(-0.12, 0.12), 0.05, 1.2);
      t.bolts.push({
        x: tur.x, y: tur.y, z: tur.z,
        vx: (txp - tur.x) / tt, vy: (typ - tur.y) / tt, vz: -11,
      });
      tur.fireCd = lerp(rand(1.9, 2.6), rand(1.2, 1.9), prog);
      AudioFX.enemyLaser();
    }
    if (!tur.hitDone && tur.z < 0.7 && tur.z > -0.6 &&
        Math.abs(sh.x - tur.x) < 0.16 && Math.abs(sh.y - tur.y) < 0.14) {
      tur.hitDone = true;
      trenchHitPlayer();
      if (G.screen !== "trench") return;
    }
  }

  // bolt delle torrette
  for (let i = t.bolts.length - 1; i >= 0; i--) {
    const b = t.bolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.z += (b.vz - spd) * dt;
    if (b.z < -1.2) { t.bolts.splice(i, 1); continue; }
    if (sh.inv <= 0 && Math.abs(b.z) < 0.55 &&
        Math.abs(b.x - sh.x) < 0.12 && Math.abs(b.y - sh.y) < 0.10) {
      t.bolts.splice(i, 1);
      trenchHitPlayer();
      if (G.screen !== "trench") return;
    }
  }

  // laser del giocatore
  for (let i = t.lasers.length - 1; i >= 0; i--) {
    const l = t.lasers[i];
    l.z += (l.vz + spd) * dt * 0.9;
    let dead = l.z > TR.SPAWN + 4;
    if (!dead) {
      for (let j = t.ties.length - 1; j >= 0; j--) {
        const e = t.ties[j];
        if (Math.abs(l.z - e.z) < 1.7 && Math.abs(l.x - e.x) < 0.2 && Math.abs(l.y - e.y) < 0.17) {
          t.ties.splice(j, 1);
          dead = true;
          G.score += 200;
          t.hitMarkT = 0.18;
          t.floats3.push({ x: e.x, y: e.y - 0.08, z: e.z, txt: "+200", col: "#ffe9c9", t: 0 });
          spawn3Burst(t, e.x, e.y, e.z, 20, EXPL_COLS);
          AudioFX.boom();
          break;
        }
      }
    }
    if (!dead) {
      for (let j = t.turrets.length - 1; j >= 0; j--) {
        const tur = t.turrets[j];
        if (Math.abs(l.z - tur.z) < 1.6 && Math.abs(l.x - tur.x) < 0.22 && Math.abs(l.y - tur.y) < 0.2) {
          tur.hp--;
          dead = true;
          t.hitMarkT = 0.18;
          spawn3Burst(t, tur.x, tur.y, tur.z, 6, ["#ffd98a", "#ffffff"]);
          if (tur.hp <= 0) {
            t.turrets.splice(j, 1);
            G.score += 150;
            t.floats3.push({ x: tur.x, y: tur.y - 0.08, z: tur.z, txt: "+150", col: "#ffe9c9", t: 0 });
            spawn3Burst(t, tur.x, tur.y, tur.z, 18, EXPL_COLS);
            AudioFX.boom();
          } else {
            AudioFX.hitTick();
          }
          break;
        }
      }
    }
    if (!dead) {
      for (const o of t.obstacles) {
        if (Math.abs(l.z - o.z) < 1.2 && l.x > o.x0 && l.x < o.x1 && l.y > o.y0 && l.y < o.y1) {
          dead = true;
          spawn3Burst(t, l.x, l.y, o.z, 4, ["#9fb4d8"]);
          break;
        }
      }
    }
    if (dead) t.lasers.splice(i, 1);
  }

  // siluri protonici
  for (let i = t.torps.length - 1; i >= 0; i--) {
    const tp = t.torps[i];
    const closing = 30 + spd;
    tp.z += closing * dt;
    if (t.port) {
      const k = 3.2 * dt;
      tp.vx += (t.port.x - tp.x) * k;
      tp.vy += (t.port.y - tp.y) * k;
    }
    tp.x += tp.vx * dt; tp.y += tp.vy * dt;

    // impatto con torrette (esplosione ad area)
    for (let j = t.turrets.length - 1; j >= 0; j--) {
      const tur = t.turrets[j];
      if (Math.abs(tp.z - tur.z) < 1.6 && Math.abs(tp.x - tur.x) < 0.4 && Math.abs(tp.y - tur.y) < 0.4) {
        t.turrets.splice(j, 1);
        G.score += 150;
        t.floats3.push({ x: tur.x, y: tur.y - 0.08, z: tur.z, txt: "+150", col: "#ffe9c9", t: 0 });
        spawn3Burst(t, tur.x, tur.y, tur.z, 22, EXPL_COLS);
        AudioFX.boom();
        t.torps.splice(i, 1);
        tp.deadFlag = true;
        break;
      }
    }
    if (!tp.deadFlag) {
      for (let j = t.ties.length - 1; j >= 0; j--) {
        const e = t.ties[j];
        if (Math.abs(tp.z - e.z) < 1.7 && Math.abs(tp.x - e.x) < 0.4 && Math.abs(tp.y - e.y) < 0.4) {
          t.ties.splice(j, 1);
          G.score += 200;
          t.floats3.push({ x: e.x, y: e.y - 0.08, z: e.z, txt: "+200", col: "#ffe9c9", t: 0 });
          spawn3Burst(t, e.x, e.y, e.z, 22, EXPL_COLS);
          AudioFX.boom();
          t.torps.splice(i, 1);
          tp.deadFlag = true;
          break;
        }
      }
    }
    if (tp.deadFlag) continue;

    // impatto con barriere
    let boom = false;
    for (const o of t.obstacles) {
      if (Math.abs(tp.z - o.z) < 1.2 && tp.x > o.x0 && tp.x < o.x1 && tp.y > o.y0 && tp.y < o.y1) {
        boom = true;
        spawn3Burst(t, tp.x, tp.y, o.z, 16, EXPL_COLS);
        AudioFX.boom();
        break;
      }
    }
    if (boom) { t.torps.splice(i, 1); continue; }

    // il colpo decisivo
    if (t.port && tp.z >= t.port.z) {
      const dx = tp.x - t.port.x, dy = tp.y - t.port.y;
      if (dx * dx + dy * dy < 0.34 * 0.34) {
        // COLPITO!
        t.torps.splice(i, 1);
        t.warnObs = null;
        G.score += 5000 + t.torpedoes * 500;
        saveHi();
        AudioFX.bigBoom();
        AudioFX.humStop();
        vseq = { t: 0, boomed: false, rings: [], parts: [], flashes: [] };
        G.screen = "vseq";
        return;
      }
    }
    if (tp.z > TR.SPAWN + 8) t.torps.splice(i, 1);
  }

  // condotto mancato?
  if (t.port) {
    t.port.z -= spd * dt;
    if (t.port.z < 1.2) {
      t.port = null;
      t.passes++;
      if (t.torpedoes <= 0 && t.torps.length === 0) {
        AudioFX.humStop();
        gameOver("trench", "Siluri esauriti: il condotto è rimasto intatto.");
        return;
      }
      t.portAt = t.dist + 300;
      t.portWarned = false;
      t.nextSpawn = t.dist + 24;
      showMsg("Mancato! Nuovo passaggio sulla trincea…", 2.6);
    }
  }

  // lock del computer di puntamento
  const wasLocked = t.locked;
  t.locked = !!(t.port && t.port.z < 18 && Math.abs(sh.x - t.port.x) < 0.42);
  if (t.locked && !wasLocked) AudioFX.lock();

  // aggancio del bersaglio: il TIE o la torretta più vicini davanti a te
  t.aimTarget = null;
  let aimZ = Infinity;
  for (const e of t.ties) {
    if (e.z > 2.5 && e.z < aimZ && Math.abs(e.x - sh.x) < 0.7 && Math.abs(e.y - sh.y) < 0.55) {
      aimZ = e.z; t.aimTarget = { kind: "tie", o: e };
    }
  }
  for (const tur of t.turrets) {
    if (tur.z > 2.5 && tur.z < aimZ && Math.abs(tur.x - sh.x) < 0.7 && Math.abs(tur.y - sh.y) < 0.55) {
      aimZ = tur.z; t.aimTarget = { kind: "tur", o: tur };
    }
  }
  t.aimLocked = !!(t.aimTarget &&
    Math.abs(t.aimTarget.o.x - sh.x) < 0.18 && Math.abs(t.aimTarget.o.y - sh.y) < 0.15);
  t.hitMarkT = Math.max(0, t.hitMarkT - dt);

  // punteggi fluttuanti nel mondo
  for (let i = t.floats3.length - 1; i >= 0; i--) {
    const f = t.floats3[i];
    f.t += dt; f.z -= spd * dt; f.y += dt * 0.2;
    if (f.t > 0.95 || f.z < -0.5) t.floats3.splice(i, 1);
  }

  // particelle 3D
  for (let i = t.parts3.length - 1; i >= 0; i--) {
    const p = t.parts3[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.z -= spd * dt;
    p.life -= dt;
    if (p.life <= 0 || p.z < -1) t.parts3.splice(i, 1);
  }
  updateParts(t.parts, dt);

  // turbolaser ambientali nel cielo
  if (Math.random() < dt * 2.2) {
    t.skyBolts.push({ x: rand(0.1, 0.9), life: 0.5, maxLife: 0.5, dir: Math.random() < 0.5 ? -1 : 1 });
  }
  for (let i = t.skyBolts.length - 1; i >= 0; i--) {
    t.skyBolts[i].life -= dt;
    if (t.skyBolts[i].life <= 0) t.skyBolts.splice(i, 1);
  }
}

function spawn3Burst(t, x, y, z, n, cols) {
  for (let i = 0; i < n; i++) {
    t.parts3.push({
      x, y, z,
      vx: rand(-0.8, 0.8), vy: rand(-0.8, 0.8),
      life: rand(0.3, 0.7), maxLife: 0.7,
      col: cols[Math.floor(Math.random() * cols.length)],
    });
  }
}

function drawTrench(noHud) {
  const t = trench, sh = t.ship;
  TR.F = H * 1.05;
  t.camX = sh.x * 0.5;
  t.camY = sh.y * 0.5 + 0.55;

  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  drawStars(0.02 * t.dist * 0.001, 0.3);

  // turbolaser lontani nel cielo
  for (const sb of t.skyBolts) {
    const a = sb.life / sb.maxLife;
    ctx.strokeStyle = "rgba(90,255,130," + (a * 0.7).toFixed(2) + ")";
    ctx.lineWidth = 2;
    const bx = sb.x * W;
    ctx.beginPath();
    ctx.moveTo(bx, H * TR.HORIZON * (0.9 - 0.5 * a));
    ctx.lineTo(bx + sb.dir * 30, H * TR.HORIZON * (0.9 - 0.5 * a) - 60);
    ctx.stroke();
  }

  const zn = -1.1, zf = TR.SPAWN;
  const c = (px, py, pz) => proj(px, py, pz);

  // pavimento
  let p1 = c(-1, 0, zn), p2 = c(1, 0, zn), p3 = c(1, 0, zf), p4 = c(-1, 0, zf);
  poly([[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], [p4.x, p4.y]]);
  ctx.fillStyle = "#12151d"; ctx.fill();
  // muro sinistro
  p1 = c(-1, 0, zn); p2 = c(-1, 0, zf); p3 = c(-1, TR.TOPH, zf); p4 = c(-1, TR.TOPH, zn);
  poly([[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], [p4.x, p4.y]]);
  ctx.fillStyle = "#1e2534"; ctx.fill();
  // muro destro
  p1 = c(1, 0, zn); p2 = c(1, 0, zf); p3 = c(1, TR.TOPH, zf); p4 = c(1, TR.TOPH, zn);
  poly([[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y], [p4.x, p4.y]]);
  ctx.fillStyle = "#182031"; ctx.fill();

  // spigoli della trincea: definiscono pavimento e cima delle pareti
  for (const [ex, ey, col] of [
    [-1, 0, "rgba(120,150,200,0.4)"], [1, 0, "rgba(120,150,200,0.4)"],
    [-1, TR.TOPH, "rgba(150,180,255,0.3)"], [1, TR.TOPH, "rgba(150,180,255,0.3)"],
  ]) {
    const e1 = c(ex, ey, zn), e2 = c(ex, ey, zf);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.stroke();
  }

  // greeble su pareti e pavimento (si muovono con la distanza percorsa)
  for (const gr of trenchGreebles) {
    let gz = (gr.zOff - t.dist) % 56;
    if (gz < 0) gz += 56;
    gz -= 6;
    if (gz < 0.2 || gz > zf - 2) continue;
    ctx.fillStyle = "rgba(120,145,190," + gr.a.toFixed(2) + ")";
    if (gr.type === "floor") {
      const a1 = c(gr.x, 0.003, gz), a2 = c(gr.x + gr.w, 0.003, gz);
      const b1 = c(gr.x + gr.w, 0.003, gz + gr.len), b2 = c(gr.x, 0.003, gz + gr.len);
      poly([[a1.x, a1.y], [a2.x, a2.y], [b1.x, b1.y], [b2.x, b2.y]]);
    } else {
      const a1 = c(gr.side, gr.y, gz), a2 = c(gr.side, gr.y, gz + gr.len);
      const b1 = c(gr.side, gr.y + gr.h, gz + gr.len), b2 = c(gr.side, gr.y + gr.h, gz);
      poly([[a1.x, a1.y], [a2.x, a2.y], [b1.x, b1.y], [b2.x, b2.y]]);
    }
    ctx.fill();
  }

  // linee longitudinali
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(90,120,170,0.22)";
  for (const lx of [-0.6, -0.2, 0.2, 0.6]) {
    const a = c(lx, 0, zn), b = c(lx, 0, zf);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const side of [-1, 1]) for (const ly of [0.45, 0.9]) {
    const a = c(side, ly, zn), b = c(side, ly, zf);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  // anelli trasversali (danno la sensazione di velocità)
  const spacing = 4;
  let zr = spacing - (t.dist % spacing);
  for (; zr < zf; zr += spacing) {
    const a = clamp(0.9 - zr / zf, 0.05, 0.45);
    ctx.strokeStyle = "rgba(90,140,210," + a.toFixed(2) + ")";
    ctx.lineWidth = zr < 6 ? 2 : 1;
    const q1 = c(-1, TR.TOPH, zr), q2 = c(-1, 0, zr), q3 = c(1, 0, zr), q4 = c(1, TR.TOPH, zr);
    ctx.beginPath();
    ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.lineTo(q4.x, q4.y);
    ctx.stroke();
  }

  // nebbia di distanza verso il punto di fuga
  const fog = ctx.createRadialGradient(W / 2, H * TR.HORIZON, 2, W / 2, H * TR.HORIZON, H * 0.55);
  fog.addColorStop(0, "rgba(4,6,12,0.95)");
  fog.addColorStop(0.35, "rgba(4,6,12,0.4)");
  fog.addColorStop(1, "rgba(4,6,12,0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, W, H);

  // lista di disegno ordinata per profondità (prima il lontano)
  const items = [];
  if (t.port) items.push({ z: t.port.z, fn: () => drawPort(t.port) });
  for (const o of t.obstacles) items.push({ z: o.z, fn: () => drawObstacle(o) });
  for (const e of t.ties) items.push({ z: e.z, fn: () => {
    const p = proj(e.x, e.y, e.z);
    drawTIE(p.x, p.y, Math.max(0.08, p.s * 0.0095));
  } });
  for (const tur of t.turrets) items.push({ z: tur.z, fn: () => drawTurret(tur) });
  for (const b of t.bolts) items.push({ z: b.z, fn: () => drawTrenchBolt(b, "rgba(80,255,120,0.95)", "#e2ffe8") });
  for (const l of t.lasers) items.push({ z: l.z, fn: () => drawTrenchBolt(l, "rgba(255,70,60,0.95)", "#ffe2df") });
  for (const tp of t.torps) items.push({ z: tp.z, fn: () => drawTorpedo(tp) });
  for (const p of t.parts3) items.push({ z: p.z, fn: () => drawPart3(p) });
  for (const f of t.floats3) items.push({ z: f.z, fn: () => {
    const p = proj(f.x, f.y, f.z);
    ctx.globalAlpha = clamp(1 - f.t / 0.95, 0, 1);
    text(f.txt, p.x, p.y, Math.min(26, Math.max(13, p.s * 0.1)), f.col, "center", true);
    ctx.globalAlpha = 1;
  } });
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.fn();

  // ombra del caccia sul pavimento + linea di quota tratteggiata
  const shp = proj(sh.x, 0, 0.3);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(shp.x, shp.y, MINWH * 0.06 * (1.3 - sh.y * 0.6), MINWH * 0.013, 0, 0, TAU);
  ctx.fill();

  const sp2 = proj(sh.x, sh.y, 0);
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = "rgba(140,180,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sp2.x, sp2.y + MINWH * 0.02);
  ctx.lineTo(shp.x, shp.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // il caccia
  const flick = sh.inv > 0;
  drawXWingBack(sp2.x, sp2.y, MINWH * 0.085, clamp(-sh.vx * 0.55, -0.6, 0.6), flick, G.time);

  if (!noHud) {
    // guida laser: dove convergono i tuoi colpi
    const gA = proj(sh.x, sh.y, 1.4), gB = proj(sh.x, sh.y, 40);
    ctx.setLineDash([5, 9]);
    ctx.strokeStyle = t.aimLocked ? "rgba(89,255,138,0.45)" : "rgba(140,190,255,0.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(gA.x, gA.y); ctx.lineTo(gB.x, gB.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = t.aimLocked ? "#59ff8a" : "rgba(140,190,255,0.55)";
    ctx.beginPath(); ctx.arc(gB.x, gB.y, 2.6, 0, TAU); ctx.fill();

    // quadrato di mira sul bersaglio agganciato
    if (t.aimTarget) {
      const o = t.aimTarget.o;
      const p = proj(o.x, o.y, o.z);
      const s = clamp(p.s * (t.aimTarget.kind === "tie" ? 0.16 : 0.12), 15, 80);
      const col = t.aimLocked ? "#59ff8a" : "#ffe81f";
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      if (t.aimLocked) {
        ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
        text("FUOCO!", p.x, p.y - s - 12, 13, col, "center", true);
      } else {
        for (const [mx, my] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath();
          ctx.moveTo(p.x + mx * s, p.y + my * s * 0.5);
          ctx.lineTo(p.x + mx * s, p.y + my * s);
          ctx.lineTo(p.x + mx * s * 0.5, p.y + my * s);
          ctx.stroke();
        }
      }
      // tacche di vita della torretta
      if (t.aimTarget.kind === "tur") {
        for (let i = 0; i < 2; i++) {
          ctx.fillStyle = i < o.hp ? col : "rgba(120,130,160,0.3)";
          ctx.fillRect(p.x - 11 + i * 12, p.y + s + 6, 10, 4);
        }
      }
      // segno di impatto quando colpisci
      if (t.hitMarkT > 0) {
        ctx.globalAlpha = t.hitMarkT / 0.18;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        const hs = s * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x - hs, p.y - hs); ctx.lineTo(p.x + hs, p.y + hs);
        ctx.moveTo(p.x + hs, p.y - hs); ctx.lineTo(p.x - hs, p.y + hs);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  // reticolo di puntamento del condotto
  if (t.port) drawTargeting();

  if (!noHud) {
    drawHUD();
    drawTrenchHUD();
  }
}

// Sporgenze attaccate alle pareti: luci rosse lampeggianti sul bordo libero.
const OB_PAL = {
  stub: { front: "#472f36", top: "#6b4650", side: "#35232a", back: "#291b20", edge: "#8f5a6a", light: "#ff6b6b" },
};
const OB_DEPTH = 1.4;

// Scatola prospettica: mostra il "sopra" solo se la camera è più in alto e il
// "sotto" solo se è più in basso — così si legge subito se un blocco è a terra
// o sospeso, e se sei alla quota giusta per superarlo.
function drawBox3D(x0, x1, y0, y1, z0, depth, pal, warn, grooves) {
  const z1 = z0 + depth;
  const f = [proj(x0, y0, z0), proj(x1, y0, z0), proj(x1, y1, z0), proj(x0, y1, z0)];
  const b = [proj(x0, y0, z1), proj(x1, y0, z1), proj(x1, y1, z1), proj(x0, y1, z1)];
  ctx.fillStyle = pal.back;
  poly(b.map(p => [p.x, p.y])); ctx.fill();
  if (trench.camY > y1) {
    ctx.fillStyle = pal.top;
    poly([[f[3].x, f[3].y], [f[2].x, f[2].y], [b[2].x, b[2].y], [b[3].x, b[3].y]]); ctx.fill();
  }
  if (trench.camY < y0) {
    ctx.fillStyle = pal.side;
    poly([[f[0].x, f[0].y], [f[1].x, f[1].y], [b[1].x, b[1].y], [b[0].x, b[0].y]]); ctx.fill();
  }
  if (trench.camX < x0) {
    ctx.fillStyle = pal.side;
    poly([[f[0].x, f[0].y], [f[3].x, f[3].y], [b[3].x, b[3].y], [b[0].x, b[0].y]]); ctx.fill();
  }
  if (trench.camX > x1) {
    ctx.fillStyle = pal.side;
    poly([[f[1].x, f[1].y], [f[2].x, f[2].y], [b[2].x, b[2].y], [b[1].x, b[1].y]]); ctx.fill();
  }
  ctx.fillStyle = pal.front;
  poly(f.map(p => [p.x, p.y])); ctx.fill();
  // scanalature sulla faccia frontale: danno scala quando il blocco è vicino
  if (grooves && f[0].s > 120) {
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 1;
    const gl = (A, B, k) => [A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k];
    for (const k of [1 / 3, 2 / 3]) {
      const a = grooves === "h" ? gl(f[0], f[3], k) : gl(f[0], f[1], k);
      const b2 = grooves === "h" ? gl(f[1], f[2], k) : gl(f[3], f[2], k);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
    }
  }
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 1.2;
  poly(f.map(p => [p.x, p.y])); ctx.stroke();
  if (warn) {
    ctx.strokeStyle = "rgba(255,64,54," + (0.55 + 0.45 * Math.sin(G.time * 14)).toFixed(2) + ")";
    ctx.lineWidth = Math.max(2, f[0].s * 0.014);
    poly(f.map(p => [p.x, p.y])); ctx.stroke();
  }
  return f;
}

function drawGroundShadow(x0, x1, z, depth, alpha) {
  const q = [proj(x0, 0.005, z), proj(x1, 0.005, z), proj(x1, 0.005, z + depth), proj(x0, 0.005, z + depth)];
  ctx.fillStyle = "rgba(0,0,0," + alpha + ")";
  poly(q.map(p => [p.x, p.y])); ctx.fill();
}

function drawBeacon(x, y, z, color, phase) {
  const p = proj(x, y, z);
  const r = Math.max(1.8, p.s * 0.013);
  const bl = 0.6 + 0.4 * Math.sin(G.time * 6 + phase);
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.4);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.8 * bl;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.4, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.95, 0, TAU); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.4, 0, TAU); ctx.fill();
}

function drawObstacle(o) {
  const warn = o === trench.warnObs;
  const pal = OB_PAL.stub;
  drawBox3D(o.x0, o.x1, o.y0, o.y1, o.z, OB_DEPTH, pal, warn, "v");
  // luci sul bordo libero: passa oltre le luci
  const ym = (o.y0 + o.y1) / 2;
  drawBeacon(o.innerEdge, o.y0 + 0.04, o.z, pal.light, o.z * 1.3);
  drawBeacon(o.innerEdge, ym, o.z, pal.light, o.z * 1.3 + 1);
  drawBeacon(o.innerEdge, o.y1 - 0.04, o.z, pal.light, o.z * 1.3 + 2);
}

function drawTurret(tur) {
  const p = proj(tur.x, tur.y, tur.z);
  const s = p.s * 0.09;
  ctx.save();
  ctx.translate(p.x, p.y);
  // orientata rispetto alla superficie di appoggio: canne verso l'interno della trincea
  if (tur.side === "left") ctx.rotate(Math.PI / 2);
  else if (tur.side === "right") ctx.rotate(-Math.PI / 2);
  // basamento
  ctx.fillStyle = "#333c58";
  ctx.strokeStyle = "#5a6890";
  ctx.lineWidth = 1;
  ctx.fillRect(-s, -s * 0.25, s * 2, s * 0.85);
  ctx.strokeRect(-s, -s * 0.25, s * 2, s * 0.85);
  // cupola
  ctx.fillStyle = "#465179";
  ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 0.6, Math.PI, 0); ctx.fill(); ctx.stroke();
  // doppia canna che spunta dalla cupola
  ctx.strokeStyle = "#6b7ba8";
  ctx.lineWidth = Math.max(1, s * 0.16);
  ctx.beginPath();
  ctx.moveTo(-s * 0.22, -s * 0.35); ctx.lineTo(-s * 0.22, -s * 1.15);
  ctx.moveTo(s * 0.22, -s * 0.35); ctx.lineTo(s * 0.22, -s * 1.15);
  ctx.stroke();
  // luce di mira
  const warm = tur.fireCd < 0.4;
  ctx.fillStyle = warm ? "#ff5c5c" : "#7fd4ff";
  ctx.beginPath(); ctx.arc(0, -s * 0.55, Math.max(1, s * 0.16), 0, TAU); ctx.fill();
  ctx.restore();
}

function drawTrenchBolt(b, glow, core) {
  const p1 = proj(b.x, b.y, b.z);
  const p2 = proj(b.x - (b.vx || 0) * 0.02, b.y - (b.vy || 0) * 0.02, b.z + 1.1);
  ctx.lineCap = "round";
  ctx.strokeStyle = glow;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(2, p1.s * 0.02);
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = core;
  ctx.lineWidth = Math.max(1, p1.s * 0.008);
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
}

function drawTorpedo(tp) {
  const p = proj(tp.x, tp.y, tp.z);
  const r = Math.max(2.5, p.s * 0.02);
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,120,235,0.9)");
  g.addColorStop(1, "rgba(255,60,220,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, TAU); ctx.fill();
}

function drawPart3(p) {
  const pr = proj(p.x, p.y, p.z);
  ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
  ctx.fillStyle = p.col;
  const s = Math.max(1.5, pr.s * 0.012);
  ctx.fillRect(pr.x - s / 2, pr.y - s / 2, s, s);
  ctx.globalAlpha = 1;
}

function drawPort(port) {
  const p = proj(port.x, 0.02, port.z);
  const rx = p.s * 0.3, ry = rx * 0.32;
  const pulse = 0.6 + 0.4 * Math.sin(G.time * 7);

  // bagliore
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx * 2);
  g.addColorStop(0, "rgba(255,150,60," + (0.55 * pulse).toFixed(2) + ")");
  g.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y, rx * 2, 0, TAU); ctx.fill();

  // cornice ottagonale del condotto
  ctx.strokeStyle = "rgba(255,190,90," + (0.5 + 0.5 * pulse).toFixed(2) + ")";
  ctx.lineWidth = Math.max(1.5, p.s * 0.012);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const px = p.x + Math.cos(a) * rx, py = p.y + Math.sin(a) * ry;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.stroke();

  // bocca scura
  ctx.fillStyle = "#0a0c12";
  ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * 0.55, ry * 0.55, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(255,120,50,0.9)";
  ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * 0.55, ry * 0.55, 0, 0, TAU); ctx.stroke();
}

function drawTargeting() {
  const t = trench;
  const p = proj(t.port.x, t.port.y, t.port.z);
  const col = t.locked ? "#59ff8a" : "#ffe81f";
  const s = clamp(p.s * 0.16, 26, 140);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  const gapK = t.locked ? 0.55 : 0.75 + 0.1 * Math.sin(G.time * 5);
  for (const [mx, my] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(p.x + mx * s, p.y + my * s * gapK);
    ctx.lineTo(p.x + mx * s, p.y + my * s);
    ctx.lineTo(p.x + mx * s * gapK, p.y + my * s);
    ctx.stroke();
  }
  text(t.locked ? "AGGANCIATO — FUOCO! (X)" : "ALLINEATI AL CONDOTTO", p.x, p.y - s - 16, 13, col, "center", true);
  const dist = Math.max(0, t.port.z).toFixed(0);
  text(dist, p.x, p.y + s + 14, 12, col);
}

function drawTrenchHUD() {
  const t = trench;
  // siluri
  ctx.textAlign = "left";
  text("SILURI", 18, H - 52, 12, "#8fa2c5", "left");
  for (let i = 0; i < 8; i++) {
    const on = i < t.torpedoes;
    ctx.fillStyle = on ? "#ff6fe0" : "rgba(120,130,160,0.25)";
    poly([[24 + i * 18, H - 24], [18 + i * 18, H - 36], [30 + i * 18, H - 36]]);
    ctx.fill();
  }
  // distanza dal condotto — in alto al centro, ben visibile
  const rem = Math.max(0, t.portAt - t.dist);
  const km = rem / t.firstPortAt * 6.2;
  const fs = Math.max(20, Math.min(MINWH * 0.036, W * 0.05));
  const ty = (NARROW() ? 62 : 40) + fs * 0.6;
  if (t.port) {
    if (Math.sin(G.time * 8) > -0.2)
      text("CONDOTTO IN VISTA!", W / 2, ty, fs, "#ffb347", "center", true);
  } else {
    text("CONDOTTO  " + km.toFixed(1) + " km", W / 2, ty, fs, "#ffe81f", "center", true);
    // barra di avvicinamento: si riempie fino alla tacca del condotto
    const bw = MINWH * 0.38, bx = W / 2 - bw / 2, by = ty + fs * 0.75;
    ctx.fillStyle = "rgba(120,130,160,0.28)";
    ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = "#ffb347";
    ctx.fillRect(bx, by, bw * clamp(1 - rem / t.firstPortAt, 0, 1), 8);
    ctx.fillStyle = "#ffe81f";
    ctx.fillRect(bx + bw - 2, by - 3, 4, 14);
  }
}

// ============================================================
// SEQUENZA FINALE — LA MORTE NERA ESPLODE
// ============================================================
let vseq = null;

function updateVseq(dt) {
  const v = vseq;
  v.t += dt;
  const t2 = v.t - 1.9;

  if (t2 > 1.2 && !v.boomed) {
    v.boomed = true;
    G.shake = 26;
    spawnBurst(v.parts, W / 2, H / 2, 260, EXPL_COLS, MINWH * 0.55, 2.6);
    v.rings.push({ r: 4, w: 10, kind: "disc" });
    v.rings.push({ r: 4, w: 6, kind: "ring" });
  }
  for (const r of v.rings) r.r += dt * MINWH * (r.kind === "disc" ? 0.75 : 0.55);
  updateParts(v.parts, dt);

  if (v.t > 7.5) {
    G.screen = "victory";
    saveHi();
    pressedCodes.clear();
    touchTapped = false;
  }
}

function drawVseq() {
  const v = vseq;

  if (v.t < 1.9) {
    // fuga dalla trincea con bagliore crescente alle spalle
    if (trench) {
      trench.ship.y = clamp(trench.ship.y + 0.35 * (1 / 60), 0, 1.3);
      drawTrench(true);
    }
    const k = clamp(v.t / 1.9, 0, 1);
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, MINWH * (0.2 + k * 1.2));
    g.addColorStop(0, "rgba(255,240,200," + (0.85 * k).toFixed(2) + ")");
    g.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    text("CENTRO PERFETTO! VIA DALLA TRINCEA!", W / 2, H * 0.2, Math.max(16, MINWH * 0.03), "#ffe81f", "center", true);
    if (v.t > 1.4) {
      ctx.fillStyle = "rgba(0,0,0," + clamp((v.t - 1.4) / 0.5, 0, 1) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }

  // vista esterna
  const t2 = v.t - 1.9;
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  drawStars(0, 0.15);

  const R = MINWH * 0.3;
  if (!v.boomed) {
    // piccoli lampi premonitori sulla superficie
    const dmg = clamp(t2 / 1.2, 0, 1);
    drawDeathStar(W / 2, H / 2, R, 1, dmg * 0.9);
    if (Math.random() < 0.35) {
      ctx.fillStyle = "rgba(255,240,200,0.9)";
      const a = rand(0, TAU), rr = rand(0, R * 0.8);
      ctx.beginPath();
      ctx.arc(W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr, rand(1.5, 4), 0, TAU);
      ctx.fill();
    }
  } else {
    const sinceBoom = t2 - 1.2;
    const dsA = clamp(1 - sinceBoom * 1.6, 0, 1);
    if (dsA > 0) drawDeathStar(W / 2, H / 2, R * (1 + sinceBoom * 0.7), dsA, 1);

    // anelli d'urto
    for (const r of v.rings) {
      const a = clamp(1.6 - r.r / (MINWH * 0.9), 0, 1);
      if (a <= 0) continue;
      ctx.lineWidth = r.w * a + 1;
      if (r.kind === "disc") {
        ctx.strokeStyle = "rgba(180,220,255," + a.toFixed(2) + ")";
        ctx.beginPath(); ctx.ellipse(W / 2, H / 2, r.r * 2.1, r.r * 0.45, 0, 0, TAU); ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(255,235,190," + a.toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(W / 2, H / 2, r.r, 0, TAU); ctx.stroke();
      }
    }
    drawParts(v.parts);

    // lampo iniziale
    const fl = clamp(1 - sinceBoom / 0.7, 0, 1);
    if (fl > 0) {
      ctx.fillStyle = "rgba(255,255,255," + fl.toFixed(2) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    if (sinceBoom > 1.6) {
      text("LA MORTE NERA È STATA DISTRUTTA!", W / 2, H * 0.16,
           Math.max(18, MINWH * 0.042), "#ffe81f", "center", true);
    }
  }
}

// ============================================================
// SCHERMATE
// ============================================================
function gameOver(where, reason) {
  G.diedIn = where;
  G.overReason = reason;
  saveHi();
  G.screen = "gameover";
  AudioFX.humStop();
  pressedCodes.clear();
  touchTapped = false;
}

function drawTitle() {
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  drawStars(G.time * 0.006, 1);
  drawDeathStar(W * 0.78, H * 0.28, MINWH * 0.34, 0.5, 0);

  const ty = H * 0.3;
  text("UN FAN GAME ISPIRATO A GUERRE STELLARI", W / 2, ty - MINWH * 0.09, Math.max(11, MINWH * 0.018), "#8fa2c5");
  text("ASSALTO ALLA", W / 2, ty, Math.max(26, MINWH * 0.055), "#ffe81f", "center", true);
  text("MORTE NERA", W / 2, ty + MINWH * 0.085, Math.max(38, MINWH * 0.085), "#ffe81f", "center", true);

  const cy = H * 0.62;
  const fs = Math.max(12, MINWH * 0.019);
  text("FRECCE / WASD  muovi il caccia", W / 2, cy, fs, "#c5cde0");
  text("SPAZIO  laser / attacco      X  siluro      GIÙ/S  parata", W / 2, cy + fs * 1.7, fs, "#c5cde0");
  text("P  pausa      M  audio on/off", W / 2, cy + fs * 3.4, fs, "#c5cde0");
  if (hasTouch) text("Touch: trascina a sinistra per muoverti, pulsanti a destra", W / 2, cy + fs * 5.1, fs, "#8fa2c5");

  if (Math.sin(G.time * 4) > -0.3)
    text("PREMI INVIO PER INIZIARE", W / 2, H * 0.82, Math.max(15, MINWH * 0.026), "#ffffff", "center", true);

  if (G.hi > 0) text("RECORD  " + fmtScore(G.hi), W / 2, H * 0.06, 14, "#8fa2c5");
  text("Fan game non ufficiale · nessuna affiliazione con Lucasfilm/Disney", W / 2, H - 16, 10, "#4d5670");
}

const CRAWL_LINES = [
  ["EPISODIO IV E MEZZO", true],
  ["UN NUOVO PILOTA", true],
  ["", false],
  ["È un periodo di guerra civile.", false],
  ["L'Impero ha completato la sua", false],
  ["arma definitiva: la MORTE NERA,", false],
  ["una stazione spaziale capace di", false],
  ["annientare interi pianeti.", false],
  ["", false],
  ["Le spie ribelli hanno scoperto", false],
  ["un punto debole: un piccolo", false],
  ["condotto di scarico termico", false],
  ["collegato al reattore centrale.", false],
  ["", false],
  ["Sei l'ultima speranza della", false],
  ["Alleanza. Apri un varco tra i", false],
  ["caccia imperiali, vola nella", false],
  ["trincea e centra il condotto", false],
  ["con un siluro protonico.", false],
  ["", false],
  ["Non sarai solo: il MILLENNIUM", false],
  ["FALCON combatte al tuo fianco.", false],
  ["Ma attento: DARTH VADER in", false],
  ["persona ti sta cercando…", false],
  ["", false],
  ["Che la Forza sia con te…", true],
];
let crawl = { t: 0 };

function updateCrawl(dt) {
  crawl.t += dt;
  const lineH = MINWH * 0.055;
  const end = H + CRAWL_LINES.length * lineH;
  if (crawl.t * MINWH * 0.085 > end * 1.02 || anyStartPressed()) {
    initSpace();
    G.screen = "space";
  }
}

function drawCrawl() {
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  drawStars(0, 1);

  const speed = MINWH * 0.085;
  const lineH = MINWH * 0.055;
  const horizon = H * 0.12;

  for (let i = 0; i < CRAWL_LINES.length; i++) {
    const [str, big] = CRAWL_LINES[i];
    if (!str) continue;
    const y = H * 0.9 + i * lineH - crawl.t * speed;
    if (y < horizon || y > H + lineH) continue;
    const k = (y - horizon) / (H - horizon); // 0 in alto, 1 in basso
    const sc = lerp(0.35, 1.15, k);
    const alpha = clamp(k * 2.2, 0, 1);
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(sc, sc);
    ctx.globalAlpha = alpha;
    text(str, 0, 0, big ? Math.max(20, MINWH * 0.037) : Math.max(16, MINWH * 0.03), "#ffe81f", "center", big);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  text("INVIO per saltare", W / 2, H - 20, 11, "#4d5670");
}

function drawVictory() {
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  drawStars(0, 0.15);
  if (vseq) drawParts(vseq.parts);

  text("VITTORIA!", W / 2, H * 0.26, Math.max(34, MINWH * 0.08), "#ffe81f", "center", true);
  text("LA MORTE NERA È STATA DISTRUTTA", W / 2, H * 0.36, Math.max(15, MINWH * 0.028), "#ffffff", "center", true);
  text("La galassia è salva. Medaglia per tutti!", W / 2, H * 0.43, Math.max(12, MINWH * 0.02), "#8fa2c5");

  text("PUNTEGGIO  " + fmtScore(G.score), W / 2, H * 0.55, Math.max(16, MINWH * 0.028), "#ffffff");
  if (G.score >= G.hi) text("NUOVO RECORD!", W / 2, H * 0.61, 15, "#59ff8a", "center", true);
  else text("RECORD  " + fmtScore(G.hi), W / 2, H * 0.61, 13, "#8fa2c5");

  if (Math.sin(G.time * 4) > -0.3)
    text("INVIO: gioca ancora", W / 2, H * 0.78, Math.max(14, MINWH * 0.024), "#ffffff");
}

function drawGameOver() {
  ctx.fillStyle = "#04060c";
  ctx.fillRect(0, 0, W, H);
  drawStars(0, 0.3);

  text("GAME OVER", W / 2, H * 0.3, Math.max(34, MINWH * 0.075), "#ff5c5c", "center", true);
  textWrap(G.overReason, W / 2, H * 0.41, Math.max(13, Math.min(MINWH * 0.022, W * 0.036)), "#c5cde0", "center", false, W * 0.92);
  text("PUNTEGGIO  " + fmtScore(G.score), W / 2, H * 0.52, Math.max(15, MINWH * 0.026), "#ffffff");
  text("RECORD  " + fmtScore(G.hi), W / 2, H * 0.58, 13, "#8fa2c5");
  if (Math.sin(G.time * 4) > -0.3)
    text("INVIO: riprova la fase      ESC: torna al titolo", W / 2, H * 0.75, Math.max(13, MINWH * 0.022), "#ffffff");
}

// ---------------------------------------------------------- HUD comune
function drawHUD() {
  const lives = G.screen === "trench" || (G.screen === "vseq") ? (trench ? trench.ship.lives : 3)
              : space ? space.player.lives : 3;
  const shield = G.screen === "trench" ? (trench ? trench.ship.shield : 3)
               : space ? space.player.shield : 3;

  text("PUNTI  " + fmtScore(G.score), 18, 24, 15, "#ffffff", "left", true);

  // scudi (il Falcon ne ha 4)
  const maxSh = G.screen === "space" && space && space.shipType === "falcon" ? 4 : 3;
  ctx.textAlign = "right";
  text("SCUDI", W - 118 - (maxSh - 3) * 22, 22, 12, "#8fa2c5", "right");
  for (let i = 0; i < maxSh; i++) {
    ctx.fillStyle = i < shield ? "#5ad0ff" : "rgba(120,130,160,0.25)";
    ctx.fillRect(W - 108 - (maxSh - 3) * 22 + i * 22, 14, 16, 8);
  }
  // vite
  text("VITE", W - 118, 44, 12, "#8fa2c5", "right");
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < lives ? "#e3e6f0" : "rgba(120,130,160,0.25)";
    poly([[W - 104 + i * 22, 50], [W - 111 + i * 22, 38], [W - 97 + i * 22, 38]]);
    ctx.fill();
  }

  if (AudioFX.muted) text("AUDIO OFF (M)", W - 18, H - 12, 10, "#4d5670", "right");

  // pulsanti touch
  if (hasTouch && (G.screen === "space" || G.screen === "trench")) {
    const fb = fireBtn();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#ff8c85"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r, 0, TAU); ctx.stroke();
    text("FUOCO", fb.x, fb.y, 13, "#ff8c85");
    if (G.screen === "trench") {
      const tb = torpBtn();
      ctx.strokeStyle = "#ff6fe0";
      ctx.beginPath(); ctx.arc(tb.x, tb.y, tb.r, 0, TAU); ctx.stroke();
      text("SILURO", tb.x, tb.y, 12, "#ff6fe0");
    }
    ctx.globalAlpha = 1;
  }
}

function drawMsg() {
  if (G.msgT <= 0 || !G.msg) return;
  const a = clamp(G.msgT / 0.4, 0, 1);
  ctx.globalAlpha = a;
  const fs = Math.max(14, Math.min(MINWH * 0.027, W * 0.042));
  textWrap(G.msg, W / 2, H * 0.28, fs, "#ffe81f", "center", true, W * 0.92);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------- Yoda, spirito della Forza
let yodaFx = null;
function showYoda(dur, phrase) {
  yodaFx = { t: 0, dur: dur || 3.2, phrase: phrase || "« Che la Forza sia con te… »" };
  AudioFX.force();
}

function drawYoda(cx, cy, s, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;

  // aura da spirito della Forza
  const aur = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1.2);
  aur.addColorStop(0, "rgba(150,205,255,0.4)");
  aur.addColorStop(0.65, "rgba(120,180,255,0.14)");
  aur.addColorStop(1, "rgba(120,180,255,0)");
  ctx.fillStyle = aur;
  ctx.beginPath(); ctx.arc(0, 0.1, 1.2, 0, TAU); ctx.fill();

  // tunica
  ctx.fillStyle = "#b9a98c";
  ctx.strokeStyle = "#877a60";
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.moveTo(-0.32, 0.02);
  ctx.quadraticCurveTo(-0.54, 0.5, -0.46, 0.86);
  ctx.lineTo(0.46, 0.86);
  ctx.quadraticCurveTo(0.54, 0.5, 0.32, 0.02);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // scollo a V più scuro
  ctx.fillStyle = "#93856a";
  ctx.beginPath();
  ctx.moveTo(-0.15, 0.05); ctx.lineTo(0, 0.36); ctx.lineTo(0.15, 0.05);
  ctx.closePath(); ctx.fill();
  // maniche giunte
  ctx.fillStyle = "#b9a98c";
  ctx.beginPath(); ctx.ellipse(0, 0.33, 0.2, 0.085, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // manine verdi
  ctx.fillStyle = "#8fbc6f";
  ctx.beginPath();
  ctx.arc(-0.045, 0.31, 0.042, 0, TAU);
  ctx.arc(0.055, 0.32, 0.042, 0, TAU);
  ctx.fill();

  // orecchie a punta
  ctx.fillStyle = "#93c47d";
  ctx.strokeStyle = "#5f8f4e";
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.42);
  ctx.quadraticCurveTo(-0.42, -0.5, -0.62, -0.36);
  ctx.quadraticCurveTo(-0.4, -0.26, -0.15, -0.25);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.13, -0.42);
  ctx.quadraticCurveTo(0.42, -0.5, 0.62, -0.36);
  ctx.quadraticCurveTo(0.4, -0.26, 0.15, -0.25);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // testa
  ctx.beginPath(); ctx.ellipse(0, -0.34, 0.21, 0.185, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -0.22, 0.155, 0.13, 0, 0, TAU); ctx.fill();

  // ciuffi di capelli bianchi
  ctx.strokeStyle = "rgba(240,240,235,0.85)";
  ctx.lineWidth = 0.013;
  ctx.beginPath();
  ctx.moveTo(-0.18, -0.47); ctx.quadraticCurveTo(-0.26, -0.54, -0.3, -0.48);
  ctx.moveTo(0.18, -0.47); ctx.quadraticCurveTo(0.26, -0.54, 0.3, -0.48);
  ctx.moveTo(-0.05, -0.52); ctx.quadraticCurveTo(0, -0.57, 0.05, -0.52);
  ctx.stroke();

  // rughe della saggezza
  ctx.strokeStyle = "#5f8f4e";
  ctx.lineWidth = 0.011;
  ctx.beginPath();
  ctx.moveTo(-0.07, -0.44); ctx.quadraticCurveTo(0, -0.47, 0.07, -0.44);
  ctx.moveTo(-0.05, -0.4); ctx.quadraticCurveTo(0, -0.425, 0.05, -0.4);
  ctx.stroke();

  // occhi
  ctx.fillStyle = "#20301f";
  ctx.beginPath();
  ctx.ellipse(-0.078, -0.3, 0.028, 0.036, 0, 0, TAU);
  ctx.ellipse(0.078, -0.3, 0.028, 0.036, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(-0.068, -0.315, 0.009, 0, TAU);
  ctx.arc(0.088, -0.315, 0.009, 0, TAU);
  ctx.fill();

  // sorriso mite
  ctx.strokeStyle = "#5f8f4e";
  ctx.lineWidth = 0.014;
  ctx.beginPath(); ctx.arc(0, -0.18, 0.055, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();

  ctx.restore();
}

function drawYodaOverlay() {
  const y = yodaFx;
  const aIn = clamp(y.t / 0.45, 0, 1);
  const aOut = clamp((y.dur - y.t) / 0.5, 0, 1);
  const a = Math.min(aIn, aOut);
  const s = MINWH * 0.17;
  const cy = H * 0.4 + Math.sin(G.time * 1.7) * s * 0.05;
  drawYoda(W / 2, cy, s, a * 0.92);
  ctx.globalAlpha = a;
  text(y.phrase, W / 2, cy + s * 1.28, Math.max(15, MINWH * 0.028), "#bfe6a8", "center", true);
  ctx.globalAlpha = 1;
}

// ============================================================
// LOOP PRINCIPALE
// ============================================================
function update(dt) {
  G.time += dt;
  G.msgT = Math.max(0, G.msgT - dt);
  G.shake = Math.max(0, G.shake - dt * 40);
  if (yodaFx) {
    yodaFx.t += dt;
    if (yodaFx.t > yodaFx.dur) yodaFx = null;
  }

  // pausa
  if ((G.screen === "space" || G.screen === "trench" || G.screen === "duel") && popKey("KeyP")) G.paused = !G.paused;
  if (G.paused) {
    if (popKey("Enter") || touchTapped) { G.paused = false; touchTapped = false; }
    return;
  }

  // ESC → titolo
  if (G.screen !== "title" && popKey("Escape")) {
    AudioFX.humStop();
    G.screen = "title";
    pressedCodes.clear();
    touchTapped = false;
    return;
  }

  switch (G.screen) {
    case "title":
      if (anyStartPressed()) { crawl = { t: 0 }; G.screen = "crawl"; G.score = 0; }
      break;
    case "crawl":  updateCrawl(dt); break;
    case "space":  updateSpace(dt); break;
    case "falconIntro": updateFalconIntro(dt); break;
    case "duelIntro": updateDuelIntro(dt); break;
    case "duel":   updateDuel(dt); break;
    case "approach": updateApproach(dt); break;
    case "trench": updateTrench(dt); break;
    case "vseq":   updateVseq(dt); break;
    case "victory":
      if (vseq) updateParts(vseq.parts, dt);
      if (anyStartPressed()) G.screen = "title";
      break;
    case "gameover":
      if (anyStartPressed()) {
        if (G.diedIn === "space") { G.score = G.spaceStartScore; initSpace(G.spacePhase); G.screen = "space"; }
        else if (G.diedIn === "duel") { G.score = G.duelStartScore; initDuel(); G.screen = "duel"; }
        else { G.score = G.trenchStartScore; initTrench(); G.screen = "trench"; AudioFX.humStart(); }
      }
      break;
  }
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (G.shake > 0) ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);

  switch (G.screen) {
    case "title":    drawTitle(); break;
    case "crawl":    drawCrawl(); break;
    case "space":    drawSpace(); break;
    case "falconIntro": drawFalconIntro(); break;
    case "duelIntro": drawDuelIntro(); break;
    case "duel":     drawDuel(); break;
    case "approach": drawApproach(); break;
    case "trench":   drawTrench(); break;
    case "vseq":     drawVseq(); break;
    case "victory":  drawVictory(); break;
    case "gameover": drawGameOver(); break;
  }

  if (yodaFx && (G.screen === "space" || G.screen === "trench")) drawYodaOverlay();

  drawMsg();

  if (G.paused) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, H);
    text("PAUSA", W / 2, H / 2, Math.max(26, MINWH * 0.05), "#ffffff", "center", true);
    text("P o INVIO per continuare", W / 2, H / 2 + MINWH * 0.06, 14, "#8fa2c5");
  }
}

let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, last ? (ts - last) / 1000 : 0.016);
  last = ts;
  update(dt);
  draw();
}
requestAnimationFrame(frame);

// ---------------------------------------------------------- hook di debug/test
window.__game = {
  G,
  trench: () => trench,
  space: () => space,
  startTrench() { initTrench(); G.screen = "trench"; },
  startSpace() { initSpace(); G.screen = "space"; },
  startFalcon() { initSpace("falcon"); G.screen = "space"; },
  startDuel() { initDuel(); G.screen = "duel"; },
  duel: () => duel,
  startApproach() { approach = { t: 0 }; G.screen = "approach"; },
  drawFalcon: (x, y, vx) => drawFalconTop(x, y, vx),
  forceVictory() {
    G.score += 5000;
    vseq = { t: 0, boomed: false, rings: [], parts: [], flashes: [] };
    G.screen = "vseq";
  },
};

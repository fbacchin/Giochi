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
let hasTouch = (typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 0) ||
  (typeof window !== "undefined" && "ontouchstart" in window);

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
  if (isPlayScreen()) G.paused = true;
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
const jumpBtn = () => (NARROW()
  ? { x: 82, y: H - 92, r: 40 }
  : { x: W - 160, y: H - 172, r: 38 });
const pauseBtn = () => ({ x: 34, y: 84, r: 21 });
const audioBtn = () => ({ x: 34, y: 134, r: 21 });
const menuBtn = () => ({ x: W / 2, y: H * 0.88, r: 38 });

function inCircle(x, y, c) { return dist2(x, y, c.x, c.y) < c.r * c.r; }

// schermate in cui un tocco qualsiasi equivale a INVIO
const isMenuScreen = () => G.paused || G.screen === "title" || G.screen === "crawl" ||
  G.screen === "falconIntro" || G.screen === "duelIntro" ||
  G.screen === "victory" || G.screen === "gameover";
const isPlayScreen = () => G.screen === "space" || G.screen === "trench" || G.screen === "duel";

function drawTouchButton(b, label, color, size, alpha) {
  ctx.globalAlpha = alpha === undefined ? 0.4 : alpha;
  ctx.fillStyle = "rgba(4,6,12,0.35)";
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
  text(label, b.x, b.y, size, color, "center", true);
  ctx.globalAlpha = 1;
}

// pausa e audio: sempre raggiungibili col pollice sinistro
function drawServiceButtons() {
  if (!hasTouch || !isPlayScreen()) return;
  drawTouchButton(pauseBtn(), "II", "#8fa2c5", 15);
  drawTouchButton(audioBtn(), AudioFX.muted ? "♪✕" : "♪", "#8fa2c5", 14);
}

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  hasTouch = true;
  AudioFX.init();
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    // pulsanti di servizio (pausa / audio / menu)
    if ((isPlayScreen() || G.paused) && inCircle(x, y, pauseBtn())) { G.paused = !G.paused; continue; }
    if ((isPlayScreen() || G.paused) && inCircle(x, y, audioBtn())) { AudioFX.setMuted(!AudioFX.muted); continue; }
    if ((G.paused || G.screen === "gameover") && inCircle(x, y, menuBtn())) {
      G.paused = false;
      pressedCodes.add("Escape");
      continue;
    }
    // nelle schermate di menu un tocco qualsiasi vale INVIO
    if (isMenuScreen()) { touchTapped = true; continue; }
    if (inCircle(x, y, fireBtn())) {
      touchState.fireId = t.identifier;
      if (G.screen === "duel") pressedCodes.add("Space"); // tap = fendente / martella nei lock
    } else if ((G.screen === "trench" || G.screen === "duel") && inCircle(x, y, torpBtn())) {
      touchState.torpId = t.identifier;
      if (G.screen === "trench") pressedCodes.add("KeyX");
    } else if (G.screen === "duel" && inCircle(x, y, jumpBtn())) {
      pressedCodes.add("ArrowUp");
    } else if (x < W * 0.62 && touchState.moveId === null) {
      touchState.moveId = t.identifier;
      touchState.mx = x; touchState.my = y;
    } else {
      touchState.fireId = t.identifier;
      if (G.screen === "duel") pressedCodes.add("Space");
    }
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
  if (isMenuScreen()) touchTapped = true;
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
    for (let i = 0; i < 13; i++) q.push({ t: i * 0.75, type: "drift", x: 0.12 + 0.76 * ((i * 37) % 100) / 100, sp: 95, amp: 60 });
    for (let i = 0; i < 3; i++) q.push({ t: 3 + i * 2.2, type: "diver", x: 0.2 + 0.6 * ((i * 53) % 100) / 100 });
  } else if (!falcon) {
    for (let i = 0; i < 12; i++) q.push({ t: i * 0.6, type: "drift", x: 0.12 + 0.76 * ((i * 37) % 100) / 100, sp: 115, amp: 75 });
    for (let i = 0; i < 7; i++) q.push({ t: 1.6 + i * 1.15, type: "diver", x: 0.15 + 0.7 * ((i * 53) % 100) / 100 });
  } else if (n === 1) {
    for (let i = 0; i < 16; i++) q.push({ t: i * 0.55, type: "drift", x: 0.1 + 0.8 * ((i * 41) % 100) / 100, sp: 120, amp: 80 });
    for (let i = 0; i < 5; i++) q.push({ t: 2 + i * 1.6, type: "diver", x: 0.15 + 0.7 * ((i * 53) % 100) / 100 });
  } else {
    for (let i = 0; i < 15; i++) q.push({ t: i * 0.5, type: "drift", x: 0.1 + 0.8 * ((i * 41) % 100) / 100, sp: 135, amp: 95 });
    for (let i = 0; i < 10; i++) q.push({ t: 1.2 + i * 0.95, type: "diver", x: 0.1 + 0.8 * ((i * 67) % 100) / 100 });
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
  text(hasTouch ? "tocca per continuare" : "INVIO per continuare", W / 2, H - 20, 11, "#4d5670");
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
  text(hasTouch ? "tocca per continuare" : "INVIO per continuare", W / 2, H - 20, 11, "#4d5670");
}

// ============================================================
// IL DUELLO — LUKE SKYWALKER contro DARTH VADER
// ============================================================
// ---------------------------------------------------------- sprite dei duellanti
// (pixel art fornita dal comandante, ripulita: via sfondo, stelle e lame)
const SPRITES = {
  luke:  { img: new Image(), natFace: 1,  hS: 122, fx: 0.914, fy: 0.472, ar: 361 / 520, hiltAng: -1.24 },
  vader: { img: new Image(), natFace: -1, hS: 145, fx: 0.086, fy: 0.408, ar: 563 / 520, hiltAng: -0.88 },
};
SPRITES.luke.img.src = "data:image/png;base64,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";
SPRITES.vader.img.src = "data:image/png;base64,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";

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

// posa del corpo: l'oscillazione del braccio diventa rotazione dell'intero sprite
function duelLean(f, isVader) {
  const rest = isVader ? -0.65 : -0.5;
  const a = f.armAng !== undefined ? f.armAng : rest;
  let lean = clamp((a - rest) * 0.38, -1.15, 1.15) * f.face;
  if (isVader) lean += (f.kneel || 0) * 0.22 * f.face;
  else if (f.rot) lean += f.rot;
  return lean;
}

// punti della lama: solidale all'elsa disegnata nello sprite
function bladePts(f, S, GY, isVader) {
  const sp = isVader ? SPRITES.vader : SPRITES.luke;
  const hgt = S * sp.hS, wid = hgt * sp.ar;
  const flip = f.face * sp.natFace;
  const lean = duelLean(f, isVader);
  const px = flip * (sp.fx - 0.5) * wid;
  const py = -(1 - sp.fy) * hgt;
  const ca = Math.cos(lean), sa = Math.sin(lean);
  const hx = f.x + px * ca - py * sa;
  const hy = GY + (f.airY || 0) + (isVader ? (f.kneel || 0) * S * 26 : 0) + px * sa + py * ca;
  const aw = (f.face === 1 ? sp.hiltAng : Math.PI - sp.hiltAng) + lean;
  const len = (isVader ? S * 107 : S * 88) *
    (f.bladeK !== undefined ? f.bladeK : 1) *
    (isVader ? 1 - (f.kneel || 0) * 0.9 : 1);
  return { hx, hy, tx: hx + Math.cos(aw) * len, ty: hy + Math.sin(aw) * len };
}

function drawSaberBladeW(bp, rgb, S) {
  const ang = Math.atan2(bp.ty - bp.hy, bp.tx - bp.hx);
  const len = Math.hypot(bp.tx - bp.hx, bp.ty - bp.hy);
  if (len > 1) drawSaberBlade(bp.hx, bp.hy, ang, len, rgb, S);
}

function lukeTakesHit(cause) {
  const d = duel, l = d.luke;
  const S = MINWH / 420, GY = H * 0.74;
  l.hp--;
  l.hurtT = 0.35;
  AudioFX.thud();
  addFloat(l.x, GY - S * 165, "COLPITO!", "#ff8c85");
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

function drawLukeChar(l, S, GY) {
  const sp = SPRITES.luke;
  if (!sp.img.complete || !sp.img.naturalWidth) return;
  const hgt = S * sp.hS, wid = hgt * sp.ar;
  ctx.save();
  ctx.translate(l.x, GY + (l.airY || 0));
  if (l.hurtT > 0.16) ctx.filter = "brightness(2.1)";
  else if (l.hurtT > 0 && Math.sin(G.time * 40) > 0) ctx.globalAlpha *= 0.55;
  ctx.rotate(duelLean(l, false));
  ctx.scale(l.face * sp.natFace, 1);
  const bob = l.moving > 0 ? Math.abs(Math.sin(l.walkT * 11)) * hgt * 0.012 : 0;
  ctx.drawImage(sp.img, -wid / 2, -hgt + bob, wid, hgt);
  ctx.restore();
  // lama dinamica dalla mano
  const lk = l.bladeK !== undefined ? l.bladeK : 1;
  if (lk > 0.02) drawSaberBladeW(bladePts(l, S, GY, false), "80,255,110", S);
  if (!duelReflectPass && (l.airY || 0) > -S * 20) {
    const bp = bladePts(l, S, GY, false);
    drawSaberGroundGlow((bp.hx + bp.tx) / 2, GY, "80,255,110");
  }
}

function drawVaderChar(v, S, GY) {
  const sp = SPRITES.vader;
  if (!sp.img.complete || !sp.img.naturalWidth) return;
  const hgt = S * sp.hS, wid = hgt * sp.ar;
  ctx.save();
  ctx.translate(v.x, GY);
  ctx.globalAlpha *= v.alpha !== undefined ? v.alpha : 1;
  if (v.hurtT > 0.16) ctx.filter = "brightness(2.1)";
  else if (v.hurtT > 0 && Math.sin(G.time * 40) > 0) ctx.globalAlpha *= 0.6;
  const kneel = v.kneel || 0;
  ctx.translate(0, kneel * S * 26);
  ctx.rotate(duelLean(v, true));
  ctx.scale(v.face * sp.natFace, 1);
  const bob = v.state === "approach" ? Math.abs(Math.sin(v.walkT * 9)) * hgt * 0.01 : 0;
  ctx.drawImage(sp.img, -wid / 2, -hgt + bob, wid, hgt);
  ctx.restore();
  const hasBlade = v.hasBlade !== false;
  const bk = v.bladeK !== undefined ? v.bladeK : 1;
  if (hasBlade && bk > 0.02 && kneel < 0.95) drawSaberBladeW(bladePts(v, S, GY, true), "255,60,50", S);
  if (!duelReflectPass && (v.alpha === undefined || v.alpha > 0.3) && !(kneel > 0.5) && hasBlade) {
    const bp = bladePts(v, S, GY, true);
    drawSaberGroundGlow((bp.hx + bp.tx) / 2, GY, "255,60,50");
  }
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

  // barre vita uguali: si vince svuotando quella di Vader
  const bw2 = Math.min(W * 0.34, 300);
  ctx.globalAlpha = l.hurtT > 0 && Math.sin(G.time * 30) > 0 ? 0.5 : 1;
  text("LUKE SKYWALKER", 18, 20, 13, "#bfe6a8", "left", true);
  ctx.fillStyle = "rgba(120,130,160,0.25)";
  ctx.fillRect(18, 30, bw2, 11);
  ctx.fillStyle = "#59ff8a";
  ctx.fillRect(18, 30, bw2 * clamp(l.hp / 5, 0, 1), 11);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(18 + bw2 * i / 5, 30); ctx.lineTo(18 + bw2 * i / 5, 41); ctx.stroke(); }
  ctx.globalAlpha = v.hurtT > 0 && Math.sin(G.time * 30) > 0 ? 0.5 : 1;
  text("DARTH VADER", W - 18, 20, 13, "#ff8c85", "right", true);
  ctx.fillStyle = "rgba(120,130,160,0.25)";
  ctx.fillRect(W - 18 - bw2, 30, bw2, 11);
  const vfrac = clamp(v.hp / 8, 0, 1);
  ctx.fillStyle = "#ff5c5c";
  ctx.fillRect(W - 18 - bw2 * vfrac, 30, bw2 * vfrac, 11);
  for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(W - 18 - bw2 * i / 8, 30); ctx.lineTo(W - 18 - bw2 * i / 8, 41); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (NARROW()) text("PUNTI  " + fmtScore(G.score), W / 2, H - 14, 13, "#8fa2c5");
  else text("PUNTI  " + fmtScore(G.score), W / 2, 24, 13, "#8fa2c5");

  // incrocio di lame: barra di contesa
  if (d.lock) {
    const bw = Math.min(MINWH * 0.44, W * 0.8), bx = W / 2 - bw / 2, by = H * 0.17;
    ctx.fillStyle = "rgba(4,5,10,0.78)";
    ctx.fillRect(bx - 24, by - 52, bw + 48, 104);
    ctx.strokeStyle = "rgba(255,232,31,0.5)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 24, by - 52, bw + 48, 104);
    text("INCROCIO DI LAME!", W / 2, by - 30, Math.max(16, MINWH * 0.028), "#ffe81f", "center", true);
    if (Math.sin(G.time * 12) > -0.4)
      text("MARTELLA SPAZIO PER SPINGERE ➜", W / 2, by + 34, Math.max(13, Math.min(MINWH * 0.022, W * 0.034)), "#ffffff", "center", true);
    ctx.fillStyle = "rgba(120,130,160,0.3)";
    ctx.fillRect(bx, by, bw, 14);
    // zona di vittoria evidenziata
    ctx.fillStyle = "rgba(89,255,138,0.18)";
    ctx.fillRect(bx + bw * 0.55, by, bw * 0.45, 14);
    ctx.fillStyle = d.lock.meter >= 0.55 ? "#59ff8a" : "#ff8c85";
    ctx.fillRect(bx, by, bw * d.lock.meter, 14);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx + bw * 0.55, by - 4); ctx.lineTo(bx + bw * 0.55, by + 18); ctx.stroke();
    text("VINCI", bx + bw * 0.78, by - 9, 11, "#59ff8a", "center", true);
  }

  // battuta di Vader
  if (v.quoteT > 0 && d.overT === 0) {
    ctx.globalAlpha = clamp(v.quoteT / 0.4, 0, 1);
    text(v.quote, clamp(v.x, W * 0.2, W * 0.8), GY - S * 155, Math.max(12, MINWH * 0.02), "#c5cde0");
    ctx.globalAlpha = 1;
  }

  if (d.introT > 0 && d.introT < 1.3) {
    text("DUELLO!", W / 2, H * 0.28, Math.max(30, MINWH * 0.07), "#ffe81f", "center", true);
    textWrap("Svuota la barra rossa di VADER: colpiscilo quando non para!", W / 2, H * 0.37, Math.max(13, Math.min(MINWH * 0.024, W * 0.038)), "#ffe81f", "center", true, W * 0.9);
    textWrap(hasTouch
      ? "ATTACCO colpisce · SALTO per saltare (e ATTACCO in volo: colpo dall'alto) · PARATA per parare"
      : "SPAZIO attacco · SU salto (e SPAZIO in volo: colpo dall'alto) · GIÙ/S parata",
      W / 2, H * 0.45, Math.max(11, Math.min(MINWH * 0.019, W * 0.03)), "#c5cde0", "center", false, W * 0.9);
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
    drawTouchButton(fireBtn(), "ATTACCO", "#ff8c85", 12);
    drawTouchButton(torpBtn(), "PARATA", "#7fd4ff", 12);
    drawTouchButton(jumpBtn(), "SALTO", "#bfe6a8", 12);
    drawServiceButtons();
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
      y: side === "floor" ? 0.13 : rand2(rng, 0.3, 0.95),
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
    if (t.hintT <= 0) showMsg("Quadrato verde = aggancio: i tuoi laser inseguono il bersaglio, fai fuoco!", 3.5);
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
    showMsg(hasTouch
      ? "CONDOTTO DI SCARICO IN AVVICINAMENTO — PREMI SILURO!"
      : "CONDOTTO DI SCARICO IN AVVICINAMENTO — SILURI PRONTI (X)", 3);
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

  // laser del giocatore (guidati dal computer di tiro quando c'è l'aggancio)
  for (let i = t.lasers.length - 1; i >= 0; i--) {
    const l = t.lasers[i];
    if (t.aimLocked && t.aimTarget) {
      const o = t.aimTarget.o;
      l.x += (o.x - l.x) * Math.min(1, dt * 7);
      l.y += (o.y - l.y) * Math.min(1, dt * 7);
    }
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
    Math.abs(t.aimTarget.o.x - sh.x) < 0.3 && Math.abs(t.aimTarget.o.y - sh.y) < 0.5);
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
  text(t.locked ? (hasTouch ? "AGGANCIATO — SILURO!" : "AGGANCIATO — FUOCO! (X)") : "ALLINEATI AL CONDOTTO",
       p.x, p.y - s - 16, 13, col, "center", true);
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
  const fs = Math.max(12, Math.min(MINWH * 0.019, W * 0.028));
  if (hasTouch) {
    let yy = cy;
    for (const ln of ["Trascina a sinistra per muoverti",
                      "Pulsanti a destra: FUOCO e PARATA",
                      "SALTO in basso a sinistra",
                      "In alto a sinistra: pausa e audio"]) {
      yy += textWrap(ln, W / 2, yy, fs, "#c5cde0", "center", false, W * 0.92) * fs * 1.45;
    }
  } else {
  text("FRECCE / WASD  muovi il caccia", W / 2, cy, fs, "#c5cde0");
  text("SPAZIO  laser / attacco      X  siluro      GIÙ/S  parata", W / 2, cy + fs * 1.7, fs, "#c5cde0");
  text("P  pausa      M  audio on/off", W / 2, cy + fs * 3.4, fs, "#c5cde0");

  }
  if (Math.sin(G.time * 4) > -0.3)
    text(hasTouch ? "TOCCA LO SCHERMO PER INIZIARE" : "PREMI INVIO PER INIZIARE",
         W / 2, H * 0.82, Math.max(14, Math.min(MINWH * 0.026, W * 0.04)), "#ffffff", "center", true);

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
  text(hasTouch ? "tocca per saltare" : "INVIO per saltare", W / 2, H - 20, 11, "#4d5670");
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
    text(hasTouch ? "TOCCA per giocare ancora" : "INVIO: gioca ancora", W / 2, H * 0.78, Math.max(13, Math.min(MINWH * 0.024, W * 0.038)), "#ffffff");
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
    text(hasTouch ? "TOCCA per riprovare la fase" : "INVIO: riprova la fase      ESC: torna al titolo",
         W / 2, H * 0.75, Math.max(12, Math.min(MINWH * 0.022, W * 0.034)), "#ffffff");
  if (hasTouch) drawTouchButton(menuBtn(), "MENU", "#8fa2c5", 12);
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

  if (AudioFX.muted && !hasTouch) text("AUDIO OFF (M)", W - 18, H - 12, 10, "#4d5670", "right");

  // pulsanti touch
  if (hasTouch && (G.screen === "space" || G.screen === "trench")) {
    drawTouchButton(fireBtn(), "FUOCO", "#ff8c85", 13);
    if (G.screen === "trench") drawTouchButton(torpBtn(), "SILURO", "#ff6fe0", 12);
    drawServiceButtons();
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
    text(hasTouch ? "Tocca lo schermo per continuare" : "P o INVIO per continuare",
         W / 2, H / 2 + MINWH * 0.06, Math.max(12, Math.min(14, W * 0.032)), "#8fa2c5");
    if (hasTouch) drawTouchButton(menuBtn(), "MENU", "#8fa2c5", 12);
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

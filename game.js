/* =========================================================
   BIRTHDAY ADVENTURE — game.js
   Complete vanilla-JS game engine with finite level,
   beautiful scrolling world, and romantic ending.
   ========================================================= */

'use strict';

// Polyfill for CanvasRenderingContext2D.roundRect (older browsers/Safari)
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    const [tl = 0, tr = 0, br = 0, bl = 0] = r;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y); this.arcTo(x + w, y, x + w, y + tr, tr);
    this.lineTo(x + w, y + h - br); this.arcTo(x + w, y + h, x + w - br, y + h, br);
    this.lineTo(x + bl, y + h); this.arcTo(x, y + h, x, y + h - bl, bl);
    this.lineTo(x, y + tl); this.arcTo(x, y, x + tl, y, tl);
    this.closePath();
    return this;
  };
}

// ═══════════════════════════════════════════════════════════
//  CONSTANTS & CONFIG
// ═══════════════════════════════════════════════════════════
const CFG = {
  // Physics
  GRAVITY:        0.55,
  JUMP_FORCE:    -10.5,
  JUMP_BOOST:    -0.4,
  CROUCH_SCALE:   0.55,  // height multiplier when crouching
  MAX_FALL:       18,

  // Character display
  CHAR_W:         72,
  CHAR_H:         90,
  CHAR_X:         110,

  // Gameplay
  INITIAL_SPEED:  4.2,
  MAX_SPEED:      9.5,
  SPEED_INC:      0.0008,

  // Lives
  LIVES:          3,

  // Level length (pixels of world scrolled = distance)
  LEVEL_LENGTH:   30000,

  // Score per obstacle cleared
  SCORE_PER_OBS:  25,

  // Invincibility frames after hit
  INVINCIBLE_MS:  2000,

  // FPS cap
  TARGET_FPS:     60,
};

// ═══════════════════════════════════════════════════════════
//  ASSETS
// ═══════════════════════════════════════════════════════════
const IMAGES = {};
const IMAGE_SOURCES = {
  run:    'Asset/IdleRunNotcroped.jpeg',
  jump:   'Asset/JumpNotcroped.png',
  crouch: 'Asset/CrouchNotcroped.jpeg',
};

let assetsLoaded = 0;
const TOTAL_ASSETS = Object.keys(IMAGE_SOURCES).length;

function loadAssets(cb) {
  Object.entries(IMAGE_SOURCES).forEach(([key, src]) => {
    const img = new Image();
    img.onload = () => { assetsLoaded++; if (assetsLoaded === TOTAL_ASSETS) cb(); };
    img.onerror = () => { assetsLoaded++; if (assetsLoaded === TOTAL_ASSETS) cb(); };
    img.src = src;
    IMAGES[key] = img;
  });
}

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let state = 'start';   // 'start' | 'playing' | 'paused' | 'gameover' | 'birthday'
let canvas, ctx;
let animId;

const game = {
  distance:     0,
  score:        0,
  lives:        CFG.LIVES,
  speed:        CFG.INITIAL_SPEED,
  invincible:   false,
  invincibleUntil: 0,
  paused:       false,
  lastTime:     0,
  bgOffset:     0,
  bgOffset2:    0,
  bgOffset3:    0,
  floorY:       0,
  cleared:      false,
};

const player = {
  x:       CFG.CHAR_X,
  y:       0,
  vy:      0,
  w:       CFG.CHAR_W,
  h:       CFG.CHAR_H,
  onGround: false,
  jumping:  false,
  crouching: false,
  jumpHeld: false,
  jumpBoostFrames: 0,
  blinkOn:  true,
  blinkTimer: 0,
};

let obstacles = [];
let particles = [];
let floatingStars = [];
let collectibles = [];
let clouds = [];
let flowers = [];
let levelEvents = [];  // pre-generated obstacle schedule

// ═══════════════════════════════════════════════════════════
//  DOM REFS
// ═══════════════════════════════════════════════════════════
const screens = {
  start:    document.getElementById('start-screen'),
  game:     document.getElementById('game-screen'),
  pause:    document.getElementById('pause-screen'),
  gameover: document.getElementById('gameover-screen'),
  birthday: document.getElementById('birthday-screen'),
};
const hud           = document.getElementById('hud');
const livesDisplay  = document.getElementById('lives-display');
const scoreDisplay  = document.getElementById('score-display');
const progressFill  = document.getElementById('progress-bar-fill');
const progressEmoji = document.getElementById('progress-emoji');
const touchControls = document.getElementById('touch-controls');
const goScore       = document.getElementById('go-score');

// ═══════════════════════════════════════════════════════════
//  SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════
function showScreen(name) {
  // Hide all overlay/menu screens
  ['start','gameover','birthday','pause'].forEach(k => {
    const el = screens[k];
    el.classList.remove('active');
    el.style.opacity = '0';
    setTimeout(() => {
      if (!el.classList.contains('active')) el.style.display = 'none';
    }, 500);
  });

  if (name === 'game') {
    // Game screen = just the canvas + HUD; no overlay
    screens.game.style.display = 'flex';
    screens.game.classList.add('active');
    screens.game.style.opacity = '1';
  } else if (name === 'start') {
    // Hide game screen when going back to start
    screens.game.classList.remove('active');
    screens.game.style.display = 'none';
    const el = screens.start;
    el.style.display = 'flex';
    requestAnimationFrame(() => { el.classList.add('active'); el.style.opacity = '1'; });
  } else {
    // Show the requested screen as overlay
    const el = screens[name];
    el.style.display = 'flex';
    requestAnimationFrame(() => {
      el.classList.add('active');
      el.style.opacity = '1';
    });
    // Keep game canvas visible in background during overlays
    if (name === 'pause' || name === 'gameover') {
      screens.game.style.display = 'flex';
      screens.game.classList.add('active');
    } else if (name === 'birthday') {
      // Hide game canvas for birthday screen
      screens.game.classList.remove('active');
      screens.game.style.display = 'none';
    }
  }

  hud.classList.toggle('visible', name === 'game' || name === 'pause');
  touchControls.classList.toggle('visible', name === 'game');
}

// ═══════════════════════════════════════════════════════════
//  FLOATING HEARTS ON START SCREEN
// ═══════════════════════════════════════════════════════════
function spawnStartHearts() {
  const container = document.getElementById('start-hearts');
  const hearts = ['💕','💗','💖','💓','🌸','⭐','✨'];
  setInterval(() => {
    if (state !== 'start') return;
    const span = document.createElement('span');
    span.textContent = hearts[Math.floor(Math.random() * hearts.length)];
    span.style.cssText = `
      position:absolute; font-size:${14+Math.random()*20}px;
      left:${Math.random()*100}%; bottom:-30px;
      animation: heart-float ${2.5+Math.random()*2.5}s ease-out forwards;
      pointer-events:none;
    `;
    container.appendChild(span);
    setTimeout(() => span.remove(), 5000);
  }, 400);
}

// ═══════════════════════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════════════════════
function setupCanvas() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const previousFloorY = game.floorY;
  game.floorY = canvas.height - Math.min(120, canvas.height * 0.18);
  if (state === 'playing' || state === 'paused') {
    player.y += game.floorY - previousFloorY;
  }
}

// ═══════════════════════════════════════════════════════════
//  LEVEL GENERATION
// ═══════════════════════════════════════════════════════════
/*
  Pre-generate a schedule of obstacle "events" placed at specific
  distances along the level. This ensures the level is finite and
  well-paced.

  Obstacle types:
    - 'tall'    : tall cactus-like pillar (jump over)
    - 'low'     : low barrier (crouch under)
    - 'double'  : two close tall obstacles
    - 'gap'     : pit in the ground (jump)
    - 'balloon' : floating balloon (jump high to avoid)
    - 'stack'   : stacked short+tall (jump)

  We space them with comfortable gaps early and tighter gaps later.
*/
function generateLevelEvents() {
  levelEvents = [];
  const length = CFG.LEVEL_LENGTH;

  // Obstacle configs: [minDist, pattern, type]
  // We place clusters and solo obstacles

  const schedule = [
    // A one-minute run with room to react between obstacles.
    [2500,  'tall'],
    [5000,  'low'],
    [7500,  'tall'],
    [9500,  'double'],
    [12000, 'balloon'],
    [14500, 'low'],
    [16500, 'stack'],
    [18500, 'double'],
    [20700, 'balloon'],
    [22800, 'tall'],
    [25000, 'low'],
    [27300, 'stack'],
    [29000, 'balloon'],
  ];

  levelEvents = schedule.map(([dist, type]) => ({ dist, type, spawned: false }));
}

// ═══════════════════════════════════════════════════════════
//  OBSTACLE FACTORY
// ═══════════════════════════════════════════════════════════
const PALETTE = {
  pinkD:   '#d4609a',
  pinkL:   '#f7a8cf',
  lavD:    '#8b5cf6',
  lavL:    '#c4b5fd',
  peachD:  '#f59e0b',
  peachL:  '#fde68a',
  mintD:   '#10b981',
  mintL:   '#6ee7b7',
};

function makeObstacle(type) {
  const W  = canvas.width;
  const fY = game.floorY;
  let obs;

  switch (type) {
    case 'tall':
      obs = {
        type:'tall', x: W + 30, w: 38, h: 82,
        y: fY - 82,
        color1: PALETTE.pinkD, color2: PALETTE.pinkL,
        cleared: false,
        hitbox: { ox:6, ow:-12, oy:6, oh:-6 },
        emoji: '🌷',
      };
      break;

    case 'low':
      obs = {
        type:'low', x: W + 30, w: 90, h: 36,
        y: fY - 36,
        color1: PALETTE.lavD, color2: PALETTE.lavL,
        cleared: false,
        hitbox: { ox:4, ow:-8, oy:2, oh:-4 },
        emoji: '🎀',
      };
      break;

    case 'double':
      obs = {
        type:'double', x: W + 30, w: 38, h: 76,
        y: fY - 76,
        color1: PALETTE.peachD, color2: PALETTE.peachL,
        cleared: false,
        hitbox: { ox:5, ow:-10, oy:4, oh:-4 },
        spacing: 68,   // distance to second one
        emoji: '💐',
      };
      break;

    case 'balloon':
      // Floats in the air — must duck/crouch OR jump over (it's mid-high)
      obs = {
        type:'balloon', x: W + 30, w: 56, h: 60,
        y: fY - 160,  // floats high
        vy: 0, phase: Math.random() * Math.PI * 2,
        color1: PALETTE.pinkL, color2: '#fff',
        cleared: false,
        hitbox: { ox:8, ow:-16, oy:8, oh:-16 },
        emoji: '🎈',
      };
      break;

    case 'stack':
      obs = {
        type:'stack', x: W + 30, w: 40, h: 100,
        y: fY - 100,
        color1: PALETTE.mintD, color2: PALETTE.mintL,
        cleared: false,
        hitbox: { ox:5, ow:-10, oy:4, oh:-4 },
        emoji: '⭐',
      };
      break;

    default:
      obs = {
        type:'tall', x: W + 30, w: 38, h: 72,
        y: fY - 72,
        color1: PALETTE.pinkD, color2: PALETTE.pinkL,
        cleared: false,
        hitbox: { ox:6, ow:-12, oy:6, oh:-6 },
        emoji: '🌷',
      };
  }
  return obs;
}

// ═══════════════════════════════════════════════════════════
//  COLLECTIBLES (stars/hearts)
// ═══════════════════════════════════════════════════════════
function spawnCollectibles() {
  const fY = game.floorY;
  // Scatter collectibles throughout the level
  for (let d = 3000; d < CFG.LEVEL_LENGTH - 3000; d += 2200 + Math.random() * 1800) {
    collectibles.push({
      dist: d,
      x: canvas.width + 40,
      y: fY - 110 - Math.random() * 80,
      collected: false,
      spawned: false,
      type: Math.random() < 0.5 ? '⭐' : '💕',
      scale: 1, opacity: 1,
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  DECORATIVE ELEMENTS
// ═══════════════════════════════════════════════════════════
function initDecor() {
  clouds = [];
  flowers = [];

  for (let i = 0; i < 12; i++) {
    clouds.push({
      x: Math.random() * canvas.width * 2,
      y: 30 + Math.random() * (canvas.height * 0.35),
      w: 80 + Math.random() * 120,
      speed: 0.4 + Math.random() * 0.5,
      alpha: 0.5 + Math.random() * 0.4,
    });
  }
  for (let i = 0; i < 20; i++) {
    flowers.push({
      x: Math.random() * canvas.width * 2,
      y: game.floorY + 2 + Math.random() * 18,
      emoji: ['🌸','🌺','🌼','💐'][Math.floor(Math.random()*4)],
      size: 14 + Math.random() * 12,
      speed: 1 + Math.random() * 0.5,
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  PARTICLE EFFECTS
// ═══════════════════════════════════════════════════════════
function spawnHitParticles(x, y) {
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    particles.push({
      x, y,
      vx: Math.cos(angle) * (2 + Math.random() * 3),
      vy: Math.sin(angle) * (2 + Math.random() * 3) - 3,
      life: 1, decay: 0.03 + Math.random() * 0.02,
      size: 6 + Math.random() * 6,
      color: ['#ff7eb3','#c9b8ff','#ffd6a5','#fff'][Math.floor(Math.random()*4)],
      emoji: Math.random() < 0.4 ? '💔' : null,
    });
  }
}

function spawnCollectParticles(x, y, type) {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 6,
      vy: -3 - Math.random() * 4,
      life: 1, decay: 0.025 + Math.random() * 0.02,
      size: 10 + Math.random() * 8,
      color: '#ffd700',
      emoji: type,
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  INIT GAME
// ═══════════════════════════════════════════════════════════
function initGame() {
  game.distance    = 0;
  game.score       = 0;
  game.lives       = CFG.LIVES;
  game.speed       = CFG.INITIAL_SPEED;
  game.invincible  = false;
  game.invincibleUntil = 0;
  game.paused      = false;
  game.bgOffset    = 0;
  game.bgOffset2   = 0;
  game.bgOffset3   = 0;
  game.cleared     = false;
  game.lastTime    = 0;

  player.x         = CFG.CHAR_X;
  player.y         = game.floorY - CFG.CHAR_H;
  player.vy        = 0;
  player.onGround  = true;
  player.jumping   = false;
  player.crouching = false;
  player.jumpHeld  = false;
  player.jumpBoostFrames = 0;
  player.w         = CFG.CHAR_W;
  player.h         = CFG.CHAR_H;
  player.blinkOn   = true;
  player.blinkTimer = 0;

  obstacles    = [];
  particles    = [];
  collectibles = [];

  generateLevelEvents();
  spawnCollectibles();
  initDecor();
  updateHUD();
}

// ═══════════════════════════════════════════════════════════
//  HUD UPDATE
// ═══════════════════════════════════════════════════════════
function updateHUD() {
  scoreDisplay.textContent = game.score;

  livesDisplay.innerHTML = '';
  for (let i = 0; i < game.lives; i++) {
    livesDisplay.innerHTML += '<span>❤️</span>';
  }
  for (let i = game.lives; i < CFG.LIVES; i++) {
    livesDisplay.innerHTML += '<span style="opacity:0.25">🖤</span>';
  }

  const pct = Math.min(100, (game.distance / CFG.LEVEL_LENGTH) * 100);
  progressFill.style.width = pct + '%';
  progressEmoji.style.left = pct + '%';
}

// ═══════════════════════════════════════════════════════════
//  DRAWING — BACKGROUND
// ═══════════════════════════════════════════════════════════
function drawBackground(dt) {
  const W = canvas.width, H = canvas.height;
  const fY = game.floorY;

  // Determine zone colour based on progress
  const pct = game.distance / CFG.LEVEL_LENGTH;
  const sky = lerpSkyGradient(pct);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, sky.top);
  grad.addColorStop(0.65, sky.mid);
  grad.addColorStop(1, sky.bot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Distant rolling hills (slowest)
  game.bgOffset3 += game.speed * 0.12;
  drawHillLayer(ctx, W, fY, game.bgOffset3, 220, 0.95, sky.hill1);

  // Mid hills
  game.bgOffset2 += game.speed * 0.28;
  drawHillLayer(ctx, W, fY, game.bgOffset2, 160, 0.82, sky.hill2);

  // Clouds
  ctx.save();
  clouds.forEach(c => {
    c.x -= c.speed * game.speed * 0.15;
    if (c.x + c.w < 0) c.x = W + c.w;
    drawCloud(ctx, c.x, c.y, c.w, c.alpha);
  });
  ctx.restore();

  // Ground
  const groundGrad = ctx.createLinearGradient(0, fY, 0, H);
  groundGrad.addColorStop(0, sky.ground1);
  groundGrad.addColorStop(1, sky.ground2);
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, fY, W, H - fY);

  // Ground detail line
  ctx.strokeStyle = sky.groundLine;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, fY); ctx.lineTo(W, fY); ctx.stroke();

  // Flowers along ground
  ctx.font = '16px serif';
  flowers.forEach(fl => {
    fl.x -= fl.speed * game.speed * 0.22;
    if (fl.x < -30) fl.x = W + Math.random() * 200;
    ctx.font = `${fl.size}px serif`;
    ctx.fillText(fl.emoji, fl.x, fl.y);
  });

  // Distance milestone markers
  if (pct > 0.1) {
    const milestone = Math.floor(game.distance / 10000) * 10000;
    if (milestone > 0 && milestone < CFG.LEVEL_LENGTH) {
      // Show zone label occasionally
    }
  }

  // Near the end: birthday arch decoration
  if (pct > 0.92) {
    drawBirthdayArch(pct);
  }
}

function lerpSkyGradient(pct) {
  // Progress through colour zones:
  // 0→0.33 pink dawn  0.33→0.66 lavender afternoon  0.66→1 golden dusk
  if (pct < 0.33) {
    const t = pct / 0.33;
    return {
      top:       lerpColor('#ffd6ec','#e8d5ff', t),
      mid:       lerpColor('#ffe8f8','#f0e8ff', t),
      bot:       lerpColor('#fff5fb','#faf0ff', t),
      hill1:     lerpColor('#f9c0dd','#d8c8f8', t),
      hill2:     lerpColor('#f4a0c8','#c8a8f0', t),
      ground1:   lerpColor('#e8d5f0','#d8c8f0', t),
      ground2:   lerpColor('#c8a8d8','#b8a8d8', t),
      groundLine:lerpColor('#cc88bb','#aa88cc', t),
    };
  } else if (pct < 0.66) {
    const t = (pct - 0.33) / 0.33;
    return {
      top:       lerpColor('#e8d5ff','#ffd8b0', t),
      mid:       lerpColor('#f0e8ff','#ffe0c0', t),
      bot:       lerpColor('#faf0ff','#fff5e8', t),
      hill1:     lerpColor('#d8c8f8','#f8d0a0', t),
      hill2:     lerpColor('#c8a8f0','#f0b888', t),
      ground1:   lerpColor('#d8c8f0','#e8d0b0', t),
      ground2:   lerpColor('#b8a8d8','#c8b090', t),
      groundLine:lerpColor('#aa88cc','#cc9966', t),
    };
  } else {
    const t = (pct - 0.66) / 0.34;
    return {
      top:       lerpColor('#ffd8b0','#ffc0d0', t),
      mid:       lerpColor('#ffe0c0','#ffd0e0', t),
      bot:       lerpColor('#fff5e8','#fff0f5', t),
      hill1:     lerpColor('#f8d0a0','#f8c0c8', t),
      hill2:     lerpColor('#f0b888','#f0a0b8', t),
      ground1:   lerpColor('#e8d0b0','#f0c8d8', t),
      ground2:   lerpColor('#c8b090','#d8a8b8', t),
      groundLine:lerpColor('#cc9966','#cc88aa', t),
    };
  }
}

function lerpColor(c1, c2, t) {
  const r1 = parseInt(c1.slice(1,3),16), g1 = parseInt(c1.slice(3,5),16), b1 = parseInt(c1.slice(5,7),16);
  const r2 = parseInt(c2.slice(1,3),16), g2 = parseInt(c2.slice(3,5),16), b2 = parseInt(c2.slice(5,7),16);
  const r = Math.round(r1 + (r2-r1)*t), g = Math.round(g1 + (g2-g1)*t), b = Math.round(b1 + (b2-b1)*t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function drawHillLayer(ctx, W, fY, offset, amp, widthFactor, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, fY);
  const segments = 8;
  const sw = W * widthFactor + 60;
  const off = offset % sw;
  for (let i = -1; i <= segments + 1; i++) {
    const x = (i / segments) * sw - off;
    const y = fY - amp * Math.abs(Math.sin((i / segments) * Math.PI * 2 + 0.5));
    if (i === -1) ctx.moveTo(x, y);
    else ctx.quadraticCurveTo(x - sw/(segments*2), fY - amp * 0.5 * Math.abs(Math.sin(((i-0.5)/segments)*Math.PI*2+0.5)), x, y);
  }
  ctx.lineTo(W + 60, fY);
  ctx.lineTo(0, fY);
  ctx.fill();
}

function drawCloud(ctx, x, y, w, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = '#ffffff';
  const h = w * 0.42;
  // Draw puffball cloud
  ctx.beginPath();
  ctx.arc(x + w*0.3, y + h*0.3, w*0.22, 0, Math.PI*2);
  ctx.arc(x + w*0.5, y + h*0.15, w*0.28, 0, Math.PI*2);
  ctx.arc(x + w*0.7, y + h*0.3, w*0.22, 0, Math.PI*2);
  ctx.arc(x + w*0.3, y + h*0.5, w*0.2, 0, Math.PI*2);
  ctx.arc(x + w*0.7, y + h*0.5, w*0.2, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBirthdayArch(pct) {
  const W = canvas.width;
  const fY = game.floorY;
  const t = (pct - 0.92) / 0.08;  // 0→1 in last 8% of level
  const archX = W * 0.75 + (1 - t) * W * 0.5;

  // Arch pillars
  ctx.fillStyle = 'rgba(255,200,220,0.6)';
  ctx.fillRect(archX - 15, fY - 180, 20, 180);
  ctx.fillRect(archX + 80, fY - 180, 20, 180);

  // Arch top
  ctx.strokeStyle = 'rgba(255,100,160,0.7)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(archX + 52, fY - 180, 67, Math.PI, 0, false);
  ctx.stroke();

  // Decorations on arch
  const emojis = ['🌸','💕','⭐','🎀','💐'];
  emojis.forEach((e, i) => {
    const angle = Math.PI + (i / (emojis.length - 1)) * Math.PI;
    const ex = archX + 52 + Math.cos(angle) * 72;
    const ey = fY - 180 + Math.sin(angle) * 72;
    ctx.font = '20px serif';
    ctx.fillText(e, ex - 10, ey + 8);
  });

  // Sign
  if (t > 0.5) {
    ctx.save();
    ctx.globalAlpha = (t - 0.5) * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(archX - 20, fY - 250, 165, 48, 12);
    ctx.fill();
    ctx.fillStyle = '#d4609a';
    ctx.font = 'bold 18px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎂 Almost there! 🎂', archX + 62, fY - 220);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  DRAWING — OBSTACLES
// ═══════════════════════════════════════════════════════════
function drawObstacle(o) {
  ctx.save();

  switch (o.type) {
    case 'tall':
    case 'stack': {
      // Floral pillar
      const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
      grad.addColorStop(0, o.color2);
      grad.addColorStop(1, o.color1);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, o.w, o.h, [8, 8, 2, 2]);
      ctx.fill();
      // Highlight stripe
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(o.x + 6, o.y + 8, 8, o.h - 16);
      // Top emoji
      ctx.font = '20px serif';
      ctx.textAlign = 'center';
      ctx.fillText(o.emoji, o.x + o.w/2, o.y - 4);
      break;
    }
    case 'low': {
      // Low barrier with ribbon
      const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
      grad.addColorStop(0, o.color2);
      grad.addColorStop(1, o.color1);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, o.w, o.h, 6);
      ctx.fill();
      // Ribbon pattern
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      for (let i = 12; i < o.w - 8; i += 22) {
        ctx.beginPath(); ctx.moveTo(o.x + i, o.y); ctx.lineTo(o.x + i, o.y + o.h); ctx.stroke();
      }
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.fillText(o.emoji, o.x + o.w/2, o.y - 4);
      break;
    }
    case 'double': {
      // Two pillars
      const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
      grad.addColorStop(0, o.color2);
      grad.addColorStop(1, o.color1);
      ctx.fillStyle = grad;
      [0, o.spacing].forEach(off => {
        ctx.beginPath();
        ctx.roundRect(o.x + off, o.y, o.w, o.h, [8,8,2,2]);
        ctx.fill();
      });
      ctx.font = '20px serif';
      ctx.textAlign = 'center';
      ctx.fillText(o.emoji, o.x + o.w/2, o.y - 4);
      ctx.fillText(o.emoji, o.x + o.spacing + o.w/2, o.y - 4);
      break;
    }
    case 'balloon': {
      // Balloon bob
      const bob = Math.sin(Date.now() / 400 + o.phase) * 8;
      const bx = o.x + o.w/2, by = o.y + o.h/2 + bob;
      // String
      ctx.strokeStyle = 'rgba(180,130,200,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, by + o.h/2); ctx.lineTo(bx, by + o.h/2 + 40); ctx.stroke();
      // Balloon body
      const grad = ctx.createRadialGradient(bx - 8, by - 12, 4, bx, by, o.w/2);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.4, o.color1);
      grad.addColorStop(1, o.color1.replace(')', ', 0.8)').replace('rgb', 'rgba'));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(bx, by, o.w/2, o.h/2, 0, 0, Math.PI*2);
      ctx.fill();
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(bx - 8, by - 14, 8, 5, -0.4, 0, Math.PI*2);
      ctx.fill();
      // Emoji
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎈', bx - 2, by + 8);
      break;
    }
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
//  DRAWING — PLAYER
// ═══════════════════════════════════════════════════════════
function drawPlayer() {
  if (game.invincible) {
    player.blinkTimer += 1;
    if (player.blinkTimer > 4) { player.blinkTimer = 0; player.blinkOn = !player.blinkOn; }
    if (!player.blinkOn) return;
  } else {
    player.blinkOn = true;
  }

  ctx.save();

  const img = player.crouching ? IMAGES.crouch
            : player.jumping   ? IMAGES.jump
            : IMAGES.run;

  const w = player.w;
  const h = player.crouching ? Math.round(player.h * CFG.CROUCH_SCALE) : player.h;
  const x = player.x - w / 2;
  const y = player.y + player.h - h;

  // Glow aura
  if (!game.invincible) {
    ctx.shadowColor = 'rgba(255,126,179,0.5)';
    ctx.shadowBlur = 18;
  }

  // Draw image clipped to a rounded rect for aesthetic
  ctx.beginPath();
  const rx = 14, ry = 14;
  ctx.roundRect(x, y, w, h, [rx, rx, ry, ry]);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);

  ctx.restore();

  // Little sparkle when on ground
  if (player.onGround && !player.crouching) {
    ctx.save();
    ctx.font = '12px serif';
    ctx.globalAlpha = 0.6;
    ctx.fillText('✨', player.x + w/2 - 4, player.y - 6);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  DRAWING — COLLECTIBLES
// ═══════════════════════════════════════════════════════════
function drawCollectibles() {
  collectibles.forEach(c => {
    if (!c.spawned || c.collected) return;
    const bob = Math.sin(Date.now() / 350) * 5;
    ctx.save();
    ctx.globalAlpha = c.opacity;
    ctx.font = `${20 * c.scale}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText(c.type, c.x, c.y + bob);
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════
//  DRAWING — PARTICLES
// ═══════════════════════════════════════════════════════════
function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    if (p.emoji) {
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size/2, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════
//  COLLISION DETECTION
// ═══════════════════════════════════════════════════════════
function getPlayerHitbox() {
  const h = player.crouching ? Math.round(player.h * CFG.CROUCH_SCALE) : player.h;
  const y = player.y + player.h - h;
  return {
    x: player.x - player.w/2 + 10,
    y: y + 8,
    w: player.w - 20,
    h: h - 16,
  };
}

function getObsHitboxes(o) {
  const hb = o.hitbox;
  const boxes = [];
  if (o.type === 'double') {
    [0, o.spacing].forEach(off => {
      boxes.push({
        x: o.x + off + hb.ox,
        y: o.y + hb.oy,
        w: o.w + hb.ow,
        h: o.h + hb.oh,
      });
    });
  } else if (o.type === 'balloon') {
    const bob = Math.sin(Date.now() / 400 + o.phase) * 8;
    boxes.push({
      x: o.x + hb.ox,
      y: o.y + hb.oy + bob,
      w: o.w + hb.ow,
      h: o.h + hb.oh,
    });
  } else {
    boxes.push({
      x: o.x + hb.ox,
      y: o.y + hb.oy,
      w: o.w + hb.ow,
      h: o.h + hb.oh,
    });
  }
  return boxes;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// ═══════════════════════════════════════════════════════════
//  PHYSICS UPDATE
// ═══════════════════════════════════════════════════════════
function updatePlayer(dt) {
  // Gravity
  player.vy += CFG.GRAVITY;
  if (player.vy > CFG.MAX_FALL) player.vy = CFG.MAX_FALL;

  // Jump hold boost (coyote-style short boost)
  if (player.jumpHeld && player.jumpBoostFrames > 0) {
    player.vy += CFG.JUMP_BOOST;
    player.jumpBoostFrames--;
  }

  player.y += player.vy;

  // Ground collision
  const groundY = game.floorY - player.h;
  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
    player.jumping = false;
    player.jumpBoostFrames = 0;
  } else {
    player.onGround = false;
  }

  // Crouch height adjustment
  player.h = CFG.CHAR_H;
  player.w = CFG.CHAR_W;
}

// ═══════════════════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════════════════
function gameLoop(ts) {
  if (state !== 'playing') return;
  if (!game.lastTime) game.lastTime = ts;
  const dt = Math.min(ts - game.lastTime, 50) / 16.67;   // normalized to 60fps
  game.lastTime = ts;

  // Speed increase
  game.speed = Math.min(CFG.MAX_SPEED, CFG.INITIAL_SPEED + game.distance * CFG.SPEED_INC);

  // Distance
  game.distance += game.speed;
  if (game.distance >= CFG.LEVEL_LENGTH && !game.cleared) {
    game.cleared = true;
    triggerBirthdayEnding();
    return;
  }

  // Physics
  updatePlayer(dt);

  // Spawn from level schedule
  levelEvents.forEach(ev => {
    if (!ev.spawned && game.distance >= ev.dist) {
      ev.spawned = true;
      obstacles.push(makeObstacle(ev.type));
    }
  });

  // Update obstacles
  const pHB = getPlayerHitbox();
  obstacles = obstacles.filter(o => {
    // Move
    o.x -= game.speed;
    if (o.type === 'double') { /* both pillars move together */ }

    // Check off screen
    const rightEdge = o.type === 'double' ? o.x + o.spacing + o.w : o.x + o.w;
    if (rightEdge < -40) {
      if (!o.cleared) { game.score += CFG.SCORE_PER_OBS; o.cleared = true; }
      return false;
    }

    // Score when passed
    if (!o.cleared) {
      const passed = o.type === 'double'
        ? o.x + o.spacing + o.w < player.x - player.w/2
        : o.x + o.w < player.x - player.w/2;
      if (passed) { game.score += CFG.SCORE_PER_OBS; o.cleared = true; }
    }

    // Collision
    if (!game.invincible) {
      const ohbs = getObsHitboxes(o);
      const hit = ohbs.some(ohb => rectsOverlap(pHB, ohb));
      if (hit) {
        game.lives--;
        game.invincible = true;
        game.invincibleUntil = Date.now() + CFG.INVINCIBLE_MS;
        spawnHitParticles(player.x, player.y + player.h/2);
        if (game.lives <= 0) {
          triggerGameOver();
          return false;
        }
      }
    }

    return true;
  });

  // Invincibility expiry
  if (game.invincible && Date.now() > game.invincibleUntil) {
    game.invincible = false;
    player.blinkOn = true;
  }

  // Spawn & update collectibles
  collectibles.forEach(c => {
    if (!c.spawned && game.distance >= c.dist) {
      c.spawned = true;
      c.x = canvas.width + 40;
    }
    if (!c.spawned || c.collected) return;
    c.x -= game.speed;
    // Collect check
    const cb = { x: c.x - 16, y: c.y - 20, w: 32, h: 30 };
    if (rectsOverlap(pHB, cb)) {
      c.collected = true;
      game.score += 15;
      spawnCollectParticles(c.x, c.y, c.type);
    }
    if (c.x < -40) c.collected = true;
  });

  // Update particles
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.15;
    p.life -= p.decay;
    return p.life > 0;
  });

  // Draw everything
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(dt);
  drawCollectibles();
  obstacles.forEach(drawObstacle);
  drawPlayer();
  drawParticles();

  // Floating zone label
  drawZoneLabel();

  updateHUD();

  animId = requestAnimationFrame(gameLoop);
}

// Zone labels for ambiance
const ZONE_LABELS = [
  { at: 0.05,  text: '🌸 Flower Meadow', shown: false },
  { at: 0.33,  text: '🌈 Rainbow Hills', shown: false },
  { at: 0.66,  text: '🌅 Golden Valley', shown: false },
  { at: 0.90,  text: '🎂 Almost There!', shown: false },
];
let zoneLabel = null;
let zoneLabelTimer = 0;

function drawZoneLabel() {
  const pct = game.distance / CFG.LEVEL_LENGTH;
  ZONE_LABELS.forEach(z => {
    if (!z.shown && pct >= z.at) {
      z.shown = true;
      zoneLabel = z.text;
      zoneLabelTimer = 180;
    }
  });
  if (zoneLabelTimer > 0) {
    zoneLabelTimer--;
    const alpha = Math.min(1, zoneLabelTimer / 30) * Math.min(1, (zoneLabelTimer) / 20);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 22px Nunito, sans-serif';
    ctx.textAlign = 'center';
    const textW = ctx.measureText(zoneLabel).width;
    ctx.beginPath();
    ctx.roundRect(canvas.width/2 - textW/2 - 18, 112, textW + 36, 40, 20);
    ctx.fill();
    ctx.fillStyle = '#8b5cf6';
    ctx.fillText(zoneLabel, canvas.width/2, 138);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  GAME STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════
function triggerGameOver() {
  state = 'gameover';
  cancelAnimationFrame(animId);
  goScore.textContent = game.score;
  document.getElementById('gameover-msg').textContent =
    game.lives <= 0 ? "You ran out of hearts! Try again! 💪" : "So close! Give it another go! 🌸";
  showScreen('gameover');
}

function triggerBirthdayEnding() {
  state = 'birthday';
  cancelAnimationFrame(animId);
  hud.classList.remove('visible');
  touchControls.classList.remove('visible');
  showScreen('birthday');
  startBirthdaySequence();
}

// ═══════════════════════════════════════════════════════════
//  BIRTHDAY ENDING SEQUENCE
// ═══════════════════════════════════════════════════════════
function startBirthdaySequence() {
  // Animate cake
  setTimeout(() => drawAnimatedCake(), 300);

  // Staggered message reveal
  const lines = document.querySelectorAll('.bday-line');
  lines.forEach((line, i) => {
    setTimeout(() => line.classList.add('visible'), 800 + i * 600);
  });

  // Confetti
  launchConfetti();

  // Floating hearts
  setInterval(() => {
    if (state !== 'birthday') return;
    spawnBirthdayHeart();
  }, 300);
}

function drawAnimatedCake() {
  const cv = document.getElementById('cake-canvas');
  const cx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  let frame = 0;

  function animCake() {
    frame++;
    cx.clearRect(0, 0, W, H);

    // Background glow
    const grd = cx.createRadialGradient(W/2, H/2, 10, W/2, H/2, 140);
    grd.addColorStop(0, 'rgba(255,200,220,0.3)');
    grd.addColorStop(1, 'transparent');
    cx.fillStyle = grd;
    cx.fillRect(0, 0, W, H);

    const cakePct = Math.min(1, frame / 80);
    const cakeY   = H - 40;

    // Bottom tier
    cx.fillStyle = '#f9c0dd';
    cx.beginPath();
    cx.roundRect(W/2 - 80, cakeY - 50*cakePct, 160, 50*cakePct, [0,0,8,8]);
    cx.fill();
    // Frosting bottom
    cx.fillStyle = '#fff0f7';
    cx.beginPath();
    cx.ellipse(W/2, cakeY - 50*cakePct, 82, 12, 0, 0, Math.PI*2);
    cx.fill();

    // Mid tier
    cx.fillStyle = '#e8b4d8';
    cx.beginPath();
    cx.roundRect(W/2 - 58, cakeY - (50+42)*cakePct, 116, 42*cakePct, [0,0,6,6]);
    cx.fill();
    cx.fillStyle = '#ffd6ec';
    cx.beginPath();
    cx.ellipse(W/2, cakeY - (50+42)*cakePct, 60, 10, 0, 0, Math.PI*2);
    cx.fill();

    // Top tier
    cx.fillStyle = '#d4a0c8';
    cx.beginPath();
    cx.roundRect(W/2 - 36, cakeY - (50+42+34)*cakePct, 72, 34*cakePct, [0,0,4,4]);
    cx.fill();
    cx.fillStyle = '#ffeaf5';
    cx.beginPath();
    cx.ellipse(W/2, cakeY - (50+42+34)*cakePct, 38, 8, 0, 0, Math.PI*2);
    cx.fill();

    if (cakePct >= 1) {
      // Candles
      drawCandles(cx, W, cakeY - 126);

      // Flames flicker
      drawFlames(cx, W, cakeY - 126, frame);

      // Decorations
      drawCakeDecos(cx, W, cakeY);
    }

    // Label
    if (frame > 100) {
      const labelAlpha = Math.min(1, (frame - 100) / 30);
      cx.save();
      cx.globalAlpha = labelAlpha;
      cx.font = 'bold 16px Dancing Script, cursive';
      cx.fillStyle = '#8b1a6b';
      cx.textAlign = 'center';
      cx.fillText('🎂 Happy Birthday! 🎂', W/2, cakeY + 18);
      cx.restore();
    }

    if (frame < 200 || cakePct < 1) requestAnimationFrame(animCake);
    else {
      // Keep redrawing flames
      setInterval(() => {
        if (state !== 'birthday') return;
        drawCandles(cx, W, cakeY - 126);
        drawFlames(cx, W, cakeY - 126, Date.now()/16);
        drawCakeDecos(cx, W, cakeY);
      }, 80);
    }
  }
  animCake();
}

function drawCandles(cx, W, topY) {
  const positions = [-24, 0, 24];
  positions.forEach(dx => {
    cx.fillStyle = '#ffd700';
    cx.fillRect(W/2 + dx - 4, topY - 28, 8, 28);
    cx.fillStyle = '#fff5b0';
    cx.fillRect(W/2 + dx - 2, topY - 28, 3, 28);
  });
}

function drawFlames(cx, W, topY, frame) {
  const positions = [-24, 0, 24];
  positions.forEach((dx, i) => {
    const flicker = Math.sin(frame * 0.18 + i * 1.3) * 3;
    const grad = cx.createRadialGradient(W/2+dx, topY-34+flicker, 1, W/2+dx, topY-30+flicker, 9);
    grad.addColorStop(0, '#fff8b0');
    grad.addColorStop(0.5, '#ffaa00');
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    cx.fillStyle = grad;
    cx.beginPath();
    cx.ellipse(W/2+dx, topY-36+flicker, 5, 10, 0, 0, Math.PI*2);
    cx.fill();
  });
}

function drawCakeDecos(cx, W, cakeY) {
  // Sprinkles on tiers
  const decos = ['🌸','💕','⭐','🎀','🌟'];
  [[W/2-55, cakeY-25],[W/2+40, cakeY-25],[W/2-38, cakeY-75],[W/2+30, cakeY-75]].forEach(([x,y],i) => {
    cx.font = '14px serif';
    cx.textAlign = 'center';
    cx.fillText(decos[i % decos.length], x, y);
  });
}

function launchConfetti() {
  const container = document.getElementById('confetti-container');
  const colors = ['#ff7eb3','#c9b8ff','#ffd6a5','#b5ead7','#ffd700','#ff9ecd','#a8edce'];
  const shapes = ['●','■','▲','★','♥','✿'];

  for (let i = 0; i < 90; i++) {
    setTimeout(() => {
      if (state !== 'birthday') return;
      const el = document.createElement('span');
      el.textContent = shapes[Math.floor(Math.random() * shapes.length)];
      el.style.cssText = `
        position:absolute;
        font-size:${12 + Math.random()*14}px;
        color:${colors[Math.floor(Math.random()*colors.length)]};
        left:${Math.random()*100}%;
        top:-20px;
        animation: confetti-fall ${2.5 + Math.random()*3}s linear ${Math.random()*0.5}s forwards;
        opacity:1;
      `;
      container.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }, i * 40);
  }

  // Keep confetti raining
  const confettiInterval = setInterval(() => {
    if (state !== 'birthday') { clearInterval(confettiInterval); return; }
    for (let i = 0; i < 6; i++) {
      const el = document.createElement('span');
      el.textContent = shapes[Math.floor(Math.random() * shapes.length)];
      el.style.cssText = `
        position:absolute;
        font-size:${10 + Math.random()*16}px;
        color:${colors[Math.floor(Math.random()*colors.length)]};
        left:${Math.random()*100}%;
        top:-20px;
        animation: confetti-fall ${2.5 + Math.random()*3}s linear forwards;
      `;
      container.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }
  }, 600);
}

function spawnBirthdayHeart() {
  const container = document.getElementById('confetti-container');
  const hearts = ['💕','💗','💖','💓','💝','🌸','⭐'];
  const el = document.createElement('span');
  el.textContent = hearts[Math.floor(Math.random()*hearts.length)];
  el.style.cssText = `
    position:absolute;
    font-size:${16+Math.random()*20}px;
    left:${Math.random()*90+5}%;
    bottom:0;
    animation: heart-float ${2 + Math.random()*2}s ease-out forwards;
    pointer-events:none;
  `;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════
//  INPUT HANDLING
// ═══════════════════════════════════════════════════════════
function jump() {
  if (state !== 'playing') return;
  if (player.onGround) {
    player.vy = CFG.JUMP_FORCE;
    player.onGround = false;
    player.jumping = true;
    player.jumpHeld = true;
    player.jumpBoostFrames = 10;
    // mini jump particles
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: player.x, y: game.floorY,
        vx: (Math.random()-0.5)*4, vy: -2 - Math.random()*2,
        life: 0.8, decay: 0.06,
        size: 5 + Math.random()*4,
        color: 'rgba(255,126,179,0.7)',
        emoji: null,
      });
    }
  }
}

function crouch(active) {
  if (state !== 'playing') return;
  if (active && !player.crouching && !player.onGround) {
    player.vy = Math.max(player.vy, 15);
  }
  player.crouching = active;
}

function releaseJump() {
  player.jumpHeld = false;
  player.jumpBoostFrames = 0;
}

// Keyboard
const keys = {};
window.addEventListener('keydown', e => {
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (['ArrowUp','Space','KeyW'].includes(e.code)) { e.preventDefault(); jump(); }
  if (['ArrowDown','KeyS'].includes(e.code)) { e.preventDefault(); crouch(true); }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (['ArrowUp','Space','KeyW'].includes(e.code)) releaseJump();
  if (['ArrowDown','KeyS'].includes(e.code)) crouch(false);
});
const jumpButton = document.getElementById('touch-jump');
const crouchButton = document.getElementById('touch-crouch');

jumpButton.addEventListener('pointerdown', e => {
  e.preventDefault();
  jumpButton.setPointerCapture(e.pointerId);
  jump();
});
jumpButton.addEventListener('pointerup', releaseJump);
jumpButton.addEventListener('pointercancel', releaseJump);
crouchButton.addEventListener('pointerdown', e => {
  e.preventDefault();
  crouchButton.setPointerCapture(e.pointerId);
  crouch(true);
});
crouchButton.addEventListener('pointerup', () => crouch(false));
crouchButton.addEventListener('pointercancel', () => crouch(false));

// ═══════════════════════════════════════════════════════════
//  PUBLIC API (called from HTML)
// ═══════════════════════════════════════════════════════════
window.startGame = function() {
  // Immediately hide start screen
  screens.start.classList.remove('active');
  screens.start.style.display = 'none';
  screens.start.style.opacity = '0';
  // Show game screen
  screens.game.style.display = 'flex';
  screens.game.classList.add('active');
  screens.game.style.opacity = '1';
  hud.classList.add('visible');
  touchControls.classList.add('visible');

  state = 'playing';
  initGame();
  animId = requestAnimationFrame(gameLoop);
};

window.togglePause = function() {
  if (state === 'playing') {
    state = 'paused';
    cancelAnimationFrame(animId);
    releaseJump();
    player.crouching = false;
    screens.pause.style.display = 'flex';
    screens.pause.style.opacity = '1';
    screens.pause.classList.add('active');
    hud.classList.add('visible');
    touchControls.classList.remove('visible');
  } else if (state === 'paused') {
    state = 'playing';
    screens.pause.style.display = 'none';
    screens.pause.classList.remove('active');
    touchControls.classList.add('visible');
    game.lastTime = 0;
    animId = requestAnimationFrame(gameLoop);
  }
};

window.restartGame = function() {
  state = 'playing';
  // Clear birthday screen confetti
  document.getElementById('confetti-container').innerHTML = '';
  // Reset birthday message visibility
  document.querySelectorAll('.bday-line').forEach(l => l.classList.remove('visible'));
  // Reset zone labels
  ZONE_LABELS.forEach(z => z.shown = false);
  zoneLabel = null; zoneLabelTimer = 0;

  showScreen('game');
  initGame();
  game.lastTime = 0;
  animId = requestAnimationFrame(gameLoop);
};

window.goToStart = function() {
  state = 'start';
  cancelAnimationFrame(animId);
  hud.classList.remove('visible');
  touchControls.classList.remove('visible');
  // Hide game screen
  screens.game.classList.remove('active');
  screens.game.style.display = 'none';
  // Clear confetti
  document.getElementById('confetti-container').innerHTML = '';
  document.querySelectorAll('.bday-line').forEach(l => l.classList.remove('visible'));
  ZONE_LABELS.forEach(z => z.shown = false);
  zoneLabel = null; zoneLabelTimer = 0;
  showScreen('start');
};

// ═══════════════════════════════════════════════════════════
//  INITIALISE ON LOAD
// ═══════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  setupCanvas();
  spawnStartHearts();
  showScreen('start');

  loadAssets(() => {
    // Assets ready; game is already showing start screen.
    // Preview image cycles
    let pi = 0;
    const imgs = ['Asset/IdleRunNotcroped.jpeg','Asset/JumpNotcroped.png','Asset/CrouchNotcroped.jpeg'];
    setInterval(() => {
      pi = (pi + 1) % imgs.length;
      document.getElementById('preview-img').src = imgs[pi];
    }, 1800);
  });

  // Prevent context menu on long press
  window.addEventListener('contextmenu', e => e.preventDefault());
});

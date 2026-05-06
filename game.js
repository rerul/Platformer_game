// ============================================================
//  PIXEL RUSH — Platformer Game Engine
// ============================================================

const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');

// ── Resize ──────────────────────────────────────────────────
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ── Constants ───────────────────────────────────────────────
const GRAVITY   = 0.55;
const FRICTION  = 0.82;
const TILE      = 40;        // tile size in world px
const CAM_EASE  = 0.12;

// ── Palette ─────────────────────────────────────────────────
const C = {
  sky1:    '#1a1a3e',
  sky2:    '#0d0d1a',
  star:    'rgba(255,255,255,0.8)',
  ground:  '#2d6a4f',
  groundT: '#40916c',
  stone:   '#4a4e69',
  stoneT:  '#6c7199',
  player:  '#f7c948',
  playerE: '#ff4f6d',
  coin:    '#ffe066',
  coinR:   '#f7c948',
  enemy:   '#ff4f6d',
  enemyD:  '#c91a3a',
  flag:    '#4ade80',
  flagP:   '#166534',
  spike:   '#c9d1d9',
  bg1:     '#22234a',
  bg2:     '#181827',
};

// ── Game State ───────────────────────────────────────────────
let state = 'start';   // start | playing | dead | win
let score = 0;
let coins = 0;
let lives = 3;
let tick  = 0;

// ── Camera ───────────────────────────────────────────────────
const cam = { x: 0, y: 0, tx: 0, ty: 0 };

// ── Input ────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

// ── Stars (parallax bg) ─────────────────────────────────────
const stars = Array.from({ length: 120 }, () => ({
  x: Math.random() * 6000,
  y: Math.random() * 400,
  r: Math.random() * 1.5 + 0.5,
  speed: Math.random() * 0.3 + 0.05,
}));

// ── Level Definition ─────────────────────────────────────────
// Each platform: { x, y, w, h, type }   (world coords)
// type: 'ground' | 'stone'
const LEVEL = {
  platforms: [
    // ground floor
    { x: 0,    y: 520, w: 600,  h: 40,  type: 'ground' },
    { x: 700,  y: 520, w: 400,  h: 40,  type: 'ground' },
    { x: 1200, y: 520, w: 300,  h: 40,  type: 'ground' },
    { x: 1600, y: 520, w: 500,  h: 40,  type: 'ground' },
    { x: 2200, y: 520, w: 600,  h: 40,  type: 'ground' },
    { x: 2900, y: 520, w: 800,  h: 40,  type: 'ground' },
    { x: 3800, y: 520, w: 600,  h: 40,  type: 'ground' },
    { x: 4500, y: 520, w: 1000, h: 40,  type: 'ground' },
    // elevated platforms
    { x: 280,  y: 400, w: 160,  h: 20,  type: 'stone' },
    { x: 520,  y: 330, w: 120,  h: 20,  type: 'stone' },
    { x: 780,  y: 390, w: 140,  h: 20,  type: 'stone' },
    { x: 980,  y: 300, w: 160,  h: 20,  type: 'stone' },
    { x: 1250, y: 380, w: 120,  h: 20,  type: 'stone' },
    { x: 1450, y: 290, w: 200,  h: 20,  type: 'stone' },
    { x: 1700, y: 400, w: 140,  h: 20,  type: 'stone' },
    { x: 1920, y: 320, w: 120,  h: 20,  type: 'stone' },
    { x: 2120, y: 240, w: 160,  h: 20,  type: 'stone' },
    { x: 2350, y: 360, w: 180,  h: 20,  type: 'stone' },
    { x: 2600, y: 280, w: 140,  h: 20,  type: 'stone' },
    { x: 2820, y: 200, w: 200,  h: 20,  type: 'stone' },
    { x: 3100, y: 350, w: 160,  h: 20,  type: 'stone' },
    { x: 3350, y: 260, w: 140,  h: 20,  type: 'stone' },
    { x: 3600, y: 380, w: 120,  h: 20,  type: 'stone' },
    { x: 3900, y: 300, w: 200,  h: 20,  type: 'stone' },
    { x: 4150, y: 220, w: 160,  h: 20,  type: 'stone' },
    { x: 4400, y: 350, w: 120,  h: 20,  type: 'stone' },
  ],
  coins: [
    // ground level
    80, 160, 240, 400, 480, 560, 720, 800, 880,
    1000, 1080, 1250, 1330,
    1450, 1530, 1610,
    1700, 1780, 1860,
    2000, 2080, 2160,
    2350, 2430, 2510,
    2600, 2680,
    2900, 2980, 3060,
    3200, 3280, 3360,
    3500, 3580,
    3900, 3980, 4060,
    4200, 4280, 4360,
    4520, 4600, 4680, 4760, 4840,
  ].map(cx => ({ x: cx, y: 470, r: 10, collected: false })),
  enemies: [
    { x: 450,  y: 500, w: 36, h: 36, vx: 1.2, dir: 1, alive: true, left: 320,  right: 560 },
    { x: 820,  y: 500, w: 36, h: 36, vx: 1.0, dir: 1, alive: true, left: 720,  right: 1060 },
    { x: 1300, y: 500, w: 36, h: 36, vx: 1.4, dir: 1, alive: true, left: 1200, right: 1480 },
    { x: 1750, y: 500, w: 36, h: 36, vx: 1.2, dir: 1, alive: true, left: 1620, right: 2080 },
    { x: 2250, y: 500, w: 36, h: 36, vx: 1.6, dir: 1, alive: true, left: 2200, right: 2780 },
    { x: 2950, y: 500, w: 36, h: 36, vx: 1.3, dir: 1, alive: true, left: 2900, right: 3400 },
    { x: 3500, y: 500, w: 36, h: 36, vx: 1.5, dir: 1, alive: true, left: 3800, right: 4380 },
    { x: 4200, y: 500, w: 36, h: 36, vx: 1.8, dir: 1, alive: true, left: 4500, right: 5400 },
    // platform enemies
    { x: 800,  y: 365, w: 32, h: 32, vx: 1.0, dir: 1, alive: true, left: 780, right: 920 },
    { x: 1470, y: 265, w: 32, h: 32, vx: 1.2, dir: 1, alive: true, left: 1450, right: 1630 },
    { x: 2840, y: 175, w: 32, h: 32, vx: 1.0, dir: 1, alive: true, left: 2820, right: 3010 },
  ],
  flag: { x: 5200, y: 220, w: 20, h: 300 },
  spawnX: 60,
  spawnY: 460,
  levelEnd: 5400,
};

// Coin elevations on elevated platforms
const platformCoins = [
  { x: 310, y: 365 }, { x: 350, y: 365 }, { x: 390, y: 365 },
  { x: 545, y: 295 }, { x: 585, y: 295 },
  { x: 810, y: 355 }, { x: 850, y: 355 },
  { x: 1010, y: 265 }, { x: 1050, y: 265 }, { x: 1090, y: 265 },
  { x: 1480, y: 255 }, { x: 1520, y: 255 }, { x: 1560, y: 255 },
  { x: 2145, y: 205 }, { x: 2185, y: 205 },
  { x: 2850, y: 165 }, { x: 2890, y: 165 }, { x: 2930, y: 165 },
  { x: 3380, y: 225 }, { x: 3420, y: 225 },
  { x: 4170, y: 185 }, { x: 4210, y: 185 }, { x: 4250, y: 185 },
];
platformCoins.forEach(c => LEVEL.coins.push({ x: c.x, y: c.y, r: 10, collected: false }));

// ── Player ────────────────────────────────────────────────────
const player = {
  x: LEVEL.spawnX, y: LEVEL.spawnY,
  w: 28, h: 36,
  vx: 0, vy: 0,
  onGround: false,
  jumps: 0,           // double jump
  maxJumps: 2,
  dir: 1,
  invincible: 0,      // frames of invincibility after hit
  squish: 1,          // visual squish on land
};

function spawnPlayer() {
  player.x = LEVEL.spawnX;
  player.y = LEVEL.spawnY;
  player.vx = 0; player.vy = 0;
  player.onGround = false;
  player.jumps = 0;
  player.invincible = 0;
  player.squish = 1;
}

// ── Particles ─────────────────────────────────────────────────
const particles = [];

function spawnParticles(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const speed = Math.random() * 4 + 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1, decay: Math.random() * 0.04 + 0.03,
      r: Math.random() * 5 + 3,
      color,
    });
  }
}

// ── Collision helpers ─────────────────────────────────────────
function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolvePlatform(p, plat) {
  const overlapX = Math.min(p.x + p.w, plat.x + plat.w) - Math.max(p.x, plat.x);
  const overlapY = Math.min(p.y + p.h, plat.y + plat.h) - Math.max(p.y, plat.y);
  if (overlapX <= 0 || overlapY <= 0) return false;

  if (overlapY < overlapX) {
    // vertical collision
    if (p.y + p.h / 2 < plat.y + plat.h / 2) {
      // landing on top
      p.y = plat.y - p.h;
      if (p.vy > 2) {
        p.squish = 0.6;
      }
      p.vy = 0;
      p.onGround = true;
      p.jumps = 0;
    } else {
      p.y = plat.y + plat.h;
      p.vy = 0;
    }
  } else {
    // horizontal
    if (p.x + p.w / 2 < plat.x + plat.w / 2) p.x = plat.x - p.w;
    else p.x = plat.x + plat.w;
    p.vx = 0;
  }
  return true;
}

// ── Update ────────────────────────────────────────────────────
let jumpPressed = false;

function update() {
  tick++;

  // ── Player movement ──
  const speed = 5.2;
  if (keys['ArrowLeft']  || keys['KeyA']) { player.vx -= speed * 0.4; player.dir = -1; }
  if (keys['ArrowRight'] || keys['KeyD']) { player.vx += speed * 0.4; player.dir =  1; }

  const jumpKey = keys['ArrowUp'] || keys['KeyW'] || keys['Space'];
  if (jumpKey && !jumpPressed && player.jumps < player.maxJumps) {
    player.vy = -13.5;
    player.jumps++;
    spawnParticles(player.x + player.w / 2, player.y + player.h, '#adf', 5);
  }
  jumpPressed = !!jumpKey;

  player.vx *= FRICTION;
  player.vx = Math.max(-speed, Math.min(speed, player.vx));
  player.vy += GRAVITY;
  if (player.vy > 20) player.vy = 20;

  player.x += player.vx;
  player.y += player.vy;
  player.onGround = false;

  // ── Platform collision ──
  for (const plat of LEVEL.platforms) {
    const prev = { x: player.x, y: player.y - player.vy, w: player.w, h: player.h };
    if (rectOverlap(player, plat)) resolvePlatform(player, plat);
  }

  // ── Squish recovery ──
  player.squish += (1 - player.squish) * 0.15;

  // ── Invincibility ──
  if (player.invincible > 0) player.invincible--;

  // ── Coin collection ──
  for (const c of LEVEL.coins) {
    if (c.collected) continue;
    const dx = (player.x + player.w / 2) - c.x;
    const dy = (player.y + player.h / 2) - c.y;
    if (Math.sqrt(dx * dx + dy * dy) < c.r + player.w / 2) {
      c.collected = true;
      coins++;
      score += 100;
      spawnParticles(c.x, c.y, C.coin, 6);
    }
  }

  // ── Enemy update & collision ──
  for (const e of LEVEL.enemies) {
    if (!e.alive) continue;
    e.x += e.vx * e.dir;
    if (e.x < e.left || e.x + e.w > e.right) e.dir *= -1;

    // Player stomps enemy (falling onto it)
    if (player.vy > 0 && player.invincible === 0 &&
        player.x + player.w > e.x + 4 && player.x < e.x + e.w - 4 &&
        player.y + player.h > e.y && player.y + player.h < e.y + e.h * 0.6) {
      e.alive = false;
      player.vy = -10;
      player.jumps = 0;
      score += 200;
      spawnParticles(e.x + e.w / 2, e.y + e.h / 2, C.enemy, 10);
    } else if (player.invincible === 0 && rectOverlap(player, e)) {
      // Player hit by enemy
      player.invincible = 90;
      lives--;
      spawnParticles(player.x + player.w / 2, player.y + player.h / 2, C.playerE, 12);
      if (lives <= 0) { state = 'dead'; showScreen('game-over-screen'); }
    }
  }

  // ── Flag / win ──
  const flag = LEVEL.flag;
  if (player.x + player.w > flag.x && player.x < flag.x + flag.w &&
      player.y + player.h > flag.y && player.y < flag.y + flag.h) {
    score += coins * 50;
    state = 'win';
    showScreen('win-screen');
  }

  // ── Fall off world ──
  if (player.y > 700) {
    lives--;
    if (lives <= 0) { state = 'dead'; showScreen('game-over-screen'); }
    else spawnPlayer();
  }

  // ── Camera ──
  const targetX = player.x - canvas.width  / 2 + player.w / 2;
  const targetY = player.y - canvas.height / 2 + player.h / 2;
  cam.x += (targetX - cam.x) * CAM_EASE;
  cam.y += (targetY - cam.y) * CAM_EASE;
  cam.x = Math.max(0, Math.min(cam.x, LEVEL.levelEnd - canvas.width));
  cam.y = Math.max(-200, Math.min(cam.y, 200));

  // ── Particles ──
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x  += p.vx; p.y  += p.vy;
    p.vy += 0.15;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // ── HUD ──
  document.getElementById('score-display').textContent = String(score).padStart(6, '0');
  document.getElementById('coin-display').textContent  = coins;
  document.getElementById('lives-display').textContent = '♥ '.repeat(Math.max(0, lives)).trim();
}

// ── Draw ──────────────────────────────────────────────────────
function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, C.sky1);
  sky.addColorStop(1, C.sky2);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars (parallax)
  ctx.save();
  ctx.translate(-cam.x * 0.15, -cam.y * 0.05);
  for (const s of stars) {
    ctx.globalAlpha = 0.6 + Math.sin(tick * 0.03 + s.x) * 0.3;
    ctx.fillStyle = C.star;
    ctx.beginPath();
    ctx.arc(s.x % W + (s.x / W | 0) * W, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.translate(-cam.x, -cam.y + (H - 560)); // world-to-screen

  // ── Flag ──
  const flag = LEVEL.flag;
  // pole
  ctx.fillStyle = C.flagP;
  ctx.fillRect(flag.x, flag.y, flag.w, flag.h);
  // flag cloth animation
  ctx.fillStyle = C.flag;
  for (let i = 0; i < 4; i++) {
    const fy = flag.y + i * 30;
    const wave = Math.sin(tick * 0.08 + i * 0.8) * 8;
    ctx.beginPath();
    ctx.moveTo(flag.x + flag.w, fy);
    ctx.lineTo(flag.x + flag.w + 50 + wave, fy + 15);
    ctx.lineTo(flag.x + flag.w, fy + 30);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('GOAL', flag.x - 8, flag.y - 12);

  // ── Platforms ──
  for (const plat of LEVEL.platforms) {
    const isGround = plat.type === 'ground';
    const topColor  = isGround ? C.groundT : C.stoneT;
    const bodyColor = isGround ? C.ground  : C.stone;

    // body
    ctx.fillStyle = bodyColor;
    ctx.fillRect(plat.x, plat.y + 6, plat.w, plat.h - 6);

    // top strip
    ctx.fillStyle = topColor;
    ctx.fillRect(plat.x, plat.y, plat.w, 6);

    // pixel detail: small dark lines
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let bx = plat.x; bx < plat.x + plat.w; bx += 20) {
      ctx.fillRect(bx, plat.y + 6, 2, plat.h - 6);
    }
  }

  // ── Coins ──
  for (const c of LEVEL.coins) {
    if (c.collected) continue;
    const bob = Math.sin(tick * 0.07 + c.x * 0.05) * 3;
    // glow
    ctx.shadowColor = C.coin;
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = C.coin;
    ctx.beginPath();
    ctx.arc(c.x, c.y + bob, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(c.x - 2, c.y + bob - 2, c.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Enemies ──
  for (const e of LEVEL.enemies) {
    if (!e.alive) continue;
    // body
    ctx.fillStyle = C.enemy;
    ctx.fillRect(e.x, e.y, e.w, e.h);
    // darker bottom
    ctx.fillStyle = C.enemyD;
    ctx.fillRect(e.x, e.y + e.h * 0.6, e.w, e.h * 0.4);
    // eyes
    const eyeDir = e.dir;
    ctx.fillStyle = '#fff';
    ctx.fillRect(e.x + (eyeDir > 0 ? e.w * 0.55 : e.w * 0.1), e.y + 6, 8, 8);
    ctx.fillStyle = '#000';
    ctx.fillRect(e.x + (eyeDir > 0 ? e.w * 0.65 : e.w * 0.15), e.y + 8, 4, 4);
    // angry brow
    ctx.fillStyle = '#8a0020';
    ctx.fillRect(e.x + (eyeDir > 0 ? e.w * 0.5 : e.w * 0.05), e.y + 2, 12, 3);
  }

  // ── Player ──
  const alpha = player.invincible > 0 ? (Math.floor(tick / 5) % 2 === 0 ? 0.3 : 1) : 1;
  ctx.globalAlpha = alpha;

  const px = player.x + player.w / 2;
  const py = player.y + player.h;
  const sh = player.h * player.squish;
  const sw = player.w * (2 - player.squish);

  ctx.save();
  ctx.translate(px, py);
  ctx.scale(player.dir, 1);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 4, sw / 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -sh);

  // Body
  ctx.fillStyle = C.player;
  ctx.fillRect(-sw / 2, 0, sw, sh);

  // Hat
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-sw / 2, -8, sw, 8);
  ctx.fillRect(-sw / 2 - 3, -2, sw + 6, 4);

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(sw * 0.05, sh * 0.15, 8, 8);
  ctx.fillStyle = '#000';
  ctx.fillRect(sw * 0.15, sh * 0.2, 4, 4);

  // Smile
  ctx.fillStyle = '#000';
  ctx.fillRect(sw * 0.05, sh * 0.55, 10, 3);
  ctx.fillRect(sw * 0.15, sh * 0.58, 3, 5);

  // Shoes
  ctx.fillStyle = '#222';
  ctx.fillRect(-sw / 2, sh - 6, sw / 2 + 2, 6);
  ctx.fillRect(2, sh - 6, sw / 2, 6);

  ctx.restore();
  ctx.globalAlpha = 1;

  // ── Particles ──
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // end world transform
}

// ── Game Loop ─────────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);
  if (state === 'playing') {
    update();
    draw();
  }
}

// ── Screen helpers ───────────────────────────────────────────
function hideAllScreens() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
}

function showScreen(id) {
  hideAllScreens();
  document.getElementById(id).classList.add('active');
  if (id === 'game-over-screen') {
    document.getElementById('final-score-text').textContent = `SCORE: ${String(score).padStart(6,'0')}`;
  }
  if (id === 'win-screen') {
    document.getElementById('win-score-text').textContent = `FINAL SCORE: ${String(score).padStart(6,'0')}`;
  }
}

function resetGame() {
  score = 0; coins = 0; lives = 3; tick = 0;
  cam.x = 0; cam.y = 0;
  LEVEL.coins.forEach(c => c.collected = false);
  LEVEL.enemies.forEach(e => {
    e.alive = true;
    e.x = e.left + (e.right - e.left) / 2;
  });
  particles.length = 0;
  spawnPlayer();
  state = 'playing';
  hideAllScreens();
}

// ── Button wiring ─────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click', resetGame);
document.getElementById('restart-btn').addEventListener('click', resetGame);
document.getElementById('win-restart-btn').addEventListener('click', resetGame);

// ── Kick off ──────────────────────────────────────────────────
loop();

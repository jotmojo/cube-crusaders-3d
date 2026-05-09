// main.js — Cube Crusaders 3D — Session 2 fixes
// Fixes: wall collision, player X-ray behind walls, level 2 transition,
//        exit countdown, minimap, door outside safe zone

import * as THREE from 'three';
import { Renderer }     from './core/Renderer.js';
import { InputManager } from './core/InputManager.js';
import { Player }       from './entities/Player.js';
import { Zombie }       from './entities/Zombie.js';
import { World, WORLD, BOUNDS } from './world/World.js';
import { HUD, TitleScreen, GameOverScreen } from './ui/HUD.js';
import { ScoreManager, RadiationTimer, BulletManager, SniperAlly } from './systems/Systems.js';

// ─── STATE ────────────────────────────────────────────────────
let renderer, input, world, player, hud;
let zombies = [], snipers = [];
let playerBullets, zombieBullets;
let score, rad;
let coinsCollected = 0, coinsNeeded = 10, level = 1;
let gameActive = false;
let exitCountdownMs = 0, exitCountdownActive = false;
let doorUnlocked = false;
let spawnTimer = 0, spawnRate = 3200, maxZombies = 14, zombieLevel = 1;
let lastTime = -1;
let savedScore = 0;
let levelTransitioning = false;

// ─── INIT ─────────────────────────────────────────────────────
function init() {
  const canvas = document.getElementById('game-canvas');
  renderer = new Renderer(canvas);
  input    = new InputManager(canvas, renderer.camera);
  hud      = new HUD();

  new TitleScreen(() => startGame(1));
  new GameOverScreen(
    () => { document.getElementById('gameover-screen').style.display = 'none'; startGame(1); },
    () => { document.getElementById('gameover-screen').style.display = 'none'; document.getElementById('title-screen').style.display = 'flex'; }
  );

  requestAnimationFrame(loop);
}

// ─── START GAME ───────────────────────────────────────────────
function startGame(lvl) {
  levelTransitioning = false;

  // Clear previous scene objects (keep lights by re-adding them)
  const toRemove = [];
  renderer.scene3d.traverse(obj => { if (obj !== renderer.scene3d) toRemove.push(obj); });
  toRemove.forEach(obj => renderer.scene3d.remove(obj));
  renderer._setupLighting();

  // Reset state
  level               = lvl;
  coinsCollected      = 0;
  coinsNeeded         = lvl === 1 ? 10 : lvl === 2 ? 20 : 30;
  exitCountdownActive = false;
  exitCountdownMs     = 0;
  doorUnlocked        = false;
  zombies             = [];
  snipers             = [];
  spawnRate           = lvl === 1 ? 3200 : lvl === 2 ? 4000 : 3000;
  maxZombies          = lvl === 1 ? 14 : lvl === 2 ? 16 : 22;
  zombieLevel         = Math.min(lvl, 4); // cap at level 4 zombies
  spawnTimer          = 0;
  gameActive          = true;
  lastTime            = -1;
  renderer._cameraReady = false;

  // Build world
  world  = new World(renderer.scene3d, lvl);
  _wallMeshes = null; // reset — will rebuild after first frame
  _xrayWalls  = new Set();

  // Player spawns safely away from buildings
  player = new Player(renderer.scene3d, 0, 10);

  // Systems
  score = new ScoreManager(lvl === 1 ? 0 : savedScore);
  rad   = new RadiationTimer(lvl === 1 ? 9000 : lvl === 2 ? 7000 : 5500);
  rad.onDamage = () => {
    loseLife('RADIATION!');
  };

  playerBullets = new BulletManager(renderer.scene3d);
  zombieBullets = new BulletManager(renderer.scene3d);

  // Initial zombies
  const initZ = lvl === 1 ? 5 : lvl === 2 ? 6 : 9;
  for (let i = 0; i < initZ; i++) spawnZombie();

  hud.setLevel(lvl);
  if (lvl === 2) {
    hud.popup('LEVEL 2 — ZOMBIES NOW SHOOT!', '#ff4400', 3000);
  }

  document.getElementById('hud').style.display = 'block';
}

// ─── WALL COLLISION ───────────────────────────────────────────
// Pushes an entity out of any wall it's overlapping
function resolveWallCollisions(pos, radius = 0.55) {
  world.walls.forEach(w => {
    // AABB vs circle — find closest point on rect to circle center
    const clampX = Math.max(w.minX, Math.min(w.maxX, pos.x));
    const clampZ = Math.max(w.minZ, Math.min(w.maxZ, pos.z));
    const dx = pos.x - clampX;
    const dz = pos.z - clampZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < radius && dist > 0) {
      // Push out along the collision normal
      const nx = dx / dist;
      const nz = dz / dist;
      pos.x = clampX + nx * radius;
      pos.z = clampZ + nz * radius;
    } else if (dist === 0) {
      // Exactly on wall edge — push right
      pos.x += radius;
    }
  });

  // World border clamp
  pos.x = Math.max(BOUNDS.minX + radius, Math.min(BOUNDS.maxX - radius, pos.x));
  pos.z = Math.max(BOUNDS.minZ + radius, Math.min(BOUNDS.maxZ - radius, pos.z));
}

// ─── X-RAY: player visible through walls (OPTIMIZED) ─────────
// Uses a pre-built list of wall meshes collected ONCE after world build.
// Only runs every 4 frames (throttled) to avoid per-frame traverse cost.
// The player outline (depthTest:false on BackSide) handles always-visible.

let _xrayWalls   = new Set();
let _wallMeshes  = null; // built once after startGame
let _xrayFrame   = 0;
const _xrayRay   = new THREE.Raycaster();
const _xrayDir   = new THREE.Vector3();

function buildWallMeshList() {
  _wallMeshes = [];
  renderer.scene3d.traverse(obj => {
    // Only include static wall/building geometry — exclude bullets, particles, sprites
    if (obj.isMesh
      && obj !== player.mesh
      && obj !== player.shadowBlob
      && obj !== player.outline
      && obj !== player.facingArrow
      && !obj.isSprite
      && obj.geometry // has geometry
    ) {
      _wallMeshes.push(obj);
    }
  });
}

function updateXray() {
  if (!player || !renderer.camera || !_wallMeshes) return;
  _xrayFrame++;
  if (_xrayFrame % 4 !== 0) return; // only every 4 frames

  const camPos    = renderer.camera.position;
  const playerPos = player.mesh.position;

  _xrayDir.subVectors(playerPos, camPos).normalize();
  _xrayRay.set(camPos, _xrayDir);

  const playerDist = camPos.distanceTo(playerPos);
  const hits = _xrayRay.intersectObjects(_wallMeshes, false);

  const nowBlocking = new Set();
  hits.forEach(h => {
    if (h.distance < playerDist - 0.5) nowBlocking.add(h.object);
  });

  nowBlocking.forEach(mesh => {
    if (!_xrayWalls.has(mesh)) {
      if (mesh._origOpacity === undefined) {
        mesh._origOpacity = Array.isArray(mesh.material)
          ? mesh.material.map(m => m.opacity ?? 1)
          : (mesh.material.opacity ?? 1);
        mesh._origTransp  = Array.isArray(mesh.material)
          ? mesh.material.map(m => m.transparent)
          : mesh.material.transparent;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(m => { m.transparent = true; m.opacity = 0.22; });
    }
  });

  _xrayWalls.forEach(mesh => {
    if (!nowBlocking.has(mesh) && mesh._origOpacity !== undefined) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m, i) => {
        m.opacity     = Array.isArray(mesh._origOpacity) ? mesh._origOpacity[i] : mesh._origOpacity;
        m.transparent = Array.isArray(mesh._origTransp)  ? mesh._origTransp[i]  : mesh._origTransp;
      });
    }
  });

  _xrayWalls = nowBlocking;
}

// ─── SPAWN ────────────────────────────────────────────────────
function spawnZombie() {
  const { x, z } = world.getRandomSpawnEdge();
  const lvl = (Math.random() < 0.3 && zombieLevel > 1)
    ? Math.min(zombieLevel + 1, 4) : zombieLevel;
  zombies.push(new Zombie(renderer.scene3d, x, z, lvl));
}

// ─── HELPERS ─────────────────────────────────────────────────
function flashScreen(color = '#ff0000') {
  const canvas = renderer.renderer.domElement;
  canvas.style.filter = `brightness(2) sepia(1) saturate(3) hue-rotate(${color === '#ff0000' ? '0' : '90'}deg)`;
  setTimeout(() => { canvas.style.filter = ''; }, 80);
}

// ─── LOSE A LIFE (Pac-Man style reset) ───────────────────────
let _lifeResetting = false;

function loseLife(reason) {
  if (!gameActive || _lifeResetting) return;
  if (!player.takeDamage()) return; // invincible, ignore

  _lifeResetting = true;

  // Big red flash
  const canvas = renderer.renderer.domElement;
  canvas.style.filter = 'brightness(3) saturate(0)';

  // Show reason
  hud.popup(`☠ ${reason}`, '#ff2200', 2200);

  // Freeze game briefly
  gameActive = false;

  if (player.health <= 0) {
    // Dead — wait then game over
    setTimeout(() => {
      canvas.style.filter = '';
      gameOver(false);
      _lifeResetting = false;
    }, 1200);
    return;
  }

  // Still alive — do Pac-Man style reset
  // 1. Freeze 0.6s (white flash)
  setTimeout(() => { canvas.style.filter = 'brightness(0.3)'; }, 200);
  setTimeout(() => { canvas.style.filter = 'brightness(2)'; }, 500);
  setTimeout(() => { canvas.style.filter = 'brightness(0.3)'; }, 700);
  setTimeout(() => { canvas.style.filter = 'brightness(2)'; }, 900);
  setTimeout(() => {
    canvas.style.filter = '';

    // 2. Respawn player at safe starting position
    player.mesh.position.set(0, 0.6, 10);
    player.mesh.rotation.y = 0;
    if (player._flashPivot) player._flashPivot.position.set(0, 0.018, 10);
    player.shadowBlob.position.set(0, 0.03, 10);
    player.isInvincible = true;
    player.invincibleTimer = 3000; // 3s invincibility after respawn

    // 3. Push ALL zombies back to edges
    zombies.forEach(z => {
      if (z.isDead) return;
      const { x, z: zz } = world.getRandomSpawnEdge();
      z.mesh.position.set(x, z.mesh.position.y, zz);
    });

    // 4. Clear all bullets
    playerBullets.clear();
    zombieBullets.clear();

    // 5. Resume
    gameActive = true;
    _lifeResetting = false;
    hud.popup('GET READY!', '#ffcc00', 1200);
  }, 1400);
}

// ─── GAME LOOP ────────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);
  if (lastTime < 0) lastTime = ts;
  const dt  = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime  = ts;
  const now = ts;

  if (!gameActive) { renderer.render(); return; }
  if (_lifeResetting) { renderer.render(); return; }

  // ── Player movement + collision ──
  input.updateAim(player.position);
  player.update(dt, input, null); // pass null — we handle collision ourselves

  // Resolve player vs walls
  resolveWallCollisions(player.mesh.position, 0.6);
  player.shadowBlob.position.x = player.mesh.position.x;
  player.shadowBlob.position.z = player.mesh.position.z;

  // ── X-ray: make walls transparent when player is behind them ──
  if (!_wallMeshes) buildWallMeshList(); // build once after world is ready
  updateXray();

  // ── Shooting ──
  if (input.isShooting()) {
    const shots = player.tryShoot(now, input.aimDir);
    shots.forEach(s => playerBullets.spawn({ ...s, team: 'player' }));
  }

  // ── Bullets ──
  playerBullets.update(dt);
  zombieBullets.update(dt);

  // Player bullets vs zombies
  const liveZombies = zombies.filter(z => !z.isDead);
  playerBullets.checkHits(liveZombies).forEach(({ bullet, target }) => {
    if (target.hit(bullet.damage || 1)) {
      const r = score.add(target.scoreValue);
      hud.popup(`+${r.earned}`, r.multiplier > 1 ? '#ffcc00' : '#ffffff', 800);
      target.die();
      playerBullets.explode(target.position.clone(), 0x22cc44);
    }
  });

  // Zombie bullets vs player
  if (zombieBullets.checkPlayerHit(player.position)) {
    loseLife('SHOT!');
  }

  // ── Zombie touch damage (level 1 only — level 2+ shoot) ──
  liveZombies.forEach(z => {
    if (z.isDead || z.def.shoots) return;
    // Zombies can't enter safe zones
    if (world.isInSafeZone(z.position)) return;
    const dx = player.position.x - z.position.x;
    const dz = player.position.z - z.position.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.0) {
      loseLife('GRABBED!');
    }
  });

  // ── Zombie update + collision ──
  zombies.forEach(z => {
    if (z.isDead) return;
    const inSafe      = world.isInSafeZone(z.position);
    const playerSafe  = world.isInSafeZone(player.position);

    // Target player — if player is safe, zombies wander near entrance
    const targetPos = playerSafe
      ? new THREE.Vector3(z.position.x + Math.sin(now/1000)*2, 0, z.position.z + Math.cos(now/1200)*2)
      : player.position;

    // Block zombie from entering safe zones
    const shot = z.update(dt, targetPos, now);
    if (shot) zombieBullets.spawn({ ...shot, team: 'zombie' });

    // Resolve zombie vs walls (non-building walls only)
    if (!inSafe) {
      world.walls.forEach(w => {
        if (w.blockZombies) return; // building walls handled by safe zone check
        const cx = Math.max(w.minX, Math.min(w.maxX, z.position.x));
        const cz = Math.max(w.minZ, Math.min(w.maxZ, z.position.z));
        const dx = z.position.x - cx, dz = z.position.z - cz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.6 && dist > 0) {
          z.mesh.position.x = cx + (dx / dist) * 0.6;
          z.mesh.position.z = cz + (dz / dist) * 0.6;
        }
      });
    }

    // Push zombie back out of safe zone if it somehow got in
    if (inSafe && !playerSafe) {
      // Find nearest safe zone edge and push out
      const sz = world.safeZones.find(s =>
        z.position.x > s.minX && z.position.x < s.maxX &&
        z.position.z > s.minZ && z.position.z < s.maxZ
      );
      if (sz) {
        const midX = (sz.minX + sz.maxX) / 2;
        const midZ = (sz.minZ + sz.maxZ) / 2;
        const dx = z.position.x - midX, dz = z.position.z - midZ;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        z.mesh.position.x = midX + (dx / len) * ((sz.maxX - sz.minX) / 2 + 0.5);
        z.mesh.position.z = midZ + (dz / len) * ((sz.maxZ - sz.minZ) / 2 + 0.5);
      }
    }

    // World border clamp
    z.mesh.position.x = Math.max(BOUNDS.minX + 0.5, Math.min(BOUNDS.maxX - 0.5, z.mesh.position.x));
    z.mesh.position.z = Math.max(BOUNDS.minZ + 0.5, Math.min(BOUNDS.maxZ - 0.5, z.mesh.position.z));
  });

  // ── Snipers ──
  snipers = snipers.filter(s => !s.isDone);
  snipers.forEach(s => {
    const shot = s.update(dt, now, liveZombies);
    if (shot) playerBullets.spawn({ ...shot, team: 'player' });
  });

  // ── Pickup collection ──
  if (world.collectCoin(player.position)) {
    coinsCollected++;
    score.add(5);
    hud.popup('🪙 COIN!', '#ffcc00', 600);
    if (coinsCollected >= coinsNeeded && !doorUnlocked) unlockDoor();
  }

  const pickup = world.collectPickup(player.position);
  if (pickup) {
    score.add(25);
    if      (pickup === 'sniperToken')  { snipers.push(new SniperAlly(renderer.scene3d, player.position.x + 1.5, player.position.z + 1.5, 9000)); hud.popup('🎯 SNIPER DEPLOYED!', '#00ccff'); }
    else if (pickup === 'heartToken')   { player.addLife(); hud.popup('❤ +1 LIFE!', '#ff88aa'); }
    else if (pickup === 'weaponOmni')   { player.activateSpecial('omni');   hud.popup('💥 OMNI SHOT! 8s', '#ff8800'); }
    else if (pickup === 'weaponSpiral') { player.activateSpecial('spiral'); hud.popup('🌀 SPIRAL! 50 ammo', '#aa00ff'); }
    else if (pickup === 'speedBoot')   { player.activateSpeedBoost(6000); hud.popup('⚡ SPEED BOOST! 6s', '#0088ff'); }
  }

  // ── Door interaction ──
  if (doorUnlocked && !levelTransitioning && world.isNearDoor(player.position, 1.5)) {
    if (level < 3) {
      // Advance to next level
      levelTransitioning = true;
      savedScore = score.score;
      gameActive = false;
      hud.popup(`🏆 LEVEL ${level} COMPLETE! LOADING LEVEL ${level + 1}...`, '#00ff66', 2500);
      setTimeout(() => startGame(level + 1), 2600);
    } else {
      // Level 3 complete — full win!
      gameOver(true);
    }
    return;
  }

  // ── Radiation ──
  const inSafe = world.isInSafeZone(player.position);
  if (inSafe  && !rad.isActive) rad.enter();
  if (!inSafe &&  rad.isActive) rad.exit();
  rad.update(dt);

  // ── Exit countdown ──
  if (exitCountdownActive) {
    exitCountdownMs -= dt * 1000;
    if (exitCountdownMs <= 10000 && Math.floor(exitCountdownMs / 500) % 2 === 0) {
      renderer.scene3d.background = new THREE.Color(0x1a0000);
    } else {
      renderer.scene3d.background = new THREE.Color(0x080810);
    }
    if (exitCountdownMs <= 0) {
      exitCountdownMs = level === 1 ? 30000 : 25000;
      loseLife('TOO SLOW!');
      for (let i = 0; i < 3; i++) spawnZombie();
    }
  }

  // ── Score + world ──
  score.update(dt);
  world.update(dt, now);
  world.updateRadTimers(rad, player.position);

  // ── Zombie spawning ──
  spawnTimer += dt * 1000;
  if (spawnTimer >= spawnRate && zombies.filter(z => !z.isDead).length < maxZombies) {
    spawnTimer = 0;
    spawnZombie();
  }

  // ── Camera ──
  renderer.followTarget(player.position, dt);

  // ── HUD ──
  hud.update({
    level, score: score.score, highScore: score.highScore,
    lives:       player.health,
    weapon:      player.getWeapon().name,
    radPct:      rad.getPercent(),
    inBuilding:  inSafe,
    radDangerous: rad.isDangerous,
    coins:       coinsCollected, coinsNeeded,
    combo:       score.getComboMultiplier(),
    exitMs:      exitCountdownActive ? exitCountdownMs : null,
    special:     player.getSpecialInfo(),
    speedBoost:  player.getSpeedBoostInfo(),
    worldW:      WORLD.W, worldH: WORLD.H,
    playerPos:   player.position,
    zombies:     zombies.map(z => ({ isDead: z.isDead, position: z.position, level: z.level })),
    safeZones:   world.safeZones,
    doorPos:     world.doorPos,
    doorOpen:    doorUnlocked,
  });

  renderer.render();
}

// ─── UNLOCK DOOR ──────────────────────────────────────────────
function unlockDoor() {
  doorUnlocked = true;
  world.unlockDoor();
  exitCountdownActive = true;
  exitCountdownMs     = level === 1 ? 45000 : 40000;
  hud.popup('🚪 EXIT UNLOCKED! GET TO THE DOOR!', '#00ff66', 3500);
  for (let i = 0; i < 4; i++) spawnZombie();
}

// ─── GAME OVER ────────────────────────────────────────────────
function gameOver(won) {
  if (!gameActive && !levelTransitioning) return;
  gameActive = false;
  levelTransitioning = false;
  playerBullets?.clear();
  zombieBullets?.clear();

  setTimeout(() => {
    const el = document.getElementById('gameover-screen');
    if (el) {
      el.style.display = 'flex';
      const title   = document.getElementById('gameover-title');
      const levelEl = document.getElementById('gameover-level');
      const scoreEl = document.getElementById('gameover-score');
      const highEl  = document.getElementById('gameover-high');
      const quoteEl = document.getElementById('gameover-quote');

      if (title)   { title.textContent = won ? '🏆 VICTORY!' : 'GAME OVER'; title.className = won ? 'won-title' : ''; }
      if (levelEl) levelEl.textContent = `LEVEL ${level} ${won ? 'COMPLETE' : 'REACHED'}`;
      if (scoreEl) scoreEl.textContent = String(score.score).padStart(7, '0');

      const hi    = parseInt(localStorage.getItem('ccHighScore') || '0');
      const isNew = score.score > 0 && score.score >= hi;
      if (highEl) { highEl.textContent = isNew ? '★ NEW HIGH SCORE! ★' : `BEST: ${hi.toLocaleString()}`; highEl.style.color = isNew ? '#ffcc00' : '#666'; }

      const quotes = ['"Get in. Get out. Or get cubed."', '"The radiation waits for no one."', '"One more run. You got this."'];
      if (quoteEl) quoteEl.textContent = quotes[Math.floor(Math.random() * quotes.length)];

      document.getElementById('btn-replay')?.addEventListener('click', () => {
        el.style.display = 'none'; startGame(1);
      }, { once: true });
      document.getElementById('btn-menu')?.addEventListener('click', () => {
        el.style.display = 'none';
        document.getElementById('title-screen').style.display = 'flex';
      }, { once: true });
    }
  }, 600);
}

// ─── START ────────────────────────────────────────────────────
init();

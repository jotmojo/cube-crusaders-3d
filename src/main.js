// main.js — Cube Crusaders 3D — Session 2 fixes
// Fixes: wall collision, player X-ray behind walls, level 2 transition,
//        exit countdown, minimap, door outside safe zone

import * as THREE from 'three';
import { Renderer }     from './core/Renderer.js';
import { InputManager, IS_TOUCH } from './core/InputManager.js';
import { Player }       from './entities/Player.js';
import { Zombie }       from './entities/Zombie.js';
import { World, WORLD, BOUNDS } from './world/World.js';
import { HUD, TitleScreen, GameOverScreen } from './ui/HUD.js';
import { ScoreManager, RadiationTimer, BulletManager, SniperAlly } from './systems/Systems.js';
import { PracticeRange } from './ui/PracticeRange.js';

// ─── STATE ────────────────────────────────────────────────────
let renderer, input, world, player, hud;
let zombies = [], snipers = [];
let playerBullets, zombieBullets;
let score, rad;
let coinsCollected = 0, coinsNeeded = 10, level = 1;
let gameActive = false;
let coinBagTimer = 0;  // ms until next coin bag spawns
let invisTimer = 0;    // ms remaining for invisibility
let ghostTimer = 0;    // ms remaining for ghost mode
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

  // Practice Range
  const practiceRange = new PracticeRange(renderer, () => {
    // On exit — clear scene and show title
    const toRemove = [];
    renderer.scene3d.traverse(obj => { if (obj !== renderer.scene3d) toRemove.push(obj); });
    toRemove.forEach(obj => renderer.scene3d.remove(obj));
    renderer._setupLighting();
    document.getElementById('title-screen').style.display = 'flex';
  });

  document.getElementById('btn-practice')?.addEventListener('click', () => {
    document.getElementById('title-screen').style.display = 'none';
    practiceRange.show();
  });

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
  coinsNeeded         = Math.min(10 + (lvl - 1) * 10, 50);
  exitCountdownActive = false;
  exitCountdownMs     = 0;
  doorUnlocked        = false;
  zombies             = [];
  snipers             = [];
  spawnRate           = Math.max(1500, 3200 - (lvl - 1) * 300);
  maxZombies          = Math.min(12 + lvl * 2, 30);
  zombieLevel         = Math.min(Math.ceil(lvl / 2), 4);
  spawnTimer          = 0;
  coinBagTimer        = 8000; // first bag after 8s
  invisTimer          = 0;
  ghostTimer          = 0;
  gameActive          = true;
  // mobile UI shown after world builds
  lastTime            = -1;
  renderer._cameraReady = false;
  // (mobile UI shown after world builds)

  // Build world
  const mapNum = ((lvl - 1) % 3) + 1; // cycle 3 maps
  world  = new World(renderer.scene3d, mapNum);
  _xrayWalls  = new Set();

  // Player spawns safely away from buildings
  player = new Player(renderer.scene3d, 0, 10);

  // Systems
  score = new ScoreManager(lvl === 1 ? 0 : savedScore);
  rad   = new RadiationTimer(Math.max(4000, 9000 - (lvl - 1) * 800));
  rad.onDamage = () => {
    loseLife('RADIATION!');
  };

  playerBullets = new BulletManager(renderer.scene3d);
  zombieBullets = new BulletManager(renderer.scene3d);

  // Initial zombies
  const initZ = Math.min(3 + lvl, 10);
  for (let i = 0; i < initZ; i++) spawnZombie();
  input.showMobileUI(true); // show joysticks now that world is ready

  hud.setLevel(lvl);
  if (lvl > 1) {
    hud.popup('LEVEL ' + lvl + ' — ' + (lvl >= 3 ? 'SHOOTER ZOMBIES!' : 'ZOMBIES NOW SHOOT!'), '#ff4400', 2500);
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
  if (_lifeResetting) return;
  if (!player.takeDamage()) return; // still invincible

  _lifeResetting = true;
  gameActive = false;

  const canvas = renderer.renderer.domElement;
  const flashes = [
    [0,   'brightness(4) saturate(0)'],
    [180, 'brightness(0.15)'],
    [360, 'brightness(3)'],
    [540, 'brightness(0.15)'],
    [720, 'brightness(2.5)'],
    [900, ''],
  ];
  flashes.forEach(([t, f]) => setTimeout(() => { canvas.style.filter = f; }, t));
  hud.popup('\u2620 ' + reason, '#ff2200', 2000);

  if (player.health <= 0) {
    setTimeout(() => showContinueScreen(), 1000);
    return;
  }

  setTimeout(() => {
    player.mesh.position.set(0, 0.6, 10);
    player.mesh.rotation.y = 0;
    if (player._flashPivot) player._flashPivot.position.set(0, 0.018, 10);
    player.shadowBlob.position.set(0, 0.03, 10);
    player.isInvincible    = true;
    player.invincibleTimer = 3000;
    zombies.forEach(z => {
      if (z.isDead) return;
      const edge = world.getRandomSpawnEdge();
      z.mesh.position.x = edge.x;
      z.mesh.position.z = edge.z;
    });
    playerBullets.clear();
    zombieBullets.clear();
    gameActive     = true;
    _lifeResetting = false;
    hud.popup('GET READY!', '#ffcc00', 1200);
  }, 1000);
}

// ─── CONTINUE SCREEN ──────────────────────────────────────────
function showContinueScreen() {
  input.showMobileUI(false);
  let overlay = document.getElementById('continue-screen');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'continue-screen';
    overlay.style.cssText = [
      'position:fixed','inset:0','background:rgba(0,0,0,0.92)',
      'display:flex','flex-direction:column','align-items:center',
      'justify-content:center','z-index:200',
      "font-family:'Press Start 2P','Courier New',monospace"
    ].join(';');
    document.body.appendChild(overlay);
  }
  const hi = parseInt(localStorage.getItem('ccHighScore') || '0');
  const isNew = score.score > 0 && score.score >= hi;
  const hiText = isNew ? 'NEW HIGH SCORE!' : 'BEST: ' + hi.toLocaleString();
  overlay.innerHTML = [
    '<div style="font-size:48px;color:#ff2200;text-shadow:0 0 30px #ff2200;letter-spacing:3px;margin-bottom:12px">GAME OVER</div>',
    '<div style="font-size:11px;color:#888;letter-spacing:3px;margin-bottom:8px">LEVEL ' + level + ' REACHED</div>',
    '<div style="border:3px solid #333;padding:20px 50px;margin:18px 0;text-align:center;background:rgba(10,10,20,0.8)">',
      '<div style="font-size:10px;color:#888;letter-spacing:2px;margin-bottom:6px">FINAL SCORE</div>',
      '<div style="font-size:38px;color:#fff;letter-spacing:4px">' + String(score.score).padStart(7,'0') + '</div>',
      '<div style="font-size:10px;color:#ffcc00;margin-top:8px">' + hiText + '</div>',
    '</div>',
    '<div style="font-size:13px;color:#ffcc00;margin-bottom:24px;letter-spacing:2px;text-shadow:0 0 10px #ffcc00">CONTINUE?</div>',
    '<div style="display:flex;gap:14px">',
      '<button id="btn-continue" style="font-size:12px;font-family:inherit;color:#00ff66;border:3px solid #00ff66;background:rgba(0,20,10,0.9);padding:14px 32px;cursor:pointer;letter-spacing:2px">CONTINUE</button>',
      '<button id="btn-quit-co" style="font-size:12px;font-family:inherit;color:#00ccff;border:3px solid #00ccff;background:rgba(0,10,20,0.9);padding:14px 32px;cursor:pointer;letter-spacing:2px">QUIT</button>',
    '</div>',
    '<div style="font-size:8px;color:#334;margin-top:14px;letter-spacing:2px">SPACE = continue from level 1   ESC = quit</div>',
  ].join('');
  overlay.style.display = 'flex';

  const hide = () => { overlay.style.display = 'none'; _lifeResetting = false; };
  document.getElementById('btn-continue').addEventListener('click', () => { hide(); startGame(1); }, { once: true });
  document.getElementById('btn-quit-co').addEventListener('click', () => { hide(); document.getElementById('title-screen').style.display = 'flex'; }, { once: true });
  const handler = (e) => {
    if (e.code === 'Space' || e.code === 'Enter') { hide(); startGame(1); document.removeEventListener('keydown', handler); }
    if (e.code === 'Escape') { hide(); document.getElementById('title-screen').style.display = 'flex'; document.removeEventListener('keydown', handler); }
  };
  document.addEventListener('keydown', handler);
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

  // ── Bullets vs walls ──
  // Remove player bullets that hit a wall
  playerBullets.bullets = playerBullets.bullets.filter(b => {
    let hit = false;
    if (world && world.walls) {
      for (const w of world.walls) {
        const bx = b.mesh.position.x, bz = b.mesh.position.z;
        if (bx > w.minX && bx < w.maxX && bz > w.minZ && bz < w.maxZ) {
          playerBullets.scene.remove(b.mesh);
          playerBullets._pool.push(b.mesh);
          hit = true; break;
        }
      }
    }
    return !hit;
  });
  zombieBullets.bullets = zombieBullets.bullets.filter(b => {
    let hit = false;
    if (world && world.walls) {
      for (const w of world.walls) {
        const bx = b.mesh.position.x, bz = b.mesh.position.z;
        if (bx > w.minX && bx < w.maxX && bz > w.minZ && bz < w.maxZ) {
          zombieBullets.scene.remove(b.mesh);
          zombieBullets._pool.push(b.mesh);
          hit = true; break;
        }
      }
    }
    return !hit;
  });

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
    const shot = z.update(dt, targetPos, now, world.safeZones, world.walls);
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
    else if (pickup === 'speedBoot')     { player.activateSpeedBoost(6000); hud.popup('SPEED BOOST! 6s', '#0088ff'); }
    else if (pickup === 'invisibility')  { invisTimer = 8000; hud.popup('INVISIBLE! 8s', '#aaaaff'); }
    else if (pickup === 'ghostMode')     { ghostTimer = 6000; hud.popup('GHOST MODE! 6s', '#00ff88'); }
  }

  // ── Door interaction ──
  if (doorUnlocked && !levelTransitioning && world.isNearDoor(player.position, 1.5)) {
    // Always advance — infinite levels
    levelTransitioning = true;
    savedScore = score.score;
    gameActive = false;
    hud.popup("LEVEL " + level + " COMPLETE!", "#00ff66", 2200);
    setTimeout(() => startGame(level + 1), 2400);
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
      exitCountdownMs = Math.max(20000, 35000 - (level - 1) * 2000);
      loseLife('TOO SLOW!');
      for (let i = 0; i < 3; i++) spawnZombie();
    }
  }

  // ── Score + world ──
  score.update(dt);
  world.update(dt, now);
  world.updateRadTimers(rad, player.position);

  // ── Coin bag spawning (Pac-Man fruit style) ──
  coinBagTimer -= dt * 1000;
  if (coinBagTimer <= 0) {
    world.spawnCoinBag();
    coinBagTimer = 12000 + Math.random() * 8000; // every 12-20s
  }
  const bagCoins = world.collectCoinBag(player.position);
  if (bagCoins > 0) {
    coinsCollected += bagCoins;
    score.add(bagCoins * 10);
    hud.popup('COIN BAG +' + bagCoins + '!', '#ffcc00');
    if (coinsCollected >= coinsNeeded && !doorUnlocked) unlockDoor();
  }

  // ── Invisibility timer ──
  if (invisTimer > 0) {
    invisTimer -= dt * 1000;
    player.mesh.visible = Math.floor(now / 150) % 2 === 0; // flicker
    player.outline.visible = false;
  } else if (!player.isInvincible) {
    player.mesh.visible = true;
    if (player.outline) player.outline.visible = true;
  }

  // ── Ghost mode — walk through zombies and explode them ──
  if (ghostTimer > 0) {
    ghostTimer -= dt * 1000;
    liveZombies.forEach(z => {
      if (z.isDead) return;
      const dx = player.position.x - z.position.x;
      const dz = player.position.z - z.position.z;
      if (Math.sqrt(dx*dx + dz*dz) < 1.2) {
        // Explode into green blocks
        playerBullets.explode(z.position.clone(), 0x22cc44);
        score.add(z.scoreValue * 2);
        z.die();
      }
    });
  }

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
  exitCountdownMs     = Math.max(25000, 45000 - (level - 1) * 3000);
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

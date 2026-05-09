// VoxelMaterials.js
// Generates pixel-art canvas textures for every cube face
// Matches the visual style from the concept art: dark stone, glowing accents, painted detail

import * as THREE from 'three';

// ─── canvas texture helper ──────────────────────────────────────────────────
function makeCanvasTex(size, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Fill a rect in pixel units (for 16px grid on a 64px canvas, scale = 4)
function px(ctx, col, x, y, w, h, scale = 4) {
  ctx.fillStyle = col;
  ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
}

// ─── GROUND tile ────────────────────────────────────────────────────────────
export function makeGroundMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    // Base dark stone
    ctx.fillStyle = '#1a1a26';
    ctx.fillRect(0, 0, 64, 64);
    // Lighter fill
    ctx.fillStyle = '#22223a';
    ctx.fillRect(2, 2, 60, 60);
    // Grid seams
    ctx.fillStyle = '#131320';
    ctx.fillRect(0, 30, 64, 2);
    ctx.fillRect(30, 0, 2, 64);
    // Corner detail
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(4, 4, 10, 10);
    ctx.fillRect(50, 4, 10, 10);
    ctx.fillRect(4, 50, 10, 10);
    ctx.fillRect(50, 50, 10, 10);
    // Subtle noise dots
    ctx.fillStyle = '#1e1e30';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(8 + i * 7, 14, 2, 2);
      ctx.fillRect(10 + i * 7, 44, 2, 2);
    }
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── WALL / building block ───────────────────────────────────────────────────
export function makeWallMaterial(side = 'front') {
  const tex = makeCanvasTex(64, (ctx) => {
    // Base concrete
    ctx.fillStyle = '#2a3344';
    ctx.fillRect(0, 0, 64, 64);
    // Lighter top strip
    ctx.fillStyle = '#3a4455';
    ctx.fillRect(0, 0, 64, 10);
    // Brick-like pattern
    ctx.fillStyle = '#222233';
    ctx.fillRect(0, 20, 64, 2);
    ctx.fillRect(0, 42, 64, 2);
    ctx.fillRect(30, 0, 2, 20);
    ctx.fillRect(14, 22, 2, 20);
    ctx.fillRect(48, 22, 2, 20);
    ctx.fillRect(30, 44, 2, 20);
    // Highlight edge
    ctx.fillStyle = '#4a5566';
    ctx.fillRect(0, 0, 2, 64);
    ctx.fillRect(0, 0, 64, 2);
    // Shadow edge
    ctx.fillStyle = '#11222';
    ctx.fillRect(62, 0, 2, 64);
    ctx.fillRect(0, 62, 64, 2);
    // Block detail
    ctx.fillStyle = '#333355';
    ctx.fillRect(6, 6, 22, 12);
    ctx.fillRect(36, 6, 22, 12);
    ctx.fillRect(6, 26, 22, 14);
    ctx.fillRect(36, 26, 22, 14);
    ctx.fillRect(6, 46, 22, 12);
    ctx.fillRect(36, 46, 22, 12);
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── FLOOR (inside building) ─────────────────────────────────────────────────
export function makeFloorMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#1a1005';
    ctx.fillRect(0, 0, 64, 64);
    // Checker
    ctx.fillStyle = '#221508';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
    // Grid lines
    ctx.fillStyle = '#110a02';
    ctx.fillRect(31, 0, 2, 64);
    ctx.fillRect(0, 31, 64, 2);
    // Wood grain
    ctx.fillStyle = '#2a1a0a';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(0, 10 + i * 13, 30, 1);
      ctx.fillRect(34, 6 + i * 13, 30, 1);
    }
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── PLAYER cube ─────────────────────────────────────────────────────────────
export function makePlayerMaterials() {
  // 6 faces: +X, -X, +Y, -Y, +Z, -Z
  // We paint different detail on front (+Z) vs other faces

  const front = makeCanvasTex(64, (ctx) => {
    // White cube body
    ctx.fillStyle = '#ddddee';
    ctx.fillRect(0, 0, 64, 64);
    // Top highlight strip
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 8);
    // Visor band
    ctx.fillStyle = '#00aadd';
    ctx.fillRect(8, 18, 48, 22);
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(10, 20, 44, 18);
    // Eyes
    ctx.fillStyle = '#001133';
    ctx.fillRect(14, 22, 12, 12);
    ctx.fillRect(38, 22, 12, 12);
    ctx.fillStyle = '#00eeff';
    ctx.fillRect(16, 24, 6, 7);
    ctx.fillRect(40, 24, 6, 7);
    // Visor glint
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(14, 22, 4, 3);
    ctx.fillRect(38, 22, 4, 3);
    // Mouth grille
    ctx.fillStyle = '#003344';
    ctx.fillRect(14, 44, 6, 4);
    ctx.fillRect(22, 44, 6, 4);
    ctx.fillRect(30, 44, 6, 4);
    ctx.fillRect(38, 44, 6, 4);
    ctx.fillRect(46, 44, 6, 4);
  });

  const side = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#ccccdd';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(56, 8, 8, 56);
  });

  const top = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 64);
    // Crosshair detail
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(28, 8, 8, 48);
    ctx.fillRect(8, 28, 48, 8);
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(28, 28, 8, 8);
  });

  const bottom = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(0, 0, 64, 64);
  });

  return [
    new THREE.MeshLambertMaterial({ map: side }),    // +X right
    new THREE.MeshLambertMaterial({ map: side }),    // -X left
    new THREE.MeshLambertMaterial({ map: top }),     // +Y top
    new THREE.MeshLambertMaterial({ map: bottom }),  // -Y bottom
    new THREE.MeshLambertMaterial({ map: front }),   // +Z front
    new THREE.MeshLambertMaterial({ map: side }),    // -Z back
  ];
}

// ─── ZOMBIE materials ────────────────────────────────────────────────────────
export function makeZombieMaterials(level = 1) {
  const configs = {
    1: { base: '#1a7a22', top: '#22aa33', eyes: '#ff2222', pupil: '#000', accent: '#115519', name: 'GREEN' },
    2: { base: '#bb8800', top: '#ffcc00', eyes: '#ff4400', pupil: '#220000', accent: '#886600', name: 'YELLOW' },
    3: { base: '#551188', top: '#8822cc', eyes: '#ff44ff', pupil: '#110022', accent: '#330055', name: 'PURPLE' },
    4: { base: '#991100', top: '#dd2200', eyes: '#ff8800', pupil: '#440000', accent: '#660800', name: 'RED' },
  };
  const cfg = configs[level] || configs[1];

  const front = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = cfg.base;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = cfg.top;
    ctx.fillRect(0, 0, 64, 10);
    // Glow eyes
    ctx.fillStyle = cfg.eyes;
    ctx.fillRect(10, 18, 16, 16);
    ctx.fillRect(38, 18, 16, 16);
    ctx.fillStyle = cfg.pupil;
    ctx.fillRect(14, 22, 8, 8);
    ctx.fillRect(42, 22, 8, 8);
    // Eye glow
    ctx.fillStyle = cfg.eyes;
    ctx.fillRect(12, 18, 4, 4);
    ctx.fillRect(40, 18, 4, 4);
    // Zombie mouth
    ctx.fillStyle = '#001100';
    ctx.fillRect(14, 42, 36, 8);
    ctx.fillStyle = cfg.base;
    ctx.fillRect(18, 44, 6, 4);
    ctx.fillRect(28, 44, 6, 4);
    ctx.fillRect(38, 44, 6, 4);
    // Armor (level 3+)
    if (level >= 3) {
      ctx.fillStyle = '#333366';
      ctx.fillRect(0, 0, 64, 8);
      ctx.fillRect(0, 30, 64, 8);
      ctx.fillStyle = '#4444aa';
      ctx.fillRect(2, 1, 60, 5);
    }
    // Gun arm (level 2+)
    if (level >= 2) {
      ctx.fillStyle = '#334400';
      ctx.fillRect(0, 36, 12, 20);
      ctx.fillStyle = '#222200';
      ctx.fillRect(0, 42, 14, 6);
    }
  });

  const sideCol = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = cfg.accent;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = cfg.base;
    ctx.fillRect(0, 0, 56, 64);
    ctx.fillStyle = cfg.top;
    ctx.fillRect(0, 0, 56, 10);
    if (level >= 4) {
      ctx.fillStyle = '#333344';
      ctx.fillRect(0, 0, 56, 8);
      ctx.fillRect(0, 28, 56, 8);
      // Rocket launcher
      ctx.fillStyle = '#222222';
      ctx.fillRect(0, 36, 64, 16);
      ctx.fillStyle = '#ff4400';
      ctx.fillRect(56, 40, 10, 8);
    }
  });

  const topTex = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = cfg.top;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = cfg.base;
    ctx.fillRect(8, 8, 48, 48);
    // Rot spots
    ctx.fillStyle = cfg.accent;
    ctx.fillRect(12, 14, 8, 8);
    ctx.fillRect(40, 36, 10, 10);
    ctx.fillRect(28, 22, 6, 6);
  });

  return [
    new THREE.MeshLambertMaterial({ map: sideCol }),
    new THREE.MeshLambertMaterial({ map: sideCol }),
    new THREE.MeshLambertMaterial({ map: topTex }),
    new THREE.MeshLambertMaterial({ map: topTex }),
    new THREE.MeshLambertMaterial({ map: front }),
    new THREE.MeshLambertMaterial({ map: front }),
  ];
}

// ─── SNIPER ally ────────────────────────────────────────────────────────────
export function makeSniperMaterials() {
  const front = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#1133aa';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#2255ff';
    ctx.fillRect(0, 0, 64, 10);
    // Visor
    ctx.fillStyle = '#0088bb';
    ctx.fillRect(8, 18, 48, 22);
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(10, 20, 44, 18);
    // Eyes
    ctx.fillStyle = '#000022';
    ctx.fillRect(14, 22, 12, 12);
    ctx.fillRect(38, 22, 12, 12);
    ctx.fillStyle = '#aaddff';
    ctx.fillRect(16, 24, 6, 7);
    ctx.fillRect(40, 24, 6, 7);
    // Rifle
    ctx.fillStyle = '#334455';
    ctx.fillRect(48, 28, 20, 8);
    ctx.fillStyle = '#556677';
    ctx.fillRect(58, 26, 8, 12);
  });

  const side = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#0d2288';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1133aa';
    ctx.fillRect(0, 0, 56, 64);
    ctx.fillStyle = '#2255ff';
    ctx.fillRect(0, 0, 56, 10);
    // Scope
    ctx.fillStyle = '#445566';
    ctx.fillRect(30, 20, 16, 10);
  });

  const top = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#2255ff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1133aa';
    ctx.fillRect(8, 8, 48, 48);
    // Star detail
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(28, 10, 8, 44);
    ctx.fillRect(10, 28, 44, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(30, 30, 4, 4);
  });

  return [
    new THREE.MeshLambertMaterial({ map: side }),
    new THREE.MeshLambertMaterial({ map: side }),
    new THREE.MeshLambertMaterial({ map: top }),
    new THREE.MeshLambertMaterial({ map: top }),
    new THREE.MeshLambertMaterial({ map: front }),
    new THREE.MeshLambertMaterial({ map: front }),
  ];
}

// ─── OBSTACLE crate ─────────────────────────────────────────────────────────
export function makeObstacleMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#664422';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#886644';
    ctx.fillRect(2, 2, 60, 60);
    // Cross straps
    ctx.fillStyle = '#553311';
    ctx.fillRect(0, 30, 64, 4);
    ctx.fillRect(30, 0, 4, 64);
    // Corner metal
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(0, 0, 10, 10);
    ctx.fillRect(54, 0, 10, 10);
    ctx.fillRect(0, 54, 10, 10);
    ctx.fillRect(54, 54, 10, 10);
    ctx.fillStyle = '#888888';
    ctx.fillRect(2, 2, 6, 6);
    ctx.fillRect(56, 2, 6, 6);
    ctx.fillRect(2, 56, 6, 6);
    ctx.fillRect(56, 56, 6, 6);
    // Wood grain
    ctx.fillStyle = '#775533';
    ctx.fillRect(4, 12, 24, 2);
    ctx.fillRect(36, 12, 24, 2);
    ctx.fillRect(4, 20, 24, 2);
    ctx.fillRect(36, 20, 24, 2);
    ctx.fillRect(4, 40, 24, 2);
    ctx.fillRect(36, 40, 24, 2);
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── COIN pickup ─────────────────────────────────────────────────────────────
export function makeCoinMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    // Gold circle
    ctx.fillStyle = '#cc9900';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffee44';
    ctx.beginPath();
    ctx.arc(28, 28, 16, 0, Math.PI * 2);
    ctx.fill();
    // Plus symbol
    ctx.fillStyle = '#cc8800';
    ctx.fillRect(28, 14, 8, 36);
    ctx.fillRect(14, 28, 36, 8);
    ctx.fillStyle = '#ffee88';
    ctx.fillRect(30, 16, 4, 32);
    ctx.fillRect(16, 30, 32, 4);
    // Edge shine
    ctx.fillStyle = '#fff8aa';
    ctx.fillRect(14, 14, 6, 6);
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── SNIPER TOKEN ────────────────────────────────────────────────────────────
export function makeSniperTokenMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#003344';
    ctx.fillRect(0, 0, 64, 64);
    // Crosshair ring
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(28, 4, 8, 56);
    ctx.fillRect(4, 28, 56, 8);
    ctx.fillStyle = '#004455';
    ctx.fillRect(28, 24, 8, 16);
    ctx.fillRect(24, 28, 16, 8);
    // Center dot
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(29, 29, 6, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(31, 31, 2, 2);
    // Corner ticks
    ctx.fillStyle = '#00aacc';
    ctx.fillRect(8, 8, 12, 4);
    ctx.fillRect(8, 8, 4, 12);
    ctx.fillRect(44, 8, 12, 4);
    ctx.fillRect(52, 8, 4, 12);
    ctx.fillRect(8, 52, 12, 4);
    ctx.fillRect(8, 44, 4, 12);
    ctx.fillRect(44, 52, 12, 4);
    ctx.fillRect(52, 44, 4, 12);
  });
  return new THREE.MeshLambertMaterial({ map: tex, transparent: true });
}

// ─── HEART TOKEN ─────────────────────────────────────────────────────────────
export function makeHeartMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = '#cc1144';
    ctx.fillRect(0, 0, 64, 64);
    // Heart shape
    ctx.fillStyle = '#ff4477';
    ctx.fillRect(8, 16, 20, 4);
    ctx.fillRect(36, 16, 20, 4);
    ctx.fillRect(4, 20, 28, 4);
    ctx.fillRect(32, 20, 28, 4);
    ctx.fillRect(4, 24, 56, 16);
    ctx.fillRect(8, 40, 48, 8);
    ctx.fillRect(14, 48, 36, 6);
    ctx.fillRect(20, 54, 24, 4);
    ctx.fillRect(26, 58, 12, 4);
    ctx.fillRect(30, 62, 4, 2);
    // Highlight
    ctx.fillStyle = '#ff88aa';
    ctx.fillRect(10, 20, 10, 8);
    ctx.fillRect(38, 20, 10, 8);
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── DOOR textures ───────────────────────────────────────────────────────────
export function makeDoorMaterial(locked = true) {
  const tex = makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = locked ? '#330800' : '#003311';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = locked ? '#882200' : '#006622';
    ctx.fillRect(4, 4, 56, 56);
    ctx.fillStyle = locked ? '#aa3300' : '#009933';
    ctx.fillRect(6, 6, 52, 16);
    // Handle
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(22, 28, 20, 18);
    ctx.fillStyle = '#000';
    ctx.fillRect(26, 34, 12, 8);
    ctx.fillStyle = '#ffcc44';
    ctx.fillRect(24, 30, 16, 14);
    // Lock / check
    if (locked) {
      ctx.fillStyle = '#ff2200';
      ctx.fillRect(10, 48, 44, 4);
      ctx.fillRect(10, 52, 44, 4);
    } else {
      ctx.fillStyle = '#00ff66';
      ctx.fillRect(18, 50, 8, 8);
      ctx.fillRect(24, 46, 8, 12);
      ctx.fillRect(30, 42, 8, 12);
      ctx.fillRect(36, 38, 8, 8);
    }
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── WEAPON pickup ───────────────────────────────────────────────────────────
export function makeWeaponPickupMaterial(type = 'omni') {
  const tex = makeCanvasTex(64, (ctx) => {
    if (type === 'omni') {
      ctx.fillStyle = '#331100';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(24, 4, 16, 56);
      ctx.fillRect(4, 24, 56, 16);
      ctx.fillStyle = '#ffcc44';
      ctx.fillRect(26, 6, 12, 52);
      ctx.fillRect(6, 26, 52, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(28, 28, 8, 8);
      // Arrow tips
      ctx.fillStyle = '#ffee00';
      ctx.fillRect(22, 4, 20, 8);
      ctx.fillRect(22, 52, 20, 8);
      ctx.fillRect(4, 22, 8, 20);
      ctx.fillRect(52, 22, 8, 20);
    } else {
      // Spiral
      ctx.fillStyle = '#1a0033';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#aa00ff';
      ctx.fillRect(28, 4, 8, 20);
      ctx.fillRect(32, 20, 20, 8);
      ctx.fillRect(44, 28, 8, 20);
      ctx.fillRect(20, 36, 28, 8);
      ctx.fillRect(12, 20, 12, 20);
      ctx.fillStyle = '#dd88ff';
      ctx.fillRect(30, 6, 4, 16);
      ctx.fillRect(34, 22, 16, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(30, 30, 4, 4);
    }
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── SPEED BOOT ─────────────────────────────────────────────────────────────
export function makeSpeedBootMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    // Background - electric blue
    ctx.fillStyle = '#001133';
    ctx.fillRect(0, 0, 64, 64);

    // Boot silhouette
    ctx.fillStyle = '#0055ff';
    // Sole
    ctx.fillRect(8,  48, 44, 8);
    // Heel
    ctx.fillRect(8,  36, 16, 12);
    // Upper
    ctx.fillRect(8,  16, 28, 20);
    // Toe cap
    ctx.fillRect(28, 40, 24, 8);

    // Highlight stripe
    ctx.fillStyle = '#00aaff';
    ctx.fillRect(10, 18, 24, 6);
    ctx.fillRect(30, 42, 20, 4);

    // Lightning bolt
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(40, 12, 8, 16);
    ctx.fillRect(32, 28, 8, 4);
    ctx.fillRect(36, 32, 8, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(41, 13, 4, 8);
    ctx.fillRect(33, 29, 4, 2);

    // Speed lines
    ctx.fillStyle = 'rgba(0,170,255,0.6)';
    ctx.fillRect(0,  24, 6, 2);
    ctx.fillRect(0,  30, 8, 2);
    ctx.fillRect(0,  36, 6, 2);
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── PORTAL ─────────────────────────────────────────────────────────────────
export function makePortalMaterial(color = 0x6600ff) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.85,
  });
}

// ─── BULLET materials ────────────────────────────────────────────────────────
export function makeBulletMaterial(type = 'player') {
  const colors = {
    player:  0xffee00,
    zombie:  0xff2200,
    sniper:  0x00ffff,
    pellet:  0xff8800,
    rocket:  0xff6600,
  };
  const emissives = {
    player:  0xaaaa00,
    zombie:  0xaa0000,
    sniper:  0x00aaaa,
    pellet:  0xaa5500,
    rocket:  0xaa4400,
  };
  return new THREE.MeshBasicMaterial({
    color: colors[type] || 0xffffff,
    emissive: emissives[type],
  });
}

// ─── COIN BAG ─────────────────────────────────────────────────
export function makeCoinBagMaterial(value) {
  const tex = makeCanvasTex(64, (ctx) => {
    // Bag body
    ctx.fillStyle = '#8B4513'; ctx.fillRect(10,22,44,34);
    ctx.fillStyle = '#A0522D'; ctx.fillRect(12,24,40,30);
    // Tie at top
    ctx.fillStyle = '#DAA520'; ctx.fillRect(18,12,28,14);
    ctx.fillStyle = '#FFD700'; ctx.fillRect(20,14,24,10);
    // Gold sheen
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(32,38,12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FFA500';
    ctx.beginPath(); ctx.arc(32,38,8,0,Math.PI*2); ctx.fill();
    // Value text
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(value)+'c', 32, 42);
    ctx.fillStyle = 'rgba(255,240,150,0.4)'; ctx.fillRect(14,26,10,6);
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ─── INVISIBILITY ─────────────────────────────────────────────
export function makeInvisibilityMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    // Ghost shape
    ctx.fillStyle = 'rgba(180,210,255,0.9)';
    ctx.beginPath();
    ctx.arc(32, 26, 20, Math.PI, 0);
    ctx.lineTo(52, 52); ctx.lineTo(44, 44); ctx.lineTo(36, 52);
    ctx.lineTo(28, 44); ctx.lineTo(20, 52);
    ctx.closePath(); ctx.fill();
    // Eyes
    ctx.fillStyle = '#001133';
    ctx.beginPath(); ctx.arc(24,26,5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(40,26,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#4488ff';
    ctx.beginPath(); ctx.arc(25,25,2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(41,25,2,0,Math.PI*2); ctx.fill();
    // Glow
    ctx.strokeStyle = 'rgba(100,150,255,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(32,32,28,0,Math.PI*2); ctx.stroke();
  });
  return new THREE.MeshLambertMaterial({ map: tex, transparent: true });
}

// ─── GHOST MODE ───────────────────────────────────────────────
export function makeGhostModeMaterial() {
  const tex = makeCanvasTex(64, (ctx) => {
    // Skull head
    ctx.fillStyle = '#eee';
    ctx.beginPath(); ctx.arc(32,22,18,Math.PI,0); ctx.fill();
    ctx.fillRect(14,22,36,28);
    // Eye sockets
    ctx.fillStyle = '#111';
    ctx.fillRect(17,18,11,10); ctx.fillRect(36,18,11,10);
    // Nose
    ctx.fillStyle = '#aaa'; ctx.fillRect(29,30,6,5);
    // Teeth
    ctx.fillStyle = '#fff';
    ctx.fillRect(16,42,8,10); ctx.fillRect(28,42,8,10); ctx.fillRect(40,42,8,10);
    ctx.fillStyle = '#111';
    ctx.fillRect(24,42,4,10); ctx.fillRect(36,42,4,10);
    // Green glow ring
    ctx.strokeStyle = 'rgba(0,255,100,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(32,28,28,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,255,100,0.12)'; ctx.fillRect(0,0,64,64);
  });
  return new THREE.MeshLambertMaterial({ map: tex });
}

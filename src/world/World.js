// World.js — builds the 3D game world: ground, buildings, obstacles, pickups

import * as THREE from 'three';
import {
  makeGroundMaterial, makeWallMaterial, makeFloorMaterial,
  makeObstacleMaterial, makeCoinMaterial, makeSniperTokenMaterial,
  makeHeartMaterial, makeDoorMaterial, makeWeaponPickupMaterial,
  makeSpeedBootMaterial,
} from '../core/VoxelMaterials.js';

export const WORLD = { W: 60, H: 60 }; // world size in units
export const BOUNDS = {
  minX: -WORLD.W / 2 + 1, maxX: WORLD.W / 2 - 1,
  minZ: -WORLD.H / 2 + 1, maxZ: WORLD.H / 2 - 1,
};

export class World {
  constructor(scene, level = 1) {
    this.scene      = scene;
    this.level      = level;
    this.safeZones  = []; // { minX, maxX, minZ, maxZ }
    this.radTimerSprites = []; // { sprite, ctx, canvas, cx, cz } — one per building
    this.walls      = []; // { minX, maxX, minZ, maxZ, blockZombies }
    this.pickups    = []; // { mesh, type, active, respawnTimer, x, z }
    this.coins      = []; // { mesh, active }
    this.door       = null;
    this.doorLocked = true;
    this._glows     = [];

    this._buildGround();
    this._buildBorder();

    if (level === 1) this._buildLevel1();
    else if (level === 2) this._buildLevel2();
    else             this._buildLevel3();
  }

  // ─── GROUND ──────────────────────────────────────────────────
  _buildGround() {
    const geo = new THREE.PlaneGeometry(WORLD.W, WORLD.H, WORLD.W / 2, WORLD.H / 2);
    const mat = makeGroundMaterial();
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid lines overlay
    const gridHelper = new THREE.GridHelper(WORLD.W, WORLD.W / 2, 0x111122, 0x111122);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  // ─── BORDER ──────────────────────────────────────────────────
  _buildBorder() {
    const wallMat = makeWallMaterial();
    const thickness = 2, height = 2.5;
    const hw = WORLD.W / 2, hh = WORLD.H / 2;

    const sides = [
      { pos: [0, height / 2, -hh - thickness / 2], size: [WORLD.W + thickness * 2, height, thickness] },
      { pos: [0, height / 2,  hh + thickness / 2], size: [WORLD.W + thickness * 2, height, thickness] },
      { pos: [-hw - thickness / 2, height / 2, 0], size: [thickness, height, WORLD.H] },
      { pos: [ hw + thickness / 2, height / 2, 0], size: [thickness, height, WORLD.H] },
    ];

    sides.forEach(({ pos, size }) => {
      const geo  = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(...pos);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.walls.push(this._rectFromMesh(mesh, size));
    });

    // Green border glow line at ground level
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    const border  = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(WORLD.W, 0.05, WORLD.H)),
      glowMat
    );
    border.position.y = 0.05;
    this.scene.add(border);
  }

  // ─── LEVEL 1 ─────────────────────────────────────────────────
  _buildLevel1() {
    // Main BUNKER — center, entrance south, exit north-right
    this._makeBuilding(0, 0, 14, 12, 'BUNKER', 3.5,
      [{ side: 'south', offset: 0   }],
      [{ side: 'north', offset: 3   }]
    );

    // Side outpost — northwest
    this._makeBuilding(-18, -16, 11, 10, 'OUTPOST', 3,
      [{ side: 'east',  offset: 0   }],
      [{ side: 'west',  offset: 0   }]
    );

    // Shelter — southeast
    this._makeBuilding(16, 16, 11, 10, 'SHELTER', 3,
      [{ side: 'north', offset: 0   }],
      [{ side: 'south', offset: -3  }]
    );

    // Exit door — placed OUTSIDE buildings in the open map
    this._placeDoor(0, -24);

    // Obstacles
    this._placeObstacles([
      [-8,  -5], [8,  -5], [-12, 4],  [12, 4],
      [-5,  10], [5,  10], [-20, 0],  [20, 0],
      [-14, 14], [14, 14], [0, -20],  [-22, 10],
      [22, -10], [-10, -20], [10, 20], [0, 20],
    ]);

    // Coins
    this._placeCoins(14, 1);

    // Pickups
    this._placePickup(-14, 8,   'sniperToken');
    this._placePickup(14,  -8,  'sniperToken');
    this._placePickup(-20, -12, 'sniperToken');
    this._placePickup(8,   16,  'heartToken');
    this._placePickup(-8,  -16, 'heartToken');
    // Speed boots
    this._placePickup(16,   0,  'speedBoot');
    this._placePickup(-16,  0,  'speedBoot');
  }

  // ─── LEVEL 2 ─────────────────────────────────────────────────
  _buildLevel2() {
    // 4 buildings at quadrant corners
    this._makeBuilding(-18, -16, 13, 12, 'BUNKER',
      3.5, [{ side: 'south', offset: 0 }], [{ side: 'north', offset: -3 }]);
    this._makeBuilding( 18, -16, 13, 12, 'TOWER',
      3.5, [{ side: 'west',  offset: 0 }], [{ side: 'east',  offset: 3  }]);
    this._makeBuilding(-18,  16, 13, 12, 'FORTRESS',
      3.5, [{ side: 'east',  offset: 0 }], [{ side: 'north', offset: 0  }]);
    this._makeBuilding( 18,  16, 14, 13, 'COMPOUND',
      3.5, [{ side: 'north', offset: 0 }], [{ side: 'south', offset: 0  }], true);

    this._placeDoor(18, 26); // south of compound, outside safe zone

    this._placeObstacles([
      [0,0],[8,8],[-8,8],[8,-8],[-8,-8],
      [0,12],[0,-12],[12,0],[-12,0],
      [14,-6],[-14,6],[6,14],[-6,-14],
      [20,6],[-20,-6],[6,-20],[-6,20],
    ]);

    this._placeCoins(22, 2);

    // Weapon pickups on level 2
    this._placePickup(-5,  -5, 'weaponOmni');
    this._placePickup( 5,   5, 'weaponOmni');
    this._placePickup(-5,   5, 'weaponOmni');
    this._placePickup(0,  -14, 'sniperToken');
    this._placePickup(0,   14, 'sniperToken');
    this._placePickup(-14,  0, 'heartToken');
    this._placePickup( 14,  0, 'heartToken');
    // Speed boots
    this._placePickup( 0,  18, 'speedBoot');
    this._placePickup( 0, -18, 'speedBoot');
    this._placePickup(-20, 8,  'speedBoot');
  }

  // ─── LEVEL 3 ─────────────────────────────────────────────────
  _buildLevel3() {
    // 6 buildings — 4 safe zones + 1 exit compound
    // Red shooter zombies, tighter rad timers
    this._makeBuilding(-20, -18, 13, 12, 'BUNKER',
      3.5, [{ side:'south', offset:0 }], [{ side:'north', offset:-3 }]);
    this._makeBuilding(20, -18, 13, 12, 'TOWER',
      3.5, [{ side:'west', offset:0 }],  [{ side:'east',  offset:3 }]);
    this._makeBuilding(-20,  18, 13, 12, 'FORTRESS',
      3.5, [{ side:'east', offset:0 }],  [{ side:'north', offset:0 }]);
    this._makeBuilding(20,   18, 14, 13, 'COMPOUND',
      3.5, [{ side:'north', offset:0 }], [{ side:'south', offset:0 }], true);
    // Extra safe buildings
    this._makeBuilding(0, -22, 11, 10, 'SHELTER',
      3.0, [{ side:'south', offset:0 }], [{ side:'north', offset:0 }]);
    this._makeBuilding(0,  22, 11, 10, 'OUTPOST',
      3.0, [{ side:'north', offset:0 }], [{ side:'south', offset:0 }]);

    this._placeDoor(20, 28); // south of compound

    this._placeObstacles([
      [0,0],[6,6],[-6,6],[6,-6],[-6,-6],
      [0,10],[0,-10],[10,0],[-10,0],
      [12,-12],[-12,12],[12,12],[-12,-12],
      [16,6],[-16,-6],[6,16],[-6,-16],
      [22,6],[-22,-6],[6,-22],[-6,22],
      [14,0],[-14,0],[0,14],[0,-14],
    ]);

    this._placeCoins(32, 3);

    this._placePickup(-8,  -8, 'weaponOmni');
    this._placePickup( 8,   8, 'weaponOmni');
    this._placePickup(-8,   8, 'weaponSpiral');
    this._placePickup( 8,  -8, 'weaponSpiral');
    this._placePickup(0,  -16, 'sniperToken');
    this._placePickup(0,   16, 'sniperToken');
    this._placePickup(-18,  0, 'sniperToken');
    this._placePickup( 18,  0, 'sniperToken');
    this._placePickup(-16,  8, 'heartToken');
    this._placePickup( 16, -8, 'heartToken');
    this._placePickup( 0,   0, 'speedBoot');
    this._placePickup(-12,  12, 'speedBoot');
    this._placePickup( 12, -12, 'speedBoot');
  }

  // ─── BUILDING BUILDER ─────────────────────────────────────────
  _makeBuilding(cx, cz, bw, bd, label, wallH = 3.5, entrances = [], exits = [], isExit = false) {
    const wallMat  = makeWallMaterial();
    const floorMat = makeFloorMaterial();
    const GAP      = 3; // opening width in world units
    const wt       = 1; // wall thickness

    // Floor slab
    const floorGeo = new THREE.BoxGeometry(bw - wt * 2, 0.1, bd - wt * 2);
    const floor    = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(cx, 0.05, cz);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Safe zone rect (interior, y-agnostic)
    const safeZone = {
      minX: cx - bw / 2 + wt,
      maxX: cx + bw / 2 - wt,
      minZ: cz - bd / 2 + wt,
      maxZ: cz + bd / 2 - wt,
    };
    this.safeZones.push(safeZone);

    // Radiation symbol on top of tallest wall
    this._addRadSign(cx, cz, wallH, isExit);

    // Ambient glow inside radiation zone
    const glowCol = isExit ? 0xff6600 : 0x00ff44;
    const glow    = new THREE.PointLight(glowCol, 1.2, 10);
    glow.position.set(cx, 1, cz);
    this.scene.add(glow);
    this._glows.push(glow);

    // ── Build 4 sides with gaps ──
    const allOpenings = [...entrances, ...exits];
    ['north', 'south', 'east', 'west'].forEach(side =>
      this._buildWallSide(cx, cz, bw, bd, wt, wallH, side,
        allOpenings.filter(o => o.side === side), GAP, wallMat)
    );

    // ── Internal maze divider ──
    this._addMazeDivider(cx, cz, bw, bd, wt, wallH, wallMat);

    // Labels above building
    this._addBuildingLabel(cx, cz, bd, wallH, label, isExit);
  }

  _buildWallSide(cx, cz, bw, bd, wt, wh, side, openings, gap, mat) {
    let segments = [];

    if (side === 'north') {
      const z = cz - bd / 2 + wt / 2;
      const total = bw;
      const mid   = cx;
      segments = this._gapSegments1D(mid - total / 2, mid + total / 2, openings, gap);
      segments.forEach(([x0, x1]) => {
        const w = x1 - x0;
        if (w < 0.1) return;
        const geo  = new THREE.BoxGeometry(w, wh, wt);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((x0 + x1) / 2, wh / 2, z);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.walls.push({ minX: x0, maxX: x1, minZ: z - wt / 2, maxZ: z + wt / 2, blockZombies: true });
      });
    }

    if (side === 'south') {
      const z = cz + bd / 2 - wt / 2;
      const mid = cx;
      segments = this._gapSegments1D(mid - bw / 2, mid + bw / 2, openings, gap);
      segments.forEach(([x0, x1]) => {
        const w = x1 - x0; if (w < 0.1) return;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wh, wt), mat);
        mesh.position.set((x0 + x1) / 2, wh / 2, z);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.walls.push({ minX: x0, maxX: x1, minZ: z - wt / 2, maxZ: z + wt / 2, blockZombies: true });
      });
    }

    if (side === 'west') {
      const x = cx - bw / 2 + wt / 2;
      const mid = cz;
      segments = this._gapSegments1D(mid - bd / 2, mid + bd / 2, openings, gap);
      segments.forEach(([z0, z1]) => {
        const d = z1 - z0; if (d < 0.1) return;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(wt, wh, d), mat);
        mesh.position.set(x, wh / 2, (z0 + z1) / 2);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.walls.push({ minX: x - wt / 2, maxX: x + wt / 2, minZ: z0, maxZ: z1, blockZombies: true });
      });
    }

    if (side === 'east') {
      const x = cx + bw / 2 - wt / 2;
      const mid = cz;
      segments = this._gapSegments1D(mid - bd / 2, mid + bd / 2, openings, gap);
      segments.forEach(([z0, z1]) => {
        const d = z1 - z0; if (d < 0.1) return;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(wt, wh, d), mat);
        mesh.position.set(x, wh / 2, (z0 + z1) / 2);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.walls.push({ minX: x - wt / 2, maxX: x + wt / 2, minZ: z0, maxZ: z1, blockZombies: true });
      });
    }
  }

  _gapSegments1D(lo, hi, openings, gap) {
    // Returns array of [start, end] segments with gaps punched for openings
    const mid = (lo + hi) / 2;
    const cuts = openings.flatMap(o => [
      mid + o.offset - gap / 2,
      mid + o.offset + gap / 2,
    ]).sort((a, b) => a - b);

    const segments = [];
    let cur = lo;
    for (let i = 0; i < cuts.length; i += 2) {
      const gapStart = Math.max(lo, cuts[i]);
      const gapEnd   = Math.min(hi, cuts[i + 1]);
      if (cur < gapStart) segments.push([cur, gapStart]);
      cur = gapEnd;
    }
    if (cur < hi) segments.push([cur, hi]);
    return segments;
  }

  _addMazeDivider(cx, cz, bw, bd, wt, wh, mat) {
    // Horizontal divider at mid-depth with offset gap
    const gapCenter = cx + 1.5;
    const gapHalf   = 1.8;
    const z         = cz;
    const segs = [
      [cx - bw / 2 + wt, gapCenter - gapHalf],
      [gapCenter + gapHalf, cx + bw / 2 - wt],
    ];
    segs.forEach(([x0, x1]) => {
      const w = x1 - x0; if (w < 0.1) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wh * 0.75, wt), mat);
      mesh.position.set((x0 + x1) / 2, wh * 0.375, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.walls.push({ minX: x0, maxX: x1, minZ: z - wt / 2, maxZ: z + wt / 2, blockZombies: true });
    });
  }

  _addRadSign(cx, cz, wh, isExit) {
    // Floating text sprite above building — using a canvas texture
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isExit ? '#ff6600' : '#00ff44';
    ctx.font = 'bold 18px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(isExit ? '🔒 LOCKED EXIT' : '☢ RAD ZONE', 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(5, 1.25, 1);
    spr.position.set(cx, wh + 1.2, cz);
    this.scene.add(spr);
  }

  _addBuildingLabel(cx, cz, bd, wh, label, isExit) {
    // Arrow + label sprite
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isExit ? '#ffcc00' : '#00ff88';
    ctx.font = '14px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(isExit ? `▼ ${label} (EXIT)` : `▼ ENTER ${label}`, 100, 30);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(4, 1, 1);
    spr.position.set(cx, 0.6, cz + bd / 2 - 0.5);
    this.scene.add(spr);
  }

  // ─── RADIATION TIMER SPRITES ────────────────────────────────
  _buildRadTimerSprite(cx, cz, wallH) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 80;
    const ctx = canvas.getContext('2d');

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1.25, 1);
    sprite.position.set(cx, wallH + 2.2, cz);
    this.scene.add(sprite);

    this.radTimerSprites.push({ sprite, tex, canvas, ctx, cx, cz });
  }

  // Called every frame from World.update with current rad state
  updateRadTimers(radTimer, playerPos) {
    if (!this.radTimerSprites.length) return;

    // Find which building player is in (if any)
    const playerSafe = this.isInSafeZone(playerPos);
    const pct  = radTimer.getPercent();
    const secs = radTimer.getSecsLeft();
    const dangerous = radTimer.isDangerous;

    this.radTimerSprites.forEach(({ canvas, ctx, tex, cx, cz }) => {
      ctx.clearRect(0, 0, 256, 80);

      // Background pill
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.roundRect(4, 4, 248, 72, 10);
      ctx.fill();

      // Radiation symbol + label
      ctx.fillStyle = dangerous ? '#ff2200' : pct > 0.5 ? '#00ff44' : pct > 0.25 ? '#ffcc00' : '#ff4400';
      ctx.font = 'bold 18px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('☢ RAD ZONE', 128, 28);

      // Timer bar background
      ctx.fillStyle = '#111';
      ctx.fillRect(16, 36, 224, 16);

      // Timer bar fill
      const barW = Math.max(0, pct * 224);
      const barCol = pct > 0.5 ? '#00ff44' : pct > 0.25 ? '#ffcc00' : '#ff2200';
      ctx.fillStyle = barCol;
      ctx.fillRect(16, 36, barW, 16);

      // Timer text
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px Courier New';
      if (playerSafe) {
        ctx.fillText(dangerous ? '⚠ DANGER! EXIT NOW!' : `${secs}s remaining`, 128, 68);
      } else {
        ctx.fillText('enter for cover', 128, 68);
      }

      tex.needsUpdate = true;
    });
  }

  // ─── DOOR ────────────────────────────────────────────────────
  _placeDoor(cx, cz) {
    const geo  = new THREE.BoxGeometry(1.2, 2.5, 0.3);
    const mat  = makeDoorMaterial(true);
    this.door  = new THREE.Mesh(geo, mat);
    this.door.position.set(cx, 1.25, cz + 2);
    this.door.castShadow = true;
    this.scene.add(this.door);

    // Door glow
    this.doorGlow = new THREE.PointLight(0xff2200, 1.0, 5);
    this.doorGlow.position.set(cx, 1.5, cz + 2);
    this.scene.add(this.doorGlow);

    this.doorPos = { x: cx, z: cz + 2 };
  }

  unlockDoor() {
    if (!this.door) return;
    this.doorLocked = false;
    this.door.material = makeDoorMaterial(false);
    this.doorGlow.color.setHex(0x00ff66);
    this.doorGlow.intensity = 1.5;
  }

  // ─── OBSTACLES ───────────────────────────────────────────────
  _placeObstacles(positions) {
    const mat = makeObstacleMaterial();
    positions.forEach(([x, z]) => {
      const h   = 1 + Math.random() * 0.6;
      const geo = new THREE.BoxGeometry(1.2, h, 1.2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.walls.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7, blockZombies: false });
    });
  }

  // ─── COINS ───────────────────────────────────────────────────
  _placeCoins(count, level) {
    const mat = makeCoinMaterial();
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * (WORLD.W - 10);
      const z = (Math.random() - 0.5) * (WORLD.H - 10);
      const geo  = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.5, z);
      mesh.castShadow = true;
      this.scene.add(mesh);

      // Gold point light
      const light = new THREE.PointLight(0xffcc00, 0.4, 2.5);
      light.position.set(x, 0.8, z);
      this.scene.add(light);

      this.coins.push({ mesh, active: true, light, _phase: Math.random() * Math.PI * 2 });
    }
  }

  // ─── PICKUPS ─────────────────────────────────────────────────
  _placePickup(x, z, type) {
    let mat, glowCol;
    if      (type === 'sniperToken') { mat = makeSniperTokenMaterial(); glowCol = 0x00ccff; }
    else if (type === 'heartToken')  { mat = makeHeartMaterial();       glowCol = 0xff4477; }
    else if (type === 'weaponOmni')  { mat = makeWeaponPickupMaterial('omni');   glowCol = 0xff8800; }
    else if (type === 'weaponSpiral'){ mat = makeWeaponPickupMaterial('spiral'); glowCol = 0xaa00ff; }
    else if (type === 'speedBoot')   { mat = makeSpeedBootMaterial();           glowCol = 0x0055ff; }
    else return;

    const geo  = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.6, z);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const light = new THREE.PointLight(glowCol, 0.8, 3.5);
    light.position.set(x, 1, z);
    this.scene.add(light);

    this.pickups.push({ mesh, light, type, active: true, respawnTimer: 0, x, z });
  }

  // ─── UPDATE ──────────────────────────────────────────────────
  update(dt, now) {
    // Animate coins — float + spin
    this.coins.forEach(c => {
      if (!c.active) return;
      c._phase += dt * 2;
      c.mesh.position.y = 0.4 + Math.sin(c._phase) * 0.15;
      c.mesh.rotation.y += dt * 2;
    });

    // Animate pickups — spin + bob
    this.pickups.forEach(p => {
      if (!p.active) return;
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y  = 0.6 + Math.sin(now / 600) * 0.12;
      p.light.intensity  = 0.6 + Math.sin(now / 400) * 0.2;
    });

    // Respawn weapon pickups
    this.pickups.forEach(p => {
      if (p.active || p.type === 'sniperToken' || p.type === 'heartToken') return;
      p.respawnTimer -= dt * 1000;
      if (p.respawnTimer <= 0) {
        p.active = true;
        p.mesh.visible  = true;
        p.light.visible = true;
      }
    });

    // Animate building glows
    this._glows.forEach((g, i) => {
      g.intensity = 1.0 + Math.sin(now / 800 + i) * 0.3;
    });

    // Door glow pulse
    if (this.doorGlow) {
      this.doorGlow.intensity = (this.doorLocked ? 0.8 : 1.5) + Math.sin(now / 400) * 0.3;
    }
  }

  // ─── COLLISION HELPERS ───────────────────────────────────────
  checkWallCollision(pos, radius, isZombie = false) {
    const hits = [];
    this.walls.forEach(w => {
      if (isZombie && w.blockZombies) return; // zombies blocked by building walls checked separately
      if (pos.x + radius > w.minX && pos.x - radius < w.maxX &&
          pos.z + radius > w.minZ && pos.z - radius < w.maxZ) {
        hits.push(w);
      }
    });
    return hits;
  }

  isInSafeZone(pos) {
    return this.safeZones.some(z =>
      pos.x > z.minX && pos.x < z.maxX && pos.z > z.minZ && pos.z < z.maxZ
    );
  }

  isNearDoor(pos, radius = 1.2) {
    if (!this.doorPos) return false;
    const dx = pos.x - this.doorPos.x;
    const dz = pos.z - this.doorPos.z;
    return Math.sqrt(dx * dx + dz * dz) < radius;
  }

  collectCoin(pos, radius = 1.0) {
    for (const c of this.coins) {
      if (!c.active) continue;
      const dx = pos.x - c.mesh.position.x;
      const dz = pos.z - c.mesh.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < radius) {
        c.active = false;
        c.mesh.visible  = false;
        c.light.visible = false;
        return true;
      }
    }
    return false;
  }

  collectPickup(pos, radius = 1.2) {
    for (const p of this.pickups) {
      if (!p.active) continue;
      const dx = pos.x - p.mesh.position.x;
      const dz = pos.z - p.mesh.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < radius) {
        p.active = false;
        p.mesh.visible  = false;
        p.light.visible = false;
        if (p.type === 'weaponOmni' || p.type === 'weaponSpiral' || p.type === 'speedBoot') {
          p.respawnTimer = 22000;
        }
        return p.type;
      }
    }
    return null;
  }

  // ─── UTILS ───────────────────────────────────────────────────
  _rectFromMesh(mesh, size) {
    return {
      minX: mesh.position.x - size[0] / 2,
      maxX: mesh.position.x + size[0] / 2,
      minZ: mesh.position.z - size[2] / 2,
      maxZ: mesh.position.z + size[2] / 2,
      blockZombies: false,
    };
  }

  getRandomSpawnEdge() {
    const hw = WORLD.W / 2 - 2, hh = WORLD.H / 2 - 2;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: (Math.random() - 0.5) * WORLD.W * 0.8, z: -hh };
    if (side === 1) return { x: (Math.random() - 0.5) * WORLD.W * 0.8, z:  hh };
    if (side === 2) return { x: -hw, z: (Math.random() - 0.5) * WORLD.H * 0.8 };
    return              { x:  hw, z: (Math.random() - 0.5) * WORLD.H * 0.8 };
  }
}

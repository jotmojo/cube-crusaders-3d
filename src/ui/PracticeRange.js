// PracticeRange.js — shooting gallery, maze practice, target range

import * as THREE from 'three';
import { Player } from '../entities/Player.js';
import { InputManager } from '../core/InputManager.js';
import { makeWallMaterial, makeGroundMaterial, makeObstacleMaterial } from '../core/VoxelMaterials.js';

const FONT = "'Press Start 2P', 'Courier New', monospace";

export class PracticeRange {
  constructor(renderer, onExit) {
    this.renderer  = renderer;
    this.onExit    = onExit;
    this.scene     = renderer.scene3d;
    this.active    = false;
    this.targets   = [];
    this.walls     = [];
    this.bullets   = [];
    this.score     = 0;
    this.targetsHit = 0;
    this.timeLeft  = 60; // 60 second practice session
    this.input     = new InputManager(renderer.renderer.domElement, renderer.camera);

    this._buildOverlay();
  }

  _buildOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.93)',
      'display:none', 'flex-direction:column', 'align-items:center',
      'justify-content:center', 'z-index:150',
      `font-family:${FONT}`,
    ].join(';');

    this.overlay.innerHTML = `
      <div style="font-size:36px;color:#00ffff;text-shadow:0 0 20px #00ffff;
        letter-spacing:3px;margin-bottom:8px">🎯 PRACTICE RANGE</div>
      <div style="font-size:11px;color:#888;letter-spacing:2px;margin-bottom:32px">
        SHARPEN YOUR SKILLS</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:32px;max-width:600px">
        <button class="range-btn" data-mode="targets" style="${this._btnStyle('#00ff88')}">
          🎯 SHOOTING GALLERY<br><span style="font-size:8px;color:#aaa">SHOOT MOVING TARGETS</span>
        </button>
        <button class="range-btn" data-mode="maze" style="${this._btnStyle('#ffcc00')}">
          🌀 MAZE RUN<br><span style="font-size:8px;color:#aaa">NAVIGATE THE MAZE</span>
        </button>
        <button class="range-btn" data-mode="corners" style="${this._btnStyle('#ff8800')}">
          📐 CORNER PRACTICE<br><span style="font-size:8px;color:#aaa">PEEK AND SHOOT</span>
        </button>
        <button class="range-btn" data-mode="free" style="${this._btnStyle('#aa00ff')}">
          🕹️ FREE ROAM<br><span style="font-size:8px;color:#aaa">OPEN PRACTICE AREA</span>
        </button>
      </div>

      <button id="btn-exit-range" style="${this._btnStyle('#ff2200', true)}">
        ← BACK TO MENU
      </button>
    `;

    document.body.appendChild(this.overlay);

    // Button handlers
    this.overlay.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this.overlay.style.display = 'none';
        this._startMode(mode);
      });
    });

    document.getElementById('btn-exit-range')?.addEventListener('click', () => {
      this.overlay.style.display = 'none';
      this.onExit();
    });
  }

  _btnStyle(color, small = false) {
    return [
      `font-size:${small ? '11px' : '13px'}`,
      `font-family:${FONT}`,
      `color:${color}`,
      `border:2px solid ${color}`,
      'background:rgba(0,0,0,0.7)',
      'padding:16px 24px',
      'cursor:pointer',
      'letter-spacing:1px',
      'line-height:2',
      `text-shadow:0 0 8px ${color}`,
      'transition:all 0.1s',
    ].join(';');
  }

  show() {
    this.overlay.style.display = 'flex';
  }

  _startMode(mode) {
    // Clear previous scene
    const toRemove = [];
    this.scene.traverse(obj => { if (obj !== this.scene) toRemove.push(obj); });
    toRemove.forEach(obj => this.scene.remove(obj));
    this.renderer._setupLighting();

    this.targets  = [];
    this.bullets  = [];
    this.walls    = [];
    this.score    = 0;
    this.targetsHit = 0;
    this.timeLeft = 60;
    this.active   = true;
    this.mode     = mode;
    this.renderer._cameraReady = false;

    // Ground
    const groundGeo = new THREE.PlaneGeometry(80, 80);
    const ground    = new THREE.Mesh(groundGeo, makeGroundMaterial());
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(80, 40, 0x111122, 0x111122);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Border
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(80, 0.05, 80)),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    border.position.y = 0.05;
    this.scene.add(border);

    // Player
    this.player = new Player(this.scene, 0, 8);
    this.cameras = this.renderer.camera;

    // Build mode-specific layout
    if (mode === 'targets')  this._buildShootingGallery();
    if (mode === 'maze')     this._buildMaze();
    if (mode === 'corners')  this._buildCorners();
    if (mode === 'free')     this._buildFreeRoam();

    // HUD
    this._buildRangeHUD(mode);

    this.renderer._cameraReady = false;
    this._lastTime = -1;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildShootingGallery() {
    // Row of targets at various distances, some moving
    const targetPositions = [
      { x: -15, z: -12, moving: false, speed: 0, hp: 1, size: 1.2 },
      { x:  -8, z: -14, moving: true,  speed: 2, hp: 1, size: 1.0 },
      { x:   0, z: -16, moving: false, speed: 0, hp: 2, size: 0.8 },
      { x:   8, z: -14, moving: true,  speed: 3, hp: 1, size: 1.0 },
      { x:  15, z: -12, moving: false, speed: 0, hp: 1, size: 1.2 },
      { x: -12, z: -22, moving: true,  speed: 1.5, hp: 2, size: 1.4 },
      { x:   0, z: -24, moving: false, speed: 0, hp: 3, size: 0.6 },
      { x:  12, z: -22, moving: true,  speed: 2,  hp: 2, size: 1.0 },
    ];

    // Dividing walls with gaps
    for (let x = -20; x <= 20; x += 8) {
      const w = new THREE.Mesh(
        new THREE.BoxGeometry(6, 3, 1),
        makeWallMaterial()
      );
      w.position.set(x, 1.5, -8);
      w.castShadow = true;
      this.scene.add(w);
      this.walls.push({ minX: x-3, maxX: x+3, minZ: -8.5, maxZ: -7.5 });
    }

    targetPositions.forEach(t => this._spawnTarget(t.x, t.z, t.moving, t.speed, t.hp, t.size));

    // Instructions
    this._addWorldText('SHOOT THE TARGETS', 0, 3, 5, '#00ff88');
    this._addWorldText('MOVING = BONUS POINTS', 0, 2.5, 6, '#ffcc00', 0.7);
  }

  _buildMaze() {
    // Maze walls — L-shaped corridors and corners
    const mazeWalls = [
      // Outer border with gaps
      { x: 0,   z: -20, w: 40, h: 1 },
      { x: -20, z: 0,   w: 1,  h: 40 },
      { x:  20, z: 0,   w: 1,  h: 40 },
      { x: 0,   z:  20, w: 40, h: 1 },
      // Internal maze walls
      { x: -10, z: -10, w: 20, h: 1 },
      { x: -10, z: -4,  w: 1,  h: 12 },
      { x:  5,  z: -4,  w: 1,  h: 12 },
      { x: -2,  z:  4,  w: 16, h: 1 },
      { x:  10, z:  4,  w: 1,  h: 16 },
      { x: -6,  z: 10,  w: 8,  h: 1 },
      { x: -14, z: 5,   w: 1,  h: 10 },
      { x: -6,  z: 15,  w: 16, h: 1 },
    ];

    mazeWalls.forEach(({ x, z, w, h }) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 3.5, h),
        makeWallMaterial()
      );
      mesh.position.set(x, 1.75, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.walls.push({ minX: x-w/2, maxX: x+w/2, minZ: z-h/2, maxZ: z+h/2 });
    });

    // Goal target at end of maze
    this._spawnTarget(15, -15, false, 0, 1, 2.0, 0x00ff44);
    this._addWorldText('REACH THE TARGET', 15, 3, -15, '#00ff44', 0.6);
    this._addWorldText('START HERE', 0, 2, 15, '#ffcc00', 0.7);
  }

  _buildCorners() {
    // L-shaped walls to practice peeking corners
    const walls = [
      { x: -8,  z: 0,   w: 1, h: 16 },
      { x: -16, z: 0,   w: 16, h: 1 },
      { x:  8,  z: 0,   w: 1, h: 16 },
      { x:  16, z: 0,   w: 16, h: 1 },
      { x: 0,   z: -12, w: 8,  h: 1 },
    ];

    walls.forEach(({ x, z, w, h }) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 3, h),
        makeWallMaterial()
      );
      mesh.position.set(x, 1.5, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.walls.push({ minX: x-w/2, maxX: x+w/2, minZ: z-h/2, maxZ: z+h/2 });
    });

    // Targets peeking around corners
    this._spawnTarget(-16, -8,  false, 0, 1, 1.0);
    this._spawnTarget( 16, -8,  false, 0, 1, 1.0);
    this._spawnTarget(  0, -18, false, 0, 1, 1.2);
    this._spawnTarget(-20,  4,  true,  1.5, 1, 0.9);
    this._spawnTarget( 20,  4,  true,  1.5, 1, 0.9);

    this._addWorldText('PEEK AROUND CORNERS!', 0, 3, 10, '#ff8800');
  }

  _buildFreeRoam() {
    // Open area with scattered obstacles and targets
    const obstaclePos = [
      [-8,0],[8,0],[0,-8],[-16,-8],[16,-8],
      [-8,-16],[8,-16],[0,-20],[-20,4],[20,4],
    ];
    obstaclePos.forEach(([x, z]) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        makeObstacleMaterial()
      );
      mesh.position.set(x, 1, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.walls.push({ minX: x-1, maxX: x+1, minZ: z-1, maxZ: z+1 });
    });

    // Scattered targets
    for (let i = 0; i < 8; i++) {
      const x = (Math.random()-0.5) * 36;
      const z = (Math.random()-0.5) * 36 - 8;
      this._spawnTarget(x, z, Math.random() > 0.5, 1+Math.random()*2, 1, 0.8+Math.random()*0.6);
    }

    this._addWorldText('FREE PRACTICE!', 0, 3, 15, '#aa00ff');
    this._addWorldText('NO TIME LIMIT', 0, 2.5, 16, '#888', 0.7);
    this.timeLeft = 999999; // effectively unlimited
  }

  _spawnTarget(x, z, moving, speed, hp, size = 1, color = 0xff2200) {
    const geo  = new THREE.BoxGeometry(size, size * 1.2, size * 0.3);
    const mat  = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, size * 0.6 + 0.5, z);
    mesh.castShadow = true;
    this.scene.add(mesh);

    // Target ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.3, size * 0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    ring.rotation.y = Math.PI / 2;
    mesh.add(ring);

    // Point light
    const light = new THREE.PointLight(color, 0.6, 4);
    light.position.copy(mesh.position);
    this.scene.add(light);

    this.targets.push({
      mesh, light, hp, maxHp: hp, size,
      moving, speed, moveDir: 1,
      _startX: x, _range: 5,
      isDead: false,
      _respawnTimer: 0,
    });
  }

  _addWorldText(text, x, y, z, color, scale = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(28 * scale)}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 44);
    const tex = new THREE.CanvasTexture(canvas);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    spr.scale.set(8 * scale, 1.2 * scale, 1);
    spr.position.set(x, y, z);
    this.scene.add(spr);
  }

  _buildRangeHUD(mode) {
    // Remove old HUD
    const old = document.getElementById('range-hud');
    if (old) old.remove();

    const hud = document.createElement('div');
    hud.id = 'range-hud';
    hud.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'height:52px',
      'background:rgba(0,0,0,0.88)',
      'display:flex', 'align-items:center', 'padding:0 20px', 'gap:30px',
      `font-family:${FONT}`, 'z-index:100', 'pointer-events:none',
    ].join(';');

    const label = { targets:'SHOOTING GALLERY', maze:'MAZE RUN', corners:'CORNER PRACTICE', free:'FREE ROAM' }[mode];
    hud.innerHTML = `
      <span style="font-size:10px;color:#00ffff;letter-spacing:2px">${label}</span>
      <div style="flex:1"></div>
      <span style="font-size:10px;color:#888">HITS:</span>
      <span style="font-size:18px;color:#00ff88" id="range-hits">0</span>
      <span style="font-size:10px;color:#888">SCORE:</span>
      <span style="font-size:18px;color:#ffcc00" id="range-score">0</span>
      <span style="font-size:10px;color:#888">TIME:</span>
      <span style="font-size:18px;color:#ff8800" id="range-time">60</span>
      <div style="flex:1"></div>
      <button id="range-exit" style="font-size:9px;font-family:inherit;color:#ff4444;
        border:2px solid #ff4444;background:transparent;padding:6px 14px;cursor:pointer;
        letter-spacing:1px;pointer-events:all">EXIT</button>
    `;
    document.body.appendChild(hud);

    document.getElementById('range-exit')?.addEventListener('click', () => this._exitRange());

    this._hudHits  = document.getElementById('range-hits');
    this._hudScore = document.getElementById('range-score');
    this._hudTime  = document.getElementById('range-time');
  }

  _exitRange() {
    this.active = false;
    const old = document.getElementById('range-hud');
    if (old) old.remove();
    if (this.player) this.player.destroy();
    this.onExit();
  }

  // ── GAME LOOP ──────────────────────────────────────────────
  _loop(ts) {
    if (!this.active) return;
    requestAnimationFrame(this._loop);

    if (this._lastTime < 0) this._lastTime = ts;
    const dt  = Math.min((ts - this._lastTime) / 1000, 0.05);
    this._lastTime = ts;
    const now = ts;

    // Timer
    if (this.timeLeft < 999999) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._showRangeResult();
        return;
      }
    }

    // Player
    this.input.updateAim(this.player.position);
    this.player.update(dt, this.input, null);

    // Wall collision
    this.walls.forEach(w => {
      const pos = this.player.mesh.position;
      const cx = Math.max(w.minX, Math.min(w.maxX, pos.x));
      const cz = Math.max(w.minZ, Math.min(w.maxZ, pos.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < 0.6 && dist > 0) { pos.x = cx + dx/dist*0.6; pos.z = cz + dz/dist*0.6; }
    });

    // Clamp to range bounds
    this.player.mesh.position.x = Math.max(-38, Math.min(38, this.player.mesh.position.x));
    this.player.mesh.position.z = Math.max(-38, Math.min(38, this.player.mesh.position.z));

    // Shooting
    if (this.input.isShooting()) {
      const shots = this.player.tryShoot(now, this.input.aimDir);
      shots.forEach(s => {
        const geo  = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat  = new THREE.MeshBasicMaterial({ color: 0xffee00 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(s.pos);
        this.scene.add(mesh);
        this.bullets.push({ mesh, dir: s.dir.clone(), speed: s.speed, age: 0, lifespan: 1.2 });
      });
    }

    // Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;
      b.mesh.position.x += b.dir.x * b.speed * dt;
      b.mesh.position.z += b.dir.z * b.speed * dt;

      if (b.age >= b.lifespan) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      // Hit targets
      for (const t of this.targets) {
        if (t.isDead) continue;
        const dx = b.mesh.position.x - t.mesh.position.x;
        const dz = b.mesh.position.z - t.mesh.position.z;
        if (Math.sqrt(dx*dx + dz*dz) < t.size * 0.8) {
          t.hp--;
          t.mesh.material.emissive = new THREE.Color(0xffffff);
          setTimeout(() => { if (t.mesh.material) t.mesh.material.emissive = new THREE.Color(0); }, 60);
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);

          if (t.hp <= 0) {
            t.isDead = true;
            const pts = t.moving ? 20 : 10;
            this.score += pts;
            this.targetsHit++;
            // Death flash
            this.scene.remove(t.mesh);
            this.scene.remove(t.light);
            // Respawn after 3s
            t._respawnTimer = 3000;
          }
          break;
        }
      }
    }

    // Target movement + respawn
    this.targets.forEach(t => {
      if (t.isDead) {
        t._respawnTimer -= dt * 1000;
        if (t._respawnTimer <= 0) {
          t.isDead = false;
          t.hp = t.maxHp;
          t.mesh.position.x = t._startX;
          this.scene.add(t.mesh);
          this.scene.add(t.light);
        }
        return;
      }
      if (t.moving) {
        t.mesh.position.x += t.speed * t.moveDir * dt;
        if (Math.abs(t.mesh.position.x - t._startX) > t._range) t.moveDir *= -1;
        t.light.position.copy(t.mesh.position);
      }
    });

    // Camera follow
    this.renderer.followTarget(this.player.position, dt);

    // HUD update
    if (this._hudHits)  this._hudHits.textContent  = this.targetsHit;
    if (this._hudScore) this._hudScore.textContent  = this.score;
    if (this._hudTime && this.timeLeft < 999999)
      this._hudTime.textContent = Math.ceil(this.timeLeft);

    this.renderer.render();
  }

  _showRangeResult() {
    this.active = false;
    const old = document.getElementById('range-hud');
    if (old) old.remove();

    const result = document.createElement('div');
    result.style.cssText = [
      'position:fixed','inset:0','background:rgba(0,0,0,0.92)',
      'display:flex','flex-direction:column','align-items:center',
      'justify-content:center','z-index:200',`font-family:${FONT}`,
    ].join(';');
    result.innerHTML = `
      <div style="font-size:32px;color:#00ffff;letter-spacing:3px;margin-bottom:16px">
        SESSION COMPLETE!</div>
      <div style="border:3px solid #333;padding:24px 60px;text-align:center;
        background:rgba(10,10,20,0.8);margin-bottom:24px">
        <div style="font-size:10px;color:#888;margin-bottom:6px">TARGETS HIT</div>
        <div style="font-size:42px;color:#00ff88">${this.targetsHit}</div>
        <div style="font-size:10px;color:#888;margin:12px 0 6px">SCORE</div>
        <div style="font-size:36px;color:#ffcc00">${this.score}</div>
      </div>
      <div style="display:flex;gap:14px">
        <button id="range-again" style="font-size:12px;font-family:inherit;
          color:#00ff88;border:3px solid #00ff88;background:rgba(0,20,10,0.9);
          padding:14px 32px;cursor:pointer;letter-spacing:2px">PLAY AGAIN</button>
        <button id="range-back" style="font-size:12px;font-family:inherit;
          color:#00ccff;border:3px solid #00ccff;background:rgba(0,10,20,0.9);
          padding:14px 32px;cursor:pointer;letter-spacing:2px">MAIN MENU</button>
      </div>
    `;
    document.body.appendChild(result);

    document.getElementById('range-again')?.addEventListener('click', () => {
      result.remove();
      this.show();
    }, { once: true });
    document.getElementById('range-back')?.addEventListener('click', () => {
      result.remove();
      this.onExit();
    }, { once: true });
  }
}

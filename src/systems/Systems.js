// Systems.js — ScoreManager, RadiationTimer, BulletManager (performance optimized), SniperAlly

import * as THREE from 'three';
import { makeBulletMaterial, makeSniperMaterials } from '../core/VoxelMaterials.js';

// ─── SCORE ───────────────────────────────────────────────────
export class ScoreManager {
  constructor(startScore = 0) {
    this.score      = startScore;
    this.highScore  = parseInt(localStorage.getItem('ccHighScore') || '0');
    this.combo      = 0;
    this.comboTimer = 0;
    this.comboWindow = 2500;
  }

  add(points) {
    this.combo++;
    this.comboTimer = this.comboWindow;
    const mult   = Math.min(this.combo, 8);
    const earned = points * mult;
    this.score  += earned;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('ccHighScore', this.highScore);
    }
    return { earned, multiplier: mult };
  }

  update(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt * 1000;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  getComboMultiplier() { return this.combo > 1 ? Math.min(this.combo, 8) : 1; }
}

// ─── RADIATION ───────────────────────────────────────────────
export class RadiationTimer {
  constructor(maxTime = 9000) {
    this.maxTime      = maxTime;
    this.timeLeft     = maxTime;
    this.isActive     = false;
    this.isDangerous  = false;
    this.onDamage     = null;
    this._damageTimer = 0;
    this._damageInterval = 1000;
  }

  enter() { this.isActive = true; }

  exit() {
    this.isActive    = false;
    this.isDangerous = false;
    this._damageTimer = 0;
    this.timeLeft    = Math.min(this.maxTime, this.timeLeft + 1800);
  }

  update(dt) {
    if (!this.isActive) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt * 1000);
    if (this.timeLeft <= 0) {
      this.isDangerous   = true;
      this._damageTimer += dt * 1000;
      if (this._damageTimer >= this._damageInterval) {
        this._damageTimer = 0;
        if (this.onDamage) this.onDamage();
      }
    } else {
      this.isDangerous  = false;
      this._damageTimer = 0;
    }
  }

  getPercent()  { return this.timeLeft / this.maxTime; }
  getSecsLeft() { return Math.ceil(this.timeLeft / 1000); }
  reset()       { this.timeLeft = this.maxTime; this.isActive = false; this.isDangerous = false; }
}

// ─── BULLET MANAGER (performance optimized) ─────────────────
// Key optimizations:
// 1. Shared geometry instances — no allocation per bullet
// 2. NO per-bullet PointLights — use one shared "muzzle flash" light instead
// 3. Object pool — reuse bullet objects from a pool
// 4. Batch hit-testing with early exit

const SHARED_GEO = {
  player: new THREE.BoxGeometry(0.22, 0.22, 0.22),
  zombie: new THREE.BoxGeometry(0.20, 0.20, 0.20),
  sniper: new THREE.BoxGeometry(0.14, 0.08, 0.36), // elongated streak
  pellet: new THREE.BoxGeometry(0.16, 0.16, 0.16),
  rocket: new THREE.BoxGeometry(0.30, 0.20, 0.50),
};

const BULLET_SPEED_MULT = 1; // tune globally here

export class BulletManager {
  constructor(scene) {
    this.scene   = scene;
    this.bullets = [];
    this._pool   = [];

    // ONE shared muzzle flash light — moves to last spawn point
    this.muzzleLight = new THREE.PointLight(0xffee00, 0, 3);
    scene.add(this.muzzleLight);
    this._muzzleTimer = 0;
  }

  spawn({ pos, dir, speed, damage, type, splash, team = 'player' }) {
    // Get from pool or create new
    let mesh = this._pool.pop();
    const geo = SHARED_GEO[type] || SHARED_GEO.player;
    if (!mesh) {
      mesh = new THREE.Mesh(geo, makeBulletMaterial(type));
    } else {
      mesh.geometry = geo;
      mesh.material = makeBulletMaterial(type);
      mesh.visible  = true;
    }

    mesh.position.set(
      pos.x + dir.x * 0.7,
      0.55,
      pos.z + dir.z * 0.7
    );
    mesh.rotation.set(0, 0, 0);
    this.scene.add(mesh);

    // Muzzle flash — move shared light to spawn point, brighten briefly
    if (team === 'player') {
      this.muzzleLight.color.setHex(0xffee00);
      this.muzzleLight.position.copy(mesh.position);
      this.muzzleLight.intensity = 2.5;
      this._muzzleTimer = 0.06; // 60ms flash
    }

    this.bullets.push({
      mesh,
      dir:  dir.clone().normalize(),
      speed: speed * BULLET_SPEED_MULT,
      damage, type, splash, team,
      lifespan: type === 'rocket' ? 2.5 : 1.2,
      age: 0,
    });
  }

  update(dt) {
    // Decay muzzle flash
    if (this._muzzleTimer > 0) {
      this._muzzleTimer -= dt;
      this.muzzleLight.intensity = Math.max(0, (this._muzzleTimer / 0.06) * 2.5);
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;

      b.mesh.position.x += b.dir.x * b.speed * dt;
      b.mesh.position.z += b.dir.z * b.speed * dt;
      b.mesh.rotation.y += dt * 8;

      if (b.age >= b.lifespan) {
        this._removeBullet(i);
      }
    }
  }

  _removeBullet(i) {
    const b = this.bullets[i];
    this.scene.remove(b.mesh);
    // Return to pool instead of destroying
    this._pool.push(b.mesh);
    this.bullets.splice(i, 1);
  }

  checkHits(targets, radius = 0.65) {
    const hits = [];
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      if (b.team === 'zombie') continue; // player bullets only
      for (let ti = 0; ti < targets.length; ti++) {
        const t = targets[ti];
        if (!t || t.isDead) continue;
        const dx = b.mesh.position.x - t.position.x;
        const dz = b.mesh.position.z - t.position.z;
        if (dx * dx + dz * dz < radius * radius) {
          hits.push({ bullet: b, target: t, bulletIdx: bi });
          this._removeBullet(bi);
          break;
        }
      }
    }
    return hits;
  }

  checkPlayerHit(playerPos, radius = 0.55) {
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      if (b.team !== 'zombie') continue;
      const dx = b.mesh.position.x - playerPos.x;
      const dz = b.mesh.position.z - playerPos.z;
      if (dx * dx + dz * dz < radius * radius) {
        this._removeBullet(bi);
        return true;
      }
    }
    return false;
  }

  explode(pos, color = 0xff8800) {
    // Simple flash — no new PointLight creation
    const debris = [];
    for (let i = 0; i < 6; i++) {
      const size = 0.08 + Math.random() * 0.12;
      const geo  = new THREE.BoxGeometry(size, size, size);
      const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.position.y = 0.5;
      this.scene.add(mesh);
      debris.push({ mesh, mat,
        vx: (Math.random() - 0.5) * 9,
        vy:  Math.random() * 7,
        vz: (Math.random() - 0.5) * 9,
        t: 0
      });
    }

    // Use requestAnimationFrame instead of creating interval per explosion
    const tick = () => {
      let alive = false;
      debris.forEach(d => {
        d.t += 0.018;
        d.mesh.position.x += d.vx * 0.018;
        d.mesh.position.y += (d.vy - 9.8 * d.t) * 0.018;
        d.mesh.position.z += d.vz * 0.018;
        d.mesh.rotation.x += 0.12;
        d.mesh.rotation.z += 0.08;
        d.mat.opacity = Math.max(0, 1 - d.t * 2);
        if (d.t < 0.5) alive = true;
        else this.scene.remove(d.mesh);
      });
      if (alive) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  clear() {
    for (let i = this.bullets.length - 1; i >= 0; i--) this._removeBullet(0);
    this.bullets = [];
    this.muzzleLight.intensity = 0;
    this.scene.remove(this.muzzleLight);
  }
}

// ─── SNIPER ALLY ─────────────────────────────────────────────
export class SniperAlly {
  constructor(scene, x, z, duration = 9000) {
    this.scene    = scene;
    this.duration = duration;
    this.timeLeft = duration;
    this.isDone   = false;
    this.lastShot = 0;
    this.shootCd  = 550;
    this.speed    = 7;

    const geo  = new THREE.BoxGeometry(0.9, 1.05, 0.9);
    const mats = makeSniperMaterials();
    this.mesh  = new THREE.Mesh(geo, mats);
    this.mesh.position.set(x, 0.525, z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // Single point light — no shadow casting to keep perf up
    this.glow = new THREE.PointLight(0x00aaff, 1.0, 4);
    this.glow.castShadow = false;
    this.glow.position.set(x, 1, z);
    scene.add(this.glow);
  }

  get position() { return this.mesh.position; }

  update(dt, now, zombies) {
    if (this.isDone) return null;
    this.timeLeft -= dt * 1000;
    if (this.timeLeft <= 0) {
      this.isDone = true;
      this.scene.remove(this.mesh);
      this.scene.remove(this.glow);
      return null;
    }

    let nearest = null, nearDist = Infinity;
    zombies.forEach(z => {
      if (z.isDead) return;
      const dx = z.position.x - this.mesh.position.x;
      const dz = z.position.z - this.mesh.position.z;
      const d  = dx * dx + dz * dz;
      if (d < nearDist) { nearDist = d; nearest = z; }
    });

    if (nearest) {
      const dx  = nearest.position.x - this.mesh.position.x;
      const dz  = nearest.position.z - this.mesh.position.z;
      const len = Math.sqrt(nearDist);
      if (len > 2) {
        this.mesh.position.x += (dx / len) * this.speed * dt;
        this.mesh.position.z += (dz / len) * this.speed * dt;
      }
      this.mesh.rotation.y = Math.atan2(dx, dz);
      this.glow.position.copy(this.mesh.position);
      this.glow.position.y = 1;
      this.glow.intensity = 0.8 + Math.sin(now / 200) * 0.2;

      if (now - this.lastShot > this.shootCd) {
        this.lastShot = now;
        return {
          pos:    this.mesh.position.clone(),
          dir:    new THREE.Vector3(dx / len, 0, dz / len),
          speed:  28, damage: 1, type: 'sniper', splash: false,
        };
      }
    }
    return null;
  }
}

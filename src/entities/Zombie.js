// Zombie.js — 3D voxel zombie cube, all 4 levels

import * as THREE from 'three';
import { makeZombieMaterials } from '../core/VoxelMaterials.js';

export const ZOMBIE_DEFS = {
  1: { speed: 4.5, hp: 1, score: 10, shoots: false, shootCd: 0,    shootRange: 0,  shootSpeed: 0,  bulletScale: 0.5 },
  // Level 2+ speeds tuned -40% from original — still challenging but fair
  2: { speed: 4.5, hp: 2, score: 20, shoots: false, shootCd: 0,    shootRange: 0,  shootSpeed: 0,  bulletScale: 0.5 },
  3: { speed: 3.8, hp: 3, score: 40, shoots: true,  shootCd: 3200, shootRange: 12, shootSpeed: 7,  bulletScale: 0.4 },
  4: { speed: 4.2, hp: 3, score: 60, shoots: true,  shootCd: 2000, shootRange: 15, shootSpeed: 9,  bulletScale: 0.4 },
};

export class Zombie {
  constructor(scene, x, z, level = 1) {
    this.scene      = scene;
    this.level      = level;
    this.def        = ZOMBIE_DEFS[level] || ZOMBIE_DEFS[1];
    this.hp         = this.def.hp;
    this.scoreValue = this.def.score;
    this.isDead     = false;
    this.lastShotTime = 0;

    // Scale slightly bigger per level
    const scale = 1 + (level - 1) * 0.08;
    const geo   = new THREE.BoxGeometry(scale, scale * 1.1, scale);
    const mats  = makeZombieMaterials(level);
    this.mesh   = new THREE.Mesh(geo, mats);
    this.mesh.position.set(x, scale * 0.55, z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // HP bar — 3D billboard above zombie
    this._buildHpBar(scale);

    // Glow light for armored/shooter zombies
    if (level >= 3) {
      const glowCol = level === 3 ? 0x8800ff : 0xff2200;
      this.glowLight = new THREE.PointLight(glowCol, 0.8, 4);
      this.glowLight.position.set(x, 1.5, z);
      scene.add(this.glowLight);
    }

    this._bobOffset = Math.random() * Math.PI * 2;
    // Wander / patrol state
    this._wanderAngle  = Math.random() * Math.PI * 2; // current wander direction
    this._wanderTimer  = 1.5 + Math.random() * 2;     // time until next direction change
    this._chaseMode    = false;                        // true when close to player
    this._spawnDelay   = 1.5 + Math.random() * 1.5;   // wander before chasing
    this._blocked      = false;                        // wall avoidance flag
    this._blockTimer   = 0;
  }

  _buildHpBar(scale) {
    // Background bar
    const bgGeo = new THREE.PlaneGeometry(1, 0.12);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x220000, depthTest: false });
    this.hpBarBg = new THREE.Mesh(bgGeo, bgMat);
    this.hpBarBg.renderOrder = 999;

    // Fill bar
    const fGeo = new THREE.PlaneGeometry(1, 0.12);
    const fMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, depthTest: false });
    this.hpBarFill = new THREE.Mesh(fGeo, fMat);
    this.hpBarFill.renderOrder = 1000;

    const yOffset = scale * 1.1 + 0.4;
    this.hpBarBg.position.set(0, yOffset, 0);
    this.hpBarFill.position.set(0, yOffset, 0.01);

    this.mesh.add(this.hpBarBg);
    this.mesh.add(this.hpBarFill);
  }

  _updateHpBar() {
    if (!this.hpBarFill) return;
    const pct = Math.max(0, this.hp / this.def.hp);
    this.hpBarFill.scale.x = pct;
    this.hpBarFill.position.x = (pct - 1) * 0.5;
    const col = pct > 0.5 ? 0x00ff44 : pct > 0.25 ? 0xffcc00 : 0xff2200;
    this.hpBarFill.material.color.setHex(col);

    // Keep bars facing camera (billboard)
    if (this.hpBarBg) {
      this.hpBarBg.rotation.y  = -this.mesh.rotation.y;
      this.hpBarFill.rotation.y = -this.mesh.rotation.y;
    }
  }

  get position() { return this.mesh.position; }

  update(dt, playerPos, now, safeZones = [], walls = []) {
    if (this.isDead) return null;

    const dx    = playerPos.x - this.mesh.position.x;
    const dz    = playerPos.z - this.mesh.position.z;
    const dist  = Math.sqrt(dx * dx + dz * dz);

    // ── Spawn delay — wander randomly before chasing ──
    if (this._spawnDelay > 0) {
      this._spawnDelay -= dt;
      this._wanderTimer -= dt;
      if (this._wanderTimer <= 0) {
        this._wanderAngle += (Math.random() - 0.5) * Math.PI;
        this._wanderTimer  = 1.5 + Math.random() * 2;
      }
      const wx = Math.sin(this._wanderAngle) * this.def.speed * 0.5 * dt;
      const wz = Math.cos(this._wanderAngle) * this.def.speed * 0.5 * dt;
      this.mesh.position.x += wx;
      this.mesh.position.z += wz;
      this.mesh.rotation.y  = this._wanderAngle;
      // Clamp to world bounds
      this.mesh.position.x = Math.max(-28, Math.min(28, this.mesh.position.x));
      this.mesh.position.z = Math.max(-28, Math.min(28, this.mesh.position.z));
    } else {
      // ── Chase / wander logic ──
      const CHASE_RANGE = 22; // start chasing when within range
      const close = dist < CHASE_RANGE;

      if (close) {
        // Direct chase with slight wander offset for natural feel
        this._wanderTimer -= dt;
        if (this._wanderTimer <= 0) {
          // Occasionally veer off path slightly (pac-man ghost feel)
          this._wanderAngle = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.9;
          this._wanderTimer = 1.0 + Math.random() * 1.5;
        }
        // Blend between direct chase and wander angle
        const chaseAngle  = Math.atan2(dx, dz);
        const blendAngle  = chaseAngle * 0.75 + this._wanderAngle * 0.25;
        const nx = Math.sin(blendAngle), nz = Math.cos(blendAngle);

        // ── Block from entering safe zones ──
        const nextX = this.mesh.position.x + nx * this.def.speed * dt;
        const nextZ = this.mesh.position.z + nz * this.def.speed * dt;
        let inSafe = false;
        for (const sz of safeZones) {
          if (nextX > sz.minX && nextX < sz.maxX && nextZ > sz.minZ && nextZ < sz.maxZ) {
            inSafe = true; break;
          }
        }

        if (!inSafe) {
          this.mesh.position.x += nx * this.def.speed * dt;
          this.mesh.position.z += nz * this.def.speed * dt;
          this.mesh.rotation.y  = blendAngle;
        } else {
          // Slide along safe zone boundary — try X only, then Z only
          const tryX = this.mesh.position.x + nx * this.def.speed * dt;
          let xSafe = true;
          for (const sz of safeZones) {
            if (tryX > sz.minX && tryX < sz.maxX && this.mesh.position.z > sz.minZ && this.mesh.position.z < sz.maxZ) {
              xSafe = false; break;
            }
          }
          if (xSafe) {
            this.mesh.position.x += nx * this.def.speed * dt;
          } else {
            this.mesh.position.z += nz * this.def.speed * dt;
          }
          // Randomize angle to navigate around the zone
          this._wanderAngle += (Math.random() > 0.5 ? 0.3 : -0.3);
        }
      } else {
        // Far away — wander patrol
        this._wanderTimer -= dt;
        if (this._wanderTimer <= 0) {
          this._wanderAngle += (Math.random() - 0.5) * Math.PI * 1.2;
          this._wanderTimer  = 2 + Math.random() * 2;
        }
        const wx = Math.sin(this._wanderAngle) * this.def.speed * 0.4 * dt;
        const wz = Math.cos(this._wanderAngle) * this.def.speed * 0.4 * dt;
        // Block wander from safe zones too
        const nextX = this.mesh.position.x + wx;
        const nextZ = this.mesh.position.z + wz;
        let inSafe = false;
        for (const sz of safeZones) {
          if (nextX > sz.minX && nextX < sz.maxX && nextZ > sz.minZ && nextZ < sz.maxZ) {
            inSafe = true; break;
          }
        }
        if (!inSafe) {
          this.mesh.position.x += wx;
          this.mesh.position.z += wz;
        } else {
          this._wanderAngle += Math.PI * 0.5; // turn away
        }
        this.mesh.rotation.y = this._wanderAngle;
      }

      // World border clamp
      this.mesh.position.x = Math.max(-28, Math.min(28, this.mesh.position.x));
      this.mesh.position.z = Math.max(-28, Math.min(28, this.mesh.position.z));
    }

    // Bob
    this.mesh.position.y = (this.level * 0.055 + 0.55) + Math.sin(now / 400 + this._bobOffset) * 0.04;

    // Update glow
    if (this.glowLight) {
      this.glowLight.position.copy(this.mesh.position);
      this.glowLight.position.y += 1;
      this.glowLight.intensity = 0.6 + Math.sin(now / 300) * 0.2;
    }

    this._updateHpBar();

    // Shoot
    if (this.def.shoots && dist < this.def.shootRange && now - this.lastShotTime > this.def.shootCd) {
      this.lastShotTime = now;
      return {
        pos:    this.mesh.position.clone().add(new THREE.Vector3(dx / dist * 0.8, 0, dz / dist * 0.8)),
        dir:    new THREE.Vector3(dx / dist, 0, dz / dist),
        speed:  this.def.shootSpeed,
        damage: 1,
        type:   'zombie',
        splash: false,
      };
    }
    return null;
  }

  hit(damage = 1) {
    this.hp -= damage;
    // Flash white
    const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    mats.forEach(m => { m._origColor = m._origColor || m.color?.getHex(); m.emissive?.setHex(0xffffff); m.emissiveIntensity = 1; });
    setTimeout(() => {
      mats.forEach(m => { m.emissive?.setHex(0x000000); m.emissiveIntensity = 0; });
    }, 70);
    if (this.hp <= 0) { this.isDead = true; return true; }
    return false;
  }

  die(onDone) {
    this.isDead = true;
    if (this.glowLight) this.scene.remove(this.glowLight);
    // Expand and fade
    let t = 0;
    const tick = () => {
      t += 0.06;
      this.mesh.scale.set(1 + t, 1 + t * 0.5, 1 + t);
      const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
      mats.forEach(m => { if (m.opacity !== undefined) m.opacity = Math.max(0, 1 - t * 2); });
      if (t < 0.8) requestAnimationFrame(tick);
      else { this.scene.remove(this.mesh); if (onDone) onDone(); }
    };
    requestAnimationFrame(tick);
  }
}

// Player.js — 3D voxel player cube

import * as THREE from 'three';
import { makePlayerMaterials } from '../core/VoxelMaterials.js';

export const WEAPONS = {
  pistol:     { name: 'PISTOL',      cooldown: 280,  speed: 22, damage: 1, spread: 0,    count: 1, type: 'player' },
  shotgun:    { name: 'SHOTGUN',     cooldown: 600,  speed: 18, damage: 1, spread: 0.28, count: 5, type: 'pellet' },
  machinegun: { name: 'MACHINE GUN', cooldown: 100,  speed: 24, damage: 1, spread: 0.07, count: 1, type: 'player' },
  rocket:     { name: 'ROCKET',      cooldown: 1000, speed: 14, damage: 3, spread: 0,    count: 1, type: 'rocket', splash: true },
};

// Weapon aim colors
const WEAPON_COLORS = {
  pistol:     0x00ffff,
  shotgun:    0xff8800,
  machinegun: 0x00ff44,
  rocket:     0xff2200,
};

export class Player {
  constructor(scene, x = 0, z = 0) {
    this.scene     = scene;
    this.speed     = 10;
    this.baseSpeed = 10;
    this.health    = 5;
    this.maxHealth = 5;
    this.isInvincible    = false;
    this.invincibleTimer = 0;
    this.lastShotTime    = 0;

    this.currentWeapon = 'pistol';
    this.weapons       = ['pistol'];
    this.weaponIndex   = 0;

    this.specialMode     = null;
    this.specialTimer    = 0;
    this.specialAmmo     = 0;
    this.spiralAngle     = 0;

    // Speed boost
    this.baseSpeed      = 10;
    this.speedBoostTimer = 0;
    this.speedBoostActive = false;
    this.lastSpecialShot = 0;

    this._lastWpnIdx = -1;

    // ── Main cube mesh ──
    const geo  = new THREE.BoxGeometry(1, 1.2, 1);
    const mats = makePlayerMaterials();
    this.mesh  = new THREE.Mesh(geo, mats);
    this.mesh.position.set(x, 0.6, z);
    this.mesh.castShadow    = true;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);

    // ── Always-visible outline (BackSide, no depth test) ──
    // Shows player through walls as a cyan halo
    const outlineGeo = new THREE.BoxGeometry(1.14, 1.34, 1.14);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x00ccff,
      side: THREE.BackSide,
      depthTest: false,
      transparent: true,
      opacity: 0.3,
    });
    this.outline = new THREE.Mesh(outlineGeo, outlineMat);
    this.outline.renderOrder = 998;
    this.mesh.add(this.outline); // child — rotates with player

    // ── FLASHLIGHT WEDGE ──
    // Strategy: use a pivot Object3D at the player's feet position.
    // The plane mesh is a child, offset forward (+Z in local space).
    // We only rotate the pivot in Y to aim — no confusing multi-axis rotation.
    // Texture: wedge drawn with origin at BOTTOM-CENTER, beam goes UP in canvas = forward in world.

    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = 256; flashCanvas.height = 256;
    const fc = flashCanvas.getContext('2d');

    // Origin at BOTTOM-CENTER of canvas (128, 256)
    // Beam extends toward the TOP (y decreases)
    const fOriginX = 128, fOriginY = 256;
    const fBeamLen = 256;
    const fHalfAng = Math.PI / 6; // 30deg each side = 60deg total beam width

    // Clip to wedge shape
    fc.save();
    fc.beginPath();
    fc.moveTo(fOriginX, fOriginY);
    fc.lineTo(fOriginX - Math.sin(fHalfAng) * fBeamLen,
              fOriginY - Math.cos(fHalfAng) * fBeamLen);
    fc.arc(fOriginX, fOriginY, fBeamLen,
           -Math.PI / 2 - fHalfAng,
           -Math.PI / 2 + fHalfAng);
    fc.closePath();
    fc.clip();

    // Radial gradient from origin
    const fg = fc.createRadialGradient(fOriginX, fOriginY, 0, fOriginX, fOriginY, fBeamLen * 0.85);
    fg.addColorStop(0,    'rgba(255,255,255,1.0)');
    fg.addColorStop(0.05, 'rgba(160,230,255,0.95)');
    fg.addColorStop(0.2,  'rgba(0,190,255,0.75)');
    fg.addColorStop(0.45, 'rgba(0,140,255,0.4)');
    fg.addColorStop(0.7,  'rgba(0,90,255,0.15)');
    fg.addColorStop(1.0,  'rgba(0,60,255,0.0)');
    fc.fillStyle = fg;
    fc.fillRect(0, 0, 256, 256);
    fc.restore();

    // Bright origin hot-spot
    const fspot = fc.createRadialGradient(fOriginX, fOriginY, 0, fOriginX, fOriginY, 22);
    fspot.addColorStop(0,   'rgba(255,255,255,1.0)');
    fspot.addColorStop(0.6, 'rgba(200,240,255,0.5)');
    fspot.addColorStop(1,   'rgba(0,0,0,0)');
    fc.fillStyle = fspot;
    fc.fillRect(0, 0, 256, 256);

    const flashTex = new THREE.CanvasTexture(flashCanvas);
    this._flashMat = new THREE.MeshBasicMaterial({
      map: flashTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    // Pivot sits exactly at player feet in world space — we rotate only this
    this._flashPivot = new THREE.Object3D();
    this._flashPivot.position.set(x, 0.018, z);
    scene.add(this._flashPivot);

    // Plane: laid flat (rotated -90deg X so it faces up)
    // Width = beam spread at max range, height = beam length
    // Beam length is SHORT — just 2.5 units (close lamp feel, not far spotlight)
    const BEAM_W = 2.2; // width at far end
    const BEAM_L = 2.5; // length forward from feet
    const flashGeo = new THREE.PlaneGeometry(BEAM_W, BEAM_L);
    // Offset so the BACK EDGE (origin) is at local z=0, beam extends forward (+z)
    // PlaneGeometry is centered, so shift forward by half length
    // No translate — keep plane centered. Pivot is offset forward each frame instead.

    this.flashlight = new THREE.Mesh(flashGeo, this._flashMat);
    this.flashlight.rotation.x = -Math.PI / 2; // lay flat on ground
    this.flashlight.renderOrder = 997;
    this._flashPivot.add(this.flashlight); // child of pivot

        // (foot glow handled by flashlight hotspot in canvas texture)

    // ── AIM POINT LIGHT — at ground level, in front of player ──
    // No shadow casting — purely decorative glow
    this.aimLight = new THREE.PointLight(0x00ffff, 1.4, 4.5);
    this.aimLight.castShadow = false;
    this.aimLight.position.set(x, 0.3, z + 1.2);
    scene.add(this.aimLight);

    // ── Shadow blob ──
    const shadowGeo = new THREE.CircleGeometry(0.5, 12);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false
    });
    this.shadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.set(x, 0.03, z);
    scene.add(this.shadowBlob);
  }

  get position() { return this.mesh.position; }

  // ── Weapons ──
  getWeapon()  { return WEAPONS[this.currentWeapon]; }
  unlockWeapon(name) { if (!this.weapons.includes(name)) this.weapons.push(name); }
  switchWeapon(idx) {
    if (idx >= 0 && idx < this.weapons.length) {
      this.weaponIndex   = idx;
      this.currentWeapon = this.weapons[idx];
    }
  }

  activateSpecial(mode) {
    this.specialMode  = mode;
    this.specialTimer = mode === 'omni' ? 15000 : 0;
    this.specialAmmo  = mode === 'spiral' ? 50 : 0;
    this.spiralAngle  = 0;
  }

  activateSpeedBoost(duration = 6000) {
    this.speedBoostActive = true;
    this.speedBoostTimer  = duration;
    this.speed = this.baseSpeed * 2.2; // 2.2x speed
  }

  getSpeedBoostInfo() {
    if (!this.speedBoostActive) return null;
    return { secs: Math.ceil(this.speedBoostTimer / 1000) };
  }

  hasSpecial() {
    if (!this.specialMode) return false;
    if (this.specialMode === 'omni'   && this.specialTimer <= 0) return false;
    if (this.specialMode === 'spiral' && this.specialAmmo  <= 0) return false;
    return true;
  }

  getSpecialInfo() {
    if (!this.specialMode) return null;
    return {
      name:  this.specialMode === 'omni' ? 'OMNI SHOT' : 'SPIRAL SHOT',
      timer: this.specialMode === 'omni'   ? Math.ceil(this.specialTimer / 1000) : null,
      ammo:  this.specialMode === 'spiral' ? this.specialAmmo : null,
    };
  }

  // ── Update — called every frame ──
  update(dt, input, worldBounds) {
    const { fwd, strafe } = input.getMovement();
    const now = performance.now();

    // ── Rotation: always face the mouse cursor ──
    // aimDir is updated every frame in main.js via input.updateAim()
    const aim = input.aimDir;
    if (Math.abs(aim.x) > 0.01 || Math.abs(aim.z) > 0.01) {
      this.mesh.rotation.y = Math.atan2(aim.x, aim.z);
    }

    // ── Facing-relative movement ──
    // Forward vector = aim direction (where the mouse points)
    // Right vector   = forward rotated 90° clockwise
    const fwdX  =  aim.x;
    const fwdZ  =  aim.z;
    const rgtX  =  aim.z;   // rotate 90° CW: (x,z) -> (z,-x)
    const rgtZ  = -aim.x;

    // Combine forward and strafe
    const moveX = (fwdX * fwd + rgtX * strafe);
    const moveZ = (fwdZ * fwd + rgtZ * strafe);

    this.mesh.position.x += moveX * this.speed * dt;
    this.mesh.position.z += moveZ * this.speed * dt;

    if (worldBounds) {
      this.mesh.position.x = Math.max(worldBounds.minX + 0.5, Math.min(worldBounds.maxX - 0.5, this.mesh.position.x));
      this.mesh.position.z = Math.max(worldBounds.minZ + 0.5, Math.min(worldBounds.maxZ - 0.5, this.mesh.position.z));
    }

    // Bob when moving
    const isMoving = fwd !== 0 || strafe !== 0;
    this.mesh.position.y = 0.6 + (isMoving ? Math.sin(now / 160) * 0.04 : 0);

    // ── Flashlight wedge — pivot rotates in Y only to face aim ──
    const px = this.mesh.position.x;
    const pz = this.mesh.position.z;

    // Pivot at player feet, child plane offset forward in pivot local Z
    this._flashPivot.position.set(px, 0.018, pz);
    this._flashPivot.rotation.y = Math.atan2(aim.x, aim.z) + Math.PI;
    // Offset the flashlight mesh forward in pivot local space
    // After pivot Y-rotation, local +Z of pivot = world aim direction
    // Plane rotation.x=-PI/2 means plane local Y = pivot local -Z
    // So offset plane in local Z by BEAM_HALF to put back edge at feet
    if (this.flashlight) this.flashlight.position.set(0, 0, 1.25);

    // Pulse opacity
    const pulse = 0.82 + Math.sin(now / 280) * 0.18;
    this._flashMat.opacity = pulse;

    // Color based on weapon/special/boost
    const hasSpecial = this.hasSpecial();
    const isSpeedBoost = this.speedBoostActive;
    let beamR = 0, beamG = 0.85, beamB = 1; // default cyan
    if (hasSpecial && this.specialMode === 'omni')  { beamR=1;   beamG=0.5; beamB=0; }
    if (hasSpecial && this.specialMode === 'spiral'){ beamR=0.7; beamG=0;   beamB=1; }
    if (isSpeedBoost)                               { beamR=0;   beamG=0.4; beamB=1; }
    this._flashMat.color.setRGB(beamR, beamG, beamB);

    // (foot glow is baked into flashlight canvas texture hotspot)

    // ── Aim light — sits just above ground, offset forward ──
    const lightDist = 1.4;
    const wpnColor  = WEAPON_COLORS[this.currentWeapon] || 0x00ffff;
    this.aimLight.color.setHex(wpnColor);
    this.aimLight.position.set(
      px + aim.x * lightDist,
      0.3,
      pz + aim.z * lightDist
    );
    this.aimLight.intensity = this.hasSpecial()
      ? 2.5 + Math.sin(now / 80) * 0.8
      : 1.4 + Math.sin(now / 400) * 0.2;

    // ── Shadow stays below player ──
    this.shadowBlob.position.x = px;
    this.shadowBlob.position.z = pz;

    // ── Weapon switch ──
    const wIdx = input.getWeaponSwitch();
    if (wIdx >= 0 && wIdx !== this._lastWpnIdx) { this.switchWeapon(wIdx); this._lastWpnIdx = wIdx; }
    else if (wIdx < 0) this._lastWpnIdx = -1;

    // ── Speed boost timer ──
    if (this.speedBoostActive) {
      this.speedBoostTimer -= dt * 1000;
      if (this.speedBoostTimer <= 0) {
        this.speedBoostActive = false;
        this.speed = this.baseSpeed;
      }
    }

    // ── Special timers ──
    if (this.specialMode === 'omni' && this.specialTimer > 0) {
      this.specialTimer -= dt * 1000;
      if (this.specialTimer <= 0) this.specialMode = null;
    }
    if (this.specialMode === 'spiral' && this.specialAmmo <= 0) this.specialMode = null;

    // ── Invincibility flash ──
    if (this.isInvincible) {
      this.invincibleTimer -= dt * 1000;
      this.mesh.visible = Math.floor(this.invincibleTimer / 80) % 2 === 0;
      if (this.invincibleTimer <= 0) { this.isInvincible = false; this.mesh.visible = true; }
    }
  }

  // ── Shooting ──
  tryShoot(now, aimDir) {
    if (this.hasSpecial()) return this._shootSpecial(now, aimDir);
    return this._shootNormal(now, aimDir);
  }

  _shootNormal(now, aimDir) {
    const wpn = this.getWeapon();
    if (now - this.lastShotTime < wpn.cooldown) return [];
    this.lastShotTime = now;
    const bullets = [];
    for (let i = 0; i < wpn.count; i++) {
      const spread = wpn.count > 1
        ? (i / (wpn.count - 1) - 0.5) * wpn.spread * 2
        : (Math.random() - 0.5) * wpn.spread;
      const angle = Math.atan2(aimDir.x, aimDir.z) + spread;
      bullets.push({
        pos:    this.mesh.position.clone(),
        dir:    new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)),
        speed:  wpn.speed, damage: wpn.damage,
        type:   wpn.type,  splash: wpn.splash || false,
      });
    }
    return bullets;
  }

  _shootSpecial(now, aimDir) {
    const cd = this.specialMode === 'omni' ? 160 : 80;
    if (now - this.lastSpecialShot < cd) return [];
    this.lastSpecialShot = now;
    const bullets = [];
    if (this.specialMode === 'omni') {
      [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2].forEach(a => {
        bullets.push({ pos: this.mesh.position.clone(), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), speed: 20, damage: 1, type: 'player', splash: false });
      });
      this.specialTimer -= cd;
    } else if (this.specialMode === 'spiral') {
      for (let i = 0; i < 3; i++) {
        const a = this.spiralAngle + (i * Math.PI * 2 / 3);
        bullets.push({ pos: this.mesh.position.clone(), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), speed: 18, damage: 1, type: 'player', splash: false });
      }
      this.spiralAngle += 0.28;
      this.specialAmmo--;
    }
    return bullets;
  }

  takeDamage() {
    if (this.isInvincible) return false;
    this.health--;
    this.isInvincible    = true;
    this.invincibleTimer = 1600;
    return true;
  }

  addLife() {
    if (this.health < this.maxHealth) this.health++;
    else this.maxHealth++;
  }

  destroy() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.shadowBlob);
    if (this._flashPivot) this.scene.remove(this._flashPivot);
    if (this.aimLight) this.scene.remove(this.aimLight);
  }
}

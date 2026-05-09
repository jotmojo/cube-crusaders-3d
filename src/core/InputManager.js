// InputManager.js — unified desktop + mobile controls
// Desktop: WASD + mouse aim + click to shoot
// Mobile:  left joystick = move, right joystick = aim + auto-shoot

import * as THREE from 'three';

// Detect touch device
export const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

export class InputManager {
  constructor(canvas, camera) {
    this.canvas  = canvas;
    this.camera  = camera;

    this.keys  = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.aimDir = new THREE.Vector3(0, 0, 1);

    this._raycaster   = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._aimPoint    = new THREE.Vector3();
    this._mouseEverMoved = false;

    this._joystickEnabled = false; // only active during gameplay

    // Mobile joystick state
    this._leftStick  = { active: false, touchId: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };
    this._rightStick = { active: false, touchId: -1, baseX: 0, baseY: 0, dx: 0, dy: 0 };
    this._mobileShooting = false;

    // Mobile movement output
    this._mobileFwd    = 0;
    this._mobileStrafe = 0;

    if (IS_TOUCH) {
      this._buildJoystickUI();
      this._bindTouch();
    } else {
      this._bindDesktop();
    }
  }

  // ─── JOYSTICK UI ──────────────────────────────────────────────
  _buildJoystickUI() {
    const style = document.createElement('style');
    style.textContent = `
      #joystick-layer {
        position: fixed; inset: 0; z-index: 50;
        pointer-events: none;
        touch-action: none;
      }
      .js-zone {
        position: absolute; bottom: 0;
        width: 50%; height: 55%;
        pointer-events: all;
        touch-action: none;
      }
      #js-left  { left: 0; }
      #js-right { right: 0; }

      .js-base {
        position: absolute;
        width: 130px; height: 130px;
        border-radius: 50%;
        background: rgba(0,220,255,0.08);
        border: 3px solid rgba(0,220,255,0.35);
        transform: translate(-50%, -50%);
        pointer-events: none;
        display: none;
      }
      .js-knob {
        position: absolute;
        width: 58px; height: 58px;
        border-radius: 50%;
        background: rgba(0,200,255,0.45);
        border: 3px solid rgba(0,220,255,0.9);
        box-shadow: 0 0 16px rgba(0,200,255,0.5);
        transform: translate(-50%, -50%);
        pointer-events: none;
        display: none;
      }

      /* Right stick - aim/shoot indicator */
      #js-right-base  { border-color: rgba(255,80,80,0.4); background: rgba(255,80,80,0.07); }
      #js-right-knob  { background: rgba(255,80,80,0.45); border-color: rgba(255,100,100,0.9); box-shadow: 0 0 16px rgba(255,80,80,0.5); }

      /* Shoot flash */
      #shoot-flash {
        position: fixed; inset: 0;
        background: rgba(255,255,255,0);
        pointer-events: none;
        z-index: 49;
        transition: background 0.05s;
      }

      /* Weapon switch buttons — top right on mobile */
      #weapon-btns {
        position: fixed;
        top: 70px; right: 14px;
        display: flex; flex-direction: column; gap: 8px;
        z-index: 55; pointer-events: all;
      }
      .wpn-btn {
        font-family: 'Press Start 2P', monospace;
        font-size: 9px;
        color: #00ffff;
        border: 2px solid rgba(0,220,255,0.6);
        background: rgba(0,0,0,0.7);
        padding: 8px 12px;
        cursor: pointer;
        letter-spacing: 1px;
        touch-action: manipulation;
        min-width: 80px;
        text-align: center;
      }
      .wpn-btn.active { background: rgba(0,150,200,0.4); border-color: #00ffff; }

      /* Hint text */
      #mobile-hint {
        position: fixed;
        bottom: 58%; left: 50%;
        transform: translateX(-50%);
        font-size: 9px;
        font-family: 'Press Start 2P', monospace;
        color: rgba(255,255,255,0.3);
        letter-spacing: 1px;
        pointer-events: none;
        z-index: 55;
      }
    `;
    document.head.appendChild(style);

    // Main layer
    this._layer = document.createElement('div');
    this._layer.id = 'joystick-layer';
    this._layer.innerHTML = `
      <div id="js-left"  class="js-zone">
        <div id="js-left-base"  class="js-base"></div>
        <div id="js-left-knob"  class="js-knob"></div>
      </div>
      <div id="js-right" class="js-zone">
        <div id="js-right-base" class="js-base"></div>
        <div id="js-right-knob" class="js-knob"></div>
      </div>
      <div id="shoot-flash"></div>
      <div id="mobile-hint">LEFT = MOVE &nbsp; RIGHT = AIM + SHOOT</div>
    `;
    document.body.appendChild(this._layer);

    // Weapon buttons
    this._weaponBtns = document.createElement('div');
    this._weaponBtns.id = 'weapon-btns';
    this._weaponBtns.innerHTML = `
      <button class="wpn-btn active" data-w="0">🔫 PISTOL</button>
      <button class="wpn-btn" data-w="1">💥 SHOTGUN</button>
      <button class="wpn-btn" data-w="2">🔥 M-GUN</button>
      <button class="wpn-btn" data-w="3">🚀 ROCKET</button>
    `;
    document.body.appendChild(this._weaponBtns);

    this._activeWeapon = 0;
    this._weaponBtns.querySelectorAll('.wpn-btn').forEach(btn => {
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        e.stopPropagation();
        const w = parseInt(btn.dataset.w);
        this._activeWeapon = w;
        this._weaponBtns.querySelectorAll('.wpn-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }, { passive: false });
    });

    // Cache elements
    this._leftBase  = document.getElementById('js-left-base');
    this._leftKnob  = document.getElementById('js-left-knob');
    this._rightBase = document.getElementById('js-right-base');
    this._rightKnob = document.getElementById('js-right-knob');
    this._shootFlash = document.getElementById('shoot-flash');
  }

  // ─── MOBILE TOUCH ─────────────────────────────────────────────
  _bindTouch() {
    const DEAD = 8;    // deadzone px
    const MAX  = 55;   // max stick displacement px

    const handleStart = (e) => {
      if (!this._joystickEnabled) return; // let UI buttons through
      e.preventDefault();
      const hw = window.innerWidth / 2;

      for (const t of e.changedTouches) {
        const left = t.clientX < hw;

        if (left && !this._leftStick.active) {
          this._leftStick = { active: true, touchId: t.identifier, baseX: t.clientX, baseY: t.clientY, dx: 0, dy: 0 };
          this._showStick('left', t.clientX, t.clientY, 0, 0);
        } else if (!left && !this._rightStick.active) {
          this._rightStick = { active: true, touchId: t.identifier, baseX: t.clientX, baseY: t.clientY, dx: 0, dy: 0 };
          this._showStick('right', t.clientX, t.clientY, 0, 0);
          this._mobileShooting = false;
        }
      }
    };

    const handleMove = (e) => {
      if (!this._joystickEnabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        // Left stick — movement
        if (this._leftStick.active && t.identifier === this._leftStick.touchId) {
          let dx = t.clientX - this._leftStick.baseX;
          let dy = t.clientY - this._leftStick.baseY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const clamped = Math.min(dist, MAX);
          if (dist > 0) { dx = dx/dist * clamped; dy = dy/dist * clamped; }
          this._leftStick.dx = dx; this._leftStick.dy = dy;
          this._showStick('left', this._leftStick.baseX, this._leftStick.baseY, dx, dy);

          // Compute fwd/strafe from stick (screen Y- = world forward)
          const raw = dist > DEAD ? dist : 0;
          if (raw > DEAD) {
            this._mobileStrafe = (dx / MAX);
            this._mobileFwd    = -(dy / MAX); // screen Y inverted
          } else {
            this._mobileFwd = this._mobileStrafe = 0;
          }
        }

        // Right stick — aim + shoot
        if (this._rightStick.active && t.identifier === this._rightStick.touchId) {
          let dx = t.clientX - this._rightStick.baseX;
          let dy = t.clientY - this._rightStick.baseY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const clamped = Math.min(dist, MAX);
          if (dist > 0) { dx = dx/dist * clamped; dy = dy/dist * clamped; }
          this._rightStick.dx = dx; this._rightStick.dy = dy;
          this._showStick('right', this._rightStick.baseX, this._rightStick.baseY, dx, dy);

          // Aim direction from right stick
          if (dist > DEAD) {
            // Screen space: right = +X world, down = +Z world (isometric)
            const nx = dx / dist, ny = dy / dist;
            // Map screen direction to isometric world direction
            // In isometric view, screen right = world X+Z, screen down = world -X+Z
            const wx = (nx - ny) * 0.707;
            const wz = (nx + ny) * 0.707;
            const wlen = Math.sqrt(wx*wx + wz*wz) || 1;
            this.aimDir.x += (wx/wlen - this.aimDir.x) * 0.4;
            this.aimDir.z += (wz/wlen - this.aimDir.z) * 0.4;
            const nl = Math.sqrt(this.aimDir.x**2 + this.aimDir.z**2);
            if (nl > 0) { this.aimDir.x /= nl; this.aimDir.z /= nl; }
            this._mobileShooting = true;
            this._mouseEverMoved = true;
          } else {
            this._mobileShooting = false;
          }
        }
      }
    };

    const handleEnd = (e) => {
      if (!this._joystickEnabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._leftStick.active && t.identifier === this._leftStick.touchId) {
          this._leftStick.active = false;
          this._mobileFwd = this._mobileStrafe = 0;
          this._hideStick('left');
        }
        if (this._rightStick.active && t.identifier === this._rightStick.touchId) {
          this._rightStick.active = false;
          this._mobileShooting = false;
          this._hideStick('right');
        }
      }
    };

    window.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove',  handleMove,  { passive: false });
    window.addEventListener('touchend',   handleEnd,   { passive: false });
    window.addEventListener('touchcancel',handleEnd,   { passive: false });
  }

  _showStick(side, bx, by, dx, dy) {
    const base = side === 'left' ? this._leftBase  : this._rightBase;
    const knob = side === 'left' ? this._leftKnob  : this._rightKnob;
    if (!base) return;
    base.style.display = 'block';
    base.style.left = bx + 'px';
    base.style.top  = by + 'px';
    knob.style.display = 'block';
    knob.style.left = (bx + dx) + 'px';
    knob.style.top  = (by + dy) + 'px';
  }

  _hideStick(side) {
    const base = side === 'left' ? this._leftBase  : this._rightBase;
    const knob = side === 'left' ? this._leftKnob  : this._rightKnob;
    if (base) base.style.display = 'none';
    if (knob) knob.style.display = 'none';
  }

  // ─── DESKTOP ──────────────────────────────────────────────────
  _bindDesktop() {
    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    window.addEventListener('mousemove', e => {
      this.mouse.x = (e.clientX / window.innerWidth)  * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this._mouseEverMoved = true;
    });

    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
    });
  }

  // ─── PUBLIC API ───────────────────────────────────────────────
  updateAim(playerPos) {
    if (IS_TOUCH) return; // mobile aim handled directly in touchmove
    if (!this._mouseEverMoved) return;

    this._raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._aimPoint);
    if (hit) {
      const dx = this._aimPoint.x - playerPos.x;
      const dz = this._aimPoint.z - playerPos.z;
      const len = Math.sqrt(dx*dx + dz*dz);
      if (len > 0.15) {
        const tx = dx/len, tz = dz/len;
        this.aimDir.x += (tx - this.aimDir.x) * 0.35;
        this.aimDir.z += (tz - this.aimDir.z) * 0.35;
        const nl = Math.sqrt(this.aimDir.x**2 + this.aimDir.z**2);
        if (nl > 0) { this.aimDir.x /= nl; this.aimDir.z /= nl; }
      }
    }
  }

  getMovement() {
    if (IS_TOUCH) {
      // Mobile — use joystick values directly as world-space fwd/strafe
      // Left stick maps directly: up=fwd, right=strafe
      let fwd    = this._mobileFwd;
      let strafe = this._mobileStrafe;
      if (fwd !== 0 && strafe !== 0) { fwd *= 0.707; strafe *= 0.707; }
      return { fwd, strafe };
    }

    // Desktop
    let fwd = 0, strafe = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp'))    fwd    += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown'))  fwd    -= 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft'))  strafe -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) strafe += 1;
    if (fwd !== 0 && strafe !== 0) { fwd *= 0.707; strafe *= 0.707; }
    return { fwd, strafe };
  }

  isShooting() {
    if (IS_TOUCH) return this._mobileShooting;
    return this.mouse.down;
  }

  isDown(code) { return this.keys.has(code); }

  getWeaponSwitch() {
    if (IS_TOUCH) return this._activeWeapon;
    for (let i = 1; i <= 4; i++) {
      if (this.isDown(`Digit${i}`)) return i - 1;
    }
    return -1;
  }

  // Show/hide joystick layer (call when game starts/stops)
  showMobileUI(visible) {
    if (!IS_TOUCH) return;
    this._joystickEnabled = visible;
    if (this._layer)      this._layer.style.display      = visible ? 'block' : 'none';
    if (this._weaponBtns) this._weaponBtns.style.display = visible ? 'flex'  : 'none';
    if (!visible) {
      // Reset stick state when hiding
      this._mobileFwd = this._mobileStrafe = 0;
      this._mobileShooting = false;
      this._leftStick.active = false;
      this._rightStick.active = false;
      this._hideStick('left');
      this._hideStick('right');
    }
  }
}

// InputManager.js — keyboard + mouse, aim direction always tracks mouse position

import * as THREE from 'three';

export class InputManager {
  constructor(canvas, camera) {
    this.canvas  = canvas;
    this.camera  = camera;

    this.keys  = new Set();
    this.mouse = { x: 0, y: 0, down: false };

    // aimDir is updated every frame from mousemove — no click required
    this.aimDir = new THREE.Vector3(0, 0, 1);

    this._raycaster   = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._aimPoint    = new THREE.Vector3();

    // Track whether mouse has moved at all — so we can update aim even before click
    this._mouseEverMoved = false;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    // mousemove fires constantly — update raw coords immediately
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

    // Touch
    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      this.mouse.down = true;
      const t = e.touches[0];
      this.mouse.x = (t.clientX / window.innerWidth)  * 2 - 1;
      this.mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
      this._mouseEverMoved = true;
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => { this.mouse.down = false; });

    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      this.mouse.x = (t.clientX / window.innerWidth)  * 2 - 1;
      this.mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
    }, { passive: false });
  }

  // Called every frame in the game loop with the current player world position.
  // Updates aimDir by projecting the current mouse position onto the ground plane.
  // This happens every frame regardless of click state.
  updateAim(playerPos) {
    if (!this._mouseEverMoved) return; // don't snap to 0,0 before first mouse move

    this._raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._aimPoint);

    if (hit) {
      const dx = this._aimPoint.x - playerPos.x;
      const dz = this._aimPoint.z - playerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.15) {
        // Smooth the aim direction slightly to prevent jitter
        const tx = dx / len, tz = dz / len;
        this.aimDir.x += (tx - this.aimDir.x) * 0.35;
        this.aimDir.z += (tz - this.aimDir.z) * 0.35;
        // Re-normalize after lerp
        const nl = Math.sqrt(this.aimDir.x * this.aimDir.x + this.aimDir.z * this.aimDir.z);
        if (nl > 0) { this.aimDir.x /= nl; this.aimDir.z /= nl; }
      }
    }
  }

  isDown(code)  { return this.keys.has(code); }
  isShooting()  { return this.mouse.down; }

  // Returns forward/strafe scalars — movement is relative to facing direction.
  // W/Up    = forward  (+1)
  // S/Down  = backward (-1)
  // A/Left  = strafe left  (-1)
  // D/Right = strafe right (+1)
  // The Player applies these relative to aimDir each frame.
  getMovement() {
    let fwd = 0, strafe = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp'))    fwd    += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown'))  fwd    -= 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft'))  strafe -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) strafe += 1;
    // Normalize diagonal
    if (fwd !== 0 && strafe !== 0) { fwd *= 0.707; strafe *= 0.707; }
    return { fwd, strafe };
  }

  getWeaponSwitch() {
    for (let i = 1; i <= 4; i++) {
      if (this.isDown(`Digit${i}`)) return i - 1;
    }
    return -1;
  }
}

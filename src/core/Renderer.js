// Renderer.js — Three.js scene, isometric camera, lighting

import * as THREE from 'three';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;

    // ── Scene ──
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080810);
    this.scene.fog = new THREE.Fog(0x080810, 60, 120);

    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // keep pixel-art crisp
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // ── Isometric camera ──
    // Orthographic gives true isometric feel — no perspective distortion
    this._setupCamera();

    // ── Lighting — matches the dark moody concept art ──
    this._setupLighting();

    // Resize handler
    window.addEventListener('resize', () => this._onResize());
  }

  _setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 28; // controls zoom level — lower = closer

    this.frustumSize = frustumSize;
    this.camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
       frustumSize * aspect / 2,
       frustumSize / 2,
      -frustumSize / 2,
      0.1,
      500
    );

    // Classic isometric angle: 45° yaw, ~35.26° pitch (arctan(1/√2))
    // We use a slightly shallower pitch for better game visibility
    this.camera.position.set(30, 28, 30);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  _setupLighting() {
    // Ambient — dark blue-tinted (matches the night city feel)
    const ambient = new THREE.AmbientLight(0x223344, 0.8);
    this.scene.add(ambient);

    // Main directional light — top-left, casts shadows
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
    this.sunLight.position.set(-20, 40, -10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width  = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near   = 1;
    this.sunLight.shadow.camera.far    = 200;
    this.sunLight.shadow.camera.left   = -60;
    this.sunLight.shadow.camera.right  =  60;
    this.sunLight.shadow.camera.top    =  60;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.bias = -0.001;
    this.scene.add(this.sunLight);

    // Fill light — opposite side, cooler
    const fill = new THREE.DirectionalLight(0x334466, 0.4);
    fill.position.set(15, 10, 15);
    this.scene.add(fill);

    // Ground bounce — warm, very subtle
    const bounce = new THREE.DirectionalLight(0x221100, 0.2);
    bounce.position.set(0, -10, 0);
    this.scene.add(bounce);

    // Hemisphere light — sky/ground gradient
    const hemi = new THREE.HemisphereLight(0x1a2244, 0x0a0a00, 0.5);
    this.scene.add(hemi);
  }

  // Follow target smoothly
  // Isometric offset is always (+30, +28, +30) from target
  followTarget(target, dt) {
    if (!target) return;

    const goalX = target.x + 30;
    const goalZ = target.z + 30;

    if (!this._cameraReady) {
      // Snap on first frame — no lerp drift
      this.camera.position.set(goalX, 28, goalZ);
      this._cameraReady = true;
    } else {
      // Exponential decay lerp — framerate independent, never runs away
      const safeDt = Math.min(dt, 0.05);
      const t = 1 - Math.pow(0.01, safeDt);
      this.camera.position.x += (goalX - this.camera.position.x) * t;
      this.camera.position.z += (goalZ - this.camera.position.z) * t;
      this.camera.position.y = 28;
    }

    // Orthographic camera always looks at player world position
    this.camera.lookAt(target.x, 0, target.z);

    // Keep shadow frustum centered on player
    this.sunLight.position.set(target.x - 20, 40, target.z - 10);
    this.sunLight.target.position.set(target.x, 0, target.z);
    this.sunLight.target.updateMatrixWorld();
  }

  addGlow(position, color, intensity = 1.5, distance = 8) {
    const light = new THREE.PointLight(color, intensity, distance);
    light.position.copy(position);
    this.scene.add(light);
    return light;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    this.camera.left   = -this.frustumSize * aspect / 2;
    this.camera.right  =  this.frustumSize * aspect / 2;
    this.camera.top    =  this.frustumSize / 2;
    this.camera.bottom = -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  get scene3d() { return this.scene; }
}

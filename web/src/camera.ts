import * as THREE from 'three';

/**
 * Hybrid camera controller.
 *
 * Modes:
 *   - 'orbit': third-person, drag to rotate around target, scroll to zoom.
 *   - 'focus': cinematic dolly to a specific point (when a whale is clicked).
 *   - 'dive':   submarine dive mode, WASD movement with a HUD reticle.
 *
 * Press F to toggle dive mode; ESC returns to orbit.
 */

type Mode = 'orbit' | 'focus' | 'dive';

const KEYS = { fwd: ['KeyW','ArrowUp'], back: ['KeyS','ArrowDown'], left: ['KeyA','ArrowLeft'], right: ['KeyD','ArrowRight'], up: ['Space'], down: ['ShiftLeft','ShiftRight'] };

export class HybridCamera {
  camera: THREE.PerspectiveCamera;
  mode: Mode = 'orbit';

  // orbit state
  private target = new THREE.Vector3(0, 0, 0);
  private spherical = new THREE.Spherical(60, Math.PI / 2.6, 0);
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  // focus state
  private focusFrom = new THREE.Vector3();
  private focusTo = new THREE.Vector3();
  private focusLookFrom = new THREE.Vector3();
  private focusLookTo = new THREE.Vector3();
  private focusT = 1; // 0..1
  private focusDuration = 0.9;
  private onFocusDone?: () => void;

  // dive state
  private yaw = 0;
  private pitch = 0;
  private velocity = new THREE.Vector3();
  private keys = new Set<string>();
  private diveSpeed = 18;

  // shared
  private el: HTMLElement;

  constructor(camera: THREE.PerspectiveCamera, el: HTMLElement) {
    this.camera = camera;
    this.el = el;
    this.applyOrbit();
    this.bind();
  }

  setOrbitTarget(t: THREE.Vector3) {
    this.target.copy(t);
    this.applyOrbit();
  }

  /**
   * Cinematic dolly toward a point near a whale.
   * `lookAt` is the whale center; `from` is where the camera should end up.
   */
  focusOn(lookAt: THREE.Vector3, from: THREE.Vector3, duration = 0.9, onDone?: () => void) {
    this.mode = 'focus';
    this.focusFrom.copy(this.camera.position);
    this.focusTo.copy(from);
    this.focusLookFrom.copy(this.target);
    this.focusLookTo.copy(lookAt);
    this.focusT = 0;
    this.focusDuration = duration;
    this.onFocusDone = onDone;
  }

  enterDive() {
    if (this.mode === 'dive') return;
    this.mode = 'dive';
    document.body.classList.add('dive');
    // Initialize yaw/pitch from current camera orientation
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.yaw = Math.atan2(dir.x, dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }

  exitDive() {
    document.body.classList.remove('dive');
    this.target.copy(this.camera.position).add(this.cameraForward().multiplyScalar(20));
    this.spherical.setFromVector3(this.camera.position.clone().sub(this.target));
    this.mode = 'orbit';
  }

  resetToOrbit() {
    if (this.mode === 'dive') { this.exitDive(); return; }
    this.mode = 'orbit';
    this.applyOrbit();
  }

  private cameraForward(): THREE.Vector3 {
    const v = new THREE.Vector3();
    this.camera.getWorldDirection(v);
    return v;
  }

  private applyOrbit() {
    const v = new THREE.Vector3().setFromSpherical(this.spherical).add(this.target);
    this.camera.position.copy(v);
    this.camera.lookAt(this.target);
  }

  update(dt: number) {
    if (this.mode === 'focus') {
      this.focusT = Math.min(1, this.focusT + dt / this.focusDuration);
      const e = easeInOut(this.focusT);
      this.camera.position.lerpVectors(this.focusFrom, this.focusTo, e);
      const look = new THREE.Vector3().lerpVectors(this.focusLookFrom, this.focusLookTo, e);
      this.camera.lookAt(look);
      if (this.focusT >= 1) {
        // Settle into orbit around the focused point
        this.target.copy(this.focusLookTo);
        const offset = this.camera.position.clone().sub(this.target);
        this.spherical.setFromVector3(offset);
        this.mode = 'orbit';
        this.onFocusDone?.();
        this.onFocusDone = undefined;
      }
      return;
    }

    if (this.mode === 'dive') {
      const fwd = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3(0, 1, 0);

      const accel = new THREE.Vector3();
      if (this.pressed(KEYS.fwd)) accel.add(fwd);
      if (this.pressed(KEYS.back)) accel.sub(fwd);
      if (this.pressed(KEYS.right)) accel.add(right);
      if (this.pressed(KEYS.left)) accel.sub(right);
      if (this.pressed(KEYS.up)) accel.add(up);
      if (this.pressed(KEYS.down)) accel.sub(up);
      if (accel.lengthSq() > 0) accel.normalize();

      // Smooth velocity
      const targetVel = accel.multiplyScalar(this.diveSpeed);
      this.velocity.lerp(targetVel, Math.min(1, dt * 6));
      this.camera.position.addScaledVector(this.velocity, dt);

      this.camera.lookAt(this.camera.position.clone().add(fwd));
      return;
    }

    // orbit
    this.applyOrbit();
  }

  private pressed(codes: string[]) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  private bind() {
    this.el.addEventListener('mousedown', (e) => {
      if (this.mode !== 'orbit') return;
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging || this.mode !== 'orbit') return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.spherical.theta -= dx * 0.005;
      this.spherical.phi -= dy * 0.005;
      this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, 0.15, Math.PI - 0.15);
    });
    this.el.addEventListener('wheel', (e) => {
      if (this.mode !== 'orbit') return;
      e.preventDefault();
      this.spherical.radius *= 1 + Math.sign(e.deltaY) * 0.08;
      this.spherical.radius = THREE.MathUtils.clamp(this.spherical.radius, 5, 220);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF') {
        if (this.mode === 'dive') this.exitDive();
        else this.enterDive();
      }
      else if (e.code === 'Escape') this.resetToOrbit();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

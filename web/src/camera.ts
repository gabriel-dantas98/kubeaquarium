import * as THREE from 'three';
import { isUIEvent } from './input';

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

export type Mode = 'orbit' | 'focus' | 'dive';
export interface CameraPreferences { lookSensitivity: number; invertY: boolean; reducedMotion: boolean }

const KEYS = { fwd: ['KeyW','ArrowUp'], back: ['KeyS','ArrowDown'], left: ['KeyA','ArrowLeft'], right: ['KeyD','ArrowRight'], up: ['Space'], down: ['ShiftLeft','ShiftRight'] };

export class HybridCamera {
  camera: THREE.PerspectiveCamera;
  mode: Mode = 'orbit';

  // orbit state
  private target = new THREE.Vector3(0, 0, 0);
  private spherical = new THREE.Spherical(60, Math.PI / 2.6, 0);
  private dragging = false;
  private looking = false;
  private dragPointer: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragDistance = 0;
  private dragClick = false;
  private blocked = false;
  private preferences: CameraPreferences = {
    lookSensitivity: 1, invertY: false,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
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

  // shake state (transient impulse; removed before each update so it never
  // permanently displaces the camera)
  private shakeAmp = 0;
  private shakeTime = 0;
  private readonly shakeDuration = 0.15;
  private shakeOffset = new THREE.Vector3();
  private shakeSeed = 0;

  // shared
  private el: HTMLElement;

  constructor(camera: THREE.PerspectiveCamera, el: HTMLElement) {
    this.camera = camera;
    this.el = el;
    this.applyOrbit();
    this.bind();
  }

  get isLooking() { return this.looking; }
  get isInputBlocked() { return this.blocked; }
  get direction() { return this.cameraForward(); }
  get currentPreferences(): CameraPreferences { return { ...this.preferences }; }

  setPreferences(value: CameraPreferences) {
    this.preferences = {
      lookSensitivity: Number.isFinite(value.lookSensitivity) ? THREE.MathUtils.clamp(value.lookSensitivity, 0.25, 2) : 1,
      invertY: value.invertY === true,
      reducedMotion: value.reducedMotion === true,
    };
    if (this.preferences.reducedMotion) this.removeShake();
  }

  clearInput() {
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.dragging = false;
    this.looking = false;
    if (this.dragPointer !== null && this.el.hasPointerCapture?.(this.dragPointer)) this.el.releasePointerCapture(this.dragPointer);
    this.dragPointer = null;
  }

  setInputBlocked(blocked: boolean) {
    this.blocked = blocked;
    if (blocked) this.clearInput();
  }

  consumeDragClick(): boolean {
    const consumed = this.dragClick;
    this.dragClick = false;
    return consumed;
  }

  private removeShake() {
    this.camera.position.sub(this.shakeOffset);
    this.shakeOffset.set(0, 0, 0);
    this.shakeAmp = 0;
    this.shakeTime = 0;
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
    this.clearInput();
    this.removeShake();
    if (this.preferences.reducedMotion) {
      this.target.copy(lookAt);
      this.camera.position.copy(from);
      this.spherical.setFromVector3(this.camera.position.clone().sub(this.target));
      this.mode = 'orbit';
      this.applyOrbit();
      onDone?.();
      return;
    }
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
    this.clearInput();
    this.removeShake();
    this.onFocusDone = undefined;
    this.mode = 'dive';
    document.body.classList.add('dive');
    // Initialize yaw/pitch from current camera orientation
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.yaw = Math.atan2(dir.x, dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }

  exitDive() {
    this.clearInput();
    this.removeShake();
    document.body.classList.remove('dive');
    this.target.copy(this.camera.position).add(this.cameraForward().multiplyScalar(20));
    this.spherical.setFromVector3(this.camera.position.clone().sub(this.target));
    this.mode = 'orbit';
  }

  resetToOrbit() {
    this.clearInput();
    this.removeShake();
    if (this.mode === 'dive') { this.exitDive(); return; }
    this.mode = 'orbit';
    this.applyOrbit();
  }

  frameBounds(bounds: THREE.Box3) {
    this.clearInput();
    this.removeShake();
    this.onFocusDone = undefined;
    document.body.classList.remove('dive');
    const sphere = new THREE.Sphere();
    if (bounds.isEmpty()) sphere.set(new THREE.Vector3(), 10);
    else bounds.getBoundingSphere(sphere);
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distance = sphere.radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.1;
    const oldDirection = this.camera.position.clone().sub(this.target).normalize();
    if (oldDirection.lengthSq() < 0.5) oldDirection.set(0, 0.4, 1).normalize();
    this.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(oldDirection, distance);
    this.spherical.setFromVector3(this.camera.position.clone().sub(this.target));
    this.camera.near = Math.max(0.01, Math.min(0.1, distance - sphere.radius));
    this.camera.far = Math.max(500, distance + sphere.radius * 3);
    this.camera.updateProjectionMatrix();
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

  /**
   * Brief camera impulse (missile impact, etc). Subtle by design: small
   * amplitude, ~0.15s, eased out. The offset is removed at the start of the
   * next update, so integrated modes (dive) never drift.
   */
  impulse(strength = 1) {
    if (this.preferences.reducedMotion) return;
    this.shakeAmp = Math.min(0.24, 0.13 * strength + this.shakeAmp * 0.4);
    this.shakeTime = this.shakeDuration;
    this.shakeSeed = Math.random() * 100;
  }

  update(dt: number) {
    // Remove last frame's shake offset before simulating camera motion.
    this.camera.position.sub(this.shakeOffset);
    this.shakeOffset.set(0, 0, 0);
    this.updateMode(dt);
    this.applyShake(dt);
  }

  private applyShake(dt: number) {
    if (this.shakeTime <= 0) return;
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const t = this.shakeTime / this.shakeDuration; // 1 -> 0
    const a = this.shakeAmp * t * t;               // eased out
    const p = (this.shakeDuration - this.shakeTime) * 46 + this.shakeSeed;
    this.shakeOffset.set(
      Math.sin(p * 1.3) * a,
      Math.cos(p * 1.7) * a * 0.7,
      Math.sin(p * 0.9) * a * 0.5,
    );
    this.camera.position.add(this.shakeOffset);
    if (this.shakeTime <= 0) this.shakeAmp = 0;
  }

  private updateMode(dt: number) {
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
      if (this.preferences.reducedMotion) this.velocity.copy(targetVel);
      else this.velocity.lerp(targetVel, Math.min(1, dt * 6));
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
    this.el.addEventListener('pointerdown', (e) => {
      if (this.blocked || isUIEvent(e) || e.defaultPrevented) return;
      if ((this.mode === 'orbit' && e.button !== 0) || (this.mode === 'dive' && e.button !== 2) || this.mode === 'focus') return;
      this.dragging = this.mode === 'orbit';
      this.looking = this.mode === 'dive';
      this.dragPointer = e.pointerId;
      this.dragClick = false;
      this.dragDistance = 0;
      this.dragStartX = this.lastX = e.clientX;
      this.dragStartY = this.lastY = e.clientY;
      this.el.setPointerCapture(e.pointerId);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.dragPointer !== e.pointerId || (!this.dragging && !this.looking)) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.dragDistance = Math.max(this.dragDistance, Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY));
      if (this.dragging) {
        this.spherical.theta -= dx * 0.005;
        this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi - dy * 0.005, 0.15, Math.PI - 0.15);
      } else {
        this.yaw -= dx * 0.003 * this.preferences.lookSensitivity;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.003 * this.preferences.lookSensitivity * (this.preferences.invertY ? 1 : -1), -Math.PI * 0.47, Math.PI * 0.47);
        this.camera.lookAt(this.camera.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))));
      }
    });
    const endDrag = (e: PointerEvent) => {
      if (this.dragPointer !== e.pointerId) return;
      this.dragClick = this.dragging && this.dragDistance > 5;
      this.dragging = false;
      this.looking = false;
      if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
      this.dragPointer = null;
    };
    this.el.addEventListener('pointerup', endDrag);
    this.el.addEventListener('pointercancel', endDrag);
    this.el.addEventListener('contextmenu', e => { if (this.mode === 'dive') e.preventDefault(); });
    this.el.addEventListener('wheel', (e) => {
      if (this.mode !== 'orbit' || this.blocked || isUIEvent(e)) return;
      e.preventDefault();
      this.spherical.radius *= 1 + Math.sign(e.deltaY) * 0.08;
      this.spherical.radius = THREE.MathUtils.clamp(this.spherical.radius, 5, Math.max(220, this.camera.far * 0.8));
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (this.blocked || isUIEvent(e) || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyF' && !e.repeat) {
        e.preventDefault();
        if (this.mode === 'dive') this.exitDive();
        else this.enterDive();
      }
      else if (this.mode === 'dive' && Object.values(KEYS).some(codes => codes.includes(e.code))) {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); });

  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

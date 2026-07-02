import * as THREE from 'three';
import Stats from 'stats.js';
import type { PodView } from './types';
import { buildWhaleGeometry, buildWhaleMaterial } from './whale';
import { layoutNamespaces, buildBubble, placeInBubble, type NamespaceLayout } from './namespaces';
import { HybridCamera } from './camera';
import { buildSubmarineCockpit } from './submarine';
import type { Filter } from './hud/search';
import { ALL } from './hud/search';
import type { LabelTarget } from './hud/labels';

const MAX_INSTANCES = 20000;
const BOIDS_INSTANCE_LIMIT = 1200;
const BOIDS_MIN_FPS = 24;
const MAX_BUBBLES = 180;
const MAX_PROJECTILES = 32;
const MAX_FRAGMENTS = 64;
const KILL_POP_DURATION = 0.25;
const FLASH_DURATION = 0.2;

const COLORS = {
  running: new THREE.Color(0x2496ed),
  pending: new THREE.Color(0xa6c5e0),
  crash:   new THREE.Color(0xf87171),
  succeed: new THREE.Color(0x4ade80),
  unknown: new THREE.Color(0x9ca3af),
  hidden:  new THREE.Color(-1, -1, -1),
};

interface InstanceSlot {
  index: number;
  uid: string;
  name: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  baseScale: number;
  collisionRadius: number;
  namespace: string;
  phase: string;
  reason: string;
  ready: boolean;
  yaw: number;
  pitch: number;
  spawnAt: number;
  removingAt?: number;
  /** Set when destroyed by a missile: distinct death pop instead of the slow sink. */
  killedAt?: number;
  wanderSeed: number;
  matched: boolean;       // current filter result
  baseColor: THREE.Color; // pre-dim color, so we can re-tint cheaply
  hitFlashUntil?: number;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  ttl: number;
  scale: number;
  /** Explosion fragments only: per-instance tint in the missile palette. */
  color?: THREE.Color;
}

interface Projectile {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  ttl: number;
  armedAt: number;
  /** Aimed impact point (updated each frame while the target pod is alive). */
  target: THREE.Vector3;
  targetUid: string | null;
  speed: number;
}

export class AquariumScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private stats: Stats;
  /** Set while the loop idles in `paused`; tells the loop to reset the stats meter on resume. */
  private statsStale = false;
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.InstancedMesh;
  private bubbleMesh: THREE.InstancedMesh;
  private projectileMesh: THREE.InstancedMesh;
  private fragmentMesh: THREE.InstancedMesh;
  private flashMesh: THREE.Mesh;
  private flashMat: THREE.MeshBasicMaterial;
  private flashStart = -1;
  private flashSize = 1;
  private submarine: THREE.Group;
  private hybrid: HybridCamera;

  private slots = new Map<string, InstanceSlot>();
  /** namespace -> uids of slots in that bubble (for cheap per-bubble interaction). */
  private bubbleMembers = new Map<string, Set<string>>();
  private freeIndices: number[] = [];
  private nextIndex = 0;

  private bubbles = new Map<string, THREE.Group>();
  private layouts = new Map<string, NamespaceLayout>();
  private bubbleRoot = new THREE.Group();

  private dummyMatrix = new THREE.Matrix4();
  private dummyPos = new THREE.Vector3();
  private dummyQuat = new THREE.Quaternion();
  private dummyScale = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private prevCameraPos = new THREE.Vector3();
  private cameraFrameDelta = new THREE.Vector3();
  private submarineBasePos = new THREE.Vector3(0, -0.94, -2.7);
  private submarineKick = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private aimPoint = new THREE.Vector2(0, 0);
  private pixelRatio = 1;
  private nextQualityCheckAt = 0;
  private particles: Particle[] = [];
  private fragments: Particle[] = [];
  private projectiles: Projectile[] = [];
  private attackMode = false;
  private nextBubbleAt = 0;

  onSelect?: (uid: string) => void;
  onAttackHit?: (uid: string) => void;
  fpsAvg = 60;
  paused = false;
  focusedUid: string | null = null;
  private filter: Filter = ALL;
  private filterActive = false;

  /** Reusable temp; populated each frame, then read by the labels layer. */
  private labelTargets: LabelTarget[] = [];
  private projVec = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.pixelRatio = this.pixelRatioForLoad();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x04101e, 1);

    this.scene.fog = new THREE.FogExp2(0x04101e, 0.012);
    this.scene.add(this.bubbleRoot);

    const env = new THREE.Mesh(
      new THREE.SphereGeometry(220, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec3 vWorld; void main(){ float t = clamp((vWorld.y + 100.0) / 220.0, 0.0, 1.0); vec3 top = vec3(0.05,0.18,0.32); vec3 bot = vec3(0.012,0.04,0.10); gl_FragColor = vec4(mix(bot, top, t), 1.0); }`,
      }),
    );
    this.scene.add(env);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.position.set(0, 8, 60);
    this.prevCameraPos.copy(this.camera.position);
    this.scene.add(this.camera);
    this.submarine = buildSubmarineCockpit();
    this.submarineBasePos.copy(this.submarine.position);
    this.camera.add(this.submarine);
    this.camera.add(new THREE.PointLight(0xfff4cf, 1.15, 8));
    this.hybrid = new HybridCamera(this.camera, canvas);

    const geo = buildWhaleGeometry();
    this.mat = buildWhaleMaterial();
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_INSTANCES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    const colors = new Float32Array(MAX_INSTANCES * 3);
    this.mesh.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3));
    this.scene.add(this.mesh);

    this.bubbleMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xbdefff, transparent: true, opacity: 0.48, depthWrite: false }),
      MAX_BUBBLES,
    );
    this.bubbleMesh.count = 0;
    this.scene.add(this.bubbleMesh);

    this.projectileMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.18, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5f6d }),
      MAX_PROJECTILES,
    );
    this.projectileMesh.count = 0;
    this.scene.add(this.projectileMesh);

    // Explosion fragments: additive glowing shards in the missile palette.
    this.fragmentMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.16, 6, 5),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      MAX_FRAGMENTS,
    );
    this.fragmentMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FRAGMENTS * 3), 3);
    this.fragmentMesh.count = 0;
    this.fragmentMesh.frustumCulled = false;
    this.scene.add(this.fragmentMesh);

    // Impact flash: additive sphere that expands and fades over ~200ms.
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffc98a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flashMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.flashMat);
    this.flashMesh.visible = false;
    this.flashMesh.frustumCulled = false;
    this.scene.add(this.flashMesh);

    this.stats = new Stats();
    this.stats.dom.id = 'stats-container';
    document.body.appendChild(this.stats.dom);

    canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    window.addEventListener('resize', () => this.onResize());
  }

  /**
   * Rebuild the stats.js meter with fresh internal state.
   *
   * stats.js has no reset API: its FPS panel divides the frame count by
   * wall-clock time since the last sample. While the render loop idles in
   * `paused`, begin()/end() are not called but that internal clock keeps
   * running, so the first sample after resuming is averaged over the whole
   * pause and reads near 0 FPS (and permanently pollutes the min/max range).
   * Recreating the instance makes measurement restart cleanly on resume.
   */
  private resetStats() {
    this.stats.dom.remove();
    this.stats = new Stats();
    this.stats.dom.id = 'stats-container';
    document.body.appendChild(this.stats.dom);
  }

  get isDiving(): boolean {
    return this.hybrid.mode === 'dive';
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }

  getSubmarineDebug() {
    return {
      visible: this.submarine.visible,
      position: {
        x: Number(this.submarine.position.x.toFixed(3)),
        y: Number(this.submarine.position.y.toFixed(3)),
        z: Number(this.submarine.position.z.toFixed(3)),
      },
      rotation: {
        x: Number(this.submarine.rotation.x.toFixed(3)),
        y: Number(this.submarine.rotation.y.toFixed(3)),
        z: Number(this.submarine.rotation.z.toFixed(3)),
      },
    };
  }

  setAttackMode(enabled: boolean) {
    this.attackMode = enabled;
  }

  setAimClientPoint(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.aimPoint.x = THREE.MathUtils.clamp(((clientX - rect.left) / rect.width) * 2 - 1, -0.96, 0.96);
    this.aimPoint.y = THREE.MathUtils.clamp(-((clientY - rect.top) / rect.height) * 2 + 1, -0.92, 0.92);
  }

  fireAttack(): boolean {
    if (!this.attackMode || this.hybrid.mode !== 'dive') return false;
    this.fireProjectile();
    return true;
  }

  private onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  rebuildNamespaceBubbles(podsByNs: Map<string, number>) {
    const names = [...podsByNs.keys()];
    const previousLayouts = this.layouts;
    const layouts = layoutNamespaces(names, podsByNs);
    this.layouts = layouts;

    for (const [name, group] of this.bubbles) {
      if (!layouts.has(name)) {
        this.bubbleRoot.remove(group);
        disposeGroup(group);
        this.bubbles.delete(name);
      }
    }
    for (const [name, layout] of layouts) {
      let group = this.bubbles.get(name);
      const previous = previousLayouts.get(name);
      if (!group) {
        group = buildBubble(layout);
        this.bubbleRoot.add(group);
        this.bubbles.set(name, group);
        this.bubbleMembers.set(name, new Set());
      } else if (!previous || Math.abs(previous.radius - layout.radius) > 0.1) {
        this.bubbleRoot.remove(group);
        disposeGroup(group);
        group = buildBubble(layout);
        this.bubbleRoot.add(group);
        this.bubbles.set(name, group);
      } else {
        group.position.copy(layout.center);
      }
      if (previous) this.relayoutBubbleMembers(name, previous, layout);
    }
  }

  upsertPod(p: PodView, ns2index: Map<string, number>) {
    const layout = this.layouts.get(p.namespace);
    if (!layout) return;
    const indexHint = ns2index.get(p.namespace) ?? 0;
    ns2index.set(p.namespace, indexHint + 1);

    let slot = this.slots.get(p.uid);
    if (!slot) {
      const idx = this.allocIndex();
      if (idx < 0) return;
      const seed = hash(p.uid);
      const initialPos = placeInBubble(layout, p.uid, indexHint);
      const baseScale = this.scaleFor(p);
      slot = {
        index: idx, uid: p.uid, name: p.name,
        pos: initialPos.clone(),
        vel: randomDirection(seed).multiplyScalar(0.6 + ((seed >>> 5) % 100) / 200),
        baseScale,
        collisionRadius: baseScale * 1.0,
        namespace: p.namespace,
        phase: p.phase, reason: p.reason, ready: p.ready,
        yaw: 0, pitch: 0,
        spawnAt: performance.now() / 1000,
        wanderSeed: seed,
        matched: this.filter(p),
        baseColor: this.colorFor(p),
      };
      this.slots.set(p.uid, slot);
      this.addToBubble(p.namespace, p.uid);
    } else {
      if (slot.namespace !== p.namespace) {
        this.removeFromBubble(slot.namespace, p.uid);
        slot.namespace = p.namespace;
        this.addToBubble(p.namespace, p.uid);
        slot.pos.copy(placeInBubble(layout, p.uid, indexHint));
      }
      slot.name = p.name;
      slot.baseScale = this.scaleFor(p);
      slot.collisionRadius = slot.baseScale * 1.0;
      slot.phase = p.phase; slot.reason = p.reason; slot.ready = p.ready;
      slot.removingAt = undefined;
      slot.killedAt = undefined;
      slot.matched = this.filter(p);
      slot.baseColor = this.colorFor(p);
    }

    this.writeRenderColor(slot);
    this.mesh.count = Math.max(this.mesh.count, slot.index + 1);
    (this.mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  /** Called by main.ts when the filter changes. */
  setFilter(filter: Filter, hasFilter: boolean, podsByUid: Map<string, PodView>) {
    this.filter = filter;
    this.filterActive = hasFilter;
    for (const slot of this.slots.values()) {
      const p = podsByUid.get(slot.uid);
      if (!p) continue;
      slot.matched = filter(p);
      this.writeRenderColor(slot);
    }
    (this.mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  setFocused(uid: string | null) {
    if (this.focusedUid === uid) return;
    const prev = this.focusedUid;
    this.focusedUid = uid;
    if (prev) {
      const s = this.slots.get(prev);
      if (s) this.writeRenderColor(s);
    }
    if (uid) {
      const s = this.slots.get(uid);
      if (s) {
        // Fully stop the focused whale so the user can read details.
        s.vel.set(0, 0, 0);
        this.writeRenderColor(s);
      }
    }
    (this.mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  countMatched(): number {
    let n = 0;
    for (const s of this.slots.values()) if (s.matched) n++;
    return n;
  }

  /** Find first match for cinematic dolly on Enter. */
  firstMatchUid(): string | null {
    let bestUid: string | null = null;
    let bestDist = Infinity;
    const camPos = this.camera.position;
    for (const s of this.slots.values()) {
      if (!s.matched) continue;
      const d = s.pos.distanceToSquared(camPos);
      if (d < bestDist) { bestDist = d; bestUid = s.uid; }
    }
    return bestUid;
  }

  removePod(uid: string) {
    const slot = this.slots.get(uid);
    if (!slot) return;
    // A missile kill already runs its own (faster) death pop.
    if (slot.killedAt !== undefined) return;
    slot.removingAt = performance.now() / 1000;
  }

  private addToBubble(ns: string, uid: string) {
    let s = this.bubbleMembers.get(ns);
    if (!s) { s = new Set(); this.bubbleMembers.set(ns, s); }
    s.add(uid);
  }
  private removeFromBubble(ns: string, uid: string) {
    this.bubbleMembers.get(ns)?.delete(uid);
  }

  private relayoutBubbleMembers(ns: string, previous: NamespaceLayout, next: NamespaceLayout) {
    const members = this.bubbleMembers.get(ns);
    if (!members || members.size === 0) return;

    const centerDelta = next.center.clone().sub(previous.center);
    const scale = previous.radius > 0 ? next.radius / previous.radius : 1;
    const radiusChanged = Math.abs(scale - 1) > 0.01;
    const centerChanged = centerDelta.lengthSq() > 0.0001;
    if (!radiusChanged && !centerChanged) return;

    for (const uid of members) {
      const slot = this.slots.get(uid);
      if (!slot) continue;
      slot.pos.sub(previous.center).multiplyScalar(scale).add(next.center);
      slot.vel.multiplyScalar(Math.min(1.15, Math.max(0.85, scale)));
    }
  }

  private allocIndex(): number {
    if (this.freeIndices.length > 0) return this.freeIndices.pop()!;
    if (this.nextIndex >= MAX_INSTANCES) return -1;
    return this.nextIndex++;
  }

  private pixelRatioForLoad(): number {
    const dpr = window.devicePixelRatio || 1;
    if (this.slots.size >= 2500 || this.fpsAvg < 28) return Math.min(1, dpr);
    if (this.slots.size >= 1200 || this.fpsAvg < 42) return Math.min(1.25, dpr);
    return Math.min(1.5, dpr);
  }

  private updateRendererQuality(now: number) {
    if (now < this.nextQualityCheckAt) return;
    this.nextQualityCheckAt = now + 1;
    const next = this.pixelRatioForLoad();
    if (Math.abs(next - this.pixelRatio) < 0.01) return;
    this.pixelRatio = next;
    this.renderer.setPixelRatio(next);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  private scaleFor(p: PodView): number {
    // Exaggerated log curve so resource differences read at a glance:
    // 10m/8Mi ≈ 0.6, 100m/128Mi ≈ 1.5, 500m/1Gi ≈ 2.5, 2c/4Gi ≈ 3.3.
    const total = Math.max(1, p.cpuMillis + p.memMib);
    const v = Math.max(0.1, Math.log10(total + 10) - 1);
    const s = Math.pow(v, 1.35);
    return THREE.MathUtils.clamp(0.35 + s * 0.75, 0.5, 3.6);
  }

  private colorFor(p: PodView): THREE.Color {
    const r = p.reason;
    if (r === 'CrashLoopBackOff' || r === 'Error' || r === 'ImagePullBackOff' || r === 'ErrImagePull') return COLORS.crash;
    switch (p.phase) {
      case 'Running': return p.ready ? COLORS.running : COLORS.pending;
      case 'Pending': return COLORS.pending;
      case 'Succeeded': return COLORS.succeed;
      case 'Failed': case 'CrashLoopBackOff': return COLORS.crash;
      default: return COLORS.unknown;
    }
  }

  private writeColor(index: number, c: THREE.Color) {
    const attr = this.mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
    const arr = attr.array as Float32Array;
    arr[index * 3 + 0] = c.r;
    arr[index * 3 + 1] = c.g;
    arr[index * 3 + 2] = c.b;
    attr.needsUpdate = true;
  }

  /**
   * Compose the render color from baseColor + filter dim + focused brighten.
   * Sentinel (-1, -1, -1) keeps "hidden" semantics for freed slots.
   */
  private writeRenderColor(slot: InstanceSlot) {
    const c = slot.baseColor;
    let r = c.r, g = c.g, b = c.b;

    if (this.filterActive) {
      if (slot.matched) {
        // boost a bit so matches stand out
        r = Math.min(1, r * 1.15 + 0.04);
        g = Math.min(1, g * 1.15 + 0.04);
        b = Math.min(1, b * 1.15 + 0.04);
      } else {
        // dim toward background blue
        r = r * 0.18 + 0.02;
        g = g * 0.18 + 0.04;
        b = b * 0.18 + 0.08;
      }
    }
    if (slot.uid === this.focusedUid) {
      // Saturate / pulse-in a bright outline color
      r = Math.min(1, r * 1.2 + 0.15);
      g = Math.min(1, g * 1.2 + 0.18);
      b = Math.min(1, b * 1.2 + 0.22);
    }
    if (slot.hitFlashUntil && performance.now() / 1000 < slot.hitFlashUntil) {
      r = 1;
      g = 0.9;
      b = 0.25;
    }

    const attr = this.mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
    const arr = attr.array as Float32Array;
    arr[slot.index * 3 + 0] = r;
    arr[slot.index * 3 + 1] = g;
    arr[slot.index * 3 + 2] = b;
  }

  private freeSlot(slot: InstanceSlot) {
    this.writeColor(slot.index, COLORS.hidden);
    this.dummyMatrix.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(slot.index, this.dummyMatrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.freeIndices.push(slot.index);
    this.removeFromBubble(slot.namespace, slot.uid);
    this.slots.delete(slot.uid);
  }

  /**
   * Project visible-ish whales to screen space and stash them for the labels layer.
   * Capped to LIMIT to keep the per-frame work bounded — the labels layer further
   * trims to top-N nearest / matched.
   */
  private computeLabelTargets() {
    const LIMIT = 80;
    const targets = this.labelTargets;
    targets.length = 0;
    const w = window.innerWidth, h = window.innerHeight;
    const camPos = this.camera.position;
    // Iterate slots; quick distance filter, then NDC project.
    let pushed = 0;
    for (const slot of this.slots.values()) {
      if (slot.removingAt !== undefined) continue;
      // Skip very-far whales unless they are matched/focused.
      const dx = slot.pos.x - camPos.x;
      const dy = slot.pos.y - camPos.y;
      const dz = slot.pos.z - camPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const isStar = slot.uid === this.focusedUid || (this.filterActive && slot.matched);
      if (!isStar && distSq > 60 * 60) continue;

      this.projVec.copy(slot.pos);
      this.projVec.project(this.camera);
      if (this.projVec.z > 1 || this.projVec.z < -1) continue;
      const sx = (this.projVec.x * 0.5 + 0.5) * w;
      const sy = (-this.projVec.y * 0.5 + 0.5) * h;
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(distSq)) continue;
      if (sx < -100 || sx > w + 100 || sy < -100 || sy > h + 100) continue;

      targets.push({
        uid: slot.uid,
        name: slot.name,
        namespace: slot.namespace,
        ...statusForSlot(slot),
        screen: { x: sx, y: sy, depth: distSq, offsetY: slot.baseScale * 18 + 14 },
        matched: this.filterActive ? slot.matched : false,
        focused: slot.uid === this.focusedUid,
      });
      if (++pushed >= LIMIT) break;
    }
  }

  /** Read-only access to the latest labels for rendering by the LabelLayer. */
  getLabelTargets(): readonly LabelTarget[] { return this.labelTargets; }

  focusOnPod(uid: string) {
    const slot = this.slots.get(uid);
    if (!slot) return;
    const target = slot.pos.clone();
    const offset = new THREE.Vector3(0, 1.6, 5.5);
    const from = target.clone().add(offset);
    this.hybrid.focusOn(target, from);
  }

  private onCanvasClick(e: MouseEvent) {
    const divePick = this.hybrid.mode === 'dive';
    if (divePick && this.attackMode) {
      return;
    }
    if (divePick) {
      this.pointer.copy(this.aimPoint);
    } else {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);

    let bestUid: string | null = null;
    let bestT = Infinity;
    const ray = this.raycaster.ray;
    const tmp = new THREE.Vector3();
    for (const slot of this.slots.values()) {
      const r = slot.baseScale * (divePick ? 3.2 : 1.4);
      tmp.copy(slot.pos).sub(ray.origin);
      const proj = tmp.dot(ray.direction);
      if (proj < 0) continue;
      const distSq = tmp.lengthSq() - proj * proj;
      if (distSq <= r * r && proj < bestT) {
        bestT = proj;
        bestUid = slot.uid;
      }
    }
    if (!bestUid && divePick) bestUid = this.closestToCrosshairUid(96);
    if (bestUid) {
      this.focusOnPod(bestUid);
      this.onSelect?.(bestUid);
    }
  }

  private closestToCrosshairUid(maxPixels: number): string | null {
    let bestUid: string | null = null;
    let bestScore = Infinity;
    const cx = (this.aimPoint.x * 0.5 + 0.5) * window.innerWidth;
    const cy = (-this.aimPoint.y * 0.5 + 0.5) * window.innerHeight;
    for (const slot of this.slots.values()) {
      if (slot.removingAt !== undefined) continue;
      this.projVec.copy(slot.pos);
      this.projVec.project(this.camera);
      if (this.projVec.z > 1 || this.projVec.z < -1) continue;

      const sx = (this.projVec.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-this.projVec.y * 0.5 + 0.5) * window.innerHeight;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      const dx = sx - cx;
      const dy = sy - cy;
      const screenDist = Math.hypot(dx, dy);
      const allowed = Math.max(maxPixels, slot.baseScale * 34);
      if (screenDist > allowed) continue;

      const score = screenDist * screenDist + slot.pos.distanceToSquared(this.camera.position) * 0.015;
      if (score < bestScore) {
        bestScore = score;
        bestUid = slot.uid;
      }
    }
    return bestUid;
  }

  private fireProjectile() {
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    this.raycaster.setFromCamera(this.aimPoint, this.camera);

    // Resolve the aimed target: pod under the crosshair, else a far point along the ray.
    const targetUid = this.aimedTargetUid();
    const target = new THREE.Vector3();
    const targetSlot = targetUid ? this.slots.get(targetUid) : undefined;
    if (targetSlot) target.copy(targetSlot.pos);
    else target.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 60);

    // Launch from the hull nose (submarine is parented to the camera, so
    // resolve its world position, then push slightly forward and below).
    this.updateDiveBasis();
    const pos = this.submarine.getWorldPosition(new THREE.Vector3())
      .addScaledVector(this.forward, 1.35)
      .addScaledVector(this.up, -0.12);

    // Fast but readable: ~0.25s close-in, up to ~0.5s at long range.
    const dist = Math.max(0.001, pos.distanceTo(target));
    const travelTime = THREE.MathUtils.clamp(dist / 90, 0.25, 0.5);
    const speed = dist / travelTime;
    const vel = target.clone().sub(pos).normalize().multiplyScalar(speed);
    this.projectiles.push({
      pos, prev: pos.clone(), vel, age: 0, ttl: travelTime + 1.0, armedAt: 0.06,
      target, targetUid, speed,
    });
    this.submarineKick = 1;
    this.spawnImpactBubbles(pos, vel.clone().normalize(), 4);
  }

  /** Pod under the crosshair, using the same tolerant pick as dive-mode clicks. */
  private aimedTargetUid(): string | null {
    const ray = this.raycaster.ray;
    const tmp = new THREE.Vector3();
    let bestUid: string | null = null;
    let bestT = Infinity;
    for (const slot of this.slots.values()) {
      if (slot.removingAt !== undefined) continue;
      const r = slot.baseScale * 3.2;
      tmp.copy(slot.pos).sub(ray.origin);
      const proj = tmp.dot(ray.direction);
      if (proj < 0) continue;
      const distSq = tmp.lengthSq() - proj * proj;
      if (distSq <= r * r && proj < bestT) {
        bestT = proj;
        bestUid = slot.uid;
      }
    }
    return bestUid ?? this.closestToCrosshairUid(96);
  }

  private updateProjectiles(dt: number) {
    let write = 0;
    const quat = new THREE.Quaternion();
    const baseForward = new THREE.Vector3(0, 0, 1);
    for (const projectile of this.projectiles) {
      projectile.age += dt;
      if (projectile.age >= projectile.ttl) continue;

      // Home in on the aimed pod so moving whales still get hit.
      if (projectile.targetUid) {
        const t = this.slots.get(projectile.targetUid);
        if (t && t.removingAt === undefined) projectile.target.copy(t.pos);
      }
      projectile.vel.copy(projectile.target).sub(projectile.pos);
      const remaining = projectile.vel.length();
      if (remaining > 0.001) projectile.vel.multiplyScalar(projectile.speed / remaining);

      projectile.prev.copy(projectile.pos);
      projectile.pos.addScaledVector(projectile.vel, dt);

      const hit = projectile.age >= projectile.armedAt ? this.projectileHitUid(projectile) : null;
      if (hit) {
        const victim = this.slots.get(hit);
        this.spawnExplosion(projectile.pos, projectile.vel.clone().normalize(), victim ? victim.baseScale : 1);
        this.flashHit(hit);
        this.killPod(hit);
        this.hybrid.impulse();
        this.onAttackHit?.(hit);
        continue;
      }
      // Reached an empty aim point: fizzle out with a small puff.
      if (remaining <= projectile.speed * dt) {
        this.spawnImpactBubbles(projectile.pos, projectile.vel.clone().normalize(), 6);
        continue;
      }
      // Cheap glowing trail: shed a short-lived bubble each frame.
      this.addParticle(
        projectile.pos.clone(),
        projectile.vel.clone().multiplyScalar(-0.03),
        0.3 + Math.random() * 0.15,
        0.26,
      );

      this.projectiles[write++] = projectile;
      quat.setFromUnitVectors(baseForward, projectile.vel.clone().normalize());
      this.dummyPos.copy(projectile.pos);
      this.dummyScale.set(0.72, 0.72, 1.9);
      this.dummyMatrix.compose(this.dummyPos, quat, this.dummyScale);
      this.projectileMesh.setMatrixAt(write - 1, this.dummyMatrix);
    }
    this.projectiles.length = write;
    this.projectileMesh.count = write;
    this.projectileMesh.instanceMatrix.needsUpdate = true;
  }

  private projectileHitUid(projectile: Projectile): string | null {
    let bestUid: string | null = null;
    let bestDist = Infinity;
    for (const slot of this.slots.values()) {
      if (slot.removingAt !== undefined) continue;
      const radius = slot.collisionRadius * 1.35 + 0.35;
      const dist = distanceToSegmentSquared(slot.pos, projectile.prev, projectile.pos);
      if (dist <= radius * radius && dist < bestDist) {
        bestDist = dist;
        bestUid = slot.uid;
      }
    }
    return bestUid;
  }

  private flashHit(uid: string) {
    const slot = this.slots.get(uid);
    if (!slot) return;
    slot.hitFlashUntil = performance.now() / 1000 + 0.45;
    this.writeRenderColor(slot);
    (this.mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  private updateSubmarine(dt: number) {
    if (this.hybrid.mode !== 'dive') {
      this.submarine.visible = false;
      this.prevCameraPos.copy(this.camera.position);
      this.updateParticles(dt);
      return;
    }

    this.submarine.visible = true;
    this.resolveSubmarineCollisions();
    this.animateSubmarine(dt);
    const now = performance.now() / 1000;
    if (now >= this.nextBubbleAt) {
      this.nextBubbleAt = now + 0.045;
      this.updateDiveBasis();
      const base = this.camera.position.clone()
        .addScaledVector(this.forward, -1.45)
        .addScaledVector(this.up, -0.45);
      for (let i = 0; i < 2; i++) {
        const jitter = this.right.clone().multiplyScalar((Math.random() - 0.5) * 0.55)
          .addScaledVector(this.up, (Math.random() - 0.5) * 0.28);
        this.addParticle(
          base.clone().add(jitter),
          this.forward.clone().multiplyScalar(-1.8 - Math.random() * 1.2).addScaledVector(this.up, 0.8 + Math.random() * 0.9),
          1.1 + Math.random() * 0.7,
          0.45 + Math.random() * 0.35,
        );
      }
    }
    this.updateParticles(dt);
  }

  private animateSubmarine(dt: number) {
    const now = performance.now() / 1000;
    const safeDt = Math.max(dt, 1 / 120);
    this.cameraFrameDelta.copy(this.camera.position).sub(this.prevCameraPos).multiplyScalar(1 / safeDt);
    this.prevCameraPos.copy(this.camera.position);
    this.updateDiveBasis();

    const forwardSpeed = THREE.MathUtils.clamp(this.cameraFrameDelta.dot(this.forward), -22, 22);
    const lateralSpeed = THREE.MathUtils.clamp(this.cameraFrameDelta.dot(this.right), -22, 22);
    const verticalSpeed = THREE.MathUtils.clamp(this.cameraFrameDelta.y, -18, 18);
    const aimX = this.aimPoint.x;
    const aimY = this.aimPoint.y;
    const bob = Math.sin(now * 3.1) * 0.035 + Math.sin(now * 5.7) * 0.014;
    const side = THREE.MathUtils.clamp(aimX * 0.22 + lateralSpeed * 0.012, -0.34, 0.34);
    const lift = THREE.MathUtils.clamp(-aimY * 0.08 + verticalSpeed * 0.006, -0.18, 0.18);
    const kick = this.submarineKick;

    this.dummyPos.copy(this.submarineBasePos);
    this.dummyPos.x += side;
    this.dummyPos.y += bob + lift;
    this.dummyPos.z += kick * 0.18;
    this.submarine.position.lerp(this.dummyPos, Math.min(1, dt * 7));

    const targetPitch = THREE.MathUtils.clamp(aimY * 0.14 - forwardSpeed * 0.004 + verticalSpeed * 0.012, -0.28, 0.28);
    const targetYaw = THREE.MathUtils.clamp(-aimX * 0.18 + lateralSpeed * 0.006, -0.24, 0.24);
    const targetRoll = THREE.MathUtils.clamp(-aimX * 0.24 - lateralSpeed * 0.018 + Math.sin(now * 2.4) * 0.035, -0.34, 0.34);
    this.submarine.rotation.x = THREE.MathUtils.lerp(this.submarine.rotation.x, targetPitch + kick * 0.05, Math.min(1, dt * 8));
    this.submarine.rotation.y = THREE.MathUtils.lerp(this.submarine.rotation.y, targetYaw, Math.min(1, dt * 8));
    this.submarine.rotation.z = THREE.MathUtils.lerp(this.submarine.rotation.z, targetRoll + kick * 0.12, Math.min(1, dt * 8));
    this.submarineKick = Math.max(0, this.submarineKick - dt * 5.5);
  }

  private updateDiveBasis() {
    this.camera.getWorldDirection(this.forward).normalize();
    this.right.crossVectors(this.forward, this.up);
    if (this.right.lengthSq() < 0.0001) this.right.set(1, 0, 0);
    else this.right.normalize();
  }

  private resolveSubmarineCollisions() {
    const subRadius = 1.1;
    const pos = this.camera.position;
    for (const slot of this.slots.values()) {
      if (slot.removingAt !== undefined) continue;
      this.dummyPos.copy(pos).sub(slot.pos);
      const minDist = subRadius + slot.collisionRadius * 1.1;
      const dist = this.dummyPos.length();
      if (dist > 0.001 && dist < minDist) {
        pos.addScaledVector(this.dummyPos.normalize(), minDist - dist);
      }
    }
    const worldLimit = 205;
    const fromCenter = pos.length();
    if (fromCenter > worldLimit) pos.multiplyScalar(worldLimit / fromCenter);
  }

  private spawnImpactBubbles(origin: THREE.Vector3, normal: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2.4,
        (Math.random() - 0.5) * 3,
      );
      this.addParticle(
        origin.clone(),
        normal.clone().multiplyScalar(-1.4 - Math.random() * 2.4).add(spread),
        0.7 + Math.random() * 0.8,
        0.35 + Math.random() * 0.55,
      );
    }
  }

  private addParticle(pos: THREE.Vector3, vel: THREE.Vector3, ttl: number, scale: number) {
    if (this.particles.length >= MAX_BUBBLES) this.particles.shift();
    this.particles.push({ pos, vel, age: 0, ttl, scale });
  }

  private addFragment(pos: THREE.Vector3, vel: THREE.Vector3, ttl: number, scale: number, color: THREE.Color) {
    if (this.fragments.length >= MAX_FRAGMENTS) this.fragments.shift();
    this.fragments.push({ pos, vel, age: 0, ttl, scale, color });
  }

  /**
   * Hero-moment burst at the missile impact point: fast small bubbles plus a
   * few larger glowing fragments in the missile's red/orange palette, and an
   * expanding additive flash (~200ms).
   */
  private spawnExplosion(origin: THREE.Vector3, normal: THREE.Vector3, size = 1) {
    // Scale the burst with the victim so it reads at typical firing range.
    const mul = 0.8 + size * 0.6;
    // 1. Radial bubble burst (fast, small, ~0.35-0.9s).
    for (let i = 0; i < 26; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.35, // slight upward bias, we are underwater
        Math.random() - 0.5,
      );
      if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0);
      dir.normalize().multiplyScalar((2.5 + Math.random() * 5.5) * mul);
      dir.addScaledVector(normal, -0.8 - Math.random() * 1.2);
      this.addParticle(origin.clone(), dir, 0.35 + Math.random() * 0.55, (0.35 + Math.random() * 0.55) * mul);
    }
    // 2. Glowing fragments: larger, short-lived, red -> orange -> amber.
    for (let i = 0; i < 12; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
      dir.normalize().multiplyScalar((1.8 + Math.random() * 4.2) * mul);
      const heat = Math.random();
      const color = new THREE.Color(1, 0.24 + heat * 0.5, 0.08 + heat * 0.2);
      this.addFragment(origin.clone(), dir, 0.3 + Math.random() * 0.4, (1.2 + Math.random() * 1.6) * mul, color);
    }
    // 3. Flash sphere.
    this.flashMesh.position.copy(origin);
    this.flashSize = mul;
    this.flashStart = performance.now() / 1000;
    this.flashMesh.visible = true;
  }

  /**
   * Missile kill: distinct death pop (scale up ~1.15x then shrink to 0 over
   * ~250ms) with a few bubbles, instead of the slow terminating sink.
   */
  private killPod(uid: string) {
    const slot = this.slots.get(uid);
    if (!slot || slot.killedAt !== undefined) return;
    const now = performance.now() / 1000;
    slot.killedAt = now;
    // Also mark removingAt so every "skip dying pods" check keeps working.
    slot.removingAt = now;
    for (let i = 0; i < 5; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        0.8 + Math.random() * 1.4,
        (Math.random() - 0.5) * 1.6,
      );
      this.addParticle(slot.pos.clone(), vel, 0.6 + Math.random() * 0.5, 0.3 + Math.random() * 0.4);
    }
  }

  /** Fragments + impact flash; runs every frame, pooled/instanced, no allocs. */
  private updateExplosionFx(dt: number) {
    let write = 0;
    const colorAttr = this.fragmentMesh.instanceColor!;
    const colorArr = colorAttr.array as Float32Array;
    for (const p of this.fragments) {
      p.age += dt;
      if (p.age >= p.ttl) continue;
      // Water drag + slight buoyancy so shards feel submerged.
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.4));
      p.vel.y += dt * 0.4;
      p.pos.addScaledVector(p.vel, dt);
      const life = 1 - p.age / p.ttl;
      this.fragments[write++] = p;
      this.dummyPos.copy(p.pos);
      this.dummyQuat.identity();
      this.dummyScale.setScalar(p.scale * life);
      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.fragmentMesh.setMatrixAt(write - 1, this.dummyMatrix);
      const c = p.color!;
      colorArr[(write - 1) * 3 + 0] = c.r;
      colorArr[(write - 1) * 3 + 1] = c.g * (0.4 + life * 0.6); // cool toward red as it dies
      colorArr[(write - 1) * 3 + 2] = c.b * life;
    }
    this.fragments.length = write;
    this.fragmentMesh.count = write;
    this.fragmentMesh.instanceMatrix.needsUpdate = true;
    colorAttr.needsUpdate = true;

    if (this.flashStart >= 0) {
      const t = (performance.now() / 1000 - this.flashStart) / FLASH_DURATION;
      if (t >= 1) {
        this.flashStart = -1;
        this.flashMesh.visible = false;
        this.flashMat.opacity = 0;
      } else {
        const s = (0.7 + t * 2.6) * this.flashSize;
        this.flashMesh.scale.setScalar(s);
        this.flashMat.opacity = (1 - t) * (1 - t) * 0.85;
      }
    }
  }

  private updateParticles(dt: number) {
    let write = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.ttl) continue;
      p.vel.y += dt * 0.28;
      p.pos.addScaledVector(p.vel, dt);
      const life = 1 - p.age / p.ttl;
      this.particles[write++] = p;
      this.dummyPos.copy(p.pos);
      this.dummyQuat.identity();
      this.dummyScale.setScalar(p.scale * (0.35 + life * 0.85));
      this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
      this.bubbleMesh.setMatrixAt(write - 1, this.dummyMatrix);
    }
    this.particles.length = write;
    this.bubbleMesh.count = write;
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  // ----------------------- Simulation -----------------------

  /**
   * Boids-like swimming, partitioned by namespace bubble so each pod only
   * interacts with its bubble-mates (cheap and matches visual semantics).
   *
   * Per-bubble we use a uniform 3D grid for separation queries — O(N) per pod
   * with low constant — keeps 500+ pods well under the per-frame budget.
   */
  private simulate(dt: number) {
    const now = performance.now() / 1000;
    // step cap, in case of long tab-out
    dt = Math.min(0.05, dt);

    const TURN_SMOOTH = 6;       // higher = snappier turns
    const MAX_SPEED = 1.6;       // world units / sec
    const MIN_SPEED = 0.45;
    const SEPARATION = 1.9;
    const COHESION = 0.06;
    const ALIGNMENT = 0.18;
    const WANDER = 0.5;
    const CONTAINMENT = 2.4;

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const force = new THREE.Vector3();

    const useBoids = this.slots.size <= BOIDS_INSTANCE_LIMIT && this.fpsAvg >= BOIDS_MIN_FPS;

    for (const [nsName, members] of this.bubbleMembers) {
      const layout = this.layouts.get(nsName);
      if (!layout || members.size === 0) continue;

      const radius = layout.radius;
      const center = layout.center;
      const cell = Math.max(1.4, radius / 5);
      const grid = useBoids ? new Map<number, InstanceSlot[]>() : undefined;
      const slots: InstanceSlot[] = [];
      for (const uid of members) {
        const s = this.slots.get(uid);
        if (!s || s.removingAt !== undefined) continue;
        slots.push(s);
        if (grid) {
          const key = gridKey(s.pos, center, cell);
          let bucket = grid.get(key);
          if (!bucket) { bucket = []; grid.set(key, bucket); }
          bucket.push(s);
        }
      }
      if (slots.length === 0) continue;

      for (const s of slots) {
        // Focused whale stays put — user is reading details.
        if (s.uid === this.focusedUid) continue;
        force.set(0, 0, 0);

        // 1. Wander: smoothly drifting direction from a deterministic noise.
        const t = now;
        const seed = s.wanderSeed;
        force.x += Math.sin(t * 0.7 + seed * 0.0001) * WANDER;
        force.y += Math.sin(t * 0.5 + seed * 0.0003) * WANDER * 0.5;
        force.z += Math.cos(t * 0.6 + seed * 0.0002) * WANDER;

        // 2. Containment: keep inside the bubble. Soft inward force when near edge.
        tmpA.copy(s.pos).sub(center);
        const distFromCenter = tmpA.length();
        const innerLimit = radius - Math.max(0.4, s.baseScale * 0.6);
        if (distFromCenter > innerLimit) {
          const over = (distFromCenter - innerLimit);
          tmpA.normalize().multiplyScalar(-CONTAINMENT * (1 + over));
          force.add(tmpA);
        }

        // 3. Separation / cohesion / alignment vs neighbors in same+adjacent cells.
        let sepX = 0, sepY = 0, sepZ = 0;
        let cohX = 0, cohY = 0, cohZ = 0, cohN = 0;
        let aliX = 0, aliY = 0, aliZ = 0, aliN = 0;

        if (grid) {
          const baseKey = gridKey(s.pos, center, cell);
          // Iterate 3x3x3 neighboring cells
          for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const k = baseKey + dx + dy * 73856093 + dz * 19349663;
            const bucket = grid.get(k);
            if (!bucket) continue;
            for (const o of bucket) {
              if (o === s) continue;
              tmpB.copy(s.pos).sub(o.pos);
              const distSq = tmpB.lengthSq();
              const minDist = (s.collisionRadius + o.collisionRadius) * 1.6;
              if (distSq < minDist * minDist && distSq > 0.0001) {
                // Separation: push away, stronger when closer
                const inv = 1 / Math.sqrt(distSq);
                const w = (minDist - distSq * inv) * inv * inv;
                sepX += tmpB.x * w * SEPARATION;
                sepY += tmpB.y * w * SEPARATION;
                sepZ += tmpB.z * w * SEPARATION;
              }
              const visionSq = (cell * 1.5) * (cell * 1.5);
              if (distSq < visionSq) {
                cohX += o.pos.x; cohY += o.pos.y; cohZ += o.pos.z; cohN++;
                aliX += o.vel.x; aliY += o.vel.y; aliZ += o.vel.z; aliN++;
              }
            }
          }
        }
        force.x += sepX; force.y += sepY; force.z += sepZ;
        if (cohN > 0) {
          force.x += (cohX / cohN - s.pos.x) * COHESION;
          force.y += (cohY / cohN - s.pos.y) * COHESION;
          force.z += (cohZ / cohN - s.pos.z) * COHESION;
        }
        if (aliN > 0) {
          force.x += (aliX / aliN - s.vel.x) * ALIGNMENT;
          force.y += (aliY / aliN - s.vel.y) * ALIGNMENT;
          force.z += (aliZ / aliN - s.vel.z) * ALIGNMENT;
        }

        // 4. Crashloop pods jitter erratically
        if (s.reason === 'CrashLoopBackOff') {
          force.x += (Math.random() - 0.5) * 1.6;
          force.y += (Math.random() - 0.5) * 1.6;
          force.z += (Math.random() - 0.5) * 1.6;
        }

        // Integrate velocity
        s.vel.x += force.x * dt;
        s.vel.y += force.y * dt;
        s.vel.z += force.z * dt;
        const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
        if (sp > MAX_SPEED) {
          const f = MAX_SPEED / sp;
          s.vel.x *= f; s.vel.y *= f; s.vel.z *= f;
        } else if (sp < MIN_SPEED) {
          // gently nudge to maintain lifelike motion
          if (sp > 0.0001) {
            const f = MIN_SPEED / sp;
            s.vel.x *= f; s.vel.y *= f; s.vel.z *= f;
          } else {
            s.vel.set(MIN_SPEED, 0, 0);
          }
        }

        // Integrate position
        s.pos.x += s.vel.x * dt;
        s.pos.y += s.vel.y * dt;
        s.pos.z += s.vel.z * dt;

        // Hard clamp: never escape the bubble
        tmpA.copy(s.pos).sub(center);
        const d2 = tmpA.length();
        const hardLimit = radius - 0.05;
        if (d2 > hardLimit) {
          tmpA.multiplyScalar(hardLimit / d2);
          s.pos.copy(center).add(tmpA);
          // Reflect velocity component along normal
          const nx = tmpA.x / hardLimit, ny = tmpA.y / hardLimit, nz = tmpA.z / hardLimit;
          const vn = s.vel.x * nx + s.vel.y * ny + s.vel.z * nz;
          if (vn > 0) {
            s.vel.x -= 2 * vn * nx;
            s.vel.y -= 2 * vn * ny;
            s.vel.z -= 2 * vn * nz;
            s.vel.multiplyScalar(0.6);
          }
        }

        // Smooth orientation toward velocity
        const targetYaw = Math.atan2(s.vel.x, s.vel.z);
        const targetPitch = Math.atan2(s.vel.y, Math.hypot(s.vel.x, s.vel.z));
        s.yaw = lerpAngle(s.yaw, targetYaw, Math.min(1, dt * TURN_SMOOTH));
        s.pitch = THREE.MathUtils.lerp(s.pitch, targetPitch, Math.min(1, dt * TURN_SMOOTH));
      }
    }
  }

  // ----------------------- Render -----------------------

  start() {
    const loop = () => {
      if (this.paused) {
        // Idle: don't draw or simulate. Frees the main thread for things like
        // CDP captureScreenshot which otherwise compete with rAF.
        this.statsStale = true;
        setTimeout(loop, 50);
        return;
      }
      if (this.statsStale) {
        // Coming back from pause: stats.js would average its first FPS sample
        // over the entire paused interval and report ~0 FPS. Start fresh.
        this.statsStale = false;
        this.resetStats();
      }
      this.stats.begin();
      const dt = Math.min(0.1, this.clock.getDelta());
      this.hybrid.update(dt);
      this.mat.uniforms.uTime.value += dt;

      this.updateSubmarine(dt);
      this.simulate(dt);
      this.updateProjectiles(dt);
      this.updateExplosionFx(dt);

      const now = performance.now() / 1000;
      this.updateRendererQuality(now);
      const toFree: InstanceSlot[] = [];
      let colorDirty = false;

      for (const slot of this.slots.values()) {
        if (slot.hitFlashUntil) {
          const expired = now >= slot.hitFlashUntil;
          this.writeRenderColor(slot);
          colorDirty = true;
          if (expired) slot.hitFlashUntil = undefined;
        }
        if (slot.killedAt !== undefined) {
          // Missile kill: pop up to ~1.15x, then shrink to 0 (~250ms total).
          const t = (now - slot.killedAt) / KILL_POP_DURATION;
          if (t >= 1) { toFree.push(slot); continue; }
          const s = slot.baseScale * (t < 0.35
            ? 1 + (t / 0.35) * 0.15
            : 1.15 * (1 - (t - 0.35) / 0.65));
          this.dummyPos.copy(slot.pos);
          this.dummyQuat.setFromEuler(new THREE.Euler(slot.pitch, slot.yaw - Math.PI / 2, 0, 'YXZ'));
          this.dummyScale.setScalar(Math.max(0, s));
          this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
          this.mesh.setMatrixAt(slot.index, this.dummyMatrix);
        } else if (slot.removingAt !== undefined) {
          const t = (now - slot.removingAt) / 1.5;
          if (t >= 1) { toFree.push(slot); continue; }
          const s = slot.baseScale * (1 - t);
          this.dummyPos.copy(slot.pos);
          this.dummyPos.y -= t * 1.4;
          this.dummyQuat.setFromEuler(new THREE.Euler(slot.pitch, slot.yaw, 0, 'YXZ'));
          this.dummyScale.set(s, s, s);
          this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
          this.mesh.setMatrixAt(slot.index, this.dummyMatrix);
        } else {
          this.dummyPos.copy(slot.pos);
          // The whale geometry's "forward" axis is +X. We rotate it so that
          // yaw rotates around Y, then apply pitch. Build via Euler 'YXZ':
          //   yaw  -> rotate around Y  (so +X faces direction of motion)
          //   pitch -> rotate around X  (head up/down)
          // We need to align the +X-forward whale to the velocity direction
          // (which we encoded as yaw=atan2(vx, vz) so that yaw=0 → +Z forward).
          // To make +X face +Z (yaw=0), pre-rotate by -π/2.
          this.dummyQuat.setFromEuler(new THREE.Euler(slot.pitch, slot.yaw - Math.PI / 2, 0, 'YXZ'));
          this.dummyScale.setScalar(slot.baseScale);
          this.dummyMatrix.compose(this.dummyPos, this.dummyQuat, this.dummyScale);
          this.mesh.setMatrixAt(slot.index, this.dummyMatrix);
        }
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      if (colorDirty) (this.mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute).needsUpdate = true;

      if (toFree.length) for (const s of toFree) this.freeSlot(s);

      this.computeLabelTargets();

      this.renderer.render(this.scene, this.camera);
      this.stats.end();
      const fpsNow = 1 / Math.max(0.001, dt);
      this.fpsAvg = this.fpsAvg * 0.92 + fpsNow * 0.08;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ----------------------- Helpers -----------------------

function hash(uid: string): number {
  let h = 5381;
  for (let i = 0; i < uid.length; i++) h = ((h << 5) + h) ^ uid.charCodeAt(i);
  return h >>> 0;
}

function randomDirection(seed: number): THREE.Vector3 {
  const a = (seed % 10000) / 10000 * Math.PI * 2;
  const c = ((seed >> 13) % 10000) / 10000 * 2 - 1;
  const s = Math.sqrt(1 - c * c);
  return new THREE.Vector3(Math.cos(a) * s, c * 0.4, Math.sin(a) * s).normalize();
}

function gridKey(pos: THREE.Vector3, center: THREE.Vector3, cell: number): number {
  const x = Math.floor((pos.x - center.x) / cell);
  const y = Math.floor((pos.y - center.y) / cell);
  const z = Math.floor((pos.z - center.z) / cell);
  // Spatial hash; arithmetic chosen so that adjacency offsets are simple sums.
  return x + y * 73856093 + z * 19349663;
}

function statusForSlot(slot: InstanceSlot): Pick<LabelTarget, 'status' | 'statusClass'> {
  if (slot.reason === 'CrashLoopBackOff') return { status: 'CrashLooping', statusClass: 'err' };
  if (slot.reason === 'ImagePullBackOff' || slot.reason === 'ErrImagePull') return { status: 'Image Pull', statusClass: 'err' };
  if (slot.reason === 'Error') return { status: 'Error', statusClass: 'err' };
  if (slot.phase === 'Pending') return { status: 'Pending', statusClass: 'warn' };
  if (slot.phase === 'Running' && slot.ready) return { status: 'Healthy', statusClass: 'ok' };
  if (slot.phase === 'Running') return { status: 'Not Ready', statusClass: 'warn' };
  if (slot.phase === 'Succeeded') return { status: 'Completed', statusClass: 'info' };
  if (slot.phase === 'Failed') return { status: 'Failed', statusClass: 'err' };
  return { status: slot.reason || slot.phase || 'Unknown', statusClass: 'info' };
}

function distanceToSegmentSquared(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const apz = point.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq <= 0.000001) return point.distanceToSquared(a);
  const t = THREE.MathUtils.clamp((apx * abx + apy * aby + apz * abz) / lenSq, 0, 1);
  const x = a.x + abx * t;
  const y = a.y + aby * t;
  const z = a.z + abz * t;
  const dx = point.x - x;
  const dy = point.y - y;
  const dz = point.z - z;
  return dx * dx + dy * dy + dz * dz;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function disposeGroup(g: THREE.Group) {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach(mm => mm.dispose());
      else m.material.dispose();
    }
  });
}

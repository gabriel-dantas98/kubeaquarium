import * as THREE from 'three';

export interface NamespaceLayout {
  name: string;
  center: THREE.Vector3;
  radius: number; // bubble radius
  capacityRadius: number;
  dense: boolean;
  podCount: number;
}

export interface NamespaceAllocation { center: THREE.Vector3; initialRadius: number; reservedRadius: number }
export interface NamespaceLayoutState { allocations: Map<string, NamespaceAllocation> }

const VERT_JITTER = 14;
const CHANNEL_WIDTH = 14;

/** CPU and memory have separate reference units; either can make a large whale. */
export function resourceScale(cpuMillis: number, memMib: number): number {
  const cpu = Number.isFinite(cpuMillis) ? Math.max(0, cpuMillis) / 250 : 0;
  const memory = Number.isFinite(memMib) ? Math.max(0, memMib) / 256 : 0;
  return THREE.MathUtils.clamp(0.55 + 0.85 * Math.log2(1 + Math.max(cpu, memory)), 0.55, 4.2);
}

/** Seeded organic islands; updates expand their existing bearings only when needed. */
export function layoutNamespaces(names: string[], counts: Map<string, number>, state: NamespaceLayoutState,
  volumes: Map<string, number> = new Map()): Map<string, NamespaceLayout> {
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  const current = new Map(sorted.map(name => [name, radiusForCount(counts.get(name) ?? 0, volumes.get(name))]));
  for (const name of sorted) {
    const radius = current.get(name)!;
    const existing = state.allocations.get(name);
    if (existing) existing.reservedRadius = Math.max(existing.reservedRadius, radius);
    else state.allocations.set(name, { center: findCenter(name, radius, state.allocations), initialRadius: radius, reservedRadius: radius });
  }
  const reservations = [...state.allocations.values()];
  let expansion = 1;
  for (let i = 0; i < reservations.length; i++) for (let j = i + 1; j < reservations.length; j++) {
    const a = reservations[i], b = reservations[j];
    const distance = Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z);
    expansion = Math.max(expansion, (a.reservedRadius + b.reservedRadius + CHANNEL_WIDTH) / distance);
  }
  if (expansion > 1) for (const a of reservations) { a.center.x *= expansion; a.center.z *= expansion; }
  return new Map(sorted.map(name => {
    const a = state.allocations.get(name)!;
    return [name, { name, center: a.center.clone(), radius: current.get(name)!, capacityRadius: a.reservedRadius,
      dense: false, podCount: counts.get(name) ?? 0 }];
  }));
}

function findCenter(name: string, radius: number, allocations: Map<string, NamespaceAllocation>): THREE.Vector3 {
  const seed = hash(name);
  const y = (seed % 1000) / 1000 * VERT_JITTER - VERT_JITTER / 2;
  if (allocations.size === 0) return new THREE.Vector3(0, y, 0);
  const bearing = seed / 0xffffffff * Math.PI * 2;
  const gap = CHANNEL_WIDTH + ((seed >>> 12) % 1200) / 100;
  for (let ring = radius + gap; ; ring += 4) {
    const samples = Math.ceil(2 * Math.PI * ring / 8);
    for (let i = 0; i < samples; i++) {
      const angle = bearing + i * 2.399963229728653;
      const x = Math.cos(angle) * ring, z = Math.sin(angle) * ring;
      if ([...allocations.values()].every(other => Math.hypot(x - other.center.x, z - other.center.z)
        >= radius + other.reservedRadius + gap)) return new THREE.Vector3(x, y, z);
    }
  }
}

/** Cubic resource volume preserves swimming room as pod counts or sizes grow. */
export function radiusForCount(podCount: number, resourceVolume?: number): number {
  const volume = resourceVolume ?? Math.max(1, podCount) * 1.4 ** 3;
  return 7 + 3.8 * Math.cbrt(Math.max(1, volume));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface BubbleUniforms extends Record<string, THREE.IUniform<number>> {
  uVisibility: THREE.IUniform<number>;
}

/** Builds one subtle rim-lit namespace shell. Labels are rendered in the HUD. */
export function buildBubble(layout: NamespaceLayout): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(layout.center);
  group.userData.namespace = layout.name;

  const uniforms: BubbleUniforms = { uVisibility: { value: 1 } };
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(layout.radius, 32, 24),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms,
      vertexShader: `
        varying vec3 vViewPosition;
        varying vec3 vNormal;
        void main() {
          vViewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          vNormal = normalMatrix * normal;
          gl_Position = projectionMatrix * vec4(vViewPosition, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vViewPosition;
        varying vec3 vNormal;
        uniform float uVisibility;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vViewPosition))), 3.0);
          float alpha = mix(0.012, 0.20, rim) * uVisibility;
          gl_FragColor = vec4(vec3(0.43, 0.76, 0.96), alpha);
        }
      `,
    }),
  );
  shell.userData.bubbleUniforms = uniforms;
  group.add(shell);

  return group;
}

/** Rotated, seeded cells preserve swimming room without visible axis-aligned rows. */
export function placeInBubble(layout: NamespaceLayout, uid: string, indexHint: number): THREE.Vector3 {
  const side = Math.max(1, Math.ceil(Math.cbrt(layout.podCount)));
  const index = indexHint % (side ** 3);
  // Avalanche neighboring UIDs so similar names do not share visible offsets.
  let seed = hash(uid);
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b);
  seed = (seed ^ (seed >>> 16)) >>> 0;
  const orientation = hash(layout.name);
  const rotation = new THREE.Euler(
    .4 + (orientation & 255) / 255 * 1.1,
    ((orientation >>> 8) & 255) / 255 * Math.PI * 2,
    .3 + ((orientation >>> 16) & 255) / 255 * 1.2,
  );
  const cell = layout.radius * 1.05 / side;
  const jitter = (shift: number) => (((seed >>> shift) & 255) / 255 - 0.5) * 0.4;
  return new THREE.Vector3(
    (index % side - (side - 1) / 2 + jitter(0)) * cell,
    (Math.floor(index / side) % side - (side - 1) / 2 + jitter(8)) * cell,
    (Math.floor(index / (side * side)) - (side - 1) / 2 + jitter(16)) * cell,
  ).applyEuler(rotation).add(layout.center);
}

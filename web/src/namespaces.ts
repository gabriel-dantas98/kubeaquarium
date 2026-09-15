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

const VERT_JITTER = 6;
const MAX_BUBBLE_RADIUS = 42;

/**
 * Phyllotaxis-style stable layout: each namespace gets a slot on a spiral
 * around the origin. Deterministic by name so the same cluster always
 * lays out the same way across reloads.
 */
export function layoutNamespaces(names: string[], counts: Map<string, number>, state: NamespaceLayoutState): Map<string, NamespaceLayout> {
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  const out = new Map<string, NamespaceLayout>();
  const current = new Map(sorted.map(name => [name, radiusForCount(counts.get(name) ?? 1)]));
  for (const name of sorted) {
    if (state.allocations.has(name)) continue;
    const initialRadius = current.get(name)!;
    const center = findCenter(name, initialRadius, state.allocations);
    state.allocations.set(name, { center, initialRadius, reservedRadius: initialRadius });
  }
  // Capacity is derived from one immutable reservation snapshot.
  const reservations = [...state.allocations.entries()].map(([name, a]) => [name, { ...a, center: a.center.clone() }] as const);
  for (const name of sorted) {
    const allocation = state.allocations.get(name)!;
    let capacityRadius = MAX_BUBBLE_RADIUS;
    for (const [otherName, other] of reservations) {
      if (otherName === name) continue;
      const distance = Math.hypot(allocation.center.x - other.center.x, allocation.center.z - other.center.z);
      const slack = distance - allocation.reservedRadius - other.reservedRadius - 4;
      capacityRadius = Math.min(capacityRadius, allocation.reservedRadius + Math.max(0, slack) / 2);
    }
    const wanted = current.get(name)!;
    const radius = Math.min(wanted, capacityRadius);
    allocation.reservedRadius = Math.max(allocation.reservedRadius, radius);
    out.set(name, { name, center: allocation.center.clone(), radius, capacityRadius, dense: wanted > capacityRadius, podCount: counts.get(name) ?? 0 });
  }
  return out;
}

function findCenter(name: string, radius: number, allocations: Map<string, NamespaceAllocation>): THREE.Vector3 {
  const y = (hash(name) % 1000) / 1000 * VERT_JITTER - VERT_JITTER / 2;
  if (allocations.size === 0) return new THREE.Vector3(0, y, 0);
  for (let ring = 2; ; ring += 2) {
    const samples = Math.ceil(2 * Math.PI * ring / 2);
    for (let i = 0; i < samples; i++) {
      const angle = i * Math.PI * 2 / samples;
      const x = Math.cos(angle) * ring, z = Math.sin(angle) * ring;
      const valid = [...allocations.values()].every(other => {
        const distance = Math.hypot(x - other.center.x, z - other.center.z);
        return distance >= Math.max(radius + other.initialRadius + 16, radius + other.reservedRadius + 10);
      });
      if (valid) return new THREE.Vector3(x, y, z);
    }
  }
}

export function radiusForCount(podCount: number): number {
  const size = Math.max(1, podCount);
  return THREE.MathUtils.clamp(4 + Math.cbrt(size) * 2.65, 5, MAX_BUBBLE_RADIUS);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface BubbleUniforms { uVisibility: { value: number } }

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

/**
 * Deterministic position inside a bubble for a given pod uid.
 * Spreads pods using golden-angle on a spherical shell scaled by bubble radius.
 */
export function placeInBubble(layout: NamespaceLayout, uid: string, indexHint: number): THREE.Vector3 {
  const seed = (hash(uid) + indexHint) >>> 0;
  // Convert seed to two angles
  const phi = (seed % 10000) / 10000 * Math.PI * 2;
  // Unsigned shift: seeds >= 2^31 with `>>` go negative, pushing cosTheta
  // outside [-1,1] and turning sinTheta into NaN (invisible whales).
  const cosTheta = ((seed >>> 13) % 10000) / 10000 * 2 - 1;
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  // Random radius factor ∈ [0.35, 0.85]
  const rf = 0.35 + ((seed >>> 7) % 1000) / 1000 * 0.5;
  const r = layout.radius * rf;
  return new THREE.Vector3(
    layout.center.x + r * sinTheta * Math.cos(phi),
    layout.center.y + r * cosTheta,
    layout.center.z + r * sinTheta * Math.sin(phi),
  );
}

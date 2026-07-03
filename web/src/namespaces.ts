import * as THREE from 'three';

export interface NamespaceLayout {
  name: string;
  center: THREE.Vector3;
  radius: number; // bubble radius
}

const MIN_NAMESPACE_GAP = 18;
const VERT_JITTER = 6;
const MAX_BUBBLE_RADIUS = 42;

/**
 * Phyllotaxis-style stable layout: each namespace gets a slot on a spiral
 * around the origin. Deterministic by name so the same cluster always
 * lays out the same way across reloads.
 */
export function layoutNamespaces(names: string[], counts: Map<string, number>): Map<string, NamespaceLayout> {
  const sorted = [...names].sort((a, b) => {
    const bySize = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    return bySize || a.localeCompare(b);
  });
  const out = new Map<string, NamespaceLayout>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  const radii = new Map(sorted.map(name => [name, radiusForCount(counts.get(name) ?? 1)]));
  const avgRadius = sorted.reduce((sum, name) => sum + radii.get(name)!, 0) / Math.max(1, sorted.length);
  const ringStep = Math.max(MIN_NAMESPACE_GAP, avgRadius * 2.25);

  for (let i = 0; i < sorted.length; i++) {
    const name = sorted[i];
    const angle = i * golden;
    const radial = i === 0 ? 0 : ringStep * Math.sqrt(i);
    const x = Math.cos(angle) * radial;
    const z = Math.sin(angle) * radial;
    // Vertical jitter from a hash of name for variety
    const y = (hash(name) % 1000) / 1000 * VERT_JITTER - VERT_JITTER / 2;
    const radius = radii.get(name)!;
    out.set(name, { name, center: new THREE.Vector3(x, y, z), radius });
  }
  return out;
}

function radiusForCount(podCount: number): number {
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

/**
 * Builds the visual mesh for a namespace bubble: translucent sphere + label sprite.
 */
export function buildBubble(layout: NamespaceLayout): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(layout.center);
  group.userData.namespace = layout.name;

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(layout.radius, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0x6ec3f4,
      transparent: true,
      opacity: 0.07,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  group.add(sphere);

  // Outer ring/edge
  const edge = new THREE.Mesh(
    new THREE.SphereGeometry(layout.radius, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0x6ec3f4,
      transparent: true,
      opacity: 0.16,
      wireframe: true,
      depthWrite: false,
    })
  );
  group.add(edge);

  // Label
  const label = makeLabelSprite(layout.name);
  label.position.set(0, layout.radius + 1.2, 0);
  group.add(label);

  return group;
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const ctx = canvas.getContext('2d')!;
  const fontPx = 64;
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const padX = 24, padY = 14;
  canvas.width = (metrics.width + padX * 2) * dpr;
  canvas.height = (fontPx + padY * 2) * dpr;
  ctx.scale(dpr, dpr);
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(7, 22, 40, 0.7)';
  roundRect(ctx, 0, 0, metrics.width + padX * 2, fontPx + padY * 2, 14);
  ctx.fill();
  ctx.fillStyle = '#cfe9ff';
  ctx.textBaseline = 'top';
  ctx.fillText(text, padX, padY);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const aspect = canvas.width / canvas.height;
  const h = 1.6;
  sprite.scale.set(h * aspect, h, 1);
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

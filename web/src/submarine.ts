import * as THREE from 'three';

// Docker-blue palette shared with the rest of the aquarium.
const HULL_BLUE = 0x1d63ed;
const HULL_DEEP = 0x123f8f;
const ACCENT_LIGHT = 0x5b9bff;
const TRIM_DARK = 0x0b1f3f;
const GLOW_CYAN = 0x8fe8ff;

export const SUBMARINE_MODELS = [
  { id: 'nautilus', name: 'Nautilus', description: 'Classic exploration hull', color: '#5b9bff' },
  { id: 'manta', name: 'Manta', description: 'Swept wings · cyan canopy', color: '#63edcf' },
  { id: 'atlas', name: 'Atlas', description: 'Twin pods · industrial frame', color: '#ffbc69' },
] as const;
export type SubmarineModelId = typeof SUBMARINE_MODELS[number]['id'];
export function isSubmarineModel(value: unknown): value is SubmarineModelId {
  return SUBMARINE_MODELS.some(model => model.id === value);
}

export function buildSubmarineCockpit(model: SubmarineModelId = 'nautilus'): THREE.Group {
  const root = new THREE.Group();
  root.name = 'submarine-cockpit';
  root.position.set(0, -0.94, -2.7);
  root.scale.setScalar(0.62);
  setSubmarineModel(root, model);
  return root;
}

/** Replace only the hull; camera pose, recoil and navigation remain intact. */
export function setSubmarineModel(root: THREE.Group, model: SubmarineModelId): void {
  if (root.userData.model === model) return;
  const geometry = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometry.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  root.clear();
  geometry.forEach(item => item.dispose());
  materials.forEach(item => item.dispose());
  const hull = model === 'manta' ? buildManta() : model === 'atlas' ? buildAtlas() : buildNautilus();
  hull.name = model;
  // A short-range deck light travels with the vessel so its silhouette remains
  // readable when the player turns away from the aquarium's world lighting.
  const deckLight = new THREE.PointLight(0xc9e8ff, 5, 5, 2);
  deckLight.position.set(-1.2, 2.5, 1.5);
  hull.add(deckLight);
  hull.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.MeshStandardMaterial;
    if (material instanceof THREE.MeshStandardMaterial && material.emissive.getHex() === 0) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = .18;
    }
  });
  root.add(hull);
  root.userData.model = model;
}

// Low-poly navy submarine, nose pointing -Z (camera forward), level.
function buildNautilus(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'nautilus';

  const hullMat = new THREE.MeshStandardMaterial({
    color: HULL_DEEP,
    roughness: 0.48,
    metalness: 0.22,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: HULL_BLUE,
    roughness: 0.42,
    metalness: 0.25,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: ACCENT_LIGHT,
    roughness: 0.45,
    metalness: 0.2,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: TRIM_DARK,
    roughness: 0.5,
    metalness: 0.3,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: GLOW_CYAN,
    emissive: 0x4fc3e8,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0,
  });

  // Main hull: elongated capsule along Z, slightly flattened.
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.55, 10, 20), hullMat);
  hull.rotation.x = Math.PI / 2; // capsule axis Y -> Z
  hull.scale.set(1, 0.88, 1);
  root.add(hull);

  // Deck strip along the top for a two-tone hull.
  const deck = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.3, 8, 16), accentMat);
  deck.rotation.x = Math.PI / 2;
  deck.position.y = 0.12;
  deck.scale.set(1, 0.55, 1);
  root.add(deck);

  // Sail (conning tower): streamlined teardrop, forward of midship.
  const sail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.38, 16), accentMat);
  sail.position.set(0, 0.42, -0.28);
  sail.scale.set(1, 1, 2.1);
  root.add(sail);

  const sailCap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), accentMat);
  sailCap.position.set(0, 0.61, -0.28);
  sailCap.scale.set(1, 0.45, 2.1);
  root.add(sailCap);

  // Sail dive planes.
  const sailPlanes = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.18), finMat);
  sailPlanes.position.set(0, 0.46, -0.3);
  root.add(sailPlanes);

  // Stern fins: horizontal + vertical cross.
  const finH = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.045, 0.26), finMat);
  finH.position.set(0, 0, 0.92);
  root.add(finH);

  const finV = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.68, 0.26), finMat);
  finV.position.set(0, 0, 0.92);
  root.add(finV);

  // Tail cone + propeller hub.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 12), trimMat);
  tail.rotation.x = -Math.PI / 2; // point +Z (aft)
  tail.position.set(0, 0, 1.12);
  root.add(tail);

  // Glowing bow viewport.
  const viewport = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), glowMat);
  viewport.position.set(0, 0.04, -1.02);
  viewport.scale.set(1, 0.8, 0.6);
  root.add(viewport);

  // Small porthole dots along each flank.
  const portholeGeo = new THREE.SphereGeometry(0.028, 8, 6);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const porthole = new THREE.Mesh(portholeGeo, glowMat);
      porthole.position.set(side * 0.285, 0.05, -0.55 + i * 0.42);
      root.add(porthole);
    }
  }

  // Navigation lights on the bow.
  const lightGeo = new THREE.SphereGeometry(0.032, 8, 6);
  const navLightMat = new THREE.MeshBasicMaterial({ color: GLOW_CYAN });
  for (const side of [-1, 1]) {
    const navLight = new THREE.Mesh(lightGeo, navLightMat);
    navLight.position.set(side * 0.16, -0.06, -0.98);
    root.add(navLight);
  }

  return root;
}

function surface(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({color, roughness: .38, metalness: .4, emissive, emissiveIntensity: emissive ? 1.5 : 0});
}

function part(root: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
  position: [number, number, number], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.scale.set(...scale); root.add(mesh); return mesh;
}

function buildManta(): THREE.Group {
  const root = new THREE.Group();
  const hull = surface(0x167c79), edge = surface(0x63edcf), dark = surface(0x102f40);
  const glow = surface(0xaffff4, 0x35bfaa);
  part(root, new THREE.SphereGeometry(.4, 24, 16), hull, [0, 0, -.18], [1, .56, 2.5]);
  part(root, new THREE.SphereGeometry(.25, 20, 12), glow, [0, .18, -.48], [.82, .5, 1.5]);
  const outline = new THREE.Shape();
  outline.moveTo(-.24, -.7); outline.lineTo(-1.12, .6); outline.lineTo(-.3, .4);
  outline.lineTo(0, .72); outline.lineTo(.3, .4); outline.lineTo(1.12, .6); outline.lineTo(.24, -.7); outline.closePath();
  const wing = part(root, new THREE.ExtrudeGeometry(outline, {depth: .065, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1}), hull, [0, 0, 0]);
  wing.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const engine = part(root, new THREE.CapsuleGeometry(.115, .65, 6, 12), dark, [side * .6, -.01, .3]);
    engine.rotation.x = Math.PI / 2;
    part(root, new THREE.TorusGeometry(.083, .025, 8, 16), glow, [side * .6, -.01, .76]);
    part(root, new THREE.BoxGeometry(.05, .035, .62), edge, [side * .34, .12, .02]);
  }
  return root;
}

function buildAtlas(): THREE.Group {
  const root = new THREE.Group();
  const hull = surface(0xdf7d28), trim = surface(0x243447), accent = surface(0xffd18c);
  const glow = surface(0xb8edff, 0x45b4ec);
  part(root, new THREE.BoxGeometry(.64, .36, .95), trim, [0, .02, 0]);
  part(root, new THREE.SphereGeometry(.28, 16, 12), glow, [0, .2, -.22], [1, .8, 1.35]);
  part(root, new THREE.BoxGeometry(1.42, .09, .18), accent, [0, .12, .45]);
  for (const side of [-1, 1]) {
    const pod = part(root, new THREE.CapsuleGeometry(.25, 1.38, 8, 16), hull, [side * .53, -.05, 0]);
    pod.rotation.x = Math.PI / 2;
    for (const z of [-.48, .43]) {
      part(root, new THREE.TorusGeometry(.253, .034, 8, 16), trim, [side * .53, -.05, z]);
    }
    part(root, new THREE.SphereGeometry(.12, 12, 8), glow, [side * .53, -.05, -.94], [1, 1, .3]);
    part(root, new THREE.TorusGeometry(.16, .05, 8, 16), accent, [side * .53, -.05, .95]);
    part(root, new THREE.BoxGeometry(.055, .44, .27), accent, [side * .53, .17, .65]);
  }
  return root;
}

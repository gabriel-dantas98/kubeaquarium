import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Docker-blue palette shared with the rest of the aquarium.
const HULL_BLUE = 0x1d63ed;
const HULL_DEEP = 0x123f8f;
const ACCENT_LIGHT = 0x5b9bff;
const TRIM_DARK = 0x0b1f3f;
const GLOW_CYAN = 0x8fe8ff;

export function buildSubmarineCockpit(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'submarine-cockpit';
  root.position.set(0, -0.94, -2.7);
  root.scale.setScalar(0.62);
  root.add(buildFallbackSubmarine());

  const assetUrl = `${import.meta.env.BASE_URL}models/missile-submarine.glb`;
  new GLTFLoader().load(assetUrl, (gltf) => {
    root.clear();
    const model = normalizeModel(gltf.scene, 2.35);
    model.name = 'missile-submarine-model';
    // The GLB's hull runs along Z with the bow at -Z and the tail rudder at
    // +Z, which already matches the camera's forward axis (-Z). Keep it level.
    model.rotation.set(0, 0, 0);
    model.position.set(0, -0.02, -0.05);
    tintModel(model);
    root.add(model);
  }, undefined, (err) => {
    console.warn('[kubeaquarium] failed to load submarine model', err);
  });

  return root;
}

// Low-poly navy submarine, nose pointing -Z (camera forward), level.
function buildFallbackSubmarine(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'fallback-submarine';

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

function normalizeModel(model: THREE.Object3D, targetSize: number): THREE.Group {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  model.position.sub(center);

  const holder = new THREE.Group();
  holder.scale.setScalar(targetSize / maxAxis);
  holder.add(model);
  return holder;
}

// Shift the GLB's flat dark-teal material toward the aquarium's Docker-blue
// palette so the sub matches the whales and reads well against the dark scene.
function tintModel(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (!mesh.material) {
      mesh.material = new THREE.MeshStandardMaterial({ color: HULL_BLUE, roughness: 0.5, metalness: 0.2 });
      return;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      const standard = mat as THREE.MeshStandardMaterial;
      if ('color' in standard) standard.color.lerp(new THREE.Color(HULL_BLUE), 0.55);
      if ('roughness' in standard) standard.roughness = Math.max(0.45, standard.roughness ?? 0.5);
      if ('metalness' in standard) standard.metalness = Math.min(0.28, Math.max(0.15, standard.metalness ?? 0.15));
      if ('emissive' in standard && standard.emissive) {
        standard.emissive.set(0x0a2a5c);
        standard.emissiveIntensity = 0.35;
      }
    }
  });
}

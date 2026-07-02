import * as THREE from 'three';

export function buildSubmarineCockpit(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'submarine-cockpit';
  root.position.set(0, -1.08, -2.7);
  root.scale.setScalar(0.46);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.55,
    metalness: 0.18,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.45,
    metalness: 0.35,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x6ec3f4,
    emissive: 0x123a52,
    transparent: true,
    opacity: 0.62,
    roughness: 0.12,
    metalness: 0.05,
  });

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.18, 8, 18), bodyMat);
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1.28, 0.82, 0.82);
  root.add(hull);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.31, 18, 10), glassMat);
  nose.position.z = -0.66;
  nose.scale.set(0.9, 0.72, 0.72);
  root.add(nose);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.36, 12), bodyMat);
  tower.position.set(0, 0.32, 0.08);
  tower.rotation.x = Math.PI / 2;
  root.add(tower);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.24), trimMat);
  fin.position.set(0, 0.08, 0.68);
  root.add(fin);

  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.08), trimMat);
  leftRail.position.set(-0.42, -0.03, 0.04);
  root.add(leftRail);

  const rightRail = leftRail.clone();
  rightRail.position.x = 0.42;
  root.add(rightRail);

  const lightMat = new THREE.MeshBasicMaterial({ color: 0x9ae6ff });
  const leftLight = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), lightMat);
  leftLight.position.set(-0.18, 0.03, -0.83);
  root.add(leftLight);

  const rightLight = leftLight.clone();
  rightLight.position.x = 0.18;
  root.add(rightLight);

  return root;
}

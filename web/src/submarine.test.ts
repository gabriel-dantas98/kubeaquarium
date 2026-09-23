import * as THREE from 'three';
import { buildSubmarineCockpit, isSubmarineModel, setSubmarineModel, SUBMARINE_MODELS } from './submarine';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export function runSubmarineTests(): void {
  assert(!isSubmarineModel('obsolete') && !isSubmarineModel(null), 'Reject invalid stored models');
  const root = buildSubmarineCockpit();
  root.position.set(2, 3, 4);
  root.rotation.set(.1, .2, .3);
  const position = root.position.clone(), rotation = root.rotation.clone();
  const previous = root.children[0];
  setSubmarineModel(root, 'nautilus');
  assert(root.children[0] === previous, 'Repeated selection must not rebuild geometry');
  let disposed = 0;
  previous.traverse(object => {
    if (object instanceof THREE.Mesh) object.geometry.addEventListener('dispose', () => disposed++);
  });
  setSubmarineModel(root, 'manta');
  assert(disposed > 0, 'Replacing hull must release old GPU geometry');
  const widths: number[] = [];
  for (const model of SUBMARINE_MODELS) {
    assert(isSubmarineModel(model.id), 'Every published model is accepted');
    setSubmarineModel(root, model.id);
    assert(root.children.length === 1 && root.children[0].name === model.id, 'Only selected hull remains');
    assert(root.userData.model === model.id, 'Model is exposed to scene debug');
    assert(root.position.equals(position) && root.rotation.equals(rotation), 'Selection preserves flight pose');
    const size = new THREE.Box3().setFromObject(root.children[0]).getSize(new THREE.Vector3());
    assert(size.z > 1 && size.x > .5 && size.y > .1, 'All vessels have visible bounded geometry');
    widths.push(size.x);
  }
  assert(widths[1] > widths[2] && widths[2] > widths[0], 'Vessels have three distinguishable silhouettes');
}

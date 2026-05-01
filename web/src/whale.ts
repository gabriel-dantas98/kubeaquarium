import * as THREE from 'three';

/**
 * Build a low-poly Docker-whale-inspired geometry.
 * The geometry is intentionally low-vertex so that thousands of
 * InstancedMesh copies stay buttery on a laptop GPU.
 *
 * Coordinate system: whale "swims" along +X.
 */
export function buildWhaleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Body: a stretched, slightly squashed sphere
  const body = new THREE.SphereGeometry(0.5, 14, 10);
  body.scale(1.6, 0.85, 0.95); // long, slightly flat
  parts.push(body);

  // Tail fluke: a flat triangular prism behind the body
  const tail = new THREE.ConeGeometry(0.32, 0.5, 4);
  tail.rotateZ(Math.PI / 2); // cone points along +X
  tail.scale(0.9, 0.18, 0.55);
  tail.translate(-0.95, 0, 0);
  parts.push(tail);

  // Top fin
  const fin = new THREE.ConeGeometry(0.18, 0.35, 4);
  fin.scale(1, 1, 0.4);
  fin.translate(0.05, 0.45, 0);
  parts.push(fin);

  // Stylized "containers" stack on the back (Docker logo nod)
  const cw = 0.18, ch = 0.14, cd = 0.32;
  const containerPositions: [number, number, number][] = [
    [-0.20, 0.55, 0],
    [ 0.05, 0.55, 0],
    [ 0.30, 0.55, 0],
    [-0.075, 0.70, 0],
    [ 0.175, 0.70, 0],
    [ 0.05, 0.85, 0],
  ];
  for (const [x, y, z] of containerPositions) {
    const c = new THREE.BoxGeometry(cw, ch, cd);
    c.translate(x, y, z);
    parts.push(c);
  }

  // Eye (small dark dot via vertex color baked-in is overkill; skip for perf)

  const merged = mergeBufferGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Lightweight merger that avoids pulling BufferGeometryUtils.
 * Assumes all inputs are non-indexed BufferGeometries with position+normal.
 */
function mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Convert each to non-indexed first
  const nonIndexed = geos.map(g => g.index ? g.toNonIndexed() : g);
  let totalVerts = 0;
  for (const g of nonIndexed) {
    const pos = g.getAttribute('position');
    totalVerts += pos.count;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of nonIndexed) {
    g.computeVertexNormals();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, offset * 3);
    normals.set(nor.array as Float32Array, offset * 3);
    offset += pos.count;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geom;
}

/**
 * Custom shader material with idle tail-wave animation done in the vertex shader.
 * Per-instance color is provided via instanceColor.
 */
export function buildWhaleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLight: { value: new THREE.Vector3(0.3, 1.0, 0.5).normalize() },
      uAmbient: { value: 0.45 },
    },
    vertexColors: false,
    transparent: true,
    vertexShader: /* glsl */ `
      attribute vec3 instanceColor;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying float vAlpha;

      uniform float uTime;

      void main() {
        vColor = instanceColor;

        // The instanceMatrix already contains per-instance scale, rotation, position.
        // We can't easily recover scale from it cheaply; just use the largest column length.
        // Approximate phase from instance matrix translation so each whale waves out of sync.
        vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float phase = instOrigin.x * 0.7 + instOrigin.z * 1.3;

        // Tail wave: stronger as x decreases (toward the tail)
        vec3 p = position;
        float tailFactor = clamp(-p.x + 0.5, 0.0, 1.6); // 0 at head, ~1.6 at tail tip
        float wave = sin(uTime * 3.0 + phase) * 0.08 * tailFactor * tailFactor;
        p.y += wave * 0.3;
        p.z += wave;

        vec4 worldPos = instanceMatrix * vec4(p, 1.0);
        vec4 mvPos = modelViewMatrix * worldPos;

        // Alpha encoded via instanceColor.r? No — use alpha channel hack: when r>0.999 and g==g (always true), assume opaque.
        // Simpler: pass alpha as the magnitude of instanceColor squared if needed; default 1.0.
        vAlpha = 1.0;
        if (instanceColor.r < 0.0) { vAlpha = 0.0; } // sentinel to hide

        // Normal in world-ish space (instanceMatrix is the model matrix)
        mat3 nm = mat3(instanceMatrix);
        vNormal = normalize(nm * normal);

        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying float vAlpha;
      uniform vec3 uLight;
      uniform float uAmbient;

      void main() {
        if (vAlpha <= 0.0) discard;
        float ndl = max(dot(normalize(vNormal), uLight), 0.0);
        vec3 base = vColor;
        // Subtle rim light for depth
        float rim = pow(1.0 - max(0.0, vNormal.z), 2.0) * 0.25;
        vec3 col = base * (uAmbient + ndl * 0.7) + rim * vec3(0.5, 0.8, 1.0);
        gl_FragColor = vec4(col, vAlpha);
      }
    `,
  });
}

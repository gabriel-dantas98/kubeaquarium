export interface SpatialPoint { x: number; y: number; z: number }
export interface RadarPose { position: SpatialPoint; forward: SpatialPoint }

export function projectRadar(point: SpatialPoint, pose: RadarPose, range: number) {
  const horizontal = Math.hypot(pose.forward.x, pose.forward.z);
  const fx = horizontal > 1e-6 ? pose.forward.x / horizontal : 0;
  const fz = horizontal > 1e-6 ? pose.forward.z / horizontal : -1;
  const dx = point.x - pose.position.x, dz = point.z - pose.position.z;
  let x = (dx * -fz + dz * fx) / range;
  let y = -(dx * fx + dz * fz) / range;
  const length = Math.hypot(x, y), outside = length > 1;
  if (outside) { x /= length; y /= length; }
  return { x, y, outside, altitude: point.y - pose.position.y };
}

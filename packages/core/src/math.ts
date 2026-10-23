/**
 * Matemática mínima y pura (sin dependencias) para que la evaluación sea determinista
 * y funcione igual en navegador, servidor y tests.
 *
 * Convenciones (iguales a Three.js): Y arriba, sistema de mano derecha, cuaterniones [x, y, z, w],
 * Euler en grados con orden XYZ (q = qx · qy · qz).
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export const EPSILON = 1e-9;
export const DEG = Math.PI / 180;

export const ZERO: Vec3 = [0, 0, 0];
export const IDENTITY: Quat = [0, 0, 0, 1];

// ---------------------------------------------------------------------------
// Vectores
// ---------------------------------------------------------------------------

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > EPSILON ? scale(a, 1 / len) : ZERO;
}

/** Componente de `v` perpendicular a `axis` (unitario), normalizada; `null` si es degenerada. */
export function perpendicular(v: Vec3, axis: Vec3): Vec3 | null {
  const p = sub(v, scale(axis, dot(v, axis)));
  const len = length(p);
  return len > 1e-6 ? scale(p, 1 / len) : null;
}

/** Un vector unitario cualquiera perpendicular a `a` (unitario). */
export function anyPerpendicular(a: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(a, helper));
}

export const clamp = (x: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, x));

export const lerpNumber = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Cuaterniones
// ---------------------------------------------------------------------------

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Inverso de un cuaternión unitario. */
export const quatInvert = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  return len > EPSILON ? [q[0] / len, q[1] / len, q[2] / len, q[3] / len] : IDENTITY;
}

/** Rotación de `angle` radianes alrededor de `axis` (se normaliza). */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
}

/** Euler en grados, orden XYZ (convención de Three.js). */
export function quatFromEulerDeg(euler: Vec3): Quat {
  const qx = quatFromAxisAngle([1, 0, 0], euler[0] * DEG);
  const qy = quatFromAxisAngle([0, 1, 0], euler[1] * DEG);
  const qz = quatFromAxisAngle([0, 0, 1], euler[2] * DEG);
  return quatMultiply(quatMultiply(qx, qy), qz);
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}

/** Rotación mínima que lleva el vector unitario `from` a `to`. */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const r = dot(from, to) + 1;
  if (r < 1e-8) {
    const axis = anyPerpendicular(from);
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(from, to);
  return quatNormalize([c[0], c[1], c[2], r]);
}

/** Cuaternión de la matriz cuyas columnas son las imágenes de los ejes X, Y, Z. */
export function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const [m11, m21, m31] = x;
  const [m12, m22, m32] = y;
  const [m13, m23, m33] = z;
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}

/** Base ortonormal a partir de un eje principal y un secundario (se ortogonaliza). */
function frame(primary: Vec3, secondary: Vec3): Quat {
  const a = normalize(primary);
  const b = perpendicular(secondary, a) ?? anyPerpendicular(a);
  return quatFromBasis(a, b, cross(a, b));
}

/**
 * Rotación que lleva `fromPrimary` a `toPrimary` exactamente y orienta `fromSecondary`
 * lo más posible hacia `toSecondary`.
 */
export function quatFromBasisPair(
  fromPrimary: Vec3,
  fromSecondary: Vec3,
  toPrimary: Vec3,
  toSecondary: Vec3,
): Quat {
  return quatNormalize(
    quatMultiply(frame(toPrimary, toSecondary), quatInvert(frame(fromPrimary, fromSecondary))),
  );
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let end = b;
  if (cos < 0) {
    cos = -cos;
    end = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (cos > 0.9995) {
    return quatNormalize([
      lerpNumber(a[0], end[0], t),
      lerpNumber(a[1], end[1], t),
      lerpNumber(a[2], end[2], t),
      lerpNumber(a[3], end[3], t),
    ]);
  }
  const theta = Math.acos(cos);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [
    a[0] * wa + end[0] * wb,
    a[1] * wa + end[1] * wb,
    a[2] * wa + end[2] * wb,
    a[3] * wa + end[3] * wb,
  ];
}

/** Ángulo en radianes de la rotación relativa entre dos cuaterniones. */
export function quatAngle(a: Quat, b: Quat): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(clamp(d, -1, 1));
}

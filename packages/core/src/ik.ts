import type { Bone, Effector } from '@gym-anim/schema';
import {
  IDENTITY,
  add,
  anyPerpendicular,
  clamp,
  cross,
  dot,
  length,
  lerp,
  normalize,
  perpendicular,
  quatFromAxisAngle,
  quatFromBasisPair,
  quatFromUnitVectors,
  quatInvert,
  quatMultiply,
  quatSlerp,
  rotate,
  scale,
  sub,
  type Quat,
  type Vec3,
} from './math';
import { boneDefinition, type LimbDefinition, type RigDefinition } from './rig';
import { effectorPoint, type LocalRotations, type WorldTransforms } from './skeleton';

// ---------------------------------------------------------------------------
// IK analítico de dos huesos
// ---------------------------------------------------------------------------

export interface TwoBoneInput {
  /** Articulación superior (hombro/cadera) en mundo. */
  root: Vec3;
  upperLength: number;
  lowerLength: number;
  /** Posición deseada del extremo (muñeca/tobillo). */
  target: Vec3;
  /** Dirección hacia la que debe apuntar la articulación media (codo/rodilla). */
  pole: Vec3;
}

export interface TwoBoneResult {
  mid: Vec3;
  end: Vec3;
  upperDir: Vec3;
  lowerDir: Vec3;
  /** Dirección unitaria, perpendicular a root→end, hacia la que sale la articulación media. */
  poleDir: Vec3;
  /** Flexión de la articulación media en radianes (0 = extendida). */
  bend: number;
  /** `false` si el objetivo está fuera del alcance de la cadena. */
  reachable: boolean;
}

const REACH_SLACK = 1e-4;

export function solveTwoBone({
  root,
  upperLength: a,
  lowerLength: b,
  target,
  pole,
}: TwoBoneInput): TwoBoneResult {
  const toTarget = sub(target, root);
  const d = length(toTarget);
  const n = d > 1e-9 ? scale(toTarget, 1 / d) : anyPerpendicular(normalize(pole));
  const minReach = Math.abs(a - b);
  const maxReach = a + b;
  const reachable = d <= maxReach + REACH_SLACK && d >= minReach - REACH_SLACK;
  const dc = clamp(d, minReach + 1e-6, maxReach - 1e-6);

  const cosA = clamp((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const poleDir = perpendicular(pole, n) ?? anyPerpendicular(n);

  const mid = add(root, scale(add(scale(n, cosA), scale(poleDir, sinA)), a));
  const end = add(root, scale(n, dc));
  const upperDir = normalize(sub(mid, root));
  const lowerDir = normalize(sub(end, mid));
  const bend = Math.acos(clamp(dot(upperDir, lowerDir), -1, 1));
  return { mid, end, upperDir, lowerDir, poleDir, bend, reachable };
}

// ---------------------------------------------------------------------------
// Extremidades del rig
// ---------------------------------------------------------------------------

export interface LimbTarget {
  position: Vec3;
  /** Orientación en mundo del hueso final (mano/pie); `null` deja la muñeca recta. */
  rotation: Quat | null;
}

export interface LimbSolution {
  /** Flexión resultante de codo/rodilla en grados. */
  midFlexDeg: number;
  reachable: boolean;
}

/**
 * Resuelve brazo o pierna para que el punto del efector alcance `target`.
 * Modifica `local` (huesos superior, medio y final); hay que recalcular la FK después.
 * Supone, como el rig de referencia, que los tres huesos son colineales en reposo.
 */
export function solveLimb(
  rig: RigDefinition,
  limb: LimbDefinition,
  world: WorldTransforms,
  local: LocalRotations,
  target: LimbTarget,
  poleWorld: Vec3,
  weight = 1,
): LimbSolution {
  const upperDef = boneDefinition(rig, limb.upper);
  const midDef = boneDefinition(rig, limb.mid);
  const endDef = boneDefinition(rig, limb.end);
  const effectorOffset = rig.effectorPoints[limb.effector].offset;

  const desired = lerp(effectorPoint(rig, world, limb.effector), target.position, weight);
  const endRotation = target.rotation
    ? quatSlerp(world[limb.end].rotation, target.rotation, weight)
    : null;

  const goal = endRotation ? sub(desired, rotate(endRotation, effectorOffset)) : desired;
  const lowerLength = endRotation
    ? length(endDef.offset)
    : length(add(endDef.offset, effectorOffset));

  const result = solveTwoBone({
    root: world[limb.upper].position,
    upperLength: length(midDef.offset),
    lowerLength,
    target: goal,
    pole: poleWorld,
  });

  const restDir = normalize(midDef.offset);
  const bendTowards = perpendicular(result.lowerDir, result.upperDir) ?? scale(result.poleDir, -1);
  const upperWorld = quatFromBasisPair(restDir, limb.bend, result.upperDir, bendTowards);
  const parentRotation = world[upperDef.parent as Bone].rotation;
  local[limb.upper] = quatMultiply(quatInvert(parentRotation), upperWorld);

  local[limb.mid] = quatFromAxisAngle(cross(restDir, limb.bend), result.bend);
  const midWorld = quatMultiply(upperWorld, local[limb.mid]);
  local[limb.end] = endRotation ? quatMultiply(quatInvert(midWorld), endRotation) : IDENTITY;

  return { midFlexDeg: (result.bend * 180) / Math.PI, reachable: result.reachable };
}

/**
 * Gira `bone` (rígido, con todos sus hijos) para que el punto de `effector` apunte a `target`.
 * Se usa para pecho (girando `spine`) y cabeza (girando `neck`).
 */
export function aimBone(
  rig: RigDefinition,
  world: WorldTransforms,
  local: LocalRotations,
  bone: Bone,
  effector: Effector,
  target: Vec3,
  weight = 1,
): void {
  const origin = world[bone].position;
  const current = normalize(sub(effectorPoint(rig, world, effector), origin));
  const desired = normalize(sub(target, origin));
  if (length(current) === 0 || length(desired) === 0) return;

  const delta = quatSlerp(IDENTITY, quatFromUnitVectors(current, desired), weight);
  const parent = boneDefinition(rig, bone).parent;
  const parentRotation = parent ? world[parent].rotation : IDENTITY;
  const newWorld = quatMultiply(delta, world[bone].rotation);
  local[bone] = quatMultiply(quatInvert(parentRotation), newWorld);
}

import { JOINT_DOFS, type Bone, type Effector } from '@gym-anim/schema';
import {
  DEG,
  IDENTITY,
  add,
  quatFromAxisAngle,
  quatMultiply,
  rotate,
  type Quat,
  type Vec3,
} from './math';
import type { JointAngles } from './poses';
import type { RigDefinition } from './rig';

export interface Transform {
  position: Vec3;
  rotation: Quat;
}

export type LocalRotations = Record<Bone, Quat>;
export type WorldTransforms = Record<Bone, Transform>;

/** Rotación local a partir de ángulos por grado de libertad: q = flex · abduct · twist. */
export function localRotations(rig: RigDefinition, angles: JointAngles): LocalRotations {
  const local = {} as LocalRotations;
  for (const def of rig.bones) {
    const dofs = angles[def.name];
    let q = IDENTITY;
    if (dofs) {
      for (const dof of JOINT_DOFS) {
        const angle = dofs[dof];
        if (angle) q = quatMultiply(q, quatFromAxisAngle(def.axes[dof], angle * DEG));
      }
    }
    local[def.name] = q;
  }
  return local;
}

/** Cinemática directa: `root` es la transformación en mundo del hueso raíz antes de su rotación local. */
export function forwardKinematics(
  rig: RigDefinition,
  root: Transform,
  local: LocalRotations,
): WorldTransforms {
  const world = {} as WorldTransforms;
  for (const def of rig.bones) {
    if (def.parent === null) {
      world[def.name] = {
        position: root.position,
        rotation: quatMultiply(root.rotation, local[def.name]),
      };
      continue;
    }
    const parent = world[def.parent];
    world[def.name] = {
      position: add(parent.position, rotate(parent.rotation, def.offset)),
      rotation: quatMultiply(parent.rotation, local[def.name]),
    };
  }
  return world;
}

export function effectorPoint(
  rig: RigDefinition,
  world: WorldTransforms,
  effector: Effector,
): Vec3 {
  const point = rig.effectorPoints[effector];
  const bone = world[point.bone];
  return add(bone.position, rotate(bone.rotation, point.offset));
}

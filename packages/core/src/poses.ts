import type { Bone, JointDof } from '@gym-anim/schema';
import type { Vec3 } from './math';

export type JointAngles = Partial<Record<Bone, Partial<Record<JointDof, number>>>>;

export interface BasePose {
  id: string;
  /** Transformación de `hips` en el espacio del ancla de la pelvis (o del mundo si no hay ancla). */
  root: { position: Vec3; rotation: Vec3 };
  /** Ángulos en grados; lo que no aparece queda en 0. */
  joints: JointAngles;
}

export type PoseLibrary = Readonly<Record<string, BasePose>>;

const RELAXED_ARMS: JointAngles = {
  upper_arm_L: { abduct: 6 },
  upper_arm_R: { abduct: 6 },
  forearm_L: { flex: 8 },
  forearm_R: { flex: 8 },
};

/** Poses base provisionales para el rig de referencia. */
export const BASE_POSES: PoseLibrary = {
  standing: {
    id: 'standing',
    root: { position: [0, 0.94, 0], rotation: [0, 0, 0] },
    joints: { ...RELAXED_ARMS },
  },
  seated: {
    id: 'seated',
    root: { position: [0, 0.52, 0], rotation: [0, 0, 0] },
    joints: {
      ...RELAXED_ARMS,
      thigh_L: { flex: 90 },
      thigh_R: { flex: 90 },
      shin_L: { flex: 90 },
      shin_R: { flex: 90 },
    },
  },
  supine: {
    id: 'supine',
    // Tumbado boca arriba: cabeza hacia −Z, cara hacia +Y.
    root: { position: [0, 0.55, 0], rotation: [-90, 0, 0] },
    joints: { ...RELAXED_ARMS },
  },
};

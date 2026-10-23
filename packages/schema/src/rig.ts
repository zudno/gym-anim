import { z } from 'zod';

/** Partes del cuerpo controlables por el usuario o la IA (manejadores de IK). */
export const EFFECTORS = [
  'pelvis',
  'chest',
  'head',
  'hand_L',
  'hand_R',
  'foot_L',
  'foot_R',
  'elbow_L',
  'elbow_R',
  'knee_L',
  'knee_R',
] as const;
export const EffectorSchema = z.enum(EFFECTORS);
export type Effector = z.infer<typeof EffectorSchema>;

/** Efectores que solo orientan codos/rodillas; no admiten restricciones. */
export const POLE_EFFECTORS = ['elbow_L', 'elbow_R', 'knee_L', 'knee_R'] as const;
export const PoleEffectorSchema = z.enum(POLE_EFFECTORS);
export type PoleEffector = z.infer<typeof PoleEffectorSchema>;

/** Efectores que pueden fijarse a un objetivo mediante una restricción. */
export const ConstraintEffectorSchema = EffectorSchema.exclude([...POLE_EFFECTORS]);
export type ConstraintEffector = z.infer<typeof ConstraintEffectorSchema>;

export const HAND_EFFECTORS = ['hand_L', 'hand_R'] as const;
export const FOOT_EFFECTORS = ['foot_L', 'foot_R'] as const;

/** Huesos mínimos del rig (ver ESPECIFICACION §15.2). */
export const BONES = [
  'hips',
  'spine',
  'spine1',
  'spine2',
  'neck',
  'head',
  'shoulder_L',
  'shoulder_R',
  'upper_arm_L',
  'upper_arm_R',
  'upper_arm_twist_L',
  'upper_arm_twist_R',
  'forearm_L',
  'forearm_R',
  'forearm_twist_L',
  'forearm_twist_R',
  'hand_L',
  'hand_R',
  'thigh_L',
  'thigh_R',
  'shin_L',
  'shin_R',
  'foot_L',
  'foot_R',
  'toe_L',
  'toe_R',
] as const;
export const BoneSchema = z.enum(BONES);
export type Bone = z.infer<typeof BoneSchema>;

/**
 * Grados de libertad animables por FK (`character.<hueso>.<gdl>`).
 * - `flex`: flexión (+) / extensión (−)
 * - `abduct`: abducción (+) / aducción (−)
 * - `twist`: rotación sobre el eje del hueso
 */
export const JOINT_DOFS = ['flex', 'abduct', 'twist'] as const;
export const JointDofSchema = z.enum(JOINT_DOFS);
export type JointDof = z.infer<typeof JointDofSchema>;

export function isBone(value: string): value is Bone {
  return (BONES as readonly string[]).includes(value);
}

export function isJointDof(value: string): value is JointDof {
  return (JOINT_DOFS as readonly string[]).includes(value);
}

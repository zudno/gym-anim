import type { Bone, Effector, JointDof, PoleEffector } from '@gym-anim/schema';
import type { Vec3 } from './math';

export type DofAxes = Record<JointDof, Vec3>;
export type DofLimits = Record<JointDof, readonly [number, number]>;

export interface BoneDefinition {
  name: Bone;
  parent: Bone | null;
  /** Posición del origen del hueso en el espacio local del padre (metros, pose de reposo). */
  offset: Vec3;
  /** Ejes de cada grado de libertad en el espacio local del hueso; el ángulo positivo sigue la regla de la mano derecha. */
  axes: DofAxes;
  /** Límites articulares en grados. */
  limits: DofLimits;
}

export interface LimbDefinition {
  upper: Bone;
  mid: Bone;
  end: Bone;
  effector: Effector;
  pole: PoleEffector;
  /** Dirección hacia la que dobla el hueso medio, en el espacio local del hueso superior. */
  bend: Vec3;
}

export interface EffectorPoint {
  bone: Bone;
  /** Punto de contacto en el espacio local del hueso. */
  offset: Vec3;
}

export interface RigDefinition {
  /** Ordenados de padre a hijo. */
  bones: readonly BoneDefinition[];
  limbs: Readonly<Record<'arm_L' | 'arm_R' | 'leg_L' | 'leg_R', LimbDefinition>>;
  effectorPoints: Readonly<Record<Effector, EffectorPoint>>;
  /** Hacia dónde apunta cada codo/rodilla si la escena no lo indica (espacio del personaje). */
  defaultPoles: Readonly<Record<PoleEffector, Vec3>>;
}

// ---------------------------------------------------------------------------
// Rig de referencia provisional
// ---------------------------------------------------------------------------
//
// Hombre atlético de ~1.80 m. En reposo está de pie en el origen mirando a +Z, brazos colgando
// con las palmas hacia el cuerpo, y todos los huesos con rotación local identidad.
// Se reemplazará por las medidas extraídas del .glb del personaje (Fase 1).

const X: Vec3 = [1, 0, 0];
const NX: Vec3 = [-1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const NY: Vec3 = [0, -1, 0];
const Z: Vec3 = [0, 0, 1];
const NZ: Vec3 = [0, 0, -1];

const FIXED: readonly [number, number] = [0, 0];

function limits(
  flex: readonly [number, number],
  abduct: readonly [number, number] = FIXED,
  twist: readonly [number, number] = FIXED,
): DofLimits {
  return { flex, abduct, twist };
}

/** Acepta nombres con plantilla (`forearm_${side}`); los nombres se verifican en los tests. */
function bone(
  name: string,
  parent: string | null,
  offset: Vec3,
  axes: DofAxes,
  boneLimits: DofLimits,
): BoneDefinition {
  return { name: name as Bone, parent: parent as Bone | null, offset, axes, limits: boneLimits };
}

const SPINE_AXES: DofAxes = { flex: X, abduct: NZ, twist: Y };

function armBones(side: 'L' | 'R'): BoneDefinition[] {
  const s = side === 'L' ? 1 : -1;
  const out: Vec3 = side === 'L' ? Z : NZ;
  const limbAxes: DofAxes = { flex: NX, abduct: out, twist: NY };
  return [
    bone(
      `shoulder_${side}`,
      'spine2',
      [0.04 * s, 0.12, 0],
      { flex: side === 'L' ? NY : Y, abduct: out, twist: side === 'L' ? X : NX },
      limits([-10, 15], [-10, 30], [-5, 5]),
    ),
    bone(
      `upper_arm_${side}`,
      `shoulder_${side}`,
      [0.14 * s, 0, 0],
      limbAxes,
      limits([-60, 180], [-30, 180], [-90, 90]),
    ),
    bone(
      `upper_arm_twist_${side}`,
      `upper_arm_${side}`,
      [0, -0.145, 0],
      limbAxes,
      limits(FIXED, FIXED, [-90, 90]),
    ),
    bone(
      `forearm_${side}`,
      `upper_arm_${side}`,
      [0, -0.29, 0],
      { flex: NX, abduct: Z, twist: NY },
      limits([0, 150], [-5, 5], [-90, 90]),
    ),
    bone(
      `forearm_twist_${side}`,
      `forearm_${side}`,
      [0, -0.13, 0],
      limbAxes,
      limits(FIXED, FIXED, [-90, 90]),
    ),
    bone(
      `hand_${side}`,
      `forearm_${side}`,
      [0, -0.26, 0],
      { flex: side === 'L' ? NZ : Z, abduct: X, twist: NY },
      limits([-70, 80], [-20, 30], [-5, 5]),
    ),
  ];
}

function legBones(side: 'L' | 'R'): BoneDefinition[] {
  const s = side === 'L' ? 1 : -1;
  const out: Vec3 = side === 'L' ? Z : NZ;
  return [
    bone(
      `thigh_${side}`,
      'hips',
      [0.1 * s, -0.06, 0],
      { flex: NX, abduct: out, twist: NY },
      limits([-30, 130], [-30, 60], [-45, 45]),
    ),
    bone(
      `shin_${side}`,
      `thigh_${side}`,
      [0, -0.43, 0],
      { flex: X, abduct: Z, twist: NY },
      limits([0, 150], [-5, 5], [-10, 10]),
    ),
    bone(
      `foot_${side}`,
      `shin_${side}`,
      [0, -0.4, 0],
      { flex: NX, abduct: Z, twist: Y },
      limits([-50, 30], [-20, 20], [-30, 30]),
    ),
    bone(
      `toe_${side}`,
      `foot_${side}`,
      [0, -0.04, 0.13],
      { flex: NX, abduct: Y, twist: Z },
      limits([-40, 60]),
    ),
  ];
}

export const REFERENCE_RIG: RigDefinition = {
  bones: [
    bone(
      'hips',
      null,
      [0, 0, 0],
      { flex: X, abduct: NZ, twist: Y },
      limits([-180, 180], [-180, 180], [-180, 180]),
    ),
    bone('spine', 'hips', [0, 0.1, 0], SPINE_AXES, limits([-15, 30], [-15, 15], [-15, 15])),
    bone('spine1', 'spine', [0, 0.12, 0], SPINE_AXES, limits([-15, 30], [-15, 15], [-15, 15])),
    bone('spine2', 'spine1', [0, 0.12, 0], SPINE_AXES, limits([-15, 30], [-15, 15], [-15, 15])),
    bone('neck', 'spine2', [0, 0.16, 0], SPINE_AXES, limits([-40, 40], [-30, 30], [-60, 60])),
    bone('head', 'neck', [0, 0.1, 0], SPINE_AXES, limits([-30, 30], [-20, 20], [-30, 30])),
    ...armBones('L'),
    ...armBones('R'),
    ...legBones('L'),
    ...legBones('R'),
  ],
  limbs: {
    arm_L: {
      upper: 'upper_arm_L',
      mid: 'forearm_L',
      end: 'hand_L',
      effector: 'hand_L',
      pole: 'elbow_L',
      bend: Z,
    },
    arm_R: {
      upper: 'upper_arm_R',
      mid: 'forearm_R',
      end: 'hand_R',
      effector: 'hand_R',
      pole: 'elbow_R',
      bend: Z,
    },
    leg_L: {
      upper: 'thigh_L',
      mid: 'shin_L',
      end: 'foot_L',
      effector: 'foot_L',
      pole: 'knee_L',
      bend: NZ,
    },
    leg_R: {
      upper: 'thigh_R',
      mid: 'shin_R',
      end: 'foot_R',
      effector: 'foot_R',
      pole: 'knee_R',
      bend: NZ,
    },
  },
  // Las anclas de los equipos marcan dónde debe quedar exactamente este punto.
  effectorPoints: {
    pelvis: { bone: 'hips', offset: [0, 0, 0] },
    chest: { bone: 'spine2', offset: [0, 0, 0] },
    head: { bone: 'head', offset: [0, 0, 0] },
    hand_L: { bone: 'hand_L', offset: [0, -0.08, 0] },
    hand_R: { bone: 'hand_R', offset: [0, -0.08, 0] },
    foot_L: { bone: 'foot_L', offset: [0, -0.06, 0.04] },
    foot_R: { bone: 'foot_R', offset: [0, -0.06, 0.04] },
    elbow_L: { bone: 'forearm_L', offset: [0, 0, 0] },
    elbow_R: { bone: 'forearm_R', offset: [0, 0, 0] },
    knee_L: { bone: 'shin_L', offset: [0, 0, 0] },
    knee_R: { bone: 'shin_R', offset: [0, 0, 0] },
  },
  defaultPoles: {
    elbow_L: [0.3, 0, -1],
    elbow_R: [-0.3, 0, -1],
    knee_L: [0, 0, 1],
    knee_R: [0, 0, 1],
  },
};

export function boneDefinition(rig: RigDefinition, name: Bone): BoneDefinition {
  const found = rig.bones.find((b) => b.name === name);
  if (!found) throw new Error(`El rig no tiene el hueso "${name}"`);
  return found;
}

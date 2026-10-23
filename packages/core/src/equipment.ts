import type { DriverValue, EquipmentInstance, JointType } from '@gym-anim/schema';
import {
  IDENTITY,
  add,
  lerpNumber,
  normalize,
  quatFromAxisAngle,
  quatFromBasis,
  quatFromEulerDeg,
  quatMultiply,
  rotate,
  scale,
  sub,
  DEG,
  type Quat,
  type Vec3,
} from './math';

export interface AnchorDefinition {
  /** Posición en el espacio local del equipo. */
  position: Vec3;
  /**
   * Orientación del ancla. Si existe, el efector adopta esa orientación (manos, pies) o la usa
   * como marco de la pose base (pelvis). Si no, la muñeca queda recta / el pie sigue al personaje.
   */
  rotation?: Quat;
}

export interface MachineJointDefinition {
  id: string;
  type: JointType;
  /** Eje en espacio local: de giro (`revolute`) o de desplazamiento (`prismatic`, `cable`). */
  axis: Vec3;
  /** Pivote de giro para `revolute`. */
  pivot?: Vec3;
  /** Valor en t = 0 y t = 1: grados (`revolute`) o metros (`prismatic`, `cable`). */
  range: readonly [number, number];
  /** Anclas que mueve esta articulación. */
  drives: readonly string[];
}

export interface EquipmentDefinition {
  type: string;
  anchors: Readonly<Record<string, AnchorDefinition>>;
  joints: readonly MachineJointDefinition[];
}

export type EquipmentLibrary = Readonly<Record<string, EquipmentDefinition>>;

export interface AnchorTransform {
  position: Vec3;
  rotation: Quat;
  /** `true` si el ancla define orientación (ver `AnchorDefinition.rotation`). */
  oriented: boolean;
}

export interface EvaluatedEquipment {
  id: string;
  type: string;
  position: Vec3;
  rotation: Quat;
  /** Parámetro maestro de la máquina (0–1). */
  t: number;
  /** Valor de cada articulación: grados o metros según su tipo. */
  joints: Record<string, number>;
  anchors: Record<string, AnchorTransform>;
  /** Efector que lo carga (`carry`), si aplica. */
  carriedBy: string | null;
}

// ---------------------------------------------------------------------------
// Definiciones provisionales (hasta tener los .glb de la Fase 1)
// ---------------------------------------------------------------------------

/** Mano agarrando un mango que va a lo largo de X (mancuerna): el eje Z de la mano sigue al mango. */
const HANDLE_ALONG_X: Quat = quatFromBasis([0, 0, -1], [0, 1, 0], [1, 0, 0]);

export const PLACEHOLDER_LIBRARY: EquipmentLibrary = {
  // Banco plano: acolchado a 0.45 m, a lo largo de Z; la cabeza va hacia −Z.
  flat_bench: {
    type: 'flat_bench',
    anchors: {
      // Cadera del personaje tumbado (0.10 m sobre el acolchado).
      seat: { position: [0, 0.55, 0.2], rotation: IDENTITY },
      // Pecho (spine2) del personaje tumbado.
      back_pad: { position: [0, 0.55, -0.14], rotation: IDENTITY },
    },
    joints: [],
  },
  // Jalón al pecho: asiento a 0.42 m mirando a +Z; la barra baja por cable desde arriba.
  lat_pulldown: {
    type: 'lat_pulldown',
    anchors: {
      seat: { position: [0, 0.52, 0], rotation: IDENTITY },
      knee_pad: { position: [0, 0.62, 0.4] },
      grip_L: { position: [0.42, 1.52, 0.1] },
      grip_R: { position: [-0.42, 1.52, 0.1] },
      foot_L: { position: [0.15, 0, 0.45], rotation: IDENTITY },
      foot_R: { position: [-0.15, 0, 0.45], rotation: IDENTITY },
    },
    joints: [
      {
        id: 'bar',
        type: 'cable',
        axis: normalize([0, -0.52, 0.06]),
        range: [0, 0.5235],
        drives: ['grip_L', 'grip_R'],
      },
    ],
  },
  // Barra olímpica a lo largo de X; agarre a 0.80 m entre manos.
  barbell: {
    type: 'barbell',
    anchors: {
      grip_L: { position: [0.4, 0, 0] },
      grip_R: { position: [-0.4, 0, 0] },
    },
    joints: [],
  },
  // Mancuerna con el mango a lo largo de X, centrada en el origen.
  dumbbell: {
    type: 'dumbbell',
    anchors: {
      grip: { position: [0, 0, 0], rotation: HANDLE_ALONG_X },
    },
    joints: [],
  },
};

// ---------------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------------

function moveAnchor(
  joint: MachineJointDefinition,
  value: number,
  anchor: { position: Vec3; rotation: Quat },
): { position: Vec3; rotation: Quat } {
  if (joint.type === 'revolute') {
    const q = quatFromAxisAngle(joint.axis, value * DEG);
    const pivot = joint.pivot ?? [0, 0, 0];
    return {
      position: add(pivot, rotate(q, sub(anchor.position, pivot))),
      rotation: quatMultiply(q, anchor.rotation),
    };
  }
  return {
    position: add(anchor.position, scale(normalize(joint.axis), value)),
    rotation: anchor.rotation,
  };
}

/**
 * Coloca un equipo. `placement` sustituye a la posición/rotación de la escena
 * (se usa para objetos cargados por una mano).
 */
export function evaluateEquipment(
  item: EquipmentInstance,
  definition: EquipmentDefinition | undefined,
  drivers: Readonly<Record<string, DriverValue>>,
  placement?: { position: Vec3; rotation: Quat; carriedBy: string },
): EvaluatedEquipment {
  const drivenPosition = drivers[`${item.id}.position`];
  const drivenRotation = drivers[`${item.id}.rotation`];
  const drivenT = drivers[`${item.id}.t`];

  const position =
    placement?.position ?? (Array.isArray(drivenPosition) ? drivenPosition : item.position);
  const rotation =
    placement?.rotation ??
    quatFromEulerDeg(Array.isArray(drivenRotation) ? drivenRotation : item.rotation);
  const t = typeof drivenT === 'number' ? drivenT : 0;

  const joints: Record<string, number> = {};
  for (const joint of definition?.joints ?? []) {
    joints[joint.id] = lerpNumber(joint.range[0], joint.range[1], t);
  }

  const anchors: Record<string, AnchorTransform> = {};
  for (const [name, anchor] of Object.entries(definition?.anchors ?? {})) {
    let localAnchor = { position: anchor.position, rotation: anchor.rotation ?? IDENTITY };
    for (const joint of definition?.joints ?? []) {
      if (joint.drives.includes(name))
        localAnchor = moveAnchor(joint, joints[joint.id]!, localAnchor);
    }
    anchors[name] = {
      position: add(position, rotate(rotation, localAnchor.position)),
      rotation: quatMultiply(rotation, localAnchor.rotation),
      oriented: anchor.rotation !== undefined,
    };
  }

  return {
    id: item.id,
    type: item.type,
    position,
    rotation,
    t,
    joints,
    anchors,
    carriedBy: placement?.carriedBy ?? null,
  };
}

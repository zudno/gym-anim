import { z } from 'zod';
import {
  EaseSchema,
  HexColorSchema,
  IdSchema,
  LoopModeSchema,
  Vec3Schema,
  type LoopMode,
} from './common';
import { EquipmentInstanceSchema, RESERVED_IDS } from './equipment';
import type { IssuePath } from './issues';
import { MuscleIdSchema } from './muscles';
import {
  ConstraintEffectorSchema,
  HAND_EFFECTORS,
  PoleEffectorSchema,
  isBone,
  isJointDof,
  type Bone,
  type JointDof,
} from './rig';
import { CURRENT_SCHEMA_VERSION } from './version';

// ---------------------------------------------------------------------------
// Objetivos de restricción: "floor" | "world" | "<equipoId>.<ancla>"
// ---------------------------------------------------------------------------

export type TargetRef =
  { kind: 'floor' } | { kind: 'world' } | { kind: 'anchor'; equipmentId: string; anchor: string };

const ANCHOR_TARGET_RE = /^([a-z][a-z0-9_-]*)\.([a-z][a-zA-Z0-9_]*)$/;

export function parseTarget(target: string): TargetRef | null {
  if (target === 'floor' || target === 'world') return { kind: target };
  const match = ANCHOR_TARGET_RE.exec(target);
  if (!match) return null;
  return { kind: 'anchor', equipmentId: match[1]!, anchor: match[2]! };
}

export const TargetSchema = z.string().refine((value) => parseTarget(value) !== null, {
  message: 'Objetivo inválido: usa "floor", "world" o "<equipoId>.<ancla>"',
});

// ---------------------------------------------------------------------------
// Drivers: "<equipoId>.position|rotation|t" | "character.<hueso>.<gdl>"
// ---------------------------------------------------------------------------

export const EQUIPMENT_DRIVER_PROPERTIES = ['position', 'rotation', 't'] as const;
export type EquipmentDriverProperty = (typeof EQUIPMENT_DRIVER_PROPERTIES)[number];

export type DriverRef =
  | { kind: 'equipment'; equipmentId: string; property: EquipmentDriverProperty }
  | { kind: 'joint'; bone: Bone; dof: JointDof };

const EQUIPMENT_DRIVER_RE = /^([a-z][a-z0-9_-]*)\.(position|rotation|t)$/;
const JOINT_DRIVER_RE = /^character\.([a-z][a-zA-Z0-9_]*)\.([a-z]+)$/;

export function parseDriverKey(key: string): DriverRef | null {
  const joint = JOINT_DRIVER_RE.exec(key);
  if (joint) {
    const [, bone, dof] = joint;
    return isBone(bone!) && isJointDof(dof!) ? { kind: 'joint', bone: bone!, dof: dof! } : null;
  }
  const equipment = EQUIPMENT_DRIVER_RE.exec(key);
  if (!equipment || equipment[1] === 'character') return null;
  return {
    kind: 'equipment',
    equipmentId: equipment[1]!,
    property: equipment[2] as EquipmentDriverProperty,
  };
}

export const DriverValueSchema = z.union([z.number(), Vec3Schema]);
export type DriverValue = z.infer<typeof DriverValueSchema>;

// ---------------------------------------------------------------------------
// Bloques de la escena
// ---------------------------------------------------------------------------

/**
 * Duraciones en segundos. La fase inicial (t: 0→1) es `startPhase`;
 * en `pingpong` la vuelta (t: 1→0) es la otra fase.
 */
export const TempoPhaseSchema = z.enum(['eccentric', 'concentric']);

export const TempoSchema = z.strictObject({
  startPhase: TempoPhaseSchema.default('eccentric'),
  eccentric: z.number().positive().max(10),
  concentric: z.number().positive().max(10),
  /** Pausa en t = 0. */
  pauseStart: z.number().nonnegative().max(10).default(0),
  /** Pausa en t = 1. */
  pauseEnd: z.number().nonnegative().max(10).default(0),
});
export type Tempo = z.infer<typeof TempoSchema>;

export const MusclesSchema = z.strictObject({
  primary: z.array(MuscleIdSchema).default([]),
  secondary: z.array(MuscleIdSchema).default([]),
});
export type Muscles = z.infer<typeof MusclesSchema>;

export const CharacterSchema = z.strictObject({
  model: IdSchema,
  basePose: IdSchema,
  muscles: MusclesSchema.prefault({}),
  /** Dirección hacia la que apunta cada codo/rodilla (espacio del personaje). */
  poles: z.partialRecord(PoleEffectorSchema, Vec3Schema).default({}),
});
export type Character = z.infer<typeof CharacterSchema>;

/**
 * - `pin`: el efector queda fijo en el objetivo (pelvis en asiento, pies en el suelo).
 * - `follow`: el efector sigue al ancla mediante IK (manos en la barra).
 * - `carry`: el equipo sigue a la mano (mancuerna emparentada).
 */
export const CONSTRAINT_MODES = ['pin', 'follow', 'carry'] as const;
export const ConstraintModeSchema = z.enum(CONSTRAINT_MODES);
export type ConstraintMode = z.infer<typeof ConstraintModeSchema>;

export const ConstraintSchema = z.strictObject({
  id: IdSchema,
  effector: ConstraintEffectorSchema,
  target: TargetSchema,
  mode: ConstraintModeSchema.default('pin'),
  /** Desplazamiento desde el objetivo, en metros. */
  offset: Vec3Schema.optional(),
  /** Influencia 0–1 de la restricción. */
  weight: z.number().min(0).max(1).default(1),
});
export type Constraint = z.infer<typeof ConstraintSchema>;

export const KeyframeSchema = z.strictObject({
  /** Posición normalizada del movimiento: 0 = inicio, 1 = fin. */
  t: z.number().min(0).max(1),
  drivers: z.record(z.string(), DriverValueSchema),
  /** Easing del tramo que empieza en este keyframe. */
  ease: EaseSchema.default('inOutSine'),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const CAMERA_PRESETS = [
  'front',
  'back',
  'left',
  'right',
  'three_quarter_left',
  'three_quarter_right',
  'top',
] as const;
export const CameraPresetSchema = z.enum(CAMERA_PRESETS);

export const CameraSchema = z
  .strictObject({
    preset: CameraPresetSchema.optional(),
    position: Vec3Schema.optional(),
    target: Vec3Schema.optional(),
    fov: z.number().min(10).max(90).default(35),
  })
  .refine((cam) => cam.preset !== undefined || (cam.position && cam.target), {
    message: 'La cámara necesita "preset" o bien "position" y "target"',
  });
export type Camera = z.infer<typeof CameraSchema>;

export const RenderSettingsSchema = z.strictObject({
  look: z.enum(['studio']).default('studio'),
  background: HexColorSchema.default('#ffffff'),
  transparent: z.boolean().default(false),
  width: z.int().min(64).max(4096).default(1080),
  height: z.int().min(64).max(4096).default(1080),
});
export type RenderSettings = z.infer<typeof RenderSettingsSchema>;

export const SceneObjectSchema = z.strictObject({
  /** Ruta al JSON Schema generado, para autocompletado en editores de código. */
  $schema: z.string().optional(),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: IdSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1)).default([]),
  fps: z.int().min(12).max(120).default(30),
  loop: LoopModeSchema.default('pingpong'),
  tempo: TempoSchema,
  character: CharacterSchema,
  equipment: z.array(EquipmentInstanceSchema).default([]),
  constraints: z.array(ConstraintSchema).default([]),
  keyframes: z.array(KeyframeSchema).min(2),
  camera: CameraSchema.prefault({ preset: 'three_quarter_left' }),
  render: RenderSettingsSchema.prefault({}),
});

/** Escena validada: estructura + integridad referencial interna. */
export const SceneSchema = SceneObjectSchema.superRefine((scene, ctx) => {
  checkSceneIntegrity(scene, (code, message, path) =>
    ctx.addIssue({ code: 'custom', message, path, params: { code } }),
  );
});
export type Scene = z.infer<typeof SceneSchema>;
export type SceneInput = z.input<typeof SceneSchema>;

// ---------------------------------------------------------------------------
// Integridad interna (sin catálogo de assets)
// ---------------------------------------------------------------------------

type Report = (code: string, message: string, path: IssuePath) => void;

function checkSceneIntegrity(scene: z.output<typeof SceneObjectSchema>, report: Report): void {
  const equipmentIds = new Set<string>();
  scene.equipment.forEach((item, i) => {
    if ((RESERVED_IDS as readonly string[]).includes(item.id)) {
      report('RESERVED_EQUIPMENT_ID', `"${item.id}" es un id reservado`, ['equipment', i, 'id']);
    }
    if (equipmentIds.has(item.id)) {
      report('DUPLICATE_EQUIPMENT_ID', `Id de equipo duplicado: "${item.id}"`, [
        'equipment',
        i,
        'id',
      ]);
    }
    equipmentIds.add(item.id);
  });

  const constraintIds = new Set<string>();
  const constrainedEffectors = new Set<string>();
  const carriedEquipment = new Set<string>();
  scene.constraints.forEach((constraint, i) => {
    const path = ['constraints', i];
    if (constraintIds.has(constraint.id)) {
      report('DUPLICATE_CONSTRAINT_ID', `Id de restricción duplicado: "${constraint.id}"`, [
        ...path,
        'id',
      ]);
    }
    constraintIds.add(constraint.id);

    if (constrainedEffectors.has(constraint.effector)) {
      report(
        'DUPLICATE_EFFECTOR_CONSTRAINT',
        `El efector "${constraint.effector}" ya tiene otra restricción`,
        [...path, 'effector'],
      );
    }
    constrainedEffectors.add(constraint.effector);

    const target = parseTarget(constraint.target);
    if (!target) return; // ya reportado por TargetSchema
    if (target.kind === 'anchor' && !equipmentIds.has(target.equipmentId)) {
      report(
        'UNKNOWN_TARGET_EQUIPMENT',
        `No existe el equipo "${target.equipmentId}" en la escena`,
        [...path, 'target'],
      );
    }
    if (constraint.mode !== 'pin' && target.kind !== 'anchor') {
      report(
        'INVALID_TARGET_FOR_MODE',
        `El modo "${constraint.mode}" necesita un ancla de equipo, no "${target.kind}"`,
        [...path, 'target'],
      );
    }
    if (constraint.mode === 'carry') {
      if (!(HAND_EFFECTORS as readonly string[]).includes(constraint.effector)) {
        report('CARRY_REQUIRES_HAND', 'Solo las manos pueden cargar un equipo (modo "carry")', [
          ...path,
          'effector',
        ]);
      }
      if (target.kind === 'anchor') {
        if (carriedEquipment.has(target.equipmentId)) {
          report(
            'MULTIPLE_CARRY',
            `"${target.equipmentId}" ya lo carga otra mano; para objetos a dos manos usa "follow"`,
            [...path, 'mode'],
          );
        }
        carriedEquipment.add(target.equipmentId);
      }
    }
  });

  checkKeyframes(scene, equipmentIds, carriedEquipment, report);

  const primary = new Set(scene.character.muscles.primary);
  scene.character.muscles.secondary.forEach((muscle, i) => {
    if (primary.has(muscle)) {
      report('MUSCLE_IN_BOTH_GROUPS', `"${muscle}" está como principal y secundario`, [
        'character',
        'muscles',
        'secondary',
        i,
      ]);
    }
  });
}

function checkKeyframes(
  scene: z.output<typeof SceneObjectSchema>,
  equipmentIds: Set<string>,
  carriedEquipment: Set<string>,
  report: Report,
): void {
  const { keyframes } = scene;

  for (let i = 1; i < keyframes.length; i++) {
    const prev = keyframes[i - 1]!.t;
    const curr = keyframes[i]!.t;
    if (curr === prev) {
      report('DUPLICATE_KEYFRAME_T', `Dos keyframes en t = ${curr}`, ['keyframes', i, 't']);
    } else if (curr < prev) {
      report('KEYFRAMES_NOT_SORTED', 'Los keyframes deben estar ordenados por t ascendente', [
        'keyframes',
        i,
        't',
      ]);
    }
  }
  if (keyframes[0]?.t !== 0 || keyframes[keyframes.length - 1]?.t !== 1) {
    report('KEYFRAMES_MISSING_ENDPOINTS', 'Debe haber un keyframe en t = 0 y otro en t = 1', [
      'keyframes',
    ]);
  }

  const referenceKeys = Object.keys(keyframes[0]?.drivers ?? {}).sort();
  keyframes.forEach((keyframe, i) => {
    const keys = Object.keys(keyframe.drivers).sort();
    if (i > 0 && keys.join('|') !== referenceKeys.join('|')) {
      report(
        'DRIVER_KEYS_MISMATCH',
        'Todos los keyframes deben definir los mismos drivers que el primero',
        ['keyframes', i, 'drivers'],
      );
    }

    for (const [key, value] of Object.entries(keyframe.drivers)) {
      const path = ['keyframes', i, 'drivers', key];
      const ref = parseDriverKey(key);
      if (!ref) {
        report(
          'INVALID_DRIVER_KEY',
          `Driver inválido "${key}": usa "<equipoId>.position|rotation|t" o "character.<hueso>.flex|abduct|twist"`,
          path,
        );
        continue;
      }
      if (ref.kind === 'joint') {
        if (typeof value !== 'number') {
          report('INVALID_DRIVER_VALUE', `"${key}" espera un ángulo en grados (número)`, path);
        }
        continue;
      }
      if (!equipmentIds.has(ref.equipmentId)) {
        report('UNKNOWN_DRIVER_EQUIPMENT', `No existe el equipo "${ref.equipmentId}"`, path);
        continue;
      }
      if (ref.property === 't') {
        if (typeof value !== 'number' || value < 0 || value > 1) {
          report('INVALID_DRIVER_VALUE', `"${key}" espera un número entre 0 y 1`, path);
        }
      } else {
        if (!Array.isArray(value)) {
          report('INVALID_DRIVER_VALUE', `"${key}" espera un vector [x, y, z]`, path);
        }
        if (carriedEquipment.has(ref.equipmentId)) {
          report(
            'DRIVEN_CARRIED_OBJECT',
            `"${ref.equipmentId}" lo carga una mano; anima la articulación, no su ${ref.property}`,
            path,
          );
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Tiempo
// ---------------------------------------------------------------------------

/** Duración en segundos de un ciclo completo de la animación. */
export function cycleDuration(tempo: Tempo, loop: LoopMode): number {
  const first = tempo.startPhase === 'eccentric' ? tempo.eccentric : tempo.concentric;
  const second = tempo.startPhase === 'eccentric' ? tempo.concentric : tempo.eccentric;
  const oneWay = tempo.pauseStart + first + tempo.pauseEnd;
  return loop === 'pingpong' ? oneWay + second : oneWay;
}

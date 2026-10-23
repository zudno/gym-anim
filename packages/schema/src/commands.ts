import { z } from 'zod';
import {
  EaseSchema,
  EulerDegSchema,
  HexColorSchema,
  IdSchema,
  LoopModeSchema,
  Vec3Schema,
} from './common';
import { LoadSchema } from './equipment';
import { MuscleIdSchema } from './muscles';
import { ConstraintEffectorSchema, PoleEffectorSchema } from './rig';
import {
  CameraSchema,
  ConstraintModeSchema,
  DriverValueSchema,
  TargetSchema,
  TempoPhaseSchema,
} from './scene';

/*
 * Comandos: única vía para modificar una escena, tanto desde el editor como desde la IA.
 * Los campos opcionales significan "no cambiar"; por eso aquí no hay valores por defecto.
 */

export const CreateSceneCommandSchema = z
  .strictObject({
    type: z.literal('create_scene'),
    id: IdSchema.optional(),
    name: z.string().min(1).max(120),
    template: IdSchema.optional(),
  })
  .describe('Crea una escena nueva, vacía o a partir de una plantilla');

export const SetCharacterCommandSchema = z
  .strictObject({
    type: z.literal('set_character'),
    model: IdSchema.optional(),
    basePose: IdSchema.optional(),
  })
  .describe('Cambia el modelo del personaje o su pose base');

export const AddEquipmentCommandSchema = z
  .strictObject({
    type: z.literal('add_equipment'),
    id: IdSchema.optional(),
    equipmentType: IdSchema,
    position: Vec3Schema.optional(),
    rotation: EulerDegSchema.optional(),
    load: LoadSchema.optional(),
  })
  .describe('Agrega un equipo del catálogo a la escena');

export const UpdateEquipmentCommandSchema = z
  .strictObject({
    type: z.literal('update_equipment'),
    id: IdSchema,
    position: Vec3Schema.optional(),
    rotation: EulerDegSchema.optional(),
  })
  .describe('Mueve o rota un equipo existente');

export const RemoveEquipmentCommandSchema = z
  .strictObject({
    type: z.literal('remove_equipment'),
    id: IdSchema,
  })
  .describe('Elimina un equipo y las restricciones/drivers que lo usan');

export const SetLoadCommandSchema = z
  .strictObject({
    type: z.literal('set_load'),
    equipmentId: IdSchema,
    load: LoadSchema,
  })
  .describe('Cambia la carga (discos, kg de mancuerna o del stack)');

export const AddConstraintCommandSchema = z
  .strictObject({
    type: z.literal('add_constraint'),
    id: IdSchema.optional(),
    effector: ConstraintEffectorSchema,
    target: TargetSchema,
    mode: ConstraintModeSchema.optional(),
    offset: Vec3Schema.optional(),
    weight: z.number().min(0).max(1).optional(),
  })
  .describe('Fija un efector del personaje a un ancla, al suelo o al mundo');

export const RemoveConstraintCommandSchema = z
  .strictObject({
    type: z.literal('remove_constraint'),
    id: IdSchema,
  })
  .describe('Elimina una restricción');

export const SetKeyframeCommandSchema = z
  .strictObject({
    type: z.literal('set_keyframe'),
    t: z.number().min(0).max(1),
    /** Se fusionan con los drivers existentes en ese t. */
    drivers: z.record(z.string(), DriverValueSchema),
    ease: EaseSchema.optional(),
  })
  .describe('Crea o actualiza el keyframe en t (0 = inicio, 1 = fin), fusionando drivers');

export const RemoveKeyframeCommandSchema = z
  .strictObject({
    type: z.literal('remove_keyframe'),
    t: z.number().min(0).max(1),
  })
  .describe('Elimina el keyframe en t');

export const SetTempoCommandSchema = z
  .strictObject({
    type: z.literal('set_tempo'),
    startPhase: TempoPhaseSchema.optional(),
    eccentric: z.number().positive().max(10).optional(),
    concentric: z.number().positive().max(10).optional(),
    pauseStart: z.number().nonnegative().max(10).optional(),
    pauseEnd: z.number().nonnegative().max(10).optional(),
  })
  .describe('Cambia duraciones (segundos) de las fases del movimiento');

export const SetLoopCommandSchema = z
  .strictObject({
    type: z.literal('set_loop'),
    mode: LoopModeSchema,
  })
  .describe('Cambia el modo de repetición');

export const SetMusclesCommandSchema = z
  .strictObject({
    type: z.literal('set_muscles'),
    primary: z.array(MuscleIdSchema).optional(),
    secondary: z.array(MuscleIdSchema).optional(),
  })
  .describe('Reemplaza la lista de músculos principales y/o secundarios');

export const SetCameraCommandSchema = z
  .strictObject({
    type: z.literal('set_camera'),
    camera: CameraSchema,
  })
  .describe('Cambia la cámara (preset o posición/objetivo)');

export const SetRenderCommandSchema = z
  .strictObject({
    type: z.literal('set_render'),
    background: HexColorSchema.optional(),
    transparent: z.boolean().optional(),
    width: z.int().min(64).max(4096).optional(),
    height: z.int().min(64).max(4096).optional(),
  })
  .describe('Cambia fondo, transparencia o resolución del render');

export const SetPoleCommandSchema = z
  .strictObject({
    type: z.literal('set_pole'),
    limb: PoleEffectorSchema,
    /** `null` vuelve a la orientación automática. */
    direction: Vec3Schema.nullable(),
  })
  .describe('Orienta un codo o rodilla');

export const CommandSchema = z.discriminatedUnion('type', [
  CreateSceneCommandSchema,
  SetCharacterCommandSchema,
  AddEquipmentCommandSchema,
  UpdateEquipmentCommandSchema,
  RemoveEquipmentCommandSchema,
  SetLoadCommandSchema,
  AddConstraintCommandSchema,
  RemoveConstraintCommandSchema,
  SetKeyframeCommandSchema,
  RemoveKeyframeCommandSchema,
  SetTempoCommandSchema,
  SetLoopCommandSchema,
  SetMusclesCommandSchema,
  SetCameraCommandSchema,
  SetRenderCommandSchema,
  SetPoleCommandSchema,
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandInput = z.input<typeof CommandSchema>;
export type CommandType = Command['type'];

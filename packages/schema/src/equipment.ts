import { z } from 'zod';
import { EulerDegSchema, IdSchema, Vec3Schema } from './common';

/** Discos olímpicos estándar en kg. */
export const PLATE_KG = [1.25, 2.5, 5, 10, 15, 20, 25] as const;
export const PlateKgSchema = z.literal(PLATE_KG);
export type PlateKg = z.infer<typeof PlateKgSchema>;

export const LOAD_KINDS = ['barbell', 'dumbbell', 'stack'] as const;
export const LoadKindSchema = z.enum(LOAD_KINDS);
export type LoadKind = z.infer<typeof LoadKindSchema>;

export const BarbellLoadSchema = z.strictObject({
  kind: z.literal('barbell'),
  barKg: z.number().positive().max(50).default(20),
  /** Discos de un lado, del interior al exterior; el otro lado es simétrico. */
  platesPerSide: z.array(PlateKgSchema).max(8).default([]),
});

export const DumbbellLoadSchema = z.strictObject({
  kind: z.literal('dumbbell'),
  kg: z.number().positive().max(100),
});

/** Stack de placas de una máquina; `selectedKg` es la carga seleccionada con el pasador. */
export const StackLoadSchema = z.strictObject({
  kind: z.literal('stack'),
  selectedKg: z.number().positive().max(300),
});

export const LoadSchema = z.discriminatedUnion('kind', [
  BarbellLoadSchema,
  DumbbellLoadSchema,
  StackLoadSchema,
]);
export type Load = z.infer<typeof LoadSchema>;

/** Ids reservados que no pueden usarse como id de equipo. */
export const RESERVED_IDS = ['character', 'floor', 'world'] as const;

/** Un equipo colocado en la escena. `type` es el id de su manifiesto en el catálogo de assets. */
export const EquipmentInstanceSchema = z.strictObject({
  id: IdSchema,
  type: IdSchema,
  position: Vec3Schema.default([0, 0, 0]),
  rotation: EulerDegSchema.default([0, 0, 0]),
  load: LoadSchema.optional(),
});
export type EquipmentInstance = z.infer<typeof EquipmentInstanceSchema>;

export function totalLoadKg(load: Load): number {
  switch (load.kind) {
    case 'barbell':
      return load.barKg + 2 * load.platesPerSide.reduce((sum, kg) => sum + kg, 0);
    case 'dumbbell':
      return load.kg;
    case 'stack':
      return load.selectedKg;
  }
}

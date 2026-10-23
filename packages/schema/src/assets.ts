import { z } from 'zod';
import { IdSchema, SocketNameSchema, Vec3Schema } from './common';
import { LoadKindSchema } from './equipment';

export const JOINT_TYPES = ['revolute', 'prismatic', 'cable'] as const;
export const JointTypeSchema = z.enum(JOINT_TYPES);
export type JointType = z.infer<typeof JointTypeSchema>;

/** Parte móvil de una máquina, declarada en los `extras` glTF del nodo. */
export const EquipmentJointSchema = z.strictObject({
  id: SocketNameSchema,
  type: JointTypeSchema,
  /** Eje local; obligatorio para `revolute` y `prismatic`. */
  axis: Vec3Schema.optional(),
  /** Grados para `revolute`, metros para `prismatic`, 0–1 para `cable`. */
  range: z.tuple([z.number(), z.number()]),
  /** Anclas que esta articulación desplaza. */
  drives: z.array(SocketNameSchema).default([]),
});
export type EquipmentJoint = z.infer<typeof EquipmentJointSchema>;

export const EQUIPMENT_CATEGORIES = ['machine', 'bench', 'rack', 'free_weight'] as const;
export const EquipmentCategorySchema = z.enum(EQUIPMENT_CATEGORIES);

export const EquipmentManifestSchema = z
  .strictObject({
    id: IdSchema,
    name: z.string().min(1),
    category: EquipmentCategorySchema,
    /** Ruta del `.glb` relativa a `packages/assets`. Ausente si es paramétrico. */
    file: z.string().optional(),
    /** Generado por código (barras, mancuernas, discos). */
    parametric: z.boolean().default(false),
    anchors: z.array(SocketNameSchema).min(1),
    joints: z.array(EquipmentJointSchema).default([]),
    /** Tipos de carga que admite; vacío si no lleva peso. */
    loadKinds: z.array(LoadKindSchema).default([]),
    /** Pose base sugerida al colocar al personaje en el equipo. */
    defaultPose: IdSchema.optional(),
    thumbnail: z.string().optional(),
  })
  .superRefine((manifest, ctx) => {
    if (!manifest.parametric && !manifest.file) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un equipo no paramétrico necesita "file"',
        path: ['file'],
      });
    }
    manifest.joints.forEach((joint, i) => {
      if (joint.type !== 'cable' && !joint.axis) {
        ctx.addIssue({
          code: 'custom',
          message: `La articulación "${joint.id}" (${joint.type}) necesita "axis"`,
          path: ['joints', i, 'axis'],
        });
      }
      joint.drives.forEach((anchor, j) => {
        if (!manifest.anchors.includes(anchor)) {
          ctx.addIssue({
            code: 'custom',
            message: `La articulación "${joint.id}" mueve un ancla inexistente: "${anchor}"`,
            path: ['joints', i, 'drives', j],
          });
        }
      });
    });
  });
export type EquipmentManifest = z.infer<typeof EquipmentManifestSchema>;

export const CharacterManifestSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  file: z.string().optional(),
});

export const PoseManifestSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
});

/** Catálogo de assets disponibles: lo que el editor muestra en la biblioteca y la IA puede usar. */
export const AssetCatalogSchema = z
  .strictObject({
    characters: z.array(CharacterManifestSchema).min(1),
    poses: z.array(PoseManifestSchema).min(1),
    equipment: z.array(EquipmentManifestSchema),
  })
  .superRefine((catalog, ctx) => {
    for (const key of ['characters', 'poses', 'equipment'] as const) {
      const seen = new Set<string>();
      catalog[key].forEach((item, i) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Id duplicado en ${key}: "${item.id}"`,
            path: [key, i, 'id'],
          });
        }
        seen.add(item.id);
      });
    }
  });
export type AssetCatalog = z.infer<typeof AssetCatalogSchema>;

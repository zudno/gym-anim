import { z } from 'zod';
import { AssetCatalogSchema } from './assets';
import { CommandSchema } from './commands';
import { SceneSchema } from './scene';

/**
 * JSON Schema (draft 2020-12) de la forma de *entrada*: lo que el editor o la IA escriben,
 * con los campos que tienen valor por defecto como opcionales.
 * Las reglas de integridad (`superRefine`) no se pueden expresar aquí; las aplica `parseScene`.
 */
export function buildJsonSchemas() {
  const options = { io: 'input', unrepresentable: 'any' } as const;
  return {
    scene: z.toJSONSchema(SceneSchema, options),
    command: z.toJSONSchema(CommandSchema, options),
    catalog: z.toJSONSchema(AssetCatalogSchema, options),
  };
}

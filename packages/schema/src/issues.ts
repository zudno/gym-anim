import { z } from 'zod';

export const ISSUE_LEVELS = ['error', 'warning'] as const;
export const IssueLevelSchema = z.enum(ISSUE_LEVELS);

/** Formato común de errores/avisos para el editor (panel de problemas) y la IA. */
export const ValidationIssueSchema = z.strictObject({
  level: IssueLevelSchema,
  /** Código estable en MAYÚSCULAS, p. ej. `UNKNOWN_ANCHOR`. */
  code: z.string(),
  message: z.string(),
  /** Ruta dentro de la escena, p. ej. `["constraints", 2, "target"]`. */
  path: z.array(z.union([z.string(), z.number()])).default([]),
  frame: z.int().nonnegative().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export type IssuePath = (string | number)[];

/** Convierte un issue de Zod al formato común. Los `custom` conservan su `params.code`. */
export function issueFromZod(issue: z.core.$ZodIssue): ValidationIssue {
  const customCode =
    issue.code === 'custom' && typeof issue.params?.code === 'string' ? issue.params.code : null;
  return {
    level: 'error',
    code: customCode ?? `SCHEMA_${issue.code.toUpperCase()}`,
    message: issue.message,
    path: issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
  };
}

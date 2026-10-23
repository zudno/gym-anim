import type { z } from 'zod';
import { AssetCatalogSchema, type AssetCatalog } from './assets';
import { CommandSchema, type Command } from './commands';
import { issueFromZod, type ValidationIssue } from './issues';
import { migrateScene } from './migrations';
import { SceneSchema, type Scene } from './scene';

export type ParseResult<T> =
  { success: true; data: T } | { success: false; issues: ValidationIssue[] };

function parseWith<S extends z.ZodType>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: result.error.issues.map(issueFromZod) };
}

/** Migra (si hace falta) y valida una escena cruda. */
export function parseScene(input: unknown): ParseResult<Scene> {
  const migrated = migrateScene(input);
  if (!migrated.ok) return { success: false, issues: [migrated.issue] };
  return parseWith(SceneSchema, migrated.scene);
}

export function parseCommand(input: unknown): ParseResult<Command> {
  return parseWith(CommandSchema, input);
}

export function parseCatalog(input: unknown): ParseResult<AssetCatalog> {
  return parseWith(AssetCatalogSchema, input);
}

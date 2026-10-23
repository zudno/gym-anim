import type { ValidationIssue } from './issues';
import { CURRENT_SCHEMA_VERSION } from './version';

type RawScene = Record<string, unknown>;
type Migration = (scene: RawScene) => RawScene;

/** `MIGRATIONS[n]` convierte una escena de la versión `n` a la `n + 1`. */
const MIGRATIONS: Record<number, Migration> = {};

export type MigrationResult =
  { ok: true; scene: unknown; fromVersion: number | null } | { ok: false; issue: ValidationIssue };

/**
 * Lleva una escena cruda (JSON) a `CURRENT_SCHEMA_VERSION`.
 * Si no tiene `schemaVersion` válido la deja intacta: el esquema reportará el error.
 */
export function migrateScene(input: unknown): MigrationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: true, scene: input, fromVersion: null };
  }
  const version = (input as RawScene).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: true, scene: input, fromVersion: null };
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      issue: {
        level: 'error',
        code: 'SCHEMA_VERSION_UNSUPPORTED',
        message: `La escena usa schemaVersion ${version}; esta versión solo soporta hasta ${CURRENT_SCHEMA_VERSION}`,
        path: ['schemaVersion'],
      },
    };
  }

  let scene = input as RawScene;
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) {
      return {
        ok: false,
        issue: {
          level: 'error',
          code: 'MIGRATION_MISSING',
          message: `Falta la migración de schemaVersion ${v} a ${v + 1}`,
          path: ['schemaVersion'],
        },
      };
    }
    scene = { ...migrate(scene), schemaVersion: v + 1 };
  }
  return { ok: true, scene, fromVersion: version };
}

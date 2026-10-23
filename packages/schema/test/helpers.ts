import { readFileSync } from 'node:fs';
import { parseCatalog, parseScene, type AssetCatalog, type Scene } from '../src';

export const SCENE_FIXTURES = ['dumbbell-curl', 'barbell-bench-press', 'lat-pulldown'] as const;

export function readFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${relativePath}`, import.meta.url), 'utf8'));
}

/** Copia mutable de una escena fixture, para construir casos inválidos. */
export function rawScene(name: (typeof SCENE_FIXTURES)[number]): any {
  return structuredClone(readFixture(`scenes/${name}.json`));
}

export function validScene(name: (typeof SCENE_FIXTURES)[number]): Scene {
  const result = parseScene(rawScene(name));
  if (!result.success) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.data;
}

export function mvpCatalog(): AssetCatalog {
  const result = parseCatalog(readFixture('catalog.mvp.json'));
  if (!result.success) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.data;
}

/** Códigos de error que produce `parseScene` (vacío si la escena es válida). */
export function errorCodes(input: unknown): string[] {
  const result = parseScene(input);
  return result.success ? [] : result.issues.map((issue) => issue.code);
}

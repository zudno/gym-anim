import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseScene, type Scene } from '@gym-anim/schema';
import type { Vec3 } from '../src';

export const SCENES = ['dumbbell-curl', 'barbell-bench-press', 'lat-pulldown'] as const;
export type SceneName = (typeof SCENES)[number];

const require = createRequire(import.meta.url);

/** Copia mutable del JSON de una escena fixture de `@gym-anim/schema`. */
export function rawScene(name: SceneName): any {
  const file = require.resolve(`@gym-anim/schema/fixtures/scenes/${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function scene(input: SceneName | object): Scene {
  const result = parseScene(typeof input === 'string' ? rawScene(input) : input);
  if (!result.success) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.data;
}

/** Redondea a milímetros para snapshots legibles y estables. */
export const mm = (v: Vec3) => v.map((x) => Math.round(x * 1000) / 1000 + 0);

export function expectClose(actual: Vec3, expected: Vec3, tolerance = 1e-6): void {
  const gap = Math.hypot(actual[0] - expected[0], actual[1] - expected[1], actual[2] - expected[2]);
  if (gap > tolerance) {
    throw new Error(`[${actual.join(', ')}] está a ${gap} de [${expected.join(', ')}]`);
  }
}

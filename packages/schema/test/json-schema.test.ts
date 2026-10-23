import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildJsonSchemas } from '../src';

describe('JSON Schema', () => {
  const schemas = buildJsonSchemas();

  it('describe la escena con sus bloques principales', () => {
    const scene = schemas.scene as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(scene.properties)).toEqual(
      expect.arrayContaining(['tempo', 'character', 'equipment', 'constraints', 'keyframes']),
    );
    // En la forma de entrada, los campos con valor por defecto son opcionales.
    expect(scene.required).not.toContain('fps');
    expect(scene.required).toContain('keyframes');
  });

  it.each(Object.keys(schemas))('generated/%s.schema.json está actualizado', (name) => {
    const file = new URL(`../generated/${name}.schema.json`, import.meta.url);
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(onDisk, 'Ejecuta "pnpm generate"').toEqual(schemas[name as keyof typeof schemas]);
  });
});

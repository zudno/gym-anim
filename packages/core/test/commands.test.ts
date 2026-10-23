import type { CommandInput, Scene } from '@gym-anim/schema';
import { describe, expect, it } from 'vitest';
import { applyCommand, applyCommands, emptyScene, invertCommands, uniqueId } from '../src';
import { scene, type SceneName } from './helpers';

/** Aplica, comprueba que el resultado es válido y que el inverso restaura la escena exacta. */
function roundTrip(name: SceneName, commands: CommandInput[]): Scene {
  const original = scene(name);
  const snapshot = structuredClone(original);
  const result = applyCommands(original, commands);
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  expect(original, 'no muta la escena original').toEqual(snapshot);
  expect(result.scene).not.toEqual(original);

  const restored = applyCommands(result.scene, result.inverse);
  if (!restored.ok) throw new Error(JSON.stringify(restored.issues, null, 2));
  expect(restored.scene).toEqual(original);
  return result.scene;
}

const CASES: [string, SceneName, CommandInput[]][] = [
  ['set_character', 'dumbbell-curl', [{ type: 'set_character', basePose: 'seated' }]],
  [
    'add_equipment',
    'dumbbell-curl',
    [{ type: 'add_equipment', equipmentType: 'flat_bench', position: [0, 0, -1] }],
  ],
  [
    'update_equipment',
    'barbell-bench-press',
    [{ type: 'update_equipment', id: 'bench', position: [0, 0, 0.1], rotation: [0, 10, 0] }],
  ],
  [
    'remove_equipment (con restricciones y drivers)',
    'barbell-bench-press',
    [{ type: 'remove_equipment', id: 'bar' }],
  ],
  ['remove_equipment (cargado)', 'dumbbell-curl', [{ type: 'remove_equipment', id: 'db_l' }]],
  [
    'set_load',
    'barbell-bench-press',
    [{ type: 'set_load', equipmentId: 'bar', load: { kind: 'barbell', platesPerSide: [25] } }],
  ],
  ['set_load null', 'lat-pulldown', [{ type: 'set_load', equipmentId: 'lat', load: null }]],
  [
    'add_constraint',
    'dumbbell-curl',
    [{ type: 'add_constraint', effector: 'pelvis', target: 'world', offset: [0, 0.94, 0] }],
  ],
  ['remove_constraint', 'lat-pulldown', [{ type: 'remove_constraint', id: 'grip_l' }]],
  [
    'set_keyframe (fusión)',
    'barbell-bench-press',
    [{ type: 'set_keyframe', t: 1, drivers: { 'bar.position': [0, 0.8, -0.2] }, ease: 'linear' }],
  ],
  [
    'set_keyframe (nuevo t)',
    'lat-pulldown',
    [{ type: 'set_keyframe', t: 0.5, drivers: { 'lat.t': 0.7 } }],
  ],
  [
    'remove_keyframe',
    'lat-pulldown',
    [
      { type: 'set_keyframe', t: 0.5, drivers: { 'lat.t': 0.7 } },
      { type: 'remove_keyframe', t: 1 },
      { type: 'set_keyframe', t: 1, drivers: { 'lat.t': 1 } },
    ],
  ],
  ['set_tempo', 'dumbbell-curl', [{ type: 'set_tempo', eccentric: 3, pauseStart: 0.5 }]],
  ['set_loop', 'dumbbell-curl', [{ type: 'set_loop', mode: 'repeat' }]],
  ['set_muscles', 'lat-pulldown', [{ type: 'set_muscles', secondary: ['biceps_brachii'] }]],
  ['set_camera', 'lat-pulldown', [{ type: 'set_camera', camera: { preset: 'back' } }]],
  ['set_render', 'lat-pulldown', [{ type: 'set_render', transparent: true, width: 720 }]],
  [
    'set_pole (nuevo)',
    'barbell-bench-press',
    [{ type: 'set_pole', limb: 'knee_L', direction: [1, 0, 0] }],
  ],
  ['set_pole (quitar)', 'lat-pulldown', [{ type: 'set_pole', limb: 'elbow_L', direction: null }]],
  ['create_scene', 'lat-pulldown', [{ type: 'create_scene', name: 'Remo con mancuerna' }]],
  [
    'lote: añadir barra con drivers en todos los keyframes y agarrarla',
    'dumbbell-curl',
    [
      { type: 'remove_equipment', id: 'db_l' },
      { type: 'remove_equipment', id: 'db_r' },
      { type: 'add_equipment', id: 'bar', equipmentType: 'barbell' },
      { type: 'add_constraint', effector: 'hand_L', target: 'bar.grip_L', mode: 'follow' },
      { type: 'add_constraint', effector: 'hand_R', target: 'bar.grip_R', mode: 'follow' },
      { type: 'set_keyframe', t: 0, drivers: { 'bar.position': [0, 0.8, 0.1] } },
      { type: 'set_keyframe', t: 1, drivers: { 'bar.position': [0, 1.3, 0.25] } },
    ],
  ],
];

describe('applyCommands: ida y vuelta exacta', () => {
  it.each(CASES)('%s', (_, name, commands) => {
    roundTrip(name, commands);
  });
});

describe('efectos concretos', () => {
  it('remove_equipment quita sus restricciones y drivers', () => {
    const result = roundTrip('barbell-bench-press', [{ type: 'remove_equipment', id: 'bar' }]);
    expect(result.equipment.map((e) => e.id)).toEqual(['bench']);
    expect(result.constraints.map((c) => c.id)).toEqual(['seat', 'back', 'foot_l', 'foot_r']);
    expect(result.keyframes.map((k) => k.drivers)).toEqual([{}, {}]);
  });

  it('genera ids únicos y válidos', () => {
    const result = applyCommands(scene('dumbbell-curl'), [
      { type: 'add_equipment', equipmentType: 'barbell' },
      { type: 'add_equipment', equipmentType: 'barbell' },
      { type: 'add_constraint', effector: 'pelvis', target: 'floor' },
    ]);
    expect(result.ok && result.scene.equipment.map((e) => e.id)).toEqual([
      'db_l',
      'db_r',
      'barbell',
      'barbell_2',
    ]);
    expect(result.ok && result.scene.constraints.at(-1)!.id).toBe('pelvis');
    expect(uniqueId('hand_L', new Set(['hand_l']))).toBe('hand_l_2');
  });

  it('create_scene usa plantillas', () => {
    const template = scene('lat-pulldown');
    const result = applyCommand(
      emptyScene('vacia', 'Vacía'),
      { type: 'create_scene', name: 'Jalón agarre cerrado', template: 'lat' },
      { templates: { lat: template } },
    );
    expect(result.ok && result.scene).toEqual({
      ...template,
      id: 'jalon-agarre-cerrado',
      name: 'Jalón agarre cerrado',
    });
  });

  it('invertCommands devuelve el inverso o null', () => {
    const s = scene('lat-pulldown');
    expect(invertCommands(s, [{ type: 'set_loop', mode: 'none' }])).toEqual([
      { type: 'set_loop', mode: 'pingpong' },
    ]);
    expect(invertCommands(s, [{ type: 'remove_constraint', id: 'nada' }])).toBeNull();
  });
});

describe('errores', () => {
  const codes = (result: ReturnType<typeof applyCommands>) =>
    result.ok ? [] : result.issues.map((i) => `${i.code}@${i.path.join('.')}`);

  it('el lote es atómico: un error descarta todo', () => {
    const s = scene('lat-pulldown');
    const result = applyCommands(s, [
      { type: 'set_loop', mode: 'none' },
      { type: 'remove_equipment', id: 'banco' },
    ]);
    expect(codes(result)).toEqual(['EQUIPMENT_NOT_FOUND@commands.1']);
  });

  it('valida la forma de cada comando', () => {
    const result = applyCommands(scene('lat-pulldown'), [
      { type: 'set_loop', mode: 'none' },
      { type: 'set_loop', mode: 'forever' },
    ]);
    expect(codes(result)).toEqual(['SCHEMA_INVALID_VALUE@commands.1.mode']);
  });

  it('valida la escena resultante al final del lote', () => {
    // Un driver nuevo en un solo keyframe deja la escena inconsistente.
    const result = applyCommands(scene('lat-pulldown'), [
      { type: 'set_keyframe', t: 1, drivers: { 'lat.position': [0, 0, 1] } },
    ]);
    expect(codes(result)).toEqual(['DRIVER_KEYS_MISMATCH@keyframes.1.drivers']);
  });

  it('rechaza ids duplicados y referencias inexistentes', () => {
    const s = scene('barbell-bench-press');
    expect(
      codes(applyCommand(s, { type: 'add_equipment', id: 'bar', equipmentType: 'barbell' })),
    ).toEqual(['DUPLICATE_ID@commands.0']);
    expect(codes(applyCommand(s, { type: 'remove_constraint', id: 'x' }))).toEqual([
      'CONSTRAINT_NOT_FOUND@commands.0',
    ]);
    expect(codes(applyCommand(s, { type: 'remove_keyframe', t: 0.5 }))).toEqual([
      'KEYFRAME_NOT_FOUND@commands.0',
    ]);
    expect(codes(applyCommand(s, { type: 'create_scene', name: 'X', template: 'nada' }))).toEqual([
      'TEMPLATE_NOT_FOUND@commands.0',
    ]);
  });

  it('quitar un equipo usado por drivers sin quitar sus restricciones sigue siendo coherente', () => {
    const result = applyCommand(scene('lat-pulldown'), { type: 'remove_equipment', id: 'lat' });
    expect(result.ok).toBe(true);
  });
});

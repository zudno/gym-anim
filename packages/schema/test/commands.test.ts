import { describe, expect, it } from 'vitest';
import { parseCommand, totalLoadKg, type CommandInput } from '../src';

const VALID_COMMANDS: CommandInput[] = [
  { type: 'create_scene', name: 'Remo con mancuerna', template: 'dumbbell_row' },
  {
    type: 'add_equipment',
    equipmentType: 'barbell',
    load: { kind: 'barbell', platesPerSide: [20] },
  },
  { type: 'add_constraint', effector: 'hand_L', target: 'bar.grip_L', mode: 'follow' },
  { type: 'set_keyframe', t: 1, drivers: { 'bar.position': [0, 0.8, -0.2] } },
  { type: 'set_muscles', primary: ['latissimus_dorsi'] },
  { type: 'set_camera', camera: { preset: 'left' } },
  { type: 'set_pole', limb: 'elbow_L', direction: null },
];

describe('comandos', () => {
  it.each(VALID_COMMANDS)('acepta $type', (command) => {
    expect(parseCommand(command).success).toBe(true);
  });

  it('rechaza tipos de comando desconocidos', () => {
    expect(parseCommand({ type: 'delete_everything' }).success).toBe(false);
  });

  it('los parches no rellenan valores por defecto', () => {
    const result = parseCommand({ type: 'set_tempo', eccentric: 3 });
    expect(result.success && result.data).toEqual({ type: 'set_tempo', eccentric: 3 });
  });

  it('no permite restringir un efector de pole', () => {
    expect(
      parseCommand({ type: 'add_constraint', effector: 'elbow_L', target: 'floor' }).success,
    ).toBe(false);
  });
});

describe('cargas', () => {
  it('totalLoadKg suma barra y discos de ambos lados', () => {
    expect(totalLoadKg({ kind: 'barbell', barKg: 20, platesPerSide: [20, 10] })).toBe(80);
    expect(totalLoadKg({ kind: 'dumbbell', kg: 12 })).toBe(12);
    expect(totalLoadKg({ kind: 'stack', selectedKg: 45 })).toBe(45);
  });
});

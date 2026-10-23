import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_LIBRARY,
  barbellGeometry,
  dumbbellGeometry,
  evaluateEquipment,
  stackGeometry,
  type EquipmentDefinition,
} from '../src';
import { expectClose } from './helpers';

const instance = (type: string, id = 'eq') => ({
  id,
  type,
  position: [1, 0, 0] as [number, number, number],
  rotation: [0, 90, 0] as [number, number, number],
});

describe('evaluateEquipment', () => {
  it('aplica posición y rotación de la escena a las anclas', () => {
    const bar = evaluateEquipment(instance('barbell'), PLACEHOLDER_LIBRARY.barbell, {});
    // Girada 90° en Y: el eje X de la barra apunta a −Z.
    expectClose(bar.anchors.grip_L!.position, [1, 0, -0.4]);
  });

  it('los drivers de posición sustituyen a la posición de la escena', () => {
    const bar = evaluateEquipment(instance('barbell', 'bar'), PLACEHOLDER_LIBRARY.barbell, {
      'bar.position': [0, 1, 0],
      'bar.rotation': [0, 0, 0],
    });
    expectClose(bar.anchors.grip_R!.position, [-0.4, 1, 0]);
  });

  it('el parámetro t de la máquina mueve las anclas del cable', () => {
    const item = {
      ...instance('lat_pulldown', 'lat'),
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    };
    const top = evaluateEquipment(item, PLACEHOLDER_LIBRARY.lat_pulldown, { 'lat.t': 0 });
    const bottom = evaluateEquipment(item, PLACEHOLDER_LIBRARY.lat_pulldown, { 'lat.t': 1 });
    expectClose(top.anchors.grip_L!.position, [0.42, 1.52, 0.1]);
    expectClose(bottom.anchors.grip_L!.position, [0.42, 1.0, 0.16], 1e-3);
    expect(bottom.joints.bar).toBeCloseTo(0.5235);
    // El asiento no se mueve.
    expect(bottom.anchors.seat).toEqual(top.anchors.seat);
  });

  it('una articulación revolute gira sus anclas alrededor del pivote', () => {
    const lever: EquipmentDefinition = {
      type: 'lever',
      anchors: { handle: { position: [0, 1, 0.5] } },
      joints: [
        {
          id: 'arm',
          type: 'revolute',
          axis: [1, 0, 0],
          pivot: [0, 1, 0],
          range: [0, 90],
          drives: ['handle'],
        },
      ],
    };
    const item = {
      id: 'lv',
      type: 'lever',
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    };
    const result = evaluateEquipment(item, lever, { 'lv.t': 1 });
    expectClose(result.anchors.handle!.position, [0, 0.5, 0]);
  });
});

describe('pesas paramétricas', () => {
  it('coloca los discos de dentro hacia fuera en ambos lados', () => {
    const bar = barbellGeometry({ kind: 'barbell', barKg: 20, platesPerSide: [20, 10] });
    expect(bar.totalKg).toBe(80);
    expect(bar.plates).toHaveLength(4);
    const left = bar.plates.filter((p) => p.side === 1);
    expect(left[0]!.x).toBeCloseTo(0.655 + 0.045 / 2);
    expect(left[1]!.x).toBeCloseTo(0.655 + 0.045 + 0.03 / 2);
    expect(bar.overflow).toBe(false);
  });

  it('detecta discos que no caben en la manga', () => {
    const bar = barbellGeometry({ kind: 'barbell', barKg: 20, platesPerSide: Array(8).fill(25) });
    expect(bar.overflow).toBe(true);
  });

  it('las mancuernas crecen con el peso', () => {
    const light = dumbbellGeometry(5);
    const heavy = dumbbellGeometry(40);
    expect(heavy.headDiameter).toBeGreaterThan(light.headDiameter);
    expect(heavy.totalLength).toBeGreaterThan(light.totalLength);
    expect(dumbbellGeometry(12).headDiameter).toBeGreaterThan(0.08);
    expect(dumbbellGeometry(12).headDiameter).toBeLessThan(0.16);
  });

  it('el stack selecciona placas según los kg', () => {
    expect(stackGeometry(45).selectedPlates).toBe(9);
    expect(stackGeometry(500).selectedPlates).toBe(20);
  });
});

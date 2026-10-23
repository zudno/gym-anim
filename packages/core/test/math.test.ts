import { describe, expect, it } from 'vitest';
import {
  DEG,
  IDENTITY,
  quatAngle,
  quatFromAxisAngle,
  quatFromBasisPair,
  quatFromEulerDeg,
  quatFromUnitVectors,
  quatInvert,
  quatMultiply,
  quatSlerp,
  rotate,
  type Vec3,
} from '../src';
import { expectClose } from './helpers';

describe('cuaterniones', () => {
  it('rota alrededor de un eje con la regla de la mano derecha', () => {
    expectClose(rotate(quatFromAxisAngle([0, 0, 1], 90 * DEG), [1, 0, 0]), [0, 1, 0]);
    expectClose(rotate(quatFromAxisAngle([1, 0, 0], 90 * DEG), [0, 1, 0]), [0, 0, 1]);
  });

  it('Euler XYZ equivale a qx · qy · qz', () => {
    const q = quatFromEulerDeg([30, 45, 60]);
    const expected = quatMultiply(
      quatMultiply(quatFromAxisAngle([1, 0, 0], 30 * DEG), quatFromAxisAngle([0, 1, 0], 45 * DEG)),
      quatFromAxisAngle([0, 0, 1], 60 * DEG),
    );
    expect(quatAngle(q, expected)).toBeCloseTo(0);
  });

  it('el inverso deshace la rotación', () => {
    const q = quatFromEulerDeg([10, -70, 25]);
    expectClose(rotate(quatInvert(q), rotate(q, [0.3, -1, 2])), [0.3, -1, 2]);
  });

  it('quatFromUnitVectors, incluso con vectores opuestos', () => {
    expectClose(rotate(quatFromUnitVectors([1, 0, 0], [0, 0, 1]), [1, 0, 0]), [0, 0, 1]);
    expectClose(rotate(quatFromUnitVectors([0, 1, 0], [0, -1, 0]), [0, 1, 0]), [0, -1, 0]);
  });

  it('quatFromBasisPair alinea el eje principal y orienta el secundario', () => {
    const from: [Vec3, Vec3] = [
      [0, -1, 0],
      [0, 0, 1],
    ];
    const to: [Vec3, Vec3] = [
      [1, 0, 0],
      [0, 1, 0.2],
    ];
    const q = quatFromBasisPair(from[0], from[1], to[0], to[1]);
    expectClose(rotate(q, from[0]), to[0]);
    const secondary = rotate(q, from[1]);
    expect(secondary[1]).toBeGreaterThan(0.95);
  });

  it('slerp interpola el ángulo de forma lineal', () => {
    const q = quatFromAxisAngle([0, 1, 0], 90 * DEG);
    expect(quatAngle(IDENTITY, quatSlerp(IDENTITY, q, 0.5))).toBeCloseTo(45 * DEG);
  });
});

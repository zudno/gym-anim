import { describe, expect, it } from 'vitest';
import { cycleDuration, lintScene, parseDriverKey, parseScene } from '../src';
import { SCENE_FIXTURES, mvpCatalog, rawScene, validScene } from './helpers';

describe('fixtures del MVP', () => {
  it('el catálogo MVP es válido', () => {
    expect(() => mvpCatalog()).not.toThrow();
  });

  it.each(SCENE_FIXTURES)('%s es válida y sin avisos contra el catálogo', (name) => {
    const result = parseScene(rawScene(name));
    expect(result.success ? [] : result.issues).toEqual([]);
    expect(lintScene(validScene(name), mvpCatalog())).toEqual([]);
  });

  it('cubre los tres tipos de driver', () => {
    const driverKinds = (name: (typeof SCENE_FIXTURES)[number]) =>
      Object.keys(validScene(name).keyframes[0]!.drivers).map((key) => {
        const ref = parseDriverKey(key)!;
        return ref.kind === 'joint' ? 'joint' : ref.property;
      });
    expect(driverKinds('dumbbell-curl')).toEqual(['joint', 'joint']);
    expect(driverKinds('barbell-bench-press')).toEqual(['position']);
    expect(driverKinds('lat-pulldown')).toEqual(['t']);
  });

  it('calcula la duración del ciclo a partir del tempo', () => {
    const duration = (name: (typeof SCENE_FIXTURES)[number]) => {
      const scene = validScene(name);
      return cycleDuration(scene.tempo, scene.loop);
    };
    expect(duration('dumbbell-curl')).toBeCloseTo(3.3);
    expect(duration('barbell-bench-press')).toBeCloseTo(3.2);
    expect(duration('lat-pulldown')).toBeCloseTo(3.3);
  });
});

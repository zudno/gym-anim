import { describe, expect, it } from 'vitest';
import { validateMotion } from '../src';
import { SCENES, rawScene, scene } from './helpers';

describe('validateMotion', () => {
  it.each(SCENES)('%s no tiene problemas en todo el ciclo', (name) => {
    expect(validateMotion(scene(name))).toEqual([]);
  });

  it('reporta cada problema una vez, con el primer frame en que aparece', () => {
    const raw = rawScene('barbell-bench-press');
    raw.keyframes[1].drivers['bar.position'] = [0, 1.6, -0.3];
    const issues = validateMotion(scene(raw));
    expect(issues.map((i) => i.code)).toEqual(['IK_UNREACHABLE', 'IK_UNREACHABLE']);
    // Pausa inicial de 0.2 s a 30 fps: el problema empieza a mitad de la fase excéntrica.
    expect(issues[0]!.frame).toBeGreaterThan(6);
  });

  it('avisa si un pie fijado al suelo se desliza', () => {
    // La pelvis sigue a una barra que sube más de lo que alcanzan las piernas.
    const raw = rawScene('dumbbell-curl');
    raw.equipment.push({ id: 'bar', type: 'barbell' });
    raw.constraints.push({ id: 'hips', effector: 'pelvis', target: 'bar.grip_L' });
    raw.keyframes[0].drivers['bar.position'] = [-0.4, 0.94, 0];
    raw.keyframes[1].drivers['bar.position'] = [-0.4, 1.1, 0];
    const codes = validateMotion(scene(raw)).map((i) => i.code);
    expect(codes).toContain('FOOT_SLIDING');
    expect(codes).toContain('IK_UNREACHABLE');
  });
});

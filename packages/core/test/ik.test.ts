import { describe, expect, it } from 'vitest';
import {
  BASE_POSES,
  REFERENCE_RIG,
  distance,
  dot,
  effectorPoint,
  forwardKinematics,
  localRotations,
  normalize,
  quatAngle,
  quatFromAxisAngle,
  solveLimb,
  solveTwoBone,
  sub,
  DEG,
  type Vec3,
} from '../src';
import { expectClose } from './helpers';

describe('solveTwoBone', () => {
  const base = { root: [0, 0, 0] as Vec3, upperLength: 0.3, lowerLength: 0.25 };

  it('alcanza el objetivo y respeta las longitudes', () => {
    const r = solveTwoBone({ ...base, target: [0.2, -0.3, 0.1], pole: [0, 0, -1] });
    expect(r.reachable).toBe(true);
    expectClose(r.end, [0.2, -0.3, 0.1]);
    expect(distance(r.mid, [0, 0, 0])).toBeCloseTo(0.3);
    expect(distance(r.mid, r.end)).toBeCloseTo(0.25);
  });

  it('la articulación media sale hacia el pole', () => {
    const back = solveTwoBone({ ...base, target: [0, -0.4, 0], pole: [0, 0, -1] });
    const front = solveTwoBone({ ...base, target: [0, -0.4, 0], pole: [0, 0, 1] });
    expect(back.mid[2]).toBeLessThan(0);
    expect(front.mid[2]).toBeGreaterThan(0);
  });

  it('extiende la cadena y avisa si el objetivo está lejos', () => {
    const r = solveTwoBone({ ...base, target: [0, -2, 0], pole: [0, 0, 1] });
    expect(r.reachable).toBe(false);
    expect(r.bend).toBeCloseTo(0, 2);
    expect(dot(r.upperDir, [0, -1, 0])).toBeCloseTo(1);
  });

  it('no falla si el pole es paralelo a la dirección del objetivo', () => {
    const r = solveTwoBone({ ...base, target: [0, -0.4, 0], pole: [0, -1, 0] });
    expectClose(r.end, [0, -0.4, 0]);
  });
});

describe('solveLimb', () => {
  const setup = () => {
    const pose = BASE_POSES.standing!;
    const root = { position: pose.root.position, rotation: [0, 0, 0, 1] as const };
    const local = localRotations(REFERENCE_RIG, pose.joints);
    return { root, local, world: forwardKinematics(REFERENCE_RIG, root, local) };
  };

  it('lleva la mano al objetivo con la muñeca recta', () => {
    const { root, local, world } = setup();
    const target: Vec3 = [0.3, 1.2, 0.35];
    solveLimb(
      REFERENCE_RIG,
      REFERENCE_RIG.limbs.arm_L,
      world,
      local,
      { position: target, rotation: null },
      [0, 0, -1],
    );
    const after = forwardKinematics(REFERENCE_RIG, root, local);
    expectClose(effectorPoint(REFERENCE_RIG, after, 'hand_L'), target, 1e-6);
    // Muñeca recta: la mano conserva la orientación del antebrazo.
    expect(quatAngle(after.hand_L.rotation, after.forearm_L.rotation)).toBeCloseTo(0);
  });

  it('respeta la orientación pedida para el pie', () => {
    const { root, local, world } = setup();
    const rotation = quatFromAxisAngle([0, 1, 0], 30 * DEG);
    const target: Vec3 = [0.15, 0.1, 0.2];
    solveLimb(
      REFERENCE_RIG,
      REFERENCE_RIG.limbs.leg_L,
      world,
      local,
      { position: target, rotation },
      [0, 0, 1],
    );
    const after = forwardKinematics(REFERENCE_RIG, root, local);
    expectClose(effectorPoint(REFERENCE_RIG, after, 'foot_L'), target, 1e-6);
    expect(quatAngle(after.foot_L.rotation, rotation)).toBeCloseTo(0);
    // La rodilla dobla hacia delante (pole +Z).
    const kneeOut = sub(after.shin_L.position, after.thigh_L.position);
    expect(normalize(kneeOut)[2]).toBeGreaterThan(0);
  });

  it('el codo flexiona en el rango anatómico', () => {
    const { local, world } = setup();
    const solution = solveLimb(
      REFERENCE_RIG,
      REFERENCE_RIG.limbs.arm_L,
      world,
      local,
      { position: [0.18, 1.3, 0.3], rotation: null },
      [0, 0, -1],
    );
    expect(solution.reachable).toBe(true);
    expect(solution.midFlexDeg).toBeGreaterThan(90);
    expect(solution.midFlexDeg).toBeLessThan(150);
  });
});

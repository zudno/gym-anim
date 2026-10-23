import { BONES, EFFECTORS } from '@gym-anim/schema';
import { describe, expect, it } from 'vitest';
import {
  BASE_POSES,
  REFERENCE_RIG,
  boneDefinition,
  cross,
  effectorPoint,
  forwardKinematics,
  length,
  localRotations,
  normalize,
  quatFromEulerDeg,
} from '../src';

describe('rig de referencia', () => {
  it('tiene exactamente los huesos del esquema, de padre a hijo', () => {
    const names = REFERENCE_RIG.bones.map((b) => b.name);
    expect([...names].sort()).toEqual([...BONES].sort());
    const seen = new Set<string>();
    for (const bone of REFERENCE_RIG.bones) {
      if (bone.parent) expect(seen.has(bone.parent), `${bone.name} antes que su padre`).toBe(true);
      seen.add(bone.name);
    }
  });

  it('define un punto para cada efector', () => {
    expect(Object.keys(REFERENCE_RIG.effectorPoints).sort()).toEqual([...EFFECTORS].sort());
  });

  it('las cadenas de las extremidades son colineales en reposo y doblan en perpendicular', () => {
    for (const limb of Object.values(REFERENCE_RIG.limbs)) {
      const upper = normalize(boneDefinition(REFERENCE_RIG, limb.mid).offset);
      const lower = normalize(boneDefinition(REFERENCE_RIG, limb.end).offset);
      expect(length(cross(upper, lower))).toBeCloseTo(0);
      expect(length(cross(upper, limb.bend))).toBeCloseTo(1);
    }
  });

  it('las poses base tienen los pies a la altura esperada', () => {
    const footHeight = (poseId: string) => {
      const pose = BASE_POSES[poseId]!;
      const world = forwardKinematics(
        REFERENCE_RIG,
        { position: pose.root.position, rotation: quatFromEulerDeg(pose.root.rotation) },
        localRotations(REFERENCE_RIG, pose.joints),
      );
      return effectorPoint(REFERENCE_RIG, world, 'foot_L')[1];
    };
    // De pie, con las piernas extendidas, la planta queda a ras de suelo (±1.5 cm; el IK la apoya).
    expect(Math.abs(footHeight('standing'))).toBeLessThan(0.015);
    // Sentado a 0.52 m con muslos horizontales y tibias verticales, los pies quedan apoyados.
    expect(footHeight('seated')).toBeCloseTo(0, 6);
  });
});

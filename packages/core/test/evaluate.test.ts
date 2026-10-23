import { parseTarget } from '@gym-anim/schema';
import { describe, expect, it } from 'vitest';
import {
  REACH_TOLERANCE,
  distance,
  evaluate,
  evaluateFrame,
  evaluateProgress,
  frameCount,
  quatAngle,
  rotate,
  type EvaluatedFrame,
} from '../src';
import { SCENES, mm, rawScene, scene } from './helpers';

const codes = (frame: EvaluatedFrame) => frame.issues.map((i) => i.code);

describe.each(SCENES)('%s', (name) => {
  const s = scene(name);

  it('cada frame del ciclo cumple todas las restricciones sin errores', () => {
    for (let f = 0; f < frameCount(s); f++) {
      const frame = evaluateFrame(s, f);
      expect(frame.issues, `frame ${f}`).toEqual([]);
      for (const constraint of s.constraints) {
        const target = parseTarget(constraint.target)!;
        if (constraint.mode === 'carry' || target.kind !== 'anchor') continue;
        const anchor = frame.equipment[target.equipmentId]!.anchors[target.anchor]!;
        expect(distance(frame.effectors[constraint.effector], anchor.position)).toBeLessThan(
          REACH_TOLERANCE,
        );
      }
    }
  });

  it('los pies quedan apoyados en el suelo o en su ancla', () => {
    for (const u of [0, 0.5, 1]) {
      const frame = evaluateProgress(s, u);
      expect(frame.effectors.foot_L[1]).toBeCloseTo(0, 6);
      expect(frame.effectors.foot_R[1]).toBeCloseTo(0, 6);
    }
  });

  it('es determinista', () => {
    expect(evaluate(s, 1.234)).toEqual(evaluate(s, 1.234));
  });

  it('pose inicial, media y final (snapshot en mm)', () => {
    const summary = [0, 0.5, 1].map((u) => {
      const frame = evaluateProgress(s, u);
      return {
        u,
        effectors: Object.fromEntries(Object.entries(frame.effectors).map(([k, v]) => [k, mm(v)])),
        equipment: Object.fromEntries(
          Object.entries(frame.equipment).map(([k, v]) => [k, mm(v.position)]),
        ),
      };
    });
    expect(summary).toMatchSnapshot();
  });
});

describe('restricciones concretas', () => {
  it('curl: la mancuerna sigue a la mano y sube con la flexión del codo', () => {
    const s = scene('dumbbell-curl');
    const bottom = evaluateProgress(s, 0);
    const top = evaluateProgress(s, 1);
    for (const frame of [bottom, top]) {
      expect(distance(frame.equipment.db_l!.position, frame.effectors.hand_L)).toBeLessThan(1e-9);
      expect(frame.equipment.db_l!.carriedBy).toBe('hand_L');
    }
    expect(top.effectors.hand_L[1] - bottom.effectors.hand_L[1]).toBeGreaterThan(0.5);
    // El mango va en el eje Z de la mano (agarre neutro).
    const handle = rotate(bottom.equipment.db_l!.rotation, [1, 0, 0]);
    const handZ = rotate(bottom.bones.hand_L.rotation, [0, 0, 1]);
    expect(
      Math.abs(handle[0] * handZ[0] + handle[1] * handZ[1] + handle[2] * handZ[2]),
    ).toBeCloseTo(1);
  });

  it('press banca: tumbado sobre el banco, cabeza hacia −Z y codos hacia fuera', () => {
    const frame = evaluateProgress(scene('barbell-bench-press'), 0.5);
    expect(frame.effectors.head[2]).toBeLessThan(frame.effectors.pelvis[2]);
    expect(frame.effectors.head[1]).toBeCloseTo(frame.effectors.pelvis[1], 2);
    expect(frame.effectors.elbow_L[0]).toBeGreaterThan(frame.bones.upper_arm_L.position[0]);
    expect(frame.effectors.elbow_R[0]).toBeLessThan(frame.bones.upper_arm_R.position[0]);
    // Rodillas hacia arriba.
    expect(frame.effectors.knee_L[1]).toBeGreaterThan(frame.effectors.foot_L[1] + 0.3);
  });

  it('jalón: el stack sube lo mismo que baja la barra y las manos la acompañan', () => {
    const s = scene('lat-pulldown');
    const top = evaluateProgress(s, 0);
    const bottom = evaluateProgress(s, 1);
    expect(top.equipment.lat!.joints.bar).toBe(0);
    expect(bottom.equipment.lat!.joints.bar).toBeCloseTo(0.5235);
    expect(top.effectors.hand_L[1] - bottom.effectors.hand_L[1]).toBeCloseTo(0.52, 2);
    // Pole hacia fuera: los codos quedan por fuera de los hombros.
    expect(bottom.effectors.elbow_L[0]).toBeGreaterThan(bottom.bones.upper_arm_L.position[0]);
  });

  it('el pole cambia hacia dónde apunta el codo', () => {
    const raw = rawScene('lat-pulldown');
    raw.character.poles = { elbow_L: [0, 0, 1], elbow_R: [0, 0, 1] };
    const forward = evaluateProgress(scene(raw), 1);
    raw.character.poles = { elbow_L: [0, 0, -1], elbow_R: [0, 0, -1] };
    const back = evaluateProgress(scene(raw), 1);
    expect(forward.effectors.elbow_L[2]).toBeGreaterThan(back.effectors.elbow_L[2]);
  });

  it('weight 0 ignora la restricción', () => {
    const raw = rawScene('lat-pulldown');
    for (const c of raw.constraints) if (c.effector === 'hand_L') c.weight = 0;
    const frame = evaluateProgress(scene(raw), 1);
    const grip = frame.equipment.lat!.anchors.grip_L!.position;
    expect(distance(frame.effectors.hand_L, grip)).toBeGreaterThan(0.2);
    expect(frame.issues).toEqual([]);
  });

  it('un ancla orientada fija la orientación del pie', () => {
    const frame = evaluateProgress(scene('lat-pulldown'), 0);
    expect(
      quatAngle(frame.bones.foot_L.rotation, frame.equipment.lat!.anchors.foot_L!.rotation),
    ).toBeCloseTo(0);
  });
});

describe('problemas por frame', () => {
  it('IK_UNREACHABLE si la barra está fuera del alcance de los brazos', () => {
    const raw = rawScene('barbell-bench-press');
    raw.keyframes[0].drivers['bar.position'] = [0, 1.6, -0.3];
    const frame = evaluateProgress(scene(raw), 0);
    expect(codes(frame)).toEqual(['IK_UNREACHABLE', 'IK_UNREACHABLE']);
    expect(frame.issues[0]!.path).toEqual(['constraints', 4]);
  });

  it('JOINT_LIMIT si un driver articular supera el rango', () => {
    const raw = rawScene('dumbbell-curl');
    raw.keyframes[1].drivers['character.forearm_L.flex'] = 170;
    expect(codes(evaluateProgress(scene(raw), 1))).toEqual(['JOINT_LIMIT']);
  });

  it('reporta equipos sin definición 3D y anclas inexistentes', () => {
    const raw = rawScene('barbell-bench-press');
    raw.equipment[0].type = 'incline_bench';
    raw.constraints[4].target = 'bar.handle';
    const frame = evaluateProgress(scene(raw), 0);
    expect(codes(frame)).toEqual(['UNKNOWN_EQUIPMENT_DEFINITION', 'UNKNOWN_ANCHOR']);
  });

  it('reporta poses base desconocidas y usa la de pie', () => {
    const raw = rawScene('dumbbell-curl');
    raw.character.basePose = 'kneeling';
    const frame = evaluateProgress(scene(raw), 0);
    expect(codes(frame)).toEqual(['UNKNOWN_POSE']);
    expect(frame.effectors.pelvis[1]).toBeCloseTo(0.94);
  });
});

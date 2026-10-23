import { describe, expect, it } from 'vitest';
import { cycleDuration, parseDriverKey, parseScene, parseTarget } from '../src';
import { errorCodes, rawScene } from './helpers';

describe('valores por defecto', () => {
  it('completa los campos opcionales de una escena mínima', () => {
    const result = parseScene({
      schemaVersion: 1,
      id: 'minima',
      name: 'Mínima',
      tempo: { eccentric: 2, concentric: 1 },
      character: { model: 'male_athletic', basePose: 'standing' },
      keyframes: [
        { t: 0, drivers: {} },
        { t: 1, drivers: {} },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const scene = result.data;
    expect(scene.fps).toBe(30);
    expect(scene.loop).toBe('pingpong');
    expect(scene.tempo).toMatchObject({ startPhase: 'eccentric', pauseStart: 0, pauseEnd: 0 });
    expect(scene.character.muscles).toEqual({ primary: [], secondary: [] });
    expect(scene.camera).toEqual({ preset: 'three_quarter_left', fov: 35 });
    expect(scene.render).toEqual({
      look: 'studio',
      background: '#ffffff',
      transparent: false,
      width: 1080,
      height: 1080,
    });
    expect(scene.keyframes[0]!.ease).toBe('inOutSine');
  });

  it('rechaza claves desconocidas (protege contra errores de la IA)', () => {
    const scene = rawScene('dumbbell-curl');
    scene.character.muscle = ['biceps_brachii'];
    expect(errorCodes(scene)).toEqual(['SCHEMA_UNRECOGNIZED_KEYS']);
  });

  it('rechaza una cámara sin preset ni posición', () => {
    const scene = rawScene('dumbbell-curl');
    scene.camera = { fov: 40 };
    expect(errorCodes(scene)).toHaveLength(1);
  });
});

describe('equipos y restricciones', () => {
  it('detecta ids de equipo duplicados y reservados', () => {
    const scene = rawScene('dumbbell-curl');
    scene.equipment[1].id = 'db_l';
    expect(errorCodes(scene)).toContain('DUPLICATE_EQUIPMENT_ID');

    const reserved = rawScene('lat-pulldown');
    reserved.equipment[0].id = 'floor';
    expect(errorCodes(reserved)).toContain('RESERVED_EQUIPMENT_ID');
  });

  it('detecta objetivos con equipos inexistentes', () => {
    const scene = rawScene('barbell-bench-press');
    scene.constraints[0].target = 'banco.seat';
    expect(errorCodes(scene)).toEqual(['UNKNOWN_TARGET_EQUIPMENT']);
  });

  it('rechaza objetivos mal formados', () => {
    const scene = rawScene('barbell-bench-press');
    scene.constraints[0].target = 'bench';
    expect(errorCodes(scene)).toHaveLength(1);
  });

  it('exige un ancla para "follow" y "carry"', () => {
    const scene = rawScene('barbell-bench-press');
    scene.constraints[4].target = 'floor';
    expect(errorCodes(scene)).toEqual(['INVALID_TARGET_FOR_MODE']);
  });

  it('solo las manos pueden cargar, y un objeto solo con una mano', () => {
    const foot = rawScene('dumbbell-curl');
    foot.constraints[0] = { id: 'x', effector: 'foot_L', target: 'db_l.grip', mode: 'carry' };
    expect(errorCodes(foot)).toContain('CARRY_REQUIRES_HAND');

    const twoHands = rawScene('dumbbell-curl');
    twoHands.constraints[3].target = 'db_l.grip';
    expect(errorCodes(twoHands)).toContain('MULTIPLE_CARRY');
  });

  it('rechaza restricciones duplicadas por efector o id', () => {
    const scene = rawScene('lat-pulldown');
    scene.constraints.push({ id: 'seat', effector: 'pelvis', target: 'floor' });
    expect(errorCodes(scene)).toEqual(['DUPLICATE_CONSTRAINT_ID', 'DUPLICATE_EFFECTOR_CONSTRAINT']);
  });

  it('no permite restringir efectores de pole', () => {
    const scene = rawScene('lat-pulldown');
    scene.constraints.push({ id: 'knee', effector: 'knee_L', target: 'lat.knee_pad' });
    expect(errorCodes(scene)).toHaveLength(1);
  });
});

describe('keyframes y drivers', () => {
  it('exige keyframes ordenados, sin t repetidos y con extremos 0 y 1', () => {
    const unsorted = rawScene('lat-pulldown');
    unsorted.keyframes.reverse();
    expect(errorCodes(unsorted)).toContain('KEYFRAMES_NOT_SORTED');
    expect(errorCodes(unsorted)).toContain('KEYFRAMES_MISSING_ENDPOINTS');

    const duplicated = rawScene('lat-pulldown');
    duplicated.keyframes[1].t = 0;
    expect(errorCodes(duplicated)).toContain('DUPLICATE_KEYFRAME_T');
  });

  it('valida la forma de las claves de driver', () => {
    const scene = rawScene('dumbbell-curl');
    scene.keyframes[0].drivers = { 'character.codo_L.flex': 5, 'character.forearm_R.flex': 5 };
    expect(errorCodes(scene)).toContain('INVALID_DRIVER_KEY');
  });

  it('valida que el equipo del driver exista', () => {
    const scene = rawScene('lat-pulldown');
    for (const kf of scene.keyframes) kf.drivers = { 'jalon.t': kf.t };
    expect(errorCodes(scene)).toEqual(['UNKNOWN_DRIVER_EQUIPMENT', 'UNKNOWN_DRIVER_EQUIPMENT']);
  });

  it('valida el tipo de valor de cada driver', () => {
    const tOutOfRange = rawScene('lat-pulldown');
    tOutOfRange.keyframes[1].drivers['lat.t'] = 1.5;
    expect(errorCodes(tOutOfRange)).toEqual(['INVALID_DRIVER_VALUE']);

    const positionAsNumber = rawScene('barbell-bench-press');
    positionAsNumber.keyframes[0].drivers['bar.position'] = 1.15;
    expect(errorCodes(positionAsNumber)).toEqual(['INVALID_DRIVER_VALUE']);

    const angleAsVector = rawScene('dumbbell-curl');
    angleAsVector.keyframes[0].drivers['character.forearm_L.flex'] = [0, 0, 0];
    expect(errorCodes(angleAsVector)).toEqual(['INVALID_DRIVER_VALUE']);
  });

  it('exige los mismos drivers en todos los keyframes', () => {
    const scene = rawScene('dumbbell-curl');
    delete scene.keyframes[1].drivers['character.forearm_R.flex'];
    expect(errorCodes(scene)).toEqual(['DRIVER_KEYS_MISMATCH']);
  });

  it('no permite animar la posición de un objeto cargado por la mano', () => {
    const scene = rawScene('dumbbell-curl');
    scene.keyframes[0].drivers['db_l.position'] = [0, 1, 0];
    scene.keyframes[1].drivers['db_l.position'] = [0, 1.3, 0];
    expect(errorCodes(scene)).toEqual(['DRIVEN_CARRIED_OBJECT', 'DRIVEN_CARRIED_OBJECT']);
  });
});

describe('músculos y versión', () => {
  it('un músculo no puede ser principal y secundario a la vez', () => {
    const scene = rawScene('dumbbell-curl');
    scene.character.muscles.secondary.push('biceps_brachii');
    expect(errorCodes(scene)).toEqual(['MUSCLE_IN_BOTH_GROUPS']);
  });

  it('rechaza ids musculares desconocidos', () => {
    const scene = rawScene('dumbbell-curl');
    scene.character.muscles.primary = ['biceps'];
    expect(errorCodes(scene)).toHaveLength(1);
  });

  it('rechaza versiones de esquema futuras', () => {
    const scene = rawScene('dumbbell-curl');
    scene.schemaVersion = 99;
    expect(errorCodes(scene)).toEqual(['SCHEMA_VERSION_UNSUPPORTED']);
  });
});

describe('utilidades', () => {
  it('parseTarget', () => {
    expect(parseTarget('floor')).toEqual({ kind: 'floor' });
    expect(parseTarget('bar.grip_L')).toEqual({
      kind: 'anchor',
      equipmentId: 'bar',
      anchor: 'grip_L',
    });
    expect(parseTarget('bar')).toBeNull();
    expect(parseTarget('Bar.grip')).toBeNull();
  });

  it('parseDriverKey', () => {
    expect(parseDriverKey('lat.t')).toEqual({
      kind: 'equipment',
      equipmentId: 'lat',
      property: 't',
    });
    expect(parseDriverKey('character.forearm_L.flex')).toEqual({
      kind: 'joint',
      bone: 'forearm_L',
      dof: 'flex',
    });
    expect(parseDriverKey('character.t')).toBeNull();
    expect(parseDriverKey('character.forearm_L.bend')).toBeNull();
    expect(parseDriverKey('bar.scale')).toBeNull();
  });

  it('cycleDuration sin pingpong cuenta solo la fase inicial', () => {
    const tempo = {
      startPhase: 'concentric' as const,
      eccentric: 2,
      concentric: 1,
      pauseStart: 0.5,
      pauseEnd: 0.25,
    };
    expect(cycleDuration(tempo, 'repeat')).toBeCloseTo(1.75);
    expect(cycleDuration(tempo, 'pingpong')).toBeCloseTo(3.75);
  });
});

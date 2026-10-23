import type { Keyframe, Tempo } from '@gym-anim/schema';
import { describe, expect, it } from 'vitest';
import { EASING, frameCount, motionAt, sampleDrivers } from '../src';

const tempo: Tempo = {
  startPhase: 'eccentric',
  eccentric: 2,
  concentric: 1,
  pauseStart: 0.5,
  pauseEnd: 0.25,
};

describe('easing', () => {
  it.each(Object.entries(EASING))('%s va de 0 a 1 y es simétrico', (_, ease) => {
    expect(ease(0)).toBeCloseTo(0);
    expect(ease(1)).toBeCloseTo(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
  });
});

describe('motionAt', () => {
  it('pingpong: pausa, fase inicial, pausa y vuelta', () => {
    expect(motionAt(0.25, tempo, 'pingpong')).toEqual({ progress: 0, phase: 'pauseStart' });
    expect(motionAt(1.5, tempo, 'pingpong')).toEqual({ progress: 0.5, phase: 'first' });
    expect(motionAt(2.6, tempo, 'pingpong')).toEqual({ progress: 1, phase: 'pauseEnd' });
    const back = motionAt(3.25, tempo, 'pingpong');
    expect(back.phase).toBe('second');
    expect(back.progress).toBeCloseTo(0.5);
  });

  it('pingpong se repite cada ciclo, también con tiempos negativos', () => {
    expect(motionAt(1.5 + 3.75, tempo, 'pingpong').progress).toBeCloseTo(0.5);
    expect(motionAt(1.5 - 3.75, tempo, 'pingpong').progress).toBeCloseTo(0.5);
  });

  it('la fase inicial usa la duración de startPhase', () => {
    const concentricFirst = { ...tempo, startPhase: 'concentric' as const };
    expect(motionAt(1, concentricFirst, 'pingpong').progress).toBeCloseTo(0.5);
  });

  it('repeat salta al inicio y none se queda al final', () => {
    expect(motionAt(2.75 + 0.1, tempo, 'repeat')).toEqual({ progress: 0, phase: 'pauseStart' });
    expect(motionAt(100, tempo, 'none')).toEqual({ progress: 1, phase: 'pauseEnd' });
  });

  it('frameCount', () => {
    expect(frameCount({ tempo, loop: 'pingpong', fps: 30 })).toBe(113);
    expect(frameCount({ tempo, loop: 'none', fps: 30 })).toBe(84);
  });
});

describe('sampleDrivers', () => {
  const keyframes: Keyframe[] = [
    { t: 0, drivers: { 'bar.position': [0, 1, 0], 'lat.t': 0 }, ease: 'linear' },
    { t: 0.5, drivers: { 'bar.position': [0, 2, 0], 'lat.t': 1 }, ease: 'inOutSine' },
    { t: 1, drivers: { 'bar.position': [0, 0, 0], 'lat.t': 0 }, ease: 'linear' },
  ];

  it('interpola números y vectores con el easing del tramo', () => {
    expect(sampleDrivers(keyframes, 0.25)).toEqual({ 'bar.position': [0, 1.5, 0], 'lat.t': 0.5 });
    const second = sampleDrivers(keyframes, 0.625);
    expect(second['lat.t']).toBeCloseTo(1 - EASING.inOutSine(0.25));
  });

  it('devuelve exactamente los valores de los keyframes en sus t', () => {
    expect(sampleDrivers(keyframes, 0)).toEqual(keyframes[0]!.drivers);
    expect(sampleDrivers(keyframes, 0.5)).toEqual(keyframes[1]!.drivers);
    expect(sampleDrivers(keyframes, 1)).toEqual(keyframes[2]!.drivers);
  });
});

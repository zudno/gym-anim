import {
  cycleDuration,
  type DriverValue,
  type Ease,
  type Keyframe,
  type LoopMode,
  type Scene,
  type Tempo,
} from '@gym-anim/schema';
import { lerp, lerpNumber, type Vec3 } from './math';

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

export const EASING: Readonly<Record<Ease, (x: number) => number>> = {
  linear: (x) => x,
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
};

// ---------------------------------------------------------------------------
// Tiempo → progreso del movimiento
// ---------------------------------------------------------------------------

export type MotionPhase = 'pauseStart' | 'first' | 'pauseEnd' | 'second';

export interface MotionSample {
  /** Progreso del movimiento: 0 = posición inicial, 1 = posición final. */
  progress: number;
  phase: MotionPhase;
}

/**
 * Convierte segundos en progreso del movimiento. Un ciclo es:
 * pausa en 0 → fase inicial (0→1) → pausa en 1 → fase de vuelta (1→0, solo en `pingpong`).
 */
export function motionAt(time: number, tempo: Tempo, loop: LoopMode): MotionSample {
  const cycle = cycleDuration(tempo, loop);
  const first = tempo.startPhase === 'eccentric' ? tempo.eccentric : tempo.concentric;
  const second = tempo.startPhase === 'eccentric' ? tempo.concentric : tempo.eccentric;

  if (loop === 'none' && time >= cycle) return { progress: 1, phase: 'pauseEnd' };
  let local = loop === 'none' ? Math.max(0, time) : ((time % cycle) + cycle) % cycle;

  if (local < tempo.pauseStart) return { progress: 0, phase: 'pauseStart' };
  local -= tempo.pauseStart;
  if (local < first) return { progress: local / first, phase: 'first' };
  local -= first;
  if (local < tempo.pauseEnd || loop !== 'pingpong') return { progress: 1, phase: 'pauseEnd' };
  local -= tempo.pauseEnd;
  return { progress: Math.max(0, 1 - local / second), phase: 'second' };
}

/** Frames de un ciclo. En `none` se incluye el frame final. */
export function frameCount(scene: Pick<Scene, 'tempo' | 'loop' | 'fps'>): number {
  const frames = Math.round(cycleDuration(scene.tempo, scene.loop) * scene.fps);
  return scene.loop === 'none' ? frames + 1 : frames;
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

function interpolate(a: DriverValue, b: DriverValue | undefined, t: number): DriverValue {
  if (b === undefined) return a;
  if (typeof a === 'number' && typeof b === 'number') return lerpNumber(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return [...lerp(a as Vec3, b as Vec3, t)];
  return t < 0.5 ? a : b;
}

/** Valores de todos los drivers en un progreso dado (keyframes ordenados, con t = 0 y t = 1). */
export function sampleDrivers(
  keyframes: readonly Keyframe[],
  progress: number,
): Record<string, DriverValue> {
  const u = Math.min(1, Math.max(0, progress));
  let index = 0;
  while (index < keyframes.length - 2 && keyframes[index + 1]!.t <= u) index++;
  const from = keyframes[index]!;
  const to = keyframes[index + 1] ?? from;
  const span = to.t - from.t;
  const eased = span > 0 ? EASING[from.ease]((u - from.t) / span) : 0;

  const values: Record<string, DriverValue> = {};
  for (const [key, value] of Object.entries(from.drivers)) {
    values[key] = interpolate(value, to.drivers[key], eased);
  }
  return values;
}

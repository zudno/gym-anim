import { z } from 'zod';

/**
 * Convenciones de coordenadas (iguales a Three.js):
 * - Unidades en metros, eje Y hacia arriba, sistema de mano derecha.
 * - El personaje, en su pose base, está en el origen mirando hacia +Z.
 * - Ángulos siempre en grados.
 */

/** Vector [x, y, z] en metros. */
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

/** Rotación Euler [x, y, z] en grados, orden XYZ. */
export const EulerDegSchema = z.tuple([z.number(), z.number(), z.number()]);
export type EulerDeg = z.infer<typeof EulerDegSchema>;

/** Identificador de escena, equipo, restricción o asset: minúsculas, dígitos, `_` y `-`. */
export const IdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/, 'Usa minúsculas, dígitos, "_" o "-", empezando por letra');

/** Nombre de ancla o hueso: admite sufijos de lado en mayúscula (`grip_L`, `hand_R`). */
export const SocketNameSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_]{0,63}$/, 'Usa letras, dígitos o "_", empezando por minúscula');

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal de 6 dígitos, p. ej. #ffffff');

export const EASES = ['linear', 'inOutSine', 'inOutCubic'] as const;
export const EaseSchema = z.enum(EASES);
export type Ease = z.infer<typeof EaseSchema>;

/** `pingpong`: 0→1→0. `repeat`: 0→1 y salta a 0. `none`: una sola pasada. */
export const LOOP_MODES = ['none', 'repeat', 'pingpong'] as const;
export const LoopModeSchema = z.enum(LOOP_MODES);
export type LoopMode = z.infer<typeof LoopModeSchema>;

import type { Command, Scene, ValidationIssue } from '@gym-anim/schema';
import { applyCommands, type ApplyOptions } from './commands';

/**
 * Historial de deshacer/rehacer (RF-04). Inmutable: cada operación devuelve un estado nuevo.
 * Una entrada es un lote de comandos; un cambio de la IA es una sola entrada (RF-31).
 */

export interface HistoryEntry {
  /** Descripción para la UI, p. ej. "Mover barra" o "IA: añadir mancuernas". */
  label: string | null;
  commands: Command[];
  inverse: Command[];
}

export interface HistoryState {
  scene: Scene;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const DEFAULT_HISTORY_LIMIT = 200;

export interface ExecuteOptions extends ApplyOptions {
  label?: string;
  /** Máximo de entradas que se conservan para deshacer. */
  limit?: number;
}

export type ExecuteResult =
  { ok: true; state: HistoryState } | { ok: false; issues: ValidationIssue[] };

export function createHistory(scene: Scene): HistoryState {
  return { scene, past: [], future: [] };
}

/** Aplica un lote como una sola entrada; si falla, el estado no cambia. */
export function execute(
  state: HistoryState,
  commands: readonly unknown[],
  options: ExecuteOptions = {},
): ExecuteResult {
  if (commands.length === 0) return { ok: true, state };
  const result = applyCommands(state.scene, commands, options);
  if (!result.ok) return result;

  const entry: HistoryEntry = {
    label: options.label ?? null,
    commands: result.commands,
    inverse: result.inverse,
  };
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  return {
    ok: true,
    state: { scene: result.scene, past: [...state.past, entry].slice(-limit), future: [] },
  };
}

export const canUndo = (state: HistoryState): boolean => state.past.length > 0;
export const canRedo = (state: HistoryState): boolean => state.future.length > 0;

export function undo(state: HistoryState): HistoryState {
  const entry = state.past.at(-1);
  if (!entry) return state;
  const result = applyCommands(state.scene, entry.inverse);
  if (!result.ok) throw new Error(`No se pudo deshacer: ${JSON.stringify(result.issues)}`);
  return { scene: result.scene, past: state.past.slice(0, -1), future: [entry, ...state.future] };
}

export function redo(state: HistoryState, options: ApplyOptions = {}): HistoryState {
  const [entry, ...future] = state.future;
  if (!entry) return state;
  const result = applyCommands(state.scene, entry.commands, options);
  if (!result.ok) throw new Error(`No se pudo rehacer: ${JSON.stringify(result.issues)}`);
  return {
    scene: result.scene,
    past: [...state.past, { ...entry, inverse: result.inverse }],
    future,
  };
}

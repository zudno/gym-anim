import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, execute, redo, undo, type HistoryState } from '../src';
import { scene } from './helpers';

function run(state: HistoryState, commands: unknown[], label?: string): HistoryState {
  const result = execute(state, commands, label ? { label } : {});
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.state;
}

describe('historial', () => {
  const original = scene('barbell-bench-press');

  it('deshace y rehace lotes completos', () => {
    let state = createHistory(original);
    expect(canUndo(state)).toBe(false);

    state = run(state, [{ type: 'set_loop', mode: 'none' }], 'Loop');
    state = run(
      state,
      [
        { type: 'remove_equipment', id: 'bar' },
        { type: 'set_muscles', primary: ['pectoralis_minor'] },
      ],
      'IA: cambiar ejercicio',
    );
    const edited = state.scene;
    expect(state.past.map((e) => e.label)).toEqual(['Loop', 'IA: cambiar ejercicio']);

    state = undo(state);
    expect(state.scene.equipment).toHaveLength(2);
    expect(state.scene.loop).toBe('none');
    state = undo(state);
    expect(state.scene).toEqual(original);
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(true);

    state = redo(redo(state));
    expect(state.scene).toEqual(edited);
    expect(canRedo(state)).toBe(false);
  });

  it('un comando nuevo descarta lo que se podía rehacer', () => {
    let state = run(createHistory(original), [{ type: 'set_loop', mode: 'none' }]);
    state = undo(state);
    state = run(state, [{ type: 'set_loop', mode: 'repeat' }]);
    expect(canRedo(state)).toBe(false);
    expect(state.past).toHaveLength(1);
  });

  it('un lote inválido no cambia el estado', () => {
    const state = createHistory(original);
    const result = execute(state, [{ type: 'remove_equipment', id: 'nada' }]);
    expect(result.ok).toBe(false);
    const empty = execute(state, []);
    expect(empty.ok && empty.state).toBe(state);
  });

  it('respeta el límite de entradas', () => {
    let state = createHistory(original);
    for (let i = 0; i < 5; i++) {
      const result = execute(state, [{ type: 'set_tempo', eccentric: 1 + i }], { limit: 3 });
      if (!result.ok) throw new Error();
      state = result.state;
    }
    expect(state.past).toHaveLength(3);
    state = undo(undo(undo(state)));
    expect(state.scene.tempo.eccentric).toBe(2);
    expect(undo(state)).toBe(state);
  });

  it('deshacer y rehacer no hacen nada si no hay entradas', () => {
    const state = createHistory(original);
    expect(undo(state)).toBe(state);
    expect(redo(state)).toBe(state);
  });
});

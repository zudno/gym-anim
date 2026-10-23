import {
  parseCommand,
  parseScene,
  parseTarget,
  type Command,
  type Constraint,
  type DriverValue,
  type EquipmentInstance,
  type Keyframe,
  type Scene,
  type ValidationIssue,
} from '@gym-anim/schema';

/*
 * Aplicación de comandos (ESPECIFICACION §7.3, RF-03).
 * Cada comando produce una escena nueva (nunca muta la anterior) y la lista de comandos
 * que la devuelven exactamente a su estado previo. Los comandos se aplican en lotes:
 * la escena solo se valida al final, así un lote puede pasar por estados intermedios
 * (p. ej. añadir un driver keyframe a keyframe).
 */

export interface ApplyOptions {
  /** Plantillas para `create_scene` con `template`. */
  templates?: Readonly<Record<string, Scene>>;
}

export type ApplyResult =
  | {
      ok: true;
      scene: Scene;
      /** Comandos ya validados (con valores por defecto de Zod aplicados). */
      commands: Command[];
      /** Aplicados en orden sobre `scene`, devuelven la escena original. */
      inverse: Command[];
    }
  | { ok: false; issues: ValidationIssue[] };

/** Aplica un lote de comandos de forma atómica: o se aplican todos, o ninguno. */
export function applyCommands(
  scene: Scene,
  inputs: readonly unknown[],
  options: ApplyOptions = {},
): ApplyResult {
  const commands: Command[] = [];
  const issues: ValidationIssue[] = [];
  inputs.forEach((input, i) => {
    const parsed = parseCommand(input);
    if (parsed.success) commands.push(parsed.data);
    else issues.push(...parsed.issues.map((issue) => prefix(issue, i)));
  });
  if (issues.length > 0) return { ok: false, issues };

  let current = scene;
  const inverses: Command[][] = [];
  for (const [i, command] of commands.entries()) {
    const step = applyOne(current, command, options);
    if ('issue' in step) return { ok: false, issues: [prefix(step.issue, i)] };
    current = step.scene;
    inverses.push(step.inverse);
  }

  const validated = parseScene(current);
  if (!validated.success) return { ok: false, issues: validated.issues };
  return { ok: true, scene: validated.data, commands, inverse: inverses.reverse().flat() };
}

export function applyCommand(
  scene: Scene,
  input: unknown,
  options: ApplyOptions = {},
): ApplyResult {
  return applyCommands(scene, [input], options);
}

/** Comandos que deshacen `commands` aplicados sobre `scene`, o `null` si el lote no es válido. */
export function invertCommands(
  scene: Scene,
  commands: readonly unknown[],
  options: ApplyOptions = {},
): Command[] | null {
  const result = applyCommands(scene, commands, options);
  return result.ok ? result.inverse : null;
}

// ---------------------------------------------------------------------------
// Un comando
// ---------------------------------------------------------------------------

type Step = { scene: Scene; inverse: Command[] } | { issue: ValidationIssue };

const ok = (scene: Scene, inverse: Command[]): Step => ({ scene, inverse });
const fail = (code: string, message: string): Step => ({
  issue: { level: 'error', code, message, path: [] },
});

function applyOne(scene: Scene, command: Command, options: ApplyOptions): Step {
  switch (command.type) {
    case 'create_scene': {
      const id = command.id ?? slugify(command.name);
      let created: Scene;
      if (command.template) {
        const template = options.templates?.[command.template];
        if (!template) {
          return fail('TEMPLATE_NOT_FOUND', `No existe la plantilla "${command.template}"`);
        }
        created = { ...structuredClone(template), id, name: command.name };
      } else {
        created = emptyScene(id, command.name);
      }
      return ok(created, [{ type: 'replace_scene', scene }]);
    }

    case 'replace_scene':
      return ok(command.scene, [{ type: 'replace_scene', scene }]);

    case 'set_character': {
      const { model, basePose } = command;
      const previous = scene.character;
      return ok(
        {
          ...scene,
          character: {
            ...previous,
            ...(model !== undefined && { model }),
            ...(basePose !== undefined && { basePose }),
          },
        },
        [
          {
            type: 'set_character',
            ...(model !== undefined && { model: previous.model }),
            ...(basePose !== undefined && { basePose: previous.basePose }),
          },
        ],
      );
    }

    case 'add_equipment': {
      const ids = new Set(scene.equipment.map((e) => e.id));
      if (command.id && ids.has(command.id)) {
        return fail('DUPLICATE_ID', `Ya existe un equipo con id "${command.id}"`);
      }
      const id = command.id ?? uniqueId(command.equipmentType, ids);
      const item: EquipmentInstance = {
        id,
        type: command.equipmentType,
        position: command.position ?? [0, 0, 0],
        rotation: command.rotation ?? [0, 0, 0],
        ...(command.load && { load: command.load }),
      };
      return ok({ ...scene, equipment: insertAt(scene.equipment, item, command.index) }, [
        { type: 'remove_equipment', id },
      ]);
    }

    case 'update_equipment': {
      const index = scene.equipment.findIndex((e) => e.id === command.id);
      const previous = scene.equipment[index];
      if (!previous) return fail('EQUIPMENT_NOT_FOUND', `No existe el equipo "${command.id}"`);
      const { position, rotation } = command;
      const updated: EquipmentInstance = {
        ...previous,
        ...(position && { position }),
        ...(rotation && { rotation }),
      };
      return ok({ ...scene, equipment: replaceAt(scene.equipment, index, updated) }, [
        {
          type: 'update_equipment',
          id: command.id,
          ...(position && { position: previous.position }),
          ...(rotation && { rotation: previous.rotation }),
        },
      ]);
    }

    case 'remove_equipment': {
      const index = scene.equipment.findIndex((e) => e.id === command.id);
      const item = scene.equipment[index];
      if (!item) return fail('EQUIPMENT_NOT_FOUND', `No existe el equipo "${command.id}"`);

      const usesItem = (c: Constraint) => {
        const target = parseTarget(c.target);
        return target?.kind === 'anchor' && target.equipmentId === command.id;
      };
      const removedConstraints = scene.constraints
        .map((constraint, i) => ({ constraint, i }))
        .filter(({ constraint }) => usesItem(constraint));
      const driverPrefix = `${command.id}.`;

      const inverse: Command[] = [
        {
          type: 'add_equipment',
          id: item.id,
          equipmentType: item.type,
          position: item.position,
          rotation: item.rotation,
          ...(item.load && { load: item.load }),
          index,
        },
        ...removedConstraints.map(({ constraint, i }) => addConstraintCommand(constraint, i)),
      ];
      const keyframes = scene.keyframes.map((keyframe) => {
        const removed = pick(keyframe.drivers, (key) => key.startsWith(driverPrefix));
        if (Object.keys(removed).length > 0) {
          inverse.push({ type: 'set_keyframe', t: keyframe.t, drivers: removed });
        }
        return {
          ...keyframe,
          drivers: pick(keyframe.drivers, (key) => !key.startsWith(driverPrefix)),
        };
      });

      return ok(
        {
          ...scene,
          equipment: scene.equipment.filter((_, i) => i !== index),
          constraints: scene.constraints.filter((c) => !usesItem(c)),
          keyframes,
        },
        inverse,
      );
    }

    case 'set_load': {
      const index = scene.equipment.findIndex((e) => e.id === command.equipmentId);
      const previous = scene.equipment[index];
      if (!previous) {
        return fail('EQUIPMENT_NOT_FOUND', `No existe el equipo "${command.equipmentId}"`);
      }
      const { load: _removed, ...withoutLoad } = previous;
      const updated = command.load ? { ...withoutLoad, load: command.load } : withoutLoad;
      return ok({ ...scene, equipment: replaceAt(scene.equipment, index, updated) }, [
        { type: 'set_load', equipmentId: command.equipmentId, load: previous.load ?? null },
      ]);
    }

    case 'add_constraint': {
      const ids = new Set(scene.constraints.map((c) => c.id));
      if (command.id && ids.has(command.id)) {
        return fail('DUPLICATE_ID', `Ya existe una restricción con id "${command.id}"`);
      }
      const constraint: Constraint = {
        id: command.id ?? uniqueId(command.effector, ids),
        effector: command.effector,
        target: command.target,
        mode: command.mode ?? 'pin',
        ...(command.offset && { offset: command.offset }),
        weight: command.weight ?? 1,
      };
      return ok({ ...scene, constraints: insertAt(scene.constraints, constraint, command.index) }, [
        { type: 'remove_constraint', id: constraint.id },
      ]);
    }

    case 'remove_constraint': {
      const index = scene.constraints.findIndex((c) => c.id === command.id);
      const constraint = scene.constraints[index];
      if (!constraint) {
        return fail('CONSTRAINT_NOT_FOUND', `No existe la restricción "${command.id}"`);
      }
      return ok({ ...scene, constraints: scene.constraints.filter((_, i) => i !== index) }, [
        addConstraintCommand(constraint, index),
      ]);
    }

    case 'set_keyframe': {
      const index = scene.keyframes.findIndex((k) => k.t === command.t);
      const previous = scene.keyframes[index];
      if (!previous) {
        const keyframe: Keyframe = {
          t: command.t,
          drivers: command.drivers,
          ease: command.ease ?? 'inOutSine',
        };
        const keyframes = [...scene.keyframes, keyframe].sort((a, b) => a.t - b.t);
        return ok({ ...scene, keyframes }, [{ type: 'remove_keyframe', t: command.t }]);
      }
      const updated: Keyframe = {
        ...previous,
        drivers: command.replace ? command.drivers : { ...previous.drivers, ...command.drivers },
        ease: command.ease ?? previous.ease,
      };
      return ok({ ...scene, keyframes: replaceAt(scene.keyframes, index, updated) }, [
        restoreKeyframeCommand(previous),
      ]);
    }

    case 'remove_keyframe': {
      const index = scene.keyframes.findIndex((k) => k.t === command.t);
      const previous = scene.keyframes[index];
      if (!previous) return fail('KEYFRAME_NOT_FOUND', `No hay keyframe en t = ${command.t}`);
      return ok({ ...scene, keyframes: scene.keyframes.filter((_, i) => i !== index) }, [
        restoreKeyframeCommand(previous),
      ]);
    }

    case 'set_tempo': {
      const { type: _type, ...changes } = command;
      return ok({ ...scene, tempo: { ...scene.tempo, ...changes } }, [
        { type: 'set_tempo', ...previousValues(scene.tempo, changes) },
      ]);
    }

    case 'set_loop':
      return ok({ ...scene, loop: command.mode }, [{ type: 'set_loop', mode: scene.loop }]);

    case 'set_muscles': {
      const { type: _type, ...changes } = command;
      const muscles = scene.character.muscles;
      return ok(
        { ...scene, character: { ...scene.character, muscles: { ...muscles, ...changes } } },
        [{ type: 'set_muscles', ...previousValues(muscles, changes) }],
      );
    }

    case 'set_camera':
      return ok({ ...scene, camera: command.camera }, [
        { type: 'set_camera', camera: scene.camera },
      ]);

    case 'set_render': {
      const { type: _type, ...changes } = command;
      return ok({ ...scene, render: { ...scene.render, ...changes } }, [
        { type: 'set_render', ...previousValues(scene.render, changes) },
      ]);
    }

    case 'set_pole': {
      const { [command.limb]: previous, ...others } = scene.character.poles;
      const poles = command.direction ? { ...others, [command.limb]: command.direction } : others;
      return ok({ ...scene, character: { ...scene.character, poles } }, [
        { type: 'set_pole', limb: command.limb, direction: previous ?? null },
      ]);
    }
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function addConstraintCommand(constraint: Constraint, index: number): Command {
  return {
    type: 'add_constraint',
    id: constraint.id,
    effector: constraint.effector,
    target: constraint.target,
    mode: constraint.mode,
    ...(constraint.offset && { offset: constraint.offset }),
    weight: constraint.weight,
    index,
  };
}

function restoreKeyframeCommand(keyframe: Keyframe): Command {
  return {
    type: 'set_keyframe',
    t: keyframe.t,
    drivers: keyframe.drivers,
    ease: keyframe.ease,
    replace: true,
  };
}

/** Valores previos de los campos que un parche cambia (ignora los `undefined`). */
function previousValues<T extends object>(current: T, changes: Partial<T>): Partial<T> {
  const previous: Partial<T> = {};
  for (const key of Object.keys(changes) as (keyof T)[]) {
    if (changes[key] !== undefined) previous[key] = current[key];
  }
  return previous;
}

function pick(
  drivers: Record<string, DriverValue>,
  keep: (key: string) => boolean,
): Record<string, DriverValue> {
  return Object.fromEntries(Object.entries(drivers).filter(([key]) => keep(key)));
}

function insertAt<T>(list: readonly T[], item: T, index?: number): T[] {
  const at = index === undefined ? list.length : Math.min(index, list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((existing, i) => (i === index ? item : existing));
}

function prefix(issue: ValidationIssue, commandIndex: number): ValidationIssue {
  return { ...issue, path: ['commands', commandIndex, ...issue.path] };
}

/** Id válido (`IdSchema`) a partir de `base`, sin repetir los existentes: `barbell`, `barbell_2`… */
export function uniqueId(base: string, existing: ReadonlySet<string>): string {
  let stem = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 56);
  if (!/^[a-z]/.test(stem)) stem = `x_${stem}`;
  if (!existing.has(stem)) return stem;
  let n = 2;
  while (existing.has(`${stem}_${n}`)) n++;
  return `${stem}_${n}`;
}

function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return /^[a-z]/.test(slug) ? slug : `scene-${slug}`.replace(/-+$/, '');
}

/** Escena mínima válida: personaje de pie, sin equipos y con keyframes vacíos en 0 y 1. */
export function emptyScene(id: string, name: string): Scene {
  const result = parseScene({
    schemaVersion: 1,
    id,
    name,
    tempo: { eccentric: 2, concentric: 1 },
    character: { model: 'male_athletic', basePose: 'standing' },
    keyframes: [
      { t: 0, drivers: {} },
      { t: 1, drivers: {} },
    ],
  });
  if (!result.success) throw new Error(`Escena vacía inválida: ${JSON.stringify(result.issues)}`);
  return result.data;
}

import type { AssetCatalog } from './assets';
import type { ValidationIssue } from './issues';
import { FOOT_EFFECTORS } from './rig';
import { parseDriverKey, parseTarget, type Scene } from './scene';

/**
 * Revisa una escena ya validada contra el catálogo de assets y emite avisos de calidad.
 * La validación biomecánica (alcance de IK, límites articulares) vive en `@gym-anim/core`.
 */
export function lintScene(scene: Scene, catalog?: AssetCatalog): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string, path: ValidationIssue['path']) =>
    issues.push({ level: 'error', code, message, path });
  const warn = (code: string, message: string, path: ValidationIssue['path']) =>
    issues.push({ level: 'warning', code, message, path });

  if (scene.character.muscles.primary.length === 0) {
    warn('MUSCLES_EMPTY', 'No hay músculos principales marcados', ['character', 'muscles']);
  }

  const constrained = new Set(scene.constraints.map((c) => c.effector));
  for (const foot of FOOT_EFFECTORS) {
    if (!constrained.has(foot)) {
      warn('FOOT_UNCONSTRAINED', `"${foot}" no tiene restricción; el pie puede deslizarse`, [
        'constraints',
      ]);
    }
  }

  const [first, ...rest] = scene.keyframes;
  const isStatic = rest.every(
    (kf) => JSON.stringify(kf.drivers) === JSON.stringify(first?.drivers ?? {}),
  );
  if (isStatic) {
    warn('STATIC_ANIMATION', 'Todos los keyframes son iguales: no hay movimiento', ['keyframes']);
  }

  if (!catalog) return issues;

  if (!catalog.characters.some((c) => c.id === scene.character.model)) {
    error('UNKNOWN_CHARACTER_MODEL', `No existe el personaje "${scene.character.model}"`, [
      'character',
      'model',
    ]);
  }
  if (!catalog.poses.some((p) => p.id === scene.character.basePose)) {
    error('UNKNOWN_POSE', `No existe la pose "${scene.character.basePose}"`, [
      'character',
      'basePose',
    ]);
  }

  const manifestById = new Map(catalog.equipment.map((m) => [m.id, m]));
  const manifestOf = new Map(
    scene.equipment.map((item) => [item.id, manifestById.get(item.type)] as const),
  );

  scene.equipment.forEach((item, i) => {
    const manifest = manifestById.get(item.type);
    if (!manifest) {
      error('UNKNOWN_EQUIPMENT_TYPE', `No existe el equipo "${item.type}" en el catálogo`, [
        'equipment',
        i,
        'type',
      ]);
      return;
    }
    if (item.load && !manifest.loadKinds.includes(item.load.kind)) {
      error('LOAD_KIND_NOT_SUPPORTED', `"${item.type}" no admite carga "${item.load.kind}"`, [
        'equipment',
        i,
        'load',
      ]);
    }
    if (!item.load && manifest.loadKinds.length > 0) {
      warn('LOAD_MISSING', `"${item.id}" admite carga pero no tiene ninguna`, ['equipment', i]);
    }
  });

  scene.constraints.forEach((constraint, i) => {
    const target = parseTarget(constraint.target);
    if (target?.kind !== 'anchor') return;
    const manifest = manifestOf.get(target.equipmentId);
    if (manifest && !manifest.anchors.includes(target.anchor)) {
      error(
        'UNKNOWN_ANCHOR',
        `"${manifest.id}" no tiene el ancla "${target.anchor}" (disponibles: ${manifest.anchors.join(', ')})`,
        ['constraints', i, 'target'],
      );
    }
  });

  scene.keyframes.forEach((keyframe, i) => {
    for (const key of Object.keys(keyframe.drivers)) {
      const ref = parseDriverKey(key);
      if (ref?.kind !== 'equipment' || ref.property !== 't') continue;
      const manifest = manifestOf.get(ref.equipmentId);
      if (manifest && manifest.joints.length === 0) {
        error('DRIVER_NOT_SUPPORTED', `"${manifest.id}" no tiene partes móviles para "t"`, [
          'keyframes',
          i,
          'drivers',
          key,
        ]);
      }
    }
  });

  return issues;
}

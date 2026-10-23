import { describe, expect, it } from 'vitest';
import { lintScene, parseCatalog, parseScene, type Scene } from '../src';
import { mvpCatalog, rawScene, readFixture } from './helpers';

function lintCodes(raw: unknown, withCatalog = true): string[] {
  const result = parseScene(raw);
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return lintScene(result.data as Scene, withCatalog ? mvpCatalog() : undefined).map(
    (issue) => `${issue.level}:${issue.code}`,
  );
}

describe('lintScene contra el catálogo', () => {
  it('detecta anclas inexistentes', () => {
    const scene = rawScene('barbell-bench-press');
    scene.constraints[0].target = 'bench.grip_L';
    expect(lintCodes(scene)).toEqual(['error:UNKNOWN_ANCHOR']);
  });

  it('detecta tipos de equipo, personajes y poses desconocidos', () => {
    const scene = rawScene('lat-pulldown');
    scene.equipment[0].type = 'leg_press';
    scene.character.model = 'robot';
    scene.character.basePose = 'kneeling';
    expect(lintCodes(scene)).toEqual([
      'error:UNKNOWN_CHARACTER_MODEL',
      'error:UNKNOWN_POSE',
      'error:UNKNOWN_EQUIPMENT_TYPE',
    ]);
  });

  it('detecta cargas no admitidas por el equipo', () => {
    const scene = rawScene('lat-pulldown');
    scene.equipment[0].load = { kind: 'dumbbell', kg: 10 };
    expect(lintCodes(scene)).toEqual(['error:LOAD_KIND_NOT_SUPPORTED']);
  });

  it('solo las máquinas con partes móviles admiten el driver "t"', () => {
    const scene = rawScene('barbell-bench-press');
    scene.keyframes[0].drivers = { 'bar.t': 0 };
    scene.keyframes[1].drivers = { 'bar.t': 1 };
    expect(lintCodes(scene)).toEqual(['error:DRIVER_NOT_SUPPORTED', 'error:DRIVER_NOT_SUPPORTED']);
  });
});

describe('avisos de calidad', () => {
  it('avisa de músculos vacíos, pies libres, animación estática y carga ausente', () => {
    const scene = rawScene('lat-pulldown');
    scene.character.muscles = { primary: [], secondary: [] };
    scene.constraints = scene.constraints.filter(
      (c: { effector: string }) => !c.effector.startsWith('foot'),
    );
    scene.keyframes[1].drivers['lat.t'] = 0;
    delete scene.equipment[0].load;
    expect(lintCodes(scene)).toEqual([
      'warning:MUSCLES_EMPTY',
      'warning:FOOT_UNCONSTRAINED',
      'warning:FOOT_UNCONSTRAINED',
      'warning:STATIC_ANIMATION',
      'warning:LOAD_MISSING',
    ]);
  });

  it('sin catálogo solo emite avisos generales', () => {
    const scene = rawScene('barbell-bench-press');
    scene.constraints[0].target = 'bench.grip_L';
    expect(lintCodes(scene, false)).toEqual([]);
  });
});

describe('catálogo', () => {
  it('rechaza ids duplicados y equipos no paramétricos sin archivo', () => {
    const catalog = structuredClone(readFixture('catalog.mvp.json')) as any;
    catalog.poses.push({ id: 'seated', name: 'Otra' });
    delete catalog.equipment[0].file;
    const result = parseCatalog(catalog);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((i) => i.path.join('.'))).toEqual(['equipment.0.file', 'poses.3.id']);
  });

  it('rechaza articulaciones que mueven anclas inexistentes', () => {
    const catalog = structuredClone(readFixture('catalog.mvp.json')) as any;
    catalog.equipment[1].joints[0].drives = ['handle'];
    expect(parseCatalog(catalog).success).toBe(false);
  });
});

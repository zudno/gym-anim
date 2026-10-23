import {
  EFFECTORS,
  FOOT_EFFECTORS,
  parseDriverKey,
  parseTarget,
  type Constraint,
  type DriverValue,
  type Effector,
  type Scene,
  type ValidationIssue,
} from '@gym-anim/schema';
import { motionAt, sampleDrivers } from './animation';
import {
  evaluateEquipment,
  PLACEHOLDER_LIBRARY,
  type EquipmentLibrary,
  type EvaluatedEquipment,
} from './equipment';
import { aimBone, solveLimb } from './ik';
import {
  IDENTITY,
  ZERO,
  add,
  distance,
  length,
  lerp,
  normalize,
  quatFromAxisAngle,
  quatFromEulerDeg,
  quatInvert,
  quatMultiply,
  quatSlerp,
  rotate,
  sub,
  type Quat,
  type Vec3,
} from './math';
import { BASE_POSES, type JointAngles, type PoseLibrary } from './poses';
import { REFERENCE_RIG, boneDefinition, type RigDefinition } from './rig';
import {
  effectorPoint,
  forwardKinematics,
  localRotations,
  type LocalRotations,
  type Transform,
  type WorldTransforms,
} from './skeleton';

export interface EvaluateOptions {
  rig?: RigDefinition;
  poses?: PoseLibrary;
  library?: EquipmentLibrary;
}

/** Distancia máxima entre un efector y su objetivo antes de reportar `IK_UNREACHABLE`. */
export const REACH_TOLERANCE = 0.01;

export interface EvaluatedFrame {
  /** Segundos desde el inicio del ciclo; `null` si se evaluó directamente por progreso. */
  time: number | null;
  /** Progreso del movimiento: 0 = posición inicial, 1 = posición final. */
  progress: number;
  drivers: Record<string, DriverValue>;
  /** Transformación de cada hueso en mundo. */
  bones: WorldTransforms;
  /** Rotación local de cada hueso respecto a su padre. */
  local: LocalRotations;
  /** Posición en mundo del punto de cada efector. */
  effectors: Record<Effector, Vec3>;
  equipment: Record<string, EvaluatedEquipment>;
  /** Problemas detectados en este frame. */
  issues: ValidationIssue[];
}

/** Evalúa la escena en `time` segundos (aplica tempo y loop). Función pura y determinista. */
export function evaluate(
  scene: Scene,
  time: number,
  options: EvaluateOptions = {},
): EvaluatedFrame {
  const { progress } = motionAt(time, scene.tempo, scene.loop);
  return { ...evaluateProgress(scene, progress, options), time };
}

export function evaluateFrame(
  scene: Scene,
  frame: number,
  options: EvaluateOptions = {},
): EvaluatedFrame {
  return evaluate(scene, frame / scene.fps, options);
}

interface ResolvedTarget {
  position: Vec3;
  /** Orientación que impone el ancla, o `null` si no impone ninguna. */
  rotation: Quat | null;
}

/**
 * Evalúa la pose para un progreso del movimiento (0–1), sin pasar por el tempo.
 * Útil para el scrubbing del editor y para comprobar posiciones inicial y final.
 */
export function evaluateProgress(
  scene: Scene,
  progress: number,
  options: EvaluateOptions = {},
): EvaluatedFrame {
  const rig = options.rig ?? REFERENCE_RIG;
  const poses = options.poses ?? BASE_POSES;
  const library = options.library ?? PLACEHOLDER_LIBRARY;
  const issues: ValidationIssue[] = [];
  const report = (
    level: ValidationIssue['level'],
    code: string,
    message: string,
    path: ValidationIssue['path'],
  ) => issues.push({ level, code, message, path });

  const drivers = sampleDrivers(scene.keyframes, progress);

  // 1. Pose base + drivers articulares (FK).
  let basePose = poses[scene.character.basePose];
  if (!basePose) {
    report('error', 'UNKNOWN_POSE', `No existe la pose "${scene.character.basePose}"`, [
      'character',
      'basePose',
    ]);
    basePose = poses.standing ?? Object.values(poses)[0]!;
  }
  const angles: JointAngles = {};
  for (const [bone, dofs] of Object.entries(basePose.joints)) {
    angles[bone as keyof JointAngles] = { ...dofs };
  }
  for (const [key, value] of Object.entries(drivers)) {
    const ref = parseDriverKey(key);
    if (ref?.kind !== 'joint' || typeof value !== 'number') continue;
    (angles[ref.bone] ??= {})[ref.dof] = value;
    const [min, max] = boneDefinition(rig, ref.bone).limits[ref.dof];
    if (value < min - 1e-6 || value > max + 1e-6) {
      report('error', 'JOINT_LIMIT', `${key} = ${round(value)}° fuera de [${min}, ${max}]`, [
        'drivers',
        key,
      ]);
    }
  }
  const local = localRotations(rig, angles);
  const baseRootRotation = quatFromEulerDeg(basePose.root.rotation);
  let root: Transform = { position: basePose.root.position, rotation: baseRootRotation };

  // 2. Equipos que no carga ninguna mano (aplican sus drivers).
  const byEffector = new Map<Effector, Constraint>();
  const carried = new Map<string, Constraint>();
  for (const constraint of scene.constraints) {
    byEffector.set(constraint.effector, constraint);
    const target = parseTarget(constraint.target);
    if (constraint.mode === 'carry' && target?.kind === 'anchor') {
      carried.set(target.equipmentId, constraint);
    }
  }
  const constraintPath = (c: Constraint) => ['constraints', scene.constraints.indexOf(c)];

  const equipment: Record<string, EvaluatedEquipment> = {};
  scene.equipment.forEach((item, i) => {
    const definition = library[item.type];
    if (!definition) {
      report(
        'error',
        'UNKNOWN_EQUIPMENT_DEFINITION',
        `No hay definición 3D para el equipo "${item.type}"`,
        ['equipment', i, 'type'],
      );
    }
    if (!carried.has(item.id)) equipment[item.id] = evaluateEquipment(item, definition, drivers);
  });

  const resolved = new Map<Constraint, ResolvedTarget | null>();
  const resolve = (c: Constraint): ResolvedTarget | null => {
    if (resolved.has(c)) return resolved.get(c)!;
    const target = parseTarget(c.target);
    const offset = c.offset ?? ZERO;
    let result: ResolvedTarget | null = null;
    if (target && target.kind !== 'anchor') {
      result = { position: offset, rotation: null };
    } else if (target) {
      const item = equipment[target.equipmentId];
      const anchor = item?.anchors[target.anchor];
      if (anchor) {
        result = {
          position: add(anchor.position, rotate(anchor.rotation, offset)),
          rotation: anchor.oriented ? anchor.rotation : null,
        };
      } else if (item && library[item.type]) {
        report(
          'error',
          'UNKNOWN_ANCHOR',
          `"${item.type}" no tiene el ancla "${target.anchor}"`,
          constraintPath(c),
        );
      }
    }
    resolved.set(c, result);
    return result;
  };

  // 3. Pelvis: coloca la raíz. El ancla, si está orientada, es el marco de la pose base.
  const pelvis = byEffector.get('pelvis');
  const pelvisTarget = pelvis && pelvis.mode !== 'carry' ? resolve(pelvis) : null;
  if (pelvis && pelvisTarget) {
    const rotation = quatSlerp(
      root.rotation,
      pelvisTarget.rotation
        ? quatMultiply(pelvisTarget.rotation, baseRootRotation)
        : baseRootRotation,
      pelvis.weight,
    );
    const pelvisOffset = rig.effectorPoints.pelvis;
    const hipsRotation = quatMultiply(rotation, local[pelvisOffset.bone]);
    const position = sub(pelvisTarget.position, rotate(hipsRotation, pelvisOffset.offset));
    root = { position: lerp(root.position, position, pelvis.weight), rotation };
  }
  let world = forwardKinematics(rig, root, local);

  // 4. Torso y cabeza: orientación rígida hacia su objetivo.
  for (const [effector, bone] of [
    ['chest', 'spine'],
    ['head', 'neck'],
  ] as const) {
    const constraint = byEffector.get(effector);
    if (!constraint || constraint.mode === 'carry') continue;
    const target = resolve(constraint);
    if (!target) continue;
    aimBone(rig, world, local, bone, effector, target.position, constraint.weight);
    world = forwardKinematics(rig, root, local);
  }

  // 5. Extremidades por IK. Primero las que van a equipos libres; después las que van a
  //    objetos cargados por la otra mano (necesitan que el objeto ya esté colocado).
  const solveLimbs = (towardsCarried: boolean) => {
    for (const limb of Object.values(rig.limbs)) {
      const constraint = byEffector.get(limb.effector);
      if (!constraint || constraint.mode === 'carry') continue;
      const parsed = parseTarget(constraint.target);
      const onCarried = parsed?.kind === 'anchor' && carried.has(parsed.equipmentId);
      if (onCarried !== towardsCarried) continue;
      const target = resolve(constraint);
      if (!target) continue;

      const isFoot = (FOOT_EFFECTORS as readonly string[]).includes(limb.effector);
      const rotation = target.rotation ?? (isFoot ? headingRotation(root.rotation) : null);
      const pole = scene.character.poles[limb.pole] ?? rig.defaultPoles[limb.pole];
      const solution = solveLimb(
        rig,
        limb,
        world,
        local,
        { position: target.position, rotation },
        normalize(rotate(root.rotation, pole)),
        constraint.weight,
      );
      world = forwardKinematics(rig, root, local);

      const [min, max] = boneDefinition(rig, limb.mid).limits.flex;
      if (solution.midFlexDeg < min - 0.5 || solution.midFlexDeg > max + 0.5) {
        report(
          'error',
          'JOINT_LIMIT',
          `${limb.mid}.flex = ${round(solution.midFlexDeg)}° fuera de [${min}, ${max}]`,
          constraintPath(constraint),
        );
      }
    }
  };
  solveLimbs(false);

  // 6. Objetos cargados: siguen a la mano.
  for (const [equipmentId, constraint] of carried) {
    const item = scene.equipment.find((e) => e.id === equipmentId);
    const parsed = parseTarget(constraint.target);
    if (!item || parsed?.kind !== 'anchor') continue;
    const definition = library[item.type];
    const anchor = definition?.anchors[parsed.anchor];
    if (definition && !anchor) {
      report(
        'error',
        'UNKNOWN_ANCHOR',
        `"${item.type}" no tiene el ancla "${parsed.anchor}"`,
        constraintPath(constraint),
      );
    }
    const effectorBone = rig.effectorPoints[constraint.effector].bone;
    const rotation = quatMultiply(
      world[effectorBone].rotation,
      quatInvert(anchor?.rotation ?? IDENTITY),
    );
    const anchorPoint = add(anchor?.position ?? ZERO, constraint.offset ?? ZERO);
    const position = sub(
      effectorPoint(rig, world, constraint.effector),
      rotate(rotation, anchorPoint),
    );
    equipment[equipmentId] = evaluateEquipment(item, definition, drivers, {
      position,
      rotation,
      carriedBy: constraint.effector,
    });
  }
  solveLimbs(true);

  // 7. Resultado y comprobación de alcance.
  const effectors = {} as Record<Effector, Vec3>;
  for (const effector of EFFECTORS) effectors[effector] = effectorPoint(rig, world, effector);

  for (const constraint of scene.constraints) {
    if (constraint.mode === 'carry' || constraint.weight < 1) continue;
    const target = resolved.get(constraint);
    if (!target) continue;
    const gap = distance(effectors[constraint.effector], target.position);
    if (gap > REACH_TOLERANCE) {
      report(
        'error',
        'IK_UNREACHABLE',
        `"${constraint.effector}" queda a ${round(gap * 100)} cm de "${constraint.target}"`,
        constraintPath(constraint),
      );
    }
  }

  return { time: null, progress, drivers, bones: world, local, effectors, equipment, issues };
}

/** Giro solo en Y que conserva hacia dónde mira el personaje (para apoyar pies en el suelo). */
export function headingRotation(rootRotation: Quat): Quat {
  const forward = rotate(rootRotation, [0, 0, 1]);
  let flat: Vec3 = [forward[0], 0, forward[2]];
  if (length(flat) < 0.3) {
    // Tumbado o colgado: se usa la dirección de los pies.
    const down = rotate(rootRotation, [0, -1, 0]);
    flat = [down[0], 0, down[2]];
  }
  const dir = normalize(flat);
  if (length(dir) === 0) return IDENTITY;
  return quatFromAxisAngle([0, 1, 0], Math.atan2(dir[0], dir[2]));
}

const round = (x: number) => Math.round(x * 10) / 10;

import { FOOT_EFFECTORS, parseTarget, type Scene, type ValidationIssue } from '@gym-anim/schema';
import { frameCount } from './animation';
import { evaluateFrame, type EvaluateOptions } from './evaluate';
import { distance, type Vec3 } from './math';

/** Desplazamiento máximo de un pie fijado, respecto al primer frame, antes de avisar `FOOT_SLIDING`. */
export const SLIDE_TOLERANCE = 0.01;

/**
 * Validación biomecánica de un ciclo completo (ESPECIFICACION §8.4): evalúa cada frame y
 * devuelve cada problema una sola vez, con el primer frame en que aparece.
 * La revisión contra el catálogo de assets es `lintScene` (en `@gym-anim/schema`).
 */
export function validateMotion(scene: Scene, options: EvaluateOptions = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: ValidationIssue) => {
    const key = `${issue.code}|${issue.path.join('.')}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  // Solo pies fijados a algo inmóvil: un pie en la plataforma de una máquina se mueve con ella.
  const pinnedFeet = scene.constraints.filter(
    (c) =>
      c.mode === 'pin' &&
      (FOOT_EFFECTORS as readonly string[]).includes(c.effector) &&
      parseTarget(c.target)?.kind !== 'anchor',
  );
  let start: Record<string, Vec3> | null = null;

  const total = frameCount(scene);
  for (let frame = 0; frame < total; frame++) {
    const result = evaluateFrame(scene, frame, options);
    for (const issue of result.issues) add({ ...issue, frame });

    start ??= result.effectors;
    for (const constraint of pinnedFeet) {
      const drift = distance(start[constraint.effector]!, result.effectors[constraint.effector]);
      if (drift > SLIDE_TOLERANCE) {
        add({
          level: 'warning',
          code: 'FOOT_SLIDING',
          message: `"${constraint.effector}" se desplaza ${Math.round(drift * 1000) / 10} cm aunque está fijado`,
          path: ['constraints', scene.constraints.indexOf(constraint)],
          frame,
        });
      }
    }
  }
  return issues;
}

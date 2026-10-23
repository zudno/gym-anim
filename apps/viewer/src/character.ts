import * as THREE from 'three';
import { add, distance, rotate, type EvaluatedFrame, type Vec3 } from '@gym-anim/core';
import type { Bone, MuscleId, Muscles } from '@gym-anim/schema';

/**
 * Maniquí provisional hecho de cápsulas entre articulaciones, hasta tener el personaje .glb.
 * Cada segmento conoce los músculos que cubre para colorearse como principal o secundario.
 */

export const COLORS = {
  body: 0xd8d8d4,
  primary: 0xd9363e,
  secondary: 0xf2a0a0,
};

interface Point {
  bone: Bone;
  offset?: Vec3;
}

interface SegmentDefinition {
  from: Point;
  to: Point;
  radius: number;
  muscles: MuscleId[];
}

const p = (bone: Bone, offset?: Vec3): Point => ({ bone, offset });

function sideSegments(s: 'L' | 'R'): SegmentDefinition[] {
  const b = (name: string) => `${name}_${s}` as Bone;
  return [
    {
      from: p(b('shoulder')),
      to: p(b('upper_arm')),
      radius: 0.055,
      muscles: ['deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior', 'trapezius_upper'],
    },
    {
      from: p(b('upper_arm')),
      to: p(b('forearm')),
      radius: 0.05,
      muscles: [
        'biceps_brachii',
        'brachialis',
        'triceps_brachii',
        'deltoid_anterior',
        'deltoid_lateral',
        'deltoid_posterior',
      ],
    },
    {
      from: p(b('forearm')),
      to: p(b('hand')),
      radius: 0.04,
      muscles: ['brachioradialis', 'forearm_flexors', 'forearm_extensors'],
    },
    { from: p(b('hand')), to: p(b('hand'), [0, -0.08, 0]), radius: 0.035, muscles: [] },
    {
      from: p(b('thigh')),
      to: p(b('shin')),
      radius: 0.072,
      muscles: ['quadriceps', 'hamstrings', 'adductors'],
    },
    {
      from: p(b('shin')),
      to: p(b('foot')),
      radius: 0.052,
      muscles: ['gastrocnemius', 'soleus', 'tibialis_anterior'],
    },
    { from: p(b('foot'), [0, -0.03, -0.02]), to: p(b('toe')), radius: 0.035, muscles: [] },
  ];
}

const SEGMENTS: SegmentDefinition[] = [
  {
    from: p('thigh_R'),
    to: p('thigh_L'),
    radius: 0.11,
    muscles: ['gluteus_maximus', 'gluteus_medius', 'hip_flexors', 'adductors'],
  },
  {
    from: p('hips'),
    to: p('spine1'),
    radius: 0.12,
    muscles: ['rectus_abdominis', 'obliques', 'erector_spinae'],
  },
  {
    from: p('spine1'),
    to: p('spine2'),
    radius: 0.135,
    muscles: [
      'pectoralis_major',
      'pectoralis_minor',
      'latissimus_dorsi',
      'teres_major',
      'rhomboids',
      'trapezius_middle',
      'erector_spinae',
      'rectus_abdominis',
      'obliques',
    ],
  },
  {
    from: p('shoulder_R'),
    to: p('shoulder_L'),
    radius: 0.1,
    muscles: [
      'pectoralis_major',
      'trapezius_upper',
      'trapezius_middle',
      'rhomboids',
      'latissimus_dorsi',
    ],
  },
  { from: p('neck'), to: p('head'), radius: 0.05, muscles: ['trapezius_upper'] },
  { from: p('head', [0, 0.05, 0.01]), to: p('head', [0, 0.14, 0.01]), radius: 0.095, muscles: [] },
  ...sideSegments('L'),
  ...sideSegments('R'),
];

function resolve(frame: EvaluatedFrame, point: Point): Vec3 {
  const bone = frame.bones[point.bone];
  return point.offset ? add(bone.position, rotate(bone.rotation, point.offset)) : bone.position;
}

const UP = new THREE.Vector3(0, 1, 0);

export class Mannequin {
  readonly object = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly materials = {
    body: new THREE.MeshStandardMaterial({ color: COLORS.body, roughness: 0.65 }),
    primary: new THREE.MeshStandardMaterial({ color: COLORS.primary, roughness: 0.55 }),
    secondary: new THREE.MeshStandardMaterial({ color: COLORS.secondary, roughness: 0.6 }),
  };

  /** Los segmentos son rígidos: su longitud se toma de un frame cualquiera. */
  constructor(reference: EvaluatedFrame) {
    for (const segment of SEGMENTS) {
      const length = distance(resolve(reference, segment.from), resolve(reference, segment.to));
      const geometry = new THREE.CapsuleGeometry(segment.radius, Math.max(length, 0.001), 6, 16);
      const mesh = new THREE.Mesh(geometry, this.materials.body);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
      this.object.add(mesh);
    }
  }

  setMuscles(muscles: Muscles): void {
    SEGMENTS.forEach((segment, i) => {
      const covers = (ids: MuscleId[]) => segment.muscles.some((m) => ids.includes(m));
      this.meshes[i]!.material = covers(muscles.primary)
        ? this.materials.primary
        : covers(muscles.secondary)
          ? this.materials.secondary
          : this.materials.body;
    });
  }

  update(frame: EvaluatedFrame): void {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    SEGMENTS.forEach((segment, i) => {
      const mesh = this.meshes[i]!;
      from.fromArray(resolve(frame, segment.from));
      to.fromArray(resolve(frame, segment.to));
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      const dir = to.sub(from);
      if (dir.lengthSq() > 1e-12) mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    });
  }
}

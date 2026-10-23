import { z } from 'zod';

/** Grupos musculares resaltables (ver ESPECIFICACION §15.3). */
export const MUSCLE_IDS = [
  'pectoralis_major',
  'pectoralis_minor',
  'deltoid_anterior',
  'deltoid_lateral',
  'deltoid_posterior',
  'biceps_brachii',
  'brachialis',
  'brachioradialis',
  'triceps_brachii',
  'forearm_flexors',
  'forearm_extensors',
  'latissimus_dorsi',
  'trapezius_upper',
  'trapezius_middle',
  'rhomboids',
  'teres_major',
  'erector_spinae',
  'rectus_abdominis',
  'obliques',
  'gluteus_maximus',
  'gluteus_medius',
  'hip_flexors',
  'adductors',
  'quadriceps',
  'hamstrings',
  'gastrocnemius',
  'soleus',
  'tibialis_anterior',
] as const;
export const MuscleIdSchema = z.enum(MUSCLE_IDS);
export type MuscleId = z.infer<typeof MuscleIdSchema>;

export const MUSCLE_REGIONS = ['chest', 'shoulder', 'arm', 'back', 'core', 'hip', 'leg'] as const;
export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

export interface MuscleInfo {
  region: MuscleRegion;
  /** Nombre visible en el editor. */
  label: string;
}

export const MUSCLE_INFO: Record<MuscleId, MuscleInfo> = {
  pectoralis_major: { region: 'chest', label: 'Pectoral mayor' },
  pectoralis_minor: { region: 'chest', label: 'Pectoral menor' },
  deltoid_anterior: { region: 'shoulder', label: 'Deltoides anterior' },
  deltoid_lateral: { region: 'shoulder', label: 'Deltoides lateral' },
  deltoid_posterior: { region: 'shoulder', label: 'Deltoides posterior' },
  biceps_brachii: { region: 'arm', label: 'Bíceps braquial' },
  brachialis: { region: 'arm', label: 'Braquial' },
  brachioradialis: { region: 'arm', label: 'Braquiorradial' },
  triceps_brachii: { region: 'arm', label: 'Tríceps braquial' },
  forearm_flexors: { region: 'arm', label: 'Flexores del antebrazo' },
  forearm_extensors: { region: 'arm', label: 'Extensores del antebrazo' },
  latissimus_dorsi: { region: 'back', label: 'Dorsal ancho' },
  trapezius_upper: { region: 'back', label: 'Trapecio superior' },
  trapezius_middle: { region: 'back', label: 'Trapecio medio' },
  rhomboids: { region: 'back', label: 'Romboides' },
  teres_major: { region: 'back', label: 'Redondo mayor' },
  erector_spinae: { region: 'back', label: 'Erectores espinales' },
  rectus_abdominis: { region: 'core', label: 'Recto abdominal' },
  obliques: { region: 'core', label: 'Oblicuos' },
  gluteus_maximus: { region: 'hip', label: 'Glúteo mayor' },
  gluteus_medius: { region: 'hip', label: 'Glúteo medio' },
  hip_flexors: { region: 'hip', label: 'Flexores de cadera' },
  adductors: { region: 'hip', label: 'Aductores' },
  quadriceps: { region: 'leg', label: 'Cuádriceps' },
  hamstrings: { region: 'leg', label: 'Isquiotibiales' },
  gastrocnemius: { region: 'leg', label: 'Gastrocnemio' },
  soleus: { region: 'leg', label: 'Sóleo' },
  tibialis_anterior: { region: 'leg', label: 'Tibial anterior' },
};

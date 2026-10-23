import { totalLoadKg, type Load, type PlateKg } from '@gym-anim/schema';

/** Medidas en metros de los discos olímpicos (bumper de 10–25 kg, metálicos los menores). */
export const PLATE_SPECS: Readonly<Record<PlateKg, { diameter: number; thickness: number }>> = {
  25: { diameter: 0.45, thickness: 0.055 },
  20: { diameter: 0.45, thickness: 0.045 },
  15: { diameter: 0.45, thickness: 0.035 },
  10: { diameter: 0.45, thickness: 0.03 },
  5: { diameter: 0.228, thickness: 0.025 },
  2.5: { diameter: 0.19, thickness: 0.02 },
  1.25: { diameter: 0.16, thickness: 0.015 },
};

export interface PlacedPlate {
  kg: PlateKg;
  /** +1 lado izquierdo (+X), −1 lado derecho. */
  side: 1 | -1;
  /** Centro del disco sobre el eje X de la barra. */
  x: number;
  diameter: number;
  thickness: number;
}

export interface BarbellGeometry {
  length: number;
  shaftDiameter: number;
  sleeveDiameter: number;
  /** Distancia del centro a la cara interior del collarín. */
  sleeveStart: number;
  sleeveEnd: number;
  plates: PlacedPlate[];
  totalKg: number;
  /** `true` si los discos no caben en la manga. */
  overflow: boolean;
}

export function barbellGeometry(load: Extract<Load, { kind: 'barbell' }>): BarbellGeometry {
  // Manga cargable de 0.415 m; el resto hasta 1.1 m es el tope final.
  const sleeveStart = 0.655;
  const sleeveEnd = 1.07;
  const plates: PlacedPlate[] = [];
  let cursor = sleeveStart;
  for (const kg of load.platesPerSide) {
    const spec = PLATE_SPECS[kg];
    const x = cursor + spec.thickness / 2;
    plates.push({ kg, side: 1, x, ...spec }, { kg, side: -1, x: -x, ...spec });
    cursor += spec.thickness;
  }
  return {
    length: 2.2,
    shaftDiameter: 0.028,
    sleeveDiameter: 0.05,
    sleeveStart,
    sleeveEnd,
    plates,
    totalKg: totalLoadKg(load),
    overflow: cursor > sleeveEnd,
  };
}

export interface DumbbellGeometry {
  kg: number;
  handleLength: number;
  handleDiameter: number;
  /** Diámetro entre caras de las cabezas hexagonales. */
  headDiameter: number;
  headLength: number;
  totalLength: number;
}

const IRON_DENSITY = 7800;
const HEAD_LENGTH_RATIO = 1.2;

/** Cabezas hexagonales de hierro dimensionadas por volumen a partir del peso. */
export function dumbbellGeometry(kg: number): DumbbellGeometry {
  const handleLength = 0.13;
  const handleKg = 0.5;
  const headKg = Math.max(kg - handleKg, 0.5) / 2;
  // Volumen de un prisma hexagonal ≈ 0.866·d²·L, con L = ratio·(d/2).
  const volume = headKg / IRON_DENSITY;
  const headDiameter = Math.cbrt(volume / (0.866 * HEAD_LENGTH_RATIO * 0.5));
  const headLength = HEAD_LENGTH_RATIO * (headDiameter / 2);
  return {
    kg,
    handleLength,
    handleDiameter: 0.032,
    headDiameter,
    headLength,
    totalLength: handleLength + 2 * headLength,
  };
}

export interface StackGeometry {
  plateKg: number;
  plateCount: number;
  /** Placas que levanta el pasador. */
  selectedPlates: number;
  plateHeight: number;
  plateWidth: number;
  plateDepth: number;
}

export function stackGeometry(selectedKg: number, plateKg = 5, plateCount = 20): StackGeometry {
  return {
    plateKg,
    plateCount,
    selectedPlates: Math.min(plateCount, Math.max(1, Math.round(selectedKg / plateKg))),
    plateHeight: 0.025,
    plateWidth: 0.3,
    plateDepth: 0.15,
  };
}

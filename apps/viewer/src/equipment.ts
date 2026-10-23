import * as THREE from 'three';
import {
  PLACEHOLDER_LIBRARY,
  barbellGeometry,
  dumbbellGeometry,
  stackGeometry,
  type EvaluatedEquipment,
} from '@gym-anim/core';
import type { EquipmentInstance, PlateKg } from '@gym-anim/schema';

/**
 * Geometría provisional de los equipos del MVP, dibujada con primitivas en el espacio local
 * de cada equipo y alineada con las anclas de `PLACEHOLDER_LIBRARY`.
 */

export interface EquipmentView {
  object: THREE.Object3D;
  update(equipment: EvaluatedEquipment): void;
}

const material = (color: number, roughness = 0.5, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const MATERIALS = {
  frame: material(0x3b3d42, 0.45, 0.5),
  chrome: material(0xc4c4c8, 0.25, 0.9),
  pad: material(0x2a2a2d, 0.85),
  iron: material(0x26262a, 0.55, 0.4),
  cable: new THREE.LineBasicMaterial({ color: 0x444448 }),
};

/** Colores de discos bumper (atenuados para el look de estudio). */
const PLATE_COLORS: Record<PlateKg, number> = {
  25: 0xb5373c,
  20: 0x2f5d9e,
  15: 0xc9a227,
  10: 0x3f7d4f,
  5: 0x2a2a2d,
  2.5: 0x2a2a2d,
  1.25: 0x2a2a2d,
};

function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(size: [number, number, number], at: [number, number, number], mat: THREE.Material) {
  const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(...size), mat));
  mesh.position.set(...at);
  return mesh;
}

/** Cilindro con el eje a lo largo de X. */
function cylinderX(radius: number, length: number, x: number, mat: THREE.Material, sides = 24) {
  const mesh = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, sides), mat),
  );
  mesh.rotation.z = Math.PI / 2;
  mesh.position.x = x;
  return mesh;
}

function placed(object: THREE.Object3D): EquipmentView {
  return {
    object,
    update(equipment) {
      object.position.fromArray(equipment.position);
      object.quaternion.fromArray(equipment.rotation);
    },
  };
}

function flatBench(): EquipmentView {
  const group = new THREE.Group();
  group.add(
    box([0.28, 0.08, 1.2], [0, 0.41, 0], MATERIALS.pad),
    box([0.06, 0.06, 1.0], [0, 0.22, 0], MATERIALS.frame),
    box([0.34, 0.37, 0.05], [0, 0.185, 0.5], MATERIALS.frame),
    box([0.34, 0.37, 0.05], [0, 0.185, -0.5], MATERIALS.frame),
  );
  return placed(group);
}

function barbell(item: EquipmentInstance): EquipmentView {
  const load =
    item.load?.kind === 'barbell'
      ? item.load
      : { kind: 'barbell' as const, barKg: 20, platesPerSide: [] };
  const geo = barbellGeometry(load);
  const group = new THREE.Group();
  group.add(cylinderX(geo.shaftDiameter / 2, geo.sleeveStart * 2, 0, MATERIALS.chrome));
  for (const side of [1, -1]) {
    const sleeveLength = geo.length / 2 - geo.sleeveStart;
    group.add(
      cylinderX(
        geo.sleeveDiameter / 2,
        sleeveLength,
        side * (geo.sleeveStart + sleeveLength / 2),
        MATERIALS.chrome,
      ),
      cylinderX(0.04, 0.02, side * (geo.sleeveStart - 0.01), MATERIALS.chrome),
    );
  }
  for (const plate of geo.plates) {
    group.add(
      cylinderX(
        plate.diameter / 2,
        plate.thickness,
        plate.x,
        material(PLATE_COLORS[plate.kg], 0.6),
        40,
      ),
    );
  }
  return placed(group);
}

function dumbbell(item: EquipmentInstance): EquipmentView {
  const geo = dumbbellGeometry(item.load?.kind === 'dumbbell' ? item.load.kg : 10);
  const group = new THREE.Group();
  group.add(cylinderX(geo.handleDiameter / 2, geo.handleLength, 0, MATERIALS.chrome));
  // Cabeza hexagonal: el radio circunscrito sale del diámetro entre caras.
  const radius = geo.headDiameter / 2 / Math.cos(Math.PI / 6);
  for (const side of [1, -1]) {
    group.add(
      cylinderX(
        radius,
        geo.headLength,
        (side * (geo.handleLength + geo.headLength)) / 2,
        MATERIALS.iron,
        6,
      ),
    );
  }
  return placed(group);
}

function latPulldown(item: EquipmentInstance): EquipmentView {
  const def = PLACEHOLDER_LIBRARY.lat_pulldown!;
  const group = new THREE.Group();
  const knee = def.anchors.knee_pad!.position;
  const pulley = new THREE.Vector3(0, 2.15, 0.12);

  const kneePad = cylinderX(0.05, 0.42, 0, MATERIALS.pad);
  kneePad.position.set(knee[0], knee[1] + 0.04, knee[2]);
  group.add(
    kneePad,
    box([0.38, 0.08, 0.36], [0, 0.38, 0], MATERIALS.pad),
    box([0.06, 0.34, 0.06], [0, 0.17, 0], MATERIALS.frame),
    box([0.5, 0.04, 0.9], [0, 0.02, 0.35], MATERIALS.frame),
    box([0.12, 2.3, 0.12], [0, 1.15, 0.8], MATERIALS.frame),
    box([0.08, 0.08, 0.75], [0, 2.22, 0.45], MATERIALS.frame),
    box([0.04, 0.5, 0.04], [0, 0.6, 0.4], MATERIALS.frame),
  );

  const pulleyMesh = shadowed(
    new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 24), MATERIALS.chrome),
  );
  pulleyMesh.position.copy(pulley);
  pulleyMesh.rotation.y = Math.PI / 2;
  group.add(pulleyMesh);

  // Stack detrás de la columna: las placas por encima del pasador suben con la barra.
  const stack = stackGeometry(item.load?.kind === 'stack' ? item.load.selectedKg : 40);
  const lifted = new THREE.Group();
  const stackZ = 0.98;
  for (let i = 0; i < stack.plateCount; i++) {
    const fromTop = stack.plateCount - 1 - i;
    const plate = box(
      [stack.plateWidth, stack.plateHeight - 0.003, stack.plateDepth],
      [0, 0.1 + i * stack.plateHeight, stackZ],
      MATERIALS.iron,
    );
    (fromTop < stack.selectedPlates ? lifted : group).add(plate);
  }
  group.add(lifted);
  for (const x of [-0.1, 0.1])
    group.add(box([0.012, 1.6, 0.012], [x, 0.85, stackZ], MATERIALS.chrome));

  const bar = new THREE.Group();
  bar.add(cylinderX(0.014, 1.2, 0, MATERIALS.chrome));
  for (const side of [1, -1]) {
    const grip = cylinderX(0.018, 0.14, side * 0.5, MATERIALS.pad);
    grip.rotation.set(0, 0, Math.PI / 2 - side * 0.35);
    bar.add(grip);
  }
  group.add(bar);

  const cableGeometry = new THREE.BufferGeometry().setFromPoints([pulley, pulley.clone()]);
  group.add(new THREE.Line(cableGeometry, MATERIALS.cable));

  return {
    object: group,
    update(equipment) {
      group.position.fromArray(equipment.position);
      group.quaternion.fromArray(equipment.rotation);
      group.updateMatrixWorld(true);
      const left = group.worldToLocal(
        new THREE.Vector3().fromArray(equipment.anchors.grip_L!.position),
      );
      const right = group.worldToLocal(
        new THREE.Vector3().fromArray(equipment.anchors.grip_R!.position),
      );
      bar.position.copy(left).add(right).multiplyScalar(0.5);
      lifted.position.y = equipment.joints.bar ?? 0;
      cableGeometry.setFromPoints([pulley, bar.position]);
    },
  };
}

function unknown(): EquipmentView {
  return placed(box([0.3, 0.3, 0.3], [0, 0.15, 0], material(0x999999)));
}

export function createEquipmentView(item: EquipmentInstance): EquipmentView {
  switch (item.type) {
    case 'flat_bench':
      return flatBench();
    case 'barbell':
      return barbell(item);
    case 'dumbbell':
      return dumbbell(item);
    case 'lat_pulldown':
      return latPulldown(item);
    default:
      return unknown();
  }
}

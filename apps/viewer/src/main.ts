import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  evaluate,
  evaluateProgress,
  frameCount,
  validateMotion,
  type EvaluatedFrame,
  type Vec3,
} from '@gym-anim/core';
import {
  CAMERA_PRESETS,
  MUSCLE_INFO,
  cycleDuration,
  lintScene,
  parseCatalog,
  parseScene,
  type Scene,
  type ValidationIssue,
} from '@gym-anim/schema';
import catalogJson from '@gym-anim/schema/fixtures/catalog.mvp.json';
import benchJson from '@gym-anim/schema/fixtures/scenes/barbell-bench-press.json';
import curlJson from '@gym-anim/schema/fixtures/scenes/dumbbell-curl.json';
import latJson from '@gym-anim/schema/fixtures/scenes/lat-pulldown.json';
import { COLORS, Mannequin } from './character';
import { createEquipmentView, type EquipmentView } from './equipment';

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const catalogResult = parseCatalog(catalogJson);
const catalog = catalogResult.success ? catalogResult.data : undefined;

const scenes: Scene[] = [curlJson, benchJson, latJson].map((raw) => {
  const result = parseScene(raw);
  if (!result.success) throw new Error(`Escena inválida: ${JSON.stringify(result.issues)}`);
  return result.data;
});

// ---------------------------------------------------------------------------
// Three.js: renderer, escena de estudio y cámara
// ---------------------------------------------------------------------------

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const world = new THREE.Scene();
world.background = new THREE.Color(0xf4f4f2);

world.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c4, 1.8));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2.5, 5, 3.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -2.5;
key.shadow.camera.right = key.shadow.camera.top = 2.5;
key.shadow.radius = 4;
key.shadow.bias = -0.0005;
world.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.8);
rim.position.set(-3, 3, -4);
world.add(rim);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 64),
  new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
world.add(floor);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/** Dirección de cada preset desde el objetivo (el personaje mira a +Z, su izquierda es +X). */
const CAMERA_DIRECTIONS: Record<(typeof CAMERA_PRESETS)[number], Vec3> = {
  front: [0, 0.25, 1],
  back: [0, 0.25, -1],
  left: [1, 0.2, 0],
  right: [-1, 0.2, 0],
  three_quarter_left: [0.75, 0.3, 0.75],
  three_quarter_right: [-0.75, 0.3, 0.75],
  top: [0, 1, 0.001],
};
const CAMERA_LABELS: Record<(typeof CAMERA_PRESETS)[number], string> = {
  front: 'Frontal',
  back: 'Espalda',
  left: 'Izquierda',
  right: 'Derecha',
  three_quarter_left: '¾ izq.',
  three_quarter_right: '¾ der.',
  top: 'Cenital',
};

function resize(): void {
  const { innerWidth: w, innerHeight: h } = window;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Estado de la escena actual
// ---------------------------------------------------------------------------

let current: Scene = scenes[0]!;
let mannequin: Mannequin | null = null;
let views = new Map<string, EquipmentView>();
const content = new THREE.Group();
const anchorMarkers = new THREE.Group();
world.add(content, anchorMarkers);

let time = 0;
let playing = true;
let speed = 1;
let scrubProgress = 0;
let framing = new THREE.Vector3();

function setCamera(preset: (typeof CAMERA_PRESETS)[number]): void {
  const dir = new THREE.Vector3(...CAMERA_DIRECTIONS[preset]).normalize();
  const distance = 3.6 * (35 / camera.fov);
  camera.position.copy(framing).addScaledVector(dir, distance);
  controls.target.copy(framing);
  controls.update();
  document.querySelectorAll<HTMLButtonElement>('#cameras button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.preset === preset));
  });
}

function loadScene(scene: Scene): void {
  current = scene;
  time = 0;
  scrubProgress = 0;
  content.clear();
  views = new Map();

  const first = evaluateProgress(scene, 0);
  mannequin = new Mannequin(first);
  mannequin.setMuscles(scene.character.muscles);
  content.add(mannequin.object);
  for (const item of scene.equipment) {
    const view = createEquipmentView(item);
    views.set(item.id, view);
    content.add(view.object);
  }

  // Encuadre: punto medio entre pelvis y cabeza al inicio y al final del movimiento.
  const last = evaluateProgress(scene, 1);
  framing = new THREE.Vector3(
    ...[first, last]
      .flatMap((f) => [f.effectors.pelvis, f.effectors.head])
      .reduce<Vec3>(
        (acc, v) => [acc[0] + v[0] / 4, acc[1] + v[1] / 4, acc[2] + v[2] / 4],
        [0, 0, 0],
      ),
  );
  camera.fov = scene.camera.fov;
  camera.updateProjectionMatrix();
  setCamera(scene.camera.preset ?? 'three_quarter_left');

  renderSceneInfo(scene);
  applyFrame(first);
}

function applyFrame(frame: EvaluatedFrame): void {
  mannequin?.update(frame);
  for (const [id, view] of views) {
    const equipment = frame.equipment[id];
    if (equipment) view.update(equipment);
  }
  if (anchorMarkers.visible) {
    anchorMarkers.clear();
    for (const equipment of Object.values(frame.equipment)) {
      for (const anchor of Object.values(equipment.anchors)) {
        const marker = new THREE.Mesh(MARKER_GEOMETRY, MARKER_MATERIAL);
        marker.position.fromArray(anchor.position);
        anchorMarkers.add(marker);
      }
    }
  }
}

const MARKER_GEOMETRY = new THREE.SphereGeometry(0.02, 12, 8);
const MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x1e88e5, depthTest: false });
anchorMarkers.renderOrder = 10;
anchorMarkers.visible = false;

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const sceneSelect = $<HTMLSelectElement>('#scene-select');
const playButton = $<HTMLButtonElement>('#play');
const progressInput = $<HTMLInputElement>('#progress');
const clock = $<HTMLSpanElement>('#clock');

scenes.forEach((scene, i) => sceneSelect.add(new Option(scene.name, String(i))));
sceneSelect.addEventListener('change', () => loadScene(scenes[Number(sceneSelect.value)]!));

playButton.addEventListener('click', () => {
  playing = !playing;
  playButton.textContent = playing ? 'Pausa' : 'Reproducir';
});

progressInput.addEventListener('input', () => {
  playing = false;
  playButton.textContent = 'Reproducir';
  scrubProgress = Number(progressInput.value);
});

$<HTMLSelectElement>('#speed').addEventListener('change', (e) => {
  speed = Number((e.target as HTMLSelectElement).value);
});

$<HTMLInputElement>('#show-anchors').addEventListener('change', (e) => {
  anchorMarkers.visible = (e.target as HTMLInputElement).checked;
  if (!anchorMarkers.visible) anchorMarkers.clear();
});

const cameras = $<HTMLDivElement>('#cameras');
for (const preset of CAMERA_PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = CAMERA_LABELS[preset];
  button.dataset.preset = preset;
  button.addEventListener('click', () => setCamera(preset));
  cameras.append(button);
}

function renderSceneInfo(scene: Scene): void {
  $<HTMLParagraphElement>('#scene-description').textContent = scene.description ?? '';

  const muscles = $<HTMLUListElement>('#muscles');
  muscles.replaceChildren(
    ...[
      ...scene.character.muscles.primary.map((m) => [m, COLORS.primary] as const),
      ...scene.character.muscles.secondary.map((m) => [m, COLORS.secondary] as const),
    ].map(([muscle, color]) => {
      const li = document.createElement('li');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = `#${color.toString(16).padStart(6, '0')}`;
      li.append(swatch, MUSCLE_INFO[muscle].label);
      return li;
    }),
  );

  const issues: ValidationIssue[] = [...lintScene(scene, catalog), ...validateMotion(scene)];
  const list = $<HTMLUListElement>('#issues');
  if (issues.length === 0) {
    const li = document.createElement('li');
    li.className = 'issue-ok';
    li.textContent = `Sin problemas en el ciclo (${frameCount(scene)} frames, ${cycleDuration(scene.tempo, scene.loop).toFixed(1)} s)`;
    list.replaceChildren(li);
  } else {
    list.replaceChildren(
      ...issues.map((issue) => {
        const li = document.createElement('li');
        li.className = `issue-${issue.level}`;
        li.textContent = `${issue.code}${issue.frame !== undefined ? ` (frame ${issue.frame})` : ''}: ${issue.message}`;
        return li;
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Bucle
// ---------------------------------------------------------------------------

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  let frame: EvaluatedFrame;
  if (playing) {
    time += dt * speed;
    frame = evaluate(current, time);
    progressInput.value = String(frame.progress);
  } else {
    frame = evaluateProgress(current, scrubProgress);
  }
  applyFrame(frame);
  clock.textContent = `${(frame.time ?? 0).toFixed(2)} s · ${Math.round(frame.progress * 100)}%`;

  controls.update();
  renderer.render(world, camera);
  requestAnimationFrame(tick);
}

loadScene(current);
requestAnimationFrame(tick);

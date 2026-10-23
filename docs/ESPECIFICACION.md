# Gym Anim — Especificación técnica y plan de desarrollo

> Sistema para crear, editar y renderizar animaciones de ejercicios de gimnasio en 3D (estilo anatómico limpio: maniquí gris/blanco con músculos objetivo resaltados), editable desde un editor web y controlable por un agente de IA.

| Campo                 | Valor             |
| --------------------- | ----------------- |
| Versión del documento | 0.1               |
| Fecha                 | 2026-10-22        |
| Estado                | Borrador para MVP |

---

## Índice

1. [Visión y objetivos](#1-visión-y-objetivos)
2. [Principios de diseño](#2-principios-de-diseño)
3. [Arquitectura general](#3-arquitectura-general)
4. [Stack tecnológico](#4-stack-tecnológico)
5. [Estructura del repositorio](#5-estructura-del-repositorio)
6. [Pipeline de assets](#6-pipeline-de-assets)
7. [Modelo de datos (escena JSON)](#7-modelo-de-datos-escena-json)
8. [Sistema de animación: drivers, restricciones e IK](#8-sistema-de-animación-drivers-restricciones-e-ik)
9. [Editor web](#9-editor-web)
10. [Render y exportación](#10-render-y-exportación)
11. [Agente de IA](#11-agente-de-ia)
12. [Requerimientos del MVP](#12-requerimientos-del-mvp)
13. [Fases de desarrollo](#13-fases-de-desarrollo)
14. [Riesgos y mitigaciones](#14-riesgos-y-mitigaciones)
15. [Convenciones y glosario](#15-convenciones-y-glosario)

---

## 1. Visión y objetivos

### Visión

Una herramienta propia para producir animaciones de ejercicios de calidad profesional sin depender de software de animación tradicional: se describe o se arma el ejercicio (personaje + máquina/pesas + movimiento) y el sistema genera un loop limpio listo para apps, webs o redes.

### Objetivos

- **O1.** Crear un ejercicio animado en minutos, no en horas.
- **O2.** Manipular al personaje de forma intuitiva (arrastrar manos/pies/pelvis, no rotar huesos uno por uno).
- **O3.** Colocar al personaje en máquinas y agregar pesas con _drag & drop_ y _snap_ automático.
- **O4.** Que un agente de IA pueda crear y modificar animaciones a partir de lenguaje natural.
- **O5.** Exportar en formatos útiles (MP4, WebM con transparencia, GIF, PNG).

### Fuera de alcance (por ahora)

- Simulación física real (fuerzas, cargas articulares).
- Ropa, cabello o personajes realistas con piel.
- Captura de movimiento desde video.
- Multiusuario en tiempo real.

### Nota de licencias

El estilo es **inspirado** en las ilustraciones anatómicas de ejercicio comerciales; no se deben copiar ni reutilizar modelos, texturas o renders de terceros. Todos los assets deben ser propios o tener licencia compatible (CC0 / comercial adquirida).

---

## 2. Principios de diseño

1. **La escena es un documento JSON.** Toda animación es un archivo de escena validado por esquema. No existe estado "oculto" fuera de él.
2. **Una sola API de comandos.** El editor (ratón) y el agente de IA (herramientas) modifican la escena mediante los **mismos comandos**. Esto da deshacer/rehacer, historial y colaboración humano–IA gratis.
3. **Alto nivel primero.** Se anima con _drivers_ (barra, palanca de máquina, ángulo articular) y _restricciones_ (mano en agarre, pelvis en asiento). Los huesos se resuelven con IK.
4. **Núcleo agnóstico de UI.** La lógica (IK, evaluación de frames, validación) vive en un paquete TypeScript sin React, reutilizable en navegador, servidor y agente.
5. **Determinismo.** Dado un JSON y un número de frame, el resultado visual es siempre idéntico (requisito para render en servidor y para que la IA verifique su trabajo).
6. **Los assets se autodescriben.** Las máquinas declaran sus anclas y articulaciones dentro del propio `.glb`; agregar una máquina no requiere tocar código.

---

## 3. Arquitectura general

```
┌──────────────┐    comandos     ┌───────────────────┐    comandos    ┌──────────────┐
│ Editor web   │ ─────────────▶ │  Núcleo (core)    │ ◀───────────── │ Agente IA    │
│ (gizmos,     │ ◀───────────── │  esquema + IK +   │ ─────────────▶ │ (tool use /  │
│  timeline)   │  escena JSON    │  evaluación anim. │  JSON + render │  MCP)        │
└──────────────┘                 └─────────┬─────────┘                └──────────────┘
                                           ▼
                                 Render: navegador (preview)
                                 + worker headless (MP4/GIF/PNG)
```

### Componentes

| Componente | Responsabilidad                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `schema`   | Tipos y validación (Zod) de escena, equipos, poses, comandos. Genera JSON Schema para la IA.                           |
| `core`     | Aplicar comandos, resolver restricciones/IK, interpolar keyframes, evaluar pose en un tiempo `t`, validar biomecánica. |
| `assets`   | Personajes y equipos `.glb` + manifiestos (`manifest.json`) con metadatos.                                             |
| `editor`   | UI web: viewport 3D, gizmos, biblioteca, timeline, paneles.                                                            |
| `agent`    | Servidor con Claude (tool use) + servidor MCP que expone las mismas herramientas.                                      |
| `renderer` | Worker headless que renderiza frames deterministas y codifica video.                                                   |

### Flujo de datos

1. El usuario o la IA emite un **comando** (`add_equipment`, `attach`, `set_keyframe`…).
2. `core` valida el comando, lo aplica y produce una **nueva escena** (inmutable) + entrada en historial.
3. El viewport evalúa la escena en el tiempo actual y dibuja.
4. El render final evalúa frame por frame y codifica.

---

## 4. Stack tecnológico

| Área                    | Tecnología                                                             | Motivo                                                  |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Lenguaje                | TypeScript (estricto)                                                  | Tipos compartidos entre editor, core, agente y renderer |
| Monorepo                | pnpm workspaces + Turborepo                                            | Paquetes compartidos, builds incrementales              |
| 3D                      | Three.js + React Three Fiber + drei                                    | Ecosistema maduro, gizmos, carga glTF                   |
| Postproceso             | `postprocessing` + N8AO                                                | Oclusión ambiental y look de estudio                    |
| UI                      | React + Vite + Tailwind + Radix UI                                     | Rapidez de desarrollo                                   |
| Estado                  | Zustand (+ historial de comandos propio)                               | Simple, compatible con patrón comando                   |
| Validación              | Zod 4 (JSON Schema nativo con `z.toJSONSchema`)                        | Un solo esquema para runtime, tipos y tool definitions  |
| Agente                  | Node + Anthropic SDK (TypeScript), MCP SDK                             | Tool use + exposición vía MCP                           |
| Modelos IA              | `claude-sonnet-5-5` (por defecto), `claude-opus-5-5` (casos complejos) | Visión + tool use                                       |
| Render servidor         | Playwright (Chromium headless) + ffmpeg                                | Render determinista frame a frame                       |
| Persistencia (MVP)      | Archivos JSON en disco (`/scenes`)                                     | Sin infraestructura extra al inicio                     |
| Persistencia (post-MVP) | Postgres / Supabase + almacenamiento de objetos                        | Biblioteca compartida, renders                          |
| Modelado                | Blender 4.x                                                            | Personaje, rig, máquinas, anclas                        |
| Tests                   | Vitest (core), Playwright (e2e + snapshots visuales)                   |                                                         |

---

## 5. Estructura del repositorio

```
gym-anim/
├─ docs/ESPECIFICACION.md
├─ package.json / pnpm-workspace.yaml / turbo.json
├─ packages/
│  ├─ schema/
│  │  ├─ src/
│  │  │  ├─ common.ts         # Vec3, ids, easing, loop (convenciones de coordenadas)
│  │  │  ├─ rig.ts            # Huesos, efectores, grados de libertad
│  │  │  ├─ muscles.ts        # Catálogo de IDs musculares
│  │  │  ├─ equipment.ts      # Equipos en escena y cargas
│  │  │  ├─ assets.ts         # Manifiestos y catálogo de assets
│  │  │  ├─ scene.ts          # Escena, restricciones, keyframes + integridad
│  │  │  ├─ commands.ts       # Unión discriminada de comandos
│  │  │  ├─ lint.ts           # Revisión contra el catálogo + avisos
│  │  │  ├─ migrations.ts     # schemaVersion y migraciones
│  │  │  ├─ parse.ts          # parseScene / parseCommand / parseCatalog
│  │  │  └─ json-schema.ts    # JSON Schema para la IA y editores
│  │  ├─ fixtures/           # catalog.mvp.json + escenas de los 3 ejercicios MVP
│  │  ├─ generated/          # *.schema.json (pnpm generate)
│  │  └─ test/
│  ├─ core/
│  │  └─ src/
│  │     ├─ commands/         # apply(scene, cmd) → scene
│  │     ├─ ik/               # two-bone IK, pole targets, límites articulares
│  │     ├─ constraints/      # attach, follow, pin, offset
│  │     ├─ animation/        # keyframes, easing, tempo, loop
│  │     ├─ evaluate.ts       # evaluate(scene, t) → poses + transforms
│  │     ├─ validate.ts       # errores/avisos biomecánicos
│  │     └─ templates/        # plantillas de ejercicios
│  └─ assets/
│     ├─ characters/          # male_athletic.glb, female_athletic.glb
│     ├─ equipment/           # flat_bench.glb, cable_tower.glb, lat_pulldown.glb...
│     ├─ poses/               # standing.json, seated.json, supine.json...
│     └─ manifest.json
├─ apps/
│  ├─ editor/
│  ├─ agent/
│  └─ renderer/
├─ scenes/                    # escenas guardadas (MVP)
└─ blender/                   # archivos .blend fuente + scripts de exportación
```

---

## 6. Pipeline de assets

### 6.1 Personaje

- **Base:** malla humana atlética, neutra, sin rasgos faciales detallados (MakeHuman exporta CC0, o modelo propio).
- **Rig:** esqueleto humanoide con nombres estandarizados (ver §15.2). Compatible con convención tipo Mixamo para poder reutilizar herramientas.
- **Músculos:** textura **ID muscular** (cada grupo muscular con un color/índice único) en un segundo canal UV o como textura aparte. Un shader propio recibe dos listas de IDs (`primary`, `secondary`) y colorea:
  - Principal: rojo intenso.
  - Secundario: rojo/rosa claro.
  - Resto: gris claro / blanco con ligero relieve muscular (normal map).
- **Polígonos objetivo:** ≤ 60k triángulos (preview fluido en navegador).
- **Variantes MVP:** `male_athletic`. Post-MVP: `female_athletic`.

### 6.2 Equipos (máquinas, bancos, racks)

Cada equipo se modela en Blender y declara su interfaz dentro del archivo:

**Anclas** — _Empties_ con prefijo `anchor_`:

| Nombre                                                  | Uso                            |
| ------------------------------------------------------- | ------------------------------ |
| `anchor_seat`                                           | Pelvis sentada                 |
| `anchor_back_pad`                                       | Pecho/espalda apoyados         |
| `anchor_grip_L` / `anchor_grip_R`                       | Agarres de manos               |
| `anchor_foot_L` / `anchor_foot_R` / `anchor_foot_plate` | Pies                           |
| `anchor_knee_pad`                                       | Rodillas (jalón, curl femoral) |
| `anchor_rack_L` / `anchor_rack_R`                       | Soportes de barra              |

La orientación del Empty define la orientación del efector (ej. la palma en el agarre).

**Articulaciones** — nodos con propiedades personalizadas (`extras` de glTF):

```json
{
  "joint": "lever_arm",
  "type": "revolute",
  "axis": [1, 0, 0],
  "range": [-10, 85],
  "drives": ["anchor_grip_L", "anchor_grip_R"]
}
```

Tipos soportados: `revolute` (palanca), `prismatic` (carro deslizante, stack de peso), `cable` (cable + polea: longitud derivada de la distancia del agarre).

**Parámetro maestro:** cada máquina expone `t ∈ [0, 1]` que mueve todas sus articulaciones de forma coordinada (ej. jalón: barra arriba → abajo, stack de peso sube proporcionalmente).

**Manifiesto** (`manifest.json`) generado al exportar:

```json
{
  "id": "lat_pulldown",
  "name": "Jalón al pecho",
  "category": "machine",
  "file": "equipment/lat_pulldown.glb",
  "anchors": ["seat", "knee_pad", "grip_L", "grip_R"],
  "joints": [{ "id": "bar", "type": "cable", "range": [0, 1] }],
  "defaultPose": "seated",
  "thumbnail": "equipment/lat_pulldown.png"
}
```

### 6.3 Pesas paramétricas (generadas por código)

| Objeto                 | Parámetros                                         |
| ---------------------- | -------------------------------------------------- |
| Barra olímpica         | longitud (2.2 m), peso (20 kg), discos por lado    |
| Barra EZ / recta corta | longitud, peso                                     |
| Mancuerna              | kg → tamaño de cabezas                             |
| Disco                  | kg → diámetro y grosor (tabla estándar 1.25–25 kg) |
| Kettlebell             | kg → tamaño                                        |
| Stack de peso          | número de placas, placa seleccionada               |

Cada pesa generada expone sus anclas (`grip_L`, `grip_R`, `grip` para mancuerna/kettlebell).

### 6.4 Script de exportación

`blender/export.py`: exporta `.glb` (Draco opcional), valida nombres de anclas/articulaciones, genera miniatura PNG y actualiza `manifest.json`.

---

## 7. Modelo de datos (escena JSON)

### 7.1 Ejemplo completo

Fuente de verdad: `packages/schema/src/scene.ts`. Las escenas de los 3 ejercicios MVP están en `packages/schema/fixtures/scenes/`.

```json
{
  "$schema": "../../generated/scene.schema.json",
  "schemaVersion": 1,
  "id": "barbell-bench-press",
  "name": "Press de banca con barra",
  "fps": 30,
  "loop": "pingpong",
  "tempo": {
    "startPhase": "eccentric",
    "eccentric": 2.0,
    "concentric": 1.0,
    "pauseStart": 0.2,
    "pauseEnd": 0
  },
  "character": {
    "model": "male_athletic",
    "basePose": "supine",
    "muscles": {
      "primary": ["pectoralis_major"],
      "secondary": ["triceps_brachii", "deltoid_anterior"]
    }
  },
  "equipment": [
    { "id": "bench", "type": "flat_bench", "position": [0, 0, 0] },
    {
      "id": "bar",
      "type": "barbell",
      "load": { "kind": "barbell", "barKg": 20, "platesPerSide": [20, 10] }
    }
  ],
  "constraints": [
    { "id": "seat", "effector": "pelvis", "target": "bench.seat" },
    { "id": "back", "effector": "chest", "target": "bench.back_pad" },
    { "id": "foot_l", "effector": "foot_L", "target": "floor", "offset": [0.3, 0, 0.45] },
    { "id": "foot_r", "effector": "foot_R", "target": "floor", "offset": [-0.3, 0, 0.45] },
    { "id": "grip_l", "effector": "hand_L", "target": "bar.grip_L", "mode": "follow" },
    { "id": "grip_r", "effector": "hand_R", "target": "bar.grip_R", "mode": "follow" }
  ],
  "keyframes": [
    { "t": 0, "drivers": { "bar.position": [0, 1.12, -0.3] }, "ease": "inOutSine" },
    { "t": 1, "drivers": { "bar.position": [0, 0.78, -0.22] } }
  ],
  "camera": { "preset": "three_quarter_left", "fov": 35 },
  "render": { "background": "#ffffff", "width": 1080, "height": 1080 }
}
```

### 7.2 Notas del modelo

- **Coordenadas:** metros, eje Y hacia arriba (como Three.js), ángulos en grados. El personaje, en su pose base, está en el origen mirando hacia +Z (su lado izquierdo es +X).
- **`keyframes[].t`** está **normalizado** (0 = posición inicial, 1 = posición final). Debe haber keyframes en `t = 0` y `t = 1`, ordenados, y todos con los mismos drivers.
- **`tempo`**: no hay `duration`; la duración sale del tempo (`cycleDuration`). `startPhase` indica si el tramo 0→1 es la fase excéntrica o concéntrica (press banca: excéntrica; curl y jalón: concéntrica). `pauseStart` / `pauseEnd` son las pausas en t = 0 y t = 1.
- **`loop`**: `none` | `repeat` | `pingpong` (el más común: ida y vuelta).
- **`load`**: unión discriminada por `kind`: `barbell` (`barKg`, `platesPerSide`), `dumbbell` (`kg`), `stack` (`selectedKg`).
- **`drivers`**: claves con forma `<equipoId>.<propiedad>` o `character.<hueso>.<gdl>`:
  - `bar.position`, `bar.rotation` (objetos libres)
  - `lat.t` (parámetro maestro de la máquina con id `lat`)
  - `character.forearm_L.flex` (ángulo articular FK, en grados; gdl: `flex`, `abduct`, `twist`)
- **`constraints[].mode`**:
  - `pin`: el efector queda fijo en el objetivo (pelvis en asiento, pies en el suelo).
  - `follow`: el efector sigue al objetivo vía IK (mano sigue la barra).
  - `carry`: el **objeto** sigue al efector (la mancuerna se emparenta a la mano).
- **`target`**: `<equipoId>.<ancla>` | `floor` | `world` (con `offset`).
- **Versionado**: `schemaVersion` + migraciones en `packages/schema/src/migrations.ts`.
- **Validación en dos niveles**:
  - `parseScene` (estructura + integridad interna): ids únicos, objetivos y drivers que apuntan a equipos existentes, `follow`/`carry` solo hacia anclas, `carry` solo con manos y una mano por objeto, no animar la posición de un objeto cargado, músculos no repetidos entre grupos. Rechaza claves desconocidas.
  - `lintScene(scene, catalog)`: que personaje, pose, equipos, anclas y tipos de carga existan en el catálogo de assets, más avisos (sin músculos, pies sin restricción, animación estática, carga ausente).
  - Ambos devuelven el formato común `{ level, code, message, path }` (§8.4).

### 7.3 Comandos (API única para editor e IA)

| Comando             | Parámetros principales                             |
| ------------------- | -------------------------------------------------- |
| `create_scene`      | `name`, `template?`                                |
| `set_character`     | `model`, `basePose`                                |
| `add_equipment`     | `equipmentType`, `position?`, `rotation?`, `load?` |
| `update_equipment`  | `id`, cambios parciales                            |
| `remove_equipment`  | `id`                                               |
| `set_load`          | `equipmentId`, `load`                              |
| `add_constraint`    | `effector`, `target`, `mode`, `offset?`            |
| `remove_constraint` | `id`                                               |
| `set_keyframe`      | `t`, `drivers`, `ease?`                            |
| `remove_keyframe`   | `t`                                                |
| `set_tempo`         | `eccentric`, `concentric`, pausas                  |
| `set_loop`          | `mode`                                             |
| `set_muscles`       | `primary[]`, `secondary[]`                         |
| `set_camera`        | `preset` o `position/target/fov`                   |
| `set_render`        | `background`, `transparent`, `width`, `height`     |
| `set_pole`          | `limb`, `direction` (orientación de codo/rodilla)  |

Todos los comandos son serializables, reversibles (`apply` / `invert`) y validados con Zod.

---

## 8. Sistema de animación: drivers, restricciones e IK

### 8.1 Concepto clave: quién manda el movimiento

| Tipo de ejercicio | Driver (se anima)           | Lo que se resuelve con IK                 | Ejemplos                                         |
| ----------------- | --------------------------- | ----------------------------------------- | ------------------------------------------------ |
| **Máquina manda** | Parámetro `t` de la máquina | Manos/pies pegados a anclas de la máquina | Jalón, prensa, pec deck, remo en máquina         |
| **Objeto manda**  | Trayectoria de barra/agarre | Manos siguen el objeto; pelvis/pies fijos | Press banca, sentadilla con barra, press militar |
| **Cuerpo manda**  | Ángulos articulares (FK)    | La pesa sigue a la mano (`carry`)         | Curl, elevaciones laterales, extensiones         |

Con este modelo la mayoría de ejercicios se describen con **2 keyframes** (inicio y fin) + tempo.

### 8.2 Orden de evaluación por frame

1. Calcular tiempo normalizado `u` a partir de tiempo real, `tempo` y `loop`.
2. Interpolar drivers entre keyframes con su easing.
3. Aplicar drivers de máquina (`t` → transformaciones de articulaciones → posiciones de anclas).
4. Aplicar drivers de objetos libres (barra).
5. Aplicar pose base + drivers FK del personaje.
6. Resolver restricciones `pin` (pelvis, pecho, pies) → posicionar raíz y columna.
7. Resolver restricciones `follow` con IK de extremidades.
8. Aplicar restricciones `carry` (objetos emparentados a manos).
9. Aplicar límites articulares y emitir avisos si se violan.

### 8.3 IK

- **Extremidades:** IK analítico de dos huesos (brazo: hombro–codo–muñeca; pierna: cadera–rodilla–tobillo) con **pole target** para orientar codo/rodilla.
- **Muñeca/tobillo:** alinear a la orientación del ancla (palma hacia el agarre, planta hacia el suelo/plataforma).
- **Torso:** pelvis por `pin`; columna con distribución simple del giro entre vértebras (FK ponderado). Post-MVP: FABRIK para columna.
- **Hombro (clavícula):** compensación automática cuando el brazo supera ~90° de elevación.
- **Límites articulares:** tabla por hueso (flexión/extensión/abducción/rotación en grados).
- **Estabilidad:** sin dependencia del frame anterior (determinismo); solución cerrada por frame.

### 8.4 Validación biomecánica (`validate.ts`)

| Regla                                                         | Nivel |
| ------------------------------------------------------------- | ----- |
| Efector no alcanza su objetivo (distancia > tolerancia)       | Error |
| Ángulo fuera de límites articulares                           | Error |
| Pie con `pin` que se desplaza > 1 cm entre frames             | Aviso |
| Interpenetración grave cuerpo–equipo (cápsulas simplificadas) | Aviso |
| Restricción apuntando a un ancla inexistente                  | Error |
| Escena sin músculos marcados                                  | Aviso |

La salida es una lista estructurada `{ level, code, message, frame?, ref? }` usada por el editor (panel de problemas) y por la IA (corrección automática).

**Estado (Fase 2):** implementado en `@gym-anim/core` como `IK_UNREACHABLE` (> 1 cm), `JOINT_LIMIT` (drivers articulares y flexión de codo/rodilla), `FOOT_SLIDING` (pie fijado al suelo o al mundo que se aleja > 1 cm de su posición en el primer frame), `UNKNOWN_ANCHOR`, `UNKNOWN_EQUIPMENT_DEFINITION` y `UNKNOWN_POSE`. `MUSCLES_EMPTY` está en `lintScene`. La interpenetración queda pendiente.

### 8.5 Decisiones de implementación del núcleo (`@gym-anim/core`)

- **API:** `evaluate(scene, segundos)`, `evaluateFrame(scene, frame)` y `evaluateProgress(scene, u)` devuelven huesos (mundo y local), puntos de efectores, equipos (posición, anclas y valor de articulaciones) y problemas del frame. `validateMotion(scene)` recorre un ciclo completo.
- **Matemática propia** (vectores y cuaterniones, convenciones de Three.js) para que el núcleo no dependa de un motor 3D y sea determinista.
- **Rig de referencia provisional** (~1.80 m, en reposo de pie mirando a +Z con los brazos colgando y todas las rotaciones locales en identidad) y poses base `standing`, `seated` y `supine`. Se sustituirán por las medidas del `.glb` de la Fase 1.
- **Grados de libertad:** cada hueso define los ejes de `flex`, `abduct` y `twist`; la rotación local es `flex · abduct · twist`. Los drivers `character.<hueso>.<gdl>` sustituyen el ángulo de la pose base.
- **Puntos de efector:** pelvis = articulación de la cadera (`hips`), pecho = `spine2`, cabeza = `head`, mano = centro del agarre, pie = centro de la planta. **Las anclas marcan dónde debe quedar exactamente ese punto.**
- **Anclas orientadas:** si un ancla define orientación, la mano o el pie la adoptan, y para la pelvis es el marco donde se coloca la pose base (girar el banco gira al personaje). Sin orientación, la muñeca queda recta y el pie apoyado en plano siguiendo la dirección del personaje.
- **Orden por frame:** drivers → equipos libres → pose base + FK → pelvis → pecho y cabeza (giro rígido de `spine` / `neck`) → brazos y piernas (IK analítico de dos huesos con pole) → objetos cargados (`carry`) → extremidades que van a objetos cargados → comprobación de alcance.
- **Equipos provisionales** (`PLACEHOLDER_LIBRARY`): banco plano, máquina de jalón, barra y mancuerna con anclas y articulaciones definidas en código, mientras llegan los `.glb`. En `cable` y `prismatic`, `range` está en metros; en `revolute`, en grados.
- **Pesas paramétricas:** `barbellGeometry`, `dumbbellGeometry` y `stackGeometry` calculan medidas en metros a partir de los kg, para que el visor las dibuje.

---

## 9. Editor web

### 9.1 Distribución de pantalla

```
┌──────────────────────────────────────────────────────────────┐
│ Barra superior: archivo · deshacer/rehacer · exportar · IA   │
├────────────┬───────────────────────────────────┬─────────────┤
│ Biblioteca │                                   │ Propiedades │
│ - Equipos  │          Viewport 3D              │ - Selección │
│ - Pesas    │   (gizmos, snap, cámaras)         │ - Músculos  │
│ - Poses    │                                   │ - Render    │
│ - Plantil. │                                   │ - Problemas │
├────────────┴───────────────────────────────────┴─────────────┤
│ Timeline: keyframes · curvas de easing · tempo · play/loop   │
├──────────────────────────────────────────────────────────────┤
│ Panel IA (chat): instrucciones en lenguaje natural           │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Interacciones clave

- **Manipular al personaje:** manejadores visibles en manos, pies, pelvis, pecho, codos y rodillas (pole). Se arrastran con `TransformControls`; el IK resuelve el resto en vivo.
- **Snap a anclas:** al arrastrar un efector cerca (< 8 cm) de un ancla compatible, el ancla se resalta y al soltar se crea la restricción.
- **Colocar en máquina:** arrastrar la máquina a la escena → menú contextual "Colocar personaje" aplica la `defaultPose` y crea restricciones con sus anclas.
- **Agregar pesas:** arrastrar barra/mancuerna; si se suelta sobre la mano, se crea `carry`; si se suelta sobre un rack, queda apoyada; selector de kg para discos.
- **Keyframes:** "Fijar inicio" / "Fijar fin" capturan los drivers actuales. Scrubbing en timeline.
- **Músculos:** clic sobre el cuerpo (raycast contra ID muscular) para alternar principal/secundario/ninguno; lista alternativa con buscador.
- **Cámaras:** presets frontal, lateral izquierda/derecha, 3/4 izquierda/derecha, cenital; órbita libre.
- **Deshacer/rehacer:** historial de comandos ilimitado en sesión (Ctrl+Z / Ctrl+Shift+Z).
- **Atajos:** `W/E/R` mover/rotar/escalar, `Espacio` play/pausa, `F` enfocar selección, `1–5` cámaras.

### 9.3 Modo render

`/?render=1&scene=<id>` oculta la UI, desactiva animación en tiempo real y expone `window.__renderFrame(n): Promise<void>` para el worker.

---

## 10. Render y exportación

### 10.1 Look visual (preset "studio")

- Fondo blanco (o transparente), suelo con sombra de contacto suave.
- Luz principal suave + relleno + rim light; tone mapping ACES/AgX.
- Oclusión ambiental (N8AO), antialiasing (SMAA o MSAA).
- Materiales: cuerpo gris claro mate, músculos objetivo rojos, equipos en grises/negro metálico.

### 10.2 Exportación

| Formato           | Uso                        | Notas                                   |
| ----------------- | -------------------------- | --------------------------------------- |
| MP4 (H.264)       | Apps, redes                | Por defecto 1080×1080, 30 fps           |
| WebM (VP9 + alfa) | Web con fondo transparente |                                         |
| GIF               | Previews rápidos           | Paleta optimizada (ffmpeg `palettegen`) |
| Secuencia PNG     | Postproducción             | Con alfa opcional                       |
| PNG fijo          | Miniatura                  | Frame inicial o configurable            |
| Escena JSON       | Respaldo / compartir       |                                         |

### 10.3 Pipeline de render en servidor

1. `renderer` recibe `{ sceneId | sceneJSON, format, width, height, fps, loops }`.
2. Lanza Chromium headless (Playwright) con GPU/SwiftShader y abre el modo render.
3. Para cada frame: `__renderFrame(n)` → captura del canvas (`toBlob`) → disco.
4. ffmpeg codifica al formato pedido.
5. Devuelve ruta/URL del archivo y metadatos.

**Opcional post-MVP:** exportar animación horneada a glTF y renderizar en Blender (Eevee/Cycles) por script para calidad premium.

---

## 11. Agente de IA

### 11.1 Principio

El agente **nunca** manipula rotaciones de huesos crudas: trabaja con plantillas, comandos de alto nivel, validación y revisión visual.

### 11.2 Herramientas

| Herramienta            | Entrada                                                        | Salida                                                                     |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `list_assets`          | `category?`                                                    | Personajes, equipos (con anclas), pesas, poses, plantillas, IDs musculares |
| `get_scene`            | `sceneId`                                                      | Escena JSON actual                                                         |
| `create_from_template` | `template`, `params?`                                          | Nueva escena                                                               |
| `apply_commands`       | `sceneId`, `commands[]`                                        | Escena resultante + errores de validación                                  |
| `validate_scene`       | `sceneId`                                                      | Lista de errores/avisos                                                    |
| `render_preview`       | `sceneId`, `frames?` (por defecto inicio/medio/fin), `camera?` | Imágenes PNG                                                               |
| `export`               | `sceneId`, `format`, opciones                                  | Ruta/URL del archivo                                                       |

Los `input_schema` de las herramientas se generan desde los esquemas Zod (una sola fuente de verdad).

### 11.3 Bucle de trabajo del agente

```
Petición del usuario
   → list_assets (si hace falta)
   → create_from_template  ó  apply_commands
   → validate_scene ──(errores)──▶ corregir con apply_commands
   → render_preview ──(revisión visual: ¿postura correcta? ¿agarre? ¿rango?)──▶ corregir
   → responder al usuario (y export si lo pide)
```

Límite de iteraciones configurable (por defecto 6) para controlar costo.

### 11.4 Integración

- **En el editor:** panel de chat; cada cambio de la IA aparece en el historial como un grupo de comandos (deshacible en un paso).
- **MCP:** las mismas herramientas expuestas como servidor MCP para usar el sistema desde Claude Desktop / Claude Code.
- **Modelos:** `claude-sonnet-5-5` por defecto; `claude-opus-5-5` para ejercicios complejos o revisión visual difícil.
- **Prompt de sistema:** incluye catálogo de efectores, convenciones de anclas, reglas de drivers (§8.1) y ejemplos de 2–3 ejercicios completos.

### 11.5 Ejemplos de peticiones

- "Hazme un remo con mancuerna a una mano apoyado en banco, resalta dorsal y bíceps."
- "Cambia la cámara a lateral y baja el tempo excéntrico a 3 segundos."
- "Pon 2 discos de 20 kg por lado y agarre más abierto."

---

## 12. Requerimientos del MVP

### 12.1 Alcance del MVP

El MVP debe demostrar el ciclo completo **crear → editar → animar → exportar → controlar con IA** con **tres ejercicios** que cubren los tres tipos de driver:

| Ejercicio                             | Tipo de driver    | Equipos                             |
| ------------------------------------- | ----------------- | ----------------------------------- |
| Curl de bíceps con mancuerna (de pie) | Cuerpo manda (FK) | Mancuerna                           |
| Press de banca con barra              | Objeto manda      | Banco plano, barra olímpica, discos |
| Jalón al pecho en polea               | Máquina manda     | Máquina de jalón (cable + stack)    |

### 12.2 Requerimientos funcionales

#### Escena y datos

| ID    | Requerimiento                                                      | Criterio de aceptación                                                         |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| RF-01 | Definir la escena como JSON validado por esquema Zod               | Escena inválida se rechaza con mensaje claro; tipos TS generados del esquema   |
| RF-02 | Guardar y abrir escenas desde disco                                | Guardar → recargar el editor → la escena se ve idéntica                        |
| RF-03 | Todas las modificaciones se realizan mediante comandos reversibles | Cada comando del §7.3 tiene `apply` e `invert` con tests                       |
| RF-04 | Deshacer/rehacer ilimitado en sesión                               | Ctrl+Z / Ctrl+Shift+Z funcionan sobre cualquier acción, incluidas las de la IA |

#### Personaje

| ID    | Requerimiento                                                       | Criterio de aceptación                                                    |
| ----- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| RF-05 | Cargar personaje `male_athletic` riggeado                           | Se muestra en el viewport con material estilo studio                      |
| RF-06 | Poses base: `standing`, `seated`, `supine`                          | Seleccionables desde la biblioteca                                        |
| RF-07 | Manipular manos, pies, pelvis y pecho con gizmos; IK en tiempo real | Arrastrar una mano mueve todo el brazo de forma natural, sin saltos       |
| RF-08 | Controlar orientación de codos/rodillas (pole)                      | Manejador de pole visible y funcional                                     |
| RF-09 | Resaltar músculos principales y secundarios                         | Al menos 20 grupos musculares (§15.3) seleccionables por clic y por lista |

#### Equipos y pesas

| ID    | Requerimiento                                                                    | Criterio de aceptación                                                  |
| ----- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| RF-10 | Biblioteca con: banco plano, máquina de jalón, barra olímpica, mancuerna, discos | Arrastrar y soltar al viewport los agrega a la escena                   |
| RF-11 | Detección automática de anclas y articulaciones desde el `.glb`                  | Una máquina nueva con anclas bien nombradas funciona sin cambiar código |
| RF-12 | Snap de efectores a anclas compatibles                                           | A < 8 cm el ancla se resalta; al soltar se crea la restricción          |
| RF-13 | "Colocar personaje en máquina" con pose y restricciones por defecto              | Un clic coloca al personaje sentado en el jalón con manos en la barra   |
| RF-14 | Pesas paramétricas por kg                                                        | Cambiar discos (1.25–25 kg) actualiza geometría en vivo                 |
| RF-15 | Máquina con parámetro maestro `t` que mueve cable/barra y stack                  | Al animar `t` el stack sube y baja proporcionalmente                    |

#### Animación

| ID    | Requerimiento                                             | Criterio de aceptación                                               |
| ----- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| RF-16 | Keyframes de inicio y fin con drivers                     | "Fijar inicio/fin" captura el estado actual                          |
| RF-17 | Tempo configurable (excéntrica, concéntrica, pausas)      | Cambiar tempo altera la duración sin tocar keyframes                 |
| RF-18 | Easing por keyframe (`linear`, `inOutSine`, `inOutCubic`) | Seleccionable en el timeline                                         |
| RF-19 | Loop `none` / `repeat` / `pingpong`                       | Reproducción continua sin saltos visibles                            |
| RF-20 | Timeline con play/pausa y scrubbing                       | Arrastrar el cursor actualiza la pose en tiempo real                 |
| RF-21 | Validación biomecánica con panel de problemas             | Reglas de §8.4 implementadas; clic en un problema enfoca el elemento |

#### Cámara y render

| ID    | Requerimiento                                               | Criterio de aceptación                                   |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------- |
| RF-22 | Presets de cámara (frontal, lateral, 3/4 ×2) + órbita libre | Cambio con teclas `1–5`                                  |
| RF-23 | Look "studio" (fondo blanco, AO, sombras suaves)            | Aprobación visual con los 3 ejercicios del MVP           |
| RF-24 | Exportar MP4, GIF y secuencia PNG (con alfa)                | Archivo reproducible; duración = tempo × loops           |
| RF-25 | Render determinista en servidor (headless)                  | Dos renders de la misma escena producen frames idénticos |
| RF-26 | Exportar/importar escena JSON                               | Ida y vuelta sin pérdida                                 |

#### Agente de IA

| ID    | Requerimiento                                        | Criterio de aceptación                                                    |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| RF-27 | Panel de chat en el editor conectado al agente       | El usuario escribe y la escena se actualiza                               |
| RF-28 | Herramientas del §11.2 implementadas                 | Cada herramienta con test de contrato                                     |
| RF-29 | Plantillas de los 3 ejercicios MVP                   | `create_from_template` genera escenas válidas sin errores                 |
| RF-30 | Bucle validar + revisión visual con `render_preview` | El agente corrige al menos un error inyectado de forma autónoma           |
| RF-31 | Cambios de la IA agrupados en el historial           | Un Ctrl+Z revierte toda la acción de la IA                                |
| RF-32 | Servidor MCP con las mismas herramientas             | Usable desde Claude Desktop o Claude Code                                 |
| RF-33 | Crear los 3 ejercicios MVP por lenguaje natural      | 3/3 peticiones de prueba producen una animación válida en ≤ 6 iteraciones |

### 12.3 Requerimientos no funcionales

| ID     | Requerimiento                      | Meta                                                                                  |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| RNF-01 | Rendimiento del viewport           | ≥ 60 fps en laptop de gama media con GPU integrada reciente (escena MVP)              |
| RNF-02 | Latencia de IK al arrastrar        | < 16 ms por frame                                                                     |
| RNF-03 | Tiempo de carga inicial del editor | < 4 s con caché fría en red local                                                     |
| RNF-04 | Render servidor                    | 3 s de animación a 1080×1080 en < 60 s                                                |
| RNF-05 | Determinismo                       | `evaluate(scene, t)` puro, sin estado entre frames                                    |
| RNF-06 | Cobertura de tests en `core`       | ≥ 80 % (comandos, IK, evaluación, validación)                                         |
| RNF-07 | Seguridad                          | API key de Anthropic solo en servidor (`.env`), nunca en el cliente                   |
| RNF-08 | Costo IA                           | Límite de iteraciones y de tokens por petición configurable; registro de uso          |
| RNF-09 | Navegadores                        | Chrome/Edge actuales (WebGL2); Firefox/Safari como "best effort"                      |
| RNF-10 | Licencias                          | Todos los assets propios o CC0/licencia comercial documentada en `assets/LICENSES.md` |
| RNF-11 | Extensibilidad                     | Agregar un equipo nuevo = `.glb` + entrada de manifiesto, sin cambios de código       |
| RNF-12 | Versionado de esquema              | `schemaVersion` + migraciones automáticas al abrir escenas antiguas                   |

### 12.4 Definición de "MVP terminado"

- [ ] Los 3 ejercicios del MVP se pueden crear **manualmente** en el editor en < 10 min cada uno.
- [ ] Los 3 ejercicios se pueden crear **por IA** con una sola petición en lenguaje natural.
- [ ] Los 3 se exportan a MP4 y GIF con look studio aprobado visualmente.
- [ ] Todos los RF-01 a RF-33 cumplen su criterio de aceptación.
- [ ] RNF-01, RNF-04, RNF-05 y RNF-07 verificados.

---

## 13. Fases de desarrollo

> Estimaciones orientativas para 1 desarrollador a tiempo completo. Cada fase termina con un entregable demostrable.

### Fase 0 — Fundamentos y esquema (≈ 1 semana)

**Objetivo:** repositorio listo y modelo de datos definido.

- Monorepo pnpm + Turborepo, TypeScript estricto, ESLint/Prettier, Vitest.
- `packages/schema`: escena, comandos, catálogo muscular, rig y efectores.
- Migraciones de esquema (estructura vacía) y generación de JSON Schema.
- JSON de los 3 ejercicios MVP escritos a mano (sirven de fixtures).

**Entregable:** `pnpm test` en verde validando las 3 escenas fixture.
**Requerimientos:** RF-01, RF-03 (estructura), RNF-12.

### Fase 1 — Assets base (≈ 2 semanas, paralelizable con Fase 2)

**Objetivo:** personaje y equipos MVP exportados con anclas.

- Personaje `male_athletic`: malla, rig con nombres estándar, pesos de piel, textura de ID muscular, normal map.
- Banco plano y máquina de jalón con anclas y articulaciones (`extras`).
- Script `blender/export.py` + `manifest.json` + miniaturas.
- `assets/LICENSES.md`.

**Entregable:** `.glb` que cargan en un visor de prueba mostrando anclas como gizmos.
**Requerimientos:** RF-05, RF-11, RNF-10, RNF-11.

### Fase 2 — Núcleo de animación (≈ 2–3 semanas)

**Objetivo:** `evaluate(scene, t)` funcional y determinista.

- IK de dos huesos con pole targets y alineación de muñeca/tobillo.
- Restricciones `pin`, `follow`, `carry`.
- Drivers: objeto libre, parámetro de máquina (`revolute`, `prismatic`, `cable`), FK articular.
- Keyframes, easing, tempo, loop.
- Pesas paramétricas (barra, discos, mancuerna).
- Validación biomecánica (§8.4).
- Tests unitarios + tests de snapshot de poses.

**Entregable:** visor mínimo que reproduce las 3 escenas fixture en loop.
**Requerimientos:** RF-06, RF-14, RF-15, RF-16 a RF-19, RF-21 (lógica), RNF-05, RNF-06.

**Estado:** núcleo implementado en `packages/core` (ver §8.5); las 3 escenas pasan `validateMotion` sin problemas. Visor mínimo en `apps/viewer` (`pnpm dev:viewer`): maniquí de cápsulas con músculos resaltados, equipos con primitivas, reproducción en loop, progreso manual, velocidad, presets de cámara, anclas y resultado de la validación. Pendiente: detección de interpenetración.

### Fase 3 — Editor (≈ 3 semanas)

**Objetivo:** crear y editar ejercicios sin tocar JSON.

- Layout (§9.1), viewport R3F con look studio.
- Gizmos en efectores, snap a anclas, "colocar en máquina".
- Biblioteca drag & drop (equipos, pesas, poses).
- Selección muscular por clic (raycast + ID muscular).
- Timeline con scrubbing, keyframes inicio/fin, tempo, easing, loop.
- Panel de propiedades y panel de problemas.
- Historial de comandos (deshacer/rehacer), guardar/abrir.
- Presets de cámara y atajos de teclado.

**Entregable:** los 3 ejercicios creados desde cero en el editor.
**Requerimientos:** RF-02, RF-04, RF-07 a RF-10, RF-12, RF-13, RF-20, RF-22, RF-23, RNF-01 a RNF-03.

### Fase 4 — Render y exportación (≈ 1–2 semanas)

**Objetivo:** archivos finales de calidad.

- Modo render (`?render=1`) con `__renderFrame(n)`.
- Worker Playwright + ffmpeg: MP4, GIF, secuencia PNG con alfa.
- Exportar/importar escena JSON.
- Botón "Exportar" en el editor con progreso.

**Entregable:** MP4 y GIF de los 3 ejercicios.
**Requerimientos:** RF-24, RF-25, RF-26, RNF-04.

### Fase 5 — Agente de IA (≈ 2 semanas)

**Objetivo:** crear y modificar ejercicios con lenguaje natural.

- `apps/agent`: servidor con Anthropic SDK, herramientas del §11.2 (schemas desde Zod).
- Plantillas de los 3 ejercicios MVP.
- Bucle validar + `render_preview` + corrección; límites de iteración y costo.
- Panel de chat en el editor; cambios agrupados en historial.
- Servidor MCP.
- Suite de evaluación: conjunto de peticiones de prueba con criterios automáticos (escena válida, músculos correctos, equipos correctos) + revisión visual manual.

**Entregable:** demo "petición → animación exportada" para los 3 ejercicios.
**Requerimientos:** RF-27 a RF-33, RNF-07, RNF-08.

### Fase 6 — Cierre del MVP (≈ 1 semana)

- Pulido visual del look studio, ajuste de iluminación.
- Pruebas e2e (Playwright) y snapshots visuales.
- Documentación: cómo agregar un equipo, cómo crear una plantilla, cómo usar el MCP.
- Verificación de la checklist §12.4.

**Entregable:** MVP etiquetado `v0.1.0`.

### Post-MVP (Fase 7+)

- Personaje femenino y variantes de complexión.
- Biblioteca de ~30 ejercicios y más máquinas (prensa, smith, pec deck, poleas dobles, rack).
- Ejercicios con más de 2 keyframes (movimientos compuestos: cargada, burpee).
- Columna con FABRIK y mejor colisión cuerpo–equipo.
- Render premium vía Blender.
- Persistencia en base de datos, usuarios, biblioteca compartida.
- Generación por lotes ("genera las 20 variantes de curl").
- Flechas/indicadores de dirección de movimiento y textos sobreimpresos.

### Resumen de fases

| Fase | Nombre                | Duración aprox.     | Depende de                                       |
| ---- | --------------------- | ------------------- | ------------------------------------------------ |
| 0    | Fundamentos y esquema | 1 sem               | —                                                |
| 1    | Assets base           | 2 sem               | 0                                                |
| 2    | Núcleo de animación   | 2–3 sem             | 0 (assets de prueba simples mientras llega la 1) |
| 3    | Editor                | 3 sem               | 1, 2                                             |
| 4    | Render y exportación  | 1–2 sem             | 2 (y 3 para el botón)                            |
| 5    | Agente de IA          | 2 sem               | 2, 4 (preview)                                   |
| 6    | Cierre MVP            | 1 sem               | todas                                            |
|      | **Total**             | **≈ 12–14 semanas** |                                                  |

---

## 14. Riesgos y mitigaciones

| Riesgo                                                               | Impacto | Mitigación                                                                                                 |
| -------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Calidad del rig/pesos de piel (deformaciones feas en hombros/cadera) | Alto    | Invertir tiempo en Fase 1; huesos auxiliares (twist bones); revisar con poses extremas de los 3 ejercicios |
| IK produce posturas antinaturales                                    | Alto    | Pole targets explícitos, límites articulares, plantillas con poles predefinidos                            |
| La IA genera posturas incorrectas                                    | Medio   | Plantillas + validador + revisión visual; la IA ajusta parámetros, no huesos                               |
| Render headless lento o sin GPU en servidor                          | Medio   | SwiftShader como respaldo; resolución de preview reducida; cola de render                                  |
| Costo de la API de IA                                                | Medio   | Sonnet por defecto, límites de iteración, caché de prompts del sistema                                     |
| Alcance creciente (demasiadas máquinas)                              | Medio   | MVP limitado a 3 ejercicios; el resto post-MVP                                                             |
| Licencias de assets                                                  | Alto    | Solo assets propios o CC0; registro en `LICENSES.md`                                                       |

---

## 15. Convenciones y glosario

### 15.1 Efectores (manejadores IK)

| Efector              | Descripción                    |
| -------------------- | ------------------------------ |
| `pelvis`             | Raíz del personaje             |
| `chest`              | Parte superior del torso       |
| `head`               | Orientación de cabeza (mirada) |
| `hand_L`, `hand_R`   | Manos (posición + orientación) |
| `foot_L`, `foot_R`   | Pies (posición + orientación)  |
| `elbow_L`, `elbow_R` | Pole de codos                  |
| `knee_L`, `knee_R`   | Pole de rodillas               |

### 15.2 Huesos del rig (mínimo)

`hips`, `spine`, `spine1`, `spine2`, `neck`, `head`,
`shoulder_L/R` (clavícula), `upper_arm_L/R`, `forearm_L/R`, `hand_L/R`,
`thigh_L/R`, `shin_L/R`, `foot_L/R`, `toe_L/R`,
`upper_arm_twist_L/R`, `forearm_twist_L/R` (auxiliares).

### 15.3 IDs musculares (MVP)

| Región  | IDs                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| Pecho   | `pectoralis_major`, `pectoralis_minor`                                                                       |
| Hombro  | `deltoid_anterior`, `deltoid_lateral`, `deltoid_posterior`                                                   |
| Brazo   | `biceps_brachii`, `brachialis`, `brachioradialis`, `triceps_brachii`, `forearm_flexors`, `forearm_extensors` |
| Espalda | `latissimus_dorsi`, `trapezius_upper`, `trapezius_middle`, `rhomboids`, `teres_major`, `erector_spinae`      |
| Core    | `rectus_abdominis`, `obliques`                                                                               |
| Cadera  | `gluteus_maximus`, `gluteus_medius`, `hip_flexors`, `adductors`                                              |
| Pierna  | `quadriceps`, `hamstrings`, `gastrocnemius`, `soleus`, `tibialis_anterior`                                   |

### 15.4 Glosario

| Término                     | Definición                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **Ancla**                   | Punto con posición y orientación en un equipo donde se fija un efector                      |
| **Driver**                  | Valor animado que manda el movimiento (posición de barra, `t` de máquina, ángulo articular) |
| **Efector**                 | Parte del cuerpo controlable por IK (mano, pie, pelvis…)                                    |
| **Restricción**             | Relación entre efector y objetivo (`pin`, `follow`, `carry`)                                |
| **Pole target**             | Dirección hacia donde apunta el codo o la rodilla                                           |
| **Parámetro maestro (`t`)** | Valor 0–1 que mueve todas las articulaciones de una máquina                                 |
| **Plantilla**               | Escena parametrizable de un ejercicio (base para la IA)                                     |
| **Look studio**             | Preset visual: fondo blanco, AO, sombras suaves, músculos en rojo                           |

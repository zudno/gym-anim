# Gym Anim

Editor web y agente de IA para crear animaciones 3D de ejercicios de gimnasio.
La especificación completa y el plan por fases están en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

## Requisitos

- Node.js ≥ 22
- pnpm 10 (`npm i -g pnpm@10`, o anteponer `npx pnpm@10.18.0` a cada comando)

## Comandos

```bash
pnpm install
pnpm test        # tests de todos los paquetes
pnpm typecheck   # TypeScript estricto
pnpm generate    # regenera los JSON Schema en packages/schema/generated
pnpm format      # Prettier
pnpm dev:viewer  # visor en http://localhost:5173
```

## Paquetes

| Paquete                               | Estado | Contenido                                                                              |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| [`@gym-anim/schema`](packages/schema) | Fase 0 | Esquemas Zod de escena, comandos y catálogo; fixtures del MVP                          |
| [`@gym-anim/core`](packages/core)     | Fase 2 | Rig, IK, restricciones, drivers, `evaluate(scene, t)` y validación biomecánica         |
| [`@gym-anim/viewer`](apps/viewer)     | Fase 2 | Visor mínimo con Three.js: reproduce las escenas en loop, cámaras, anclas y validación |

# ASE DOKU

Juego web mobile-first de deduccion logica inspirado en Cluedo + Sudoku.

## Stack

- React + TypeScript
- TailwindCSS
- Zustand

## Arquitectura

- `src/core`: motor procedural (generacion, pistas, validacion)
- `src/store`: estado global de partida, progreso y premium
- `src/content`: tematicas y pools narrativos
- `src/App.tsx`: loop jugable mobile-first

## Reglas Free vs Premium

- Free: niveles 1-3, tematicas limitadas
- Premium: casos infinitos, todas las tematicas, escalado continuo

## Ejecucion

```bash
npm install
npm run dev
```

## Loop viral implementado

- casos cortos y reinicio inmediato
- streak + XP + progresion
- boton premium integrado
- tematicas rotativas para rejugabilidad alta

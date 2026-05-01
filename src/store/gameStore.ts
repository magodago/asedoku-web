import { create } from "zustand";
import { generateCase } from "../core/engine";
import { GameCase } from "../types";

type SuspectAnswer = { weapon: string; location: string };
type SolveProposal = Record<string, SuspectAnswer>;

interface GameState {
  level: number;
  xp: number;
  streak: number;
  completedCases: number;
  premium: boolean;
  currentCase: GameCase;
  solved: boolean;
  message: string;
  caseStartedAt: number;
  smartHintsLeft: number;
  startCase: () => void;
  checkCase: (proposal: SolveProposal) => void;
  useSmartHint: () => void;
  togglePremium: () => void;
}

const bootstrap = generateCase(1, false);

export const useGameStore = create<GameState>((set) => ({
  level: 1,
  xp: 0,
  streak: 0,
  completedCases: 0,
  premium: false,
  currentCase: bootstrap,
  solved: false,
  message: "Marca la tabla y resuelve el caso.",
  caseStartedAt: Date.now(),
  smartHintsLeft: 2,
  startCase: () =>
    set((state) => {
      const nextCase = generateCase(state.level, state.premium);
      return {
        currentCase: nextCase,
        solved: false,
        caseStartedAt: Date.now(),
        smartHintsLeft: state.premium ? 99 : 2,
        message: `Caso ${state.level}: usa las pistas para completar las tablas.`
      };
    }),
  checkCase: (proposal) =>
    set((state) => {
      const elapsedSec = Math.floor((Date.now() - state.caseStartedAt) / 1000);
      const speedBonus = elapsedSec <= 180 ? 80 : elapsedSec <= 360 ? 35 : 0;
      const valid = state.currentCase.solution.every((row) => {
        const answer = proposal[row.suspect];
        return !!answer && answer.weapon === row.weapon && answer.location === row.location;
      });

      if (!valid) {
        return { solved: false, streak: 0, message: "Aun hay errores en la tabla. Revisa cruces y pistas negativas." };
      }

      return {
        solved: true,
        streak: state.streak + 1,
        completedCases: state.completedCases + 1,
        xp: state.xp + 120 + state.streak * 8 + speedBonus,
        level: state.level + 1,
        message:
          speedBonus > 0
            ? `Caso resuelto. Asesino: ${state.currentCase.murderer}. Bonus de velocidad +${speedBonus} XP.`
            : `Caso resuelto. Asesino: ${state.currentCase.murderer}.`
      };
    }),
  useSmartHint: () =>
    set((state) => {
      if (!state.premium && state.smartHintsLeft <= 0) {
        return { message: "Sin Smart Hints en modo free. Activa premium para mas pistas." };
      }
      const pending = state.currentCase.solution[Math.floor(Math.random() * state.currentCase.solution.length)];
      const target: keyof SuspectAnswer = Math.random() > 0.5 ? "weapon" : "location";

      return {
        smartHintsLeft: state.premium ? state.smartHintsLeft : state.smartHintsLeft - 1,
        message: `Smart Hint: ${pending.suspect} tiene ${target === "weapon" ? "objeto" : "lugar"} "${pending[target]}".`
      };
    }),
  togglePremium: () =>
    set((state) => ({
      premium: !state.premium,
      smartHintsLeft: !state.premium ? 99 : 2,
      message: !state.premium
        ? "Modo Premium activo: casos infinitos y tematicas completas."
        : "Modo Free activo: niveles 1-3 y tematicas limitadas."
    }))
}));

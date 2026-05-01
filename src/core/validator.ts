import { CaseClue, PuzzleCell } from "../types";

const hasExactFacts = (cell: PuzzleCell, clues: CaseClue[]) => {
  const checks = [`${cell.suspect} estuvo en ${cell.location}.`, `${cell.suspect} estuvo con ${cell.weapon}.`];
  return checks.every((text) => clues.some((c) => c.text === text));
};

export const validateUniqueSolution = (
  solution: PuzzleCell[],
  clues: CaseClue[],
  suspects: string[],
  weapons: string[],
  locations: string[],
  events: string[],
  times: string[]
) => {
  if (!solution.length) return false;
  if (new Set(suspects).size !== suspects.length) return false;
  if (new Set(weapons).size !== weapons.length) return false;
  if (new Set(locations).size !== locations.length) return false;
  if (new Set(events).size !== events.length) return false;
  if (new Set(times).size !== times.length) return false;

  // Practical deterministic validation for v1:
  // every row must be explicitly derivable from facts, and all dimensions remain one-to-one.
  if (!solution.every((cell) => hasExactFacts(cell, clues))) return false;
  return true;
};

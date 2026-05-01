import { CaseClue, DifficultyTier, PuzzleCell } from "../types";

const id = () => Math.random().toString(36).slice(2, 9);

export const buildClues = (solution: PuzzleCell[], difficulty: DifficultyTier): CaseClue[] => {
  const clues: CaseClue[] = [];

  solution.forEach((row) => {
    clues.push({ id: id(), text: `${row.suspect} estuvo en ${row.location}.` });
    clues.push({ id: id(), text: `${row.suspect} estuvo con ${row.weapon}.` });
  });

  const negatives: CaseClue[] = [];
  solution.forEach((row, idx) => {
    const other = solution[(idx + 2) % solution.length];
    negatives.push({ id: id(), text: `${row.suspect} no estuvo con ${other.weapon}.` });
    negatives.push({ id: id(), text: `${row.suspect} no estuvo en ${other.location}.` });
  });

  if (difficulty === "easy") return [...clues, ...negatives.slice(0, Math.floor(negatives.length * 0.25))];
  if (difficulty === "medium") return [...clues, ...negatives.slice(0, Math.floor(negatives.length * 0.5))];
  return [...clues, ...negatives];
};

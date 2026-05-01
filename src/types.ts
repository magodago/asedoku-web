export type ThemeId =
  | "classic"
  | "futuristic"
  | "medieval"
  | "lab"
  | "cyberpunk"
  | "tropical"
  | "space"
  | "time"
  | "pirates";

export type DifficultyTier = "easy" | "medium" | "hard";

export interface ThemeContent {
  id: ThemeId;
  name: string;
  suspects: string[];
  victims: string[];
  weapons: string[];
  locations: string[];
  events: string[];
}

export interface PuzzleCell {
  suspect: string;
  weapon: string;
  location: string;
  event: string;
  timeSlot: string;
}

export interface CaseClue {
  id: string;
  text: string;
}

export interface GameCase {
  id: string;
  theme: ThemeContent;
  size: number;
  suspects: string[];
  victim: string;
  solution: PuzzleCell[];
  clues: CaseClue[];
  murderer: string;
  killerWeapon: string;
  murderLocation: string;
}

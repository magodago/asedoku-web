import { THEME_POOL } from "../content/themes";
import { CaseClue, DifficultyTier, GameCase, PuzzleCell, ThemeContent } from "../types";
import { buildClues } from "./clues";
import { validateUniqueSolution } from "./validator";

const SLOTS = ["20:00", "21:00", "22:00", "23:00", "00:00", "01:00", "02:00", "03:00", "04:00"];

const shuffle = <T,>(list: T[]): T[] => {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const pickN = <T,>(list: T[], n: number): T[] => shuffle(list).slice(0, n);

export const levelToSize = (level: number) => {
  if (level <= 1) return 6;
  if (level === 2) return 7;
  if (level === 3) return 8;
  return Math.min(9, 8 + Math.floor((level - 3) / 2));
};

export const levelToDifficulty = (level: number): DifficultyTier => {
  if (level <= 2) return "easy";
  if (level <= 5) return "medium";
  return "hard";
};

const pickTheme = (isPremium: boolean, level: number): ThemeContent => {
  const pool = isPremium ? THEME_POOL : THEME_POOL.filter((t) => ["classic", "futuristic", "medieval"].includes(t.id));
  return pool[level % pool.length];
};

export const generateCase = (level: number, isPremium: boolean): GameCase => {
  const size = levelToSize(level);
  const theme = pickTheme(isPremium, level);
  const suspects = pickN(theme.suspects, size);
  const weapons = pickN(theme.weapons, size);
  const locations = pickN(theme.locations, size);
  const events = pickN(theme.events, size);
  const times = SLOTS.slice(0, size);

  let solution: PuzzleCell[] = [];
  let clues: CaseClue[] = [];
  let attempts = 0;

  while (attempts < 50) {
    attempts += 1;
    const weaponPerm = shuffle(weapons);
    const locationPerm = shuffle(locations);
    const eventPerm = shuffle(events);
    const timePerm = shuffle(times);

    solution = suspects.map((suspect, idx) => ({
      suspect,
      weapon: weaponPerm[idx],
      location: locationPerm[idx],
      event: eventPerm[idx],
      timeSlot: timePerm[idx]
    }));

    clues = buildClues(solution, levelToDifficulty(level));
    if (validateUniqueSolution(solution, clues, suspects, weapons, locations, events, times)) {
      break;
    }
  }

  const victim = theme.victims[level % theme.victims.length];
  const murderIdx = (level * 7 + size) % solution.length;
  const murderer = solution[murderIdx].suspect;
  const killerWeapon = solution[murderIdx].weapon;
  const murderLocation = solution[murderIdx].location;

  clues = [
    { id: `crime-weapon-${Date.now()}`, text: `El objeto homicida fue: ${killerWeapon}.` },
    { id: `crime-location-${Date.now()}`, text: `El crimen ocurrio en: ${murderLocation}.` },
    ...clues
  ];

  return {
    id: `${theme.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    theme,
    size,
    suspects,
    victim,
    solution,
    clues,
    murderer,
    killerWeapon,
    murderLocation
  };
};

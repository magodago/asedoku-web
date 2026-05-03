import type { ObjectKey, RoomKey } from "./puzzleTypes";

export type Constraint = {
  type: import("./puzzleTypes").ConstraintType;
  a: string;
  b?: string;
  room?: RoomKey;
  objectKey?: ObjectKey;
  text: string;
};

type Pos = { r: number; c: number };

const roomAt = (p: Pos, grid: RoomKey[][]) => grid[p.r][p.c];
const inSameRoomPos = (a: Pos, b: Pos, grid: RoomKey[][]) => roomAt(a, grid) === roomAt(b, grid);
const isAdjacent = (a: Pos, b: Pos) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

export const evaluateConstraint = (
  c: Constraint,
  places: Record<string, Pos>,
  objectCells: Record<ObjectKey, Pos[]>,
  grid: RoomKey[][]
) => {
  const pa = places[c.a];
  if (!pa) return false;
  if (c.b && !places[c.b]) return false;
  if (c.type === "sameRoom") return inSameRoomPos(pa, places[c.b!], grid);
  if (c.type === "inRoom") return roomAt(pa, grid) === c.room;
  if (c.type === "notInRoom") return roomAt(pa, grid) !== c.room;
  if (c.type === "adjObject") return objectCells[c.objectKey!].some((p) => isAdjacent(pa, p));
  if (c.type === "notAdjObject") return !objectCells[c.objectKey!].some((p) => isAdjacent(pa, p));
  if (c.type === "northOf") return pa.r < places[c.b!].r;
  if (c.type === "westOf") return pa.c < places[c.b!].c;
  if (c.type === "firstColumn") return pa.c === 0;
  return true;
};

export const evaluateConstraintPartial = (
  c: Constraint,
  places: Record<string, Pos>,
  objectCells: Record<ObjectKey, Pos[]>,
  grid: RoomKey[][]
): boolean | null => {
  const pa = places[c.a];
  if (!pa) return null;
  if (c.b && !places[c.b]) return null;
  return evaluateConstraint(c, places, objectCells, grid);
};

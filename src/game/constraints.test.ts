import { describe, expect, it } from "vitest";
import { evaluateConstraint, evaluateConstraintPartial, type Constraint } from "./constraints";
import type { ObjectKey, RoomKey } from "./puzzleTypes";

type Pos = { r: number; c: number };

const grid: RoomKey[][] = [
  ["Lab", "Lab", "Storage", "Storage", "Office", "Office"],
  ["Lab", "Lab", "Storage", "Storage", "Office", "Office"],
  ["Lab", "Lab", "Storage", "Storage", "Office", "Office"],
  ["Freezer", "Freezer", "Storage", "Storage", "Office", "Office"],
  ["Freezer", "Freezer", "Storage", "Storage", "Office", "Office"],
  ["Freezer", "Freezer", "Storage", "Storage", "Office", "Office"]
];

const objectCells: Record<ObjectKey, Pos[]> = {
  obj0: [{ r: 0, c: 0 }],
  obj1: [{ r: 2, c: 2 }],
  obj2: [{ r: 4, c: 4 }],
  obj3: [{ r: 5, c: 1 }]
};

describe("evaluateConstraint", () => {
  it("checks inRoom and notInRoom", () => {
    const places: Record<string, Pos> = { a: { r: 0, c: 1 } };
    const inRoom: Constraint = { type: "inRoom", a: "a", room: "Lab", text: "" };
    const notInRoom: Constraint = { type: "notInRoom", a: "a", room: "Office", text: "" };
    expect(evaluateConstraint(inRoom, places, objectCells, grid)).toBe(true);
    expect(evaluateConstraint(notInRoom, places, objectCells, grid)).toBe(true);
  });

  it("checks relational constraints", () => {
    const places: Record<string, Pos> = { a: { r: 1, c: 1 }, b: { r: 3, c: 4 } };
    const north: Constraint = { type: "northOf", a: "a", b: "b", text: "" };
    const west: Constraint = { type: "westOf", a: "a", b: "b", text: "" };
    expect(evaluateConstraint(north, places, objectCells, grid)).toBe(true);
    expect(evaluateConstraint(west, places, objectCells, grid)).toBe(true);
  });

  it("returns null in partial eval when data missing", () => {
    const places: Record<string, Pos> = { a: { r: 1, c: 1 } };
    const sameRoom: Constraint = { type: "sameRoom", a: "a", b: "b", text: "" };
    expect(evaluateConstraintPartial(sameRoom, places, objectCells, grid)).toBeNull();
  });
});

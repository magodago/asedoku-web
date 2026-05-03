export type { RoomKey } from "./layouts";

export type ObjectKey = "obj0" | "obj1" | "obj2" | "obj3";

export type ConstraintType =
  | "sameRoom"
  | "inRoom"
  | "notInRoom"
  | "adjObject"
  | "notAdjObject"
  | "northOf"
  | "westOf"
  | "firstColumn";

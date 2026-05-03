import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";
import { ROOM_LAYOUTS, sanitizeRoomGrid, layoutArchetypeLabelEs, layoutArchetype, type RoomKey } from "./game/layouts";
import { randomScenarioId, pickLayoutIndexForScenario, SCENARIO_PACKS, type ScenarioId, type ObjectGlyph } from "./game/scenarios";
import { TEMPLATE_LIBRARY } from "./game/templates";
import { getRoomCellStyle } from "./game/sceneColors";
import { sfxBlocked, sfxFail, sfxLaser, sfxPlace, sfxRemove, sfxRevealStinger, sfxSolve, unlockUiAudio } from "./game/uiAudio";
import type { ConstraintType } from "./game/puzzleTypes";
import type { Constraint } from "./game/constraints";
import { evaluateConstraint, evaluateConstraintPartial } from "./game/constraints";
import { PortraitImg } from "./game/PortraitImg";
import { ObjectBoardIcon } from "./game/objectIcons";
import { VictimMark } from "./game/VictimMark";
import { LEGACY_ROLE_TO_ASSET, type PortraitKey } from "./game/personajeAssets";

type Pos = { r: number; c: number };
type Suspect = { id: string; name: string; color: string; portraitKey: PortraitKey };
type ObjectKey = "obj0" | "obj1" | "obj2" | "obj3";
type ObjectDef = { label: string; glyph: ObjectGlyph };
type GameCase = {
  level: number;
  scenarioId: ScenarioId;
  suspects: Suspect[];
  victimName: string;
  victimPos: Pos;
  murdererId: string;
  roomLabels: Record<RoomKey, string>;
  objectDefs: Record<ObjectKey, ObjectDef>;
  objectCells: Record<ObjectKey, Pos[]>;
  blockedSet: Set<string>;
  constraints: Constraint[];
  templateId: string;
  solution: Record<string, Pos>;
  roomGrid: RoomKey[][];
  layoutIndex: number;
  templateIndex: number;
};
type StoredCase = Omit<GameCase, "blockedSet"> & { blocked: string[] };
type StoredState = {
  level: number;
  completedCases?: number;
  totalSolveAttempts?: number;
  currentStreak?: number;
  bestStreak?: number;
  bestSolveMs?: number | null;
  gameCase: StoredCase;
  selectedSuspect: string;
  placements: Record<string, Pos>;
  selectedKillerId: string;
  result: string;
  showUpgrade: boolean;
};
type LeaderboardEntry = {
  userId: string;
  label: string;
  solved: number;
  updatedAt: string;
  isMe?: boolean;
};
type DemoLimitVariant = 2 | 3;
type EntitlementStatus = "free" | "premium";

const BOARD_ROWS = 6;
const BOARD_COLS = 6;

const ROLE_IDS = ["r0", "r1", "r2", "r3", "r4", "r5"] as const;
/** Nombres masculinos / femeninos separados: retratos h1–h3 y m1–m3 deben coincidir con el genero. */
const MALE_NAME_POOL = ["Ashton", "Blaine", "Frank", "Bruno", "Dario", "Fabio", "Hector", "Julian", "Leo", "Oscar", "Ruben"];
const FEMALE_NAME_POOL = ["Carla", "Delilah", "Estella", "Alicia", "Celia", "Elena", "Gala", "Irene", "Karla", "Marta", "Nora", "Paula", "Sonia"];
const MALE_PORTRAITS: PortraitKey[] = ["h1", "h2", "h3"];
const FEMALE_PORTRAITS: PortraitKey[] = ["m1", "m2", "m3"];
const COLOR_POOL = ["#ff7aa2", "#7ec8ff", "#ffe37e", "#8ef6d8", "#c8b6ff", "#ffc78a", "#ff9ad3", "#9df2a3", "#9ad0ff", "#f9b1ff"];
const VICTIM_POOL = ["Vaughn", "Nadia", "Victor", "Sofia", "Lucas", "Marina", "Brenda", "Hugo"];
const STORAGE_KEY = "asedoku-save-v1";
const TUTORIAL_KEY = "asedoku-tutorial-done-v1";
const DEMO_LIMIT_KEY = "asedoku-demo-limit-v1";
const FUNNEL_KEY = "asedoku-funnel-v1";
/** Huevo de pascua: email exacto `premium` + Entrar → premium local (solo este dispositivo). */
const EASTER_PREMIUM_KEY = "asedoku-premium-easter-v1";
const readLocalPremiumEaster = () =>
  typeof window !== "undefined" && window.localStorage.getItem(EASTER_PREMIUM_KEY) === "1";

const BIZUM_PHONE_DISPLAY =
  (import.meta.env.VITE_BIZUM_PHONE as string | undefined)?.trim() || "+34 658 237 988";
const BIZUM_AMOUNT_EUR =
  (import.meta.env.VITE_BIZUM_AMOUNT_EUR as string | undefined)?.trim() || "4,99";
/** Dígitos para wa.me: env opcional, si no +34 658 237 988. */
const WHATSAPP_DIGITS = (() => {
  const raw = (import.meta.env.VITE_PREMIUM_WHATSAPP_DIGITS as string | undefined)?.replace(/\D/g, "");
  if (raw) return raw;
  const fromPhone = (import.meta.env.VITE_BIZUM_PHONE as string | undefined)?.replace(/\D/g, "");
  if (fromPhone) return fromPhone;
  return "34658237988";
})();
/** Solo esta cuenta ve el panel admin en la app (coincide con el SQL de admin_grant_premium). */
const ADMIN_OWNER_EMAIL = "dortizs76@gmail.com";
const WHATSAPP_ASEDOKU_LINK =
  WHATSAPP_DIGITS.length > 0
    ? `https://wa.me/${WHATSAPP_DIGITS}?text=${encodeURIComponent("ASEDOKU")}`
    : "";

const ROOM_RECON_ORDER: RoomKey[] = ["Lab", "Storage", "Office", "Freezer"];

const shuffle = <T,>(arr: T[]) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const sample = <T,>(arr: T[], n: number) => shuffle(arr).slice(0, n);
const keyOf = (p: Pos) => `${p.r}-${p.c}`;
const samePos = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
const isAdjacent = (a: Pos, b: Pos) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
const roomAt = (p: Pos, grid: RoomKey[][]) => grid[p.r][p.c];
const inSameRoomPos = (a: Pos, b: Pos, grid: RoomKey[][]) => roomAt(a, grid) === roomAt(b, grid);

const countSolutions = (
  suspectIds: string[],
  candidateMap: Record<string, Pos[]>,
  constraints: Constraint[],
  objectCells: Record<ObjectKey, Pos[]>,
  victimPos: Pos,
  murdererId: string,
  grid: RoomKey[][]
) => {
  const order = [...suspectIds].sort((a, b) => candidateMap[a].length - candidateMap[b].length);
  const usedRows = new Set<number>();
  const usedCols = new Set<number>();
  const assign: Record<string, Pos> = {};
  let count = 0;
  const partialOk = () =>
    constraints.every((c) => (!assign[c.a] || (c.b && !assign[c.b]) ? true : evaluateConstraint(c, assign, objectCells, grid)));
  const dfs = (idx: number) => {
    if (count > 1) return;
    if (idx >= order.length) {
      if (!constraints.every((c) => evaluateConstraint(c, assign, objectCells, grid))) return;
      const sameRoomAsVictim = Object.entries(assign).filter(([, p]) => inSameRoomPos(p, victimPos, grid));
      if (sameRoomAsVictim.length === 1 && sameRoomAsVictim[0][0] === murdererId) count += 1;
      return;
    }
    const id = order[idx];
    for (const p of candidateMap[id]) {
      if (usedRows.has(p.r) || usedCols.has(p.c)) continue;
      assign[id] = p;
      usedRows.add(p.r);
      usedCols.add(p.c);
      if (partialOk()) dfs(idx + 1);
      delete assign[id];
      usedRows.delete(p.r);
      usedCols.delete(p.c);
    }
  };
  dfs(0);
  return count;
};

const generateCase = (level: number): GameCase => {
  const rng = () => Math.random();
  const scenarioId = randomScenarioId(rng);
  const scenarioPack = SCENARIO_PACKS[scenarioId];
  const layoutIndex = pickLayoutIndexForScenario(scenarioId, rng);
  const roomGrid = ROOM_LAYOUTS[layoutIndex];
  const templateIndex = Math.floor(rng() * TEMPLATE_LIBRARY.length);
  const template = TEMPLATE_LIBRARY[templateIndex];
  const roomOf = (p: Pos) => roomGrid[p.r][p.c];
  const pickedMaleNames = sample(MALE_NAME_POOL, 3);
  const pickedFemaleNames = sample(FEMALE_NAME_POOL, 3);
  const malePortraitOrder = shuffle([...MALE_PORTRAITS]);
  const femalePortraitOrder = shuffle([...FEMALE_PORTRAITS]);
  const maleSlots = pickedMaleNames.map((name, idx) => ({
    name,
    portraitKey: malePortraitOrder[idx]!
  }));
  const femaleSlots = pickedFemaleNames.map((name, idx) => ({
    name,
    portraitKey: femalePortraitOrder[idx]!
  }));
  const mixedSlots = shuffle([...maleSlots, ...femaleSlots]);
  const pickedColors = sample(COLOR_POOL, 6);
  const suspects: Suspect[] = ROLE_IDS.map((id, idx) => ({
    id,
    name: mixedSlots[idx]!.name,
    color: pickedColors[idx],
    portraitKey: mixedSlots[idx]!.portraitKey
  }));
  const victimName = sample(VICTIM_POOL, 1)[0];
  const roomLabels: Record<RoomKey, string> = {
    Lab: scenarioPack.rooms[0],
    Storage: scenarioPack.rooms[1],
    Office: scenarioPack.rooms[2],
    Freezer: scenarioPack.rooms[3]
  };
  const objectDefs: Record<ObjectKey, ObjectDef> = {
    obj0: { label: scenarioPack.objects[0]!.label, glyph: scenarioPack.objects[0]!.glyph },
    obj1: { label: scenarioPack.objects[1]!.label, glyph: scenarioPack.objects[1]!.glyph },
    obj2: { label: scenarioPack.objects[2]!.label, glyph: scenarioPack.objects[2]!.glyph },
    obj3: { label: scenarioPack.objects[3]!.label, glyph: scenarioPack.objects[3]!.glyph }
  };
  const spots = shuffle([{ r: 0, c: 1 }, { r: 0, c: 4 }, { r: 1, c: 5 }, { r: 2, c: 0 }, { r: 2, c: 4 }, { r: 4, c: 1 }, { r: 5, c: 4 }]);
  const objectCells: Record<ObjectKey, Pos[]> = { obj0: [spots[0], spots[1]], obj1: [spots[2], spots[3]], obj2: [spots[4], spots[5]], obj3: [spots[6]] };
  const blockedSet = new Set(spots.map(keyOf));

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const cols = shuffle([0, 1, 2, 3, 4, 5]);
    const solution: Record<string, Pos> = {};
    let bad = false;
    ROLE_IDS.forEach((id, row) => {
      const p = { r: row, c: cols[row] };
      if (blockedSet.has(keyOf(p))) bad = true;
      solution[id] = p;
    });
    if (bad) continue;
    const groups: Record<string, string[]> = {};
    ROLE_IDS.forEach((id) => {
      const rm = roomOf(solution[id]);
      groups[rm] = [...(groups[rm] ?? []), id];
    });
    const murdererCandidates = ROLE_IDS.filter((id) => (groups[roomOf(solution[id])] ?? []).length === 1);
    if (!murdererCandidates.length) continue;
    const murdererId = sample(murdererCandidates, 1)[0];
    const murderRoom = roomOf(solution[murdererId]);
    const victimCandidates: Pos[] = [];
    for (let r = 0; r < 6; r += 1) for (let c = 0; c < 6; c += 1) {
      const p = { r, c };
      if (roomOf(p) !== murderRoom) continue;
      if (blockedSet.has(keyOf(p))) continue;
      if (ROLE_IDS.some((id) => samePos(solution[id], p))) continue;
      victimCandidates.push(p);
    }
    if (!victimCandidates.length) continue;
    const victimPos = sample(victimCandidates, 1)[0];

    const roleName = (id: string) => suspects.find((s) => s.id === id)?.name ?? id;
    const rooms: RoomKey[] = ["Lab", "Storage", "Office", "Freezer"];
    const objects: ObjectKey[] = ["obj0", "obj1", "obj2", "obj3"];
    const positive: Constraint[] = [
      ...ROLE_IDS.map((id) => ({ type: "inRoom", a: id, room: roomOf(solution[id]), text: `${roleName(id)} estaba en ${roomLabels[roomOf(solution[id])]}.` } as Constraint)),
      ...ROLE_IDS.flatMap((id) => objects.filter((o) => objectCells[o].some((p) => isAdjacent(solution[id], p))).map((o) => ({ type: "adjObject", a: id, objectKey: o, text: `${roleName(id)} estaba junto a ${objectDefs[o].label}.` } as Constraint))),
      ...ROLE_IDS.flatMap((a) =>
        ROLE_IDS.filter((b) => b !== a && inSameRoomPos(solution[a], solution[b], roomGrid)).map((b) => ({
          type: "sameRoom",
          a,
          b,
          text: `${roleName(a)} estaba en la misma habitacion que ${roleName(b)}.`
        } as Constraint))
      ),
      ...ROLE_IDS.flatMap((a) => ROLE_IDS.filter((b) => b !== a && solution[a].r < solution[b].r).map((b) => ({ type: "northOf", a, b, text: `${roleName(a)} estaba en una fila superior a ${roleName(b)}.` } as Constraint))),
      ...ROLE_IDS.filter((id) => solution[id].c === 0).map((id) => ({ type: "firstColumn", a: id, text: `${roleName(id)} estaba en la primera columna.` } as Constraint))
    ];
    const negative: Constraint[] = [
      ...ROLE_IDS.map((id) => {
        const notRoom = sample(rooms.filter((r) => r !== roomOf(solution[id])), 1)[0];
        return { type: "notInRoom", a: id, room: notRoom, text: `${roleName(id)} no estaba en ${roomLabels[notRoom]}.` } as Constraint;
      }),
      ...ROLE_IDS.map((id) => {
        const notObjs = objects.filter((o) => !objectCells[o].some((p) => isAdjacent(solution[id], p)));
        const picked = notObjs.length ? sample(notObjs, 1)[0] : objects[0];
        return { type: "notAdjObject", a: id, objectKey: picked, text: `${roleName(id)} no estaba junto a ${objectDefs[picked].label}.` } as Constraint;
      }),
      ...ROLE_IDS.flatMap((a) => ROLE_IDS.filter((b) => b !== a && solution[a].c < solution[b].c).map((b) => ({ type: "westOf", a, b, text: `${roleName(a)} estaba a la izquierda de ${roleName(b)}.` } as Constraint)))
    ];

    const clueCount = level <= 2 ? 9 : level <= 5 ? 7 : 6;
    const selected: Constraint[] = [];
    template.forEach((t) => {
      const pool = (t.startsWith("not") ? negative : positive).filter((c) => c.type === t);
      const pick = sample(pool, 1)[0];
      if (pick && !selected.some((c) => c.text === pick.text)) selected.push(pick);
    });
    const extras = shuffle([...positive, ...negative]).filter((c) => !selected.some((s) => s.text === c.text));
    while (selected.length < clueCount && extras.length) selected.push(extras.pop()!);
    const constraints = selected.slice(0, clueCount);

    const freeCells: Pos[] = [];
    for (let r = 0; r < 6; r += 1) for (let c = 0; c < 6; c += 1) {
      const p = { r, c };
      if (blockedSet.has(keyOf(p)) || samePos(p, victimPos)) continue;
      freeCells.push(p);
    }
    const candidateMap: Record<string, Pos[]> = Object.fromEntries(ROLE_IDS.map((id) => [id, [...freeCells]]));
    constraints.forEach((c) => {
      if (c.type === "inRoom") candidateMap[c.a] = candidateMap[c.a].filter((p) => roomOf(p) === c.room);
      if (c.type === "notInRoom") candidateMap[c.a] = candidateMap[c.a].filter((p) => roomOf(p) !== c.room);
      if (c.type === "firstColumn") candidateMap[c.a] = candidateMap[c.a].filter((p) => p.c === 0);
      if (c.type === "adjObject") candidateMap[c.a] = candidateMap[c.a].filter((p) => objectCells[c.objectKey!].some((o) => isAdjacent(p, o)));
      if (c.type === "notAdjObject") candidateMap[c.a] = candidateMap[c.a].filter((p) => !objectCells[c.objectKey!].some((o) => isAdjacent(p, o)));
    });
    if (ROLE_IDS.some((id) => candidateMap[id].length === 0)) continue;
    if (countSolutions([...ROLE_IDS], candidateMap, constraints, objectCells, victimPos, murdererId, roomGrid) !== 1) continue;

    return {
      level,
      scenarioId,
      suspects,
      victimName,
      victimPos,
      murdererId,
      roomLabels,
      objectDefs,
      objectCells,
      blockedSet,
      constraints,
      templateId: `${scenarioId}-L${layoutIndex + 1}-T${templateIndex + 1}`,
      solution,
      roomGrid,
      layoutIndex,
      templateIndex
    };
  }
  return generateCase(level);
};

const toStoredCase = (gameCase: GameCase): StoredCase => ({
  ...gameCase,
  blocked: [...gameCase.blockedSet]
});
const fromStoredCase = (stored: StoredCase): GameCase => ({
  ...stored,
  blockedSet: new Set(stored.blocked),
  roomGrid: sanitizeRoomGrid(stored.roomGrid ?? ROOM_LAYOUTS[0]),
  layoutIndex: stored.layoutIndex ?? 0,
  templateIndex: stored.templateIndex ?? 0,
  scenarioId: stored.scenarioId ?? "mansion",
  suspects: stored.suspects.map((s) => ({
    ...s,
    portraitKey:
      "portraitKey" in s && s.portraitKey ? s.portraitKey : (LEGACY_ROLE_TO_ASSET[s.id] as PortraitKey)
  }))
});
const pickDemoLimitVariant = (): DemoLimitVariant => {
  const existing = window.localStorage.getItem(DEMO_LIMIT_KEY);
  if (existing === "2" || existing === "3") return Number(existing) as DemoLimitVariant;
  const picked: DemoLimitVariant = Math.random() < 0.5 ? 2 : 3;
  window.localStorage.setItem(DEMO_LIMIT_KEY, String(picked));
  return picked;
};
const trackFunnelEvent = (eventName: string) => {
  const now = new Date().toISOString();
  const raw = window.localStorage.getItem(FUNNEL_KEY);
  const current = raw
    ? (JSON.parse(raw) as { counts: Record<string, number>; history: Array<{ event: string; at: string }> })
    : { counts: {}, history: [] };
  current.counts[eventName] = (current.counts[eventName] ?? 0) + 1;
  current.history.push({ event: eventName, at: now });
  if (current.history.length > 200) current.history = current.history.slice(-200);
  window.localStorage.setItem(FUNNEL_KEY, JSON.stringify(current));
};

/** Tablero fijo: sin zoom ni paneo (mejor en movil, sin pellizco). */
function useSceneBoardView() {
  const reset = useCallback(() => {}, []);
  const innerStyle: CSSProperties = {};
  return {
    transform: { scale: 1, tx: 0, ty: 0 },
    innerStyle,
    reset
  };
}

function App() {
  const purchaseSectionRef = useRef<HTMLElement | null>(null);
  const placeSuspectAtRef = useRef(((_id: string, _p: Pos) => {}) as (id: string, pos: Pos) => void);
  const [level, setLevel] = useState(1);
  const [completedCases, setCompletedCases] = useState(0);
  const [gameCase, setGameCase] = useState<GameCase>(() => generateCase(1));
  const [selectedSuspect, setSelectedSuspect] = useState<string>(gameCase.suspects[0].id);
  const [placements, setPlacements] = useState<Record<string, Pos>>({});
  const [selectedKillerId, setSelectedKillerId] = useState("");
  const [result, setResult] = useState("Coloca sospechosos y usa las pistas.");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [draggedSuspectId, setDraggedSuspectId] = useState<string | null>(null);
  const [lastPlacedCell, setLastPlacedCell] = useState("");
  const [laserPulse, setLaserPulse] = useState<{ row: number; col: number } | null>(null);
  const [solvedFx, setSolvedFx] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [demoCaseLimit, setDemoCaseLimit] = useState<DemoLimitVariant>(3);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [entitlement, setEntitlement] = useState<EntitlementStatus>("free");
  const [entitlementSource, setEntitlementSource] = useState<string | null>(null);
  const [pendingNextPremium, setPendingNextPremium] = useState(false);
  const [showBizumModal, setShowBizumModal] = useState(false);
  const [adminGrantEmail, setAdminGrantEmail] = useState("");
  const [adminGrantMsg, setAdminGrantMsg] = useState("");
  const [adminGrantBusy, setAdminGrantBusy] = useState(false);
  const sceneView = useSceneBoardView();
  const isAdminOwnerSession = authUser?.email?.toLowerCase() === ADMIN_OWNER_EMAIL;
  const [celebrate, setCelebrate] = useState(false);
  const sceneRoomGrid = useMemo(() => sanitizeRoomGrid(gameCase.roomGrid), [gameCase.roomGrid]);
  const [pointerCarry, setPointerCarry] = useState<{ id: string } | null>(null);
  const [carryGhost, setCarryGhost] = useState<{ x: number; y: number } | null>(null);
  const [activeRoomKey, setActiveRoomKey] = useState<RoomKey | null>(null);
  const roomPulseTimerRef = useRef<number | null>(null);
  const [accuseFx, setAccuseFx] = useState<"success" | "fail" | null>(null);
  const accuseFxTimerRef = useRef<number | null>(null);
  const [reconstructLit, setReconstructLit] = useState<Set<RoomKey>>(() => new Set());
  const [reconstructPlaying, setReconstructPlaying] = useState(false);
  const reconstructTimersRef = useRef<number[]>([]);
  const cluePrevOkRef = useRef<boolean[]>([]);
  const [clueStampIdx, setClueStampIdx] = useState<number | null>(null);
  const [activeMobileNav, setActiveMobileNav] = useState<"board" | "clues" | "suspects">("board");
  const [totalSolveAttempts, setTotalSolveAttempts] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [bestSolveMs, setBestSolveMs] = useState<number | null>(null);
  const caseStartAtRef = useRef<number>(Date.now());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardMsg, setLeaderboardMsg] = useState("");

  const showPurchaseSection = entitlement === "free";

  const applyStoredState = (saved: StoredState) => {
    if (!saved?.gameCase || !(saved.gameCase as any).solution) return false;
    setLevel(saved.level);
    setCompletedCases(saved.completedCases ?? Math.max((saved.level ?? 1) - 1, 0));
    setGameCase(fromStoredCase(saved.gameCase));
    setSelectedSuspect(saved.selectedSuspect);
    setPlacements(saved.placements);
    setSelectedKillerId(saved.selectedKillerId);
    setResult(saved.result);
    setShowUpgrade(saved.showUpgrade);
    setTotalSolveAttempts(saved.totalSolveAttempts ?? 0);
    setCurrentStreak(saved.currentStreak ?? 0);
    setBestStreak(saved.bestStreak ?? 0);
    setBestSolveMs(saved.bestSolveMs ?? null);
    caseStartAtRef.current = Date.now();
    return true;
  };

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as StoredState;
      if (!applyStoredState(saved)) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const done = window.localStorage.getItem(TUTORIAL_KEY) === "1";
    if (!done) setTutorialStep(1);
    setDemoCaseLimit(pickDemoLimitVariant());
    trackFunnelEvent("app_open");
  }, []);

  useEffect(() => {
    const unlock = () => {
      unlockUiAudio();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (!solvedFx) return;
    setCelebrate(true);
    const timer = window.setTimeout(() => setCelebrate(false), 950);
    return () => window.clearTimeout(timer);
  }, [solvedFx]);

  useEffect(() => {
    if (entitlement === "premium") {
      setShowUpgrade(false);
    }
  }, [entitlement]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data.session?.user ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !authUser) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("player_states")
        .select("state_json")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setAuthMsg(`Error cargando progreso cloud: ${error.message}`);
        setCloudLoaded(true);
        return;
      }
      if (data?.state_json) {
        const ok = applyStoredState(data.state_json as StoredState);
        if (!ok) setAuthMsg("Estado cloud invalido, se usa estado local.");
      } else {
        setAuthMsg("Sesion iniciada. Aun no hay progreso cloud guardado.");
      }
      setCloudLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !authUser) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("entitlements").select("status, source").eq("user_id", authUser.id).maybeSingle();
      if (cancelled) return;
      if (error) {
        if (readLocalPremiumEaster()) {
          setEntitlement("premium");
          setEntitlementSource("easter");
        } else {
          setEntitlement("free");
          setEntitlementSource(null);
        }
        return;
      }
      const fromDb = data?.status === "premium";
      const easter = readLocalPremiumEaster();
      if (fromDb) {
        setEntitlement("premium");
        setEntitlementSource(data?.source ?? null);
      } else if (easter) {
        setEntitlement("premium");
        setEntitlementSource("easter");
      } else {
        setEntitlement("free");
        setEntitlementSource(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (readLocalPremiumEaster()) {
      setEntitlement("premium");
      setEntitlementSource("easter");
    }
  }, []);

  const refreshEntitlement = async () => {
    if (!isSupabaseConfigured || !supabase || !authUser) {
      setResult("Inicia sesion para comprobar compra.");
      return;
    }
    const { data, error } = await supabase.from("entitlements").select("status, source").eq("user_id", authUser.id).maybeSingle();
    if (error) {
      setResult(`No se pudo comprobar compra: ${error.message}`);
      return;
    }
    const fromDb = data?.status === "premium";
    const easter = readLocalPremiumEaster();
    const next = fromDb || easter ? "premium" : "free";
    if (fromDb) {
      setEntitlement("premium");
      setEntitlementSource(data?.source ?? null);
    } else if (easter) {
      setEntitlement("premium");
      setEntitlementSource("easter");
    } else {
      setEntitlement("free");
      setEntitlementSource(null);
    }
    setResult(next === "premium" ? "Compra confirmada. Premium activo." : "Aun no aparece pago confirmado.");
    trackFunnelEvent("check_purchase_status");
  };

  useEffect(() => {
    const payload: StoredState = {
      level,
      completedCases,
      totalSolveAttempts,
      currentStreak,
      bestStreak,
      bestSolveMs,
      gameCase: toStoredCase(gameCase),
      selectedSuspect,
      placements,
      selectedKillerId,
      result,
      showUpgrade
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    level,
    completedCases,
    totalSolveAttempts,
    currentStreak,
    bestStreak,
    bestSolveMs,
    gameCase,
    selectedSuspect,
    placements,
    selectedKillerId,
    result,
    showUpgrade
  ]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !authUser || !cloudLoaded) return;
    const payload: StoredState = {
      level,
      completedCases,
      totalSolveAttempts,
      currentStreak,
      bestStreak,
      bestSolveMs,
      gameCase: toStoredCase(gameCase),
      selectedSuspect,
      placements,
      selectedKillerId,
      result,
      showUpgrade
    };

    const t = window.setTimeout(async () => {
      const { error } = await supabase.from("player_states").upsert(
        {
          user_id: authUser.id,
          state_json: payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );
      if (error) setAuthMsg(`No se pudo sincronizar progreso cloud: ${error.message}`);
    }, 500);

    return () => window.clearTimeout(t);
  }, [
    level,
    completedCases,
    totalSolveAttempts,
    currentStreak,
    bestStreak,
    bestSolveMs,
    gameCase,
    selectedSuspect,
    placements,
    selectedKillerId,
    result,
    showUpgrade,
    authUser,
    cloudLoaded
  ]);

  useEffect(() => {
    if (!pointerCarry) return;
    const move = (e: PointerEvent) => setCarryGhost({ x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent) => {
      const id = pointerCarry.id;
      setPointerCarry(null);
      setCarryGhost(null);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const btn = el?.closest("[data-scene-cell]");
      if (btn) {
        const idx = Number(btn.getAttribute("data-cell-idx"));
        if (Number.isFinite(idx)) {
          const r = Math.floor(idx / BOARD_COLS);
          const c = idx % BOARD_COLS;
          placeSuspectAtRef.current(id, { r, c });
        }
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [pointerCarry]);
  useEffect(
    () => () => {
      if (roomPulseTimerRef.current) window.clearTimeout(roomPulseTimerRef.current);
      if (accuseFxTimerRef.current) window.clearTimeout(accuseFxTimerRef.current);
    },
    []
  );
  useEffect(() => {
    const sections = [
      { id: "panel-board", key: "board" as const },
      { id: "panel-clues", key: "clues" as const },
      { id: "panel-suspects", key: "suspects" as const }
    ];
    const els = sections
      .map((s) => ({ ...s, el: document.getElementById(s.id) }))
      .filter((x): x is { id: string; key: "board" | "clues" | "suspects"; el: HTMLElement } => !!x.el);
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target) return;
        const hit = els.find((x) => x.el === visible.target);
        if (hit) setActiveMobileNav(hit.key);
      },
      { root: null, threshold: [0.22, 0.4, 0.6, 0.8] }
    );
    els.forEach((x) => observer.observe(x.el));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => {
      fetchLeaderboard().catch(() => setLeaderboardMsg("No se pudo actualizar ranking."));
    }, 250);
    return () => window.clearTimeout(t);
  }, [authUser, cloudLoaded, completedCases]);

  const allOccupied = useMemo(() => Object.values(placements).map(keyOf), [placements]);
  const freeGateReached = entitlement !== "premium" && completedCases >= demoCaseLimit;
  const loginGateReached = entitlement !== "premium" && !authUser && completedCases >= 1;
  const murdererName = gameCase.suspects.find((s) => s.id === gameCase.murdererId)?.name ?? "???";
  const solveAccuracy = totalSolveAttempts > 0 ? Math.round((completedCases / totalSolveAttempts) * 100) : 0;
  const bestSolveLabel = bestSolveMs == null ? "--:--" : `${Math.floor(bestSolveMs / 60000)}:${String(Math.floor((bestSolveMs % 60000) / 1000)).padStart(2, "0")}`;
  const demoProgressPercent = Math.min(100, Math.round((completedCases / demoCaseLimit) * 100));
  const cloudAvatarLabel = authUser?.email?.trim().slice(0, 2).toUpperCase() || "AG";
  const cloudAvatarHue =
    authUser?.email?.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) ?? 195;
  const roomLegend = useMemo(
    () =>
      (["Lab", "Storage", "Office", "Freezer"] as RoomKey[]).map((roomKey) => {
        const vis = getRoomCellStyle(roomKey, gameCase.layoutIndex, level, gameCase.templateIndex, gameCase.scenarioId);
        return { key: roomKey, label: gameCase.roomLabels[roomKey], vis };
      }),
    [gameCase.layoutIndex, gameCase.roomLabels, gameCase.templateIndex, gameCase.scenarioId, level]
  );
  const pulseRoom = (roomKey: RoomKey) => {
    setActiveRoomKey(roomKey);
    if (roomPulseTimerRef.current) window.clearTimeout(roomPulseTimerRef.current);
    roomPulseTimerRef.current = window.setTimeout(() => setActiveRoomKey(null), 850);
  };
  const triggerAccuseFx = (kind: "success" | "fail") => {
    setAccuseFx(kind);
    if (accuseFxTimerRef.current) window.clearTimeout(accuseFxTimerRef.current);
    accuseFxTimerRef.current = window.setTimeout(() => setAccuseFx(null), 980);
  };

  const clearReconstruction = useCallback(() => {
    reconstructTimersRef.current.forEach((id) => window.clearTimeout(id));
    reconstructTimersRef.current = [];
    setReconstructPlaying(false);
    setReconstructLit(new Set());
  }, []);

  const playReconstruction = useCallback(() => {
    clearReconstruction();
    setReconstructPlaying(true);
    setReconstructLit(new Set());
    ROOM_RECON_ORDER.forEach((rk, i) => {
      const tid = window.setTimeout(() => {
        setReconstructLit((prev) => new Set([...prev, rk]));
        if (i === ROOM_RECON_ORDER.length - 1) {
          const end = window.setTimeout(() => setReconstructPlaying(false), 750);
          reconstructTimersRef.current.push(end);
        }
      }, 400 * (i + 1));
      reconstructTimersRef.current.push(tid);
    });
  }, [clearReconstruction]);
  const fetchLeaderboard = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLeaderboard([]);
      setLeaderboardMsg("Activa Supabase para ranking cloud.");
      return;
    }
    setLeaderboardLoading(true);
    setLeaderboardMsg("");
    try {
      const { data, error } = await supabase.from("player_states").select("user_id, state_json, updated_at").limit(250);
      if (error) {
        setLeaderboard([]);
        setLeaderboardMsg("No se pudo cargar ranking cloud.");
        return;
      }
      const rows = (data ?? [])
        .map((row) => {
          const solved = Number((row as any)?.state_json?.completedCases ?? 0);
          if (!Number.isFinite(solved) || solved <= 0) return null;
          const userId = String((row as any).user_id ?? "");
          const me = !!authUser && userId === authUser.id;
          const short = userId ? userId.slice(0, 6).toUpperCase() : "ANON";
          return {
            userId,
            label: me ? "Tu" : `Det. ${short}`,
            solved,
            updatedAt: String((row as any)?.updated_at ?? ""),
            isMe: me
          } as LeaderboardEntry;
        })
        .filter((x): x is LeaderboardEntry => !!x)
        .sort((a, b) => (b.solved - a.solved) || (a.updatedAt > b.updatedAt ? -1 : 1))
        .slice(0, 10);
      setLeaderboard(rows);
      if (!rows.length) setLeaderboardMsg("Aun no hay casos resueltos en el ranking.");
    } finally {
      setLeaderboardLoading(false);
    }
  };
  const revealPlacementFeedback = allOccupied.length === gameCase.suspects.length;
  const clueStatus = useMemo(
    () =>
      gameCase.constraints.map((c) => ({
        clue: c,
        state: evaluateConstraintPartial(c, placements, gameCase.objectCells, gameCase.roomGrid)
      })),
    [gameCase.constraints, placements, gameCase.objectCells, gameCase.roomGrid]
  );

  useEffect(() => {
    let timeoutId: number | null = null;
    clueStatus.forEach((x, i) => {
      const was = cluePrevOkRef.current[i];
      if (x.state === true && was !== true) {
        setClueStampIdx(i);
        timeoutId = window.setTimeout(() => setClueStampIdx(null), 780);
      }
    });
    cluePrevOkRef.current = clueStatus.map((x) => x.state === true);
    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [clueStatus]);

  useEffect(
    () => () => {
      reconstructTimersRef.current.forEach((id) => window.clearTimeout(id));
    },
    []
  );

  const solvedClues = clueStatus.filter((x) => x.state === true).length;
  const violatedClues = clueStatus.filter((x) => x.state === false).length;
  const cluesWithVerdict = useMemo(() => clueStatus.filter((x) => x.state !== null).length, [clueStatus]);
  const touchGhostSuspect = pointerCarry ? gameCase.suspects.find((s) => s.id === pointerCarry.id) : undefined;
  const canShowNextCase = solutionRevealed || (pendingNextPremium && entitlement === "premium");

  const placeSuspectAt = (suspectId: string, pos: Pos) => {
    if (gameCase.blockedSet.has(keyOf(pos))) {
      setResult("Casilla bloqueada. Elige otra.");
      sfxBlocked();
      return;
    }
    if (samePos(pos, gameCase.victimPos)) {
      setResult("Esa casilla es la victima. No puedes colocar un sospechoso ahi.");
      sfxBlocked();
      return;
    }
    const next = { ...placements };
    if (next[suspectId] && samePos(next[suspectId], pos)) {
      delete next[suspectId];
      setPlacements(next);
      setResult("Sospechoso retirado.");
      sfxRemove();
      trackFunnelEvent("suspect_removed");
      return;
    }
    delete next[suspectId];
    const target = Object.entries(next).find(([, p]) => samePos(p, pos));
    if (target) delete next[target[0]];
    const conflict = Object.entries(next).find(([, p]) => p.r === pos.r || p.c === pos.c);
    if (conflict) {
      const [blockerId, bp] = conflict;
      const blockerName = gameCase.suspects.find((s) => s.id === blockerId)?.name ?? "?";
      const axis = bp.r === pos.r ? `fila ${pos.r + 1}` : `columna ${pos.c + 1}`;
      setResult(`${blockerName} ya usa la misma ${axis}. Retira a ${blockerName} o elige otra casilla.`);
      sfxBlocked();
      trackFunnelEvent("placement_blocked");
      return;
    }
    next[suspectId] = pos;
    setPlacements(next);
    sfxPlace();
    sfxLaser();
    trackFunnelEvent("suspect_placed");
    setLastPlacedCell(keyOf(pos));
    setLaserPulse({ row: pos.r, col: pos.c });
    setTimeout(() => setLastPlacedCell(""), 320);
    setTimeout(() => setLaserPulse(null), 430);
  };
  placeSuspectAtRef.current = placeSuspectAt;

  const placeSelected = (pos: Pos) => placeSuspectAt(selectedSuspect, pos);

  const validatePlacement = () => {
    if (Object.keys(placements).length !== gameCase.suspects.length) return false;
    const vals = Object.values(placements);
    if (new Set(vals.map((p) => p.r)).size !== vals.length) return false;
    if (new Set(vals.map((p) => p.c)).size !== vals.length) return false;
    if (!gameCase.constraints.every((c) => evaluateConstraint(c, placements, gameCase.objectCells, gameCase.roomGrid))) return false;
    const sameVictimRoom = Object.entries(placements).filter(([, p]) => inSameRoomPos(p, gameCase.victimPos, gameCase.roomGrid));
    return sameVictimRoom.length === 1 && sameVictimRoom[0][0] === gameCase.murdererId;
  };

  const solveCase = () => {
    trackFunnelEvent("solve_clicked");
    if (solutionRevealed) {
      setResult("Ya viste la solucion. Pulsa Nuevo intento o Siguiente caso.");
      return;
    }
    setTotalSolveAttempts((v) => v + 1);
    if (validatePlacement() && selectedKillerId === gameCase.murdererId) {
      const nextCompleted = completedCases + 1;
      setCompletedCases(nextCompleted);
      setPendingNextPremium(false);
      const solveMs = Date.now() - caseStartAtRef.current;
      setBestSolveMs((prev) => (prev == null || solveMs < prev ? solveMs : prev));
      setCurrentStreak((s) => {
        const next = s + 1;
        setBestStreak((b) => (next > b ? next : b));
        return next;
      });

      if (entitlement === "premium") {
        setResult(`Caso resuelto. El asesino es ${murdererName}.`);
        setShowUpgrade(false);
        setPendingNextPremium(true);
        sfxSolve();
        sfxRevealStinger();
        window.setTimeout(() => playReconstruction(), 140);
        trackFunnelEvent("case_solved");
        setSolvedFx(true);
        setTimeout(() => setSolvedFx(false), 950);
        triggerAccuseFx("success");
        return;
      }

      const reachedFreeGate = nextCompleted >= demoCaseLimit;
      setResult(
        reachedFreeGate
          ? `Caso resuelto (${nextCompleted}/${demoCaseLimit} demos). Has llegado al limite free.`
          : `Caso resuelto (${nextCompleted}/${demoCaseLimit} demos). El asesino es ${murdererName}.`
      );
      setShowUpgrade(true);
      sfxSolve();
      sfxRevealStinger();
      window.setTimeout(() => playReconstruction(), 140);
      trackFunnelEvent("case_solved");
      if (reachedFreeGate) {
        trackFunnelEvent("paywall_shown");
        trackFunnelEvent("free_limit_reached");
      }
      setSolvedFx(true);
      setTimeout(() => setSolvedFx(false), 950);
      triggerAccuseFx("success");
      fetchLeaderboard().catch(() => setLeaderboardMsg("No se pudo actualizar ranking."));
    } else {
      setResult("Todavia no cuadra. Revisa pistas y posicionamiento.");
      sfxFail();
      trackFunnelEvent("solve_failed");
      triggerAccuseFx("fail");
      setCurrentStreak(0);
    }
  };

  const revealSolution = () => {
    setPlacements({ ...gameCase.solution });
    setSelectedKillerId(gameCase.murdererId);
    setSolutionRevealed(true);
    setCurrentStreak(0);
    setResult(`Solucion revelada. El asesino era ${murdererName}.`);
    trackFunnelEvent("solution_revealed");
  };

  const resetCase = () => {
    clearReconstruction();
    const fresh = generateCase(level);
    setGameCase(fresh);
    setSelectedSuspect(fresh.suspects[0].id);
    setPlacements({});
    setSelectedKillerId("");
    setShowUpgrade(false);
    setResult("Nuevo intento.");
    setSolvedFx(false);
    setSolutionRevealed(false);
    setCurrentStreak(0);
    caseStartAtRef.current = Date.now();
    sceneView.reset();
    trackFunnelEvent("case_reset");
  };

  const nextCase = () => {
    if (entitlement !== "premium" && !authUser && completedCases >= 1) {
      setShowUpgrade(true);
      setResult("Inicia sesion para continuar al caso 2. Tu limite demo quedara ligado a tu cuenta.");
      trackFunnelEvent("login_gate_shown");
      return;
    }
    if (entitlement !== "premium" && completedCases >= demoCaseLimit) {
      setShowUpgrade(true);
      setResult(`Has llegado al limite free (${demoCaseLimit} casos). Activa premium para continuar.`);
      return;
    }
    const nextLevel = level + 1;
    clearReconstruction();
    const generated = generateCase(nextLevel);
    setLevel(nextLevel);
    setGameCase(generated);
    setSelectedSuspect(generated.suspects[0].id);
    setPlacements({});
    setSelectedKillerId("");
    setShowUpgrade(false);
    setPendingNextPremium(false);
    setSolutionRevealed(false);
    setResult(`Caso ${nextLevel}. Dificultad ${nextLevel <= 2 ? "baja" : nextLevel <= 5 ? "media" : "alta"}.`);
    setSolvedFx(false);
    caseStartAtRef.current = Date.now();
    sceneView.reset();
    trackFunnelEvent("next_case");
  };
  const goToPurchaseSection = () => {
    setShowUpgrade(false);
    purchaseSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    trackFunnelEvent("scroll_to_purchase");
  };
  const shareResult = async () => {
    const summary = `ASE DOKU\nCaso ${level} (${gameCase.templateId})\nAsesino: ${murdererName}\nPistas cumplidas: ${solvedClues}/${gameCase.constraints.length}`;
    const shareUrl = window.location.href;
    const shareText = `${summary}\n${shareUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "ASE DOKU", text: summary, url: shareUrl });
        setResult("Resultado compartido.");
        trackFunnelEvent("share_success");
        return;
      }

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareText);
        setResult("Resultado copiado al portapapeles.");
        trackFunnelEvent("share_success");
        return;
      }

      const ta = document.createElement("textarea");
      ta.value = shareText;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(ta);
      if (copied) {
        setResult("Resultado copiado al portapapeles.");
        trackFunnelEvent("share_success");
        return;
      }

      window.prompt("Copia este resultado:", shareText);
      setResult("Comparte copiando el texto manualmente.");
      trackFunnelEvent("share_success");
    } catch {
      window.prompt("Copia este resultado:", shareText);
      setResult("Comparte copiando el texto manualmente.");
      trackFunnelEvent("share_failed");
    }
  };
  const signUp = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthMsg("Configura Supabase en .env para usar login cloud.");
      return;
    }
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPass });
    setAuthMsg(error ? `Registro fallido: ${error.message}` : "Registro OK. Revisa email de confirmacion.");
  };
  const signIn = async () => {
    if (authEmail.trim().toLowerCase() === "premium") {
      window.localStorage.setItem(EASTER_PREMIUM_KEY, "1");
      setEntitlement("premium");
      setEntitlementSource("easter");
      setAuthEmail("");
      setAuthMsg("");
      setShowUpgrade(false);
      trackFunnelEvent("premium_easter_local");
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setAuthMsg("Configura Supabase en .env para usar login cloud.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
    setAuthMsg(error ? `Login fallido: ${error.message}` : "Sesion iniciada.");
  };
  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCloudLoaded(false);
    if (readLocalPremiumEaster()) {
      setEntitlement("premium");
      setEntitlementSource("easter");
    } else {
      setEntitlement("free");
      setEntitlementSource(null);
    }
    setAuthMsg("Sesion cerrada.");
  };

  const grantPremiumForBuyerEmail = async () => {
    const target = adminGrantEmail.trim().toLowerCase();
    if (!target) {
      setAdminGrantMsg("Escribe el email del comprador.");
      return;
    }
    if (!isSupabaseConfigured || !supabase || authUser?.email?.toLowerCase() !== ADMIN_OWNER_EMAIL) {
      return;
    }
    setAdminGrantBusy(true);
    setAdminGrantMsg("");
    const { data, error } = await supabase.rpc("admin_grant_premium", { p_target_email: target });
    setAdminGrantBusy(false);
    if (error) {
      const hint =
        error.message?.includes("admin_grant_premium") || error.code === "42883"
          ? " Ejecuta el SQL del archivo supabase/migrations/20260503140000_admin_grant_premium.sql en Supabase (SQL Editor)."
          : "";
      setAdminGrantMsg(`Error: ${error.message}.${hint}`);
      trackFunnelEvent("admin_grant_premium_error");
      return;
    }
    const row = data as { ok?: boolean; error?: string; message?: string } | null;
    if (!row?.ok) {
      setAdminGrantMsg(row?.message ?? row?.error ?? "No se pudo completar.");
      trackFunnelEvent("admin_grant_premium_fail");
      return;
    }
    setAdminGrantMsg(`Premium activado para ${target}. Ya puede pulsar «Comprobar compra» en su cuenta.`);
    setAdminGrantEmail("");
    trackFunnelEvent("admin_grant_premium_ok");
  };

  return (
    <main className="app-shell min-h-screen w-full max-w-full px-2 py-4 pb-24 text-[#f4e7c2] sm:px-4 md:max-w-lg md:pb-7 md:mx-auto">
      <section className="mx-auto flex w-full max-w-full flex-col gap-4 md:max-w-lg">
        <header className="hero-wow">
          <div className="hero-wow-glow" aria-hidden />
          <div className="hero-wow-ring" aria-hidden />
          <div className="hero-wow-inner">
            <p className="hero-wow-kicker">
              <span className="hero-wow-kicker-line" aria-hidden />
              <span>Expediente criminal · Sudoku logico</span>
              <span className="hero-wow-kicker-line" aria-hidden />
            </p>
            <h1 className="hero-wow-title" aria-label="ASE DOKU">
              <span className="hero-wow-title-stack">
                <span className="hero-wow-title-base">ASE DOKU</span>
                <span className="hero-wow-title-main">ASE DOKU</span>
              </span>
            </h1>
            <p className="hero-wow-tagline">Sigue el hilo. Una habitacion. Un culpable.</p>
            <div className="hero-wow-meta">
              <span className="hero-wow-badge">Caso {level}</span>
              <span className="hero-wow-dot" aria-hidden />
              <span className="hero-wow-badge hero-wow-badge--muted">Plantilla {gameCase.templateId}</span>
              <span className="hero-wow-dot" aria-hidden />
              <span className="hero-wow-badge hero-wow-badge--resolved">Resueltos {completedCases}</span>
            </div>
            <p className="hero-wow-plan">
              Plan: <strong>{entitlement === "premium" ? "PREMIUM" : "FREE"}</strong>
              {entitlement === "premium" && <span className="hero-wow-plan-note"> · Acceso completo</span>}
            </p>
            {entitlement !== "premium" && (
              <p className="hero-wow-demos">Demos completadas: {completedCases}/{demoCaseLimit}</p>
            )}
          </div>
        </header>

        <section className="premium-panel cloud-panel p-3 sm:p-4">
          <div className="cloud-panel-head">
            <h3 className="premium-heading text-xl">Cuenta y progreso cloud</h3>
            <span className={`cloud-pill ${authUser ? "cloud-pill-ok" : "cloud-pill-muted"}`}>
              <span className="cloud-pill-dot" aria-hidden />
              {authUser ? "Sincronizado" : "Solo local"}
            </span>
          </div>

          <div className="cloud-progress">
            <div className="cloud-progress-head">
              <span>Uso demo</span>
              <span>{completedCases}/{demoCaseLimit}</span>
            </div>
            <div className="cloud-progress-track">
              <div className="cloud-progress-fill" style={{ width: `${demoProgressPercent}%` }} />
            </div>
          </div>

          <div className="cloud-grid">
            <article className="cloud-stat">
              <p className="cloud-stat-label">Plan activo</p>
              <p className="cloud-stat-value">{entitlement === "premium" ? "Premium" : "Free"}</p>
            </article>
            <article className="cloud-stat">
              <p className="cloud-stat-label">Casos demo</p>
              <p className="cloud-stat-value">
                {completedCases}/{demoCaseLimit}
              </p>
            </article>
            <article className="cloud-stat">
              <p className="cloud-stat-label">Sesion</p>
              <p className="cloud-stat-value">{authUser ? "Activa" : "Invitado"}</p>
            </article>
            <article className="cloud-stat">
              <p className="cloud-stat-label">Racha actual</p>
              <p className="cloud-stat-value">{currentStreak}</p>
            </article>
            <article className="cloud-stat">
              <p className="cloud-stat-label">Mejor racha</p>
              <p className="cloud-stat-value">{bestStreak}</p>
            </article>
            <article className="cloud-stat">
              <p className="cloud-stat-label">Precision</p>
              <p className="cloud-stat-value">{solveAccuracy}%</p>
            </article>
            <article className="cloud-stat">
              <p className="cloud-stat-label">Record tiempo</p>
              <p className="cloud-stat-value">{bestSolveLabel}</p>
            </article>
          </div>
          <div className="phase-track mt-3">
            <p className="phase-track-title">Roadmap activo</p>
            <div className="phase-track-grid">
              <span className="phase-pill">Fase 1 · Ranking</span>
              <span className="phase-pill">Fase 2 · Racha y precision</span>
              <span className="phase-pill">Fase 3 · Record de tiempo</span>
            </div>
          </div>

          {!isSupabaseConfigured && (
            <p className="cloud-alert mt-3">Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para activar login cloud.</p>
          )}

          {authUser ? (
            <div className="mt-3 rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/45 to-[#0d0a08] p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-200/70">Cuenta vinculada</p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="cloud-avatar"
                  style={
                    {
                      ["--avatar-hue" as "--avatar-hue"]: `${cloudAvatarHue % 360}`
                    } as React.CSSProperties
                  }
                >
                  {cloudAvatarLabel}
                </span>
                <p className="text-xs text-emerald-100/90 break-all">{authUser.email}</p>
              </div>
              <button
                onClick={signOut}
                className="mt-3 min-h-[42px] rounded-lg border border-[#8b6c2a] bg-[#19150f] px-3 py-2 text-xs font-semibold text-[#f4e7c2]"
              >
                Cerrar sesion
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <input
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void signIn();
                  }
                }}
                placeholder="email"
                className="cloud-input w-full rounded-lg px-3 py-2 text-xs text-[#f4e7c2] outline-none"
              />
              <input
                value={authPass}
                onChange={(e) => setAuthPass(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void signIn();
                  }
                }}
                placeholder="password"
                type="password"
                className="cloud-input w-full rounded-lg px-3 py-2 text-xs text-[#f4e7c2] outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={signIn}
                  className="min-h-[44px] rounded-lg bg-[#d5ab55] px-4 py-2 text-xs font-bold text-[#1a1408] shadow-[0_8px_20px_rgba(213,171,85,0.22)]"
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={signUp}
                  className="min-h-[44px] rounded-lg border border-[#8b6c2a] bg-[#19150f] px-4 py-2 text-xs font-semibold text-[#f4e7c2]"
                >
                  Crear cuenta
                </button>
              </div>
            </div>
          )}

          {authMsg && <p className="cloud-alert mt-3">{authMsg}</p>}

          {isSupabaseConfigured && isAdminOwnerSession && (
            <div className="mt-3 rounded-xl border-2 border-orange-500/55 bg-gradient-to-br from-[#2a1510] to-[#120a08] p-3 shadow-[0_0_0_1px_rgba(249,115,22,0.15)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-200/90">Panel admin</p>
              <p className="mt-1 text-[11px] leading-snug text-orange-100/85">
                Tras Bizum + WhatsApp, introduce el email con el que el comprador se ha registrado y otorga premium en Supabase.
              </p>
              <input
                value={adminGrantEmail}
                onChange={(e) => setAdminGrantEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void grantPremiumForBuyerEmail();
                  }
                }}
                placeholder="Email del comprador (registrado)"
                className="cloud-input mt-2 w-full rounded-lg px-3 py-2 text-xs text-[#f4e7c2] outline-none"
                autoComplete="off"
              />
              <button
                type="button"
                disabled={adminGrantBusy}
                onClick={() => void grantPremiumForBuyerEmail()}
                className="mt-2 min-h-[44px] w-full rounded-lg bg-orange-500 px-3 py-2 text-xs font-extrabold text-[#1a0a04] shadow-[0_8px_22px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adminGrantBusy ? "Guardando…" : "Otorgar premium en Supabase"}
              </button>
              {adminGrantMsg && <p className="mt-2 text-[11px] leading-relaxed text-orange-50/95">{adminGrantMsg}</p>}
            </div>
          )}

          <div className="leaderboard-panel mt-3">
            <div className="leaderboard-head">
              <p className="leaderboard-title">Top detectives</p>
              <button type="button" onClick={() => fetchLeaderboard()} className="leaderboard-refresh">
                Actualizar
              </button>
            </div>
            {leaderboardLoading ? (
              <p className="leaderboard-empty">Cargando ranking...</p>
            ) : leaderboard.length ? (
              <ol className="leaderboard-list">
                {leaderboard.map((entry, idx) => (
                  <li key={`${entry.userId}-${idx}`} className={`leaderboard-row ${entry.isMe ? "leaderboard-row-me" : ""}`}>
                    <span className="leaderboard-rank">#{idx + 1}</span>
                    <span className="leaderboard-name">{entry.label}</span>
                    <span className="leaderboard-score">{entry.solved}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="leaderboard-empty">{leaderboardMsg || "Aun no hay ranking disponible."}</p>
            )}
            <p className="leaderboard-note">Solo cuentan casos realmente resueltos; rendirse no suma.</p>
          </div>

        </section>

        <section className="premium-panel howto-panel p-3 sm:p-4">
          <div className="howto-head">
            <h3 className="premium-heading text-xl">Como jugar</h3>
            <span className="howto-badge">Modo detective</span>
          </div>
          <div className="howto-grid mt-3">
            <article className="howto-step">
              <span className="howto-step-num">01</span>
              <p className="howto-step-title">Posiciona sospechosos</p>
              <p className="howto-step-text">Cada sospechoso debe ocupar una fila y una columna distintas.</p>
            </article>
            <article className="howto-step">
              <span className="howto-step-num">02</span>
              <p className="howto-step-title">Cruza pistas</p>
              <p className="howto-step-text">Usa el panel de pistas para detectar conflictos y reducir opciones.</p>
            </article>
            <article className="howto-step">
              <span className="howto-step-num">03</span>
              <p className="howto-step-title">Encuentra al culpable</p>
              <p className="howto-step-text">Solo el asesino comparte habitacion con la victima. Senalalo y resuelve.</p>
            </article>
          </div>
          <p className="howto-tip mt-3">Tip: si te atascas, revisa primero las pistas en rojo; suelen revelar el bloqueo mas rapido.</p>
        </section>

        <section id="panel-clues" className="premium-panel relative scroll-mt-4 overflow-hidden p-3 sm:p-5">
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full opacity-[0.07]"
            style={{
              background: "radial-gradient(circle at center, rgba(212,175,110,0.9) 0%, transparent 70%)"
            }}
            aria-hidden
          />
          <div className="relative mb-4 flex flex-wrap items-end justify-between gap-2">
            <h3 className="premium-heading text-xl">Pistas</h3>
            <span className="font-display text-[10px] uppercase tracking-[0.28em] text-[#8a7d66]">Expediente</span>
          </div>

          <div className="relative mb-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9a8b70]">Veredicto claro</span>
              <span className="font-mono text-[10px] tabular-nums text-[#c4b59b]">
                {cluesWithVerdict}/{gameCase.constraints.length}
              </span>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-black/45 shadow-[inset_0_1px_3px_rgba(0,0,0,0.65)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-900/80 via-[#b08a3c] to-[#e8c87a] shadow-[0_0_12px_rgba(212,175,110,0.35)] transition-[width] duration-300 ease-out"
                style={{
                  width: `${gameCase.constraints.length ? Math.round((cluesWithVerdict / gameCase.constraints.length) * 100) : 0}%`
                }}
              />
            </div>
          </div>

          <div className="relative mb-3 grid grid-cols-2 gap-2.5">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/50 to-[#0d0a08] px-2.5 py-2 shadow-[0_0_0_1px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-sm text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.2)]">
                &#10003;
              </span>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-200/70">Cumplidas</p>
                <p className="font-display text-lg leading-none text-emerald-100/95">
                  {solvedClues}
                  <span className="text-sm text-emerald-200/50">/{gameCase.constraints.length}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-gradient-to-br from-rose-950/45 to-[#0d0a08] px-2.5 py-2 shadow-[0_0_0_1px_rgba(244,63,94,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/15 text-sm text-rose-200 shadow-[0_0_12px_rgba(251,113,133,0.15)]">
                &#10005;
              </span>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-rose-200/70">En conflicto</p>
                <p className="font-display text-lg leading-none text-rose-100/95">{violatedClues}</p>
              </div>
            </div>
          </div>

          <div className="clues-doc-frame">
            <div className="clues-scroll space-y-2.5 pr-0.5" role="list">
              {clueStatus.map(({ clue, state }, idx) => {
                const borderL =
                  state === true
                    ? "border-l-emerald-400/85"
                    : state === false
                      ? "border-l-rose-400/85"
                      : "border-l-[#6b5c45]/60";
                const badge =
                  state === true
                    ? "border border-emerald-400/35 bg-emerald-950/70 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    : state === false
                      ? "border border-rose-400/35 bg-rose-950/70 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.12)]"
                      : "border border-slate-500/35 bg-slate-900/80 text-amber-100/85";
                const label = state === true ? "OK" : state === false ? "No" : "···";
                const verdictLabel =
                  state === true ? "cumplida" : state === false ? "en conflicto" : "pendiente de datos";
                return (
                  <article
                    key={`${clue.text}-${idx}`}
                    role="listitem"
                    aria-label={`Pista ${idx + 1}, ${verdictLabel}`}
                    className={`relative rounded-lg border border-white/[0.06] bg-gradient-to-br from-[#1c1810] via-[#14110d] to-[#0c0a08] py-2.5 pl-3 pr-2 shadow-[0_4px_14px_rgba(0,0,0,0.35)] ring-1 ring-inset ${borderL} border-l-[3px] ${
                      state === true ? "clue-doc-validated" : ""
                    } ${clueStampIdx === idx ? "clue-doc-stamp-pop" : ""}`}
                  >
                    {state === true && (
                      <span className="clue-forensic-stamp pointer-events-none absolute right-2 top-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/90 opacity-80 mix-blend-plus-lighter">
                        OK
                      </span>
                    )}
                    <div className="flex gap-2.5">
                      <div className="relative flex w-[3.25rem] shrink-0 flex-col items-center gap-1 border-r border-white/[0.05] pr-2">
                        <span className={`font-display w-full min-w-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold ${badge}`}>{label}</span>
                        <span className="font-mono text-[9px] tabular-nums text-[#5c5346]">{String(idx + 1).padStart(2, "0")}</span>
                      </div>
                      <p
                        className={`min-w-0 flex-1 text-[12.5px] leading-[1.45] text-[#e8ddc4] ${state === false ? "clue-text-refuted" : ""}`}
                      >
                        {clue.text}
                      </p>
                    </div>
                  </article>
                );
              })}

              <article
                role="listitem"
                aria-label="Regla fija del caso"
                className="relative rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-950/25 via-[#14110d] to-[#0e0c09] py-2.5 pl-3 pr-2 shadow-[0_4px_14px_rgba(0,0,0,0.35)] ring-1 ring-amber-500/15"
              >
                <div className="flex gap-2.5">
                  <div className="flex w-[3.25rem] shrink-0 flex-col items-center justify-center border-r border-amber-500/15 pr-2">
                    <span className="font-display rounded-md border border-amber-500/40 bg-amber-950/50 px-1.5 py-0.5 text-center text-[8px] font-bold uppercase tracking-widest text-amber-200/90">
                      Regla
                    </span>
                  </div>
                  <p className="min-w-0 flex-1 text-[12.5px] leading-[1.45] text-[#e0d5be]">La victima estaba sola con el asesino en su misma habitacion.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="panel-suspects" className="premium-panel suspects-panel scroll-mt-4 p-3 sm:p-4">
          <div className="suspects-head">
            <h3 className="premium-heading text-xl">Sospechosos</h3>
            <span className="suspects-badge">Archivo visual</span>
          </div>
          <p className="suspects-help mt-2">
            Mantén pulsado y arrastra en móvil, o toca sospechoso y luego casilla para colocarlo.
          </p>
          <div className="suspects-grid mt-2 grid touch-manipulation grid-cols-4 gap-1.5 sm:gap-2">
            {gameCase.suspects.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={selectedSuspect === s.id}
                aria-label={`Seleccionar sospechoso ${s.name}`}
                onClick={() => setSelectedSuspect(s.id)}
                draggable
                onDragStart={(e) => {
                  setDraggedSuspectId(s.id);
                  try {
                    e.dataTransfer.setData("text/plain", s.id);
                    e.dataTransfer.effectAllowed = "move";
                  } catch {
                    /* noop */
                  }
                }}
                onDragEnd={() => setDraggedSuspectId(null)}
                onPointerDown={(e) => {
                  if (e.pointerType === "touch" || e.pointerType === "pen") {
                    setSelectedSuspect(s.id);
                    setPointerCarry({ id: s.id });
                    setCarryGhost({ x: e.clientX, y: e.clientY });
                  }
                }}
                className={`suspect-card flex min-h-[70px] w-full min-w-0 flex-col items-center justify-center rounded-xl border-2 p-1 sm:p-1.5 text-center touch-manipulation select-none ${selectedSuspect === s.id ? "suspect-card-active" : "suspect-card-idle"}`}
                style={{ ["--suspect-accent" as "--suspect-accent"]: s.color } as React.CSSProperties}
              >
                <PortraitImg
                  seed={s.id}
                  color={s.color}
                  alt={s.name}
                  portraitKey={s.portraitKey}
                  className="mx-auto h-9 w-8 rounded border border-slate-600/80 object-cover bg-transparent shadow-[0_0_12px_rgba(0,0,0,0.35)] sm:h-10 sm:w-9"
                />
                <p className="mt-0.5 truncate px-0.5 text-[9px] font-bold leading-tight text-[#f5ebd4] sm:mt-1 sm:text-[10px]">{s.name}</p>
              </button>
            ))}
            <div className="victim-card flex min-h-[70px] w-full min-w-0 flex-col items-center justify-center rounded-xl border-2 p-1 text-center sm:p-1.5">
              <p className="truncate px-0.5 text-[9px] font-bold text-[#ffd6de] sm:text-[10px]">{gameCase.victimName}</p>
              <p className="text-[8px] uppercase tracking-wide text-[#f7b7c3] sm:text-[9px]">Victima</p>
            </div>
          </div>
        </section>

        <section id="panel-board" className={`scene-shell premium-panel scroll-mt-4 p-3 sm:p-4 ${solvedFx ? "solved-glow" : ""}`}>
          <div className="scene-head mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="scene-kicker">Reconstruccion forense</p>
              <h3 className="premium-heading text-xl">Escena del crimen</h3>
            </div>
            <span className="scene-chip rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
              {SCENARIO_PACKS[gameCase.scenarioId].labelEs} · {layoutArchetypeLabelEs(layoutArchetype(gameCase.layoutIndex))} · L{gameCase.layoutIndex + 1}
            </span>
          </div>
          <div className="scene-viewport relative z-[5] w-full overflow-hidden rounded-lg border border-[#2a2418] bg-[#060605]">
            <span className="scene-scanline" aria-hidden />
            {celebrate && (
              <div className="pointer-events-none absolute inset-0 z-[25] overflow-hidden rounded-lg">
                {Array.from({ length: 42 }).map((_, i) => {
                  const angle = (i / 42) * Math.PI * 2 + i * 0.11;
                  const dist = 48 + (i % 9) * 11;
                  return (
                    <span
                      key={i}
                      className="celebrate-dot pointer-events-none absolute left-1/2 top-1/2 h-[5px] w-[5px] rounded-full bg-gradient-to-br from-[#fff9e6] to-[#c9a227] shadow-[0_0_8px_rgba(247,210,122,0.9)]"
                      style={
                        {
                          ["--dx"]: `${Math.cos(angle) * dist}px`,
                          ["--dy"]: `${Math.sin(angle) * dist}px`,
                          animationDelay: `${(i % 10) * 0.025}s`
                        } as React.CSSProperties
                      }
                    />
                  );
                })}
              </div>
            )}
            <div className="flex w-full shrink-0 items-center justify-center p-1.5 sm:p-2" style={sceneView.innerStyle}>
              <div className="scene-board w-full max-w-full shrink-0 rounded-lg border-4 border-[#050505] bg-gradient-to-b from-[#141210] to-[#060605] p-[3px] shadow-[inset_0_0_32px_rgba(0,0,0,0.55),0_18px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(212,175,110,0.25)]">
            {Array.from({ length: BOARD_ROWS * BOARD_COLS }).map((_, i) => {
              const r = Math.floor(i / BOARD_COLS);
              const c = i % BOARD_COLS;
              const cell = { r, c };
              const room = roomAt(cell, sceneRoomGrid);
              const vis = getRoomCellStyle(room, gameCase.layoutIndex, level, gameCase.templateIndex, gameCase.scenarioId);
              const objectKey = (Object.entries(gameCase.objectCells).find(([, list]) => list.some((p) => samePos(p, cell)))?.[0] as ObjectKey | undefined) ?? null;
              const suspectId = Object.entries(placements).find(([, p]) => samePos(p, cell))?.[0];
              const suspectObj = gameCase.suspects.find((s) => s.id === suspectId);
              const isCorrectSpot = revealPlacementFeedback && suspectId ? samePos(gameCase.solution[suspectId], cell) : false;
              const isWrongSpot = revealPlacementFeedback && !!suspectId && !samePos(gameCase.solution[suspectId], cell);
              const isVictim = samePos(cell, gameCase.victimPos);
              const rowBlocked = Object.values(placements).some((p) => p.r === r);
              const colBlocked = Object.values(placements).some((p) => p.c === c);
              const isLaserBlocked = rowBlocked || colBlocked;
              const isLastPlaced = lastPlacedCell === keyOf(cell);
              const topWall = r === 0 || sceneRoomGrid[r - 1][c] !== room;
              const rightWall = c === BOARD_COLS - 1 || sceneRoomGrid[r][c + 1] !== room;
              const bottomWall = r === BOARD_ROWS - 1 || sceneRoomGrid[r + 1][c] !== room;
              const leftWall = c === 0 || sceneRoomGrid[r][c - 1] !== room;
              const roomLabel = gameCase.roomLabels[room];
              const reconDim = reconstructPlaying && !reconstructLit.has(room);
              const reconLit = reconstructLit.has(room) && reconstructLit.size > 0;
              const cellAria = (() => {
                let s = `Fila ${r + 1}, columna ${c + 1}. Zona ${roomLabel}.`;
                if (gameCase.blockedSet.has(keyOf(cell))) s += " Casilla bloqueada.";
                if (isVictim) s += " Victima.";
                if (objectKey) s += ` Objeto: ${gameCase.objectDefs[objectKey].label}.`;
                if (suspectObj) s += ` Colocado: ${suspectObj.name}.`;
                s += " Pulsa para colocar o retirar el sospechoso seleccionado.";
                return s;
              })();
              return (
                <button
                  key={i}
                  type="button"
                  data-scene-cell
                  data-cell-idx={i}
                  aria-label={cellAria}
                  onClick={() => placeSelected(cell)}
                  onDragOver={(e) => {
                    if (!objectKey && !isVictim) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    placeSuspectAt(draggedSuspectId ?? selectedSuspect, cell);
                  }}
                  className={`scene-cell touch-manipulation relative h-12 overflow-hidden rounded-[3px] transition-all duration-200 ${objectKey ? "opacity-75" : ""} ${
                    isLaserBlocked && !suspectObj ? "shadow-[inset_0_0_0_2px_rgba(220,38,38,0.65)]" : ""
                  } ${isLastPlaced ? "ring-2 ring-emerald-300 scale-[1.03]" : ""} ${activeRoomKey === room ? "room-cell-focus" : ""} ${
                    activeRoomKey && activeRoomKey !== room ? "room-cell-dim" : ""
                  } ${reconDim ? "scene-cell-reconstruct-dim" : ""} ${reconLit ? "scene-cell-reconstruct-lit" : ""} hover:z-10 hover:ring-1 hover:ring-[#d4af6e]/80 hover:brightness-110`}
                  style={{
                    backgroundColor: vis.backgroundColor,
                    backgroundImage: vis.backgroundImage,
                    boxShadow: reconLit
                      ? "inset 0 0 0 2px rgba(253, 224, 71, 0.72), 0 0 20px rgba(250, 204, 21, 0.42)"
                      : `inset 0 0 0 1px ${vis.borderAccent}`
                  }}
                >
                  {topWall && <span className="pointer-events-none absolute left-0 right-0 top-0 z-[1] h-[4px] bg-[#0a0a0a]/95 shadow-[0_1px_0_rgba(212,175,110,0.12)]" />}
                  {rightWall && <span className="pointer-events-none absolute bottom-0 right-0 top-0 z-[1] w-[4px] bg-[#0a0a0a]/95 shadow-[-1px_0_0_rgba(212,175,110,0.1)]" />}
                  {bottomWall && <span className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1] h-[4px] bg-[#0a0a0a]/95 shadow-[0_-1px_0_rgba(212,175,110,0.1)]" />}
                  {leftWall && <span className="pointer-events-none absolute bottom-0 left-0 top-0 z-[1] w-[4px] bg-[#0a0a0a]/95 shadow-[1px_0_0_rgba(212,175,110,0.1)]" />}
                  {isLaserBlocked && !suspectObj && (colBlocked ? (
                    <span className="pointer-events-none absolute bottom-0 top-0 left-1/2 w-[3px] -translate-x-1/2 bg-red-400/85 shadow-[0_0_10px_rgba(248,113,113,0.95)]" />
                  ) : (
                    <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 bg-red-400/85 shadow-[0_0_10px_rgba(248,113,113,0.95)]" />
                  ))}
                  {laserPulse && laserPulse.row === r && !colBlocked && (
                    <span className="laser-sweep-h pointer-events-none absolute left-0 right-0 top-1/2 h-[4px] -translate-y-1/2 bg-red-300/95 shadow-[0_0_14px_rgba(252,165,165,1)]" />
                  )}
                  {laserPulse && laserPulse.col === c && (
                    <span className="pointer-events-none absolute bottom-0 top-0 left-1/2 w-[4px] -translate-x-1/2 bg-red-300/95 shadow-[0_0_14px_rgba(252,165,165,1)]" />
                  )}
                  {objectKey && (
                <span className="pointer-events-none absolute inset-1 z-[1] opacity-95">
                  <ObjectBoardIcon kind={gameCase.objectDefs[objectKey].glyph} className="relative z-[2]" />
                </span>
              )}
                  {isVictim && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="victim-glow pointer-events-none absolute inset-0 rounded-[2px] border-2 border-[#f43f5e] bg-[#2b0e15]/50 shadow-[0_0_16px_rgba(244,63,94,0.65)]" />
                      <VictimMark />
                    </span>
                  )}
                  {suspectObj && (
                    <span
                      className={`absolute inset-0.5 rounded border-2 p-0.5 ${
                        isCorrectSpot
                          ? "border-emerald-400/95 bg-emerald-950/78 shadow-[inset_0_0_12px_rgba(16,185,129,0.12)]"
                          : isWrongSpot
                            ? "border-rose-400/95 bg-rose-950/78 shadow-[inset_0_0_12px_rgba(244,63,94,0.1)]"
                            : "border-[#a8894a]/65 bg-[#0f0d0b]/88 shadow-[inset_0_1px_0_rgba(255,248,220,0.05)]"
                      }`}
                    >
                      <span className="flex h-full flex-col items-center justify-center rounded border border-[#5c4d32]/55 bg-[#151210]/92 px-0.5">
                        <PortraitImg
                          seed={suspectObj.id}
                          color={suspectObj.color}
                          alt={suspectObj.name}
                          portraitKey={suspectObj.portraitKey}
                          className="h-7 w-6 rounded object-cover bg-transparent"
                        />
                        <span className="mt-0.5 text-[7px] font-extrabold leading-tight text-[#f5ebd4]">{suspectObj.name}</span>
                      </span>
                      {isCorrectSpot && <span className="heart-pop absolute right-0 top-0 text-xs">💚</span>}
                    </span>
                  )}
                </button>
              );
            })}
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-bold">
            {roomLegend.map(({ key, label, vis }) => (
              <button
                key={key}
                className={`room-legend-chip rounded border px-2 py-1 text-center ${activeRoomKey === key ? "room-legend-chip-active" : ""}`}
                style={{
                  backgroundColor: vis.backgroundColor,
                  backgroundImage: vis.backgroundImage,
                  borderColor: vis.borderAccent
                }}
                type="button"
                onPointerEnter={() => setActiveRoomKey(key)}
                onPointerLeave={() => setActiveRoomKey(null)}
                onClick={() => pulseRoom(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section
          id="panel-accuse"
          className={`premium-panel accuse-panel scroll-mt-4 p-3 sm:p-4 ${accuseFx === "fail" ? "accuse-shake" : ""} ${accuseFx === "success" ? "accuse-camera-reveal" : ""}`}
        >
          <div className="accuse-head">
            <div>
              <p className="accuse-kicker">Juicio final</p>
              <h3 className="premium-heading text-xl">El asesino es...</h3>
            </div>
            <span className="accuse-chip">Selecciona culpable</span>
          </div>
          {accuseFx && (
            <div className={`accuse-overlay ${accuseFx === "success" ? "accuse-overlay-success" : "accuse-overlay-fail"}`} aria-hidden>
              {accuseFx === "success" ? "Caso resuelto" : "Pista en conflicto"}
            </div>
          )}
          {accuseFx === "success" && (
            <div className="accuse-burst" aria-hidden>
              {Array.from({ length: 22 }).map((_, i) => {
                const angle = (i / 22) * Math.PI * 2;
                const dist = 42 + (i % 6) * 8;
                return (
                  <span
                    key={`acc-${i}`}
                    className="accuse-burst-dot"
                    style={
                      {
                        ["--dx"]: `${Math.cos(angle) * dist}px`,
                        ["--dy"]: `${Math.sin(angle) * dist}px`,
                        animationDelay: `${(i % 8) * 0.02}s`
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {gameCase.suspects.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={selectedKillerId === s.id}
                aria-label={`Senalar a ${s.name} como asesino`}
                onClick={() => setSelectedKillerId(s.id)}
                className={`accuse-suspect-card flex min-h-[74px] w-full min-w-0 flex-col items-center justify-center rounded-xl border p-1.5 text-center touch-manipulation select-none ${
                  selectedKillerId === s.id ? "accuse-suspect-card-active" : "accuse-suspect-card-idle"
                }`}
              >
                <PortraitImg
                  seed={s.id}
                  color={s.color}
                  alt={s.name}
                  portraitKey={s.portraitKey}
                  className="mx-auto h-10 w-8 rounded border border-black/35 object-cover bg-transparent"
                />
                <p className="mt-1 text-[10px] font-bold text-[#f6ebd4]">{s.name}</p>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={solveCase}
            className="mt-3 min-h-[46px] w-full rounded-xl bg-gradient-to-r from-[#c79337] via-[#f0c36a] to-[#c79337] px-4 py-3 text-sm font-extrabold text-[#1a1408] shadow-[0_12px_28px_-12px_rgba(240,195,106,0.75)]"
          >
            Resolver caso
          </button>
          <button
            type="button"
            onClick={revealSolution}
            disabled={solutionRevealed}
            className="mt-2 min-h-[44px] w-full rounded-xl border border-[#8b6c2a] bg-[#19150f] px-4 py-2.5 text-xs font-semibold text-[#f4e7c2] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {solutionRevealed ? "Solucion mostrada" : "Rendirse y ver solucion"}
          </button>
          {canShowNextCase && (
            <button
              type="button"
              onClick={nextCase}
              className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-[0_0_18px_rgba(22,163,74,0.35)]"
            >
              Siguiente caso
            </button>
          )}
          {solutionRevealed && (
            <button
              type="button"
              onClick={resetCase}
              className="mt-2 w-full rounded-xl border border-[#6b542a] bg-[#120f0a] px-4 py-2.5 text-xs font-semibold text-[#e8d4a8]"
            >
              Nuevo intento (regenerar caso)
            </button>
          )}
          <div className="mt-2 flex gap-2">
            <button onClick={shareResult} className="rounded-xl border border-[#8b6c2a] bg-[#19150f] px-3 py-2 text-xs font-semibold text-[#f4e7c2]">Compartir</button>
            <p className="text-xs leading-5 text-[#e5d7b7]">{result}</p>
          </div>
          <p className="mt-2 text-[11px] text-[#dfc88c]">Colocados: {allOccupied.length}/{gameCase.suspects.length}</p>
        </section>

        {showPurchaseSection && (
        <section ref={purchaseSectionRef} className="rounded-2xl border-2 border-violet-400/60 bg-gradient-to-b from-[#231043] to-[#140b2a] p-3 shadow-sm">
          <h3 className="text-lg font-black text-white">ASE DOKU PRO</h3>
          <p className="mt-1 text-xs text-violet-100">
            Desbloquea casos infinitos en tu cuenta. Pago unico por Bizum; luego confirma por WhatsApp con la palabra clave.
          </p>
          <button
            type="button"
            onClick={() => {
              setShowBizumModal(true);
              trackFunnelEvent("bizum_modal_open");
            }}
            className="mt-3 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-slate-900"
          >
            Comprar con Bizum — {BIZUM_AMOUNT_EUR} EUR
          </button>
          <button
            type="button"
            onClick={() => void refreshEntitlement()}
            className="mt-2 w-full rounded-xl border border-violet-300/70 px-4 py-2 text-xs font-bold text-violet-50"
          >
            Ya he pagado · Comprobar compra
          </button>
          <p className="mt-2 text-[11px] text-violet-100">
            Tras el ingreso, envia el WhatsApp indicado en el popup. Cuando vinculemos el pago a tu cuenta (inicia sesion con el mismo email), pulsa &quot;Comprobar compra&quot;.
          </p>
        </section>
        )}
      </section>

      <nav
        className="bottom-nav fixed bottom-0 left-0 right-0 z-30 flex gap-1.5 px-1.5 py-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] md:hidden"
        aria-label="Atajos: tablero, pistas, fichas"
      >
        <button
          type="button"
          className={`bottom-nav-btn min-h-[44px] flex-1 rounded-lg py-2 text-[11px] font-bold uppercase tracking-wide active:scale-[0.98] ${
            activeMobileNav === "board" ? "bottom-nav-btn-active" : ""
          }`}
          onClick={() => {
            setActiveMobileNav("board");
            document.getElementById("panel-board")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Tablero
        </button>
        <button
          type="button"
          className={`bottom-nav-btn min-h-[44px] flex-1 rounded-lg py-2 text-[11px] font-bold uppercase tracking-wide active:scale-[0.98] ${
            activeMobileNav === "clues" ? "bottom-nav-btn-active" : ""
          }`}
          onClick={() => {
            setActiveMobileNav("clues");
            document.getElementById("panel-clues")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Pistas
        </button>
        <button
          type="button"
          className={`bottom-nav-btn min-h-[44px] flex-1 rounded-lg py-2 text-[11px] font-bold uppercase tracking-wide active:scale-[0.98] ${
            activeMobileNav === "suspects" ? "bottom-nav-btn-active" : ""
          }`}
          onClick={() => {
            setActiveMobileNav("suspects");
            document.getElementById("panel-suspects")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Fichas
        </button>
      </nav>

      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-sm rounded-2xl border-2 border-violet-400 bg-gradient-to-b from-[#2a1351] to-[#1a1033] p-4 text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-violet-200">Caso completado</p>
            <h3 className="mt-1 text-2xl font-black">{loginGateReached ? "Inicia sesion para continuar" : freeGateReached ? "Desbloquea ASE DOKU completo" : "Siguiente caso listo"}</h3>
            {loginGateReached ? (
              <p className="mt-3 text-sm text-violet-100">
                Desde el caso 2 pedimos cuenta. Inicia sesion y pulsa "Jugar siguiente caso".
              </p>
            ) : freeGateReached ? (
              <>
                <ul className="mt-3 space-y-1 text-sm text-violet-100">
                  <li>- Plantillas logicas multiples (10+)</li>
                  <li>- Relacion/objeto/habitacion procedimental</li>
                  <li>- Dificultad progresiva y casos infinitos</li>
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setShowBizumModal(true);
                    trackFunnelEvent("bizum_modal_open_paywall");
                  }}
                  className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-slate-900"
                >
                  Comprar con Bizum — {BIZUM_AMOUNT_EUR} EUR
                </button>
                <button
                  type="button"
                  onClick={() => void refreshEntitlement()}
                  className="mt-2 w-full rounded-xl border border-violet-300/70 px-4 py-2 text-xs font-bold text-violet-50"
                >
                  Ya he pagado · Comprobar compra
                </button>
              </>
            ) : (
              <p className="mt-3 text-sm text-violet-100">Te quedan {Math.max(0, demoCaseLimit - completedCases)} demo(s) antes de mostrar oferta premium.</p>
            )}
            {freeGateReached ? (
              <button onClick={goToPurchaseSection} className="mt-2 w-full rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-[#0f172a]">
                Ver como comprar con Bizum
              </button>
            ) : (
              <button onClick={nextCase} className="mt-2 w-full rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-[#0f172a]">Jugar siguiente caso</button>
            )}
            <button onClick={() => setShowUpgrade(false)} className="mt-2 w-full rounded-xl border border-violet-300/60 px-4 py-2 text-xs font-semibold">Ahora no</button>
          </div>
        </div>
      )}

      {showBizumModal && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bizum-modal-title"
          onClick={() => setShowBizumModal(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border-2 border-amber-400/70 bg-gradient-to-b from-[#1e1428] to-[#0f0a14] p-4 text-[#f4e7c2] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="bizum-modal-title" className="text-lg font-black text-amber-200">
              Comprar con Bizum
            </h3>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-violet-100">
              <li>
                Envía un <strong className="text-white">Bizum de {BIZUM_AMOUNT_EUR} EUR</strong> a este número:
              </li>
              <li>
                Abre <strong className="text-white">WhatsApp</strong> y envía un mensaje con solo la palabra{" "}
                <strong className="font-mono text-amber-200">ASEDOKU</strong> (así enlazamos el pago con tu solicitud).
              </li>
              <li>
                Crea cuenta o inicia sesión con el <strong className="text-white">mismo email</strong> que usarás en el juego; cuando activemos tu fila en el sistema, pulsa{" "}
                <strong className="text-white">Ya he pagado · Comprobar compra</strong>.
              </li>
            </ol>
            <p className="mt-3 rounded-lg border border-amber-500/45 bg-black/35 px-3 py-2.5 text-center font-mono text-base font-bold tracking-wide text-amber-100">
              {BIZUM_PHONE_DISPLAY}
            </p>
            {WHATSAPP_ASEDOKU_LINK ? (
              <a
                href={WHATSAPP_ASEDOKU_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#25D366] px-4 py-3 text-sm font-extrabold text-[#052e16] shadow-[0_8px_24px_rgba(37,211,102,0.35)]"
              >
                Abrir WhatsApp con “ASEDOKU”
              </a>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-center text-[11px] text-amber-100/90">
                Configura en <span className="font-mono">.env</span> la variable <span className="font-mono">VITE_BIZUM_PHONE</span> (o{" "}
                <span className="font-mono">VITE_PREMIUM_WHATSAPP_DIGITS</span>) para generar el enlace a WhatsApp.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowBizumModal(false)}
              className="mt-3 w-full rounded-xl border border-violet-400/50 px-4 py-2.5 text-sm font-semibold text-violet-100"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {carryGhost && touchGhostSuspect && (
        <div
          className="pointer-events-none fixed z-[40] h-16 w-14 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-[#d5ab55] bg-[#1a1610] shadow-[0_12px_40px_rgba(0,0,0,0.65)] ring-2 ring-[#f7d27a]/25"
          style={{ left: carryGhost.x, top: carryGhost.y }}
          aria-hidden
        >
          <PortraitImg
            seed={touchGhostSuspect.id}
            color={touchGhostSuspect.color}
            alt=""
            portraitKey={touchGhostSuspect.portraitKey}
            className="h-full w-full rounded-[10px] object-cover bg-transparent"
            draggable={false}
          />
        </div>
      )}

      {tutorialStep > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border-2 border-[#d5ab55] bg-[#15120d] p-4 text-[#f4e7c2]">
            <p className="text-xs uppercase tracking-[0.2em] text-[#d5ab55]">Tutorial rapido</p>
            {tutorialStep === 1 && (
              <>
                <h3 className="mt-1 text-xl font-black">Paso 1: Coloca sospechosos</h3>
                <p className="mt-2 text-sm text-[#dfc88c]">Selecciona una ficha y toca una casilla libre. No se repite fila ni columna.</p>
              </>
            )}
            {tutorialStep === 2 && (
              <>
                <h3 className="mt-1 text-xl font-black">Paso 2: Mira pistas en vivo</h3>
                <p className="mt-2 text-sm text-[#dfc88c]">Cada pista muestra estado: OK (cumplida), X (conflicto), ... (faltan datos).</p>
              </>
            )}
            {tutorialStep === 3 && (
              <>
                <h3 className="mt-1 text-xl font-black">Paso 3: Acusa al asesino</h3>
                <p className="mt-2 text-sm text-[#dfc88c]">Elige sospechoso final y pulsa resolver. Si aciertas, desbloqueas siguiente caso.</p>
              </>
            )}
            <div className="mt-4 flex gap-2">
              {tutorialStep < 3 ? (
                <button onClick={() => setTutorialStep((s) => s + 1)} className="flex-1 rounded-lg bg-[#d5ab55] px-3 py-2 text-sm font-bold text-[#1a1408]">
                  Siguiente
                </button>
              ) : (
                <button
                  onClick={() => {
                    window.localStorage.setItem(TUTORIAL_KEY, "1");
                    setTutorialStep(0);
                  }}
                  className="flex-1 rounded-lg bg-[#d5ab55] px-3 py-2 text-sm font-bold text-[#1a1408]"
                >
                  Empezar
                </button>
              )}
              <button
                onClick={() => {
                  window.localStorage.setItem(TUTORIAL_KEY, "1");
                  setTutorialStep(0);
                }}
                className="rounded-lg border border-[#8b6c2a] px-3 py-2 text-xs"
              >
                Saltar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;

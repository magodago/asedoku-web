import { useEffect, useMemo, useState } from "react";

type RoomKey = "Lab" | "Storage" | "Office" | "Freezer";
type Pos = { r: number; c: number };
type Suspect = { id: string; name: string; color: string };
type ObjectKey = "obj0" | "obj1" | "obj2" | "obj3";
type ObjectDef = { label: string; glyph: "chair" | "table" | "shelf" | "tv" };
type ConstraintType = "sameRoom" | "inRoom" | "notInRoom" | "adjObject" | "notAdjObject" | "northOf" | "westOf" | "firstColumn";
type Constraint = { type: ConstraintType; a: string; b?: string; room?: RoomKey; objectKey?: ObjectKey; text: string };
type GameCase = {
  level: number;
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
};
type StoredCase = Omit<GameCase, "blockedSet"> & { blocked: string[] };
type StoredState = {
  level: number;
  gameCase: StoredCase;
  selectedSuspect: string;
  placements: Record<string, Pos>;
  selectedKillerId: string;
  result: string;
  showUpgrade: boolean;
};
type PaywallVariant = "one_time" | "subscription";

const BOARD = {
  rows: 6,
  cols: 6,
  roomByCell: [
    ["Lab", "Lab", "Lab", "Storage", "Storage", "Storage"],
    ["Lab", "Lab", "Lab", "Storage", "Storage", "Storage"],
    ["Office", "Office", "Office", "Storage", "Storage", "Storage"],
    ["Office", "Office", "Office", "Storage", "Storage", "Storage"],
    ["Office", "Office", "Office", "Freezer", "Freezer", "Freezer"],
    ["Office", "Office", "Office", "Freezer", "Freezer", "Freezer"]
  ] as RoomKey[][]
};

const ROLE_IDS = ["r0", "r1", "r2", "r3", "r4", "r5"] as const;
const NAME_POOL = ["Ashton", "Blaine", "Carla", "Delilah", "Estella", "Frank", "Alicia", "Bruno", "Celia", "Dario", "Elena", "Fabio", "Gala", "Hector", "Irene", "Julian", "Karla", "Leo", "Marta", "Nora", "Oscar", "Paula", "Ruben", "Sonia"];
const COLOR_POOL = ["#ff7aa2", "#7ec8ff", "#ffe37e", "#8ef6d8", "#c8b6ff", "#ffc78a", "#ff9ad3", "#9df2a3", "#9ad0ff", "#f9b1ff"];
const VICTIM_POOL = ["Vaughn", "Nadia", "Victor", "Sofia", "Lucas", "Marina", "Brenda", "Hugo"];
const ROOM_THEMES: Record<string, { rooms: [string, string, string, string]; objects: [string, string, string, string] }> = {
  mansion: { rooms: ["BIBLIOTECA", "ALMACEN", "DESPACHO", "CONGELADOR"], objects: ["SILLA", "SOFA", "ESTANTERIA", "TV"] },
  office: { rooms: ["LAB", "ARCHIVO", "SALA PROY.", "SERVIDOR"], objects: ["SILLA", "SOFA", "ESTANTERIA", "TV"] },
  school: { rooms: ["AULA", "LABORATORIO", "DIRECCION", "COMEDOR"], objects: ["SILLA", "SOFA", "ESTANTERIA", "TV"] },
  hospital: { rooms: ["URGENCIAS", "ALMACEN", "CONSULTA", "CAMARA FRIA"], objects: ["SILLA", "SOFA", "ESTANTERIA", "TV"] }
};
const TEMPLATE_LIBRARY: ConstraintType[][] = [
  ["sameRoom", "adjObject", "inRoom", "northOf", "firstColumn", "adjObject", "notInRoom"],
  ["inRoom", "inRoom", "adjObject", "northOf", "sameRoom", "firstColumn", "adjObject"],
  ["sameRoom", "adjObject", "notAdjObject", "inRoom", "northOf", "firstColumn", "notInRoom"],
  ["inRoom", "adjObject", "adjObject", "northOf", "westOf", "firstColumn", "notInRoom"],
  ["sameRoom", "adjObject", "inRoom", "notInRoom", "northOf", "firstColumn", "notAdjObject"],
  ["inRoom", "adjObject", "sameRoom", "northOf", "westOf", "adjObject", "notInRoom"],
  ["inRoom", "notInRoom", "adjObject", "northOf", "firstColumn", "sameRoom", "notAdjObject"],
  ["sameRoom", "inRoom", "adjObject", "adjObject", "northOf", "firstColumn", "westOf"],
  ["inRoom", "adjObject", "notAdjObject", "northOf", "sameRoom", "firstColumn", "notInRoom"],
  ["sameRoom", "adjObject", "inRoom", "northOf", "westOf", "firstColumn", "adjObject"],
  ["inRoom", "adjObject", "notInRoom", "northOf", "sameRoom", "firstColumn", "adjObject"],
  ["inRoom", "adjObject", "sameRoom", "northOf", "firstColumn", "notAdjObject", "westOf"]
];
const STORAGE_KEY = "asedoku-save-v1";
const TUTORIAL_KEY = "asedoku-tutorial-done-v1";
const PAYWALL_KEY = "asedoku-paywall-variant-v1";
const FUNNEL_KEY = "asedoku-funnel-v1";

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
const roomOf = (p: Pos) => BOARD.roomByCell[p.r][p.c];
const inSameRoom = (a: Pos, b: Pos) => roomOf(a) === roomOf(b);

const objectGlyph = (kind: ObjectDef["glyph"]) => {
  if (kind === "chair") return <span className="text-3xl">🪑</span>;
  if (kind === "table") return <span className="text-3xl">🛋️</span>;
  if (kind === "shelf") return <span className="text-3xl">🗄️</span>;
  return <span className="text-3xl">📺</span>;
};

const portraitSrc = (name: string, color: string) => {
  const initials = name.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="140" viewBox="0 0 120 140"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#75829a"/></linearGradient></defs><rect x="8" y="8" width="104" height="104" rx="6" fill="url(#g1)" stroke="#1f1f1f" stroke-width="3"/><ellipse cx="60" cy="45" rx="22" ry="24" fill="#f4eadf"/><path d="M38,40 C38,22 82,22 82,40 L82,36 C79,22 68,18 60,18 C52,18 41,22 38,36Z" fill="#2b2b35"/><circle cx="52" cy="45" r="2" fill="#1f2937"/><circle cx="68" cy="45" r="2" fill="#1f2937"/><path d="M53,58 Q60,63 67,58" stroke="#8b5e4a" stroke-width="2" fill="none"/><rect x="34" y="72" width="52" height="28" rx="12" fill="#e9eef5"/><rect x="16" y="116" width="88" height="18" rx="9" fill="#f3f4f6" stroke="#111827" stroke-width="2"/><text x="60" y="129" text-anchor="middle" font-size="11" font-family="Georgia">${name}</text><text x="60" y="20" text-anchor="middle" font-size="10" fill="#111827">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const evaluateConstraint = (c: Constraint, places: Record<string, Pos>, objectCells: Record<ObjectKey, Pos[]>) => {
  const pa = places[c.a];
  if (!pa) return false;
  if (c.b && !places[c.b]) return false;
  if (c.type === "sameRoom") return inSameRoom(pa, places[c.b!]);
  if (c.type === "inRoom") return roomOf(pa) === c.room;
  if (c.type === "notInRoom") return roomOf(pa) !== c.room;
  if (c.type === "adjObject") return objectCells[c.objectKey!].some((p) => isAdjacent(pa, p));
  if (c.type === "notAdjObject") return !objectCells[c.objectKey!].some((p) => isAdjacent(pa, p));
  if (c.type === "northOf") return pa.r < places[c.b!].r;
  if (c.type === "westOf") return pa.c < places[c.b!].c;
  if (c.type === "firstColumn") return pa.c === 0;
  return true;
};
const evaluateConstraintPartial = (c: Constraint, places: Record<string, Pos>, objectCells: Record<ObjectKey, Pos[]>) => {
  const pa = places[c.a];
  if (!pa) return null;
  if (c.b && !places[c.b]) return null;
  return evaluateConstraint(c, places, objectCells);
};

const countSolutions = (suspectIds: string[], candidateMap: Record<string, Pos[]>, constraints: Constraint[], objectCells: Record<ObjectKey, Pos[]>, victimPos: Pos, murdererId: string) => {
  const order = [...suspectIds].sort((a, b) => candidateMap[a].length - candidateMap[b].length);
  const usedRows = new Set<number>();
  const usedCols = new Set<number>();
  const assign: Record<string, Pos> = {};
  let count = 0;
  const partialOk = () => constraints.every((c) => (!assign[c.a] || (c.b && !assign[c.b]) ? true : evaluateConstraint(c, assign, objectCells)));
  const dfs = (idx: number) => {
    if (count > 1) return;
    if (idx >= order.length) {
      if (!constraints.every((c) => evaluateConstraint(c, assign, objectCells))) return;
      const sameRoomAsVictim = Object.entries(assign).filter(([, p]) => inSameRoom(p, victimPos));
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
  const template = TEMPLATE_LIBRARY[(level + Math.floor(Math.random() * TEMPLATE_LIBRARY.length)) % TEMPLATE_LIBRARY.length];
  const theme = sample(Object.values(ROOM_THEMES), 1)[0];
  const pickedNames = sample(NAME_POOL, 6);
  const pickedColors = sample(COLOR_POOL, 6);
  const suspects: Suspect[] = ROLE_IDS.map((id, idx) => ({ id, name: pickedNames[idx], color: pickedColors[idx] }));
  const victimName = sample(VICTIM_POOL, 1)[0];
  const roomLabels: Record<RoomKey, string> = { Lab: theme.rooms[0], Storage: theme.rooms[1], Office: theme.rooms[2], Freezer: theme.rooms[3] };
  const objectDefs: Record<ObjectKey, ObjectDef> = { obj0: { label: theme.objects[0], glyph: "chair" }, obj1: { label: theme.objects[1], glyph: "table" }, obj2: { label: theme.objects[2], glyph: "shelf" }, obj3: { label: theme.objects[3], glyph: "tv" } };
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
      ...ROLE_IDS.flatMap((a) => ROLE_IDS.filter((b) => b !== a && inSameRoom(solution[a], solution[b])).map((b) => ({ type: "sameRoom", a, b, text: `${roleName(a)} estaba en la misma habitacion que ${roleName(b)}.` } as Constraint))),
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
    if (countSolutions([...ROLE_IDS], candidateMap, constraints, objectCells, victimPos, murdererId) !== 1) continue;

    return {
      level,
      suspects,
      victimName,
      victimPos,
      murdererId,
      roomLabels,
      objectDefs,
      objectCells,
      blockedSet,
      constraints,
      templateId: `T${TEMPLATE_LIBRARY.indexOf(template) + 1}`,
      solution
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
  blockedSet: new Set(stored.blocked)
});
const pickPaywallVariant = (): PaywallVariant => {
  const existing = window.localStorage.getItem(PAYWALL_KEY) as PaywallVariant | null;
  if (existing === "one_time" || existing === "subscription") return existing;
  const picked: PaywallVariant = Math.random() < 0.5 ? "one_time" : "subscription";
  window.localStorage.setItem(PAYWALL_KEY, picked);
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

function App() {
  const [level, setLevel] = useState(1);
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
  const [paywallVariant, setPaywallVariant] = useState<PaywallVariant>("one_time");

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as StoredState;
      if (!saved?.gameCase || !(saved.gameCase as any).solution) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setLevel(saved.level);
      setGameCase(fromStoredCase(saved.gameCase));
      setSelectedSuspect(saved.selectedSuspect);
      setPlacements(saved.placements);
      setSelectedKillerId(saved.selectedKillerId);
      setResult(saved.result);
      setShowUpgrade(saved.showUpgrade);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const done = window.localStorage.getItem(TUTORIAL_KEY) === "1";
    if (!done) setTutorialStep(1);
    setPaywallVariant(pickPaywallVariant());
    trackFunnelEvent("app_open");
  }, []);

  useEffect(() => {
    const payload: StoredState = {
      level,
      gameCase: toStoredCase(gameCase),
      selectedSuspect,
      placements,
      selectedKillerId,
      result,
      showUpgrade
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [level, gameCase, selectedSuspect, placements, selectedKillerId, result, showUpgrade]);

  const allOccupied = useMemo(() => Object.values(placements).map(keyOf), [placements]);
  const murdererName = gameCase.suspects.find((s) => s.id === gameCase.murdererId)?.name ?? "???";
  const revealPlacementFeedback = allOccupied.length === gameCase.suspects.length;
  const clueStatus = useMemo(
    () =>
      gameCase.constraints.map((c) => ({
        clue: c,
        state: evaluateConstraintPartial(c, placements, gameCase.objectCells) as boolean | null
      })),
    [gameCase.constraints, placements, gameCase.objectCells]
  );
  const solvedClues = clueStatus.filter((x) => x.state === true).length;
  const violatedClues = clueStatus.filter((x) => x.state === false).length;

  const placeSuspectAt = (suspectId: string, pos: Pos) => {
    if (gameCase.blockedSet.has(keyOf(pos)) || samePos(pos, gameCase.victimPos)) return;
    const next = { ...placements };
    if (next[suspectId] && samePos(next[suspectId], pos)) {
      delete next[suspectId];
      setPlacements(next);
      setResult("Sospechoso retirado.");
      trackFunnelEvent("suspect_removed");
      return;
    }
    delete next[suspectId];
    const target = Object.entries(next).find(([, p]) => samePos(p, pos));
    if (target) delete next[target[0]];
    if (Object.values(next).some((p) => p.r === pos.r || p.c === pos.c)) {
      setResult("No puede haber dos sospechosos en la misma fila o columna.");
      trackFunnelEvent("placement_blocked");
      return;
    }
    next[suspectId] = pos;
    setPlacements(next);
    trackFunnelEvent("suspect_placed");
    setLastPlacedCell(keyOf(pos));
    setLaserPulse({ row: pos.r, col: pos.c });
    setTimeout(() => setLastPlacedCell(""), 320);
    setTimeout(() => setLaserPulse(null), 430);
  };
  const placeSelected = (pos: Pos) => placeSuspectAt(selectedSuspect, pos);

  const validatePlacement = () => {
    if (Object.keys(placements).length !== gameCase.suspects.length) return false;
    const vals = Object.values(placements);
    if (new Set(vals.map((p) => p.r)).size !== vals.length) return false;
    if (new Set(vals.map((p) => p.c)).size !== vals.length) return false;
    if (!gameCase.constraints.every((c) => evaluateConstraint(c, placements, gameCase.objectCells))) return false;
    const sameVictimRoom = Object.entries(placements).filter(([, p]) => inSameRoom(p, gameCase.victimPos));
    return sameVictimRoom.length === 1 && sameVictimRoom[0][0] === gameCase.murdererId;
  };

  const solveCase = () => {
    trackFunnelEvent("solve_clicked");
    if (validatePlacement() && selectedKillerId === gameCase.murdererId) {
      setResult(`Caso resuelto. El asesino es ${murdererName}.`);
      setShowUpgrade(true);
      trackFunnelEvent("case_solved");
      trackFunnelEvent("paywall_shown");
      setSolvedFx(true);
      setTimeout(() => setSolvedFx(false), 950);
    } else {
      setResult("Todavia no cuadra. Revisa pistas y posicionamiento.");
      trackFunnelEvent("solve_failed");
    }
  };

  const resetCase = () => {
    const fresh = generateCase(level);
    setGameCase(fresh);
    setSelectedSuspect(fresh.suspects[0].id);
    setPlacements({});
    setSelectedKillerId("");
    setShowUpgrade(false);
    setResult("Nuevo intento.");
    setSolvedFx(false);
    trackFunnelEvent("case_reset");
  };

  const nextCase = () => {
    const nextLevel = level + 1;
    const generated = generateCase(nextLevel);
    setLevel(nextLevel);
    setGameCase(generated);
    setSelectedSuspect(generated.suspects[0].id);
    setPlacements({});
    setSelectedKillerId("");
    setShowUpgrade(false);
    setResult(`Caso ${nextLevel}. Dificultad ${nextLevel <= 2 ? "baja" : nextLevel <= 5 ? "media" : "alta"}.`);
    setSolvedFx(false);
    trackFunnelEvent("next_case");
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#090909] via-[#12100b] to-[#0a0a0a] px-3 py-4 text-[#f4e7c2]">
      <section className="mx-auto flex w-full max-w-md flex-col gap-3">
        <header className="rounded-3xl border-2 border-[#b08a3c] bg-gradient-to-b from-[#1b1710] to-[#0f0d09] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
          <h1 className="title-glow text-center text-3xl font-black text-[#f7d27a]">ASE DOKU</h1>
          <p className="mt-1 text-center text-xs text-[#dfc88c]">Caso {level} · Plantilla {gameCase.templateId}</p>
        </header>

        <section className="rounded-2xl border-2 border-[#8b6c2a] bg-[#12100c] p-3 shadow-sm">
          <h3 className="mb-2 text-lg font-black">Instrucciones</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs text-[#dfc88c]">
            <li>Selecciona un sospechoso de la fila y colocalo en el tablero.</li>
            <li>No puede haber dos sospechosos en la misma fila o columna.</li>
            <li>Usa las pistas para deducir posiciones.</li>
            <li>El asesino es quien queda solo con la victima en su habitacion.</li>
            <li>Selecciona el asesino y pulsa "Resolver caso".</li>
          </ul>
        </section>

        <section className="rounded-2xl border-2 border-[#8b6c2a] bg-[#12100c] p-3 shadow-sm">
          <h3 className="mb-2 text-lg font-black">Pistas</h3>
          <div className="mb-2 grid grid-cols-2 gap-2 text-[11px]">
            <p className="rounded bg-[#19150f] p-1 text-[#9df2a3]">Cumplidas: {solvedClues}/{gameCase.constraints.length}</p>
            <p className="rounded bg-[#19150f] p-1 text-[#ff9aa2]">En conflicto: {violatedClues}</p>
          </div>
          <ul className="max-h-40 space-y-1 overflow-auto text-xs text-[#dfc88c]">
            {clueStatus.map(({ clue, state }, idx) => (
              <li key={`${clue.text}-${idx}`} className="rounded bg-[#19150f] p-2">
                <span
                  className={`mr-2 inline-block rounded px-1 text-[10px] font-bold ${
                    state === true ? "bg-emerald-700 text-emerald-100" : state === false ? "bg-rose-700 text-rose-100" : "bg-slate-700 text-slate-200"
                  }`}
                >
                  {state === true ? "OK" : state === false ? "X" : "..."}
                </span>
                {clue.text}
              </li>
            ))}
            <li className="rounded bg-[#19150f] p-2">La victima estaba sola con el asesino en su misma habitacion.</li>
          </ul>
        </section>

        <section className="rounded-2xl border-2 border-[#8b6c2a] bg-[#12100c] p-2 shadow-sm">
          <h3 className="mb-2 text-lg font-black">Sospechosos</h3>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {gameCase.suspects.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSuspect(s.id)}
                draggable
                onDragStart={() => setDraggedSuspectId(s.id)}
                onDragEnd={() => setDraggedSuspectId(null)}
                className={`w-[56px] shrink-0 rounded-lg border-2 p-1 text-center ${selectedSuspect === s.id ? "border-[#d5ab55] bg-[#2c2110]" : "border-[#4b3b1b] bg-[#19150f]"}`}
              >
                <img src={portraitSrc(s.name, s.color)} alt={s.name} className="mx-auto h-10 w-9 rounded border border-slate-700 object-cover" />
                <p className="mt-1 truncate text-[10px] font-bold leading-tight">{s.name}</p>
              </button>
            ))}
            <div className="w-[56px] shrink-0 rounded-lg border-2 border-[#7a2e2e] bg-[#2a1313] p-1 text-center">
              <p className="truncate text-[10px] font-bold">{gameCase.victimName}</p>
              <p className="text-[9px] text-[#dfc88c]">Victima</p>
            </div>
          </div>
        </section>

        <section className={`rounded-2xl border-2 border-[#8b6c2a] bg-[#12100c] p-3 shadow-sm ${solvedFx ? "solved-glow" : ""}`}>
          <h3 className="mb-2 text-lg font-black">Escena del crimen</h3>
          <div className="grid grid-cols-6 gap-[2px] rounded border-4 border-[#090909] bg-gradient-to-b from-[#111] to-[#050505] p-[2px] shadow-[inset_0_0_0_2px_rgba(255,215,125,0.2),0_14px_22px_rgba(0,0,0,0.45)]">
            {Array.from({ length: 36 }).map((_, i) => {
              const r = Math.floor(i / 6);
              const c = i % 6;
              const cell = { r, c };
              const room = roomOf(cell);
              const roomColor = room === "Lab" ? "bg-[#00b7ff]" : room === "Storage" ? "bg-[#ffb300]" : room === "Office" ? "bg-[#31d46d]" : "bg-[#8a63ff]";
              const roomTexture = room === "Lab" ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.30) 0 3px, rgba(255,255,255,0.06) 3px 8px)" : room === "Storage" ? "repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0 2px, rgba(255,255,255,0.18) 2px 10px)" : room === "Office" ? "linear-gradient(135deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.08) 35%, rgba(0,0,0,0.10) 100%)" : "repeating-linear-gradient(0deg, rgba(255,255,255,0.24) 0 1px, rgba(255,255,255,0.08) 1px 9px)";
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
              const topWall = r === 0 || BOARD.roomByCell[r - 1][c] !== room;
              const rightWall = c === BOARD.cols - 1 || BOARD.roomByCell[r][c + 1] !== room;
              const bottomWall = r === BOARD.rows - 1 || BOARD.roomByCell[r + 1][c] !== room;
              const leftWall = c === 0 || BOARD.roomByCell[r][c - 1] !== room;
              return (
                <button
                  key={i}
                  onClick={() => placeSelected(cell)}
                  onDragOver={(e) => {
                    if (!objectKey && !isVictim) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    placeSuspectAt(draggedSuspectId ?? selectedSuspect, cell);
                  }}
                  className={`relative h-12 transition-all duration-200 ${roomColor} ${objectKey ? "opacity-60" : ""} ${
                    isLaserBlocked && !suspectObj ? "shadow-[inset_0_0_0_2px_rgba(220,38,38,0.65)]" : ""
                  } ${isLastPlaced ? "ring-2 ring-emerald-300 scale-[1.03]" : ""}`}
                  style={{ backgroundImage: roomTexture }}
                >
                  {topWall && <span className="pointer-events-none absolute left-0 right-0 top-0 h-[3px] bg-[#0b0b0b]" />}
                  {rightWall && <span className="pointer-events-none absolute bottom-0 right-0 top-0 w-[3px] bg-[#0b0b0b]" />}
                  {bottomWall && <span className="pointer-events-none absolute bottom-0 left-0 right-0 h-[3px] bg-[#0b0b0b]" />}
                  {leftWall && <span className="pointer-events-none absolute bottom-0 left-0 top-0 w-[3px] bg-[#0b0b0b]" />}
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
                  {objectKey && <span className="absolute inset-0 flex items-center justify-center">{objectGlyph(gameCase.objectDefs[objectKey].glyph)}</span>}
                  {isVictim && <span className="absolute inset-0"><span className="absolute inset-0 rounded-[2px] border-2 border-[#f43f5e] bg-[#2b0e15]/60 shadow-[0_0_10px_rgba(244,63,94,0.5)]" /><span className="absolute left-1/2 top-[45%] h-2 w-2 -translate-x-1/2 rounded-full bg-[#ff5a7a]" /><span className="absolute left-1/2 top-[55%] h-4 w-[6px] -translate-x-1/2 rounded-sm bg-[#ff5a7a]" /><span className="absolute left-[35%] top-[58%] h-[3px] w-3 rotate-45 rounded bg-[#ff5a7a]" /><span className="absolute right-[35%] top-[58%] h-[3px] w-3 -rotate-45 rounded bg-[#ff5a7a]" /><span className="absolute left-[35%] bottom-[20%] h-[3px] w-3 -rotate-45 rounded bg-[#ff5a7a]" /><span className="absolute right-[35%] bottom-[20%] h-[3px] w-3 rotate-45 rounded bg-[#ff5a7a]" /></span>}
                  {suspectObj && (
                    <span
                      className={`absolute inset-0.5 rounded border-2 p-0.5 ${
                        isCorrectSpot ? "border-emerald-300 bg-emerald-100/80" : isWrongSpot ? "border-rose-300 bg-rose-100/80" : "border-slate-900 bg-white/80"
                      }`}
                    >
                      <span className="flex h-full flex-col items-center justify-center rounded border border-white/70 bg-white/85 px-0.5">
                        <img src={portraitSrc(suspectObj.name, suspectObj.color)} alt={suspectObj.name} className="h-7 w-6 rounded object-cover" />
                        <span className="mt-0.5 text-[7px] font-extrabold leading-tight text-slate-900">{suspectObj.name}</span>
                      </span>
                      {isCorrectSpot && <span className="heart-pop absolute right-0 top-0 text-xs">💚</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-bold">
            <span className="rounded border border-[#0c6f98] bg-[#0f2f40] px-2 py-1 text-center text-[#8fe2ff]">{gameCase.roomLabels.Lab}</span>
            <span className="rounded border border-[#a06f00] bg-[#3d2c05] px-2 py-1 text-center text-[#ffd47a]">{gameCase.roomLabels.Storage}</span>
            <span className="rounded border border-[#1f8d45] bg-[#102e1a] px-2 py-1 text-center text-[#95f2b4]">{gameCase.roomLabels.Office}</span>
            <span className="rounded border border-[#5b3aa8] bg-[#21153f] px-2 py-1 text-center text-[#cfb9ff]">{gameCase.roomLabels.Freezer}</span>
          </div>
        </section>

        <section className="rounded-2xl border-2 border-[#8b6c2a] bg-[#12100c] p-3 shadow-sm">
          <h3 className="text-lg font-black">El asesino es...</h3>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {gameCase.suspects.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedKillerId(s.id)}
                className={`w-[56px] shrink-0 rounded-lg border p-1 text-center ${selectedKillerId === s.id ? "border-[#d5ab55] bg-[#2c2110]" : "border-[#4b3b1b] bg-[#19150f]"}`}
              >
                <img src={portraitSrc(s.name, s.color)} alt={s.name} className="mx-auto h-10 w-8 rounded object-cover" />
                <p className="mt-1 text-[10px] font-bold">{s.name}</p>
              </button>
            ))}
          </div>
          <button onClick={solveCase} className="mt-3 w-full rounded-lg bg-[#d5ab55] px-4 py-2 text-sm font-bold text-[#1a1408] shadow">Resolver caso</button>
          <div className="mt-2 flex gap-2">
            <button onClick={resetCase} className="rounded-lg border border-[#8b6c2a] bg-[#19150f] px-3 py-2 text-xs font-semibold text-[#f4e7c2]">Reiniciar caso</button>
            <button onClick={shareResult} className="rounded-lg border border-[#8b6c2a] bg-[#19150f] px-3 py-2 text-xs font-semibold text-[#f4e7c2]">Compartir</button>
            <p className="text-xs leading-5">{result}</p>
          </div>
          <p className="mt-2 text-[11px] text-[#dfc88c]">Seleccionado: {gameCase.suspects.find((s) => s.id === selectedSuspect)?.name}</p>
          <p className="text-[11px] text-[#dfc88c]">Colocados: {allOccupied.length} / {gameCase.suspects.length}</p>
          <p className="text-[11px] text-[#dfc88c]">Tip: tambien puedes arrastrar sospechosos al tablero.</p>
        </section>
      </section>

      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-sm rounded-2xl border-2 border-violet-400 bg-gradient-to-b from-[#2a1351] to-[#1a1033] p-4 text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-violet-200">Caso completado</p>
            <h3 className="mt-1 text-2xl font-black">Desbloquea ASE DOKU completo</h3>
            <ul className="mt-3 space-y-1 text-sm text-violet-100">
              <li>- Plantillas logicas multiples (10+)</li>
              <li>- Relacion/objeto/habitacion procedimental</li>
              <li>- Dificultad progresiva y casos infinitos</li>
            </ul>
            {paywallVariant === "one_time" ? (
              <button
                onClick={() => {
                  setResult("Checkout pago unico (demo).");
                  trackFunnelEvent("paywall_click_one_time");
                }}
                className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-slate-900"
              >
                Desbloquear para siempre - 4,99 EUR
              </button>
            ) : (
              <button
                onClick={() => {
                  setResult("Checkout suscripcion (demo).");
                  trackFunnelEvent("paywall_click_subscription");
                }}
                className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-extrabold text-slate-900"
              >
                Prueba 3 dias - 3,99 EUR/mes
              </button>
            )}
            <p className="mt-2 text-center text-[11px] text-violet-100">Variante A/B: {paywallVariant === "one_time" ? "Pago unico" : "Suscripcion"}</p>
            <button onClick={nextCase} className="mt-2 w-full rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-[#0f172a]">Jugar siguiente caso</button>
            <button onClick={() => setShowUpgrade(false)} className="mt-2 w-full rounded-xl border border-violet-300/60 px-4 py-2 text-xs font-semibold">Ahora no</button>
          </div>
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

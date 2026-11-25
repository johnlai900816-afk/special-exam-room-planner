/* 排課（舊版 app.js 的「排課」：① 開課 ② 編組 ③ 排課表 ④ 輸出）的純邏輯，全部在舊格式 D 上做。
   新版的寫入一律：planOnD(records, fn, SCHED_COLS) 在 toCoreD(records) 的副本上跑這裡的函式 → splitD 比對 → Repo.batch（每份帶 rev）。

   草稿與版本照 functions/nx-split.js（和舊版 D.sched 一樣的形狀）：
     D.sched.draft = {a: packAssign, label, at, seed}   →  versions/draft（只有管理者／編輯讀寫）
     D.sched.vers  = [{a, label, at}]（最多 VERMAX 份）   →  versions/v000…
     其他 D.sched 欄位                                    →  staff/sched
     D.assign（正式課表）                                 →  groups/{gid}.slots
     D.lockLog（確定時記一筆，最多 50 筆）                →  lockLog/L000…；D.lockLast → 學期文件 packed.lockLast
   草稿只寫 versions/draft，不動 groups.slots；「確定採用」才把草稿寫進 groups.slots、加一個版本、記一筆鎖課異動（同一批）。

   每個函式都對照舊版的同名函式（trySolve、confirmDraftOk、restoreVer、moveLesson…），行為一樣；
   差別只有：不碰畫面、時間與使用者由呼叫的人給（測試可以重現）。test/sched.test.ts 用舊版 app.js 的原始碼比對。 */
import { CORE, type Model, type Problem, type SolveState } from "../core";
import type { AssignEntry, RcData, Student } from "../types";
import { CORE_COLS } from "./apply";

// core.js 還有很多函式沒有寫型別（lib/core.ts 只補了新版先用到的）；這裡用到的照舊版的呼叫方式
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...a: any[]) => any;
export const X = CORE as unknown as Record<string, AnyFn>;

/** 排課會改到的集合：排課核心＋版本（草稿）＋鎖課紀錄 */
export const SCHED_COLS: string[] = [...CORE_COLS, "versions", "lockLog"];
export const VERMAX = 6;

export type Packed = Record<string, string>;
export interface DraftBox {
  a: Packed;
  label: string;
  at: number;
  seed?: number;
}
export interface VerBox {
  a: Packed;
  label: string;
  at: number;
}
export interface SchedBox {
  draft?: DraftBox;
  vers: VerBox[];
  [k: string]: unknown;
}

export const GRADE = CORE.GRADE as Record<number, string>;

export function schedBox(D: RcData): SchedBox {
  if (!D.sched || typeof D.sched !== "object") D.sched = {};
  const s = D.sched as SchedBox;
  if (!Array.isArray(s.vers)) s.vers = [];
  return s;
}
export function hasDraft(D: RcData): boolean {
  const s = D.sched as SchedBox | undefined;
  return !!(s && s.draft && s.draft.a);
}
export function draftOf(D: RcData): DraftBox | null {
  return hasDraft(D) ? (D.sched as SchedBox).draft! : null;
}
export function versOf(D: RcData): VerBox[] {
  const s = D.sched as SchedBox | undefined;
  return s && Array.isArray(s.vers) ? s.vers : [];
}
export function draftState(M: Model, D: RcData): SolveState {
  return CORE.toState(M, { ...D, assign: X.unpackAssign((D.sched as SchedBox).draft!.a) });
}
/** 舊版 setST：沒有 rfix 就補 -1，M.lroom 指向這份排法自己指定的教室 */
export function setST(M: Model, S: SolveState): SolveState {
  if (!S.rfix) S.rfix = new Int16Array(M.L.length).fill(-1);
  M.lroom = S.rfix;
  return S;
}
/** 排課板看的是哪一份：有草稿時看草稿，其他頁一律正式課表（舊版 syncST） */
export function stateOf(M: Model, D: RcData, draft: boolean): SolveState {
  return setST(M, draft && hasDraft(D) ? draftState(M, D) : CORE.toState(M, D));
}

export function fmtTime(t: number): string {
  const d = new Date(t),
    p = (n: number) => String(n).padStart(2, "0");
  return d.getMonth() + 1 + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
export function placedOf(p: Packed | undefined): number {
  let n = 0;
  for (const id in p || {})
    String(p![id])
      .split(",")
      .forEach((e) => {
        if (e && e[0] !== "*" && e[0] !== "@") n++;
      });
  return n;
}
export function writeDraft(D: RcData, a: Record<string, AssignEntry[]>, label: string, seed: number | undefined, at: number): void {
  const box = schedBox(D);
  box.draft = { a: X.packAssign(a), label: String(label || "試排"), at };
  if (seed) box.draft.seed = seed;
}

export interface Stats {
  placed: number;
  un: number;
  probs: number;
  cost: number;
  soft: number;
  locks: { pulled: number; open: number } | null;
}
export interface Compare {
  main: Stats;
  draft: Stats;
  moved: number;
  movedL: number[];
  total: number;
  label: string;
  at: number;
}
/** 正式課表和草稿並排比較（舊版 draftCompare） */
export function draftCompare(M: Model, D: RcData): Compare | null {
  if (!hasDraft(D)) return null;
  const A = CORE.toState(M, D),
    B = draftState(M, D),
    movedL: number[] = [];
  for (let l = 0; l < M.L.length; l++) if (A.slot[l] !== B.slot[l]) movedL.push(l);
  const d = (D.sched as SchedBox).draft!;
  return { main: X.schedStats(M, A.slot, A.rfix), draft: X.schedStats(M, B.slot, B.rfix), moved: X.schedDiff(A.slot, B.slot), movedL, total: M.L.length, label: d.label, at: d.at };
}

/** 檢視：''＝全部、'g:7'＝只看只排七年級、老師 id＝只看那位老師 */
export function shownL(M: Model, view: string, l: number): boolean {
  if (!view) return true;
  const g = M.G[M.L[l].g] as Model["G"][number] & { grades: number[] };
  if (view.slice(0, 2) === "g:") return g.grades.includes(+view.slice(2));
  const ti = M.tIdx[view];
  return ti == null || g.t === ti || g.locks.some((k) => k.t === ti);
}

export type SolveMode = "try" | "again" | "all";
export const MODE_LABEL: Record<SolveMode, string> = { try: "試排", again: "重排", all: "全部重排" };

/** 求解時的接點：進度、拿到目前最好的排法（Web Worker 用來「停止並保留目前最好的」） */
export interface SolveHooks {
  /** 包住 core.solve（預設直接呼叫） */
  solve?: (M: Model, S: SolveState, opt: { seed: number; only: ((l: number) => boolean) | null }, phase: number) => SolveState;
  /** 第幾段：0 求解、1 編組後再解、2 原班鎖課微調 */
  phase?: (p: number) => void;
}
export interface TryResult {
  seed: number;
  placed: number;
  left: number;
  label: string;
  /** 被停止時沒有做完的後段（編組、鎖課微調） */
  stopped?: boolean;
}

/**
 * 一鍵試排／重排／全部重排（舊版 trySolve）：從草稿（沒有就從正式課表）出發排一份新的草稿，不動正式課表。
 * 「待安排」的學生照樣編進課裡（名冊資料）。D 會被改：settings.seed、groups 的學生、sched.draft。
 * confirm（全部重排會連固定的也重排）由畫面先問。
 */
export function trySolveD(D: RcData, mode: SolveMode, view: string, at: number, hooks?: SolveHooks): TryResult {
  let M = CORE.compile(D);
  const part = view.slice(0, 2) === "g:",
    gv = part ? +view.slice(2) : 0;
  const only = part ? (l: number) => shownL(M, view, l) : null;
  const base = stateOf(M, D, true);
  if (mode === "all") base.pin.forEach((x, l) => {
    if (!part || only!(l)) base.pin[l] = 0;
  });
  D.settings.seed = ((D.settings.seed as number) || 1) + 1;
  const seed = D.settings.seed as number;
  const sv = hooks?.solve || ((m: Model, s: SolveState, o: { seed: number; only: ((l: number) => boolean) | null }) => CORE.solve(m, s, o as never));
  const run = (S: SolveState, ph: number): SolveState => {
    M.lroom = S.rfix;
    const R = sv(M, S, { seed, only }, ph);
    return { slot: R.slot, pin: S.pin, rfix: S.rfix };
  };
  hooks?.phase?.(0);
  let S = run(base, 0);
  let pl: { placed: number; left: unknown[] } | null = null;
  if (X.needList(D).length) {
    const a = CORE.fromState(M, S);
    pl = X.placeStudents({ ...D, assign: a }, gv ? { filter: (s: Student) => CORE.gradeOfCls(s.cls) === gv } : null);
    if (pl!.placed) {
      M = CORE.compile(D);
      S = CORE.toState(M, { ...D, assign: a });
      M.lroom = S.rfix;
      CORE.evaluate(M, S.slot);
      if (M.viol) {
        hooks?.phase?.(1);
        S = run(S, 1);
      }
    }
  }
  if (M.flex) {
    hooks?.phase?.(2);
    M.lroom = S.rfix;
    const R2 = X.refineLocks(M, S, { only });
    S = { slot: R2.slot, pin: S.pin, rfix: S.rfix };
  }
  const label = MODE_LABEL[mode] + (part ? "（" + GRADE[gv] + "）" : "") + " " + fmtTime(at);
  writeDraft(D, CORE.fromState(M, S), label, seed, at);
  return { seed, placed: pl ? pl.placed : 0, left: pl ? pl.left.length : 0, label };
}

/** 被停止時：拿目前最好的時段直接放進草稿（後面的編組與鎖課微調不做） */
export function stoppedDraftD(D: RcData, mode: SolveMode, view: string, slot: ArrayLike<number>, seed: number, at: number): TryResult {
  const M = CORE.compile(D);
  const base = stateOf(M, D, true);
  const part = view.slice(0, 2) === "g:";
  if (mode === "all") base.pin.forEach((x, l) => {
    if (!part || shownL(M, view, l)) base.pin[l] = 0;
  });
  const S: SolveState = { slot: Int16Array.from(slot), pin: base.pin, rfix: base.rfix };
  D.settings.seed = seed;
  const label = MODE_LABEL[mode] + (part ? "（" + GRADE[+view.slice(2)] + "）" : "") + "（停止） " + fmtTime(at);
  writeDraft(D, CORE.fromState(M, S), label, seed, at);
  return { seed, placed: 0, left: 0, label, stopped: true };
}

/** 草稿排好之後的一句話（舊版 trySolve 的 toast） */
export function tryToast(D: RcData, r: TryResult): string {
  const M = CORE.compile(D);
  const c = draftCompare(M, D);
  if (!c) return "";
  const pm = r.placed ? "；把 " + r.placed + " 人次的學生編進課裡" : "";
  return "草稿排好了：" + (c.draft.probs ? "還有 " + c.draft.probs + " 個衝突" : "沒有衝突") + "，和正式課表比換了 " + c.moved + " 節" + pm + "。滿意了按「確定採用」";
}

/** 把一份排法寫回：看的是草稿就寫草稿，不然寫正式課表（舊版 commit） */
export function commitD(D: RcData, M: Model, S: SolveState, onDraft: boolean): void {
  if (onDraft && hasDraft(D)) (D.sched as SchedBox).draft!.a = X.packAssign(CORE.fromState(M, S));
  else D.assign = CORE.fromState(M, S);
}

/** 排課板上的一個動作：在 D 上重建 M 與目前看的那一份，改完寫回（拖曳、固定、教室、拿下來…） */
export function boardEdit(D: RcData, onDraft: boolean, fn: (M: Model, S: SolveState) => boolean | void): boolean {
  const M = CORE.compile(D);
  const draft = onDraft && hasDraft(D);
  const S = stateOf(M, D, draft);
  if (fn(M, S) === false) return false;
  commitD(D, M, S, draft);
  return true;
}

/** 移到時段 s（-1＝拿下來）；放下就固定（舊版 moveLesson）。回傳這一格有沒有衝突 */
export function moveLessonD(D: RcData, onDraft: boolean, l: number, s: number): { bad: boolean } {
  let bad = false;
  boardEdit(D, onDraft, (M, S) => {
    if (S.slot[l] === s) return false;
    bad = s >= 0 && !CORE.canPlace(M, S.slot, l, s);
    S.slot[l] = s;
    S.pin[l] = s >= 0 ? 1 : 0;
  });
  return { bad };
}
export function togglePinD(D: RcData, onDraft: boolean, l: number): void {
  boardEdit(D, onDraft, (M, S) => {
    if (S.slot[l] < 0) return false;
    S.pin[l] = S.pin[l] ? 0 : 1;
  });
}
export function setRoomD(D: RcData, onDraft: boolean, l: number, r: number): void {
  boardEdit(D, onDraft, (M, S) => {
    S.rfix![l] = r;
  });
}
export function unpinAllD(D: RcData, onDraft: boolean): void {
  boardEdit(D, onDraft, (M, S) => {
    S.pin.fill(0);
  });
}
export function clearAllD(D: RcData, onDraft: boolean): void {
  boardEdit(D, onDraft, (M, S) => {
    S.slot.fill(-1);
    S.pin.fill(0);
    S.rfix!.fill(-1);
  });
}

/** 舊版 pushUndo／undo：正式課表、草稿、每門課的學生 */
export interface UndoSnap {
  a: RcData["assign"];
  d: DraftBox | null;
  m: [string, string[]][];
}
export function undoSnap(D: RcData): UndoSnap {
  return JSON.parse(JSON.stringify({ a: D.assign, d: (D.sched && (D.sched as SchedBox).draft) || null, m: D.groups.map((g) => [g.id, g.students]) }));
}
export function undoApply(D: RcData, u: UndoSnap): void {
  D.assign = u.a;
  if ("d" in u) {
    if (u.d) schedBox(D).draft = u.d;
    else if (D.sched) delete (D.sched as SchedBox).draft;
  }
  u.m.forEach(([id, st]) => {
    const g = D.groups.find((x) => x.id === id);
    if (g) g.students = st;
  });
}

/** 確定採用（舊版 confirmDraftOk）＋鎖課異動紀錄（extras.js onScheduleConfirmed → recordLocks）。回傳版本名稱 */
export function confirmDraftD(D: RcData, name: string, at: number, by: string): { name: string; lock: LockEntry | null } {
  if (!hasDraft(D)) throw new Error("沒有草稿");
  const box = schedBox(D),
    d = box.draft!;
  name = String(name || "").trim() || d.label;
  // 現在的正式課表如果不在版本清單裡（例如功能上線前排的、或之後手動改過），先留一份
  const cur = X.packAssign(D.assign) as Packed,
    last = box.vers[box.vers.length - 1];
  if (placedOf(cur) && (!last || JSON.stringify(last.a) !== JSON.stringify(cur))) box.vers.push({ a: cur, label: "確定前的課表", at });
  D.assign = X.unpackAssign(d.a);
  box.vers.push({ a: d.a, label: name, at });
  box.vers = box.vers.slice(-VERMAX);
  delete box.draft;
  const lock = recordLocksD(D, name, by, at);
  return { name, lock };
}

export interface LockItem {
  cls: string;
  k: string;
  sj: string;
  t: string;
}
export interface LockEntry {
  at: number;
  by: string;
  label: string;
  added: LockItem[];
  removed: LockItem[];
  n: number;
  first?: boolean;
  sentAt?: number;
}
/** extras.js recordLocks：和上次確定時的鎖課（D.lockLast）比，記一筆 D.lockLog。label＝null 是「記錄目前的鎖課」 */
export function recordLocksD(D: RcData, label: string | null, by: string, at: number): LockEntry {
  const M = CORE.compile(D),
    S = CORE.toState(M, D);
  if (!D.lockLast) {
    const v = versOf(D),
      pv = v[v.length - 2];
    if (pv && pv.a && label != null)
      try {
        const S0 = CORE.toState(M, { ...D, assign: X.unpackAssign(pv.a) });
        D.lockLast = { at: pv.at || 0, list: X.lockPack(X.lockList(M, S0.slot)) };
      } catch {
        /* 舊版也是略過 */
      }
  }
  return X.lockLogAdd(D, X.lockList(M, S.slot), { label: label == null ? "目前的課表" : label, by: by || "本機", at }) as LockEntry;
}

export function discardDraftD(D: RcData): void {
  if (D.sched) delete (D.sched as SchedBox).draft;
}
/** 已確定的版本拿回草稿（舊版 restoreVer） */
export function restoreVerD(D: RcData, i: number, at: number): string | null {
  const v = schedBox(D).vers[i];
  if (!v) return null;
  writeDraft(D, X.unpackAssign(v.a), "拿回：" + v.label, undefined, at);
  return v.label;
}

/** 外部（AI）的排法放進草稿（舊版 setDraft；x＝和 M.L 對齊的時段陣列） */
export function setDraftD(D: RcData, x: ArrayLike<number | string | null>, label: string, at: number, pin?: ArrayLike<number>): void {
  const M = CORE.compile(D);
  const base = CORE.toState(M, D),
    n = M.L.length;
  const S: SolveState = { slot: new Int16Array(n).fill(-1), pin: new Uint8Array(n), rfix: base.rfix };
  for (let l = 0; l < n; l++) {
    const v = x[l];
    let s = typeof v === "string" ? (v ? M.key2s(v) : -1) : v == null ? -1 : +v;
    if (!(s >= 0 && s < M.NS)) s = -1;
    S.slot[l] = s;
    S.pin[l] = s < 0 ? 0 : pin ? (pin[l] ? 1 : 0) : base.pin[l] && base.slot[l] === s ? 1 : 0;
  }
  writeDraft(D, CORE.fromState(M, S), label || "外部排法", undefined, at);
}

/* ───── ② 編組 ───── */
/** 舊版 setNeed：學生這一科改去哪一門（''＝不上、'?'＝待安排） */
export function setNeedD(D: RcData, sid: string, sj: string, v: string): void {
  const s = D.students.find((x) => x.id === sid);
  if (!s) return;
  D.groups.forEach((g) => {
    if (g.subject === sj) g.students = g.students.filter((id) => id !== s.id);
  });
  s.needs = (s.needs || []).filter((x) => x !== sj);
  if (v) {
    s.needs.push(sj);
    const g = D.groups.find((x) => x.id === v);
    if (g) g.students.push(s.id);
  }
}
/** 舊版 autoPlace：把待安排的學生編進課裡 */
export function autoPlaceD(D: RcData): { placed: number; left: { id: string; subject: string }[] } {
  return X.placeStudents(D);
}

/* ───── ① 開課 ───── */
export function setGroupD(D: RcData, gid: string, k: string, v: unknown): RcData {
  const g = D.groups.find((x) => x.id === gid);
  if (!g) return D;
  (g as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
  return CORE.normalize(D);
}
export function addGroupD(D: RcData, tid: string): string {
  const id = CORE.uid("g");
  D.groups.push({ id, name: "新的課", subject: "國文", teacher: tid || "", per: 3, students: [], mode: "抽離", room: "", on: true, grade: "" } as RcData["groups"][number]);
  return id;
}
export function delGroupD(D: RcData, gid: string): void {
  D.groups = D.groups.filter((g) => g.id !== gid);
}
/** 舊版 togGS：學生從課裡拿掉或加入；拿掉後這一科已經沒有課時回傳要問的（不上／待安排） */
export function toggleGroupStudentD(D: RcData, gid: string, sid: string): { id: string; subject: string }[] {
  const g = D.groups.find((x) => x.id === gid);
  if (!g) return [];
  const k = g.students.indexOf(sid);
  if (k >= 0) {
    g.students.splice(k, 1);
    return dropAsk(D, [{ id: sid, subject: g.subject }]);
  }
  g.students.push(sid);
  return [];
}
export function dropAsk(D: RcData, list: { id: string; subject: string }[]): { id: string; subject: string }[] {
  return list.filter((o) => {
    const s = D.students.find((x) => x.id === o.id);
    return s && (s.needs || []).includes(o.subject) && !D.groups.some((g) => g.subject === o.subject && g.students.includes(o.id));
  });
}
/** askDropOk：不上的就把那一科從 needs 拿掉 */
export function dropNeedsD(D: RcData, drop: { id: string; subject: string }[]): void {
  drop.forEach((o) => {
    const s = D.students.find((x) => x.id === o.id);
    if (s) s.needs = (s.needs || []).filter((x) => x !== o.subject);
  });
}
export function setClassSubjD(D: RcData, key: string, tid: string): void {
  if (tid) D.classSubj[key] = tid;
  else delete D.classSubj[key];
}
/** 舊版 fixOk：課程的固定時段（最多 per 節）；原本固定在別處的放開 */
export function setFixedD(D: RcData, gid: string, ks: string[]): void {
  const g = D.groups.find((x) => x.id === gid);
  if (!g) return;
  if (ks.length) g.fixed = ks;
  else delete g.fixed;
  const a = D.assign && D.assign[g.id];
  if (a)
    a.forEach((e) => {
      if (e && !ks.includes(e.s)) e.pin = false;
    });
}
export function setTeacherHoursD(D: RcData, tid: string, hours: number): void {
  const t = D.teachers.find((x) => x.id === tid);
  if (t) t.hours = +hours || 0;
}

/* ───── 超鐘點：建議分配、認領 ───── */
export interface OtSugItem {
  gid: string;
  name: string;
  subject: string;
  per: number;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  why: string[];
}
export interface OtSug {
  list: OtSugItem[];
  left: { gid: string; name: string; per: number; why: string[] }[];
  rows: { id: string; name: string; due: number; after: number; extra: number; ot: number; limit: number }[];
}
export function suggestOvertimeD(D: RcData, overflow: boolean): OtSug {
  return X.suggestOvertime(D, { overflow });
}
/** 舊版 otSugApply：勾選的才改 */
export function applyOvertimeD(D: RcData, R: OtSug, ids: Set<string>): number {
  let n = 0;
  R.list.forEach((x) => {
    if (!ids.has(x.gid)) return;
    const g = D.groups.find((y) => y.id === x.gid);
    if (!g) return;
    const free = !g.teacher || !D.teachers.some((t) => t.id === g.teacher);
    if ((x.from && g.teacher === x.from) || (!x.from && free)) {
      g.teacher = x.to;
      n++;
    }
  });
  return n;
}

/* ───── 排課板的提示 ───── */
export function probSet(M: Model, slot: Int16Array): Set<string> {
  const o: Problem[] = [];
  CORE.evaluate(M, slot, o);
  return new Set(o.map((x) => x.m));
}
/** 放到 s 會怎樣（舊版 cellInfo）：ok 和 canPlace 同一個判斷，t 是格子上顯示的原因 */
export function cellInfo(D: RcData, M: Model, S: SolveState, l: number, s: number, before: Set<string>): { ok: boolean; t: string } {
  const ok = CORE.canPlace(M, S.slot, l, s),
    o = S.slot[l];
  if (!ok) {
    const r = CORE.why(M, M.L[l].g, s);
    if (r.length) return { ok, t: "不能排：" + r.join("、") };
    S.slot[l] = s;
    const out: Problem[] = [];
    CORE.evaluate(M, S.slot, out);
    S.slot[l] = o;
    const nw = [...new Set(out.filter((x) => x.k !== "un" && !before.has(x.m)).map((x) => x.m.replace(/^[^：]*：/, "")))];
    return { ok, t: "會衝突：" + (nw.length ? nw.slice(0, 3).join("；") : "和別組撞在一起") };
  }
  S.slot[l] = s;
  const rm = CORE.assignRooms(M, S.slot)[l];
  S.slot[l] = o;
  return { ok, t: "可以放，不會衝堂" + (rm >= 0 ? "（" + D.rooms[rm].name + "）" : "") };
}
/** 滑鼠停在組別上：這一節在哪間教室、為什麼不是老師偏好的那間（舊版 roomNote） */
export function roomNote(D: RcData, M: Model, S: SolveState, ROOM: Int16Array | null, l: number): string {
  if (!ROOM || S.slot[l] < 0) return "";
  const r = ROOM[l];
  if (r == null) return "";
  if (r < 0) return "\n教室：這一節沒有空的教室";
  const g = M.G[M.L[l].g],
    pref = M.pref as number[][] | undefined,
    p = g.t >= 0 && pref ? pref[g.t] : [];
  let t = "\n教室：" + D.rooms[r].name;
  if (S.rfix![l] === r || g.room === r) t += "（指定）";
  else if (p.length && p[0] !== r) t += "（偏好的" + D.rooms[p[0]].name + "這一節已經有人用）";
  else if (p.length) t += "（老師偏好）";
  return t;
}
export function colorOf(M: Model, g: { t: number }): number {
  const i = (M.rts as number[]).indexOf(g.t);
  return i < 0 ? 6 : i % 6;
}
export function stuLabel(s: Student): string {
  return s.cls + " " + s.name;
}
export function sortStu(a: Student, b: Student): number {
  return String(a.cls).localeCompare(String(b.cls)) || (+a.seat || 0) - (+b.seat || 0) || String(a.name).localeCompare(String(b.name));
}

/** 排課前的檢查（舊版 preCheck）：任課老師、不排課時段、待安排 */
export function preCheck(D: RcData, M: Model): { cs: number; need: number; off: boolean; pend: number } | null {
  const need = new Set<string>();
  M.G.forEach((g) => {
    if (g.need && g.per) g.cls.forEach((c) => need.add(c + "|" + g.subject));
  });
  const cs = [...need].filter((k) => D.classSubj[k]).length,
    off = D.teachers.some((t) => t.role !== "資源班" && t.off.length) || Object.keys(D.offBy).some((k) => /^[ck]:/.test(k) && D.offBy[k].length),
    pn = X.needList(D).length;
  if (cs === need.size && off && !pn) return null;
  return { cs, need: need.size, off, pend: pn };
}

/* 共用引擎：直接 import repo 根目錄的 core.js（舊系統、node test.js 用的同一份檔案），不複製。
   core.js 結尾是 `if(typeof module!=='undefined')module.exports=CORE;`，打包器把它當 CommonJS 模組處理。
   next.config.ts 把 turbopack.root 設到 repo 根目錄，才解析得到 web/ 以外的檔案。
   這裡只補型別；邏輯一律留在 core.js，新舊版本共用。 */
import CORE_JS from "../../core.js";
import type { Group, Period, RcData, SlotKey, Teacher } from "./types";

/** compile() 之後每一門課的整理結果 */
export interface CompiledGroup {
  gi: number;
  ref: Group;
  name: string;
  subject: string;
  /** 資源班老師在 T 裡的索引，-1＝未指定 */
  t: number;
  /** 學生在 D.students 裡的索引 */
  stu: number[];
  pull: boolean;
  need: boolean;
  cls: string[];
  locks: { c: number; cls: string; t: number }[];
  room: number;
  per: number;
  allowed: Uint8Array;
  alist: number[];
  warn: string[];
}

/** compile(D) 的結果（求解器的模型）。只列新版會用到的欄位 */
export interface Model {
  D: RcData;
  P: Period[];
  NP: number;
  NS: number;
  NT: number;
  T: Teacher[];
  G: CompiledGroup[];
  /** 每一節課：第 g 門課的第 k 節 */
  L: { g: number; k: number }[];
  classes: string[];
  subjects: string[];
  tIdx: Record<string, number>;
  sIdx: Record<string, number>;
  viol: number;
  flex: boolean;
  key2s(k: SlotKey): number;
  s2key(s: number): SlotKey;
  sn(s: number): string;
  [k: string]: unknown;
}

export interface SolveState {
  slot: Int16Array;
  pin: Uint8Array;
  rfix?: Int16Array;
  cost?: number;
  viol?: number;
}

export interface Problem {
  k: string;
  g: number;
  l: number;
  s: number;
  m: string;
}

export interface LockRow {
  cls: string;
  subject: string;
  teacher: string;
  slots: number[];
  groups: string[];
}

export interface CoreApi {
  DAYS: string[];
  ROLES: string[];
  MODES: string[];
  GRADE: Record<number, string>;
  uid(prefix?: string): string;
  defaultData(): RcData;
  emptyData(): RcData;
  normalize(d: unknown): RcData;
  gradeOfCls(cls: string): number;
  compile(d: RcData): Model;
  why(M: Model, gi: number, s: number): string[];
  evaluate(M: Model, slot: Int16Array, out?: Problem[]): number;
  solve(M: Model, S0: SolveState, opt?: { iters?: number; restarts?: number; seed?: number; only?: (l: number) => boolean }): SolveState;
  toState(M: Model, d: RcData): SolveState;
  fromState(M: Model, S: SolveState): RcData["assign"];
  canPlace(M: Model, slot: Int16Array, l: number, s: number): boolean;
  assignRooms(M: Model, slot: Int16Array): Int16Array;
  lockTable(M: Model, slot: Int16Array): LockRow[];
  ttTeachers(tt: RcData["tt"], cls: string, subject: string): string[];
  [k: string]: unknown;
}

export const CORE = CORE_JS as unknown as CoreApi;
export const DAYS = CORE.DAYS;

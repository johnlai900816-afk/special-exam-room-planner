/* IEP 會議時間調查：直接 import repo 根目錄的 iep.js（舊版、node test-iep.js 用的同一份），不複製。
   iep.js 結尾是 module.exports=IEP，和 core.js 一樣被打包器當 CommonJS；檔案後半段的畫面程式碼
   在這個情況下（沒有 window.IEP）會直接 return，不會碰到新版的畫面。
   這裡只補型別；邏輯一律留在 iep.js，新舊版本共用。資料仍是舊格式 D（D.iep.rounds），新版用 toCoreD(records) 組出來。 */
import IEP_JS from "../../iep.js";
import type { RcData, Student } from "./types";

/** 參與者：[pk, 身分, 必要(1/0), 手動加入(1), 改過必要(1)] */
export type Person = [string, string, number, number?, number?];
export interface Meet {
  id: string;
  /** 學生 id */
  s: string;
  p: Person[];
  no: string[];
  /** 排定的時段 key（日期|節次） */
  at?: string;
  room?: string;
  pin?: number;
  sl?: string[];
}
export interface Round {
  id: string;
  name: string;
  kind?: string;
  due: string;
  note: string;
  at: number;
  host?: string;
  quick?: number;
  cdue?: string;
  place?: string;
  d1?: string;
  d2?: string;
  ps?: string[];
  par?: number;
  priv?: string;
  keep?: string;
  slots: [string, string][];
  rooms: string[];
  ppl: Record<string, { n: string; r: string; s: string }>;
  ans: Record<string, Record<string, string>>;
  meets: Meet[];
  web?: Record<string, { at: number; note: string }>;
  tokH?: Record<string, string>;
  pub?: string[];
  pubAt?: number;
  [k: string]: unknown;
}
export interface SlotInfo {
  k: string;
  date: string;
  p: string;
  w: number;
  st: string;
  en: string;
  name: string;
  pis: number[];
  custom: boolean;
  label: string;
  time: string;
}
export interface MeetRef {
  m: Meet;
  s: Student | null;
  stu: string;
  role: string;
  req: boolean;
  cm: string;
}
export interface PersonSheet {
  k: string;
  name: string;
  teacher: boolean;
  meets: MeetRef[];
  keys: string[];
  busy: Record<string, string>;
  answered: number;
  done?: "" | "web" | "paper";
  at?: number;
  note?: string;
}
export interface Progress {
  people: PersonSheet[];
  meets: { m: Meet; ready: boolean; wait: string[] }[];
  ready: number;
}
export interface RankRow {
  k: string;
  i: number;
  ok: boolean;
  val: number;
  yes: number;
  tot: number;
  bad: string[];
  miss: string[];
  unk: string[];
}
export type Busy = Record<string, Record<string, string>>;
export interface SlipItem {
  m: Meet;
  k: string;
  name: string;
  to: string;
  role: string;
  req: boolean;
  stu: string;
  cm: string;
  kind: string;
  time: SlotInfo;
  room: string;
  due: string;
  host: string;
}
export interface PublicDoc {
  v: number;
  who: "t" | "p";
  once: number;
  name: string;
  title: string;
  round: string;
  kind: string;
  d1: string;
  d2: string;
  due: string;
  host: string;
  keys: string[];
  ps: { id: string; n: string; t: string }[];
  busy: Record<string, string>;
  stu: { c: string; r: string; q: number; cm: string }[];
  keep: string;
  expMs: number;
}
/** 這台電腦存的鑰匙：{出席者代號: [鑰匙, 雜湊]} */
export type LocalTokens = Record<string, [string, string]>;
export interface IepCfg {
  req: Record<string, number>;
  admin: [string, string, number?][];
  subj: number;
}

export interface IepApi {
  KINDS: string[];
  ROLES: string[];
  DEF_REQ: Record<string, number>;
  ANS: Record<string, string>;
  PUB_MAX: { keys: number; stu: number; days: number };
  HASH_RE: RegExp;
  TOKEN_RE: RegExp;
  ensure(D: RcData): { cfg: IepCfg; rounds: Round[]; cur?: string };
  round(D: RcData, id: string): Round | null;
  normRound(R: Partial<Round>): Round;
  newRound(D: RcData, opt?: Record<string, unknown>): Round;
  addMeet(D: RcData, R: Round, sid: string): Meet | null;
  delMeet(R: Round, id: string): void;
  derive(D: RcData, sid: string): Person[];
  rederive(D: RcData, R: Round, m: Meet): Meet;
  addPerson(D: RcData, R: Round, m: Meet, k: string, role: string, req: unknown): Person | null;
  addOther(D: RcData, R: Round, m: Meet, name: string, role: string, req: unknown): Person | null;
  removePerson(R: Round, m: Meet, k: string): void;
  setReq(m: Meet, k: string, req: boolean): void;
  subjOptions(D: RcData, sid: string): { k: string; sj: string; name: string }[];
  tKey(D: RcData, v: string): string;
  pName(D: RcData, R: Round | null, k: string): string;
  isTeacher(k: string): boolean;
  stuOf(D: RcData, id: string): Student | null;
  stuLabel(s: Student | null): string;
  key(d: string, p: string): string;
  splitKey(k: string): [string, string];
  keysOf(R: Round): string[];
  slotInfo(D: RcData, k: string): SlotInfo;
  fmtDate(s: string): string;
  dateRange(from: string, to: string, wds?: number[]): string[];
  setRange(D: RcData, R: Round, d1: string, d2: string, ps: string[]): number;
  busyOf(D: RcData, R: Round, ctx?: unknown): Busy;
  record(R: Round, k: string, sk: string, v: string): void;
  fillRest(R: Round, k: string, v: string, keys: string[] | null, busy?: Busy): void;
  status(R: Round, busy: Busy | undefined, k: string, sk: string): { v: string; auto: boolean; why?: string };
  cycle(R: Round, busy: Busy | undefined, k: string, sk: string): string;
  consolidate(D: RcData, R: Round, opt?: { all?: boolean; fixed?: boolean; busy?: Busy }): PersonSheet[];
  grid(
    D: RcData,
    keys: string[],
  ): {
    dates: { date: string; label: string }[];
    cols: { p: string; name: string; time: string; st: string }[];
    cell(d: string, p: string): string;
  };
  rank(D: RcData, R: Round, m: Meet, busy?: Busy): RankRow[];
  schedule(D: RcData, R: Round, opt?: { busy?: Busy }): { at: Record<string, string>; room: Record<string, string>; un: { id: string; why: string }[]; score: number };
  applyPlan(R: Round, res: { at: Record<string, string>; room: Record<string, string> }): void;
  conflicts(D: RcData, R: Round): { m: string }[];
  crossConflicts(D: RcData, R: Round): { m: string }[];
  notices(D: RcData, R: Round, opt?: { all?: boolean }): PersonSheet[];
  stuShow(s: Student | null, mode?: string): string;
  salute(name: string, role: string, teacher: boolean): string;
  slipItems(D: RcData, R: Round, opt?: { all?: boolean; privacy?: string; only?: string[] }): SlipItem[];
  quickMeet(D: RcData, o: { sid: string; date: string; p: string; room?: string; kind?: string; host?: string; due?: string }): Round | null;
  token(n?: number): string;
  sha256hex(s: string): string;
  expMs(R: Round): number;
  webPeople(D: RcData, R: Round): PersonSheet[];
  ensureTokens(D: RcData, R: Round, local: LocalTokens): PersonSheet[];
  migrateTok(R: Round, local?: LocalTokens): boolean;
  linkTok(R: Round, local: LocalTokens | undefined, pk: string): string;
  regenTok(R: Round, local: LocalTokens, pk: string): { old: string; h: string; t: string };
  pubLimits(D: RcData, R: Round, now?: number): { k?: string; name?: string; what: string; n: number; max: number }[];
  pubLimitText(x: { what: string; n: number; max: number; name?: string }): string;
  shortBusy(why: string): string;
  publicDoc(D: RcData, R: Round, o: PersonSheet, busy?: Busy): PublicDoc;
  applyWeb(R: Round, o: PersonSheet, resp: { free: string[]; note?: string; at: number }): boolean;
  progress(D: RcData, R: Round): Progress;
  remindText(D: RcData, R: Round, o: PersonSheet, url: string): string;
  hostId(D: RcData, R: Round): string;
  hostLabel(D: RcData, R: Round): string;
  mineStu(D: RcData, tid: string): Student[];
  ownRounds(D: RcData, tid: string, quick?: number): Round[];
  canEdit(D: RcData, R: Round | null, tid: string): boolean;
  invited(D: RcData, tid: string): Round[];
  addMeetAs(D: RcData, R: Round, sid: string, tid: string): Meet | null;
  newRoundAs(D: RcData, tid: string, opt?: Record<string, unknown>): Round;
  selfAnswer(D: RcData, R: Round, pk: string, free: string[], note?: string): boolean;
}

export const IEP = IEP_JS as unknown as IepApi;

/* 統計：老師工作量（含減授、應授、超鐘點、外加）與每月超鐘點、教室使用、鎖課異動。
   計算全部是 core.js（teacherLoad、overtimeMonth、roomUsage、freeRooms、lockList…），這裡只整理成畫面要的樣子；
   每月超鐘點的紙（印給教務處）和舊版 extras.js otMonthCard 一字不差（test/stats.test.ts 比對）。 */
import { CORE, type Model } from "../core";
import type { ExamDoc, JsonBlobDoc, TermRecords } from "../model";
import type { RcData } from "../types";
import { esc } from "./checkin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...a: any[]) => any;
const X = CORE as unknown as Record<string, AnyFn>;

/* ───── 老師工作量 ───── */
export interface OtRow {
  reduce?: number;
  reduceNote?: string;
  due?: number;
  ot?: number;
  extra?: number;
  over?: boolean;
  short?: number;
  [k: string]: unknown;
}
export interface LoadRow {
  id: string;
  name: string;
  hours: number;
  per: number;
  diff: number;
  groups: number;
  cases: number;
  proctor: number;
  support: number;
  iep: number;
  flag: string;
  ot: OtRow;
  /** 以下是畫面用的（舊版 loadPage 補的） */
  reduce: number;
  due: number;
  otw: number;
  extra: number;
  fl: "" | "over" | "under";
}

/** 段考的監考對照（舊版只有一份 exam.html 的資料；新版每一份 exam/{eid} 合起來） */
export function examDuty(exam: Record<string, ExamDoc>): { proctorOf: Record<string, string>; supportOf: Record<string, string> } {
  const proctorOf: Record<string, string> = {};
  const supportOf: Record<string, string> = {};
  Object.entries(exam || {}).forEach(([eid, e]) => {
    Object.entries(e.proctorOf || {}).forEach(([k, v]) => (proctorOf[eid + "/" + k] = v));
    Object.entries(e.supportOf || {}).forEach(([k, v]) => (supportOf[eid + "/" + k] = v));
  });
  return { proctorOf, supportOf };
}

/** 每位資源班老師一列（core.js teacherLoad），加上舊版 loadPage 算的減授、應授、每週超鐘點、外加、超過／不足 */
export function loadRows(D: RcData, M: Model, slot: Int16Array, exam: Record<string, ExamDoc>): LoadRow[] {
  const rows = X.teacherLoad(D, M, slot, examDuty(exam)) as LoadRow[];
  rows.forEach((r) => {
    const t = r.ot || {};
    r.reduce = t.reduce || 0;
    r.due = t.due || 0;
    r.otw = t.ot || 0;
    r.extra = t.extra || 0;
    r.fl = t.over ? "over" : t.short ? "under" : "";
  });
  return rows;
}
export type LoadKey = "name" | "hours" | "reduce" | "due" | "per" | "otw" | "extra" | "groups" | "cases" | "proctor" | "iep";
export const LOAD_COLS: [LoadKey, string][] = [
  ["name", "老師"],
  ["hours", "基本"],
  ["reduce", "減授"],
  ["due", "應授"],
  ["per", "已排"],
  ["otw", "每週超鐘點"],
  ["extra", "外加課"],
  ["groups", "課"],
  ["cases", "個管"],
  ["proctor", "監考"],
  ["iep", "IEP 會議"],
];
/** 舊版的排序：同一欄再按一次反過來；一樣時照姓名 */
export function sortLoad(rows: LoadRow[], k: LoadKey, dir: number): LoadRow[] {
  return rows
    .slice()
    .sort((a, b) => (k === "name" ? String(a.name).localeCompare(String(b.name)) : (a[k] as number) - (b[k] as number)) * dir || String(a.name).localeCompare(String(b.name)));
}

/* ───── 每月超鐘點 ───── */
export interface OtMonth {
  ym: string;
  days: { date: string; wd: number; week: string }[];
  off: { date: string; why: string }[];
  weeks: string[];
  rows: { id: string; name: string; base: number; reduce: number; due: number; weekly: number; weekOT: number; days: number; month: number; extraMonth: number; note: string; weeks: unknown[] }[];
  term: unknown;
}
export function overtimeMonth(D: RcData, M: Model, slot: Int16Array, ym: string): OtMonth | null {
  return X.overtimeMonth(D, M, slot, ym) as OtMonth | null;
}
const md = (s: string): string => {
  const m = String(s || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? +m[1] + "/" + +m[2] : String(s || "");
};
/** 每月超鐘點的紙（舊版 otMonthCard 的 #outArea 裡面，一字不差）：A4 直式、黑白，給教務處 */
export function otMonthHtml(D: RcData, R: OtMonth | null): string {
  if (!R) return "";
  const y = +R.ym.slice(0, 4),
    m = +R.ym.slice(5, 7),
    rows = R.rows.filter((r) => r.base || r.weekly);
  const hol = R.off.filter((x) => x.why === "放假").map((x) => md(x.date)),
    outT = R.off.filter((x) => x.why === "學期外").length;
  return `<div class="pg xx-otm"><h2>${esc(D.title || "")}<br>${y - 1911} 年 ${m} 月 超鐘點節數統計表</h2>
    <p class="xx-otn">本月上課日 ${R.days.length} 天${hol.length ? "（放假：" + esc(hol.join("、")) + "）" : ""}${outT ? "；學期外 " + outT + " 天不計" : ""}</p>
    <table class="out"><thead><tr><th>教師</th><th>應授</th><th>每週超鐘點</th><th>本月上課日</th><th>本月超鐘點節數</th><th>備註</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="c">${r.base ? r.due : ""}</td><td class="c">${r.base ? r.weekOT : ""}</td><td class="c">${r.days}</td><td class="c"><b>${r.base ? r.month : ""}</b></td><td>${esc(r.note)}</td></tr>`).join("")}</tbody></table>
    <p class="xx-otsg"><span>承辦人：</span><span>教務主任：</span></p></div>`;
}

/* ───── 教室使用 ───── */
export interface RoomCell {
  l: number;
  gi: number;
  name: string;
  subject: string;
  teacher: string;
}
export interface RoomUsage {
  rooms: { i: number; id: string; name: string; spare: boolean; used: number; total: number; pct: number }[];
  cells: RoomCell[][][];
  none: (RoomCell & { s: number })[];
  reg: number[];
  NS: number;
  NP: number;
}
export function roomUsage(M: Model, slot: Int16Array, rfix?: Int16Array): RoomUsage {
  return X.roomUsage(M, slot, rfix) as RoomUsage;
}
export function freeRooms(U: RoomUsage, s: number): RoomUsage["rooms"] {
  return X.freeRooms(U, s) as RoomUsage["rooms"];
}

/* ───── 鎖課異動 ───── */
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
/** lockLog/L000… → 舊版 D.lockLog 的順序（ord），帶文件 id */
export function lockEntries(R: Pick<TermRecords, "lockLog">): { id: string; i: number; e: LockEntry }[] {
  return Object.entries(R.lockLog || {})
    .map(([id, d]: [string, JsonBlobDoc]) => ({ id, ord: typeof d.ord === "number" ? d.ord : 1e9, e: JSON.parse(d.json) as LockEntry }))
    .sort((a, b) => a.ord - b.ord || (a.id < b.id ? -1 : 1))
    .map((x, i) => ({ id: x.id, i, e: x.e }));
}
const DAYW = ["一", "二", "三", "四", "五"];
/** 時段鍵 → 週一第3節（舊版 extras.js slotName） */
export function slotName(D: Pick<RcData, "periods">, k: string): string {
  const m = String(k || "").match(/^(\d)-(.+)$/);
  if (!m) return String(k || "");
  const p = (D.periods || []).find((x) => String(x.id) === m[2]);
  return "週" + (DAYW[+m[1]] || "?") + (p ? p.name : m[2]);
}
const pad = (n: number) => String(n).padStart(2, "0");
export const fmtAt = (t: number): string => {
  const d = new Date(+t || 0);
  return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
};
/** 匯出這次異動（Tab 分隔，可以貼到 Excel；舊版 lockTSV） */
export function lockTSV(D: Pick<RcData, "periods">, e: LockEntry): string {
  const L = [["異動", "班級", "時段", "科目", "老師"].join("\t")];
  e.added.forEach((x) => L.push(["新增", x.cls, slotName(D, x.k), x.sj, x.t].join("\t")));
  e.removed.forEach((x) => L.push(["取消", x.cls, slotName(D, x.k), x.sj, x.t].join("\t")));
  return L.join("\n");
}
/** 改「已交教務處」（在 planOnD 的 D 上跑；i＝D.lockLog 的索引） */
export function setLockSent(D: RcData, i: number, at: number | null): boolean {
  const log = Array.isArray(D.lockLog) ? (D.lockLog as LockEntry[]) : [];
  const e = log[i];
  if (!e) return false;
  if (at) e.sentAt = at;
  else delete e.sentAt;
  return true;
}
/** 一筆異動照班級分好（明細） */
export function lockByClass(e: LockEntry): [string, ["+" | "-", LockItem][]][] {
  const by: Record<string, ["+" | "-", LockItem][]> = {};
  e.added.forEach((x) => (by[x.cls] = by[x.cls] || []).push(["+", x]));
  e.removed.forEach((x) => (by[x.cls] = by[x.cls] || []).push(["-", x]));
  return Object.keys(by)
    .sort()
    .map((c) => [c, by[c].sort((a, b) => String(a[1].k).localeCompare(String(b[1].k)))]);
}

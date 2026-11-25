/* 管理者端的「用舊的純函式改資料，再寫回分拆文件」：
     1. D0 = toCoreD(records)（整份舊格式 D），D1 = D0 的副本
     2. 在 D1 上跑 core.js 的函式（importStudents、newTerm、suggestCaseMgr 的結果…）
     3. ops = diff(splitD(D0), splitD(D1))：只有真的變了的文件
     4. 先給人看 summarize(ops)，按下套用才 applyOps(repo, ops, revs)：一批寫入，每份帶 rev
   D0、D1 都經過同一個 split，所以 normalize 補的預設值不會被當成變更。單元測試：test/apply.test.ts。 */
import { CORE } from "../core";
import { NX, type DiffOps } from "../legacy";
import type { Collection, TermRecords } from "../model";
import { revKey, splitD, toCoreD, type BatchOptions, type BatchResult, type Repo, type RevMap, type WritableCol } from "../repo";
import type { RcData } from "../types";

export type { DiffOps };

/** 舊格式 D 會改到的集合（排課核心＋staff 的交接基準、未知欄位） */
export const CORE_COLS: ("term" | Collection)[] = ["term", "teachers", "classes", "groups", "students", "privates", "staff"];

export const COL_NAME: Record<string, string> = {
  term: "學期設定",
  teachers: "老師",
  classes: "班級",
  groups: "課程",
  students: "學生",
  privates: "私密資料",
  attendance: "點名",
  iep: "IEP 調查",
  iepInvite: "IEP 填空堂",
  exam: "段考",
  examPrivate: "段考名單",
  versions: "版本",
  lockLog: "鎖課紀錄",
  staff: "其他設定",
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** 兩份 records 之間要寫、要刪的文件（functions/nx-split.js 的 diff；內容一樣的不寫） */
export function diffRecords(before: Partial<TermRecords>, after: Partial<TermRecords>, cols?: string[]): DiffOps {
  return NX.diff(before, after, cols);
}

/** 兩份舊格式 D 之間的文件變更 */
export function diffD(D0: RcData, D1: RcData, cols: string[] = CORE_COLS): DiffOps {
  return NX.diff(splitD(D0), splitD(D1), cols);
}

export interface Planned<T> {
  D0: RcData;
  D1: RcData;
  result: T;
  ops: DiffOps;
}

/** 在 records 組回的 D 的副本上跑 fn（試跑，不寫任何東西），回傳結果與要寫的文件 */
export function planOnD<T>(records: Partial<TermRecords>, fn: (D: RcData) => T, cols?: string[]): Planned<T> {
  const D0 = toCoreD(records);
  const D1 = clone(D0);
  const result = fn(D1);
  const D1n = CORE.normalize(D1);
  return { D0, D1: D1n, result, ops: diffD(D0, D1n, cols) };
}

export interface ColCount {
  add: number;
  update: number;
  del: number;
}
export interface OpSummary extends ColCount {
  total: number;
  byCol: Record<string, ColCount>;
}

/** 新增＝資料庫裡還沒有（revs 沒有），其他是更新 */
export function summarize(ops: DiffOps, revs: RevMap): OpSummary {
  const out: OpSummary = { add: 0, update: 0, del: 0, total: 0, byCol: {} };
  const bump = (col: string, k: keyof ColCount) => {
    const c = (out.byCol[col] = out.byCol[col] || { add: 0, update: 0, del: 0 });
    c[k]++;
    out[k]++;
    out.total++;
  };
  ops.set.forEach((o) => bump(o.col, revs[revKey(o.col, o.id)] ? "update" : "add"));
  ops.del.forEach((o) => bump(o.col, "del"));
  return out;
}

/** 摘要的一行字：「學生 新增 3、更新 2；課程 更新 1」 */
export function summaryText(s: OpSummary): string {
  if (!s.total) return "沒有變更";
  return Object.entries(s.byCol)
    .map(([c, n]) => (COL_NAME[c] || c) + " " + [n.add && "新增 " + n.add, n.update && "更新 " + n.update, n.del && "刪除 " + n.del].filter(Boolean).join("、"))
    .join("；");
}

/** ops → Repo.batch 的寫入（expectRev 取自讀到的 revs；新增 0；刪除不檢查） */
export function toBatch(ops: DiffOps, revs: RevMap) {
  return [
    ...ops.set.map((o) => ({ col: o.col as WritableCol, id: o.id, data: o.data, expectRev: revs[revKey(o.col, o.id)]?.rev || 0 })),
    ...ops.del.map((o) => ({ col: o.col as WritableCol, id: o.id, data: null, expectRev: null })),
  ];
}

/** 寫回去：一批，每份帶 rev（被別人搶先就丟 RevConflictError） */
export function applyOps(repo: Repo, ops: DiffOps, revs: RevMap, opt?: BatchOptions): Promise<BatchResult> {
  return repo.batch(toBatch(ops, revs), opt);
}

/** 只留某些集合的變更（例：還原時不刪點名） */
export function filterOps(ops: DiffOps, keep: (col: string, kind: "set" | "del") => boolean): DiffOps {
  return { set: ops.set.filter((o) => keep(o.col, "set")), del: ops.del.filter((o) => keep(o.col, "del")) };
}

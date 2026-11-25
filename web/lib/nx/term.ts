/* 新學期（舊 app.js startTerm＋core.newTerm）：在新的 terms/{tid} 建一份從目前學期複製過來的資料，
   照選項升年級、清空排課結果／課程／任課老師／班級不排課／老師不排課。點名、IEP 調查、版本、鎖課紀錄不帶過去。
   建好之後由 Function nxSetCurrentTerm 把 schools/{sid}.currentTerm 換過去（學校文件只有 Function 能寫）。
   單元測試：test/admin.test.ts。 */
import { CORE } from "../core";
import type { TermRecords } from "../model";
import { emptyRecords, splitD, toCoreD, type BatchOp, type WritableCol } from "../repo";
import type { RcData } from "../types";

export interface NewTermOpt {
  title: string;
  promote: boolean;
  clearAssign: boolean;
  clearGroups: boolean;
  clearCS: boolean;
  clearClassOff: boolean;
  clearTeaOff: boolean;
}
export const NEW_TERM_DEFAULT: NewTermOpt = {
  title: "",
  promote: false,
  clearAssign: true,
  clearGroups: false,
  clearCS: false,
  clearClassOff: false,
  clearTeaOff: false,
};

/** 學期代碼（和 Functions 的 ID_RE 一樣：小寫英數、-、_，2–40 字） */
export const TERM_ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
/** 從學期名稱猜代碼：「115 學年度第 2 學期」→ 115-2 */
export function suggestTermId(title: string, now = new Date()): string {
  const m = String(title || "").match(/(\d{2,3})\D+(\d)/);
  if (m) return m[1] + "-" + m[2];
  return "t" + now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0");
}

/** 要清掉的部分（給確認視窗） */
export function newTermWhat(o: NewTermOpt): string[] {
  return [
    o.promote && "升年級（九年級移出名冊；全校課表、各班導師、課程、任課老師、班級不排課一起清空）",
    o.clearAssign && "清空排課結果",
    o.clearGroups && "清空所有課程",
    o.clearCS && "清空各班任課老師",
    o.clearClassOff && "清空班級不排課",
    o.clearTeaOff && "清空所有老師的不排課",
  ].filter(Boolean) as string[];
}

export interface NewTermPlan {
  records: TermRecords;
  D: RcData;
  grad: number;
  up: number;
  counts: { students: number; teachers: number; groups: number; classes: number };
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** 算出新學期的 records（不寫任何東西） */
export function planNewTerm(records: TermRecords, opt: NewTermOpt): NewTermPlan {
  const D = clone(toCoreD(records)) as RcData & Record<string, unknown>;
  const o = { ...opt } as NewTermOpt & Record<string, unknown>;
  const r = (CORE as unknown as { newTerm(D: RcData, o: unknown): { grad: number; up: number } }).newTerm(D, o);
  // 新學期不帶：IEP 調查、試排與版本、鎖課紀錄、交接基準以外的舊點名（點名本來就不在 D 裡）
  if (D.iep && typeof D.iep === "object") D.iep = { ...(D.iep as object), rounds: [] };
  delete D.sched;
  delete D.lockLog;
  delete D.lockLast;
  // 學年交接的基準：升年級前的名冊（新學期的交接檢查拿這份比）
  D.handoverBase = (CORE as unknown as { handoverBase(D: RcData): unknown }).handoverBase(toCoreD(records));
  const Dn = CORE.normalize(D);
  const R = splitD(Dn);
  const out: TermRecords = { ...emptyRecords(), ...R, attendance: {}, iepInvite: {}, versions: {}, lockLog: {}, exam: {}, examPrivate: {}, iep: {} };
  return {
    records: out,
    D: Dn,
    grad: r.grad || 0,
    up: r.up || 0,
    counts: { students: Object.keys(out.students).length, teachers: Object.keys(out.teachers).length, groups: Object.keys(out.groups).length, classes: Object.keys(out.classes).length },
  };
}

/** 新學期的 records → 寫進新學期的一批（全部是新增，rev 0） */
export function newTermOps(R: TermRecords): BatchOp[] {
  const ops: BatchOp[] = [];
  if (R.term) ops.push({ col: "term", id: "", data: R.term as Record<string, unknown>, expectRev: 0 });
  (Object.keys(R) as (keyof TermRecords)[]).forEach((c) => {
    if (c === "term") return;
    Object.entries((R[c] || {}) as Record<string, Record<string, unknown>>).forEach(([id, d]) => ops.push({ col: c as WritableCol, id, data: d, expectRev: 0 }));
  });
  return ops;
}

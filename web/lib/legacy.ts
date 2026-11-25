/* 舊格式（整份 D，rc/main）⇄ 目標模型（一筆一份文件）的轉換。
   邏輯在 repo 根目錄的 functions/nx-split.js（Cloud Functions 的搬移與同步用同一份，不複製）；這裡只補型別。 */
import NX_JS from "../../functions/nx-split.js";
import type { Collection, TermRecords } from "./model";
import type { RcData } from "./types";

export interface DiffOps {
  set: { col: "term" | Collection; id: string; data: Record<string, unknown> }[];
  del: { col: Collection; id: string }[];
}

export interface NxSplitApi {
  split(D: RcData): TermRecords;
  join(R: Partial<TermRecords>, opt?: { keepUnknown?: boolean }): RcData;
  splitAttendance(date: string, data: Record<string, unknown>, D: RcData | null): TermRecords["attendance"];
  joinAttendance(docs: TermRecords["attendance"]): Record<string, Record<string, unknown>>;
  splitExam(E: unknown, notice: unknown, eid?: string): Pick<TermRecords, "exam" | "examPrivate">;
  joinExam(R: Partial<TermRecords>, eid?: string): { exam: Record<string, unknown> | null; notice: unknown };
  diff(before: Partial<TermRecords>, after: Partial<TermRecords>, cols?: string[]): DiffOps;
  canon(v: unknown): string;
  pathOf(sid: string, termId: string, col: string, id: string): string;
  readersOf(s: { id: string; cls: string; caseMgr?: string }, groups: RcData["groups"], classSubj: RcData["classSubj"]): string[];
  fsSafe(v: unknown): boolean;
  encId(s: string): string;
  decId(s: string): string;
  emptyRecords(): TermRecords;
  COLS: Collection[];
}

export const NX = NX_JS as unknown as NxSplitApi;

/** 舊格式 D → records（全部） */
export function fromLegacy(D: RcData): TermRecords {
  return NX.split(D);
}

/** records（可以只有一部分）→ 舊格式 D */
export function toLegacy(R: Partial<TermRecords>, opt?: { keepUnknown?: boolean }): RcData {
  return NX.join(R, opt);
}

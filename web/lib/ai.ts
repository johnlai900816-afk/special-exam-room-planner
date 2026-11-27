/* AI（Gemini）：直接 import repo 根目錄的 gemini.js（連線）與 ai.js（題目、回覆格式、檢查），和 core.js 一樣不複製，這裡只補型別與接上 Firebase。
   兩種連線方式照舊版：
   - proxy：送到這個 Firebase 專案已部署的 Cloud Functions（functions/ai.js 的 aiGenerate、aiListModels），帶 Firebase 登入的 ID token；登入時預設
   - browser：老師自己的金鑰（存在這台瀏覽器的 localStorage，和舊版同一個鍵）
   原則照舊版：本機的排課程式是裁判，AI 給的只是候選，一律用 evaluate／assignLocks 檢查，比現在好才給人選；學生姓名一律換成代號。 */
import AI_JS from "../../ai.js";
import GEMINI_JS from "../../gemini.js";
import type { Model, Problem, SolveState } from "./core";
import { firebase } from "./firebase";
import type { RcData } from "./types";

export interface AiReq {
  prompt: string;
  system?: string;
  v?: string;
  scrubbed?: number;
  images?: string[];
  said?: unknown;
  options?: { id: string; t: number; gi: number; slotName: string }[];
  [k: string]: unknown;
}
export interface AiResult {
  text: string;
  json: Record<string, unknown> & { actions?: unknown[]; reply?: string; summary?: string; items?: { course?: string; explain?: string; suggest?: string; options?: string[] }[] };
  model: string;
  logId?: string;
}
export interface GeminiApi {
  config(o: Record<string, unknown>): void;
  getMode(): "proxy" | "browser";
  setMode(m: "proxy" | "browser"): void;
  ready(): boolean;
  namesOk(): boolean;
  setNamesOk(v: boolean): void;
  seen(kind: string): boolean;
  setSeen(kind: string): void;
  getKey(): string;
  setKey(v: string): void;
  getProxy(): string;
  getModel(): string;
  setModel(m: string): void;
  cached(): { list: { id: string; label: string }[]; added?: string[] } | null;
  listModels(o?: Record<string, unknown>): Promise<unknown>;
  ensureModels(o?: Record<string, unknown>): Promise<{ list: { id: string; label: string }[] }>;
  generate(o: Record<string, unknown>): Promise<AiResult>;
  test(o?: Record<string, unknown>): Promise<{ model: string; reply: string; err: Error | null; list: { id: string; label: string }[] }>;
  logAdd(e: Record<string, unknown>): string;
  logUpdate(id: string, e: Record<string, unknown>): void;
  logList(): Record<string, unknown>[];
}
export interface SchedCheck {
  M: Model;
  S: SolveState;
  out: Problem[];
  un: number;
  viol: number;
  r: { members: number; bad: string[] };
  X: RcData;
  note?: string;
}
export interface AdjItem {
  ok: boolean;
  text: string;
  quote?: string;
  why?: string;
  warn?: string;
  act: unknown;
}
export interface AiApi {
  schedRequest(D: RcData, o: { names: boolean }): AiReq;
  schedCheck(D: RcData, reply: unknown, v?: string): SchedCheck;
  schedRepair(M: Model, S: SolveState, out: Problem[], o: { seed: number }): { slot: Int16Array; moved: number };
  schedJudge(M: Model, slot: Int16Array, M2: Model, slot2: ArrayLike<number>): { ok: boolean; why: string[]; cur: Judge; cand: Judge };
  schedDiff(D: RcData, M: Model, slot: Int16Array, X: RcData, slot2: ArrayLike<number>): string;
  unscrub(D: RcData, t: string): string;
  adjRequest(D: RcData, M: Model, S: SolveState, txt: string, o: { names: boolean }): AiReq;
  adjCheck(D: RcData, M: Model, S: SolveState, actions: unknown, said: unknown): AdjItem[];
  adjApply(D: RcData, acts: unknown[]): unknown[];
  adjLessons(M: Model, S: SolveState, ops: unknown[]): number;
  explainRequest(D: RcData, M: Model, S: SolveState, out: Problem[], o: { names: boolean }): AiReq;
}
export interface Judge {
  viol: number;
  pend: number;
  cost: number;
  open: number;
}

export const GEMINI = GEMINI_JS as unknown as GeminiApi;
export const AI = AI_JS as unknown as AiApi;

let wired = false;
/** 代理模式用新版的 Firebase 登入：有沒有登入、ID token、目前的專案（舊版 app.js 的 GEMINI.config） */
export function wireAi(): void {
  if (wired) return;
  wired = true;
  GEMINI.config({
    signedIn: () => !!firebase()?.auth.currentUser,
    idToken: () => firebase()?.auth.currentUser?.getIdToken() ?? "",
    projectId: () => firebase()?.projectId || "",
  });
}

export const AI_KIND: Record<string, string> = { sched: "AI 排課", adj: "用文字調整", explain: "說明問題", paste: "複製貼上的 AI 排法", ttgrid: "讀全校課表", weekly: "導師週報潤飾", examFix: "說明考場違規", iepPlan: "說明 IEP 會議排不進去" };
export const aiModeText = () => (GEMINI.getMode() === "proxy" ? "學校的 AI 服務" : "你自己的金鑰");
export const aiMsg = (e: unknown) => {
  const x = e as { name?: string; message?: string };
  return x && x.name === "GeminiError" ? String(x.message) : "發生錯誤：" + ((x && x.message) || e);
};

/** 送出（舊版 gmAsk 去掉畫面）：kind、題目、取消訊號、等待時的提示 */
export function aiAsk(kind: string, req: AiReq, signal: AbortSignal, onWait?: (msg: string) => void): Promise<AiResult> {
  wireAi();
  return GEMINI.generate({ ...req, kind, signal, names: GEMINI.namesOk(), onWait: (e: Error) => onWait?.(e.message + " 系統會自動再試一次…") });
}

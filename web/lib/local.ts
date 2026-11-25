/* 不登入時的資料來源：這台瀏覽器的 localStorage（舊系統存的同一份）、使用者選的備份檔、或範例資料。
   新版和舊版都在 github.io 這個網域底下，localStorage 是同一個，所以讀得到舊版存的資料。
   備份檔只放在記憶體裡，不寫進 localStorage，也不上傳。 */
import { CORE } from "./core";
import type { ExamData, RcData } from "./types";

export const KEY_MAIN = "resource-class-v1";
export const KEY_EXAM = "special-exam-room-v1";
export const KEY_ME = "rc-next-me"; // 單機時「我是哪一位老師」

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function loadLocalMain(): RcData | null {
  const o = readJson(KEY_MAIN);
  return o && typeof o === "object" ? CORE.normalize(o) : null;
}

export function loadLocalExam(): ExamData | null {
  const o = readJson(KEY_EXAM) as ExamData | null;
  return o && Array.isArray(o.sessions) ? o : null;
}

/** 寫回這台瀏覽器（和舊版 localSave 的格式一樣：整份 D 的 JSON）。舊版下次打開就會讀到 */
export function saveLocalMain(D: RcData): void {
  window.localStorage.setItem(KEY_MAIN, JSON.stringify(D));
}

export interface BackupFile {
  D: RcData;
  exam: ExamData | null;
  name: string;
}

/** 讀舊版「下載備份檔」產生的 JSON：D 的欄位＋_exam、_notice、_att */
export async function readBackupFile(f: File): Promise<BackupFile> {
  const text = await f.text();
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error("這不是備份檔（讀不出 JSON）");
  }
  if (!o || !Array.isArray(o.students) || !Array.isArray(o.groups)) throw new Error("這不是資源班管理系統的備份檔");
  const exam = (o._exam as ExamData) || null;
  const rest = { ...o };
  delete rest._exam;
  delete rest._notice;
  delete rest._att;
  return { D: CORE.normalize(rest), exam: exam && Array.isArray(exam.sessions) ? exam : null, name: f.name };
}

/** 範例資料（core.defaultData()）再用 core.solve 排好，畫面上才看得到課表 */
export function demoData(): RcData {
  const D = CORE.defaultData();
  const M = CORE.compile(D);
  const S = CORE.solve(M, CORE.toState(M, D), { seed: 1, iters: 20000, restarts: 1 });
  D.assign = CORE.fromState(M, S);
  return D;
}

export function getLocalMe(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEY_ME) || "";
}

export function setLocalMe(id: string): void {
  if (id) window.localStorage.setItem(KEY_ME, id);
  else window.localStorage.removeItem(KEY_ME);
}

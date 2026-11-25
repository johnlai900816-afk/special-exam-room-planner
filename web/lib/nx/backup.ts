/* 設定 › 資料與備份：下載（這位管理者讀得到的全部文件）、加密備份、從備份還原（先檢查、先看差異）。
   加密和舊版 app.js 一樣：AES-GCM 256，金鑰由密碼經 PBKDF2-SHA256（31 萬次）產生，檔案格式 {rcEnc:1, …} 相同，
   舊版的加密備份檔這裡也打得開。舊版的一般備份（整份 D）也可以還原：先 splitD 再比對。單元測試：test/backup.test.ts。 */
import { CORE } from "../core";
import type { TermRecords } from "../model";
import { emptyRecords, splitD } from "../repo";
import type { RcData } from "../types";
import { diffRecords, filterOps, type DiffOps } from "./apply";

export const APP_NAME = "資源班管理系統";

export interface NxBackup {
  app: string;
  kind: "nx-records";
  v: 1;
  sid: string;
  termId: string;
  at: string;
  records: TermRecords;
}

export function packBackup(records: TermRecords, sid: string, termId: string, now = new Date()): NxBackup {
  return { app: APP_NAME, kind: "nx-records", v: 1, sid, termId, at: now.toISOString(), records: JSON.parse(JSON.stringify(records)) };
}

export const backupName = (enc: boolean, now = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return APP_NAME + (enc ? "_加密備份_" : "_備份_") + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate()) + ".json";
};

/* ───── 加密（和舊版 app.js encPack／encOpen 同一個格式） ───── */
export const ENC_ITER = 310000;
export interface EncFile {
  rcEnc: 1;
  app: string;
  alg: string;
  iter: number;
  salt: string;
  iv: string;
  data: string;
}
function b64(u: ArrayBuffer | Uint8Array): string {
  const a = u instanceof Uint8Array ? u : new Uint8Array(u);
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(a.subarray(i, i + 0x8000)));
  return btoa(s);
}
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function encKey(pw: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encPack(text: string, pw: string, iter = ENC_ITER): Promise<EncFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encKey(pw, salt, iter);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { rcEnc: 1, app: APP_NAME, alg: "AES-GCM-256/PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}
/** 解不開（密碼錯、檔案壞掉）會丟錯 */
export async function encOpen(o: EncFile, pw: string, minIter = 100000): Promise<string> {
  const it = +o.iter;
  if (!(it >= minIter && it <= 5000000) || typeof o.salt !== "string" || typeof o.iv !== "string" || typeof o.data !== "string") throw new Error("加密檔格式不對");
  const key = await encKey(pw, unb64(o.salt), it);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, key, unb64(o.data)));
}
export const isEnc = (o: unknown): o is EncFile => !!o && typeof o === "object" && (o as EncFile).rcEnc === 1;

/* ───── 讀備份：檢查格式 → records ───── */
export interface ParsedBackup {
  kind: "nx" | "legacy";
  records: TermRecords;
  /** 備份檔裡寫的學校、學期（舊版的沒有） */
  sid?: string;
  termId?: string;
  at?: string;
  counts: Record<string, number>;
}

const LIMITS: Record<string, number> = { teachers: 1000, classes: 500, groups: 2000, students: 5000, privates: 5000, attendance: 50000, iep: 2000, iepInvite: 20000 };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** 檢查新版備份的 records：每個集合是 {id: 物件}、數量合理、學生一定有姓名與 caseMgrId、private 有 caseMgrId */
export function validateRecords(R: unknown): string[] {
  const err: string[] = [];
  if (!isObj(R)) return ["不是備份檔"];
  const base = emptyRecords() as unknown as Record<string, unknown>;
  Object.keys(R).forEach((k) => {
    if (!(k in base)) err.push("不認得的資料：" + k);
  });
  if (R.term != null && !isObj(R.term)) err.push("學期設定格式不對");
  Object.keys(base).forEach((c) => {
    if (c === "term" || R[c] == null) return;
    const m = R[c];
    if (!isObj(m)) return void err.push(c + " 格式不對");
    const n = Object.keys(m).length;
    if (LIMITS[c] && n > LIMITS[c]) err.push(c + " 太多（" + n + "）");
    Object.entries(m).forEach(([id, d]) => {
      if (!isObj(d) || !id || (c !== "examPrivate" && id.includes("/"))) err.push(c + "/" + id + " 格式不對");
    });
  });
  const S = (R.students || {}) as Record<string, Record<string, unknown>>;
  Object.entries(S).forEach(([id, s]) => {
    if (typeof s.name !== "string" || typeof s.caseMgrId !== "string" || !Array.isArray(s.teacherIds)) err.push("學生 " + id + " 缺欄位");
  });
  const P = (R.privates || {}) as Record<string, Record<string, unknown>>;
  Object.entries(P).forEach(([id, p]) => {
    if (typeof p.caseMgrId !== "string") err.push("私密資料 " + id + " 缺個管");
    if (!S[id]) err.push("私密資料 " + id + " 沒有對應的學生");
  });
  return err.slice(0, 20);
}

/** 舊版備份（整份 D，可能帶 _exam、_notice、_att）→ records（只拿排課核心；段考、點名要在舊版還原） */
function fromLegacy(o: Record<string, unknown>): TermRecords {
  const D = { ...o };
  delete D._exam;
  delete D._notice;
  delete D._att;
  return splitD(CORE.normalize(D as unknown as RcData));
}

export function parseBackup(o: unknown): ParsedBackup {
  if (!isObj(o)) throw new Error("不是備份檔");
  let records: TermRecords;
  let kind: ParsedBackup["kind"];
  if (o.kind === "nx-records") {
    const err = validateRecords(o.records);
    if (err.length) throw new Error(err.join("；"));
    records = { ...emptyRecords(), ...(o.records as TermRecords) };
    kind = "nx";
  } else if (Array.isArray(o.students) && Array.isArray(o.teachers) && Array.isArray(o.groups)) {
    records = fromLegacy(o);
    kind = "legacy";
  } else throw new Error("看不出是哪一種備份檔");
  const counts: Record<string, number> = {};
  (Object.keys(records) as (keyof TermRecords)[]).forEach((c) => {
    if (c !== "term") counts[c] = Object.keys(records[c] || {}).length;
  });
  return { kind, records, sid: typeof o.sid === "string" ? o.sid : undefined, termId: typeof o.termId === "string" ? o.termId : undefined, at: typeof o.at === "string" ? o.at : undefined, counts };
}

/** 還原要寫的文件：舊版備份只還原排課核心；點名只補不刪（目前只讀最近兩週） */
export function restoreOps(current: TermRecords, b: ParsedBackup): DiffOps {
  const cols =
    b.kind === "legacy"
      ? ["term", "teachers", "classes", "groups", "students", "privates", "staff"]
      : ["term", "teachers", "classes", "groups", "students", "privates", "iep", "iepInvite", "exam", "examPrivate", "versions", "lockLog", "staff", "attendance"];
  const ops = diffRecords(current, b.records, cols);
  // staff/sync 是同步的狀態、只有 Function 寫，不還原
  return filterOps(
    { set: ops.set.filter((o) => !(o.col === "staff" && o.id === "sync")), del: ops.del.filter((o) => !(o.col === "staff" && o.id === "sync")) },
    (c, k) => !(c === "attendance" && k === "del"),
  );
}

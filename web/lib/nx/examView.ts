/* 查考場連結（舊版 exam.html 的 view/{鑰匙}、?v=鑰匙）：新版是 publicViews/{鑰匙}，打開 /view/?v=鑰匙，不用登入。
     全校連結：全名、不含服務與備註（只給特教組、行政）
     班級連結：只有那一班、姓名遮一字、欄位最少（給導師）
   內容由 examOut.viewDocs 產生（和舊版 linkPush 一樣，test/exam.test.ts）；到期＝最後一天考試後 7 天。
   鑰匙登記在 exam/main/private/view（{json:{link, vcls}, keys:[全部鑰匙]}，只有管理者／編輯讀得到）；規則只讓還登記著、沒過期的 publicViews 被讀，
   所以換新連結、關閉連結後，舊連結馬上打不開（就算舊文件沒刪掉）。不用 Cloud Function：管理者／編輯直接寫，規則檢查形狀與學校。 */
import { deleteDoc, doc, getDoc, serverTimestamp, Timestamp, writeBatch, type Firestore } from "firebase/firestore";
import type { JsonBlobDoc } from "../model";
import type { RepoScope } from "../repo";
import { clsSafe, viewClasses, viewDocs, viewExp, type Ctx, type FindRow, type ViewData } from "./examOut";
import { EID } from "./examData";

export interface ViewReg {
  /** 全校連結的鑰匙（''＝沒開） */
  link: string;
  /** 班級 → 鑰匙 */
  vcls: Record<string, string>;
}
export function regOf(doc: JsonBlobDoc | undefined): ViewReg {
  try {
    const o = doc ? JSON.parse(doc.json) : {};
    return { link: String(o.link || ""), vcls: o.vcls && typeof o.vcls === "object" ? o.vcls : {} };
  } catch {
    return { link: "", vcls: {} };
  }
}
export const rndKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
/** 還沒有專用連結的班級補上鑰匙（舊版 ensureClsKeys） */
export function withClassKeys(reg: ViewReg, X: Ctx): ViewReg {
  const vc = { ...reg.vcls };
  viewClasses(X.D).forEach((c) => {
    if (!vc[c]) vc[c] = rndKey() + "_" + clsSafe(c);
  });
  return { link: reg.link, vcls: vc };
}
export const viewUrl = (key: string) => location.origin + (process.env.NEXT_PUBLIC_BASE_PATH || "") + "/view/?v=" + key;

const regPath = (s: RepoScope) => `schools/${s.sid}/terms/${s.termId}/exam/${EID}/private/view`;
/** 上次寫的內容（沒變就不重寫，省得每次存檔都寫好幾十份；和舊版 CLOUD.lastView 一樣） */
const lastSig: Record<string, string> = {};

/**
 * 寫連結：登記鑰匙（private/view，rev＋1）＋每一份 publicViews，同一批（規則用 getAfter 檢查鑰匙有登記）。
 * reg.link 是 '' 就只更新登記（關閉）。old＝要作廢的鑰匙（先刪文件；刪不掉也沒關係，登記拿掉就讀不到了）。
 */
export async function pushViews(db: Firestore, scope: RepoScope, X: Ctx, reg: ViewReg, rev: number, old: string[] = []): Promise<{ left: number }> {
  let left = 0;
  for (const k of old) {
    try {
      await deleteDoc(doc(db, "publicViews/" + k));
      delete lastSig[k];
    } catch {
      left++;
    }
  }
  const keys = reg.link ? [reg.link, ...Object.values(reg.vcls)] : [];
  const b = writeBatch(db);
  const regRef = doc(db, regPath(scope));
  const cur = await getDoc(regRef);
  const curRev = cur.exists() ? +cur.data().rev || 0 : 0;
  if (curRev !== rev) throw new Error("連結設定剛剛被別人改過，請重新整理");
  b.set(regRef, { json: JSON.stringify({ link: reg.link, vcls: reg.link ? reg.vcls : {} }), keys, rev: rev + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
  if (reg.link) {
    const exp = Timestamp.fromDate(viewExp(X.D));
    const V = viewDocs(X, reg.vcls);
    const put = (id: string, o: Record<string, unknown>) => {
      const sig = JSON.stringify(o) + exp.toMillis();
      if (lastSig[id] === sig && !old.length) return;
      lastSig[id] = sig;
      b.set(doc(db, "publicViews/" + id), { ...o, sid: scope.sid, termId: scope.termId, eid: EID, exp, at: serverTimestamp() });
    };
    put(reg.link, V.all);
    for (const id in V.cls) put(id, V.cls[id]);
  }
  await b.commit();
  return { left };
}

/** 只更新連結的內容（存段考後）：鑰匙不變、登記不動 */
export async function refreshViews(db: Firestore, scope: RepoScope, X: Ctx, reg: ViewReg): Promise<void> {
  if (!reg.link) return;
  const exp = Timestamp.fromDate(viewExp(X.D));
  const V = viewDocs(X, reg.vcls);
  const b = writeBatch(db);
  let n = 0;
  const put = (id: string, o: Record<string, unknown>) => {
    const sig = JSON.stringify(o) + exp.toMillis();
    if (lastSig[id] === sig) return;
    lastSig[id] = sig;
    n++;
    b.set(doc(db, "publicViews/" + id), { ...o, sid: scope.sid, termId: scope.termId, eid: EID, exp, at: serverTimestamp() });
  };
  put(reg.link, V.all);
  for (const id in V.cls) if (Object.values(reg.vcls).includes(id)) put(id, V.cls[id]);
  if (n) await b.commit();
}

/** 公開頁：用鑰匙讀一份（不用登入）。讀不到（沒有、過期、作廢）回傳 null */
export async function readView(db: Firestore, key: string): Promise<ViewData | null> {
  const k = String(key || "").replace(/[^a-z0-9_]/gi, "");
  if (!k) return null;
  try {
    const s = await getDoc(doc(db, "publicViews/" + k));
    if (!s.exists()) return null;
    const x = s.data();
    if (!x.rows) return null;
    return { title: String(x.title || ""), rows: JSON.parse(x.rows) as FindRow[], cls: String(x.cls || ""), exp: x.exp && x.exp.toDate ? x.exp.toDate() : null, all: !!x.all };
  } catch {
    return null;
  }
}

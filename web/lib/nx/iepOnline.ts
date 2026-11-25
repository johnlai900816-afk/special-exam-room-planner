/* IEP 線上連結（新版）：公開頁、iepGetSurvey、iepSubmit 都是正式上線中的舊版那一套，不改。
   ・鑰匙只存在發布的那台電腦：localStorage「rc-iep-tok」＝{調查 id: {出席者代號: [鑰匙, 雜湊]}}（和舊版同一個鍵、同一個格式；
     公用電腦模式存在 sessionStorage，關掉分頁就沒了，之後要「重新產生連結」）。調查單裡只有雜湊（R.tokH）。
   ・寫 iepTok：新版的老師不在舊名單的「編輯」裡，規則不讓寫，改呼叫 nxIepPublish（functions/nx-iep.js）代寫。
   ・回覆：iepSubmit 照舊寫 iepResp/{調查}/r/{雜湊}，nxIepMirror 抄一份到 iep/{調查}/responses/{雜湊}，這裡讀新位置。 */
import { collection, getDocs } from "firebase/firestore";
import { OLD_APP } from "@/components/Planned";
import { firebase } from "../firebase";
import { IEP, type Busy, type LocalTokens, type Round } from "../iep";
import type { RcData } from "../types";
import type { RepoScope } from "../repo";
import { callNx } from "./session";

const LTKEY = "rc-iep-tok";
type All = Record<string, LocalTokens>;

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem("rc-next-public") === "1" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}
function readAll(): All {
  try {
    const o = JSON.parse(store()?.getItem(LTKEY) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}
function writeAll(a: All) {
  Object.keys(a).forEach((k) => {
    if (!a[k] || !Object.keys(a[k]).length) delete a[k];
  });
  try {
    if (Object.keys(a).length) store()?.setItem(LTKEY, JSON.stringify(a));
    else store()?.removeItem(LTKEY);
  } catch {
    /* 存不進去就算了：下次要重新產生連結 */
  }
}
export function localTokens(rid: string): LocalTokens {
  return readAll()[rid] || {};
}
export function saveTokens(rid: string, t: LocalTokens) {
  const a = readAll();
  a[rid] = t;
  writeAll(a);
}
export function dropTokens(rid: string) {
  const a = readAll();
  delete a[rid];
  writeAll(a);
}

/** 公開頁的網址（舊版的 iep.html，正式上線中） */
export function urlOf(R: Round, pk: string): string {
  const t = IEP.linkTok(R, localTokens(R.id), pk);
  return t ? OLD_APP + "iep.html?k=" + t : "";
}

/** 發布（或更新線上內容）：每位出席者一份 iepTok/{雜湊}。會改 R（tokH、pub、pubAt），呼叫的人要存檔 */
export async function publish(scope: RepoScope, D: RcData, R: Round, busy: Busy): Promise<number> {
  const local = localTokens(R.id);
  const list = IEP.ensureTokens(D, R, local);
  saveTokens(R.id, local);
  const docs = list.map((o) => ({ h: R.tokH![o.k], doc: { ...IEP.publicDoc(D, R, o, busy), pk: o.k } }));
  const kept = new Set(docs.map((d) => d.h));
  const drop = (R.pub || []).filter((h) => !kept.has(h));
  await callNx("nxIepPublish", { sid: scope.sid, termId: scope.termId, roundId: R.id, docs, drop });
  Object.keys(R.tokH || {}).forEach((k) => {
    if (!list.some((o) => o.k === k)) {
      delete R.tokH![k];
      delete local[k];
    }
  });
  saveTokens(R.id, local);
  R.pub = [...kept];
  R.pubAt = Date.now();
  return list.length;
}

/** 這台電腦沒有鑰匙的人：換一把新的（舊連結失效） */
export async function regen(scope: RepoScope, D: RcData, R: Round, busy: Busy, keys: string[]): Promise<number> {
  const local = localTokens(R.id);
  const ppl = IEP.webPeople(D, R).filter((o) => keys.includes(o.k) && R.tokH?.[o.k]);
  const olds: string[] = [];
  const docs = ppl.map((o) => {
    const r = IEP.regenTok(R, local, o.k);
    if (r.old && r.old !== r.h) olds.push(r.old);
    return { h: r.h, doc: { ...IEP.publicDoc(D, R, o, busy), pk: o.k } };
  });
  await callNx("nxIepPublish", { sid: scope.sid, termId: scope.termId, roundId: R.id, docs, drop: olds });
  saveTokens(R.id, local);
  R.pub = [...new Set((R.pub || []).filter((h) => !olds.includes(h)).concat(docs.map((d) => d.h)))];
  return docs.length;
}

/** 結束調查：連結失效、線上回覆刪掉（已經讀回調查單的留著）。會改 R */
export async function closeOnline(scope: RepoScope, R: Round): Promise<void> {
  if ((R.pub || []).length) await callNx("nxIepClose", { sid: scope.sid, termId: scope.termId, roundId: R.id });
  R.pub = [];
  R.tokH = {};
  dropTokens(R.id);
}

/** 讀回線上回覆（新位置），收比上次新的。回傳收了幾份；會改 R */
export async function pull(scope: RepoScope, D: RcData, R: Round): Promise<number> {
  const fb = firebase();
  if (!fb || !(R.pub || []).length) return 0;
  const by = new Map(IEP.webPeople(D, R).map((o) => [o.k, o]));
  const rs = await getDocs(collection(fb.db, `schools/${scope.sid}/terms/${scope.termId}/iep/${R.id}/responses`));
  let n = 0;
  rs.forEach((d) => {
    const x = d.data() as { pk?: string; free?: string[]; note?: string; at?: { toMillis?: () => number } | number };
    const o = by.get(String(x.pk || ""));
    const at = x.at && typeof x.at === "object" && x.at.toMillis ? x.at.toMillis() : +(x.at as number) || 0;
    if (o && IEP.applyWeb(R, o, { free: x.free || [], note: x.note || "", at })) n++;
  });
  return n;
}

/* 全校課表（設定 › 學校資料 › ② 全校課表）的純邏輯。
   - 讀圖（題目、回覆格式、排隊、估計、送一頁）直接 import repo 根目錄的 tt.js（舊版、node test-tt.js 用的同一份，TTR），不複製。
   - 檢查、存檔、查詢（ttGridCheck、ttGridStore、ttGridRecheck、ttRename、ttNameList…）在 core.js 最後的「全校課表：整張格子」區塊，照用。
   - 這裡是 tt.js 畫面那一半（saveCur、nextPending、acceptAll、名字一次改、rosterHtml、runJob 的存檔順序）
     和 app.js 的離線辨識（readTT 的文字 PDF、ttParseAll→ttStore）、只有統計的核對（ttEdit／ttEditOk）、ttApplyCS 的純函式版。
     全部在舊格式 D 上跑（toCoreD(records) 的副本），寫回一律 planOnD → applyOps；test/tt.test.ts 把舊版原文放在沙盒裡逐項比對。
   資料：D.tt[班級] 存在 classes/{班級}.ttJson（functions/nx-split.js），導師 D.classHead 是 classes/{班級}.head，
   「名字沒錯」的 D.ttOk 是未知欄位（staff/legacy）。圖片只留在這次開著的網頁（不存）。 */
import TT_JS from "../../../tt.js";
import { CORE } from "../core";
import type { RcData, Teacher, TtClass } from "../types";

export type TtCellV = { s: string; t: string };
export type TtCell = TtCellV | null;
export interface TtFlag {
  k: "cls" | "name" | "unsure" | "count" | "dup" | "conf";
  d?: number;
  p?: string;
  s?: string;
  t?: string;
  m: string;
}
/** D.tt[班級]：有 grid 是讀圖（整張格子）；沒有 grid 是離線辨識（只有下方統計 subj） */
export interface TtGrid extends TtClass {
  grid?: TtCell[][];
  pids?: string[];
  gridExtra?: Record<string, TtCell[]>;
  sum?: [string, string, number][];
  unsure?: string[];
  dups?: string[];
  head?: string;
  conf?: number | null;
  notes?: string;
  flags?: TtFlag[];
  ok?: number;
  guessCls?: number;
}
/** core.ttGridCheck 的結果（AI 的回覆整理好、還沒存） */
export interface GridCheck {
  cls: string;
  head: string;
  grid: TtCell[][];
  pids: string[];
  gridExtra: Record<string, TtCell[]>;
  sum: [string, string, number][];
  unsure: string[];
  dups: string[];
  conf: number | null;
  notes: string;
  skipped: string[];
}
export interface OcrPage {
  text: string;
  cls: string;
  src: string;
  page: number;
  img?: string;
}
interface ParsedItem {
  sj: string;
  t: string;
  n: number;
  unk?: boolean;
  guess?: boolean;
}
interface TtCore {
  ttHintNames(D: RcData): Set<string>;
  ttGridRecheck(D: RcData, cls: string, known?: Set<string>): TtGrid | null;
  ttGridStore(D: RcData, cls: string, e: GridCheck, opt: { src?: string; known?: Set<string> }): TtGrid;
  ttGridCheck(D: RcData, ans: unknown): GridCheck;
  ttRename(D: RcData, from: string, to: string, opt?: { cls?: string; known?: Set<string> }): number;
  ttNameList(D: RcData, known?: Set<string>): { t: string; n: number; cls: string[]; sug: string }[];
  ttCellAt(D: RcData, cls: string, key: string): TtCellV | null;
  ttSubjNorm(s: string): string;
  ttParseAll(D: RcData, pages: OcrPage[], known: Set<string>): { cls: string; guessCls: boolean; list: ParsedItem[]; page: number; src: string }[];
  ttKnown(D: RcData): Set<string>;
  ttStore(D: RcData, cls: string, list: ParsedItem[], src?: string): void;
  ttClassNo(s: string): string;
  canonSubj(D: RcData, s: string): string;
  teaByName(D: RcData, n: string): Teacher | null;
  newTeacher(D: RcData, n: string, role: string): Teacher;
  DAYS: string[];
}
export const C = CORE as unknown as TtCore;

/* ───── tt.js（TTR）：題目、schema、估計、排隊、送一頁 ───── */
export interface TtRequest {
  images: string[];
  schema: unknown;
  temperature: number;
  system: string;
  prompt: string;
}
export type QueueStatus = "run" | "done" | "fail" | "wait" | "skip";
export type QueueRes<R> = { ok: true; v: R } | { ok: false; skip?: boolean; e: unknown };
export interface TtrApi {
  PERIODS: string[];
  request(img: string, names: Iterable<string>, subjects?: string[]): TtRequest;
  estimate(n: number, mode: string): { req: number; min: number; ntd: number };
  runQueue<T, R>(
    items: T[],
    fn: (x: T, i: number) => Promise<R>,
    o?: { conc?: number; retries?: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; onUpdate?: (i: number, st: QueueStatus, v: unknown, w?: number) => void },
  ): Promise<{ res: QueueRes<R>[]; halt: unknown }>;
  readPage(img: string, names: Iterable<string>, o: { D: RcData; signal?: AbortSignal; subjects?: string[]; timeout?: number; mode?: string }): Promise<{ e: GridCheck; logId?: string; model?: string }>;
}
export const TTR = TT_JS as unknown as TtrApi;

/* ───── 查詢 ───── */
export const ttOf = (D: RcData): Record<string, TtGrid> => (D.tt || {}) as Record<string, TtGrid>;
/** 班級排序：數字照大小，認不出的（?3）放最後（tt.js clsSort） */
export const clsSort = (a: string, b: string): number => (a[0] === "?" ? 1 : 0) - (b[0] === "?" ? 1 : 0) || a.localeCompare(b, undefined, { numeric: true });
/** 一班有幾處待核對（tt.js pend） */
export function pend(c: string, o: TtGrid): number {
  return o.grid
    ? o.ok
      ? 0
      : (o.flags || []).length
    : Object.values(o.subj || {})
        .flat()
        .filter((x) => x[2]).length + (c[0] === "?" || o.guessCls ? 1 : 0);
}
export const pendTotal = (D: RcData): number => Object.entries(ttOf(D)).reduce((a, [c, o]) => a + pend(c, o), 0);
export const hints = (D: RcData): Set<string> => C.ttHintNames(D);
/** 改過之後全部重算待核對（tt.js recheckAll） */
export function recheckAll(D: RcData): void {
  const K = hints(D);
  Object.keys(D.tt || {}).forEach((c) => C.ttGridRecheck(D, c, K));
}
/** 節次 id → 名稱（tt.js pname） */
export function pname(D: RcData, id: string): string {
  const p = D.periods.find((x) => String(x.id) === String(id));
  return p ? p.name : String(id);
}
/** 核對表的列：作息的每一節、讀入時的節次、作息沒有的（第8節）（tt.js rowsOf） */
export function rowsOf(D: RcData, o: TtGrid): string[] {
  const R: string[] = [],
    seen = new Set<string>(),
    P = o.pids || [];
  D.periods.forEach((p) => {
    const id = String(p.id);
    R.push(id);
    seen.add(id);
  });
  P.forEach((id) => {
    if (!seen.has(id)) {
      R.push(id);
      seen.add(id);
    }
  });
  Object.keys(o.gridExtra || {}).forEach((k) => {
    if (!seen.has(k)) {
      R.push(k);
      seen.add(k);
    }
  });
  return R;
}
/** 下一個待核對的班（after 之後；沒有就從頭）（tt.js nextPending） */
export function nextPending(D: RcData, after?: string): string {
  const tt = ttOf(D);
  const cls = Object.keys(tt)
    .sort(clsSort)
    .filter((c) => pend(c, tt[c]));
  if (!cls.length) return "";
  return cls.find((c) => clsSort(c, after || "") > 0) || cls[0];
}
/** 每一格的待核對說明：`${星期}|${節次}` → 說明（核對表標色用） */
export function flagsAt(o: TtGrid): { at: Record<string, string[]>; count: TtFlag[]; other: TtFlag[] } {
  const F = o.flags || [],
    at: Record<string, string[]> = {};
  F.forEach((f) => {
    if (f.d != null) (at[f.d + "|" + f.p] = at[f.d + "|" + f.p] || []).push(f.m);
  });
  return { at, count: F.filter((f) => f.k === "count"), other: F.filter((f) => f.d == null) };
}

/* ───── 改資料（都在 D 的副本上跑，寫回由呼叫的人做） ───── */
/** 讀好一頁：存進 D.tt[cls]（tt.js runJob 的 done） */
export function storeRead(D: RcData, cls: string, e: GridCheck, src: string, known: Set<string>): void {
  C.ttGridStore(D, cls, e, { src, known });
}
/** 這一頁存成哪一班：讀不出編號、或這次已經有一頁是這一班時用 ?頁碼（tt.js runJob） */
export function classKey(e: GridCheck, n: number, used: Set<string>): string {
  let c = e.cls || "?" + n;
  if (used.has(c)) c = "?" + n;
  used.add(c);
  return c;
}

export interface GridEdit {
  /** 班級欄（空白＝不改） */
  cls: string;
  /** 導師欄 */
  head: string;
  /** `${星期}|${節次}` → 格子裡的字（核對表的全部格子） */
  cells: Record<string, { s: string; t: string }>;
  /** 接受（不再列待核對） */
  accept: boolean;
}
/** 核對表存檔（tt.js saveCur，去掉畫面）。新的班級已經有課表時，要先問過再呼叫（會蓋掉）。回傳存成哪一班；沒有這一班回傳 null */
export function applyGridEdit(D: RcData, c: string, x: GridEdit): string | null {
  const tt = ttOf(D),
    o = tt[c];
  if (!o) return null;
  const nc = x.cls.trim() || c,
    head = x.head.trim();
  const cell: Record<string, { s: string; t: string }> = {};
  Object.keys(x.cells).forEach((k) => (cell[k] = { s: String(x.cells[k].s || "").trim(), t: String(x.cells[k].t || "").trim() }));
  const edited = new Set<string>();
  Object.keys(cell).forEach((k) => {
    const [d, p] = k.split("|"),
      v = cell[k],
      nv = v.s || v.t ? { s: C.ttSubjNorm(v.s), t: v.t.replace(/\s+/g, "") } : null,
      old = C.ttCellAt(D, c, d + "-" + p);
    if ((old ? old.s + "|" + old.t : "") === (nv ? nv.s + "|" + nv.t : "")) return;
    edited.add(k);
    const i = (o.pids || []).indexOf(p);
    if (i >= 0) o.grid![+d][i] = nv;
    else {
      o.gridExtra = o.gridExtra || {};
      const r = (o.gridExtra[p] = o.gridExtra[p] || [null, null, null, null, null]);
      r[+d] = nv;
      if (!r.some(Boolean)) delete o.gridExtra[p];
    }
  });
  o.unsure = (o.unsure || []).filter((k) => !edited.has(k));
  o.dups = (o.dups || []).filter((k) => !edited.has(k));
  const CH = () => (D.classHead = (D.classHead || {}) as Record<string, string>) as Record<string, string>;
  if (head !== (o.head || "")) {
    const h = CH();
    if (/^\d{3,4}$/.test(nc) && (!h[nc] || h[nc] === o.head)) h[nc] = head;
    o.head = head;
  }
  if (nc !== c) {
    delete tt[c];
    tt[nc] = o;
  }
  if (o.head && /^\d{3,4}$/.test(nc)) {
    const h = CH();
    if (!h[nc]) h[nc] = o.head;
  }
  if (x.accept) o.ok = 1;
  else if (edited.size) delete o.ok;
  D.tt = tt;
  recheckAll(D);
  return nc;
}
/** 還有待核對的班（全部接受之前先問） */
export const pendingClasses = (D: RcData): string[] => Object.keys(ttOf(D)).filter((c) => pend(c, ttOf(D)[c]));
/** 全部接受（tt.js acceptAll，確認之後）。回傳幾班 */
export function acceptAll(D: RcData): number {
  const tt = ttOf(D),
    cls = pendingClasses(D);
  if (!cls.length) return 0;
  cls.forEach((c) => {
    const o = tt[c];
    if (o.grid) o.ok = 1;
    else Object.values(o.subj || {}).forEach((a) => a.forEach((x) => (x[2] = 0)));
  });
  recheckAll(D);
  return cls.length;
}
/** 名字一次改：「名字沒錯」（新老師）以後不再標出來 */
export function keepName(D: RcData, from: string): void {
  D.ttOk = [...new Set(((D.ttOk as string[]) || []).concat([from]))];
  recheckAll(D);
}
/** 名字一次改：「全部改」。回傳改了幾格 */
export function renameName(D: RcData, from: string, to: string): number {
  const n = C.ttRename(D, from, to);
  recheckAll(D);
  return n;
}
/** 清除課表 */
export function clearTT(D: RcData): void {
  D.tt = {};
}

/* ───── 用課表更新任課老師（app.js ttApplyCS） ───── */
const CS_SUBJ: [string, string][] = [
  ["國語文", "國文"],
  ["英語文", "英文"],
  ["數學", "數學"],
  ["理化", "理化"],
];
/** 會改哪些：[班級, 科目, 老師姓名]（名單上沒有、待核對的不算） */
export function csList(D: RcData): [string, string, string][] {
  const tt = ttOf(D),
    list: [string, string, string][] = [];
  Object.keys(tt)
    .filter((c) => /^\d{3,4}$/.test(c))
    .forEach((c) =>
      CS_SUBJ.forEach(([a, b]) => {
        const x = ((tt[c].subj || {})[a] || [])[0];
        if (!x || x[2]) return;
        list.push([c, b, x[0]]);
      }),
    );
  return list;
}
/** 套用（確認之後）：名冊沒有的老師新增成普通班老師。回傳改了幾格 */
export function applyCS(D: RcData, list: [string, string, string][]): number {
  let n = 0;
  list.forEach(([c, b, name]) => {
    name = String(name || "").trim();
    if (!name) return;
    const t = C.teaByName(D, name) || C.newTeacher(D, name, "普通班"),
      k = c + "|" + C.canonSubj(D, b);
    if (D.classSubj[k] !== t.id) {
      D.classSubj[k] = t.id;
      n++;
    }
  });
  return n;
}

/* ───── 和名冊對照（tt.js rosterHtml） ───── */
export const TT_COL: [string, string | string[]][] = [
  ["國語文", "國文"],
  ["英語文", "英文"],
  ["數學", "數學"],
  ["社會", ["歷史", "地理", "公民與社會"]],
  ["自然", ["生物", "理化", "地球科學", "地科"]],
];
/** 一欄要看哪幾科（rosterHtml 的 x[1]==='國文'||… ? x[0] : x[1]） */
export function colSubj(x: [string, string | string[]]): string[] {
  const v = x[1] === "國文" || x[1] === "英文" || x[1] === "數學" ? x[0] : x[1];
  return Array.isArray(v) ? v : [v];
}
/** 一格：每一科節數最多的老師（app.js ttCell）。flag：0 確定、1 認不出、2 推測 */
export function cellOf(o: TtGrid | undefined, subs: string[]): { s: string; t: string; n: number; flag: number }[] {
  if (!o) return [];
  return subs.flatMap((s) => ((o.subj || {})[s] || []).slice(0, 1).map((x) => ({ s, t: x[0], n: x[1], flag: x[2] || 0 })));
}
export function rosterCheck(D: RcData): { stuCls: string[]; noTT: string[]; diff: string[] } {
  const tt = ttOf(D),
    cls = Object.keys(tt).sort(clsSort);
  const stuCls = [...new Set(D.students.map((s) => String(s.cls)).filter((c) => /^\d{3,4}$/.test(c)))].sort(),
    noTT = stuCls.filter((c) => !tt[c]);
  const diff: string[] = [],
    tn = (id: string) => D.teachers.find((x) => x.id === id)?.name || "";
  cls.forEach((c) =>
    CS_SUBJ.forEach(([a, b]) => {
      const k = c + "|" + C.canonSubj(D, b),
        x = ((tt[c].subj || {})[a] || [])[0];
      if (!x || x[2]) return;
      const cur = D.classSubj[k] ? tn(D.classSubj[k]) : "";
      if (cur !== x[0]) diff.push(c + b + "：" + (cur || "沒填") + " → " + x[0]);
    }),
  );
  return { stuCls, noTT, diff };
}

/* ───── 只有統計的班（離線辨識）的核對（app.js ttEdit／ttEditOk） ───── */
export type SumRow = [string, string, string | number, number?];
/** 核對表的列：[科目, 老師, 節數, 待確認] */
export function sumRows(o: TtGrid): SumRow[] {
  return Object.keys(o.subj || {}).flatMap((s) => o.subj[s].map((x) => [s, x[0], x[1], x[2]] as SumRow));
}
/** 存檔：整列清空就刪掉；改成另一個已有課表的班級會蓋掉（先問過）。回傳存成哪一班 */
export function saveSummary(D: RcData, c: string, ncRaw: string, rows: SumRow[]): string | null {
  const tt = ttOf(D);
  if (!tt[c]) return null;
  const nc = ncRaw.trim() || c,
    list: ParsedItem[] = [];
  rows.forEach((r) => {
    const v = [r[0], r[1], r[2]].map((x) => String(x == null ? "" : x).trim());
    if (v[0] && v[1]) list.push({ sj: v[0], t: v[1], n: +v[2] || 1, unk: false });
  });
  const src = tt[c].src;
  delete tt[c];
  D.tt = tt;
  C.ttStore(D, nc, list, src);
  return nc;
}

/* ───── 離線辨識（app.js readTT）：文字 PDF 直接讀文字；掃描檔用 Tesseract 讀下方統計（畫面在 lib/nx/ttRead.ts） ───── */
export interface PdfTextItem {
  str: string;
  transform: number[];
}
/** 這一頁是文字 PDF（字夠多）嗎 */
export function isTextPage(items: PdfTextItem[]): boolean {
  return items.filter((i) => i.str.trim()).reduce((a, i) => a + i.str.length, 0) > 80;
}
/** 文字 PDF 的一頁：依位置排成一行一行，從「總時數／編號」以下讀統計；班級取「編號：」或「班級：」後面的數字 */
export function textPage(items0: PdfTextItem[], src: string, page: number): OcrPage {
  const items = items0.filter((i) => i.str.trim());
  const rows: { y: number; it: PdfTextItem[] }[] = [];
  items.forEach((i) => {
    const y = Math.round(i.transform[5] / 3);
    let r = rows.find((o) => Math.abs(o.y - y) <= 1);
    if (!r) rows.push((r = { y, it: [] }));
    r.it.push(i);
  });
  const lines = rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.it
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str)
        .join(" "),
    );
  const all = lines.join("\n"),
    k = lines.findIndex((l) => /總時數|編\s*號/.test(l));
  const no = (all.match(/編\s*號[:：\s]*(\d{3,4})/) || all.match(/班\s*級[:：\s]*(\d{3,4})/) || [])[1] || "";
  return { text: (k >= 0 ? lines.slice(k) : lines).join("\n"), cls: C.ttClassNo(no), src, page };
}
/** 讀完全部的頁：整份一起比對（ttParseAll）、存進 D.tt。回傳幾頁、幾頁認不出班級、各班的圖 */
export function storeOcr(D: RcData, pages: OcrPage[]): { n: number; miss: number; imgs: Record<string, string> } {
  const R = C.ttParseAll(D, pages, C.ttKnown(D));
  let miss = 0;
  const imgs: Record<string, string> = {};
  R.forEach((o, i) => {
    const cls = o.cls || "?" + (i + 1);
    if (!o.cls) miss++;
    C.ttStore(D, cls, o.list, o.src);
    (ttOf(D)[cls] as TtGrid).guessCls = o.guessCls ? 1 : 0;
    const img = pages[o.page] && pages[o.page].img;
    if (img) imgs[cls] = img;
  });
  return { n: R.length, miss, imgs };
}

/* ───── 讀圖的工作（tt.js runJob 去掉畫面）：同時兩頁，讀好一頁存一頁，最後全部重算待核對 ───── */
export type PageSt = "" | QueueStatus;
export interface TtPage {
  n: number;
  img: string;
  src: string;
  st: PageSt;
  cls?: string;
  msg?: string;
}
export interface JobHooks {
  /** 送一頁（預設 TTR.readPage） */
  read: (p: TtPage) => Promise<{ e: GridCheck; logId?: string }>;
  /** 讀好一頁：存（cls 已經決定好） */
  store: (cls: string, e: GridCheck, p: TtPage, logId?: string) => void;
  /** 有存過任何一頁：最後全部重算 */
  finish: () => void;
  signal: AbortSignal;
  onUpdate?: () => void;
  sleep?: (ms: number) => Promise<void>;
  msgOf?: (e: unknown) => string;
}
export async function runPages(P: TtPage[], h: JobHooks): Promise<{ ok: number; bad: number; halt: unknown; stopped: boolean }> {
  const used = new Set<string>();
  let any = false;
  P.forEach((p) => {
    if (p.st !== "done") p.st = "";
  });
  const todo = P.filter((p) => p.st !== "done");
  const msg = (v: unknown) => (h.msgOf ? h.msgOf(v) : String((v as { message?: string })?.message || ""));
  const r = await TTR.runQueue(todo, (p) => h.read(p), {
    conc: 2,
    signal: h.signal,
    sleep: h.sleep,
    onUpdate: (i, st, v, w) => {
      const p = todo[i];
      if (st === "done") {
        const x = v as { e: GridCheck; logId?: string };
        const c = classKey(x.e, p.n, used);
        any = true;
        h.store(c, x.e, p, x.logId);
        p.cls = c;
        p.msg = "";
      } else if (st === "wait") p.msg = (v ? msg(v) : "") + "（" + w + " 秒後再試）";
      else if (st === "fail" || st === "skip") p.msg = v ? msg(v) : "";
      p.st = st;
      h.onUpdate?.();
    },
  });
  if (any) h.finish();
  const ok = P.filter((p) => p.st === "done").length;
  return { ok, bad: P.length - ok, halt: r.halt, stopped: h.signal.aborted };
}

/* 「問題」與「一鍵建議」（排課 ① 開課、② 編組、個管分配、學校資料 ④ 不排課時段／⑤ 教室與作息）。
   都是純函式、在舊格式 D 上做（和 lib/nx/sched.ts 一樣），只用 core.js 已有的 compile／evaluate／candidates／needList／otSummary；
   建議一律回傳「要怎麼改」的清單，由畫面給人看過、勾選後才套用（套用也是一般的 edit → planOnD → applyOps，可以復原）。 */
import { CORE, type Problem } from "../core";
import type { RcData, Student } from "../types";
import { stateOf, X } from "./sched";

/** 一筆問題：text 是畫面上的一行；lvl＝err（會排不出來、衝突）或 warn（提醒）；at＝點了之後要捲過去的地方 */
export interface Prob {
  lvl: "err" | "warn";
  text: string;
  at?: string;
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const stuLab = (s: Student | undefined) => (s ? s.cls + (s.seat ? "-" + String(s.seat).padStart(2, "0") : "") + " " + s.name : "");

/** 現在的課表（有草稿看草稿，和 ③ 排課表一樣）的問題，不含「還沒排」 */
export function schedProblems(D: RcData, draft = true): Problem[] {
  const M = CORE.compile(D);
  const out: Problem[] = [];
  CORE.evaluate(M, stateOf(M, D, draft).slot, out);
  return out.filter((o) => o.k !== "un");
}

/* ───── ① 開課 ───── */
interface OtRow {
  id: string;
  name: string;
  over: boolean;
  ot: number;
  otMax: number | null;
  cap: number;
}
/** ① 開課的問題：每門課的提醒（時段不夠、沒有老師、原班任課老師…）、超過超鐘點上限、應授不夠、認領待確認 */
export function openProblems(D: RcData): Prob[] {
  const M = CORE.compile(D);
  const out: Prob[] = [];
  const OS = X.otSummary(D) as { want: number; due: number; short: number; open: string[]; rows: OtRow[] };
  if (OS.short > 0) out.push({ lvl: "err", text: "需要 " + OS.want + " 節，應授合計只有 " + OS.due + " 節，缺 " + OS.short + " 節" });
  OS.rows.forEach((r) => {
    if (r.over) out.push({ lvl: "err", text: r.name + " 超鐘點 " + r.ot + " 節，超過上限", at: "t-" + r.id });
  });
  const pend = X.claimsPending(D) as { gid: string }[];
  const pg = new Set(pend.map((c) => c.gid));
  if (pg.size) out.push({ lvl: "warn", text: pg.size + " 門課有老師認領，還沒核准" });
  D.groups.forEach((g, i) => {
    if (g.on === false) return;
    const c = M.G[i];
    if (!c) return;
    c.warn
      .filter((w) => w !== "還沒有學生")
      .forEach((w) => out.push({ lvl: /不夠|沒辦法|還沒指定資源班老師/.test(w) ? "err" : "warn", text: (g.name || "（沒有課名）") + "：" + w, at: "g-" + g.id }));
  });
  return out;
}

/* ───── ② 編組 ───── */
/** ② 編組的問題：待安排、找不到課、年級不合的課、課表上同時在兩組（學生衝堂） */
export function needProblems(D: RcData): Prob[] {
  const out: Prob[] = [];
  const byId = new Map(D.students.map((s) => [s.id, s]));
  const pend = X.needList(D) as { id: string; subject: string }[];
  const none = pend.filter((n) => !(X.candidates(D, byId.get(n.id), n.subject) as unknown[]).length);
  const wait = pend.length - none.length;
  if (wait) out.push({ lvl: "warn", text: "待安排 " + new Set(pend.filter((n) => !none.includes(n)).map((n) => n.id)).size + " 人・" + wait + " 科" });
  none.forEach((n) => out.push({ lvl: "err", text: stuLab(byId.get(n.id)) + " 的" + n.subject + "沒有同年級的課可以去", at: "s-" + n.id }));
  D.groups.forEach((g) => {
    if (g.on === false) return;
    g.students.forEach((sid) => {
      const s = byId.get(sid);
      if (s && !(X.candidates(D, s, g.subject) as unknown[]).includes(g)) out.push({ lvl: "warn", text: stuLab(s) + " 在 " + g.name + "（年級不同）", at: "s-" + sid });
    });
  });
  schedProblems(D)
    .filter((p) => p.k === "student")
    .forEach((p) => out.push({ lvl: "err", text: p.m }));
  return out;
}

export interface Move {
  sid: string;
  subject: string;
  from: string;
  to: string;
  text: string;
}
/** 課表上的衝突數（不含還沒排）：編組建議用來比較 */
function clashCount(D: RcData): number {
  return schedProblems(D).length;
}
/** 一鍵建議（② 編組）：把「同時在兩組」或「年級不同」的學生換到同科目、衝突更少的課。
   一位一位試：只有換過去之後課表的衝突變少（年級不同的：不變多）才換；回傳要換的清單，不改 D。 */
export function regroupMoves(D: RcData): Move[] {
  const W = clone(D);
  const byId = new Map(W.students.map((s) => [s.id, s]));
  const moves: Move[] = [];
  let base = clashCount(W);
  const tryMove = (sid: string, gi: number, strict: boolean) => {
    const g = W.groups[gi],
      s = byId.get(sid);
    if (!s || !g.students.includes(sid)) return;
    const cands = (X.candidates(W, s, g.subject) as typeof W.groups).filter((c) => c !== g && !c.students.includes(sid));
    const keep = g.students.slice();
    g.students = keep.filter((x) => x !== sid);
    let best: (typeof W.groups)[number] | null = null,
      bv = strict ? base - 1 : base; // strict：衝突一定要變少；年級不同的：不變多就好
    cands.forEach((c) => {
      c.students.push(sid);
      const v = clashCount(W);
      c.students.pop();
      if (v <= bv && (v < bv || !best || c.students.length < best.students.length)) {
        bv = v;
        best = c;
      }
    });
    if (!best) {
      g.students = keep;
      return;
    }
    const to: (typeof W.groups)[number] = best;
    to.students.push(sid);
    base = bv;
    moves.push({ sid, subject: g.subject, from: g.id, to: to.id, text: stuLab(s) + "：" + g.name + " → " + to.name });
  };
  // 1) 年級不同的
  W.groups.forEach((g, gi) => {
    if (g.on === false) return;
    [...g.students].forEach((sid) => {
      const s = byId.get(sid);
      if (s && !(X.candidates(W, s, g.subject) as unknown[]).includes(g)) tryMove(sid, gi, false);
    });
  });
  // 2) 課表上同時在兩組的（每一輪重新算一次問題，最多 3 輪）
  for (let pass = 0; pass < 3; pass++) {
    const n0 = moves.length;
    // 撞到的是兩組：問題只記在其中一組，所以同一格的另一組也要試（只試兩組都有的學生）
    const M = CORE.compile(W),
      slot = stateOf(M, W, true).slot;
    const todo: [string, number][] = [];
    schedProblems(W)
      .filter((p) => p.k === "student")
      .forEach((p) => {
        const a = W.groups[p.g];
        M.L.forEach((x, l) => {
          if (slot[l] !== p.s || x.g === p.g) return;
          const b = W.groups[x.g];
          b.students.filter((id) => a.students.includes(id)).forEach((id) => todo.push([id, p.g], [id, x.g]));
        });
      });
    todo.forEach(([sid, gi]) => tryMove(sid, gi, true));
    if (moves.length === n0) break;
  }
  return moves;
}
/** 套用勾選的換組（照順序；學生已經不在原本那一組的跳過）。回傳換了幾位 */
export function applyRegroup(D: RcData, moves: Move[]): number {
  let n = 0;
  moves.forEach((m) => {
    const a = D.groups.find((g) => g.id === m.from),
      b = D.groups.find((g) => g.id === m.to);
    if (!a || !b || !a.students.includes(m.sid)) return;
    a.students = a.students.filter((x) => x !== m.sid);
    if (!b.students.includes(m.sid)) b.students.push(m.sid);
    n++;
  });
  return n;
}

/* ───── 個管分配 ───── */
/** 個管分配的問題：沒有個管、個管不是資源班老師、設定不當個管的人還有學生、超過上限 */
export function cmProblems(D: RcData): Prob[] {
  const out: Prob[] = [];
  const tById = new Map(D.teachers.map((t) => [t.id, t]));
  const none = D.students.filter((s) => !s.caseMgr);
  if (none.length) out.push({ lvl: "err", text: none.length + " 位學生沒有個管" });
  D.students.forEach((s) => {
    if (!s.caseMgr) return;
    const t = tById.get(s.caseMgr);
    if (!t) out.push({ lvl: "err", text: stuLab(s) + " 的個管不在老師名單裡" });
    else if (t.role !== "資源班") out.push({ lvl: "warn", text: stuLab(s) + " 的個管 " + t.name + " 不是資源班老師" });
  });
  const cnt = new Map<string, number>();
  D.students.forEach((s) => s.caseMgr && cnt.set(s.caseMgr, (cnt.get(s.caseMgr) || 0) + 1));
  D.teachers.forEach((t) => {
    const x = t as typeof t & { cmCap?: number; noCM?: boolean };
    const n = cnt.get(t.id) || 0;
    if (x.noCM && n) out.push({ lvl: "warn", text: t.name + " 設定不當個管，還有 " + n + " 位" });
    else if (+(x.cmCap || 0) > 0 && n > +x.cmCap!) out.push({ lvl: "warn", text: t.name + " 個管 " + n + " 位，超過上限 " + x.cmCap });
  });
  return out;
}

/* ───── 學校資料：改了以後，已經排好的課表有沒有衝突 ───── */
/** 正式課表（不看草稿）上這幾種問題：④ 不排課時段看 off、⑤ 教室與作息看 room 與 off */
export function impactProblems(D: RcData, kinds: string[]): Prob[] {
  const seen = new Map<string, number>();
  schedProblems(D, false)
    .filter((p) => kinds.includes(p.k))
    .forEach((p) => seen.set(p.m, (seen.get(p.m) || 0) + 1));
  return [...seen].map(([m, n]) => ({ lvl: "err" as const, text: m + (n > 1 ? "（" + n + " 節）" : "") }));
}

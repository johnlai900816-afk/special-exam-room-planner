/* 管理者的點名：出缺席紀錄（attStats）、掃卡找學生（ciScan）、學生卡（renderCards）、導師週報（weeklySummary＋用 AI 潤飾）。
   行為照舊版 checkin.js 與 extras.js（weeklyPage、aiPolish），資料改成分拆後的 records：點名一節一份 attendance/{日期_課程@節次}。
   舊版 rc/att-日期 的 { `${gid}@${pid}`: { 學生id: 紀錄, _roster, _info } } 對應到文件的 marks、roster、info（functions/nx-split.js splitAttendance）。
   單元測試：test/checkin.test.ts（舊版 checkin.js 原文放沙盒，同一份資料比對）。 */
import { AI, type AiReq } from "../ai";
import { CORE } from "../core";
import { NX } from "../legacy";
import type { AttendanceDoc } from "../model";
import type { Board } from "../schedule";
import type { RcData, Student } from "../types";
import { addDays, isOver, ST_NAME } from "./today";

/** 舊版 esc（同一個轉義，學生卡的 HTML 才會逐字相同） */
export const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 舊版 sortStu：班級、座號、姓名 */
export const sortStu = (a: Pick<Student, "cls" | "seat" | "name">, b: Pick<Student, "cls" | "seat" | "name">): number =>
  String(a.cls).localeCompare(String(b.cls)) || (+a.seat || 0) - (+b.seat || 0) || String(a.name).localeCompare(String(b.name));

/* ───── 出缺席紀錄 ───── */
export interface AttRow {
  date: string;
  p: string;
  g: string;
  st: string;
  tin: string;
  tout: string;
  note: string;
}
export interface AttStat {
  exp: number;
  in: number;
  late: number;
  leave: number;
  abs: number;
  rows: AttRow[];
}

/** 有點過名的那一節（舊版沒有任何學生紀錄的 key 會被刪掉，新版文件可能留著空的 marks） */
const taken = (a: AttendanceDoc | undefined): a is AttendanceDoc => !!a && !!a.marks && Object.keys(a.marks).length > 0;

/**
 * 舊版 checkin.js attStats，改讀一節一份的點名文件。
 * 只算「有點過名」的節次（放假、停課不算缺席）；有點名但沒簽到也沒請假的算缺席，課還沒上完的不算。
 * 應到的人：文件有 roster（舊 _roster）就照點名當時的名單；舊紀錄沒有的話，只從這位學生在這一組第一次有紀錄的那天開始算。
 * 組別被清掉（新學期）時用文件裡存的組名（info.g、info.p）。today、hm＝現在（舊版直接讀時鐘）。
 */
export function attStats(att: Record<string, AttendanceDoc>, D: Pick<RcData, "groups" | "periods">, from: string, to: string, gid: string, today: string, hm: string): Record<string, AttStat> {
  const by: Record<string, AttStat> = {};
  const first: Record<string, string> = {};
  const docs = Object.values(att || {}).filter(taken);
  docs.forEach((a) =>
    Object.keys(a.marks).forEach((sid) => {
      const k = a.gid + "|" + sid;
      if (!first[k] || a.date < first[k]) first[k] = a.date;
    }),
  );
  docs
    .filter((a) => a.date >= from && a.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .forEach((a) => {
      const id = a.gid;
      const info = (a.info || {}) as { g?: string; p?: string };
      const g = D.groups.find((x) => x.id === id);
      const p = D.periods.find((x) => x.id === a.pid);
      if ((!g && !info.g) || (gid && id !== gid)) return;
      const done = !p || isOver(a.date, p, today, hm);
      const roster = Array.isArray(a.roster) ? a.roster : g ? g.students.filter((sid) => first[id + "|" + sid] && first[id + "|" + sid] <= a.date) : [];
      new Set(roster.concat(Object.keys(a.marks))).forEach((sid) => {
        const r = a.marks[sid] as (AttendanceDoc["marks"][string] & { tin?: string; tout?: string; note?: string }) | undefined;
        if (!r && !done) return;
        const o = (by[sid] = by[sid] || { exp: 0, in: 0, late: 0, leave: 0, abs: 0, rows: [] });
        const st = r ? r.st : "abs";
        o.exp++;
        if (st === "in" || st === "late") o.in++;
        if (st === "late") o.late++;
        if (st === "leave") o.leave++;
        if (st === "abs") o.abs++;
        o.rows.push({
          date: a.date,
          p: p ? p.name : info.p || "",
          g: g ? g.name : (info.g as string),
          st: r ? ST_NAME[r.st] : "未到",
          tin: r ? (r.tin as string) : "",
          tout: r ? (r.tout as string) : "",
          note: r ? (r.note as string) : "",
        });
      });
    });
  return by;
}

/** 出席率（請假不算在分母）；沒有可算的回傳 '—' */
export const attRate = (o: { exp: number; in: number; leave: number }): string => (o.exp - o.leave > 0 ? Math.round((o.in / (o.exp - o.leave)) * 100) + "%" : "—");

/** 每一組的合計（從每位學生的明細加總；組名照明細，組別被刪掉的也算得到） */
export function groupStats(by: Record<string, AttStat>): { g: string; n: number; exp: number; in: number; late: number; leave: number; abs: number }[] {
  const m = new Map<string, { g: string; sids: Set<string>; exp: number; in: number; late: number; leave: number; abs: number }>();
  Object.entries(by).forEach(([sid, o]) =>
    o.rows.forEach((r) => {
      const x = m.get(r.g) || { g: r.g, sids: new Set<string>(), exp: 0, in: 0, late: 0, leave: 0, abs: 0 };
      x.sids.add(sid);
      x.exp++;
      if (r.st === "已到" || r.st === "遲到") x.in++;
      if (r.st === "遲到") x.late++;
      if (r.st === "請假") x.leave++;
      if (r.st === "缺席" || r.st === "未到") x.abs++;
      m.set(r.g, x);
    }),
  );
  return [...m.values()].map(({ sids, ...x }) => ({ ...x, n: sids.size })).sort((a, b) => String(a.g).localeCompare(String(b.g)));
}

export type LogRange = "day" | "week" | "month" | "all" | "custom";
export const LOG_RANGES: [LogRange, string][] = [
  ["day", "今天"],
  ["week", "本週"],
  ["month", "本月"],
  ["all", "全部"],
  ["custom", "自訂"],
];
/** 舊版 logSpan：今天、本週（週一起）、本月、全部、自訂 */
export function logSpan(range: LogRange, from: string, to: string, today: string): [string, string] {
  if (range === "day") return [today, today];
  if (range === "week") {
    const d = new Date(today + "T00:00:00").getDay();
    return [addDays(today, -((d + 6) % 7)), today];
  }
  if (range === "month") return [today.slice(0, 8) + "01", today];
  if (range === "all") return ["0000-00-00", "9999-99-99"];
  return [from || today, to || today];
}

/* ───── 掃卡或輸入學生 ───── */
/** 舊版 ciScan 找學生：學生卡（RC:id）→ 班級座號（70103、7013）→ 姓名 → 姓名的一部分 */
export function findStudents(students: Student[], text: string): { q: string; hit: Student[] } {
  const q = String(text || "")
    .trim()
    .replace(/^RC:/, "");
  if (!q) return { q, hit: [] };
  let hit = students.filter((s) => s.id === q);
  if (!hit.length && /^\d{4,6}$/.test(q)) hit = students.filter((s) => String(s.cls) + String(s.seat).padStart(2, "0") === q || String(s.cls) + String(+s.seat) === q);
  if (!hit.length) hit = students.filter((s) => s.name === q);
  if (!hit.length) hit = students.filter((s) => s.name && s.name.includes(q));
  return { q, hit };
}

/* ───── 學生卡 ───── */
/** 範圍：''＝全部、班級、'g:'＋課程 id（舊版 cardFilter） */
export function cardList(D: Pick<RcData, "students" | "groups">, filter: string): Student[] {
  const inGroup = filter.startsWith("g:") ? new Set((D.groups.find((g) => g.id === filter.slice(2)) || { students: [] as string[] }).students) : null;
  return D.students.filter((s) => s.name && (!filter || (inGroup ? inGroup.has(s.id) : String(s.cls) === filter))).sort(sortStu);
}
/** 學生卡的紙（舊版 renderCards 的 #outArea.cardsheet 裡面，一字不差）；QR 之後由 qrcodejs 畫進 .qr */
export function cardsHtml(D: Pick<RcData, "students" | "groups" | "title">, filter: string): string {
  return cardList(D, filter)
    .map(
      (s) =>
        `<div class="scard"><div class="qr" data-t="RC:${esc(s.id)}"></div><div><small>${esc(s.cls)} 班　${esc(s.seat)} 號</small><b>${esc(s.name)}</b><span>${esc(D.title || "資源班")}</span></div></div>`,
    )
    .join("");
}

/* ───── 導師週報 ───── */
export interface WeekRow {
  date: string;
  pi: number;
  pid: string;
  pname: string;
  gid: string;
  gname: string;
  subject: string;
  st: string;
  tin: string;
  note: string;
  future: boolean;
}
export interface WeekStu {
  id: string;
  cls: string;
  seat: string;
  name: string;
  rows: WeekRow[];
  c: { n: number; in: number; late: number; leave: number; abs: number; none: number; future: number };
}
export interface WeekClass {
  cls: string;
  head: string;
  students: WeekStu[];
}
export interface Weekly {
  weekStart: string;
  weekEnd: string;
  dates: string[];
  classes: WeekClass[];
}
type CW = {
  weeklySummary(D: RcData, ATT: unknown, ws: string, opt: { today: string; M: Board["M"]; slot: Int16Array }): Weekly;
  weeklyText(W: Weekly, c: WeekClass, opt: { from: string }): string;
  weekStartOf(s: string): string;
};
export const CWK = CORE as unknown as CW;

/** 那一週（週一～週五）的導師週報：core.js weeklySummary，點名文件先組回舊的一天一份格式（joinAttendance） */
export function weeklyOf(D: RcData, att: Record<string, AttendanceDoc>, ws: string, today: string, board: Board): Weekly {
  return CWK.weeklySummary(D, NX.joinAttendance(att), ws, { today, M: board.M, slot: board.S.slot });
}
export const weekStartOf = (s: string): string => CWK.weekStartOf(s);
export const weeklyText = (W: Weekly, c: WeekClass, from: string): string => CWK.weeklyText(W, c, { from });
/** 這一週標記為已發送了嗎（舊版 D.weekly[週一]；新版在 staff/legacy） */
export const weeklySent = (D: RcData, ws: string): boolean => !!((D.weekly as Record<string, unknown> | undefined) || {})[ws];
/** 改「已發送」（在 planOnD 的 D 上跑） */
export function setWeeklySent(D: RcData, ws: string, on: boolean): void {
  if (!D.weekly || typeof D.weekly !== "object") D.weekly = {};
  const w = D.weekly as Record<string, boolean>;
  if (on) w[ws] = true;
  else delete w[ws];
}

export const WEEKLY_SYS =
  "你是國中資源班老師的文書助理。把老師寫好的週報改成要用 LINE 傳給導師的訊息：口吻親切有禮、精簡、條列清楚。不可以加入原文沒有的事實或建議；「學生A」「導師」這類代號和日期、節次照抄不要改。只回覆改好的訊息本文。";

/** 用 AI 潤飾（舊版 aiPolish）：學生和導師換成代號，再整段去識別化（ai.js finalize）。回傳要送的內容與代號對照 */
export function weeklyAiRequest(D: RcData, c: WeekClass, text: string, names: boolean): { req: AiReq; pairs: [string, string][] } {
  const pairs: [string, string][] = [];
  c.students.forEach((s, i) => {
    if (s.name) pairs.push([String(s.name), "學生" + String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "")]);
  });
  if (c.head) pairs.push([String(c.head), "導師"]);
  pairs.sort((a, b) => b[0].length - a[0].length);
  let t = text;
  pairs.forEach(([n, code]) => (t = t.split(n).join(code)));
  let req: AiReq = { system: WEEKLY_SYS, prompt: t };
  try {
    req = (AI as unknown as { finalize(D: RcData, r: AiReq, o: { names: boolean }): AiReq }).finalize(D, req, { names });
  } catch {
    /* 舊版也是略過 */
  }
  return { req, pairs };
}
/** AI 回來的文字：代號換回名字（只在本機畫面上） */
export function weeklyAiRestore(D: RcData, text: string, pairs: [string, string][]): string {
  let out = String(text || "").trim();
  pairs
    .slice()
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([n, code]) => (out = out.split(code).join(n)));
  try {
    out = AI.unscrub(D, out);
  } catch {
    /* 略過 */
  }
  return out;
}

/** 管理者今天的待辦（舊版 renderHome 的點名、extras.js weeklyTodo）：這一節還沒簽到的人、週一提醒上週週報 */
export function checkTodos(x: { D: RcData; board: Board; att: Record<string, AttendanceDoc>; today: string; hm: string; dow: number; sessions: { p: { name: string; start: string; end: string }; sids: string[]; aid: string }[] }) {
  const out: { level: "warn"; text: string; act: string; href: string }[] = [];
  const cur = x.sessions.filter((s) => x.hm >= s.p.start && x.hm < s.p.end);
  const miss = cur.reduce((n, s) => n + s.sids.filter((sid) => !x.att[s.aid]?.marks?.[sid]).length, 0);
  if (miss) out.push({ level: "warn", text: cur[0].p.name + " 還有 " + miss + " 人沒簽到", act: "點名", href: "/admin/checkin/" });
  if (x.dow === 1) {
    const ws = weekStartOf(addDays(x.today, -7));
    const any = Object.values(x.D.assign || {}).some((a) => (a || []).some((e) => e && e.s));
    if (!weeklySent(x.D, ws) && any) out.push({ level: "warn", text: "上週導師週報還沒發", act: "點名", href: "/admin/checkin/?tab=weekly&w=" + ws });
  }
  return out;
}

/* 老師的「今天」與「點名」：照正式課表找出我的課、現在這一節、待辦。純函式，單元測試在 test/teacher.test.ts。
   行為照舊版 teacher.js（rToday）與 checkin.js（sessionsOn、countIn、attStats），資料改成分拆後的 records（點名一節一份文件）。 */
import { IEP } from "../iep";
import type { AttendanceDoc, IepInviteDoc } from "../model";
import type { Board } from "../schedule";
import { TEACH } from "../teach";
import type { Period, RcData } from "../types";
import { owedInvites, readyRounds, upcomingMeets, type Upcoming } from "./iepSync";

export const ST_NAME: Record<string, string> = { in: "已到", late: "遲到", leave: "請假", abs: "缺席" };

export const ymd = (d: Date): string =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const hmOf = (d: Date): string => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
export const hm2m = (s: string): number => {
  const a = String(s || "0:0").split(":");
  return +a[0] * 60 + (+a[1] || 0);
};
export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}
/** 週一＝0 … 週五＝4；週末 -1 */
export function dowOf(date: string): number {
  const d = new Date(date + "T00:00:00").getDay();
  return d >= 1 && d <= 5 ? d - 1 : -1;
}
export function dateLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.getMonth() + 1 + " 月 " + d.getDate() + " 日 週" + "日一二三四五六"[d.getDay()];
}
export const md = (v: string): string => {
  const d = new Date(v + "T00:00:00");
  return d.getMonth() + 1 + "/" + d.getDate();
};

/** 一節課（某一天、某一門課、某一節） */
export interface Ses {
  date: string;
  pi: number;
  p: Period;
  gid: string;
  name: string;
  teacherId: string;
  room: string;
  /** 照課表該來的學生 id（老師讀得到的） */
  sids: string[];
  /** `${gid}@${pid}`（舊 rc/att-日期 的 key） */
  key: string;
  /** 點名文件 id：`${date}_${gid}@${pid}` */
  aid: string;
}

/** 某一天照正式課表的課；tid 有給就只留這位老師帶的 */
export function sessionsOn(board: Board, date: string, tid?: string): Ses[] {
  const { M, S, room } = board;
  const d = dowOf(date);
  const out: Ses[] = [];
  if (d < 0) return out;
  M.L.forEach((x, l) => {
    const s = S.slot[l];
    if (s < 0 || Math.floor(s / M.NP) !== d) return;
    const g = M.G[x.g];
    if (tid && g.ref.teacher !== tid) return;
    const pi = s % M.NP;
    const p = M.P[pi];
    const key = g.ref.id + "@" + p.id;
    out.push({
      date,
      pi,
      p,
      gid: g.ref.id,
      name: g.name,
      teacherId: g.ref.teacher,
      room: room[l] >= 0 ? M.D.rooms[room[l]].name : "",
      sids: g.stu.map((i) => M.D.students[i].id),
      key,
      aid: date + "_" + key,
    });
  });
  return out.sort((a, b) => a.pi - b.pi || a.name.localeCompare(b.name));
}

/** 現在是第幾節（periods 的索引）；不在任何一節裡回傳 -1 */
export function currentPeriod(periods: Period[], hm: string): number {
  return periods.findIndex((p) => hm >= p.start && hm < p.end);
}

/** 預設要點哪一節：今天＝還沒結束的第一節（都結束了就最後一節）；別天＝第一節 */
export function defaultPid(list: Ses[], date: string, today: string, hm: string): string {
  const ps = [...new Map(list.map((s) => [s.p.id, s.p])).values()];
  if (!ps.length) return "";
  if (date !== today) return ps[0].id;
  return (ps.find((p) => hm < p.end) || ps[ps.length - 1]).id;
}

export type Marks = AttendanceDoc["marks"];
export const marksOf = (att: Record<string, AttendanceDoc>, ses: Pick<Ses, "aid">): Marks => att[ses.aid]?.marks || {};
export function countIn(att: Record<string, AttendanceDoc>, ses: Ses): number {
  const m = marksOf(att, ses);
  return ses.sids.filter((id) => m[id] && (m[id].st === "in" || m[id].st === "late")).length;
}
export function isOver(date: string, p: Period, today: string, hm: string): boolean {
  return date < today || (date === today && hm >= p.end);
}

/** 點一下名字：還沒紀錄 → 簽到（超過寬限算遲到）；已到且今天 → 簽退；其他 → null（開選單） */
export function tapRecord(
  prev: Marks[string] | undefined,
  date: string,
  today: string,
  hm: string,
  start: string,
  grace: number,
): Marks[string] | null {
  const isT = date === today;
  if (!prev) {
    const tin = isT ? hm : "";
    const late = isT && hm2m(tin) > hm2m(start) + grace;
    return { st: late ? "late" : "in", tin, tout: "", note: "" };
  }
  if ((prev.st === "in" || prev.st === "late") && !prev.tout && isT) return { ...prev, tout: hm };
  return null;
}

export interface Todo {
  kind: "att" | "iep-owe" | "iep-ready" | "due";
  text: string;
  /** 按鈕上的字 */
  act: string;
  href: string;
}

export interface TodayInput {
  D: RcData;
  board: Board;
  tid: string;
  today: string;
  hm: string;
  attendance: Record<string, AttendanceDoc>;
  invites: Record<string, IepInviteDoc>;
}

/** 待辦：要點名的課、IEP 要回覆的、我開的調查回覆齊了可以排、我個管的學生 30 天內到期 */
export function todos(x: TodayInput): Todo[] {
  const { D, board, tid, today, hm } = x;
  const out: Todo[] = [];
  if (dowOf(today) >= 0)
    sessionsOn(board, today, tid)
      .filter((s) => hm >= s.p.start)
      .forEach((s) => {
        const m = marksOf(x.attendance, s);
        const miss = s.sids.filter((id) => !m[id]).length;
        if (miss) out.push({ kind: "att", text: s.p.name + " " + s.name + "：" + miss + " 人還沒點名", act: "點名", href: "/me/check/?p=" + encodeURIComponent(s.p.id) });
      });
  owedInvites(x.invites, tid, today).forEach((v) =>
    out.push({ kind: "iep-owe", text: "IEP 時間調查「" + (v.round || v.kind) + "」還沒填" + (v.due ? "（" + md(v.due) + " 前）" : ""), act: "填空堂", href: "/me/iep/?tab=inv" }),
  );
  readyRounds(D, tid).forEach((R) => out.push({ kind: "iep-ready", text: "「" + (R.name || R.kind) + "」回覆齊了，可以排時間", act: "排定", href: "/me/iep/?tab=plan&r=" + encodeURIComponent(R.id) }));
  TEACH.dueSoon(D, tid, today, 30).forEach((d) =>
    out.push({
      kind: "due",
      text: IEP.stuLabel(d.s) + "　" + d.name + " " + md(d.date) + (d.left < 0 ? "（已過）" : d.left === 0 ? "（今天）" : "（" + d.left + " 天）"),
      act: "學生",
      href: "/me/student/?id=" + encodeURIComponent(d.s.id),
    }),
  );
  return out;
}

/** 要開的會（today 以後、我要出席）：我讀得到的調查單＋別人邀請我的 */
export function upcoming(x: Pick<TodayInput, "D" | "tid" | "today" | "invites">, n = 5): Upcoming[] {
  return upcomingMeets(x.D, x.invites, x.tid, x.today).slice(0, n);
}

/** 一位學生的出缺席（老師讀得到的點名文件，也就是自己的課）。只算點過名的節次 */
export function attSummary(att: Record<string, AttendanceDoc>, sid: string, periods: Period[], today: string, hm: string) {
  const o = { exp: 0, in: 0, late: 0, leave: 0, abs: 0, rows: [] as { date: string; p: string; g: string; st: string; note: string }[] };
  Object.values(att)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((a) => {
      const roster = new Set([...(a.roster || []), ...Object.keys(a.marks || {})]);
      if (!roster.has(sid)) return;
      const p = periods.find((x) => x.id === a.pid);
      const r = a.marks?.[sid];
      if (!r && p && !isOver(a.date, p, today, hm)) return;
      const st = r ? r.st : "abs";
      o.exp++;
      if (st === "in" || st === "late") o.in++;
      if (st === "late") o.late++;
      if (st === "leave") o.leave++;
      if (st === "abs") o.abs++;
      const info = (a.info || {}) as { g?: string };
      o.rows.push({ date: a.date, p: p ? p.name : a.pid, g: info.g || a.gid, st: r ? ST_NAME[r.st] || r.st : "未到", note: String((r && r.note) || "") });
    });
  return o;
}

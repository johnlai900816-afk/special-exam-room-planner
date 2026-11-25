/* 管理者端的純邏輯：今天的待辦、學生名單的篩選、個管分配、批次指定個管。
   行為照舊版 app.js（renderHome、renderStu、cmOpen／cmRun／cmApply、bulkCM），資料改成分拆後的 records。
   改資料的一律回傳 planOnD 的結果（試跑＋要寫的文件），畫面確認後再 applyOps。單元測試：test/admin.test.ts。 */
import { examTodo } from "./examData";
import { CORE } from "../core";
import { NX } from "../legacy";
import type { InviteDoc, StudentDoc, StudentPrivateDoc, TermRecords } from "../model";
import type { Board } from "../schedule";
import type { RcData, Student, Teacher } from "../types";
import { planOnD } from "./apply";
import { IEP, type Round } from "../iep";
import { checkTodos } from "./checkin";
import { dowOf, sessionsOn, type Ses } from "./today";

type C2 = typeof CORE & {
  needList(D: RcData): { id: string; subject: string }[];
  suggestCaseMgr(D: RcData, opt?: { keep?: boolean }): CmResult;
  handoverCheck(D: RcData, base: unknown, today: string, opt?: { days?: number }): Handover;
  handoverBase(D: RcData, at?: number): unknown;
  GRADE: Record<number, string>;
};
export const C = CORE as C2;

/** 私密的日期欄位（舊 DUEF） */
export const DUE_FIELDS: [keyof StudentPrivateDoc & ("iepDate" | "reviewDate" | "certExp"), string][] = [
  ["iepDate", "IEP 會議"],
  ["reviewDate", "下次檢討"],
  ["certExp", "鑑定有效期限"],
];

export const stuLabel = (s: Pick<StudentDoc, "cls" | "seat" | "name">): string =>
  String(s.cls) + (s.seat ? "-" + String(s.seat).padStart(2, "0") : "") + " " + (s.name || "");

export const sortStu = (a: Pick<StudentDoc, "cls" | "seat" | "name">, b: Pick<StudentDoc, "cls" | "seat" | "name">): number =>
  String(a.cls).localeCompare(String(b.cls)) || (+a.seat || 0) - (+b.seat || 0) || String(a.name).localeCompare(String(b.name));

/** 這個月到期的學生（學生 id → 哪幾項） */
export function dueThisMonth(R: Pick<TermRecords, "privates">, today: string): Map<string, { name: string; date: string }[]> {
  const m = today.slice(0, 7);
  const out = new Map<string, { name: string; date: string }[]>();
  Object.entries(R.privates || {}).forEach(([id, p]) => {
    const hit = DUE_FIELDS.filter(([k]) => String(p[k] || "").slice(0, 7) === m).map(([k, n]) => ({ name: n, date: String(p[k]) }));
    if (hit.length) out.set(NX.decId(id), hit);
  });
  return out;
}

/* ───── 今天 ───── */
export interface AdminTodo {
  level: "bad" | "warn" | "info";
  text: string;
  act: string;
  href: string;
}

export interface AdminTodayInput {
  D: RcData;
  board: Board;
  R: TermRecords;
  today: string;
  hm: string;
  /** 還沒領取的邀請（只有管理者讀得到；沒有就不顯示） */
  invites?: InviteDoc[] | null;
}

/** 今天所有老師的課，依節次排 */
export function todayLessons(board: Board, date: string): { pi: number; list: Ses[] }[] {
  if (dowOf(date) < 0) return [];
  const by = new Map<number, Ses[]>();
  sessionsOn(board, date).forEach((s) => {
    if (!by.has(s.pi)) by.set(s.pi, []);
    by.get(s.pi)!.push(s);
  });
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([pi, list]) => ({ pi, list }));
}

export interface Handover {
  items: { k: string; level: "bad" | "warn"; t: string; d: string; go: { to: string; id?: string } }[];
  hasBase: boolean;
  at: number;
}

export function handover(D: RcData, today: string): Handover {
  try {
    return C.handoverCheck(D, (D as unknown as { handoverBase?: unknown }).handoverBase, today);
  } catch {
    return { items: [], hasBase: false, at: 0 };
  }
}

/** 管理者的待辦（舊 renderHome 的 todo）：衝突、沒排、開課提醒、待編組、沒個管、本月到期、交接、邀請 */
export function adminTodos(x: AdminTodayInput): AdminTodo[] {
  const { D, board, R, today } = x;
  const out: AdminTodo[] = [];
  // 這一節還沒簽到的人（舊版 renderHome 第一項）、週一提醒上週的導師週報（extras.js weeklyTodo）
  const dow = new Date(today + "T00:00:00").getDay();
  checkTodos({ D, board, att: R.attendance || {}, today, hm: x.hm, dow, sessions: dowOf(today) >= 0 ? sessionsOn(board, today) : [] }).forEach((t) => out.push(t));
  const probs = board.problems.filter((p) => p.k !== "un").length;
  if (probs) out.push({ level: "bad", text: "排課衝突 " + probs + " 個", act: "排課表", href: "/admin/sched/?step=board" });
  if (board.total && board.placed < board.total) out.push({ level: "warn", text: "還有 " + (board.total - board.placed) + " 節沒排", act: "排課表", href: "/admin/sched/?step=board" });
  const warns = board.M.G.filter((g) => g.per).reduce((n, g) => n + g.warn.length, 0);
  if (warns) out.push({ level: "warn", text: "開課提醒 " + warns + " 則", act: "開課", href: "/admin/sched/?step=groups" });
  const pn = C.needList(D);
  if (pn.length) out.push({ level: "warn", text: new Set(pn.map((p) => p.id)).size + " 位學生 " + pn.length + " 科待編組", act: "編組", href: "/admin/sched/?step=need" });
  const inG = new Set(D.groups.flatMap((g) => g.students));
  const noG = D.students.filter((s) => !inG.has(s.id)).length;
  if (noG) out.push({ level: "warn", text: noG + " 位學生沒分組", act: "編組", href: "/admin/sched/?step=need" });
  const noCM = D.students.filter((s) => !s.caseMgr).length;
  if (noCM) out.push({ level: "warn", text: noCM + " 位學生沒有個管", act: "個管分配", href: "/admin/students/?cm=-" });
  // IEP 調查的回覆進度（發布了、還沒過期限、還有人沒填）
  ((IEP.ensure(D).rounds || []) as Round[])
    .filter((r) => !r.quick && r.meets && r.meets.length && (r.pub || []).length && (!r.due || r.due >= today))
    .forEach((r) => {
      try {
        const pg = IEP.progress(D, r);
        const n = pg.people.filter((o) => o.done).length;
        if (n < pg.people.length) out.push({ level: "warn", text: "IEP「" + (r.name || "調查") + "」回覆 " + n + "/" + pg.people.length, act: "IEP", href: "/admin/iep/?r=" + encodeURIComponent(r.id) });
      } catch {
        /* 舊版也是略過 */
      }
    });
  const due = dueThisMonth(R, today);
  if (due.size) out.push({ level: "warn", text: due.size + " 位學生本月到期", act: "學生", href: "/admin/students/?due=1" });
  const H = handover(D, today);
  const hb = H.items.filter((i) => i.k !== "due" && i.k !== "cm");
  if (hb.length) out.push({ level: hb.some((i) => i.level === "bad") ? "bad" : "info", text: "學年交接 " + hb.length + " 項要確認", act: "交接", href: "/admin/settings/school/?step=handover" });
  // 段考還有幾科次沒排考場（舊 app.js examInfo）
  const ex = examTodo(R);
  if (ex && ex.total > ex.placed) out.push({ level: "warn", text: "段考還有 " + (ex.total - ex.placed) + " 科次沒排考場", act: "段考", href: "/admin/exam/?step=board" });
  const inv = (x.invites || []).filter((v) => !v.exp || v.exp.getTime() > Date.now());
  if (inv.length) out.push({ level: "info", text: inv.length + " 份邀請還沒領取", act: "帳號", href: "/admin/settings/accounts/" });
  return out;
}

/** 資源班老師：已排節數、應授、個案數（舊 renderHome 的第 3 區） */
export function teacherLoads(D: RcData, board: Board) {
  const { M, S } = board;
  const n = new Map<string, number>();
  M.L.forEach((x, l) => {
    const g = M.G[x.g];
    if (g.t >= 0 && S.slot[l] >= 0) n.set(M.T[g.t].id, (n.get(M.T[g.t].id) || 0) + 1);
  });
  return D.teachers
    .filter((t) => t.role === "資源班")
    .map((t) => ({ id: t.id, name: t.name, per: n.get(t.id) || 0, hours: +t.hours || 0, reduce: +(t.reduce as number) || 0, cases: D.students.filter((s) => s.caseMgr === t.id).length }));
}

/* ───── 學生名單 ───── */
export interface StuFilter {
  q: string;
  grade: string;
  /** '' 全部、'-' 沒有個管、其他＝老師 id */
  cm: string;
  due: boolean;
}

export interface StuRow {
  id: string;
  s: StudentDoc;
  cmName: string;
  groups: string[];
  due: { name: string; date: string }[];
  svc: string[];
}

const SVN: Record<string, string> = { ext: "延長", read: "誦讀", oral: "口頭", pc: "電腦", small: "獨立" };
/** 段考服務的簡稱（舊 examInfo().sv） */
export function svcNames(p: StudentPrivateDoc | undefined): string[] {
  const v = (p?.examSvc || {}) as Record<string, unknown>;
  return Object.keys(SVN).filter((k) => v[k] === "*" || (Array.isArray(v[k]) && (v[k] as unknown[]).length)).map((k) => SVN[k]);
}

export function studentRows(R: TermRecords, today: string): StuRow[] {
  const tn = new Map(Object.entries(R.teachers).map(([id, t]) => [NX.decId(id), t.name]));
  const gn = new Map(Object.entries(R.groups).map(([id, g]) => [NX.decId(id), g]));
  const due = dueThisMonth(R, today);
  return Object.entries(R.students)
    .map(([doc, s]) => {
      const id = NX.decId(doc);
      return {
        id,
        s,
        cmName: tn.get(s.caseMgrId) || "",
        groups: (s.groupIds || []).map((g) => gn.get(g)).filter((g) => g && g.on !== false).map((g) => g!.name),
        due: due.get(id) || [],
        svc: svcNames(R.privates[doc]),
      };
    })
    .sort((a, b) => sortStu(a.s, b.s));
}

export function filterRows(rows: StuRow[], f: StuFilter): StuRow[] {
  const q = f.q.trim();
  return rows.filter(
    (r) =>
      (!q || String(r.s.name).includes(q) || (String(r.s.cls) + String(r.s.seat || "")).includes(q)) &&
      (!f.grade || CORE.gradeOfCls(r.s.cls) === +f.grade) &&
      (!f.cm || (f.cm === "-" ? !r.s.caseMgrId : r.s.caseMgrId === f.cm)) &&
      (!f.due || r.due.length > 0),
  );
}

export function gradesOf(R: Pick<TermRecords, "students">): number[] {
  return [...new Set(Object.values(R.students).map((s) => CORE.gradeOfCls(s.cls)))].filter((g) => C.GRADE[g]).sort((a, b) => a - b);
}

/** 個管下拉：資源班老師在前面 */
export function cmChoices(D: RcData): { main: Teacher[]; other: Teacher[] } {
  return { main: D.teachers.filter((t) => t.role === "資源班"), other: D.teachers.filter((t) => t.role !== "資源班") };
}

/** 批次指定個管（舊 bulkCM）：試跑，回傳要寫的文件 */
export function planBulkCM(R: TermRecords, ids: string[], tid: string) {
  const set = new Set(ids);
  return planOnD(R, (D) => {
    let n = 0;
    D.students.forEach((s) => {
      if (set.has(s.id) && s.caseMgr !== tid) {
        s.caseMgr = tid;
        n++;
      }
    });
    return n;
  });
}

/* ───── 個管分配（舊 cmOpen／cmRun／cmApply；core.suggestCaseMgr） ───── */
export interface CmItem {
  sid: string;
  cls: string;
  seat: string;
  name: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  why: string[];
  change: boolean;
}
export interface CmResult {
  list: CmItem[];
  summary: { id: string; name: string; n: number; cap: number; capSet: boolean; grades: string[]; classes: number; taught: number }[];
  note?: string;
}

/** 老師的上限與不當個管（舊 cmSetT）：先在 D 上改，再算建議 */
export interface CmTeacherOpt {
  cmCap?: number;
  noCM?: boolean;
}
function withCmOpts(D: RcData, opts: Record<string, CmTeacherOpt>) {
  D.teachers.forEach((t) => {
    const o = opts[t.id];
    if (!o) return;
    if (o.cmCap != null) {
      if (+o.cmCap > 0) t.cmCap = +o.cmCap;
      else delete t.cmCap;
    }
    if (o.noCM != null) {
      if (o.noCM) t.noCM = true;
      else delete t.noCM;
    }
  });
}

export function suggestCM(R: TermRecords, opts: Record<string, CmTeacherOpt>, keep: boolean): CmResult {
  return planOnD(R, (D) => {
    withCmOpts(D, opts);
    return C.suggestCaseMgr(D, { keep });
  }).result;
}

/** 套用勾選的建議（連同老師的上限設定） */
export function planCMApply(R: TermRecords, res: CmResult, pick: Set<string>, opts: Record<string, CmTeacherOpt>) {
  return planOnD(R, (D) => {
    withCmOpts(D, opts);
    let n = 0;
    res.list.forEach((x) => {
      if (!pick.has(x.sid)) return;
      const s = D.students.find((y) => y.id === x.sid);
      if (s && s.caseMgr !== x.to) {
        s.caseMgr = x.to;
        n++;
      }
    });
    return n;
  });
}

/* ───── 個案頁：基本資料 ───── */
export type BasicField = "cls" | "seat" | "name" | "caseMgr" | "note";
/** 改一位學生的基本欄位（學生文件；改個管時 private.caseMgrId、teacherIds 跟著變） */
export function planStudentEdit(R: TermRecords, sid: string, k: BasicField, v: string) {
  return planOnD(R, (D) => {
    const s = D.students.find((x) => x.id === sid) as Student | undefined;
    if (!s) return false;
    (s as Record<string, unknown>)[k] = String(v).trim();
    return true;
  });
}

/** 新增學生（舊 addStu）：回傳新 id */
export function planAddStudent(R: TermRecords, o: { cls: string; seat: string; name: string }) {
  return planOnD(R, (D) => {
    const s = { id: CORE.uid("s"), cls: o.cls.trim(), seat: o.seat.trim(), name: o.name.trim(), caseMgr: "", note: "", needs: [] } as unknown as Student;
    D.students.push(s);
    return s.id;
  });
}

/** 刪除學生（舊 delStu）：課程、群組、個人不排課一起清；id 記到 gone */
export function planDelStudent(R: TermRecords, sid: string) {
  return planOnD(R, (D) => {
    const i = D.students.findIndex((s) => s.id === sid);
    if (i < 0) return false;
    D.groups.forEach((g) => (g.students = g.students.filter((id) => id !== sid)));
    D.students.splice(i, 1);
    const X = D as unknown as { gone?: string[]; offBy: Record<string, unknown>; sets: { students: string[] }[] };
    X.gone = (X.gone || []).concat([sid]).slice(-500);
    delete X.offBy["s:" + sid];
    (X.sets || []).forEach((x) => (x.students = x.students.filter((id) => id !== sid)));
    return true;
  });
}

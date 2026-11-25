/* 從資料 D 算出課表：全部交給 core.js（compile → toState → assignRooms → lockTable），這裡只整理成畫面要的樣子。 */
import { CORE, type Model, type Problem, type SolveState } from "./core";
import type { RcData, Student } from "./types";

export interface Board {
  M: Model;
  S: SolveState;
  /** 每一節課分到的教室索引（-1＝沒有） */
  room: Int16Array;
  problems: Problem[];
  /** 已經排進去的節數 / 全部節數 */
  placed: number;
  total: number;
}

export function buildBoard(D: RcData): Board {
  const M = CORE.compile(D);
  const S = CORE.toState(M, D);
  M.lroom = S.rfix;
  const room = CORE.assignRooms(M, S.slot);
  const problems: Problem[] = [];
  CORE.evaluate(M, S.slot, problems);
  const placed = Array.from(S.slot).filter((s) => s >= 0).length;
  return { M, S, room, problems, placed, total: M.L.length };
}

export interface Lesson {
  /** M.L 的索引（給之後的拖曳用）；原班鎖課是 -1 */
  l: number;
  s: number;
  kind: "resource" | "lock";
  title: string;
  sub: string;
  room: string;
  pinned: boolean;
  teacherId: string;
}

/** 一節資源班課在畫面上的樣子 */
export function lessonOf(B: Board, l: number): Lesson {
  const { M, S, room } = B;
  const g = M.G[M.L[l].g];
  const r = room[l] >= 0 ? M.D.rooms[room[l]] : null;
  const t = g.t >= 0 ? M.T[g.t] : null;
  return {
    l,
    s: S.slot[l],
    kind: "resource",
    title: g.name,
    sub: (t ? t.name : "未指定老師") + "・" + g.stu.length + " 人",
    room: r ? r.name : "",
    pinned: !!S.pin[l],
    teacherId: t ? t.id : "",
  };
}

/** 全部已排的資源班課，依時段分好 */
export function lessonsBySlot(B: Board, filter?: (x: Lesson) => boolean): Map<number, Lesson[]> {
  const out = new Map<number, Lesson[]>();
  for (let l = 0; l < B.M.L.length; l++) {
    if (B.S.slot[l] < 0) continue;
    const x = lessonOf(B, l);
    if (filter && !filter(x)) continue;
    const a = out.get(x.s) || [];
    a.push(x);
    out.set(x.s, a);
  }
  return out;
}

/** 某位老師一週的課：資源班老師看自己帶的課；普通班老師看被鎖在原班的節次（core.lockTable） */
export function teacherWeek(B: Board, teacherId: string): Map<number, Lesson[]> {
  const out = lessonsBySlot(B, (x) => x.teacherId === teacherId);
  const t = B.M.D.teachers.find((x) => x.id === teacherId);
  if (!t) return out;
  for (const row of CORE.lockTable(B.M, B.S.slot)) {
    if (row.teacher !== t.name) continue;
    for (const s of row.slots) {
      const a = out.get(s) || [];
      a.push({ l: -1, s, kind: "lock", title: row.cls + " " + row.subject, sub: "原班鎖課・" + row.groups.join("、"), room: "", pinned: false, teacherId });
      out.set(s, a);
    }
  }
  return out;
}

export interface MyStudent {
  s: Student;
  tags: string[];
}

/** 我的學生：我是個管的、在我帶的課裡的、我是他原班該科任課老師而他在資源班上該科的 */
export function myStudents(D: RcData, teacherId: string): MyStudent[] {
  const map = new Map<string, MyStudent>();
  const byId = new Map(D.students.map((s) => [s.id, s]));
  const add = (id: string, tag: string) => {
    const s = byId.get(id);
    if (!s) return;
    const x = map.get(id) || { s, tags: [] };
    if (!x.tags.includes(tag)) x.tags.push(tag);
    map.set(id, x);
  };
  D.students.forEach((s) => {
    if (s.caseMgr === teacherId) add(s.id, "個管");
  });
  D.groups.forEach((g) => {
    if (g.on === false) return;
    if (g.teacher === teacherId) g.students.forEach((id) => add(id, g.name));
    else
      g.students.forEach((id) => {
        const s = byId.get(id);
        if (s && D.classSubj[s.cls + "|" + g.subject] === teacherId) add(id, "原班" + g.subject);
      });
  });
  return [...map.values()].sort(
    (a, b) => String(a.s.cls).localeCompare(String(b.s.cls)) || (+a.s.seat || 0) - (+b.s.seat || 0),
  );
}

export function slotLabel(M: Model, key: string): string {
  const s = M.key2s(key);
  return s >= 0 ? M.sn(s) : key;
}

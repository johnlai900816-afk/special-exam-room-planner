/* 學生文件上的衍生欄位：groupIds、teacherIds（誰讀得到）、private.caseMgrId。
   寫課程、班級（任課老師）或學生之後要重算，Repo.put/patch/remove 會自動做。 */
import { NX } from "../legacy";
import type { Collection, GroupDoc, StudentDoc, StudentPrivateDoc, TermRecords } from "../model";
import type { WritableCol } from "./types";

export interface StudentLinks {
  groupIds: string[];
  teacherIds: string[];
}

/** 依目前的 groups、classes 重算每位學生（key＝學生文件 id）的 groupIds、teacherIds */
export function deriveStudentLinks(R: Pick<TermRecords, "groups" | "classes" | "students">): Record<string, StudentLinks> {
  const groups = Object.entries(R.groups || {})
    .sort((a, b) => (a[1].ord ?? 0) - (b[1].ord ?? 0))
    .map(([id, g]) => ({
      id: NX.decId(id),
      name: g.name,
      subject: g.subject,
      teacher: g.teacherId,
      per: g.per,
      students: g.studentIds || [],
      mode: g.mode,
      room: g.room,
      on: g.on,
      grade: g.grade,
    }));
  const classSubj: Record<string, string> = {};
  Object.values(R.classes || {}).forEach((c) => Object.entries(c.subj || {}).forEach(([sj, t]) => (classSubj[c.cls + "|" + sj] = t)));
  const out: Record<string, StudentLinks> = {};
  Object.entries(R.students || {}).forEach(([docId, s]) => {
    const id = NX.decId(docId);
    out[docId] = {
      groupIds: groups.filter((g) => g.students.includes(id)).map((g) => g.id),
      teacherIds: NX.readersOf({ id, cls: s.cls, caseMgr: s.caseMgrId }, groups, classSubj),
    };
  });
  return out;
}

const same = (a: string[] | undefined, b: string[]) => JSON.stringify(a || []) === JSON.stringify(b);

export interface LinkPatch {
  col: "students" | "privates";
  id: string;
  data: StudentDoc | StudentPrivateDoc;
}

/** 套用一個寫入（data＝null 是刪除）之後的 records，算出還要一起改的學生與 private 文件（只回傳有變的） */
export function applyWrite(R: TermRecords, col: WritableCol, id: string, data: unknown | null): TermRecords {
  const next: TermRecords = { ...R };
  if (col === "term") {
    next.term = (data as TermRecords["term"]) ?? null;
    return next;
  }
  const c = col as Collection;
  const m = { ...(R[c] as Record<string, unknown>) };
  if (data == null) delete m[id];
  else m[id] = data;
  (next as unknown as Record<string, unknown>)[c] = m;
  if (col === "students" && data == null) {
    const p = { ...R.privates };
    delete p[id];
    next.privates = p;
  }
  return next;
}

export function linkPatches(after: TermRecords): LinkPatch[] {
  if (!Object.keys(after.students || {}).length) return [];
  const links = deriveStudentLinks(after);
  const out: LinkPatch[] = [];
  Object.entries(after.students).forEach(([id, s]) => {
    const l = links[id];
    if (!same(s.groupIds, l.groupIds) || !same(s.teacherIds, l.teacherIds)) out.push({ col: "students", id, data: { ...s, ...l } });
    const p = after.privates?.[id];
    if (!p || p.caseMgrId !== s.caseMgrId) out.push({ col: "privates", id, data: { ...(p || {}), caseMgrId: s.caseMgrId } });
  });
  return out;
}

/** 寫學生文件前補上衍生欄位（groupIds、teacherIds 以課程為準） */
export function withLinks(R: TermRecords, id: string, s: StudentDoc): StudentDoc {
  const links = deriveStudentLinks({ groups: R.groups, classes: R.classes, students: { [id]: s } });
  return { ...s, ...links[id] };
}

export type { GroupDoc };

/** 新的點名文件第一次建立時記下組名與節次名稱（舊版 _info）：新學期清掉組別後統計也看得到 */
export function infoOf(g: Pick<GroupDoc, "name"> | undefined, periods: { id: string; name: string }[] | undefined, pid: string): { info?: { g: string; p: string } } {
  if (!g) return {};
  const p = (periods || []).find((x) => x.id === pid);
  return { info: { g: String(g.name || ""), p: p ? String(p.name || "") : "" } };
}

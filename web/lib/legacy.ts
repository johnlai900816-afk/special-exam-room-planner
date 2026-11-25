/* 舊格式（整份 D）→ 目標模型（一筆一份文件）的轉換。
   給之後的搬移腳本（由後端、用管理者權限執行）和測試用；畫面現在仍直接吃 D。
   反方向（目標模型 → D）讓 core.js 可以繼續用同一個 compile(D)：見 toCoreData()。 */
import type { GroupDoc, StudentDoc, StudentPrivate, TeacherDoc, TermDoc } from "./model";
import type { RcData } from "./types";

export interface SchoolDocs {
  term: TermDoc;
  students: Record<string, StudentDoc>;
  privates: Record<string, StudentPrivate>;
  teachers: Record<string, TeacherDoc>;
  groups: Record<string, GroupDoc>;
}

/** teacherUid：teacher id → 綁定帳號 uid（舊資料只有 teacher id，個管欄位要換成 uid） */
export function fromLegacy(D: RcData, by: string, teacherUid: Record<string, string> = {}): SchoolDocs {
  const v = { rev: 1, updatedBy: by, updatedAt: null };
  const groupIds: Record<string, string[]> = {};
  D.groups.forEach((g) => g.students.forEach((id) => (groupIds[id] = groupIds[id] || []).push(g.id)));
  const students: SchoolDocs["students"] = {};
  const privates: SchoolDocs["privates"] = {};
  D.students.forEach((s) => {
    students[s.id] = { ...v, cls: s.cls, seat: s.seat, name: s.name, caseMgrUid: teacherUid[s.caseMgr] || "", groupIds: groupIds[s.id] || [] };
    privates[s.id] = { ...v, needs: s.needs || [], note: s.note || "" };
  });
  const teachers: SchoolDocs["teachers"] = {};
  D.teachers.forEach((t) => {
    teachers[t.id] = { ...v, name: t.name, role: t.role, uid: teacherUid[t.id], off: t.off, hours: t.hours, note: t.note };
  });
  const groups: SchoolDocs["groups"] = {};
  D.groups.forEach((g) => {
    groups[g.id] = {
      ...v,
      name: g.name,
      subject: g.subject,
      teacherId: g.teacher,
      per: g.per,
      studentIds: g.students,
      mode: g.mode,
      room: g.room,
      on: g.on,
      grade: g.grade,
      slots: D.assign[g.id] || [],
    };
  });
  const rest = { ...D } as Record<string, unknown>;
  ["students", "teachers", "groups", "assign", "title", "periods", "rooms"].forEach((k) => delete rest[k]);
  return {
    term: { ...v, title: D.title, periods: D.periods, rooms: D.rooms, settings: { ...D.settings, legacy: rest } },
    students,
    privates,
    teachers,
    groups,
  };
}

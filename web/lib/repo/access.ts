/* 和 web/firestore.rules.next 的 B 段同一套權限，用在記憶體版 Repo（範例資料、測試），
   讓「老師只看得到自己的學生」在沒有雲端時也一樣。改規則時這裡要一起改（test/repo.test.ts 會比對）。 */
import { isStaff, type TermRecords } from "../model";
import type { RepoScope, WritableCol } from "./types";

const pickBy = <T>(o: Record<string, T>, f: (v: T, k: string) => boolean): Record<string, T> => {
  const r: Record<string, T> = {};
  Object.entries(o || {}).forEach(([k, v]) => {
    if (f(v, k)) r[k] = v;
  });
  return r;
};

/** 這個人讀得到的部分 */
export function visible(scope: RepoScope, R: TermRecords): TermRecords {
  if (isStaff(scope.role)) return R;
  const tid = scope.role === "teacher" ? scope.tid || "" : "";
  const none = {};
  return {
    term: R.term,
    teachers: R.teachers,
    classes: R.classes,
    groups: R.groups,
    exam: R.exam,
    students: tid ? pickBy(R.students, (s) => s.caseMgrId === tid || (s.teacherIds || []).includes(tid)) : none,
    privates: tid ? pickBy(R.privates, (p) => p.caseMgrId === tid) : none,
    attendance: tid ? pickBy(R.attendance, (a) => a.teacherId === tid) : none,
    iep: tid ? pickBy(R.iep, (r) => (r.readers || []).includes(tid)) : none,
    versions: none,
    lockLog: none,
    staff: none,
    examPrivate: none,
  };
}

const PRIV_TEACHER = ["privNote", "iepDate", "reviewDate", "certExp", "examSvc", "contacts"];
const ATT_TEACHER = ["marks", "roster", "info"];

function changedKeys(a: Record<string, unknown> | null, b: Record<string, unknown> | null): string[] {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].filter((k) => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]));
}

/** 能不能寫：null＝可以，不然是原因。before＝現在的內容（null＝新增），after＝要寫的內容（null＝刪除） */
export function writeDenied(
  scope: RepoScope,
  R: TermRecords,
  col: WritableCol,
  id: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string | null {
  if (isStaff(scope.role)) return null;
  if (scope.role !== "teacher" || !scope.tid) return "只有管理者或編輯可以修改";
  const tid = scope.tid;
  const only = (keys: string[]) => changedKeys(before, after).every((k) => keys.includes(k));
  if (after == null) return "只有管理者或編輯可以刪除";
  switch (col) {
    case "teachers":
      return before && id === tid && only(["off"]) ? null : "老師只能改自己的不排課時段";
    case "privates":
      return before && before.caseMgrId === tid && only(PRIV_TEACHER) ? null : "只有個管老師可以改私密資料";
    case "attendance": {
      if (!before) {
        const g = R.groups[String(after.gid)];
        return after.teacherId === tid && g && g.teacherId === tid ? null : "只能點自己的課";
      }
      return before.teacherId === tid && only(ATT_TEACHER) ? null : "只能點自己的課";
    }
    case "iep": {
      const inA = ((after.readers as string[]) || []).includes(tid);
      const inB = !before || ((before.readers as string[]) || []).includes(tid);
      return inA && inB ? null : "不是這份調查單的發起人或個管";
    }
    default:
      return "只有管理者或編輯可以修改";
  }
}

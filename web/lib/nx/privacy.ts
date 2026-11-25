/* 我的學生與個案頁：誰是我的學生、私密欄位給誰看、要寫哪一份文件。純函式，單元測試在 test/teacher.test.ts。
   私密欄位（私密備註、IEP／檢討／鑑定日期、段考服務、家長聯絡）在 students/{id}/private/profile，
   規則只給個管老師（與管理者）讀寫；這裡再擋一次，畫面上不是個管的老師連欄位都不顯示。 */
import { CORE } from "../core";
import { NX } from "../legacy";
import type { StudentDoc, StudentPrivateDoc, TermRecords } from "../model";
import type { RepoScope } from "../repo";

export type Relation = "cm" | "taught" | "";

/** 我和這位學生的關係：cm＝個管、taught＝有教（或原班任課，teacherIds 有我）、''＝讀不到 */
export function relationOf(s: StudentDoc | undefined, tid: string): Relation {
  if (!s || !tid) return "";
  if (s.caseMgrId === tid) return "cm";
  return (s.teacherIds || []).includes(tid) ? "taught" : "";
}

/** 看得到、改得到私密欄位：管理者／編輯，或這位學生的個管（而且真的讀到了 private 文件） */
export function canSeePrivate(scope: Pick<RepoScope, "role" | "tid">, R: Pick<TermRecords, "students" | "privates">, sid: string): boolean {
  const id = NX.encId(sid);
  if (scope.role === "admin" || scope.role === "editor") return !!R.privates[id];
  return scope.role === "teacher" && !!scope.tid && R.students[id]?.caseMgrId === scope.tid && !!R.privates[id];
}

/** 我的學生：我個管的、我教的（不是我個管的）。依班級座號排 */
export function myStudentList(R: Pick<TermRecords, "students">, tid: string, q = "") {
  const hit = (s: StudentDoc) => !q || String(s.name).includes(q) || String(s.cls).includes(q);
  const all = Object.entries(R.students)
    .map(([id, s]) => ({ id: NX.decId(id), s, rel: relationOf(s, tid) }))
    .filter((x) => x.rel)
    .sort((a, b) => String(a.s.cls).localeCompare(String(b.s.cls)) || (+a.s.seat || 0) - (+b.s.seat || 0));
  const cm = all.filter((x) => x.rel === "cm");
  const taught = all.filter((x) => x.rel === "taught");
  return { cm: cm.filter((x) => hit(x.s)), taught: taught.filter((x) => hit(x.s)), nCm: cm.length, nTaught: taught.length };
}

/** 老師可以改的私密欄位（和規則的 changedOnly 一樣；不能改 caseMgrId） */
export const PRIV_FIELDS = ["privNote", "iepDate", "reviewDate", "certExp", "examSvc", "contacts"] as const;
export type PrivField = (typeof PRIV_FIELDS)[number];

/** 改一個私密欄位要送的 patch；空字串＝清掉（存成 ''，Firestore 的 patch 不刪欄位） */
export function privPatch(field: PrivField, value: unknown): Partial<StudentPrivateDoc> {
  if (!PRIV_FIELDS.includes(field)) throw new Error("不能改這個欄位：" + field);
  if (typeof value === "string") return { [field]: value.trim() } as Partial<StudentPrivateDoc>;
  return { [field]: value } as Partial<StudentPrivateDoc>;
}

/* ───── 家長聯絡紀錄（舊版 extras.js contactsHtml） ───── */
export type Contact = NonNullable<StudentPrivateDoc["contacts"]>[number];
export const CONTACT_HOW: string[] = (CORE as unknown as { CONTACT_HOW: string[] }).CONTACT_HOW;

export function saveContact(list: Contact[] | undefined, c: Omit<Contact, "id"> & { id?: string }): Contact[] {
  const a = (list || []).slice();
  if (c.id && a.some((x) => x.id === c.id)) return a.map((x) => (x.id === c.id ? { ...x, ...c, id: x.id } : x));
  return [...a, { ...c, id: c.id || CORE.uid("c") }];
}
export const dropContact = (list: Contact[] | undefined, id: string): Contact[] => (list || []).filter((x) => x.id !== id);
export const sortContacts = (list: Contact[] | undefined): Contact[] => (list || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));

/** 整理給 IEP 會議（core.js contactDigest，用舊格式 D 的 contacts 形狀） */
export function contactDigest(s: StudentDoc & { id: string }, list: Contact[], since: string): string {
  const D = { students: [{ id: s.id, cls: s.cls, name: s.name }], contacts: { [s.id]: list } };
  return (CORE as unknown as { contactDigest(D: unknown, sid: string, since: string): { text: string } }).contactDigest(D, s.id, since).text;
}

/* ───── 段考服務（舊版 extras.js svcHtml／svcSave） ───── */
export const SVC: [string, string][] = [
  ["ext", "延長"],
  ["read", "誦讀"],
  ["oral", "口頭"],
  ["pc", "電腦"],
  ["small", "獨立"],
];
export type ExamSvc = Record<string, string | string[]>;

/** 指定科目的選項：段考考程的科目（沒有就用預設的七科）＋已經勾過的 */
export function svcSubjects(examSubjects: string[], v: ExamSvc | undefined): string[] {
  const set = new Set<string>();
  examSubjects.forEach((x) =>
    String(x || "")
      .split(/[/／、,，]/)
      .forEach((y) => {
        y = y.trim();
        if (y) set.add(y);
      }),
  );
  if (!set.size) ["國文", "英文", "數學", "社會", "自然", "作文", "英聽"].forEach((x) => set.add(x));
  SVC.forEach(([k]) => {
    const a = v?.[k];
    if (Array.isArray(a)) a.forEach((x) => set.add(String(x)));
  });
  return [...set];
}

/** 改一項服務：mode ''＝不需要、all＝全部科目（'*'）、some＝指定科目 */
export function setSvc(v: ExamSvc | undefined, k: string, mode: "" | "all" | "some", subs?: string[]): ExamSvc {
  const o: ExamSvc = { ...(v || {}) };
  if (!mode) delete o[k];
  else if (mode === "all") o[k] = "*";
  else o[k] = subs || (Array.isArray(o[k]) ? (o[k] as string[]) : []);
  return o;
}

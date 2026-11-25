/* 帳號與角色。

   目標（審查採用版）：角色放在 Firebase Auth 的 custom claims {sid, role}，由 Cloud Function 設定；
   第一位管理者由部署腳本建立，不再是「第一個登入的人」。見 lib/model.ts、functions/。

   過渡期：還沒有 Function 時，從舊系統（cloud.js）的共用名單 `config/access` 推出角色：
     admin   主持人信箱                          → 管理者
     emails  全部成員；不在 viewers 裡的＝編輯   → 管理者（特教組長／排課者）
     viewers 只能檢視的人                        → 有綁定老師的是「老師」，沒有的是「檢視」
   新版在 config/access 加 bind {信箱: teacher id}，舊版 cloud.js 更新名單時用 update({emails,viewers})，
   不會動到 bind；舊版畫面上這些老師就是「檢視」，照樣能用。 */
import type { MemberRole, RoleClaims } from "./model";

export type AppRole = MemberRole;

export interface Access {
  admin: string;
  emails: string[];
  viewers?: string[];
  bind?: Record<string, string>;
  link?: string;
  [k: string]: unknown;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "管理者",
  teacher: "老師",
  viewer: "檢視",
};

export function normEmail(e: string | null | undefined): string {
  return String(e || "").trim().toLowerCase();
}

export function claimsOf(c: Record<string, unknown> | null | undefined): RoleClaims | null {
  if (!c || typeof c.sid !== "string" || !c.sid) return null;
  const r = c.role;
  if (r !== "admin" && r !== "teacher" && r !== "viewer") return null;
  return typeof c.teacherId === "string" && c.teacherId ? { sid: c.sid, role: r, teacherId: c.teacherId } : { sid: c.sid, role: r };
}

/** 從舊名單推角色；不在名單裡回傳 null */
export function roleOf(access: Access | null | undefined, email: string | null | undefined): AppRole | null {
  const e = normEmail(email);
  if (!access || !e) return null;
  if (normEmail(access.admin) === e) return "admin";
  if (!(access.emails || []).map(normEmail).includes(e)) return null;
  if (!(access.viewers || []).map(normEmail).includes(e)) return "admin";
  return boundTeacherId(access, e) ? "teacher" : "viewer";
}

export function isHost(access: Access | null | undefined, email: string | null | undefined): boolean {
  return !!access && !!normEmail(email) && normEmail(access.admin) === normEmail(email);
}

export function boundTeacherId(access: Access | null | undefined, email: string | null | undefined): string {
  const e = normEmail(email);
  if (!access || !access.bind || !e) return "";
  return access.bind[e] || "";
}

export function emailOfTeacher(access: Access | null | undefined, teacherId: string): string {
  if (!access || !access.bind) return "";
  for (const [e, t] of Object.entries(access.bind)) if (t === teacherId) return e;
  return "";
}

/** 加入或修改一位成員（舊名單）。只有主持人寫得進 config/access */
export function withMember(access: Access, email: string, role: AppRole, teacherId: string): Access {
  const e = normEmail(email);
  const emails = Array.from(new Set([...(access.emails || []).map(normEmail), e]));
  const viewers = (access.viewers || []).map(normEmail).filter((x) => x !== e);
  if (role !== "admin" && e !== normEmail(access.admin)) viewers.push(e);
  const bind: Record<string, string> = {};
  for (const [k, v] of Object.entries(access.bind || {})) if (normEmail(k) !== e && (!teacherId || v !== teacherId)) bind[normEmail(k)] = v;
  if (teacherId && role !== "viewer") bind[e] = teacherId;
  return { ...access, emails, viewers, bind };
}

export function withoutMember(access: Access, email: string): Access {
  const e = normEmail(email);
  const bind = { ...(access.bind || {}) };
  delete bind[e];
  return {
    ...access,
    emails: (access.emails || []).filter((x) => normEmail(x) !== e),
    viewers: (access.viewers || []).filter((x) => normEmail(x) !== e),
    bind,
  };
}

/* 設定 › 帳號與共用：成員（schools/{sid}/members，只有管理者列得出來）、邀請、角色、撤銷、舊名單、搬移狀態。
   寫入一律經 Cloud Functions（functions/nx-claims.js、nx-migrate.js、nx-admin.js）；這裡只讀與呼叫。 */
import { collection, getDocs, type Timestamp } from "firebase/firestore";
import { firebase } from "../firebase";
import type { InviteDoc, MemberDoc, MemberRole } from "../model";
import { callNx } from "./session";

export const ROLE_NAME: Record<MemberRole, string> = { admin: "管理者", editor: "編輯", teacher: "老師", viewer: "檢視" };

const toDate = (t: unknown): Date | null => (t && typeof (t as Timestamp).toDate === "function" ? (t as Timestamp).toDate() : null);

export interface Member extends MemberDoc {
  uid: string;
}

export async function listMembers(sid: string): Promise<Member[]> {
  const fb = firebase();
  if (!fb) return [];
  const q = await getDocs(collection(fb.db, `schools/${sid}/members`));
  return q.docs
    .map((d) => {
      const x = d.data();
      return { uid: d.id, email: String(x.email || ""), role: x.role as MemberRole, active: x.active !== false, teacherId: x.teacherId || undefined, claimsAt: toDate(x.claimsAt) };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.email.localeCompare(b.email));
}

export async function listInvites(sid: string): Promise<InviteDoc[]> {
  const fb = firebase();
  if (!fb) return [];
  const q = await getDocs(collection(fb.db, `schools/${sid}/invites`));
  return q.docs
    .map((d) => {
      const x = d.data();
      return { email: String(x.email || d.id), role: x.role as MemberRole, teacherId: x.teacherId || null, by: String(x.by || ""), exp: toDate(x.exp) };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

export const createInvite = (sid: string, email: string, role: MemberRole, tid: string, days = 14) =>
  callNx<{ email: string; exp: string }>("nxCreateInvite", { sid, email, role, tid: tid || null, days });
export const setClaims = (sid: string, uid: string, role: MemberRole, tid: string) => callNx<{ uid: string }>("nxSetClaims", { sid, uid, role, tid: tid || null });
export const revokeMember = (sid: string, uid: string) => callNx<{ ok: boolean }>("nxRevokeMember", { sid, uid });

export interface LegacyMember {
  email: string;
  role: MemberRole;
  tid: string;
}
export const importLegacyMembers = (sid: string, dryRun: boolean) => callNx<{ dryRun: boolean; list: LegacyMember[] }>("nxImportLegacyMembers", { sid, dryRun });

export interface MigrateResult {
  dryRun: boolean;
  counts: { set: Record<string, number>; del: Record<string, number>; total: number } & Record<string, unknown>;
  sizes: Record<string, number>;
  unchanged?: boolean;
  conflicts?: unknown[];
}
export const migrateLegacy = (sid: string, termId: string, dryRun: boolean, name?: string) =>
  callNx<MigrateResult>("nxMigrateLegacy", { sid, termId, dryRun, ...(name ? { name } : {}) });

export interface LinkStatus {
  link: { sid: string; termId: string; mode: string; native: string[]; by: string; at: string | null } | null;
  school: { name: string; currentTerm: string; mode: string; native: string[] } | null;
  sync: { at: string | null; ver: unknown } | null;
}
export const linkStatus = (sid: string) => callNx<LinkStatus>("nxLinkStatus", { sid });
export const setCurrentTerm = (sid: string, termId: string) => callNx<{ ok: boolean }>("nxSetCurrentTerm", { sid, termId });

/** 搬移結果的筆數（nx-core.countOps 的形狀：{set:{col:n}, del:{col:n}, total}） */
export function countLines(c: MigrateResult["counts"] | undefined): { col: string; set: number; del: number }[] {
  if (!c) return [];
  const set = (c.set || {}) as Record<string, number>;
  const del = (c.del || {}) as Record<string, number>;
  return [...new Set([...Object.keys(set), ...Object.keys(del)])].map((col) => ({ col, set: set[col] || 0, del: del[col] || 0 }));
}

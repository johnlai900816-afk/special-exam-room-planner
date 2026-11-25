/* 目標資料模型（架構／資安審查採用版）。新版最後要改成「一筆資料一份文件」，不再把整份 D 存成一個 JSON：
     schools/{sid}                         {name, domain}
     schools/{sid}/members/{uid}           {email, role, active}            只有 Cloud Function 能寫
     schools/{sid}/invites/{email}         {role, by, exp}
     schools/{sid}/terms/{tid}             {title, periods, rooms, settings, rev}
       students/{id}                       {cls, seat, name, caseMgrUid, groupIds, rev, updatedBy, updatedAt}
       students/{id}/private/profile       個管老師與管理者才讀得到
       teachers/{id}                       {name, role, uid?, off, hours, rev…}
       groups/{gid}                        課程＋排課結果 slots
       exams/{eid}（+ sessions、placements）、attendance/{date}、iep/{mid}（+ responses）
     publicViews/{token}                   {sid, cls, rows（遮罩過）, exp}  只有後端寫
     auditLogs/{id}                        後端寫、管理者讀
   每一份文件都帶 rev：更新時規則檢查 rev 剛好 +1、updatedBy 是自己，避免兩個人同時改互相蓋掉。

   過渡期（舊版還在用）：資料仍在舊位置 rc/main（整份 D）。lib/legacy.ts 把舊格式轉成這裡的型別，
   畫面只吃這裡的型別與 core.js 的 D，之後換成新位置時只要換 Repo 的實作。 */
import type { Period, Room, SlotKey } from "./types";

export type MemberRole = "admin" | "teacher" | "viewer";

/** Firebase Auth custom claims（由 Cloud Function setRole 設定） */
export interface RoleClaims {
  sid: string;
  role: MemberRole;
  /** 綁定的名冊老師 */
  teacherId?: string;
}

export interface Versioned {
  rev: number;
  updatedBy: string;
  updatedAt: Date | null;
}

export interface SchoolDoc {
  name: string;
  domain?: string;
}

export interface MemberDoc {
  email: string;
  role: MemberRole;
  active: boolean;
  /** 綁定的老師（terms/{tid}/teachers/{id}） */
  teacherId?: string;
}

export interface InviteDoc {
  role: MemberRole;
  by: string;
  exp: Date | null;
  teacherId?: string;
}

export interface TermDoc extends Versioned {
  title: string;
  periods: Period[];
  rooms: Room[];
  settings: Record<string, unknown>;
}

export interface StudentDoc extends Versioned {
  cls: string;
  seat: string;
  name: string;
  caseMgrUid: string;
  groupIds: string[];
}

/** students/{id}/private/profile：需求、障礙類別、聯絡資料等敏感內容 */
export interface StudentPrivate extends Versioned {
  needs: string[];
  note: string;
  [k: string]: unknown;
}

export interface TeacherDoc extends Versioned {
  name: string;
  role: string;
  /** 綁定的帳號；老師本人只能改自己的 off */
  uid?: string;
  off: SlotKey[];
  hours: number;
  note: string;
}

export interface GroupDoc extends Versioned {
  name: string;
  subject: string;
  teacherId: string;
  per: number;
  studentIds: string[];
  mode: string;
  room: string;
  on: boolean;
  grade: string;
  /** 排課結果：每一節一格 */
  slots: { s: SlotKey | ""; pin: boolean; r?: string }[];
  /** 試排／確定（拖曳排課那邊在做） */
  status?: "draft" | "final";
}

export interface PublicView {
  sid: string;
  cls: string;
  rows: Record<string, string>[];
  exp: Date | null;
}

/** 資料存取介面。現在只有 LegacyRepo（讀寫舊位置），之後加 SchoolRepo（新位置） */
export interface Repo {
  kind: "legacy" | "school";
  /** 改一位老師自己的不排課時段 */
  saveMyOff(teacherId: string, off: SlotKey[]): Promise<void>;
}

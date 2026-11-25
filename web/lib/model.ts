/* 目標資料模型：一筆資料一份文件，老師在技術上讀不到不是自己的學生。
   說明與搬移計畫：web/MIGRATION.md §3；規則：web/firestore.rules.next；存取介面：web/lib/repo/README.md。

     schools/{sid}                                {name, domain?, currentTerm?, mode?}               只有 Function 寫
     schools/{sid}/members/{uid}                  {email, role, teacherId?, active, claimsAt}        只有 Function 寫
     schools/{sid}/invites/{emailLower}           {email, role, teacherId?, by, exp}                 只有 Function 寫
     schools/{sid}/terms/{tid}                    TermDoc        學期設定（作息、教室、規則…；沒有學生姓名）
       teachers/{id}                              TeacherDoc
       classes/{cls}                              ClassDoc       導師、全校課表一列、各科任課老師
       groups/{gid}                               GroupDoc       課程＋排課結果 slots
       students/{id}                              StudentDoc     teacherIds＝誰讀得到這位學生
       students/{id}/private/profile              StudentPrivateDoc   只有個管老師與管理者／編輯
       attendance/{date_gid@pid}                  AttendanceDoc  管理者／編輯與那門課的老師
       iep/{roundId}                              IepRoundDoc    管理者／編輯＋readers（發起人、個管）
       iepInvite/{roundId}_{teacherId}            IepInviteDoc   被邀請的老師填空堂（老師本人＋readers）
       exam/{eid}  (+ private/{data|notice})      ExamDoc        考程、試場、監考；學生名單在 private
       versions/{id}, lockLog/{id}, staff/{id}    只有管理者／編輯
     publicViews/{token}, auditLogs/{id}          只有後端寫

   Firebase Auth custom claims（functions/nx-claims.js 設定）：{ sid, role, tid? }，tid＝名冊上的老師 id。
   每一份可寫的文件都帶 rev／updatedBy／updatedAt：新增 rev==1、更新剛好 +1、updatedBy 是自己（規則檢查）。

   轉換（舊 D ⇄ records）在 functions/nx-split.js，新版、Functions、測試共用同一份。 */
import type { AssignEntry, Period, Room, SlotKey, StudentSet, TtClass } from "./types";

/** admin＝特教組長（管成員）；editor＝排課者（資料全部可改，不管成員）；teacher＝只看自己的學生；viewer＝只讀總課表 */
export type MemberRole = "admin" | "editor" | "teacher" | "viewer";
export const MEMBER_ROLES: MemberRole[] = ["admin", "editor", "teacher", "viewer"];
/** 管理者與編輯：讀寫學校裡的全部資料 */
export const isStaff = (r: MemberRole | null | undefined): boolean => r === "admin" || r === "editor";

/** Firebase Auth custom claims（functions/nx-claims.js 設定） */
export interface RoleClaims {
  sid: string;
  role: MemberRole;
  /** 綁定的名冊老師 id（claims 裡叫 tid） */
  tid?: string;
  /** @deprecated 舊名稱，等同 tid（functions/roles.js 用過的 claims） */
  teacherId?: string;
}

/** 每一份用戶端可寫的文件都有 */
export interface Versioned {
  rev: number;
  /** uid；同步／搬移寫的是 'sync:legacy'、'migrate:legacy' */
  updatedBy: string;
  updatedAt: Date | null;
}
/** 讀出來的文件 = 內容 + rev 資訊 */
export type WithMeta<T> = T & Versioned;

export interface SchoolDoc {
  name: string;
  domain?: string;
  /** 目前的學期 terms/{tid} */
  currentTerm?: string;
  /** legacy＝過渡期：資料由 nxSyncFromLegacy 從 rc/main 單向同步，新版只讀；native＝新版是正本 */
  mode?: "legacy" | "native";
}

export interface MemberDoc {
  email: string;
  role: MemberRole;
  active: boolean;
  teacherId?: string;
  claimsAt?: Date | null;
}

export interface InviteDoc {
  email: string;
  role: MemberRole;
  teacherId?: string | null;
  by: string;
  exp: Date | null;
}

/* ───── 學期底下的文件內容（不含 rev 等；和 functions/nx-split.js 的 records 一致） ───── */

export interface TermDoc {
  v?: number;
  title?: string;
  periods?: Period[];
  rooms?: Room[];
  settings?: Record<string, unknown>;
  blocked?: SlotKey[];
  /** 年級／班級／群組的不排課（g:、c:、k:）；學生個人的（s:）在 StudentDoc.off */
  offBy?: Record<string, SlotKey[]>;
  sets?: StudentSet[];
  lockFix?: { cls: string; t: string; k: SlotKey; sj: string }[];
  offPool?: Record<string, SlotKey[]>;
  /** Firestore 收不下的欄位（例：lockLast 的巢狀陣列）：欄位名 → JSON */
  packed?: Record<string, string>;
  [k: string]: unknown;
}

export interface TeacherDoc {
  /** 名冊順序（core.js 用陣列索引） */
  ord: number;
  name: string;
  role: string;
  off: SlotKey[];
  note?: string;
  hours?: number;
  prefRooms?: string[];
  /** 其他欄位（JSON） */
  x?: string;
}

export interface ClassDoc {
  cls: string;
  head?: string;
  /** 科目 → 原班任課老師 id（舊 classSubj[`${cls}|${科目}`]） */
  subj: Record<string, string>;
  /** 全校課表這一班（舊 tt[cls]，有巢狀陣列所以存 JSON） */
  ttJson?: string;
  x?: string;
}

export interface GroupDoc {
  ord: number;
  name: string;
  subject: string;
  teacherId: string;
  per: number;
  mode: string;
  room: string;
  on: boolean;
  grade: string;
  studentIds: string[];
  fixed?: SlotKey[];
  /** 排課結果（舊 assign[gid]） */
  slots?: AssignEntry[];
  x?: string;
}

export interface StudentDoc {
  ord: number;
  cls: string;
  seat: string;
  name: string;
  /** 個管老師 id（'' ＝沒有） */
  caseMgrId: string;
  groupIds: string[];
  /** 誰讀得到：個管＋教他資源班課的老師＋原班該科任課老師（functions/nx-split.js readersOf） */
  teacherIds: string[];
  /** 公開提醒（簽到時給學生看） */
  note?: string;
  needs?: string[];
  /** 學生個人的不排課（舊 offBy[`s:${id}`]） */
  off?: SlotKey[];
}

/** students/{id}/private/profile：只有個管老師與管理者／編輯 */
export interface StudentPrivateDoc {
  /** 和學生文件的 caseMgrId 一樣（規則不用 get() 就能判斷） */
  caseMgrId: string;
  privNote?: string;
  iepDate?: string;
  reviewDate?: string;
  certExp?: string;
  examSvc?: Record<string, unknown>;
  contacts?: { id: string; date: string; how?: string; who?: string; note?: string }[];
  /** 其他（未知）欄位的 JSON：不知道敏不敏感的一律放這裡 */
  x?: string;
}

export interface AttendanceDoc {
  date: string;
  /** `${gid}@${pid}`（舊 rc/att-日期 的 key） */
  key: string;
  gid: string;
  pid: string;
  /** 那門課的資源班老師；這位老師讀寫得到 */
  teacherId: string;
  marks: Record<string, { st: string; at?: number; [k: string]: unknown }>;
  roster?: string[];
  info?: Record<string, unknown>;
}

export interface IepRoundDoc {
  ord: number;
  name: string;
  due: string;
  stuIds: string[];
  /** 讀得到的老師：發起人＋學生的個管 */
  readers: string[];
  /** 整份調查單（iep.js 的 round 形狀） */
  json: string;
}

/** iep/{roundId} 邀請到的一位老師的「填空堂」單（id＝`${roundId}_${teacherId}`）：
    發起人（readers）寫公開的部分，被邀請的老師只寫自己的回覆 free／note／ansAt。
    內容和線上連結（iepTok）同一套：學生只有班級座號（或遮字）、有課只寫種類，不放別的學生、障別或服務。 */
export interface IepInviteDoc {
  roundId: string;
  teacherId: string;
  /** 抄一份調查單的 readers（規則不用 get() 就知道誰能改、能讀） */
  readers: string[];
  name: string;
  round: string;
  kind: string;
  host: string;
  d1: string;
  d2: string;
  due: string;
  keys: string[];
  ps: { id: string; n: string; t: string }[];
  busy: Record<string, string>;
  stu: { c: string; r: string; q: number; cm: string }[];
  /** 已排定、要我出席的場次 */
  meets: { id: string; at: string; label: string; time: string; room: string; stu: string; req: number }[];
  free?: string[];
  note?: string;
  /** 老師送出的時間（毫秒）；沒有＝還沒填 */
  ansAt?: number;
}

export interface ExamDoc {
  title?: string;
  sessions?: unknown[];
  rooms?: unknown[];
  proctors?: string[];
  proctorOf?: Record<string, string>;
  supportOf?: Record<string, string>;
  packed?: Record<string, string>;
}

export interface JsonBlobDoc {
  json: string;
  [k: string]: unknown;
}

/** 一個學期、目前這個使用者讀得到的全部文件（讀不到的就不在裡面）。key＝文件 id（encId 過的） */
export interface TermRecords {
  term: TermDoc | null;
  teachers: Record<string, TeacherDoc>;
  classes: Record<string, ClassDoc>;
  groups: Record<string, GroupDoc>;
  students: Record<string, StudentDoc>;
  privates: Record<string, StudentPrivateDoc>;
  attendance: Record<string, AttendanceDoc>;
  iep: Record<string, IepRoundDoc>;
  versions: Record<string, JsonBlobDoc>;
  lockLog: Record<string, JsonBlobDoc>;
  staff: Record<string, JsonBlobDoc>;
  exam: Record<string, ExamDoc>;
  /** key＝`${eid}/${docId}` */
  examPrivate: Record<string, JsonBlobDoc>;
  /** IEP 填空堂邀請（新版才有，不在舊格式 D 裡；搬移與同步不碰） */
  iepInvite: Record<string, IepInviteDoc>;
}

export type Collection = Exclude<keyof TermRecords, "term">;

export interface PublicView {
  sid: string;
  cls: string;
  rows: Record<string, string>[];
  exp: Date | null;
}

export type { TtClass };

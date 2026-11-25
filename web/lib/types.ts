/* 資源班管理系統的資料 D（localStorage `resource-class-v1`、Firestore `rc/main.json`）的型別。
   欄位以 core.js 的 defaultData() / normalize() 為準；這裡只描述新版會用到的部分，其他欄位用索引簽章保留，
   讀進來再存回去時不會遺失。 */

/** 時段鍵：`${星期 0-4}-${節次 id}`，例：`2-5`＝週三第5節 */
export type SlotKey = string;

export interface Period {
  id: string;
  name: string;
  start: string;
  end: string;
  /** 外加時段（早自習、午休等）：抽離課不排在這裡 */
  extra?: boolean;
}

export interface Student {
  id: string;
  cls: string;
  seat: string;
  name: string;
  /** 個管老師的 teacher id */
  caseMgr: string;
  note: string;
  needs: string[];
  [k: string]: unknown;
}

export type TeacherRole = "資源班" | "普通班" | "兼課" | "代理" | "行政" | string;

export interface Teacher {
  id: string;
  name: string;
  role: TeacherRole;
  /** 老師自己的不排課時段 */
  off: SlotKey[];
  note: string;
  /** 應授課節數 */
  hours: number;
  [k: string]: unknown;
}

export type GroupMode = "抽離" | "外加" | "不鎖課" | string;

export interface Group {
  id: string;
  name: string;
  subject: string;
  /** 資源班授課老師的 teacher id */
  teacher: string;
  per: number;
  students: string[];
  mode: GroupMode;
  room: string;
  on: boolean;
  grade: string;
  [k: string]: unknown;
}

export interface Room {
  id: string;
  name: string;
  spare?: boolean;
}

export interface AssignEntry {
  s: SlotKey | "";
  pin: boolean;
  r?: string;
}

export interface StudentSet {
  id: string;
  name: string;
  students: string[];
  off: SlotKey[];
  note?: string;
}

/** 全校課表（tt）：班級 → 科目 → [老師姓名, 節數, 是否沒對上名冊] */
export interface TtClass {
  subj: Record<string, [string, number, number?][]>;
  src?: string;
  [k: string]: unknown;
}

export interface RcData {
  v: number;
  title: string;
  periods: Period[];
  students: Student[];
  teachers: Teacher[];
  rooms: Room[];
  /** `${班級}|${科目}` → 普通班任課老師 id */
  classSubj: Record<string, string>;
  groups: Group[];
  blocked: SlotKey[];
  /** 學生這一邊的不排課：g:年級、c:班級、k:班級不能鎖課、s:學生 id */
  offBy: Record<string, SlotKey[]>;
  sets: StudentSet[];
  /** group id → 每一節的排法 */
  assign: Record<string, AssignEntry[]>;
  settings: Record<string, unknown>;
  tt?: Record<string, TtClass>;
  lockFix?: { cls: string; t: string; k: SlotKey; sj: string }[];
  offPool?: Record<string, SlotKey[]>;
  [k: string]: unknown;
}

/* ───── 段考考場（exam.html；localStorage `special-exam-room-v1`、Firestore `exams/main.json`） ───── */

export interface ExamSession {
  id: string;
  date: string;
  dow: string;
  period: string;
  subject: string;
  start: string;
  end: string;
  [k: string]: unknown;
}

export interface ExamRoom {
  id: string;
  name: string;
  cap?: number;
  type?: string;
}

export interface ExamData {
  title?: string;
  sessions: ExamSession[];
  rooms: ExamRoom[];
  proctors: string[];
  /** `${session id}|${room id}` → 監考老師姓名 */
  proctorOf: Record<string, string>;
  /** `${session id}|${room id}` → 支援老師姓名 */
  supportOf: Record<string, string>;
  [k: string]: unknown;
}

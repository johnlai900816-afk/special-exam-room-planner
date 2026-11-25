/* 資料存取介面（Repo）。頁面只認這個介面；Firestore 版與記憶體（範例）版行為一樣。
   說明：web/lib/repo/README.md。 */
import type {
  AttendanceDoc,
  ClassDoc,
  ExamDoc,
  Collection,
  GroupDoc,
  IepInviteDoc,
  IepRoundDoc,
  JsonBlobDoc,
  MemberRole,
  StudentDoc,
  StudentPrivateDoc,
  TeacherDoc,
  TermDoc,
  TermRecords,
  Versioned,
} from "../model";
import type { SlotKey } from "../types";

/** 誰、在哪一間學校的哪一個學期 */
export interface RepoScope {
  sid: string;
  termId: string;
  uid: string;
  role: MemberRole;
  /** 綁定的名冊老師（claims.tid） */
  tid?: string;
}

/** 可以寫的集合（'term'＝學期文件本身）。exam、examPrivate、versions、lockLog、staff 只有管理者／編輯能寫（還原、新學期、匯入用） */
export type WritableCol =
  | "term"
  | "teachers"
  | "classes"
  | "groups"
  | "students"
  | "privates"
  | "attendance"
  | "iep"
  | "iepInvite"
  | "exam"
  | "examPrivate"
  | "versions"
  | "lockLog"
  | "staff";

export interface DocTypes {
  term: TermDoc;
  teachers: TeacherDoc;
  classes: ClassDoc;
  groups: GroupDoc;
  students: StudentDoc;
  privates: StudentPrivateDoc;
  attendance: AttendanceDoc;
  iep: IepRoundDoc;
  iepInvite: IepInviteDoc;
  exam: ExamDoc;
  examPrivate: JsonBlobDoc;
  versions: JsonBlobDoc;
  lockLog: JsonBlobDoc;
  staff: JsonBlobDoc;
}
export type DocOf<C extends WritableCol> = DocTypes[C];

/** 文件的版本資訊；key＝revKey(col, id) */
export type RevMap = Record<string, Versioned>;
export const revKey = (col: WritableCol | Collection, id: string): string => (col === "term" ? "term" : col + "/" + id);

export interface Loaded {
  /** 這個使用者讀得到的全部文件（讀不到的不在裡面） */
  records: TermRecords;
  revs: RevMap;
}

/** 別人先改了：current 是資料庫裡現在的內容與 rev（null＝已被刪除） */
export class RevConflictError extends Error {
  readonly code = "rev-conflict";
  constructor(
    readonly col: WritableCol,
    readonly id: string,
    readonly expected: number,
    readonly current: { rev: number; updatedBy: string } | null,
  ) {
    super(`內容已被${current ? current.updatedBy : "別人"}更新（${col}/${id}：預期 rev ${expected}，現在 ${current ? current.rev : "已刪除"}）`);
    this.name = "RevConflictError";
  }
}

/** 沒有權限（記憶體版照規則模擬；Firestore 版是 permission-denied） */
export class RepoDeniedError extends Error {
  readonly code = "permission-denied";
  constructor(msg: string) {
    super(msg);
    this.name = "RepoDeniedError";
  }
}

export type Unsubscribe = () => void;

/** 一批寫入的一項：data＝null 是刪除；expectRev＝畫面讀到的 rev（新增 0；null＝不檢查） */
export interface BatchOp {
  col: WritableCol;
  id: string;
  data: Record<string, unknown> | null;
  expectRev: number | null;
}
export interface BatchResult {
  written: number;
  deleted: number;
  /** 衍生欄位（學生的 groupIds、teacherIds、private.caseMgrId）另外補寫的份數 */
  linked: number;
}
export interface BatchOptions {
  /** 一個交易最多幾份文件（Firestore 上限 500；預設 300）。同一位學生的學生文件與 private 一定在同一個交易 */
  chunk?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface Repo {
  readonly kind: "firestore" | "memory";
  readonly scope: RepoScope;
  /** 過渡期（schools/{sid}.mode=='legacy'）資料由 rc/main 單向同步，畫面應該只讀；寫入會丟錯 */
  readonly readOnly: boolean;

  /** 讀這個使用者讀得到的全部。老師：學期設定、老師、班級、課程、自己的學生（個管的才有 private）、自己的點名、自己的 IEP */
  load(): Promise<Loaded>;
  /** 即時跟著變；每次變動都給完整的一份（和 load() 同形狀） */
  watch(next: (x: Loaded) => void, fail?: (e: Error) => void): Unsubscribe;

  /**
   * 寫一整份文件。expectRev＝畫面讀到的 rev（新增給 0）；資料庫裡的 rev 不一樣就丟 RevConflictError。
   * 回傳新的 rev。寫 groups／students 時會一起更新受影響學生的 groupIds、teacherIds 與 private.caseMgrId。
   */
  put<C extends WritableCol>(col: C, id: string, data: DocOf<C>, expectRev: number): Promise<number>;
  /** 只改部分欄位（其他規則同 put） */
  patch<C extends WritableCol>(col: C, id: string, partial: Partial<DocOf<C>>, expectRev: number): Promise<number>;
  /** 刪除（只有管理者／編輯；學生會連 private 一起刪） */
  remove(col: WritableCol, id: string): Promise<void>;

  /**
   * 一次寫很多份（匯入、個管分配、還原、新學期）。每一份都檢查 rev；衍生欄位照最後的結果一起補。
   * Firestore 分成幾個交易（chunk）；某一個交易失敗時，前面已經寫進去的不會退回（錯誤訊息會說寫到哪裡）。
   */
  batch(ops: BatchOp[], opt?: BatchOptions): Promise<BatchResult>;

  /** 老師改自己的不排課時段（teachers/{tid}.off） */
  saveMyOff(off: SlotKey[], expectRev: number): Promise<number>;
  /** 點名一位學生；rec=null 是取消。文件不存在會建立（teacherId 取自課程） */
  mark(date: string, gid: string, pid: string, studentId: string, rec: AttendanceDoc["marks"][string] | null): Promise<void>;
}

export type { JsonBlobDoc };

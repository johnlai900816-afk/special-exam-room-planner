/* 設定 › 學校資料 › ① 匯入 Excel：認工作表（舊 app.js sheetType）、用 core.js 的匯入函式在副本上試跑、
   算出要寫的文件（新增、更新、刪除）與要人確認的地方（座號相同姓名不同、名冊找不到的學生…），按下套用才寫。
   Excel 用 SheetJS 官方 CDN（和舊版同一個檔、同一個 SRI），檔案只在這台電腦讀。單元測試：test/import.test.ts。 */
import { CORE } from "../core";
import type { TermRecords } from "../model";
import type { RcData } from "../types";
import { planOnD, type Planned } from "./apply";

export type SheetKind = "stu" | "tl" | "course" | "off" | "lock";
export const SHEET_NAME: Record<SheetKind, string> = { stu: "學生名單", tl: "任課老師名單", course: "課程一覽表", off: "不排課時段", lock: "手排鎖課" };
/** 學生名單先讀：個管老師先建成資源班老師，課程一覽表後面用 normName 對回同一位，不會重複 */
export const SHEET_ORDER: SheetKind[] = ["stu", "tl", "course", "off", "lock"];

interface StuRes {
  add: number;
  upd: number;
  skip: number;
  cm: number;
  noCM: string[];
  newCM: string[];
  conflict: { cls: string; seat: string; old: string; oldName: string; id: string; name: string; text: string }[];
}
interface TlRes {
  set: number;
  changed: number;
  newT: string[];
  classes: number;
}
interface CourseRes {
  added: number;
  updated: number;
  members: number;
  miss: string[];
  teachers: number;
  hours: number;
  kept: string[];
  coT: string[];
}
interface OffRes {
  cls: number;
  tea: number;
  cells: number;
  skipT: string[];
  newT: number;
  bad: number;
}
interface LockRes {
  n: number;
  cls: number;
  newT: string[];
  bad: number;
}
type Imp = typeof CORE & {
  importStudents(D: RcData, t: string): StuRes;
  importTeacherList(D: RcData, t: string): TlRes;
  importCourseTable(D: RcData, t: string): CourseRes;
  importOff(D: RcData, t: string, opt?: { hard?: string | string[]; addTeachers?: boolean }): OffRes;
  importLocks(D: RcData, t: string): LockRes;
};
const X = CORE as Imp;

/** 認工作表（舊 app.js sheetType）。rows：每列每格的文字 */
export function sheetType(rows: string[][]): SheetKind | "" {
  const top = rows.slice(0, 6);
  const has = (re: RegExp) => top.some((r) => r.some((c) => re.test(c)));
  if (has(/起始星期/) && has(/首節/)) return "off";
  if (has(/^班級名稱$/) && has(/^教師姓名$/) && has(/^首節$/)) return "lock";
  if (rows.some((r) => r.some((c, j) => c === "節次" && j >= 2 && /^\d{3,4}$/.test(r[j - 2]) && /星期一/.test(r[j + 1] || "")))) return "lock";
  if (has(/學生名單/) && has(/節數/)) return "course";
  for (let i = 0; i < rows.length; i++) {
    const nums = rows[i].map((x, j) => (/^\d{3,4}$/.test(x) ? j : -1)).filter((j) => j >= 0);
    if (nums.some((v, k) => k >= 2 && nums[k - 1] === v - 1 && nums[k - 2] === v - 2)) {
      const nx = rows.slice(i + 1, i + 3).find((r) => r.some(Boolean));
      if (nx && /^(國語?文?|國語文|英語?文?|英語文|數學|理化|自然|社會)$/.test(nx.find(Boolean) || "")) return "tl";
    }
  }
  if (has(/^(學生)?姓名$/) && has(/班級/) && !has(/科目/)) return "stu";
  return "";
}

/** 貼上的文字 → 列（Tab 分欄） */
export const rowsOf = (text: string): string[][] =>
  String(text || "")
    .split(/\r?\n/)
    .map((l) => l.split("\t").map((c) => c.replace(/[\t\r\n]+/g, " ").trim()))
    .filter((r) => r.some(Boolean));
export const tsvOf = (rows: string[][]): string => rows.map((r) => r.join("\t")).join("\n");

export interface Sheet {
  file: string;
  sheet: string;
  type: SheetKind;
  on: boolean;
  /** 列數 */
  n: number;
  tsv: string;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** 在副本上試一次，帶得出幾筆（0＝這張表沒有用，不列出來） */
export function probe(D: RcData, type: SheetKind, tsv: string): number {
  const Y = clone(D);
  if (type === "tl") return X.importTeacherList(Y, tsv).set;
  if (type === "stu") {
    const r = X.importStudents(Y, tsv);
    return r.add + r.upd;
  }
  if (type === "course") {
    const r = X.importCourseTable(Y, tsv);
    return r.added + r.updated;
  }
  if (type === "lock") return X.importLocks(Y, tsv).n;
  const r = X.importOff(Y, tsv, {});
  return r.cls + r.tea;
}

/** 從表裡找出班級不排課出現過的原因（舊 offReasons；原因只寫在每段第一列，往下沿用） */
export function offReasons(text: string): string[] {
  const set = new Set<string>();
  let why = "";
  String(text || "")
    .split(/\r?\n/)
    .forEach((l) => {
      const c = l.split("\t").map((x) => x.trim());
      if (c[5]) why = c[5];
      if (/^\d{3,4}(\.0)?$/.test(c[0]) && why) set.add(why);
    });
  return [...set];
}

export interface ImportOpts {
  /** 班級不排課：'*'＝全部不能排；陣列＝這些原因才全擋，其他只擋國英數 */
  hard?: "*" | string[];
  /** 不排課表裡名冊沒有的老師也新增 */
  addTeachers?: boolean;
}

export interface ImportReport {
  lines: string[];
  conflicts: StuRes["conflict"];
  newCM: string[];
  noCM: string[];
  kept: string[];
  coT: string[];
  miss: string[];
}

/** 試跑勾選的工作表（順序：學生→任課→課程→不排課→鎖課），回傳要寫的文件與報告 */
export function planImport(records: TermRecords, sheets: Sheet[], opt: ImportOpts = {}): Planned<ImportReport> {
  const on = sheets.filter((x) => x.on);
  // 資料輸入和資料輸出是同一份鎖課，兩張都勾時只讀第一張
  const lk = on.filter((x) => x.type === "lock").slice(1);
  const use = on.filter((x) => !lk.includes(x));
  return planOnD(records, (D) => {
    const rep: ImportReport = { lines: [], conflicts: [], newCM: [], noCM: [], kept: [], coT: [], miss: [] };
    SHEET_ORDER.forEach((t) =>
      use
        .filter((x) => x.type === t)
        .forEach((x) => {
          const nm = "「" + x.sheet + "」";
          if (t === "stu") {
            const r = X.importStudents(D, x.tsv);
            rep.conflicts.push(...r.conflict);
            rep.newCM.push(...r.newCM);
            rep.noCM.push(...r.noCM);
            rep.lines.push(nm + "：新增 " + r.add + " 位學生、更新 " + r.upd + " 位" + (r.cm ? "，個管老師 " + r.cm + " 位" : "") + (r.skip ? "；略過 " + r.skip + " 行" : ""));
          } else if (t === "tl") {
            const r = X.importTeacherList(D, x.tsv);
            rep.lines.push(nm + "：" + r.classes + " 個班、" + r.set + " 格任課老師" + (r.changed ? "（其中 " + r.changed + " 格換了老師）" : "") + (r.newT.length ? "，新增 " + r.newT.length + " 位老師" : ""));
          } else if (t === "course") {
            const r = X.importCourseTable(D, x.tsv);
            rep.kept.push(...r.kept);
            rep.coT.push(...r.coT);
            rep.miss.push(...r.miss);
            rep.lines.push(nm + "：新增 " + r.added + " 門課、更新 " + r.updated + " 門，放進課裡的學生 " + r.members + " 筆" + (r.hours ? "，基本鐘點 " + r.hours + " 位" : ""));
          } else if (t === "off") {
            const r = X.importOff(D, x.tsv, { hard: opt.hard || "*", addTeachers: !!opt.addTeachers });
            rep.lines.push(nm + "：班級 " + r.cls + " 列、老師 " + r.tea + " 列，新增 " + r.cells + " 格" + (r.skipT.length ? "；不在名冊、略過的老師 " + r.skipT.length + " 位" : ""));
          } else {
            const r = X.importLocks(D, x.tsv);
            rep.lines.push(nm + "：手排鎖課 " + r.n + " 節、" + r.cls + " 個班（整份換成這一份）" + (r.newT.length ? "；新增老師 " + r.newT.join("、") : ""));
          }
        }),
    );
    rep.newCM = [...new Set(rep.newCM)];
    rep.noCM = [...new Set(rep.noCM)];
    rep.miss = [...new Set(rep.miss)];
    return rep;
  });
}

/* ───── 讀 Excel（瀏覽器；SheetJS 0.20.3，和舊版同一個來源與 SRI） ───── */
const XLSX_SRC = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
const XLSX_SRI = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
interface XlsxApi {
  read(d: ArrayBuffer, o: { type: "array" }): { SheetNames: string[]; Sheets: Record<string, unknown>; Workbook?: { Sheets?: { Hidden?: number }[] } };
  utils: { sheet_to_json(ws: unknown, o: { header: 1; raw: false; defval: string; blankrows: false }): unknown[][] };
}
let xlsxP: Promise<XlsxApi> | null = null;
function needXlsx(): Promise<XlsxApi> {
  const w = window as unknown as { XLSX?: XlsxApi };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (!xlsxP)
    xlsxP = new Promise<XlsxApi>((ok, bad) => {
      const s = document.createElement("script");
      s.src = XLSX_SRC;
      s.integrity = XLSX_SRI;
      s.crossOrigin = "anonymous";
      s.onload = () => (w.XLSX ? ok(w.XLSX) : bad(new Error("xlsx")));
      s.onerror = () => {
        xlsxP = null;
        bad(new Error("讀 Excel 的元件下載失敗，請確認網路，或改用貼上"));
      };
      document.head.appendChild(s);
    });
  return xlsxP;
}

/** 讀檔案裡的每一張工作表，認得出、帶得出資料的才回傳；skip＝略過幾張 */
export async function readWorkbooks(files: File[], D: RcData): Promise<{ sheets: Sheet[]; skip: number }> {
  const X0 = await needXlsx();
  const sheets: Sheet[] = [];
  let skip = 0;
  for (const f of files) {
    const wb = X0.read(await f.arrayBuffer(), { type: "array" });
    wb.SheetNames.forEach((n, i) => {
      if (wb.Workbook?.Sheets?.[i]?.Hidden) return void skip++;
      const rows = X0.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "", blankrows: false }).map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, " ").trim()));
      const type = sheetType(rows);
      const tsv = tsvOf(rows);
      if (!type || !probe(D, type, tsv)) return void skip++;
      sheets.push({ file: f.name, sheet: n, type, on: true, n: rows.length, tsv });
    });
  }
  return { sheets, skip };
}

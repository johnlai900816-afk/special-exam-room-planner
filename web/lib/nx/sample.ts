/* 匯入用的範例表（虛構的人名）：學生名單、任課老師名單、課程一覽表、不排課時段。
   和學校的 Excel 工作表同樣的欄位（複製成 Tab 分隔的文字）。單元測試、端對端測試、範例資料的「用範例表試試」都用這一份。 */
import type { Sheet, SheetKind } from "./importer";

const T = (rows: string[][]) => rows.map((r) => r.join("\t")).join("\n");

export const SAMPLE_STUDENTS = T([
  ["班級", "座號", "姓名", "個管"],
  ["701", "03", "王小明", "林老師"],
  ["701", "12", "陳小華", "林老師"],
  ["702", "05", "李小安", "張老師"],
  ["801", "07", "黃小雨", ""],
  ["802", "11", "吳小晴", "張老師"],
]);

export const SAMPLE_TEACHERS = T([
  ["", "701", "702", "703"],
  ["國語文", "周老師", "鄭老師", "周老師"],
  ["英語文", "謝老師", "謝老師", "許老師"],
  ["數學", "蔡老師", "蔡老師", "曾老師"],
]);

export const SAMPLE_COURSES = T([
  ["領域", "年級", "組別", "方式", "學生名單", "節數", "", "", "教師"],
  ["國文", "7", "A", "抽離", "701-03王小明、701-12陳小華", "5", "", "", "林老師"],
  ["數學", "7", "A", "抽離", "701-03王小明、702-05李小安", "4", "", "", "張老師"],
  ["英文", "8", "A", "抽離", "801-07黃小雨、802-11吳小晴", "3", "", "", "林老師"],
  ["", "", "", "", "", "", "", "", ""],
  ["教師", "總節數"],
  ["林老師", "16"],
  ["張老師", "14"],
]);

export const SAMPLE_OFF = T([
  ["名稱", "起始星期", "結束星期", "首節", "末節", "原因"],
  ["701", "3", "3", "5", "7", "社團時間"],
  ["周老師", "1", "1", "1", "2", "導師會報"],
]);

const sheet = (sheet: string, type: SheetKind, tsv: string): Sheet => ({ file: "範例表.xlsx", sheet, type, on: true, n: tsv.split("\n").length, tsv });

/** 一份完整的範例匯入（四張表） */
export function sampleSheets(): Sheet[] {
  return [sheet("學生名單", "stu", SAMPLE_STUDENTS), sheet("教師名單", "tl", SAMPLE_TEACHERS), sheet("課程一覽表", "course", SAMPLE_COURSES), sheet("不排課", "off", SAMPLE_OFF)];
}

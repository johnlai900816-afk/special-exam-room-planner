/* 老師模式的純邏輯：直接 import repo 根目錄的 teacher.js（舊版、node test-iep.js 用的同一份）。
   teacher.js 在有 module.exports 時只匯出 TEACH（上半部的純邏輯），不會執行下半部的畫面。只補型別。 */
import TEACH_JS from "../../teacher.js";
import type { RcData, Student } from "./types";

export interface DueItem {
  s: Student;
  k: "iepDate" | "reviewDate" | "certExp";
  name: string;
  date: string;
  /** 還有幾天（負的＝已經過了） */
  left: number;
}
export interface ProctorDuty {
  key: string;
  date: string;
  dow: string;
  period: string;
  subject: string;
  start: string;
  end: string;
  room: string;
  sup: boolean;
  order: number;
}

export interface TeachApi {
  PRIV: string[];
  myGroups(D: RcData, tid: string): RcData["groups"];
  myStudents(D: RcData, tid: string): { cm: Student[]; taught: Student[] };
  canSeePriv(s: Student | null, tid: string, role: string): boolean;
  studentView(s: Student, tid: string, role: string): Student;
  relation(D: RcData, tid: string, s: Student): "" | "cm" | "taught";
  dueSoon(D: RcData, tid: string, today: string, days?: number): DueItem[];
  proctorDuties(E: unknown, name: string): ProctorDuty[];
  normName(s: string): string;
}

export const TEACH = TEACH_JS as unknown as TeachApi;

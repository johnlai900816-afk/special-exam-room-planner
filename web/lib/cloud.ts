/* Firestore 讀寫。文件位置和舊系統 cloud.js / exam.html 完全相同，新版只「加」文件，不改舊文件的格式：

   舊的（新版照讀，必要時照同樣格式寫）
     config/access        共用名單 {admin, emails, viewers, link?}；新版加 bind、admins
     rc/main              名冊與排課 {json: JSON.stringify(D), by, at}
     exams/main           段考考場   {json, by, at}

   新的（要部署 web/firestore.rules.proposed 才寫得進去；目前的正式規則會擋下來）
     teacherOff/{teacherId}        老師自己送出的不排課時段 {off, by, at, status}
     joinRequests/{uid}            還沒加入的老師送出的加入申請 {email, name, note, at}
     replies/{topic}/by/{uid}      老師自己的回覆（例：通知單、IEP 會議出席） */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import type { Access } from "./accounts";
import { CORE } from "./core";
import { firebase } from "./firebase";
import type { ExamData, RcData, SlotKey } from "./types";

export interface JsonDoc<T> {
  data: T | null;
  by?: string;
  at?: Date | null;
}

const tsDate = (t: unknown): Date | null => {
  if (!t) return null;
  const x = t as Timestamp;
  return typeof x.toDate === "function" ? x.toDate() : null;
};

function db() {
  const fb = firebase();
  if (!fb) throw new Error("沒有連接雲端");
  return fb.db;
}

export function watchAccess(next: (a: Access | null) => void, fail: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    doc(db(), "config/access"),
    (s) => next(s.exists() ? (s.data() as Access) : null),
    fail,
  );
}

/* 新版不提供「第一個登入的人成為主持人」：第一位管理者由部署腳本建立（見 repo 根目錄 functions/scripts/bootstrap-admin.js 與 MIGRATION.md）。 */

/** 只有主持人寫得進去（舊規則）。新版只改 emails / viewers / bind，其他欄位保留 */
export async function saveAccess(a: Access): Promise<void> {
  await updateDoc(doc(db(), "config/access"), {
    emails: a.emails,
    viewers: a.viewers || [],
    bind: a.bind || {},
  });
}

function watchJson<T>(path: string, parse: (o: unknown) => T, next: (d: JsonDoc<T>) => void, fail: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    doc(db(), path),
    (s) => {
      if (s.metadata.hasPendingWrites) return;
      if (!s.exists()) {
        next({ data: null });
        return;
      }
      const x = s.data() as { json?: string; by?: string; at?: unknown };
      let data: T | null = null;
      try {
        data = x.json ? parse(JSON.parse(x.json)) : null;
      } catch {
        data = null;
      }
      next({ data, by: x.by, at: tsDate(x.at) });
    },
    fail,
  );
}

export const watchMain = (next: (d: JsonDoc<RcData>) => void, fail: (e: Error) => void) =>
  watchJson("rc/main", (o) => CORE.normalize(o), next, fail);

export const watchExam = (next: (d: JsonDoc<ExamData>) => void, fail: (e: Error) => void) =>
  watchJson("exams/main", (o) => o as ExamData, next, fail);

/** 改 rc/main：讀最新的一份、改、寫回去（交易），格式和 cloud.js 的 cloudPush 一樣，舊版畫面會即時跟著更新 */
export async function updateMain(by: string, edit: (D: RcData) => void): Promise<void> {
  const ref = doc(db(), "rc/main");
  await runTransaction(db(), async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new Error("雲端還沒有名冊與排課資料");
    const D = CORE.normalize(JSON.parse((s.data() as { json: string }).json));
    edit(D);
    tx.set(ref, { json: JSON.stringify(D), by, at: serverTimestamp() });
  });
}

/* ───── 老師自己的不排課時段 ───── */

export interface TeacherOffDoc {
  teacherId: string;
  off: SlotKey[];
  by: string;
  at: Date | null;
  status: "pending" | "applied";
  note?: string;
}

export async function submitTeacherOff(teacherId: string, off: SlotKey[], by: string, note = ""): Promise<void> {
  await setDoc(doc(db(), "teacherOff", teacherId), { teacherId, off, by, note, status: "pending", at: serverTimestamp() });
}

export function watchTeacherOff(teacherId: string, next: (d: TeacherOffDoc | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db(), "teacherOff", teacherId),
    (s) => next(s.exists() ? ({ ...(s.data() as TeacherOffDoc), at: tsDate(s.data().at) }) : null),
    () => next(null),
  );
}

export async function listTeacherOff(): Promise<TeacherOffDoc[]> {
  const q = await getDocs(collection(db(), "teacherOff"));
  return q.docs.map((d) => ({ ...(d.data() as TeacherOffDoc), at: tsDate(d.data().at) }));
}

/** 管理者把老師送出的不排課時段套進 rc/main，再把申請標成已套用 */
export async function applyTeacherOff(req: TeacherOffDoc, by: string): Promise<void> {
  await updateMain(by, (D) => {
    const t = D.teachers.find((x) => x.id === req.teacherId);
    if (!t) throw new Error("名冊裡找不到這位老師");
    t.off = [...req.off];
  });
  await updateDoc(doc(db(), "teacherOff", req.teacherId), { status: "applied", appliedBy: by, appliedAt: serverTimestamp() });
}

/* ───── 加入申請 ───── */

export interface JoinRequest {
  uid: string;
  email: string;
  name: string;
  note: string;
  at: Date | null;
}

export async function submitJoinRequest(uid: string, email: string, name: string, note: string): Promise<void> {
  await setDoc(doc(db(), "joinRequests", uid), { uid, email, name, note, at: serverTimestamp() });
}

export async function listJoinRequests(): Promise<JoinRequest[]> {
  const q = await getDocs(collection(db(), "joinRequests"));
  return q.docs.map((d) => ({ ...(d.data() as JoinRequest), at: tsDate(d.data().at) }));
}

export async function dropJoinRequest(uid: string): Promise<void> {
  await deleteDoc(doc(db(), "joinRequests", uid));
}

/* ───── 老師自己的回覆（通知單、IEP 會議…） ───── */

export async function saveReply(topic: string, uid: string, email: string, teacherId: string, answer: Record<string, unknown>): Promise<void> {
  await setDoc(doc(db(), "replies", topic, "by", uid), { uid, email, teacherId, topic, answer, at: serverTimestamp() });
}

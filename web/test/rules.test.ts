/* 新規則（web/firestore.rules.next 的 B 段 schools/{sid}/…）的單元測試。要 Firestore 模擬器：
     cd web && npm run test:rules
   （firebase emulators:exec 會開模擬器、設 FIRESTORE_EMULATOR_HOST、跑完關掉；要 Java 11+） */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const T = "schools/s1/terms/t1";
let env: RulesTestEnvironment;

type Claims = { sid?: string; role?: string; tid?: string; email_verified?: boolean };
function as(uid: string, c: Claims): Firestore {
  return env.authenticatedContext(uid, { email: uid + "@school.test", email_verified: true, ...c }).firestore() as unknown as Firestore;
}
const admin = () => as("uAdmin", { sid: "s1", role: "admin" });
const editor = () => as("uEditor", { sid: "s1", role: "editor" });
const r1 = () => as("uR1", { sid: "s1", role: "teacher", tid: "r1" });
const r2 = () => as("uR2", { sid: "s1", role: "teacher", tid: "r2" });
const k1 = () => as("uK1", { sid: "s1", role: "teacher", tid: "k1" });
const viewer = () => as("uView", { sid: "s1", role: "viewer" });
const otherAdmin = () => as("uOther", { sid: "s2", role: "admin" });

const meta = (rev: number) => ({ rev, updatedBy: "seed", updatedAt: new Date(0) });
const stu = (o: Record<string, unknown>) => ({ ord: 0, cls: "701", seat: "03", groupIds: [], note: "", needs: [], ...o });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nx-rules",
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules.next"), "utf8") },
  });
});
afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (p: string, d: Record<string, unknown>) => setDoc(doc(db, p), d);
    await set("schools/s1", { name: "測試國中" });
    await set("schools/s1/members/uR1", { email: "ur1@school.test", role: "teacher", teacherId: "r1", active: true });
    await set(T, { title: "115-1", periods: [], rooms: [], settings: {}, ...meta(1) });
    await set(T + "/teachers/r1", { ord: 0, name: "林老師", role: "資源班", off: [], hours: 12, ...meta(1) });
    await set(T + "/teachers/r2", { ord: 1, name: "王老師", role: "資源班", off: [], ...meta(1) });
    await set(T + "/groups/g1", { ord: 0, name: "七國", subject: "國文", teacherId: "r1", studentIds: ["s1"], per: 5, ...meta(1) });
    await set(T + "/groups/g2", { ord: 1, name: "八國", subject: "國文", teacherId: "r2", studentIds: ["s2"], per: 5, ...meta(1) });
    await set(T + "/students/s1", stu({ name: "王小明", caseMgrId: "r1", teacherIds: ["r1"], ...meta(1) }));
    await set(T + "/students/s1/private/profile", { caseMgrId: "r1", privNote: "秘密一", ...meta(1) });
    await set(T + "/students/s2", stu({ ord: 1, name: "陳小華", caseMgrId: "r2", teacherIds: ["k1", "r2"], ...meta(1) }));
    await set(T + "/students/s2/private/profile", { caseMgrId: "r2", privNote: "秘密二", ...meta(1) });
    await set(T + "/attendance/2026-11-26_g2@1", {
      date: "2026-11-26", key: "g2@1", gid: "g2", pid: "1", teacherId: "r2", marks: {}, ...meta(1),
    });
    await set(T + "/staff/legacy", { json: "{}", ...meta(1) });
    await set(T + "/iep/r1", { ord: 0, name: "期初", due: "", stuIds: ["s2"], readers: ["r2"], json: "{}", ...meta(1) });
    await set("schools/s2/terms/t1/students/x1", stu({ name: "別校生", caseMgrId: "z", teacherIds: ["z"], ...meta(1) }));
  });
});

describe("老師只讀得到自己的學生", () => {
  it("個管讀得到自己的學生、讀不到別人的", async () => {
    await assertSucceeds(getDoc(doc(r1(), T + "/students/s1")));
    await assertFails(getDoc(doc(r1(), T + "/students/s2")));
  });
  it("teacherIds 裡有自己（教他課、原班任課）也讀得到", async () => {
    await assertSucceeds(getDoc(doc(k1(), T + "/students/s2")));
    await assertFails(getDoc(doc(k1(), T + "/students/s1")));
  });
  it("帶 array-contains／caseMgrId 條件的查詢可以，不帶條件的查詢整個被拒", async () => {
    await assertSucceeds(getDocs(query(collection(r1(), T + "/students"), where("teacherIds", "array-contains", "r1"))));
    await assertSucceeds(getDocs(query(collection(r1(), T + "/students"), where("caseMgrId", "==", "r1"))));
    await assertFails(getDocs(collection(r1(), T + "/students")));
    await assertFails(getDocs(query(collection(r1(), T + "/students"), where("teacherIds", "array-contains", "r2"))));
  });
  it("沒有 tid 的老師什麼學生都讀不到", async () => {
    const noTid = as("uX", { sid: "s1", role: "teacher" });
    await assertFails(getDoc(doc(noTid, T + "/students/s1")));
  });
  it("老師不能改學生文件", async () => {
    await assertFails(updateDoc(doc(r1(), T + "/students/s1"), { name: "改名", rev: 2, updatedBy: "uR1", updatedAt: serverTimestamp() }));
  });
  it("信箱沒驗證的帳號被拒", async () => {
    const nv = as("uNv", { sid: "s1", role: "admin", email_verified: false });
    await assertFails(getDoc(doc(nv, T)));
  });
});

describe("private 只有個管與管理者／編輯", () => {
  it("個管讀得到；只教課的老師讀不到", async () => {
    await assertSucceeds(getDoc(doc(r2(), T + "/students/s2/private/profile")));
    await assertFails(getDoc(doc(k1(), T + "/students/s2/private/profile")));
    await assertFails(getDoc(doc(r1(), T + "/students/s2/private/profile")));
  });
  it("個管可以改私密欄位，但不能改 caseMgrId", async () => {
    const ref = doc(r2(), T + "/students/s2/private/profile");
    await assertSucceeds(updateDoc(ref, { privNote: "新", rev: 2, updatedBy: "uR2", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { caseMgrId: "r1", rev: 3, updatedBy: "uR2", updatedAt: serverTimestamp() }));
  });
  it("管理者寫 private 時 caseMgrId 要和學生文件一致", async () => {
    const ref = doc(admin(), T + "/students/s1/private/profile");
    await assertFails(updateDoc(ref, { caseMgrId: "r2", rev: 2, updatedBy: "uAdmin", updatedAt: serverTimestamp() }));
    // 同一批改學生與 private：可以
    const db = admin();
    const b = writeBatch(db);
    b.update(doc(db, T + "/students/s1"), { caseMgrId: "r2", teacherIds: ["r1", "r2"], rev: 2, updatedBy: "uAdmin", updatedAt: serverTimestamp() });
    b.update(doc(db, T + "/students/s1/private/profile"), { caseMgrId: "r2", rev: 2, updatedBy: "uAdmin", updatedAt: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
});

describe("管理者與編輯什麼都能做（自己學校）", () => {
  for (const [who, db] of [["admin", admin], ["editor", editor]] as const) {
    it(who + " 讀寫全部", async () => {
      const x = db();
      const uid = who === "admin" ? "uAdmin" : "uEditor";
      await assertSucceeds(getDocs(collection(x, T + "/students")));
      await assertSucceeds(getDoc(doc(x, T + "/students/s2/private/profile")));
      await assertSucceeds(getDoc(doc(x, T + "/staff/legacy")));
      await assertSucceeds(getDocs(collection(x, T + "/attendance")));
      const b = writeBatch(x);
      b.set(doc(x, T + "/students/s9"), stu({ name: "新同學", caseMgrId: "r1", teacherIds: ["r1"], rev: 1, updatedBy: uid, updatedAt: serverTimestamp() }));
      b.set(doc(x, T + "/students/s9/private/profile"), { caseMgrId: "r1", privNote: "", rev: 1, updatedBy: uid, updatedAt: serverTimestamp() });
      await assertSucceeds(b.commit());
      await assertSucceeds(updateDoc(doc(x, T + "/groups/g1"), { studentIds: ["s1", "s9"], rev: 2, updatedBy: uid, updatedAt: serverTimestamp() }));
      await assertSucceeds(updateDoc(doc(x, T), { title: "改", rev: 2, updatedBy: uid, updatedAt: serverTimestamp() }));
      await assertSucceeds(deleteDoc(doc(x, T + "/students/s9/private/profile")));
      await assertSucceeds(deleteDoc(doc(x, T + "/students/s9")));
    });
  }
  it("只有 admin 列得出成員；成員與邀請誰都不能從網頁寫", async () => {
    await assertSucceeds(getDocs(collection(admin(), "schools/s1/members")));
    await assertFails(getDocs(collection(editor(), "schools/s1/members")));
    await assertSucceeds(getDoc(doc(r1(), "schools/s1/members/uR1")));
    await assertFails(getDoc(doc(r1(), "schools/s1/members/uAdmin")));
    await assertFails(setDoc(doc(admin(), "schools/s1/members/uNew"), { email: "a@b", role: "admin", active: true }));
    await assertFails(setDoc(doc(admin(), "schools/s1/invites/a@b"), { role: "admin" }));
    await assertFails(updateDoc(doc(admin(), "schools/s1"), { name: "x" }));
  });
  it("形狀不對被拒：多出欄位、名字太長、個管不在 teacherIds", async () => {
    const x = admin();
    const base = { rev: 2, updatedBy: "uAdmin", updatedAt: serverTimestamp() };
    await assertFails(updateDoc(doc(x, T + "/students/s1"), { ...base, secret: "x" }));
    await assertFails(updateDoc(doc(x, T + "/students/s1"), { ...base, name: "長".repeat(41) }));
    await assertFails(updateDoc(doc(x, T + "/students/s1"), { ...base, teacherIds: ["r2"] }));
    await assertFails(updateDoc(doc(x, T + "/groups/g1"), { ...base, per: 16 }));
  });
});

describe("檢視（viewer）", () => {
  it("讀得到學期設定、老師、課程；讀不到學生、點名、IEP", async () => {
    const v = viewer();
    await assertSucceeds(getDoc(doc(v, T)));
    await assertSucceeds(getDocs(collection(v, T + "/teachers")));
    await assertSucceeds(getDocs(collection(v, T + "/groups")));
    await assertFails(getDoc(doc(v, T + "/students/s1")));
    await assertFails(getDocs(collection(v, T + "/attendance")));
    await assertFails(getDoc(doc(v, T + "/iep/r1")));
    await assertFails(getDoc(doc(v, T + "/staff/legacy")));
  });
  it("什麼都不能寫", async () => {
    const v = viewer();
    const base = { rev: 2, updatedBy: "uView", updatedAt: serverTimestamp() };
    await assertFails(updateDoc(doc(v, T), { ...base, title: "x" }));
    await assertFails(updateDoc(doc(v, T + "/groups/g1"), { ...base, name: "x" }));
    await assertFails(updateDoc(doc(v, T + "/teachers/r1"), { ...base, off: ["1-1"] }));
    await assertFails(setDoc(doc(v, T + "/students/s7"), stu({ name: "x", caseMgrId: "", teacherIds: [], rev: 1, updatedBy: "uView", updatedAt: serverTimestamp() })));
  });
});

describe("跨校一律拒絕", () => {
  it("別校的管理者讀寫不到這間學校", async () => {
    const o = otherAdmin();
    await assertFails(getDoc(doc(o, "schools/s1")));
    await assertFails(getDoc(doc(o, T)));
    await assertFails(getDoc(doc(o, T + "/students/s1")));
    await assertFails(getDocs(collection(o, T + "/teachers")));
    await assertFails(updateDoc(doc(o, T), { title: "x", rev: 2, updatedBy: "uOther", updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(o, "schools/s2/terms/t1/students/x1")));
  });
  it("這間學校的老師讀不到別校", async () => {
    await assertFails(getDoc(doc(r1(), "schools/s2/terms/t1/students/x1")));
  });
});

describe("rev：新增從 1 開始、更新剛好 +1、updatedBy 是自己", () => {
  const ref = () => doc(admin(), T + "/teachers/r1");
  it("rev +1 可以", async () => {
    await assertSucceeds(updateDoc(ref(), { hours: 10, rev: 2, updatedBy: "uAdmin", updatedAt: serverTimestamp() }));
  });
  it("rev 沒變、跳號、倒退都不行", async () => {
    await assertFails(updateDoc(ref(), { hours: 10, rev: 1, updatedBy: "uAdmin", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(), { hours: 10, rev: 3, updatedBy: "uAdmin", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(), { hours: 10, updatedBy: "uAdmin", updatedAt: serverTimestamp() }));
  });
  it("updatedBy 寫別人、updatedAt 不是伺服器時間都不行", async () => {
    await assertFails(updateDoc(ref(), { hours: 10, rev: 2, updatedBy: "uR1", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(), { hours: 10, rev: 2, updatedBy: "uAdmin", updatedAt: new Date() }));
  });
  it("新增時 rev 一定是 1", async () => {
    const x = admin();
    await assertFails(setDoc(doc(x, T + "/teachers/r9"), { ord: 9, name: "新", role: "資源班", off: [], rev: 2, updatedBy: "uAdmin", updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(x, T + "/teachers/r9"), { ord: 9, name: "新", role: "資源班", off: [], rev: 1, updatedBy: "uAdmin", updatedAt: serverTimestamp() }));
  });
});

describe("老師自己的不排課時段", () => {
  it("只能改自己的 off，不能改其他欄位或別人的", async () => {
    const base = { rev: 2, updatedBy: "uR1", updatedAt: serverTimestamp() };
    await assertSucceeds(updateDoc(doc(r1(), T + "/teachers/r1"), { ...base, off: ["2-5"] }));
    await assertFails(updateDoc(doc(r1(), T + "/teachers/r1"), { rev: 3, updatedBy: "uR1", updatedAt: serverTimestamp(), hours: 1 }));
    await assertFails(updateDoc(doc(r1(), T + "/teachers/r2"), { ...base, off: ["2-5"] }));
  });
});

describe("點名", () => {
  const att = (gid: string, teacherId: string, uid: string) => ({
    date: "2026-11-27", key: gid + "@1", gid, pid: "1", teacherId, marks: { s1: { st: "in" } }, rev: 1, updatedBy: uid, updatedAt: serverTimestamp(),
  });
  it("老師只能點自己的課、只讀得到自己的課", async () => {
    await assertSucceeds(setDoc(doc(r1(), T + "/attendance/2026-11-27_g1@1"), att("g1", "r1", "uR1")));
    await assertFails(setDoc(doc(r1(), T + "/attendance/2026-11-27_g2@1"), att("g2", "r1", "uR1")));
    await assertFails(setDoc(doc(r1(), T + "/attendance/2026-11-27_g2@1"), att("g2", "r2", "uR1")));
    await assertFails(getDoc(doc(r1(), T + "/attendance/2026-11-26_g2@1")));
    await assertSucceeds(getDoc(doc(r2(), T + "/attendance/2026-11-26_g2@1")));
    await assertSucceeds(getDocs(query(collection(r1(), T + "/attendance"), where("teacherId", "==", "r1"))));
  });
});

describe("只給管理者的文件與 IEP", () => {
  it("staff／versions／lockLog 老師讀不到", async () => {
    await assertFails(getDoc(doc(r1(), T + "/staff/legacy")));
    await assertFails(getDocs(collection(r1(), T + "/versions")));
  });
  it("IEP 調查單只有 readers 讀得到", async () => {
    await assertSucceeds(getDoc(doc(r2(), T + "/iep/r1")));
    await assertFails(getDoc(doc(r1(), T + "/iep/r1")));
  });
});

describe("IEP：老師自己開的調查、填空堂邀請、線上回覆（新版老師端）", () => {
  const S = serverTimestamp;
  const inv = (o: Record<string, unknown> = {}) => ({
    roundId: "r1", teacherId: "k1", readers: ["r2"], name: "陳老師", round: "期初", kind: "IEP 期初會議", host: "王老師",
    d1: "2026-12-01", d2: "2026-12-05", due: "2026-11-30", keys: ["2026-12-01|1"], ps: [], busy: {}, stu: [], meets: [], ...o,
  });
  const stamp = (uid: string, rev: number) => ({ rev, updatedBy: uid, updatedAt: S() });
  it("老師建立自己是 reader 的調查單；只有自己一個 reader 時可以刪", async () => {
    const R = { ord: 1, name: "我的", due: "", stuIds: ["s1"], readers: ["r1"], json: "{}" };
    await assertSucceeds(setDoc(doc(r1(), T + "/iep/m1"), { ...R, ...stamp("uR1", 1) }));
    await assertFails(setDoc(doc(r1(), T + "/iep/m2"), { ...R, readers: ["r2"], ...stamp("uR1", 1) }));
    await assertSucceeds(deleteDoc(doc(r1(), T + "/iep/m1")));
    // 不是 reader 的不能刪；有別的 reader（別位個管）也不能刪
    await assertFails(deleteDoc(doc(r1(), T + "/iep/r1")));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), T + "/iep/r9"), { ...R, readers: ["r1", "r2"], ...meta(1) }));
    await assertFails(deleteDoc(doc(r1(), T + "/iep/r9")));
  });
  it("發起人（readers）建立邀請；不是 reader 的不行；id 要等於 調查單_老師", async () => {
    await assertSucceeds(setDoc(doc(r2(), T + "/iepInvite/r1_k1"), { ...inv(), ...stamp("uR2", 1) }));
    await assertFails(setDoc(doc(r1(), T + "/iepInvite/r1_r1"), { ...inv({ teacherId: "r1", readers: ["r1"] }), ...stamp("uR1", 1) }));
    await assertFails(setDoc(doc(r2(), T + "/iepInvite/r1_xx"), { ...inv(), ...stamp("uR2", 1) }));
    await assertFails(setDoc(doc(r2(), T + "/iepInvite/r1_r1"), { ...inv({ teacherId: "r1", extra: 1 }), ...stamp("uR2", 1) }));
  });
  it("被邀請的老師讀得到自己的、只能改回覆；別人的讀不到；發起人改不了回覆", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), T + "/iepInvite/r1_k1"), { ...inv(), ...meta(1) }));
    await assertSucceeds(getDoc(doc(k1(), T + "/iepInvite/r1_k1")));
    await assertSucceeds(getDocs(query(collection(k1(), T + "/iepInvite"), where("teacherId", "==", "k1"))));
    await assertFails(getDoc(doc(r1(), T + "/iepInvite/r1_k1")));
    await assertFails(getDocs(collection(k1(), T + "/iepInvite")));
    await assertSucceeds(updateDoc(doc(k1(), T + "/iepInvite/r1_k1"), { free: ["2026-12-01|1"], note: "可以調課", ansAt: 5, ...stamp("uK1", 2) }));
    await assertFails(updateDoc(doc(k1(), T + "/iepInvite/r1_k1"), { keys: ["2026-12-02|1"], ...stamp("uK1", 3) }));
    await assertFails(updateDoc(doc(r2(), T + "/iepInvite/r1_k1"), { free: [], ...stamp("uR2", 3) }));
    await assertSucceeds(updateDoc(doc(r2(), T + "/iepInvite/r1_k1"), { due: "2026-12-02", ...stamp("uR2", 3) }));
    await assertSucceeds(getDocs(query(collection(r2(), T + "/iepInvite"), where("readers", "array-contains", "r2"))));
    await assertFails(deleteDoc(doc(k1(), T + "/iepInvite/r1_k1")));
    await assertSucceeds(deleteDoc(doc(r2(), T + "/iepInvite/r1_k1")));
  });
  it("線上回覆（Function 從 iepResp 抄過來的）只有 readers 讀得到，誰都不能從網頁寫", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), T + "/iep/r1/responses/" + "a".repeat(64)), { pk: "t:k1", free: [] }));
    await assertSucceeds(getDocs(collection(r2(), T + "/iep/r1/responses")));
    await assertFails(getDocs(collection(r1(), T + "/iep/r1/responses")));
    await assertFails(setDoc(doc(r2(), T + "/iep/r1/responses/" + "b".repeat(64)), { pk: "x" }));
  });
});

describe("管理者端的寫入（phase 3a）：老師、班級、學生、private", () => {
  const st = (uid: string, rev: number) => ({ rev, updatedBy: uid, updatedAt: serverTimestamp() });
  for (const [who, db, uid] of [
    ["admin", admin, "uAdmin"],
    ["editor", editor, "uEditor"],
  ] as const) {
    it(who + "：老師（含減授、超鐘點、個管上限）、班級任課老師、學生＋private 同一批", async () => {
      const d = db();
      await assertSucceeds(
        setDoc(doc(d, T + "/teachers/r1"), {
          ord: 0, name: "林老師", role: "資源班", off: [], hours: 12, reduce: 2, reduceNote: "組長", otMax: 3,
          prefSubj: ["國文"], prefGrade: ["7"], avoidSubj: [], cmCap: 6, noCM: false, ...st(uid, 2),
        }),
      );
      await assertSucceeds(setDoc(doc(d, T + "/teachers/t9"), { ord: 9, name: "新老師", role: "普通班", off: [], note: "", hours: 0, ...st(uid, 1) }));
      await assertSucceeds(setDoc(doc(d, T + "/classes/701"), { cls: "701", subj: { 國文: "t9" }, ...st(uid, 1) }));
      // 換個管：學生與 private 同一批寫（private 的 caseMgrId 要和同一批的學生一致）
      const b = writeBatch(d);
      b.set(doc(d, T + "/students/s1"), stu({ name: "王小明", caseMgrId: "r2", teacherIds: ["r1", "r2"], ...st(uid, 2) }));
      b.set(doc(d, T + "/students/s1/private/profile"), { caseMgrId: "r2", privNote: "秘密一", ...st(uid, 2) });
      await assertSucceeds(b.commit());
      // 新增學生＋private；刪學生＋private
      const b2 = writeBatch(d);
      b2.set(doc(d, T + "/students/s9"), stu({ ord: 9, name: "新同學", caseMgrId: "", teacherIds: [], ...st(uid, 1) }));
      b2.set(doc(d, T + "/students/s9/private/profile"), { caseMgrId: "", ...st(uid, 1) });
      await assertSucceeds(b2.commit());
      const b3 = writeBatch(d);
      b3.delete(doc(d, T + "/students/s9/private/profile"));
      b3.delete(doc(d, T + "/students/s9"));
      await assertSucceeds(b3.commit());
      await assertSucceeds(deleteDoc(doc(d, T + "/teachers/t9")));
    });
  }
  it("只改學生的個管、private 沒跟著改：被拒", async () => {
    const d = admin();
    const b = writeBatch(d);
    b.set(doc(d, T + "/students/s1"), stu({ name: "王小明", caseMgrId: "r2", teacherIds: ["r1", "r2"], ...st("uAdmin", 2) }));
    b.set(doc(d, T + "/students/s1/private/profile"), { caseMgrId: "r1", privNote: "秘密一", ...st("uAdmin", 2) });
    await assertFails(b.commit());
  });
  it("老師欄位型別不對被拒（減授是字串、不當個管不是布林、超鐘點太大）", async () => {
    const d = admin();
    const base = { ord: 0, name: "林老師", role: "資源班", off: [], ...st("uAdmin", 2) };
    await assertFails(setDoc(doc(d, T + "/teachers/r1"), { ...base, reduce: "2" }));
    await assertFails(setDoc(doc(d, T + "/teachers/r1"), { ...base, noCM: "yes" }));
    await assertFails(setDoc(doc(d, T + "/teachers/r1"), { ...base, otMax: 99 }));
    await assertFails(setDoc(doc(d, T + "/teachers/r1"), { ...base, unknownField: 1 }));
  });
  it("檢視、老師不能寫老師、班級、學生、private", async () => {
    for (const [d, uid] of [
      [viewer(), "uView"],
      [r1(), "uR1"],
    ] as const) {
      await assertFails(setDoc(doc(d, T + "/teachers/t9"), { ord: 9, name: "x", role: "普通班", off: [], ...st(uid, 1) }));
      await assertFails(updateDoc(doc(d, T + "/teachers/r2"), { hours: 3, ...st(uid, 2) }));
      await assertFails(setDoc(doc(d, T + "/classes/701"), { cls: "701", subj: {}, ...st(uid, 1) }));
      await assertFails(setDoc(doc(d, T + "/students/s9"), stu({ name: "x", caseMgrId: "", teacherIds: [], ...st(uid, 1) })));
      await assertFails(updateDoc(doc(d, T + "/students/s2/private/profile"), { privNote: "x", ...st(uid, 2) }));
      await assertFails(deleteDoc(doc(d, T + "/students/s2")));
    }
  });
  it("學期文件：管理者、編輯可以建新學期；只有管理者能刪學期；老師不能建", async () => {
    const T2 = "schools/s1/terms/t2";
    await assertSucceeds(setDoc(doc(editor(), T2), { title: "115-2", periods: [], rooms: [], settings: {}, ...st("uEditor", 1) }));
    await assertFails(setDoc(doc(r1(), "schools/s1/terms/t3"), { title: "x", ...st("uR1", 1) }));
    await assertFails(deleteDoc(doc(editor(), T2)));
    await assertSucceeds(deleteDoc(doc(admin(), T2)));
  });
});

describe("排課（phase 3b）：草稿、確定（課程 slots＋版本＋鎖課紀錄＋學期 lockLast 一批）", () => {
  const st = (uid: string, rev: number) => ({ rev, updatedBy: uid, updatedAt: serverTimestamp() });
  const draft = (uid: string, rev: number, a = "{}") => ({ kind: "draft", label: "試排 11/26 10:30", at: 1, json: JSON.stringify({ a: JSON.parse(a), label: "試排", at: 1 }), ...st(uid, rev) });
  for (const [who, d, uid] of [
    ["管理者", admin, "uAdmin"],
    ["編輯", editor, "uEditor"],
  ] as const)
    it(who + "：寫草稿（versions/draft、staff/sched）、改草稿、確定時一批寫 slots＋版本＋lockLog＋學期、刪草稿", async () => {
      const db = d();
      const b = writeBatch(db);
      b.set(doc(db, T + "/versions/draft"), draft(uid, 1));
      b.set(doc(db, T + "/staff/sched"), { json: "{}", ...st(uid, 1) });
      b.update(doc(db, T), { settings: { seed: 2 }, ...st(uid, 2) });
      await assertSucceeds(b.commit());
      await assertSucceeds(updateDoc(doc(db, T + "/versions/draft"), { json: JSON.stringify({ a: { g1: "0-1*" } }), ...st(uid, 2) }));
      const c = writeBatch(db);
      c.update(doc(db, T + "/groups/g1"), { slots: [{ s: "0-1", pin: true }], ...st(uid, 2) });
      c.set(doc(db, T + "/versions/v000"), { kind: "ver", ord: 0, label: "期初課表", at: 2, json: "{}", ...st(uid, 1) });
      c.set(doc(db, T + "/lockLog/L000"), { ord: 0, at: 2, json: JSON.stringify({ label: "期初課表", added: [], removed: [] }), ...st(uid, 1) });
      c.update(doc(db, T), { packed: { lockLast: "{}" }, ...st(uid, 3) });
      c.delete(doc(db, T + "/versions/draft"));
      await assertSucceeds(c.commit());
    });
  it("老師、檢視不能寫草稿、版本、鎖課紀錄，也讀不到；不能改課程的 slots", async () => {
    for (const [d, uid] of [
      [r1(), "uR1"],
      [viewer(), "uView"],
    ] as const) {
      await assertFails(setDoc(doc(d, T + "/versions/draft"), draft(uid, 1)));
      await assertFails(setDoc(doc(d, T + "/lockLog/L000"), { ord: 0, at: 1, json: "{}", ...st(uid, 1) }));
      await assertFails(setDoc(doc(d, T + "/staff/sched"), { json: "{}", ...st(uid, 1) }));
      await assertFails(updateDoc(doc(d, T + "/groups/g1"), { slots: [{ s: "0-1" }], ...st(uid, 2) }));
      await assertFails(getDocs(collection(d, T + "/lockLog")));
    }
  });
  it("草稿形狀不對被拒（多出欄位、沒有 json）；rev 沒有 +1 被拒", async () => {
    const db = admin();
    await assertFails(setDoc(doc(db, T + "/versions/draft"), { ...draft("uAdmin", 1), extra: 1 }));
    await assertFails(setDoc(doc(db, T + "/versions/draft"), { kind: "draft", ...st("uAdmin", 1) }));
    await assertSucceeds(setDoc(doc(db, T + "/versions/draft"), draft("uAdmin", 1)));
    await assertFails(updateDoc(doc(db, T + "/versions/draft"), { label: "x", ...st("uAdmin", 1) }));
  });
});

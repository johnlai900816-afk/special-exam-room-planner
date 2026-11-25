/* 老師端端對端（模擬器）：兩位老師、兩位學生，用 Auth 模擬器真的登入（custom claims {sid, role, tid}），
   透過 Firestore 版 Repo 讀資料，規則是 firestore.rules.next。確認：
     ・每位老師只讀得到自己的學生（個管＋teacherIds 有自己），private 只有個管讀得到、寫得到
     ・「我的學生」「今天」等畫面用的函式拿到的就是這些
   要 Firestore＋Auth 模擬器：cd web && npm run test:e2e */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimsOf } from "../lib/accounts";
import { canSeePrivate, myStudentList, privPatch } from "../lib/nx/privacy";
import { createFirestoreRepo, revKey, scopeOf, toCoreD, type Repo } from "../lib/repo";

const PROJECT = "demo-rc";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FS = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const T = "schools/s1/terms/t1";
const meta = { rev: 1, updatedBy: "seed", updatedAt: new Date(0) };

let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

async function authRest(path: string, body: unknown, owner = false) {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(owner ? { Authorization: "Bearer owner" } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(path + " " + r.status + " " + (await r.text()));
  return r.json() as Promise<{ localId: string }>;
}

/** 建帳號、設 claims、用 client SDK 登入，回傳這位老師的 Repo 與 db */
async function signIn(email: string, claims: Record<string, string>): Promise<{ repo: Repo; db: Firestore }> {
  const u = await authRest("accounts:signUp", { email, password: "pass1234", returnSecureToken: true });
  await authRest(`projects/${PROJECT}/accounts:update`, { localId: u.localId, emailVerified: true, customAttributes: JSON.stringify(claims) }, true);
  const app = initializeApp({ projectId: PROJECT, apiKey: "fake", authDomain: "localhost" }, email);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://" + AUTH, { disableWarnings: true });
  const cred = await signInWithEmailAndPassword(auth, email, "pass1234");
  const tok = await cred.user.getIdTokenResult(true);
  const c = claimsOf(tok.claims);
  expect(c).toMatchObject(claims);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FS[0], +FS[1]);
  const scope = scopeOf(c, cred.user.uid, "t1")!;
  return { repo: createFirestoreRepo(db, scope), db };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules.next"), "utf8"), host: FS[0], port: +FS[1] },
  });
  await env.clearFirestore();
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (p: string, d: Record<string, unknown>) => setDoc(doc(db, p), d);
    await set("schools/s1", { name: "測試國中", currentTerm: "t1", mode: "native" });
    await set(T, { title: "115-1", periods: [{ id: "1", name: "第1節", start: "08:20", end: "09:05" }], rooms: [], settings: {}, ...meta });
    await set(T + "/teachers/r1", { ord: 0, name: "林老師", role: "資源班", off: [], ...meta });
    await set(T + "/teachers/r2", { ord: 1, name: "王老師", role: "資源班", off: [], ...meta });
    await set(T + "/groups/g1", { ord: 0, name: "七國", subject: "國文", teacherId: "r1", studentIds: ["s1", "s2"], per: 1, mode: "抽離", room: "", on: true, grade: "7", ...meta });
    const stu = (id: string, ord: number, name: string, cm: string, ids: string[]) =>
      set(T + "/students/" + id, { ord, cls: "701", seat: String(ord + 1), name, caseMgrId: cm, groupIds: ["g1"], teacherIds: ids, note: "", needs: [], ...meta });
    await stu("s1", 0, "王小明", "r1", ["r1"]);
    await stu("s2", 1, "陳小華", "r2", ["r1", "r2"]);
    await stu("s3", 2, "張小安", "r2", ["r2"]);
    await set(T + "/students/s1/private/profile", { caseMgrId: "r1", privNote: "r1 的秘密", ...meta });
    await set(T + "/students/s2/private/profile", { caseMgrId: "r2", privNote: "r2 的秘密", ...meta });
    await set(T + "/students/s3/private/profile", { caseMgrId: "r2", privNote: "r2 的秘密三", ...meta });
  });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe("兩位老師各自登入", () => {
  it("林老師（r1）：學生只有 s1（個管）、s2（有教）；private 只有 s1", async () => {
    const { repo, db } = await signIn("r1@school.test", { sid: "s1", role: "teacher", tid: "r1" });
    const L = await repo.load();
    expect(Object.keys(L.records.students).sort()).toEqual(["s1", "s2"]);
    expect(Object.keys(L.records.privates)).toEqual(["s1"]);
    const S = myStudentList(L.records, "r1");
    expect(S.cm.map((x) => x.id)).toEqual(["s1"]);
    expect(S.taught.map((x) => x.id)).toEqual(["s2"]);
    expect(canSeePrivate(repo.scope, L.records, "s1")).toBe(true);
    expect(canSeePrivate(repo.scope, L.records, "s2")).toBe(false);
    // 直接讀別人個管的 private、讀不到的學生：規則擋
    await expect(getDoc(doc(db, T + "/students/s2/private/profile"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(db, T + "/students/s3"))).rejects.toMatchObject({ code: "permission-denied" });
    // 改自己個管的私密欄位可以；改別人的被擋
    await repo.patch("privates", "s1", privPatch("privNote", "改過了"), L.revs[revKey("privates", "s1")].rev);
    expect((await repo.load()).records.privates.s1.privNote).toBe("改過了");
    await expect(repo.patch("privates", "s2", { privNote: "x" }, 1)).rejects.toThrow();
    // 課表組得起來，只有讀得到的學生
    const D = toCoreD(L.records);
    expect(D.students.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
  });
  it("王老師（r2）：學生 s2、s3（都是個管），private 兩份；讀不到 s1", async () => {
    const { repo, db } = await signIn("r2@school.test", { sid: "s1", role: "teacher", tid: "r2" });
    const L = await repo.load();
    expect(Object.keys(L.records.students).sort()).toEqual(["s2", "s3"]);
    expect(Object.keys(L.records.privates).sort()).toEqual(["s2", "s3"]);
    expect(L.records.privates.s2.privNote).toBe("r2 的秘密");
    await expect(getDoc(doc(db, T + "/students/s1/private/profile"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(db, T + "/students/s1"))).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("點名：林老師點自己的課可以；王老師不能點林老師的課", async () => {
    const r1 = await signIn("r1b@school.test", { sid: "s1", role: "teacher", tid: "r1" });
    await r1.repo.mark("2026-11-30", "g1", "1", "s1", { st: "in", tin: "08:21" });
    const L = await r1.repo.load();
    expect(L.records.attendance["2026-11-30_g1@1"].marks.s1.st).toBe("in");
    const r2 = await signIn("r2b@school.test", { sid: "s1", role: "teacher", tid: "r2" });
    await expect(r2.repo.mark("2026-11-30", "g1", "1", "s2", { st: "in" })).rejects.toThrow();
  });
});

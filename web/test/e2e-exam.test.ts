/* 段考端對端（模擬器）：管理者真的登入（claims {sid, role:'admin'}），寫入範例資料後
     1. 管理者排段考：名冊帶入、服務、自動排列、監考分配，一批存（exam/main、private、placements、seats）
     2. 監考老師登入：只讀得到自己監考的試場（交卷名單）與自己的學生的考場；讀不到學生名單（private）、別人的試場；不能改段考
     3. 沒有監考的老師什麼試場都讀不到
     4. 查考場連結：管理者開連結，不用登入讀得到；關閉後讀不到
   規則是 firestore.rules.next。要 Firestore＋Auth 模擬器：cd web && npm run test:e2e（這個檔案用學校 s5） */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimsOf } from "../lib/accounts";
import { CORE } from "../lib/core";
import { applyOps, diffRecords } from "../lib/nx/apply";
import { EID, examOps, loadExam } from "../lib/nx/examData";
import { build, runSolve } from "../lib/nx/examOut";
import { pushViews, readView, regOf, withClassKeys } from "../lib/nx/examView";
import { SCHED_COLS } from "../lib/nx/sched";
import { createFirestoreRepo, demoRecords, revKey, scopeOf, splitD, toCoreD, type Repo } from "../lib/repo";
import { TEACH } from "../lib/teach";

const PROJECT = "demo-rc";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FS = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const T = "schools/s5/terms/t1";

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
async function signIn(email: string, claims: Record<string, string>): Promise<{ repo: Repo; db: Firestore }> {
  const u = await authRest("accounts:signUp", { email, password: "pass1234", returnSecureToken: true });
  await authRest(`projects/${PROJECT}/accounts:update`, { localId: u.localId, emailVerified: true, customAttributes: JSON.stringify(claims) }, true);
  const app = initializeApp({ projectId: PROJECT, apiKey: "fake", authDomain: "localhost" }, email);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://" + AUTH, { disableWarnings: true });
  const cred = await signInWithEmailAndPassword(auth, email, "pass1234");
  const c = claimsOf((await cred.user.getIdTokenResult(true)).claims);
  expect(c).toMatchObject(claims);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FS[0], +FS[1]);
  return { repo: createFirestoreRepo(db, scopeOf(c, cred.user.uid, "t1")!), db };
}
/** 沒登入（查考場連結的人） */
function anon(): Firestore {
  const app = initializeApp({ projectId: PROJECT, apiKey: "fake" }, "anon-exam");
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FS[0], +FS[1]);
  return db;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules.next"), "utf8"), host: FS[0], port: +FS[1] },
  });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "schools/s5"), { name: "測試國中五", currentTerm: "t1", mode: "native" });
    await setDoc(doc(db, T), { ...splitD(CORE.emptyData()).term, rev: 1, updatedBy: "seed", updatedAt: new Date(0) });
  });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe("段考：管理者排考場，老師只看得到自己的監考", () => {
  it("管理者排段考、存檔 → 監考老師看到自己的試場與交卷名單 → 別的讀不到、改不了 → 查考場連結", async () => {
    const { repo, db } = await signIn("ex-admin@school.test", { sid: "s5", role: "admin" });
    let L = await repo.load();
    await applyOps(repo, diffRecords(L.records, demoRecords(), SCHED_COLS), L.revs, { chunk: 40 });
    L = await repo.load();

    // 1. 管理者排段考（和段考頁做的一樣：名冊帶入 → 服務 → 自動排列與監考 → 一批存）
    const ld = loadExam(L.records, toCoreD(L.records));
    expect(ld.E.students.length).toBeGreaterThan(3);
    ld.E.title = "115學年度第1學期第1次段考";
    ld.E.students.forEach((s, i) => (s.sv = i % 3 === 0 ? { ext: "*" } : i % 3 === 1 ? { small: "*" } : { read: "*", oral: ["國文"] }));
    const X = build(ld.E);
    runSolve(X, "all");
    expect(Object.values(X.D.assign).some((a) => a.room)).toBe(true);
    await applyOps(repo, examOps(L.records, X.D, null), L.revs, { chunk: 100 });
    L = await repo.load();
    expect(L.records.exam[EID].title).toBe("115學年度第1學期第1次段考");
    const places = Object.values(L.records.examPlace);
    expect(places.length).toBeGreaterThan(2);
    expect(Object.keys(L.records.examSeat).length).toBeGreaterThan(0);

    // 2. 有監考的老師
    const tid = places.find((p) => p.proctorIds.length)!.proctorIds[0];
    const mineP = places.filter((p) => p.proctorIds.includes(tid));
    const t = await signIn("ex-" + tid + "@school.test", { sid: "s5", role: "teacher", tid });
    const TL = (await t.repo.load()).records;
    expect(Object.keys(TL.examPlace).sort()).toEqual(Object.keys(L.records.examPlace).filter((k) => L.records.examPlace[k].proctorIds.includes(tid)).sort());
    expect(Object.keys(TL.examPlace).length).toBe(mineP.length);
    Object.values(TL.examSeat).forEach((s) => expect(s.teacherIds).toContain(tid));
    expect(Object.keys(TL.examPrivate)).toEqual([]);
    // 我的監考（考程與監考對照只有老師姓名，沒有學生）
    expect(TEACH.proctorDuties(TL.exam[EID], TL.teachers[tid].name).length).toBeGreaterThanOrEqual(mineP.length);
    await expect(getDoc(doc(t.db, T + "/exam/main/private/data"))).rejects.toMatchObject({ code: "permission-denied" });
    const notMine = Object.keys(L.records.examPlace).find((k) => !L.records.examPlace[k].proctorIds.includes(tid));
    if (notMine) await expect(getDoc(doc(t.db, T + "/exam/main/placements/" + notMine.slice(EID.length + 1)))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDocs(collection(t.db, T + "/exam/main/placements"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(t.repo.put("exam", EID, { ...TL.exam[EID], title: "老師改的" }, (await t.repo.load()).revs[revKey("exam", EID)].rev)).rejects.toBeTruthy();
    expect((await repo.load()).records.exam[EID].title).toBe("115學年度第1學期第1次段考");

    // 3. 沒有監考的老師
    const busy = new Set(places.flatMap((p) => p.proctorIds));
    const free = Object.keys(L.records.teachers).find((id) => !busy.has(id));
    if (free) {
      const o = await signIn("ex-" + free + "@school.test", { sid: "s5", role: "teacher", tid: free });
      expect(Object.keys((await o.repo.load()).records.examPlace)).toEqual([]);
    }

    // 4. 查考場連結：開 → 不用登入讀得到（班級的遮名）→ 關閉 → 讀不到
    const reg = withClassKeys({ link: "0123456789abcdef0123456789abcdef", vcls: {} }, build(X.D));
    await pushViews(db, repo.scope, build(X.D), reg, 0);
    L = await repo.load();
    expect(regOf(L.records.examPrivate[EID + "/view"]).link).toBe(reg.link);
    const a = anon();
    const all = await readView(a, reg.link);
    expect(all?.all).toBe(true);
    expect(all!.rows.length).toBeGreaterThan(0);
    expect(all!.rows.every((r) => r.svc === undefined && r.memo === undefined)).toBe(true);
    const c0 = Object.keys(reg.vcls)[0];
    const one = await readView(a, reg.vcls[c0]);
    expect(one?.cls).toBe(c0);
    expect(one!.rows.every((r) => r.cls === c0 && r.name.includes("○"))).toBe(true);
    await pushViews(db, repo.scope, build(X.D), { link: "", vcls: {} }, L.revs[revKey("examPrivate", EID + "/view")].rev, [reg.link, ...Object.values(reg.vcls)]);
    expect(await readView(a, reg.link)).toBeNull();
    expect(await readView(a, reg.vcls[c0])).toBeNull();
  }, 240000);
});

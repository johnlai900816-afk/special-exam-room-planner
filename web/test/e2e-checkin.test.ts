/* 點名端對端（模擬器）：管理者真的登入（claims {sid, role:'admin'}），寫入範例資料後
     1. 管理者替某一門課點名（Repo.mark：第一次點名記下名單、組名、節次名稱）
     2. 那門課的老師登入：讀得到這一節、可以接著改；紀錄統計算得到
     3. 別的老師：讀不到這一節（直接 get 被拒，load 也沒有），也寫不進去
   規則是 firestore.rules.next。要 Firestore＋Auth 模擬器：cd web && npm run test:e2e（這個檔案用學校 s4） */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getDocs, collection, getFirestore, query, setDoc, where, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimsOf } from "../lib/accounts";
import { CORE } from "../lib/core";
import { applyOps, diffRecords } from "../lib/nx/apply";
import { attStats } from "../lib/nx/checkin";
import { SCHED_COLS } from "../lib/nx/sched";
import { sessionsOn } from "../lib/nx/today";
import { createFirestoreRepo, demoRecords, scopeOf, splitD, toCoreD, type Repo } from "../lib/repo";
import { buildBoard } from "../lib/schedule";

const PROJECT = "demo-rc";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FS = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const T = "schools/s4/terms/t1";

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

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules.next"), "utf8"), host: FS[0], port: +FS[1] },
  });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  // 空的學期（新版的學校，mode native）；範例資料由管理者自己一批寫進去
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "schools/s4"), { name: "測試國中四", currentTerm: "t1", mode: "native" });
    await setDoc(doc(db, T), { ...splitD(CORE.emptyData()).term, rev: 1, updatedBy: "seed", updatedAt: new Date(0) });
  });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe("點名：管理者點名，那門課的老師看得到，別的老師看不到", () => {
  it("管理者點名 → 老師看到、接著改 → 別的老師讀不到、寫不進去", async () => {
    const { repo } = await signIn("att-admin@school.test", { sid: "s4", role: "admin" });
    let L = await repo.load();
    await applyOps(repo, diffRecords(L.records, demoRecords(), SCHED_COLS), L.revs, { chunk: 40 });
    L = await repo.load();
    const D = toCoreD(L.records);
    const B = buildBoard(D);
    const date = "2026-11-23"; // 週一
    const ses = sessionsOn(B, date).find((s) => s.teacherId && s.sids.length >= 2)!;
    expect(ses).toBeTruthy();

    // 1. 管理者點名
    await repo.mark(date, ses.gid, ses.p.id, ses.sids[0], { st: "in", tin: "08:05", tout: "", note: "" });
    await repo.mark(date, ses.gid, ses.p.id, ses.sids[1], { st: "leave", tin: "", tout: "", note: "病假" });
    L = await repo.load();
    const a = L.records.attendance[ses.aid];
    expect(a.teacherId).toBe(ses.teacherId);
    expect(a.roster).toEqual(ses.sids);
    expect(a.info).toEqual({ g: ses.name, p: ses.p.name });

    // 2. 那門課的老師
    const t = await signIn("att-" + ses.teacherId + "@school.test", { sid: "s4", role: "teacher", tid: ses.teacherId });
    const TL = await t.repo.load();
    expect(TL.records.attendance[ses.aid].marks[ses.sids[0]].st).toBe("in");
    expect(TL.records.attendance[ses.aid].marks[ses.sids[1]].note).toBe("病假");
    await t.repo.mark(date, ses.gid, ses.p.id, ses.sids[0], { st: "in", tin: "08:05", tout: "08:50", note: "" });
    const by = attStats((await t.repo.load()).records.attendance, toCoreD(TL.records), date, date, "", "2026-11-26", "12:00");
    expect(by[ses.sids[0]].in).toBe(1);
    expect(by[ses.sids[1]].leave).toBe(1);
    expect((await repo.load()).records.attendance[ses.aid].marks[ses.sids[0]].tout).toBe("08:50");

    // 3. 別的老師
    const other = D.teachers.find((x) => x.role === "資源班" && x.id !== ses.teacherId)!;
    const o = await signIn("att-" + other.id + "@school.test", { sid: "s4", role: "teacher", tid: other.id });
    await expect(getDoc(doc(o.db, T + "/attendance/" + ses.aid))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDocs(collection(o.db, T + "/attendance"))).rejects.toMatchObject({ code: "permission-denied" });
    const mine = await getDocs(query(collection(o.db, T + "/attendance"), where("teacherId", "==", other.id)));
    expect(mine.docs.map((d) => d.id)).not.toContain(ses.aid);
    expect((await o.repo.load()).records.attendance[ses.aid]).toBeUndefined();
    await expect(o.repo.mark(date, ses.gid, ses.p.id, ses.sids[0], null)).rejects.toBeTruthy();
    expect((await repo.load()).records.attendance[ses.aid].marks[ses.sids[0]]).toBeTruthy();
  }, 180000);
});

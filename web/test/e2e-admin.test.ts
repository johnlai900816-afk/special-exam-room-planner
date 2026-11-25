/* 管理者端端對端（模擬器）：管理者用 Auth 模擬器真的登入（claims {sid, role:'admin'}），從空的學期
     1. 匯入範例表（學生名單、任課老師、課程一覽表、不排課）：試跑看差異 → 一批寫入
     2. 個管分配：產生建議 → 全部套用（每位學生都有個管）
     3. 兩位資源班老師登入（claims 的 tid＝匯入時建的老師）：各自只讀得到自己的學生，private 只有自己個管的
   規則是 firestore.rules.next。要 Firestore＋Auth 模擬器：cd web && npm run test:e2e
   （test:e2e 一個檔案跑完才跑下一個：兩個檔案都會清模擬器的資料；這個檔案用另一間學校 s2） */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimsOf } from "../lib/accounts";
import { CORE } from "../lib/core";
import { planCMApply, suggestCM } from "../lib/nx/admin";
import { applyOps, summarize } from "../lib/nx/apply";
import { planImport } from "../lib/nx/importer";
import { myStudentList } from "../lib/nx/privacy";
import { sampleSheets } from "../lib/nx/sample";
import { createFirestoreRepo, revKey, scopeOf, splitD, toCoreD, type Repo } from "../lib/repo";

const PROJECT = "demo-rc";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FS = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const T = "schools/s2/terms/t1";

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
  // 空的學期：只有作息、教室（新版的學校，mode native）
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "schools/s2"), { name: "測試國中二", currentTerm: "t1", mode: "native" });
    await setDoc(doc(db, T), { ...splitD(CORE.emptyData()).term, rev: 1, updatedBy: "seed", updatedAt: new Date(0) });
  });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe("管理者匯入、分配個管；老師只看到自己的學生", () => {
  let lin = "";
  let zhang = "";
  it("管理者匯入範例表、分配個管", async () => {
    const { repo } = await signIn("admin@school.test", { sid: "s2", role: "admin" });
    let L = await repo.load();
    expect(Object.keys(L.records.students)).toEqual([]);

    // ① 匯入：先試跑（不寫），再套用
    const p = planImport(L.records, sampleSheets(), { hard: "*" });
    const sum = summarize(p.ops, L.revs);
    expect(sum.byCol.students.add).toBe(5);
    expect(sum.del).toBe(0);
    await applyOps(repo, p.ops, L.revs, { chunk: 12 });
    L = await repo.load();
    expect(Object.keys(L.records.students).length).toBe(5);
    expect(Object.keys(L.records.privates).length).toBe(5);
    const D = toCoreD(L.records);
    lin = D.teachers.find((t) => t.name === "林")!.id;
    zhang = D.teachers.find((t) => t.name === "張")!.id;
    expect(D.students.filter((s) => !s.caseMgr).map((s) => s.name)).toEqual(["黃小雨"]);

    // 個管分配：全部套用
    const res = suggestCM(L.records, {}, true);
    const pick = new Set(res.list.filter((x) => x.change).map((x) => x.sid));
    const q = planCMApply(L.records, res, pick, {});
    expect(q.result).toBeGreaterThan(0);
    await applyOps(repo, q.ops, L.revs);
    L = await repo.load();
    const S = Object.values(L.records.students);
    expect(S.every((s) => s.caseMgrId === lin || s.caseMgrId === zhang)).toBe(true);
    // private 的 caseMgrId 跟著學生（規則用它決定誰讀得到）
    Object.entries(L.records.students).forEach(([id, s]) => expect(L.records.privates[id].caseMgrId).toBe(s.caseMgrId));
    expect(L.revs[revKey("students", Object.keys(L.records.students)[0])].updatedBy).toBeTruthy();
  });

  it("兩位老師登入：各自只讀得到自己的學生；private 只有自己個管的", async () => {
    const admin = await signIn("admin2@school.test", { sid: "s2", role: "admin" });
    const all = (await admin.repo.load()).records;
    for (const [email, tid, other] of [
      ["lin@school.test", lin, zhang],
      ["zhang@school.test", zhang, lin],
    ]) {
      const { repo, db } = await signIn(email, { sid: "s2", role: "teacher", tid });
      const L = await repo.load();
      const mine = Object.entries(all.students).filter(([, s]) => s.caseMgrId === tid || s.teacherIds.includes(tid)).map(([id]) => id).sort();
      expect(Object.keys(L.records.students).sort()).toEqual(mine);
      expect(Object.keys(L.records.students).length).toBeLessThan(Object.keys(all.students).length);
      const cm = Object.entries(all.students).filter(([, s]) => s.caseMgrId === tid).map(([id]) => id).sort();
      expect(Object.keys(L.records.privates).sort()).toEqual(cm);
      expect(myStudentList(L.records, tid).nCm).toBe(cm.length);
      // 別人個管的學生：private 讀不到；不是自己的學生：學生文件也讀不到
      const theirs = Object.entries(all.students).find(([, s]) => s.caseMgrId === other)![0];
      await expect(getDoc(doc(db, T + "/students/" + theirs + "/private/profile"))).rejects.toMatchObject({ code: "permission-denied" });
      const unseen = Object.keys(all.students).find((id) => !mine.includes(id));
      if (unseen) await expect(getDoc(doc(db, T + "/students/" + unseen))).rejects.toMatchObject({ code: "permission-denied" });
      // 老師不能整批改
      await expect(repo.batch([{ col: "teachers", id: other, data: { ...all.teachers[other], note: "x" }, expectRev: null }])).rejects.toBeTruthy();
    }
  });
});

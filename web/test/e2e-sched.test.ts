/* 排課端對端（模擬器）：管理者真的登入（claims {sid, role:'admin'}），寫入範例資料後
     1. 一鍵試排 → 草稿只寫 versions/draft，正式課表（groups.slots）不變
     2. 在草稿上拖一節（只改 versions/draft）
     3. 確定採用：一批寫 groups.slots、versions/v…、lockLog/L…、學期的 lockLast，刪掉草稿
     4. 那門課的老師登入：看到新的課表（含拖過的那一節）；讀不到草稿、版本、鎖課紀錄
   規則是 firestore.rules.next。要 Firestore＋Auth 模擬器：cd web && npm run test:e2e（這個檔案用學校 s3） */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDocs, collection, getFirestore, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimsOf } from "../lib/accounts";
import { CORE } from "../lib/core";
import { applyOps, diffRecords, planOnD } from "../lib/nx/apply";
import { confirmDraftD, moveLessonD, SCHED_COLS, stateOf, trySolveD, versOf } from "../lib/nx/sched";
import { createFirestoreRepo, demoRecords, scopeOf, splitD, toCoreD, type Repo } from "../lib/repo";
import { buildBoard } from "../lib/schedule";

const PROJECT = "demo-rc";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FS = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const T = "schools/s3/terms/t1";

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
    await setDoc(doc(db, "schools/s3"), { name: "測試國中三", currentTerm: "t1", mode: "native" });
    await setDoc(doc(db, T), { ...splitD(CORE.emptyData()).term, rev: 1, updatedBy: "seed", updatedAt: new Date(0) });
  });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe("排課：管理者試排、確定，老師看到新的課表", () => {
  it("試排 → 拖曳 → 確定 → 老師看到", async () => {
    const { repo } = await signIn("sched-admin@school.test", { sid: "s3", role: "admin" });
    let L = await repo.load();
    const seed = diffRecords(L.records, demoRecords(), SCHED_COLS);
    await applyOps(repo, seed, L.revs, { chunk: 40 });
    L = await repo.load();
    const slots0 = JSON.stringify(Object.fromEntries(Object.entries(L.records.groups).map(([k, g]) => [k, g.slots])));

    // 1. 試排
    const NOW = Date.now();
    const p1 = planOnD(L.records, (D) => trySolveD(D, "try", "", NOW), SCHED_COLS);
    await applyOps(repo, p1.ops, L.revs);
    L = await repo.load();
    expect(L.records.versions.draft).toBeTruthy();
    expect(JSON.stringify(Object.fromEntries(Object.entries(L.records.groups).map(([k, g]) => [k, g.slots])))).toBe(slots0);

    // 2. 草稿上拖一節
    const D1 = toCoreD(L.records);
    const M1 = CORE.compile(D1);
    const S1 = stateOf(M1, D1, true);
    const l = M1.L.findIndex((x, i) => S1.slot[i] >= 0 && M1.G[x.g].t >= 0);
    const to = M1.G[M1.L[l].g].alist.find((s) => s !== S1.slot[l])!;
    const p2 = planOnD(L.records, (D) => moveLessonD(D, true, l, to), SCHED_COLS);
    expect(p2.ops.set.map((o) => o.col + "/" + o.id)).toEqual(["versions/draft"]);
    await applyOps(repo, p2.ops, L.revs);
    L = await repo.load();

    // 3. 確定採用：一批
    const p3 = planOnD(L.records, (D) => confirmDraftD(D, "期初課表", NOW + 1000, "sched-admin@school.test"), SCHED_COLS);
    await applyOps(repo, p3.ops, L.revs);
    L = await repo.load();
    expect(L.records.versions.draft).toBeUndefined();
    const D3 = toCoreD(L.records);
    expect(versOf(D3).map((v) => v.label)).toContain("期初課表");
    expect(Object.keys(L.records.lockLog).length).toBe(1);
    expect(L.records.term?.packed?.lockLast).toBeTruthy();

    // 4. 那門課的老師登入
    const tid = M1.T[M1.G[M1.L[l].g].t].id;
    const t = await signIn("sched-" + tid + "@school.test", { sid: "s3", role: "teacher", tid });
    const TL = await t.repo.load();
    const B = buildBoard(toCoreD(TL.records, { keepUnknown: true }));
    expect(B.S.slot[l]).toBe(to);
    expect(TL.records.versions).toEqual({});
    await expect(getDocs(collection(t.db, T + "/versions"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDocs(collection(t.db, T + "/lockLog"))).rejects.toMatchObject({ code: "permission-denied" });
    // 老師不能自己確定（寫 slots）
    const g = M1.G[M1.L[l].g].ref.id as string;
    await expect(t.repo.patch("groups", g, { slots: [] }, 99)).rejects.toBeTruthy();
  }, 180000);
});

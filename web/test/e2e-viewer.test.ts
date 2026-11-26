/* 檢視（教務處）與全校課表端對端（模擬器）：
     1. 管理者真的登入：寫入範例資料、讀三班課表（假的 AI 回覆 → core.ttGridCheck → storeRead）、核對一班（改一格、接受）、排一份段考考程與監考
     2. 檢視登入（claims {sid, role:'viewer'}）：讀得到學期設定、老師、班級（含課表）、課程、段考；總課表和管理者看到的一字不差
        讀不到學生、private、點名、版本；什麼都不能寫
   規則是 firestore.rules.next。要 Firestore＋Auth 模擬器：cd web && npm run test:e2e（這個檔案用學校 s6） */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import FX_JS from "../../test-tt-data.js";
import { claimsOf } from "../lib/accounts";
import { CORE } from "../lib/core";
import { applyOps, diffRecords, planOnD } from "../lib/nx/apply";
import { SCHED_COLS } from "../lib/nx/sched";
import { outBoard, outHtml } from "../lib/nx/schedOut";
import { applyGridEdit, C, hints, recheckAll, storeRead, ttOf } from "../lib/nx/tt";
import { examRows } from "../lib/nx/viewer";
import { createFirestoreRepo, demoRecords, revKey, scopeOf, splitD, toCoreD, type Repo } from "../lib/repo";
import type { RcData } from "../lib/types";

const FX = FX_JS as unknown as { TEACHERS: string[]; answer(c: string, inject?: boolean): Record<string, unknown> };
const PROJECT = "demo-rc";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FS = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const T = "schools/s6/terms/t1";

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
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "schools/s6"), { name: "測試國中六", currentTerm: "t1", mode: "native" });
    await setDoc(doc(db, T), { ...splitD(CORE.emptyData()).term, rev: 1, updatedBy: "seed", updatedAt: new Date(0) });
  });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
  await env?.cleanup();
});

describe("檢視登入：看得到總課表與段考，讀不到學生", () => {
  it("管理者讀課表、核對、排考程 → 檢視看得到課表、總課表、考程與監考，讀不到學生、改不了", async () => {
    const { repo } = await signIn("vw-admin@school.test", { sid: "s6", role: "admin" });
    let L = await repo.load();
    // 範例資料（已排好的課表）＋課表上的老師加進名冊
    const seed = demoRecords();
    await applyOps(repo, diffRecords(L.records, seed, SCHED_COLS), L.revs, { chunk: 40 });
    L = await repo.load();
    let p = planOnD(L.records, (D: RcData) => {
      FX.TEACHERS.forEach((n) => C.teaByName(D, n) || D.teachers.push({ id: CORE.uid("t"), name: n, role: "普通班", off: [], note: "", hours: 0 }));
    });
    await applyOps(repo, p.ops, L.revs);
    L = await repo.load();

    // 1. 讀三班課表（和讀圖的工作存的一樣：一頁一頁存，最後重算）
    const K = hints(toCoreD(L.records));
    for (const c of ["701", "702", "801"]) {
      p = planOnD(L.records, (D: RcData) => storeRead(D, c, C.ttGridCheck(D, FX.answer(c)), c + ".pdf", K));
      // 第一次有課表時 staff/legacy 的欄位清單（keys）會多 tt、classHead
      expect(p.ops.set.map((o) => o.col + "/" + o.id).filter((k) => k !== "staff/legacy")).toEqual(["classes/" + c]);
      await applyOps(repo, p.ops, L.revs);
      L = await repo.load();
    }
    p = planOnD(L.records, (D: RcData) => recheckAll(D));
    await applyOps(repo, p.ops, L.revs);
    L = await repo.load();
    let D = toCoreD(L.records);
    expect(ttOf(D)["701"].flags!.some((f) => f.k === "name" && f.t === "李惠亭")).toBe(true);

    // 核對 701：把看錯的名字改回來、接受
    const o = ttOf(D)["701"];
    let at = "";
    o.pids!.forEach((pid, i) => o.grid!.forEach((row, d) => row[i]?.t === "李惠亭" && (at = d + "|" + pid)));
    const cells: Record<string, { s: string; t: string }> = {};
    const [d0, p0] = at.split("|");
    cells[at] = { s: C.ttCellAt(D, "701", d0 + "-" + p0)!.s, t: "李惠婷" };
    p = planOnD(L.records, (X: RcData) => applyGridEdit(X, "701", { cls: "", head: "李惠婷", cells, accept: true }));
    await applyOps(repo, p.ops, L.revs);
    L = await repo.load();
    D = toCoreD(L.records);
    expect(ttOf(D)["701"].ok).toBe(1);
    expect(ttOf(D)["701"].flags).toEqual([]);
    expect(C.ttCellAt(D, "701", d0 + "-" + p0)!.t).toBe("李惠婷");

    // 段考考程與監考（只有老師姓名）
    const exam = {
      title: "第一次段考",
      sessions: [
        { id: "d1p1", date: "11/26", dow: "三", period: "第一節", subject: "國文", start: "08:20", end: "09:05" },
        { id: "d1p2", date: "11/26", dow: "三", period: "第二節", subject: "數學", start: "09:15", end: "10:00" },
      ],
      rooms: [
        { id: "A", name: "資源教室A" },
        { id: "B", name: "資源教室B" },
      ],
      proctors: ["王老師", "林老師"],
      proctorOf: { "d1p1|A": "王老師", "d1p2|B": "林老師" },
      supportOf: { "d1p1|A": "林老師" },
    };
    await repo.put("exam", "main", exam, 0);
    L = await repo.load();
    const adminMaster = (() => {
      const b = outBoard(toCoreD(L.records));
      return outHtml(toCoreD(L.records), b.M, b.S, b.ROOM, "master", { now: new Date(2026, 10, 26) });
    })();
    expect(adminMaster).toBeTruthy();

    // 2. 檢視登入
    const v = await signIn("vw-office@school.test", { sid: "s6", role: "viewer" });
    const VL = await v.repo.load();
    expect(Object.keys(VL.records.students)).toEqual([]);
    expect(Object.keys(VL.records.privates)).toEqual([]);
    expect(Object.keys(VL.records.attendance)).toEqual([]);
    expect(Object.keys(VL.records.versions)).toEqual([]);
    expect(Object.keys(VL.records.teachers).length).toBe(Object.keys(L.records.teachers).length);
    expect(Object.keys(VL.records.groups).length).toBe(Object.keys(L.records.groups).length);
    expect(VL.records.classes["701"].ttJson).toBe(L.records.classes["701"].ttJson);
    // 總課表：和管理者看到的一字不差
    const VD = toCoreD(VL.records);
    expect(VD.students).toEqual([]);
    const vb = outBoard(VD);
    expect(outHtml(VD, vb.M, vb.S, vb.ROOM, "master", { now: new Date(2026, 10, 26) })).toBe(adminMaster);
    // 全校課表照樣查得到（不用學生資料）
    expect(C.ttCellAt(VD, "701", d0 + "-" + p0)!.t).toBe("李惠婷");
    // 段考考程與監考
    const rows = examRows(VL.records.exam.main);
    expect(rows.map((r) => r.rooms.map((x) => x.name + ":" + x.proctor + "/" + x.support))).toEqual([["資源教室A:王老師/林老師"], ["資源教室B:林老師/"]]);

    // 讀不到學生、private、點名、版本、段考名單
    const sid = Object.keys(L.records.students)[0];
    await expect(getDocs(collection(v.db, T + "/students"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(v.db, T + "/students/" + sid))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(v.db, T + "/students/" + sid + "/private/profile"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDocs(collection(v.db, T + "/attendance"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDocs(collection(v.db, T + "/versions"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(v.db, T + "/exam/main/private/data"))).rejects.toMatchObject({ code: "permission-denied" });
    // 不能改：課表、課程、學期設定
    const VR = await v.repo.load();
    await expect(v.repo.put("classes", "701", { ...VR.records.classes["701"], head: "檢視改的" }, VR.revs[revKey("classes", "701")].rev)).rejects.toBeTruthy();
    const ro = createFirestoreRepo(v.db, v.repo.scope);
    const gid = Object.keys(VR.records.groups)[0];
    await expect(ro.put("groups", gid, { ...VR.records.groups[gid], name: "改" }, VR.revs[revKey("groups", gid)].rev)).rejects.toBeTruthy();
    await expect(ro.put("term", "", { ...VR.records.term!, title: "改" }, VR.revs.term.rev)).rejects.toBeTruthy();
    expect((await repo.load()).records.classes["701"].head).toBe("李惠婷");
  });
});

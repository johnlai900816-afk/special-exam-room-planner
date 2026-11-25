/* Firestore 版 Repo 接上模擬器＋firestore.rules.next：確認它下的查詢與寫入（含衍生的學生／private）都過得了規則。
     cd web && npm run test:rules */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NX } from "../lib/legacy";
import {
  createFirestoreRepo,
  demoRecords,
  RevConflictError,
  revKey,
  visible,
  type RepoScope,
} from "../lib/repo";
import type { TermRecords } from "../lib/model";

let env: RulesTestEnvironment;
const R0: TermRecords = demoRecords();
const today = new Date().toISOString().slice(0, 10);

function repoFor(role: RepoScope["role"], tid?: string) {
  const uid = "u-" + role + (tid || "");
  const claims: Record<string, unknown> = { email: uid + "@school.test", email_verified: true, sid: "s1", role };
  if (tid) claims.tid = tid;
  const db = env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
  const scope: RepoScope = { sid: "s1", termId: "t1", uid, role, tid };
  return createFirestoreRepo(db, scope, { attendanceSince: "2026-01-01" });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nx-repo",
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
    const meta = { rev: 1, updatedBy: "migrate:legacy", updatedAt: new Date(0) };
    const writes: Promise<void>[] = [setDoc(doc(db, "schools/s1/terms/t1"), { ...R0.term, ...meta })];
    for (const c of NX.COLS)
      for (const [id, d] of Object.entries(R0[c] as Record<string, object>))
        writes.push(setDoc(doc(db, NX.pathOf("s1", "t1", c, id)), { ...d, ...meta }));
    await Promise.all(writes);
  });
});

describe("Firestore Repo × 規則", () => {
  it("老師 load()：查詢不被拒，內容和 visible() 一樣（只有自己的學生、自己個管的 private）", async () => {
    const { records } = await repoFor("teacher", "r2").load();
    const want = visible({ sid: "s1", termId: "t1", uid: "x", role: "teacher", tid: "r2" }, R0);
    expect(Object.keys(records.students).sort()).toEqual(Object.keys(want.students).sort());
    expect(Object.keys(records.privates).sort()).toEqual(Object.keys(want.privates).sort());
    expect(Object.keys(records.groups).length).toBe(10);
    expect(records.staff).toEqual({});
  });
  it("檢視 load() 不被拒、沒有學生；管理者 load() 拿到全部", async () => {
    const v = await repoFor("viewer").load();
    expect(v.records.students).toEqual({});
    const a = await repoFor("admin").load();
    expect(Object.keys(a.records.students).length).toBe(24);
    expect(Object.keys(a.records.privates).length).toBe(24);
    expect(a.records.staff.legacy).toBeTruthy();
  });
  it("管理者把學生加進課程：一個交易寫課程＋學生，規則都過；老師馬上讀得到", async () => {
    const repo = repoFor("editor");
    const { records, revs } = await repo.load();
    const g = records.groups.g7; // 九國，r1
    await repo.put("groups", "g7", { ...g, studentIds: [...g.studentIds, "s9"] }, revs[revKey("groups", "g7")].rev);
    const after = await repo.load();
    expect(after.records.students.s9.teacherIds).toContain("r1");
    expect(after.revs[revKey("students", "s9")].rev).toBe(2);
    const t = await repoFor("teacher", "r1").load();
    expect(t.records.students.s9).toBeTruthy();
  });
  it("管理者改個管：學生與 private 同一批寫（getAfter 檢查過得了）", async () => {
    const repo = repoFor("admin");
    const { records, revs } = await repo.load();
    await repo.put("students", "s1", { ...records.students.s1, caseMgrId: "r3" }, revs[revKey("students", "s1")].rev);
    const { records: R } = await repo.load();
    expect(R.privates.s1.caseMgrId).toBe("r3");
    const r3 = await repoFor("teacher", "r3").load();
    expect(r3.records.privates.s1).toBeTruthy();
  });
  it("管理者新增學生：private 一起建立", async () => {
    const repo = repoFor("admin");
    await repo.load();
    await repo.put("students", "s99", { ord: 99, cls: "701", seat: "30", name: "虛構新生", caseMgrId: "r2", groupIds: [], teacherIds: [], note: "", needs: [] }, 0);
    const { records } = await repo.load();
    expect(records.students.s99.teacherIds).toEqual(["r2"]);
    expect(records.privates.s99.caseMgrId).toBe("r2");
  });
  it("rev 不對：RevConflictError（交易裡就擋下，不會送到規則）", async () => {
    const repo = repoFor("admin");
    const { records } = await repo.load();
    await expect(repo.put("teachers", "r1", { ...records.teachers.r1, hours: 1 }, 7)).rejects.toBeInstanceOf(RevConflictError);
  });
  it("老師：saveMyOff、改自己個管的 private、點自己的課都過得了規則；改別人的被規則擋", async () => {
    const t = repoFor("teacher", "r1");
    const { records, revs } = await t.load();
    await t.saveMyOff(["2-5"], revs[revKey("teachers", "r1")].rev);
    await t.patch("privates", "s1", { privNote: "虛構" }, revs[revKey("privates", "s1")].rev);
    const mine = Object.entries(records.groups).find(([, g]) => g.teacherId === "r1")![0];
    await t.mark(today, mine, "1", records.groups[mine].studentIds[0], { st: "in" });
    await t.mark(today, mine, "1", records.groups[mine].studentIds[1], { st: "late" });
    const after = await t.load();
    expect(Object.keys(after.records.attendance[today + "_" + mine + "@1"].marks).length).toBe(2);
    await expect(t.patch("teachers", "r2", { off: [] }, 1)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(t.patch("students", "s1", { name: "x" }, 1)).rejects.toMatchObject({ code: "permission-denied" });
  });
});

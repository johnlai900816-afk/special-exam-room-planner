/* 記憶體版 Repo：權限和規則一致、衍生欄位、rev 衝突。 */
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import {
  createMemoryRepo,
  demoRecords,
  memoryStore,
  RepoDeniedError,
  RevConflictError,
  revKey,
  scopeOf,
  toCoreD,
  type RepoScope,
} from "../lib/repo";

const S = (role: RepoScope["role"], tid?: string): RepoScope => ({ sid: "s1", termId: "t1", uid: "u-" + role + (tid || ""), role, tid });

describe("讀得到什麼", () => {
  const store = memoryStore(demoRecords());
  it("管理者：全部", async () => {
    const { records } = await createMemoryRepo(S("admin"), store).load();
    expect(Object.keys(records.students).length).toBe(24);
    expect(Object.keys(records.privates).length).toBe(24);
    expect(records.staff.legacy).toBeTruthy();
  });
  it("老師：只有 teacherIds 有自己的學生，private 只有自己個管的", async () => {
    const { records } = await createMemoryRepo(S("teacher", "r2"), store).load();
    const ids = Object.keys(records.students);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(24);
    for (const s of Object.values(records.students)) expect(s.teacherIds).toContain("r2");
    for (const p of Object.values(records.privates)) expect(p.caseMgrId).toBe("r2");
    expect(records.staff).toEqual({});
    expect(records.versions).toEqual({});
    // 普通班任課老師（k1 教 701 國文）也讀得到他原班的資源班國文學生
    const k1 = (await createMemoryRepo(S("teacher", "k1"), store).load()).records;
    expect(Object.keys(k1.students).length).toBeGreaterThan(0);
    expect(Object.keys(k1.privates).length).toBe(0);
  });
  it("檢視：沒有學生", async () => {
    const { records } = await createMemoryRepo(S("viewer"), store).load();
    expect(records.students).toEqual({});
    expect(Object.keys(records.groups).length).toBe(10);
  });
  it("老師的 toCoreD 可以 compile、看得到自己的課", async () => {
    const { records } = await createMemoryRepo(S("teacher", "r1"), store).load();
    const D = toCoreD(records);
    const M = CORE.compile(D);
    expect(M.G.filter((g) => g.ref.teacher === "r1").length).toBeGreaterThan(0);
    expect(D.students.every((s) => records.students[s.id])).toBe(true);
  });
});

describe("寫入", () => {
  it("管理者把學生加進課程：學生的 groupIds、teacherIds 一起更新，各自 rev +1", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(S("admin"), store);
    const { records, revs } = await repo.load();
    const g = records.groups.g7; // 九國，r1
    const sid = "s9"; // 八年級，本來不在 g7
    expect(records.students[sid].teacherIds).not.toContain("r1");
    const before = revs[revKey("students", sid)].rev;
    await repo.put("groups", "g7", { ...g, studentIds: [...g.studentIds, sid] }, revs[revKey("groups", "g7")].rev);
    const after = await repo.load();
    expect(after.records.students[sid].groupIds).toContain("g7");
    expect(after.records.students[sid].teacherIds).toContain("r1");
    expect(after.revs[revKey("students", sid)].rev).toBe(before + 1);
    expect(after.revs[revKey("groups", "g7")].rev).toBe(2);
    // 老師 r1 現在讀得到 s9
    const r1 = await createMemoryRepo(S("teacher", "r1"), store).load();
    expect(r1.records.students[sid]).toBeTruthy();
  });
  it("改個管：private.caseMgrId 跟著改，舊個管讀不到 private", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(S("editor"), store);
    const { records, revs } = await repo.load();
    const s = records.students.s1; // 個管 r1
    await repo.put("students", "s1", { ...s, caseMgrId: "r3" }, revs[revKey("students", "s1")].rev);
    const { records: R } = await repo.load();
    expect(R.privates.s1.caseMgrId).toBe("r3");
    expect(R.students.s1.teacherIds).toContain("r3");
    const r1 = (await createMemoryRepo(S("teacher", "r1"), store).load()).records;
    expect(r1.privates.s1).toBeUndefined();
  });
  it("rev 不對丟 RevConflictError", async () => {
    const repo = createMemoryRepo(S("admin"), memoryStore(demoRecords()));
    const { records } = await repo.load();
    await expect(repo.put("teachers", "r1", { ...records.teachers.r1, hours: 3 }, 5)).rejects.toBeInstanceOf(RevConflictError);
    await repo.put("teachers", "r1", { ...records.teachers.r1, hours: 3 }, 1);
    await expect(repo.put("teachers", "r1", { ...records.teachers.r1, hours: 4 }, 1)).rejects.toBeInstanceOf(RevConflictError);
  });
  it("老師：只能改自己的 off、自己個管的 private、點自己的課", async () => {
    const store = memoryStore(demoRecords());
    const t = createMemoryRepo(S("teacher", "r1"), store);
    const { records, revs } = await t.load();
    await t.saveMyOff(["2-5"], revs[revKey("teachers", "r1")].rev);
    await expect(t.patch("teachers", "r1", { hours: 1 }, 2)).rejects.toBeInstanceOf(RepoDeniedError);
    await expect(t.patch("teachers", "r2", { off: [] }, 1)).rejects.toBeInstanceOf(RepoDeniedError);
    await t.patch("privates", "s1", { privNote: "虛構" }, revs[revKey("privates", "s1")].rev);
    await expect(t.patch("privates", "s1", { caseMgrId: "r2" }, 2)).rejects.toBeInstanceOf(RepoDeniedError);
    await expect(t.patch("students", "s1", { name: "x" }, 1)).rejects.toBeInstanceOf(RepoDeniedError);
    const mine = Object.entries(records.groups).find(([, g]) => g.teacherId === "r1")![0];
    const other = Object.entries(records.groups).find(([, g]) => g.teacherId !== "r1")![0];
    await t.mark("2026-11-26", mine, "1", records.groups[mine].studentIds[0], { st: "in" });
    await expect(t.mark("2026-11-26", other, "1", "s2", { st: "in" })).rejects.toBeInstanceOf(RepoDeniedError);
    const { records: R } = await t.load();
    expect(Object.keys(R.attendance)).toEqual(["2026-11-26_" + mine + "@1"]);
  });
  it("檢視什麼都不能寫；readOnly 的 Repo 誰都不能寫", async () => {
    const store = memoryStore(demoRecords());
    await expect(createMemoryRepo(S("viewer"), store).patch("term", "", { title: "x" }, 1)).rejects.toBeInstanceOf(RepoDeniedError);
    await expect(createMemoryRepo(S("admin"), store, { readOnly: true }).patch("term", "", { title: "x" }, 1)).rejects.toBeInstanceOf(RepoDeniedError);
  });
  it("watch：別人改了會收到新的一份", async () => {
    const store = memoryStore(demoRecords());
    const seen: string[] = [];
    const stop = createMemoryRepo(S("teacher", "r1"), store).watch((x) => seen.push(String(x.records.term?.title)));
    await createMemoryRepo(S("admin"), store).patch("term", "", { title: "新學期" }, 1);
    stop();
    expect(seen).toEqual(["○○國中 ○○學年度第○學期 資源班（範例資料）", "新學期"]);
  });
});

describe("scopeOf", () => {
  it("claims → scope；舊的 teacherId 也收", () => {
    expect(scopeOf({ sid: "a", role: "teacher", tid: "r1" }, "u", "t")).toEqual({ sid: "a", termId: "t", uid: "u", role: "teacher", tid: "r1" });
    expect(scopeOf({ sid: "a", role: "teacher", teacherId: "r2" }, "u", "t")?.tid).toBe("r2");
    expect(scopeOf(null, "u", "t")).toBeNull();
  });
});

/* records 的比對與一批寫入（lib/nx/apply.ts、Repo.batch）：只寫變了的文件、rev、衍生欄位、權限 */
import { describe, expect, it } from "vitest";
import { applyOps, diffD, planOnD, summarize, summaryText, toBatch } from "../lib/nx/apply";
import { createMemoryRepo, demoRecords, memoryStore, RepoDeniedError, RevConflictError, revKey, toCoreD, type RepoScope } from "../lib/repo";

const S = (role: RepoScope["role"], tid?: string): RepoScope => ({ sid: "s1", termId: "t1", uid: "u-" + role + (tid || ""), role, tid });

describe("diffD／planOnD", () => {
  it("沒改就沒有要寫的", () => {
    const R = demoRecords();
    const D = toCoreD(R);
    expect(diffD(D, JSON.parse(JSON.stringify(D)))).toEqual({ set: [], del: [] });
    expect(planOnD(R, () => 0).ops).toEqual({ set: [], del: [] });
  });
  it("改一位學生的名字＝寫 1 份", () => {
    const R = demoRecords();
    const p = planOnD(R, (D) => (D.students[0].name = "改名測試"));
    expect(p.ops.set.map((o) => o.col + "/" + o.id)).toEqual(["students/" + p.D0.students[0].id]);
    expect(p.ops.del).toEqual([]);
    expect(p.D1.students[0].name).toBe("改名測試");
  });
  it("換個管＝學生＋private（teacherIds 跟著變）", () => {
    const R = demoRecords();
    const s = toCoreD(R).students.find((x) => x.caseMgr === "r1")!;
    const p = planOnD(R, (D) => (D.students.find((x) => x.id === s.id)!.caseMgr = "r2"));
    const cols = p.ops.set.map((o) => o.col).sort();
    expect(cols).toEqual(["privates", "students"]);
    const st = p.ops.set.find((o) => o.col === "students")!.data as { caseMgrId: string; teacherIds: string[] };
    expect(st.caseMgrId).toBe("r2");
    expect(st.teacherIds).toContain("r2");
  });
  it("刪學生＝刪學生與 private、課程拿掉他", () => {
    const R = demoRecords();
    const sid = toCoreD(R).students[0].id;
    const p = planOnD(R, (D) => {
      D.groups.forEach((g) => (g.students = g.students.filter((x) => x !== sid)));
      D.students = D.students.filter((x) => x.id !== sid);
    });
    expect(p.ops.del.map((o) => o.col).sort()).toEqual(["privates", "students"]);
    expect(p.ops.set.some((o) => o.col === "groups")).toBe(true);
  });
  it("summarize：新增／更新／刪除", () => {
    const store = memoryStore(demoRecords());
    const p = planOnD(store.records, (D) => {
      D.students.push({ id: "sNew", cls: "701", seat: "40", name: "新同學", caseMgr: "", note: "", needs: [] } as never);
      D.students[0].name = "改";
    });
    const s = summarize(p.ops, store.revs);
    expect(s.byCol.students).toEqual({ add: 1, update: 1, del: 0 });
    expect(s.byCol.privates.add).toBe(1);
    expect(summaryText(s)).toContain("學生 新增 1、更新 1");
    expect(toBatch(p.ops, store.revs).find((o) => o.id === "sNew" && o.col === "students")!.expectRev).toBe(0);
  });
});

describe("Repo.batch（記憶體版）", () => {
  it("寫進去、rev +1、衍生欄位一致", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(S("admin"), store);
    const L = await repo.load();
    const s = toCoreD(L.records).students.find((x) => x.caseMgr === "r1")!;
    const before = L.revs[revKey("students", s.id)].rev;
    const p = planOnD(L.records, (D) => (D.students.find((x) => x.id === s.id)!.caseMgr = "r2"));
    const res = await applyOps(repo, p.ops, L.revs);
    expect(res.written).toBe(2);
    const L2 = await repo.load();
    expect(L2.records.students[s.id].caseMgrId).toBe("r2");
    expect(L2.records.privates[s.id].caseMgrId).toBe("r2");
    expect(L2.revs[revKey("students", s.id)].rev).toBe(before + 1);
    // 老師 r2 現在讀得到這位學生與他的 private
    const r2 = await createMemoryRepo(S("teacher", "r2"), store).load();
    expect(r2.records.privates[s.id]).toBeTruthy();
  });
  it("別人先改了：整批不寫", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(S("admin"), store);
    const L = await repo.load();
    const id = Object.keys(L.records.students)[0];
    await repo.patch("students", id, { note: "別人改的" }, L.revs[revKey("students", id)].rev);
    const p = planOnD(L.records, (D) => {
      D.students[0].name = "我改的";
      D.teachers[0].note = "也改";
    });
    await expect(applyOps(repo, p.ops, L.revs)).rejects.toBeInstanceOf(RevConflictError);
    const L2 = await repo.load();
    expect(L2.records.teachers[Object.keys(L2.records.teachers)[0]].note).not.toBe("也改");
  });
  it("老師、檢視不能整批改", async () => {
    const store = memoryStore(demoRecords());
    const L = await createMemoryRepo(S("admin"), store).load();
    const p = planOnD(L.records, (D) => (D.teachers[0].note = "x"));
    await expect(applyOps(createMemoryRepo(S("viewer"), store), p.ops, L.revs)).rejects.toBeInstanceOf(RepoDeniedError);
    await expect(applyOps(createMemoryRepo(S("teacher", "r1"), store), p.ops, L.revs)).rejects.toBeInstanceOf(RepoDeniedError);
  });
  it("過渡期唯讀", async () => {
    const repo = createMemoryRepo(S("admin"), memoryStore(demoRecords()), { readOnly: true });
    await expect(repo.batch([])).rejects.toBeInstanceOf(RepoDeniedError);
  });
});

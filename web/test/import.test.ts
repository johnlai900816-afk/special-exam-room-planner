/* ① 匯入 Excel：認工作表、試跑、差異、套用（lib/nx/importer.ts＋apply.ts＋Repo.batch） */
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import { applyOps, summarize } from "../lib/nx/apply";
import { offReasons, planImport, probe, rowsOf, sheetType } from "../lib/nx/importer";
import { SAMPLE_COURSES, SAMPLE_OFF, SAMPLE_STUDENTS, SAMPLE_TEACHERS, sampleSheets } from "../lib/nx/sample";
import { createMemoryRepo, memoryStore, splitD, toCoreD, type RepoScope } from "../lib/repo";

const admin: RepoScope = { sid: "s1", termId: "t1", uid: "uA", role: "admin" };
const blank = () => memoryStore(splitD(CORE.emptyData()));

describe("認工作表", () => {
  it("四種範例表", () => {
    expect(sheetType(rowsOf(SAMPLE_STUDENTS))).toBe("stu");
    expect(sheetType(rowsOf(SAMPLE_TEACHERS))).toBe("tl");
    expect(sheetType(rowsOf(SAMPLE_COURSES))).toBe("course");
    expect(sheetType(rowsOf(SAMPLE_OFF))).toBe("off");
    expect(sheetType([["隨便", "一張表"]])).toBe("");
  });
  it("試一次帶得出資料", () => {
    const D = CORE.emptyData();
    expect(probe(D, "stu", SAMPLE_STUDENTS)).toBe(5);
    expect(D.students.length).toBe(0); // 不改原本的
  });
  it("班級不排課的原因", () => {
    expect(offReasons(SAMPLE_OFF)).toEqual(["社團時間"]);
  });
});

describe("試跑 → 套用", () => {
  it("空的學期匯入四張表：學生、老師、課程、任課、不排課都進來；個管老師沒有重複", async () => {
    const store = blank();
    const repo = createMemoryRepo(admin, store);
    const L = await repo.load();
    const p = planImport(L.records, sampleSheets(), { hard: "*" });
    const sum = summarize(p.ops, L.revs);
    expect(sum.byCol.students.add).toBe(5);
    expect(sum.byCol.privates.add).toBe(5);
    expect(sum.byCol.groups.add).toBe(3);
    expect(sum.del).toBe(0);
    expect(p.result.lines.length).toBe(4);
    // 試跑不會寫
    expect(Object.keys((await repo.load()).records.students).length).toBe(0);

    await applyOps(repo, p.ops, L.revs);
    const L2 = await repo.load();
    const D = toCoreD(L2.records);
    expect(D.students.length).toBe(5);
    const res = D.teachers.filter((t) => t.role === "資源班").map((t) => t.name).sort();
    expect(res).toEqual(["張", "林"]);
    const lin = D.teachers.find((t) => t.name === "林")!;
    expect(lin.hours).toBe(16);
    expect(D.groups.find((g) => g.name === "7A國文")!.teacher).toBe(lin.id);
    expect(D.classSubj["701|國文"]).toBeTruthy();
    expect(D.offBy["c:701"].length).toBe(3);
    // 衍生欄位：王小明的 teacherIds 有個管林、教他數學的張
    const wang = Object.values(L2.records.students).find((s) => s.name === "王小明")!;
    expect(wang.caseMgrId).toBe(lin.id);
    expect(wang.teacherIds).toContain(lin.id);
    expect(wang.teacherIds).toContain(D.teachers.find((t) => t.name === "張")!.id);

    // 再匯入一次同一份：沒有變更（冪等）
    const p2 = planImport(L2.records, sampleSheets(), { hard: "*" });
    expect(summarize(p2.ops, L2.revs).total).toBe(0);
  });

  it("座號相同、姓名不同：另外新增並列出來", async () => {
    const store = blank();
    const repo = createMemoryRepo(admin, store);
    let L = await repo.load();
    await applyOps(repo, planImport(L.records, sampleSheets().slice(0, 1)).ops, L.revs);
    L = await repo.load();
    const sh = { ...sampleSheets()[0], tsv: "班級\t座號\t姓名\n701\t03\t王大明" };
    const p = planImport(L.records, [sh]);
    expect(p.result.conflicts.length).toBe(1);
    expect(p.result.conflicts[0].oldName).toBe("王小明");
    expect(summarize(p.ops, L.revs).byCol.students.add).toBe(1);
  });

  it("勾掉的工作表不匯入；兩張鎖課只讀一張", () => {
    const sh = sampleSheets().map((x) => ({ ...x, on: x.type === "stu" }));
    const p = planImport(splitD(CORE.emptyData()), sh);
    expect(p.result.lines.length).toBe(1);
    expect(p.D1.groups.length).toBe(0);
  });
});

/* 管理者端的純邏輯：今天的待辦、學生篩選、個管分配、批次指定、新學期、備份還原 */
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import {
  adminTodos,
  dueThisMonth,
  filterRows,
  planAddStudent,
  planBulkCM,
  planCMApply,
  planDelStudent,
  planStudentEdit,
  studentRows,
  suggestCM,
  todayLessons,
} from "../lib/nx/admin";
import { applyOps, summarize } from "../lib/nx/apply";
import { encOpen, encPack, packBackup, parseBackup, restoreOps, validateRecords } from "../lib/nx/backup";
import { demoSeed } from "../lib/nx/demo";
import { NEW_TERM_DEFAULT, newTermOps, planNewTerm, suggestTermId, TERM_ID_RE } from "../lib/nx/term";
import { createMemoryRepo, demoRecords, emptyRecords, memoryStore, revKey, toCoreD, type RepoScope } from "../lib/repo";
import { buildBoard } from "../lib/schedule";

const admin = (termId = "t1"): RepoScope => ({ sid: "s1", termId, uid: "uA", role: "admin" });
const TODAY = "2026-11-25"; // 週三

describe("今天", () => {
  it("待辦與今天的課", () => {
    const R = demoSeed(TODAY);
    const D = toCoreD(R);
    const board = buildBoard(D);
    D.students[0].caseMgr = "";
    const list = adminTodos({ D, board, R, today: TODAY, hm: "10:00", invites: [{ email: "a@x", role: "teacher", by: "", exp: new Date(Date.now() + 864e5) }] });
    expect(list.some((t) => t.text.includes("沒有個管") && t.href.includes("cm=-"))).toBe(true);
    expect(list.some((t) => t.text.includes("邀請"))).toBe(true);
    const ls = todayLessons(board, TODAY);
    expect(ls.length).toBeGreaterThan(0);
    expect(ls[0].list[0].teacherId).toBeTruthy();
    expect(todayLessons(board, "2026-11-28")).toEqual([]); // 週六
  });
  it("待辦都連到新版（點名、IEP 回覆）：沒有舊版的連結", () => {
    const R = demoSeed(TODAY);
    // 一份已發布、還有人沒回的調查
    const rid = Object.keys(R.iep).find((k) => !JSON.parse(R.iep[k].json).quick)!;
    const r = JSON.parse(R.iep[rid].json);
    r.pub = ["h1"];
    R.iep[rid] = { ...R.iep[rid], json: JSON.stringify(r) };
    const D = toCoreD(R);
    const board = buildBoard(D);
    const ses = todayLessons(board, TODAY)[0].list[0];
    const list = adminTodos({ D, board, R, today: TODAY, hm: ses.p.start, invites: [] });
    expect(list.some((t) => t.href === "/admin/checkin/" && t.text.includes("沒簽到"))).toBe(true);
    expect(list.some((t) => t.href === "/admin/iep/?r=" + encodeURIComponent(rid))).toBe(true);
    expect(list.every((t) => t.href.startsWith("/admin/"))).toBe(true);
  });
  it("本月到期", () => {
    const R = demoSeed(TODAY);
    const due = dueThisMonth(R, "2026-12-01");
    expect([...due.keys()]).toContain("s1"); // demoSeed：s1 的 IEP 在 12 天後
  });
});

describe("學生名單", () => {
  it("篩選：年級、個管、沒有個管、到期、搜尋", () => {
    const R = demoSeed(TODAY);
    const rows = studentRows(R, TODAY);
    expect(rows.length).toBe(24);
    const g7 = filterRows(rows, { q: "", grade: "7", cm: "", due: false });
    expect(g7.every((r) => r.s.cls.startsWith("7"))).toBe(true);
    expect(filterRows(rows, { q: "", grade: "", cm: "r1", due: false }).every((r) => r.s.caseMgrId === "r1")).toBe(true);
    expect(filterRows(rows, { q: rows[3].s.name, grade: "", cm: "", due: false })[0].id).toBe(rows[3].id);
    expect(filterRows(rows, { q: "", grade: "", cm: "-", due: false })).toEqual([]);
  });
  it("新增、改基本資料、刪除", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(admin(), store);
    let L = await repo.load();
    const add = planAddStudent(L.records, { cls: "703", seat: "9", name: "新來的" });
    await applyOps(repo, add.ops, L.revs);
    L = await repo.load();
    expect(L.records.students[add.result].name).toBe("新來的");
    expect(L.records.privates[add.result]).toBeTruthy();
    const ed = planStudentEdit(L.records, add.result, "caseMgr", "r2");
    await applyOps(repo, ed.ops, L.revs);
    L = await repo.load();
    expect(L.records.privates[add.result].caseMgrId).toBe("r2");
    const del = planDelStudent(L.records, add.result);
    await applyOps(repo, del.ops, L.revs);
    L = await repo.load();
    expect(L.records.students[add.result]).toBeUndefined();
    expect(L.records.privates[add.result]).toBeUndefined();
  });
});

describe("個管分配", () => {
  it("建議＋只套用勾選的；老師的上限一起存", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(admin(), store);
    const L = await repo.load();
    const opts = { r1: { cmCap: 3 } };
    const res = suggestCM(L.records, opts, true);
    expect(res.summary.find((s) => s.id === "r1")!.cap).toBe(3);
    const ch = res.list.filter((x) => x.change);
    expect(ch.length).toBeGreaterThan(0);
    const pick = new Set([ch[0].sid]);
    const p = planCMApply(L.records, res, pick, opts);
    expect(p.result).toBe(1);
    await applyOps(repo, p.ops, L.revs);
    const L2 = await repo.load();
    expect(L2.records.students[ch[0].sid].caseMgrId).toBe(ch[0].to);
    expect(L2.records.teachers.r1.cmCap).toBe(3);
    // 沒勾的沒變
    ch.slice(1).forEach((x) => expect(L2.records.students[x.sid].caseMgrId).toBe(L.records.students[x.sid].caseMgrId));
  });
  it("批次指定個管", () => {
    const R = demoRecords();
    const ids = Object.keys(R.students).slice(0, 3);
    const p = planBulkCM(R, ids, "r3");
    expect(p.result).toBeGreaterThan(0);
    expect(p.ops.set.filter((o) => o.col === "students").every((o) => (o.data as { caseMgrId: string }).caseMgrId === "r3")).toBe(true);
  });
});

describe("新學期", () => {
  it("升年級：九年級移出、七→八、課程清空；寫進新的學期，舊學期不動", async () => {
    const store = memoryStore(demoRecords());
    const L = await createMemoryRepo(admin(), store).load();
    const D0 = toCoreD(L.records);
    const n9 = D0.students.filter((s) => CORE.gradeOfCls(s.cls) === 9).length;
    const n7 = D0.students.filter((s) => CORE.gradeOfCls(s.cls) === 7).length;
    const plan = planNewTerm(L.records, { ...NEW_TERM_DEFAULT, promote: true, title: "115 學年度第 1 學期" });
    expect(plan.grad).toBe(n9);
    expect(plan.counts.students).toBe(D0.students.length - n9);
    expect(plan.counts.groups).toBe(0);
    expect(plan.D.students.filter((s) => CORE.gradeOfCls(s.cls) === 8).length).toBe(n7);
    expect(plan.D.title).toBe("115 學年度第 1 學期");
    expect(Object.keys(plan.records.iep)).toEqual([]);

    const fresh = memoryStore(emptyRecords());
    const repo2 = createMemoryRepo(admin("115-1"), fresh);
    const ops = newTermOps(plan.records);
    expect(ops.every((o) => o.expectRev === 0)).toBe(true);
    await repo2.batch(ops);
    const L2 = await repo2.load();
    expect(Object.keys(L2.records.students).length).toBe(plan.counts.students);
    expect(L2.revs[revKey("term", "")].rev).toBe(1);
    // 舊學期不動
    expect(Object.keys((await createMemoryRepo(admin(), store).load()).records.students).length).toBe(D0.students.length);
  });
  it("只換名稱、清排課結果", () => {
    const R = demoRecords();
    const plan = planNewTerm(R, { ...NEW_TERM_DEFAULT, title: "下學期" });
    expect(plan.counts.groups).toBe(Object.keys(R.groups).length);
    expect(Object.values(plan.records.groups).every((g) => !g.slots || !g.slots.length)).toBe(true);
  });
  it("學期代碼", () => {
    expect(suggestTermId("115 學年度第 2 學期")).toBe("115-2");
    expect(TERM_ID_RE.test("115-2")).toBe(true);
    expect(TERM_ID_RE.test("115/2")).toBe(false);
  });
});

describe("備份與還原", () => {
  it("新版備份：打包、檢查、還原的差異", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(admin(), store);
    const L = await repo.load();
    const b = parseBackup(JSON.parse(JSON.stringify(packBackup(L.records, "s1", "t1"))));
    expect(b.kind).toBe("nx");
    expect(b.counts.students).toBe(24);
    expect(restoreOps(L.records, b)).toEqual({ set: [], del: [] });
    // 備份之後改了一位、刪了一位 → 還原會改回來、加回來
    const id = Object.keys(L.records.students)[0];
    await repo.patch("students", id, { name: "備份後改的" }, L.revs[revKey("students", id)].rev);
    const L2 = await repo.load();
    const ops = restoreOps(L2.records, b);
    expect(ops.set.map((o) => o.col + "/" + o.id)).toContain("students/" + id);
    await applyOps(repo, ops, L2.revs);
    expect((await repo.load()).records.students[id].name).toBe(L.records.students[id].name);
  });
  it("舊版備份（整份 D）也可以；格式不對的擋下來", () => {
    const D = CORE.defaultData();
    const b = parseBackup({ ...D, _exam: { x: 1 } });
    expect(b.kind).toBe("legacy");
    expect(b.counts.students).toBe(D.students.length);
    expect(() => parseBackup({ hello: 1 })).toThrow();
    expect(validateRecords({ students: { s1: { name: 1 } } }).length).toBeGreaterThan(0);
    expect(validateRecords({ bad: {} })[0]).toContain("不認得");
    const sum = summarize(restoreOps(emptyRecords(), b), {});
    expect(sum.byCol.students.add).toBe(D.students.length);
  });
  it("加密：同一個格式，密碼錯打不開", async () => {
    const o = await encPack('{"a":1}', "password1", 1000);
    expect(o.rcEnc).toBe(1);
    expect(await encOpen(o, "password1", 1000)).toBe('{"a":1}');
    await expect(encOpen(o, "wrong-pass", 1000)).rejects.toBeTruthy();
    await expect(encOpen(o, "password1")).rejects.toThrow(/格式/); // 次數太少（低於 10 萬）不收
  });
});

/* 同步／搬移的比對邏輯（functions/nx-core.js、nx-split.js 的 diff），用假的 Admin SDK 資料庫跑。 */
import { describe, expect, it } from "vitest";
import NXC_JS from "../../functions/nx-core.js";
import { CORE } from "../lib/core";
import { NX } from "../lib/legacy";
import type { TermRecords } from "../lib/model";
import type { RcData } from "../lib/types";

type Ops = { set: { col: string; id: string; data: Record<string, unknown> }[]; del: { col: string; id: string }[] };
interface NxCore {
  planMain(b: unknown, a: unknown): { ops: Ops; ver: { rev: number; at: number }; D: RcData } | null;
  planAttendance(date: string, b: unknown, a: unknown, gt: Record<string, string>): Ops;
  planExam(which: string, b: unknown, a: unknown): Ops;
  readLegacy(db: FakeDb): Promise<unknown>;
  recordsFromLegacy(L: unknown): TermRecords;
  readExisting(db: FakeDb, sid: string, tid: string, want: TermRecords): Promise<{ records: TermRecords; revs: Record<string, { rev: number }> }>;
  applyOps(db: FakeDb, deps: unknown, sid: string, tid: string, ops: Ops, by: string, revs: unknown): Promise<{ written: number; deleted: number; conflicts: string[] }>;
  withCascade(ops: Ops, cur: TermRecords): Ops;
  newer(a: { rev: number; at: number }, b: { rev: number; at: number }): boolean;
  BY_SYNC: string;
  BY_MIGRATE: string;
}
const C = NXC_JS as unknown as NxCore;

/* ───── 假的 firebase-admin Firestore（只有 nx-core 用到的部分） ───── */
type Data = Record<string, unknown>;
class FakeDb {
  docs = new Map<string, Data>();
  writes = 0;
  doc(path: string) {
    return { path, get: async () => this.snap(path) };
  }
  snap(path: string) {
    const d = this.docs.get(path);
    return { exists: !!d, id: path.split("/").pop()!, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) };
  }
  collection(path: string) {
    return {
      get: async () => ({
        docs: [...this.docs.keys()]
          .filter((p) => p.startsWith(path + "/") && !p.slice(path.length + 1).includes("/"))
          .map((p) => this.snap(p)),
      }),
    };
  }
  async getAll(...refs: { path: string }[]) {
    return refs.map((r) => this.snap(r.path));
  }
  batch() {
    const ops: (() => void)[] = [];
    return {
      set: (r: { path: string }, d: Data) => ops.push(() => this.docs.set(r.path, JSON.parse(JSON.stringify(d)))),
      delete: (r: { path: string }) => ops.push(() => this.docs.delete(r.path)),
      commit: async () => {
        ops.forEach((f) => f());
        this.writes += ops.length;
      },
    };
  }
}
const deps = { serverTime: () => "SERVER_TIME" };
const jsonDoc = (D: unknown, rev?: number) => ({ json: JSON.stringify(D), by: "a@b", at: 1000 + (rev || 0), ...(rev ? { rev } : {}) });
const demo = (): RcData => CORE.normalize(CORE.defaultData());
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const keys = (ops: Ops) => ({ set: ops.set.map((o) => o.col + "/" + o.id).sort(), del: ops.del.map((o) => o.col + "/" + o.id).sort() });

describe("planMain：rc/main 前後兩版的差異", () => {
  it("內容一樣（只是重存）→ 什麼都不寫", () => {
    const D = demo();
    expect(keys(C.planMain(jsonDoc(D, 1), jsonDoc(clone(D), 2))!.ops)).toEqual({ set: [], del: [] });
  });
  it("改一位學生的姓名 → 只寫那位學生", () => {
    const A = demo();
    const B = clone(A);
    B.students[0].name = "改名";
    expect(keys(C.planMain(jsonDoc(A), jsonDoc(B))!.ops)).toEqual({ set: ["students/s1"], del: [] });
  });
  it("改私密備註 → 只寫 private，學生文件不動", () => {
    const A = demo();
    const B = clone(A);
    (B.students[0] as Data).privNote = "虛構";
    expect(keys(C.planMain(jsonDoc(A), jsonDoc(B))!.ops)).toEqual({ set: ["privates/s1"], del: [] });
  });
  it("把學生加進課程 → 課程與那位學生（groupIds、teacherIds）", () => {
    const A = demo();
    const B = clone(A);
    B.groups.find((g) => g.id === "g7")!.students.push("s9");
    expect(keys(C.planMain(jsonDoc(A), jsonDoc(B))!.ops)).toEqual({ set: ["groups/g7", "students/s9"], del: [] });
  });
  it("刪學生 → 刪學生與 private；課程、後面學生的順序跟著改", () => {
    const A = demo();
    const B = clone(A);
    B.students = B.students.filter((s) => s.id !== "s24");
    B.groups.forEach((g) => (g.students = g.students.filter((x) => x !== "s24")));
    const k = keys(C.planMain(jsonDoc(A), jsonDoc(B))!.ops);
    expect(k.del).toEqual(["privates/s24", "students/s24"]);
    expect(k.set).toEqual(["groups/g7", "groups/g8"]);
  });
  it("改排課結果 → 只寫那門課", () => {
    const A = demo();
    const B = clone(A);
    B.assign = { g3: [{ s: "0-1", pin: true }] };
    expect(keys(C.planMain(jsonDoc(A), jsonDoc(B))!.ops)).toEqual({ set: ["groups/g3"], del: [] });
  });
  it("改任課老師（classSubj）→ 班級文件＋受影響學生的 teacherIds", () => {
    const A = demo();
    const B = clone(A);
    B.classSubj["701|國文"] = "k2";
    const k = keys(C.planMain(jsonDoc(A), jsonDoc(B))!.ops);
    expect(k.set[0]).toBe("classes/701");
    expect(k.set.slice(1).every((x) => x.startsWith("students/"))).toBe(true);
    expect(k.set.length).toBeGreaterThan(1);
  });
  it("改學期設定 → 只寫學期文件", () => {
    const A = demo();
    const B = clone(A);
    B.settings.seed = 9;
    expect(keys(C.planMain(jsonDoc(A), jsonDoc(B))!.ops)).toEqual({ set: ["term/"], del: [] });
  });
  it("第一次（沒有前一版）→ 全部寫；rc/main 被刪或壞掉 → 不動", () => {
    const p = C.planMain(null, jsonDoc(demo()))!;
    expect(p.ops.set.length).toBe(1 + 9 + 6 + 10 + 24 + 24 + 1); // term＋老師＋班級＋課程＋學生＋private＋staff/legacy
    expect(C.planMain(jsonDoc(demo()), null)).toBeNull();
    expect(C.planMain(null, { json: "{壞掉" })).toBeNull();
  });
  it("版本先後：有 rev 比 rev，沒有比 at", () => {
    expect(C.newer({ rev: 5, at: 1 }, { rev: 4, at: 9 })).toBe(true);
    expect(C.newer({ rev: -1, at: 9 }, { rev: -1, at: 1 })).toBe(true);
    expect(C.newer({ rev: 3, at: 1 }, { rev: 3, at: 1 })).toBe(false);
  });
});

describe("點名與段考", () => {
  it("rc/att-日期：多點一個 → 寫那一節；整節清空 → 刪", () => {
    const gt = { g1: "r2" };
    const a = { "g1@1": { s1: { st: "in" } } };
    const b = { "g1@1": { s1: { st: "in" }, s2: { st: "late" } } };
    const add = C.planAttendance("2026-11-26", a, b, gt);
    expect(keys(add)).toEqual({ set: ["attendance/2026-11-26_g1@1"], del: [] });
    expect(add.set[0].data).toMatchObject({ teacherId: "r2", gid: "g1", pid: "1", date: "2026-11-26" });
    expect(keys(C.planAttendance("2026-11-26", b, {}, gt))).toEqual({ set: [], del: ["attendance/2026-11-26_g1@1"] });
  });
  it("exams/notice 改了 → 只寫 exam/main/private/notice；exams/main 改了不會刪 notice", () => {
    expect(keys(C.planExam("notice", jsonDoc({ a: 1 }), jsonDoc({ a: 2 })))).toEqual({ set: ["examPrivate/main/notice"], del: [] });
    const m = C.planExam("main", jsonDoc({ title: "a", sessions: [] }), jsonDoc({ title: "b", sessions: [], students: [] }));
    expect(keys(m)).toEqual({ set: ["exam/main", "examPrivate/main/data"], del: [] });
  });
});

describe("搬移（readLegacy → diff → applyOps）", () => {
  async function seed() {
    const db = new FakeDb();
    const D = demo();
    (D.students[0] as Data).privNote = "虛構";
    db.docs.set("rc/main", jsonDoc(D, 7));
    db.docs.set("rc/att-2026-11-26", { "g1@1": { s2: { st: "in" } } });
    db.docs.set("rc/presence", { u: {} });
    db.docs.set("exams/main", jsonDoc({ title: "期中考", sessions: [], rooms: [], students: [{ n: "虛構" }] }));
    return { db, D };
  }
  async function migrate(db: FakeDb, prune = true) {
    const L = await C.readLegacy(db);
    const want = C.recordsFromLegacy(L);
    const { records, revs } = await C.readExisting(db, "s1", "t1", want);
    let ops = NX.diff(records, want) as Ops;
    if (!prune) ops = { set: ops.set, del: [] };
    ops = C.withCascade(ops, records);
    const res = await C.applyOps(db, deps, "s1", "t1", ops, C.BY_MIGRATE, revs);
    return { ops, res };
  }
  it("第一次寫全部；第二次 0 筆（冪等）；新位置組回來和舊的 D 一樣", async () => {
    const { db, D } = await seed();
    const first = await migrate(db);
    expect(first.ops.set.length).toBeGreaterThan(70);
    expect(db.docs.get("schools/s1/terms/t1/students/s1")).toMatchObject({ rev: 1, updatedBy: "migrate:legacy", updatedAt: "SERVER_TIME" });
    expect(db.docs.get("schools/s1/terms/t1/students/s1")).not.toHaveProperty("privNote");
    expect(db.docs.get("schools/s1/terms/t1/students/s1/private/profile")).toMatchObject({ privNote: "虛構", caseMgrId: "r1" });
    expect(db.docs.get("schools/s1/terms/t1/attendance/2026-11-26_g1@1")).toMatchObject({ teacherId: "r2" });
    expect(JSON.stringify(db.docs.get("schools/s1/terms/t1/exam/main"))).not.toContain("虛構");
    const second = await migrate(db);
    expect(second.ops.set.length + second.ops.del.length).toBe(0);
    const { records } = await C.readExisting(db, "s1", "t1", NX.emptyRecords());
    expect(NX.canon(NX.join(records))).toBe(NX.canon(D));
  });
  it("舊版改了一位學生 → 再搬只寫那一位，rev 變 2；舊版刪了學生 → 新位置也刪（含 private）", async () => {
    const { db, D } = await seed();
    await migrate(db);
    const B = clone(D);
    B.students[1].name = "改名";
    B.students = B.students.filter((s) => s.id !== "s24");
    B.groups.forEach((g) => (g.students = g.students.filter((x) => x !== "s24")));
    db.docs.set("rc/main", jsonDoc(B, 8));
    const r = await migrate(db);
    expect(keys(r.ops).del).toEqual(["privates/s24", "students/s24"]);
    expect(db.docs.get("schools/s1/terms/t1/students/s2")).toMatchObject({ rev: 2, name: "改名" });
    expect(db.docs.has("schools/s1/terms/t1/students/s24/private/profile")).toBe(false);
  });
  it("prune=false 不刪新位置多出來的文件", async () => {
    const { db } = await seed();
    await migrate(db);
    db.docs.set("schools/s1/terms/t1/teachers/extra", { ord: 99, name: "新版加的", role: "資源班", off: [], rev: 1, updatedBy: "uX" });
    expect((await migrate(db, false)).ops.del.length).toBe(0);
    expect(keys((await migrate(db, true)).ops).del).toEqual(["teachers/extra"]);
  });
  it("同步：只寫差異、rev +1；新版有人改過的文件記成衝突（舊版為準）", async () => {
    const { db, D } = await seed();
    await migrate(db);
    // 新版那邊有人改過 s3（過渡期不應該，但要抓得到）
    const p = "schools/s1/terms/t1/students/s3";
    db.docs.set(p, { ...db.docs.get(p)!, rev: 2, updatedBy: "uTeacher" });
    const B = clone(D);
    B.students[2].seat = "99";
    B.students[3].seat = "98";
    const plan = C.planMain(jsonDoc(D, 7), jsonDoc(B, 8))!;
    const res = await C.applyOps(db, deps, "s1", "t1", plan.ops, C.BY_SYNC, null);
    expect(res.written).toBe(2);
    expect(res.conflicts).toEqual(["students/s3"]);
    expect(db.docs.get(p)).toMatchObject({ rev: 3, seat: "99", updatedBy: "sync:legacy" });
    expect(db.docs.get("schools/s1/terms/t1/students/s4")).toMatchObject({ rev: 2, seat: "98" });
  });
});

/* 舊 D ⇄ records 的轉換（functions/nx-split.js），與 toCoreD 來回後 core.js 的 compile／solve 結果不變。 */
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import { NX } from "../lib/legacy";
import { splitD, toCoreD } from "../lib/repo";
import type { RcData } from "../lib/types";

/** 範例資料＋舊版各處加的欄位（虛構） */
function richD(): RcData {
  const D = CORE.normalize(CORE.defaultData());
  const M = CORE.compile(D);
  D.assign = CORE.fromState(M, CORE.solve(M, CORE.toState(M, D), { seed: 1, iters: 3000, restarts: 1 }));
  D.tt = { "701": { subj: { 國文: [["張老師", 5, 0]], 數學: [["陳老師", 4]] }, src: "pdf" } } as RcData["tt"];
  D.classHead = { "701": "張老師", "802": "吳老師" };
  D.contacts = { s1: [{ id: "c1", date: "2026-10-01", how: "電話", who: "母", note: "虛構" }], ghost: [] };
  const s1 = D.students[0] as Record<string, unknown>;
  s1.privNote = "虛構的私密備註";
  s1.iepDate = "2026-12-01";
  s1.examSvc = { 延長: ["國文"] };
  s1.mystery = { nested: [[1, 2]] }; // 不認得的欄位：放 private.x
  (D.teachers[0] as Record<string, unknown>).prefRooms = ["A"];
  (D.teachers[1] as Record<string, unknown>).uidHint = "x";
  D.groups[0].fixed = ["0-1"];
  D.offBy["s:s2"] = ["1-1"];
  D.offBy["s:gone"] = ["1-2"];
  D.lockLast = { at: 1, list: [["701", "1-1", "國文", "k1"]] };
  D.lockLog = [{ at: 1, by: "測試", label: "", added: [], removed: [], n: 0, first: true }];
  D.sched = { draft: { a: { g1: "0-1*" }, label: "試排", at: 2, seed: 3 }, vers: [{ a: {}, label: "確定一", at: 1 }] };
  D.iep = {
    cfg: { req: { 個管: 1 }, admin: [], subj: 1 },
    rounds: [{ id: "r1", name: "期初", host: "r2", slots: [["2026-12-01", "1"]], rooms: [], ppl: { x1: { n: "虛構家長", r: "家長", s: "s1" } }, ans: {}, meets: [{ id: "m1", s: "s1", p: [["t:r1", "個管", 1]], no: [] }], due: "", note: "" }],
    cur: "r1",
  };
  D.handoverBase = { at: 1, s: { s1: { cls: "701", seat: "03", caseMgr: "r1", name: "王小明" } } };
  D.weekly = { on: 1 };
  D.gone = ["old1"];
  return D;
}

describe("split／join 來回", () => {
  it("範例資料來回一模一樣（含欄位順序）", () => {
    const D = CORE.normalize(CORE.defaultData());
    const J = NX.join(NX.split(D));
    expect(NX.canon(J)).toBe(NX.canon(D));
    expect(Object.keys(J)).toEqual(Object.keys(D));
  });
  it("舊版各處的欄位都保留", () => {
    const D = richD();
    const J = NX.join(NX.split(D));
    for (const k of Object.keys(D)) expect(NX.canon(J[k]), k).toBe(NX.canon(D[k]));
    expect(NX.canon(J)).toBe(NX.canon(D));
  });
  it("每一份文件 Firestore 都收得下（沒有陣列包陣列）", () => {
    const R = NX.split(richD());
    expect(NX.fsSafe(R.term)).toBe(true);
    for (const c of NX.COLS) for (const [id, d] of Object.entries(R[c] as Record<string, unknown>)) expect(NX.fsSafe(d), c + "/" + id).toBe(true);
  });
  it("學期、學生文件裡沒有私密欄位；私密欄位只在 private", () => {
    const R = NX.split(richD());
    const pub = JSON.stringify([R.term, R.students, R.teachers, R.groups, R.classes]);
    expect(pub).not.toContain("虛構的私密備註");
    expect(pub).not.toContain("2026-12-01");
    expect(pub).not.toContain("虛構家長");
    expect(R.privates.s1.privNote).toBe("虛構的私密備註");
    expect(R.privates.s1.contacts?.length).toBe(1);
    expect(R.privates.s1.x).toContain("mystery");
    expect(R.students.s1).not.toHaveProperty("privNote");
  });
  it("teacherIds＝個管＋教他的資源班老師＋原班該科任課；個管一定在裡面", () => {
    const D = richD();
    const R = NX.split(D);
    for (const s of D.students) {
      const doc = R.students[s.id];
      if (s.caseMgr) expect(doc.teacherIds).toContain(s.caseMgr);
      for (const g of D.groups.filter((g) => g.on !== false && g.students.includes(s.id))) {
        expect(doc.teacherIds).toContain(g.teacher);
        const cs = D.classSubj[s.cls + "|" + g.subject];
        if (cs) expect(doc.teacherIds).toContain(cs);
      }
      expect(doc.groupIds).toEqual(D.groups.filter((g) => g.students.includes(s.id)).map((g) => g.id));
    }
  });
  it("文件 id 有 / 也行", () => {
    const D = CORE.normalize(CORE.defaultData());
    D.students[0].id = "a/b";
    D.groups.forEach((g) => (g.students = g.students.map((x) => (x === "s1" ? "a/b" : x))));
    const R = NX.split(D);
    expect(Object.keys(R.students)).toContain("a%2Fb");
    expect(NX.canon(NX.join(R))).toBe(NX.canon(D));
  });
  it("IEP 調查單：readers＝發起人＋學生的個管", () => {
    const R = NX.split(richD());
    expect(R.iep.r1.readers).toEqual(["r1", "r2"]);
    expect(R.iep.r1.stuIds).toEqual(["s1"]);
  });
});

describe("toCoreD：core.js 照樣能用", () => {
  it("來回之後 compile 與 solve 的結果一樣", () => {
    const D = richD();
    const D2 = toCoreD(splitD(D));
    const M1 = CORE.compile(D);
    const M2 = CORE.compile(D2);
    expect(M2.L.length).toBe(M1.L.length);
    expect(M2.G.map((g) => [g.name, g.t, g.stu, g.alist])).toEqual(M1.G.map((g) => [g.name, g.t, g.stu, g.alist]));
    const opt = { seed: 7, iters: 4000, restarts: 1 };
    const S1 = CORE.solve(M1, CORE.toState(M1, D), opt);
    const S2 = CORE.solve(M2, CORE.toState(M2, D2), opt);
    expect(Array.from(S2.slot)).toEqual(Array.from(S1.slot));
    expect(CORE.evaluate(M2, S2.slot)).toBe(CORE.evaluate(M1, S1.slot));
    expect(CORE.lockTable(M2, S2.slot)).toEqual(CORE.lockTable(M1, S1.slot));
    expect(CORE.fromState(M2, S2)).toEqual(CORE.fromState(M1, S1));
    // 排好的課（assign）也原樣回來
    expect(Array.from(CORE.toState(M2, D2).slot)).toEqual(Array.from(CORE.toState(M1, D).slot));
  });
  it("老師只拿到部分學生時 compile 照樣跑，課程只留讀得到的學生", () => {
    const R = splitD(richD());
    const mine = Object.fromEntries(Object.entries(R.students).filter(([, s]) => s.teacherIds.includes("r1")));
    const D = toCoreD({ ...R, students: mine, privates: {}, staff: {} });
    expect(D.students.length).toBe(Object.keys(mine).length);
    for (const g of D.groups) for (const id of g.students) expect(mine[id]).toBeTruthy();
    const M = CORE.compile(D);
    expect(M.L.length).toBeGreaterThan(0);
    expect(D.students.every((s) => !("privNote" in s))).toBe(true);
  });
});

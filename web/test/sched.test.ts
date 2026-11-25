/* 排課（lib/nx/sched.ts）：
   1. 求解和舊版一樣：同一份資料、同一個亂數種子，新版 trySolveD 排出來的草稿和舊版 app.js trySolve 一模一樣（原文在沙盒裡跑）
   2. 確定採用和舊版 confirmDraftOk 一樣（版本、正式課表）
   3. 草稿 → 確定 → 版本 → 鎖課紀錄：記憶體版 Repo 一批寫入，草稿不動 groups.slots，確定才動；老師看到新的課表 */
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import { applyOps, planOnD } from "../lib/nx/apply";
import {
  autoPlaceD,
  boardEdit,
  confirmDraftD,
  draftCompare,
  draftOf,
  hasDraft,
  moveLessonD,
  recordLocksD,
  restoreVerD,
  SCHED_COLS,
  stateOf,
  trySolveD,
  undoApply,
  undoSnap,
  versOf,
  type SolveMode,
} from "../lib/nx/sched";
import { createMemoryRepo, demoRecords, memoryStore, toCoreD, type RepoScope } from "../lib/repo";
import { buildBoard } from "../lib/schedule";
import type { RcData } from "../lib/types";
import { block, oldSandbox, pick } from "./oldApp";

const NOW = new Date(2026, 10, 26, 10, 30).getTime();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function oldBox(D: RcData) {
  const sb = oldSandbox(
    [
      pick("stuLabel"),
      pick("sortStu"),
      pick("setST"),
      pick("rebuild"),
      pick("changed"),
      pick("commit"),
      pick("pushUndo"),
      pick("fmtTime"),
      pick("shownL"),
      pick("moveLesson"),
      pick("undo"),
      pick("VERMAX"),
      block("var draftST=null;", "/* ───── 老師偏好的教室"),
    ],
    { now: NOW },
  );
  sb.ctx.__D = clone(D);
  sb.run("D=normalize(__D);rebuild();");
  return sb;
}
const oldD = (sb: ReturnType<typeof oldSandbox>) => JSON.parse(sb.run<string>("JSON.stringify(D)")) as RcData;

function solveBoth(D: RcData, mode: SolveMode, view = "") {
  const sb = oldBox(D);
  sb.run(`view=${JSON.stringify(view)};page='sched';sub='board';syncST();trySolve(${JSON.stringify(mode)});`);
  const A = oldD(sb);
  const B = CORE.normalize(clone(D));
  trySolveD(B, mode, view, NOW);
  return { A, B, sb };
}
const pick3 = (D: RcData) => ({
  draft: draftOf(D),
  seed: D.settings.seed,
  groups: D.groups.map((g) => [g.id, g.students]),
  assign: CORE.normalize(clone(D)).assign,
});

describe("求解和舊版一樣（同一個種子）", () => {
  const D0 = toCoreD(demoRecords());
  it("一鍵試排：草稿、種子、編組都一樣，正式課表不變", () => {
    const { A, B } = solveBoth(D0, "try");
    expect(hasDraft(B)).toBe(true);
    expect(pick3(B)).toEqual(pick3(A));
    expect(B.assign).toEqual(CORE.normalize(clone(D0)).assign);
  }, 60000);
  it("有草稿時重排、全部重排（從草稿出發）", () => {
    const D1 = CORE.normalize(clone(D0));
    trySolveD(D1, "try", "", NOW - 60000);
    // 動一節、固定，再重排：固定的不動
    moveLessonD(D1, true, 0, CORE.compile(D1).G[CORE.compile(D1).L[0].g].alist[0]);
    for (const mode of ["again", "all"] as SolveMode[]) {
      const { A, B } = solveBoth(D1, mode);
      expect(pick3(B)).toEqual(pick3(A));
    }
  }, 90000);
  it("只排一個年級", () => {
    const { A, B } = solveBoth(D0, "try", "g:8");
    expect(pick3(B)).toEqual(pick3(A));
    expect(draftOf(B)!.label).toContain("八年級");
  }, 60000);
  it("有待安排的學生：先編組再排（和舊版一樣編進同一門課）", () => {
    const D1 = CORE.normalize(clone(D0));
    const s = D1.students[0];
    const g = D1.groups.find((x) => x.students.includes(s.id))!;
    g.students = g.students.filter((x) => x !== s.id);
    s.needs = [...new Set([...(s.needs || []), g.subject])];
    const { A, B } = solveBoth(D1, "try");
    expect(pick3(B)).toEqual(pick3(A));
    expect(B.groups.some((x) => x.subject === g.subject && x.students.includes(s.id))).toBe(true);
  }, 90000);
  it("彈性鎖課：最後的原班鎖課微調也一樣", () => {
    const F = CORE.normalize(clone(D0));
    F.settings.lockMode = "flex";
    const { A, B } = solveBoth(F, "try");
    expect(pick3(B)).toEqual(pick3(A));
  }, 60000);
});

describe("確定採用、拿回版本、拖曳和舊版一樣", () => {
  it("確定採用：正式課表＝草稿、版本（含確定前的課表）、草稿刪掉", () => {
    const D1 = CORE.normalize(clone(toCoreD(demoRecords())));
    trySolveD(D1, "try", "", NOW - 60000);
    const sb = oldBox(D1);
    sb.run(`$('verName').value='第一版';confirmDraftOk();`);
    const A = oldD(sb);
    const B = clone(D1);
    confirmDraftD(B, "第一版", NOW, "me@x.test");
    expect(B.assign).toEqual(A.assign);
    expect(versOf(B)).toEqual(versOf(A));
    expect(hasDraft(B)).toBe(false);
    expect(versOf(B).map((v) => v.label)).toEqual(["確定前的課表", "第一版"]);
  }, 60000);
  it("拿回版本放進草稿；拖曳到草稿；復原", () => {
    const D1 = CORE.normalize(clone(toCoreD(demoRecords())));
    trySolveD(D1, "try", "", NOW - 60000);
    confirmDraftD(D1, "第一版", NOW - 30000, "x");
    const sb = oldBox(D1);
    sb.run("restoreVer(0);");
    const A = oldD(sb);
    const B = clone(D1);
    restoreVerD(B, 0, NOW);
    expect(draftOf(B)).toEqual(draftOf(A));
    // 拖曳：舊版 moveLesson 在草稿上
    const M = CORE.compile(B);
    const l = 1,
      s = M.G[M.L[l].g].alist.find((x) => x !== stateOf(M, B, true).slot[l])!;
    sb.run(`syncST();moveLesson(${l},${s});`);
    const u = undoSnap(B);
    moveLessonD(B, true, l, s);
    expect(draftOf(B)).toEqual(draftOf(oldD(sb)));
    expect(B.assign).toEqual(oldD(sb).assign);
    undoApply(B, u);
    sb.run("undo();");
    expect(draftOf(B)).toEqual(draftOf(oldD(sb)));
  }, 60000);
});

describe("草稿 → 確定 → 版本 → 鎖課紀錄（記憶體版 Repo）", () => {
  const admin: RepoScope = { sid: "s1", termId: "t1", uid: "u-admin", role: "admin" };
  it("草稿只寫 versions/draft；確定一批寫 groups.slots、versions、lockLog、學期的 lockLast；老師看到新課表", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(admin, store);
    const L0 = await repo.load();
    const slots0 = Object.fromEntries(Object.entries(L0.records.groups).map(([k, g]) => [k, g.slots]));

    // 1. 試排：只有學期（seed）與 versions/draft、staff/sched（和舊版一樣，名冊的編組也可能改）
    const p1 = planOnD(L0.records, (D) => trySolveD(D, "try", "", NOW), SCHED_COLS);
    const cols1 = new Set(p1.ops.set.map((o) => o.col + (o.col === "versions" ? "/" + o.id : "")));
    expect(cols1.has("versions/draft")).toBe(true);
    expect(p1.ops.set.some((o) => o.col === "groups" && JSON.stringify((o.data as { slots?: unknown }).slots) !== JSON.stringify(slots0[o.id]))).toBe(false);
    await applyOps(repo, p1.ops, L0.revs);
    const L1 = await repo.load();
    expect(L1.records.versions.draft).toBeTruthy();
    expect(Object.fromEntries(Object.entries(L1.records.groups).map(([k, g]) => [k, g.slots]))).toEqual(slots0);

    // 2. 在草稿上拖一節（只改 versions/draft）
    const D1 = toCoreD(L1.records);
    const M1 = CORE.compile(D1);
    const S1 = stateOf(M1, D1, true);
    const l = M1.L.findIndex((x, i) => S1.slot[i] >= 0);
    const to = M1.G[M1.L[l].g].alist.find((x) => x !== S1.slot[l])!;
    const p2 = planOnD(L1.records, (D) => moveLessonD(D, true, l, to), SCHED_COLS);
    expect(p2.ops.set.map((o) => o.col + "/" + o.id)).toEqual(["versions/draft"]);
    await applyOps(repo, p2.ops, L1.revs);
    const L2 = await repo.load();

    // 3. 確定採用：一批
    const p3 = planOnD(L2.records, (D) => confirmDraftD(D, "期初課表", NOW + 1000, "admin@x.test"), SCHED_COLS);
    expect(p3.ops.del.map((o) => o.col + "/" + o.id)).toContain("versions/draft");
    const set3 = p3.ops.set.map((o) => o.col);
    expect(set3).toContain("groups");
    expect(set3).toContain("lockLog");
    expect(set3).toContain("term");
    expect(p3.ops.set.some((o) => o.col === "versions" && /^v/.test(o.id))).toBe(true);
    await applyOps(repo, p3.ops, L2.revs);
    const L3 = await repo.load();
    expect(L3.records.versions.draft).toBeUndefined();
    const D3 = toCoreD(L3.records);
    expect(versOf(D3).map((v) => v.label)).toEqual(["確定前的課表", "期初課表"]);
    const log = D3.lockLog as { label: string; by: string; first?: boolean; n: number }[];
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ label: "期初課表", by: "admin@x.test" });
    expect(log[0].n).toBeGreaterThan(0);
    expect(L3.records.term?.packed?.lockLast).toBeTruthy();
    // 正式課表＝確定的草稿（含拖過的那一節）
    const M3 = CORE.compile(D3);
    expect(CORE.toState(M3, D3).slot[l]).toBe(to);

    // 4. 老師（記憶體版，照規則過濾）看到新的課表
    const tid = M3.T[M3.G[M3.L[l].g].t].id;
    const tRepo = createMemoryRepo({ sid: "s1", termId: "t1", uid: "u-" + tid, role: "teacher", tid }, store);
    const TL = await tRepo.load();
    const B = buildBoard(toCoreD(TL.records, { keepUnknown: true }));
    expect(B.S.slot[l]).toBe(to);
    expect(TL.records.versions).toEqual({});
    expect(TL.records.lockLog).toEqual({});

    // 5. 再確定一次：鎖課紀錄和上一次比
    const p4 = planOnD(L3.records, (D) => {
      trySolveD(D, "all", "", NOW + 2000);
      return confirmDraftD(D, "第二版", NOW + 3000, "admin@x.test");
    }, SCHED_COLS);
    await applyOps(repo, p4.ops, L3.revs);
    const D4 = toCoreD((await repo.load()).records);
    const log4 = D4.lockLog as { label: string; first?: boolean }[];
    expect(log4.map((e) => e.label)).toEqual(["期初課表", "第二版"]);
    expect(log4[1].first).toBeUndefined();
  }, 120000);

  it("記錄目前的鎖課（沒有名稱）；被別人搶先改時整批不寫", async () => {
    const store = memoryStore(demoRecords());
    const repo = createMemoryRepo(admin, store);
    const L = await repo.load();
    const p = planOnD(L.records, (D) => recordLocksD(D, null, "x", NOW), SCHED_COLS);
    const cols = p.ops.set.map((o) => o.col);
    expect(cols).toContain("lockLog");
    expect(cols).toContain("term");
    expect(cols).not.toContain("groups");
    await applyOps(repo, p.ops, L.revs);
    // 同一份舊的 revs 再寫一次：rev 對不上
    await expect(applyOps(repo, p.ops, L.revs)).rejects.toThrow();
  });

  it("編組與復原（autoPlace、boardEdit）", () => {
    const D = CORE.normalize(clone(toCoreD(demoRecords())));
    const s = D.students[0];
    const g = D.groups.find((x) => x.students.includes(s.id))!;
    g.students = g.students.filter((x) => x !== s.id);
    s.needs = [...new Set([...(s.needs || []), g.subject])];
    const r = autoPlaceD(D);
    expect(r.placed).toBe(1);
    expect(boardEdit(D, false, () => false)).toBe(false);
    expect(draftCompare(CORE.compile(D), D)).toBeNull();
  });
});

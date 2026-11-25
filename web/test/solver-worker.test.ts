/* 背景求解的觀察（lib/nx/solveHooks.ts）只看不改：結果和直接呼叫 core.solve 一模一樣，而且有進度、拿得到目前最好的排法 */
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import { stoppedDraftD, trySolveD, draftOf } from "../lib/nx/sched";
import { watchHooks, type Progress } from "../lib/nx/solveHooks";
import { runSolve } from "../lib/nx/solveRun";
import { demoRecords, toCoreD } from "../lib/repo";

const NOW = new Date(2026, 10, 26, 10, 30).getTime();

describe("背景求解", () => {
  it("掛上進度與最好排法的觀察，結果和不掛一樣", () => {
    const A = toCoreD(demoRecords()),
      B = toCoreD(demoRecords());
    trySolveD(A, "try", "", NOW);
    const seen: Progress[] = [];
    trySolveD(B, "try", "", NOW, watchHooks((p) => seen.push(p), 0));
    expect(draftOf(B)).toEqual(draftOf(A));
    expect(seen.length).toBeGreaterThan(3);
    const last = seen[seen.length - 1];
    expect(last.done).toBe(last.total);
    const M = CORE.compile(B);
    const withBest = seen.filter((p) => p.best);
    expect(withBest.length).toBeGreaterThan(0);
    expect(withBest[0].best!.length).toBe(M.L.length);
    // Int16Array.prototype.set 有還原
    expect(Int16Array.prototype.set.toString()).toContain("native code");
  }, 60000);
  it("停止：用目前最好的時段放進草稿", () => {
    const D = toCoreD(demoRecords());
    const M = CORE.compile(D);
    const slot = CORE.toState(M, D).slot;
    const r = stoppedDraftD(D, "try", "", slot, 5, NOW);
    expect(r.stopped).toBe(true);
    expect(draftOf(D)!.label).toContain("停止");
    expect(D.settings.seed).toBe(5);
  });
  it("沒有 Worker（node）時直接跑", async () => {
    const D = toCoreD(demoRecords());
    const job = runSolve(D, "try", "", NOW);
    const { D: D2 } = await job.done;
    expect(draftOf(D2)).toBeTruthy();
    expect(draftOf(D)).toBeNull();
  }, 60000);
});

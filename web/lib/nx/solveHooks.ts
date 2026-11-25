/* 求解的進度與「目前最好的排法」：core.solve 沒有回呼，所以不改它（新舊版共用、結果要一樣），從外面觀察：
   - 進度：solve 每一步都會設 M.H（違規的權重），把 M.H 換成 setter 數次數＝做了幾步（總共 iters × restarts）
   - 目前最好的：solve 找到更好的排法時用 best.set(slot) 存起來；求解的這段時間攔下 Int16Array.prototype.set，
     長度和 M.L 一樣的那個陣列就是 best
   兩個都只是看，不改任何值，所以排出來和直接呼叫 core.solve 一模一樣（test/solver-worker.test.ts）。
   只在 Web Worker 裡用（攔 prototype 會影響同一個執行緒的其他程式）。 */
import { CORE, type Model, type SolveState } from "../core";
import type { SolveHooks } from "./sched";

export interface Progress {
  phase: number;
  done: number;
  total: number;
  /** 目前最好的時段（還沒有就是 null） */
  best: number[] | null;
}

export function watchHooks(report: (p: Progress) => void, everyMs = 250): SolveHooks {
  return {
    solve(M: Model, S: SolveState, opt, phase) {
      const N = 60000,
        RS = 4,
        n = M.L.length;
      let H = (M as Record<string, unknown>).H as number,
        steps = 0,
        last = 0,
        best: Int16Array | null = null;
      const post = (force: boolean) => {
        const now = Date.now();
        if (!force && now - last < everyMs) return;
        last = now;
        report({ phase, done: Math.min(steps, N * RS), total: N * RS, best: best ? Array.from(best) : null });
      };
      Object.defineProperty(M, "H", {
        configurable: true,
        enumerable: true,
        get: () => H,
        set: (v: number) => {
          H = v;
          steps++;
          if ((steps & 255) === 0) post(false);
        },
      });
      const proto = Int16Array.prototype as unknown as { set: (this: Int16Array, a: ArrayLike<number>, o?: number) => void };
      const orig = proto.set;
      proto.set = function (this: Int16Array, a: ArrayLike<number>, o?: number) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        if (this.length === n && !o) best = this;
        return orig.call(this, a, o);
      };
      try {
        return CORE.solve(M, S, opt as never);
      } finally {
        proto.set = orig;
        Object.defineProperty(M, "H", { configurable: true, enumerable: true, writable: true, value: H });
        steps = N * RS;
        post(true);
      }
    },
  };
}

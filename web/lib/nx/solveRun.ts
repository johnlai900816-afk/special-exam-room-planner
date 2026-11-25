/* 畫面呼叫一鍵試排：有 Web Worker 就在背景跑（進度、停止並保留目前最好的），沒有（測試、很舊的瀏覽器）就直接跑。 */
import { stoppedDraftD, trySolveD, type SolveMode, type TryResult } from "./sched";
import type { Progress } from "./solveHooks";
import type { RcData } from "../types";

export interface SolveJob {
  /** 結果：改好的 D（草稿、seed、編組）與摘要 */
  done: Promise<{ D: RcData; r: TryResult }>;
  /** 停止並保留目前最好的（還沒有任何結果時等於取消：done 會 reject「已取消」） */
  stop(): void;
}

export function runSolve(D0: RcData, mode: SolveMode, view: string, at: number, onProgress?: (p: Progress) => void): SolveJob {
  const D = JSON.parse(JSON.stringify(D0)) as RcData;
  if (typeof Worker === "undefined") {
    const r = trySolveD(D, mode, view, at);
    return { done: Promise.resolve({ D, r }), stop() {} };
  }
  const w = new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
  let last: Progress | null = null;
  let settle: { ok: (x: { D: RcData; r: TryResult }) => void; no: (e: Error) => void } | null = null;
  const seed = ((D.settings.seed as number) || 1) + 1;
  const done = new Promise<{ D: RcData; r: TryResult }>((ok, no) => {
    settle = { ok, no };
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") {
        last = m as Progress;
        onProgress?.(last);
      } else if (m.type === "phase") onProgress?.({ phase: m.phase, done: 0, total: 1, best: last?.best || null });
      else if (m.type === "done") {
        w.terminate();
        ok({ D: m.D, r: m.r });
      } else if (m.type === "error") {
        w.terminate();
        no(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      no(new Error(e.message || "排課程式出錯"));
    };
  });
  return {
    done,
    stop() {
      w.terminate();
      if (!settle) return;
      if (last?.best) {
        const D2 = JSON.parse(JSON.stringify(D0)) as RcData;
        settle.ok({ D: D2, r: stoppedDraftD(D2, mode, view, last.best, seed, at) });
      } else settle.no(new Error("已取消"));
    },
  };
}

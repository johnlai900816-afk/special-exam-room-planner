/* 一鍵試排在背景執行緒跑（畫面不會卡住）。收到 {D, mode, view, at} → trySolveD → 回傳改好的 D。
   進度與目前最好的排法每 0.25 秒送一次，畫面按「停止並保留目前最好的」時直接結束這個 Worker，用最後收到的那一份。 */
import { trySolveD, type SolveMode } from "./sched";
import { watchHooks } from "./solveHooks";
import type { RcData } from "../types";

interface Req {
  D: RcData;
  mode: SolveMode;
  view: string;
  at: number;
}
const ctx = self as unknown as { onmessage: ((e: MessageEvent<Req>) => void) | null; postMessage(m: unknown): void };
ctx.onmessage = (e) => {
  const { D, mode, view, at } = e.data;
  try {
    const hooks = watchHooks((p) => ctx.postMessage({ type: "progress", ...p }));
    hooks.phase = (phase) => ctx.postMessage({ type: "phase", phase });
    const r = trySolveD(D, mode, view, at, hooks);
    ctx.postMessage({ type: "done", D, r });
  } catch (err) {
    ctx.postMessage({ type: "error", message: String((err as Error)?.message || err) });
  }
};
// 打包器的 Worker 是非同步載入的：載好了才說「可以了」，畫面收到才送題目（不然訊息會在 onmessage 設好之前送到而不見）
ctx.postMessage({ type: "ready" });

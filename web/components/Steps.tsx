"use client";
/* 多步驟流程：①②③ 步驟列＋「下一步 →」。目前步驟放在元件狀態裡（靜態輸出不依賴 searchParams）。 */
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, cx } from "./ui";

const NUM = "①②③④⑤⑥⑦⑧⑨";

export interface Step {
  label: string;
  render: () => ReactNode;
}

export function Steps({ steps, initial = 0 }: { steps: Step[]; initial?: number }) {
  const [i, setI] = useState(initial);
  const cur = steps[i];
  return (
    <div>
      <ol className="no-print mb-5 flex gap-1 overflow-x-auto pb-1" aria-label="步驟">
        {steps.map((st, k) => (
          <li key={st.label} className="shrink-0">
            <button
              type="button"
              onClick={() => setI(k)}
              aria-current={k === i ? "step" : undefined}
              className={cx(
                "flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-md whitespace-nowrap",
                k === i ? "bg-acc text-white" : k < i ? "bg-acc-l text-acc-d" : "bg-card text-ink2 hover:bg-hover",
              )}
            >
              <span className="font-serif">{NUM[k]}</span>
              {st.label}
            </button>
          </li>
        ))}
      </ol>
      <div>{cur.render()}</div>
      <div className="no-print mt-6 flex justify-between gap-2">
        {i > 0 ? (
          <Button tone="ghost" onClick={() => setI(i - 1)}>
            <ArrowLeft size={16} />
            上一步
          </Button>
        ) : (
          <span />
        )}
        {i < steps.length - 1 && (
          <Button tone="primary" onClick={() => setI(i + 1)}>
            下一步
            <ArrowRight size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

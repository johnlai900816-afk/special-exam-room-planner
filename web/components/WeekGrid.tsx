"use client";
/* 一週課表的格子：列＝節次、欄＝週一到週五。手機上一次看一天（上面有星期切換），平板以上看整週。
   時段編號和 core.js 一樣：s = 星期 × 節數 + 節次索引。 */
import { useState, type ReactNode } from "react";
import { DAYS } from "@/lib/core";
import type { Period } from "@/lib/types";
import { cx } from "./ui";

export function WeekGrid({
  periods,
  cell,
  cellClass,
  hideExtra,
  dense,
}: {
  periods: Period[];
  cell: (s: number, day: number, pi: number) => ReactNode;
  cellClass?: (s: number, day: number, pi: number) => string;
  /** 沒有任何內容的外加時段（早自習等）不顯示 */
  hideExtra?: (pi: number) => boolean;
  dense?: boolean;
}) {
  const today = new Date().getDay();
  const [day, setDay] = useState(today >= 1 && today <= 5 ? today - 1 : 0);
  const NP = periods.length;
  return (
    <div>
      <div className="mb-2 flex gap-1 sm:hidden" role="tablist" aria-label="選擇星期">
        {DAYS.map((d, i) => (
          <button
            key={d}
            role="tab"
            aria-selected={i === day}
            onClick={() => setDay(i)}
            className={cx(
              "flex-1 rounded-md border py-1.5 text-md",
              i === day ? "border-acc bg-acc-l font-semibold text-acc-d" : "border-line bg-card text-ink2",
            )}
          >
            週{d}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-md">
          <thead>
            <tr>
              <th className="w-20 border-b border-line pb-1.5 text-left text-xs font-normal text-mute sm:w-24">節次</th>
              {DAYS.map((d, i) => (
                <th key={d} className={cx("border-b border-line pb-1.5 text-center font-serif font-semibold text-ink", i !== day && "hidden sm:table-cell")}>
                  週{d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p, pi) =>
              hideExtra && p.extra && hideExtra(pi) ? null : (
                <tr key={p.id}>
                  <th className="border-b border-line py-1.5 pr-2 text-left align-top font-normal">
                    <div className={cx("font-medium", p.extra ? "text-mute" : "text-ink")}>{p.name}</div>
                    <div className="text-xs text-mute">
                      {p.start}–{p.end}
                    </div>
                  </th>
                  {DAYS.map((d, di) => {
                    const s = di * NP + pi;
                    return (
                      <td
                        key={d}
                        data-slot={s}
                        className={cx(
                          "border-b border-l border-line align-top",
                          dense ? "p-1" : "p-1.5",
                          di !== day && "hidden sm:table-cell",
                          cellClass?.(s, di, pi),
                        )}
                      >
                        {cell(s, di, pi)}
                      </td>
                    );
                  })}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

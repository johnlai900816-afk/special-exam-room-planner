"use client";
/* 「問題 n」清單（和 ③ 排課表的問題框同一個樣子）：黃底、紅字是會排不出來或衝突、黃字是提醒；可以點的那一行捲到那裡。
   右邊放這一頁的「建議」按鈕（children）。沒有問題時一行綠字（ok 沒給就不顯示）。 */
import { useState, type ReactNode } from "react";
import { Button, cx } from "@/components/ui";

export interface ProbItem {
  lvl: "err" | "warn";
  text: string;
  at?: string;
}

/** 捲到 id 那個元素，閃一下 */
export function jumpTo(id?: string) {
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("ring-2", "ring-focus");
  setTimeout(() => el.classList.remove("ring-2", "ring-focus"), 1600);
}

export function Problems({ list, ok, onPick, children, className }: { list: ProbItem[]; ok?: string; onPick?: (p: ProbItem) => void; children?: ReactNode; className?: string }) {
  const n = list.filter((p) => p.lvl === "err").length;
  const pick = onPick || ((p: ProbItem) => jumpTo(p.at));
  if (!list.length && !ok && !children) return null;
  return (
    <div className={cx("no-print mb-4", className)} data-problems={list.length}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={cx("text-sm", n ? "text-bad" : list.length ? "text-warn" : "text-mute")}>
          問題 <b>{list.length}</b>
        </span>
        {children}
      </div>
      {list.length > 0 ? (
        <div className="max-h-40 overflow-auto rounded-xl bg-warn-l px-4 py-2.5 text-sm text-warn">
          {list.map((p, i) => (
            <div
              key={i}
              className={cx(p.lvl === "err" && "text-bad", p.at && "cursor-pointer underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] underline-offset-[3px]")}
              onClick={p.at ? () => pick(p) : undefined}
            >
              {p.text}
            </div>
          ))}
        </div>
      ) : ok ? (
        <div className="rounded-xl bg-ok-l px-4 py-2.5 text-sm text-ok">{ok}</div>
      ) : null}
    </div>
  );
}

/** 建議的預覽：每一項一個勾選框（預設全勾），「套用勾選的」才改資料；extra＝排不進去的原因等（只顯示） */
export function SuggestBox({
  title,
  items,
  onApply,
  onClose,
  busy,
  empty,
  extra,
  disabled,
}: {
  title: string;
  items: { id: string; text: string; sub?: string }[];
  onApply: (ids: Set<string>) => void;
  onClose: () => void;
  busy?: boolean;
  empty: string;
  extra?: ReactNode;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(() => new Set(items.map((x) => x.id)));
  return (
    <div className="no-print mb-4 rounded-2xl border border-line2 bg-card p-4" role="region" aria-label={title}>
      <b className="mb-2 block">
        {title}
        <small className="ml-2 text-sm font-normal text-mute">{items.length} 項</small>
      </b>
      {items.length ? (
        <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-auto">
          {items.map((x) => (
            <li key={x.id}>
              <label className="flex min-h-10 items-start gap-2 text-[15px]">
                <input
                  type="checkbox"
                  className="mt-1 size-5"
                  checked={on.has(x.id)}
                  onChange={(e) => {
                    const n = new Set(on);
                    if (e.target.checked) n.add(x.id);
                    else n.delete(x.id);
                    setOn(n);
                  }}
                />
                <span>
                  {x.text}
                  {x.sub && <small className="block text-mute">{x.sub}</small>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-mute">{empty}</p>
      )}
      {extra}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button tone="ghost" onClick={onClose}>
          {items.length ? "不要" : "關閉"}
        </Button>
        {items.length > 0 && (
          <Button disabled={!on.size || busy || disabled} onClick={() => onApply(on)}>
            套用勾選的（{on.size}）
          </Button>
        )}
      </div>
    </div>
  );
}

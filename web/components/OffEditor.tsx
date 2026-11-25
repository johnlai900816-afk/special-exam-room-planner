"use client";
/* 不排課時段的編輯格：點一下切換。值是 core.js 用的時段鍵 `${星期}-${節次 id}`。 */
import { Ban } from "lucide-react";
import type { Period, SlotKey } from "@/lib/types";
import { WeekGrid } from "./WeekGrid";
import { cx } from "./ui";

export function OffEditor({
  periods,
  value,
  onChange,
  readOnly,
}: {
  periods: Period[];
  value: SlotKey[];
  onChange: (v: SlotKey[]) => void;
  readOnly?: boolean;
}) {
  const set = new Set(value);
  const NP = periods.length;
  const keyOf = (s: number) => Math.floor(s / NP) + "-" + periods[s % NP].id;
  const toggle = (k: SlotKey) => {
    const n = new Set(set);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    onChange([...n]);
  };
  return (
    <WeekGrid
      periods={periods}
      dense
      cell={(s, _d, pi) => {
        const k = keyOf(s);
        const on = set.has(k);
        return (
          <button
            type="button"
            disabled={readOnly}
            aria-pressed={on}
            aria-label={(on ? "取消不排課：" : "設成不排課：") + "週" + "一二三四五"[Math.floor(s / NP)] + periods[pi].name}
            onClick={() => toggle(k)}
            className={cx(
              "flex h-10 w-full items-center justify-center rounded-md border text-xs transition-colors",
              on ? "border-bad/30 bg-bad-l text-bad" : "border-transparent text-mute hover:border-line hover:bg-hover",
              readOnly && "cursor-default hover:bg-transparent",
            )}
          >
            {on ? (
              <span className="flex items-center gap-1">
                <Ban size={12} aria-hidden />
                不排
              </span>
            ) : (
              "可排"
            )}
          </button>
        );
      }}
    />
  );
}

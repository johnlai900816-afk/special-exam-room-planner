import { Lock, MapPin, Pin } from "lucide-react";
import type { Lesson } from "@/lib/schedule";
import { cx } from "./ui";

export function LessonChip({ x, draggable }: { x: Lesson; draggable?: boolean }) {
  const lock = x.kind === "lock";
  return (
    <div
      data-lesson={x.l}
      draggable={draggable || undefined}
      className={cx(
        "mb-1 rounded-md border px-1.5 py-1 leading-tight last:mb-0",
        lock ? "border-info/25 bg-info-l" : "border-acc/20 bg-acc-l",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className={cx("flex items-center gap-1 text-md font-semibold", lock ? "text-info" : "text-acc-d")}>
        {lock && <Lock size={11} aria-hidden />}
        <span className="truncate">{x.title}</span>
        {x.pinned && <Pin size={11} className="shrink-0" aria-label="已固定" />}
      </div>
      <div className="truncate text-xs text-ink2">{x.sub}</div>
      {x.room && (
        <div className="flex items-center gap-0.5 truncate text-xs text-mute">
          <MapPin size={10} aria-hidden />
          {x.room}
        </div>
      )}
    </div>
  );
}

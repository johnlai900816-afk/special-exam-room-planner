"use client";
/* 排課總表（唯讀）。資料一律由 core.js 算：buildBoard() → compile / toState / assignRooms / evaluate。

   ───── 給拖曳排課與「試排／確定」的接口（另一位開發者正在 core.js / app.js 做）─────
   - 每一節課的 DOM 有 data-lesson＝M.L 的索引，每一格有 data-slot＝時段編號 s，和 core.js 的編號相同。
   - BoardHooks 是之後要接的介面：mode 切換 view / draft / final；canDrop 用 core.canPlace(M, slot, l, s)；
     onMove 改 S.slot[l] 之後用 core.fromState(M, S) 寫回 D.assign，再交給 session 存檔（雲端用 cloud.updateMain）。
   - 目前 hooks 沒傳就是唯讀，傳了也只會把 chip 設成 draggable，實際的拖放處理還沒寫。 */
import { useMemo, useState } from "react";
import type { Board } from "@/lib/schedule";
import { lessonsBySlot } from "@/lib/schedule";
import { LessonChip } from "./LessonChip";
import { WeekGrid } from "./WeekGrid";

export type BoardMode = "view" | "draft" | "final";

export interface BoardHooks {
  mode: BoardMode;
  canDrop?: (l: number, s: number) => boolean;
  onMove?: (l: number, s: number) => void;
}

export function ScheduleBoard({ board, hooks }: { board: Board; hooks?: BoardHooks }) {
  const { M } = board;
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [cls, setCls] = useState("");

  const bySlot = useMemo(
    () =>
      lessonsBySlot(board, (x) => {
        if (teacher && x.teacherId !== teacher) return false;
        if (room && x.room !== room) return false;
        if (cls) {
          const g = M.G[M.L[x.l].g];
          if (!g.cls.includes(cls)) return false;
        }
        return true;
      }),
    [board, M, teacher, room, cls],
  );

  const resTeachers = useMemo(() => {
    const ids = new Set(M.G.filter((g) => g.per && g.t >= 0).map((g) => M.T[g.t].id));
    return M.T.filter((t) => ids.has(t.id));
  }, [M]);

  const draggable = !!hooks && hooks.mode !== "view";
  const sel = "min-h-10 rounded-lg border border-line2 bg-card px-2 text-md";

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <select className={sel} value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="依老師篩選">
          <option value="">全部老師</option>
          {resTeachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className={sel} value={cls} onChange={(e) => setCls(e.target.value)} aria-label="依班級篩選">
          <option value="">全部班級</option>
          {M.classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={sel} value={room} onChange={(e) => setRoom(e.target.value)} aria-label="依教室篩選">
          <option value="">全部教室</option>
          {M.D.rooms.map((r) => (
            <option key={r.id} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <WeekGrid
        periods={M.P}
        dense
        hideExtra={(pi) => ![0, 1, 2, 3, 4].some((d) => bySlot.has(d * M.NP + pi))}
        cellClass={(s) => ((M.D.blocked || []).includes(M.s2key(s)) ? "bg-sunk" : "")}
        cell={(s) => (bySlot.get(s) || []).map((x) => <LessonChip key={x.l} x={x} draggable={draggable} />)}
      />
    </div>
  );
}

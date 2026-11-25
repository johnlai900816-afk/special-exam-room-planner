"use client";
import { useMemo } from "react";
import { buildBoard, type Board } from "./schedule";
import { useSession } from "./session";
import type { Teacher } from "./types";

/** 目前登入（或預覽中）的老師，以及用 core.js 算好的課表 */
export function useMe(): { board: Board | null; me: Teacher | null } {
  const s = useSession();
  const board = useMemo(() => (s.D ? buildBoard(s.D) : null), [s.D]);
  const me = s.D?.teachers.find((t) => t.id === s.meId) || null;
  return { board, me };
}

"use client";
/* 老師頁面的共同開頭：還沒綁定老師時，管理者／單機可以自己選一位（預覽或「我是誰」），
   雲端上的老師帳號則提示請管理者綁定。 */
import { UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useMe } from "@/lib/useMe";
import { useSession } from "@/lib/session";
import type { Board } from "@/lib/schedule";
import type { Teacher } from "@/lib/types";
import { Card, Note } from "./ui";

export function TeacherPicker() {
  const s = useSession();
  if (!s.D) return null;
  const canPick = s.realRole === "admin";
  if (!canPick) return null;
  const list = [...s.D.teachers].sort((a, b) => (a.role === "資源班" ? 0 : 1) - (b.role === "資源班" ? 0 : 1) || a.name.localeCompare(b.name));
  return (
    <label className="flex items-center gap-2 text-md text-ink2">
      <UserRound size={16} />
      {s.cloud === "on" ? "看哪一位老師" : "我是"}
      <select className="min-h-10 rounded-lg border border-line2 px-2 text-base" value={s.meId} onChange={(e) => s.setMe(e.target.value)}>
        <option value="">（選一位老師）</option>
        {list.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}・{t.role}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TeacherGate({ children }: { children: (me: Teacher, board: Board) => ReactNode }) {
  const s = useSession();
  const { board, me } = useMe();
  if (me && board) return <>{children(me, board)}</>;
  return (
    <Card>
      {s.realRole === "admin" ? (
        <div className="space-y-3">
          <p className="text-base">選一位老師，就會看到那位老師自己的頁面。</p>
          <TeacherPicker />
        </div>
      ) : (
        <Note tone="warn">你的帳號還沒對應到名冊上的老師。請特教組長在「資料與帳號」把你的信箱綁到你的名字。</Note>
      )}
    </Card>
  );
}

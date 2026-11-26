"use client";
/* 舊網址（/setup/、/schedule/、/checkin/、/accounts/、/settings/、/exam/）：依登入的角色轉到新的頁面（保留查詢參數）。
   管理者／編輯（和沒登入時的範例資料）→ 管理者端；老師 → /me/…；檢視 → /viewer/…；其他 → 登入頁。 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useNx } from "@/lib/nx/session";

export function RoleRedirect({ admin, teacher = "/me/", viewer = "/viewer/" }: { admin: string; teacher?: string; viewer?: string }) {
  const x = useNx();
  const router = useRouter();
  const to =
    x.phase === "boot" || x.phase === "signing"
      ? ""
      : x.phase === "staff" || x.phase === "demo"
        ? admin
        : x.phase === "teacher"
          ? teacher
          : x.phase === "viewer"
            ? viewer
            : "/login/";
  useEffect(() => {
    if (to) router.replace(to + (to === "/login/" ? "" : window.location.search));
  }, [to, router]);
  return <p className="py-20 text-center text-mute">讀取中…</p>;
}

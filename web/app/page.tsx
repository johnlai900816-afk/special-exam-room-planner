"use client";
/* 首頁只負責分流：老師（或沒登入看範例資料）到「今天」；管理者／編輯到管理者端；檢視到總課表；其他（還沒有邀請…）到登入頁 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useNx } from "@/lib/nx/session";

export default function Home() {
  const x = useNx();
  const router = useRouter();
  const go = x.phase === "teacher" || x.phase === "demo" ? "/me/" : x.phase === "staff" ? "/admin/" : x.phase === "viewer" ? "/viewer/" : x.phase === "boot" || x.phase === "signing" ? "" : "/login/";
  useEffect(() => {
    if (go) router.replace(go);
  }, [go, router]);
  return <p className="py-24 text-center text-mute">讀取中…</p>;
}

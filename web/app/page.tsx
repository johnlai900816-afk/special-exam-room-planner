"use client";
/* 首頁只負責分流：管理者到總覽、老師到我的頁面、還沒加入的到登入頁 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeOf } from "@/components/AppShell";
import { useSession } from "@/lib/session";

export default function Home() {
  const s = useSession();
  const router = useRouter();
  const go = s.ready && s.cloud !== "wait" ? homeOf(s.role) : "";
  useEffect(() => {
    if (go) router.replace(go);
  }, [go, router]);
  return <p className="py-24 text-center text-mute">讀取中…</p>;
}

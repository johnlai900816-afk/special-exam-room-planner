"use client";
/* 舊網址：不排課時段、段考查詢都搬到「我的設定」 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Moved() {
  const router = useRouter();
  useEffect(() => router.replace("/me/settings/"), [router]);
  return <p className="py-24 text-center text-mute">讀取中…</p>;
}

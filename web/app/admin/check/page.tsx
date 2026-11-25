"use client";
/* 舊網址：點名搬到 /admin/checkin/（保留查詢參數） */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function OldCheckPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/checkin/" + window.location.search);
  }, [router]);
  return <p className="py-20 text-center text-mute">讀取中…</p>;
}

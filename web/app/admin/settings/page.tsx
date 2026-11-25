"use client";
/* 設定：直接到「學校資料」（三個分頁在每一頁上面） */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AdminShell } from "@/components/AdminShell";

export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/settings/school/");
  }, [router]);
  return (
    <AdminShell title="設定" needData={false}>
      <p className="py-20 text-center text-mute">讀取中…</p>
    </AdminShell>
  );
}

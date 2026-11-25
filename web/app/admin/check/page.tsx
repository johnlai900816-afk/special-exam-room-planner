"use client";
/* 管理者「點名」：還沒搬到新版（phase 3b），先連到舊版的同一頁。 */
import { AdminShell, UseOld } from "@/components/AdminShell";

export default function CheckPage() {
  return (
    <AdminShell title="點名" needData={false}>
      <UseOld title="點名" hash="#checkin/now" />
    </AdminShell>
  );
}

"use client";
/* 管理者「IEP 會議」：還沒搬到新版（phase 3b），先連到舊版的同一頁。 */
import { AdminShell, UseOld } from "@/components/AdminShell";

export default function IepPage() {
  return (
    <AdminShell title="IEP 會議" needData={false}>
      <UseOld title="IEP 會議" hash="#iep" />
    </AdminShell>
  );
}

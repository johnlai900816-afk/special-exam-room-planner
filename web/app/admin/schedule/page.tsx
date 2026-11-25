"use client";
/* 管理者「排課」：還沒搬到新版（phase 3b），先連到舊版的同一頁。 */
import { AdminShell, UseOld } from "@/components/AdminShell";

export default function SchedulePage() {
  return (
    <AdminShell title="排課" needData={false}>
      <UseOld title="排課" hash="#sched/board" />
    </AdminShell>
  );
}

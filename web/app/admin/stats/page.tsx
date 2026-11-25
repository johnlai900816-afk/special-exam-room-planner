"use client";
/* 管理者「統計」：還沒搬到新版（phase 3b），先連到舊版的同一頁。 */
import { AdminShell, UseOld } from "@/components/AdminShell";

export default function StatsPage() {
  return (
    <AdminShell title="統計" needData={false}>
      <UseOld title="統計" hash="#stats/load" />
    </AdminShell>
  );
}

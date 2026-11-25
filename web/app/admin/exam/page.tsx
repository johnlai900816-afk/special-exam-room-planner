"use client";
/* 管理者「段考」：還沒搬到新版（phase 3b），先連到舊版的同一頁。 */
import { AdminShell, UseOld } from "@/components/AdminShell";

export default function ExamPage() {
  return (
    <AdminShell title="段考" needData={false}>
      <UseOld title="段考" hash="#exam" />
    </AdminShell>
  );
}

"use client";
/* 管理者「統計」（舊版 #stats）：老師工作量（含每月超鐘點）／教室使用／鎖課異動。網址 ?tab=load|rooms|locklog。
   計算都在 core.js（lib/nx/stats.ts 只整理）；改得到的只有「外加課算進超鐘點」（學期設定）與鎖課紀錄的標記。 */
import { AdminShell, useAdmin } from "@/components/AdminShell";
import { PageTabs, RoBanner } from "@/components/admin/common";
import { Load } from "@/components/stats/Load";
import { LockLog } from "@/components/stats/LockLog";
import { Rooms } from "@/components/stats/Rooms";
import { useQuery } from "@/lib/nx/hooks";

const TABS: [string, string][] = [
  ["load", "老師工作量"],
  ["rooms", "教室使用"],
  ["locklog", "鎖課異動"],
];

function Stats() {
  const { ro } = useAdmin();
  const q = useQuery();
  const t0 = q.get("tab") || "load";
  const tab = TABS.some((x) => x[0] === t0) ? t0 : "load";
  return (
    <div>
      <h1 className="no-print mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">統計</h1>
      <PageTabs base="/admin/stats/" tabs={TABS} cur={tab} label="統計" />
      {tab === "load" && ro("term") && <RoBanner what="「外加課算進超鐘點」" hash="#stats/load" />}
      {tab === "locklog" && ro("sched") && ro("lockLog") && <RoBanner what="鎖課紀錄" hash="#stats/locklog" />}
      <div key={tab}>{tab === "rooms" ? <Rooms /> : tab === "locklog" ? <LockLog /> : <Load />}</div>
    </div>
  );
}

export default function StatsPage() {
  return (
    <AdminShell title="統計">
      <Stats />
    </AdminShell>
  );
}

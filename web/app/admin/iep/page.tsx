"use client";
/* 管理者「IEP 會議」（舊版 iep.js 的管理者模式，SC=''）：全部的調查、任何學生（照個管篩選）、會議設定。
   畫面和老師的「我的 IEP」共用 components/iep/（Surveys、RoundPage、Create、Quick），資料來源換成管理者的 Repo（IepSourceProvider，tid=''）。
   發布、結束調查一樣走 nxIepPublish／nxIepClose（管理者／編輯可以發任何一份）。網址 ?tab=survey|quick|cfg，?r=調查 id。
   過渡期（native 沒有 'iep'）只能看。 */
import { useMemo, useState } from "react";
import { AdminShell, useAdmin } from "@/components/AdminShell";
import { PageTabs, RoBanner } from "@/components/admin/common";
import { IepSettings } from "@/components/iep/IepSettings";
import { Quick } from "@/components/iep/Quick";
import { Surveys } from "@/components/iep/Surveys";
import { IepSourceProvider, type IepSource } from "@/components/iep/useIep";
import { useQuery } from "@/lib/nx/hooks";

const TABS: [string, string][] = [
  ["survey", "調查"],
  ["quick", "直接開會"],
  ["cfg", "會議設定"],
];

function Iep() {
  const { x, repo, data, D, board, ro } = useAdmin();
  const q = useQuery();
  const t0 = q.get("tab") || "survey";
  const tab = t0 === "plan" ? "survey" : TABS.some((y) => y[0] === t0) ? t0 : "survey";
  const [pick, setPick] = useState(q.get("r") || "");
  const roIep = ro("iep");
  const src = useMemo<IepSource>(
    () => ({ repo, data, D, board, tid: "", ro: roIep, scope: repo.scope, demo: x.demo, online: !x.demo && !!x.user, admin: true }),
    [repo, data, D, board, roIep, x.demo, x.user],
  );
  return (
    <IepSourceProvider value={src}>
      <h1 className="no-print mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">IEP 會議</h1>
      <PageTabs base="/admin/iep/" tabs={TABS} cur={tab} label="IEP 會議" />
      {((tab !== "cfg" && roIep) || (tab === "cfg" && ro("staff"))) && <RoBanner what="IEP 會議" hash="#iep" />}
      {tab === "survey" && <Surveys pick={pick} setPick={setPick} jump={t0 === "plan" ? "iepPlan" : ""} />}
      {tab === "quick" && <Quick />}
      {tab === "cfg" && <IepSettings />}
    </IepSourceProvider>
  );
}

export default function IepPage() {
  return (
    <AdminShell title="IEP 會議">
      <Iep />
    </AdminShell>
  );
}

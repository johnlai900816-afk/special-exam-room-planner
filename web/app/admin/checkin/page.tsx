"use client";
/* 管理者「點名」（舊版 #checkin）：點名（全部的課）／紀錄／導師週報，加上學生卡（?tab=cards，從點名頁連過去）。
   點名的畫面和老師端共用 components/check/CheckBoard.tsx；寫入用 Repo.mark（那門課的老師讀得到）。
   過渡期（schools/{sid}.mode=='legacy'，native 沒有 'checkin'／'attendance'）只能看。 */
import { AdminShell, useAdmin } from "@/components/AdminShell";
import { PageTabs, RoBanner } from "@/components/admin/common";
import { useApply } from "@/components/admin/useApply";
import { AttLog } from "@/components/check/AttLog";
import { Cards } from "@/components/check/Cards";
import { CheckBoard } from "@/components/check/CheckBoard";
import { Weekly } from "@/components/check/Weekly";
import { Empty } from "@/components/ui";
import { useQuery } from "@/lib/nx/hooks";

const TABS: [string, string][] = [
  ["now", "點名"],
  ["log", "紀錄"],
  ["weekly", "導師週報"],
];
const OLD: Record<string, string> = { now: "#checkin/now", log: "#checkin/log", weekly: "#checkin/weekly", cards: "#checkin/cards" };

function Now() {
  const { R, D, board, repo, ro } = useAdmin();
  const { edit } = useApply();
  const q = useQuery();
  if (!board) return <Empty>還沒有課表。</Empty>;
  return (
    <CheckBoard
      board={board}
      D={D}
      att={R.attendance}
      students={R.students}
      mark={(d, g, p, s, r) => repo.mark(d, g, p, s, r)}
      ro={ro("checkin")}
      pid0={q.get("p") || ""}
      admin={{
        cardsHref: "/admin/checkin/?tab=cards",
        setGrace: ro("term") ? undefined : (n) => void edit((d) => void (d.settings.grace = n), "已改成超過 " + n + " 分鐘算遲到"),
      }}
    />
  );
}

function Checkin() {
  const { ro } = useAdmin();
  const q = useQuery();
  const t0 = q.get("tab") || "now";
  const tab = t0 === "cards" || TABS.some((x) => x[0] === t0) ? t0 : "now";
  return (
    <div>
      <h1 className="no-print mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">{tab === "cards" ? "學生卡" : "點名"}</h1>
      {tab !== "cards" && <PageTabs base="/admin/checkin/" tabs={TABS} cur={tab} label="點名" />}
      {((tab === "now" && ro("checkin")) || (tab === "weekly" && ro("staff"))) && <RoBanner what={tab === "now" ? "點名" : "週報的「已發送」"} hash={OLD[tab]} />}
      <div key={tab}>{tab === "log" ? <AttLog /> : tab === "weekly" ? <Weekly /> : tab === "cards" ? <Cards /> : <Now />}</div>
    </div>
  );
}

export default function CheckinPage() {
  return (
    <AdminShell title="點名">
      <Checkin />
    </AdminShell>
  );
}

"use client";
/* 設定 › 學校資料（舊版 SCHOOL_STEPS）：① 匯入 Excel ② 全校課表 ③ 老師與任課 ④ 不排課時段 ⑤ 教室與作息 ⑥ 排課規則 ⑦ 學年交接。
   步驟放在網址 ?step=（可以從別頁直接連到某一步）。 */
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { EnvStep } from "@/components/admin/school/EnvStep";
import { HandoverStep } from "@/components/admin/school/HandoverStep";
import { ImportStep } from "@/components/admin/school/ImportStep";
import { OffStep } from "@/components/admin/school/OffStep";
import { RulesStep } from "@/components/admin/school/RulesStep";
import { TeaStep } from "@/components/admin/school/TeaStep";
import { TtStep } from "@/components/admin/school/TtStep";
import { cx } from "@/components/ui";
import { useQuery } from "@/lib/nx/hooks";

const STEPS: [string, string, () => React.ReactNode][] = [
  ["import", "匯入 Excel", () => <ImportStep />],
  ["tt", "全校課表", () => <TtStep />],
  ["tea", "老師與任課", () => <TeaStep />],
  ["off", "不排課時段", () => <OffStep />],
  ["env", "教室與作息", () => <EnvStep />],
  ["rules", "排課規則", () => <RulesStep />],
  ["handover", "學年交接", () => <HandoverStep />],
];
const NUM = "①②③④⑤⑥⑦";

function School() {
  const q = useQuery();
  const i = Math.max(0, STEPS.findIndex((s) => s[0] === (q.get("step") || "import")));
  const next = STEPS[i + 1];
  return (
    <div>
      <h1 className="mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">設定</h1>
      <SettingsTabs />
      <ol className="no-print mb-5 flex gap-1 overflow-x-auto pb-1" aria-label="學校資料的步驟">
        {STEPS.map(([k, n], j) => (
          <li key={k} className="shrink-0">
            <Link
              href={"/admin/settings/school/?step=" + k}
              aria-current={j === i ? "step" : undefined}
              className={cx(
                "flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm whitespace-nowrap",
                j === i ? "bg-ink font-bold text-on-ink" : "bg-card text-ink2 shadow-[0_0_0_1px_var(--line)] hover:bg-hover",
              )}
            >
              <span>{NUM[j]}</span>
              {n}
            </Link>
          </li>
        ))}
      </ol>
      <div key={STEPS[i][0]}>{STEPS[i][2]()}</div>
      {next && (
        <div className="no-print mt-6 flex justify-end">
          <Link href={"/admin/settings/school/?step=" + next[0]} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line2 bg-card px-4 text-[15px] hover:bg-hover">
            下一步：{next[1]}
            <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}

export default function SchoolPage() {
  return (
    <AdminShell title="學校資料">
      <School />
    </AdminShell>
  );
}

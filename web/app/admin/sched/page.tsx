"use client";
/* 排課（舊版 #sched）：① 開課 ② 編組 ③ 排課表 ④ 輸出。步驟放在網址 ?step=（今天的待辦可以直接連到某一步）。
   讀寫都經過 Repo（lib/nx/sched.ts 的純函式在 toCoreD(records) 上跑 → planOnD → applyOps）。
   過渡期（schools/{sid}.mode=='legacy'，native 沒有 'sched'）只能看。 */
import { AdminShell } from "@/components/AdminShell";
import { BoardStep } from "@/components/sched/BoardStep";
import { SchedTabs, STEPS } from "@/components/sched/common";
import { GroupsStep } from "@/components/sched/GroupsStep";
import { NeedStep } from "@/components/sched/NeedStep";
import { OutStep } from "@/components/sched/OutStep";
import { useQuery } from "@/lib/nx/hooks";

function Sched() {
  const q = useQuery();
  const step = STEPS.some((s) => s[0] === q.get("step")) ? q.get("step")! : "board";
  return (
    <div>
      <h1 className="no-print mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">排課</h1>
      <SchedTabs step={step} />
      <div key={step}>
        {step === "groups" ? <GroupsStep /> : step === "need" ? <NeedStep /> : step === "out" ? <OutStep /> : <BoardStep />}
      </div>
    </div>
  );
}

export default function SchedPage() {
  return (
    <AdminShell title="排課">
      <Sched />
    </AdminShell>
  );
}

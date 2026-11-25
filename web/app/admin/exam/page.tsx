"use client";
/* 管理者「段考」（舊版 exam.html）：① 名單與服務 ② 考程與教室 ③ 排考場 ④ 輸出（服務表、動線、監考、交卷名單、補考名單、通知單）＋ 查考場。
   步驟放在網址 ?step=（今天的待辦可以直接連到某一步）；輸出的種類 ?o=。資料：exam/main（＋private、placements、seats），見 components/exam/useExam.tsx。
   過渡期（native 沒有 'exam'）只能看。 */
import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { RoBanner } from "@/components/admin/common";
import { BoardStep } from "@/components/exam/BoardStep";
import { FindStep } from "@/components/exam/FindStep";
import { OutStep } from "@/components/exam/OutStep";
import { SetStep } from "@/components/exam/SetStep";
import { StuStep } from "@/components/exam/StuStep";
import { ExamProvider, useExam } from "@/components/exam/useExam";
import { Dialog } from "@/components/sched/common";
import { Button, cx } from "@/components/ui";
import { startNewExam } from "@/lib/nx/examCore";
import { useQuery } from "@/lib/nx/hooks";
import "@/components/exam/exam.css";

const STEPS: [string, string][] = [
  ["stu", "名單與服務"],
  ["set", "考程與教室"],
  ["board", "排考場"],
  ["out", "輸出"],
];
const NEXT: Record<string, [string, string]> = { stu: ["set", "下一步：考程與教室"], set: ["board", "下一步：排考場"], board: ["out", "下一步：輸出"] };

function Exam() {
  const q = useQuery();
  const { E, canEdit, edit, busy, saving } = useExam();
  const [newOpen, setNewOpen] = useState(false);
  const s0 = q.get("step");
  const step = s0 === "find" || STEPS.some((s) => s[0] === s0) ? s0! : !E.students.length || !E.sessions.length ? "stu" : "board";
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_280px] flex-col">
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">段考</h1>
          <input
            aria-label="段考名稱"
            placeholder="段考名稱，例：115-1 第2次段考"
            className="mt-0.5 -ml-2.5 h-9 w-[min(460px,100%)] rounded-[10px] border border-transparent bg-transparent px-2.5 text-[15px] text-mute hover:border-line2 focus:bg-card focus:text-ink"
            defaultValue={E.title}
            key={E.title}
            disabled={!canEdit}
            onBlur={(e) => e.target.value !== E.title && edit((d) => void (d.title = e.target.value))}
          />
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setNewOpen(true)}>
            開始新段考
          </Button>
        )}
        <span className="text-sm text-mute">{saving ? "儲存中…" : ""}</span>
      </div>
      {!canEdit && <RoBanner what="段考" hash="#exam" />}
      <nav aria-label="段考步驟" className="no-print mb-5 flex items-center gap-0.5 overflow-x-auto rounded-full bg-sunk p-1 [scrollbar-width:none]">
        {STEPS.map(([k, n], j) => (
          <Link
            key={k}
            href={"/admin/exam/?step=" + k}
            aria-current={k === step ? "step" : undefined}
            className={cx("flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] whitespace-nowrap", k === step ? "bg-card font-bold text-ink shadow-[0_1px_3px_rgba(31,36,48,0.1)]" : "text-ink2 hover:text-ink")}
          >
            <span className="text-[13px] font-bold tracking-[.08em] text-red">0{j + 1}</span>
            {n}
          </Link>
        ))}
        <span className="min-w-3 grow" />
        <Link
          href="/admin/exam/?step=find"
          aria-current={step === "find" ? "step" : undefined}
          className={cx("flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] whitespace-nowrap", step === "find" ? "bg-card font-bold text-ink shadow-[0_1px_3px_rgba(31,36,48,0.1)]" : "text-mute hover:text-ink")}
        >
          <Search size={16} />
          查考場
        </Link>
      </nav>
      <div key={step}>{step === "stu" ? <StuStep /> : step === "set" ? <SetStep /> : step === "out" ? <OutStep /> : step === "find" ? <FindStep /> : <BoardStep />}</div>
      {NEXT[step] && (
        <div className="no-print mt-6 flex justify-end">
          <Link href={"/admin/exam/?step=" + NEXT[step][0]} className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 hover:bg-hover">
            {NEXT[step][1]}
          </Link>
        </div>
      )}
      {busy && <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-bg/80 text-lg">{busy}</div>}
      {newOpen && (
        <Dialog
          title="開始新段考"
          onClose={() => setNewOpen(false)}
          foot={
            <>
              <Button
                onClick={() => {
                  edit((e) => void Object.assign(e, startNewExam(e, false)), { msg: "已開始新段考" });
                  setNewOpen(false);
                }}
              >
                服務清空
              </Button>
              <Button
                tone="primary"
                onClick={() => {
                  edit((e) => void Object.assign(e, startNewExam(e, true)), { msg: "已開始新段考，服務沿用上次" });
                  setNewOpen(false);
                }}
              >
                沿用上次段考的服務
              </Button>
            </>
          }
        >
          <p className="text-ink2">名單、考程、教室、監考老師會留著；排法、監考分配、交卷勾選會清掉。</p>
        </Dialog>
      )}
    </div>
  );
}

export default function ExamPage() {
  return (
    <AdminShell title="段考">
      <ExamProvider>
        <Exam />
      </ExamProvider>
    </AdminShell>
  );
}

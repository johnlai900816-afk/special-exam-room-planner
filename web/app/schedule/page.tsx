"use client";
import { AlertTriangle, CalendarRange } from "lucide-react";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Planned } from "@/components/Planned";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { Steps } from "@/components/Steps";
import { Badge, Card, PageHeader } from "@/components/ui";
import { buildBoard, type Board } from "@/lib/schedule";
import { useSession } from "@/lib/session";

function BoardCard({ board }: { board: Board }) {
  return (
    <Card
      title="排課表"
      icon={<CalendarRange size={18} />}
      actions={
        <div className="flex gap-1.5">
          <Badge tone={board.placed === board.total ? "ok" : "warn"}>
            已排 {board.placed}／{board.total} 節
          </Badge>
          {board.M.viol > 0 && <Badge tone="bad">{board.M.viol} 個衝突</Badge>}
          <Badge>唯讀</Badge>
        </div>
      }
    >
      {/* 拖曳與試排／確定之後接在 hooks（見 ScheduleBoard.tsx 的 BoardHooks）；現在只顯示 */}
      <ScheduleBoard board={board} />
      {board.problems.length > 0 && (
        <details className="mt-4">
          <summary className="flex min-h-10 cursor-pointer items-center gap-1.5 text-md text-bad">
            <AlertTriangle size={16} />
            衝突與未排入（{board.problems.length}）
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-md">
            {board.problems.map((p, i) => (
              <li key={i}>{p.m}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export default function SchedulePage() {
  const s = useSession();
  const board = useMemo(() => (s.D ? buildBoard(s.D) : null), [s.D]);
  const admin = s.role === "admin";
  return (
    <AppShell allow={["admin", "teacher", "viewer"]} title="排課">
      <PageHeader title={admin ? "排課" : "排課總表"} lead={s.D?.title} />
      {board &&
        (admin ? (
          <Steps
            initial={3}
            steps={[
              { label: "老師開課", render: () => <Planned title="老師開課" items={["每位資源班老師開哪些課、每週幾節", "抽離／外加／不鎖課"]} /> },
              {
                label: "不排課時段",
                render: () => <Planned title="不排課時段" items={["全校共同不排、年級、班級、學生群組、個人", "老師自己填的不排課時段：在「資料與帳號」一鍵套用"]} />,
              },
              { label: "學生編組", render: () => <Planned title="學生編組" items={["學生需要的科目還沒進課的清單", "依年級、科目把學生編進課"]} /> },
              { label: "排課表", render: () => <BoardCard board={board} /> },
              { label: "課表輸出", render: () => <Planned title="課表輸出" items={["老師課表、班級課表、教室課表", "給教務處的特教鎖課表", "列印與複製到 Word"]} /> },
            ]}
          />
        ) : (
          <BoardCard board={board} />
        ))}
    </AppShell>
  );
}

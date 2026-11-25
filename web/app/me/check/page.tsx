"use client";
/* 點名：我的課，現在這一節與最近的課。點名字簽到（超過寬限算遲到）、再點一次簽退；「⋯」改請假、缺席、備註。
   每一節一份 attendance/{日期_課程@節次}，寫入用 Repo.mark。畫面和管理者端共用 components/check/CheckBoard.tsx（只留我的課）。 */
import { CheckBoard } from "@/components/check/CheckBoard";
import { TeacherShell } from "@/components/TeacherShell";
import { useQuery } from "@/lib/nx/hooks";
import { useNx } from "@/lib/nx/session";

function Check() {
  const x = useNx();
  const q = useQuery();
  return (
    <div>
      <h1 className="mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">點名</h1>
      <CheckBoard
        board={x.board!}
        D={x.D!}
        att={x.data!.records.attendance}
        students={x.data!.records.students}
        mark={(d, g, p, s, r) => x.repo!.mark(d, g, p, s, r)}
        ro={!x.writable("attendance") || x.repo!.readOnly}
        tid={x.tid}
        pid0={q.get("p") || ""}
      />
    </div>
  );
}

export default function CheckPage() {
  return (
    <TeacherShell title="點名">
      <Check />
    </TeacherShell>
  );
}

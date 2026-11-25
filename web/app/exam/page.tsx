"use client";
import { AppShell } from "@/components/AppShell";
import { Planned } from "@/components/Planned";
import { Steps } from "@/components/Steps";
import { PageHeader } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function ExamPage() {
  const s = useSession();
  const n = s.exam?.sessions?.length || 0;
  return (
    <AppShell allow={["admin"]} title="段考考場">
      <PageHeader title="段考考場" lead={s.exam ? (s.exam.title || "目前的段考") + "・" + n + " 個場次" : "還沒有段考考場資料"} />
      <Steps
        steps={[
          { label: "考程", render: () => <Planned title="考程" items={["日期、節次、科目、年級", "延長時間與補考場次"]} oldPath="exam.html" oldLabel="到舊版段考考場" /> },
          { label: "學生與調整", render: () => <Planned title="學生與調整" items={["獨立、口頭、延長、報讀、電腦作答"]} oldPath="exam.html" oldLabel="到舊版段考考場" /> },
          { label: "試場", render: () => <Planned title="試場" items={["教室容量與類型（一般、電腦、備用、等候）"]} oldPath="exam.html" oldLabel="到舊版段考考場" /> },
          { label: "排試場與監考", render: () => <Planned title="排試場與監考" items={["自動排試場、拖曳微調", "依應授節數比例分配監考"]} oldPath="exam.html" oldLabel="到舊版段考考場" /> },
          { label: "輸出", render: () => <Planned title="輸出" items={["監考分配表、試場名單、交卷名單", "學生通知單（notice.html）"]} oldPath="exam.html" oldLabel="到舊版段考考場" /> },
        ]}
      />
    </AppShell>
  );
}

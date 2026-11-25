"use client";
import { AppShell } from "@/components/AppShell";
import { Planned } from "@/components/Planned";
import { Steps } from "@/components/Steps";
import { PageHeader } from "@/components/ui";

export default function SetupPage() {
  return (
    <AppShell allow={["admin"]} title="學期初準備">
      <PageHeader title="學期初準備" lead="開學前照順序做一次，之後只要小幅修改" />
      <Steps
        steps={[
          {
            label: "匯入",
            render: () => (
              <Planned title="匯入 Excel 與全校課表" items={["學校的學生名單、老師名單（Excel 貼上）", "全校課表 PDF（文字或掃描檔）讀出各班任課老師", "手排鎖課（資料輸入／資料輸出）"]} />
            ),
          },
          { label: "學生", render: () => <Planned title="學生名冊" items={["班級、座號、姓名、個管老師", "需要的科目"]} /> },
          { label: "老師與任課", render: () => <Planned title="老師與任課" items={["老師身分（資源班、普通班、兼課、代理、行政）與應授節數", "各班各科的任課老師"]} /> },
          { label: "教室與節次", render: () => <Planned title="教室與節次" items={["資源教室（含備用教室）", "作息時間與外加時段"]} /> },
          { label: "規則", render: () => <Planned title="排課規則" items={["鎖課方式：同科鎖課或彈性鎖課", "每天同一門課最多幾節、老師連續上課上限"]} /> },
        ]}
      />
    </AppShell>
  );
}

"use client";
import { AppShell } from "@/components/AppShell";
import { Planned } from "@/components/Planned";
import { PageHeader } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function CheckinPage() {
  const s = useSession();
  const admin = s.role === "admin";
  return (
    <AppShell allow={["teacher", "admin"]} title={admin ? "簽到退" : "點名"}>
      <PageHeader title={admin ? "簽到退" : "點名"} lead="照課表知道這一節該誰來" />
      <Planned
        title={admin ? "簽到退" : "這一節點名"}
        items={
          admin
            ? ["全部課程的今日點名狀況", "出缺席紀錄（依日期區間、課程）", "學生卡與 QR 碼"]
            : ["現在這一節的學生名單：已到／遲到／請假／缺席", "掃學生卡簽到", "我的課程出缺席紀錄"]
        }
        oldLabel="到舊版簽到退"
      />
    </AppShell>
  );
}

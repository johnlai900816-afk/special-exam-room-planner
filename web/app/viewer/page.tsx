"use client";
/* 檢視：總課表（教務處）。和管理者「排課 › 輸出 › 總課表」同一份 HTML（lib/nx/schedOut.ts）、同一份列印樣式；
   只用學期設定、老師、課程（groups.slots），讀不到學生。一律印正式課表（草稿只有管理者讀得到）。 */
import { useMemo } from "react";
import { copyOutArea } from "@/components/admin/common";
import "@/components/sched/out.css";
import { Button } from "@/components/ui";
import { useViewer, ViewerShell } from "@/components/ViewerShell";
import { outBoard, outHtml } from "@/lib/nx/schedOut";

function Master() {
  const { D } = useViewer();
  const html = useMemo(() => {
    const { M, S, ROOM } = outBoard(D);
    return outHtml(D, M, S, ROOM, "master");
  }, [D]);
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">總課表</h1>
        <span className="grow" />
        {html && (
          <>
            <Button onClick={copyOutArea}>複製</Button>
            <Button tone="primary" onClick={() => window.print()}>
              印出
            </Button>
          </>
        )}
      </div>
      {html == null ? (
        <p className="text-mute">還沒有課表</p>
      ) : (
        <div className="schedout">
          {/* 內容由 schedOut.ts 產生，資料一律經過 esc() */}
          <div id="outArea" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}

export default function ViewerHome() {
  return (
    <ViewerShell title="總課表">
      <Master />
    </ViewerShell>
  );
}

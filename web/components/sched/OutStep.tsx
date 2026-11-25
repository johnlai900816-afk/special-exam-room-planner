"use client";
/* ④ 輸出（舊版 renderOut）：總課表、老師課表、鎖課表、鎖課清單＋特教鎖課整理、導師抽離表、任課老師抽離名單、學生個人課表、學生抽離一覽、個管個案一覽、組別總表。
   一律印正式課表（草稿不印）。紙張的 HTML 由 lib/nx/schedOut.ts 產生（和舊版逐字相同，test/sched-out.test.ts），
   樣式是從 app.css 逐字複製的 out.css；按「印出」只印 #outArea。 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { Button, Input, Select } from "@/components/ui";
import { CORE } from "@/lib/core";
import { useQuery } from "@/lib/nx/hooks";
import { GRADE } from "@/lib/nx/sched";
import { OUT_GROUPS, OUT_MODES, outBoard, outHtml, type OutMode } from "@/lib/nx/schedOut";
import { Tip, useSched } from "./common";
import "./out.css";

export function OutStep() {
  const { D, edit, canEdit } = useSched();
  const q = useQuery();
  const [mode, setMode] = useState<OutMode>(() => (OUT_MODES.some((m) => m[0] === q.get("mode")) ? (q.get("mode") as OutMode) : "teacher"));
  const [outG, setOutG] = useState("");
  const html = useMemo(() => {
    const { M, S, ROOM } = outBoard(D);
    return outHtml(D, M, S, ROOM, mode, { outG });
  }, [D, mode, outG]);
  const mn = (k: OutMode) => (OUT_MODES.find((x) => x[0] === k) || [k, ""])[1];
  const setSetting = (k: string, v: string) =>
    edit((D1) => {
      if ((D1.settings[k] || "") === v) return false;
      D1.settings[k] = v;
    });
  const dateIn = (
    <label className="flex items-center gap-1.5 text-sm">
      實施日期
      <Input
        key={String(D.settings.dates || "")}
        className="w-48"
        defaultValue={String(D.settings.dates || "")}
        placeholder="115.09.02-116.01.20"
        disabled={!canEdit}
        onBlur={(e) => setSetting("dates", e.target.value.trim())}
      />
    </label>
  );
  const copy = () => {
    const el = document.getElementById("outArea");
    if (!el) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      /* 舊版也是這樣 */
    }
    s.removeAllRanges();
    toast(ok ? "已複製" : "複製失敗，請手動選取");
  };
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Select aria-label="要印的表" className="min-w-[14rem] text-[17px] font-bold" value={mode} onChange={(e) => setMode(e.target.value as OutMode)}>
          {OUT_GROUPS.map(([g, ks]) => (
            <optgroup key={g} label={g}>
              {ks.map((k) => (
                <option key={k} value={k}>
                  {mn(k)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        {mode === "lock" && <Tip>鎖課表給教務處：列出每班哪幾節必須排哪一科，原班才會和資源班同時上同一科。</Tip>}
        {mode === "master" && <Tip>欄是教室，每格寫科目、組別和老師的姓，黑白印也分得出老師。列印自動用橫式。</Tip>}
        <span className="grow" />
        <Button onClick={copy}>複製</Button>
        <Button tone="primary" onClick={() => window.print()}>
          印出
        </Button>
      </div>
      {mode === "master" && <div className="no-print mb-3 flex flex-wrap items-center gap-2">{dateIn}</div>}
      {(mode === "homeroom" || mode === "regular") && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-3">
          {dateIn}
          <span className="text-sm text-mute">一{mode === "homeroom" ? "班" : "位老師"}一頁</span>
        </div>
      )}
      {mode === "card" && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            標題
            <Input
              key={String(D.settings.cardTitle || "")}
              className="w-48"
              defaultValue={String(D.settings.cardTitle || "資源班課表")}
              disabled={!canEdit}
              onBlur={(e) => setSetting("cardTitle", e.target.value.trim())}
            />
          </label>
          <Select aria-label="年級" value={outG} onChange={(e) => setOutG(e.target.value)}>
            <option value="">全部年級</option>
            {[...new Set(D.students.map((x) => CORE.gradeOfCls(x.cls)))]
              .filter((x) => GRADE[x])
              .sort()
              .map((x) => (
                <option key={x} value={String(x)}>
                  {GRADE[x]}
                </option>
              ))}
          </Select>
          <span className="text-sm text-mute">一人一頁</span>
        </div>
      )}
      {html == null ? (
        <div className="flex items-center gap-3 text-mute">
          還沒有課表。
          <Link href="/admin/sched/?step=board" className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 text-ink hover:bg-hover">
            去排課
          </Link>
        </div>
      ) : (
        <div className="schedout">
          {/* 內容由 schedOut.ts 產生，資料一律經過 esc()；和舊版 #outArea 逐字相同 */}
          <div id="outArea" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}

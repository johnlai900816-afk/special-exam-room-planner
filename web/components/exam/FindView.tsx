"use client";
/* 查考場（舊版 renderFind）：依學生／依試場、年級、班級、科目、日期、監考老師、姓名或座號；複製（可以貼到 LINE）、印出。
   管理者頁與公開的查考場連結（/view/?v=）共用。表格的 HTML 和舊版逐字相同（examOut.findHtml），放在 iframe 裡印。 */
import { Copy, Printer } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { copyText } from "@/components/admin/common";
import { toast } from "@/components/Toast";
import { Button, Empty, Input, Select, cx } from "@/components/ui";
import { FD0, findCopyText, findHtml, findRows, type FindFilter, type FindRow, type ViewData } from "@/lib/nx/examOut";
import { Paper, type PaperHandle } from "./Paper";

export function FindView({ all, title, VR, extra, empty }: { all: FindRow[]; title: string; VR: ViewData | null; extra?: ReactNode; empty?: ReactNode }) {
  const [FD, setFD] = useState<FindFilter>(() => ({ ...FD0, cls: VR?.cls || "" }));
  const ref = useRef<PaperHandle>(null);
  const set = (k: keyof FindFilter, v: string) => setFD((f) => ({ ...f, [k]: v, ...(k === "g" ? { cls: "" } : {}) }));
  const uniq = (f: (r: FindRow) => string) => [...new Set(all.map(f))];
  const clsAll = uniq((r) => r.cls).sort(),
    cls = clsAll.filter((c) => !FD.g || c[0] === FD.g);
  const subs = uniq((r) => r.subj),
    dates = uniq((r) => r.date),
    procs = [...new Set(all.flatMap((r) => [r.proc, r.sup || ""]))].filter(Boolean).sort();
  const bad = !!FD.cls && all.length > 0 && !clsAll.includes(FD.cls);
  const fd = useMemo(() => (bad ? { ...FD, cls: "" } : FD), [bad, FD]);
  const html = useMemo(() => findHtml(all, fd, VR), [all, fd, VR]);
  const one = VR && VR.cls; // 班級專用連結：只有這一班，不顯示年級、班級的選單
  const seg = (k: "mode" | "g", list: [string, string][]) => (
    <span className="inline-flex gap-0.5 rounded-full bg-sunk p-1">
      {list.map(([v, t]) => (
        <button key={v} type="button" onClick={() => set(k, v)} className={cx("min-h-8 rounded-full px-3.5 text-sm whitespace-nowrap", fd[k] === v ? "bg-card font-bold shadow-[0_0_0_1px_var(--line)]" : "text-ink2")}>
          {t}
        </button>
      ))}
    </span>
  );
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {seg("mode", [
          ["stu", "依學生"],
          ["room", "依試場"],
        ])}
        {one ? (
          <b>{VR!.cls} 班</b>
        ) : (
          <>
            {seg("g", [
              ["", "全部"],
              ["7", "七年級"],
              ["8", "八年級"],
              ["9", "九年級"],
            ])}
            <Select aria-label="班級" value={fd.cls} onChange={(e) => set("cls", e.target.value)}>
              <option value="">全部班級</option>
              {cls.map((c) => (
                <option key={c} value={c}>
                  {c} 班
                </option>
              ))}
            </Select>
          </>
        )}
        <Select aria-label="科目" value={fd.subj} onChange={(e) => set("subj", e.target.value)}>
          <option value="">全部科目</option>
          {subs.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        {dates.length > 1 && (
          <Select aria-label="日期" value={fd.date} onChange={(e) => set("date", e.target.value)}>
            <option value="">全部日期</option>
            {dates.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        )}
        {procs.length > 0 && (
          <Select aria-label="監考老師" value={fd.proc} onChange={(e) => set("proc", e.target.value)}>
            <option value="">全部監考老師</option>
            {procs.map((x) => (
              <option key={x} value={x}>
                監考：{x}
              </option>
            ))}
          </Select>
        )}
        <Input type="search" aria-label="搜尋學生" placeholder="姓名或座號" className="w-44" value={fd.q} onChange={(e) => set("q", e.target.value)} />
        <Button
          title="可以貼到 LINE"
          onClick={() => {
            const t = findCopyText(findRows(all, fd), fd, title);
            if (!t) return toast("目前沒有可以複製的內容");
            copyText(t);
          }}
        >
          <Copy size={16} />
          複製
        </Button>
        <Button onClick={() => ref.current?.print()}>
          <Printer size={16} />
          印出
        </Button>
        {extra}
      </div>
      {html == null ? (
        all.length ? (
          <Empty action={<Button onClick={() => setFD({ ...FD0, cls: VR?.cls || "" })}>清除條件</Button>}>沒有符合的學生</Empty>
        ) : (
          empty || <Empty>還沒有排考場</Empty>
        )
      ) : (
        <Paper ref={ref} title={title || "查考場"} area="findOut" html={html} />
      )}
    </div>
  );
}

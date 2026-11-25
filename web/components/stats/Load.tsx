"use client";
/* 老師工作量（舊版 extras.js loadPage）：每位資源班老師的基本、減授、應授、已排、每週超鐘點、外加課、課、個管、監考、IEP 會議；
   欄名可以排序；「外加課算進超鐘點」（D.settings.otCountExtra，學期設定）；
   每月超鐘點（印給教務處，A4 直式、黑白）：紙的 HTML 和舊版一字不差（lib/nx/stats.ts otMonthHtml），按「印出」只印這張。 */
import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import "@/components/sched/out.css";
import { Badge, Button, Card, Empty, Input, SectionTitle, cx } from "@/components/ui";
import { LOAD_COLS, loadRows, otMonthHtml, overtimeMonth, sortLoad, type LoadKey } from "@/lib/nx/stats";
import { ymd } from "@/lib/nx/today";
import Link from "next/link";
import "./otm.css";

const dash = <span className="text-mute">—</span>;

export function Load() {
  const { R, D, board, ro } = useAdmin();
  const { busy, edit } = useApply();
  const [k, setK] = useState<LoadKey>("per");
  const [dir, setDir] = useState(-1);
  const [ym, setYm] = useState(() => ymd(new Date()).slice(0, 7));
  const rows0 = useMemo(() => (board ? loadRows(D, board.M, board.S.slot, R.exam) : []), [D, board, R.exam]);
  const paper = useMemo(() => (board ? otMonthHtml(D, overtimeMonth(D, board.M, board.S.slot, ym)) : ""), [D, board, ym]);
  if (!board) return <Empty>還沒有課表。</Empty>;
  if (!rows0.length)
    return (
      <Empty
        action={
          <Link href="/admin/settings/school/?step=tea" className="text-blue underline">
            老師名冊
          </Link>
        }
      >
        還沒有資源班老師。
      </Empty>
    );
  const rows = sortLoad(rows0, k, dir);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.per, r.due)));
  const over = rows.filter((r) => r.fl === "over").length;
  const under = rows.filter((r) => r.fl === "under").length;
  const cx2 = !!D.settings.otCountExtra;
  const sort = (c: LoadKey) => {
    if (k === c) setDir(-dir);
    else {
      setK(c);
      setDir(c === "name" ? 1 : -1);
    }
  };
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {over > 0 && <Badge tone="bad">超過上限 {over} 位</Badge>}
        {under > 0 && <Badge tone="warn">不足 {under} 位</Badge>}
        {!over && !under && <Badge tone="ok">鐘點都剛好</Badge>}
        <span className="grow" />
        <label className="flex min-h-10 items-center gap-2 text-sm text-mute">
          <input
            type="checkbox"
            className="size-5"
            checked={cx2}
            disabled={ro("term") || busy}
            onChange={(e) =>
              void edit((d) => {
                if (e.target.checked) d.settings.otCountExtra = true;
                else delete d.settings.otCountExtra;
              }, e.target.checked ? "外加課算進超鐘點" : "外加課不算超鐘點")
            }
          />
          外加課算進超鐘點
        </label>
      </div>
      <div className="no-print overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-[15px]">
          <thead className="bg-sunk text-[13px] text-mute">
            <tr>
              {LOAD_COLS.map(([c, n]) => (
                <th key={c} className={cx("px-2.5 py-2 font-semibold whitespace-nowrap", c === "name" ? "text-left" : "text-right")} aria-sort={c === k ? (dir > 0 ? "ascending" : "descending") : undefined}>
                  <button type="button" className="inline-flex min-h-7 items-center gap-1 hover:text-ink" onClick={() => sort(c)}>
                    {n}
                    {c === k && <span aria-hidden>{dir > 0 ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line tabular-nums">
                <td className={cx("px-2.5 py-2 whitespace-nowrap", r.fl === "over" && "shadow-[inset_3px_0_var(--bad)]", r.fl === "under" && "shadow-[inset_3px_0_var(--warn)]")}>
                  {r.name} {r.fl === "over" ? <Badge tone="bad">超過上限</Badge> : r.fl === "under" ? <Badge tone="warn">少 {String(r.ot.short)}</Badge> : null}
                </td>
                <td className="px-2.5 py-2 text-right">{r.hours || dash}</td>
                <td className="px-2.5 py-2 text-right">
                  {r.reduce || dash}
                  {r.ot?.reduceNote ? <small className="text-mute"> {r.ot.reduceNote}</small> : null}
                </td>
                <td className="px-2.5 py-2 text-right">{r.hours ? r.due : dash}</td>
                <td className="px-2.5 py-2 text-right">
                  <b>{r.per}</b>
                  <div className="relative mt-1 h-2 min-w-16 rounded-full bg-sunk" title={r.per + (r.due ? " / " + r.due : "") + " 節"}>
                    <i className={cx("absolute inset-y-0 left-0 rounded-full", r.fl === "over" ? "bg-bad" : r.fl === "under" ? "bg-warn" : "bg-ink2")} style={{ width: Math.round((r.per / max) * 100) + "%" }} />
                    {r.due > 0 && <b className="absolute -inset-y-[3px] w-0.5 rounded-[1px] bg-ink" style={{ left: "calc(" + Math.round((r.due / max) * 100) + "% - 1px)" }} />}
                  </div>
                </td>
                <td className="px-2.5 py-2 text-right">{r.otw ? <b>+{r.otw}</b> : dash}</td>
                <td className="px-2.5 py-2 text-right">{r.extra || dash}</td>
                <td className="px-2.5 py-2 text-right">{r.groups}</td>
                <td className="px-2.5 py-2 text-right">{r.cases}</td>
                <td className="px-2.5 py-2 text-right">
                  {r.proctor}
                  {r.support ? <small className="text-mute">＋{r.support}</small> : null}
                </td>
                <td className="px-2.5 py-2 text-right">{r.iep}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle no={1} className="no-print mt-8">
        每月超鐘點
      </SectionTitle>
      <Card className="no-print mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" aria-label="月份" value={ym} onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && setYm(e.target.value)} />
          <Button tone="primary" onClick={() => window.print()} disabled={!paper}>
            <Printer size={16} />
            印出
          </Button>
        </div>
        <details className="mt-2">
          <summary className="flex min-h-8 cursor-pointer items-center text-sm text-blue">怎麼算</summary>
          <p className="text-sm text-mute">
            上課日：星期一到五，扣掉放假日和實施日期以外的日子（放假日在 設定 › 排課規則）。每一週：這個月裡的上課日照課表的節數加起來，減掉「應授 × 上課日數 ÷ 5」，少於 0 算 0，最多算到每週超鐘點；本月是各週相加。整週都上課時就等於每週超鐘點。
            {cx2 ? "外加課算在內。" : "外加課不算，寫在備註。"}
          </p>
        </details>
      </Card>
      {paper && (
        <div className="schedout">
          <div id="outArea" dangerouslySetInnerHTML={{ __html: paper }} />
        </div>
      )}
    </div>
  );
}

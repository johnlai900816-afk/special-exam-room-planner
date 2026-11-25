"use client";
/* 出缺席紀錄（舊版 checkin.js renderAttLog）：今天／本週／本月／全部／自訂、組別；每位學生的應到、實到、遲到、請假、缺席、出席率，
   點學生看明細；每一組的合計。只算有點過名的節次（放假、停課不算缺席），有點名但沒簽到也沒請假的算缺席。
   計算在 lib/nx/checkin.ts attStats（讀一節一份的點名文件，和舊版逐項相同）。表格在 #outArea，可以複製到 Word、印出。 */
import { useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { Dialog, Tip } from "@/components/sched/common";
import "@/components/sched/out.css";
import { Button, Empty, Input, Seg, Select, SectionTitle, cx } from "@/components/ui";
import { attRate, attStats, groupStats, logSpan, LOG_RANGES, sortStu, type LogRange } from "@/lib/nx/checkin";
import { useNow } from "@/lib/nx/hooks";
import { hmOf, ymd } from "@/lib/nx/today";
import { copyOutArea } from "../admin/common";

export function AttLog() {
  const { R, D } = useAdmin();
  const now = useNow(60000);
  const today = ymd(now);
  const hm = hmOf(now);
  const [range, setRange] = useState<LogRange>("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gid, setGid] = useState("");
  const [open, setOpen] = useState("");
  const [f, t] = logSpan(range, from, to, today);
  const by = useMemo(() => attStats(R.attendance, D, f, t, gid, today, hm), [R.attendance, D, f, t, gid, today, hm]);
  const rows = D.students.filter((s) => by[s.id]).sort(sortStu);
  const tot = rows.reduce(
    (a, s) => {
      const o = by[s.id];
      a.exp += o.exp;
      a.in += o.in;
      a.leave += o.leave;
      return a;
    },
    { exp: 0, in: 0, leave: 0 },
  );
  const gs = useMemo(() => groupStats(by), [by]);
  const sel = open ? D.students.find((s) => s.id === open) : null;
  const det = open ? by[open] : null;

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Seg<LogRange> label="期間" value={range} options={LOG_RANGES} onChange={setRange} />
        {range === "custom" && (
          <span className="flex items-center gap-1.5">
            <Input type="date" aria-label="開始日期" value={from} onChange={(e) => setFrom(e.target.value)} />～
            <Input type="date" aria-label="結束日期" value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
        )}
        <Select aria-label="組別" value={gid} onChange={(e) => setGid(e.target.value)}>
          <option value="">全部組別</option>
          {D.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Tip>只算有點過名的節次，放假、停課不算缺席；有點名但沒簽到也沒請假的算缺席。</Tip>
        <span className="grow" />
        <Button onClick={copyOutArea} disabled={!rows.length}>
          複製
        </Button>
        <Button tone="primary" onClick={() => window.print()} disabled={!rows.length}>
          印出
        </Button>
      </div>
      {!rows.length ? (
        <Empty>這段期間沒有點名紀錄。</Empty>
      ) : (
        <>
          <div id="outArea" className="schedout">
            <div className="pg">
              <h2>
                {D.title || "資源班"}｜出缺席統計{range === "all" ? "" : "（" + f + " ～ " + t + "）"}
              </h2>
              <table className="out">
                <thead>
                  <tr>
                    <th>班級</th>
                    <th>座號</th>
                    <th>姓名</th>
                    <th>應到</th>
                    <th>實到</th>
                    <th>遲到</th>
                    <th>請假</th>
                    <th>缺席</th>
                    <th>出席率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const o = by[s.id];
                    return (
                      <tr key={s.id} className="cursor-pointer hover:bg-hover" onClick={() => setOpen(s.id)}>
                        <td className="c">{s.cls}</td>
                        <td className="c">{s.seat}</td>
                        <td>
                          <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setOpen(s.id)}>
                            {s.name}
                          </button>
                        </td>
                        <td className="c">{o.exp}</td>
                        <td className="c">{o.in}</td>
                        <td className="c">{o.late || ""}</td>
                        <td className="c">{o.leave || ""}</td>
                        <td className={cx("c", o.abs > 0 && "font-bold text-bad")}>{o.abs || ""}</td>
                        <td className="c">
                          <b>{attRate(o)}</b>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th colSpan={3}>合計</th>
                    <th>{tot.exp}</th>
                    <th>{tot.in}</th>
                    <th colSpan={3} />
                    <th>{attRate(tot)}</th>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="no-print mt-2 text-sm text-mute">點學生看明細。</p>

          <SectionTitle no={1} className="no-print mt-8">
            各組
          </SectionTitle>
          <div className="no-print overflow-x-auto rounded-2xl border border-line bg-card">
            <table className="w-full text-[15px]">
              <thead className="bg-sunk text-[13px] text-mute">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">組別</th>
                  <th className="px-3 py-2 text-right font-semibold">學生</th>
                  <th className="px-3 py-2 text-right font-semibold">應到</th>
                  <th className="px-3 py-2 text-right font-semibold">實到</th>
                  <th className="px-3 py-2 text-right font-semibold">遲到</th>
                  <th className="px-3 py-2 text-right font-semibold">請假</th>
                  <th className="px-3 py-2 text-right font-semibold">缺席</th>
                  <th className="px-3 py-2 text-right font-semibold">出席率</th>
                </tr>
              </thead>
              <tbody>
                {gs.map((g) => (
                  <tr key={g.g} className="border-t border-line tabular-nums">
                    <td className="px-3 py-2">{g.g}</td>
                    <td className="px-3 py-2 text-right">{g.n}</td>
                    <td className="px-3 py-2 text-right">{g.exp}</td>
                    <td className="px-3 py-2 text-right">{g.in}</td>
                    <td className="px-3 py-2 text-right">{g.late || ""}</td>
                    <td className="px-3 py-2 text-right">{g.leave || ""}</td>
                    <td className={cx("px-3 py-2 text-right", g.abs > 0 && "font-bold text-bad")}>{g.abs || ""}</td>
                    <td className="px-3 py-2 text-right font-bold">{attRate(g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sel && det && (
        <Dialog title={sel.cls + " " + sel.name} onClose={() => setOpen("")} wide>
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="bg-sunk text-[13px] text-mute">
                <tr>
                  {["日期", "節次", "組別", "狀態", "簽到", "簽退", "備註"].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {det.rows
                  .slice()
                  .reverse()
                  .map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.date.slice(5)}</td>
                      <td className="px-2 py-1.5">{r.p}</td>
                      <td className="px-2 py-1.5">{r.g}</td>
                      <td className={cx("px-2 py-1.5", (r.st === "缺席" || r.st === "未到") && "text-bad")}>{r.st}</td>
                      <td className="px-2 py-1.5">{r.tin}</td>
                      <td className="px-2 py-1.5">{r.tout}</td>
                      <td className="px-2 py-1.5 text-mute">{r.note}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Dialog>
      )}
    </div>
  );
}

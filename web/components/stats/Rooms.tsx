"use client";
/* 教室使用（舊版 extras.js roomsPage）：① 找空教室（星期 × 節次，預設現在這一節）② 使用率 ③ 沒有分到教室的課 ④ 每間教室的一週。
   計算是 core.js roomUsage／freeRooms（照正式課表與這份排法指定的教室）。 */
import { useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { Badge, Card, Empty, Select, SectionTitle, cx } from "@/components/ui";
import { freeRooms, roomUsage } from "@/lib/nx/stats";

const DAYW = ["一", "二", "三", "四", "五"];

export function Rooms() {
  const { D, board } = useAdmin();
  const U = useMemo(() => (board ? roomUsage(board.M, board.S.slot, board.S.rfix) : null), [board]);
  const [d, setD] = useState(() => {
    const w = new Date().getDay();
    return w >= 1 && w <= 5 ? w - 1 : 0;
  });
  const [p, setP] = useState(() => {
    const n = new Date();
    const hm = String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0");
    const reg = D.periods.filter((x) => !x.extra);
    return ((reg.find((x) => hm < x.end) || reg[0] || D.periods[0]) || { id: "" }).id;
  });
  const [room, setRoom] = useState("");
  if (!board || !U) return <Empty>還沒有課表。</Empty>;
  if (!D.rooms.length) return <Empty>還沒有教室。</Empty>;
  const M = board.M;
  const pid = D.periods.some((x) => x.id === p) ? p : D.periods[0]?.id || "";
  const pi = D.periods.findIndex((x) => x.id === pid);
  const s = pi >= 0 ? d * M.NP + pi : -1;
  const free = s >= 0 ? freeRooms(U, s) : [];
  const tot = U.rooms.reduce((n, r) => n + r.used, 0);
  const cap = U.rooms.reduce((n, r) => n + r.total, 0);
  const show = U.rooms.filter((r) => !room || r.id === room);
  const blocked = (M as unknown as { blocked: Uint8Array }).blocked;
  return (
    <div>
      <SectionTitle no={1}>找空教室</SectionTitle>
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap gap-2">
          <Select aria-label="星期" value={d} onChange={(e) => setD(+e.target.value)}>
            {DAYW.map((x, i) => (
              <option key={i} value={i}>
                週{x}
              </option>
            ))}
          </Select>
          <Select aria-label="節次" value={pid} onChange={(e) => setP(e.target.value)}>
            {D.periods.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </div>
        {free.length ? (
          <div className="flex flex-wrap gap-1.5" aria-live="polite">
            {free.map((r) => (
              <Badge key={r.id} tone="ok">
                {r.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-mute">這一節沒有空教室。</p>
        )}
      </Card>

      <SectionTitle no={2} extra={"全部 " + (cap ? Math.round((tot / cap) * 100) : 0) + "%"}>
        使用率
      </SectionTitle>
      <Card className="mb-6">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-3">
          {U.rooms.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1">
              <span>
                {r.name} {r.spare && <Badge>備用</Badge>}
              </span>
              <b className="tabular-nums">{r.pct}%</b>
              <div className="col-span-2 h-2 rounded-full bg-sunk">
                <i className="block h-full rounded-full bg-ink2" style={{ width: r.pct + "%" }} />
              </div>
              <small className="text-sm text-mute">
                {r.used} / {r.total} 節
              </small>
            </li>
          ))}
        </ul>
      </Card>

      {U.none.length > 0 && (
        <>
          <SectionTitle extra={<Badge tone="bad">{U.none.length}</Badge>}>沒有分到教室</SectionTitle>
          <Card className="mb-6">
            <ul className="flex flex-col divide-y divide-line">
              {U.none.map((x, i) => (
                <li key={i} className="py-2">
                  {x.name}
                  <small className="block text-sm text-mute">{M.sn(x.s) + (x.teacher ? "・" + x.teacher : "")}</small>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <div className="mb-3 flex">
        <Select aria-label="教室" value={room} onChange={(e) => setRoom(e.target.value)}>
          <option value="">全部教室</option>
          {U.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      {show.map((r, ri) => (
        <div key={r.id}>
          <SectionTitle no={ri + 3} extra={<Badge>{r.pct}%</Badge>}>
            {r.name}
          </SectionTitle>
          <Card className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[420px] table-fixed border-separate border-spacing-[3px]">
              <thead>
                <tr>
                  <th className="w-16" />
                  {DAYW.map((x) => (
                    <th key={x} className="text-[13px] font-semibold text-mute">
                      週{x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {D.periods.map((per, pj) => (
                  <tr key={per.id}>
                    <th className="pr-1.5 text-right text-[13px] font-semibold whitespace-nowrap text-mute">{per.name}</th>
                    {DAYW.map((x, dd) => {
                      const ss = dd * M.NP + pj;
                      const ls = U.cells[r.i][ss] || [];
                      const off = per.extra || blocked[ss];
                      const pk = ss === s;
                      const c = "h-10 rounded-lg px-1 text-center text-[13px] leading-tight overflow-hidden text-ellipsis";
                      if (ls.length)
                        return (
                          <td key={x} className={cx(c, "border border-line2 bg-card", pk && "outline-2 -outline-offset-2 outline-blue")} title={ls.map((l) => l.name + (l.teacher ? " " + l.teacher : "")).join("、")}>
                            {ls[0].name}
                            <small className="block text-[12px] text-mute">{ls[0].teacher}</small>
                          </td>
                        );
                      return (
                        <td key={x} className={cx(c, off ? "bg-sunk text-mute" : "bg-ok-l font-semibold text-ok", pk && "outline-2 -outline-offset-2 outline-blue")}>
                          {off ? "—" : "空"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}
    </div>
  );
}

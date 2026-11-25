"use client";
/* 直接開會（舊版 iep.js vQuick）：已經知道時間，選學生、日期時間地點，帶入出席名單、印開會通知。
   老師端只列自己個管的學生；管理者端（tid=''）全部，承辦寫「特教組」。和舊版一樣的開會通知（lib/nx/iepPrint.ts noticesHtml）。 */
import { Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/Toast";
import { Button, Card, Input, Select, SectionTitle } from "@/components/ui";
import { IEP, type Round } from "@/lib/iep";
import { noticesHtml, type PrintOpt } from "@/lib/nx/iepPrint";
import type { RcData } from "@/lib/types";
import { PeopleEditor } from "./PeopleEditor";
import { NoticeOpts, usePer } from "./RoundPage";
import { useIep, useIepSource } from "./useIep";

/* ───── 開會通知（直接開會） ───── */
function Notices({ D, R, admin }: { D: RcData; R: Round; admin: boolean }) {
  const [o, setO] = useState<Omit<PrintOpt, "host" | "per">>({ nm: "cut", priv: "full", all: false });
  const [per, setPer] = usePer();
  const fixed = R.meets.filter((m) => m.at);
  return (
    <>
      <SectionTitle no={2} className="no-print mt-8">
        開會通知
      </SectionTitle>
      {!fixed.length ? (
        <p className="text-sm text-mute">排好時間才能印通知</p>
      ) : (
        <>
          <div className="mb-4">
            <NoticeOpts R={R} o={o} setO={setO} per={per} setPer={setPer}>
              <Button onClick={() => window.print()}>
                <Printer size={16} />
                印出
              </Button>
            </NoticeOpts>
          </div>
          <div id="outArea" dangerouslySetInnerHTML={{ __html: noticesHtml(D, R, { ...o, per, host: IEP.hostLabel(D, R) || (admin ? "特教組" : "") }) }} />
        </>
      )}
    </>
  );
}

/* ───── 直接開會 ───── */
export function Quick() {
  const x = useIepSource();
  const io = useIep();
  const D = x.D;
  const qs = IEP.ownRounds(D, x.tid, 1);
  const [q, setQ] = useState({ sid: "", kind: IEP.KINDS[0], date: "", p: "", pt: "", room: "" });
  const [open, setOpen] = useState("");
  const R = qs.find((r) => r.id === open) || null;
  const S = IEP.mineStu(D, x.tid)
    .slice()
    .sort((a, b) => String(a.cls).localeCompare(String(b.cls)) || (+a.seat || 0) - (+b.seat || 0));
  const go = async () => {
    const p = q.p === "*" ? q.pt.trim().replace(/[~～－—]/g, "-") : q.p;
    if (!q.sid || !q.date || !p) return toast("請選學生、日期和時間");
    if (q.p === "*" && !/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(p)) return toast("時間寫成 15:10-16:00");
    const r = await io.create((d) => {
      const s = IEP.stuOf(d, q.sid);
      if (!s || (x.tid && s.caseMgr !== x.tid)) {
        toast("只能替自己個管的學生開會");
        return null;
      }
      const n = IEP.quickMeet(d, { sid: q.sid, date: q.date, p, room: q.room, kind: q.kind, host: x.tid });
      if (n) n.inv = 1; // 排定的場次告訴出席老師（今天頁的「要開的會」）
      return n;
    });
    if (r) setOpen(r.id);
  };
  return (
    <>
      <Card className="no-print">
        <div className="grid max-w-[720px] grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr]">
          <span className="text-[13px] text-mute">學生</span>
          <Select value={q.sid} onChange={(e) => setQ({ ...q, sid: e.target.value })}>
            <option value="">（選擇）</option>
            {S.map((s) => (
              <option key={s.id} value={s.id}>
                {IEP.stuLabel(s)}
              </option>
            ))}
          </Select>
          <span className="text-[13px] text-mute">會議</span>
          <Select value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value })}>
            {IEP.KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
          <span className="text-[13px] text-mute">日期</span>
          <Input type="date" value={q.date} onChange={(e) => setQ({ ...q, date: e.target.value })} />
          <span className="text-[13px] text-mute">時間</span>
          <div className="flex flex-wrap gap-2">
            <Select value={q.p} onChange={(e) => setQ({ ...q, p: e.target.value })}>
              <option value="">（選擇）</option>
              {D.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.start}–{p.end}
                </option>
              ))}
              <option value="*">自訂時間</option>
            </Select>
            {q.p === "*" && <Input className="w-36" placeholder="15:10-16:00" value={q.pt} onChange={(e) => setQ({ ...q, pt: e.target.value })} />}
          </div>
          <span className="text-[13px] text-mute">地點</span>
          <Input placeholder="會議室" value={q.room} onChange={(e) => setQ({ ...q, room: e.target.value })} />
        </div>
        <Button tone="primary" className="mt-3" disabled={!S.length || io.ro} onClick={go}>
          帶入出席名單
        </Button>
      </Card>
      {R && (
        <>
          <Card className="no-print mt-4" title={<>{R.name} <small className="text-sm font-normal text-mute">{R.meets[0]?.at ? IEP.slotInfo(D, R.meets[0].at).label + " " + IEP.slotInfo(D, R.meets[0].at).time : ""}</small></>}>
            {R.meets[0] && (
              <PeopleEditor
                D={D}
                R={R}
                m={R.meets[0]}
                ro={io.ro}
                edit={(fn) =>
                  void io.edit(R.id, (d, r) => (r.meets[0] ? fn(d, r, r.meets[0]) : false))
                }
              />
            )}
          </Card>
          <Notices D={D} R={R} admin={x.admin} />
        </>
      )}
      {qs.length > 0 && (
        <div className="no-print">
          <SectionTitle no={1} className="mt-8">
            最近的會
          </SectionTitle>
          <ul className="flex flex-col gap-2">
            {qs
              .slice()
              .reverse()
              .slice(0, 20)
              .map((r) => (
                <li key={r.id} className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-card px-4 py-2">
                  <span className="min-w-0 flex-1">
                    {r.name}
                    <small className="ml-2 text-mute">{r.meets[0]?.at ? IEP.slotInfo(D, r.meets[0].at).label : ""}</small>
                  </span>
                  <Button size="sm" onClick={() => setOpen(r.id)}>
                    開啟
                  </Button>
                  <Button size="sm" tone="ghost" aria-label="刪除" onClick={() => confirm("刪除這場會議的通知資料？") && io.remove(r.id).then((ok) => ok && open === r.id && setOpen(""))}>
                    <Trash2 size={15} />
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </>
  );
}

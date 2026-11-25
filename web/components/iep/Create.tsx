"use client";
/* 建立調查（舊版 iep.js vCreate）：一個畫面填完要的東西，按一個鈕就建立並產生 QR。
   學生（只列自己個管的）、日期（預設期限之後的兩週）、節次（預設全部一般節次）、回覆期限（預設 5 天後）；出席名單自動帶入。
   下面的格子是承辦挑時段：承辦有課的灰掉不能選（原因只在這裡看得到，不放進公開資料）；
   有勾就只問勾的，沒勾就全部沒課的都問；原班課表在上主科的標黃、綜合彈性社團的標綠（ttCellAt）。
   SlotGrid、StuPicker 也給「調整名單／時段」用。 */
import { useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { Button, Card, Input, Select, cx } from "@/components/ui";
import { IEP, type PickGrid, type Round } from "@/lib/iep";
import type { RcData, Student } from "@/lib/types";
import { useIep } from "./useIep";

const ymdOf = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
/** 日期去掉星期（12/7（一）→ 12/7） */
export const md = (s: string) => IEP.fmtDate(s).replace(/（.）$/, "");

export interface Draft {
  sids: string[];
  d1: string;
  d2: string;
  ps: string[];
  due: string;
  kind: string;
  pick: string[];
}
/** 回覆期限預設 5 天後；調查的日期從期限之後的第一個上課日開始，共兩週 */
export function newDraft(D: RcData, now = new Date()): Draft {
  const due = new Date(now);
  due.setDate(due.getDate() + 5);
  const a = new Date(due);
  a.setDate(a.getDate() + 1);
  while (a.getDay() === 0 || a.getDay() === 6) a.setDate(a.getDate() + 1);
  const b = new Date(a);
  b.setDate(b.getDate() + 13);
  return { sids: [], d1: ymdOf(a), d2: ymdOf(b), ps: D.periods.filter((p) => !p.extra).map((p) => p.id), due: ymdOf(due), kind: IEP.KINDS[0], pick: [] };
}

/** 承辦有課的節次拿掉幾節的說明 */
export function cutLine(D: RcData, me: string, hs: string[], cut: number, kept: number, n: number): string {
  if (!n) return "";
  if (!hs.length) return "學生的個管不同：每場會議各自扣掉個管有課的節次";
  return "已排除" + (hs[0] === me ? "你" : IEP.pName(D, null, "t:" + hs[0])) + "有課的 " + cut + " 節，剩 " + kept + " 節可選";
}

/** 承辦挑時段的格子（舊版 gridHtml） */
export function SlotGrid({ G, onPick, ro }: { G: PickGrid; onPick(k: string): void; ro?: boolean }) {
  if (!G.rows.length) return <p className="text-sm text-mute">日期或節次還沒選</p>;
  return (
    <>
      <div className="iepgw overflow-x-auto">
        <table className="iepgrid">
          <thead>
            <tr>
              <th />
              {G.cols.map((c) => (
                <th key={c.p}>
                  {c.name}
                  <small>{c.time.split("–")[0] || ""}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {G.rows.map((r) => (
              <tr key={r.date}>
                <th>{r.label}</th>
                {r.cells.map((c, i) =>
                  !c ? (
                    <td key={i} />
                  ) : (
                    <td key={c.k}>
                      {c.busy ? (
                        <button type="button" className="bz" disabled title={c.why}>
                          有課
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={cx(c.on && "on", c.tint === "avoid" ? "av" : c.tint === "prefer" ? "pf" : "")}
                          aria-pressed={c.on}
                          aria-label={r.label + " " + (G.cols[i]?.name || "") + (c.subj ? "（" + c.subj + "）" : "")}
                          disabled={ro}
                          onClick={() => onPick(c.k)}
                        >
                          {c.subj || ""}
                        </button>
                      )}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ieplegend">
        <i className="lg on" />
        只問這些{" "}
        {G.hasTT && (
          <>
            <i className="lg pf" />
            建議（綜合、彈性…）
            <i className="lg av" />
            主科{" "}
          </>
        )}
        <i className="lg bz" />
        你有課
      </p>
    </>
  );
}

/** 選學生（只列自己個管的，照班級分組） */
export function StuPicker({ D, tid, sel, ro, onToggle, onAll }: { D: RcData; tid: string; sel: Set<string>; ro?: boolean; onToggle(sid: string, on: boolean): void; onAll(on: boolean): void }) {
  const S = IEP.mineStu(D, tid)
    .slice()
    .sort((a, b) => String(a.cls).localeCompare(String(b.cls)) || (+a.seat || 0) - (+b.seat || 0) || String(a.name).localeCompare(String(b.name)));
  const by = new Map<string, Student[]>();
  S.forEach((s) => by.set(String(s.cls), [...(by.get(String(s.cls)) || []), s]));
  if (!S.length) return <p className="text-sm text-mute">還沒有你個管的學生</p>;
  return (
    <>
      <div className="mb-2 flex gap-2">
        <Button size="sm" disabled={ro} onClick={() => onAll(true)}>
          全選
        </Button>
        <Button size="sm" disabled={ro} onClick={() => onAll(false)}>
          全不選
        </Button>
      </div>
      {[...by].map(([c, list]) => (
        <div key={c} className="my-1.5">
          <b className="inline-block min-w-[3.5em]">{c}</b>
          {list.map((s) => (
            <label key={s.id} className="mr-3 inline-flex min-h-10 items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4" disabled={ro} checked={sel.has(s.id)} onChange={(e) => onToggle(s.id, e.target.checked)} />
              {s.seat} {s.name}
            </label>
          ))}
        </div>
      ))}
    </>
  );
}

const F = "text-[13px] text-mute";

/** 建立調查的畫面。onCreated(R)：存好之後（要不要接著發布由頁面決定） */
export function Create({ online, canCancel, onCancel, onCreated }: { online: boolean; canCancel: boolean; onCancel(): void; onCreated(R: Round, cut: number): void }) {
  const io = useIep();
  const D = io.D;
  const [N, setN] = useState<Draft>(() => newDraft(D));
  const [busyBtn, setBusyBtn] = useState(false);
  const { keys, hs, busy, G } = useMemo(() => {
    const keys = IEP.baseKeys(D, N.d1, N.d2, N.ps);
    const hs = IEP.hostsOf(D, { host: io.tid }, N.sids);
    const busy: Record<string, string> = {};
    hs.forEach((t) => {
      const b = IEP.tBusy(D, t, keys, io.ctx);
      for (const k in b) if (!busy[k]) busy[k] = b[k];
    });
    return { keys, hs, busy, G: IEP.pickGrid(D, { keys, sids: N.sids, busy, pick: N.pick }) };
  }, [D, N, io.tid, io.ctx]);
  const cut = Object.keys(busy).length;
  const kept = keys.length - cut;
  const np = N.pick.filter((k) => !busy[k]).length;
  const set = (o: Partial<Draft>) => setN({ ...N, ...o });

  const create = async () => {
    if (!N.sids.length) return toast("先選學生");
    if (!N.d1 || !N.d2 || N.d2 < N.d1) return toast("日期不對");
    if (!N.ps.length) return toast("先選節次");
    if (!N.due) return toast("先填回覆期限");
    setBusyBtn(true);
    let r: ReturnType<typeof io.rebuild> = null;
    try {
      const R = await io.create((d) => {
        const R = IEP.newRoundAs(d, io.tid, { name: N.kind + "時間調查 " + md(N.d1) + "～" + md(N.d2), stu: N.sids });
        R.kind = N.kind;
        R.priv = "cls";
        R.due = N.due;
        R.d1 = N.d1;
        R.d2 = N.d2;
        R.ps = N.ps.slice();
        R.pick = N.pick.slice();
        // 新版：出席的老師登入就在「填空堂」看得到（不用 QR）
        R.inv = 1;
        r = io.rebuild(d, R);
        return R;
      });
      if (R) onCreated(R, (r as { cut?: number } | null)?.cut || 0);
    } finally {
      setBusyBtn(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="建立調查">
        <div className="grid max-w-[720px] grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr]">
          <span className={F}>會議</span>
          <Select aria-label="會議" value={N.kind} onChange={(e) => set({ kind: e.target.value })}>
            {IEP.KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
          <span className={F}>日期</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input type="date" aria-label="開始日期" value={N.d1} onChange={(e) => set({ d1: e.target.value, pick: [] })} />
            <span>～</span>
            <Input type="date" aria-label="結束日期" value={N.d2} onChange={(e) => set({ d2: e.target.value, pick: [] })} />
          </div>
          <span className={F}>節次</span>
          <div className="flex flex-wrap gap-x-3">
            {D.periods.map((p) => (
              <label key={p.id} className="inline-flex min-h-10 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={N.ps.includes(p.id)}
                  onChange={(e) => {
                    const ps = N.ps.filter((x) => x !== p.id).concat(e.target.checked ? [p.id] : []);
                    set({ ps: D.periods.map((x) => x.id).filter((x) => ps.includes(x)), pick: [] });
                  }}
                />
                {p.name}
              </label>
            ))}
          </div>
          <span className={F}>回覆期限</span>
          <Input type="date" aria-label="回覆期限" value={N.due} onChange={(e) => set({ due: e.target.value })} />
        </div>
        <h4 className="mt-5 mb-2 flex flex-wrap items-baseline gap-2 font-bold">
          學生<small className="text-sm font-normal text-mute">已選 {N.sids.length} 位，出席名單自動帶入</small>
        </h4>
        <StuPicker
          D={D}
          tid={io.tid}
          sel={new Set(N.sids)}
          onToggle={(sid, on) => set({ sids: N.sids.filter((x) => x !== sid).concat(on ? [sid] : []) })}
          onAll={(on) => {
            const S = IEP.mineStu(D, io.tid).map((s) => s.id);
            set({ sids: on ? [...new Set(N.sids.concat(S))] : N.sids.filter((id) => !S.includes(id)) });
          }}
        />
      </Card>
      <Card title={<>時段 <small className="text-sm font-normal text-mute">{cutLine(D, io.tid, hs, cut, kept, 1)}</small></>}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {G.hasTT && (
            <Button
              size="sm"
              onClick={() => {
                const pick = IEP.suggestPick(G);
                if (!pick.length) toast("沒有建議的時段");
                set({ pick });
              }}
            >
              勾選建議時段
            </Button>
          )}
          {N.pick.length > 0 && (
            <Button size="sm" onClick={() => set({ pick: [] })}>
              清除勾選
            </Button>
          )}
          <span className="text-sm text-mute">{np ? "只問勾的 " + np + " 節" : "沒勾：" + kept + " 節都問"}</span>
        </div>
        <SlotGrid G={G} onPick={(k) => set({ pick: N.pick.includes(k) ? N.pick.filter((x) => x !== k) : [...N.pick, k] })} />
      </Card>
      {!online && <p className="text-sm text-mute">線上連結要登入新版（不是範例資料）；沒有也可以建立，出席的老師在「填空堂」回覆，或印紙本時段表。</p>}
      <div className="flex justify-end gap-2">
        {canCancel && <Button onClick={onCancel}>取消</Button>}
        <Button tone="primary" disabled={busyBtn || io.ro} onClick={create}>
          {online ? "建立並產生 QR" : "建立"}
        </Button>
      </div>
    </div>
  );
}

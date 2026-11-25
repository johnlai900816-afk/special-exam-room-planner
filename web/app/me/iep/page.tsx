"use client";
/* 我的 IEP（舊版 iep.js 的「我的 IEP」，老師只動自己個管的學生）：
     填空堂     別人（或自己）開的調查邀請我：點有空的節次送出（iepInvite，只改得到自己的回覆）
     調查       ①建立 ②名單 ③發給出席的人（填空堂、線上連結與 QR、紙本） ④回覆
     排定與通知 排出時間、手動調整、印開會通知（和舊版一模一樣）
     直接開會   已經知道時間：選學生、日期時間地點，帶入名單、印通知 */
import { Printer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PeopleEditor } from "@/components/iep/PeopleEditor";
import { Publish } from "@/components/iep/Publish";
import { QrSlips } from "@/components/iep/QrSlips";
import { useIep } from "@/components/iep/useIep";
import { failText, toast } from "@/components/Toast";
import { TeacherShell } from "@/components/TeacherShell";
import { Badge, Button, Card, Empty, Input, Seg, Select, SectionTitle, cx } from "@/components/ui";
import { IEP, type Round } from "@/lib/iep";
import { NX } from "@/lib/legacy";
import type { IepInviteDoc } from "@/lib/model";
import { useQuery } from "@/lib/nx/hooks";
import { pull, urlOf } from "@/lib/nx/iepOnline";
import { noticesHtml, paperHtml, type PrintOpt } from "@/lib/nx/iepPrint";
import { mergeInvites } from "@/lib/nx/iepSync";
import { useNx } from "@/lib/nx/session";
import { ymd } from "@/lib/nx/today";
import { revKey, toCoreD } from "@/lib/repo";
import type { RcData } from "@/lib/types";

type Tab = "inv" | "survey" | "plan" | "quick";
const TABS: [Tab, string][] = [
  ["inv", "填空堂"],
  ["survey", "調查"],
  ["plan", "排定與通知"],
  ["quick", "直接開會"],
];
const STEPS = ["建立", "名單", "發給出席的人", "回覆"];
const NUM = "①②③④";
const SYM: Record<string, string> = { y: "○", n: "╳", m: "△" };

/* ───── 填空堂 ───── */
function InvCard({ v }: { v: IepInviteDoc }) {
  const x = useNx();
  const id = v.roundId + "_" + v.teacherId;
  const [free, setFree] = useState<Set<string>>(() => new Set(v.free || []));
  const [note, setNote] = useState(v.note || "");
  const ro = !x.writable("iep") || x.repo!.readOnly;
  const today = ymd(new Date());
  const keys = new Set(v.keys);
  const dates = [...new Set(v.keys.map((k) => k.split("|")[0]))].sort();
  const send = async () => {
    try {
      await x.repo!.patch("iepInvite", NX.encId(id), { free: [...free].filter((k) => keys.has(k)), note: note.trim().slice(0, 300), ansAt: Date.now() }, x.data!.revs[revKey("iepInvite", NX.encId(id))]?.rev || 0);
      toast("已送出：有空 " + free.size + " 節");
    } catch (e) {
      toast(failText(e));
    }
  };
  return (
    <Card>
      <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-[17px] font-bold">
        {v.round || v.kind}
        <small className="text-sm font-normal text-mute">{[v.host, v.due ? IEP.fmtDate(v.due) + " 前" : ""].filter(Boolean).join("・")}</small>
        {v.ansAt ? <Badge tone="ok">已填</Badge> : v.due && v.due < today ? <Badge tone="bad">已過期限</Badge> : null}
      </h3>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {v.stu.map((s, i) => (
          <Badge key={i}>
            {s.c}・{s.r.split("、")[0]}
            {s.q ? "" : "（邀）"}
          </Badge>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="iepans iepme">
          <thead>
            <tr>
              <th />
              {v.ps.map((p) => (
                <th key={p.id}>{p.n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((d) => (
              <tr key={d}>
                <th>{IEP.fmtDate(d)}</th>
                {v.ps.map((p) => {
                  const k = d + "|" + p.id;
                  if (!keys.has(k)) return <td key={k} />;
                  const on = free.has(k);
                  const bz = v.busy[k];
                  return (
                    <td key={k}>
                      <button
                        type="button"
                        className={cx("c", on ? "y" : bz ? "a" : "")}
                        aria-pressed={on}
                        title={bz || ""}
                        disabled={ro}
                        onClick={() => {
                          const n = new Set(free);
                          if (on) n.delete(k);
                          else n.add(k);
                          setFree(n);
                        }}
                      >
                        {on ? "○" : bz ? bz.slice(0, 2) : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <Input className="min-w-0 flex-1" placeholder="備註（例：可以調課）" aria-label="備註" value={note} disabled={ro} onChange={(e) => setNote(e.target.value)} />
        <Button tone="primary" disabled={ro} onClick={send}>
          {v.ansAt ? "更新" : "送出"}
        </Button>
      </div>
    </Card>
  );
}

function Inv() {
  const x = useNx();
  const list = Object.values(x.data!.records.iepInvite)
    .filter((v) => v.teacherId === x.tid && v.keys.length)
    .sort((a, b) => String(a.due || "~").localeCompare(String(b.due || "~")));
  if (!list.length) return <Empty>目前沒有要填的會議時間</Empty>;
  return (
    <div className="flex flex-col gap-4">
      {list.map((v) => (
        <InvCard key={v.roundId + v.teacherId + (v.ansAt || 0)} v={v} />
      ))}
    </div>
  );
}

/* ───── 共用：選調查、印出選項 ───── */
function Picker({ rounds, cur, onPick, onNew, onDel }: { rounds: Round[]; cur: Round | null; onPick(id: string): void; onNew(): void; onDel(): void }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      {rounds.length > 0 && (
        <Select aria-label="選調查" value={cur?.id || ""} onChange={(e) => onPick(e.target.value)}>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name || "未命名的調查"}
            </option>
          ))}
        </Select>
      )}
      <Button onClick={onNew}>新增調查</Button>
      {cur && (
        <Button tone="danger" onClick={onDel}>
          <Trash2 size={15} />
          刪除
        </Button>
      )}
    </div>
  );
}

function PrintBar({ children, onPrint }: { children: ReactNode; onPrint(): void }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      {children}
      <Button onClick={onPrint}>
        <Printer size={16} />
        印出
      </Button>
    </div>
  );
}

/* ───── 調查 ───── */
function Survey({ R, D, step, setStep }: { R: Round; D: RcData; step: number; setStep(n: number): void }) {
  const x = useNx();
  const io = useIep();
  const ro = io.ro;
  const ed = (fn: (D: RcData, R: Round) => void | false | Promise<void | false>) => io.edit(R.id, fn);
  const busy = useMemo(() => io.busyOf(D, R), [io, D, R]);
  const [pm, setPm] = useState<"qr" | "paper">("qr");
  const [per, setPer] = useState<"4" | "3">("4");
  const [priv, setPriv] = useState<"full" | "cls" | "mask">("full");
  const [only, setOnly] = useState(false);
  const pulled = useRef(0);
  const host = IEP.hostLabel(D, R);
  const online = !x.demo && !!x.user;

  useEffect(() => {
    if (step !== 4 || !online || !(R.pub || []).length || Date.now() - pulled.current < 60000) return;
    pulled.current = Date.now();
    ed(async (d, r) => ((await pull(x.scope!, d, r)) ? undefined : false)).catch(() => {});
  });

  const S = IEP.mineStu(D, x.tid)
    .slice()
    .sort((a, b) => String(a.cls).localeCompare(String(b.cls)) || (+a.seat || 0) - (+b.seat || 0));
  const inR = new Set(R.meets.map((m) => m.s));
  const byCls = new Map<string, typeof S>();
  S.forEach((s) => byCls.set(String(s.cls), [...(byCls.get(String(s.cls)) || []), s]));
  const prog = IEP.progress(D, R);

  const stepNav = (
    <nav className="iepsteps no-print">
      {STEPS.map((t, i) => (
        <button key={t} type="button" className={i + 1 === step ? "on" : ""} onClick={() => setStep(i + 1)}>
          <i>{NUM[i]}</i>
          {t}
        </button>
      ))}
    </nav>
  );
  const nextBtn = step < 4 && (
    <div className="no-print mt-4 flex justify-end">
      <Button onClick={() => setStep(step + 1)}>
        下一步：{NUM[step]} {STEPS[step]}
      </Button>
    </div>
  );

  let body: ReactNode = null;
  if (step === 1)
    body = (
      <div className="flex flex-col gap-4">
        <Card title="基本資料">
          <div className="grid max-w-[720px] grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr]">
            <span className="text-[13px] text-mute">名稱</span>
            <Input disabled={ro} defaultValue={R.name} key={"n" + R.name} onBlur={(e) => e.target.value.trim() !== R.name && ed((_, r) => void (r.name = e.target.value.trim()))} />
            <span className="text-[13px] text-mute">會議</span>
            <Select disabled={ro} value={R.kind || IEP.KINDS[0]} onChange={(e) => ed((_, r) => void (r.kind = e.target.value))}>
              {IEP.KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
            <span className="text-[13px] text-mute">回覆期限</span>
            <Input type="date" disabled={ro} value={R.due} onChange={(e) => ed((_, r) => void (r.due = e.target.value))} />
            <span className="text-[13px] text-mute">承辦</span>
            <span className="font-medium">{host}</span>
            <span className="text-[13px] text-mute">地點</span>
            <Input
              disabled={ro}
              placeholder="會議室、資源教室一"
              defaultValue={R.rooms.join("、")}
              key={"r" + R.rooms.join()}
              onBlur={(e) =>
                ed((_, r) => {
                  const v = e.target.value.split(/[、,，;；\s]+/).map((y) => y.trim()).filter(Boolean);
                  if (v.join() === r.rooms.join()) return false;
                  r.rooms = v;
                })
              }
            />
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-blue">線上頁與家長</summary>
            <div className="mt-2 grid max-w-[720px] grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr]">
              <span className="text-[13px] text-mute">學生顯示</span>
              <Select disabled={ro} value={R.priv || "cls"} onChange={(e) => ed((_, r) => void (r.priv = e.target.value))}>
                <option value="cls">班級座號</option>
                <option value="mask">班級座號＋王○明</option>
              </Select>
              <span className="text-[13px] text-mute">家長</span>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" disabled={ro} checked={!!R.par} onChange={(e) => ed((_, r) => void (r.par = e.target.checked ? 1 : 0))} />
                家長、專業人員也發連結
              </label>
              <span className="text-[13px] text-mute">保存期間</span>
              <Input disabled={ro} placeholder="排定後刪除，最晚到學期結束" defaultValue={String(R.keep || "")} onBlur={(e) => e.target.value.trim() !== (R.keep || "") && ed((_, r) => void (r.keep = e.target.value.trim()))} />
            </div>
          </details>
        </Card>
        <Card title={<>日期與節次 <small className="text-sm font-normal text-mute">{R.slots.length} 個時段</small></>}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Input type="date" aria-label="開始日期" disabled={ro} value={R.d1 || ""} onChange={(e) => ed((d, r) => void IEP.setRange(d, r, e.target.value, r.d2 || "", r.ps || []))} />–
            <Input type="date" aria-label="結束日期" disabled={ro} value={R.d2 || ""} onChange={(e) => ed((d, r) => void IEP.setRange(d, r, r.d1 || "", e.target.value, r.ps || []))} />
          </div>
          <div className="flex flex-wrap gap-x-3">
            {D.periods.map((p) => {
              const on = (R.ps || []).includes(p.id);
              return (
                <label key={p.id} className="inline-flex min-h-10 items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={ro}
                    checked={on}
                    onChange={() => ed((d, r) => void IEP.setRange(d, r, r.d1 || "", r.d2 || "", on ? (r.ps || []).filter((y) => y !== p.id) : [...(r.ps || []), p.id]))}
                  />
                  {p.name} <small className="text-mute">{p.start}</small>
                </label>
              );
            })}
          </div>
        </Card>
        <Card title={<>學生 <small className="text-sm font-normal text-mute">已選 {R.meets.length} 位</small></>}>
          {S.length ? (
            <>
              <div className="mb-2 flex gap-2">
                <Button size="sm" disabled={ro} onClick={() => ed((d, r) => S.forEach((s) => IEP.addMeetAs(d, r, s.id, x.tid)))}>
                  全選
                </Button>
                <Button size="sm" disabled={ro} onClick={() => R.meets.length && confirm("移除全部學生？名單的修改也會清掉。") && ed((_, r) => r.meets.slice().forEach((m) => IEP.delMeet(r, m.id)))}>
                  全不選
                </Button>
              </div>
              {[...byCls].map(([c, list]) => (
                <div key={c} className="my-1.5">
                  <b className="inline-block min-w-[3.5em]">{c}</b>
                  {list.map((s) => (
                    <label key={s.id} className="mr-3 inline-flex min-h-10 items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        disabled={ro}
                        checked={inR.has(s.id)}
                        onChange={(e) =>
                          ed((d, r) => {
                            if (e.target.checked) {
                              if (!IEP.addMeetAs(d, r, s.id, x.tid)) return false;
                            } else {
                              const m = r.meets.find((y) => y.s === s.id);
                              if (m) IEP.delMeet(r, m.id);
                            }
                          })
                        }
                      />
                      {s.seat} {s.name}
                    </label>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-mute">還沒有你個管的學生</p>
          )}
        </Card>
      </div>
    );
  else if (step === 2) {
    const noHr = [...new Set(R.meets.map((m) => IEP.stuOf(D, m.s)).filter((s) => s && !(D.classHead as Record<string, string> | undefined)?.[String(s.cls)]).map((s) => String(s!.cls)))];
    body = !R.meets.length ? (
      <Empty action={<Button onClick={() => setStep(1)}>選學生</Button>}>還沒有學生</Empty>
    ) : (
      <div className="flex flex-col gap-4">
        {noHr.length > 0 && <p className="text-sm text-bad">還沒設定導師：{noHr.join("、")}</p>}
        {R.meets.map((m) => {
          const s = IEP.stuOf(D, m.s);
          return (
            <Card key={m.id} title={<>{IEP.stuLabel(s)} <small className="text-sm font-normal text-mute">{m.p.length} 人，必要 {m.p.filter((p) => p[2]).length}</small></>}>
              <PeopleEditor
                D={D}
                R={R}
                m={m}
                ro={ro}
                edit={(fn) =>
                  void ed((d, r) => {
                    const mm = r.meets.find((y) => y.id === m.id);
                    return mm ? fn(d, r, mm) : false;
                  })
                }
              />
            </Card>
          );
        })}
      </div>
    );
  } else if (step === 3) {
    const people = IEP.webPeople(D, R).filter((o) => !only || !prog.people.find((p) => p.k === o.k)?.done);
    body = (
      <div className="flex flex-col gap-4">
        <Card className="no-print">
          <Publish D={D} R={R} busy={busy} onEdit={ed} />
        </Card>
        <SectionTitle no={1} extra={people.length + " 人"} className="no-print">
          列印
        </SectionTitle>
        <PrintBar onPrint={() => window.print()}>
          <Seg<"qr" | "paper">
            label="印什麼"
            value={pm}
            options={[
              ["qr", "QR 小單"],
              ["paper", "紙本時段表"],
            ]}
            onChange={setPm}
          />
          {pm === "qr" && (
            <Select aria-label="一張裁幾張" value={per} onChange={(e) => setPer(e.target.value as "4" | "3")}>
              <option value="4">一張裁 4</option>
              <option value="3">一張裁 3</option>
            </Select>
          )}
          <Select aria-label="學生怎麼印" value={priv} onChange={(e) => setPriv(e.target.value as "full")}>
            <option value="full">班級座號＋姓名</option>
            <option value="cls">只印班級座號</option>
            <option value="mask">姓名遮字</option>
          </Select>
          <label className="inline-flex min-h-10 items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4" checked={only} onChange={(e) => setOnly(e.target.checked)} />
            只印還沒填的
          </label>
        </PrintBar>
        {pm === "qr" ? (
          (R.pub || []).length ? (
            <QrSlips D={D} R={R} people={people} urlOf={(pk) => urlOf(R, pk)} per={per === "3" ? 3 : 4} priv={priv} host={host} />
          ) : (
            <p className="no-print text-sm text-mute">發布後才有 QR</p>
          )
        ) : (
          <div id="outArea" dangerouslySetInnerHTML={{ __html: people.map((o) => paperHtml(D, R, o, busy, { priv, host })).join("") }} />
        )}
      </div>
    );
  } else {
    const keys = IEP.keysOf(R);
    const inf = keys.map((k) => IEP.slotInfo(D, k));
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 text-[15px]">
          <span>
            填了 <b className="tabular-nums">{prog.people.filter((o) => o.done).length}</b> / {prog.people.length} 人
          </span>
          <span>
            可以排：<b className="tabular-nums">{prog.ready}</b> / {prog.meets.length} 場
          </span>
          {online && (R.pub || []).length > 0 && (
            <Button size="sm" onClick={() => ed(async (d, r) => {
              const n = await pull(x.scope!, d, r);
              toast(n ? "收到 " + n + " 份新的回覆" : "沒有新的回覆");
              if (!n) return false;
            })}>
              抓取回覆
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sunk text-left text-[13px] text-mute">
                <th className="px-2 py-2 font-normal">姓名</th>
                <th className="px-2 py-2 font-normal">會議</th>
                <th className="px-2 py-2 font-normal">狀態</th>
                <th className="px-2 py-2 font-normal">備註</th>
              </tr>
            </thead>
            <tbody>
              {prog.people.map((o) => (
                <tr key={o.k} className="border-b border-line">
                  <td className="px-2 py-2">{o.name}</td>
                  <td className="px-2 py-2 text-mute">
                    {o.meets.length} 場{o.meets.some((y) => y.req) ? "・必要" : ""}
                  </td>
                  <td className="px-2 py-2">
                    {o.done ? <Badge tone="ok">填了</Badge> : "還沒填"}
                    {o.done === "paper" && <small className="ml-1 text-mute">手動</small>}
                  </td>
                  <td className="px-2 py-2 text-mute">{o.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-blue">手動登錄（紙本、電話）</summary>
          <p className="ieplegend">點格子：○ 可 → ╳ 不可 → △ 不確定 → 空白。「課」＝查到有課、沒回覆</p>
          <div className="overflow-x-auto">
            <table className="iepans">
              <thead>
                <tr>
                  <th>姓名</th>
                  {inf.map((f) => (
                    <th key={f.k}>
                      {IEP.fmtDate(f.date)}
                      <br />
                      {f.name}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {prog.people.map((o) => {
                  const ks = new Set(o.keys);
                  return (
                    <tr key={o.k}>
                      <td className="nm">{o.name}</td>
                      {keys.map((k) => {
                        if (!ks.has(k)) return <td key={k} />;
                        const s = IEP.status(R, busy, o.k, k);
                        return (
                          <td key={k}>
                            <button type="button" className={"c " + (s.auto ? "a" : s.v)} title={s.why || ""} disabled={ro} onClick={() => ed((_, r) => void IEP.cycle(r, busy, o.k, k))}>
                              {s.auto ? "課" : SYM[s.v] || ""}
                            </button>
                          </td>
                        );
                      })}
                      <td>
                        <Button size="sm" disabled={ro} onClick={() => ed((_, r) => IEP.fillRest(r, o.k, "y", null, busy))}>
                          其餘都可
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    );
  }
  return (
    <>
      {stepNav}
      {body}
      {nextBtn}
    </>
  );
}

/* ───── 開會通知（排定與通知、直接開會共用） ───── */
function Notices({ D, R }: { D: RcData; R: Round }) {
  const io = useIep();
  const [o, setO] = useState<Omit<PrintOpt, "host">>({ nm: "cut", per: 4, priv: "full", all: false });
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
          <PrintBar onPrint={() => window.print()}>
            <Select aria-label="印什麼" value={o.nm} onChange={(e) => setO({ ...o, nm: e.target.value as PrintOpt["nm"] })}>
              <option value="cut">小通知單</option>
              <option value="sum">安排總表</option>
              <option value="each">每人一張彙整</option>
            </Select>
            {o.nm === "cut" && (
              <Select aria-label="裁幾張" value={String(o.per)} onChange={(e) => setO({ ...o, per: e.target.value === "3" ? 3 : 4 })}>
                <option value="4">裁 4</option>
                <option value="3">裁 3</option>
              </Select>
            )}
            {o.nm !== "sum" && (
              <>
                <Select aria-label="學生怎麼印" value={o.priv} onChange={(e) => setO({ ...o, priv: e.target.value as PrintOpt["priv"] })}>
                  <option value="full">班級座號＋姓名</option>
                  <option value="cls">只印班級座號</option>
                  <option value="mask">姓名遮字</option>
                </Select>
                <label className="inline-flex min-h-10 items-center gap-1.5 text-sm">
                  <input type="checkbox" className="size-4" checked={o.all} onChange={(e) => setO({ ...o, all: e.target.checked })} />
                  家長、專業人員也印
                </label>
              </>
            )}
            <label className="inline-flex items-center gap-1.5 text-sm text-mute">
              回條交回
              <Input type="date" disabled={io.ro} value={String(R.cdue || "")} onChange={(e) => io.edit(R.id, (_, r) => void (r.cdue = e.target.value))} />
            </label>
          </PrintBar>
          <div id="outArea" dangerouslySetInnerHTML={{ __html: noticesHtml(D, R, { ...o, host: IEP.hostLabel(D, R) }) }} />
        </>
      )}
    </>
  );
}

/* ───── 排定與通知 ───── */
function Plan({ R, D, goSurvey }: { R: Round; D: RcData; goSurvey(): void }) {
  const io = useIep();
  const busy = useMemo(() => io.busyOf(D, R), [io, D, R]);
  const [un, setUn] = useState<Record<string, string>>({});
  const prog = IEP.progress(D, R);
  const ready = new Map(prog.meets.map((y) => [y.m.id, y]));
  const cf = IEP.conflicts(D, R).concat(IEP.crossConflicts(D, R));
  const ed = (fn: (D: RcData, R: Round) => void | false) => io.edit(R.id, fn);
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button
          tone="primary"
          disabled={!R.meets.length || io.ro}
          onClick={() =>
            ed((d, r) => {
              const res = IEP.schedule(d, r, { busy: io.busyOf(d, r) });
              IEP.applyPlan(r, res);
              setUn(Object.fromEntries(res.un.map((u) => [u.id, u.why])));
              toast("排好 " + Object.keys(res.at).length + " 場" + (res.un.length ? "，" + res.un.length + " 場排不進去" : ""));
            })
          }
        >
          排出時間
        </Button>
        <Button disabled={io.ro} onClick={() => (setUn({}), ed((_, r) => r.meets.forEach((m) => !m.pin && ((m.at = ""), (m.room = "")))))}>
          清除沒固定的
        </Button>
        <span className="text-[15px]">
          可以排：<b className="tabular-nums">{prog.ready}</b> / {prog.meets.length} 場
        </span>
      </div>
      {cf.length > 0 && <div className="no-print mb-3 rounded-[10px] bg-bad-l px-3 py-2 text-sm text-bad">{cf.map((c, i) => <div key={i}>{c.m}</div>)}</div>}
      {!R.meets.length ? (
        <Empty action={<Button onClick={goSurvey}>選學生</Button>}>還沒有學生</Empty>
      ) : (
        <div className="no-print overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sunk text-left text-[13px] text-mute">
                <th className="px-2 py-2 font-normal">學生</th>
                <th className="px-2 py-2 font-normal">回覆</th>
                <th className="px-2 py-2 font-normal">時間</th>
                <th className="px-2 py-2 font-normal">地點</th>
                <th className="px-2 py-2 font-normal">固定</th>
                <th className="px-2 py-2 font-normal">情形</th>
              </tr>
            </thead>
            <tbody>
              {R.meets
                .slice()
                .sort((a, b) => String(a.at || "~").localeCompare(String(b.at || "~")))
                .map((m) => {
                  const rk = IEP.rank(D, R, m, busy);
                  const cur = rk.find((r) => r.k === m.at);
                  const rd = ready.get(m.id);
                  const rooms = [...R.rooms];
                  if (m.room && !rooms.includes(m.room)) rooms.push(m.room);
                  const setM = (fn: (mm: typeof m) => void) => ed((_, r) => {
                    const mm = r.meets.find((y) => y.id === m.id);
                    if (!mm) return false;
                    fn(mm);
                  });
                  return (
                    <tr key={m.id} className="border-b border-line align-top">
                      <td className="px-2 py-2 whitespace-nowrap">{IEP.stuLabel(IEP.stuOf(D, m.s))}</td>
                      <td className="px-2 py-2">{rd?.ready ? <Badge tone="ok">齊了</Badge> : <small className="text-mute">等 {(rd?.wait || []).join("、")}</small>}</td>
                      <td className="px-2 py-2">
                        <Select aria-label="時間" disabled={io.ro} value={m.at || ""} onChange={(e) => (setUn((u) => ({ ...u, [m.id]: "" })), setM((mm) => ((mm.at = e.target.value), (mm.pin = e.target.value ? 1 : 0))))}>
                          <option value="">（未排）</option>
                          {rk.map((r) => (
                            <option key={r.k} value={r.k}>
                              {(r.ok ? "" : "✗ ") + IEP.slotInfo(D, r.k).label + "　" + (r.ok ? r.yes + "/" + r.tot + " 人可" : r.bad.join("、") + " 不行")}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Select aria-label="地點" disabled={io.ro} value={m.room || ""} onChange={(e) => setM((mm) => void (mm.room = e.target.value))}>
                          <option value="">（未定）</option>
                          {rooms.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="checkbox" className="size-5" aria-label="固定" disabled={io.ro} checked={!!m.pin} onChange={(e) => setM((mm) => void (mm.pin = e.target.checked ? 1 : 0))} />
                      </td>
                      <td className="px-2 py-2 text-mute">
                        {un[m.id] ? (
                          <span className="text-bad">{un[m.id]}</span>
                        ) : cur ? (
                          [cur.miss.length ? "不能來：" + cur.miss.join("、") : "", cur.unk.length ? "沒回：" + cur.unk.join("、") : ""].filter(Boolean).join("；") || "都可以"
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <Notices D={D} R={R} />
    </>
  );
}

/* ───── 直接開會 ───── */
function Quick() {
  const x = useNx();
  const io = useIep();
  const D = x.D!;
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
      if (!s || s.caseMgr !== x.tid) {
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
          <Notices D={D} R={R} />
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

/* ───── 頁面 ───── */
function MyIep() {
  const x = useNx();
  const io = useIep();
  const q = useQuery();
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>((q.get("tab") as Tab) || "inv");
  const [pick, setPick] = useState(q.get("r") || "");
  const [step, setStep] = useState(1);
  const D = x.D!;
  const rounds = IEP.ownRounds(D, x.tid, 0);
  const cur = rounds.find((r) => r.id === pick) || rounds[rounds.length - 1] || null;
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace("/me/iep/?tab=" + t + (cur && t !== "inv" && t !== "quick" ? "&r=" + encodeURIComponent(cur.id) : ""), { scroll: false });
  };

  // 填空堂的回覆讀回自己的調查單（比上次新的才收）
  const merging = useRef(false);
  useEffect(() => {
    if (io.ro || merging.current) return;
    const inv = x.data!.records.iepInvite;
    const D2 = toCoreD(x.data!.records);
    const todo = IEP.ownRounds(D2, x.tid).filter((R) => mergeInvites(D2, R, inv) > 0);
    if (!todo.length) return;
    merging.current = true;
    (async () => {
      for (const R of todo) await io.save(D2, R);
    })().finally(() => (merging.current = false));
  }, [x.data, x.tid, io]);

  const newRound = async () => {
    const R = await io.create((d) => {
      const r = IEP.newRoundAs(d, x.tid, { name: "IEP 會議時間調查" });
      r.kind = IEP.KINDS[0];
      r.priv = "cls";
      r.ps = d.periods.filter((p) => !p.extra).map((p) => p.id);
      return r;
    });
    if (R) {
      setPick(R.id);
      setStep(1);
      if (tab !== "survey") setTab("survey");
    }
  };
  const delRound = async () => {
    if (!cur || !confirm("刪除「" + (cur.name || "這次調查") + "」？出席名單和回覆都會刪掉。")) return;
    if ((cur.pub || []).length && !x.demo) {
      const { closeOnline } = await import("@/lib/nx/iepOnline");
      try {
        await closeOnline(x.scope!, cur);
      } catch (e) {
        if (!confirm("線上連結沒有關掉（" + failText(e) + "），連結會到期限才失效。仍要刪除嗎？")) return;
      }
    }
    if (await io.remove(cur.id)) {
      setPick("");
      toast("已刪除");
    }
  };

  return (
    <div>
      <h1 className="no-print mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">我的 IEP</h1>
      <div className="no-print mb-5">
        <Seg<Tab> label="分頁" value={tab} options={TABS} onChange={setTab} />
      </div>
      {tab === "inv" && <Inv />}
      {(tab === "survey" || tab === "plan") && (
        <>
          <Picker rounds={rounds} cur={cur} onPick={setPick} onNew={newRound} onDel={delRound} />
          {!cur ? (
            <Empty action={<Button tone="primary" onClick={newRound}>新增調查</Button>}>還沒有調查</Empty>
          ) : tab === "survey" ? (
            <Survey key={cur.id} R={cur} D={D} step={step} setStep={setStep} />
          ) : (
            <Plan key={cur.id} R={cur} D={D} goSurvey={() => (setStep(1), setTab("survey"))} />
          )}
        </>
      )}
      {tab === "quick" && <Quick />}
    </div>
  );
}

export default function IepPage() {
  return (
    <TeacherShell title="我的 IEP">
      <MyIep />
    </TeacherShell>
  );
}

"use client";
/* 我的 IEP（舊版 iep.js 的「我的 IEP」，老師只動自己個管的學生）：
     填空堂     別人（或自己）開的調查邀請我：點有空的節次送出（iepInvite，只改得到自己的回覆）
     我的調查   建立調查（一個畫面：學生、日期、節次、期限、挑時段）→ 建立並產生 QR；
                一次調查一頁：QR 與連結（印 QR 小單、複製全部連結、每個人的狀態、填空堂）→ ①回覆 ②排定 ③通知（和舊版一模一樣）
     直接開會   已經知道時間：選學生、日期時間地點，帶入名單、印通知
   舊網址 ?tab=plan 會到「我的調查」並捲到 ② 排定。 */
import { Printer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Create } from "@/components/iep/Create";
import { PeopleEditor } from "@/components/iep/PeopleEditor";
import { NoticeOpts, RoundPage, usePer } from "@/components/iep/RoundPage";
import { useIep } from "@/components/iep/useIep";
import { failText, toast } from "@/components/Toast";
import { TeacherShell } from "@/components/TeacherShell";
import { Badge, Button, Card, Empty, Input, Seg, Select, SectionTitle, cx } from "@/components/ui";
import { IEP, type Round } from "@/lib/iep";
import { NX } from "@/lib/legacy";
import type { IepInviteDoc } from "@/lib/model";
import { useQuery } from "@/lib/nx/hooks";
import { closeOnline, publish } from "@/lib/nx/iepOnline";
import { noticesHtml, type PrintOpt } from "@/lib/nx/iepPrint";
import { mergeInvites } from "@/lib/nx/iepSync";
import { useNx } from "@/lib/nx/session";
import { ymd } from "@/lib/nx/today";
import { revKey, toCoreD } from "@/lib/repo";
import type { RcData } from "@/lib/types";

type Tab = "inv" | "survey" | "quick";
const TABS: [Tab, string][] = [
  ["inv", "填空堂"],
  ["survey", "我的調查"],
  ["quick", "直接開會"],
];

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
                  return (
                    <td key={k}>
                      <button
                        type="button"
                        className={cx("c", on ? "y" : "")}
                        aria-pressed={on}
                        aria-label={IEP.fmtDate(d) + p.n}
                        disabled={ro}
                        onClick={() => {
                          const n = new Set(free);
                          if (on) n.delete(k);
                          else n.add(k);
                          setFree(n);
                        }}
                      >
                        {on ? "○" : ""}
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

/* ───── 共用：選調查 ───── */
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
      <Button onClick={onNew}>建立調查</Button>
      {cur && (
        <Button tone="danger" onClick={onDel}>
          <Trash2 size={15} />
          刪除
        </Button>
      )}
    </div>
  );
}

/* ───── 開會通知（直接開會） ───── */
function Notices({ D, R }: { D: RcData; R: Round }) {
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
          <div id="outArea" dangerouslySetInnerHTML={{ __html: noticesHtml(D, R, { ...o, per, host: IEP.hostLabel(D, R) }) }} />
        </>
      )}
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
  const t0 = q.get("tab");
  const [tab, setTabState] = useState<Tab>(t0 === "plan" ? "survey" : (t0 as Tab) || "inv");
  const [jump] = useState(t0 === "plan" ? "iepPlan" : "");
  const [pick, setPick] = useState(q.get("r") || "");
  const [creating, setCreating] = useState(false);
  const pending = useRef("");
  const [tick, setTick] = useState(0);
  const D = x.D!;
  const rounds = IEP.ownRounds(D, x.tid, 0);
  const cur = rounds.find((r) => r.id === pick) || rounds[rounds.length - 1] || null;
  const online = !x.demo && !!x.user && !io.ro;
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace("/me/iep/?tab=" + t + (cur && t === "survey" ? "&r=" + encodeURIComponent(cur.id) : ""), { scroll: false });
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

  // 「建立並產生 QR」：調查單存好、讀回來之後才發布（nxIepPublish 要檢查這份調查單的 readers）
  useEffect(() => {
    const rid = pending.current;
    if (!rid || !x.data!.records.iep[rid]) return;
    pending.current = "";
    io.edit(rid, async (d, r) => {
      if (!r.slots.length || !r.meets.length) return false;
      if (IEP.expMs(r) < Date.now()) {
        toast("回覆期限已過，請先改期限");
        return false;
      }
      const n = await publish(x.scope!, d, r);
      toast("已發布 " + n + " 份");
    }).catch((e) => toast(failText(e)));
  }, [x.data, x.scope, io, tick]);

  const delRound = async () => {
    if (!cur || !confirm("刪除「" + (cur.name || "這次調查") + "」？出席名單和回覆都會刪掉。")) return;
    if ((cur.pub || []).length && !x.demo) {
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
      {tab === "survey" &&
        (creating || !cur ? (
          <Create
            online={online}
            canCancel={!!cur}
            onCancel={() => setCreating(false)}
            onCreated={(R, cut) => {
              setPick(R.id);
              setCreating(false);
              if (!R.slots.length) toast("沒有可以問的時段，請調整日期或節次");
              else {
                if (cut) toast("已排除有課的 " + cut + " 節");
                if (online) {
                  pending.current = R.id;
                  setTick(tick + 1);
                }
              }
            }}
          />
        ) : (
          <>
            <Picker rounds={rounds} cur={cur} onPick={setPick} onNew={() => setCreating(true)} onDel={delRound} />
            <RoundPage key={cur.id} R={cur} D={D} jump={jump} />
          </>
        ))}
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

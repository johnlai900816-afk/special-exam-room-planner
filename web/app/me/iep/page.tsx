"use client";
/* 我的 IEP（舊版 iep.js 的「我的 IEP」，老師只動自己個管的學生）：
     填空堂     別人（或自己）開的調查邀請我：點有空的節次送出（iepInvite，只改得到自己的回覆）
     我的調查   建立調查（一個畫面：學生、日期、節次、期限、挑時段）→ 建立並產生 QR；
                一次調查一頁：QR 與連結（印 QR 小單、複製全部連結、每個人的狀態、填空堂）→ ①回覆 ②排定 ③通知（和舊版一模一樣）
     直接開會   已經知道時間：選學生、日期時間地點，帶入名單、印通知
   舊網址 ?tab=plan 會到「我的調查」並捲到 ② 排定。 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Quick } from "@/components/iep/Quick";
import { Surveys } from "@/components/iep/Surveys";
import { failText, toast } from "@/components/Toast";
import { TeacherShell } from "@/components/TeacherShell";
import { Badge, Button, Card, Empty, Input, Seg, cx } from "@/components/ui";
import { IEP } from "@/lib/iep";
import { NX } from "@/lib/legacy";
import type { IepInviteDoc } from "@/lib/model";
import { useQuery } from "@/lib/nx/hooks";
import { useNx } from "@/lib/nx/session";
import { ymd } from "@/lib/nx/today";
import { revKey } from "@/lib/repo";

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

/* ───── 頁面 ───── */
function MyIep() {
  const q = useQuery();
  const router = useRouter();
  const t0 = q.get("tab");
  const [tab, setTabState] = useState<Tab>(t0 === "plan" ? "survey" : (t0 as Tab) || "inv");
  const [jump] = useState(t0 === "plan" ? "iepPlan" : "");
  const [pick, setPick] = useState(q.get("r") || "");
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace("/me/iep/?tab=" + t + (pick && t === "survey" ? "&r=" + encodeURIComponent(pick) : ""), { scroll: false });
  };
  return (
    <div>
      <h1 className="no-print mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">我的 IEP</h1>
      <div className="no-print mb-5">
        <Seg<Tab> label="分頁" value={tab} options={TABS} onChange={setTab} />
      </div>
      {tab === "inv" && <Inv />}
      {tab === "survey" && <Surveys pick={pick} setPick={setPick} jump={jump} />}
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

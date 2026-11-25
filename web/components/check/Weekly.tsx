"use client";
/* 導師週報（舊版 extras.js weeklyPage）：那一週（週一～週五）每一班被抽出去上課的學生與出缺席，
   每一班一份可以複製的草稿（用 LINE 傳給導師）、用 AI 潤飾（姓名換成代號 → 先看要送出的全文 → 按「送出」才送 → 回來換回名字）、
   這一週「已發送」（舊版 D.weekly[週一]，新版在 staff/legacy；過渡期要 native 有 staff 才能改）。
   計算是 core.js weeklySummary／weeklyText（lib/nx/checkin.ts weeklyOf：點名文件先組回舊的一天一份格式）。 */
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { AiSetup } from "@/components/sched/AiDialogs";
import { Badge, Button, Card, Empty, Input, Textarea, cx } from "@/components/ui";
import { aiAsk, aiMsg, GEMINI, wireAi, type AiReq } from "@/lib/ai";
import { setWeeklySent, weeklyAiRequest, weeklyAiRestore, weeklyOf, weeklySent, weeklyText, weekStartOf, type WeekClass, type Weekly as W } from "@/lib/nx/checkin";
import { useNow, useQuery } from "@/lib/nx/hooks";
import { addDays, ymd } from "@/lib/nx/today";
import { copyText } from "../admin/common";

const ST: Record<string, string> = { late: "遲到", leave: "請假", abs: "缺席" };
const STA: Record<string, string> = { in: "已到", late: "遲到", leave: "請假", abs: "缺席" };
const md = (s: string) => {
  const m = String(s || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? +m[1] + "/" + +m[2] : String(s || "");
};
const pad = (n: string | number) => String(n).padStart(2, "0");

/** 用 AI 潤飾的一班：預覽要送出的內容（姓名已換成代號）→ 送出 → 換回名字 */
function Polish({ c, text, onDone, onClose }: { c: WeekClass; text: string; onDone(t: string): void; onClose(): void }) {
  const { D } = useAdmin();
  const [st, setSt] = useState<{ text: string; bad?: boolean }>({ text: "" });
  const [busy, setBusy] = useState(false);
  const [, setN] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  wireAi();
  const ready = GEMINI.ready();
  const { req, pairs } = useMemo(() => weeklyAiRequest(D, c, text, GEMINI.namesOk()), [D, c, text]);
  const send = async () => {
    ctl.current = new AbortController();
    setBusy(true);
    setSt({ text: "Gemini 想想看…" });
    try {
      const r = await aiAsk("weekly", { ...(req as AiReq), temperature: 0.4 }, ctl.current.signal, (m) => setSt({ text: m }));
      onDone(weeklyAiRestore(D, r.text, pairs));
    } catch (e) {
      setSt({ text: aiMsg(e), bad: (e as { code?: string }).code !== "cancel" });
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  };
  return (
    <div className="mt-3 rounded-xl border border-line2 bg-sunk p-3">
      {!ready ? (
        <AiSetup what="就可以用 AI 潤飾週報" onReady={() => setN((n) => n + 1)} />
      ) : (
        <>
          <b>會送給 Gemini 的內容</b>
          <p className="my-1 text-sm text-mute">姓名已換成代號{req.scrubbed ? "（另外換掉 " + req.scrubbed + " 處）" : ""}。確認沒有不該送的資料再按「送出」。</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-card p-2 text-[13px] whitespace-pre-wrap">{req.prompt}</pre>
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {ready && (
          <Button tone="primary" disabled={busy} onClick={send}>
            送出
          </Button>
        )}
        <Button
          onClick={() => {
            ctl.current?.abort();
            onClose();
          }}
        >
          不要送
        </Button>
        {st.text && <span className={cx("text-sm", st.bad ? "text-bad" : "text-mute")}>{st.text}</span>}
      </div>
    </div>
  );
}

function ClassCard({ no, W, c, draft, setDraft, canAi }: { no: number; W: W; c: WeekClass; draft: string | undefined; setDraft(v: string | undefined): void; canAi: boolean }) {
  const [ai, setAi] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const txt = draft ?? weeklyText(W, c, "資源班");
  return (
    <Card
      className="mb-4"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold tracking-[0.08em] text-red tabular-nums">{pad(no)}</span>
          {c.cls} 班 {c.head ? <Badge>導師 {c.head}</Badge> : <Badge tone="warn">還沒填導師</Badge>}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead className="bg-sunk text-[13px] text-mute">
            <tr>
              <th className="px-2.5 py-2 text-left font-semibold">學生</th>
              {["節數", "出席", "遲到", "請假", "缺席", "未點名"].map((h) => (
                <th key={h} className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="px-2.5 py-2 text-left font-semibold">特別的事</th>
            </tr>
          </thead>
          <tbody>
            {c.students.map((s) => {
              const x = s.c;
              const notes = s.rows.filter((r) => r.note || r.st === "late" || r.st === "abs" || r.st === "leave");
              return (
                <tr key={s.id} className="border-t border-line tabular-nums">
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    {s.seat ? pad(s.seat) + " " : ""}
                    {s.name}
                  </td>
                  <td className="px-2.5 py-2 text-right">{x.n}</td>
                  <td className="px-2.5 py-2 text-right">{x.in}</td>
                  <td className="px-2.5 py-2 text-right">{x.late || ""}</td>
                  <td className="px-2.5 py-2 text-right">{x.leave || ""}</td>
                  <td className="px-2.5 py-2 text-right font-bold text-bad">{x.abs || ""}</td>
                  <td className="px-2.5 py-2 text-right text-mute">{x.none || ""}</td>
                  <td className="min-w-[180px] px-2.5 py-2">
                    {notes.map((r, i) => (
                      <div key={i}>{md(r.date) + " " + r.pname + " " + (ST[r.st] || "") + (r.note ? " " + r.note : "")}</div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="mt-2">
        <summary className="flex min-h-8 cursor-pointer items-center text-sm text-blue">逐節明細</summary>
        <ul className="mt-1 flex flex-col divide-y divide-line">
          {c.students.map((s) => (
            <li key={s.id} className="py-2">
              <b>{s.name}</b>
              <small className="block text-sm text-mute">
                {s.rows.map((r) => md(r.date) + " " + r.pname + " " + (r.gname || r.subject) + " " + (r.future ? "還沒上" : STA[r.st] || "未點名")).join("、")}
              </small>
            </li>
          ))}
        </ul>
      </details>
      <Textarea ref={ta} className="mt-3 min-h-[150px] w-full leading-relaxed" aria-label={c.cls + " 班的週報草稿"} value={txt} onChange={(e) => setDraft(e.target.value)} />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => copyText(txt, ta.current)}>複製</Button>
        {canAi && (
          <Button onClick={() => setAi(true)} disabled={ai}>
            <Sparkles size={16} />用 AI 潤飾
          </Button>
        )}
        {draft != null && <Button onClick={() => setDraft(undefined)}>還原草稿</Button>}
      </div>
      {ai && (
        <Polish
          c={c}
          text={txt}
          onClose={() => setAi(false)}
          onDone={(t) => {
            setDraft(t);
            setAi(false);
          }}
        />
      )}
    </Card>
  );
}

export function Weekly() {
  const { R, D, board, ro } = useAdmin();
  const q = useQuery();
  const now = useNow(60000);
  const today = ymd(now);
  const { busy, edit } = useApply();
  const [ws, setWs] = useState(() => weekStartOf(q.get("w") || addDays(ymd(new Date()), -7)));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const W = useMemo(() => (board ? weeklyOf(D, R.attendance, ws, today, board) : null), [D, R.attendance, ws, today, board]);
  const sent = weeklySent(D, ws);
  const canSent = !ro("staff");
  if (!board || !W) return <Empty>還沒有正式課表。</Empty>;
  const we = addDays(ws, 4);
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button aria-label="上一週" onClick={() => setWs(weekStartOf(addDays(ws, -7)))}>
          <ChevronLeft size={16} />
          上一週
        </Button>
        <Input type="date" aria-label="選一週" value={ws} onChange={(e) => e.target.value && setWs(weekStartOf(e.target.value))} />
        <Button aria-label="下一週" onClick={() => setWs(weekStartOf(addDays(ws, 7)))}>
          下一週
          <ChevronRight size={16} />
        </Button>
        <b className="tabular-nums">
          {md(ws)}～{md(we)}
        </b>
        {sent && <Badge tone="ok">已發送</Badge>}
        <span className="grow" />
        {canSent &&
          (sent ? (
            <Button disabled={busy} onClick={() => edit((d) => setWeeklySent(d, ws, false), "已改成還沒發")}>
              改成還沒發
            </Button>
          ) : (
            <Button tone="primary" disabled={busy} onClick={() => edit((d) => setWeeklySent(d, ws, true), "已標記為已發送")}>
              已發送
            </Button>
          ))}
      </div>
      {!W.classes.length ? (
        <Empty>{board.placed ? "這一週沒有抽離課。" : "還沒有正式課表。"}</Empty>
      ) : (
        W.classes.map((c, i) => {
          const k = ws + "|" + c.cls;
          return (
            <ClassCard
              key={k}
              no={i + 1}
              W={W}
              c={c}
              draft={drafts[k]}
              canAi
              setDraft={(v) =>
                setDrafts((o) => {
                  const n = { ...o };
                  if (v == null) delete n[k];
                  else n[k] = v;
                  return n;
                })
              }
            />
          );
        })
      )}
    </div>
  );
}

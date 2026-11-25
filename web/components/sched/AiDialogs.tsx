"use client";
/* 排課的 AI 功能（舊版 app.js 的 Gemini 區塊）：用 AI 排（直接請 Gemini，或複製題目貼給別的 AI 再貼回來）、用文字調整、說明問題。
   題目、檢查、去識別化都在 repo 根目錄的 ai.js；連線在 gemini.js（lib/ai.ts 接上 Firebase 登入，代理模式呼叫已部署的 aiGenerate／aiListModels）。
   本機的排課程式是裁判：AI 的排法先用 schedCheck／schedJudge 比過，比現在好才能放進草稿；文字調整逐項勾選才套用。 */
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { Button, Input, Textarea } from "@/components/ui";
import { AI, AI_KIND, aiAsk, aiModeText, aiMsg, GEMINI, wireAi, type AdjItem, type AiReq, type SchedCheck } from "@/lib/ai";
import { CORE, type Model, type Problem, type SolveState } from "@/lib/core";
import { commitD, setDraftD, stateOf, X } from "@/lib/nx/sched";
import type { RcData } from "@/lib/types";
import { Dialog, useSched } from "./common";

interface P {
  M: Model;
  ST: SolveState;
  onClose: () => void;
}

/** 送出前的預覽、送出、取消（舊版 gmPreview＋gmAsk＋gmBar） */
function useAsk() {
  const [st, setSt] = useState<{ text: string; bad?: boolean }>({ text: "" });
  const [prev, setPrev] = useState<{ kind: string; req: AiReq; done: (ok: boolean) => void } | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => ctl.current?.abort(), []);
  async function ask(kind: string, req: AiReq, msg?: string) {
    if (!GEMINI.seen(kind)) {
      const ok = await new Promise<boolean>((done) => setPrev({ kind, req, done }));
      setPrev(null);
      if (!ok) {
        setSt({ text: "沒有送出" });
        return null;
      }
      GEMINI.setSeen(kind);
    }
    ctl.current?.abort();
    ctl.current = new AbortController();
    setBusy(true);
    setSt({ text: msg || "Gemini 想想看…" });
    try {
      const r = await aiAsk(kind, req, ctl.current.signal, (m) => setSt({ text: m }));
      setSt({ text: "" });
      return r;
    } catch (e) {
      setSt({ text: aiMsg(e), bad: (e as { code?: string }).code !== "cancel" });
      return null;
    } finally {
      ctl.current = null;
      setBusy(false);
    }
  }
  const view = (
    <>
      {prev && (
        <div className="my-3 rounded-xl border border-line2 bg-sunk p-3">
          <b>第一次使用「{AI_KIND[prev.kind]}」：下面是會送給 Gemini 的全部內容</b>
          <p className="my-1 text-sm text-mute">
            學生姓名一律換成代號{GEMINI.namesOk() ? "；你已同意送出老師姓名" : "，老師姓名也換成代號"}
            {prev.req.scrubbed ? "（這次換掉 " + prev.req.scrubbed + " 處）" : ""}。確認沒有不該送的資料再按「送出」。
          </p>
          <pre className="max-h-60 overflow-auto rounded-lg bg-card p-2 text-xs whitespace-pre-wrap">{(prev.req.system ? "【系統說明】\n" + prev.req.system + "\n\n" : "") + prev.req.prompt}</pre>
          <div className="mt-2 flex gap-2">
            <Button tone="primary" onClick={() => prev.done(true)}>
              送出
            </Button>
            <Button onClick={() => prev.done(false)}>不要送</Button>
          </div>
        </div>
      )}
      {st.text && <p className={st.bad ? "my-2 text-sm text-bad" : "my-2 text-sm text-mute"}>{st.text}</p>}
    </>
  );
  return { ask, view, busy, cancel: () => ctl.current?.abort(), setSt };
}

function Notice({ what }: { what: string }) {
  return (
    <p className="mt-3 text-[13px] text-mute">
      資料會送到 Google 的 Gemini 處理（{aiModeText()}）。{what}
      {GEMINI.getMode() === "browser" ? "用自己的金鑰時，免費方案的內容可能被 Google 用來改進服務；正式的學生資料請用學校的 AI 服務或付費金鑰。" : ""}
    </p>
  );
}

/** 還沒接上 Gemini：在這裡設定連線方式（舊版 設定 › AI 的精簡版；設定只存在這台瀏覽器） */
export function AiSetup({ what, onReady }: { what: string; onReady: () => void }) {
  const [mode, setMode] = useState(GEMINI.getMode());
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="rounded-xl border border-line bg-sunk p-3 text-sm">
      <p className="mb-2">接上 Gemini 之後，{what}。</p>
      <div className="mb-2 flex flex-wrap gap-4">
        {(["proxy", "browser"] as const).map((m) => (
          <label key={m} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="aiMode"
              checked={mode === m}
              onChange={() => {
                GEMINI.setMode(m);
                setMode(m);
              }}
            />
            {m === "proxy" ? "學校的 AI 服務（要登入）" : "自己的金鑰"}
          </label>
        ))}
      </div>
      {mode === "browser" && (
        <Input type="password" className="mb-2 w-full" placeholder="貼上 Gemini API 金鑰" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Gemini API 金鑰" />
      )}
      <Button
        size="sm"
        onClick={async () => {
          wireAi();
          if (mode === "browser") {
            if (!key.trim()) return setMsg("請先貼上金鑰");
            GEMINI.setKey(key.trim());
          }
          setMsg("測試中…");
          try {
            const r = await GEMINI.test();
            if (r.err) throw r.err;
            setMsg("可以用了（" + r.model + "）");
            onReady();
          } catch (e) {
            setMsg(aiMsg(e));
          }
        }}
      >
        測試連線
      </Button>
      {msg && <span className="ml-2 text-mute">{msg}</span>}
    </div>
  );
}
function useReady() {
  const [n, setN] = useState(0);
  wireAi();
  return { ready: GEMINI.ready(), again: () => setN(n + 1) };
}

/* ───── 用 AI 排（舊版 aiOpen＋gmSched＋gmOffer＋gmSchedApply） ───── */
export function AiSchedDialog({ M, ST, onClose }: P) {
  const { D, edit, canEdit } = useSched();
  const A = useAsk();
  const R = useReady();
  const [fix, setFix] = useState(true);
  const [res, setRes] = useState<{ K: SchedCheck; slot: Int16Array; moved: number; v?: string; J: ReturnType<typeof AI.schedJudge>; logId?: string; D0: RcData } | { err: string } | null>(null);
  const [paste, setPaste] = useState("");
  const [copied, setCopied] = useState<{ v: string } | null>(null);

  const offer = (D0: RcData, reply: unknown, v: string | undefined, fx: boolean, logId?: string) => {
    let K: SchedCheck;
    try {
      K = AI.schedCheck(D0, reply, v);
    } catch (e) {
      const x = e as { code?: string; message?: string };
      setRes({ err: x.code === "stale" ? String(x.message) : "看不懂這份排法：" + (x.message || e) });
      if (logId) GEMINI.logUpdate(logId, { error: "無法套用：" + (x.message || e) });
      return;
    }
    let slot = K.S.slot,
      moved = 0;
    if (fx && K.viol) {
      const r = AI.schedRepair(K.M, K.S, K.out, { seed: (D.settings.seed as number) || 1 });
      slot = r.slot;
      moved = r.moved;
    }
    const J = AI.schedJudge(M, ST.slot, K.M, slot);
    setRes({ K, slot, moved, v, J, logId, D0 });
    if (logId) GEMINI.logUpdate(logId, { judged: J.ok ? "比現在好" : "不採用：" + J.why.join("；") });
  };
  const go = async () => {
    if (!M.L.length) return toast("還沒有要排的課");
    const D0 = JSON.parse(JSON.stringify(D)) as RcData,
      req = AI.schedRequest(D0, { names: GEMINI.namesOk() });
    setRes(null);
    const r = await A.ask("sched", req, "Gemini 排課中（題目 " + req.prompt.length + " 字）；pro 類的模型可能要想一兩分鐘…");
    if (!r) return;
    offer(D0, r.json, req.v, fix, r.logId);
  };
  const apply = async () => {
    if (!res || "err" in res) return;
    if ((X.aiProblem(D) as { v: string }).v !== res.v) return toast("資料在等待的時候被改過了，請重新請 AI 排");
    const diff = AI.schedDiff(D, M, ST.slot, res.K.X, res.slot);
    const { K, slot, logId } = res;
    onClose();
    const ok = await edit(
      (D1) => {
        K.X.groups.forEach((g) => {
          const d = D1.groups.find((x) => x.id === g.id);
          if (d) d.students = g.students.slice();
        });
        setDraftD(D1, Int16Array.from(slot), "AI 排課", Date.now());
      },
      "AI 的排法放進試排了",
      { undo: true },
    );
    if (ok !== undefined && logId) GEMINI.logUpdate(logId, { applied: diff + "（放進試排）" });
  };
  return (
    <Dialog title="用 AI 排課" wide onClose={onClose} foot={<Button onClick={onClose}>關閉</Button>}>
      {R.ready ? (
        <div className="mb-4 rounded-xl border border-line p-3">
          <b>直接請 Gemini 提一份排法（{GEMINI.getModel() || "預設模型"}）</b>
          <p className="my-1 text-sm text-mute">按一下就送出，不用複製貼上。回來的排法會先用系統的衝堂檢查比過：衝突沒有變多、而且比現在的好，才會讓你放進試排；不然會說明為什麼不採用。</p>
          <label className="my-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fix} onChange={(e) => setFix(e.target.checked)} /> Gemini 排好的先保留，衝突的那幾節交給系統修
          </label>
          <div className="flex gap-2">
            <Button tone="primary" disabled={A.busy || !canEdit} onClick={go}>
              請 Gemini 排
            </Button>
            {A.busy && <Button onClick={A.cancel}>取消</Button>}
          </div>
          {A.view}
          <Notice what="學生、老師都換成代號，不送姓名。" />
        </div>
      ) : (
        <div className="mb-4">
          <AiSetup what="可以按一下直接請 AI 排，不用複製貼上" onReady={R.again} />
        </div>
      )}
      <h4 className="mb-1 font-bold">或用複製貼上</h4>
      <p className="mb-2 text-sm text-mute">複製題目貼給 AI，再把回覆貼回來。人名都換成代號（S1、T1…）。</p>
      <div className="mb-2 flex gap-2">
        <Button
          onClick={() => {
            const t = X.aiPrompt(D) as string;
            setCopied({ v: (X.aiProblem(D) as { v: string }).v });
            navigator.clipboard?.writeText(t).then(
              () => toast("已複製題目"),
              () => {
                setPaste(t);
                toast("請手動複製下面的文字");
              },
            );
          }}
        >
          ① 複製題目
        </Button>
      </div>
      <Textarea className="mb-2 h-32 w-full" placeholder="② 貼上 AI 的回覆" value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="AI 的回覆" />
      <Button
        disabled={!canEdit}
        onClick={() => {
          if (!paste.trim()) return toast("先貼上 AI 的回覆");
          wireAi();
          const id = GEMINI.logAdd({ kind: "paste", model: "外部 AI", mode: "paste", prompt: "（複製出去的題目，版本 " + (copied?.v || "不明") + "）", reply: paste });
          offer(JSON.parse(JSON.stringify(D)), paste, copied?.v, true, id);
        }}
      >
        ③ 檢查
      </Button>
      {res && "err" in res && <div className="mt-3 rounded-lg bg-warn-l px-3 py-2 text-sm text-warn">{res.err}</div>}
      {res && !("err" in res) && (
        <div className={"mt-3 rounded-lg px-3 py-2 text-sm " + (res.J.ok ? "bg-ok-l text-ok" : "bg-warn-l text-warn")}>
          {(() => {
            const { K, J, moved, D0 } = res,
              badN = K.out.filter((o) => o.k !== "un").length,
              tot = K.M.L.length;
            return (
              <>
                <div>
                  AI 排了 {tot - K.un} / {tot} 節{badN ? "，其中 " + badN + " 個衝突" : "，沒有衝突"}
                  {K.un ? "，" + K.un + " 節沒排" : ""}；新編入 {K.r.members} 人次。
                </div>
                {K.r.bad.length > 0 && (
                  <details>
                    <summary>有 {K.r.bad.length} 項不符合規則，沒有採用</summary>
                    <ul>
                      {K.r.bad.slice(0, 40).map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {moved > 0 && <div>系統修改了 {moved} 節衝突的課。</div>}
                <div>
                  和現在比：問題 {J.cand.viol}（現在 {J.cur.viol}）、待安排的學生 {J.cand.pend} 人次（現在 {J.cur.pend}）、分數 {J.cand.cost.toFixed(1)}（現在 {J.cur.cost.toFixed(1)}，越小越好）
                  {K.M.flex ? "、鎖不到課 " + J.cand.open + "（現在 " + J.cur.open + "）" : ""}。
                </div>
                {K.note && <div className="text-mute">AI 的說明：{AI.unscrub(D0, K.note)}</div>}
                {!J.ok && <div className="text-bad">不採用：{J.why.join("；")}。目前的課表不會被改動。</div>}
                {J.ok && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button tone="primary" disabled={!canEdit} onClick={apply}>
                      放進試排
                    </Button>
                    <span className="text-mute">放進試排後可以和目前的課表比較，再決定要不要確定。</span>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </Dialog>
  );
}

/* ───── 用文字調整（舊版 gmAdjOpen／gmAdjAsk／gmAdjApply） ───── */
export function AiAdjDialog({ M, ST, onClose }: P) {
  const { D, edit, canEdit } = useSched();
  const A = useAsk();
  const R = useReady();
  const [txt, setTxt] = useState("");
  const [res, setRes] = useState<{ reply?: string; items: AdjItem[]; on: Set<number>; v: string; logId?: string } | null>(null);
  const go = async () => {
    if (!txt.trim()) return toast("請先寫下想怎麼改");
    if (A.busy) return;
    const v = (X.aiProblem(D) as { v: string }).v,
      req = AI.adjRequest(D, M, ST, txt, { names: GEMINI.namesOk() });
    setRes(null);
    const r = await A.ask("adj", req);
    if (!r) return;
    if ((X.aiProblem(D) as { v: string }).v !== v) return A.setSt({ text: "等待的時候課表被改過了，請再按一次", bad: true });
    const items = AI.adjCheck(D, M, ST, r.json.actions, req.said);
    setRes({ reply: r.json.reply, items, on: new Set(items.map((it, i) => (it.ok ? i : -1)).filter((i) => i >= 0)), v, logId: r.logId });
  };
  const apply = async () => {
    if (!res) return;
    if ((X.aiProblem(D) as { v: string }).v !== res.v) return toast("課表被改過了，請再請 AI 整理一次");
    const pick = res.items.filter((it, i) => res.on.has(i) && it.ok);
    if (!pick.length) return toast("沒有勾選要套用的");
    onClose();
    // 先改不排課時段、教室，重新整理後再移課（有草稿時移的是草稿）
    const n = await edit(
      (D1) => {
        const ops = AI.adjApply(D1, pick.map((it) => it.act));
        const M1 = CORE.compile(D1);
        const S1 = stateOf(M1, D1, true);
        const k = ops.length ? AI.adjLessons(M1, S1, ops) : 0;
        commitD(D1, M1, S1, true);
        return k;
      },
      (k) => "已套用 " + pick.length + " 項" + (k ? "（動到 " + k + " 節）" : ""),
      { undo: true },
    );
    if (n !== undefined && res.logId) GEMINI.logUpdate(res.logId, { applied: pick.map((it) => it.text).join("；") });
  };
  return (
    <Dialog title="用文字加限制、調整課表" wide onClose={onClose} foot={<Button onClick={onClose}>關閉</Button>}>
      <p className="mb-2 text-sm text-mute">
        例如「王老師週三下午不能排」「把七國移到早上」「八數固定用資源教室二」「701 週五第7節不要抽」，也可以貼一段會議紀錄。AI 會拆成一項一項，每一項附上原文是哪一句；系統檢查過後列給你逐項勾選，按「套用」才會改。
      </p>
      {R.ready ? (
        <>
          <Textarea
            className="h-28 w-full"
            placeholder="想怎麼改？可以貼一段會議紀錄（Ctrl+Enter 送出）"
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && go()}
            aria-label="想怎麼改"
          />
          <div className="mt-2 flex gap-2">
            <Button tone="primary" disabled={A.busy || !canEdit} onClick={go}>
              請 AI 整理
            </Button>
            {A.busy && <Button onClick={A.cancel}>取消</Button>}
          </div>
          {A.view}
          {res && (
            <div className="mt-3">
              {res.reply && <p className="mb-2">{AI.unscrub(D, res.reply)}</p>}
              {res.items.length ? (
                <ul className="flex flex-col gap-2">
                  {res.items.map((it, i) => (
                    <li key={i} className={it.ok ? "" : "text-mute"}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          disabled={!it.ok}
                          checked={res.on.has(i)}
                          onChange={(e) => {
                            const on = new Set(res.on);
                            if (e.target.checked) on.add(i);
                            else on.delete(i);
                            setRes({ ...res, on });
                          }}
                        />
                        <span>
                          {it.text}
                          {it.quote && <small className="block text-mute">原文：「{it.quote}」</small>}
                          {it.why && <small className="block">{it.why}</small>}
                          {it.warn && <small className="block text-warn">注意：{it.warn}</small>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-mute">AI 沒有整理出可以做的動作，換個說法試試。</p>
              )}
              {res.items.some((x) => x.ok) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button tone="primary" disabled={!canEdit} onClick={apply}>
                    套用勾選的
                  </Button>
                  <span className="text-sm text-mute">灰色的是找不到、或本來就是這樣的，不會套用。</span>
                </div>
              )}
            </div>
          )}
          <Notice what={"只送" + (GEMINI.namesOk() ? "老師名字" : "老師代號") + "、課名、教室和目前的時段，不送學生資料。"} />
        </>
      ) : (
        <AiSetup what="就可以用文字調整課表" onReady={R.again} />
      )}
    </Dialog>
  );
}

/* ───── 說明問題（舊版 gmExplain／gmExplainGo）：只說明，不改課表 ───── */
export function AiExplainDialog({ M, ST, onClose }: P) {
  const { D } = useSched();
  const A = useAsk();
  const R = useReady();
  const [res, setRes] = useState<{ summary: string; items: { course?: string; explain?: string; suggest?: string; options?: string[] }[]; byId: Record<string, { t: number; gi: number; slotName: string }> } | null>(null);
  const go = async () => {
    if (A.busy) return;
    const out: Problem[] = [];
    CORE.evaluate(M, ST.slot, out);
    if (!out.length) return A.setSt({ text: "現在沒有問題" });
    const req = AI.explainRequest(D, M, ST, out, { names: GEMINI.namesOk() });
    setRes(null);
    const r = await A.ask("explain", req);
    if (!r) return;
    const byId: Record<string, { t: number; gi: number; slotName: string }> = {};
    (req.options || []).forEach((o) => (byId[o.id] = o));
    setRes({ summary: String(r.json.summary || ""), items: r.json.items || [], byId });
    if (r.logId) GEMINI.logUpdate(r.logId, { applied: "（只有說明，沒有改課表）" });
  };
  const U = (t?: string) => AI.unscrub(D, t || "");
  return (
    <Dialog title="請 AI 說明排不開的原因" wide onClose={onClose} foot={<Button onClick={onClose}>關閉</Button>}>
      <p className="mb-2 text-sm text-mute">系統先算出「哪一位老師哪一節如果可以排，就多一個位置」，AI 只用這些選項用白話說明、建議先跟誰商量；不會改動課表。</p>
      {R.ready ? (
        <>
          <div className="flex gap-2">
            <Button tone="primary" disabled={A.busy} onClick={go}>
              請 AI 說明
            </Button>
            {A.busy && <Button onClick={A.cancel}>取消</Button>}
          </div>
          {A.view}
          {res && (
            <div className="mt-3">
              <p className="mb-2">{U(res.summary)}</p>
              <ul className="flex flex-col gap-2">
                {res.items.map((it, i) => (
                  <li key={i}>
                    <b>{U(it.course)}</b> {U(it.explain)}
                    {it.suggest && <small className="block">建議：{U(it.suggest)}</small>}
                    {(it.options || [])
                      .filter((id) => res.byId[id])
                      .map((id) => {
                        const o = res.byId[id];
                        return (
                          <small key={id} className="block text-mute">
                            系統算過：若 {D.teachers[o.t]?.name} {o.slotName} 可以排，{M.G[o.gi]?.name} 就多一個位置
                          </small>
                        );
                      })}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] text-mute">「系統算過」的選項是本機排課程式算出來的；AI 的說明僅供參考，要不要協商請自己判斷。</p>
            </div>
          )}
          <Notice what="只送課和老師的代號、時段與問題種類，不送姓名。" />
        </>
      ) : (
        <AiSetup what="可以請 AI 用白話說明排不開的原因" onReady={R.again} />
      )}
    </Dialog>
  );
}

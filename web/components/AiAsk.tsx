"use client";
/* AI 的共用畫面（原本在 components/sched/AiDialogs.tsx）：送出前的預覽（這台瀏覽器第一次送某一種內容時給看全文）、送出、取消、
   還沒接上 Gemini 時的設定、資料送到哪裡的說明；AiExplain＝「請 AI 說明」一個按鈕＋回來的文字（段考排考場、IEP 排定用）。
   送出的內容由呼叫的人先去識別化（學生姓名一律換成代號），這裡不改內容，只負責給人看、送出、把回覆換回名字後顯示。 */
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@/components/ui";
import { AI_KIND, aiAsk, aiModeText, aiMsg, GEMINI, wireAi, type AiReq } from "@/lib/ai";

/** 送出前的預覽、送出、取消（舊版 gmPreview＋gmAsk＋gmBar） */
export function useAiAsk() {
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

export function AiNotice({ what }: { what: string }) {
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
export function useAiReady() {
  const [n, setN] = useState(0);
  wireAi();
  return { ready: GEMINI.ready(), again: () => setN(n + 1) };
}


/** 「請 AI 說明」：按一下 → build() 做出要送的內容（已去識別化）→ 第一次先看全文 → 送出 → restore() 換回名字後顯示。不會改任何資料 */
export function AiExplain({ kind, what, build, label = "請 AI 說明" }: { kind: string; what: string; build: () => { req: AiReq; restore: (t: string) => string }; label?: string }) {
  const A = useAiAsk();
  const R = useAiReady();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const go = async () => {
    setOpen(true);
    if (!GEMINI.ready()) return;
    const b = build();
    setText("");
    const r = await A.ask(kind, b.req);
    if (r) setText(b.restore(r.text));
  };
  return (
    <>
      <Button size="sm" disabled={A.busy} onClick={go}>
        <Sparkles size={15} />
        {label}
      </Button>
      {open && (
        <div className="mt-2 w-full rounded-xl border border-line bg-card p-3 text-sm">
          {R.ready ? (
            <>
              {A.view}
              {A.busy && (
                <Button size="sm" onClick={A.cancel}>
                  取消
                </Button>
              )}
              {text && <div className="whitespace-pre-wrap text-ink">{text}</div>}
              {text && <p className="mt-2 text-[13px] text-mute">AI 的說明僅供參考，排法以畫面上的檢查為準。</p>}
              <AiNotice what={what} />
            </>
          ) : (
            <AiSetup what="可以請 AI 用白話說明" onReady={() => (R.again(), setTimeout(go, 0))} />
          )}
          <div className="mt-2 flex justify-end">
            <Button size="sm" tone="ghost" onClick={() => (A.cancel(), setOpen(false))}>
              關閉
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

"use client";
/* ② 全校課表（舊版 tt.js render＋app.js renderTT／readTT／ttApplyCS）：
   讀每班一頁的課表 PDF（掃描檔也可以）→ 每班一張格子（星期 × 節次 → 科目＋老師），存在 classes/{班級}.ttJson。
   - 用 AI：每一頁的圖送到 Gemini（lib/ai.ts，學校的 AI 服務或自己的金鑰），同時兩頁，失敗自動等一下再試，可以取消、重試沒讀到的
   - 離線辨識：文字 PDF 直接讀文字；掃描檔用 Tesseract 讀下方統計（準確度較低）
   - 核對：點班級打開格子（左邊是那一頁的圖），改完「儲存」或「接受，下一個」；名字一次改；全部接受
   - 和名冊對照、用課表更新任課老師（國英數理）
   純邏輯在 lib/nx/tt.ts（和舊版逐項比對：test/tt.test.ts）；寫回一律 planOnD → applyOps。
   讀圖的工作與圖片放在這個模組裡（換到別的步驟再回來還看得到進度與圖）；離開這一步會停下來，讀好的頁已經存了。 */
import { Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { AiSetup } from "@/components/sched/AiDialogs";
import { failText, toast } from "@/components/Toast";
import { Badge, Button, Card, Input, SectionTitle, cx } from "@/components/ui";
import { aiMsg, GEMINI, wireAi } from "@/lib/ai";
import { applyOps, planOnD } from "@/lib/nx/apply";
import {
  acceptAll,
  applyCS,
  applyGridEdit,
  C,
  cellOf,
  clearTT,
  clsSort,
  colSubj,
  csList,
  hints,
  keepName,
  nextPending,
  pend,
  pendingClasses,
  recheckAll,
  renameName,
  rosterCheck,
  runPages,
  saveSummary,
  storeOcr,
  storeRead,
  TT_COL,
  TTR,
  ttOf,
  type GridEdit,
  type SumRow,
  type TtPage,
} from "@/lib/nx/tt";
import { ocrPages, pagesOf } from "@/lib/nx/ttRead";
import { RevConflictError } from "@/lib/repo";
import type { RcData } from "@/lib/types";
import { GridDialog, RunDialog, SumDialog } from "./TtDialogs";

/* ───── 這次開著的網頁才有的東西：讀圖的工作、各班那一頁的圖 ───── */
interface Job {
  run: boolean;
  phase: "img" | "ask" | "run" | "";
  pages: TtPage[];
  err: string;
  stopped: boolean;
  ctl: AbortController | null;
}
interface Ocr {
  msg: string;
  done: number;
  total: number;
}
const S: { job: Job | null; ocr: Ocr | null; prev: boolean; ver: number } = { job: null, ocr: null, prev: false, ver: 0 };
const IMGS: Record<string, string> = {};
const subs = new Set<() => void>();
const bump = () => {
  S.ver++;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const th = "px-2 py-2 text-left text-[13px] font-normal text-mute whitespace-nowrap";
const td = "border-t border-line px-2 py-1.5 align-top";

function pageLab(p: TtPage) {
  return p.st === "done" ? "✓ " + p.cls : p.st === "fail" ? "✗ " + p.n : p.st === "run" ? "讀取中 " + p.n : p.st === "wait" ? "等一下 " + p.n : p.st === "skip" ? "沒讀 " + p.n : String(p.n);
}

export function TtStep() {
  const { D, R, revs, repo, ro } = useAdmin();
  const { busy, run, edit } = useApply();
  useSyncExternalStore(
    subscribe,
    () => S.ver,
    () => 0,
  );
  const lock = ro("classes");
  const file = useRef<HTMLInputElement>(null);
  const mode = useRef<"ai" | "ocr">("ai");
  const [, setN] = useState(0);
  const [dlg, setDlg] = useState<{ c: string; D: RcData; k: number } | null>(null);
  const [ask, setAsk] = useState<{ pages: TtPage[]; done: (ok: boolean) => void } | null>(null);
  const [ren, setRen] = useState<Record<string, string>>({});

  // 讀圖時寫回要用最新的資料（watch 會一直更新）；一次寫一份，被搶先就等一下用新的再算一次
  const live = useRef({ R, revs, repo });
  useEffect(() => {
    live.current = { R, revs, repo };
  });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  function writeLive(fn: (D: RcData) => unknown): Promise<void> {
    const p = queue.current.then(async () => {
      for (let i = 0; ; i++) {
        const L = live.current,
          pl = planOnD(L.R, fn);
        if (!pl.ops.set.length && !pl.ops.del.length) return;
        try {
          await applyOps(L.repo, pl.ops, L.revs);
          return;
        } catch (e) {
          if (!(e instanceof RevConflictError) || i >= 6) throw e;
          await sleep(300 * (i + 1));
        }
      }
    });
    queue.current = p.catch(() => {});
    return p;
  }
  // 離開這一步：讀圖停下來（讀好的頁已經存了，回來可以重試沒讀到的）
  useEffect(
    () => () => {
      S.job?.ctl?.abort();
    },
    [],
  );
  const working = !!S.job?.run || !!S.ocr;
  useEffect(() => {
    if (!working) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [working]);

  wireAi();
  const st: "off" | "names" | "on" = !GEMINI.ready() ? "off" : !GEMINI.namesOk() ? "names" : "on";
  const tt = ttOf(D);
  const cls = Object.keys(tt).sort(clsSort);
  const n = cls.reduce((a, c) => a + pend(c, tt[c]), 0);
  const names = useMemo(() => [...hints(D)].sort(), [D]);
  const L = useMemo(() => C.ttNameList(D, hints(D)), [D]);
  const rc = useMemo(() => rosterCheck(D), [D]);
  const stu = useMemo(
    () => D.students.slice().sort((a, b) => String(a.cls).localeCompare(String(b.cls)) || String(a.seat || "").localeCompare(String(b.seat || ""), undefined, { numeric: true })),
    [D.students],
  );

  /* ── 讀檔 ── */
  const pick = (m: "ai" | "ocr") => {
    mode.current = m;
    const i = file.current;
    if (!i) return;
    i.accept = m === "ai" ? ".pdf,application/pdf,image/png,image/jpeg" : ".pdf,application/pdf";
    i.click();
  };
  const onFiles = (fs: File[]) => {
    if (!fs.length) return;
    if (mode.current === "ai" && st === "on") void readAI(fs);
    else void readOcr(fs.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)));
  };
  async function readAI(files: File[]) {
    if (S.job?.run) return;
    const J: Job = { run: true, phase: "img", pages: [], err: "", stopped: false, ctl: null };
    S.job = J;
    bump();
    try {
      J.pages = await pagesOf(files);
    } catch (e) {
      S.job = null;
      bump();
      return toast("課表讀不出來：" + ((e as Error).message || e));
    }
    if (!J.pages.length) {
      S.job = null;
      return bump();
    }
    J.phase = "ask";
    bump();
    const ok = await new Promise<boolean>((done) => setAsk({ pages: J.pages, done }));
    setAsk(null);
    if (!ok) {
      S.job = null;
      return bump();
    }
    await runJob();
  }
  async function runJob() {
    const J = S.job;
    if (!J) return;
    const ctl = new AbortController();
    Object.assign(J, { run: true, phase: "run", err: "", stopped: false, ctl });
    S.prev = true;
    GEMINI.setSeen("ttgrid");
    const K = hints(D),
      D0 = D;
    const writes: Promise<void>[] = [];
    let werr = "";
    bump();
    const r = await runPages(J.pages, {
      read: (p) => TTR.readPage(p.img, K, { D: D0, signal: ctl.signal }),
      store: (c, e, p, logId) => {
        IMGS[c] = p.img;
        writes.push(
          writeLive((D1) => storeRead(D1, c, e, p.src, K)).then(
            () => {
              if (logId) GEMINI.logUpdate(logId, { applied: c + " 班的課表" });
            },
            (err) => void (werr = failText(err)),
          ),
        );
      },
      finish: () => writes.push(writeLive((D1) => recheckAll(D1)).catch((err) => void (werr = failText(err)))),
      signal: ctl.signal,
      onUpdate: bump,
    });
    await Promise.all(writes);
    Object.assign(J, { run: false, phase: "", stopped: r.stopped, err: werr || (r.halt ? aiMsg(r.halt) : "") });
    bump();
    toast("讀了 " + r.ok + " 頁" + (r.bad ? "、" + r.bad + " 頁沒讀到" : ""));
  }
  async function readOcr(files: File[]) {
    if (S.ocr || !files.length) return;
    S.ocr = { msg: "正在讀取課表…", done: 0, total: 0 };
    bump();
    try {
      const pages = await ocrPages(files, (done, total, msg) => {
        S.ocr = { msg, done, total };
        bump();
      });
      let res = { n: 0, miss: 0, imgs: {} as Record<string, string> };
      await writeLive((D1) => void (res = storeOcr(D1, pages)));
      Object.assign(IMGS, res.imgs);
      toast("讀了 " + res.n + " 頁課表" + (res.miss ? "；" + res.miss + " 頁認不出班級，請點進去填" : ""));
    } catch (e) {
      toast("課表讀不出來：" + ((e as Error).message || e));
    } finally {
      S.ocr = null;
      bump();
    }
  }

  /* ── 核對 ── */
  const open = (c: string, D0: RcData = D) => c && setDlg({ c, D: D0, k: Date.now() });
  async function saveGrid(c: string, x: GridEdit) {
    const nc = x.cls.trim() || c;
    if (nc !== c && tt[nc] && !confirm(nc + " 已經有課表了（" + (tt[nc].src || "之前讀的") + "）。\n要用這一頁蓋掉嗎？")) return;
    const p = planOnD(R, (D1) => applyGridEdit(D1, c, x));
    if (!p.result) return;
    if ((p.ops.set.length || p.ops.del.length) && !(await run(p.ops, "", { quiet: true }))) return;
    if (nc !== c && IMGS[c]) {
      IMGS[nc] = IMGS[c];
      delete IMGS[c];
    }
    if (!x.accept) {
      setDlg(null);
      return toast("已儲存 " + nc);
    }
    const nx = nextPending(p.D1, nc);
    if (nx && nx !== nc) open(nx, p.D1);
    else {
      setDlg(null);
      toast("都核對過了");
    }
  }
  async function saveSum(c: string, ncRaw: string, rows: SumRow[]) {
    const nc = ncRaw.trim() || c;
    if (nc !== c && tt[nc] && !confirm(nc + " 已經有課表了（" + (tt[nc].src || "之前讀進來的") + "）。\n要用這一頁蓋掉 " + nc + " 原本的課表嗎？")) return;
    if (await edit((D1) => saveSummary(D1, c, nc, rows), "已儲存 " + nc + " 的課表")) {
      if (IMGS[c]) IMGS[nc] = IMGS[c];
      setDlg(null);
    }
  }
  const doAcceptAll = () => {
    const k = pendingClasses(D).length;
    if (!k || !confirm("把 " + k + " 班待核對的地方都當作正確？")) return;
    void edit((D1) => acceptAll(D1), "已接受 " + k + " 班");
  };
  const doApplyCS = () => {
    const list = csList(D);
    if (!list.length) return toast("課表裡沒有可用的國英數理老師");
    if (!confirm("用課表更新各班國英數理老師（" + list.length + " 格）？")) return;
    const p = planOnD(R, (D1) => applyCS(D1, list));
    void run(p.ops, "更新 " + p.result + " 格");
  };
  const doClear = () => {
    if (!confirm("清除全校課表？")) return;
    void edit((D1) => clearTT(D1), "已清除").then(() => {
      Object.keys(IMGS).forEach((k) => delete IMGS[k]);
      S.job = null;
      bump();
    });
  };
  const doRen = (from: string) => {
    const to = (ren[from] ?? L.find((x) => x.t === from)?.sug ?? "").trim();
    if (!to) return toast("先填正確的名字");
    const p = planOnD(R, (D1) => renameName(D1, from, to));
    void run(p.ops, "「" + from + "」→「" + to + "」改了 " + p.result + " 格");
  };
  const doKeep = (from: string) => void edit((D1) => keepName(D1, from), "「" + from + "」以後不再標出來");

  const J = S.job;
  const fails = J ? J.pages.filter((p) => p.st === "fail").length : 0;
  let no = 1;
  const dlgO = dlg ? ttOf(dlg.D)[dlg.c] : null;

  return (
    <>
      <input
        ref={file}
        type="file"
        multiple
        hidden
        aria-label="課表檔案"
        onChange={(e) => {
          const fs = [...(e.target.files || [])];
          e.target.value = "";
          onFiles(fs);
        }}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button tone="primary" disabled={working || lock} onClick={() => pick(st === "on" ? "ai" : "ocr")}>
          <Upload size={16} />
          讀課表 PDF
        </Button>
        <Badge tone={st === "on" ? "default" : "warn"}>{st === "on" ? "Gemini 看圖" : "離線辨識（準確度較低）"}</Badge>
        {st === "on" && (
          <Button size="sm" disabled={working || lock} onClick={() => pick("ocr")}>
            改用離線辨識
          </Button>
        )}
        <span className="grow" />
        {cls.length > 0 && (
          <>
            <Button disabled={busy || lock || ro("teachers")} onClick={doApplyCS}>
              用課表更新任課老師
            </Button>
            <Button tone="danger" disabled={busy || lock || working} onClick={doClear}>
              清除課表
            </Button>
          </>
        )}
      </div>
      {st === "names" && (
        <label className="mb-4 flex min-h-10 items-center gap-2 text-sm text-ink2">
          <input
            type="checkbox"
            className="size-5"
            onChange={(e) => {
              GEMINI.setNamesOk(e.target.checked);
              setN((x) => x + 1);
            }}
          />
          可以送出老師姓名（用 AI 讀課表要用到）
        </label>
      )}
      {st === "off" && (
        <details className="mb-4">
          <summary className="min-h-10 cursor-pointer text-sm text-ink2">接上 AI 讀出整張課表</summary>
          <div className="mt-2">
            <AiSetup what="每一頁的圖會送到 Gemini 讀出每一格的科目和老師" onReady={() => setN((x) => x + 1)} />
          </div>
        </details>
      )}
      {J && (
        <div className="mb-4 rounded-xl border border-line bg-card p-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <b>{J.run ? (J.phase === "img" ? "準備圖片…" : J.phase === "ask" ? "等你確認" : "Gemini 讀課表中") : J.stopped ? "已停止" : "讀完了"}</b>
            <span className="text-sm text-mute tabular-nums">
              {J.pages.filter((p) => p.st === "done").length} / {J.pages.length} 頁{fails > 0 && <span className="text-warn">・{fails} 頁失敗</span>}
            </span>
            {J.run ? (
              J.phase === "run" && (
                <Button size="sm" onClick={() => J.ctl?.abort()}>
                  取消
                </Button>
              )
            ) : (
              <>
                {J.pages.some((p) => p.st !== "done") && (
                  <Button size="sm" disabled={lock || st !== "on"} onClick={() => void runJob()}>
                    重試沒讀到的
                  </Button>
                )}
                <Button size="sm" tone="ghost" onClick={() => ((S.job = null), bump())}>
                  收起
                </Button>
              </>
            )}
            {J.err && <span className="text-sm text-warn">{J.err}</span>}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {J.pages.map((p) => (
              <span
                key={p.n}
                title={p.src + (p.msg ? "：" + p.msg : "")}
                className={cx(
                  "rounded-full px-2.5 py-0.5 text-[13px] tabular-nums",
                  p.st === "done" ? "bg-ok-l text-ok" : p.st === "fail" ? "bg-bad-l text-bad" : p.st === "run" ? "bg-card text-ink shadow-[0_0_0_1px_var(--line2)]" : "bg-sunk text-mute",
                )}
              >
                {pageLab(p)}
              </span>
            ))}
          </div>
        </div>
      )}
      {S.ocr && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3" aria-live="polite">
          <b>{S.ocr.msg}</b>
          {S.ocr.total > 0 && (
            <span className="text-sm text-mute tabular-nums">
              {S.ocr.done} / {S.ocr.total} 頁
            </span>
          )}
        </div>
      )}
      {!cls.length && !J && !S.ocr && <p className="py-4 text-mute">還沒有全校課表</p>}

      {cls.length > 0 && (
        <>
          <SectionTitle
            no={no++}
            extra={
              <>
                {cls.length} 班・{n ? <span className="text-warn">{n} 處待核對</span> : <span className="text-ok">都核對過</span>}
              </>
            }
          >
            各班課表
          </SectionTitle>
          <Card>
            <div className="flex flex-wrap gap-2">
              {cls.map((c) => {
                const k = pend(c, tt[c]),
                  g = !!tt[c].grid;
                return (
                  <button
                    key={c}
                    type="button"
                    title={(g ? "" : "只有統計（離線辨識）・") + (tt[c].src || "")}
                    onClick={() => open(c)}
                    className={cx("inline-flex min-h-10 items-center gap-1 rounded-full px-3.5 text-sm tabular-nums", k ? "bg-warn-l text-warn" : "bg-ok-l text-ok")}
                  >
                    {c}
                    {k ? "・" + k : " ✓"}
                    {!g && <small className="text-mute">統計</small>}
                  </button>
                );
              })}
            </div>
            {n > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => open(nextPending(D, ""))}>下一個待核對</Button>
                <Button disabled={busy || lock} onClick={doAcceptAll}>
                  全部接受
                </Button>
              </div>
            )}
          </Card>

          {L.length > 0 && (
            <>
              <SectionTitle no={no++} extra={L.length + " 個名單上沒有的名字"}>
                名字一次改
              </SectionTitle>
              <Card className="overflow-x-auto p-0 sm:p-0">
                <table className="w-full text-[15px]">
                  <thead>
                    <tr className="bg-sunk">
                      <th className={th}>讀到的</th>
                      <th className={th}>出現</th>
                      <th className={th}>改成</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {L.map((x) => (
                      <tr key={x.t}>
                        <td className={td}>
                          <b>{x.t}</b>
                        </td>
                        <td className={td + " text-sm text-mute"}>
                          {x.n} 格・{x.cls.slice(0, 6).join("、")}
                          {x.cls.length > 6 ? "…" : ""}
                        </td>
                        <td className={td}>
                          <Input
                            className="w-32"
                            list="ttNames"
                            placeholder="正確的名字"
                            aria-label={x.t + " 改成"}
                            value={ren[x.t] ?? x.sug}
                            onChange={(e) => setRen({ ...ren, [x.t]: e.target.value })}
                          />
                        </td>
                        <td className={td + " whitespace-nowrap"}>
                          <Button size="sm" disabled={busy || lock} onClick={() => doRen(x.t)}>
                            全部改
                          </Button>{" "}
                          <Button size="sm" tone="ghost" disabled={busy || lock} title="名字沒錯（新老師），以後不再標出來" onClick={() => doKeep(x.t)}>
                            名字沒錯
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <datalist id="ttNames">
                  {names.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </Card>
            </>
          )}

          <SectionTitle no={no++}>和名冊對照</SectionTitle>
          <Card>
            <ul className="space-y-1 text-[15px]">
              <li className={rc.noTT.length ? "text-warn" : "text-ok"}>{rc.noTT.length ? "課表沒有的班級：" + rc.noTT.join("、") : "名冊的 " + rc.stuCls.length + " 個班都有課表"}</li>
              <li className={rc.diff.length ? "text-warn" : "text-ok"}>
                {rc.diff.length ? "任課老師和課表不同 " + rc.diff.length + " 格：" + rc.diff.slice(0, 30).join("；") + (rc.diff.length > 30 ? "…" : "") : "任課老師和課表一致"}
              </li>
            </ul>
            <details className="mt-3">
              <summary className="min-h-10 cursor-pointer text-sm text-ink2">每位學生的任課老師</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-sunk">
                      <th className={th}>班級座號</th>
                      <th className={th}>姓名</th>
                      {TT_COL.map((x) => (
                        <th key={x[0]} className={th}>
                          {x[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stu.map((s) => {
                      const o = tt[String(s.cls)];
                      return (
                        <tr key={s.id}>
                          <td className={td}>
                            {s.cls}
                            {s.seat ? "-" + String(s.seat).padStart(2, "0") : ""}
                          </td>
                          <td className={td}>{s.name}</td>
                          {o ? (
                            TT_COL.map((x) => {
                              const a = cellOf(o, colSubj(x));
                              return (
                                <td key={x[0]} className={td}>
                                  {a.length ? (
                                    a.map((y) => (
                                      <span
                                        key={y.s}
                                        className={cx("block", !!y.flag && "text-warn")}
                                        title={y.s + " " + y.n + " 節" + (y.flag === 2 ? "（推測的名字，請核對）" : y.flag ? "（認不出，請核對）" : "")}
                                      >
                                        {y.t}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-mute">－</span>
                                  )}
                                </td>
                              );
                            })
                          ) : (
                            <td colSpan={TT_COL.length} className={td + " text-warn"}>
                              課表沒有這一班
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>
        </>
      )}

      {dlg &&
        dlgO &&
        (dlgO.grid ? (
          <GridDialog
            key={dlg.c + dlg.k}
            D={dlg.D}
            c={dlg.c}
            img={IMGS[dlg.c] || ""}
            names={names}
            busy={busy}
            lock={lock}
            onClose={() => setDlg(null)}
            onSave={(x) => void saveGrid(dlg.c, x)}
          />
        ) : (
          <SumDialog
            key={dlg.c + dlg.k}
            D={dlg.D}
            c={dlg.c}
            img={IMGS[dlg.c] || ""}
            busy={busy}
            lock={lock}
            onClose={() => setDlg(null)}
            onSave={(c2, rows) => void saveSum(dlg.c, c2, rows)}
          />
        ))}
      {ask && (
        <RunDialog
          n={ask.pages.length}
          est={TTR.estimate(ask.pages.length, GEMINI.getMode())}
          cost={GEMINI.getMode() === "proxy" ? "費用約 NT$" + TTR.estimate(ask.pages.length, "proxy").ntd + "（flash）" : "用你自己金鑰的額度"}
          preview={ask.pages[0].img}
          req={S.prev ? null : TTR.request(ask.pages[0].img, hints(D))}
          onGo={() => ask.done(true)}
          onNo={() => ask.done(false)}
        />
      )}
    </>
  );
}

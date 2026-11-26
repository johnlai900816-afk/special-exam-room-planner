"use client";
/* ③ 排課表（舊版 renderBoard、trySolve、draftBanner、verList、拖曳調整）。
   - 有草稿時看的、拖的、固定的都是草稿（versions/draft）；正式課表（groups.slots）只有「確定採用」才會變。
   - 一鍵試排／重排／全部重排在 Web Worker 跑（lib/nx/solveRun.ts）：有進度，可以「停止並保留目前最好的」。
   - 拖曳用 pointer 事件（滑鼠、觸控筆、手指都可以）：按下後移動超過 6px 才算拖曳，沒移動就是「點一下選取、再點格子」。
     拖的時候每一格標示可以放（綠）或會衝突（淡），滑鼠旁邊顯示原因；放下就移過去並固定（可以復原）。連點兩下切換固定。
   - 每一個動作都是 planOnD → applyOps（一批、每份帶 rev），被別人搶先改時整批不寫並提示。 */
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { Button, cx, Input, Select } from "@/components/ui";
import { CORE, type Problem } from "@/lib/core";
import {
  cellInfo,
  clearAllD,
  colorOf,
  confirmDraftD,
  discardDraftD,
  draftCompare,
  draftOf,
  fmtTime,
  GRADE,
  hasDraft,
  moveLessonD,
  placedOf,
  preCheck,
  probSet,
  restoreVerD,
  roomNote,
  setRoomD,
  shownL,
  stateOf,
  stuLabel,
  togglePinD,
  tryToast,
  unpinAllD,
  versOf,
  VERMAX,
  X,
  type SolveMode,
} from "@/lib/nx/sched";
import type { Progress } from "@/lib/nx/solveHooks";
import { runSolve } from "@/lib/nx/solveRun";
import { AiAdjDialog, AiExplainDialog, AiSchedDialog } from "./AiDialogs";
import { Dialog, Tip, useSched } from "./common";
import "./board.css";

const CK: [string, string][] = [
  ["teacher", "老師"],
  ["student", "學生"],
  ["class", "原班兩科"],
  ["reg", "任課老師"],
  ["room", "教室"],
  ["off", "不排課時段"],
  ["un", "還沒排"],
];
const PHASE = ["正在排課", "把待安排的學生編進課裡之後再排一次", "調整原班鎖課"];

export function BoardStep() {
  const S = useSched();
  const { D, edit, writeD, undo, busy, canEdit, by, pushUndo, revs } = S;
  const [view, setView] = useState("");
  const [selL, setSelL] = useState(-1);
  const [dragL, setDragL] = useState(-1);
  const [job, setJob] = useState<{ prog: Progress | null; phase: number; stop: () => void; mode: SolveMode } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ai, setAi] = useState<"" | "sched" | "adj" | "explain">("");
  const boardRef = useRef<HTMLDivElement>(null);

  const B = useMemo(() => {
    const M = CORE.compile(D);
    const ST = stateOf(M, D, true);
    const ROOM = CORE.assignRooms(M, ST.slot);
    const out: Problem[] = [];
    CORE.evaluate(M, ST.slot, out);
    const cmp = draftCompare(M, D);
    M.lroom = ST.rfix;
    return { M, ST, ROOM, out, cmp };
  }, [D]);
  const { M, ST, ROOM, out, cmp } = B;
  const d = draftOf(D);
  const total = M.L.length;
  const placed = [...ST.slot].filter((s) => s >= 0).length;
  const gv = view.slice(0, 2) === "g:" ? +view.slice(2) : 0;
  const ti = view && !gv ? M.tIdx[view] : -1;
  const show = (l: number) => shownL(M, view, l);
  const gOff = gv ? new Set(D.offBy[view] || []) : null;
  const grades = [...new Set(M.G.flatMap((g) => (g as unknown as { grades: number[] }).grades))].filter((g) => GRADE[g]).sort();

  const errs: Record<number, string> = {},
    msg = new Map<string, { n: number; l: number; k: string }>(),
    cnt: Record<string, number> = {};
  out.forEach((o) => {
    cnt[o.k] = (cnt[o.k] || 0) + 1;
    if (o.k !== "un") errs[o.l] = (errs[o.l] ? errs[o.l] + "\n" : "") + o.m;
    const e = msg.get(o.m);
    if (e) e.n++;
    else msg.set(o.m, { n: 1, l: o.l, k: o.k });
  });
  const warns = M.G.filter((g) => g.per).flatMap((g) => g.warn.map((w) => g.name + "：" + w));
  const A = M.flex && total ? X.assignLocks(M, ST.slot) : null;
  const bad = CK.filter(([k]) => cnt[k]);
  const at: Record<number, number[]> = {},
    un: number[] = [];
  M.L.forEach((x, l) => {
    if (!show(l)) return;
    const s = ST.slot[l];
    if (s < 0) un.push(l);
    else (at[s] = at[s] || []).push(l);
  });

  // 可以放哪裡：選取或拖曳中的那一節（舊版 markCells／cellInfo）
  const markL = dragL >= 0 ? dragL : selL;
  const marks = useMemo(() => {
    if (markL < 0 || markL >= M.L.length) return null;
    const before = probSet(M, ST.slot);
    const m = new Map<number, { ok: boolean; t: string }>();
    for (let s = 0; s < M.NS; s++) if (s !== ST.slot[markL]) m.set(s, cellInfo(D, M, ST, markL, s, before));
    return m;
  }, [markL, D, M, ST]);

  /* ───── 動作 ───── */
  const move = (l: number, s: number) =>
    edit(
      (D1) => {
        if (stateOf(CORE.compile(D1), D1, true).slot[l] === s) return false;
        return moveLessonD(D1, true, l, s);
      },
      (r) => (r && r.bad ? "放進去了，但這一格有衝突；按「重排」會把其他課移開" : ""),
      { undo: true },
    ).then(() => setSelL(-1));
  const pickL = (l: number) => {
    if (!(l >= 0)) return;
    if (view && !show(l)) setView("");
    setSelL(l);
    setTimeout(() => boardRef.current?.querySelector('.chip[data-l="' + l + '"]')?.scrollIntoView({ block: "center", inline: "center" }), 50);
  };

  async function solve(mode: SolveMode) {
    if (!canEdit) return toast("過渡期這裡只能看，請到舊版修改");
    if (!total) return toast("還沒有要排的課");
    const part = !!gv;
    if (mode === "all" && ST.pin.some((x, l) => x && (!part || show(l))) && !confirm("全部重排會連已經固定的也一起重排，確定嗎？\n排出來一樣先放在草稿，正式課表不會變。")) return;
    const D0 = JSON.parse(JSON.stringify(D)),
      revs0 = revs;
    const run = runSolve(D0, mode, view, Date.now(), (p) => setJob((j) => (j ? { ...j, prog: p, phase: p.phase } : j)));
    setJob({ prog: null, phase: 0, stop: run.stop, mode });
    try {
      const { D: D1, r } = await run.done;
      setJob(null);
      pushUndo(D0);
      setSelL(-1);
      if (await writeD(D0, D1, revs0)) toast(r.stopped ? "已停止：目前最好的排法放進草稿了。滿意了按「確定採用」" : tryToast(D1, r));
    } catch (e) {
      setJob(null);
      toast((e as Error).message === "已取消" ? "已取消，草稿沒有變" : "排課失敗：" + (e as Error).message);
    }
  }

  // 拖曳（舊版「拖曳調整」，改成 React 的寫法；畫面上的 ghost 與說明框直接操作 DOM，拖的時候不重畫整個表）
  const live = useRef({ ST, move, canEdit });
  useEffect(() => {
    live.current = { ST, move, canEdit };
  });
  const dr = useRef<{ l: number; x: number; y: number; id: number; el: HTMLElement; on: boolean; over: HTMLElement | null; ghost?: HTMLElement } | null>(null);
  const justAt = useRef(0);
  useEffect(() => {
    const tipEl = () => {
      let t = document.getElementById("dragTip");
      if (!t) {
        t = document.createElement("div");
        t.id = "dragTip";
        t.className = "sbx";
        document.body.appendChild(t);
      }
      return t;
    };
    const end = () => {
      const x = dr.current;
      dr.current = null;
      if (!x) return null;
      x.ghost?.remove();
      document.getElementById("dragTip")?.remove();
      document.body.classList.remove("sb-dragging");
      x.over?.classList.remove("over");
      setDragL(-1);
      return x;
    };
    const mv = (e: PointerEvent) => {
      const d = dr.current;
      if (!d || e.pointerId !== d.id) return;
      if (!d.on) {
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6) return;
        d.on = true;
        const g = d.el.cloneNode(true) as HTMLElement;
        g.classList.add("sbx", "ghost");
        g.classList.remove("sel", "moved", "lift");
        g.removeAttribute("title");
        g.removeAttribute("data-l");
        // ghost 在 .sb 外面：顏色變數照抄
        g.style.background = getComputedStyle(d.el).backgroundColor;
        document.body.appendChild(g);
        d.ghost = g;
        document.body.classList.add("sb-dragging");
        setDragL(d.l);
      }
      e.preventDefault();
      d.ghost!.style.left = e.clientX + "px";
      d.ghost!.style.top = e.clientY + "px";
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const td = el && el.closest ? (el.closest(".sb [data-s]") as HTMLElement | null) : null;
      if (td !== d.over) {
        d.over?.classList.remove("over");
        d.over = td;
        td?.classList.add("over");
      }
      const T = tipEl();
      if (!td) {
        T.style.display = "none";
        return;
      }
      const s = +td.dataset.s!,
        here = s === live.current.ST.slot[d.l];
      T.className = "sbx" + (s < 0 || here ? "" : td.classList.contains("ok") ? " ok" : " no");
      T.textContent = s < 0 ? "放回「還沒排」，拿下來" : here ? "原來的位置" : td.title || "";
      T.style.display = T.textContent ? "block" : "none";
      T.style.left = Math.max(8, Math.min(innerWidth - 300, e.clientX + 16)) + "px";
      T.style.top = Math.min(innerHeight - 60, e.clientY + 20) + "px";
    };
    const up = (e: PointerEvent) => {
      const d = dr.current;
      if (!d || e.pointerId !== d.id) return;
      const x = end();
      if (!x || !x.on) return;
      justAt.current = Date.now();
      const s = x.over ? +x.over.dataset.s! : null;
      if (s != null && s !== live.current.ST.slot[x.l]) live.current.move(x.l, s);
    };
    const cancel = (e: PointerEvent) => {
      if (dr.current && e.pointerId === dr.current.id) end();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dr.current) end();
    };
    // 拖完放開時瀏覽器還會送一個 click，不擋的話會被當成「點格子移動」或「選取」
    const clk = (e: MouseEvent) => {
      if (Date.now() - justAt.current < 400) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    window.addEventListener("pointermove", mv, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("click", clk, true);
    return () => {
      end();
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("click", clk, true);
    };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (!canEdit || busy || e.button > 0 || !e.isPrimary) return;
    const c = (e.target as HTMLElement).closest(".chip[data-l]") as HTMLElement | null;
    if (!c) return;
    dr.current = { l: +c.dataset.l!, x: e.clientX, y: e.clientY, el: c, id: e.pointerId, on: false, over: null };
  };
  const onClick = (e: React.MouseEvent) => {
    if (!canEdit) return;
    const c = (e.target as HTMLElement).closest(".chip[data-l]") as HTMLElement | null;
    if (c) {
      const l = +c.dataset.l!;
      setSelL(selL === l ? -1 : l);
      return;
    }
    const td = (e.target as HTMLElement).closest("[data-s]") as HTMLElement | null;
    if (td && selL >= 0) move(selL, +td.dataset.s!);
  };
  const onDbl = (e: React.MouseEvent) => {
    if (!canEdit) return;
    const c = (e.target as HTMLElement).closest(".chip[data-l]") as HTMLElement | null;
    if (!c) return;
    const l = +c.dataset.l!;
    if (ST.slot[l] < 0) return;
    setSelL(-1);
    edit((D1) => togglePinD(D1, true, l), undefined, { undo: true });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const c = (e.target as HTMLElement).closest(".chip[data-l]") as HTMLElement | null;
    if (!c) return;
    e.preventDefault();
    c.click();
  };

  const chip = (l: number) => {
    const g = M.G[M.L[l].g],
      r = ROOM[l],
      names = g.stu.map((i) => stuLabel(D.students[i])).join("、");
    return (
      <span
        key={l}
        className={cx("chip", "c" + colorOf(M, g), !!ST.pin[l] && "pin", errs[l] && "err", selL === l && "sel", dragL === l && "lift", cmp?.movedL.includes(l) && "moved")}
        tabIndex={0}
        role="button"
        data-l={l}
        title={(g.t >= 0 ? M.T[g.t].name + "｜" : "") + names + roomNote(D, M, ST, ROOM, l) + (errs[l] ? "\n" + errs[l] : "")}
      >
        {g.name}
        {/* 一律「老師・教室」：排進去了卻分不到教室時寫「沒教室」，一眼看得出教室不夠 */}
        <small>{[g.t >= 0 ? M.T[g.t].name : "", ST.slot[l] >= 0 ? (r >= 0 ? D.rooms[r].name : D.rooms.length ? "沒教室" : "") : ""].filter(Boolean).join("・")}</small>
      </span>
    );
  };

  const pre = preCheck(D, M);
  const rows = M.G.filter((g) => g.per)
    .map((g) => ({ g, slack: g.alist.length - g.per }))
    .sort((a, b) => a.slack - b.slack);
  const vers = versOf(D);
  const curPacked = JSON.stringify(X.packAssign(D.assign));

  const dlabel = d ? (gv ? GRADE[gv] + "重排" : "重排") : gv ? "試排" + GRADE[gv] : "一鍵試排";

  return (
    <div className="sb" ref={boardRef}>
      {/* 草稿：和正式課表並排比較（舊版 draftBanner） */}
      {d && cmp && (
        <div className="draft">
          <h4>試排草稿：{d.label}</h4>
          <p className="mb-2 text-sm text-mute">
            還沒確定，其他頁仍用正式課表。
            {cmp.main.placed ? (
              <>
                換了 <b>{cmp.moved}</b> 節（虛線框）。
              </>
            ) : null}
          </p>
          <div className="overflow-x-auto">
            <table className="ed cmp text-sm">
              <thead>
                <tr className="text-left text-[13px] text-mute">
                  <th className="px-3 py-1.5" />
                  <th className="px-3 py-1.5 font-normal">正式課表</th>
                  <th className="px-3 py-1.5 font-normal">這份草稿</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const noMain = !cmp.main.placed;
                  type St = NonNullable<typeof cmp>["main"];
                  const row = (n: React.ReactNode, f: (x: St) => number, low: boolean, fmt: (v: number, x: St) => string) => {
                    const a = f(cmp.main),
                      b = f(cmp.draft),
                      cls = noMain || a === b ? "" : (low ? b < a : b > a) ? "ok" : "warn";
                    return (
                      <tr className="border-t border-line">
                        <td className="px-3 py-1.5">{n}</td>
                        <td className="px-3 py-1.5">{noMain ? <span className="text-mute">－</span> : fmt(a, cmp.main)}</td>
                        <td className={cx("px-3 py-1.5", cls)}>{fmt(b, cmp.draft)}</td>
                      </tr>
                    );
                  };
                  return (
                    <>
                      {row("已排節數", (x) => x.placed, false, (v) => v + " / " + cmp.total)}
                      {row("衝突", (x) => x.probs, true, (v) => v + " 個")}
                      {cmp.draft.locks && row("原班鎖得到課", (x) => (x.locks ? x.locks.pulled - x.locks.open : 0), false, (v, x) => (x.locks ? v + " / " + x.locks.pulled : "－"))}
                      {row(
                        <>
                          不理想程度<small>（越低越好）</small>
                        </>,
                        (x) => x.soft,
                        true,
                        (v) => String(v),
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="no-print mt-3 flex flex-wrap gap-2">
              <Button tone="primary" disabled={busy || !!job} onClick={() => setConfirmOpen(true)}>
                確定採用
              </Button>
              <Button disabled={busy || !!job} onClick={() => solve("again")}>
                重排
              </Button>
              <Button
                disabled={busy || !!job}
                onClick={() => confirm("放棄這份草稿？（可以按「復原」）") && edit((D1) => discardDraftD(D1), "已放棄草稿", { undo: true })}
              >
                放棄
              </Button>
            </div>
          )}
        </div>
      )}

      {pre && (
        <div className="no-print mb-3 flex flex-wrap gap-2">
          {[
            [pre.cs === pre.need, "任課老師 " + pre.cs + "/" + pre.need, "/admin/settings/school/?step=tea"],
            [pre.off, "不排課時段" + (pre.off ? "" : "未匯入"), "/admin/settings/school/?step=off"],
            [!pre.pend, "待安排 " + pre.pend, "/admin/sched/?step=need"],
          ].map(([ok, t, h]) => (
            <Link key={String(t)} href={String(h)} className={cx("inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm", ok ? "border-ok-b bg-ok-l text-ok" : "border-warn/40 bg-warn-l text-warn")}>
              {ok ? "✓" : "!"} {t}
            </Link>
          ))}
        </div>
      )}

      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {canEdit && (
          <>
            <Button tone="primary" disabled={busy || !!job} onClick={() => solve(d ? "again" : "try")} title={d ? "用新的亂數重排草稿，固定的不動" : "排出一份草稿，不會動到正式課表"}>
              {dlabel}
            </Button>
            <Button disabled={busy || !!job} onClick={() => solve("all")} title="連固定的也一起重排，結果一樣先放在草稿">
              {gv ? GRADE[gv] + "全部重排" : "全部重排"}
            </Button>
            {d && (
              <Button tone="primary" disabled={busy || !!job} onClick={() => setConfirmOpen(true)}>
                確定採用
              </Button>
            )}
            <Button disabled={busy || !!job} onClick={undo}>
              復原
            </Button>
          </>
        )}
        <Select aria-label="檢視" value={view} onChange={(e) => (setView(e.target.value), setSelL(-1))}>
          <option value="">全部年級</option>
          {grades.map((g) => (
            <option key={g} value={"g:" + g}>
              只看、只排{GRADE[g]}
            </option>
          ))}
          {D.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              只看 {t.name}
            </option>
          ))}
        </Select>
        {canEdit && (
          <details className="relative">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-full border border-line2 bg-card px-4 text-[15px] hover:bg-hover">
              更多 <ChevronDown size={15} />
            </summary>
            <div className="absolute z-30 mt-1 flex w-48 flex-col gap-1 rounded-2xl border border-line bg-card p-2 shadow-lg" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute("open")}>
              <Button tone="ghost" className="justify-start" onClick={() => edit((D1) => unpinAllD(D1, true), "已解除全部固定", { undo: true })}>
                解除全部固定
              </Button>
              <Button tone="ghost" className="justify-start" onClick={() => setAi("sched")}>
                用 AI 排
              </Button>
              <Button tone="ghost" className="justify-start" onClick={() => setAi("adj")}>
                用文字調整
              </Button>
              {out.length > 0 && (
                <Button tone="ghost" className="justify-start" onClick={() => setAi("explain")}>
                  請 AI 說明問題
                </Button>
              )}
              <Button
                tone="danger"
                className="justify-start"
                onClick={() => confirm("確定清空目前的排法？（可以按「復原」救回來）") && edit((D1) => clearAllD(D1, true), "已清空", { undo: true })}
              >
                清空排法
              </Button>
            </div>
          </details>
        )}
        <Tip>一鍵試排會先排出草稿，和正式課表並排比較，滿意再按「確定採用」。可以拖曳調整，或點一下組別再點格子；動過的會固定，重排時不會被移走。連點兩下切換固定。</Tip>
        <span className="ml-auto text-sm text-mute">
          已排 <b className="text-ink">{placed}</b> / {total}
        </span>
        <span className={cx("text-sm", out.length ? "text-bad" : "text-mute")}>
          問題 <b>{out.length}</b>
        </span>
      </div>

      {!total ? (
        <div className="flex items-center gap-3 text-mute">
          還沒有要排的課。
          <Link href="/admin/sched/?step=groups" className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 text-ink hover:bg-hover">
            去開課
          </Link>
        </div>
      ) : (
        <>
          {(out.length > 0 || warns.length > 0) && (
            <div className="probs">
              {warns.map((w) => (
                <div key={w}>{w}</div>
              ))}
              {[...msg].map(([m, e]) => (
                <div key={m} className={cx("err", e.k !== "un" && "go")} onClick={() => pickL(e.l)}>
                  {m}
                  {e.n > 1 ? "（" + e.n + " 節）" : ""}
                </div>
              ))}
            </div>
          )}
          <div className="chk">
            {bad.length || (A && A.open.length) ? (
              <>
                <b>衝堂</b>
                {bad.map(([k, n]) => (
                  <span key={k} className="bad">
                    {n} {cnt[k]}
                  </span>
                ))}
                {A && A.open.length > 0 && (
                  <span className="mid" title="原班鎖不到主科的班級節次，詳細在「④ 輸出 › 鎖課表」">
                    鎖不到課 {A.open.length}／{A.pulled}
                  </span>
                )}
              </>
            ) : (
              <span className="ok">衝堂檢查通過</span>
            )}
          </div>

          {selL >= 0 && selL < M.L.length && canEdit && (
            <div className="selbar no-print">
              <b>{M.G[M.L[selL].g].name}</b>
              <span>{ST.slot[selL] >= 0 ? M.sn(ST.slot[selL]) : "還沒排"}</span>
              <label className="flex items-center gap-1">
                教室
                <select
                  className="min-h-9 rounded-lg border border-line2 bg-field px-2"
                  value={ST.rfix![selL]}
                  onChange={(e) => {
                    const l = selL;
                    edit((D1) => setRoomD(D1, true, l, +e.target.value), undefined, { undo: true });
                  }}
                >
                  <option value={-1}>自動{ST.slot[selL] >= 0 && ST.rfix![selL] < 0 && ROOM[selL] >= 0 ? "（" + D.rooms[ROOM[selL]].name + "）" : ""}</option>
                  {D.rooms.map((r, i) => (
                    <option key={r.id} value={i}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              {ST.slot[selL] >= 0 && (
                <>
                  <Button size="sm" onClick={() => edit((D1) => togglePinD(D1, true, selL), undefined, { undo: true })}>
                    {ST.pin[selL] ? "解除固定" : "固定"}
                  </Button>
                  <Button size="sm" onClick={() => move(selL, -1)}>
                    拿下來
                  </Button>
                </>
              )}
              <span className="text-mute">點格子移動；綠色不衝堂</span>
              <Button size="sm" tone="ghost" className="ml-auto" onClick={() => setSelL(-1)}>
                取消
              </Button>
            </div>
          )}

          <div onPointerDown={onDown} onClick={onClick} onDoubleClick={onDbl} onKeyDown={onKey}>
            <div className="tray" data-s="-1">
              {un.length ? (
                <>
                  還沒排：{un.map(chip)}
                </>
              ) : placed < total ? (
                ""
              ) : (
                "拖到這裡拿下來"
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="board">
                <thead>
                  <tr>
                    <th className="ph2" />
                    {CORE.DAYS.map((x) => (
                      <th key={x}>週{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {D.periods.map((p, pi) => (
                    <tr key={p.id} className={p.extra ? "ex" : ""}>
                      <th className="ph2">
                        {p.name}
                        <small>{p.start}</small>
                      </th>
                      {CORE.DAYS.map((x, di) => {
                        const s = di * M.NP + pi,
                          blk = (M.blocked as ArrayLike<number>)[s] || (ti >= 0 && (M.off as ArrayLike<number>[])[ti][s]) || (gOff && gOff.has(M.s2key(s)));
                        const mk = marks?.get(s);
                        return (
                          <td key={x} className={cx(!!blk && "blk", mk && (mk.ok ? "ok" : "no"))} data-s={s} title={mk?.t}>
                            {(at[s] || []).sort((a, b) => colorOf(M, M.G[M.L[a].g]) - colorOf(M, M.G[M.L[b].g])).map(chip)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="legend">
            {(M.rts as number[]).map((t, i) => (
              <span key={t} className={"chip c" + (i % 6)}>
                {M.T[t].name}
              </span>
            ))}
            <span className="ml-2">粗框＝固定・斜線＝不排課・紅框＝衝突</span>
          </div>
          {rows.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-ink2">哪一組最難排</summary>
              <p className="my-1 text-sm text-mute">可排時段＝扣掉相關老師不排課後剩下的格數，越少越難排。</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[13px] text-mute">
                      <th className="p-1.5 font-normal">組別</th>
                      <th className="p-1.5 font-normal">老師</th>
                      <th className="p-1.5 font-normal">每週</th>
                      <th className="p-1.5 font-normal">可排時段</th>
                      <th className="p-1.5 font-normal">原班老師</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ g }) => (
                      <tr key={g.gi} className="border-t border-line">
                        <td className="p-1.5">{g.name}</td>
                        <td className="p-1.5">{g.t >= 0 ? M.T[g.t].name : ""}</td>
                        <td className="p-1.5">{g.per}</td>
                        <td className="p-1.5">{g.alist.length} 格</td>
                        <td className="p-1.5 text-mute">{[...new Set(g.locks.filter((k) => k.t >= 0).map((k) => M.T[k.t].name))].join("、")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      {/* 已確定的版本（舊版 verList） */}
      {vers.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-ink2">已確定的版本（{vers.length}）</summary>
          <p className="my-1 text-sm text-mute">最多留 {VERMAX} 份；拿回來會先放進草稿。</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[13px] text-mute">
                  <th className="p-1.5 font-normal">確定的時間</th>
                  <th className="p-1.5 font-normal">名稱</th>
                  <th className="p-1.5 font-normal">已排</th>
                  <th className="p-1.5" />
                </tr>
              </thead>
              <tbody>
                {vers
                  .map((x, i) => ({ x, i }))
                  .reverse()
                  .map(({ x, i }) => (
                    <tr key={i + ":" + x.at} className="border-t border-line">
                      <td className="p-1.5">{fmtTime(x.at)}</td>
                      <td className="p-1.5">{x.label}</td>
                      <td className="p-1.5 text-mute">{placedOf(x.a)} 節</td>
                      <td className="p-1.5">
                        {JSON.stringify(x.a) === curPacked ? (
                          <span className="text-mute">目前使用</span>
                        ) : canEdit ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              if (hasDraft(D) && !confirm("現在的草稿會被換掉，確定嗎？")) return;
                              edit((D1) => restoreVerD(D1, i, Date.now()), (lbl) => "「" + lbl + "」已放進草稿", { undo: true });
                            }}
                          >
                            拿回草稿
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {job && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="正在排課">
          <div className="w-full max-w-[420px] rounded-2xl border border-line bg-card p-5 shadow-xl">
            <h3 className="mb-1 text-lg font-bold">{PHASE[job.phase] || PHASE[0]}…</h3>
            <p className="mb-3 text-sm text-mute">在背景排，畫面不會卡住；通常 5–20 秒。</p>
            <div className="mb-3 h-2.5 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.prog ? Math.round((job.prog.done / job.prog.total) * 100) : 0}>
              <i className="block h-full bg-acc transition-[width]" style={{ width: (job.prog && job.phase === 0 ? Math.round((job.prog.done / job.prog.total) * 100) : job.phase ? 100 : 2) + "%" }} />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => job.stop()}>{job.prog?.best ? "停止並保留目前最好的" : "取消"}</Button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && d && cmp && <ConfirmDialog label={d.label} warn={cmp.draft.probs > cmp.main.probs ? [cmp.draft.probs, cmp.main.probs] : null} onClose={() => setConfirmOpen(false)} onOk={(name) => {
        setConfirmOpen(false);
        edit((D1) => confirmDraftD(D1, name, Date.now(), by), (r) => "已採用「" + r.name + "」", { undo: true });
      }} />}
      {ai === "sched" && <AiSchedDialog M={M} ST={ST} onClose={() => setAi("")} />}
      {ai === "adj" && <AiAdjDialog M={M} ST={ST} onClose={() => setAi("")} />}
      {ai === "explain" && <AiExplainDialog M={M} ST={ST} onClose={() => setAi("")} />}
    </div>
  );
}

function ConfirmDialog({ label, warn, onClose, onOk }: { label: string; warn: [number, number] | null; onClose: () => void; onOk: (name: string) => void }) {
  const [name, setName] = useState(label);
  return (
    <Dialog
      title="確定採用這份草稿"
      onClose={onClose}
      foot={
        <>
          <Button onClick={onClose}>再想想</Button>
          <Button tone="primary" className="pri" onClick={() => onOk(name.trim() || label)}>
            確定採用
          </Button>
        </>
      }
    >
      <p className="mb-3 text-ink2">各頁都會改用這份課表；現在的會留在「已確定的版本」。老師的課表、鎖課異動紀錄同時更新。</p>
      {warn && (
        <p className="mb-3 rounded-lg bg-warn-l px-3 py-2 text-sm text-warn">
          草稿的衝突（{warn[0]}）比正式課表（{warn[1]}）多。
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        名稱
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onOk(name.trim() || label)} />
      </label>
    </Dialog>
  );
}

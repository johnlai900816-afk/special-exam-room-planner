"use client";
/* 排課頁共用：寫入（planOnD → applyOps，每份帶 rev）、復原、對話框、步驟列、過渡期唯讀。 */
import { X as XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAdmin } from "@/components/AdminShell";
import { failText, toast } from "@/components/Toast";
import { cx } from "@/components/ui";
import { OLD_APP } from "@/components/Planned";
import { CORE } from "@/lib/core";
import { applyOps, diffD } from "@/lib/nx/apply";
import { planOnD } from "@/lib/nx/apply";
import { draftOf, SCHED_COLS, undoApply, undoSnap, type UndoSnap } from "@/lib/nx/sched";
import type { RevMap } from "@/lib/repo";
import type { RcData } from "@/lib/types";

/* 復原：和舊版一樣最多 40 步，換頁（① ② ③）也留著；換資料來源（登入、登出）就清掉 */
const UNDO: { key: string; list: UndoSnap[] } = { key: "", list: [] };
function undoList(key: string): UndoSnap[] {
  if (UNDO.key !== key) {
    UNDO.key = key;
    UNDO.list = [];
  }
  return UNDO.list;
}
function undoPush(key: string, D0: RcData) {
  const a = undoList(key);
  a.push(undoSnap(D0));
  if (a.length > 40) a.shift();
}

export function useSched() {
  const A = useAdmin();
  const { repo, R, revs, D, ro } = A;
  const key = repo.kind + ":" + repo.scope.sid + "/" + repo.scope.termId + "/" + repo.scope.uid;
  const canEdit = !ro("sched");
  const [busy, setBusy] = useState(false);
  const by = A.x.user?.email || (A.x.demo ? "範例" : "本機");

  /** 寫回：兩份 D 之間的變更（求解在背景跑完時用；revs 是開始時讀到的） */
  async function writeD(D0: RcData, D1: RcData, revs0: RevMap, done?: string): Promise<boolean> {
    const ops = diffD(D0, CORE.normalize(D1), SCHED_COLS);
    if (!ops.set.length && !ops.del.length) return true;
    setBusy(true);
    try {
      await applyOps(repo, ops, revs0);
      if (done) toast(done);
      return true;
    } catch (e) {
      toast(failText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** 在 D 的副本上跑 fn（回傳 false＝不用改），算出變更一批寫回。undo＝先記一步復原（舊版 pushUndo） */
  async function edit<T>(fn: (D: RcData) => T, done?: string | ((r: T) => string), opt?: { undo?: boolean }): Promise<T | undefined> {
    if (!canEdit) {
      toast("過渡期這裡只能看，請到舊版修改");
      return undefined;
    }
    const p = planOnD(R, fn, SCHED_COLS);
    if (p.result === false) return p.result;
    if (!p.ops.set.length && !p.ops.del.length) return p.result;
    setBusy(true);
    try {
      await applyOps(repo, p.ops, revs);
      if (opt?.undo) undoPush(key, p.D0);
      const msg = typeof done === "function" ? done(p.result) : done;
      if (msg) toast(msg);
      return p.result;
    } catch (e) {
      toast(failText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  function pushUndo(D0: RcData) {
    undoPush(key, D0);
  }
  async function undo() {
    const list = undoList(key);
    const u = list[list.length - 1];
    if (!u) {
      toast("沒有可以復原的動作");
      return;
    }
    const r = await edit((D) => undoApply(D, u));
    if (r !== undefined) list.pop();
  }
  return { ...A, canEdit, busy, setBusy, edit, writeD, undo, pushUndo, by, D, R, revs };
}

/** 對話框：按 Esc 或背景關閉；內容比畫面高時捲動、按鈕列留在下面 */
export function Dialog({ title, onClose, children, foot, wide }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean | "xl" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.querySelector<HTMLElement>("input,textarea,select,button.pri")?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-40 flex items-end justify-center bg-black/35 p-2 sm:items-center" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx("flex max-h-[92dvh] w-full flex-col rounded-2xl border border-line bg-card shadow-xl", wide === "xl" ? "max-w-[1320px]" : wide ? "max-w-[860px]" : "max-w-[560px]")}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" aria-label="關閉" className="flex size-10 items-center justify-center rounded-full hover:bg-hover" onClick={onClose}>
            <XIcon size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {foot && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{foot}</div>}
      </div>
    </div>
  );
}

export const STEPS: [string, string][] = [
  ["groups", "開課"],
  ["need", "編組"],
  ["board", "排課表"],
  ["out", "輸出"],
];
const NUM = "①②③④";

export function SchedTabs({ step }: { step: string }) {
  const { D, canEdit } = useSched();
  const d = draftOf(D);
  return (
    <>
      {!canEdit && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-x-3 rounded-xl bg-warn-l px-4 py-2 text-sm text-warn">
          <span>過渡期：排課由舊版同步，這裡只能看</span>
          <a href={OLD_APP + "#sched/" + step} className="underline">
            到舊版修改
          </a>
        </div>
      )}
      <ol className="no-print mb-5 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="排課的步驟">
        {STEPS.map(([k, n], j) => (
          <li key={k} className="shrink-0">
            <Link
              href={"/admin/sched/?step=" + k}
              aria-current={k === step ? "step" : undefined}
              className={cx(
                "flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm whitespace-nowrap",
                k === step ? "bg-ink font-bold text-on-ink" : "bg-card text-ink2 shadow-[0_0_0_1px_var(--line)] hover:bg-hover",
              )}
            >
              <span>{NUM[j]}</span>
              {n}
            </Link>
          </li>
        ))}
      </ol>
      {d && step !== "board" && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line2 bg-sunk px-4 py-2 text-sm">
          <b>有草稿還沒確定</b>
          <span className="text-ink2">{d.label}</span>
          <Link href="/admin/sched/?step=board" className="ml-auto inline-flex min-h-9 items-center rounded-full border border-line2 bg-card px-3.5 hover:bg-hover">
            去看
          </Link>
        </div>
      )}
    </>
  );
}

/** 一行說明（舊版的 tip：？按鈕，點開看） */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <details className="relative inline-block align-middle">
      <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full border border-line2 text-sm text-ink2 hover:bg-hover" aria-label="說明">
        ？
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-[min(320px,80vw)] rounded-xl border border-line bg-card p-3 text-sm leading-relaxed text-ink2 shadow-lg">{children}</div>
    </details>
  );
}

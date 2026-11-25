"use client";
/* 段考頁共用的狀態（舊版 exam.html 的全域 D、M、ST 與 save）：
     E    段考的整份資料（和名冊對過：學生、服務、監考老師來自名冊）
     N    學生通知單（打開「通知單」時才建立，和舊版一樣）
     X    build(E)：排列的模型與目前的排法
   畫面顯示「還沒存的修改」（local），沒有的話就是資料庫的內容（loaded）。每一次修改：在副本上改 → 畫面立刻更新 →
   0.8 秒後一批寫回（examOps：考程、名單、通知單、試場、學生考場，每份帶 rev）→ 存好就回到顯示資料庫的內容。
   和舊版一樣：第一次打開（沒存過）先自動排列；名冊改了（學生、IEP 服務、資源班老師）一打開就帶進來並存檔。
   過渡期（native 沒有 'exam'）只能看。 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdmin } from "@/components/AdminShell";
import { failText, toast } from "@/components/Toast";
import { firebase } from "@/lib/firebase";
import { applyOps } from "@/lib/nx/apply";
import type { ExamD } from "@/lib/nx/examCore";
import { EID, examOps, loadExam } from "@/lib/nx/examData";
import { build, runSolve, type Ctx } from "@/lib/nx/examOut";
import { refreshViews, regOf } from "@/lib/nx/examView";
import type { NoticeData } from "@/lib/nx/notice";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export interface ExamCtx {
  E: ExamD;
  N: NoticeData | null;
  X: Ctx;
  canEdit: boolean;
  /** 存過嗎（沒存過＝範例的考程與教室） */
  saved: boolean;
  saving: boolean;
  busy: string;
  /** 在 E 的副本上改（X 是副本的模型，fn 可以改 X.ST 再寫回 assign）；回傳 false＝沒有改，字串＝提示 */
  edit(fn: (E: ExamD, X: Ctx) => void | false | string, opt?: { undo?: boolean; msg?: string }): void;
  /** 換掉通知單 */
  setN(N: NoticeData): void;
  undo(): void;
  solve(mode: "all" | "fill" | "next"): void;
}
const C = createContext<ExamCtx | null>(null);
export function useExam(): ExamCtx {
  const x = useContext(C);
  if (!x) throw new Error("useExam 要在 ExamProvider 裡");
  return x;
}

/* 復原：和舊版一樣最多 40 步；換資料來源（登入、登出、換學期）就清掉 */
const UNDO: { key: string; list: string[] } = { key: "", list: [] };
function undoList(key: string): string[] {
  if (UNDO.key !== key) {
    UNDO.key = key;
    UNDO.list = [];
  }
  return UNDO.list;
}

export function ExamProvider({ children }: { children: ReactNode }) {
  const A = useAdmin();
  const { repo, R, D: roster, revs } = A;
  const canEdit = !A.ro("exam");
  const loaded = useMemo(() => loadExam(R, roster), [R, roster]);
  /** 還沒存的修改（null＝沒有，顯示資料庫的） */
  const [local, setLocal] = useState<{ E: ExamD; N: NoticeData | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const E = local ? local.E : loaded.E;
  const N = local ? local.N : loaded.N;
  const cur = useRef({ E, N, R, revs, local });
  useEffect(() => {
    cur.current = { E, N, R, revs, local };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = repo.kind + ":" + repo.scope.sid + "/" + repo.scope.termId;

  const save = useCallback(async () => {
    timer.current = null;
    const { local: l, R: r, revs: rv } = cur.current;
    if (!l) return;
    const ops = examOps(r, l.E, l.N);
    if (!ops.set.length && !ops.del.length) {
      setLocal(null);
      return;
    }
    setSaving(true);
    try {
      await applyOps(repo, ops, rv);
      // 查考場連結跟著更新（舊版每次存檔都會 linkPush）
      const fb = repo.kind === "firestore" ? firebase() : null;
      const reg = regOf(r.examPrivate[EID + "/view"]);
      if (fb && reg.link) refreshViews(fb.db, repo.scope, build(clone(l.E)), reg).catch(() => toast("查考場連結沒有更新到"));
    } catch (e) {
      toast(failText(e));
    } finally {
      // 存好了（或被別人搶先）：回到顯示資料庫的內容；存的同時又改了就留著再存一次
      setLocal((now) => (now === l ? null : now));
      setSaving(false);
    }
  }, [repo]);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  }, [save]);
  useEffect(() => {
    if (local && !timer.current && !saving) schedule();
  }, [local, saving, schedule]);
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void save();
      }
    },
    [save],
  );

  const put = useCallback((e: ExamD, n: NoticeData | null) => {
    const v = { E: e, N: n };
    cur.current.local = v;
    cur.current.E = e;
    cur.current.N = n;
    setLocal(v);
  }, []);
  const edit = useCallback<ExamCtx["edit"]>(
    (fn, opt) => {
      if (!canEdit) {
        toast("過渡期這裡只能看，請到舊版修改");
        return;
      }
      const c = cur.current.E;
      const e = clone(c);
      const Xc = build(e);
      const r = fn(e, Xc);
      if (r === false) return;
      if (opt?.undo) {
        const list = undoList(key);
        list.push(JSON.stringify({ a: c.assign, p: c.proctorOf, s: c.supportOf, m: c.procMan, n: c.supMan }));
        if (list.length > 40) list.shift();
      }
      put(Xc.D, cur.current.N);
      schedule();
      const m = typeof r === "string" ? r : opt?.msg;
      if (m) toast(m);
    },
    [canEdit, key, put, schedule],
  );
  const setN = useCallback(
    (n: NoticeData) => {
      if (!canEdit) return;
      put(cur.current.E, n);
      schedule();
    },
    [canEdit, put, schedule],
  );
  const undo = useCallback(() => {
    const s = undoList(key).pop();
    if (!s) {
      toast("沒有可以復原的");
      return;
    }
    const o = JSON.parse(s);
    edit((e) => {
      e.assign = o.a;
      e.proctorOf = o.p || {};
      e.supportOf = o.s || {};
      e.procMan = o.m || {};
      e.supMan = o.n || {};
    });
  }, [edit, key]);
  const solve = useCallback(
    (mode: "all" | "fill" | "next") => {
      if (!canEdit) return;
      setBusy("排列中…");
      // 和舊版一樣先讓畫面畫出「排列中」，再在這裡排（同一個執行緒，幾秒內完成）
      setTimeout(() => {
        try {
          edit((e, Xc) => runSolve(Xc, mode) || undefined, { undo: true });
        } finally {
          setBusy("");
        }
      }, 30);
    },
    [canEdit, edit],
  );

  // 一打開：沒存過就先自動排列（舊版 if(!saved)runSolve('all')）；名冊有變（rosterPull）就存
  const opened = useRef("");
  useEffect(() => {
    if (!canEdit || opened.current === key) return;
    const t = setTimeout(() => {
      opened.current = key;
      if (!loaded.saved) {
        const X = build(clone(loaded.E));
        if (X.M.parts.length) runSolve(X, "all");
        put(X.D, loaded.N);
        schedule();
      } else if (loaded.changed) {
        put(clone(loaded.E), loaded.N);
        schedule();
      }
      if (loaded.relink || loaded.warnN)
        toast((loaded.relink ? "已重新連上 " + loaded.relink + " 位學生。" : "") + (loaded.warnN ? loaded.warnN + " 位學生和名冊對不上，請看名單上的黃色提醒" : ""));
    }, 0);
    return () => clearTimeout(t);
  }, [canEdit, key, loaded, put, schedule]);

  const X = useMemo(() => build(clone(E)), [E]);
  const v: ExamCtx = { E, N, X, canEdit, saved: loaded.saved, saving, busy, edit, setN, undo, solve };
  return <C.Provider value={v}>{children}</C.Provider>;
}

"use client";
/* 管理者頁面寫回去的共用動作：把 planOnD 算出來的變更（ops）一批寫進 Repo，成功或失敗都一句話提示。 */
import { useState } from "react";
import { failText, toast } from "@/components/Toast";
import { applyOps, planOnD, type DiffOps } from "@/lib/nx/apply";
import type { RcData } from "@/lib/types";
import { useAdmin } from "../AdminShell";

export function useApply() {
  const { repo, revs, R } = useAdmin();
  const [busy, setBusy] = useState(false);
  async function run(ops: DiffOps, done: string, opt?: { quiet?: boolean }): Promise<boolean> {
    if (!ops.set.length && !ops.del.length) {
      if (!opt?.quiet) toast("沒有變更");
      return false;
    }
    setBusy(true);
    try {
      await applyOps(repo, ops, revs);
      if (done) toast(done);
      return true;
    } catch (e) {
      toast(failText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  /** 在舊格式 D 的副本上改（fn 回傳 false＝不用改），算出變更再寫回 */
  function edit(fn: (D: RcData) => unknown, done = "已存檔"): Promise<boolean> {
    const p = planOnD(R, fn);
    if (p.result === false) return Promise.resolve(false);
    return run(p.ops, done, { quiet: true });
  }
  return { busy, run, edit };
}

"use client";
/* 我的 IEP 的資料操作：調查單存在 iep/{id}（json＝iep.js 的 round），寫入一律 Repo.put 帶 rev；
   發過填空堂邀請（R.inv）的調查單，每次存檔順便更新 iepInvite（內容一樣的不寫）。 */
import { useCallback, useMemo } from "react";
import { failText, toast } from "@/components/Toast";
import { IEP, type Busy, type Round } from "@/lib/iep";
import type { IepRoundDoc } from "@/lib/model";
import { inviteDocs, inviteWrites, nextOrd, roundDoc } from "@/lib/nx/iepSync";
import { useNx } from "@/lib/nx/session";
import { revKey, toCoreD } from "@/lib/repo";
import type { RcData } from "@/lib/types";

export function useIep() {
  const x = useNx();
  const R0 = x.data!.records;
  const revs = x.data!.revs;
  const tid = x.tid;
  const ro = !x.writable("iep") || x.repo!.readOnly;

  /** iep.js 的 ctx（M、排好的節次、教室）：用畫面上已經算好的課表，不再算一次；weekBusy 會把結果快取在 ctx 上 */
  const ctx = useMemo(() => {
    const b = x.board;
    return b ? { M: b.M, slot: b.S.slot, room: b.room } : undefined;
  }, [x.board]);

  /** 忙碌時段（有課、不排課、別場已排的 IEP）：只在 app 裡排時間用，不放進公開資料 */
  const busyOf = useCallback(
    (D: RcData, R: Round): Busy => {
      try {
        return IEP.busyOf(D, R, ctx);
      } catch {
        return {};
      }
    },
    [ctx],
  );

  /** 照日期、節次、承辦有課、勾選重算候選時段（iep.js buildSlots）；失敗回傳 null */
  const rebuild = useCallback(
    (D: RcData, R: Round) => {
      try {
        return IEP.buildSlots(D, R, ctx);
      } catch {
        return null;
      }
    },
    [ctx],
  );

  const syncInvites = useCallback(
    async (D: RcData, R: Round, readers: string[]) => {
      const want = R.inv ? inviteDocs(D, R, readers, busyOf(D, R)) : {};
      const have = Object.fromEntries(Object.entries(x.data!.records.iepInvite).filter(([, v]) => v.roundId === R.id));
      const ops = inviteWrites(want, have, R.id);
      for (const s of ops.set) await x.repo!.put("iepInvite", s.id, s.data, s.isNew ? 0 : x.data!.revs[revKey("iepInvite", s.id)]?.rev || 0);
      for (const id of ops.del) await x.repo!.remove("iepInvite", id);
      return ops.set.length;
    },
    [x.repo, x.data, busyOf],
  );

  /** 存一份調查單（新的也一樣） */
  const save = useCallback(
    async (D: RcData, R: Round): Promise<boolean> => {
      if (ro) {
        toast("過渡期請在舊版修改");
        return false;
      }
      try {
        const prev: IepRoundDoc | undefined = x.data!.records.iep[R.id];
        const doc = roundDoc(D, R, nextOrd(x.data!.records.iep), prev);
        await x.repo!.put("iep", R.id, doc, prev ? x.data!.revs[revKey("iep", R.id)]?.rev || 0 : 0);
        if (R.inv || Object.values(x.data!.records.iepInvite).some((v) => v.roundId === R.id)) await syncInvites(D, R, doc.readers);
        return true;
      } catch (e) {
        toast(failText(e));
        return false;
      }
    },
    [ro, x.repo, x.data, syncInvites],
  );

  /** 改一份調查單：用一份新的 D（不動畫面上的那份），改完存檔 */
  const edit = useCallback(
    async (rid: string, fn: (D: RcData, R: Round) => void | false | Promise<void | false>): Promise<boolean> => {
      const D = toCoreD(x.data!.records);
      const R = IEP.ensure(D).rounds.find((r) => r.id === rid);
      if (!R || !IEP.canEdit(D, R, tid)) {
        toast("只能改自己開的調查");
        return false;
      }
      if ((await fn(D, R)) === false) return false;
      return save(D, R);
    },
    [x.data, tid, save],
  );

  const create = useCallback(
    async (fn: (D: RcData) => Round | null): Promise<Round | null> => {
      const D = toCoreD(x.data!.records);
      IEP.ensure(D);
      const R = fn(D);
      if (!R) return null;
      return (await save(D, R)) ? R : null;
    },
    [x.data, save],
  );

  const remove = useCallback(
    async (rid: string) => {
      try {
        for (const [id, v] of Object.entries(x.data!.records.iepInvite)) if (v.roundId === rid) await x.repo!.remove("iepInvite", id);
        await x.repo!.remove("iep", rid);
        return true;
      } catch (e) {
        toast(failText(e));
        return false;
      }
    },
    [x.repo, x.data],
  );

  return { R0, revs, tid, ro, D: x.D!, ctx, busyOf, rebuild, save, edit, create, remove, syncInvites };
}

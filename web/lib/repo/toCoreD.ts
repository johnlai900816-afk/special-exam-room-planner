/* records ⇄ 舊格式 D。core.js（compile、solve、lockTable、輸出）照舊吃 D。 */
import { CORE } from "../core";
import { NX } from "../legacy";
import type { TermRecords } from "../model";
import type { RcData } from "../types";

/** 新版才有、舊格式 D 沒有的集合（functions/nx-split.js 不認得，搬移與同步不會碰） */
const NATIVE_ONLY = ["iepInvite"] as const;
function withNative(R: TermRecords): TermRecords {
  NATIVE_ONLY.forEach((c) => {
    if (!R[c]) (R as unknown as Record<string, unknown>)[c] = {};
  });
  return R;
}

export function emptyRecords(): TermRecords {
  return withNative(NX.emptyRecords());
}

/** 舊格式 D → records（全部）。D 不會被改動 */
export function splitD(D: RcData): TermRecords {
  return withNative(NX.split(D));
}

/**
 * 這個使用者讀得到的 records → 舊格式 D（再經過 core.normalize，缺的欄位補預設值）。
 * 老師的 records 只有自己的學生：課程的 students 只留讀得到的（opt.keepUnknown 保留 id），
 * 看課表、我的學生夠用；一鍵排課（solve）要全部的學生，只給管理者／編輯。
 */
export function toCoreD(records: Partial<TermRecords>, opt?: { keepUnknown?: boolean }): RcData {
  return CORE.normalize(NX.join(records, opt));
}

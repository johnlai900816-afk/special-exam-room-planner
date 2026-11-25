"use client";
/* 鎖課異動（舊版 extras.js locklogPage）：確定採用課表時自動記一筆（lockLog/L000…），這裡是時間軸：
   每一筆的時間、誰、版本名稱、新增／取消幾節、明細（照班級）、匯出這次異動（Tab 分隔，貼到 Excel）、標記為已交教務處；
   「記錄目前的鎖課」（lib/nx/sched.ts recordLocksD，和確定課表時同一個函式）。
   寫入一律 planOnD(records, fn, SCHED_COLS) → applyOps（每份帶 rev）；過渡期要 native 有 'sched' 或 'lockLog'。 */
import { Copy } from "lucide-react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { Badge, Button, Empty, cx } from "@/components/ui";
import { planOnD } from "@/lib/nx/apply";
import { recordLocksD, SCHED_COLS } from "@/lib/nx/sched";
import { fmtAt, lockByClass, lockEntries, lockTSV, setLockSent, slotName } from "@/lib/nx/stats";
import { copyText } from "../admin/common";

export function LockLog() {
  const { R, D, x, ro } = useAdmin();
  const { busy, run } = useApply();
  const canEdit = !(ro("sched") && ro("lockLog"));
  const log = lockEntries(R);
  const who = x.user?.email || "本機";
  const rec = () => run(planOnD(R, (d) => recordLocksD(d, null, who, Date.now()), SCHED_COLS).ops, "已記錄目前的鎖課");
  const sent = (i: number, on: boolean) => run(planOnD(R, (d) => setLockSent(d, i, on ? Date.now() : null), SCHED_COLS).ops, on ? "已標記為已交教務處" : "已取消標記");
  if (!log.length)
    return (
      <Empty
        action={
          canEdit && (
            <Button tone="primary" disabled={busy} onClick={rec}>
              記錄目前的鎖課
            </Button>
          )
        }
      >
        還沒有紀錄。
      </Empty>
    );
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-mute">確定採用課表時自動記一筆</span>
        <span className="grow" />
        {canEdit && (
          <Button disabled={busy} onClick={rec}>
            記錄目前的鎖課
          </Button>
        )}
      </div>
      <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <ol className="m-0 list-none border-l-2 border-line pl-[18px]">
          {log
            .slice()
            .reverse()
            .map(({ id, i, e }) => {
              const n = e.added.length + e.removed.length;
              return (
                <li key={id} className="relative pb-[18px] pl-2">
                  <span
                    aria-hidden
                    className={cx("absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2", e.sentAt ? "border-ok bg-ok" : "border-ink2 bg-card")}
                  />
                  <div className="text-sm text-mute">
                    {fmtAt(e.at)}・{e.by || "本機"}
                  </div>
                  <div className="my-1 flex flex-wrap items-center gap-2">
                    <b>{e.label || "（沒有名稱）"}</b>
                    {e.first ? (
                      <Badge>第一次記錄・共 {e.n || e.added.length} 節</Badge>
                    ) : (
                      <span>
                        新增 <b className="tabular-nums">{e.added.length}</b>／取消 <b className="tabular-nums">{e.removed.length}</b>
                      </span>
                    )}
                    {e.sentAt ? <Badge tone="ok">已交教務處 {fmtAt(e.sentAt).split(" ")[0]}</Badge> : null}
                  </div>
                  {n > 0 && (
                    <details className="mt-1">
                      <summary className="flex min-h-8 cursor-pointer items-center text-sm text-blue">明細</summary>
                      <ul className="flex flex-col divide-y divide-line">
                        {lockByClass(e).map(([c, its]) => (
                          <li key={c} className="py-2">
                            <b>{c} 班</b>
                            <small className="block text-sm">
                              {its.map(([m, x], j) => (
                                <span key={j} className={cx("block", m === "+" ? "text-ok" : "text-bad")}>
                                  {m === "+" ? "新增" : "取消"} {slotName(D, x.k)} {x.sj} {x.t}
                                </span>
                              ))}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n > 0 && (
                      <Button size="sm" onClick={() => copyText(lockTSV(D, e))}>
                        <Copy size={14} />
                        匯出這次異動
                      </Button>
                    )}
                    {canEdit &&
                      (e.sentAt ? (
                        <Button size="sm" disabled={busy} onClick={() => sent(i, false)}>
                          取消標記
                        </Button>
                      ) : (
                        <Button size="sm" disabled={busy} onClick={() => sent(i, true)}>
                          標記為已交教務處
                        </Button>
                      ))}
                  </div>
                </li>
              );
            })}
        </ol>
      </div>
    </div>
  );
}

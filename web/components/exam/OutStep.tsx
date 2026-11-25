"use client";
/* ④ 輸出（舊版 renderOut）：服務表、動線、監考、交卷名單、補考名單、通知單。紙張的 HTML 和舊版逐字相同（lib/nx/examOut.ts），
   放在 iframe 裡印（components/exam/Paper.tsx）。交卷名單：點方框勾「已交」「未到」；加註節次與試場、加簽名欄、印出已勾選是選項，預設和學校的紙本一樣。 */
import { AlertTriangle, Copy, Download, Plus, Printer } from "lucide-react";
import { useMemo, useRef } from "react";
import { toast } from "@/components/Toast";
import { Button, cx } from "@/components/ui";
import { useQuery } from "@/lib/nx/hooks";
import { addMakeupSessions, makeupList } from "@/lib/nx/examCore";
import { absentN, handPapers, itinHtml, mkPapers, procPaper, svcHtml, ttSnap } from "@/lib/nx/examOut";
import { useAdmin } from "@/components/AdminShell";
import { NoticeStep } from "./NoticeStep";
import { Paper, type PaperHandle } from "./Paper";
import { useExam } from "./useExam";
import Link from "next/link";
import { useRouter } from "next/navigation";

export const OUTS: [string, string][] = [
  ["svc", "服務表"],
  ["itin", "動線"],
  ["proc", "監考"],
  ["hand", "交卷名單"],
  ["mk", "補考名單"],
  ["notice", "通知單"],
];
const SUF: Record<string, string> = { svc: "", itin: "_學生動線", proc: "_監考分配", hand: "_交卷名單", mk: "_補考名單" };

export function OutStep() {
  const q = useQuery();
  const router = useRouter();
  const mode = OUTS.some((o) => o[0] === q.get("o")) ? q.get("o")! : "svc";
  const go = (m: string) => router.replace("/admin/exam/?step=out" + (m === "svc" ? "" : "&o=" + m), { scroll: false });
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="輸出" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-sunk p-1">
          {OUTS.map(([k, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === mode}
              onClick={() => go(k)}
              className={cx("min-h-9 rounded-full px-4 text-sm whitespace-nowrap", k === mode ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(31,36,48,0.06),0_0_0_1px_var(--line)]" : "text-ink2 hover:text-ink")}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {mode === "notice" ? <NoticeStep /> : <Papers mode={mode} />}
    </div>
  );
}

function Papers({ mode }: { mode: string }) {
  const { X, E, edit, canEdit } = useExam();
  const { D: roster } = useAdmin();
  const ref = useRef<PaperHandle>(null);
  const G = useMemo(() => ttSnap(roster) || E.ttCopy || null, [roster, E.ttCopy]);
  const r = useMemo(() => {
    if (mode === "hand") return { ...handPapers(X, G), free: false };
    if (mode === "mk") return { ...mkPapers(E), miss: 0, un: [] as string[] };
    const html = mode === "proc" ? procPaper(X) : mode === "itin" ? itinHtml(X) : svcHtml(X);
    return { html, miss: 0, un: [] as string[], free: false };
  }, [mode, X, E, G]);
  const HO = E.settings.hand || {};
  const setHand = (k: string, v: boolean) =>
    edit((e) => {
      const h = (e.settings.hand = { ...(e.settings.hand || {}) });
      if (v) h[k] = 1;
      else delete h[k];
    });
  const ab = absentN(E);
  const empty = !r.html;
  return (
    <div>
      {!empty && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          <Button tone="primary" onClick={() => ref.current?.print()}>
            <Printer size={16} />
            印出
          </Button>
          <Button onClick={() => toast(ref.current?.copy() ? "已複製，可以貼到 Word" : "複製失敗，請手動選取")} title="貼到 Word／Google 文件">
            <Copy size={16} />
            複製
          </Button>
          <Button onClick={() => ref.current?.word((E.title || "段考服務表") + SUF[mode])}>
            <Download size={16} />
            Word
          </Button>
        </div>
      )}
      {mode === "hand" && (
        <div className="no-print mb-3 text-[13px] leading-relaxed text-mute">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {(
              [
                ["info", "加註節次與試場"],
                ["sign", "加簽名欄"],
                ["mark", "印出已勾選"],
              ] as const
            ).map(([k, t]) => (
              <label key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <input type="checkbox" checked={!!HO[k]} disabled={!canEdit} onChange={(e) => setHand(k, e.target.checked)} /> {t}
              </label>
            ))}
            <details className="relative">
              <summary className="flex size-7 cursor-pointer list-none items-center justify-center rounded-full border border-line2 bg-card text-sm font-bold">?</summary>
              <div className="absolute z-30 mt-1 w-80 rounded-xl border border-line bg-card p-3 text-sm text-ink2 shadow-lg">
                每科一張 A4 直式，預設和學校原本的交卷名單相同。勾了「未到」的學生會列在「補考名單」。批閱教師取自全校課表，沒有課表時用各班任課老師。
              </div>
            </details>
          </div>
          {r.miss > 0 && <b className="mt-1 block">{r.miss} 格找不到批閱教師，留白手寫</b>}
          {ab > 0 && (
            <div className="mt-1.5">
              未到 {ab} 人次{" "}
              <Link href="/admin/exam/?step=out&o=mk" className="text-blue">
                看補考名單
              </Link>
            </div>
          )}
          {r.un.length > 0 && (
            <div className="mt-1 text-bad">
              <AlertTriangle size={13} className="inline" /> 未排入、沒有印出：{[...new Set(r.un)].join("、")}
            </div>
          )}
        </div>
      )}
      {mode === "mk" &&
        (empty ? (
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-mute">
            還沒有勾「未到」的學生
            <Link href="/admin/exam/?step=out&o=hand" className="inline-flex min-h-9 items-center rounded-full border border-line2 bg-card px-3.5 text-ink hover:bg-hover">
              到交卷名單勾選
            </Link>
          </div>
        ) : (
          <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-[13px] text-mute">
            {r.free && (
              <Button
                size="sm"
                disabled={!canEdit}
                onClick={() =>
                  edit((e) => {
                    const n = addMakeupSessions(e, makeupList(e));
                    return n ? "已新增 " + n + " 節補考，到「排考場」排入" : (toast("沒有要新增的補考節"), false);
                  })
                }
              >
                <Plus size={15} />
                建立補考考程
              </Button>
            )}
            <span>時間和試場是建議，可以再調整</span>
          </div>
        ))}
      {mode === "hand" && empty && <p className="text-[13px] text-mute">還沒有特殊考場學生</p>}
      {!empty && (
        <Paper
          ref={ref}
          title={(E.title || "段考") + SUF[mode]}
          html={r.html}
          head={mode === "hand" ? "<style>@page{size:A4 portrait;margin:10mm}</style>" : ""}
          cls={mode === "hand" && HO.mark ? "pmark" : ""}
          onBox={
            mode === "hand" && canEdit
              ? (sj, id, v) =>
                  edit((e) => {
                    const H = (e.handIn = e.handIn || {}),
                      m = (H[sj] = H[sj] || {});
                    if (m[id] === v) delete m[id];
                    else m[id] = v as "in" | "absent";
                    if (!Object.keys(m).length) delete H[sj];
                  })
              : undefined
          }
        />
      )}
    </div>
  );
}

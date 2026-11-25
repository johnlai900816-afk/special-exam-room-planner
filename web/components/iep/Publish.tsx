"use client";
/* 發給出席的人：①老師的填空堂（登入新版就看得到，不用連結）②線上連結與 QR（家長或沒有帳號的人）。
   舊版的「③ 連結與 QR」正在改成更順的流程，這個元件刻意獨立出來，之後照新流程改這一個檔就好。 */
import { Copy, QrCode, RefreshCw, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { failText, toast } from "@/components/Toast";
import { Badge, Button, Note } from "@/components/ui";
import { IEP, type Busy, type Round } from "@/lib/iep";
import { closeOnline, publish, regen, urlOf } from "@/lib/nx/iepOnline";
import { useNx } from "@/lib/nx/session";
import type { RcData } from "@/lib/types";
import { useDrawQr } from "./QrSlips";

export function Publish({ D, R, busy, onEdit }: { D: RcData; R: Round; busy: Busy; onEdit(fn: (D: RcData, R: Round) => Promise<void> | void): Promise<boolean> }) {
  const x = useNx();
  const [qr, setQr] = useState("");
  const [busyBtn, setBusyBtn] = useState(false);
  const online = !x.demo && !!x.user && !x.repo!.readOnly;
  const list = IEP.webPeople(D, R);
  const st = new Map(IEP.progress(D, R).people.map((o) => [o.k, o.done]));
  const pub = (R.pub || []).length;
  const miss = [!R.due && "回覆期限", !R.slots.length && "日期與節次", !R.meets.length && "學生"].filter(Boolean) as string[];
  const over = IEP.pubLimits(D, R);
  const noKey = pub ? list.filter((o) => R.tokH?.[o.k] && !urlOf(R, o.k)) : [];
  const teachers = list.filter((o) => o.k.startsWith("t:"));
  const inv = Object.values(x.data!.records.iepInvite).filter((v) => v.roundId === R.id);
  const qrRef = useDrawQr(qr);

  const run = async (f: () => Promise<void>) => {
    setBusyBtn(true);
    try {
      await f();
    } catch (e) {
      toast(failText(e));
    } finally {
      setBusyBtn(false);
    }
  };
  const copy = (t: string, ok: string) => navigator.clipboard?.writeText(t).then(() => toast(ok), () => toast("沒辦法自動複製，請手動複製"));

  return (
    <div className="flex flex-col gap-4">
      {miss.length > 0 && <Note tone="warn">還沒填：{miss.join("、")}</Note>}
      {over.length > 0 && <Note tone="warn">{over.map((o) => IEP.pubLimitText(o)).join("；")}</Note>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          tone="primary"
          disabled={busyBtn || miss.length > 0 || !teachers.length}
          onClick={() =>
            run(async () => {
              const ok = await onEdit((_, r) => {
                r.inv = 1;
              });
              if (ok) toast("已送到 " + teachers.length + " 位老師的填空堂");
            })
          }
        >
          <Send size={16} />
          {R.inv ? "更新老師的填空堂" : "送到老師的填空堂"}
        </Button>
        {R.inv ? <span className="text-sm text-mute">已送 {inv.length} 位・填了 {inv.filter((v) => v.ansAt).length} 位</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!online || busyBtn || miss.length > 0 || over.length > 0}
          onClick={() =>
            run(async () => {
              if (IEP.expMs(R) < Date.now()) return toast("回覆期限已過，請先改期限");
              let n = 0;
              await onEdit(async (d, r) => {
                n = await publish(x.scope!, d, r, busy);
              });
              toast("已發布 " + n + " 份");
            })
          }
        >
          {pub ? "更新線上內容" : "發布連結"}
        </Button>
        {pub > 0 && (
          <Button
            tone="danger"
            disabled={!online || busyBtn}
            onClick={() =>
              confirm("結束線上調查？連結會立刻失效，線上的回覆會刪掉（已讀回的留著）。") &&
              run(async () => {
                await onEdit(async (_, r) => closeOnline(x.scope!, r));
                toast("舊連結都失效了");
              })
            }
          >
            結束調查
          </Button>
        )}
        {pub > 0 && <span className="text-sm text-mute">已發布 {pub} 份</span>}
      </div>
      {!online && <p className="text-sm text-mute">{x.demo ? "範例資料不能發布連結；可以印紙本時段表" : "過渡期不能發布連結"}</p>}
      {noKey.length > 0 && (
        <Note tone="warn">
          這台電腦沒有 {noKey.length} 位的連結（在別台電腦發布的）。按「重新產生」會換新的連結，舊的立刻失效。
          {online && (
            <Button
              size="sm"
              className="ml-2"
              onClick={() =>
                confirm("重新產生 " + noKey.length + " 位的連結？舊的連結會失效。") &&
                run(async () => {
                  await onEdit(async (d, r) => {
                    await regen(x.scope!, d, r, busy, noKey.map((o) => o.k));
                  });
                })
              }
            >
              <RefreshCw size={15} />
              全部重新產生
            </Button>
          )}
        </Note>
      )}

      <div className="overflow-x-auto" ref={qrRef}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sunk text-left text-[13px] text-mute">
              <th className="px-2 py-2 font-normal">姓名</th>
              <th className="px-2 py-2 font-normal">身分</th>
              <th className="px-2 py-2 font-normal">學生</th>
              <th className="px-2 py-2 font-normal">狀態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const url = pub ? urlOf(R, o.k) : "";
              return (
                <FragmentRow key={o.k} open={qr === o.k && !!url} url={url}>
                  <td className="px-2 py-2">{o.name}</td>
                  <td className="px-2 py-2 text-mute">{[...new Set(o.meets.map((m) => m.role.split("、")[0]))].join("、")}</td>
                  <td className="px-2 py-2 text-mute">{o.meets.map((m) => IEP.stuShow(m.s, "cls")).join("、")}</td>
                  <td className="px-2 py-2">{st.get(o.k) ? <Badge tone="ok">填了</Badge> : "還沒填"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {url ? (
                      <>
                        <Button size="sm" tone="ghost" aria-label="複製連結" onClick={() => copy(url, "已複製連結")}>
                          <Copy size={15} />
                        </Button>
                        <Button size="sm" tone="ghost" aria-label="QR" onClick={() => setQr(qr === o.k ? "" : o.k)}>
                          <QrCode size={15} />
                        </Button>
                        {!st.get(o.k) && (
                          <Button size="sm" tone="ghost" onClick={() => copy(IEP.remindText(D, R, o, url), "已複製提醒")}>
                            提醒
                          </Button>
                        )}
                      </>
                    ) : null}
                  </td>
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ children, open, url }: { children: ReactNode; open: boolean; url: string }) {
  return (
    <>
      <tr className="border-b border-line">{children}</tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <div className="iepqr big" data-t={url} />
          </td>
        </tr>
      )}
    </>
  );
}

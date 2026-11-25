"use client";
/* 一次調查的「QR 與連結」（舊版 iep.js qrSec）：印 QR 小單（一張 3／4／6 份）、複製全部連結、每個人的狀態、
   發布／更新線上內容／結束調查、重新產生（這台電腦沒有鑰匙時）。
   新版另外有「填空堂」：出席的老師登入就看得到，不用連結（R.inv）。 */
import { Copy, QrCode, RefreshCw, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { failText, toast } from "@/components/Toast";
import { Badge, Button, Card, Note, Select } from "@/components/ui";
import { IEP, type Round } from "@/lib/iep";
import { closeOnline, publish, regen, urlOf } from "@/lib/nx/iepOnline";
import type { Per } from "@/lib/nx/iepPrint";
import type { RcData } from "@/lib/types";
import { useDrawQr } from "./QrSlips";
import { useIepSource } from "./useIep";

export type Priv = "full" | "cls" | "mask";
export const PRIV_OPTS: [Priv, string][] = [
  ["full", "班級座號＋姓名"],
  ["cls", "只印班級座號"],
  ["mask", "姓名遮字"],
];

export function Publish({ D, R, ro, onEdit, per, setPer, priv, setPriv, only, setOnly, onPrint }: {
  D: RcData;
  R: Round;
  ro: boolean;
  onEdit(fn: (D: RcData, R: Round) => Promise<void> | void): Promise<boolean>;
  per: Per;
  setPer(v: Per): void;
  priv: Priv;
  setPriv(v: Priv): void;
  only: boolean;
  setOnly(v: boolean): void;
  onPrint(w: "qr" | "paper"): void;
}) {
  const x = useIepSource();
  const [qr, setQr] = useState("");
  const [busyBtn, setBusyBtn] = useState(false);
  const ok = x.online && !ro;
  const list = IEP.webPeople(D, R);
  const st = new Map(IEP.progress(D, R).people.map((o) => [o.k, o.done]));
  const pub = (R.pub || []).length;
  const miss = [!R.due && "回覆期限", !R.slots.length && "時段", !R.meets.length && "學生"].filter(Boolean) as string[];
  const over = IEP.pubLimits(D, R);
  const noKey = pub ? list.filter((o) => R.tokH?.[o.k] && !urlOf(R, o.k)) : [];
  const teachers = list.filter((o) => o.k.startsWith("t:"));
  const inv = Object.values(x.data.records.iepInvite).filter((v) => v.roundId === R.id);
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
  const copy = (t: string, msg: string) => navigator.clipboard?.writeText(t).then(() => toast(msg), () => toast("沒辦法自動複製，請手動複製"));
  const doPublish = () =>
    run(async () => {
      if (IEP.expMs(R) < Date.now()) return toast("回覆期限已過，請先改期限");
      let n = 0;
      await onEdit(async (d, r) => {
        n = await publish(x.scope, d, r);
      });
      toast("已發布 " + n + " 份");
    });
  const copyLinks = () => {
    const L = list.map((o) => [IEP.salute(o.name, o.meets.map((y) => y.role).join("、"), o.teacher), urlOf(R, o.k)]).filter((y) => y[1]);
    if (!L.length) return toast("這台電腦沒有連結");
    copy((R.kind || "IEP 會議") + "時間調查，請於 " + IEP.fmtDate(R.due) + " 前點選有空的節次：\n" + L.map((y) => y[0] + "：" + y[1]).join("\n"), "已複製 " + L.length + " 個連結");
  };
  const privSel = (
    <Select aria-label="學生怎麼印" value={priv} onChange={(e) => setPriv(e.target.value as Priv)}>
      {PRIV_OPTS.map(([v, n]) => (
        <option key={v} value={v}>
          {n}
        </option>
      ))}
    </Select>
  );

  return (
    <Card className="no-print" title={<>QR 與連結 {pub > 0 && <small className="text-sm font-normal text-mute">已發布 {pub} 份{R.pubAt ? "・" + new Date(R.pubAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</small>}</>}>
      <div className="flex flex-col gap-3">
        {!ok && (
          <>
            <p className="text-sm text-mute">{x.demo ? "範例資料不能發布線上連結。" : ro ? "過渡期不能發布線上連結。" : "線上連結要先登入。"}可以印紙本時段表給每個人填。</p>
            <div className="flex flex-wrap items-center gap-2">
              {privSel}
              <Button tone="primary" disabled={!R.slots.length} onClick={() => onPrint("paper")}>
                印紙本時段表
              </Button>
            </div>
          </>
        )}
        {miss.length > 0 && <Note tone="warn">還沒填：{miss.join("、")}</Note>}
        {over.length > 0 && <Note tone="warn">{over.map((o) => IEP.pubLimitText(o)).join("；")}</Note>}
        {noKey.length > 0 && (
          <Note tone="warn">
            這台電腦沒有 {noKey.length} 位的連結（在別台電腦發布的）。按「重新產生」會換新連結，舊的立刻失效。
            {noKey.length > 1 && ok && (
              <Button
                size="sm"
                className="ml-2"
                disabled={busyBtn}
                onClick={() =>
                  confirm("重新產生 " + noKey.length + " 位的連結？舊的連結會失效。") &&
                  run(async () => {
                    await onEdit(async (d, r) => {
                      await regen(x.scope, d, r, noKey.map((o) => o.k));
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
        {ok && (
          <div className="flex flex-wrap items-center gap-2">
            {pub ? (
              <>
                <Button tone="primary" onClick={() => onPrint("qr")}>
                  印 QR 小單
                </Button>
                <Select aria-label="一張幾份" value={String(per)} onChange={(e) => setPer(+e.target.value as Per)}>
                  <option value="3">一張 3 份</option>
                  <option value="4">一張 4 份</option>
                  <option value="6">一張 6 份</option>
                </Select>
                <Button onClick={copyLinks}>
                  <Copy size={15} />
                  複製全部連結
                </Button>
                <Button disabled={busyBtn || miss.length > 0 || over.length > 0} onClick={doPublish}>
                  更新線上內容
                </Button>
                <Button
                  tone="danger"
                  disabled={busyBtn}
                  onClick={() =>
                    confirm("結束線上調查？連結會立刻失效，線上的回覆會刪掉（已讀回的留著）。") &&
                    run(async () => {
                      await onEdit(async (_, r) => closeOnline(x.scope, r));
                      toast("舊連結都失效了");
                    })
                  }
                >
                  結束調查
                </Button>
              </>
            ) : (
              <Button tone="primary" disabled={busyBtn || miss.length > 0 || over.length > 0} onClick={doPublish}>
                發布連結
              </Button>
            )}
          </div>
        )}
        {ok && pub > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-blue">列印選項</summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {privSel}
              <label className="inline-flex min-h-10 items-center gap-1.5 text-sm">
                <input type="checkbox" className="size-4" checked={only} onChange={(e) => setOnly(e.target.checked)} />
                只印還沒填的
              </label>
              <Button size="sm" onClick={() => onPrint("paper")}>
                印紙本時段表
              </Button>
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={ro || busyBtn || miss.length > 0 || !teachers.length}
            onClick={() =>
              run(async () => {
                const done = await onEdit((_, r) => {
                  r.inv = 1;
                });
                if (done) toast("已送到 " + teachers.length + " 位老師的填空堂");
              })
            }
          >
            <Send size={15} />
            {R.inv ? "更新老師的填空堂" : "送到老師的填空堂"}
          </Button>
          <span className="text-sm text-mute">{R.inv ? "填空堂：已送 " + inv.length + " 位・填了 " + inv.filter((v) => v.ansAt).length + " 位" : "出席的老師登入新版，在「填空堂」就能回覆"}</span>
        </div>

        <div className="overflow-x-auto" ref={qrRef}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sunk text-left text-[13px] text-mute">
                <th className="px-2 py-2 font-normal">姓名</th>
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
                    <td className="px-2 py-2">
                      {o.name}
                      <small className="ml-1 text-mute">{[...new Set(o.meets.map((m) => m.role.split("、")[0]))].join("、")}</small>
                    </td>
                    <td className="px-2 py-2 text-mute">{o.meets.map((m) => IEP.stuShow(m.s, "cls")).join("、")}</td>
                    <td className="px-2 py-2">{st.get(o.k) ? <Badge tone="ok">已填</Badge> : "未填"}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {url ? (
                        <>
                          <Button size="sm" tone="ghost" aria-label={"複製 " + o.name + " 的連結"} onClick={() => copy(url, "已複製連結")}>
                            <Copy size={15} />
                          </Button>
                          <Button size="sm" tone="ghost" aria-label={o.name + " 的 QR"} aria-expanded={qr === o.k} onClick={() => setQr(qr === o.k ? "" : o.k)}>
                            <QrCode size={15} />
                          </Button>
                          {!st.get(o.k) && (
                            <Button size="sm" tone="ghost" onClick={() => copy(IEP.remindText(D, R, o, url), "已複製提醒")}>
                              提醒
                            </Button>
                          )}
                        </>
                      ) : null}
                      {pub > 0 && R.tokH?.[o.k] && ok && (
                        <Button
                          size="sm"
                          tone="ghost"
                          disabled={busyBtn}
                          onClick={() =>
                            confirm("重新產生 " + o.name + " 的連結？舊的連結會失效。") &&
                            run(async () => {
                              await onEdit(async (d, r) => {
                                await regen(x.scope, d, r, [o.k]);
                              });
                            })
                          }
                        >
                          重新產生
                        </Button>
                      )}
                    </td>
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function FragmentRow({ children, open, url }: { children: ReactNode; open: boolean; url: string }) {
  return (
    <>
      <tr className="border-b border-line">{children}</tr>
      {open && (
        <tr>
          <td colSpan={4}>
            <div className="iepqr big" data-t={url} />
          </td>
        </tr>
      )}
    </>
  );
}

"use client";
/* 一次調查的頁面（舊版 iep.js roundPage）：標題與「調整名單／時段」→ QR 與連結 → ① 回覆 → ② 排定 → ③ 通知 → 預覽區。
   要印的東西只有一個預覽區（#outArea），列印時只印這裡（iep.css／globals.css 的列印規則）。
   寫入一律 useIep().edit（Repo.put 帶 rev）。 */
import { Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { Badge, Button, Card, Input, Select, cx } from "@/components/ui";
import { IEP, type Round } from "@/lib/iep";
import { pull, urlOf } from "@/lib/nx/iepOnline";
import { noticesHtml, paperHtml, perOf, qrSlipsHtml, type Per, type PrintOpt } from "@/lib/nx/iepPrint";
import type { RcData } from "@/lib/types";
import { SlotGrid, StuPicker, cutLine, md } from "./Create";
import { PeopleEditor } from "./PeopleEditor";
import { PRIV_OPTS, Publish, type Priv } from "./Publish";
import { drawQr } from "./QrSlips";
import { AiExplain } from "@/components/AiAsk";
import { Problems, SuggestBox } from "@/components/Problems";
import { applyPlanChanges, iepAiRequest, iepAiRestore, planProblems, planSuggest, type PlanChange } from "@/lib/nx/iepPlan";
import { useIep, useIepSource } from "./useIep";

const SYM: Record<string, string> = { y: "○", n: "╳", m: "△" };
const F = "text-[13px] text-mute";
type Pr = "" | "qr" | "paper" | "notice";

/** 一張幾份：和舊版同一個鍵（rc-iep-per），QR 小單與開會通知共用 */
const PERKEY = "rc-iep-per";
function perGet(): Per {
  try {
    return perOf(localStorage.getItem(PERKEY));
  } catch {
    return 4;
  }
}
export function usePer(): [Per, (v: Per) => void] {
  const [per, setPerS] = useState<Per>(() => (typeof window === "undefined" ? 4 : perGet()));
  const setPer = (v: Per) => {
    const n = perOf(v);
    setPerS(n);
    try {
      localStorage.setItem(PERKEY, String(n));
    } catch {
      /* 存不進去就算了 */
    }
  };
  return [per, setPer];
}

function H({ n, children, extra }: { n?: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <span className="flex flex-wrap items-baseline gap-2">
      {n && <i className="iepn">{n}</i>}
      {children}
      {extra && <small className="text-sm font-normal text-mute">{extra}</small>}
    </span>
  );
}

/* ── 調整名單／時段 ── */
function Adjust({ D, R, ed }: { D: RcData; R: Round; ed(fn: (D: RcData, R: Round) => void | false): void }) {
  const io = useIep();
  const ro = io.ro;
  const ps = useMemo(() => R.ps || [], [R]);
  // 拿掉了哪些節次（和 buildSlots 同一套：承辦有課的；不改 R）
  const r = useMemo(() => {
    const base = IEP.baseKeys(D, R.d1 || "", R.d2 || "", R.ps || []);
    const hosts = IEP.hostsOf(D, R);
    const why: Record<string, string> = {};
    if (!R.inclBusy)
      hosts.forEach((t) => {
        const b = IEP.tBusy(D, t, base, io.ctx, R);
        for (const k in b) if (!why[k]) why[k] = b[k];
      });
    return { base: base.length, cut: Object.keys(why).length, kept: R.slots.length, why, hosts };
  }, [io.ctx, D, R]);
  const G = useMemo(() => IEP.pickGrid(D, { keys: IEP.baseKeys(D, R.d1 || "", R.d2 || "", ps), sids: R.meets.map((m) => m.s), busy: R.inclBusy ? {} : r.why, pick: R.pick || [] }), [D, R, ps, r]);
  const reb = (fn: (d: RcData, r: Round) => void | false) =>
    ed((d, rr) => {
      if (fn(d, rr) === false) return false;
      io.rebuild(d, rr);
    });
  const noHr = [...new Set(R.meets.map((m) => IEP.stuOf(D, m.s)).filter((s) => s && !(D.classHead as Record<string, string> | undefined)?.[String(s.cls)]).map((s) => String(s!.cls)))];
  return (
    <>
      <Card className="no-print" title={<H extra={(R.pub || []).length ? "改完按「更新線上內容」" : ""}>調整名單／時段</H>}>
        <div className="grid max-w-[720px] grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr]">
          <span className={F}>名稱</span>
          <Input disabled={ro} defaultValue={R.name} key={"n" + R.name} onBlur={(e) => e.target.value.trim() !== R.name && ed((_, rr) => void (rr.name = e.target.value.trim()))} />
          <span className={F}>會議</span>
          <Select disabled={ro} value={R.kind || IEP.KINDS[0]} onChange={(e) => ed((_, rr) => void (rr.kind = e.target.value))}>
            {IEP.KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
          <span className={F}>回覆期限</span>
          <Input type="date" disabled={ro} value={R.due} onChange={(e) => ed((_, rr) => void (rr.due = e.target.value))} />
          <span className={F}>承辦</span>
          {!io.tid && !IEP.hostId(D, R) ? (
            <Input
              disabled={ro}
              placeholder="特教組"
              aria-label="承辦"
              defaultValue={String(R.host || "")}
              key={"h" + (R.host || "")}
              onBlur={(e) => e.target.value.trim() !== String(R.host || "") && ed((_, rr) => void (rr.host = e.target.value.trim()))}
            />
          ) : (
            <span className="font-medium">{IEP.hostLabel(D, R)}</span>
          )}
          <span className={F}>地點</span>
          <Input
            disabled={ro}
            placeholder="會議室、資源教室一"
            defaultValue={R.rooms.join("、")}
            key={"r" + R.rooms.join()}
            onBlur={(e) =>
              ed((_, rr) => {
                const v = e.target.value.split(/[、,，;；\s]+/).map((y) => y.trim()).filter(Boolean);
                if (v.join() === rr.rooms.join()) return false;
                rr.rooms = v;
              })
            }
          />
          <span className={F}>日期</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input type="date" aria-label="開始日期" disabled={ro} value={R.d1 || ""} onChange={(e) => reb((_, rr) => void (rr.d1 = e.target.value))} />
            <span>～</span>
            <Input type="date" aria-label="結束日期" disabled={ro} value={R.d2 || ""} onChange={(e) => reb((_, rr) => void (rr.d2 = e.target.value))} />
          </div>
          <span className={F}>節次</span>
          <div className="flex flex-wrap gap-x-3">
            {D.periods.map((p) => {
              const on = ps.includes(p.id);
              return (
                <label key={p.id} className="inline-flex min-h-10 items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={ro}
                    checked={on}
                    onChange={() =>
                      reb((d, rr) => {
                        const n = on ? (rr.ps || []).filter((y) => y !== p.id) : [...(rr.ps || []), p.id];
                        rr.ps = d.periods.map((y) => y.id).filter((y) => n.includes(y));
                      })
                    }
                  />
                  {p.name}
                </label>
              );
            })}
          </div>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-blue">線上頁與家長</summary>
          <div className="mt-2 grid max-w-[720px] grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr]">
            <span className={F}>學生顯示</span>
            <Select disabled={ro} value={R.priv || "cls"} onChange={(e) => ed((_, rr) => void (rr.priv = e.target.value))}>
              <option value="cls">班級座號</option>
              <option value="mask">班級座號＋王○明</option>
            </Select>
            <span className={F}>家長</span>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" disabled={ro} checked={!!R.par} onChange={(e) => ed((_, rr) => void (rr.par = e.target.checked ? 1 : 0))} />
              家長、專業人員也發連結
            </label>
            <span className={F}>保存期間</span>
            <Input disabled={ro} placeholder="排定後刪除，最晚到學期結束" defaultValue={String(R.keep || "")} onBlur={(e) => e.target.value.trim() !== (R.keep || "") && ed((_, rr) => void (rr.keep = e.target.value.trim()))} />
          </div>
        </details>

        <h4 className="mt-5 mb-2 flex flex-wrap items-baseline gap-2 font-bold">
          時段<small className="text-sm font-normal text-mute">{R.inclBusy ? "有課的節次也問・" + r.kept + " 節" : cutLine(D, io.tid, r.hosts, r.cut, r.base - r.cut, 1)}</small>
        </h4>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {G.hasTT && (
            <Button
              size="sm"
              disabled={ro}
              onClick={() =>
                reb((d, rr) => {
                  const b = io.rebuild(d, rr) || { why: {} };
                  rr.pick = IEP.suggestPick(IEP.pickGrid(d, { keys: IEP.baseKeys(d, rr.d1 || "", rr.d2 || "", rr.ps || []), sids: rr.meets.map((m) => m.s), busy: rr.inclBusy ? {} : b.why }));
                  if (!rr.pick.length) toast("沒有建議的時段");
                })
              }
            >
              勾選建議時段
            </Button>
          )}
          {(R.pick || []).length > 0 && (
            <Button size="sm" disabled={ro} onClick={() => reb((_, rr) => void (rr.pick = []))}>
              清除勾選
            </Button>
          )}
          <label className="inline-flex min-h-10 items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4"
              disabled={ro}
              checked={!!R.inclBusy}
              onChange={(e) =>
                reb((_, rr) => {
                  if (e.target.checked) rr.inclBusy = 1;
                  else delete rr.inclBusy;
                })
              }
            />
            有課的節次也問
          </label>
        </div>
        <SlotGrid
          G={G}
          ro={ro}
          onPick={(k) =>
            reb((_, rr) => {
              const p = Array.isArray(rr.pick) ? rr.pick : [];
              rr.pick = p.includes(k) ? p.filter((y) => y !== k) : [...p, k];
            })
          }
        />

        <h4 className="mt-5 mb-2 flex flex-wrap items-baseline gap-2 font-bold">
          學生<small className="text-sm font-normal text-mute">已選 {R.meets.length} 位</small>
        </h4>
        <StuPicker
          D={D}
          tid={io.tid}
          ro={ro}
          sel={new Set(R.meets.map((m) => m.s))}
          onToggle={(sid, on) =>
            reb((d, rr) => {
              if (on) {
                if (!IEP.addMeetAs(d, rr, sid, io.tid)) return false;
              } else {
                const m = rr.meets.find((y) => y.s === sid);
                if (m) IEP.delMeet(rr, m.id);
              }
            })
          }
          onAll={(on, S) => {
            const ids = new Set(S);
            if (!on && R.meets.some((m) => ids.has(m.s)) && !confirm("移除這些學生？名單的修改也會清掉。")) return;
            reb((d, rr) => {
              if (on) S.forEach((sid) => IEP.addMeetAs(d, rr, sid, io.tid));
              else rr.meets.filter((m) => ids.has(m.s)).forEach((m) => IEP.delMeet(rr, m.id));
            });
          }}
        />
      </Card>
      {R.meets.length > 0 && (
        <details className="no-print rounded-2xl border border-line bg-card p-5 sm:p-6">
          <summary className="cursor-pointer font-bold">出席名單（{R.meets.length} 場）</summary>
          {noHr.length > 0 && <p className="mt-2 text-sm text-bad">還沒設定導師：{noHr.join("、")}</p>}
          {R.meets
            .slice()
            .sort((a, b) => {
              const x = IEP.stuOf(D, a.s),
                y = IEP.stuOf(D, b.s);
              return String(x?.cls).localeCompare(String(y?.cls)) || (+(x?.seat || 0) || 0) - (+(y?.seat || 0) || 0);
            })
            .map((m) => {
              const s = IEP.stuOf(D, m.s);
              return (
                <div key={m.id} className="mt-5">
                  <h4 className="mb-2 flex flex-wrap items-baseline gap-2 font-bold">
                    {IEP.stuLabel(s)}
                    <small className="text-sm font-normal text-mute">
                      個管 {s?.caseMgr ? IEP.pName(D, R, "t:" + s.caseMgr) : "未指定"}・{m.p.length} 人，必要 {m.p.filter((p) => p[2]).length}
                    </small>
                  </h4>
                  <PeopleEditor
                    D={D}
                    R={R}
                    m={m}
                    ro={ro}
                    edit={(fn) =>
                      void ed((d, rr) => {
                        const mm = rr.meets.find((y) => y.id === m.id);
                        return mm ? fn(d, rr, mm) : false;
                      })
                    }
                  />
                </div>
              );
            })}
        </details>
      )}
    </>
  );
}

/* ── ① 回覆 ── */
function Answers({ D, R, ed }: { D: RcData; R: Round; ed(fn: (D: RcData, R: Round) => void | false | Promise<void | false>): Promise<boolean> }) {
  const x = useIepSource();
  const io = useIep();
  const busy = useMemo(() => io.busyOf(D, R), [io, D, R]);
  const pg = IEP.progress(D, R);
  const pub = (R.pub || []).length;
  const online = x.online;
  const pulled = useRef(0);
  const doPull = (quiet: boolean) =>
    ed(async (d, r) => {
      const n = await pull(x.scope, d, r);
      if (!quiet || n) toast(n ? "收到 " + n + " 份新的回覆" : "沒有新的回覆");
      if (!n) return false;
    }).catch(() => {});
  useEffect(() => {
    if (!online || !pub || io.ro || Date.now() - pulled.current < 60000) return;
    pulled.current = Date.now();
    void doPull(true);
  });
  const wait = pg.people.filter((o) => !o.done && (o.teacher || R.par));
  const keys = IEP.keysOf(R);
  const inf = keys.map((k) => IEP.slotInfo(D, k));
  const notes = pg.people.filter((o) => o.note);
  const copyAll = () => {
    const L = wait.map((o) => [o, urlOf(R, o.k)] as const).filter((y) => y[1]);
    if (!L.length) return toast("這台電腦沒有連結");
    navigator.clipboard?.writeText(L.map(([o, u]) => IEP.remindText(D, R, o, u)).join("\n\n")).then(
      () => toast("已複製 " + L.length + " 則提醒"),
      () => toast("沒辦法自動複製，請手動複製"),
    );
  };
  return (
    <Card className="no-print" title={<H n="①" extra={"填了 " + pg.people.filter((o) => o.done).length + " / " + pg.people.length + " 人・可以排 " + pg.ready + " / " + pg.meets.length + " 場"}>回覆</H>}>
      <span id="iepAns" />
      {(online && pub > 0) || (wait.length > 0 && pub > 0) ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {online && pub > 0 && (
            <Button size="sm" onClick={() => doPull(false)}>
              抓取回覆
            </Button>
          )}
          {wait.length > 0 && pub > 0 && (
            <Button size="sm" onClick={copyAll}>
              複製提醒（{wait.length}）
            </Button>
          )}
        </div>
      ) : null}
      {notes.length > 0 && (
        <ul className="iepnotes">
          {notes.map((o) => (
            <li key={o.k}>
              <b>{o.name}</b>：{o.note}
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-blue">手動登錄（紙本、電話）</summary>
        <p className="ieplegend">點格子：○ 可 → ╳ 不可 → △ 不確定 → 空白。「課」＝查到有課、沒回覆</p>
        <div className="overflow-x-auto">
          <table className="iepans">
            <thead>
              <tr>
                <th>姓名</th>
                {inf.map((f) => (
                  <th key={f.k}>
                    {IEP.fmtDate(f.date)}
                    <br />
                    {f.name}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.people.map((o) => {
                const ks = new Set(o.keys);
                return (
                  <tr key={o.k}>
                    <td className="nm">{o.name}</td>
                    {keys.map((k) => {
                      if (!ks.has(k)) return <td key={k} />;
                      const s = IEP.status(R, busy, o.k, k);
                      return (
                        <td key={k}>
                          <button type="button" className={"c " + (s.auto ? "a" : s.v)} title={s.why || ""} disabled={io.ro} onClick={() => ed((_, r) => void IEP.cycle(r, busy, o.k, k))}>
                            {s.auto ? "課" : SYM[s.v] || ""}
                          </button>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap">
                      <Button size="sm" disabled={io.ro} onClick={() => ed((_, r) => IEP.fillRest(r, o.k, "y", null, busy))}>
                        其餘都可
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

/* ── ② 排定 ── */
function Plan({ D, R, ed }: { D: RcData; R: Round; ed(fn: (D: RcData, R: Round) => void | false): Promise<boolean> }) {
  const io = useIep();
  const busy = useMemo(() => io.busyOf(D, R), [io, D, R]);
  const [un, setUn] = useState<Record<string, string>>({});
  const prog = IEP.progress(D, R);
  const ready = new Map(prog.meets.map((y) => [y.m.id, y]));
  const probs = useMemo(() => planProblems(D, R, busy).map((p) => ({ ...p, at: p.id ? "m-" + p.id : undefined })), [D, R, busy]);
  const [sug, setSug] = useState<{ changes: PlanChange[]; un: { id: string; stu: string; why: string }[] } | null>(null);
  return (
    <Card className="no-print" title={<H n="②">排定</H>}>
      <span id="iepPlan" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          disabled={!R.meets.length || io.ro}
          onClick={() =>
            ed((d, r) => {
              const res = IEP.schedule(d, r, { busy: io.busyOf(d, r) });
              IEP.applyPlan(r, res);
              setUn(Object.fromEntries(res.un.map((u) => [u.id, u.why])));
              toast("排好 " + Object.keys(res.at).length + " 場" + (res.un.length ? "，" + res.un.length + " 場排不進去" : ""));
            })
          }
        >
          排出時間
        </Button>
        <Button disabled={io.ro} onClick={() => (setUn({}), ed((_, r) => r.meets.forEach((m) => !m.pin && ((m.at = ""), (m.room = "")))))}>
          清除沒固定的
        </Button>
      </div>
      {R.meets.length > 0 && (
        <Problems list={probs} ok="每一場都排好了，沒有衝突">
          {probs.length > 0 && (
            <Button size="sm" disabled={io.ro} onClick={() => setSug(planSuggest(D, R, busy))} title="有問題的場次（固定的也算）和還沒排的重新找時間；先看再套用">
              建議
            </Button>
          )}
          {probs.length > 0 && (
            <AiExplain
              kind="iepPlan"
              what="只送會議代號、出席者的身分（不送姓名）、候選時段與每個人可不可以；不送學生姓名、班級座號、障別與服務。"
              build={() => {
                const { req, codes } = iepAiRequest(D, R, busy);
                return { req, restore: (t) => iepAiRestore(D, R, t, codes) };
              }}
            />
          )}
        </Problems>
      )}
      {sug && (
        <SuggestBox
          key={sug.changes.map((c) => c.id + c.to).join()}
          title="建議的時間"
          items={sug.changes.map((c) => ({ id: c.id, text: c.stu + "：" + c.fromLabel + " → " + c.toLabel + (c.room ? "　" + c.room : ""), sub: c.pinned ? "原本固定" : undefined }))}
          empty="找不到更好的時間"
          disabled={io.ro}
          extra={
            sug.un.length > 0 && (
              <div className="mt-2 text-sm text-bad">
                {sug.un.map((u) => (
                  <div key={u.id}>
                    {u.stu}：{u.why}
                  </div>
                ))}
              </div>
            )
          }
          onApply={(ids) =>
            void ed((_, r) => {
              if (!applyPlanChanges(r, sug.changes, ids)) return false;
            }).then((ok) => ok && (setSug(null), setUn({}), toast("已改 " + ids.size + " 場")))
          }
          onClose={() => setSug(null)}
        />
      )}
      {!R.meets.length ? (
        <p className="text-sm text-mute">還沒有學生</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sunk text-left text-[13px] text-mute">
                <th className="px-2 py-2 font-normal">學生</th>
                <th className="px-2 py-2 font-normal">回覆</th>
                <th className="px-2 py-2 font-normal">時間</th>
                <th className="px-2 py-2 font-normal">地點</th>
                <th className="px-2 py-2 font-normal">固定</th>
                <th className="px-2 py-2 font-normal">情形</th>
              </tr>
            </thead>
            <tbody>
              {R.meets
                .slice()
                .sort((a, b) => String(a.at || "~").localeCompare(String(b.at || "~")))
                .map((m) => {
                  const rk = IEP.rank(D, R, m, busy);
                  const cur = rk.find((r) => r.k === m.at);
                  const rd = ready.get(m.id);
                  const rooms = [...R.rooms];
                  if (m.room && !rooms.includes(m.room)) rooms.push(m.room);
                  const setM = (fn: (mm: typeof m) => void) =>
                    ed((_, r) => {
                      const mm = r.meets.find((y) => y.id === m.id);
                      if (!mm) return false;
                      fn(mm);
                    });
                  return (
                    <tr key={m.id} id={"m-" + m.id} className="border-b border-line align-top">
                      <td className="px-2 py-2 whitespace-nowrap">{IEP.stuLabel(IEP.stuOf(D, m.s))}</td>
                      <td className="px-2 py-2">{rd?.ready ? <Badge tone="ok">齊了</Badge> : <small className="text-mute">等 {(rd?.wait || []).join("、")}</small>}</td>
                      <td className="px-2 py-2">
                        <Select aria-label="時間" disabled={io.ro} value={m.at || ""} onChange={(e) => (setUn((u) => ({ ...u, [m.id]: "" })), setM((mm) => ((mm.at = e.target.value), (mm.pin = e.target.value ? 1 : 0))))}>
                          <option value="">（未排）</option>
                          {rk.map((r) => (
                            <option key={r.k} value={r.k}>
                              {(r.ok ? "" : "✗ ") + IEP.slotInfo(D, r.k).label + "　" + (r.ok ? r.yes + "/" + r.tot + " 人可" : r.bad.join("、") + " 不行")}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Select aria-label="地點" disabled={io.ro} value={m.room || ""} onChange={(e) => setM((mm) => void (mm.room = e.target.value))}>
                          <option value="">（未定）</option>
                          {rooms.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="checkbox" className="size-5" aria-label="固定" disabled={io.ro} checked={!!m.pin} onChange={(e) => setM((mm) => void (mm.pin = e.target.checked ? 1 : 0))} />
                      </td>
                      <td className="px-2 py-2 text-mute">
                        {un[m.id] ? (
                          <span className="text-bad">{un[m.id]}</span>
                        ) : cur ? (
                          [cur.miss.length ? "不能來：" + cur.miss.join("、") : "", cur.unk.length ? "沒回：" + cur.unk.join("、") : ""].filter(Boolean).join("；") || "都可以"
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** 開會通知的選項（③ 通知與直接開會共用） */
export function NoticeOpts({ R, o, setO, per, setPer, children }: { R: Round; o: Omit<PrintOpt, "host" | "per">; setO(v: Omit<PrintOpt, "host" | "per">): void; per: Per; setPer(v: Per): void; children?: React.ReactNode }) {
  const io = useIep();
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Select aria-label="印什麼" value={o.nm} onChange={(e) => setO({ ...o, nm: e.target.value as PrintOpt["nm"] })}>
        <option value="cut">小通知單</option>
        <option value="sum">安排總表</option>
        <option value="each">每人一張彙整</option>
      </Select>
      {o.nm === "cut" && (
        <Select aria-label="一張幾份" value={String(per)} onChange={(e) => setPer(+e.target.value as Per)}>
          <option value="3">一張 3 份</option>
          <option value="4">一張 4 份</option>
          <option value="6">一張 6 份</option>
        </Select>
      )}
      {o.nm !== "sum" && (
        <>
          <Select aria-label="學生怎麼印" value={o.priv} onChange={(e) => setO({ ...o, priv: e.target.value as PrintOpt["priv"] })}>
            {PRIV_OPTS.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </Select>
          <label className="inline-flex min-h-10 items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4" checked={o.all} onChange={(e) => setO({ ...o, all: e.target.checked })} />
            家長、專業人員也印
          </label>
        </>
      )}
      <label className="inline-flex items-center gap-1.5 text-sm text-mute">
        回條交回
        <Input type="date" disabled={io.ro} value={String(R.cdue || "")} onChange={(e) => io.edit(R.id, (_, r) => void (r.cdue = e.target.value))} />
      </label>
      {children}
    </div>
  );
}

/* ── 頁面 ── */
export function RoundPage({ D, R, jump }: { D: RcData; R: Round; jump?: string }) {
  const io = useIep();
  const [adj, setAdj] = useState(() => !R.slots.length);
  const [pr, setPr] = useState<Pr>("");
  const [per, setPer] = usePer();
  const [priv, setPriv] = useState<Priv>("full");
  const [only, setOnly] = useState(false);
  const [no, setNo] = useState<Omit<PrintOpt, "host" | "per">>({ nm: "cut", priv: "full", all: false });
  const printNow = useRef(false);
  const outRef = useRef<HTMLDivElement>(null);
  const ed = (fn: (D: RcData, R: Round) => void | false | Promise<void | false>) => io.edit(R.id, fn);
  const list = IEP.webPeople(D, R);
  // 舊版 host()：管理者開的、沒有承辦時寫「特教組」
  const host = IEP.hostLabel(D, R) || (io.tid ? "" : "特教組");
  const fixed = R.meets.filter((m) => m.at);

  useEffect(() => {
    if (!jump) return;
    document.getElementById(jump)?.scrollIntoView({ block: "start" });
  }, [jump]);

  // 預覽區：畫好 QR 再印（舊版 pr：開預覽就直接叫出列印）
  const html = useMemo(() => {
    if (!pr) return "";
    const st = new Map(IEP.progress(D, R).people.map((o) => [o.k, o.done]));
    const ppl = list.filter((o) => !only || !st.get(o.k));
    if (pr === "qr") return qrSlipsHtml(D, R, ppl, (pk) => urlOf(R, pk), { per, priv, host });
    if (pr === "paper") return ppl.map((o) => paperHtml(D, R, o, { priv, host })).join("");
    return noticesHtml(D, R, { ...no, per, host });
  }, [pr, D, R, list, only, per, priv, host, no]);
  useEffect(() => {
    const el = outRef.current;
    if (!pr || !el) return;
    void drawQr(el).then(() => {
      if (!printNow.current) return;
      printNow.current = false;
      el.scrollIntoView?.({ block: "start" });
      if (el.querySelector(".pg")) setTimeout(() => window.print(), 50);
    });
  }, [pr, html]);
  const openPr = (w: Pr) => {
    printNow.current = !!w;
    setPr(w);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="no-print">
        <h3 className="mb-1.5 flex flex-wrap items-baseline gap-2 text-[17px] font-bold">
          {R.name || "調查"}
          <small className="text-sm font-normal text-mute">{[R.kind, R.d1 ? md(R.d1) + "～" + md(R.d2 || "") : "", R.due ? md(R.due) + " 前回覆" : ""].filter(Boolean).join("・")}</small>
        </h3>
        <p className="text-sm text-mute">
          {R.meets.length} 位學生・{list.length} 人要回覆・{R.slots.length} 個時段{" "}
          <button type="button" className="lnk" aria-expanded={adj} onClick={() => setAdj(!adj)}>
            調整名單／時段
          </button>
        </p>
      </Card>
      {adj && <Adjust D={D} R={R} ed={(fn) => void ed(fn)} />}
      <Publish D={D} R={R} ro={io.ro} onEdit={ed} per={per} setPer={setPer} priv={priv} setPriv={setPriv} only={only} setOnly={setOnly} onPrint={(w) => openPr(w)} />
      <Answers D={D} R={R} ed={ed} />
      <Plan D={D} R={R} ed={ed} />
      <Card className="no-print" title={<H n="③">通知</H>}>
        {!fixed.length ? (
          <p className="text-sm text-mute">排好時間才能印通知</p>
        ) : (
          <NoticeOpts R={R} o={no} setO={setNo} per={per} setPer={setPer}>
            <Button onClick={() => openPr("notice")}>
              <Printer size={16} />
              預覽並印出
            </Button>
          </NoticeOpts>
        )}
      </Card>
      {pr && (
        <>
          <div className="ieppv no-print flex flex-wrap items-center gap-2">
            <b>預覽：{{ qr: "QR 小單", paper: "紙本時段表", notice: "開會通知" }[pr]}</b>
            <span className="grow" />
            <Button tone="primary" onClick={() => drawQr(outRef.current).then(() => window.print())}>
              <Printer size={16} />
              印出
            </Button>
            <Button onClick={() => openPr("")}>
              <X size={16} />
              關閉預覽
            </Button>
          </div>
          <div id="outArea" ref={outRef} className={cx(!html && "no-print")} dangerouslySetInnerHTML={{ __html: html || '<p class="note">沒有要印的</p>' }} />
        </>
      )}
    </div>
  );
}

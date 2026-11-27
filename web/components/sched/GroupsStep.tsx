"use client";
/* ① 開課（舊版 renderGroups／grpCard）：每位資源班老師一段（基本鐘點、已開節數、超鐘點），老師的課一張卡片；
   沒有老師的課（待認領）另外一段。上面是超鐘點摘要：需要幾節、應授合計、缺幾節、待認領、建議分配（core.suggestOvertime）、
   認領待確認（核准／不核准，core.claimDecide）。固定時段（舊版 fixOpen）、選學生（pickList）、原班任課老師（classSubj）。 */
import { X as XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { Badge, Button, Card, cx, Input, Select } from "@/components/ui";
import { CORE } from "@/lib/core";
import {
  addGroupD,
  applyOvertimeD,
  delGroupD,
  dropAsk,
  dropNeedsD,
  GRADE,
  setClassSubjD,
  setFixedD,
  setGroupD,
  setTeacherHoursD,
  sortStu,
  stuLabel,
  suggestOvertimeD,
  toggleGroupStudentD,
  X,
  type OtSug,
} from "@/lib/nx/sched";
import type { Group, RcData, Teacher } from "@/lib/types";
import { Problems } from "@/components/Problems";
import { openProblems } from "@/lib/nx/suggest";
import { Dialog, Tip, useSched } from "./common";

interface OtRowT {
  id: string;
  name: string;
  base: number;
  due: number;
  reduce: number;
  open: number;
  extra: number;
  counted: number;
  ot: number;
  short: number;
  otMax: number | null;
  cap: number;
  over: boolean;
  noHours: boolean;
}
const otCls = (r: OtRowT) => (r.over ? "text-bad" : r.noHours ? "text-mute" : r.ot ? "text-warn" : r.short ? "text-warn" : "text-ok");
function otText(D: RcData, r: OtRowT) {
  const cnt = !!D.settings.otCountExtra,
    ex = r.extra && !cnt ? "（外加 " + r.extra + "）" : "";
  if (r.noHours) return "已開 " + r.open + " 節" + ex;
  return (
    "應授 " +
    r.due +
    (r.reduce ? "（減 " + r.reduce + "）" : "") +
    "・已開 " +
    r.open +
    ex +
    (r.ot ? "・超鐘點 +" + r.ot + (r.over ? "（上限 " + (r.otMax != null && (!r.cap || r.otMax < r.cap) ? r.otMax : r.cap) + "）" : "") : r.short ? "・差 " + r.short : "・剛好")
  );
}
function tOpts(D: RcData, first: "res" | "reg") {
  const rk = (t: Teacher) => (t.role === "資源班" ? 0 : 1);
  const list = D.teachers.slice().sort((a, b) => (first === "res" ? rk(a) - rk(b) : rk(b) - rk(a)));
  return [
    <option key="" value="">
      （未指定）
    </option>,
    ...list.map((t) => (
      <option key={t.id} value={t.id}>
        {t.name}
        {t.role === "普通班" || t.role === "資源班" ? "" : "・" + t.role}
      </option>
    )),
  ];
}

export function GroupsStep() {
  const S = useSched();
  const { D, edit, busy, canEdit } = S;
  const M = useMemo(() => CORE.compile(D), [D]);
  const [fix, setFix] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [sug, setSug] = useState<{ R: OtSug; on: Set<string>; over: boolean } | null>(null);
  const [drop, setDrop] = useState<{ id: string; subject: string; no: boolean }[] | null>(null);

  const byId = Object.fromEntries(D.students.map((s) => [s.id, s]));
  let grs = [...new Set(D.students.map((s) => CORE.gradeOfCls(s.cls)))].filter((x) => GRADE[x]).sort();
  if (!grs.length) grs = [7, 8, 9];
  const subj = [...new Set(D.groups.map((g) => g.subject).concat(["國文", "數學", "英文"]))];
  const list = D.teachers.filter((t) => t.role === "資源班" || D.groups.some((g) => g.teacher === t.id)),
    ids = new Set(list.map((t) => t.id)),
    lone = D.groups.filter((g) => !ids.has(g.teacher));
  const OS = X.otSummary(D) as { want: number; due: number; short: number; open: string[]; rows: OtRowT[] };
  const OR = Object.fromEntries(OS.rows.map((r) => [r.id, r]));
  const pend = X.claimsPending(D) as { gid: string; tid: string }[];
  const probs = useMemo(() => openProblems(D), [D]);

  const setG = (gid: string, k: string, v: unknown) => edit((D1) => void setGroupD(D1, gid, k, v));
  const askDrop = (L: { id: string; subject: string }[]) => L.length && setDrop(L.map((o) => ({ ...o, no: true })));
  const togStu = async (gid: string, sid: string) => {
    let ask: { id: string; subject: string }[] = [];
    await edit((D1) => {
      ask = toggleGroupStudentD(D1, gid, sid);
    });
    askDrop(ask);
  };
  const decide = (gid: string, tid: string, yes: boolean) =>
    edit((D1) => {
      const r = X.claimDecide(D1, gid, tid, yes, Date.now()) as { ok: boolean; why?: string };
      if (!r.ok) {
        toast(r.why || "");
        return false;
      }
      const g = D1.groups.find((x) => x.id === gid)!,
        t = D1.teachers.find((x) => x.id === tid)!;
      return yes ? g.name + " 給 " + t.name : "不核准 " + t.name;
    }, (m) => String(m));

  const card = (g: Group, extra?: React.ReactNode) => {
    const c = M.G[D.groups.indexOf(g)];
    const w = c ? c.warn.filter((x) => x !== "還沒有學生") : [];
    return (
      <div key={g.id} id={"g-" + g.id} className={cx("min-w-0 rounded-2xl border border-line bg-card p-4", g.on === false && "opacity-60")}>
        <div className="mb-2 flex items-center gap-2">
          <Input
            key={g.name}
            className="min-w-0 flex-1 font-bold"
            defaultValue={g.name}
            placeholder="課名"
            aria-label="課名"
            disabled={!canEdit}
            onBlur={(e) => e.target.value.trim() !== g.name && setG(g.id, "name", e.target.value)}
          />
          <label className="flex items-center gap-1 text-sm whitespace-nowrap">
            <input type="checkbox" checked={g.on !== false} disabled={!canEdit} onChange={(e) => setG(g.id, "on", e.target.checked)} /> 要排
          </label>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full text-mute hover:bg-hover"
            aria-label={"刪除 " + g.name}
            disabled={!canEdit}
            onClick={() => {
              if (!confirm("刪除「" + g.name + "」？")) return;
              edit((D1) => delGroupD(D1, g.id), "已刪除 " + g.name, { undo: true });
            }}
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
          <span className="text-mute">科目</span>
          <Input key={"s" + g.subject} list="subjList" defaultValue={g.subject} disabled={!canEdit} aria-label="科目" onBlur={(e) => e.target.value.trim() !== g.subject && setG(g.id, "subject", e.target.value)} />
          <span className="text-mute">每週節數</span>
          <Input key={"p" + g.per} type="number" min={0} max={15} defaultValue={g.per} disabled={!canEdit} aria-label="每週節數" className="w-24" onBlur={(e) => +e.target.value !== g.per && setG(g.id, "per", +e.target.value)} />
          <span className="text-mute">老師</span>
          <Select value={g.teacher} disabled={!canEdit} aria-label="老師" onChange={(e) => setG(g.id, "teacher", e.target.value)}>
            {tOpts(D, "res")}
          </Select>
          <span className="text-mute">年級</span>
          <Select value={g.grade} disabled={!canEdit} aria-label="年級" onChange={(e) => setG(g.id, "grade", e.target.value)}>
            <option value="">不限</option>
            {grs.map((x) => (
              <option key={x} value={String(x)}>
                {GRADE[x]}
              </option>
            ))}
          </Select>
          <span className="text-mute">型態</span>
          <Select value={g.mode} disabled={!canEdit} aria-label="型態" onChange={(e) => setG(g.id, "mode", e.target.value)}>
            {CORE.MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <span className="text-mute">固定時段</span>
          <span className="flex flex-wrap items-center gap-1">
            {((g.fixed as string[]) || []).length ? (
              ((g.fixed as string[]) || []).map((k) => {
                const s = M.key2s(k);
                return s >= 0 ? <Badge key={k}>{M.sn(s)}</Badge> : null;
              })
            ) : (
              <span className="text-mute">沒有</span>
            )}
            <Button size="sm" disabled={!canEdit} onClick={() => setFix(g.id)}>
              設定
            </Button>
          </span>
          <span className="text-mute">教室</span>
          <Select value={g.room} disabled={!canEdit} aria-label="教室" onChange={(e) => setG(g.id, "room", e.target.value)}>
            <option value="">自動安排</option>
            {D.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-3 mb-1 text-[13px] text-mute">學生（{g.students.length} 人）</div>
        <div className="flex flex-wrap items-center gap-1">
          {g.students
            .map((id) => byId[id])
            .filter(Boolean)
            .sort(sortStu)
            .map((s) => (
              <span key={s.id} className="inline-flex items-center gap-0.5 rounded-full bg-sunk py-0.5 pr-0.5 pl-2.5 text-sm">
                {stuLabel(s)}
                <button type="button" className="flex size-7 items-center justify-center rounded-full text-mute hover:bg-hover" aria-label={"從這門課拿掉 " + s.name} disabled={!canEdit} onClick={() => togStu(g.id, s.id)}>
                  <XIcon size={13} />
                </button>
              </span>
            ))}
          <Button size="sm" disabled={!canEdit} onClick={() => setPick(g.id)}>
            選學生
          </Button>
        </div>
        {c && c.need && c.cls.length > 0 && (
          <>
            <div className="mt-3 mb-1 text-[13px] text-mute">原班{g.subject}老師</div>
            <div className="grid grid-cols-[4rem_1fr] items-center gap-1.5 text-sm">
              {c.cls.map((cl) => (
                <div key={cl} className="contents">
                  <span>{cl}</span>
                  <Select value={D.classSubj[cl + "|" + g.subject] || ""} disabled={!canEdit} aria-label={cl + " " + g.subject + " 原班老師"} onChange={(e) => edit((D1) => setClassSubjD(D1, cl + "|" + g.subject, e.target.value))}>
                    {tOpts(D, "reg")}
                  </Select>
                </div>
              ))}
            </div>
          </>
        )}
        {g.on !== false &&
          (w.length ? (
            <div className="mt-3 rounded-lg bg-warn-l px-3 py-2 text-sm text-warn">
              {w.map((x) => (
                <div key={x}>{x}</div>
              ))}
            </div>
          ) : c ? (
            <div className="mt-3 text-sm text-mute">
              可排 {c.alist.length} 格・要排 {c.per} 節
            </div>
          ) : null)}
        {extra}
      </div>
    );
  };

  const claimTag = (g: Group) => {
    if (g.on === false || !+g.per) return null;
    const n = pend.filter((c) => c.gid === g.id).length;
    return <div className="mt-2 rounded-lg bg-warn-l px-3 py-1.5 text-sm text-warn">待認領{n ? "・" + n + " 位老師認領" : ""}</div>;
  };

  const byG: Record<string, { gid: string; tid: string }[]> = {};
  pend.forEach((c) => (byG[c.gid] = byG[c.gid] || []).push(c));

  return (
    <div>
      <datalist id="subjList">
        {subj.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Tip>先填每位老師的基本鐘點，再替他開課，把節數補到剛好。課裡可以先沒有學生，之後到「② 編組」再放。</Tip>
        <span className="ml-auto text-sm text-mute">
          <b className="text-ink">{D.groups.length}</b> 門課・每週 <b className="text-ink">{M.L.length}</b> 節
        </span>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm">
        <span>
          需要 <b>{OS.want}</b> 節，應授合計 <b>{OS.due}</b> 節，{OS.short ? <b className="text-bad">缺 {OS.short} 節</b> : <b className="text-ok">足夠</b>}
        </span>
        {OS.open.length > 0 && <Badge tone="warn">待認領 {OS.open.length} 門</Badge>}
      </div>
      <Problems list={probs} ok="開課沒有問題">
        <Button size="sm" disabled={!canEdit} onClick={() => setSug({ R: suggestOvertimeD(D, false), on: new Set(suggestOvertimeD(D, false).list.map((x) => x.gid)), over: false })} title="待認領的課分給還有空的老師，超鐘點的移給別人；勾選的才套用">
          建議分配
        </Button>
      </Problems>
      {Object.keys(byG).length > 0 && (
        <Card title={<>認領待確認 <small className="text-sm font-normal text-mute">{Object.keys(byG).length} 門</small></>} className="mb-4">
          <ul className="flex flex-col gap-3">
            {Object.keys(byG).map((gid) => {
              const g = D.groups.find((x) => x.id === gid);
              if (!g) return null;
              return (
                <li key={gid} className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[10rem]">
                    <b>{g.name}</b>
                    <small className="block text-mute">
                      {g.subject}・{+g.per} 節{byG[gid].length > 1 ? "・" + byG[gid].length + " 位認領，選一位" : ""}
                    </small>
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    {byG[gid].map((c) => {
                      const t = D.teachers.find((x) => x.id === c.tid)!;
                      const r = (OR[c.tid] || X.otRow(D, t, 0, 0)) as OtRowT;
                      const add = g.mode !== "外加" || D.settings.otCountExtra ? +g.per : 0,
                        ot = r.base ? Math.max(0, r.counted + add - r.due) : 0;
                      return (
                        <div key={c.tid} className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[8rem]">
                            {t.name}
                            <small className="block text-mute">{r.base ? "接了以後超鐘點 " + ot : "沒填基本鐘點"}</small>
                          </span>
                          <Button size="sm" tone="primary" disabled={!canEdit || busy} onClick={() => decide(gid, c.tid, true)}>
                            核准
                          </Button>
                          <Button size="sm" disabled={!canEdit || busy} onClick={() => decide(gid, c.tid, false)}>
                            不核准
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {!list.length && <p className="mb-4 text-mute">還沒有資源班老師，請到「設定 › 學校資料 › 老師與任課」新增。</p>}
      {list.map((t) => {
        const r = (OR[t.id] || X.otRow(D, t, 0, 0)) as OtRowT,
          due = r.due,
          n = r.counted;
        return (
          <section key={t.id} id={"t-" + t.id} className="mb-6 rounded-2xl">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <b className="text-lg">{t.name}</b>
              <label className="flex items-center gap-1 text-sm">
                基本鐘點
                <Input
                  key={"h" + (r.base || "")}
                  type="number"
                  min={0}
                  max={40}
                  className="w-20"
                  defaultValue={r.base || ""}
                  placeholder="未填"
                  disabled={!canEdit}
                  onBlur={(e) => (+e.target.value || 0) !== (+(t.hours || 0) || 0) && edit((D1) => setTeacherHoursD(D1, t.id, +e.target.value))}
                />
                節
              </label>
              <div className="h-2 w-28 overflow-hidden rounded-full bg-sunk">
                <i className={cx("block h-full", r.over ? "bg-bad" : "bg-acc")} style={{ width: (due ? Math.min(100, Math.round((n / due) * 100)) : n ? 100 : 0) + "%" }} />
              </div>
              <span className={cx("text-sm", otCls(r))}>{otText(D, r)}</span>
              <Button size="sm" className="ml-auto" disabled={!canEdit} onClick={() => edit((D1) => addGroupD(D1, t.id), "已開一門課")}>
                開課
              </Button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] gap-3">{D.groups.filter((g) => g.teacher === t.id).map((g) => card(g))}</div>
          </section>
        );
      })}
      {lone.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <b className="text-lg">沒有老師的課</b>
            <span className="text-sm text-warn">{lone.reduce((n, g) => n + g.per, 0)} 節</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(330px,100%),1fr))] gap-3">{lone.map((g) => card(g, claimTag(g)))}</div>
        </section>
      )}
      <Button disabled={!canEdit} onClick={() => edit((D1) => addGroupD(D1, ""), "已新增一門課")}>
        新增一門課
      </Button>

      {fix && <FixDialog gid={fix} onClose={() => setFix(null)} />}
      {pick && <PickDialog gid={pick} onClose={(gone) => { setPick(null); const g = D.groups.find((x) => x.id === pick); if (g && gone.length) askDropLater(gone.map((id) => ({ id, subject: g.subject }))); }} />}
      {sug && (
        <Dialog
          title="建議分配"
          wide
          onClose={() => setSug(null)}
          foot={
            <>
              <Button onClick={() => setSug(null)}>取消</Button>
              <Button
                tone="primary"
                className="pri"
                disabled={!sug.R.list.length || busy}
                onClick={async () => {
                  if (!sug.on.size) return toast("沒有勾選");
                  const R0 = sug.R,
                    ids = sug.on;
                  setSug(null);
                  await edit((D1) => applyOvertimeD(D1, R0, ids), (n) => "已分配 " + n + " 門課", { undo: true });
                }}
              >
                套用勾選的
              </Button>
            </>
          }
        >
          <p className="mb-2 text-sm text-mute">
            勾選的才會改。
            <Tip>一定遵守：每週超鐘點不超過老師願意的節數和全校上限；不給老師不想教的科目；扣掉老師不排課的時段後排不下的不給。盡量做到：先補還沒滿應授的老師、超鐘點平均分、想教的科目與年級優先、同一位學生的課給同一位老師。</Tip>
          </p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sug.over}
              onChange={(e) => {
                const R = suggestOvertimeD(D, e.target.checked);
                setSug({ R, on: new Set(R.list.map((x) => x.gid)), over: e.target.checked });
              }}
            />
            超過上限的老師，多出來的課也重新分
          </label>
          {sug.R.list.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[13px] text-mute">
                    <th className="p-1.5">
                      <input type="checkbox" aria-label="全選" checked={sug.on.size === sug.R.list.length} onChange={(e) => setSug({ ...sug, on: new Set(e.target.checked ? sug.R.list.map((x) => x.gid) : []) })} />
                    </th>
                    <th className="p-1.5 font-normal">課</th>
                    <th className="p-1.5 font-normal">節數</th>
                    <th className="p-1.5 font-normal">原本</th>
                    <th className="p-1.5 font-normal">建議</th>
                    <th className="p-1.5 font-normal">理由</th>
                  </tr>
                </thead>
                <tbody>
                  {sug.R.list.map((x) => (
                    <tr key={x.gid} className="border-t border-line">
                      <td className="p-1.5">
                        <input
                          type="checkbox"
                          aria-label={x.name}
                          checked={sug.on.has(x.gid)}
                          onChange={(e) => {
                            const on = new Set(sug.on);
                            if (e.target.checked) on.add(x.gid);
                            else on.delete(x.gid);
                            setSug({ ...sug, on });
                          }}
                        />
                      </td>
                      <td className="p-1.5">
                        {x.name}
                        <small className="text-mute"> {x.subject}</small>
                      </td>
                      <td className="p-1.5">{x.per}</td>
                      <td className="p-1.5 text-mute">{x.fromName || "沒有"}</td>
                      <td className="p-1.5 font-bold">{x.toName}</td>
                      <td className="p-1.5 text-mute">{x.why.join("、")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-mute">{sug.R.left.length ? "沒有老師可以接。" : "沒有要分配的課。"}</p>
          )}
          {sug.R.left.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer">分不出去 {sug.R.left.length} 門</summary>
              <ul className="mt-1 text-sm">
                {sug.R.left.map((x) => (
                  <li key={x.gid}>
                    <b>{x.name}</b>（{x.per} 節）<small className="text-mute">{x.why.join("；")}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <h4 className="mt-4 mb-1 font-bold">分配後</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[13px] text-mute">
                  <th className="p-1.5 font-normal">老師</th>
                  <th className="p-1.5 font-normal">應授</th>
                  <th className="p-1.5 font-normal">分配後</th>
                  <th className="p-1.5 font-normal">超鐘點</th>
                  <th className="p-1.5 font-normal">上限</th>
                </tr>
              </thead>
              <tbody>
                {sug.R.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="p-1.5">{r.name}</td>
                    <td className="p-1.5">{r.due}</td>
                    <td className="p-1.5">
                      {r.after}
                      {r.extra ? <small className="text-mute">＋外加 {r.extra}</small> : null}
                    </td>
                    <td className={cx("p-1.5", r.ot > r.limit && "text-bad")}>{r.ot ? "+" + r.ot : "—"}</td>
                    <td className="p-1.5 text-mute">{r.limit || "不超"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Dialog>
      )}
      {drop && (
        <Dialog
          title="不上這科，還是待安排？"
          onClose={() => setDrop(null)}
          foot={
            <Button
              tone="primary"
              className="pri"
              onClick={() => {
                const no = drop.filter((o) => o.no);
                setDrop(null);
                if (no.length) edit((D1) => dropNeedsD(D1, no));
              }}
            >
              確定
            </Button>
          }
        >
          <p className="mb-3 text-sm text-mute">這些學生這一科已經不在任何一門課裡。</p>
          <table className="w-full text-sm">
            <tbody>
              {drop.map((o, j) => {
                const s = byId[o.id];
                return (
                  <tr key={o.id + o.subject} className="border-t border-line">
                    <td className="p-1.5">{s ? stuLabel(s) : o.id}</td>
                    <td className="p-1.5">{o.subject}</td>
                    <td className="p-1.5 whitespace-nowrap">
                      <label className="mr-3">
                        <input type="radio" checked={o.no} onChange={() => setDrop(drop.map((x, k) => (k === j ? { ...x, no: true } : x)))} /> 不上
                      </label>
                      <label>
                        <input type="radio" checked={!o.no} onChange={() => setDrop(drop.map((x, k) => (k === j ? { ...x, no: false } : x)))} /> 待安排
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Dialog>
      )}
    </div>
  );

  // 選學生對話框關掉之後：拿掉的學生這一科沒有課了就問（舊版 pickList 關閉時的 askDrop）
  function askDropLater(list: { id: string; subject: string }[]) {
    askDrop(dropAsk(D, list));
  }
}

/** 固定時段（舊版 fixOpen／fixOk）：最多 per 節，重排也不會動 */
function FixDialog({ gid, onClose }: { gid: string; onClose: () => void }) {
  const { D, edit } = useSched();
  const g = D.groups.find((x) => x.id === gid)!;
  const [cur, setCur] = useState(new Set((g.fixed as string[]) || []));
  const reg = D.periods.filter((p) => (g.mode === "外加" ? p.extra : !p.extra));
  return (
    <Dialog
      title={"固定時段：" + g.name}
      onClose={onClose}
      foot={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            tone="primary"
            className="pri"
            onClick={async () => {
              const ks = [...cur];
              if (ks.length > g.per) return toast("最多勾 " + g.per + " 個時段");
              onClose();
              await edit((D1) => setFixedD(D1, gid, ks), ks.length ? "已設定 " + ks.length + " 個固定時段" : "已取消固定時段", { undo: true });
            }}
          >
            儲存
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-mute">
        最多 {g.per} 節，重排也不會動。
        <Tip>剩下的節數照常自動排。班級不排課只擋要鎖課的課，所以社會技巧可以固定在導師時間這類時段。</Tip>
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th />
              {CORE.DAYS.map((d) => (
                <th key={d} className="px-2 py-1 font-normal text-mute">
                  週{d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reg.map((p) => (
              <tr key={p.id}>
                <td className="pr-2 whitespace-nowrap">{p.name}</td>
                {CORE.DAYS.map((d, di) => {
                  const k = di + "-" + p.id;
                  return (
                    <td key={k} className="text-center">
                      <input
                        type="checkbox"
                        className="size-5"
                        aria-label={"週" + d + p.name}
                        checked={cur.has(k)}
                        onChange={(e) => {
                          const n = new Set(cur);
                          if (e.target.checked) n.add(k);
                          else n.delete(k);
                          setCur(n);
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

/** 選學生（舊版 pickList）：依班級列出，勾選就加入／拿掉；同科目已在別組的會註明 */
function PickDialog({ gid, onClose }: { gid: string; onClose: (gone: string[]) => void }) {
  const { D, edit, busy } = useSched();
  const g = D.groups.find((x) => x.id === gid)!;
  const [gone, setGone] = useState<string[]>([]);
  const same: Record<string, string> = {};
  D.groups.forEach((o) => {
    if (o.id !== gid && o.subject === g.subject) o.students.forEach((id) => (same[id] = o.name));
  });
  const by: Record<string, typeof D.students> = {};
  D.students
    .slice()
    .sort(sortStu)
    .forEach((s) => (by[s.cls] = by[s.cls] || []).push(s));
  const tog = (id: string) =>
    edit((D1) => {
      const x = D1.groups.find((y) => y.id === gid)!;
      const k = x.students.indexOf(id);
      if (k >= 0) x.students.splice(k, 1);
      else x.students.push(id);
    }).then(() => (g.students.includes(id) ? setGone([...gone, id]) : setGone(gone.filter((x) => x !== id))));
  return (
    <Dialog
      title={g.name + "的學生"}
      onClose={() => onClose(gone)}
      foot={
        <Button tone="primary" className="pri" onClick={() => onClose(gone)}>
          完成
        </Button>
      }
    >
      {!D.students.length && <p className="text-mute">還沒有學生。</p>}
      {Object.keys(by).map((c) => (
        <div key={c} className="mb-2">
          <div className="mb-1 text-[13px] font-bold text-mute">{c}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {by[c].map((s) => (
              <label key={s.id} className="flex min-h-9 items-center gap-1.5 text-sm">
                <input type="checkbox" disabled={busy} checked={g.students.includes(s.id)} onChange={() => tog(s.id)} />
                {s.name}
                {same[s.id] && <small className="text-mute">已在{same[s.id]}</small>}
              </label>
            ))}
          </div>
        </div>
      ))}
    </Dialog>
  );
}

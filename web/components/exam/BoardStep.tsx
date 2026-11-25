"use client";
/* ③ 排考場（舊版 renderBoard、cellHtml、renderTally）：自動排列、補排未排入、換一組、復原；拖曳學生換教室（拖過的固定）、點一下固定／取消；
   滑到學生上標出他每一節在哪；每一格選主監考、支援、備註（手動選的不會被自動排列換掉）；下面是監考統計。 */
import { Pin, Shuffle, Undo2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Empty, cx } from "@/components/ui";
import Link from "next/link";
import { capTxt, evaluate, fmt, fromState, GN, labelOf, sesLabel, shortName, sortDates, type ExModel } from "@/lib/nx/examCore";
import { autoProctor, busyHint, cellMap, f1, gradeCount, groupsOf, isT, procMatrix, tally, waitMap, type Ctx } from "@/lib/nx/examOut";
import { useExam } from "./useExam";
type Msg = { t: number; r: number; lvl: string; m: string };

export function BoardStep() {
  const { X, E, canEdit, edit, solve, undo } = useExam();
  const [hl, setHl] = useState<number | null>(null);
  const [over, setOver] = useState("");
  const view = useMemo(() => {
    const out = { msgs: [] as Msg[], unassigned: 0, uses: 0, changes: 0 };
    evaluate(X.M, X.ST, out);
    return { out, cells: cellMap(X), waits: waitMap(X), waitRoom: X.M.rooms.findIndex((r: { type: string }) => r.type === "wait") };
  }, [X]);
  const T = useMemo(() => tally(X), [X]);
  const { M, ST } = X;
  const { out, cells, waits, waitRoom } = view;
  const showUn = out.unassigned > 0;
  const errs = out.msgs;
  const unNames = [...new Set(M.parts.filter((P: unknown, p: number) => ST.room[p] < 0).map((P: { stu: never; subject: string }) => shortName(P.stu) + "（" + P.subject + "）"))];
  const extra: [string, string][] = [
    ...(showUn ? [["err", "未排入 " + out.unassigned + " 人次：" + unNames.join("、")] as [string, string]] : []),
    ...M.noPart.map((x: { stu: { cls?: string; seat?: string; name?: string }; why: string }) => ["err", "沒有對應的考程：" + (x.stu.cls || "") + (x.stu.seat ? "-" + x.stu.seat : "") + " " + (x.stu.name || "") + "（" + x.why + "）"] as [string, string]),
    ...M.multi.map((x: { g: number; subject: string; n: number; mk: boolean }) => ["warn", (GN[x.g] || x.g) + "年級「" + x.subject + "」有 " + x.n + " 節，每節各排一次" + (x.mk ? "，補考節不用" : "")] as [string, string]),
  ];
  const bad = errs.length || extra.length;
  const dates = sortDates([...new Set<string>(M.ses.map((s: { date: string }) => s.date))]);

  const commit = (fn: (Xc: Ctx) => void | false | string, undoable = true) =>
    edit((e, Xc) => {
      const r = fn(Xc);
      if (r === false) return false;
      e.assign = fromState(Xc.M, Xc.ST);
      return r;
    }, { undo: undoable });
  const move = (p: number, t: number, r: number) =>
    commit((Xc) => {
      const P = Xc.M.parts[p];
      if (!P) return false;
      if (!P.all.includes(t)) return "只能移到「" + P.subject + "」的節次";
      if (Xc.ST.ses[p] === t && Xc.ST.room[p] === r) return false;
      Xc.ST.ses[p] = t;
      Xc.ST.room[p] = r;
      Xc.ST.pin[p] = r >= 0 ? 1 : 0;
    });
  const pin = (p: number) =>
    commit((Xc) => {
      Xc.ST.pin[p] = Xc.ST.pin[p] ? 0 : 1;
    });
  const setProc = (k: string, v: string, sup: boolean) =>
    edit((e) => {
      if (sup) {
        e.supMan = e.supMan || {};
        if (v) {
          e.supportOf[k] = v;
          e.supMan[k] = 1;
        } else {
          delete e.supportOf[k];
          delete e.supMan[k];
        }
      } else {
        e.procMan = e.procMan || {};
        if (v) {
          e.proctorOf[k] = v;
          e.procMan[k] = 1;
        } else {
          delete e.proctorOf[k];
          delete e.procMan[k];
        }
      }
    });
  const setNote = (k: string, v: string) =>
    edit((e) => {
      if ((e.notes[k] || "") === v) return false;
      if (v) e.notes[k] = v;
      else delete e.notes[k];
    });

  const chip = (p: number, wt?: boolean) => {
    const P = M.parts[p];
    const s = P.stu;
    return (
      <span
        key={(wt ? "w" : "") + p}
        className={cx("chip", "g" + (GN[P.g] ? P.g : 0), !!ST.pin[p] && !wt && "pin", wt && "wt", hl === P.si && "hl")}
        draggable={!wt && canEdit}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(p))}
        onClick={wt || !canEdit ? undefined : () => pin(p)}
        onMouseEnter={() => setHl(P.si)}
        onMouseLeave={() => setHl(null)}
        title={s.cls + (s.seat ? "-" + s.seat : "") + " " + s.name + "｜" + P.subject + "：" + labelOf(P) + (P.small && labelOf(P) !== "獨立" ? "、人數調整" : "") + (s.memo ? "｜" + s.memo : "")}
      >
        {shortName(s)}
        {ST.pin[p] && !wt ? <Pin size={11} strokeWidth={1.7} /> : null}
      </span>
    );
  };
  const cell = (t: number, r: number) => {
    const Tn = M.ses[t],
      R = r >= 0 ? M.rooms[r] : null,
      key = Tn.id + "|" + (R ? R.id : ""),
      list = cells[t + "|" + r] || [],
      wait = R && r === waitRoom ? waits[t] || [] : [],
      ce = errs.filter((e) => e.t === t && e.r === r && r >= 0),
      k = t + "|" + r;
    const drop = {
      onDragOver: (e: React.DragEvent) => {
        if (!canEdit) return;
        e.preventDefault();
        if (over !== k) setOver(k);
      },
      onDragLeave: () => setOver(""),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver("");
        const p = +e.dataTransfer.getData("text/plain");
        if (!isNaN(p)) move(p, t, r);
      },
    };
    const cls = cx("cell", ce.some((e) => e.lvl === "err") && "bad", r < 0 && "un", over === k && "over");
    if (!list.length && !wait.length)
      return (
        <td key={k} className={cls} {...drop}>
          <div className="hint">{R ? busyHint(M, t, r) : ""}</div>
        </td>
      );
    const hasExt = list.some((p) => M.parts[p].ext);
    const pm = E.procMan && E.procMan[key] && E.proctorOf[key],
      sm = E.supMan && E.supMan[key] && E.supportOf[key];
    const rd = list.filter((p) => M.parts[p].read).length;
    return (
      <td key={k} className={cls} {...drop}>
        {list.length > 0 && (
          <>
            <div className="ch">
              <span>{R && hasExt ? fmt(Tn.est) + "~" + fmt(Tn.een) : ""}</span>
              <span className={cx("n", R && list.length >= R.cap && "full")}>
                {list.length}
                {R && R.type !== "wait" && R.cap < 999 ? "／" + R.cap : ""} 人
              </span>
            </div>
            {groupsOf(M, list).map((g) => (
              <div key={g.l}>
                <div className="gl">➢{g.l}</div>
                {g.ps.sort((a, b) => M.parts[b].g - M.parts[a].g || M.parts[a].si - M.parts[b].si).map((p) => chip(p))}
              </div>
            ))}
            {R && (
              <div className="ch" style={{ marginTop: 3 }}>
                <span>{gradeCount(M, list)}</span>
                <span>{rd ? "平板" + rd : ""}</span>
              </div>
            )}
          </>
        )}
        {wait.length > 0 && (
          <>
            <div className="gl">
              自習等候（{wait.length}人{R && R.cap < 999 ? "／上限" + R.cap : ""}，之後補考）
            </div>
            {wait.map((p) => chip(p, true))}
          </>
        )}
        {ce.map((e, i) => (
          <div key={i} className={"cm " + e.lvl}>
            {e.m}
          </div>
        ))}
        {R && (
          <div className="cf">
            <select aria-label="監考" className={pm ? "man" : undefined} title={pm ? "手動指定：自動排列不會換掉；選回「監考…」就改回自動" : undefined} value={E.proctorOf[key] || ""} disabled={!canEdit} onChange={(e) => setProc(key, e.target.value, false)}>
              <option value="">{wait.length && !list.length ? "監視" : "監考"}…</option>
              {E.proctors.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {(E.proctors.some((n) => isT(E, n)) || E.supportOf[key]) && (
              <select aria-label="支援" className={sm ? "man" : undefined} value={E.supportOf[key] || ""} disabled={!canEdit} onChange={(e) => setProc(key, e.target.value, true)}>
                <option value="">支援…</option>
                {E.proctors
                  .slice()
                  .sort((a, b) => +isT(E, b) - +isT(E, a))
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            )}
            <input key={key + (E.notes[key] || "")} aria-label="備註" placeholder="備註" defaultValue={E.notes[key] || ""} disabled={!canEdit} onBlur={(e) => setNote(key, e.target.value)} />
          </div>
        )}
      </td>
    );
  };

  return (
    <div className="xb">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button tone="primary" disabled={!canEdit} onClick={() => solve("all")}>
          <Wand2 size={16} />
          自動排列
        </Button>
        <Button disabled={!canEdit} onClick={() => solve("fill")}>
          補排未排入
        </Button>
        <Button disabled={!canEdit} onClick={() => solve("next")}>
          <Shuffle size={16} />
          換一組
        </Button>
        <Button disabled={!canEdit} onClick={undo}>
          <Undo2 size={16} />
          復原
        </Button>
        <details className="relative">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-full border border-line2 bg-card px-4 text-[15px] hover:bg-hover">更多</summary>
          <div className="absolute z-30 mt-1 flex w-72 flex-col gap-2 rounded-2xl border border-line bg-card p-4 shadow-lg">
            <label className="flex items-center gap-2 text-sm text-ink2">
              少用考場
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                className="flex-1 accent-ink"
                defaultValue={E.settings.pref ?? 50}
                disabled={!canEdit}
                onChange={(e) => edit((d) => void (d.settings.pref = +e.target.value), { msg: "按「自動排列」套用" })}
              />
              少換教室
            </label>
            <Button disabled={!canEdit} onClick={() => commit((Xc) => (Xc.ST.pin.fill(0), "已解除全部固定"))}>
              解除全部固定
            </Button>
            <Button disabled={!canEdit} onClick={() => edit((e, Xc) => autoProctor(Xc, false, false), { undo: true })}>
              重新分配監考
            </Button>
          </div>
        </details>
        <span className="grow" />
        <span className="text-sm text-mute">
          試場 <b className="text-lg text-ink tabular-nums">{out.uses}</b> 間次　換教室 <b className="text-lg text-ink tabular-nums">{out.changes}</b> 人次
          {showUn && (
            <span className="text-bad">
              　未排入 <b className="text-lg tabular-nums">{out.unassigned}</b>
            </span>
          )}
        </span>
      </div>
      <div className={cx("warnbox", !bad && "ok")}>
        {bad
          ? [
              ...extra.map(([l, m], i) => (
                <div key={"x" + i} className={l}>
                  ● {m}
                </div>
              )),
              ...errs.map((e, i) => (
                <div key={i} className={e.lvl}>
                  ● {M.ses[e.t].date + " " + sesLabel(M.ses[e.t])}
                  {e.r >= 0 ? " " + M.rooms[e.r].name : ""}：{e.m}
                </div>
              )),
            ]
          : "沒有違規"}
      </div>
      {dates.length ? (
        <div className="overflow-x-auto">
          {dates.map((d) => {
            const list = M.ses.filter((s: { date: string }) => s.date === d).sort((a: { key: number }, b: { key: number }) => a.key - b.key);
            return (
              <table key={d} className="board">
                <thead>
                  <tr>
                    <th>
                      {d} 星期{list[0].ref.dow || ""}
                    </th>
                    {showUn && <th style={{ background: "var(--warn-l)" }}>未排入</th>}
                    {M.rooms.map((R: { i: number; name: string; type: string; cap: number }) => (
                      <th key={R.i}>
                        {R.name}
                        <br />
                        <small>
                          {R.type === "wait"
                            ? "自習等候" + (list.some((T2: { waitExam: boolean }) => T2.waitExam) ? "＋考試" : "") + "・上限" + capTxt(R.cap)
                            : R.type === "pc"
                              ? "電腦・上限" + capTxt(R.cap)
                              : (R.type === "spare" ? "備用・" : "") + "上限" + capTxt(R.cap)}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((Tn: ExModel) => {
                    const t = Tn.i,
                      sm = errs.filter((e) => e.t === t && e.r < 0);
                    return (
                      <tr key={t}>
                        <td className="sh">
                          <div className="sub">{sesLabel(Tn)}</div>
                          <div className="tm">{Tn.ref.period || ""}</div>
                          <div className="tm">
                            {fmt(Tn.st)}~{fmt(Tn.en)}
                          </div>
                          {(Tn.est !== Tn.st || Tn.een !== Tn.en) && (
                            <div className="ex">
                              延長 {fmt(Tn.est)}~{fmt(Tn.een)}
                            </div>
                          )}
                          {Tn.split && <div className="ex">分年級</div>}
                          {sm.map((e, i) => (
                            <div key={i} className="cm warn">
                              {e.m}
                            </div>
                          ))}
                        </td>
                        {showUn && cell(t, -1)}
                        {M.rooms.map((R: { i: number }) => cell(t, R.i))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })}
        </div>
      ) : (
        <Empty
          action={
            <Link href="/admin/exam/?step=set" className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 hover:bg-hover">
              設定考程
            </Link>
          }
        >
          還沒有考試節次
        </Empty>
      )}
      <Tally T={T} X={X} />
    </div>
  );
}

function Tally({ T, X }: { T: ReturnType<typeof tally>; X: Ctx }) {
  const { edit, canEdit } = useExam();
  const { D } = X;
  const names = D.proctors;
  const Q = T.Q;
  return (
    <section className="mt-2 rounded-2xl border border-line bg-card p-5">
      <h3 className="mb-2 text-[17px] font-bold">
        監考統計
        <small className="text-sm font-normal text-mute">
          {T.used.length} 場＝{f1(Q.W)} 節{T.supN ? "・支援 " + T.supN + " 場次" : ""}
        </small>
      </h3>
      {!names.length ? (
        <Empty
          action={
            <Link href="/admin/exam/?step=set" className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 hover:bg-hover">
              填監考老師
            </Link>
          }
        >
          還沒有監考老師
        </Empty>
      ) : (
        <>
          {T.miss > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-[10px] bg-warn-l px-3 py-1.5 text-sm text-warn">
              {T.miss} 場沒有主監考
              <Button size="sm" disabled={!canEdit} onClick={() => edit((e, Xc) => autoProctor(Xc, true, false), { undo: true })}>
                補齊
              </Button>
            </div>
          )}
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="ed">
              <tbody>
                <tr>
                  <th>老師</th>
                  {names.map((n) => (
                    <td key={n} className="text-center">
                      <b>{n}</b>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>應授課節數</th>
                  {names.map((n) => (
                    <td key={n} className="text-center">
                      {isT(D, n) ? <small className="text-mute">臨時支援</small> : String((D.proctorInfo[n] || {}).teach ?? "")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>應監考（節）</th>
                  {names.map((n) => (
                    <td key={n} className="text-center">
                      {isT(D, n) ? "—" : f1(Q.q[n])}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>已排（節）</th>
                  {names.map((n) => (
                    <td key={n} className={cx("text-center", !isT(D, n) && (Math.abs(T.cnt[n] - Q.q[n]) <= 0.5 ? "q-ok" : "q-bad"))}>
                      {f1(T.cnt[n])}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>場次</th>
                  {names.map((n) => (
                    <td key={n} className="text-center">
                      {T.num[n]}
                      {(T.extc[n] || T.supc[n]) > 0 && <small className="text-mute">（{[T.extc[n] ? "延長 " + T.extc[n] : "", T.supc[n] ? "支援 " + T.supc[n] : ""].filter(Boolean).join("、")}）</small>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {T.conf.map((c, i) => (
            <div key={i} className="cm">
              ● {c}
            </div>
          ))}
          <h4 className="mt-4 mb-1.5 text-[15px] font-bold">每位老師的場次</h4>
          <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: procMatrix(X, "pm", T.used) }} />
        </>
      )}
    </section>
  );
}

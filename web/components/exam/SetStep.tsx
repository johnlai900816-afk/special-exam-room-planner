"use client";
/* ② 考程與教室（舊版 renderSet、renderProc、renderDays）：01 考試日期 02 監考老師 03 考試節次（每一節的「更多」：口頭上限、口頭獨立、分年級、
   不計誦讀、補考節、自習教室開放考試；全部開／全部關）04 教室（電腦、備用、自習等候；有獨立考場學生的試場上限）。 */
import { ChevronDown, ClipboardPaste, Mic, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/sched/common";
import { toast } from "@/components/Toast";
import { Button, Empty, SectionTitle, Textarea, cx } from "@/components/ui";
import { GN, normDate, sesLabel, sortDates, type ExamD, type ExSession } from "@/lib/nx/examCore";
import { autoProctor, dateOf, DOW, f1, isT, noteToOff, pasteProc, pinfo, procQuota, procSlots, usedNow } from "@/lib/nx/examOut";
import { useExam } from "./useExam";

const numOrBlank = (v: string) => (String(v).trim() === "" ? "" : +v);
const iso = (d: Date | null) => (d ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : "");
const FL: [keyof ExSession, string][] = [
  ["oralSep", "口頭獨立一間"],
  ["split", "分年級"],
  ["noRead", "不計誦讀"],
  ["makeup", "補考節"],
  ["waitExam", "自習教室開放考試"],
];
const TYPES: Record<string, string> = { normal: "一般", pc: "電腦教室", spare: "備用", wait: "自習等候" };

export function SetStep() {
  return (
    <div className="xb flex flex-col gap-4">
      <Days />
      <Proctors />
      <Sessions />
      <Rooms />
    </div>
  );
}

function Sec({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <SectionTitle no={no}>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Days() {
  const { E, edit, canEdit } = useExam();
  const ds = sortDates([...new Set(E.sessions.map((s) => s.date))]);
  const setDay = (k: number, v: string) =>
    edit((e) => {
      const old = sortDates([...new Set(e.sessions.map((s) => s.date))])[k];
      if (!v || old == null) return false;
      const a = v.split("-"),
        nd = +a[1] + "/" + +a[2],
        dw = DOW[new Date(+a[0], +a[1] - 1, +a[2]).getDay()];
      if (nd !== old && e.sessions.some((s) => s.date === nd)) return "已經有 " + nd + " 這一天了";
      e.sessions.forEach((s) => {
        if (s.date === old) {
          s.date = nd;
          s.dow = dw;
        }
      });
      return "已改成 " + nd + "（" + dw + "）";
    });
  return (
    <Sec no={1} title="考試日期">
      {!ds.length ? (
        <p className="text-sm text-mute">新增考試節次後，這裡會列出每一天</p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {ds.map((d, k) => {
            const ss = E.sessions.filter((s) => s.date === d);
            return (
              <label key={d} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-3 py-2">
                <span className="text-[13px] text-mute">第 {k + 1} 天</span>
                <input type="date" className="min-h-9 rounded-lg border border-line2 bg-field px-2" defaultValue={iso(dateOf(E, d, ss[0].dow))} key={d} disabled={!canEdit} onChange={(e) => setDay(k, e.target.value)} />
                <b>星期{ss[0].dow || "？"}</b>
                <small className="text-[13px] text-mute">{ss.length} 節</small>
              </label>
            );
          })}
        </div>
      )}
    </Sec>
  );
}

function Proctors() {
  const { E, X, edit, canEdit } = useExam();
  const [paste, setPaste] = useState(false);
  const slots = procSlots(X.M),
    Q = procQuota(E, usedNow(X)),
    sesL = X.M.ses.slice().sort((a: { key: number }, b: { key: number }) => a.key - b.key);
  const P = (i: number, fn: (e: ExamD, n: string) => void | false | string) => edit((e) => fn(e, e.proctors[i]));
  const man = E.proctors.filter((n) => !isT(E, n) && !((E.proctorInfo[n] || {}).quota === "" || (E.proctorInfo[n] || {}).quota == null)).length;
  const bad = (!Q.auto && Math.abs(Q.fixed - Q.W) > 0.01) || Q.fixed > Q.W + 0.01;
  return (
    <Sec no={2} title="監考老師">
      <div className="mb-3 flex flex-wrap gap-2">
        <Button disabled={!canEdit} onClick={() => setPaste(true)}>
          <ClipboardPaste size={16} />
          貼上老師表
        </Button>
        <Button
          disabled={!canEdit}
          onClick={() =>
            edit((e) => {
              let n = "老師" + (e.proctors.length + 1);
              while (e.proctors.includes(n)) n += "_";
              e.proctors.push(n);
            })
          }
        >
          <Plus size={16} />
          老師
        </Button>
        <Button
          disabled={!canEdit}
          onClick={() =>
            edit((e) => {
              let n = "支援" + (e.proctors.filter((x) => isT(e, x)).length + 1);
              while (e.proctors.includes(n)) n += "_";
              e.proctors.push(n);
              e.proctorInfo[n] = { temp: true, quota: "", only: [], oralOnly: false, note: "" };
              return "已新增，請改名並選支援範圍";
            })
          }
        >
          <Plus size={16} />
          臨時支援
        </Button>
      </div>
      {!E.proctors.length ? (
        <Empty>還沒有監考老師</Empty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="ed">
              <thead>
                <tr>
                  <th>老師</th>
                  <th>身分</th>
                  <th>應授課節數</th>
                  <th>這次監考</th>
                  <th>不排時段／支援範圍</th>
                  <th>備註</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {E.proctors.map((n, i) => {
                  const f = E.proctorInfo[n] || {},
                    off = f.off || [],
                    only = f.only || [],
                    T = !!f.temp,
                    mn = !(f.quota === "" || f.quota == null);
                  const chip = (on: boolean, txt: React.ReactNode, onTog: (v: boolean) => void, k: string) => (
                    <label key={k} className={cx(on && "on")}>
                      <input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => onTog(e.target.checked)} />
                      {txt}
                    </label>
                  );
                  return (
                    <tr key={n}>
                      <td>
                        <input
                          type="text"
                          aria-label="老師"
                          style={{ width: 90 }}
                          defaultValue={n}
                          key={n}
                          disabled={!canEdit}
                          onBlur={(e) =>
                            P(i, (d, old) => {
                              const v = e.target.value.trim();
                              if (!v || v === old) return false;
                              if (d.proctors.includes(v)) return "已經有同名的老師了";
                              d.proctors[i] = v;
                              if (d.proctorInfo[old]) {
                                d.proctorInfo[v] = d.proctorInfo[old];
                                delete d.proctorInfo[old];
                              }
                              for (const k in d.proctorOf) if (d.proctorOf[k] === old) d.proctorOf[k] = v;
                              for (const k in d.supportOf) if (d.supportOf[k] === old) d.supportOf[k] = v;
                            })
                          }
                        />
                      </td>
                      <td>
                        <select aria-label="身分" value={T ? "1" : ""} disabled={!canEdit} onChange={(e) => P(i, (d, nm) => void Object.assign(pinfo(d, nm), { temp: e.target.value === "1", quota: "" }))}>
                          <option value="">正式</option>
                          <option value="1">臨時支援</option>
                        </select>
                      </td>
                      {T ? (
                        <>
                          <td className="text-center text-mute">—</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              style={{ width: 64 }}
                              aria-label="最多幾節"
                              title="最多排幾節；留白＝能排就排"
                              placeholder="不限"
                              defaultValue={mn ? String(f.quota) : ""}
                              key={"q" + String(f.quota)}
                              disabled={!canEdit}
                              onBlur={(e) => P(i, (d, nm) => void (pinfo(d, nm).quota = numOrBlank(e.target.value)))}
                            />
                          </td>
                          <td>
                            <div className="offs sup">
                              {chip(!!f.oralOnly, <><Mic size={13} className="inline" /> 只支援口頭</>, (v) => P(i, (d, nm) => void (pinfo(d, nm).oralOnly = v)), "oral")}
                              {sesL.map((S: { id: string; date: string; subject: string; makeup: boolean }) =>
                                chip(only.includes(S.id), S.date + " " + sesLabel(S), (v) => P(i, (d, nm) => {
                                  const ff = pinfo(d, nm);
                                  ff.only = (ff.only || []).filter((x) => x !== S.id);
                                  if (v) ff.only.push(S.id);
                                }), S.id),
                              )}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <input type="number" min={0} style={{ width: 64 }} aria-label="應授課節數" defaultValue={f.teach == null ? "" : String(f.teach)} key={"t" + String(f.teach)} disabled={!canEdit} onBlur={(e) => P(i, (d, nm) => {
                              const ff = pinfo(d, nm);
                              delete ff.autoT; // 自己改了，之後不再用名冊的每週節數蓋掉
                              ff.teach = numOrBlank(e.target.value);
                            })} />
                          </td>
                          <td className="whitespace-nowrap">
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              style={{ width: 64 }}
                              aria-label="這次監考"
                              title="留白＝按應授課節數比例；填數字＝指定這位老師的節數"
                              placeholder={f1(Q.q[n] ?? 0)}
                              defaultValue={mn ? String(f.quota) : ""}
                              key={"q" + String(f.quota)}
                              disabled={!canEdit}
                              onBlur={(e) => P(i, (d, nm) => void (pinfo(d, nm).quota = numOrBlank(e.target.value)))}
                            />
                            {mn && <small className="ml-1 text-warn">指定</small>}
                          </td>
                          <td>
                            <div className="offs">
                              {slots.map((s) =>
                                chip(off.includes(s.k), (s.dow ? "週" + s.dow : s.date) + (s.pm ? "下午" : "上午"), (v) => P(i, (d, nm) => {
                                  const ff = pinfo(d, nm);
                                  ff.off = (ff.off || []).filter((x) => x !== s.k);
                                  if (v) ff.off.push(s.k);
                                }), s.k),
                              )}
                            </div>
                          </td>
                        </>
                      )}
                      <td>
                        <input
                          type="text"
                          aria-label="備註"
                          style={{ width: 180 }}
                          placeholder={T ? "例：只來幫忙國文口頭" : "例：週二下午不排監考"}
                          defaultValue={f.note || ""}
                          key={"n" + (f.note || "")}
                          disabled={!canEdit}
                          onBlur={(e) =>
                            P(i, (d, nm) => {
                              const ff = pinfo(d, nm),
                                v = e.target.value;
                              if ((ff.note || "") === v.trim()) return false;
                              const old = noteToOff(ff.note) || [],
                                o = noteToOff(v) || [];
                              ff.note = v.trim();
                              ff.off = [...new Set((ff.off || []).filter((x) => !old.includes(x)).concat(o))];
                              if (o.length) return "已依備註設定不排時段";
                            })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          aria-label="刪除"
                          className="flex size-9 items-center justify-center rounded-full text-mute hover:bg-hover hover:text-bad disabled:opacity-40"
                          disabled={!canEdit}
                          onClick={() =>
                            confirm("刪除 " + n + "？他的監考會變成未指定。") &&
                            P(i, (d, nm) => {
                              d.proctors.splice(i, 1);
                              delete d.proctorInfo[nm];
                              for (const k in d.proctorOf) if (d.proctorOf[k] === nm) delete d.proctorOf[k];
                              for (const k in d.supportOf) if (d.supportOf[k] === nm) delete d.supportOf[k];
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2 text-sm">
            <span className="rounded-[10px] bg-sunk px-3 py-1.5 text-ink2">
              共 <b>{Q.used}</b> 場{Q.tempN ? "（支援 " + Q.tempN + "）" : ""}＝<b>{f1(Q.W)}</b> 節，按授課比例分給 {Q.regs} 位
            </span>
            {Q.noTeach > 0 && <span className="rounded-[10px] bg-warn-l px-3 py-1.5 text-warn">{Q.noTeach} 位沒填授課節數，先用平均</span>}
            {man > 0 && (
              <span className={cx("rounded-[10px] px-3 py-1.5", bad ? "bg-warn-l text-warn" : "bg-sunk text-ink2")}>
                {man} 位指定節數{bad ? "，合計不是 " + f1(Q.W) + " 節" : ""}{" "}
                <button type="button" className="text-blue" disabled={!canEdit} onClick={() => edit((e) => void e.proctors.forEach((n) => (pinfo(e, n).quota = "")))}>
                  改回按比例
                </button>
              </span>
            )}
          </div>
        </>
      )}
      {paste && <PasteProc onClose={() => setPaste(false)} />}
    </Sec>
  );
}

function PasteProc({ onClose }: { onClose: () => void }) {
  const { edit } = useExam();
  const [t, setT] = useState("");
  return (
    <Dialog
      title="貼上老師表"
      onClose={onClose}
      foot={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            tone="primary"
            onClick={() => {
              let n = 0;
              edit((e, Xc) => {
                n = pasteProc(e, t);
                if (n <= 0) return false;
                autoProctor(Xc, false, true);
                return "已套用 " + n + " 位老師";
              });
              if (n === 0) toast("讀不出老師的名字。");
              else onClose();
            }}
          >
            套用
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm text-mute">從 Word、Excel 或 Google 文件複製整張表，會取代目前的老師名單</p>
      <Textarea rows={9} className="w-full" placeholder={"王老師\t7\n陳老師\t4\t週二下午不排監考"} value={t} onChange={(e) => setT(e.target.value)} />
    </Dialog>
  );
}

function Sessions() {
  const { E, edit, canEdit } = useExam();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const S = (i: number, fn: (s: ExSession, e: ExamD) => void | false | string) => edit((e) => fn(e.sessions[i], e));
  const tx = (i: number, f: "period" | "subject", w: number) => (
    <input type="text" aria-label={f === "period" ? "節次" : "科目"} style={{ width: w }} defaultValue={String(E.sessions[i][f] ?? "")} key={f + E.sessions[i][f]} disabled={!canEdit} onBlur={(e) => S(i, (s) => (s[f] === e.target.value.trim() ? false : void (s[f] = e.target.value.trim())))} />
  );
  return (
    <Sec no={3} title="考試節次">
      {!E.sessions.length ? (
        <Empty>還沒有考試節次</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="ed">
            <thead>
              <tr>
                <th>日期</th>
                <th>星期</th>
                <th>節次</th>
                <th>科目</th>
                <th>年級</th>
                <th>時間</th>
                <th>延長</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {E.sessions.flatMap((s, i) => {
                const op = open.has(s.id),
                  on = FL.filter((f) => s[f[0]]).map((f) => f[1]);
                const rows = [
                  <tr key={s.id}>
                    <td>
                      <input
                        type="text"
                        aria-label="日期"
                        style={{ width: 64 }}
                        defaultValue={s.date}
                        key={"d" + s.date}
                        disabled={!canEdit}
                        onBlur={(e) =>
                          S(i, (x, d) => {
                            const v = normDate(e.target.value);
                            if (v === x.date) return false;
                            x.date = v;
                            const same = d.sessions.find((y) => y !== x && y.date === v && y.dow),
                              dt = dateOf(d, v);
                            x.dow = same ? same.dow : dt ? DOW[dt.getDay()] : x.dow;
                          })
                        }
                      />
                    </td>
                    <td className="text-center">{s.dow || ""}</td>
                    <td>{tx(i, "period", 64)}</td>
                    <td>{tx(i, "subject", 100)}</td>
                    <td className="whitespace-nowrap">
                      {[7, 8, 9].map((g) => (
                        <label key={g} className="mr-2 inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={s.grades.includes(g)}
                            disabled={!canEdit}
                            onChange={(e) =>
                              S(i, (x) => {
                                const a = x.grades.filter((y) => y !== g);
                                if (e.target.checked) a.push(g);
                                x.grades = a.sort();
                              })
                            }
                          />
                          {GN[g]}
                        </label>
                      ))}
                    </td>
                    <td className="whitespace-nowrap text-mute">
                      <input type="time" aria-label="開始" defaultValue={s.start} key={"s" + s.start} disabled={!canEdit} onBlur={(e) => S(i, (x) => (x.start === e.target.value ? false : void (x.start = e.target.value)))} /> –{" "}
                      <input type="time" aria-label="結束" defaultValue={s.end} key={"e" + s.end} disabled={!canEdit} onBlur={(e) => S(i, (x) => (x.end === e.target.value ? false : void (x.end = e.target.value)))} />
                    </td>
                    <td className="whitespace-nowrap text-mute">
                      <input type="number" min={0} style={{ width: 60 }} aria-label="延長分鐘" defaultValue={String(s.extMin)} key={"m" + s.extMin} disabled={!canEdit} onBlur={(e) => S(i, (x) => (+x.extMin === +e.target.value ? false : void (x.extMin = +e.target.value)))} /> 分{" "}
                      <select aria-label="延長方向" value={s.extMode} disabled={!canEdit} onChange={(e) => S(i, (x) => void (x.extMode = e.target.value))}>
                        <option value="before">提早</option>
                        <option value="after">延後</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-sm text-mute hover:bg-sunk hover:text-ink"
                        aria-expanded={op}
                        title={on.join("、") || undefined}
                        onClick={() => {
                          const n = new Set(open);
                          if (op) n.delete(s.id);
                          else n.add(s.id);
                          setOpen(n);
                        }}
                      >
                        更多
                        {on.length > 0 && <span className="rounded-full bg-blue-l px-1.5 text-xs font-bold text-blue">{on.length}</span>}
                        <ChevronDown size={15} className={cx("transition-transform", op && "rotate-180")} />
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label="刪除"
                        className="flex size-9 items-center justify-center rounded-full text-mute hover:bg-hover hover:text-bad disabled:opacity-40"
                        disabled={!canEdit}
                        onClick={() => confirm("刪除這個節次？") && edit((e) => void e.sessions.splice(i, 1))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>,
                ];
                if (op)
                  rows.push(
                    <tr key={s.id + "x"}>
                      <td colSpan={9} className="bg-bg">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink2">
                          <label className="inline-flex items-center gap-1.5">
                            口頭上限{" "}
                            <input type="number" min={0} style={{ width: 64 }} placeholder="不限" defaultValue={String(s.oralCap)} key={"o" + s.oralCap} disabled={!canEdit} onBlur={(e) => S(i, (x) => (String(x.oralCap) === e.target.value ? false : void (x.oralCap = numOrBlank(e.target.value))))} /> 人／間
                          </label>
                          {FL.map(([f, t]) => (
                            <label key={f} className="inline-flex items-center gap-1.5">
                              <input type="checkbox" checked={!!s[f]} disabled={!canEdit} onChange={(e) => S(i, (x) => void ((x as Record<string, unknown>)[f] = e.target.checked))} /> {t}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>,
                  );
                return rows;
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          disabled={!canEdit}
          onClick={() =>
            edit((e) => {
              const l: Partial<ExSession> = e.sessions[e.sessions.length - 1] || {};
              e.sessions.push({ id: "s" + Date.now().toString(36), date: l.date || "", dow: l.dow || "", period: "", subject: "新科目", grades: [7, 8, 9], start: "09:15", end: "10:00", extMin: 20, extMode: "after", oralCap: 8, split: false, noRead: false, makeup: false, oralSep: false, waitExam: false });
            })
          }
        >
          <Plus size={16} />
          節次
        </Button>
        <span className="grow" />
        <span className="text-sm text-mute">自習教室開放考試</span>
        {[true, false].map((on) => (
          <Button
            key={String(on)}
            size="sm"
            disabled={!canEdit}
            onClick={() =>
              edit((e) => {
                if (!e.rooms.some((r) => r.type === "wait")) {
                  toast("還沒有「自習等候」教室");
                  return false;
                }
                e.sessions.forEach((s) => (s.waitExam = on));
                return on ? "已全部開放，按「自動排列」套用" : "已全部關閉";
              })
            }
          >
            全部{on ? "開" : "關"}
          </Button>
        ))}
      </div>
    </Sec>
  );
}

function Rooms() {
  const { E, edit, canEdit } = useExam();
  const R = (i: number, fn: (r: ExamD["rooms"][number]) => void | false) => edit((e) => fn(e.rooms[i]));
  return (
    <Sec no={4} title="教室">
      {!E.rooms.length ? (
        <Empty>還沒有教室</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="ed">
            <thead>
              <tr>
                <th>教室</th>
                <th>人數上限</th>
                <th>類型</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {E.rooms.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    <input type="text" aria-label="教室" style={{ width: 140 }} defaultValue={r.name} key={"n" + r.name} disabled={!canEdit} onBlur={(e) => R(i, (x) => (x.name === e.target.value.trim() ? false : void (x.name = e.target.value.trim())))} />
                  </td>
                  <td>
                    <input type="number" min={0} aria-label="人數上限" style={{ width: 72 }} placeholder="不限" defaultValue={String(r.cap)} key={"c" + r.cap} disabled={!canEdit} onBlur={(e) => R(i, (x) => (String(x.cap) === e.target.value ? false : void (x.cap = numOrBlank(e.target.value))))} />
                  </td>
                  <td>
                    <select aria-label="類型" value={r.type} disabled={!canEdit} onChange={(e) => R(i, (x) => void (x.type = e.target.value))}>
                      {Object.entries(TYPES).map(([k, t]) => (
                        <option key={k} value={k}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label="刪除"
                      className="flex size-9 items-center justify-center rounded-full text-mute hover:bg-hover hover:text-bad disabled:opacity-40"
                      disabled={!canEdit}
                      onClick={() => confirm("刪除這間教室？") && edit((e) => void e.rooms.splice(i, 1))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={!canEdit} onClick={() => edit((e) => void e.rooms.push({ id: "r" + Date.now().toString(36), name: "新教室", cap: 8, type: "normal" }))}>
          <Plus size={16} />
          教室
        </Button>
        <span className="grow" />
        <label className="inline-flex items-center gap-2 text-sm text-mute">
          有獨立考場學生的試場，上限
          <input
            type="number"
            min={0}
            className="min-h-9 w-[72px] rounded-lg border border-line2 bg-field px-2"
            placeholder="不限"
            defaultValue={String(E.settings.smallMax ?? "")}
            key={String(E.settings.smallMax)}
            disabled={!canEdit}
            onBlur={(e) => edit((d) => (String(d.settings.smallMax ?? "") === e.target.value ? false : void (d.settings.smallMax = numOrBlank(e.target.value))))}
          />
          人
        </label>
      </div>
    </Sec>
  );
}

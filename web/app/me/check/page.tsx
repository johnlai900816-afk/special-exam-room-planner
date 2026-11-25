"use client";
/* 點名：我的課，現在這一節與最近的課。點名字簽到（超過寬限算遲到）、再點一次簽退；「⋯」改請假、缺席、備註。
   每一節一份 attendance/{日期_課程@節次}，寫入用 Repo.mark。舊版 checkin.js renderCheckin（只留我的課）。 */
import { MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { failText, toast } from "@/components/Toast";
import { TeacherShell } from "@/components/TeacherShell";
import { Button, Card, Input, SectionTitle, cx } from "@/components/ui";
import { NX } from "@/lib/legacy";
import type { AttendanceDoc } from "@/lib/model";
import { useNow, useQuery } from "@/lib/nx/hooks";
import { useNx } from "@/lib/nx/session";
import { addDays, countIn, dateLabel, defaultPid, dowOf, hmOf, isOver, marksOf, md, sessionsOn, ST_NAME, tapRecord, ymd, type Ses } from "@/lib/nx/today";

type Rec = AttendanceDoc["marks"][string];

function Menu({ ses, sid, name, rec, date, today, hm, onClose, mark }: {
  ses: Ses;
  sid: string;
  name: string;
  rec: Rec | undefined;
  date: string;
  today: string;
  hm: string;
  onClose(): void;
  mark(sid: string, r: Rec | null): Promise<void>;
}) {
  const [note, setNote] = useState(String(rec?.note || ""));
  const set = async (st: string) => {
    if (!st) await mark(sid, null);
    else {
      const keep = rec && (st === "in" || st === "late");
      await mark(sid, { st, tin: keep ? rec!.tin : (st === "in" || st === "late") && date === today ? hm : "", tout: keep ? rec!.tout : "", note });
    }
    onClose();
  };
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(31,36,48,0.32)] sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={name} className="w-full max-w-md rounded-t-2xl bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold">{name}</h3>
        <p className="mb-3 text-sm text-mute">
          {ses.name}・{dateLabel(date)} {ses.p.name}
          {rec?.tin ? "　簽到 " + rec.tin : ""}
          {rec?.tout ? "　簽退 " + rec.tout : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {(["in", "late", "leave", "abs"] as const).map((st) => (
            <Button key={st} tone={rec?.st === st ? "primary" : "default"} onClick={() => set(st)}>
              {ST_NAME[st]}
            </Button>
          ))}
          <Button tone="danger" onClick={() => set("")}>
            清除紀錄
          </Button>
        </div>
        <div className="mt-3 flex gap-2">
          <Input className="min-w-0 flex-1" aria-label="備註" placeholder="備註，例：病假" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            onClick={async () => {
              if (!rec) return toast("先選一個狀態");
              await mark(sid, { ...rec, note: note.trim() });
              onClose();
            }}
          >
            存備註
          </Button>
        </div>
      </div>
    </div>
  );
}

function Check() {
  const x = useNx();
  const q = useQuery();
  const now = useNow(30000);
  const today = ymd(now);
  const hm = hmOf(now);
  const [date, setDate] = useState(today);
  const [pick, setPick] = useState(q.get("p") || "");
  const [menu, setMenu] = useState<{ ses: Ses; sid: string } | null>(null);
  const board = x.board!;
  const D = x.D!;
  const att = x.data!.records.attendance;
  const students = x.data!.records.students;
  const ro = !x.writable("attendance") || x.repo!.readOnly;
  const grace = (() => {
    const g = Number((D.settings as { grace?: unknown }).grace);
    return g >= 0 ? g : 5;
  })();
  const list = useMemo(() => sessionsOn(board, date, x.tid), [board, date, x.tid]);
  const ps = [...new Map(list.map((s) => [s.p.id, s.p])).values()];
  const pid = list.some((s) => s.p.id === pick) ? pick : defaultPid(list, date, today, hm);
  const cur = list.filter((s) => s.p.id === pid);
  const recent = useMemo(() => {
    const out: Ses[] = [];
    for (let i = 1; i <= 14 && out.length < 8; i++) {
      const d = addDays(today, -i);
      if (dowOf(d) < 0) continue;
      out.push(...sessionsOn(board, d, x.tid));
    }
    return out.slice(0, 8);
  }, [board, today, x.tid]);

  const stu = (sid: string) => students[NX.encId(sid)];
  const mark = (ses: Ses) => async (sid: string, r: Rec | null) => {
    try {
      await x.repo!.mark(ses.date, ses.gid, ses.p.id, sid, r);
    } catch (e) {
      toast(failText(e));
    }
  };
  const tap = async (ses: Ses, sid: string) => {
    if (ro) return;
    const r = tapRecord(marksOf(att, ses)[sid], date, today, hm, ses.p.start, grace);
    if (!r) return setMenu({ ses, sid });
    await mark(ses)(sid, r);
    const s = stu(sid);
    toast((s ? s.name : sid) + "　" + (r.tout ? "已簽退 " + r.tout : ST_NAME[r.st] + (r.tin ? " " + r.tin : "")));
  };
  const all = async (ses: Ses, mode: "in" | "out") => {
    if (ro) return;
    const m = marksOf(att, ses);
    let n = 0;
    for (const sid of ses.sids) {
      const r = m[sid];
      if (mode === "in" && !r) {
        await mark(ses)(sid, tapRecord(undefined, date, today, hm, ses.p.start, grace));
        n++;
      } else if (mode === "out" && r && (r.st === "in" || r.st === "late") && !r.tout) {
        await mark(ses)(sid, { ...r, tout: hm });
        n++;
      }
    }
    toast(n ? ses.name + "　" + (mode === "in" ? "簽到" : "簽退") + " " + n + " 人" : "沒有要" + (mode === "in" ? "簽到" : "簽退") + "的人");
  };

  return (
    <div>
      <h1 className="mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">點名</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="日期" value={date} onChange={(e) => (setDate(e.target.value || today), setPick(""))} />
        <Button tone={date === today ? "primary" : "default"} onClick={() => (setDate(today), setPick(""))}>
          現在
        </Button>
        <span className="text-sm text-mute">
          {dateLabel(date)}
          {date === today ? "　" + hm : "　補登"}
        </span>
      </div>

      {!list.length ? (
        <p className="py-4 text-mute">{dateLabel(date)}沒有我的課</p>
      ) : (
        <>
          <div role="group" aria-label="節次" className="mb-4 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-sunk p-1">
            {ps.map((p) => {
              const ss = list.filter((s) => s.p.id === p.id);
              const tot = ss.reduce((n, s) => n + s.sids.length, 0);
              const inn = ss.reduce((n, s) => n + countIn(att, s), 0);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === pid}
                  onClick={() => setPick(p.id)}
                  className={cx("flex min-h-11 flex-col items-center rounded-full px-4 text-sm leading-tight whitespace-nowrap", p.id === pid ? "bg-card font-bold text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink2")}
                >
                  {p.name}
                  <small className="font-normal text-mute tabular-nums">
                    {p.start}　{inn}/{tot}
                  </small>
                </button>
              );
            })}
          </div>
          {cur.map((ses) => {
            const m = marksOf(att, ses);
            const over = isOver(date, ses.p, today, hm);
            return (
              <Card key={ses.key} className="mb-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-[17px] font-bold">{ses.name}</h2>
                  <span className="text-sm text-mute">{[ses.room, ses.p.start + "～" + ses.p.end].filter(Boolean).join("・")}</span>
                  <span className="ml-auto text-sm">
                    到 <b className="tabular-nums">{countIn(att, ses)}</b> / {ses.sids.length}
                  </span>
                  {!ro && (
                    <>
                      <Button size="sm" onClick={() => all(ses, "in")}>
                        全部簽到
                      </Button>
                      {date === today && (
                        <Button size="sm" onClick={() => all(ses, "out")}>
                          全部簽退
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {ses.sids
                    .map((sid) => ({ sid, s: stu(sid) }))
                    .sort((a, b) => String(a.s?.cls).localeCompare(String(b.s?.cls)) || (+(a.s?.seat || 0) - +(b.s?.seat || 0)))
                    .map(({ sid, s }) => {
                      const r = m[sid];
                      const st = r ? r.st : "";
                      const line = r ? (ST_NAME[st] || "") + (r.tin ? " " + r.tin : "") + (r.tout ? "　" + r.tout + " 簽退" : "") : over ? "未到" : "尚未簽到";
                      return (
                        <div
                          key={sid}
                          className={cx(
                            "relative flex min-h-[76px] cursor-pointer flex-col rounded-2xl border px-3 py-2 select-none",
                            st === "in" && "border-ok/50 bg-ok-l",
                            st === "late" && "border-warn/50 bg-warn-l",
                            (st === "leave" || st === "abs") && "border-bad/40 bg-bad-l",
                            !st && (over ? "border-dashed border-bad/50 bg-card" : "border-line bg-card"),
                            !!r?.tout && "opacity-70",
                          )}
                          role="button"
                          tabIndex={0}
                          onClick={() => tap(ses, sid)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && tap(ses, sid)}
                        >
                          <small className="text-[13px] text-mute">
                            {s?.cls}　{s?.seat}
                          </small>
                          <b className="text-[17px]">{s?.name || sid}</b>
                          <span className="text-[13px] text-ink2">{line}</span>
                          {(r?.note || s?.note) && <em className="text-[13px] text-warn not-italic">{String(r?.note || s?.note)}</em>}
                          {!ro && (
                            <button
                              type="button"
                              className="absolute top-1 right-1 flex size-10 items-center justify-center rounded-full text-mute hover:bg-hover"
                              aria-label={(s?.name || sid) + " 的狀態"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenu({ ses, sid });
                              }}
                            >
                              <MoreHorizontal size={18} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </Card>
            );
          })}
        </>
      )}

      <SectionTitle no={1} className="mt-8">
        最近的課
      </SectionTitle>
      {recent.length ? (
        <ul className="flex flex-col gap-2">
          {recent.map((s) => {
            const done = Object.keys(marksOf(att, s)).length;
            return (
              <li key={s.aid}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center gap-2.5 rounded-2xl border border-line bg-card px-4 py-2.5 text-left hover:bg-hover"
                  onClick={() => (setDate(s.date), setPick(s.p.id), window.scrollTo({ top: 0 }))}
                >
                  <span className="min-w-0 flex-1">
                    {md(s.date)} {s.p.name}　{s.name}
                  </span>
                  <em className={cx("text-sm not-italic", done < s.sids.length ? "text-warn" : "text-ok")}>
                    {done ? "到 " + countIn(att, s) + "/" + s.sids.length : "沒有點名"}
                  </em>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-mute">沒有</p>
      )}

      {menu && (
        <Menu
          ses={menu.ses}
          sid={menu.sid}
          name={stu(menu.sid)?.name || menu.sid}
          rec={marksOf(att, menu.ses)[menu.sid]}
          date={date}
          today={today}
          hm={hm}
          onClose={() => setMenu(null)}
          mark={mark(menu.ses)}
        />
      )}
    </div>
  );
}

export default function CheckPage() {
  return (
    <TeacherShell title="點名">
      <Check />
    </TeacherShell>
  );
}

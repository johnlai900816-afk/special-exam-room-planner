"use client";
/* 今天：我今天的課（現在這一節標出來）、待辦、要開的會。舊版 teacher.js rToday。 */
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { TeacherShell } from "@/components/TeacherShell";
import { SectionTitle, cx } from "@/components/ui";
import { useNow } from "@/lib/nx/hooks";
import { useNx } from "@/lib/nx/session";
import { addDays, countIn, hmOf, sessionsOn, todos, upcoming, ymd } from "@/lib/nx/today";

function Today() {
  const x = useNx();
  const now = useNow();
  const td = ymd(now);
  const hm = hmOf(now);
  const wd = now.getDay();
  const school = wd >= 1 && wd <= 5;
  const day = school ? td : addDays(td, wd === 6 ? 2 : 1);
  const { D, board, data, tid, me } = x;
  const ses = useMemo(() => (board ? sessionsOn(board, day, tid) : []), [board, day, tid]);
  const pis = [...new Set(ses.map((s) => s.pi))];
  const att = data!.records.attendance;
  const inv = data!.records.iepInvite;
  const list = useMemo(
    () => (D && board ? todos({ D, board, tid, today: td, hm: school ? hm : "00:00", attendance: att, invites: inv }) : []),
    [D, board, tid, td, hm, school, att, inv],
  );
  const up = useMemo(() => (D ? upcoming({ D, tid, today: td, invites: inv }) : []), [D, tid, td, inv]);

  if (!me) return <p className="py-10 text-mute">找不到綁定的老師</p>;
  return (
    <div className="max-w-[760px]">
      <div className="mb-2">
        <span className="text-sm text-mute">
          {now.getMonth() + 1} 月 {now.getDate()} 日　週{"日一二三四五六"[wd]}
        </span>
        <h1 className="mt-0.5 text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">{me.name}</h1>
      </div>

      <SectionTitle no={1} className="mt-7">
        {school ? "今天的課" : "週一的課"}
      </SectionTitle>
      {pis.length ? (
        <div className="flex flex-col gap-2">
          {pis.map((pi) => {
            const xs = ses.filter((s) => s.pi === pi);
            const p = xs[0].p;
            const cur = school && hm >= p.start && hm < p.end;
            return (
              <div
                key={pi}
                className={cx("flex items-center gap-3 rounded-2xl border bg-card px-4 py-3", cur ? "border-blue shadow-[inset_0_0_0_2px_var(--blue)]" : "border-line")}
                aria-current={cur ? "time" : undefined}
              >
                <div className="flex min-w-[4.2em] flex-col">
                  <b>{p.name}</b>
                  <small className="text-[13px] text-mute tabular-nums">{p.start}</small>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {xs.map((s) => (
                    <span key={s.key} className="flex flex-wrap items-baseline gap-2">
                      <b>{s.name}</b>
                      <small className="text-sm text-mute">
                        {[s.room, (school && (cur || hm >= p.end) ? "到 " + countIn(att, s) + "/" : "") + s.sids.length + " 人"].filter(Boolean).join("・")}
                      </small>
                    </span>
                  ))}
                </div>
                {cur && (
                  <Link href={"/me/check/?p=" + encodeURIComponent(p.id)} className="inline-flex min-h-9 items-center rounded-full bg-ink px-3.5 text-sm font-medium text-on-ink">
                    點名
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="my-1 text-sm text-mute">沒有課</p>
      )}

      <SectionTitle no={2} className="mt-7">
        待辦
      </SectionTitle>
      {list.length ? (
        <ul className="flex flex-col gap-2">
          {list.map((t, i) => (
            <li key={i}>
              <Link href={t.href} className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-line bg-card px-4 py-2.5 hover:bg-hover">
                <span className="min-w-0 flex-1">{t.text}</span>
                <em className="flex items-center text-sm whitespace-nowrap text-blue not-italic">
                  {t.act}
                  <ChevronRight size={16} />
                </em>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="my-1 text-sm text-mute">沒有待辦</p>
      )}

      {up.length > 0 && (
        <>
          <SectionTitle no={3} className="mt-7">
            要開的會
          </SectionTitle>
          <ul className="flex flex-col gap-2">
            {up.map((u) => (
              <li key={u.key}>
                <Link href="/me/iep/?tab=inv" className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-line bg-card px-4 py-2.5 hover:bg-hover">
                  <span className="min-w-0 flex-1">
                    {u.label} {u.time}　{u.stu}
                    {u.room ? "・" + u.room : ""}
                  </span>
                  <em className="text-sm whitespace-nowrap text-blue not-italic">{u.kind}</em>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function TodayPage() {
  return (
    <TeacherShell title="今天">
      <Today />
    </TeacherShell>
  );
}

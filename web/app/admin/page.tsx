"use client";
/* 管理者「今天」：今天全部老師的課（現在這一節標出來）、待辦（衝突、沒排、待編組、沒個管、本月到期、交接、邀請）、資源班老師的節數。
   舊版 app.js renderHome。待辦都連到新版的頁面（點名、導師週報、IEP 會議、排課…）；只有段考還在舊版。 */
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminShell, useAdmin } from "@/components/AdminShell";
import { SectionTitle, Stat, cx } from "@/components/ui";
import type { InviteDoc } from "@/lib/model";
import { adminTodos, teacherLoads, todayLessons } from "@/lib/nx/admin";
import { useNow } from "@/lib/nx/hooks";
import { listInvites } from "@/lib/nx/members";
import { addDays, hmOf, ymd } from "@/lib/nx/today";

function Today() {
  const { x, R, D, board } = useAdmin();
  const now = useNow();
  const td = ymd(now);
  const hm = hmOf(now);
  const wd = now.getDay();
  const school = wd >= 1 && wd <= 5;
  const day = school ? td : addDays(td, wd === 6 ? 2 : 1);
  const [invites, setInvites] = useState<InviteDoc[] | null>(null);
  const sid = x.admin?.role === "admin" && !x.demo ? x.claims?.sid || "" : "";
  useEffect(() => {
    if (!sid) return;
    listInvites(sid).then(setInvites, () => setInvites(null));
  }, [sid]);

  const lessons = useMemo(() => (board ? todayLessons(board, day) : []), [board, day]);
  const todo = useMemo(() => (board ? adminTodos({ D, board, R, today: td, hm, invites }) : []), [D, board, R, td, hm, invites]);
  const loads = useMemo(() => (board ? teacherLoads(D, board) : []), [D, board]);
  const mx = Math.max(1, ...loads.map((t) => Math.max(t.per, t.hours)));
  const inG = new Set(D.groups.flatMap((g) => g.students));
  const noG = D.students.filter((s) => !inG.has(s.id)).length;
  const probs = board ? board.problems.filter((p) => p.k !== "un").length : 0;

  if (!D.students.length && !D.groups.length)
    return (
      <div>
        <h1 className="mb-6 text-[1.75rem] font-bold tracking-[-0.02em]">今天</h1>
        <div className="flex flex-wrap items-center gap-3 text-mute">
          還沒有資料
          <Link href="/admin/settings/school/?step=import" className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 font-medium text-on-ink">
            匯入 Excel
          </Link>
        </div>
      </div>
    );

  return (
    <div>
      <div className="mb-5">
        <span className="text-sm text-mute">
          {now.getMonth() + 1} 月 {now.getDate()} 日　週{"日一二三四五六"[wd]}
          {D.title ? "　" + D.title : ""}
        </span>
        <h1 className="mt-0.5 text-[1.75rem] leading-tight font-bold tracking-[-0.02em]">今天</h1>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link href="/admin/students/" className="block hover:opacity-90">
          <Stat label="學生" value={D.students.length} hint={noG ? noG + " 位沒分組" : "都已分組"} />
        </Link>
        <Link href="/admin/sched/?step=board" className="block hover:opacity-90">
          <Stat
            label="已排"
            value={
              <>
                {board?.placed ?? 0}
                <small className="text-sm font-normal text-mute"> / {board?.total ?? 0} 節</small>
              </>
            }
            hint={probs ? <span className="text-bad">{probs} 個衝突</span> : board && board.placed < board.total ? "差 " + (board.total - board.placed) + " 節" : "沒有衝突"}
          />
        </Link>
        <Stat label="老師" value={D.teachers.length} hint={D.teachers.filter((t) => t.role === "資源班").length + " 位資源班"} />
      </div>

      <div className="grid gap-x-8 gap-y-2 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <SectionTitle no={1}>{school ? "今天的課" : "週一的課"}</SectionTitle>
          {lessons.length ? (
            <div className="flex flex-col gap-2">
              {lessons.map(({ pi, list }) => {
                const p = list[0].p;
                const cur = school && hm >= p.start && hm < p.end;
                return (
                  <div
                    key={pi}
                    className={cx("flex gap-3 rounded-2xl border bg-card px-4 py-3", cur ? "border-blue shadow-[inset_0_0_0_2px_var(--blue)]" : "border-line")}
                    aria-current={cur ? "time" : undefined}
                  >
                    <div className="flex min-w-[4.2em] flex-col">
                      <b>{p.name}</b>
                      <small className="text-[13px] text-mute tabular-nums">{p.start}</small>
                    </div>
                    <ul className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {list.map((s) => (
                        <li key={s.key} className="flex flex-wrap items-baseline gap-x-2">
                          <b>{s.name}</b>
                          <small className="text-sm text-mute">
                            {[D.teachers.find((t) => t.id === s.teacherId)?.name, s.room, s.sids.length + " 人"].filter(Boolean).join("・")}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-mute">{board && board.placed ? "沒有課" : "還沒有課表"}</p>
          )}
        </section>

        <div>
          <SectionTitle no={2}>待辦</SectionTitle>
          {todo.length ? (
            <ul className="flex flex-col gap-2">
              {todo.map((t, i) => (
                <li key={i}>
                  <Link href={t.href} className={cx("flex min-h-12 items-center gap-2.5 rounded-2xl border bg-card px-4 py-2.5 hover:bg-hover", t.level === "bad" ? "border-bad/40" : "border-line")}>
                    <span className={cx("min-w-0 flex-1", t.level === "bad" && "text-bad")}>{t.text}</span>
                    <em className="flex items-center gap-1 text-sm whitespace-nowrap text-blue not-italic">
                      {t.act}
                      <ChevronRight size={16} />
                    </em>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">沒有待辦</p>
          )}

          {loads.length > 0 && (
            <>
              <SectionTitle no={3} className="mt-8">
                資源班老師
              </SectionTitle>
              <ul className="flex flex-col gap-2 rounded-2xl border border-line bg-card px-4 py-3">
                {loads.map((t) => (
                  <li key={t.id} className="grid grid-cols-[5em_1fr_auto] items-center gap-3 text-[15px]">
                    <span className="truncate">{t.name}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-sunk" aria-hidden>
                      <i className="block h-full rounded-full bg-blue" style={{ width: Math.round((t.per / mx) * 100) + "%" }} />
                    </span>
                    <small className="text-sm whitespace-nowrap text-mute tabular-nums">
                      {t.per}
                      {t.hours ? "/" + (t.hours - t.reduce) : ""} 節・{t.cases} 案
                    </small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminTodayPage() {
  return (
    <AdminShell title="今天">
      <Today />
    </AdminShell>
  );
}

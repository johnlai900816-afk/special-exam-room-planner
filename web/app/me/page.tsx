"use client";
import { Ban, CalendarDays, ClipboardCheck, ClipboardList, FileHeart, School, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { LessonChip } from "@/components/LessonChip";
import { TeacherGate, TeacherPicker } from "@/components/TeacherGate";
import { Badge, Card, Note, PageHeader } from "@/components/ui";
import { WeekGrid } from "@/components/WeekGrid";
import { DAYS } from "@/lib/core";
import { dutiesOf } from "@/lib/exam";
import { IEP_READY, meetingsOf } from "@/lib/iep";
import { myStudents, teacherWeek, type Board } from "@/lib/schedule";
import { useSession } from "@/lib/session";
import type { Teacher } from "@/lib/types";

const hm = (s: string) => {
  const [h, m] = String(s || "0:0").split(":");
  return +h * 60 + (+m || 0);
};

function Today({ me, board }: { me: Teacher; board: Board }) {
  const s = useSession();
  const D = board.M.D;
  const week = useMemo(() => teacherWeek(board, me.id), [board, me.id]);
  const students = useMemo(() => myStudents(D, me.id), [D, me.id]);
  const duties = useMemo(() => dutiesOf(s.exam, me), [s.exam, me]);
  const meetings = meetingsOf(D, me.id);
  const NP = board.M.NP;

  // 今天與現在這一節（週末顯示週一）
  const now = new Date();
  const wd = now.getDay();
  const day = wd >= 1 && wd <= 5 ? wd - 1 : 0;
  const mins = wd >= 1 && wd <= 5 ? now.getHours() * 60 + now.getMinutes() : -1;
  const todays = board.M.P.map((p, pi) => ({ p, pi, list: week.get(day * NP + pi) || [] })).filter((x) => x.list.length);
  const curPi = board.M.P.findIndex((p) => mins >= hm(p.start) - 10 && mins <= hm(p.end));

  const off = me.off.length;
  const todos: string[] = [];
  if (s.cloud === "on" && !s.boundId && s.realRole !== "admin") todos.push("請組長把你的帳號綁到名冊");
  if (!off) todos.push("確認自己的不排課時段");
  if (IEP_READY && meetings.length) todos.push("回覆 IEP 會議出席");

  return (
    <>
      <PageHeader
        title={me.name + "・今天"}
        lead={
          <>
            {me.role}
            {me.hours ? "・應授 " + me.hours + " 節" : ""}・{D.title || "未命名學期"}
          </>
        }
        actions={<TeacherPicker />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={"週" + DAYS[day] + "的課"} icon={<CalendarDays size={18} />} className="lg:col-span-2">
          {todays.length ? (
            <ul className="divide-y divide-line">
              {todays.map((x) => (
                <li key={x.p.id} className={"flex gap-3 py-2 " + (x.pi === curPi ? "rounded-lg bg-acc-l px-2" : "")}>
                  <div className="w-20 shrink-0">
                    <div className="font-medium">{x.p.name}</div>
                    <div className="text-sm text-mute">
                      {x.p.start}–{x.p.end}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {x.list.map((l) => (
                      <LessonChip key={l.l + l.title} x={l} />
                    ))}
                  </div>
                  {x.pi === curPi && x.list.some((l) => l.kind === "resource") && (
                    <Link href="/checkin/" className="flex min-h-10 shrink-0 items-center gap-1 self-center rounded-lg bg-acc px-3 text-md text-white">
                      <ClipboardCheck size={16} />
                      點名
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink2">這一天沒有排課。</p>
          )}
        </Card>

        <Card title="待辦" icon={<ClipboardList size={18} />}>
          {todos.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {todos.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <p className="text-ink2">目前沒有待辦。</p>
          )}
        </Card>
      </div>

      <Card title="我的一週" icon={<CalendarDays size={18} />} className="mt-4">
        <WeekGrid
          periods={board.M.P}
          hideExtra={(pi) => ![0, 1, 2, 3, 4].some((d) => week.has(d * NP + pi) || me.off.includes(d + "-" + board.M.P[pi].id))}
          cellClass={(s2) => (me.off.includes(board.M.s2key(s2)) ? "bg-bad-l/60" : "")}
          cell={(s2) => (week.get(s2) || []).map((x) => <LessonChip key={x.l + x.title} x={x} />)}
        />
        <p className="mt-2 text-sm text-mute">淡紅色格子是你的不排課時段。藍色是原班被鎖課的節次。</p>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/me/students/" className="rounded-leaf border border-line bg-card p-4 hover:bg-hover">
          <div className="flex items-center gap-2 font-serif text-lg font-semibold">
            <Users size={18} className="text-acc" />
            我的學生
          </div>
          <div className="mt-1 text-2xl font-semibold">{students.length}</div>
          <div className="text-sm text-ink2">個管 {students.filter((x) => x.tags.includes("個管")).length} 位</div>
        </Link>
        <Link href="/me/off/" className="rounded-leaf border border-line bg-card p-4 hover:bg-hover">
          <div className="flex items-center gap-2 font-serif text-lg font-semibold">
            <Ban size={18} className="text-acc" />
            不排課時段
          </div>
          <div className="mt-1 text-2xl font-semibold">{off}</div>
          <div className="text-sm text-ink2">節，點進來修改</div>
        </Link>
        <Link href="/me/exam/" className="rounded-leaf border border-line bg-card p-4 hover:bg-hover">
          <div className="flex items-center gap-2 font-serif text-lg font-semibold">
            <School size={18} className="text-acc" />
            段考監考
          </div>
          <div className="mt-1 text-2xl font-semibold">{s.exam ? duties.length : "—"}</div>
          <div className="text-sm text-ink2">{s.exam ? "場" : "還沒有段考考場資料"}</div>
        </Link>
        <div className="rounded-xl border border-dashed border-line2 bg-card p-4">
          <div className="flex items-center gap-2 font-serif text-lg font-semibold">
            <FileHeart size={18} className="text-acc" />
            IEP 會議
            <Badge>即將推出</Badge>
          </div>
          <p className="mt-1 text-md text-ink2">之後會在這裡看到要出席的 IEP 會議並回覆出席。</p>
        </div>
      </div>

      {s.source.kind !== "cloud" && (
        <div className="mt-4">
          <Note>
            現在顯示的是「{s.source.label}」。登入學校的雲端後，每位老師會直接看到自己的頁面。
          </Note>
        </div>
      )}
    </>
  );
}

export default function MePage() {
  return (
    <AppShell allow={["teacher", "admin"]} title="今天">
      <TeacherGate>{(me, board) => <Today me={me} board={board} />}</TeacherGate>
    </AppShell>
  );
}

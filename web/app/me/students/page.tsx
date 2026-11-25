"use client";
/* 我的學生：我個管的＋我教的（含原班任課），可以搜尋。點一位進個案頁。舊版 teacher.js rStu。 */
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TeacherShell } from "@/components/TeacherShell";
import { Badge, Input, SectionTitle } from "@/components/ui";
import { NX } from "@/lib/legacy";
import type { StudentDoc } from "@/lib/model";
import { myStudentList } from "@/lib/nx/privacy";
import { useNx } from "@/lib/nx/session";
import { md, ymd } from "@/lib/nx/today";
import { TEACH } from "@/lib/teach";

function Row({ id, s, due }: { id: string; s: StudentDoc; due?: { name: string; date: string } }) {
  return (
    <Link href={"/me/student/?id=" + encodeURIComponent(id)} className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-line bg-card px-4 py-2.5 hover:bg-hover">
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
        <b className="text-[17px]">{s.name}</b>
        <span className="text-sm text-mute">
          {s.cls}
          {s.seat ? "-" + String(s.seat).padStart(2, "0") : ""}
        </span>
        {due && (
          <Badge tone="warn">
            {due.name} {md(due.date)}
          </Badge>
        )}
      </span>
      <ChevronRight size={18} className="text-mute" />
    </Link>
  );
}

function Students() {
  const x = useNx();
  const [q, setQ] = useState("");
  const L = useMemo(() => myStudentList(x.data!.records, x.tid, q.trim()), [x.data, x.tid, q]);
  const due = useMemo(() => {
    const m = new Map<string, { name: string; date: string }>();
    TEACH.dueSoon(x.D!, x.tid, ymd(new Date()), 30).forEach((d) => {
      if (!m.has(d.s.id)) m.set(d.s.id, d);
    });
    return m;
  }, [x.D, x.tid]);

  return (
    <div className="max-w-[760px]">
      <h1 className="mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">我的學生</h1>
      <label className="relative mb-2 flex items-center">
        <Search size={18} className="pointer-events-none absolute left-3 text-mute" />
        <Input type="search" className="w-full pl-10" placeholder="找姓名或班級" value={q} onChange={(e) => setQ(e.target.value)} aria-label="找學生" />
      </label>
      <SectionTitle no={1} extra={L.nCm + " 人"} className="mt-6">
        我個管的
      </SectionTitle>
      {L.cm.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {L.cm.map((r) => (
            <Row key={r.id} id={r.id} s={r.s} due={due.get(NX.decId(r.id))} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-mute">{L.nCm ? "沒有符合的" : "沒有個管的學生"}</p>
      )}
      <SectionTitle no={2} extra={L.nTaught + " 人"} className="mt-7">
        我教的
      </SectionTitle>
      {L.taught.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {L.taught.map((r) => (
            <Row key={r.id} id={r.id} s={r.s} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-mute">{L.nTaught ? "沒有符合的" : "沒有"}</p>
      )}
    </div>
  );
}

export default function StudentsPage() {
  return (
    <TeacherShell title="我的學生">
      <Students />
    </TeacherShell>
  );
}

"use client";
/* 個案頁（/me/student/?id=學生）：組別、課表、出缺席；我個管的另外有私密欄位、家長聯絡紀錄、段考服務。
   私密的部分在 students/{id}/private/profile（規則只給個管），寫入一律 Repo.patch 帶 rev。 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AttendanceSummary, Contacts, DL, ExamService, PrivateFields, privSaver } from "@/components/case/CaseParts";
import { TeacherShell } from "@/components/TeacherShell";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { NX } from "@/lib/legacy";
import { useQuery } from "@/lib/nx/hooks";
import { canSeePrivate, relationOf } from "@/lib/nx/privacy";
import { useNx } from "@/lib/nx/session";
import { attSummary, hmOf, lessonsOf, ymd } from "@/lib/nx/today";

function CasePage() {
  const x = useNx();
  const q = useQuery();
  const sid = q.get("id") || "";
  const id = NX.encId(sid);
  const R = x.data!.records;
  const s = R.students[id];
  const rel = relationOf(s, x.tid);
  const priv = canSeePrivate(x.scope!, R, sid) ? R.privates[id] : null;
  const ro = !x.writable("privates") || x.repo!.readOnly;
  const save = privSaver(x.repo!, x.data!.revs, sid);
  const D = x.D!;
  const board = x.board;
  const groups = D.groups.filter((g) => g.on !== false && g.students.includes(sid));
  const lessons = board ? lessonsOf(board, sid) : [];
  const now = new Date();
  const att = attSummary(R.attendance, sid, D.periods, ymd(now), hmOf(now));
  const cm = s ? D.teachers.find((t) => t.id === s.caseMgrId) : null;
  const subjects = Object.values(R.exam).flatMap((e) => ((e.sessions || []) as { subject?: string }[]).map((x) => String(x.subject || "")));

  if (!s || !rel)
    return (
      <p className="py-10 text-mute">
        找不到這位學生
        <Link className="text-blue" href="/me/students/">
          回我的學生
        </Link>
      </p>
    );
  return (
    <div className="max-w-[760px]">
      <Link href="/me/students/" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-ink2 hover:text-ink">
        <ArrowLeft size={16} />
        我的學生
      </Link>
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">{s.name}</h1>
        <span className="text-mute">
          {s.cls}
          {s.seat ? "-" + String(s.seat).padStart(2, "0") : ""}
        </span>
        <Badge tone={rel === "cm" ? "acc" : "default"}>{rel === "cm" ? "我個管" : "我教的"}</Badge>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <SectionTitle no={1}>基本</SectionTitle>
          <dl className="grid grid-cols-[5.5em_1fr] gap-x-2.5 gap-y-2 text-[15px]">
            <DL k="個管">{cm ? cm.name : "未指定"}</DL>
            <DL k="組別">{groups.length ? groups.map((g) => g.name).join("、") : "—"}</DL>
            {s.note ? <DL k="提醒">{s.note}</DL> : null}
          </dl>
        </Card>
        <Card>
          <SectionTitle no={2} extra={lessons.length + " 節"}>
            課表
          </SectionTitle>
          {lessons.length ? (
            <ul className="grid gap-1 text-[15px] sm:grid-cols-2">
              {lessons.map((l) => (
                <li key={l.s + l.g}>
                  <span className="text-mute">{l.t}</span>　{l.g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">沒有排課</p>
          )}
        </Card>
        <Card>
          <SectionTitle no={3}>出缺席</SectionTitle>
          <AttendanceSummary att={att} empty="還沒有我的課的點名紀錄" />
        </Card>
        {priv && (
          <>
            <Card>
              <SectionTitle no={4}>私密</SectionTitle>
              <PrivateFields save={save} p={priv} ro={ro} />
            </Card>
            <Card>
              <SectionTitle no={5} extra={(priv.contacts || []).length + " 筆"}>
                家長聯絡紀錄
              </SectionTitle>
              <Contacts save={save} sid={sid} name={s.name} cls={s.cls} p={priv} ro={ro} />
            </Card>
            <Card>
              <SectionTitle no={6}>段考服務</SectionTitle>
              <ExamService save={save} p={priv} ro={ro} subjects={subjects} />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export default function StudentPage() {
  return (
    <TeacherShell title="個案">
      <CasePage />
    </TeacherShell>
  );
}

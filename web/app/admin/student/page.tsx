"use client";
/* 管理者的個案頁（/admin/student/?id=學生；舊版 app.js renderCase）：一位學生的全部——
   基本資料（可改）、私密、組別與課表、段考服務、出缺席、家長聯絡、IEP 會議。
   基本資料經 planOnD 寫回（改個管時 private.caseMgrId、teacherIds 跟著變）；私密欄位直接 patch private（帶 rev）。 */
import { ArrowLeft, ExternalLink, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell, useAdmin } from "@/components/AdminShell";
import { CmOptions } from "@/components/admin/CmOptions";
import { useApply } from "@/components/admin/useApply";
import { AttendanceSummary, Contacts, ExamService, PrivateFields, privSaver } from "@/components/case/CaseParts";
import { OLD_APP } from "@/components/Planned";
import { WeekGrid } from "@/components/WeekGrid";
import { Badge, Button, Card, Input, Select, SectionTitle } from "@/components/ui";
import { IEP, type Round } from "@/lib/iep";
import { NX } from "@/lib/legacy";
import { planDelStudent, planStudentEdit, type BasicField } from "@/lib/nx/admin";
import { useQuery } from "@/lib/nx/hooks";
import { attSummary, hmOf, ymd } from "@/lib/nx/today";

const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <label className="contents">
    <span className="pt-2 text-mute">{k}</span>
    <span className="min-w-0">{children}</span>
  </label>
);

function Case() {
  const { R, D, board, repo, revs, ro } = useAdmin();
  const q = useQuery();
  const router = useRouter();
  const { busy, run } = useApply();
  const sid = q.get("id") || "";
  const id = NX.encId(sid);
  const s = R.students[id];
  const priv = R.privates[id];
  const lockS = ro("students");
  const lockP = ro("privates");
  const save = privSaver(repo, revs, sid);
  const cm = s ? D.teachers.find((t) => t.id === s.caseMgrId) : null;
  const groups = D.groups.filter((g) => g.on !== false && g.students.includes(sid));
  const now = new Date();
  const att = attSummary(R.attendance, sid, D.periods, ymd(now), hmOf(now));
  const subjects = Object.values(R.exam).flatMap((e) => ((e.sessions || []) as { subject?: string }[]).map((x) => String(x.subject || "")));
  const off = (s?.off || []).length;

  // 這位學生一週的課（照正式課表）
  const week = new Map<number, { name: string; room: string }[]>();
  if (board)
    board.M.L.forEach((l, i) => {
      const { M, S, room } = board;
      const g = M.G[l.g];
      const sl = S.slot[i];
      if (sl < 0 || !(g.ref.students || []).includes(sid)) return;
      if (!week.has(sl)) week.set(sl, []);
      week.get(sl)!.push({ name: g.name, room: room[i] >= 0 ? M.D.rooms[room[i]].name : "" });
    });

  const rounds = (() => {
    const rs = ((D as unknown as { iep?: { rounds?: Round[] } }).iep?.rounds || []).filter(Boolean);
    return rs
      .map((r) => ({ r, m: (r.meets || []).find((x) => x.s === sid) }))
      .filter((o) => o.m)
      .map(({ r, m }) => {
        let when = "還沒排定";
        try {
          if (m!.at) {
            const f = IEP.slotInfo(D, m!.at);
            when = IEP.fmtDate(f.date) + " " + (f.custom ? "" : f.name) + (m!.room ? "・" + m!.room : "");
          }
        } catch {
          /* 時段格式不對就不顯示 */
        }
        return { id: r.id, name: r.name || r.kind || "IEP 會議", when };
      })
      .reverse();
  })();

  if (!s)
    return (
      <div className="flex items-center gap-3 py-10 text-mute">
        找不到這位學生
        <Link className="text-blue" href="/admin/students/">
          回到名單
        </Link>
      </div>
    );

  const edit = (k: BasicField, v: string) => {
    const cur = k === "caseMgr" ? s.caseMgrId : String((s as unknown as Record<string, unknown>)[k] ?? "");
    if (v.trim() === cur) return;
    run(planStudentEdit(R, sid, k, v).ops, "已存檔");
  };
  const del = async () => {
    if (!confirm("刪除 " + s.cls + " " + s.name + "？\n組別、私密資料、家長聯絡紀錄會一起刪掉。")) return;
    if (await run(planDelStudent(R, sid).ops, "已刪除 " + s.name)) router.push("/admin/students/");
  };

  return (
    <div className="max-w-[900px]">
      <Link href="/admin/students/" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-ink2 hover:text-ink">
        <ArrowLeft size={16} />
        學生
      </Link>
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">{s.name || "（未填姓名）"}</h1>
        <span className="text-mute">
          {s.cls}
          {s.seat ? "-" + String(s.seat).padStart(2, "0") : ""}
        </span>
        <Badge tone={cm ? "acc" : "warn"}>{cm ? "個管 " + cm.name : "沒有個管"}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle no={1}>基本資料</SectionTitle>
          <div className="grid grid-cols-[5.5em_1fr] items-start gap-x-2.5 gap-y-2 text-[15px]">
            <Row k="班級">
              <Input className="w-28" disabled={lockS} defaultValue={s.cls} key={"c" + s.cls} onBlur={(e) => edit("cls", e.target.value)} />
            </Row>
            <Row k="座號">
              <Input className="w-20" disabled={lockS} defaultValue={s.seat} key={"s" + s.seat} onBlur={(e) => edit("seat", e.target.value)} />
            </Row>
            <Row k="姓名">
              <Input className="w-full" disabled={lockS} defaultValue={s.name} key={"n" + s.name} onBlur={(e) => edit("name", e.target.value)} />
            </Row>
            <Row k="個管">
              <Select className="w-full" aria-label="個管老師" disabled={lockS || busy} value={s.caseMgrId} onChange={(e) => edit("caseMgr", e.target.value)}>
                <CmOptions D={D} />
              </Select>
            </Row>
            <Row k="公開提醒">
              <Input className="w-full" disabled={lockS} placeholder="例：要帶課本" defaultValue={s.note || ""} key={"t" + (s.note || "")} onBlur={(e) => edit("note", e.target.value)} />
            </Row>
          </div>
        </Card>

        <Card>
          <SectionTitle no={2} extra={<Lock size={14} className="inline" />}>
            私密
          </SectionTitle>
          {priv ? <PrivateFields save={save} p={priv} ro={lockP} /> : <p className="text-sm text-mute">沒有私密資料</p>}
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle no={3} extra={"每週 " + [...week.values()].reduce((n, a) => n + a.length, 0) + " 節"}>
            組別與課表
          </SectionTitle>
          {groups.length ? (
            <p className="mb-3 flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <Badge key={g.id} tone="acc">
                  {g.name}
                  {g.teacher ? "・" + (D.teachers.find((t) => t.id === g.teacher)?.name || "") : ""}
                </Badge>
              ))}
            </p>
          ) : (
            <p className="mb-3 text-sm text-mute">還沒分組</p>
          )}
          {week.size > 0 && (
            <WeekGrid
              periods={D.periods}
              dense
              hideExtra={(pi) => ![0, 1, 2, 3, 4].some((d) => week.has(d * D.periods.length + pi))}
              cell={(sl) =>
                (week.get(sl) || []).map((x, i) => (
                  <span key={i} className="block rounded-md bg-blue-l px-1.5 py-1 text-xs leading-tight text-blue">
                    {x.name}
                    {x.room && <small className="block text-[11px] text-ink2">{x.room}</small>}
                  </span>
                ))
              }
            />
          )}
          <Link href={"/admin/settings/school/?step=off&k=" + encodeURIComponent("s:" + sid)} className="mt-3 inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 text-sm hover:bg-hover">
            個人不排課時段{off ? "（" + off + " 格）" : ""}
          </Link>
        </Card>

        <Card>
          <SectionTitle no={4}>段考服務</SectionTitle>
          {priv ? <ExamService save={save} p={priv} ro={lockP} subjects={subjects} /> : <p className="text-sm text-mute">沒有</p>}
        </Card>

        <Card>
          <SectionTitle no={5} extra="最近兩週">
            出缺席
          </SectionTitle>
          <AttendanceSummary att={att} empty="還沒有點名紀錄" />
        </Card>

        <Card>
          <SectionTitle no={6} extra={(priv?.contacts || []).length + " 筆"}>
            家長聯絡紀錄
          </SectionTitle>
          {priv ? <Contacts save={save} sid={sid} name={s.name} cls={s.cls} p={priv} ro={lockP} /> : <p className="text-sm text-mute">沒有</p>}
        </Card>

        <Card>
          <SectionTitle no={7}>IEP 會議</SectionTitle>
          {rounds.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {rounds.map((r) => (
                <li key={r.id} className="flex min-h-10 items-center justify-between gap-2 py-1.5">
                  <span>{r.name}</span>
                  <span className="text-sm text-mute">{r.when}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">沒有</p>
          )}
          <a href={OLD_APP + "#iep"} className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm text-blue">
            <ExternalLink size={14} />
            IEP 會議
          </a>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button tone="danger" disabled={lockS || busy} onClick={del}>
          <Trash2 size={16} />
          刪除學生
        </Button>
      </div>
    </div>
  );
}

export default function AdminStudentPage() {
  return (
    <AdminShell title="個案">
      <Case />
    </AdminShell>
  );
}

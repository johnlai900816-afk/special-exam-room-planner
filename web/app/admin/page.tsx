"use client";
import { AlertTriangle, CalendarRange, GraduationCap, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, Note, PageHeader, Stat } from "@/components/ui";
import { emailOfTeacher } from "@/lib/accounts";
import { CORE } from "@/lib/core";
import { buildBoard } from "@/lib/schedule";
import { useSession } from "@/lib/session";
import type { RcData } from "@/lib/types";

function Overview({ D }: { D: RcData }) {
  const s = useSession();
  const board = useMemo(() => buildBoard(D), [D]);
  const { M } = board;

  const byGrade = useMemo(() => {
    const m = new Map<number, Map<string, number>>();
    D.students.forEach((st) => {
      const g = CORE.gradeOfCls(st.cls);
      const c = m.get(g) || new Map<string, number>();
      c.set(st.cls, (c.get(st.cls) || 0) + 1);
      m.set(g, c);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [D]);

  const load = useMemo(() => {
    const n = new Map<string, number>();
    M.L.forEach((x, l) => {
      const g = M.G[x.g];
      if (g.t >= 0 && board.S.slot[l] >= 0) n.set(M.T[g.t].id, (n.get(M.T[g.t].id) || 0) + 1);
    });
    return n;
  }, [M, board]);

  const cm = useMemo(() => {
    const n = new Map<string, number>();
    D.students.forEach((st) => st.caseMgr && n.set(st.caseMgr, (n.get(st.caseMgr) || 0) + 1));
    return n;
  }, [D]);

  const warns = M.G.flatMap((g) => g.warn.map((w) => g.name + "：" + w));
  const res = D.teachers.filter((t) => t.role === "資源班");

  return (
    <>
      <PageHeader title="總覽" lead={D.title || "未命名學期"} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="學生" value={D.students.length} hint={byGrade.map(([g, c]) => (CORE.GRADE[g] || "其他") + " " + [...c.values()].reduce((a, b) => a + b, 0)).join("・")} />
        <Stat label="老師" value={D.teachers.length} hint={"資源班 " + res.length + " 位"} />
        <Stat label="課程" value={D.groups.filter((g) => g.on !== false).length} hint={"共 " + board.total + " 節"} />
        <Stat
          label="已排入"
          value={board.placed + " / " + board.total}
          hint={M.viol ? <span className="text-bad">{M.viol} 個衝突</span> : <span className="text-ok">沒有衝突</span>}
        />
      </div>

      {(warns.length > 0 || board.problems.length > 0) && (
        <Card title="需要處理" icon={<AlertTriangle size={18} />} className="mt-4">
          <ul className="max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-md">
            {warns.map((w) => (
              <li key={w}>{w}</li>
            ))}
            {board.problems.slice(0, 30).map((p, i) => (
              <li key={i}>{p.m}</li>
            ))}
          </ul>
          <Link href="/schedule/" className="mt-3 inline-flex min-h-10 items-center gap-1 text-md text-acc">
            <CalendarRange size={16} />
            到排課
          </Link>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="老師" icon={<UserRound size={18} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-md">
              <thead>
                <tr className="border-b border-line text-left text-sm text-mute">
                  <th className="py-1.5 pr-2 font-normal">姓名</th>
                  <th className="py-1.5 pr-2 font-normal">身分</th>
                  <th className="py-1.5 pr-2 text-right font-normal">排課／應授</th>
                  <th className="py-1.5 pr-2 text-right font-normal">個管</th>
                  <th className="py-1.5 font-normal">帳號</th>
                </tr>
              </thead>
              <tbody>
                {[...D.teachers]
                  .sort((a, b) => (a.role === "資源班" ? 0 : 1) - (b.role === "資源班" ? 0 : 1))
                  .map((t) => {
                    const n = load.get(t.id) || 0;
                    const email = emailOfTeacher(s.access, t.id);
                    return (
                      <tr key={t.id} className="border-b border-line">
                        <td className="py-1.5 pr-2">{t.name}</td>
                        <td className="py-1.5 pr-2">
                          <Badge tone={t.role === "資源班" ? "acc" : "default"}>{t.role}</Badge>
                        </td>
                        <td className={"py-1.5 pr-2 text-right " + (t.hours && n !== t.hours ? "text-warn" : "")}>
                          {t.role === "資源班" || n ? n + " / " + (t.hours || "—") : "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right">{cm.get(t.id) || ""}</td>
                        <td className="max-w-[10rem] truncate py-1.5 text-sm text-mute">{email || (s.cloud === "on" ? "未綁定" : "")}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="學生（依班級）" icon={<GraduationCap size={18} />}>
          {byGrade.length ? (
            <div className="space-y-3">
              {byGrade.map(([g, c]) => (
                <div key={g}>
                  <div className="mb-1 text-md font-medium">{CORE.GRADE[g] || "其他"}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[...c.entries()]
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([cls, n]) => (
                        <span key={cls} className="rounded-lg border border-line bg-sunk px-2 py-1 text-md">
                          {cls} <span className="text-mute">{n} 人</span>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-ink2">名冊上還沒有學生。</p>
          )}
        </Card>
      </div>

      {s.source.kind === "demo" && (
        <div className="mt-4">
          <Note>這是虛構的範例資料。到「資料與帳號」讀取備份檔，或登入學校的雲端，就會看到你們自己的資料。</Note>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  const s = useSession();
  return (
    <AppShell allow={["admin"]} title="總覽">
      {s.D && <Overview D={s.D} />}
    </AppShell>
  );
}

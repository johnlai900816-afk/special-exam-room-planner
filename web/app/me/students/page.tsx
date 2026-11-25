"use client";
import { Users } from "lucide-react";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { TeacherGate, TeacherPicker } from "@/components/TeacherGate";
import { Badge, Card, PageHeader } from "@/components/ui";
import { myStudents } from "@/lib/schedule";
import type { RcData, Teacher } from "@/lib/types";

function List({ me, D }: { me: Teacher; D: RcData }) {
  const list = useMemo(() => myStudents(D, me.id), [D, me.id]);
  const cm = (id: string) => D.teachers.find((t) => t.id === id)?.name || "";
  return (
    <>
      <PageHeader title="我的學生" lead={me.name + "・共 " + list.length + " 位"} actions={<TeacherPicker />} />
      {list.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(({ s, tags }) => {
            const mine = tags.includes("個管");
            return (
              <article key={s.id} className="rounded-leaf border border-line bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg">{s.name}</h2>
                  <span className="text-md text-mute">
                    {s.cls}
                    {s.seat ? " 班 " + s.seat + " 號" : " 班"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <Badge key={t} tone={t === "個管" ? "acc" : "default"}>
                      {t}
                    </Badge>
                  ))}
                </div>
                {/* 需求與備註屬於學生的敏感資料：只給個管老師看（目標模型放在 students/{id}/private） */}
                {mine ? (
                  <dl className="mt-3 space-y-1 text-md">
                    {s.needs.length > 0 && (
                      <div>
                        <dt className="inline text-mute">需要的科目：</dt>
                        <dd className="inline">{s.needs.join("、")}</dd>
                      </div>
                    )}
                    {s.note && (
                      <div>
                        <dt className="inline text-mute">備註：</dt>
                        <dd className="inline">{s.note}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-mute">個管：{cm(s.caseMgr) || "未指定"}</p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Card>
          <p className="flex items-center gap-2 text-ink2">
            <Users size={18} />
            名冊上沒有你個管或任教的學生。
          </p>
        </Card>
      )}
    </>
  );
}

export default function StudentsPage() {
  return (
    <AppShell allow={["teacher", "admin"]} title="我的學生">
      <TeacherGate>{(me, board) => <List me={me} D={board.M.D} />}</TeacherGate>
    </AppShell>
  );
}

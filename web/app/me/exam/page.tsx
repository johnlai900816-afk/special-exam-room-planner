"use client";
import { School } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Planned } from "@/components/Planned";
import { TeacherGate, TeacherPicker } from "@/components/TeacherGate";
import { Badge, Card, Note, PageHeader } from "@/components/ui";
import { dutiesOf } from "@/lib/exam";
import { useSession } from "@/lib/session";
import type { Teacher } from "@/lib/types";

function Duties({ me }: { me: Teacher }) {
  const s = useSession();
  const list = dutiesOf(s.exam, me);
  return (
    <>
      <PageHeader title="段考查詢" lead={me.name + (s.exam?.title ? "・" + s.exam.title : "")} actions={<TeacherPicker />} />
      <Card title="我的監考" icon={<School size={18} />}>
        {!s.exam ? (
          <Note>還沒有段考考場資料。組長在「段考考場」排好監考後，這裡就會出現。</Note>
        ) : list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-line text-left text-md text-mute">
                  <th className="py-2 pr-3 font-normal">日期</th>
                  <th className="py-2 pr-3 font-normal">節次</th>
                  <th className="py-2 pr-3 font-normal">科目</th>
                  <th className="py-2 pr-3 font-normal">試場</th>
                  <th className="py-2 font-normal">工作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.key} className="border-b border-line">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {d.date}（{d.dow}）
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {d.period}
                      <div className="text-sm text-mute">
                        {d.start}–{d.end}
                      </div>
                    </td>
                    <td className="py-2 pr-3">{d.subject}</td>
                    <td className="py-2 pr-3">{d.room}</td>
                    <td className="py-2">
                      <Badge tone={d.kind === "監考" ? "acc" : "info"}>{d.kind}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink2">這次段考沒有排到你監考。</p>
        )}
        <p className="mt-3 text-sm text-mute">監考名單用姓名對名冊；名冊上的「（國）」這類註記會忽略。</p>
      </Card>
      <div className="mt-4">
        <Planned title="交卷名單" items={["我監考的試場有哪些學生、延長或報讀等調整", "列印交卷簽收單"]} oldPath="exam.html" oldLabel="到舊版段考考場" />
      </div>
    </>
  );
}

export default function MyExamPage() {
  return (
    <AppShell allow={["teacher", "admin"]} title="段考查詢">
      <TeacherGate>{(me) => <Duties me={me} />}</TeacherGate>
    </AppShell>
  );
}

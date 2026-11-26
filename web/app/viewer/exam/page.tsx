"use client";
/* 檢視：段考考程與監考（exam/main：考程、試場、監考對照，只有老師姓名）。學生名單、服務、交卷名單檢視讀不到。 */
import { useMemo } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { useViewer, ViewerShell } from "@/components/ViewerShell";
import { examRows, proctorList } from "@/lib/nx/viewer";

const th = "px-2 py-2 text-left text-[13px] font-normal text-mute whitespace-nowrap";
const td = "border-t border-line px-2 py-1.5 align-top";

function Exam() {
  const { data } = useViewer();
  const E = data.records.exam.main;
  const rows = useMemo(() => examRows(E), [E]);
  const people = useMemo(() => proctorList(rows), [rows]);
  return (
    <div>
      <h1 className="mb-6 text-[1.75rem] font-bold tracking-[-0.02em]">{E?.title || "段考"}</h1>
      {!rows.length ? (
        <p className="text-mute">還沒有段考資料</p>
      ) : (
        <>
          <SectionTitle no={1} extra={rows.length + " 節"}>
            考程與監考
          </SectionTitle>
          <Card className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="bg-sunk">
                  <th className={th}>日期</th>
                  <th className={th}>節次</th>
                  <th className={th}>科目</th>
                  <th className={th}>時間</th>
                  <th className={th}>試場與監考</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ses.id}>
                    <td className={td + " whitespace-nowrap"}>
                      {r.ses.date}
                      {r.ses.dow ? "（" + r.ses.dow + "）" : ""}
                    </td>
                    <td className={td + " whitespace-nowrap"}>{r.ses.period}</td>
                    <td className={td}>{r.ses.subject}</td>
                    <td className={td + " whitespace-nowrap tabular-nums"}>
                      {r.ses.start}
                      {r.ses.end ? "～" + r.ses.end : ""}
                    </td>
                    <td className={td}>
                      {r.rooms.length ? (
                        r.rooms.map((x) => (
                          <span key={x.id} className="mr-3 inline-block">
                            <b className="font-medium">{x.name}</b> {x.proctor}
                            {x.support && <span className="text-mute">（支援 {x.support}）</span>}
                          </span>
                        ))
                      ) : (
                        <span className="text-mute">－</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {people.length > 0 && (
            <>
              <SectionTitle no={2} extra={people.length + " 位"}>
                每位老師的監考
              </SectionTitle>
              <Card className="overflow-x-auto p-0 sm:p-0">
                <table className="w-full text-[15px]">
                  <thead>
                    <tr className="bg-sunk">
                      <th className={th}>老師</th>
                      <th className={th}>場次</th>
                      <th className={th}>時間與試場</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.name}>
                        <td className={td + " whitespace-nowrap"}>{p.name}</td>
                        <td className={td + " tabular-nums"}>{p.n}</td>
                        <td className={td + " text-sm"}>{p.items.join("、")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ViewerExam() {
  return (
    <ViewerShell title="段考">
      <Exam />
    </ViewerShell>
  );
}

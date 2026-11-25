"use client";
/* 我的段考（老師）：我監考的試場與交卷名單（exam/main/placements，規則只給 proctorIds 裡的老師）、
   我的學生在哪裡考（exam/main/seats，規則只給讀得到這位學生的老師）。舊版老師看得到整份段考資料；新版只看得到這兩種。 */
import Link from "next/link";
import { useMemo } from "react";
import { TeacherShell } from "@/components/TeacherShell";
import { SectionTitle } from "@/components/ui";
import { sameTeacher } from "@/lib/exam";
import type { ExamPlaceDoc, ExamSeatDoc } from "@/lib/model";
import { dateKey, hm } from "@/lib/nx/examCore";
import { useNx } from "@/lib/nx/session";

const who = (c: string, s: string, n: string) => c + (s ? "-" + String(s).padStart(2, "0") : "") + " " + n;

function MyExam() {
  const x = useNx();
  const R = x.data!.records;
  const tid = x.tid;
  const me = x.me?.name || "";
  const places = useMemo(
    () =>
      Object.values(R.examPlace || {})
        .filter((p: ExamPlaceDoc) => (p.proctorIds || []).includes(tid))
        .sort((a, b) => dateKey(a.date) - dateKey(b.date) || hm(a.t) - hm(b.t) || a.roomName.localeCompare(b.roomName)),
    [R.examPlace, tid],
  );
  const seats = useMemo(() => Object.values(R.examSeat || {}).sort((a: ExamSeatDoc, b: ExamSeatDoc) => a.cls.localeCompare(b.cls) || (+a.seat || 0) - (+b.seat || 0)), [R.examSeat]);
  const title = Object.values(R.exam)[0]?.title || "";
  return (
    <div className="max-w-[860px]">
      <h1 className="mb-1 text-[1.75rem] font-bold tracking-[-0.02em]">我的段考</h1>
      {title && <p className="mb-6 text-[15px] text-mute">{title}</p>}
      <SectionTitle no={1} extra={places.length + " 場"}>
        我的監考
      </SectionTitle>
      {places.length ? (
        <div className="flex flex-col gap-3">
          {places.map((p) => {
            const sup = !sameTeacher(p.proctor, me) && sameTeacher(p.support, me);
            return (
              <details key={p.ses + "|" + p.room} className="rounded-2xl border border-line bg-card px-4 py-3">
                <summary className="flex min-h-10 cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
                  <b>
                    {p.date}
                    {p.dow ? "（" + p.dow + "）" : ""} {p.per} {p.lab}
                  </b>
                  <span className="text-sm text-mute">{p.t}</span>
                  <span className="ml-auto font-bold text-blue">
                    {p.roomName}
                    {sup ? "・支援" : ""}
                  </span>
                  <span className="text-sm text-mute">{p.stu.length + p.wait.length} 人</span>
                </summary>
                <div className="mt-3 border-t border-line pt-3 text-[15px]">
                  <p className="mb-2 text-sm text-mute">
                    監考 {p.proctor || "未指定"}
                    {p.support ? "　支援 " + p.support : ""}
                  </p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {p.stu.map((s, i) => (
                      <li key={i}>
                        {who(s.c, s.s, s.n)} <span className="text-sm text-ink2">{s.sv}</span>
                        {s.x && <span className="ml-1 rounded-full bg-warn-l px-2 text-xs text-warn">延長 {s.x}</span>}
                      </li>
                    ))}
                    {p.wait.map((s, i) => (
                      <li key={"w" + i} className="text-ink2">
                        {who(s.c, s.s, s.n)} <span className="text-sm">自習等候（{s.j}補考）</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-mute">{Object.keys(R.exam).length ? "沒有排到監考" : "還沒有段考資料"}</p>
      )}
      <SectionTitle no={2} extra={seats.length + " 位"} className="mt-8">
        我的學生在哪裡考
      </SectionTitle>
      {seats.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full text-[15px]">
            <thead className="bg-sunk text-left text-[13px] text-mute">
              <tr>
                <th className="px-3 py-2">學生</th>
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">科目</th>
                <th className="px-3 py-2">時間</th>
                <th className="px-3 py-2">試場</th>
              </tr>
            </thead>
            <tbody>
              {seats.flatMap((s) =>
                s.rows.map((r, i) => (
                  <tr key={s.cls + s.seat + s.name + i} className="border-t border-line">
                    {i === 0 && (
                      <td rowSpan={s.rows.length} className="px-3 py-2 align-top font-bold whitespace-nowrap">
                        {who(s.cls, s.seat, s.name)}
                      </td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.date}
                      {r.dow ? "（" + r.dow + "）" : ""}
                    </td>
                    <td className="px-3 py-2">
                      {r.lab} <small className="text-mute">{r.per}</small>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.t}
                      {r.ext && <span className="ml-1 rounded-full bg-warn-l px-2 text-xs text-warn">延長</span>}
                    </td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap text-blue">{r.room || <span className="font-normal text-bad">尚未排入</span>}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-mute">沒有學生在特殊試場考</p>
      )}
      <p className="mt-6 text-sm">
        <Link href="/me/settings/" className="text-blue">
          回我的設定
        </Link>
      </p>
    </div>
  );
}

export default function MyExamPage() {
  return (
    <TeacherShell title="我的段考">
      <MyExam />
    </TeacherShell>
  );
}

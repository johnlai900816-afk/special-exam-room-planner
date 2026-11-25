"use client";
/* ② 編組（舊版 renderNeed）：每位學生每一科要去哪一門課；自動編組（core.placeStudents）、復原、年級篩選。 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { Button, Card, Select, cx } from "@/components/ui";
import { CORE } from "@/lib/core";
import { autoPlaceD, GRADE, setNeedD, sortStu, stuLabel, X } from "@/lib/nx/sched";
import { Tip, useSched } from "./common";

export function NeedStep() {
  const { D, edit, undo, busy, canEdit } = useSched();
  const [g, setG] = useState("");
  const on = D.groups.filter((x) => x.on !== false);
  const subs = [...new Set(on.map((x) => x.subject))];
  const grs = [...new Set(D.students.map((s) => CORE.gradeOfCls(s.cls)))].filter((x) => GRADE[x]).sort();
  const pend = useMemo(() => X.needList(D) as { id: string; subject: string }[], [D]);
  const pk = new Set(pend.map((n) => n.id + "|" + n.subject));
  const tn = (gr: (typeof D.groups)[number]) => {
    const t = D.teachers.find((x) => x.id === gr.teacher);
    return t ? "｜" + t.name : "";
  };
  if (!subs.length)
    return (
      <div className="flex items-center gap-3 text-mute">
        還沒有開課。
        <Link href="/admin/sched/?step=groups" className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 text-ink hover:bg-hover">
          去開課
        </Link>
      </div>
    );
  const auto = () => {
    if (!pend.length) {
      toast("沒有待安排的學生");
      return;
    }
    edit(
      (D1) => {
        const r = autoPlaceD(D1);
        const M = CORE.compile(D1);
        const o: { k: string }[] = [];
        CORE.evaluate(M, CORE.toState(M, D1).slot, o as never);
        const v = o.filter((x) => x.k !== "un").length;
        return "編好 " + r.placed + " 科" + (r.left.length ? "；" + r.left.length + " 科找不到課" : "") + (v ? "；課表有 " + v + " 個衝突" : "");
      },
      (m) => m,
      { undo: true },
    );
  };
  const rows = D.students
    .map((s) => s)
    .sort(sortStu)
    .filter((s) => !g || CORE.gradeOfCls(s.cls) === +g);
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Button tone="primary" onClick={auto} disabled={busy || !canEdit}>
          自動編組
        </Button>
        <Button onClick={undo} disabled={busy || !canEdit}>
          復原
        </Button>
        <Select aria-label="年級" value={g} onChange={(e) => setG(e.target.value)}>
          <option value="">全部年級</option>
          {grs.map((x) => (
            <option key={x} value={x}>
              {GRADE[x]}
            </option>
          ))}
        </Select>
        <Tip>不確定就選「待安排」，自動編組會放進同科目、同年級、不衝堂、人數最平均的課。</Tip>
        <span className={cx("ml-auto text-sm", pend.length ? "text-bad" : "text-mute")}>
          待安排 <b>{new Set(pend.map((n) => n.id)).size}</b> 人・{pend.length} 科
        </span>
      </div>
      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[13px] text-mute">
                <th className="sticky left-0 bg-card px-3 py-2 font-normal">學生</th>
                {subs.map((x) => (
                  <th key={x} className="px-2 py-2 font-normal">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="sticky left-0 bg-card px-3 py-1.5 font-bold whitespace-nowrap">{stuLabel(s)}</td>
                  {subs.map((sj) => {
                    const cur = on.find((x) => x.subject === sj && x.students.includes(s.id)),
                      p = pk.has(s.id + "|" + sj),
                      c = X.candidates(D, s, sj) as typeof D.groups,
                      rest = on.filter((x) => x.subject === sj && !c.includes(x));
                    const op = (x: (typeof D.groups)[number]) => (
                      <option key={x.id} value={x.id}>
                        {x.name + tn(x)}（{x.students.length} 人）
                      </option>
                    );
                    return (
                      <td key={sj} className="px-2 py-1.5">
                        <select
                          aria-label={stuLabel(s) + " " + sj}
                          disabled={!canEdit || busy}
                          className={cx("min-h-9 max-w-[14rem] rounded-lg border px-2", p ? "border-warn bg-warn-l text-warn" : cur ? "border-line2 bg-field" : "border-line bg-sunk text-mute")}
                          value={cur ? cur.id : p ? "?" : ""}
                          onChange={(e) => edit((D1) => setNeedD(D1, s.id, sj, e.target.value))}
                        >
                          <option value="">不上</option>
                          <option value="?">待安排</option>
                          {c.map(op)}
                          {rest.length > 0 && <optgroup label="其他年級的課">{rest.map(op)}</optgroup>}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

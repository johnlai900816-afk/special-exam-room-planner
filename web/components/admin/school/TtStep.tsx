"use client";
/* ② 全校課表（唯讀）：classes 文件的 ttJson（每班的科目、老師、節數；有 grid 也顯示）。讀 PDF、核對、改任課老師先用舊版。 */
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { useAdmin } from "@/components/AdminShell";
import { OLD_APP } from "@/components/Planned";
import { Card, SectionTitle, cx } from "@/components/ui";
import { CORE } from "@/lib/core";
import { NX } from "@/lib/legacy";

type Entry = [string, number, number?];
interface TtClass {
  subj: Record<string, Entry[]>;
  src?: string;
  guessCls?: unknown;
  grid?: unknown;
}

const COLS: [string, string[]][] = [
  ["國語文", ["國語文"]],
  ["英語文", ["英語文"]],
  ["數學", ["數學"]],
  ["社會", ["歷史", "地理", "公民與社會"]],
  ["自然", ["生物", "理化", "地球科學", "地科"]],
];
const MAIN = COLS.flatMap((c) => c[1]);
const th = "px-2 py-2 text-left text-[13px] font-normal text-mute whitespace-nowrap";
const td = "border-t border-line px-2 py-1.5 align-top";

function Cell({ o, subs }: { o: TtClass; subs: string[] }) {
  const a = subs.flatMap((s) => (o.subj[s] || []).slice(0, 1).map((x) => ({ s, x })));
  if (!a.length) return <span className="text-mute">－</span>;
  return (
    <>
      {a.map(({ s, x }) => (
        <span key={s} className={cx("block", !!x[2] && "text-warn")} title={s + " " + x[1] + " 節" + (x[2] ? "（待核對）" : "")}>
          {x[0]}
        </span>
      ))}
    </>
  );
}

function Grid({ g }: { g: unknown }) {
  if (!Array.isArray(g) || !g.every(Array.isArray)) return null;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="text-xs">
        <tbody>
          {(g as unknown[][]).map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border border-line px-1.5 py-1 whitespace-nowrap">
                  {String(c ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TtStep() {
  const { R, D } = useAdmin();
  const tt = useMemo(() => {
    const m: Record<string, TtClass> = {};
    Object.entries(R.classes).forEach(([id, c]) => {
      if (typeof c.ttJson !== "string") return;
      try {
        m[c.cls || NX.decId(id)] = JSON.parse(c.ttJson) as TtClass;
      } catch {
        /* 壞掉的略過 */
      }
    });
    return m;
  }, [R.classes]);
  const cls = Object.keys(tt).sort();
  const stuCls = [...new Set(D.students.map((s) => String(s.cls)).filter((c) => /^\d{3,4}$/.test(c)))].sort();
  const noTT = stuCls.filter((c) => !tt[c]);
  const unk = cls.reduce((a, c) => a + Object.values(tt[c].subj || {}).flat().filter((x) => x[2]).length, 0);
  const tn = (id: string) => D.teachers.find((t) => t.id === id)?.name || "";
  const canon = (CORE as unknown as { canonSubj(D: unknown, s: string): string }).canonSubj;
  const diff: string[] = [];
  cls.forEach((c) =>
    [
      ["國語文", "國文"],
      ["英語文", "英文"],
      ["數學", "數學"],
      ["理化", "理化"],
    ].forEach(([a, b]) => {
      const x = (tt[c].subj[a] || [])[0];
      if (!x || x[2]) return;
      const k = c + "|" + canon(D, b);
      const cur = D.classSubj[k] ? tn(D.classSubj[k]) : "";
      if (cur !== x[0]) diff.push(c + b + "：" + (cur || "沒填") + " → " + x[0]);
    }),
  );

  return (
    <>
      <Card>
        <SectionTitle no={1} extra={cls.length ? cls.length + " 班" + (unk ? "・" + unk + " 個待核對" : "") : ""}>
          各班老師
        </SectionTitle>
        {cls.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="bg-sunk">
                  <th className={th}>班級</th>
                  {COLS.map((c) => (
                    <th key={c[0]} className={th}>
                      {c[0]}
                    </th>
                  ))}
                  <th className={th}>其他</th>
                </tr>
              </thead>
              <tbody>
                {cls.map((c) => {
                  const o = tt[c];
                  const other = Object.keys(o.subj || {}).filter((s) => !MAIN.includes(s));
                  return (
                    <tr key={c}>
                      <td className={td}>
                        <details>
                          <summary className="cursor-pointer font-bold">{c}</summary>
                          <ul className="mt-1 min-w-[12rem] text-sm text-ink2">
                            {Object.entries(o.subj || {}).map(([s, a]) => (
                              <li key={s}>
                                {s}：{a.map((x) => x[0] + " " + x[1] + " 節").join("、")}
                              </li>
                            ))}
                          </ul>
                          {o.src && <p className="text-xs text-mute">{o.src}</p>}
                          <Grid g={o.grid} />
                        </details>
                      </td>
                      {COLS.map((col) => (
                        <td key={col[0]} className={td}>
                          <Cell o={o} subs={col[1]} />
                        </td>
                      ))}
                      <td className={td + " text-sm text-mute"}>{other.length} 科</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-mute">還沒有全校課表</p>
        )}
        <a href={OLD_APP + "#set/tt"} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line2 bg-card px-4 text-sm hover:bg-hover">
          <ExternalLink size={15} />
          讀課表 PDF（舊版）
        </a>
      </Card>
      {cls.length > 0 && (
        <Card className="mt-4">
          <SectionTitle no={2}>和名冊對照</SectionTitle>
          <ul className="space-y-1 text-[15px]">
            <li className={noTT.length ? "text-warn" : "text-ok"}>{noTT.length ? "課表沒有的班級：" + noTT.join("、") : "✓ 名冊的 " + stuCls.length + " 個班都有課表"}</li>
            <li className={diff.length ? "text-warn" : "text-ok"}>
              {diff.length ? "任課老師和課表不同 " + diff.length + " 格：" + diff.slice(0, 30).join("；") + (diff.length > 30 ? "…" : "") : "✓ 任課老師和課表一致"}
            </li>
          </ul>
        </Card>
      )}
    </>
  );
}

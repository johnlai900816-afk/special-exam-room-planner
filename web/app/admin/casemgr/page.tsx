"use client";
/* 個管分配（舊版 app.js cmOpen／cmRun／cmApply；core.suggestCaseMgr）：設每位資源班老師的上限、不當個管 →
   產生建議 → 看分配後的人數與要改的學生 → 勾選的才套用（老師的上限設定一起存）。 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminShell, useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { Badge, Button, Card, Input, PageHeader, SectionTitle } from "@/components/ui";
import { planCMApply, suggestCM, type CmResult, type CmTeacherOpt } from "@/lib/nx/admin";

const th = "px-2 py-2 text-left text-[13px] font-normal text-mute";
const td = "border-t border-line px-2 py-1.5";

function CaseMgr() {
  const { R, D, ro } = useAdmin();
  const { busy, run } = useApply();
  const res = D.teachers.filter((t) => t.role === "資源班");
  const [opts, setOpts] = useState<Record<string, CmTeacherOpt>>({});
  const [keep, setKeep] = useState(true);
  const [out, setOut] = useState<CmResult | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const cnt = useMemo(() => {
    const m = new Map<string, number>();
    D.students.forEach((s) => s.caseMgr && m.set(s.caseMgr, (m.get(s.caseMgr) || 0) + 1));
    return m;
  }, [D]);
  const cur = (id: string, k: keyof CmTeacherOpt) => {
    const o = opts[id];
    if (o && o[k] !== undefined) return o[k];
    const t = D.teachers.find((x) => x.id === id) as Record<string, unknown> | undefined;
    return t?.[k] as number | boolean | undefined;
  };
  const setOpt = (id: string, o: CmTeacherOpt) => {
    setOpts({ ...opts, [id]: { ...opts[id], ...o } });
    setOut(null);
  };
  const go = () => {
    const r = suggestCM(R, opts, keep);
    setOut(r);
    setPick(new Set(r.list.filter((x) => x.change).map((x) => x.sid)));
  };
  const apply = async () => {
    if (!out) return;
    const p = planCMApply(R, out, pick, opts);
    if (await run(p.ops, "已更新 " + p.result + " 位的個管")) {
      setOut(null);
      setOpts({});
    }
  };
  const ch = out ? out.list.filter((x) => x.change) : [];

  if (!res.length)
    return (
      <div>
        <PageHeader title="個管分配" />
        <div className="flex items-center gap-3 text-mute">
          還沒有資源班老師
          <Link href="/admin/settings/school/?step=tea" className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 text-ink hover:bg-hover">
            新增老師
          </Link>
        </div>
      </div>
    );

  return (
    <div className="max-w-[900px]">
      <Link href="/admin/students/" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-ink2 hover:text-ink">
        <ArrowLeft size={16} />
        學生
      </Link>
      <PageHeader
        title="個管分配"
        lead="勾選的才會改"
        actions={
          <Button tone={out ? "default" : "primary"} onClick={go}>
            產生建議
          </Button>
        }
      />
      <Card>
        <SectionTitle no={1}>資源班老師</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="bg-sunk">
                <th className={th}>老師</th>
                <th className={th}>目前</th>
                <th className={th}>最多</th>
                <th className={th}>不當個管</th>
              </tr>
            </thead>
            <tbody>
              {res.map((t) => (
                <tr key={t.id}>
                  <td className={td}>{t.name}</td>
                  <td className={td + " text-mute tabular-nums"}>{cnt.get(t.id) || 0} 位</td>
                  <td className={td}>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      className="w-20"
                      aria-label={t.name + " 最多幾位"}
                      placeholder="平均"
                      value={String((cur(t.id, "cmCap") as number) || "")}
                      onChange={(e) => setOpt(t.id, { cmCap: +e.target.value || 0 })}
                    />
                  </td>
                  <td className={td}>
                    <input type="checkbox" className="size-5" aria-label={t.name + " 不當個管"} checked={!!cur(t.id, "noCM")} onChange={(e) => setOpt(t.id, { noCM: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="mt-3 flex min-h-10 items-center gap-2 text-[15px]">
          <input type="checkbox" className="size-5" checked={keep} onChange={(e) => (setKeep(e.target.checked), setOut(null))} />
          已有個管的盡量不換
        </label>
      </Card>

      {out && (
        <>
          {out.note && <p className="mt-4 text-sm text-mute">{out.note}</p>}
          {out.summary.length > 0 && (
            <Card className="mt-4">
              <SectionTitle no={2}>分配後</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-[15px]">
                  <thead>
                    <tr className="bg-sunk">
                      <th className={th}>老師</th>
                      <th className={th}>人數</th>
                      <th className={th}>年級</th>
                      <th className={th}>要聯絡的班級</th>
                      <th className={th}>有教到的</th>
                    </tr>
                  </thead>
                  <tbody>
                    {out.summary.map((s) => (
                      <tr key={s.id}>
                        <td className={td}>{s.name}</td>
                        <td className={td + " tabular-nums"}>
                          {s.n}
                          <span className="text-mute">
                            {" "}
                            / {s.capSet ? "上限 " : "約 "}
                            {s.cap}
                          </span>
                          {s.n > s.cap && (
                            <>
                              {" "}
                              <Badge tone="warn">超過</Badge>
                            </>
                          )}
                        </td>
                        <td className={td}>{s.grades.map((g) => g + " 年級").join("、") || "－"}</td>
                        <td className={td}>{s.classes} 班</td>
                        <td className={td}>{s.taught} 位</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card className="mt-4">
            <SectionTitle no={3} extra={ch.length + " 位"}>
              要改的學生
            </SectionTitle>
            {ch.length ? (
              <>
                <div className="max-h-[50vh] overflow-auto">
                  <table className="w-full text-[15px]">
                    <thead className="sticky top-0">
                      <tr className="bg-sunk">
                        <th className={th + " w-10"}>
                          <input
                            type="checkbox"
                            className="size-5"
                            aria-label="全選"
                            checked={pick.size === ch.length}
                            onChange={(e) => setPick(e.target.checked ? new Set(ch.map((x) => x.sid)) : new Set())}
                          />
                        </th>
                        <th className={th}>班級座號</th>
                        <th className={th}>姓名</th>
                        <th className={th}>目前</th>
                        <th className={th}>建議</th>
                        <th className={th + " hidden sm:table-cell"}>理由</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ch.map((x) => (
                        <tr key={x.sid}>
                          <td className={td}>
                            <input
                              type="checkbox"
                              className="size-5"
                              aria-label={"套用 " + x.name}
                              checked={pick.has(x.sid)}
                              onChange={(e) => {
                                const n = new Set(pick);
                                if (e.target.checked) n.add(x.sid);
                                else n.delete(x.sid);
                                setPick(n);
                              }}
                            />
                          </td>
                          <td className={td + " tabular-nums"}>
                            {x.cls}
                            {x.seat ? "-" + String(x.seat).padStart(2, "0") : ""}
                          </td>
                          <td className={td}>{x.name}</td>
                          <td className={td + " text-mute"}>{x.fromName || "沒有"}</td>
                          <td className={td}>
                            <b>{x.toName}</b>
                          </td>
                          <td className={td + " hidden text-sm text-mute sm:table-cell"}>{x.why.join("、") || "平均人數"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button tone="primary" disabled={!pick.size || busy || ro("students")} onClick={apply}>
                    套用勾選的（{pick.size}）
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-mute">目前的分配不需要改</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default function CaseMgrPage() {
  return (
    <AdminShell title="個管分配">
      <CaseMgr />
    </AdminShell>
  );
}

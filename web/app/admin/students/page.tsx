"use client";
/* 學生名單（舊版 app.js renderStu）：篩選（年級、個管、本月到期、搜尋）、勾選後批次指定個管、新增學生。點一位進個案頁。 */
import { ChevronRight, Plus, Search, UserCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminShell, useAdmin } from "@/components/AdminShell";
import { CmOptions } from "@/components/admin/CmOptions";
import { useApply } from "@/components/admin/useApply";
import { Badge, Button, Card, Input, PageHeader, Select, cx } from "@/components/ui";
import { C, filterRows, gradesOf, planAddStudent, planBulkCM, studentRows, type StuFilter } from "@/lib/nx/admin";
import { useQuery } from "@/lib/nx/hooks";
import { ymd } from "@/lib/nx/today";


function AddStudent({ onDone }: { onDone: () => void }) {
  const { R, ro } = useAdmin();
  const { busy, run } = useApply();
  const router = useRouter();
  const [f, setF] = useState({ cls: "", seat: "", name: "" });
  const ok = /^\d{3,4}$/.test(f.cls.trim()) && f.name.trim();
  const add = async () => {
    const p = planAddStudent(R, f);
    if (await run(p.ops, "已新增 " + f.name.trim())) {
      onDone();
      router.push("/admin/student/?id=" + encodeURIComponent(p.result));
    }
  };
  return (
    <Card className="mb-4">
      <div className="grid grid-cols-[5em_4em_1fr] gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Input aria-label="班級" placeholder="班級" value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value })} className="sm:w-24" />
        <Input aria-label="座號" placeholder="座號" value={f.seat} onChange={(e) => setF({ ...f, seat: e.target.value })} className="sm:w-20" />
        <Input aria-label="姓名" placeholder="姓名" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="sm:w-40" />
        <div className="col-span-3 flex gap-2">
          <Button tone="primary" disabled={!ok || busy || ro("students")} onClick={add}>
            新增
          </Button>
          <Button tone="ghost" onClick={onDone}>
            取消
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Students() {
  const { R, D, ro } = useAdmin();
  const q = useQuery();
  const { busy, run } = useApply();
  const [f, setF] = useState<StuFilter>({ q: "", grade: "", cm: q.get("cm") || "", due: q.get("due") === "1" });
  const [chk, setChk] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("");
  const [adding, setAdding] = useState(false);
  const today = ymd(new Date());
  const all = useMemo(() => studentRows(R, today), [R, today]);
  const rows = useMemo(() => filterRows(all, f), [all, f]);
  const grades = gradesOf(R);
  const cmIds = [...new Set(all.map((r) => r.s.caseMgrId).filter(Boolean))];
  const nDue = all.filter((r) => r.due.length).length;
  const lock = ro("students");

  const toggle = (id: string, on: boolean) => {
    const n = new Set(chk);
    if (on) n.add(id);
    else n.delete(id);
    setChk(n);
  };
  const allOn = rows.length > 0 && rows.every((r) => chk.has(r.id));
  const doBulk = async () => {
    const t = D.teachers.find((x) => x.id === bulk);
    if (!confirm(chk.size + " 位學生的個管改成「" + (t ? t.name : "未指定") + "」？")) return;
    const p = planBulkCM(R, [...chk], bulk);
    if (await run(p.ops, "已指定 " + p.result + " 位")) setChk(new Set());
  };

  return (
    <div>
      <PageHeader
        title="學生"
        actions={
          <>
            <Button tone="primary" disabled={lock} onClick={() => setAdding(true)}>
              <Plus size={16} />
              新增學生
            </Button>
            <Link href="/admin/casemgr/" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line2 bg-card px-4 text-[15px] hover:bg-hover">
              <UserCog size={16} />
              個管分配
            </Link>
          </>
        }
      />
      {adding && <AddStudent onDone={() => setAdding(false)} />}
      {!all.length ? (
        <div className="flex flex-wrap items-center gap-3 py-4 text-mute">
          還沒有學生
          <Link href="/admin/settings/school/?step=import" className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 text-ink hover:bg-hover">
            匯入名單
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
              <Search size={18} className="pointer-events-none absolute left-3 text-mute" />
              <Input type="search" className="w-full pl-10" placeholder="姓名或班級" aria-label="搜尋學生" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            </label>
            <Select aria-label="年級" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}>
              <option value="">全部年級</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {C.GRADE[g]}
                </option>
              ))}
            </Select>
            <Select aria-label="個管老師" value={f.cm} onChange={(e) => setF({ ...f, cm: e.target.value })}>
              <option value="">全部個管</option>
              {cmIds.map((id) => (
                <option key={id} value={id}>
                  {D.teachers.find((t) => t.id === id)?.name || id}
                </option>
              ))}
              <option value="-">沒有個管</option>
            </Select>
            <button
              type="button"
              aria-pressed={f.due}
              onClick={() => setF({ ...f, due: !f.due })}
              className={cx("min-h-10 rounded-full border px-4 text-sm", f.due ? "border-ink bg-ink text-on-ink" : "border-line2 bg-card text-ink2 hover:bg-hover")}
            >
              本月到期{nDue ? " " + nDue : ""}
            </button>
            <span className="ml-auto text-sm text-mute tabular-nums">
              <b className="text-ink">{rows.length}</b>
              {rows.length < all.length ? " / " + all.length : ""} 人
            </span>
          </div>

          {chk.size > 0 && (
            <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-blue-l px-4 py-2 md:top-2">
              <span className="text-sm">
                已勾 <b>{chk.size}</b> 位
              </span>
              <Select aria-label="要指定的個管老師" value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-9 py-0 text-sm">
                <CmOptions D={D} />
              </Select>
              <Button size="sm" tone="primary" disabled={busy || lock} onClick={doBulk}>
                指定個管
              </Button>
              <Button size="sm" tone="ghost" onClick={() => setChk(new Set())}>
                取消
              </Button>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-line bg-card">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="bg-sunk text-left text-[13px] text-mute">
                  <th className="w-10 px-3 py-2 font-normal">
                    <input
                      type="checkbox"
                      className="size-5 align-middle"
                      aria-label="全選"
                      checked={allOn}
                      onChange={(e) => setChk(e.target.checked ? new Set([...chk, ...rows.map((r) => r.id)]) : new Set([...chk].filter((id) => !rows.some((r) => r.id === id))))}
                    />
                  </th>
                  <th className="px-2 py-2 font-normal whitespace-nowrap">班級座號</th>
                  <th className="px-2 py-2 font-normal">姓名</th>
                  <th className="px-2 py-2 font-normal">個管</th>
                  <th className="hidden px-2 py-2 font-normal sm:table-cell">組別</th>
                  <th className="hidden px-2 py-2 font-normal md:table-cell">段考服務</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line hover:bg-hover">
                    <td className="px-3 py-1.5">
                      <input type="checkbox" className="size-5 align-middle" aria-label={"勾選 " + r.s.name} checked={chk.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-ink2 tabular-nums">
                      {r.s.cls}
                      {r.s.seat ? "-" + String(r.s.seat).padStart(2, "0") : ""}
                    </td>
                    <td className="px-2 py-1.5">
                      <Link href={"/admin/student/?id=" + encodeURIComponent(r.id)} className="inline-flex min-h-9 items-center gap-2 font-bold whitespace-nowrap hover:text-blue">
                        {r.s.name || "（未填姓名）"}
                        {r.due.length > 0 && <Badge tone="warn">到期</Badge>}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.cmName || <span className="text-mute">—</span>}</td>
                    <td className="hidden min-w-[8rem] px-2 py-1.5 text-sm text-ink2 sm:table-cell">{r.groups.join("、") || "—"}</td>
                    <td className="hidden px-2 py-1.5 md:table-cell">
                      <span className="flex flex-wrap gap-1">
                        {r.svc.map((x) => (
                          <Badge key={x}>{x}</Badge>
                        ))}
                      </span>
                    </td>
                    <td className="pr-2">
                      <Link href={"/admin/student/?id=" + encodeURIComponent(r.id)} aria-label={"打開 " + r.s.name} className="flex size-9 items-center justify-center text-mute">
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <div className="flex items-center gap-3 py-4 text-mute">
              沒有符合的學生
              <Button size="sm" onClick={() => setF({ q: "", grade: "", cm: "", due: false })}>
                清除篩選
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StudentsPage() {
  return (
    <AdminShell title="學生">
      <Students />
    </AdminShell>
  );
}

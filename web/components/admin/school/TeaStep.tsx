"use client";
/* ③ 老師與任課（舊版 app.js renderTeaAll、teachHtml、delTeacher、pruneTeachers）：
   老師名冊（身分、基本鐘點、減授、超鐘點上限、不排課、備註）與各班任課老師（classes.subj）。改一格就存（planOnD → 一批寫入）。 */
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { Button, Card, Input, SectionTitle, Select } from "@/components/ui";
import { CORE } from "@/lib/core";
import type { RcData, Teacher } from "@/lib/types";

const th = "px-2 py-2 text-left text-[13px] font-normal text-mute whitespace-nowrap";
const td = "border-t border-line px-2 py-1.5 align-middle";
type C3 = typeof CORE & { ROLES: string[]; teaByName(D: RcData, n: string): Teacher | null; newTeacher(D: RcData, n: string, role: string): Teacher };
const X = CORE as C3;

type NumKey = "hours" | "reduce" | "otMax";
function setNum(t: Teacher, k: NumKey, v: string) {
  const s = v.trim();
  if (k === "hours") t.hours = Math.max(0, +s || 0);
  else if (s === "") delete t[k];
  else t[k] = k === "otMax" ? Math.max(0, Math.floor(+s || 0)) : Math.max(0, +s || 0);
}

export function TeaStep() {
  const { D, board, ro } = useAdmin();
  const { busy, edit } = useApply();
  const lock = ro("teachers");
  const [del, setDel] = useState<{ id: string; to: string } | null>(null);

  const use = useMemo(() => {
    const u: Record<string, Set<string>> = {};
    const add = (id: string, x: string) => id && (u[id] = u[id] || new Set()).add(x);
    D.groups.forEach((g) => add(g.teacher, g.name));
    Object.entries(D.classSubj).forEach(([k, id]) => add(id, k.replace("|", "")));
    return u;
  }, [D]);
  const cases = (id: string) => D.students.filter((s) => s.caseMgr === id).length;

  const setT = (id: string, f: (t: Teacher) => void) =>
    edit((D2) => {
      const t = D2.teachers.find((x) => x.id === id);
      if (!t) return false;
      f(t);
    });
  const addT = () => edit((D2) => void D2.teachers.push({ id: CORE.uid("t"), name: "新老師", role: "普通班", off: [], note: "", hours: 0 } as Teacher), "已新增");
  const delT = (id: string, to: string) =>
    edit((D2) => {
      const i = D2.teachers.findIndex((x) => x.id === id);
      if (i < 0) return false;
      D2.groups.forEach((g) => g.teacher === id && (g.teacher = ""));
      Object.keys(D2.classSubj).forEach((k) => D2.classSubj[k] === id && delete D2.classSubj[k]);
      D2.students.forEach((s) => s.caseMgr === id && (s.caseMgr = to || ""));
      D2.teachers.splice(i, 1);
    }, "已刪除");
  const askDel = (t: Teacher) => {
    if (cases(t.id)) return setDel({ id: t.id, to: "" });
    if (confirm("刪除 " + t.name + "？他的組別和任課會變成未指定。")) delT(t.id, "");
  };
  const prune = () => {
    const used = new Set([...Object.values(D.classSubj), ...D.groups.map((g) => g.teacher), ...D.students.map((s) => s.caseMgr)]);
    const a = D.teachers.filter((t) => t.role !== "資源班" && !used.has(t.id) && !t.off.length && !t.note);
    if (!a.length) return alert("沒有可以移除的老師");
    if (!confirm("這 " + a.length + " 位老師沒有用到：\n" + a.map((t) => t.name).join("、") + "\n\n移除嗎？")) return;
    const ids = new Set(a.map((t) => t.id));
    edit((D2) => void (D2.teachers = D2.teachers.filter((t) => !ids.has(t.id))), "已移除 " + a.length + " 位");
  };

  // 各班任課老師：只有抽離課要原班配合
  const need = useMemo(() => {
    const n: Record<string, Set<string>> = {};
    const subs: string[] = [];
    board?.M.G.forEach((g) => {
      if (!g.need || !g.per) return;
      if (!subs.includes(g.subject)) subs.push(g.subject);
      g.cls.forEach((c) => (n[c] = n[c] || new Set()).add(g.subject));
    });
    return { n, subs, cls: Object.keys(n).sort() };
  }, [board]);
  const csName = (k: string) => D.teachers.find((t) => t.id === D.classSubj[k])?.name || "";
  const setCS = (k: string, name: string) => {
    name = name.trim();
    if (name === csName(k)) return;
    edit((D2) => {
      if (!name) return void delete D2.classSubj[k];
      const t = X.teaByName(D2, name) || X.newTeacher(D2, name, "普通班");
      D2.classSubj[k] = t.id;
    });
  };
  const tot = need.cls.reduce((a, c) => a + need.n[c].size, 0);
  const done = need.cls.reduce((a, c) => a + [...need.n[c]].filter((sj) => D.classSubj[c + "|" + sj]).length, 0);
  const delTea = del ? D.teachers.find((t) => t.id === del.id) : null;

  return (
    <>
      <Card>
        <SectionTitle no={1} extra={D.teachers.length + " 位"}>
          老師
        </SectionTitle>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button tone="primary" disabled={lock || busy} onClick={addT}>
            <Plus size={16} />
            新增老師
          </Button>
          <Button disabled={lock || busy} onClick={prune}>
            移除沒用到的
          </Button>
        </div>
        {delTea && (
          <div className="mb-3 rounded-xl border border-bad/30 bg-bad-l p-3 text-[15px]">
            <p className="mb-2">
              {delTea.name} 是 {cases(delTea.id)} 位學生的個管。誰接手？
            </p>
            <div className="flex flex-wrap gap-2">
              <Select aria-label="接手的個管老師" value={del!.to} onChange={(e) => setDel({ ...del!, to: e.target.value })}>
                <option value="">先不指定</option>
                {D.teachers
                  .filter((t) => t.role === "資源班" && t.id !== delTea.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
              <Button tone="danger" onClick={() => (delT(delTea.id, del!.to), setDel(null))}>
                刪除
              </Button>
              <Button tone="ghost" onClick={() => setDel(null)}>
                取消
              </Button>
            </div>
          </div>
        )}
        <datalist id="roleList">
          {X.ROLES.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="bg-sunk">
                <th className={th}>姓名</th>
                <th className={th}>身分</th>
                <th className={th}>基本鐘點</th>
                <th className={th}>減授</th>
                <th className={th}>超鐘點上限</th>
                <th className={th}>不排課</th>
                <th className={th}>個案</th>
                <th className={th + " hidden lg:table-cell"}>開課、任課</th>
                <th className={th}>備註</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {D.teachers.map((t) => (
                <tr key={t.id}>
                  <td className={td}>
                    <Input className="w-28" aria-label="姓名" disabled={lock} defaultValue={t.name} key={"n" + t.name} onBlur={(e) => e.target.value.trim() !== t.name && setT(t.id, (x) => (x.name = e.target.value.trim() || x.name))} />
                  </td>
                  <td className={td}>
                    <Input className="w-24" list="roleList" aria-label={t.name + " 身分"} disabled={lock} defaultValue={t.role} key={"r" + t.role} onBlur={(e) => e.target.value.trim() !== t.role && setT(t.id, (x) => (x.role = e.target.value.trim() || "普通班"))} />
                  </td>
                  {(["hours", "reduce", "otMax"] as NumKey[]).map((k) => (
                    <td key={k} className={td}>
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        className="w-20"
                        aria-label={t.name + " " + { hours: "基本鐘點", reduce: "減授節數", otMax: "每週最多超鐘點" }[k]}
                        disabled={lock}
                        placeholder={k === "otMax" ? "—" : ""}
                        defaultValue={t[k] == null || (k !== "otMax" && !t[k]) ? "" : String(t[k])}
                        key={k + String(t[k] ?? "")}
                        onBlur={(e) => e.target.value !== (t[k] == null || (k !== "otMax" && !t[k]) ? "" : String(t[k])) && setT(t.id, (x) => setNum(x, k, e.target.value))}
                      />
                      {k === "reduce" && !!t.reduce && (
                        <Input
                          className="mt-1 w-20 text-sm"
                          aria-label={t.name + " 減授原因"}
                          placeholder="原因"
                          disabled={lock}
                          defaultValue={String(t.reduceNote || "")}
                          key={"rn" + String(t.reduceNote || "")}
                          onBlur={(e) => e.target.value.trim() !== String(t.reduceNote || "") && setT(t.id, (x) => (x.reduceNote = e.target.value.trim()))}
                        />
                      )}
                    </td>
                  ))}
                  <td className={td}>
                    <Link href={"/admin/settings/school/?step=off&k=" + encodeURIComponent("t:" + t.id)} className="inline-flex min-h-9 items-center rounded-full border border-line2 px-3 text-sm whitespace-nowrap hover:bg-hover">
                      {t.off.length ? t.off.length + " 格" : "設定"}
                    </Link>
                  </td>
                  <td className={td + " text-mute tabular-nums"}>{cases(t.id) || ""}</td>
                  <td className={td + " hidden max-w-[16rem] text-sm text-mute lg:table-cell"}>{[...(use[t.id] || [])].join("、")}</td>
                  <td className={td}>
                    <Input className="w-32" aria-label={t.name + " 備註"} disabled={lock} defaultValue={t.note || ""} key={"o" + (t.note || "")} onBlur={(e) => e.target.value !== (t.note || "") && setT(t.id, (x) => (x.note = e.target.value))} />
                  </td>
                  <td className={td}>
                    <Button size="sm" tone="ghost" aria-label={"刪除 " + t.name} disabled={lock} onClick={() => askDel(t)}>
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <SectionTitle no={2} extra={need.cls.length ? "已填 " + done + " / " + tot : ""}>
          各班任課老師
        </SectionTitle>
        {need.cls.length ? (
          <>
            <datalist id="tnames">
              {D.teachers
                .filter((t) => t.role !== "資源班")
                .map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
            </datalist>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="bg-sunk">
                    <th className={th}>班級</th>
                    {need.subs.map((s) => (
                      <th key={s} className={th}>
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {need.cls.map((c) => (
                    <tr key={c}>
                      <td className={td}>
                        <b>{c}</b>
                      </td>
                      {need.subs.map((sj) => {
                        const k = c + "|" + sj;
                        return (
                          <td key={sj} className={td}>
                            {need.n[c].has(sj) ? (
                              <Input
                                className={"w-28" + (D.classSubj[k] ? "" : " border-warn")}
                                list="tnames"
                                aria-label={c + " " + sj}
                                placeholder="姓名"
                                disabled={ro("classes")}
                                defaultValue={csName(k)}
                                key={k + csName(k)}
                                onBlur={(e) => setCS(k, e.target.value)}
                              />
                            ) : (
                              <span className="text-mute">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-mute">還沒有抽離課，不用填</p>
        )}
      </Card>
    </>
  );
}

"use client";
/* ④ 不排課時段（舊版 app.js renderOff／offTarget／togOff）：全校、年級、學生群組、班級（不排課、不能鎖課）、學生個人、老師。
   排課時每一層疊在一起避開；格子灰色斜線＝上一層已經不排。點格子切換；點星期或節次整排切換。 */
import { useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { Button, Card, Select, cx } from "@/components/ui";
import { CORE, DAYS } from "@/lib/core";
import { C, sortStu, stuLabel } from "@/lib/nx/admin";
import { useQuery } from "@/lib/nx/hooks";
import { SchedImpact } from "./SchedImpact";
import type { RcData, SlotKey } from "@/lib/types";

type Dx = RcData & { blocked: SlotKey[]; offBy: Record<string, SlotKey[]>; sets: { id: string; name: string; students: string[]; off: SlotKey[] }[] };

/** 這一層的時段陣列（沒有就建一個空的；寫的時候用） */
function arrOf(D: Dx, k: string): SlotKey[] | null {
  const id = k.slice(2);
  if (k === "*") return (D.blocked = D.blocked || []);
  if (k[0] === "x") return D.sets.find((o) => o.id === id)?.off || null;
  if (k[0] === "t") return D.teachers.find((o) => o.id === id)?.off || null;
  D.offBy = D.offBy || {};
  return (D.offBy[k] = D.offBy[k] || []);
}
function keysOf(D: Dx, k: string): SlotKey[] {
  if (k === "*") return D.blocked || [];
  if (k[0] === "x") return D.sets.find((o) => o.id === k.slice(2))?.off || [];
  if (k[0] === "t") return D.teachers.find((o) => o.id === k.slice(2))?.off || [];
  return (D.offBy || {})[k] || [];
}
/** 上面幾層（舊 offTarget().up） */
function upOf(D: Dx, k: string): string[] {
  const id = k.slice(2);
  if (k === "*") return [];
  if (k[0] === "g" || k[0] === "x" || k[0] === "t") return ["*"];
  if (k[0] === "c") return ["*", "g:" + CORE.gradeOfCls(id)];
  if (k[0] === "k") return ["*", "g:" + CORE.gradeOfCls(id), "c:" + id];
  if (k[0] === "s") {
    const s = D.students.find((x) => x.id === id);
    if (!s) return ["*"];
    return ["*", "g:" + CORE.gradeOfCls(s.cls), "c:" + s.cls, ...D.sets.filter((x) => x.students.includes(id)).map((x) => "x:" + x.id)];
  }
  return ["*"];
}

export function OffStep() {
  const { D: D0, ro } = useAdmin();
  const D = D0 as Dx;
  const q = useQuery();
  const { busy, edit } = useApply();
  const [k, setK] = useState(q.get("k") || "*");
  const lock = ro("term") || ro("teachers") || ro("students");
  const NP = D.periods.length;

  const items = useMemo(() => {
    const it: { k: string; name: string; grp: string }[] = [{ k: "*", name: "全校共同不排", grp: "全校" }];
    let gs = [...new Set(D.students.map((s) => CORE.gradeOfCls(s.cls)).filter((g) => C.GRADE[g]))].sort();
    if (!gs.length) gs = [7, 8, 9];
    gs.forEach((g) => it.push({ k: "g:" + g, name: C.GRADE[g], grp: "年級" }));
    (D.sets || []).forEach((x) => it.push({ k: "x:" + x.id, name: x.name, grp: "學生群組" }));
    Object.keys(D.offBy || {})
      .filter((x) => (x[0] === "c" || x[0] === "k") && (D.offBy[x].length || x === k))
      .sort()
      .forEach((x) => it.push({ k: x, name: x.slice(2) + " 班" + (x[0] === "k" ? "（不能鎖課）" : ""), grp: "班級" }));
    D.students.forEach((s) => {
      if ((D.offBy?.["s:" + s.id] || []).length || "s:" + s.id === k) it.push({ k: "s:" + s.id, name: stuLabel(s as never), grp: "學生" });
    });
    D.teachers.filter((t) => t.role === "資源班").forEach((t) => it.push({ k: "t:" + t.id, name: t.name, grp: "資源班老師" }));
    D.teachers.filter((t) => t.role !== "資源班").forEach((t) => it.push({ k: "t:" + t.id, name: t.name, grp: "其他老師" }));
    if ((k[0] === "c" || k[0] === "k") && !it.some((o) => o.k === k)) it.push({ k, name: k.slice(2) + " 班" + (k[0] === "k" ? "（不能鎖課）" : ""), grp: "班級" });
    return it.map((o) => ({ ...o, n: keysOf(D, o.k).length }));
  }, [D, k]);
  const cur = items.find((o) => o.k === k) || items[0];
  const on = new Set(keysOf(D, cur.k));
  const up = new Set(upOf(D, cur.k).flatMap((u) => keysOf(D, u)));
  const cls = [...new Set(D.students.map((s) => String(s.cls)))].filter(Boolean).sort();
  const keyOf = (di: number, pi: number) => di + "-" + D.periods[pi].id;

  const tog = (keys: SlotKey[]) =>
    edit((D2) => {
      const a = arrOf(D2 as Dx, cur.k);
      if (!a) return false;
      const all = keys.every((x) => a.includes(x));
      keys.forEach((x) => {
        const i = a.indexOf(x);
        if (all) a.splice(i, 1);
        else if (i < 0) a.push(x);
      });
    });
  const copy = (from: string) =>
    from &&
    edit((D2) => {
      const a = arrOf(D2 as Dx, cur.k);
      if (!a) return false;
      keysOf(D2 as Dx, from).forEach((x) => !a.includes(x) && a.push(x));
    });
  const clear = () =>
    edit((D2) => {
      const a = arrOf(D2 as Dx, cur.k);
      if (!a) return false;
      a.length = 0;
    });
  const grps = [...new Set(items.map((o) => o.grp))];
  const allKeys = DAYS.flatMap((_, di) => D.periods.map((__, pi) => keyOf(di, pi)));

  return (
    <Card>
      <SchedImpact kinds="off" />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select aria-label="對象" value={cur.k} onChange={(e) => setK(e.target.value)} className="min-w-[12rem]">
          {grps.map((g) => (
            <optgroup key={g} label={g}>
              {items
                .filter((o) => o.grp === g)
                .map((o) => (
                  <option key={o.k} value={o.k}>
                    {o.name}
                    {o.n ? "（" + o.n + " 格）" : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        <Select aria-label="加一個班級" value="" onChange={(e) => e.target.value && setK(e.target.value)}>
          <option value="">＋ 班級…</option>
          {cls.map((c) => (
            <option key={"c" + c} value={"c:" + c}>
              {c} 班
            </option>
          ))}
          {cls.map((c) => (
            <option key={"k" + c} value={"k:" + c}>
              {c} 班（不能鎖課）
            </option>
          ))}
        </Select>
        <Select aria-label="加一位學生" value="" onChange={(e) => e.target.value && setK(e.target.value)}>
          <option value="">＋ 學生…</option>
          {[...D.students].sort(sortStu as never).map((s) => (
            <option key={s.id} value={"s:" + s.id}>
              {stuLabel(s as never)}
            </option>
          ))}
        </Select>
      </div>
      <p className="mb-2 text-sm text-mute">
        {cur.name}　{on.size} 格{up.size ? "　斜線＝上一層已不排" : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-sm">
          <thead>
            <tr>
              <th className="w-20">
                <button type="button" disabled={lock || busy} className="min-h-9 w-full rounded-md text-mute hover:bg-hover" onClick={() => tog(allKeys)}>
                  全部
                </button>
              </th>
              {DAYS.map((d, di) => (
                <th key={d}>
                  <button type="button" disabled={lock || busy} className="min-h-9 w-full rounded-md hover:bg-hover" onClick={() => tog(D.periods.map((_, pi) => keyOf(di, pi)))}>
                    週{d}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {D.periods.map((p, pi) => (
              <tr key={p.id}>
                <th className="text-left font-normal">
                  <button type="button" disabled={lock || busy} className="flex min-h-10 w-full flex-col items-start rounded-md px-1 hover:bg-hover" onClick={() => tog(DAYS.map((_, di) => keyOf(di, pi)))}>
                    <span className={p.extra ? "text-mute" : ""}>{p.name}</span>
                    <small className="text-xs text-mute">{p.start}</small>
                  </button>
                </th>
                {DAYS.map((d, di) => {
                  const key = keyOf(di, pi);
                  const x = on.has(key);
                  const u = !x && up.has(key);
                  return (
                    <td key={d}>
                      <button
                        type="button"
                        disabled={lock || busy}
                        aria-pressed={x}
                        aria-label={"週" + d + p.name + (x ? "：不排" : u ? "：上一層已不排" : "")}
                        onClick={() => tog([key])}
                        className={cx(
                          "flex h-10 w-full items-center justify-center rounded-md border text-xs",
                          x ? "border-bad/30 bg-bad-l text-bad" : u ? "border-line bg-[repeating-linear-gradient(45deg,var(--sunk),var(--sunk)_4px,transparent_4px,transparent_8px)] text-mute" : "border-transparent text-mute hover:border-line hover:bg-hover",
                        )}
                      >
                        {x ? "不排" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Select aria-label="從別的對象複製" value="" disabled={lock || busy} onChange={(e) => copy(e.target.value)}>
          <option value="">從別的對象複製…</option>
          {items
            .filter((o) => o.n && o.k !== cur.k)
            .map((o) => (
              <option key={o.k} value={o.k}>
                {o.name}（{o.n} 格）
              </option>
            ))}
        </Select>
        <Button size="sm" disabled={lock || busy || !on.size} onClick={clear}>
          清空
        </Button>
      </div>
      {NP === 0 && <p className="mt-2 text-sm text-warn">還沒有作息</p>}
    </Card>
  );
}

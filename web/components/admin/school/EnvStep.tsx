"use client";
/* ⑤ 教室與作息（舊版 app.js renderEnv、prefBox）：教室（備用）、資源班老師偏好的教室（志願順序）、作息（外加、與下一節不相連）。 */
import { ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { Button, Card, Input, SectionTitle, Select } from "@/components/ui";
import { CORE } from "@/lib/core";
import type { Period, RcData, Room, Teacher } from "@/lib/types";
import { SchedImpact } from "./SchedImpact";

const th = "px-2 py-2 text-left text-[13px] font-normal text-mute whitespace-nowrap";
const td = "border-t border-line px-2 py-1.5";
type RoomX = Room & { spare?: boolean };
type PerX = Period & { extra?: boolean; breakAfter?: boolean };

export function EnvStep() {
  const { D, ro } = useAdmin();
  const { busy, edit } = useApply();
  const lock = ro("term");
  const rooms = D.rooms as RoomX[];
  const periods = D.periods as PerX[];
  const nMain = rooms.filter((r) => !r.spare).length;

  const room = (i: number, f: (r: RoomX, D2: RcData) => void) =>
    edit((D2) => {
      const r = D2.rooms[i] as RoomX;
      if (!r) return false;
      f(r, D2);
    });
  const per = (i: number, f: (p: PerX, a: PerX[]) => void) =>
    edit((D2) => {
      const a = D2.periods as PerX[];
      if (!a[i]) return false;
      f(a[i], a);
    });
  const prefs = (t: Teacher) => ((Array.isArray(t.prefRooms) ? t.prefRooms : []) as string[]).filter((id) => rooms.some((r) => r.id === id));
  const setPref = (tid: string, f: (a: string[]) => string[]) =>
    edit((D2) => {
      const t = D2.teachers.find((x) => x.id === tid);
      if (!t) return false;
      t.prefRooms = f(prefs(t));
    });
  const res = D.teachers.filter((t) => t.role === "資源班");

  return (
    <>
      <SchedImpact kinds="room,off" />
      <Card>
        <SectionTitle no={1} extra={rooms.length ? "同一節最多 " + nMain + " 組" + (rooms.length > nMain ? "，加上備用 " + rooms.length + " 組" : "") : ""}>
          教室
        </SectionTitle>
        <ul className="flex flex-wrap gap-2">
          {rooms.map((r, i) => (
            <li key={r.id} className="flex items-center gap-1.5 rounded-full border border-line bg-sunk py-1 pr-1 pl-2">
              <Input
                className="min-h-9 w-32 py-0"
                aria-label="教室名稱"
                disabled={lock}
                defaultValue={r.name}
                key={r.name}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && room(i, (x) => (x.name = e.target.value.trim()))}
              />
              <label className="flex min-h-9 items-center gap-1 text-sm">
                <input type="checkbox" disabled={lock} checked={!!r.spare} onChange={(e) => room(i, (x) => (e.target.checked ? (x.spare = true) : delete x.spare))} />
                備用
              </label>
              <Button
                size="sm"
                tone="ghost"
                aria-label={"刪除 " + r.name}
                disabled={lock || busy}
                onClick={() =>
                  confirm("刪除「" + r.name + "」？指定這間的課會改成自動安排。") &&
                  edit((D2) => {
                    D2.rooms.splice(i, 1);
                  })
                }
              >
                <X size={15} />
              </Button>
            </li>
          ))}
          <li>
            <Button size="sm" disabled={lock || busy} onClick={() => edit((D2) => void D2.rooms.push({ id: CORE.uid("r"), name: "新教室" } as Room))}>
              <Plus size={15} />
              新增教室
            </Button>
          </li>
        </ul>
        {!rooms.length && <p className="mt-2 text-sm text-warn">還沒有教室，排課不會限制同一節的組數</p>}
      </Card>

      {res.length > 0 && rooms.length > 0 && (
        <Card className="mt-4">
          <SectionTitle no={2}>老師偏好的教室</SectionTitle>
          <ul className="flex flex-col divide-y divide-line">
            {res.map((t) => {
              const a = prefs(t);
              const rest = rooms.filter((r) => !a.includes(r.id));
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-20 shrink-0">{t.name}</span>
                  {a.map((id, k) => (
                    <span key={id} className="inline-flex items-center gap-0.5 rounded-full bg-blue-l py-0.5 pr-0.5 pl-2.5 text-sm text-blue">
                      {k + 1}. {rooms.find((r) => r.id === id)?.name}
                      {k > 0 && (
                        <button type="button" aria-label="往前移" disabled={lock} className="flex size-8 items-center justify-center rounded-full hover:bg-card" onClick={() => setPref(t.id, (x) => ([x[k - 1], x[k]] = [x[k], x[k - 1]]) && x)}>
                          <ArrowUp size={14} />
                        </button>
                      )}
                      <button type="button" aria-label="拿掉" disabled={lock} className="flex size-8 items-center justify-center rounded-full hover:bg-card" onClick={() => setPref(t.id, (x) => x.filter((_, j) => j !== k))}>
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  {rest.length > 0 && (
                    <Select aria-label={t.name + " 偏好的教室"} className="min-h-9 py-0 text-sm" disabled={lock} value="" onChange={(e) => e.target.value && setPref(t.id, (x) => [...x, e.target.value])}>
                      <option value="">{a.length ? "再加一間…" : "不限"}</option>
                      {rest.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.spare ? "（備用）" : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <SectionTitle no={res.length && rooms.length ? 3 : 2}>作息</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead>
              <tr className="bg-sunk">
                <th className={th}>名稱</th>
                <th className={th}>開始</th>
                <th className={th}>結束</th>
                <th className={th}>外加</th>
                <th className={th}>與下一節不相連</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {periods.map((p, i) => (
                <tr key={p.id}>
                  <td className={td}>
                    <Input className="w-24" aria-label="節次名稱" disabled={lock} defaultValue={p.name} key={"n" + p.name} onBlur={(e) => e.target.value.trim() !== p.name && per(i, (x) => (x.name = e.target.value.trim() || x.name))} />
                  </td>
                  <td className={td}>
                    <Input type="time" aria-label={p.name + " 開始"} disabled={lock} defaultValue={p.start} key={"s" + p.start} onBlur={(e) => e.target.value !== p.start && per(i, (x) => (x.start = e.target.value))} />
                  </td>
                  <td className={td}>
                    <Input type="time" aria-label={p.name + " 結束"} disabled={lock} defaultValue={p.end} key={"e" + p.end} onBlur={(e) => e.target.value !== p.end && per(i, (x) => (x.end = e.target.value))} />
                  </td>
                  <td className={td}>
                    <input type="checkbox" className="size-5" aria-label={p.name + " 外加"} disabled={lock} checked={!!p.extra} onChange={(e) => per(i, (x) => (e.target.checked ? (x.extra = true) : delete x.extra))} />
                  </td>
                  <td className={td}>
                    {i < periods.length - 1 && (
                      <input type="checkbox" className="size-5" aria-label={p.name + " 與下一節不相連"} disabled={lock} checked={!!p.breakAfter} onChange={(e) => per(i, (x) => (e.target.checked ? (x.breakAfter = true) : delete x.breakAfter))} />
                    )}
                  </td>
                  <td className={td + " whitespace-nowrap"}>
                    <Button size="sm" tone="ghost" aria-label="往上移" disabled={lock || busy || !i} onClick={() => per(i, (_, a) => ([a[i - 1], a[i]] = [a[i], a[i - 1]]))}>
                      <ArrowUp size={15} />
                    </Button>
                    <Button
                      size="sm"
                      tone="ghost"
                      aria-label={"刪除 " + p.name}
                      disabled={lock || busy || periods.length < 2}
                      onClick={() => confirm("刪除「" + p.name + "」？這一節的課會變成沒排。") && per(i, (_, a) => a.splice(i, 1))}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" className="mt-3" disabled={lock || busy} onClick={() => edit((D2) => void D2.periods.push({ id: CORE.uid("p"), name: "新節次", start: "16:05", end: "16:50", extra: true } as PerX))}>
          <Plus size={15} />
          新增節次
        </Button>
      </Card>
    </>
  );
}

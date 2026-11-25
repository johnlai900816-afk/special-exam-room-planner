"use client";
/* 一場會議的出席名單（舊版 iep.js PE）：身分、必要、移除；加老師、加家長或其他人、原班任課老師、照名冊重新帶入。 */
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { IEP, type Meet, type Round } from "@/lib/iep";
import type { RcData } from "@/lib/types";

export function PeopleEditor({ D, R, m, ro, edit }: {
  D: RcData;
  R: Round;
  m: Meet;
  ro: boolean;
  edit(fn: (D: RcData, R: Round, m: Meet) => void | false): void;
}) {
  const [tSel, setTSel] = useState("");
  const [tRole, setTRole] = useState("資源班");
  const [oName, setOName] = useState("");
  const [oRole, setORole] = useState("家長");
  const all = IEP.subjOptions(D, m.s);
  const opts = all.filter((o) => !m.p.some((x) => x[0] === o.k));
  const req = (role: string) => IEP.ensure(D).cfg.req[role];
  const onM = (fn: (D: RcData, R: Round, mm: Meet) => void | false) => edit(fn);
  const teachers = [...D.teachers].sort((a, b) => (a.role === "資源班" ? 0 : 1) - (b.role === "資源班" ? 0 : 1));

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sunk text-left text-[13px] text-mute">
              <th className="px-2 py-2 font-normal">姓名</th>
              <th className="px-2 py-2 font-normal">身分</th>
              <th className="px-2 py-2 font-normal">必要</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {m.p.map((x, i) => (
              <tr key={x[0]} className="border-b border-line">
                <td className="px-2 py-1.5">
                  {x[0][0] === "x" ? (
                    <Input
                      className="w-28"
                      aria-label="姓名"
                      disabled={ro}
                      defaultValue={IEP.pName(D, R, x[0])}
                      onBlur={(e) =>
                        onM((_, r) => {
                          const p = r.ppl[x[0].slice(2)];
                          if (!p || p.n === e.target.value.trim()) return false;
                          p.n = e.target.value.trim();
                        })
                      }
                    />
                  ) : (
                    IEP.pName(D, R, x[0])
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="w-32"
                    aria-label="身分"
                    disabled={ro}
                    defaultValue={x[1]}
                    onBlur={(e) =>
                      onM((_, __, mm) => {
                        const v = e.target.value.trim() || "其他";
                        if (mm.p[i][1] === v) return false;
                        mm.p[i][1] = v;
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input type="checkbox" className="size-5" aria-label="必要出席" disabled={ro} checked={!!x[2]} onChange={(e) => onM((_, __, mm) => IEP.setReq(mm, x[0], e.target.checked))} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  {!ro && (
                    <Button size="sm" tone="ghost" aria-label="移除" onClick={() => onM((_, r, mm) => IEP.removePerson(r, mm, x[0]))}>
                      <X size={15} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ro && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Select aria-label="老師" value={tSel} onChange={(e) => setTSel(e.target.value)}>
              <option value="">（選老師）</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select aria-label="身分" value={tRole} onChange={(e) => setTRole(e.target.value)}>
              {["資源班", "任課", "導師", "行政", "專業"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <Button size="sm" disabled={!tSel} onClick={() => onM((d, r, mm) => void IEP.addPerson(d, r, mm, "t:" + tSel, tRole, req(tRole)))}>
              加入老師
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input aria-label="家長或其他人" placeholder="家長或其他人" className="w-36" value={oName} onChange={(e) => setOName(e.target.value)} />
            <Select aria-label="身分" value={oRole} onChange={(e) => setORole(e.target.value)}>
              {["家長", "專業", "行政", "其他"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
            <Button
              size="sm"
              disabled={!oName.trim()}
              onClick={() => {
                const n = oName.trim();
                setOName("");
                onM((d, r, mm) => void IEP.addOther(d, r, mm, n, oRole, req(oRole)));
              }}
            >
              加入
            </Button>
            <Button size="sm" tone="ghost" onClick={() => onM((d, r, mm) => void IEP.rederive(d, r, mm))}>
              照名冊重新帶入
            </Button>
          </div>
          {opts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {opts.map((o) => (
                <Button key={o.k} size="sm" tone="ghost" className="bg-sunk" onClick={() => onM((d, r, mm) => void IEP.addPerson(d, r, mm, o.k, "任課", 0))}>
                  <Plus size={14} />
                  {o.sj} {o.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

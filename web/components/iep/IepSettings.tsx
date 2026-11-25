"use client";
/* 會議設定（舊版 iep.js settings()，只有管理者）：必要出席的身分、邀請資源班科目的原班任課老師、每場都邀請的人（行政）、導師、
   排時段時「盡量不要抽出來開會」與「適合開會」的科目（D.settings.iepAvoidSubj／iepPreferSubj，舊版沒有畫面，用預設）。
   存在：D.iep.cfg → staff/iep；導師 D.classHead → classes/{班}.head；科目 → 學期設定。寫入一律 planOnD → applyOps（每份帶 rev）。
   改了只影響之後帶入的出席名單（已經建立的調查不會自動改，要在那份調查按「照名冊重新帶入」）。 */
import { X } from "lucide-react";
import { useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { toast } from "@/components/Toast";
import { Button, Card, Input, Select, SectionTitle } from "@/components/ui";
import { IEP } from "@/lib/iep";
import type { RcData } from "@/lib/types";

const list = (v: string) => [...new Set(v.split(/[、,，;；\s]+/).map((x) => x.trim()).filter(Boolean))];

export function IepSettings() {
  const { D, ro } = useAdmin();
  const { busy, edit } = useApply();
  const [t, setT] = useState("");
  const [n, setN] = useState("");
  const [r, setR] = useState("");
  const lock = ro("staff") || busy;
  // 顯示用：不要改到畫面上那份 D（ensure 會補預設值）
  const view = JSON.parse(JSON.stringify(D)) as RcData;
  const c = IEP.ensure(view).cfg;
  const head = (view.classHead || {}) as Record<string, string>;
  const cls = [...new Set(D.students.map((s) => String(s.cls)))].sort();
  const S = (D.settings || {}) as { iepAvoidSubj?: string[]; iepPreferSubj?: string[] };
  const teachers = [...D.teachers].sort((a, b) => (a.role === "資源班" ? 0 : 1) - (b.role === "資源班" ? 0 : 1));
  const cfg = (fn: (c: ReturnType<typeof IEP.ensure>["cfg"], d: RcData) => unknown, done = "已存檔") => edit((d) => fn(IEP.ensure(d).cfg, d), done);

  return (
    <div className="flex flex-col gap-4">
      <Card title="必要出席的身分">
        <div className="flex flex-wrap gap-x-4">
          {IEP.ROLES.map((role) => (
            <label key={role} className="inline-flex min-h-10 items-center gap-1.5 text-[15px]">
              <input type="checkbox" className="size-5" disabled={lock} checked={!!c.req[role]} onChange={(e) => cfg((x) => void (x.req[role] = e.target.checked ? 1 : 0))} />
              {role}
            </label>
          ))}
        </div>
        <label className="mt-2 flex min-h-10 items-center gap-1.5 text-[15px]">
          <input type="checkbox" className="size-5" disabled={lock} checked={!!c.subj} onChange={(e) => cfg((x) => void (x.subj = e.target.checked ? 1 : 0))} />
          邀請資源班科目的原班任課老師
        </label>
      </Card>

      <Card title="每場都邀請">
        {c.admin.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="bg-sunk text-left text-[13px] text-mute">
                <tr>
                  <th className="px-2 py-2 font-normal">姓名</th>
                  <th className="px-2 py-2 font-normal">職稱</th>
                  <th className="px-2 py-2 font-normal">必要</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {c.admin.map((a, i) => (
                  <tr key={a[0]} className="border-b border-line">
                    <td className="px-2 py-1.5">{IEP.pName(D, null, a[0])}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="w-32"
                        aria-label="職稱"
                        disabled={lock}
                        defaultValue={a[1] || ""}
                        key={a[0] + a[1]}
                        onBlur={(e) => e.target.value.trim() !== (a[1] || "") && cfg((x) => void (x.admin[i] && (x.admin[i][1] = e.target.value.trim())))}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" className="size-5" aria-label="必要" disabled={lock} checked={!!a[2]} onChange={(e) => cfg((x) => void (x.admin[i] && (x.admin[i][2] = e.target.checked ? 1 : 0)))} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" aria-label="移除" disabled={lock} className="inline-flex size-10 items-center justify-center rounded-full text-mute hover:bg-hover" onClick={() => cfg((x) => void x.admin.splice(i, 1), "已移除")}>
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-mute">還沒有（例：輔導主任、特教組長）</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Select aria-label="老師" value={t} disabled={lock} onChange={(e) => setT(e.target.value)}>
            <option value="">選老師…</option>
            {teachers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          <Input className="w-32" placeholder="或打姓名" aria-label="姓名" value={n} disabled={lock} onChange={(e) => setN(e.target.value)} />
          <Input className="w-28" placeholder="職稱" aria-label="職稱" value={r} disabled={lock} onChange={(e) => setR(e.target.value)} />
          <Button
            disabled={lock}
            onClick={() => {
              const k = t ? "t:" + t : n.trim() ? IEP.tKey(D, n.trim()) : "";
              if (!k) return toast("請選老師或打姓名");
              if (c.admin.some((a) => a[0] === k)) return toast("已經在名單裡");
              void cfg((x) => void x.admin.push([k, r.trim() || "行政", 0]), "已加入").then((ok) => ok && (setT(""), setN(""), setR("")));
            }}
          >
            加入
          </Button>
        </div>
      </Card>

      <Card title="排時段的科目提示">
        <p className="mb-2 text-sm text-mute">原班課表上的這些科目，挑時段時標出來（「勾選建議時段」只挑適合的）。用頓號隔開；空白＝用預設。</p>
        <div className="grid max-w-[720px] grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr]">
          <span className="text-[13px] text-mute">盡量不要抽出來</span>
          <Input
            aria-label="盡量不要抽出來開會的科目"
            disabled={ro("term") || busy}
            placeholder={IEP.AVOID_DEF.join("、")}
            defaultValue={(S.iepAvoidSubj || []).join("、")}
            key={"a" + (S.iepAvoidSubj || []).join()}
            onBlur={(e) => {
              const v = list(e.target.value);
              if (v.join() === (S.iepAvoidSubj || []).join()) return;
              void edit((d) => (v.length ? (d.settings.iepAvoidSubj = v) : delete d.settings.iepAvoidSubj));
            }}
          />
          <span className="text-[13px] text-mute">適合開會</span>
          <Input
            aria-label="適合開會的科目"
            disabled={ro("term") || busy}
            placeholder={IEP.PREFER_DEF.join("、")}
            defaultValue={(S.iepPreferSubj || []).join("、")}
            key={"p" + (S.iepPreferSubj || []).join()}
            onBlur={(e) => {
              const v = list(e.target.value);
              if (v.join() === (S.iepPreferSubj || []).join()) return;
              void edit((d) => (v.length ? (d.settings.iepPreferSubj = v) : delete d.settings.iepPreferSubj));
            }}
          />
        </div>
      </Card>

      <div>
        <SectionTitle no={1}>導師</SectionTitle>
        <Card>
          <datalist id="iuTN">
            {D.teachers.map((x) => (
              <option key={x.id} value={x.name} />
            ))}
          </datalist>
          {!cls.length ? (
            <p className="text-sm text-mute">名冊還沒有學生</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-2">
              {cls.map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <b className="min-w-[3em]">{k}</b>
                  <Input
                    className="min-w-0 flex-1"
                    list="iuTN"
                    aria-label={k + " 導師"}
                    disabled={ro("classes") || busy}
                    defaultValue={head[k] || ""}
                    key={k + (head[k] || "")}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === (head[k] || "")) return;
                      void edit((d) => {
                        const h = (d.classHead = (d.classHead || {}) as Record<string, string>);
                        if (v) h[k] = v;
                        else delete h[k];
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

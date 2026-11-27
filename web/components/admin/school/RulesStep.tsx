"use client";
/* ⑥ 排課規則（舊版 app.js renderRules）：衝堂檢查、每天上限、鎖課方式（彈性鎖課的各科上限、留連堂的科目）、遲到的分鐘數。 */
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { Card, Input, Select } from "@/components/ui";
import { SchedImpact } from "./SchedImpact";

type S = Record<string, unknown>;
const CHECKS: [string, string][] = [
  ["regClash", "同一位任課老師同一節不被兩班同時鎖課"],
  ["classClash", "同一班同一節不上兩科"],
  ["roomCheck", "同一節的組數不超過教室數"],
];
const NUMS: [string, string, number, string][] = [
  ["maxDay", "同一組一天最多", 1, "節"],
  ["tRun", "老師連續上課最多", 3, "節"],
  ["sDay", "學生一天抽離最多", 3, "節"],
];

/** 「國文5 英文3」→ {國文:5, 英文:3}（舊 setLockCap） */
export function parseLockCap(v: string): Record<string, number> {
  const o: Record<string, number> = {};
  String(v).replace(/([^\d\s,，、:：]+)\s*[:：]?\s*(\d+)/g, (_m, k: string, n: string) => ((o[k] = +n), ""));
  return o;
}

export function RulesStep() {
  const { D, ro } = useAdmin();
  const { edit } = useApply();
  const lock = ro("term");
  const st = (D.settings || {}) as S;
  const set = (k: string, v: unknown) =>
    edit((D2) => {
      const x = (D2.settings = (D2.settings || {}) as typeof D2.settings) as S;
      x[k] = v;
    });
  const cap = (st.lockCap || {}) as Record<string, number>;
  const row = "flex min-h-11 flex-wrap items-center gap-2 border-t border-line py-1.5 first:border-t-0";

  return (
    <Card>
      <SchedImpact kinds="teacher,student,class,reg,room,off,dup" />
      <div className="text-[15px]">
        {CHECKS.map(([k, t]) => (
          <label key={k} className={row}>
            <input type="checkbox" className="size-5" disabled={lock} checked={st[k] !== false} onChange={(e) => set(k, e.target.checked)} />
            {t}
          </label>
        ))}
        {NUMS.map(([k, a, d, b]) => (
          <label key={k} className={row}>
            {a}
            <Input
              type="number"
              min={1}
              max={9}
              className="w-20"
              disabled={lock}
              defaultValue={String(+(st[k] as number) > 0 ? st[k] : d)}
              key={k + String(st[k])}
              onBlur={(e) => +e.target.value > 0 && +e.target.value !== st[k] && set(k, +e.target.value)}
            />
            {b}
          </label>
        ))}
        <label className={row}>
          鎖課方式
          <Select disabled={lock} value={st.lockMode === "flex" ? "flex" : "same"} onChange={(e) => set("lockMode", e.target.value)}>
            <option value="same">原班和資源班同一節同一科</option>
            <option value="flex">彈性：鎖不到同科改鎖其他主科</option>
          </Select>
        </label>
        {st.lockMode === "flex" && (
          <>
            <label className={row}>
              各科每週最多鎖
              <Input
                className="w-48"
                placeholder="國文5 英文3 數學4"
                disabled={lock}
                defaultValue={Object.keys(cap)
                  .map((k) => k + cap[k])
                  .join(" ")}
                key={JSON.stringify(cap)}
                onBlur={(e) => set("lockCap", parseLockCap(e.target.value))}
              />
            </label>
            <label className={row}>
              只剩 1 節時留連堂的科目
              <Input className="w-28" placeholder="國文" disabled={lock} defaultValue={String(st.lockDouble || "")} key={String(st.lockDouble || "")} onBlur={(e) => set("lockDouble", e.target.value.trim())} />
            </label>
          </>
        )}
        <label className={row}>
          遲到：上課超過
          <Input
            type="number"
            min={0}
            max={60}
            className="w-20"
            disabled={lock}
            defaultValue={String(+(st.grace as number) >= 0 ? st.grace : 5)}
            key={"g" + String(st.grace)}
            onBlur={(e) => +e.target.value !== st.grace && set("grace", +e.target.value)}
          />
          分鐘
        </label>
      </div>
    </Card>
  );
}

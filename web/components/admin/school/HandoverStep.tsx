"use client";
/* ⑦ 學年交接檢查（舊版 extras.js handoverPage；core.handoverCheck）：和上次的基準比（轉入、轉出、班級座號異動），
   加上資料本身的檢查（全校課表、個管、60 天內到期、年級不合）。「設為新學年基準」存在 D.handoverBase（staff/legacy）。 */
import Link from "next/link";
import { useMemo } from "react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { C, handover } from "@/lib/nx/admin";
import { ymd } from "@/lib/nx/today";

const HK: [string, string][] = [
  ["moved", "班級、座號異動"],
  ["in", "轉入"],
  ["out", "轉出"],
  ["tt", "全校課表"],
  ["cm", "個管"],
  ["due", "IEP 與鑑定到期（60 天內）"],
  ["grade", "年級不合"],
];
const hrefOf = (go: { to: string; id?: string }) =>
  go.to === "stu" && go.id ? "/admin/student/?id=" + encodeURIComponent(go.id) : go.to === "tt" ? "/admin/settings/school/?step=tt" : go.to === "stulist" ? "/admin/students/" : "";

export function HandoverStep() {
  const { D, ro } = useAdmin();
  const { busy, edit } = useApply();
  const today = ymd(new Date());
  const H = useMemo(() => handover(D, today), [D, today]);
  const setBase = () => {
    if (H.hasBase && !confirm("換成現在的名冊當基準？之前的基準會被取代。")) return;
    edit((D2) => void ((D2 as unknown as { handoverBase: unknown }).handoverBase = C.handoverBase(D2)), "已設為新學年基準");
  };
  let no = 0;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {H.hasBase ? <Badge>基準 {new Date(H.at).toLocaleDateString("zh-TW")}</Badge> : <Badge tone="warn">還沒設基準</Badge>}
        <span className="text-sm text-mute">
          <b className="text-ink tabular-nums">{H.items.length}</b> 項
        </span>
        <Button className="ml-auto" disabled={ro("staff") || busy} onClick={setBase}>
          設為新學年基準
        </Button>
      </div>
      {!H.items.length && <p className="text-mute">都沒問題</p>}
      <div className="flex flex-col gap-4">
        {HK.map(([k, n]) => {
          const its = H.items.filter((x) => x.k === k);
          if (!its.length) return null;
          const bad = its.some((x) => x.level === "bad");
          return (
            <Card key={k}>
              <SectionTitle no={++no} extra={<Badge tone={bad ? "bad" : "warn"}>{its.length}</Badge>}>
                {n}
              </SectionTitle>
              <ul className="flex flex-col divide-y divide-line">
                {its.slice(0, 200).map((x, i) => {
                  const h = hrefOf(x.go);
                  return (
                    <li key={i} className="flex min-h-10 flex-wrap items-center gap-x-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        {x.t}
                        <small className="ml-2 text-sm text-mute">{x.d}</small>
                      </span>
                      {x.level === "bad" && <Badge tone="bad">要處理</Badge>}
                      {h && (
                        <Link href={h} className="text-sm text-blue">
                          前往
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
              {its.length > 200 && <p className="mt-2 text-sm text-mute">還有 {its.length - 200} 項</p>}
            </Card>
          );
        })}
      </div>
    </>
  );
}

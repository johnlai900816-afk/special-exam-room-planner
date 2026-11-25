"use client";
/* ① 匯入 Excel（舊版 app.js renderData／readXls／xlImport）：選檔或貼上 → 認出工作表 → 試跑看差異（新增、更新、刪除，
   座號相同姓名不同、名冊找不到的學生…）→ 匯入（一批寫入，每份帶 rev）。下面是資料清單。 */
import { FileSpreadsheet, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { useApply } from "@/components/admin/useApply";
import { toast } from "@/components/Toast";
import { Badge, Button, Card, Note, SectionTitle, Select, Textarea, cx } from "@/components/ui";
import { COL_NAME, summarize } from "@/lib/nx/apply";
import { offReasons, planImport, probe, readWorkbooks, rowsOf, SHEET_NAME, sheetType, type Sheet, type SheetKind } from "@/lib/nx/importer";
import { sampleSheets } from "@/lib/nx/sample";

const th = "px-2 py-2 text-left text-[13px] font-normal text-mute";
const td = "border-t border-line px-2 py-1.5";

function Checklist() {
  const { D, board } = useAdmin();
  const need = new Set<string>();
  board?.M.G.forEach((g) => g.need && g.cls.forEach((c) => need.add(c + "|" + g.subject)));
  const csN = [...need].filter((k) => D.classSubj[k]).length;
  const res = D.teachers.filter((t) => t.role === "資源班");
  const offBy = D.offBy || {};
  const cOff = Object.keys(offBy).filter((k) => (k[0] === "c" || k[0] === "k") && offBy[k].length).length;
  const tOff = D.teachers.filter((t) => t.role !== "資源班" && t.off.length).length;
  const cm = D.students.filter((s) => s.caseMgr).length;
  const lockFix = ((D as unknown as { lockFix?: unknown[] }).lockFix || []).length;
  const rows: [string, boolean, string, string, string][] = [
    ["學生名冊", D.students.length > 0, D.students.length + " 位", "個管學生一覽表", ""],
    ["個管老師", cm === D.students.length && cm > 0, cm + " / " + D.students.length, "個管學生一覽表", "/admin/casemgr/"],
    ["資源班老師與鐘點", res.length > 0 && res.every((t) => t.hours), res.length + " 位・" + res.filter((t) => t.hours).length + " 位有鐘點", "課程一覽表右側", "?step=tea"],
    ["課程", D.groups.length > 0, D.groups.length + " 門", "課程領域分組及節數一覽表", ""],
    ["各班任課老師", !need.size || csN === need.size, need.size ? csN + " / " + need.size : "不需要", "特教鎖課需求 › 教師名單", "?step=tea"],
    ["班級不排課", cOff > 0, cOff + " 班", "特教鎖課需求 › 班級不排課", "?step=off"],
    ["任課老師不排課", tOff > 0, tOff + " 位", "特教鎖課需求 › 教師不排課", "?step=off"],
    ["手排鎖課（選填）", true, lockFix ? lockFix + " 節" : "沒有", "特教鎖課需求 › 資料輸入或輸出", ""],
  ];
  return (
    <Card className="mt-4">
      <SectionTitle no={2}>資料清單</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="bg-sunk">
              <th className={th}>資料</th>
              <th className={th}>目前</th>
              <th className={th + " hidden sm:table-cell"}>學校的表</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map(([n, ok, cur, src, href]) => (
              <tr key={n}>
                <td className={td}>
                  <b>{n}</b>
                </td>
                <td className={cx(td, ok ? "text-ok" : "text-warn")}>
                  {ok ? "✓" : "!"} {cur}
                </td>
                <td className={td + " hidden text-sm text-mute sm:table-cell"}>{src}</td>
                <td className={td}>
                  {href && (
                    <Link href={href.startsWith("?") ? "/admin/settings/school/" + href : href} className="text-sm text-blue">
                      前往
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ImportStep() {
  const { x, R, D, revs, ro } = useAdmin();
  const { busy, run } = useApply();
  const file = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [skip, setSkip] = useState(0);
  const [reading, setReading] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteType, setPasteType] = useState<SheetKind | "">("");
  const [hardAll, setHardAll] = useState(true);
  const [reasons, setReasons] = useState<string[]>([]);
  const [addT, setAddT] = useState(false);
  const lock = ro("students") || ro("teachers") || ro("groups");

  const hasOff = sheets.some((s) => s.on && s.type === "off");
  const allReasons = useMemo(() => offReasons(sheets.filter((s) => s.on && s.type === "off").map((s) => s.tsv).join("\n")), [sheets]);
  const plan = useMemo(
    () => (sheets.some((s) => s.on) ? planImport(R, sheets, { hard: hardAll ? "*" : reasons, addTeachers: addT }) : null),
    [R, sheets, hardAll, reasons, addT],
  );
  const sum = plan ? summarize(plan.ops, revs) : null;

  const pick = async (fs: FileList | null) => {
    if (!fs || !fs.length) return;
    setReading(true);
    try {
      const r = await readWorkbooks([...fs], D);
      setSheets((a) => [...a, ...r.sheets]);
      setSkip(r.skip);
      if (!r.sheets.length) toast("沒有認得的工作表");
    } catch (e) {
      toast((e as Error).message || "有檔案讀不出來");
    } finally {
      setReading(false);
      if (file.current) file.current.value = "";
    }
  };
  const addPaste = () => {
    const rows = rowsOf(paste);
    const type = pasteType || sheetType(rows);
    if (!type) return toast("認不出是哪一種表，請選種類");
    const tsv = rows.map((r) => r.join("\t")).join("\n");
    if (!probe(D, type, tsv)) return toast("沒有讀到資料，請從 Excel 複製");
    setSheets((a) => [...a, { file: "貼上", sheet: SHEET_NAME[type], type, on: true, n: rows.length, tsv }]);
    setPaste("");
    setPasteType("");
  };
  const apply = async () => {
    if (!plan || !sum) return;
    if (!confirm("匯入 " + sheets.filter((s) => s.on).length + " 張表？\n" + sum.add + " 份新增、" + sum.update + " 份更新、" + sum.del + " 份刪除。")) return;
    if (await run(plan.ops, "已匯入")) setSheets([]);
  };

  return (
    <>
      <Card>
        <SectionTitle no={1}>上傳學校的 Excel</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <input ref={file} type="file" accept=".xlsx,.xls,.xlsm,.csv,.ods" multiple hidden onChange={(e) => pick(e.target.files)} />
          <Button tone={sheets.length ? "default" : "primary"} disabled={reading} onClick={() => file.current?.click()}>
            <FileSpreadsheet size={16} />
            {reading ? "讀取中…" : "選擇 Excel 檔"}
          </Button>
          {x.demo && (
            <Button onClick={() => setSheets(sampleSheets())}>
              <Sparkles size={16} />
              用範例表試試
            </Button>
          )}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-blue">或貼上一張表</summary>
          <Textarea rows={5} className="mt-2 w-full font-mono text-sm" aria-label="從 Excel 複製的表" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"班級\t座號\t姓名\t個管\n701\t03\t王小明\t林老師"} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Select aria-label="表的種類" value={pasteType} onChange={(e) => setPasteType(e.target.value as SheetKind | "")}>
              <option value="">自動判斷</option>
              {(Object.keys(SHEET_NAME) as SheetKind[]).map((k) => (
                <option key={k} value={k}>
                  {SHEET_NAME[k]}
                </option>
              ))}
            </Select>
            <Button disabled={!paste.trim()} onClick={addPaste}>
              加入
            </Button>
          </div>
        </details>

        {sheets.length > 0 && (
          <div className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="bg-sunk">
                    <th className={th + " w-10"} />
                    <th className={th}>工作表</th>
                    <th className={th}>認成</th>
                    <th className={th + " hidden sm:table-cell"}>檔案</th>
                    <th className={th}>列數</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s, i) => (
                    <tr key={i}>
                      <td className={td}>
                        <input
                          type="checkbox"
                          className="size-5"
                          aria-label={"匯入 " + s.sheet}
                          checked={s.on}
                          onChange={(e) => setSheets(sheets.map((y, j) => (j === i ? { ...y, on: e.target.checked } : y)))}
                        />
                      </td>
                      <td className={td}>{s.sheet}</td>
                      <td className={td}>
                        <b>{SHEET_NAME[s.type]}</b>
                      </td>
                      <td className={td + " hidden text-sm text-mute sm:table-cell"}>{s.file}</td>
                      <td className={td + " text-mute tabular-nums"}>{s.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {skip > 0 && <p className="mt-2 text-sm text-mute">略過 {skip} 張認不出的工作表</p>}
            {hasOff && (
              <fieldset className="mt-3 rounded-xl border border-line p-3 text-[15px]">
                <legend className="px-1 text-sm text-mute">班級不排課的時段</legend>
                <label className="flex min-h-9 items-center gap-2">
                  <input type="radio" name="hm" checked={hardAll} onChange={() => setHardAll(true)} /> 全部不能排
                </label>
                <label className="flex min-h-9 items-center gap-2">
                  <input type="radio" name="hm" checked={!hardAll} onChange={() => setHardAll(false)} /> 只擋國英數（勾選的原因才全擋）
                </label>
                {!hardAll && (
                  <div className="flex flex-wrap gap-x-4 pl-6">
                    {allReasons.map((w) => (
                      <label key={w} className="flex min-h-9 items-center gap-1.5">
                        <input type="checkbox" checked={reasons.includes(w)} onChange={(e) => setReasons(e.target.checked ? [...reasons, w] : reasons.filter((r) => r !== w))} />
                        {w}
                      </label>
                    ))}
                  </div>
                )}
                <label className="mt-1 flex min-h-9 items-center gap-2">
                  <input type="checkbox" checked={addT} onChange={(e) => setAddT(e.target.checked)} /> 名冊沒有的老師也新增
                </label>
              </fieldset>
            )}

            {plan && sum && (
              <div className="mt-4 rounded-xl bg-sunk p-4">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge tone="ok">新增 {sum.add}</Badge>
                  <Badge tone="acc">更新 {sum.update}</Badge>
                  <Badge tone={sum.del ? "bad" : "default"}>刪除 {sum.del}</Badge>
                  {plan.result.conflicts.length > 0 && <Badge tone="warn">要確認 {plan.result.conflicts.length}</Badge>}
                </div>
                <ul className="mb-2 text-sm text-ink2">
                  {Object.entries(sum.byCol).map(([c, n]) => (
                    <li key={c}>
                      {COL_NAME[c] || c}：{[n.add && "新增 " + n.add, n.update && "更新 " + n.update, n.del && "刪除 " + n.del].filter(Boolean).join("、")}
                    </li>
                  ))}
                </ul>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {plan.result.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                {plan.result.conflicts.length > 0 && (
                  <div className="mt-3">
                    <Note tone="warn">
                      座號相同、姓名不同（會另外新增，舊的之後可以在學生頁刪掉）：
                      {plan.result.conflicts.map((c) => c.text).join("；")}
                    </Note>
                  </div>
                )}
                {plan.result.newCM.length > 0 && <p className="mt-2 text-sm">新增的資源班老師：{plan.result.newCM.join("、")}</p>}
                {plan.result.noCM.length > 0 && <p className="mt-2 text-sm text-warn">找不到的個管老師：{plan.result.noCM.join("、")}</p>}
                {plan.result.miss.length > 0 && <p className="mt-2 text-sm text-warn">名冊找不到的學生：{plan.result.miss.join("、")}</p>}
                {plan.result.kept.length > 0 && <p className="mt-2 text-sm">先留在課裡的學生：{plan.result.kept.join("；")}</p>}
                {plan.result.coT.length > 0 && <p className="mt-2 text-sm">寫了兩位老師：{plan.result.coT.join("；")}</p>}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setSheets([])}>
                取消
              </Button>
              <Button tone="primary" disabled={!sum || !sum.total || busy || lock} onClick={apply}>
                匯入勾選的
              </Button>
            </div>
          </div>
        )}
      </Card>
      <Checklist />
      <p className="mt-3 text-sm text-mute">
        匯錯了可以到「資料與備份」從備份還原
      </p>
    </>
  );
}

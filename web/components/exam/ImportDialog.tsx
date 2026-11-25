"use client";
/* 匯入考評服務名單（舊版 showImport）：讀檔（只在這台電腦）→ 確認每一位讀成什麼 → 匯入。 */
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/sched/common";
import { Button, cx } from "@/components/ui";
import { SV } from "@/lib/nx/examCore";
import { applyImport, matchImport, readList, type ImpRow } from "@/lib/nx/examImport";
import { useExam } from "./useExam";

const scopeText = (sc: unknown) => (sc === "*" ? "全科" : Array.isArray(sc) && sc.length ? sc.join("、") : "—");

export function ImportDialog({ file, onClose }: { file: File; onClose: () => void }) {
  const { E, edit } = useExam();
  const [st, setSt] = useState<{ list: ImpRow[]; sum: ReturnType<typeof matchImport> } | { err: string } | null>(null);
  const [replace, setReplace] = useState(false);
  useEffect(() => {
    let off = false;
    readList(E, file).then(
      (list) => !off && setSt({ list, sum: matchImport(E, list) }),
      (e) => !off && setSt({ err: String((e as Error).message || e) }),
    );
    return () => {
      off = true;
    };
    // 只在打開時讀一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  if (!st) return <Dialog title="讀取名單中…" onClose={onClose}>{file.name}</Dialog>;
  if ("err" in st)
    return (
      <Dialog title="匯入失敗" onClose={onClose} foot={<Button onClick={onClose}>知道了</Button>}>
        <p className="whitespace-pre-line">{st.err}</p>
      </Dialog>
    );
  const { list, sum } = st;
  return (
    <Dialog
      wide
      title="確認匯入的名單"
      onClose={onClose}
      foot={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            tone="primary"
            onClick={() => {
              edit((e) => {
                applyImport(e, list, replace);
                return "已匯入 " + list.length + " 位";
              });
              onClose();
            }}
          >
            匯入 {list.length} 位
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm text-mute">{file.name}</p>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-sunk px-3 py-1">讀到 <b>{list.length}</b> 位</span>
        <span className="rounded-full bg-sunk px-3 py-1">新增 <b>{sum.nNew}</b></span>
        <span className="rounded-full bg-sunk px-3 py-1">更新現有 <b>{sum.nUpd}</b></span>
        {sum.nWhy > 0 && <span className="rounded-full bg-warn-l px-3 py-1 text-warn">要確認 <b>{sum.nWhy}</b> 位</span>}
      </div>
      <div className="max-h-[52vh] overflow-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-sunk text-left text-[13px] text-mute">
            <tr>
              <th className="px-2.5 py-2">班級座號</th>
              <th className="px-2.5 py-2">姓名</th>
              <th className="px-2.5 py-2">檔案上寫的</th>
              <th className="px-2.5 py-2">讀成</th>
              <th className="px-2.5 py-2">備註</th>
              <th className="px-2.5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((s, i) => (
              <tr key={i} className={cx("border-t border-line align-top", s.why.length > 0 && "bg-warn-l")}>
                <td className="px-2.5 py-2 whitespace-nowrap">{s.cls + (s.seat ? "-" + s.seat : "")}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{s.name}</td>
                <td className="px-2.5 py-2 text-[13px] text-mute">
                  {s.svcT.replace(/\s+/g, "")}
                  <br />
                  {s.scopeT.replace(/\s+/g, "")}
                </td>
                <td className="px-2.5 py-2">
                  {SV.filter((v) => s.sv[v.id]).map((v) => (
                    <span key={v.id} className="mr-1 inline-block rounded-full bg-blue-l px-2 text-[13px] whitespace-nowrap text-blue">
                      {v.id === "small" ? "人數調整" : v.name} <small className="text-ink2">{scopeText(s.sv[v.id])}</small>
                    </span>
                  ))}
                  {!SV.some((v) => s.sv[v.id]) && <span className="text-[13px] text-warn">（沒有）</span>}
                  {s.why.length > 0 && (
                    <div className="text-[13px] text-warn">
                      <AlertTriangle size={13} className="inline" /> {s.why.join("；")}
                    </div>
                  )}
                </td>
                <td className="px-2.5 py-2">{s.memo}</td>
                <td className="px-2.5 py-2">
                  <span className={cx("rounded-full px-2 text-xs whitespace-nowrap", s.old ? "bg-sunk text-mute" : "bg-ok-l text-ok")}>{s.old ? "更新" : "新增"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sum.nOut > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={!replace} onChange={() => setReplace(false)} /> 保留名單上其他 {sum.nOut} 位
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={replace} onChange={() => setReplace(true)} /> 移除其他 {sum.nOut} 位
          </label>
        </div>
      )}
    </Dialog>
  );
}

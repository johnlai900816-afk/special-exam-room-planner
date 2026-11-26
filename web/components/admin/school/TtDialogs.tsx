"use client";
/* ② 全校課表的對話框：
   - GridDialog：核對一班（tt.js open／saveCur）：左邊那一頁的圖、右邊可以改的格子（作息每一節 × 星期一～五，科目＋老師）、班級與導師；待核對的格子標色
   - SumDialog：只有統計的班（離線辨識；app.js ttEdit／ttEditOk）：科目、老師、節數，整列清空就刪掉
   - RunDialog：開始讀之前（tt.js confirmRun）：幾頁、幾次呼叫、多久、費用；這次開網頁第一次送出時給看第一頁的圖和題目 */
import { useState } from "react";
import { Button, Input, cx } from "@/components/ui";
import { Dialog } from "@/components/sched/common";
import { CORE } from "@/lib/core";
import { C, flagsAt, pname, rowsOf, sumRows, ttOf, type SumRow, type TtRequest } from "@/lib/nx/tt";
import type { RcData } from "@/lib/types";

const DAYS = (CORE as unknown as { DAYS: string[] }).DAYS;
type Cells = Record<string, { s: string; t: string }>;

/** 核對表一開始的格子（tt.js open：每一格照 ttCellAt） */
export function cellsOf(D: RcData, c: string): Cells {
  const o = ttOf(D)[c],
    out: Cells = {};
  if (!o) return out;
  rowsOf(D, o).forEach((p) =>
    [0, 1, 2, 3, 4].forEach((d) => {
      const x = C.ttCellAt(D, c, d + "-" + p);
      out[d + "|" + p] = { s: x?.s || "", t: x?.t || "" };
    }),
  );
  return out;
}

export function GridDialog({
  D,
  c,
  img,
  names,
  busy,
  lock,
  onClose,
  onSave,
}: {
  D: RcData;
  c: string;
  img: string;
  names: string[];
  busy: boolean;
  lock: boolean;
  onClose: () => void;
  onSave: (x: { cls: string; head: string; cells: Cells; accept: boolean }) => void;
}) {
  const o = ttOf(D)[c];
  const [cls, setCls] = useState(c[0] === "?" ? "" : c);
  const [head, setHead] = useState(o?.head || "");
  const [cells, setCells] = useState<Cells>(() => cellsOf(D, c));
  if (!o) return null;
  const { at, count, other } = flagsAt(o);
  const set = (k: string, f: "s" | "t", v: string) => setCells((x) => ({ ...x, [k]: { ...x[k], [f]: v } }));
  const save = (accept: boolean) => onSave({ cls, head, cells, accept });
  return (
    <Dialog
      title={"核對課表：" + c}
      wide="xl"
      onClose={onClose}
      foot={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button disabled={busy || lock} onClick={() => save(false)}>
            儲存
          </Button>
          <Button tone="primary" className="pri" disabled={busy || lock} onClick={() => save(true)}>
            接受，下一個
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          班級
          <Input className="w-24" value={cls} placeholder="例：701" onChange={(e) => setCls(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5">
          導師
          <Input className="w-28" list="ttNames2" value={head} onChange={(e) => setHead(e.target.value)} />
        </label>
        <span className="text-mute">{o.src || ""}</span>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="overflow-auto rounded-[10px] border border-line bg-white lg:sticky lg:top-0 lg:max-h-[72vh]">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={c + " 的課表"} className="block w-full" />
          ) : (
            <p className="p-6 text-sm text-mute">重新整理後不保留圖片；要對照請重讀這一頁</p>
          )}
        </div>
        <div className="overflow-auto lg:max-h-[72vh]">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className="w-[62px] bg-sunk px-1 py-1.5 text-[13px] font-medium text-mute" />
                {DAYS.map((d) => (
                  <th key={d} className="bg-sunk px-1 py-1.5 text-[13px] font-medium text-mute">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsOf(D, o).map((p) => (
                <tr key={p}>
                  <th className="bg-sunk px-1 text-[13px] font-medium text-mute">{pname(D, p)}</th>
                  {[0, 1, 2, 3, 4].map((d) => {
                    const k = d + "|" + p,
                      v = cells[k] || { s: "", t: "" },
                      m = at[k],
                      x = C.ttCellAt(D, c, d + "-" + p),
                      hc = !!x && !!x.s && count.some((f) => f.s === x.s && f.t === x.t);
                    const inp = "block h-[30px] w-full min-w-0 rounded-md border px-1.5 text-[13px] my-px";
                    return (
                      <td key={d} title={m ? m.join("；") : undefined} className={cx("border-b border-line p-[3px] align-top", m && "bg-warn-l", hc && "shadow-[inset_0_0_0_2px_var(--warn)]")}>
                        <input
                          className={cx(inp, m ? "border-warn bg-warn-l" : "border-line2 bg-field")}
                          value={v.s}
                          aria-label={"星期" + DAYS[d] + " " + pname(D, p) + " 科目"}
                          onChange={(e) => set(k, "s", e.target.value)}
                        />
                        <input
                          className={cx(inp, "text-ink2", m ? "border-warn bg-warn-l" : "border-line2 bg-field")}
                          list="ttNames2"
                          value={v.t}
                          aria-label={"星期" + DAYS[d] + " " + pname(D, p) + " 老師"}
                          onChange={(e) => set(k, "t", e.target.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {other.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-warn">
              {other.map((f, i) => (
                <li key={i}>{f.m}</li>
              ))}
            </ul>
          )}
          {o.notes && <p className="mt-2 text-sm text-mute">AI：{o.notes}</p>}
        </div>
      </div>
      <datalist id="ttNames2">
        {names.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
    </Dialog>
  );
}

export function SumDialog({
  D,
  c,
  img,
  busy,
  lock,
  onClose,
  onSave,
}: {
  D: RcData;
  c: string;
  img: string;
  busy: boolean;
  lock: boolean;
  onClose: () => void;
  onSave: (cls: string, rows: SumRow[]) => void;
}) {
  const o = ttOf(D)[c];
  const [cls, setCls] = useState(c[0] === "?" ? "" : c);
  const [rows, setRows] = useState<SumRow[]>(() => (o ? sumRows(o) : []).concat([["", "", ""]]));
  if (!o) return null;
  const set = (i: number, j: 0 | 1 | 2, v: string) =>
    setRows((r) => {
      const n = r.map((x) => [...x] as SumRow);
      n[i][j] = v;
      if (i === n.length - 1 && v) n.push(["", "", ""]);
      return n;
    });
  return (
    <Dialog
      title={"核對課表：" + c}
      wide
      onClose={onClose}
      foot={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" className="pri" disabled={busy || lock} onClick={() => onSave(cls, rows)}>
            儲存
          </Button>
        </>
      }
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="課表統計" className="mb-3 w-full rounded-md border border-line" />
      ) : (
        o.src && <p className="mb-3 text-sm text-mute">{o.src}</p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          班級
          <Input className="w-24" value={cls} placeholder="例：701" onChange={(e) => setCls(e.target.value)} />
        </label>
        <span className="text-mute">橘色是認不出的；整列清空就刪掉</span>
      </div>
      <table className="w-full text-[15px]">
        <thead>
          <tr className="bg-sunk">
            {["科目", "老師", "節數"].map((h) => (
              <th key={h} className="px-2 py-2 text-left text-[13px] font-normal text-mute">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {([0, 1, 2] as const).map((j) => (
                <td key={j} className="border-t border-line px-1 py-1">
                  <Input
                    className={cx("w-full", j === 1 && r[3] ? "border-warn bg-warn-l" : "")}
                    value={String(r[j] ?? "")}
                    aria-label={["科目", "老師", "節數"][j]}
                    onChange={(e) => set(i, j, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

export function RunDialog({
  n,
  est,
  cost,
  preview,
  req,
  onGo,
  onNo,
}: {
  n: number;
  est: { req: number; min: number };
  cost: string;
  preview: string;
  req: TtRequest | null;
  onGo: () => void;
  onNo: () => void;
}) {
  return (
    <Dialog
      title="讀課表"
      wide
      onClose={onNo}
      foot={
        <>
          <Button onClick={onNo}>取消</Button>
          <Button tone="primary" className="pri" onClick={onGo}>
            {req ? "送出" : "開始"}
          </Button>
        </>
      }
    >
      <p className="text-[15px]">
        <b>{n}</b> 頁 → {est.req} 次 AI 呼叫・約 {est.min} 分鐘・{cost}
      </p>
      {req && (
        <div className="mt-3">
          <b className="text-sm">要送給 Gemini 的內容</b>
          <span className="ml-1 text-sm text-mute">每頁一張圖＋這段文字；只有老師姓名，沒有學生資料</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="第一頁" className="my-2 block max-h-[36vh] max-w-full rounded-lg border border-line" />
          <pre className="max-h-[26vh] overflow-auto rounded-lg bg-sunk p-2.5 text-xs whitespace-pre-wrap">{"【系統說明】\n" + req.system + "\n\n" + req.prompt}</pre>
        </div>
      )}
    </Dialog>
  );
}

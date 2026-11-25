"use client";
/* 學生卡（舊版 checkin.js renderCards）：印出來護貝發給學生，點名時用鏡頭或條碼掃描器掃卡就能簽到、簽退。
   範圍：全部、某一班、某一門課。紙的 HTML 和舊版一字不差（lib/nx/checkin.ts cardsHtml，test/checkin.test.ts 比對），
   QR 用和舊版同一個 qrcodejs（cdnjs，SRI），96×96、容錯 M，內容 RC:學生 id。 */
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { drawQr } from "@/components/iep/QrSlips";
import { Tip } from "@/components/sched/common";
import { Button, Select } from "@/components/ui";
import { cardList, cardsHtml } from "@/lib/nx/checkin";
import "@/components/sched/out.css";
import "./cards.css";

export function Cards() {
  const { D } = useAdmin();
  const [f, setF] = useState("");
  const cls = useMemo(() => [...new Set(D.students.map((s) => String(s.cls)))].sort(), [D.students]);
  const n = cardList(D, f).length;
  const html = useMemo(() => cardsHtml(D, f), [D, f]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void drawQr(ref.current, { sel: ".qr[data-t]", size: 96 });
  }, [html]);
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href="/admin/checkin/" className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-[15px] text-ink2 hover:bg-hover">
          <ArrowLeft size={16} />
          點名
        </Link>
        <Select aria-label="範圍" value={f} onChange={(e) => setF(e.target.value)}>
          <option value="">全部學生</option>
          {cls.map((c) => (
            <option key={c} value={c}>
              {c} 班
            </option>
          ))}
          {D.groups.map((g) => (
            <option key={g.id} value={"g:" + g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Tip>印出來護貝發給學生，點名時用鏡頭或條碼掃描器掃卡就能簽到、簽退。</Tip>
        <span className="grow" />
        <span className="text-sm text-mute">
          <b className="text-ink tabular-nums">{n}</b> 張
        </span>
        <Button tone="primary" onClick={() => window.print()}>
          <Printer size={16} />
          印出
        </Button>
      </div>
      {/* .schedout：out.css 的字級變數（--fs-sm、--fs-xl） */}
      <div className="schedout">
        <div ref={ref} id="outArea" className="cardsheet" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

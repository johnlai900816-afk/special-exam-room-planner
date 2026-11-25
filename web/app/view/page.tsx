"use client";
/* 查考場連結（不用登入；舊版 exam.html?v=鑰匙）：/view/?v=鑰匙。只讀 publicViews/{鑰匙} 這一份（規則：沒過期、鑰匙還登記著）。
   班級連結只有那一班、姓名遮一字；全校連結有全名（只給特教組、行政）。都沒有服務內容與備註。 */
import { Suspense, useEffect, useState } from "react";
import { FindView } from "@/components/exam/FindView";
import { Brand } from "@/components/ui";
import { firebase } from "@/lib/firebase";
import { useQuery } from "@/lib/nx/hooks";
import { readView } from "@/lib/nx/examView";
import type { ViewData } from "@/lib/nx/examOut";

function View() {
  const q = useQuery();
  const key = q.get("v") || "";
  const [st, setSt] = useState<{ v: ViewData | null; done: boolean }>({ v: null, done: false });
  useEffect(() => {
    const fb = firebase();
    let off = false;
    (fb && key ? readView(fb.db, key) : Promise.resolve(null)).then((v) => !off && setSt({ v, done: true }));
    return () => {
      off = true;
    };
  }, [key]);
  useEffect(() => {
    document.title = "查考場｜資源班管理系統";
  }, []);
  const v = st.v;
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 pt-6 pb-10 md:px-10">
      <div className="no-print mb-5">
        <Brand />
      </div>
      <h1 className="no-print mb-1 text-[1.75rem] font-bold tracking-[-0.02em]">查考場</h1>
      {v && <p className="no-print mb-4 text-[15px] text-mute">{v.title}</p>}
      {!st.done ? <p className="py-16 text-center text-mute">讀取中…</p> : !v ? <p className="py-16 text-center text-mute">連結已失效，請向特教組要新的連結</p> : <FindView all={v.rows} title={v.title} VR={v} />}
    </main>
  );
}

export default function ViewPage() {
  return (
    <Suspense fallback={<p className="py-24 text-center text-mute">讀取中…</p>}>
      <View />
    </Suspense>
  );
}

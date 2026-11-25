"use client";
/* 一句話的提示（toast）：toast('已存檔')。畫面上同時只有一則，4 秒後消失 */
import { useEffect, useState } from "react";

const EV = "nx-toast";
export function toast(msg: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EV, { detail: msg }));
}

/** 寫入失敗時的一句話（rev 衝突、權限、網路） */
export function failText(e: unknown): string {
  const x = e as { code?: string; message?: string };
  if (x?.code === "rev-conflict") return "內容剛被別人更新，已重新讀取，請再改一次";
  if (x?.code === "permission-denied" || /permission/i.test(String(x?.code))) return x.message && !/Missing or insufficient/.test(x.message) ? x.message : "沒有權限";
  return "沒有存到：" + (x?.message || x?.code || String(e));
}

export function Toaster() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setMsg(String((e as CustomEvent).detail || ""));
      clearTimeout(t);
      t = setTimeout(() => setMsg(""), 4000);
    };
    window.addEventListener(EV, on);
    return () => {
      window.removeEventListener(EV, on);
      clearTimeout(t);
    };
  }, []);
  if (!msg) return null;
  return (
    <div role="status" className="no-print fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div className="max-w-md rounded-full bg-ink px-5 py-2.5 text-sm text-on-ink shadow-lg">{msg}</div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";

/** 現在時間，每 ms 毫秒更新一次（今天、點名的「現在這一節」） */
export function useNow(ms = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** 網址的查詢參數。用的頁面要包在 <Suspense> 裡（TeacherShell 已經包了） */
export { useSearchParams as useQuery } from "next/navigation";

"use client";
/* 舊網址：段考已經搬到 /admin/exam/ */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ExamRedirect() {
  const r = useRouter();
  useEffect(() => r.replace("/admin/exam/"), [r]);
  return <p className="py-20 text-center text-mute">段考已經搬到新的位置…</p>;
}

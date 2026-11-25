"use client";
/* 舊網址：排課已經搬到 /admin/sched/ */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ScheduleRedirect() {
  const r = useRouter();
  useEffect(() => r.replace("/admin/sched/?step=board"), [r]);
  return <p className="py-20 text-center text-mute">排課已經搬到新的位置…</p>;
}

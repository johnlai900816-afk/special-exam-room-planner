"use client";
/* 舊網址：排課搬到 /admin/sched/；老師看「今天」，檢視看總課表（依角色轉過去） */
import { RoleRedirect } from "@/components/RoleRedirect";

export default function OldRoute() {
  return <RoleRedirect admin="/admin/sched/" />;
}

"use client";
/* 舊網址：學期初準備搬到「設定 › 學校資料」（依角色轉過去） */
import { RoleRedirect } from "@/components/RoleRedirect";

export default function OldRoute() {
  return <RoleRedirect admin="/admin/settings/school/" />;
}

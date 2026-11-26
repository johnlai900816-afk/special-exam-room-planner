"use client";
/* 舊網址：資料與帳號搬到「設定 › 帳號與共用」（依角色轉過去） */
import { RoleRedirect } from "@/components/RoleRedirect";

export default function OldRoute() {
  return <RoleRedirect admin="/admin/settings/accounts/" />;
}

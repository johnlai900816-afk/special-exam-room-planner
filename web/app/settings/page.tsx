"use client";
/* 舊網址：設定：管理者到「設定」、老師到「我的設定」、檢視到 /viewer/settings/（依角色轉過去） */
import { RoleRedirect } from "@/components/RoleRedirect";

export default function OldRoute() {
  return <RoleRedirect admin="/admin/settings/" teacher="/me/settings/" viewer="/viewer/settings/" />;
}

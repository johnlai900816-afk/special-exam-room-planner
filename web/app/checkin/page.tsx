"use client";
/* 舊網址：簽到退搬到 /admin/checkin/；老師的點名在 /me/check/（依角色轉過去） */
import { RoleRedirect } from "@/components/RoleRedirect";

export default function OldRoute() {
  return <RoleRedirect admin="/admin/checkin/" teacher="/me/check/" />;
}

"use client";
/* 舊網址：段考搬到 /admin/exam/；老師的監考在 /me/exam/，檢視看 /viewer/exam/（依角色轉過去） */
import { RoleRedirect } from "@/components/RoleRedirect";

export default function OldRoute() {
  return <RoleRedirect admin="/admin/exam/" teacher="/me/exam/" viewer="/viewer/exam/" />;
}

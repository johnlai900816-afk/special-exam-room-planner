"use client";
/* 學校資料改了以後（不排課時段、教室與作息），已經確定的課表有沒有因此出現衝突：列出來，「重排成草稿」到 ③ 排課表直接試排／重排
   （結果一樣先放在草稿，和正式課表並排比較，滿意才按「確定採用」）。沒有衝突時不顯示。 */
import Link from "next/link";
import { useMemo } from "react";
import { useAdmin } from "@/components/AdminShell";
import { Problems } from "@/components/Problems";
import { impactProblems } from "@/lib/nx/suggest";

export function SchedImpact({ kinds }: { kinds: string }) {
  const { D, ro } = useAdmin();
  const list = useMemo(() => impactProblems(D, kinds.split(",")), [D, kinds]);
  if (!list.length) return null;
  return (
    <Problems list={list}>
      {!ro("sched") && (
        <Link
          href="/admin/sched/?step=board&auto=1"
          title="到排課表排出一份草稿，固定的不動；正式課表要按「確定採用」才會變"
          className="inline-flex min-h-9 items-center rounded-full border border-line2 bg-card px-3.5 text-sm font-medium text-ink hover:bg-hover"
        >
          重排成草稿
        </Link>
      )}
    </Problems>
  );
}

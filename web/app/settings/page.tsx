"use client";
import { Monitor, Type } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, Note, PageHeader, cx } from "@/components/ui";
import { getFontSize, setFontSize, type FontSize } from "@/lib/prefs";
import { useSession } from "@/lib/session";

const SIZES: { v: FontSize; label: string }[] = [
  { v: "md", label: "標準" },
  { v: "lg", label: "大" },
  { v: "xl", label: "特大" },
];

export default function SettingsPage() {
  const s = useSession();
  const [size, setSize] = useState<FontSize>(() => (typeof window === "undefined" ? "md" : getFontSize()));
  return (
    <AppShell title="設定">
      <PageHeader title="設定" lead="只影響這台裝置" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="字的大小" icon={<Type size={18} />}>
          <div className="flex gap-2" role="radiogroup" aria-label="字的大小">
            {SIZES.map((x) => (
              <button
                key={x.v}
                type="button"
                role="radio"
                aria-checked={size === x.v}
                onClick={() => {
                  setSize(x.v);
                  setFontSize(x.v);
                }}
                className={cx(
                  "min-h-10 flex-1 rounded-lg border px-3",
                  size === x.v ? "border-acc bg-acc-l font-semibold text-acc-d" : "border-line2 bg-card text-ink2 hover:bg-hover",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
        </Card>
        <Card title="公用電腦模式" icon={<Monitor size={18} />}>
          <p className="mb-3 text-ink2">在辦公室、教室的共用電腦上使用時打開：資料只放在記憶體裡，不存在這台電腦；關掉分頁就自動登出。</p>
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" className="size-5 accent-acc" checked={s.publicMode} onChange={(e) => s.setPublicMode(e.target.checked)} />
            這是公用電腦
          </label>
          {s.publicMode && (
            <div className="mt-3">
              <Note tone="warn">用完記得按右上角的「登出並清除」。</Note>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

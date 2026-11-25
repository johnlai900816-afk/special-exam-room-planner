"use client";
/* 設定的三個分頁：學校資料、帳號與共用、資料與備份（IA.md）。膠囊分段，用連結切換。 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";

const TABS: [string, string][] = [
  ["/admin/settings/school/", "學校資料"],
  ["/admin/settings/accounts/", "帳號與共用"],
  ["/admin/settings/data/", "資料與備份"],
];

export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="設定" className="mb-6 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-sunk p-1">
      {TABS.map(([h, n]) => {
        const on = path.startsWith(h.replace(/\/$/, ""));
        return (
          <Link
            key={h}
            href={h}
            aria-current={on ? "page" : undefined}
            className={cx(
              "flex min-h-9 items-center rounded-full px-4 text-sm whitespace-nowrap",
              on ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(31,36,48,0.06),0_0_0_1px_var(--line)]" : "text-ink2 hover:text-ink",
            )}
          >
            {n}
          </Link>
        );
      })}
    </nav>
  );
}

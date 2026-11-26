"use client";
/* 管理者頁面共用的小東西：分頁（?tab=，可以直接連到某一頁）、過渡期唯讀的提示、複製。 */
import Link from "next/link";
import { OLD_APP } from "@/lib/oldApp";
import { toast } from "@/components/Toast";
import { cx } from "@/components/ui";

/** 膠囊分頁：用連結切換（網址 ?tab=） */
export function PageTabs({ base, tabs, cur, label }: { base: string; tabs: [string, string][]; cur: string; label: string }) {
  return (
    <nav aria-label={label} className="no-print mb-5 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-sunk p-1">
      {tabs.map(([k, n], i) => (
        <Link
          key={k}
          href={base + (i === 0 ? "" : "?tab=" + k)}
          aria-current={k === cur ? "page" : undefined}
          className={cx(
            "flex min-h-9 items-center rounded-full px-4 text-sm whitespace-nowrap",
            k === cur ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(31,36,48,0.06),0_0_0_1px_var(--line)]" : "text-ink2 hover:text-ink",
          )}
        >
          {n}
        </Link>
      ))}
    </nav>
  );
}

/** 過渡期（schools/{sid}.mode=='legacy'，native 沒有這一塊）：這裡只能看，到舊版修改 */
export function RoBanner({ what, hash }: { what: string; hash: string }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-x-3 rounded-xl bg-warn-l px-4 py-2 text-sm text-warn">
      <span>過渡期：{what}由舊版同步，這裡只能看</span>
      <a href={OLD_APP + hash} className="underline">
        到舊版修改
      </a>
    </div>
  );
}

/** 複製一段文字（不行時選取 textarea 讓人手動複製） */
export function copyText(text: string, ta?: HTMLTextAreaElement | null) {
  const fb = () => {
    try {
      ta?.focus();
      ta?.select();
      toast(document.execCommand && document.execCommand("copy") ? "已複製" : "沒辦法自動複製，請手動複製");
    } catch {
      toast("沒辦法自動複製，請手動複製");
    }
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast("已複製"), fb);
  else fb();
}

/** 複製 #outArea（貼到 Word 保留表格；舊版 copyOut） */
export function copyOutArea() {
  const el = document.getElementById("outArea");
  if (!el) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    /* 舊版也是這樣 */
  }
  s.removeAllRanges();
  toast(ok ? "已複製" : "複製失敗，請手動選取");
}

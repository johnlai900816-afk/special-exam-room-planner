"use client";
/* 檢視（教務處、行政）的外框（IA.md：排課總表／設定，加上段考考程與監考）。沒有學生資料（MIGRATION §4.1）。
   資料來源是 lib/nx/session.tsx 的 viewer：檢視登入（Firestore，role viewer）或範例資料的檢視視角。
   管理者／編輯到 /admin/，老師到 /me/，其他回登入頁。 */
import { CalendarRange, ClipboardList, LogIn, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { applyFontSize, applyTheme } from "@/lib/prefs";
import { useNx } from "@/lib/nx/session";
import type { Loaded } from "@/lib/repo";
import type { RcData } from "@/lib/types";
import { Toaster } from "./Toast";
import { Brand, cx } from "./ui";

const I = 20;
export const VIEWER_NAV = [
  { href: "/viewer/", label: "總課表", icon: <CalendarRange size={I} strokeWidth={1.7} /> },
  { href: "/viewer/exam/", label: "段考", icon: <ClipboardList size={I} strokeWidth={1.7} /> },
  { href: "/viewer/settings/", label: "設定", icon: <Settings size={I} strokeWidth={1.7} /> },
];

/** 檢視頁面裡用：資料一定已經讀好（ViewerShell 會擋） */
export function useViewer(): { D: RcData; data: Loaded } {
  const x = useNx();
  return { D: x.viewer!.D!, data: x.viewer!.data! };
}

function UserBox({ compact }: { compact?: boolean }) {
  const x = useNx();
  const router = useRouter();
  if (x.demo || !x.user) return null;
  return (
    <details className="relative">
      <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full bg-blue-l text-sm font-bold text-blue" title={x.user.email}>
        {x.user.name.slice(0, 1)}
      </summary>
      <div className={cx("absolute z-30 mt-1 w-64 rounded-2xl border border-line bg-card p-4 shadow-lg", compact ? "right-0" : "bottom-12 left-0")}>
        <div className="font-bold">{x.user.name}</div>
        <div className="truncate text-sm text-mute">{x.user.email}・檢視</div>
        <button
          type="button"
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-line2 bg-card px-4 text-[15px] hover:bg-hover"
          onClick={() => x.logout().then(() => router.replace("/login/"))}
        >
          <LogOut size={16} />
          登出{x.publicMode ? "並清除" : ""}
        </button>
      </div>
    </details>
  );
}

export function ViewerShell({ title, children, needData = true }: { title: string; children: ReactNode; needData?: boolean }) {
  const x = useNx();
  const path = usePathname();
  const router = useRouter();
  const ok = x.phase === "demo" || x.phase === "viewer";
  const go = x.phase === "staff" ? "/admin/" : x.phase === "teacher" ? "/me/" : !ok && x.phase !== "boot" && x.phase !== "signing" ? "/login/" : "";

  useEffect(() => {
    applyTheme();
    applyFontSize();
  }, []);
  useEffect(() => {
    document.title = title + "｜資源班管理系統";
  }, [title]);
  useEffect(() => {
    if (go) router.replace(go);
  }, [go, router]);

  const here = (h: string) => (h === "/viewer/" ? path === "/viewer" || path === "/viewer/" : path.startsWith(h.replace(/\/$/, "")));
  const sub = x.demo ? "範例國中（檢視）" : x.schoolName;
  const ready = ok && (!needData || (x.viewer?.data && x.viewer.D));
  const link = (n: (typeof VIEWER_NAV)[number], mobile?: boolean) => (
    <Link
      key={n.href}
      href={n.href}
      aria-current={here(n.href) ? "page" : undefined}
      className={
        mobile
          ? cx("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px]", here(n.href) ? "font-bold text-ink [&_svg]:text-red" : "text-mute")
          : cx(
              "flex min-h-[42px] items-center gap-3 rounded-full px-3.5 text-[15px] transition-colors",
              here(n.href) ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(31,36,48,0.04),0_0_0_1px_var(--line)] [&_svg]:text-red" : "text-ink2 hover:bg-hover hover:text-ink [&_svg]:opacity-70",
            )
      }
    >
      {n.icon}
      {n.label}
    </Link>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col border-r border-line bg-bg px-4 pt-[22px] pb-[18px] md:flex">
        <Link href="/viewer/" className="px-2 pb-[26px]">
          <Brand sub={sub} />
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="主要">
          {VIEWER_NAV.map((n) => link(n))}
        </nav>
        <div className="mt-auto border-t border-line px-2 pt-3.5">
          <UserBox />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/viewer/" className="min-w-0 flex-1">
            <Brand sub={sub} />
          </Link>
          <UserBox compact />
        </header>
        {x.demo && (
          <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-sunk px-4 py-2 text-sm text-ink2 md:px-10">
            <span>範例資料</span>
            {x.cloud && (
              <Link href="/login/" className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line2 bg-card px-3.5 text-ink hover:bg-hover">
                <LogIn size={16} />
                登入
              </Link>
            )}
          </div>
        )}
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pt-6 pb-10 md:px-10 md:pt-8">
          {ready ? <Suspense fallback={<p className="py-20 text-center text-mute">讀取中…</p>}>{children}</Suspense> : <p className="py-20 text-center text-mute">{x.msg || "讀取中…"}</p>}
        </main>
      </div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="主要">
        {VIEWER_NAV.map((n) => link(n, true))}
      </nav>
      <Toaster />
    </div>
  );
}

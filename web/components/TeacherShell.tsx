"use client";
/* 老師端外框（IA.md：今天、我的學生、我的 IEP、點名、我的設定）。手機優先：手機是底部五格，桌機是左側欄。
   資料來源是 lib/nx/session.tsx：登入的老師（Firestore）或範例資料（記憶體）。其他狀態（還沒有邀請、找不到老師、管理者）回登入頁。 */
import { ClipboardCheck, Eye, FileHeart, LayoutDashboard, LogIn, LogOut, Settings, Sun, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { applyFontSize, applyTheme } from "@/lib/prefs";
import { useNx } from "@/lib/nx/session";
import { Toaster } from "./Toast";
import { Brand, Select, cx } from "./ui";

const I = 20;
export const TEACHER_NAV = [
  { href: "/me/", label: "今天", icon: <Sun size={I} strokeWidth={1.7} /> },
  { href: "/me/students/", label: "我的學生", icon: <Users size={I} strokeWidth={1.7} /> },
  { href: "/me/iep/", label: "我的 IEP", icon: <FileHeart size={I} strokeWidth={1.7} /> },
  { href: "/me/check/", label: "點名", icon: <ClipboardCheck size={I} strokeWidth={1.7} /> },
  { href: "/me/settings/", label: "我的設定", icon: <Settings size={I} strokeWidth={1.7} /> },
];

function DemoPicker() {
  const x = useNx();
  if (!x.demo || !x.D) return null;
  const list = [...x.D.teachers].sort((a, b) => (a.role === "資源班" ? 0 : 1) - (b.role === "資源班" ? 0 : 1));
  return (
    <Select aria-label="看哪一位老師" className="min-h-9 py-0 text-sm" value={x.tid} onChange={(e) => x.setDemoTid(e.target.value)}>
      {list.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}

function UserBox({ compact }: { compact?: boolean }) {
  const x = useNx();
  const router = useRouter();
  if (x.demo) return null;
  if (!x.user) return null;
  return (
    <details className="relative">
      <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full bg-blue-l text-sm font-bold text-blue" title={x.user.email}>
        {(x.me?.name || x.user.name).slice(0, 1)}
      </summary>
      <div className={cx("absolute z-30 mt-1 w-64 rounded-2xl border border-line bg-card p-4 shadow-lg", compact ? "right-0" : "bottom-12 left-0")}>
        <div className="font-bold">{x.me?.name || x.user.name}</div>
        <div className="truncate text-sm text-mute">{x.user.email}</div>
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

export function TeacherShell({ title, children }: { title: string; children: ReactNode }) {
  const x = useNx();
  const path = usePathname();
  const router = useRouter();
  // 管理者以老師身分預覽（唯讀）也用這個外框
  const preview = x.phase === "staff" && !!x.previewTid;
  const ok = x.phase === "demo" || x.phase === "teacher" || preview;
  const away = !ok && x.phase !== "boot" && x.phase !== "signing";

  useEffect(() => {
    applyTheme();
    applyFontSize();
  }, []);
  useEffect(() => {
    document.title = title + "｜資源班管理系統";
  }, [title]);
  useEffect(() => {
    if (x.phase === "staff" && !x.previewTid) router.replace("/admin/");
    else if (away) router.replace("/login/");
  }, [away, router, x.phase, x.previewTid]);

  const here = (h: string) => (h === "/me/" ? path === "/me" || path === "/me/" : path.startsWith(h.replace(/\/$/, "")));
  const sub = x.demo ? "範例國中" : x.schoolName;

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col border-r border-line bg-bg px-4 pt-[22px] pb-[18px] md:flex">
        <Link href="/me/" className="px-2 pb-[26px]">
          <Brand sub={sub} />
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="主要">
          {TEACHER_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={here(n.href) ? "page" : undefined}
              className={cx(
                "flex min-h-[42px] items-center gap-3 rounded-full px-3.5 text-[15px] transition-colors",
                here(n.href) ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(31,36,48,0.04),0_0_0_1px_var(--line)] [&_svg]:text-red" : "text-ink2 hover:bg-hover hover:text-ink [&_svg]:opacity-70",
              )}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-2 pt-3.5">
          <UserBox />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/me/" className="min-w-0 flex-1">
            <Brand sub={sub} />
          </Link>
          <UserBox compact />
        </header>
        {x.demo && (
          <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-sunk px-4 py-2 text-sm text-ink2 md:px-10">
            <span>範例資料</span>
            <DemoPicker />
            <Link href="/admin/" className="inline-flex min-h-9 items-center gap-1.5 text-blue hover:underline">
              <LayoutDashboard size={16} />
              管理者畫面
            </Link>
            {x.cloud && (
              <Link href="/login/" className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line2 bg-card px-3.5 text-ink hover:bg-hover">
                <LogIn size={16} />
                登入
              </Link>
            )}
          </div>
        )}
        {preview && (
          <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-blue-l px-4 py-2 text-sm text-blue md:px-10">
            <Eye size={16} />
            <span>預覽：{x.me?.name || ""} 看到的畫面（唯讀）</span>
            <button
              type="button"
              className="ml-auto inline-flex min-h-9 items-center rounded-full border border-line2 bg-card px-3.5 text-ink hover:bg-hover"
              onClick={() => {
                x.setPreview("");
                router.push("/admin/");
              }}
            >
              結束預覽
            </button>
          </div>
        )}
        {x.repo?.readOnly && !preview && (
          <div className="no-print bg-warn-l px-4 py-2 text-sm text-warn md:px-10">過渡期：資料由舊版同步，這裡只能看</div>
        )}
        <main className="mx-auto w-full max-w-[1000px] flex-1 px-4 pt-6 pb-10 md:px-10 md:pt-8">
          {ok && x.data && x.D ? (
            <Suspense fallback={<p className="py-20 text-center text-mute">讀取中…</p>}>{children}</Suspense>
          ) : (
            <p className="py-20 text-center text-mute">{x.msg || "讀取中…"}</p>
          )}
        </main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="主要">
        {TEACHER_NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={here(n.href) ? "page" : undefined}
            className={cx(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[12px] whitespace-nowrap",
              here(n.href) ? "font-bold text-ink [&_svg]:text-red" : "text-mute",
            )}
          >
            {n.icon}
            {n.label}
          </Link>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}

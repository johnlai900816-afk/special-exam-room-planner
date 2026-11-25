"use client";
/* 管理者端外框（IA.md：今天、學生、排課、段考、IEP 會議、點名、統計、設定）。桌機左側欄；手機底部四格＋「更多」。
   資料來源是 lib/nx/session.tsx 的 admin（管理者／編輯登入讀全部；沒登入是範例資料的管理者視角）。
   側欄底下可以「以老師身分看」：登入時是唯讀預覽（照規則過濾），範例資料時直接切到那位老師。 */
import {
  BarChart3,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileHeart,
  LogIn,
  LogOut,
  Menu,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { applyFontSize, applyTheme } from "@/lib/prefs";
import type { Loaded, Repo } from "@/lib/repo";
import type { Board } from "@/lib/schedule";
import type { RcData } from "@/lib/types";
import { useNx, type AdminArea, type Nx } from "@/lib/nx/session";
import { OLD_APP } from "./Planned";
import { Toaster } from "./Toast";
import { Brand, Card, Select, cx } from "./ui";

const I = 20;
const ic = (C: typeof Sun) => <C size={I} strokeWidth={1.7} />;
export const ADMIN_NAV = [
  { href: "/admin/", label: "今天", icon: ic(Sun) },
  { href: "/admin/students/", label: "學生", icon: ic(Users) },
  { href: "/admin/sched/", label: "排課", icon: ic(CalendarRange) },
  { href: "/admin/exam/", label: "段考", icon: ic(ClipboardList) },
  { href: "/admin/iep/", label: "IEP 會議", icon: ic(FileHeart) },
  { href: "/admin/checkin/", label: "點名", icon: ic(ClipboardCheck) },
  { href: "/admin/stats/", label: "統計", icon: ic(BarChart3) },
  { href: "/admin/settings/", label: "設定", icon: ic(Settings) },
];
/** 手機底部列放這幾個，其他收在「更多」 */
const MOBILE = ["/admin/", "/admin/students/", "/admin/sched/", "/admin/settings/"];

/** 管理者頁面裡用：資料一定已經讀好（AdminShell 會擋） */
export interface AdminCtx {
  x: Nx;
  repo: Repo;
  data: Loaded;
  R: Loaded["records"];
  revs: Loaded["revs"];
  D: RcData;
  board: Board | null;
  /** 這一塊不能改（過渡期、或範例資料以外的唯讀）；'sched'＝排課整塊 */
  ro(col: AdminArea): boolean;
}
export function useAdmin(): AdminCtx {
  const x = useNx();
  const A = x.admin!;
  return { x, repo: A.repo, data: A.data!, R: A.data!.records, revs: A.data!.revs, D: A.D!, board: A.board, ro: (c) => !A.canWrite(c) };
}

function PreviewPicker({ onPick }: { onPick?: () => void }) {
  const x = useNx();
  const router = useRouter();
  const D = x.admin?.D;
  if (!D) return null;
  const list = [...D.teachers].sort((a, b) => (a.role === "資源班" ? 0 : 1) - (b.role === "資源班" ? 0 : 1));
  return (
    <label className="flex flex-col gap-1 text-[13px] text-mute">
      <span className="flex items-center gap-1.5">
        <Eye size={15} />
        以老師身分看
      </span>
      <Select
        aria-label="以老師身分看"
        className="min-h-9 py-0 text-sm"
        value=""
        onChange={(e) => {
          const t = e.target.value;
          if (!t) return;
          if (x.demo) x.setDemoTid(t);
          else x.setPreview(t);
          onPick?.();
          router.push("/me/");
        }}
      >
        <option value="">選一位老師…</option>
        {list.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </label>
  );
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
        <div className="truncate text-sm text-mute">
          {x.user.email}・{x.claims?.role === "editor" ? "編輯" : "管理者"}
        </div>
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

export function AdminShell({ title, children, needData = true }: { title: string; children: ReactNode; needData?: boolean }) {
  const x = useNx();
  const path = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const ok = x.phase === "demo" || x.phase === "staff";
  const away = !ok && x.phase !== "boot" && x.phase !== "signing";

  useEffect(() => {
    applyTheme();
    applyFontSize();
  }, []);
  useEffect(() => {
    document.title = title + "｜資源班管理系統";
  }, [title]);
  useEffect(() => {
    if (away) router.replace("/login/");
  }, [away, router]);
  // 從預覽回來：結束預覽
  useEffect(() => {
    if (x.previewTid) x.setPreview("");
  }, [x]);

  const here = (h: string) => (h === "/admin/" ? path === "/admin" || path === "/admin/" : path.startsWith(h.replace(/\/$/, "")));
  const sub = x.demo ? "範例國中（管理者）" : x.schoolName;
  const A = x.admin;
  const noTerm = x.phase === "staff" && x.school && !x.school.termId;
  const ready = ok && (!needData || (A?.data && A.D));

  const navLink = (n: (typeof ADMIN_NAV)[number], onClick?: () => void) => (
    <Link
      key={n.href}
      href={n.href}
      onClick={onClick}
      aria-current={here(n.href) ? "page" : undefined}
      className={cx(
        "flex min-h-[42px] items-center gap-3 rounded-full px-3.5 text-[15px] transition-colors",
        here(n.href) ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(31,36,48,0.04),0_0_0_1px_var(--line)] [&_svg]:text-red" : "text-ink2 hover:bg-hover hover:text-ink [&_svg]:opacity-70",
      )}
    >
      {n.icon}
      {n.label}
    </Link>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col overflow-y-auto border-r border-line bg-bg px-4 pt-[22px] pb-[18px] md:flex">
        <Link href="/admin/" className="px-2 pb-[26px]">
          <Brand sub={sub} />
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="主要">
          {ADMIN_NAV.map((n) => navLink(n))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-line px-2 pt-3.5">
          <PreviewPicker />
          <UserBox />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/admin/" className="min-w-0 flex-1">
            <Brand sub={sub} />
          </Link>
          <UserBox compact />
        </header>
        {x.demo && (
          <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-sunk px-4 py-2 text-sm text-ink2 md:px-10">
            <span>範例資料</span>
            <Link href="/me/" className="text-blue hover:underline">
              老師畫面
            </Link>
            {x.cloud && (
              <Link href="/login/" className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line2 bg-card px-3.5 text-ink hover:bg-hover">
                <LogIn size={16} />
                登入
              </Link>
            )}
          </div>
        )}
        {A?.repo.readOnly && (
          <div className="no-print flex flex-wrap items-center gap-x-3 bg-warn-l px-4 py-2 text-sm text-warn md:px-10">
            <span>過渡期：資料由舊版同步，這裡只能看</span>
            <a href={OLD_APP} className="underline">
              到舊版修改
            </a>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pt-6 pb-10 md:px-10 md:pt-8">
          {ready ? (
            <Suspense fallback={<p className="py-20 text-center text-mute">讀取中…</p>}>{children}</Suspense>
          ) : noTerm ? (
            <Card title="學校還沒有學期資料">
              <Link href="/admin/settings/accounts/" className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 font-medium text-on-ink">
                搬移舊版資料
              </Link>
            </Card>
          ) : (
            <p className="py-20 text-center text-mute">{x.msg || "讀取中…"}</p>
          )}
        </main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="主要">
        {ADMIN_NAV.filter((n) => MOBILE.includes(n.href)).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={here(n.href) ? "page" : undefined}
            className={cx("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[12px] whitespace-nowrap", here(n.href) ? "font-bold text-ink [&_svg]:text-red" : "text-mute")}
          >
            {n.icon}
            {n.label}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore(true)}
          className={cx(
            "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[12px]",
            ADMIN_NAV.some((n) => !MOBILE.includes(n.href) && here(n.href)) ? "font-bold text-ink [&_svg]:text-red" : "text-mute",
          )}
        >
          <Menu size={I} strokeWidth={1.7} />
          更多
        </button>
      </nav>
      {more && (
        <div className="no-print fixed inset-0 z-40 flex items-end bg-black/30 md:hidden" onClick={() => setMore(false)}>
          <div className="w-full rounded-t-2xl border-t border-line bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="更多">
            <div className="mb-2 flex justify-end">
              <button type="button" aria-label="關閉" className="flex size-10 items-center justify-center rounded-full hover:bg-hover" onClick={() => setMore(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="flex flex-col gap-0.5" aria-label="更多">
              {ADMIN_NAV.filter((n) => !MOBILE.includes(n.href)).map((n) => navLink(n, () => setMore(false)))}
            </nav>
            <div className="mt-3 border-t border-line pt-3">
              <PreviewPicker onPick={() => setMore(false)} />
            </div>
          </div>
        </div>
      )}
      <Toaster />
    </div>
  );
}

/** 還沒搬過來的頁面：一行字＋到舊版的連結 */
export function UseOld({ hash, title }: { hash: string; title: string }) {
  return (
    <div className="max-w-[640px]">
      <h1 className="mb-6 text-[1.75rem] font-bold tracking-[-0.02em]">{title}</h1>
      <Card>
        <p className="mb-4 text-ink2">這一頁請先用舊版</p>
        <a href={OLD_APP + hash} className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 font-medium text-on-ink">
          到舊版的{title}
        </a>
      </Card>
    </div>
  );
}

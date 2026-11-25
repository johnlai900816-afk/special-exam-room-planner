"use client";
/* App 外框：側邊欄（桌機）／底部列（手機），項目依角色變化，最多 6 項。
   老師：今天、點名、我的學生、不排課時段、段考查詢、設定
   管理者：總覽、學期初準備、排課、段考考場、簽到退、資料與帳號＋「以教師身分預覽」
   檢視：排課總表、設定 */
import {
  Ban,
  CalendarCheck,
  CalendarRange,
  ClipboardCheck,
  Cloud,
  Database,
  Eye,
  FileUp,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  School,
  Settings,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ROLE_LABEL, type AppRole } from "@/lib/accounts";
import { useSession, type Session } from "@/lib/session";
import { applyFontSize } from "@/lib/prefs";
import { Button, cx } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const I = 20;
export const NAV: Record<AppRole, NavItem[]> = {
  teacher: [
    { href: "/me/", label: "今天", icon: <Sun size={I} /> },
    { href: "/checkin/", label: "點名", icon: <ClipboardCheck size={I} /> },
    { href: "/me/students/", label: "我的學生", icon: <Users size={I} /> },
    { href: "/me/off/", label: "不排課時段", icon: <Ban size={I} /> },
    { href: "/me/exam/", label: "段考查詢", icon: <School size={I} /> },
    { href: "/settings/", label: "設定", icon: <Settings size={I} /> },
  ],
  admin: [
    { href: "/admin/", label: "總覽", icon: <LayoutDashboard size={I} /> },
    { href: "/setup/", label: "學期初準備", icon: <ListChecks size={I} /> },
    { href: "/schedule/", label: "排課", icon: <CalendarRange size={I} /> },
    { href: "/exam/", label: "段考考場", icon: <School size={I} /> },
    { href: "/checkin/", label: "簽到退", icon: <CalendarCheck size={I} /> },
    { href: "/accounts/", label: "資料與帳號", icon: <Database size={I} /> },
  ],
  viewer: [
    { href: "/schedule/", label: "排課總表", icon: <CalendarRange size={I} /> },
    { href: "/settings/", label: "設定", icon: <Settings size={I} /> },
  ],
};

export function homeOf(role: AppRole | null): string {
  return role ? NAV[role][0].href : "/login/";
}

function fmtAt(d?: Date | null) {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getMonth() + 1 + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function SourceMenu({ s }: { s: Session }) {
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const k = s.source.kind;
  const icon = k === "cloud" ? <Cloud size={16} /> : k === "local" ? <HardDrive size={16} /> : k === "file" ? <Database size={16} /> : <Sparkles size={16} />;
  return (
    <details className="relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-sm text-ink2 hover:bg-hover">
        <span className={k === "cloud" ? "text-ok" : "text-mute"}>{icon}</span>
        <span className="max-w-[8rem] truncate sm:max-w-[14rem]">{s.source.label}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-line bg-card p-3 text-md shadow-lg">
        <p className="mb-2 text-sm leading-relaxed text-ink2">
          {k === "cloud" && (
            <>
              和舊版共用同一份雲端資料（{s.projectId}）。
              {s.source.by && (
                <>
                  <br />
                  最後更新：{s.source.by.split("@")[0]}　{fmtAt(s.source.at)}
                </>
              )}
            </>
          )}
          {k === "local" && "讀的是這台電腦瀏覽器裡、舊版存的那一份。"}
          {k === "file" && "這份只在這個分頁的記憶體裡，不會存檔也不會上傳。"}
          {k === "demo" && "虛構的範例資料。"}
          {s.publicMode && " 公用電腦模式：不在這台電腦留下資料。"}
        </p>
        <div className="flex flex-col gap-1.5">
          <Button onClick={() => file.current?.click()}>
            <FileUp size={16} />
            讀取備份檔
          </Button>
          <Button onClick={() => s.loadDemo()}>
            <Sparkles size={16} />
            改看範例資料
          </Button>
          {(k === "file" || k === "demo") && (
            <Button onClick={() => s.loadDefault()}>
              {s.cloud === "on" ? <Cloud size={16} /> : <HardDrive size={16} />}
              回到{s.cloud === "on" ? "雲端" : "這台電腦"}的資料
            </Button>
          )}
        </div>
        {err && <p className="mt-2 text-sm text-bad">{err}</p>}
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              setErr("");
              await s.loadFile(f);
            } catch (x) {
              setErr((x as Error).message);
            }
          }}
        />
      </div>
    </details>
  );
}

function PreviewSwitch({ s }: { s: Session }) {
  if (s.realRole !== "admin") return null;
  return (
    <button
      type="button"
      onClick={() => s.setPreview(!s.preview)}
      aria-pressed={s.preview}
      className={cx(
        "flex min-h-10 w-full items-center gap-2 rounded-lg border px-3 text-md",
        s.preview ? "border-warn/40 bg-warn-l text-warn" : "border-line text-ink2 hover:bg-hover",
      )}
    >
      <Eye size={18} />
      以教師身分預覽
    </button>
  );
}

export function AppShell({ children, allow, title }: { children: ReactNode; allow?: AppRole[]; title?: string }) {
  const s = useSession();
  const path = usePathname();
  const router = useRouter();
  const settled = s.ready && s.cloud !== "wait";
  const blocked = settled && (!s.role || (allow && !allow.includes(s.role)) || !s.D);

  useEffect(() => {
    applyFontSize();
  }, []);

  useEffect(() => {
    if (!blocked) return;
    // 沒登入／沒權限 → 登入頁；角色不對 → 自己的首頁
    router.replace(!s.role || !s.D ? "/login/" : homeOf(s.role));
  }, [blocked, s.role, s.D, router]);

  useEffect(() => {
    if (title) document.title = title + "｜資源班管理系統";
  }, [title]);

  const nav = s.role ? NAV[s.role] : [];
  const here = (h: string) => path === h || path + "/" === h;
  const me = s.D?.teachers.find((t) => t.id === s.meId);

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-sunk px-3 py-4 md:flex">
        <Link href={homeOf(s.role)} className="mb-5 px-2 font-serif text-xl font-semibold text-ink">
          資源班管理
        </Link>
        <nav className="flex flex-col gap-1" aria-label="主要">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-base",
                here(n.href) ? "bg-card font-semibold text-acc-d shadow-sm" : "text-ink2 hover:bg-hover hover:text-ink",
              )}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <PreviewSwitch s={s} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
            <Link href={homeOf(s.role)} className="font-serif text-lg font-semibold whitespace-nowrap text-ink md:hidden">
              資源班管理
            </Link>
            <div className="ml-auto flex items-center gap-2">
              {settled && s.D && <SourceMenu s={s} />}
              {s.user ? (
                <details className="relative">
                  <summary
                    className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full bg-acc text-md font-semibold text-white"
                    title={s.user.email}
                  >
                    {s.user.name.slice(0, 1).toUpperCase()}
                  </summary>
                  <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-line bg-card p-3 text-md shadow-lg">
                    <div className="font-medium">{s.user.name}</div>
                    <div className="truncate text-sm text-mute">{s.user.email}</div>
                    <div className="mt-1 text-sm text-ink2">
                      {s.realRole ? ROLE_LABEL[s.realRole] : "尚未加入"}
                      {s.host && "・主持人"}
                      {s.claims ? "" : "（沿用舊名單）"}
                    </div>
                    <div className="mt-3 md:hidden">
                      <PreviewSwitch s={s} />
                    </div>
                    <Button className="mt-2 w-full" onClick={() => s.logout().then(() => router.replace("/login/"))}>
                      <LogOut size={16} />
                      登出{s.publicMode ? "並清除" : ""}
                    </Button>
                  </div>
                </details>
              ) : s.cloud !== "off" ? (
                <Link href="/login/" className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-md text-ink2 hover:bg-hover">
                  <LogIn size={18} />
                  登入
                </Link>
              ) : (
                <span className="text-sm text-mute" title="這台電腦設定成不使用雲端">
                  單機
                </span>
              )}
            </div>
          </div>
        </header>

        {s.preview && (
          <div className="no-print border-b border-warn/30 bg-warn-l px-4 py-2 text-md text-ink">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
              <Eye size={16} className="text-warn" />
              以教師身分預覽{me ? "：" + me.name : "（請在「今天」選一位老師）"}
              <button type="button" className="ml-auto min-h-10 rounded-lg px-3 font-medium text-warn hover:bg-hover" onClick={() => s.setPreview(false)}>
                結束預覽
              </button>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {!settled || blocked ? <p className="py-20 text-center text-mute">讀取中…</p> : children}
        </main>
      </div>

      {nav.length > 0 && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-line bg-card md:hidden" aria-label="主要">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs whitespace-nowrap",
                here(n.href) ? "font-semibold text-acc" : "text-mute",
              )}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

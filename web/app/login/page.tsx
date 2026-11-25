"use client";
/* 登入（新資料模型）：Google 登入 → 有邀請就領取（nxAcceptInvite）→ getIdToken(true) 拿 claims →
   老師到「今天」；管理者／編輯／檢視這一階段先用舊版。狀態：還沒有邀請、找不到綁定的老師、學期還沒設定。 */
import { ArrowRight, Copy, ExternalLink, LogOut, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OLD_APP } from "@/components/Planned";
import { Brand, Button, Card, Note } from "@/components/ui";
import { useNx } from "@/lib/nx/session";
import { applyFontSize, applyTheme } from "@/lib/prefs";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function LoginPage() {
  const x = useNx();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyTheme();
    applyFontSize();
    document.title = "登入｜資源班管理系統";
  }, []);
  useEffect(() => {
    if (x.phase === "teacher") router.replace("/me/");
  }, [x.phase, router]);

  const login = async () => {
    setMsg("");
    setBusy(true);
    try {
      await x.login();
    } catch (e) {
      const c = (e as { code?: string }).code || (e as Error).message;
      if (c !== "auth/popup-closed-by-user" && c !== "auth/cancelled-popup-request") setMsg("登入失敗：" + c);
    } finally {
      setBusy(false);
    }
  };
  const out = (
    <Button tone="ghost" className="w-full" onClick={() => x.logout()}>
      <LogOut size={16} />
      換一個帳號
    </Button>
  );
  const oldLink = (
    <a href={OLD_APP} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-ink bg-ink px-4 text-[15px] font-medium text-on-ink">
      <ExternalLink size={16} />
      管理功能請先用舊版
    </a>
  );
  const signedIn = !!x.user;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <Card>
          {x.phase === "boot" || x.phase === "signing" || x.phase === "teacher" ? (
            <p className="py-6 text-center text-mute">{x.phase === "signing" ? "確認身分中…" : "連線中…"}</p>
          ) : x.phase === "demo" && !x.cloud ? (
            <div className="space-y-4">
              <Note>這台電腦設定成不使用雲端，只能看範例資料</Note>
              <Link href="/me/" className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-ink px-4 font-medium text-on-ink">
                進入
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : x.phase === "demo" ? (
            <div className="space-y-4">
              <Button tone="primary" className="w-full" disabled={busy} onClick={login}>
                <GoogleMark />
                用 Google 帳號登入
              </Button>
              <label className="flex min-h-10 items-center gap-2 text-sm text-ink2">
                <input type="checkbox" className="size-5" checked={x.publicMode} onChange={(e) => x.setPublicMode(e.target.checked)} />
                公用電腦（關掉分頁就登出）
              </label>
              <div className="border-t border-line pt-4">
                <Link href="/me/" className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-4 text-[15px] text-ink2 hover:bg-hover">
                  <Sparkles size={16} />
                  先看範例資料（虛構）
                </Link>
              </div>
            </div>
          ) : x.phase === "noInvite" ? (
            <div className="space-y-4">
              <h2 className="text-[17px] font-bold">還沒有邀請</h2>
              <p className="text-sm text-ink2">
                把 <b>{x.user?.email}</b> 給特教組長，邀請好之後按「再試一次」。
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => navigator.clipboard?.writeText(x.user!.email).then(() => setMsg("已複製信箱"), () => setMsg(x.user!.email))}>
                  <Copy size={16} />
                  複製信箱
                </Button>
                <Button className="flex-1" onClick={() => x.refresh()}>
                  <RefreshCw size={16} />
                  再試一次
                </Button>
              </div>
              {out}
            </div>
          ) : x.phase === "missingTeacher" ? (
            <div className="space-y-4">
              <h2 className="text-[17px] font-bold">找不到綁定的老師</h2>
              <p className="text-sm text-ink2">帳號綁定的老師不在這學期的名冊裡，請特教組長重新綁定。</p>
              <Button className="w-full" onClick={() => x.refresh()}>
                <RefreshCw size={16} />
                再試一次
              </Button>
              {out}
            </div>
          ) : x.phase === "noTerm" ? (
            <div className="space-y-4">
              <Note tone="warn">學校還沒有設定這學期的資料</Note>
              {out}
            </div>
          ) : x.phase === "staff" || x.phase === "viewer" ? (
            <div className="space-y-4">
              <p className="text-sm text-ink2">
                {x.user?.email}・{x.phase === "staff" ? (x.claims?.role === "editor" ? "編輯" : "管理者") : "檢視"}
              </p>
              {oldLink}
              {out}
            </div>
          ) : (
            <div className="space-y-4">
              <Note tone="bad">連不上雲端{x.msg ? "：" + x.msg : ""}</Note>
              <Button className="w-full" onClick={() => x.refresh()}>
                <RefreshCw size={16} />
                再試一次
              </Button>
              {signedIn && out}
            </div>
          )}
          {msg && <p className="mt-3 text-sm text-bad">{msg}</p>}
        </Card>
      </div>
    </div>
  );
}

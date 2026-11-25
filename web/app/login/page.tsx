"use client";
import { ArrowRight, Copy, LogOut, Monitor, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { homeOf } from "@/components/AppShell";
import { Button, Card, Note } from "@/components/ui";
import { submitJoinRequest } from "@/lib/cloud";
import { signInWithGoogle } from "@/lib/firebase";
import { useSession } from "@/lib/session";

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
  const s = useSession();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (s.cloud === "on" && s.role && s.D) router.replace(homeOf(s.role));
  }, [s.cloud, s.role, s.D, router]);

  const login = async () => {
    setMsg("");
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      const c = (e as { code?: string }).code || (e as Error).message;
      if (c !== "auth/popup-closed-by-user" && c !== "auth/cancelled-popup-request") setMsg("登入失敗：" + c);
    } finally {
      setBusy(false);
    }
  };

  const demo = () => {
    s.loadDemo();
    router.push("/admin/");
  };

  const join = async () => {
    if (!s.user) return;
    setBusy(true);
    setMsg("");
    try {
      await submitJoinRequest(s.user.uid, s.user.email, name.trim() || s.user.name, note.trim());
      setSent(true);
    } catch (e) {
      const c = (e as { code?: string }).code || "";
      setMsg(
        /permission/.test(c)
          ? "目前的雲端規則還沒開放線上申請。請直接把你的信箱傳給特教組長，請他在舊版「共用」或新版「資料與帳號」加入你。"
          : "送出失敗：" + (c || (e as Error).message),
      );
    } finally {
      setBusy(false);
    }
  };

  const switchAccount = (
    <Button tone="ghost" className="w-full" onClick={() => s.logout()}>
      <LogOut size={16} />
      換一個帳號
    </Button>
  );

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl text-ink">資源班管理系統</h1>
          <p className="mt-2 text-ink2">排課、名冊、段考考場，每位老師有自己的頁面</p>
        </div>

        <Card>
          {!s.ready || s.cloud === "wait" ? (
            <p className="py-6 text-center text-mute">連線中…</p>
          ) : s.cloud === "off" ? (
            <div className="space-y-4">
              <Note>這台電腦設定成「不使用雲端」，資料只存在這個瀏覽器。要改回雲端，請到舊版「共用 › 學校自己的雲端」。</Note>
              <Link href="/admin/" className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-acc px-4 font-medium text-white hover:bg-acc-d">
                進入
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : !s.user ? (
            <div className="space-y-4">
              <Button className="w-full py-2.5 text-base" disabled={busy} onClick={login}>
                <GoogleMark />
                用 Google 帳號登入
              </Button>
              <label className="flex min-h-10 items-center gap-2 text-md text-ink2">
                <input type="checkbox" className="size-5 accent-acc" checked={s.publicMode} onChange={(e) => s.setPublicMode(e.target.checked)} />
                <Monitor size={16} />
                這是公用電腦（不留下資料，關掉分頁就登出）
              </label>
              <p className="text-md leading-relaxed text-ink2">
                組長／排課老師看得到全部；一般老師看到自己的課表、學生和監考，並可以填自己的不排課時段。
              </p>
              <div className="border-t border-line pt-4">
                <Button tone="ghost" className="w-full" onClick={demo}>
                  <Sparkles size={16} />
                  先看範例資料（虛構）
                </Button>
              </div>
            </div>
          ) : s.cloud === "nohost" ? (
            <div className="space-y-4">
              <Note tone="warn">雲端「{s.projectId}」還沒有設定管理者。第一位管理者要由系統管理員用部署腳本建立，不能從這裡自己認領。</Note>
              {switchAccount}
            </div>
          ) : s.cloud === "denied" ? (
            <div className="space-y-4">
              <Note tone="warn">
                <b>{s.user.email}</b> 還不在學校的使用名單裡。請把這個信箱給特教組長，組長加入並指定你是名冊上的哪一位老師後，重新整理就可以了。
              </Note>
              <Button
                className="w-full"
                onClick={() => navigator.clipboard?.writeText(s.user!.email).then(() => setMsg("已複製信箱"), () => setMsg(s.user!.email))}
              >
                <Copy size={16} />
                複製我的信箱
              </Button>
              {sent ? (
                <Note tone="ok">已送出加入申請，組長核准後重新整理這一頁。</Note>
              ) : (
                <div className="space-y-2 border-t border-line pt-4">
                  <div className="font-medium">或線上送出加入申請</div>
                  <input
                    className="min-h-10 w-full rounded-lg border border-line2 px-3"
                    placeholder="名冊上的姓名，例：王老師"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    className="min-h-10 w-full rounded-lg border border-line2 px-3"
                    placeholder="備註（任教科目、班級…）"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button tone="primary" className="w-full" disabled={busy} onClick={join}>
                    <Send size={16} />
                    送出申請
                  </Button>
                </div>
              )}
              {switchAccount}
            </div>
          ) : s.cloud === "error" ? (
            <div className="space-y-4">
              <Note tone="bad">連不上雲端，可能是沒有網路。</Note>
              <Link href="/admin/" className="flex min-h-10 items-center justify-center text-acc">
                先用這台電腦的資料
              </Link>
            </div>
          ) : s.cloud === "on" && !s.D ? (
            <div className="space-y-4">
              <Note>雲端還沒有名冊與排課資料。請組長先在舊版建立或還原一份。</Note>
              {switchAccount}
            </div>
          ) : (
            <p className="py-6 text-center text-mute">登入成功，正在進入…</p>
          )}
          {msg && <p className="mt-3 text-md text-bad">{msg}</p>}
        </Card>
      </div>
    </div>
  );
}

"use client";
/* 檢視：設定（外觀、公用電腦模式、登出）。只影響這台電腦。 */
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Seg, SectionTitle } from "@/components/ui";
import { ViewerShell } from "@/components/ViewerShell";
import { useNx } from "@/lib/nx/session";
import { getFontSize, getTheme, setFontSize, setTheme, type FontSize, type Theme } from "@/lib/prefs";

function Look() {
  const x = useNx();
  const router = useRouter();
  const [th, setTh] = useState<Theme>(() => getTheme());
  const [fs, setFs] = useState<FontSize>(() => getFontSize());
  return (
    <div className="max-w-[760px]">
      <h1 className="mb-6 text-[1.75rem] font-bold tracking-[-0.02em]">設定</h1>
      <SectionTitle no={1}>外觀</SectionTitle>
      <div className="flex flex-wrap gap-3">
        <Seg<Theme>
          label="主題"
          value={th}
          options={[
            ["auto", "自動"],
            ["light", "淺色"],
            ["dark", "深色"],
          ]}
          onChange={(v) => (setTh(v), setTheme(v))}
        />
        <Seg<FontSize>
          label="字的大小"
          value={fs}
          options={[
            ["md", "標準"],
            ["lg", "大"],
            ["xl", "特大"],
          ]}
          onChange={(v) => (setFs(v), setFontSize(v))}
        />
      </div>
      {x.cloud && (
        <>
          <SectionTitle no={2} className="mt-8">
            這台電腦
          </SectionTitle>
          <Card>
            <label className="flex min-h-10 items-center gap-2">
              <input type="checkbox" className="size-5" checked={x.publicMode} onChange={(e) => x.setPublicMode(e.target.checked)} />
              公用電腦模式
            </label>
            <p className="text-sm text-mute">關掉分頁就登出，登出時清掉這個分頁的資料</p>
            {x.user && (
              <Button className="mt-3" onClick={() => x.logout().then(() => router.replace("/login/"))}>
                <LogOut size={16} />
                登出{x.publicMode ? "並清除" : ""}
              </Button>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default function ViewerSettings() {
  return (
    <ViewerShell title="設定" needData={false}>
      <Look />
    </ViewerShell>
  );
}

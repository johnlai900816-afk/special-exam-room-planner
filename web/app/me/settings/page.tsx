"use client";
/* 我的設定：不排課時段（Repo.saveMyOff）、我的監考（exam/{eid} 的監考對照）、外觀（深色、字級）、公用電腦模式。舊版 teacher.js rSet。 */
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { failText, toast } from "@/components/Toast";
import { TeacherShell } from "@/components/TeacherShell";
import { Button, Card, Seg, SectionTitle, cx } from "@/components/ui";
import { DAYS } from "@/lib/core";
import { useNx } from "@/lib/nx/session";
import { getFontSize, getTheme, setFontSize, setTheme, type FontSize, type Theme } from "@/lib/prefs";
import { revKey } from "@/lib/repo";
import { TEACH } from "@/lib/teach";

function OffGrid() {
  const x = useNx();
  const me = x.me!;
  const D = x.D!;
  const ro = !x.writable("teachers") || x.repo!.readOnly;
  const off = new Set(me.off || []);
  const [busy, setBusy] = useState(false);
  const toggle = async (k: string) => {
    if (ro || busy) return;
    const next = off.has(k) ? [...off].filter((y) => y !== k) : [...off, k];
    setBusy(true);
    try {
      await x.repo!.saveMyOff(next, x.data!.revs[revKey("teachers", x.tid)]?.rev || 0);
    } catch (e) {
      toast(failText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle no={1} extra={off.size + " 節"}>
        我的不排課時段
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th />
              {DAYS.map((d) => (
                <th key={d} className="px-1.5 py-1 text-[13px] font-semibold text-mute">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {D.periods.map((p) => (
              <tr key={p.id}>
                <th className="py-1 pr-2 text-left text-[13px] font-semibold whitespace-nowrap text-mute">
                  {p.name}
                  <small className="block font-normal">{p.start}</small>
                </th>
                {DAYS.map((d, di) => {
                  const k = di + "-" + p.id;
                  const on = off.has(k);
                  return (
                    <td key={k} className="p-[3px]">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={"週" + d + p.name + (on ? " 不排課" : "")}
                        disabled={ro}
                        onClick={() => toggle(k)}
                        className={cx(
                          "h-10 w-10 rounded-[10px] border text-[13px] sm:w-12",
                          on ? "border-bad bg-bad-l text-bad" : "border-line2 bg-card text-ink hover:bg-hover",
                          ro && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {on ? "不排" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ro && <p className="mt-2 text-sm text-mute">過渡期請在舊版修改</p>}
    </>
  );
}

function Proctor() {
  const x = useNx();
  const exams = Object.entries(x.data!.records.exam);
  const duties = exams.flatMap(([eid, e]) => TEACH.proctorDuties(e, x.me!.name).map((d) => ({ ...d, eid, title: e.title || "" })));
  return (
    <>
      <SectionTitle no={2} extra={duties.length + " 場"} className="mt-8">
        我的監考
      </SectionTitle>
      {duties.length ? (
        <ul className="flex flex-col gap-2">
          {duties.map((d) => (
            <li key={d.eid + d.key + d.sup} className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-line bg-card px-4 py-2.5">
              <span className="min-w-0 flex-1">
                {d.date}
                {d.dow ? "（" + d.dow + "）" : ""} {d.period} {d.subject}
              </span>
              <em className="text-sm text-blue not-italic">
                {d.room}
                {d.sup ? "・支援" : ""}
              </em>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-mute">{exams.length ? "沒有排到監考" : "還沒有段考資料"}</p>
      )}
      <p className="mt-2 text-sm text-mute">交卷名單之後在這裡看</p>
    </>
  );
}

function Look() {
  const x = useNx();
  const router = useRouter();
  const [th, setTh] = useState<Theme>(() => getTheme());
  const [fs, setFs] = useState<FontSize>(() => getFontSize());
  return (
    <>
      <SectionTitle no={3} className="mt-8">
        外觀
      </SectionTitle>
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
          <SectionTitle no={4} className="mt-8">
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
    </>
  );
}

function Settings() {
  const x = useNx();
  if (!x.me) return <p className="py-10 text-mute">找不到綁定的老師</p>;
  return (
    <div className="max-w-[760px]">
      <h1 className="mb-6 text-[1.75rem] font-bold tracking-[-0.02em]">我的設定</h1>
      <OffGrid />
      <Proctor />
      <Look />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <TeacherShell title="我的設定">
      <Settings />
    </TeacherShell>
  );
}

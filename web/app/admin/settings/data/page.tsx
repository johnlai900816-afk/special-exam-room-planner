"use client";
/* 設定 › 資料與備份（舊版 app.js renderBackup、startTerm）：
   01 下載備份（這位管理者讀得到的全部文件）、加密備份（AES-GCM，和舊版同一個格式）、從備份還原（檢查格式 → 看差異 → 套用）
   02 版本（試排草稿與確定的版本，唯讀）
   03 開始新學期：在新的 terms/{tid} 建一份（升年級、清空…），再由 nxSetCurrentTerm 換成目前的學期 */
import { Download, Lock, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { AdminShell, useAdmin } from "@/components/AdminShell";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { useApply } from "@/components/admin/useApply";
import { failText, toast } from "@/components/Toast";
import { Badge, Button, Card, Input, Note, SectionTitle } from "@/components/ui";
import { firebase } from "@/lib/firebase";
import { COL_NAME, diffRecords, summarize, summaryText } from "@/lib/nx/apply";
import { backupName, encOpen, encPack, isEnc, packBackup, parseBackup, restoreOps, type ParsedBackup } from "@/lib/nx/backup";
import { setCurrentTerm } from "@/lib/nx/members";
import { NEW_TERM_DEFAULT, newTermOps, newTermWhat, planNewTerm, suggestTermId, TERM_ID_RE, type NewTermOpt } from "@/lib/nx/term";
import { createFirestoreRepo } from "@/lib/repo";

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/** 輸入密碼（兩次＝設新密碼） */
function PwBox({ twice, onOk, onCancel }: { twice: boolean; onOk: (pw: string) => void; onCancel: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const ok = () => {
    if (!a) return;
    if (twice && a.length < 8) return toast("密碼至少要 8 個字");
    if (twice && a !== b) return toast("兩次輸入的密碼不一樣");
    onOk(a);
  };
  return (
    <div className="mt-3 rounded-xl border border-line bg-sunk p-3">
      {twice && <p className="mb-2 text-sm text-ink2">密碼忘了，這個備份檔就打不開</p>}
      <div className="flex flex-wrap gap-2">
        <Input type="password" autoFocus aria-label="密碼" placeholder="密碼" autoComplete={twice ? "new-password" : "current-password"} value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok()} />
        {twice && <Input type="password" aria-label="再輸入一次" placeholder="再輸入一次" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok()} />}
        <Button onClick={ok}>確定</Button>
        <Button tone="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

function Backup() {
  const { x, R, repo, revs, ro } = useAdmin();
  const { busy, run } = useApply();
  const file = useRef<HTMLInputElement>(null);
  const [pw, setPw] = useState<"" | "enc" | "open">("");
  const [encFile, setEncFile] = useState<unknown>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const sid = repo.scope.sid;
  const termId = repo.scope.termId;
  const ops = useMemo(() => (parsed ? restoreOps(R, parsed) : null), [parsed, R]);
  const sum = ops ? summarize(ops, revs) : null;
  const lock = ["term", "teachers", "classes", "groups", "students", "privates"].some((c) => ro(c as never));

  const plain = () => download(backupName(false), JSON.stringify(packBackup(R, sid, termId), null, 1));
  const enc = async (p: string) => {
    setPw("");
    try {
      const o = await encPack(JSON.stringify(packBackup(R, sid, termId)), p);
      download(backupName(true), JSON.stringify(o));
      toast("已下載加密備份，請記好密碼");
    } catch (e) {
      toast("加密失敗：" + (e as Error).message);
    }
  };
  const load = (o: unknown) => {
    try {
      const b = parseBackup(o);
      if (b.sid && b.sid !== sid && !confirm("這是別的學校（" + b.sid + "）的備份，還要繼續嗎？")) return;
      setParsed(b);
    } catch (e) {
      toast("備份檔不對：" + (e as Error).message);
    }
  };
  const pick = async (fs: FileList | null) => {
    const f = fs?.[0];
    if (file.current) file.current.value = "";
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (isEnc(o)) {
        setEncFile(o);
        setPw("open");
      } else load(o);
    } catch {
      toast("讀不出來，不是備份檔");
    }
  };
  const open = async (p: string) => {
    setPw("");
    try {
      load(JSON.parse(await encOpen(encFile as never, p)));
    } catch {
      toast("密碼不對，或檔案壞掉了");
    }
  };
  const restore = async () => {
    if (!ops || !sum) return;
    if (!confirm("從備份還原？\n" + summaryText(sum) + "\n\n建議先下載一份現在的備份。")) return;
    if (await run(ops, "已還原")) setParsed(null);
  };

  return (
    <Card>
      <SectionTitle no={1}>備份與還原</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <Button tone="primary" onClick={plain}>
          <Download size={16} />
          下載備份
        </Button>
        <Button onClick={() => setPw("enc")} disabled={typeof crypto === "undefined" || !crypto.subtle}>
          <Lock size={16} />
          加密備份
        </Button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => pick(e.target.files)} />
        <Button disabled={lock} onClick={() => file.current?.click()}>
          <Upload size={16} />
          從備份還原
        </Button>
      </div>
      {!x.demo && <p className="mt-2 text-sm text-mute">備份檔含學生姓名與特教資料，帶出學校請用加密備份</p>}
      {pw === "enc" && <PwBox twice onOk={enc} onCancel={() => setPw("")} />}
      {pw === "open" && <PwBox twice={false} onOk={open} onCancel={() => setPw("")} />}
      {parsed && sum && (
        <div className="mt-4 rounded-xl bg-sunk p-4 text-[15px]">
          <p className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="acc">{parsed.kind === "legacy" ? "舊版備份" : "新版備份"}</Badge>
            {parsed.at && <span className="text-sm text-mute">{new Date(parsed.at).toLocaleString("zh-TW")}</span>}
            <span className="text-sm text-mute">
              學生 {parsed.counts.students || 0}、老師 {parsed.counts.teachers || 0}、課程 {parsed.counts.groups || 0}
            </span>
          </p>
          {parsed.kind === "legacy" && <Note>舊版備份只還原名冊、課程與排課；段考、點名請在舊版還原</Note>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="ok">新增 {sum.add}</Badge>
            <Badge tone="acc">更新 {sum.update}</Badge>
            <Badge tone={sum.del ? "bad" : "default"}>刪除 {sum.del}</Badge>
          </div>
          <ul className="mt-2 text-sm text-ink2">
            {Object.entries(sum.byCol).map(([c, n]) => (
              <li key={c}>
                {COL_NAME[c] || c}：{[n.add && "新增 " + n.add, n.update && "更新 " + n.update, n.del && "刪除 " + n.del].filter(Boolean).join("、")}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end gap-2">
            <Button tone="ghost" onClick={() => setParsed(null)}>
              取消
            </Button>
            <Button tone="danger" disabled={!sum.total || busy || lock} onClick={restore}>
              還原
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Versions() {
  const { R } = useAdmin();
  const list = Object.entries(R.versions)
    .map(([id, v]) => ({ id, label: String(v.label || ""), at: +(v.at as number) || 0, kind: String(v.kind || "") }))
    .sort((a, b) => b.at - a.at);
  return (
    <Card className="mt-4">
      <SectionTitle no={2}>版本</SectionTitle>
      {list.length ? (
        <ul className="flex flex-col divide-y divide-line text-[15px]">
          {list.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
              <span className="text-mute tabular-nums">{v.at ? new Date(v.at).toLocaleString("zh-TW") : "—"}</span>
              <span className="min-w-0 flex-1">{v.label || (v.kind === "draft" ? "試排草稿" : "確定的版本")}</span>
              <Badge tone={v.kind === "draft" ? "warn" : "default"}>{v.kind === "draft" ? "草稿" : "版本"}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-mute">還沒有版本</p>
      )}
    </Card>
  );
}

function NewTerm() {
  const { x, R, D, repo } = useAdmin();
  const { busy, run } = useApply();
  const [o, setO] = useState<NewTermOpt>({ ...NEW_TERM_DEFAULT, title: D.title || "" });
  const [tid, setTid] = useState("");
  const [going, setGoing] = useState(false);
  const plan = useMemo(() => planNewTerm(R, o), [R, o]);
  const termId = tid || suggestTermId(o.title);
  const legacy = !x.demo && x.school?.mode === "legacy";
  const canAdmin = x.admin?.role === "admin";
  const what = newTermWhat(o);
  const chk = (k: keyof NewTermOpt, label: string, strong?: boolean) => (
    <label className="flex min-h-10 items-center gap-2">
      <input type="checkbox" className="size-5" checked={!!o[k]} onChange={(e) => setO({ ...o, [k]: e.target.checked })} />
      {strong ? <b>{label}</b> : label}
    </label>
  );

  const start = async () => {
    if (!TERM_ID_RE.test(termId)) return toast("學期代碼只能用小寫英數、-、_（2–40 字）");
    if (!confirm("開始新學期（" + (o.title || termId) + "）：\n" + (what.length ? what.map((w) => "・" + w).join("\n") : "只改學期名稱") + "\n\n確定嗎？")) return;
    if (x.demo) {
      // 範例資料只有一個學期：直接換成新學期的內容
      const ok = await run(diffRecords(R, plan.records, ["term", "teachers", "classes", "groups", "students", "privates", "staff", "iep", "versions", "lockLog"]), "已開始新學期（範例資料）");
      if (ok && o.promote) toast("升級 " + plan.up + " 人、畢業 " + plan.grad + " 人");
      return;
    }
    const fb = firebase();
    if (!fb) return;
    setGoing(true);
    try {
      const next = createFirestoreRepo(fb.db, { ...repo.scope, termId });
      await next.batch(newTermOps(plan.records));
      await setCurrentTerm(repo.scope.sid, termId);
      toast("已開始新學期");
      x.refresh();
    } catch (e) {
      toast(failText(e));
    } finally {
      setGoing(false);
    }
  };

  return (
    <Card className="mt-4">
      <SectionTitle no={3}>開始新學期</SectionTitle>
      {legacy ? (
        <p className="text-mute">過渡期請在舊版開始新學期</p>
      ) : !canAdmin ? (
        <p className="text-mute">只有管理者可以開始新學期</p>
      ) : (
        <details>
          <summary className="cursor-pointer text-blue">選要清掉的部分</summary>
          <div className="mt-3 grid gap-x-6 text-[15px] sm:grid-cols-2">
            <label className="flex min-h-10 items-center gap-2 sm:col-span-2">
              學期名稱
              <Input className="w-56" value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} />
            </label>
            {!x.demo && (
              <label className="flex min-h-10 items-center gap-2 sm:col-span-2">
                學期代碼
                <Input className="w-32" value={termId} onChange={(e) => setTid(e.target.value.trim())} />
              </label>
            )}
            {chk("clearAssign", "清空排課結果（課程留著）")}
            {chk("clearGroups", "清空所有課程")}
            {chk("clearCS", "清空各班任課老師")}
            {chk("clearClassOff", "清空班級不排課、不能鎖課")}
            {chk("clearTeaOff", "清空老師的不排課時段")}
            {chk("promote", "升年級：701→801，九年級畢業移出", true)}
          </div>
          <p className="mt-2 text-sm text-mute">
            新學期：學生 {plan.counts.students}、老師 {plan.counts.teachers}、課程 {plan.counts.groups}
            {o.promote ? "；升級 " + plan.up + " 人、畢業 " + plan.grad + " 人" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => download(backupName(false), JSON.stringify(packBackup(R, repo.scope.sid, repo.scope.termId), null, 1))}>先下載備份</Button>
            <Button tone="danger" disabled={busy || going} onClick={start}>
              開始新學期
            </Button>
          </div>
        </details>
      )}
    </Card>
  );
}

function Data() {
  return (
    <div className="max-w-[900px]">
      <h1 className="mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">設定</h1>
      <SettingsTabs />
      <Backup />
      <Versions />
      <NewTerm />
    </div>
  );
}

export default function DataPage() {
  return (
    <AdminShell title="資料與備份">
      <Data />
    </AdminShell>
  );
}

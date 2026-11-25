"use client";
import { Check, Download, Inbox, KeyRound, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Planned } from "@/components/Planned";
import { Badge, Button, Card, Note, PageHeader } from "@/components/ui";
import { boundTeacherId, isHost, normEmail, roleOf, ROLE_LABEL, withMember, withoutMember, type Access, type AppRole } from "@/lib/accounts";
import { applyTeacherOff, dropJoinRequest, listJoinRequests, listTeacherOff, saveAccess, type JoinRequest, type TeacherOffDoc } from "@/lib/cloud";
import { useSession } from "@/lib/session";
import type { RcData } from "@/lib/types";

const errText = (e: unknown) => {
  const c = (e as { code?: string }).code || "";
  return /permission/.test(c) ? "目前的雲端規則不允許（要部署新規則）" : c || (e as Error).message;
};

function Members({ access, D }: { access: Access; D: RcData }) {
  const s = useSession();
  const host = isHost(access, s.user?.email);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("teacher");
  const [tid, setTid] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const tName = (id: string) => D.teachers.find((t) => t.id === id)?.name || "";

  const commit = async (a: Access, done: string) => {
    setBusy(true);
    setMsg("");
    try {
      await saveAccess(a);
      setMsg(done);
    } catch (e) {
      setMsg("更新失敗：" + errText(e));
    } finally {
      setBusy(false);
    }
  };

  const sel = "min-h-10 rounded-lg border border-line2 px-2 text-md";
  return (
    <Card title={"成員與角色（" + access.emails.length + " 人）"} icon={<Users size={18} />}>
      <p className="mb-3 text-md text-ink2">
        管理者＝舊版的主持人與「編輯」；老師＝舊版的「檢視」再綁定名冊上的老師；沒有綁定的「檢視」只看排課總表。
        {host ? "" : " 只有主持人（" + access.admin + "）能改名單。"}
      </p>
      <ul className="divide-y divide-line">
        {access.emails.map((e) => {
          const r = roleOf(access, e) || "viewer";
          const b = boundTeacherId(access, e);
          const isH = normEmail(e) === normEmail(access.admin);
          return (
            <li key={e} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">{e}</span>
              {isH ? <Badge tone="acc">主持人</Badge> : <Badge tone={r === "admin" ? "acc" : r === "teacher" ? "ok" : "default"}>{ROLE_LABEL[r]}</Badge>}
              {host ? (
                <>
                  <select
                    className={sel}
                    value={b}
                    aria-label={e + " 是名冊上的哪一位老師"}
                    onChange={(x) => commit(withMember(access, e, isH ? "admin" : r === "viewer" && x.target.value ? "teacher" : r, x.target.value), "已更新 " + e)}
                    disabled={busy}
                  >
                    <option value="">（未綁定老師）</option>
                    {D.teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {!isH && (
                    <>
                      <select
                        className={sel}
                        value={r}
                        aria-label={e + " 的角色"}
                        disabled={busy}
                        onChange={(x) => commit(withMember(access, e, x.target.value as AppRole, b), "已更新 " + e)}
                      >
                        <option value="admin">管理者</option>
                        <option value="teacher">老師</option>
                        <option value="viewer">檢視</option>
                      </select>
                      <Button
                        tone="danger"
                        aria-label={"移除 " + e}
                        disabled={busy}
                        onClick={() => confirm("確定把 " + e + " 移出名單？") && commit(withoutMember(access, e), "已移除 " + e)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </>
                  )}
                </>
              ) : (
                b && <span className="text-md text-mute">{tName(b)}</span>
              )}
            </li>
          );
        })}
      </ul>
      {host && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <input
            type="email"
            className="min-h-10 min-w-56 flex-1 rounded-lg border border-line2 px-3"
            placeholder="老師的 Gmail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select className={sel} value={role} onChange={(e) => setRole(e.target.value as AppRole)} aria-label="角色">
            <option value="teacher">老師</option>
            <option value="admin">管理者</option>
            <option value="viewer">檢視</option>
          </select>
          <select className={sel} value={tid} onChange={(e) => setTid(e.target.value)} aria-label="名冊上的老師">
            <option value="">（名冊上的老師）</option>
            {D.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button
            tone="primary"
            disabled={busy}
            onClick={() => {
              const v = normEmail(email);
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return setMsg("請輸入完整的信箱");
              if (role === "teacher" && !tid) return setMsg("老師要選名冊上的哪一位");
              commit(withMember(access, v, role, tid), "已加入 " + v).then(() => setEmail(""));
            }}
          >
            <UserPlus size={16} />
            加入
          </Button>
        </div>
      )}
      {msg && <p className="mt-2 text-md text-ink2">{msg}</p>}
    </Card>
  );
}

function Requests() {
  const s = useSession();
  const [joins, setJoins] = useState<JoinRequest[] | string>([]);
  const [offs, setOffs] = useState<TeacherOffDoc[] | string>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    listJoinRequests().then(setJoins, (e) => setJoins(errText(e)));
    listTeacherOff().then(
      (a) => setOffs(a.filter((x) => x.status === "pending")),
      (e) => setOffs(errText(e)),
    );
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const tName = (id: string) => s.D?.teachers.find((t) => t.id === id)?.name || id;
  return (
    <Card title="待處理" icon={<Inbox size={18} />}>
      <h3 className="mb-1 text-base">加入申請</h3>
      {typeof joins === "string" ? (
        <p className="text-md text-mute">{joins}</p>
      ) : joins.length ? (
        <ul className="mb-3 divide-y divide-line">
          {joins.map((j) => (
            <li key={j.uid} className="flex flex-wrap items-center gap-2 py-2 text-md">
              <span className="flex-1">
                {j.name}（{j.email}）{j.note && <span className="text-mute">・{j.note}</span>}
              </span>
              <Button tone="ghost" onClick={() => dropJoinRequest(j.uid).then(load, (e) => setMsg(errText(e)))}>
                已處理
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-md text-mute">沒有。</p>
      )}
      <h3 className="mb-1 text-base">老師送出的不排課時段</h3>
      {typeof offs === "string" ? (
        <p className="text-md text-mute">{offs}</p>
      ) : offs.length ? (
        <ul className="divide-y divide-line">
          {offs.map((o) => (
            <li key={o.teacherId} className="flex flex-wrap items-center gap-2 py-2 text-md">
              <span className="flex-1">
                {tName(o.teacherId)}：{o.off.length} 節（{o.by}）
              </span>
              <Button
                onClick={() =>
                  applyTeacherOff(o, s.user!.email).then(
                    () => {
                      setMsg("已套用 " + tName(o.teacherId));
                      load();
                    },
                    (e) => setMsg(errText(e)),
                  )
                }
              >
                <Check size={16} />
                套用到排課
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-md text-mute">沒有。</p>
      )}
      {msg && <p className="mt-2 text-md text-ink2">{msg}</p>}
    </Card>
  );
}

function downloadBackup(D: RcData, exam: unknown) {
  // 和舊版「下載備份檔」同一個格式：D 的欄位＋_exam
  const o = { ...D, _exam: exam || undefined };
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 1)], { type: "application/json" }));
  a.download = "資源班管理系統_備份_" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + ".json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export default function AccountsPage() {
  const s = useSession();
  return (
    <AppShell allow={["admin"]} title="資料與帳號">
      <PageHeader title="資料與帳號" lead={s.cloud === "on" ? "雲端「" + s.projectId + "」" : "這台電腦"} />
      <div className="grid gap-4 lg:grid-cols-2">
        {s.cloud === "on" && s.access && s.D ? (
          <>
            <Members access={s.access} D={s.D} />
            <Requests />
          </>
        ) : (
          <Card title="成員與角色" icon={<KeyRound size={18} />} className="lg:col-span-2">
            <Note>登入學校的雲端後，才有每位老師自己的帳號。現在是「{s.source.label}」。</Note>
          </Card>
        )}
        <Card title="備份" icon={<Download size={18} />}>
          <p className="mb-3 text-md text-ink2">備份檔含學生姓名，請自己保管，不要上傳到公開的地方。</p>
          <Button disabled={!s.D || s.source.kind === "demo"} onClick={() => s.D && downloadBackup(s.D, s.exam)}>
            <Download size={16} />
            下載備份檔
          </Button>
        </Card>
        <Planned
          title="還原、版本、新學期、全部清空"
          items={["從備份檔還原（先預覽差異）", "回到之前的版本", "開始新學期（升年級、清空排課）", "全部清空：要打出學校名稱確認才會執行"]}
        />
      </div>
    </AppShell>
  );
}

"use client";
/* 設定 › 帳號與共用：成員（角色、綁定的老師、撤銷）、邀請、舊名單轉邀請（先看清單）、搬移狀態（nxLink/main；先試算再搬）。
   寫入都經 Cloud Functions（nx-claims.js、nx-migrate.js、nx-admin.js）；成員與邀請只有管理者讀得到。 */
import { RefreshCw, Send, UserMinus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { SettingsTabs } from "@/components/admin/SettingsTabs";
import { failText, toast } from "@/components/Toast";
import { Badge, Button, Card, Input, Note, SectionTitle, Select } from "@/components/ui";
import { MEMBER_ROLES, type InviteDoc, type MemberRole } from "@/lib/model";
import { COL_NAME } from "@/lib/nx/apply";
import {
  countLines,
  createInvite,
  importLegacyMembers,
  linkStatus,
  listInvites,
  listMembers,
  migrateLegacy,
  revokeMember,
  ROLE_NAME,
  setClaims,
  type LegacyMember,
  type LinkStatus,
  type Member,
  type MigrateResult,
} from "@/lib/nx/members";
import { useNx } from "@/lib/nx/session";
import type { Teacher } from "@/lib/types";

const th = "px-2 py-2 text-left text-[13px] font-normal text-mute whitespace-nowrap";
const td = "border-t border-line px-2 py-1.5";
const errText = (e: unknown) => String((e as { message?: string }).message || (e as { code?: string }).code || e);

function TeacherSelect({ value, onChange, teachers, label }: { value: string; onChange: (v: string) => void; teachers: Teacher[]; label: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-9 py-0 text-sm">
      <option value="">（不綁定）</option>
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}

function Members({ sid, teachers }: { sid: string; teachers: Teacher[] }) {
  const x = useNx();
  const [ms, setMs] = useState<Member[] | null>(null);
  const [inv, setInv] = useState<InviteDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ email: "", role: "teacher" as MemberRole, tid: "" });
  const [now] = useState(() => Date.now());
  const tn = (id?: string | null) => teachers.find((t) => t.id === id)?.name || "";
  const reload = useCallback(() => {
    listMembers(sid).then(setMs, (e) => toast(failText(e)));
    listInvites(sid).then(setInv, () => setInv([]));
  }, [sid]);
  useEffect(() => {
    reload();
  }, [reload]);

  const act = async (f2: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await f2();
      toast(ok);
      reload();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const change = (m: Member, role: MemberRole, tid: string) => {
    if (role === "teacher" && !tid) return toast("老師一定要綁定名冊上的老師");
    if (!confirm(m.email + " 改成「" + ROLE_NAME[role] + "」" + (tid ? "，綁定 " + tn(tid) : "") + "？")) return;
    act(() => setClaims(sid, m.uid, role, tid), "已更新，對方重新整理後生效");
  };
  const invite = () => {
    if (f.role === "teacher" && !f.tid) return toast("老師一定要綁定名冊上的老師");
    act(() => createInvite(sid, f.email.trim(), f.role, f.tid), "已邀請 " + f.email.trim()).then(() => setF({ email: "", role: "teacher", tid: "" }));
  };

  return (
    <>
      <Card>
        <SectionTitle no={1} extra={ms ? ms.filter((m) => m.active).length + " 位" : ""}>
          成員
        </SectionTitle>
        {!ms ? (
          <p className="text-mute">讀取中…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="bg-sunk">
                  <th className={th}>信箱</th>
                  <th className={th}>角色</th>
                  <th className={th}>綁定的老師</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {ms.map((m) => (
                  <tr key={m.uid} className={m.active ? "" : "text-mute"}>
                    <td className={td + " break-all"}>
                      {m.email}
                      {m.uid === x.user?.uid && <Badge>我</Badge>}
                    </td>
                    <td className={td}>
                      {m.active ? (
                        <Select aria-label={m.email + " 的角色"} className="min-h-9 py-0 text-sm" disabled={busy} value={m.role} onChange={(e) => change(m, e.target.value as MemberRole, m.teacherId || "")}>
                          {MEMBER_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_NAME[r]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge>已停用</Badge>
                      )}
                    </td>
                    <td className={td}>
                      {m.active && <TeacherSelect label={m.email + " 綁定的老師"} teachers={teachers} value={m.teacherId || ""} onChange={(v) => change(m, m.role, v)} />}
                    </td>
                    <td className={td}>
                      {m.active && m.uid !== x.user?.uid && (
                        <Button
                          size="sm"
                          tone="danger"
                          disabled={busy}
                          onClick={() => confirm("停用 " + m.email + "？他會被登出，之後要重新邀請。") && act(() => revokeMember(sid, m.uid), "已停用")}
                        >
                          <UserMinus size={15} />
                          停用
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <SectionTitle no={2}>邀請</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Input type="email" aria-label="信箱" placeholder="信箱" className="min-w-[14rem] flex-1" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Select aria-label="角色" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as MemberRole })}>
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAME[r]}
              </option>
            ))}
          </Select>
          <TeacherSelect label="綁定的老師" teachers={teachers} value={f.tid} onChange={(v) => setF({ ...f, tid: v })} />
          <Button tone="primary" disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())} onClick={invite}>
            <Send size={16} />
            邀請
          </Button>
        </div>
        {inv.length > 0 && (
          <ul className="mt-4 flex flex-col divide-y divide-line text-[15px]">
            {inv.map((v) => (
              <li key={v.email} className="flex flex-wrap items-center gap-x-3 py-1.5">
                <span className="min-w-0 flex-1 break-all">{v.email}</span>
                <Badge tone="acc">{ROLE_NAME[v.role]}</Badge>
                {v.teacherId && <span className="text-sm text-ink2">{tn(v.teacherId)}</span>}
                <small className={v.exp && v.exp.getTime() < now ? "text-bad" : "text-mute"}>{v.exp ? v.exp.toLocaleDateString("zh-TW") + " 到期" : ""}</small>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Legacy({ sid }: { sid: string }) {
  const [list, setList] = useState<LegacyMember[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (dry: boolean) => {
    if (!dry && !confirm("寄出 " + (list?.length || 0) + " 份邀請？（30 天內有效）")) return;
    setBusy(true);
    try {
      const r = await importLegacyMembers(sid, dry);
      setList(r.list);
      if (!dry) toast("已邀請 " + r.list.length + " 位");
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mt-4">
      <SectionTitle no={3}>舊名單</SectionTitle>
      {list ? (
        list.length ? (
          <>
            <ul className="mb-3 flex flex-col divide-y divide-line text-[15px]">
              {list.map((m) => (
                <li key={m.email} className="flex flex-wrap items-center gap-x-3 py-1.5">
                  <span className="min-w-0 flex-1 break-all">{m.email}</span>
                  <Badge tone="acc">{ROLE_NAME[m.role]}</Badge>
                </li>
              ))}
            </ul>
            <Button disabled={busy} onClick={() => run(false)}>
              全部邀請
            </Button>
          </>
        ) : (
          <p className="text-mute">舊名單沒有其他人</p>
        )
      ) : (
        <Button disabled={busy} onClick={() => run(true)}>
          看舊名單
        </Button>
      )}
    </Card>
  );
}

function Migration({ sid }: { sid: string }) {
  const x = useNx();
  const [st, setSt] = useState<LinkStatus | null>(null);
  const [err, setErr] = useState("");
  const [termId, setTermId] = useState("");
  const [res, setRes] = useState<MigrateResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    linkStatus(sid).then(
      (s) => {
        setSt(s);
        setTermId(s.link?.termId || s.school?.currentTerm || "");
      },
      (e) => setErr(errText(e)),
    );
  }, [sid]);
  const run = async (dry: boolean) => {
    if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(termId)) return toast("學期代碼只能用小寫英數、-、_");
    if (!dry && !confirm("把舊版的資料搬到新位置（學期 " + termId + "）？\n要寫 " + (res?.counts.total ?? "?") + " 份。搬完舊版每次存檔都會同步過來。")) return;
    setBusy(true);
    try {
      const r = await migrateLegacy(sid, termId, dry);
      setRes(r);
      if (!dry) {
        toast("已搬移");
        linkStatus(sid).then(setSt, () => {});
        x.refresh();
      }
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const lines = countLines(res?.counts);
  return (
    <Card className="mt-4">
      <SectionTitle no={4}>舊版資料搬移</SectionTitle>
      {err ? (
        <Note tone="warn">讀不到搬移狀態：{err}</Note>
      ) : !st ? (
        <p className="text-mute">讀取中…</p>
      ) : (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-[15px]">
            {st.link ? (
              <>
                <Badge tone={st.link.mode === "native" ? "ok" : "warn"}>{st.link.mode === "native" ? "新版是正本" : "過渡期：舊版是正本"}</Badge>
                <span className="text-ink2">學期 {st.link.termId}</span>
                {st.link.native.length > 0 && <span className="text-sm text-mute">已交給新版：{st.link.native.map((c) => COL_NAME[c] || c).join("、")}</span>}
                {st.sync?.at && <span className="text-sm text-mute">上次同步 {new Date(st.sync.at).toLocaleString("zh-TW")}</span>}
              </>
            ) : (
              <Badge>還沒搬移</Badge>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="學期代碼" className="w-32" placeholder="115-1" value={termId} onChange={(e) => setTermId(e.target.value.trim())} />
            <Button disabled={busy} onClick={() => run(true)}>
              <RefreshCw size={16} />
              試算
            </Button>
            {res && res.dryRun && (
              <Button tone="primary" disabled={busy || !res.counts.total} onClick={() => run(false)}>
                搬移
              </Button>
            )}
          </div>
          {res && (
            <div className="mt-3 rounded-xl bg-sunk p-3 text-[15px]">
              <p className="mb-1">{res.dryRun ? (res.counts.total ? "要寫 " + res.counts.total + " 份" : "沒有差異") : "已寫 " + res.counts.total + " 份"}</p>
              {lines.length > 0 && (
                <ul className="text-sm text-ink2">
                  {lines.map((l) => (
                    <li key={l.col}>
                      {COL_NAME[l.col] || l.col}：{[l.set && "寫 " + l.set, l.del && "刪 " + l.del].filter(Boolean).join("、")}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-sm text-mute">
                舊版目前：學生 {res.sizes.students ?? 0}、老師 {res.sizes.teachers ?? 0}、課程 {res.sizes.groups ?? 0}
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Accounts() {
  const x = useNx();
  const sid = x.claims?.sid || "";
  const teachers = x.admin?.D?.teachers || [];
  const isAdmin = x.claims?.role === "admin";
  return (
    <div className="max-w-[900px]">
      <h1 className="mb-4 text-[1.75rem] font-bold tracking-[-0.02em]">設定</h1>
      <SettingsTabs />
      {x.demo ? (
        <p className="text-mute">範例資料沒有帳號，登入後才能管理成員</p>
      ) : !isAdmin ? (
        <p className="text-mute">成員只有管理者能管理</p>
      ) : (
        <>
          <Members sid={sid} teachers={teachers} />
          <Legacy sid={sid} />
          <Migration sid={sid} />
        </>
      )}
    </div>
  );
}

export default function AccountsPage() {
  return (
    <AdminShell title="帳號與共用" needData={false}>
      <Accounts />
    </AdminShell>
  );
}

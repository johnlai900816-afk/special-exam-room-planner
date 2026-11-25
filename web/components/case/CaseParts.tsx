"use client";
/* 個案頁的區段：私密欄位、家長聯絡紀錄、段考服務、出缺席。老師端（/me/student）與管理者端（/admin/student）共用，
   存檔函式由頁面給（各自的 Repo 與 rev）。原本在 app/me/student/page.tsx。 */
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { failText, toast } from "@/components/Toast";
import { Badge, Button, Input, Select, Textarea, cx } from "@/components/ui";
import { NX } from "@/lib/legacy";
import type { StudentPrivateDoc } from "@/lib/model";
import {
  CONTACT_HOW,
  contactDigest,
  dropContact,
  privPatch,
  saveContact,
  setSvc,
  sortContacts,
  SVC,
  svcSubjects,
  type Contact,
  type ExamSvc,
  type PrivField,
} from "@/lib/nx/privacy";
import { attSummary, md, ymd } from "@/lib/nx/today";
import { revKey, type Repo, type RevMap } from "@/lib/repo";

export const DL = ({ k, children }: { k: string; children: ReactNode }) => (
  <>
    <dt className="text-mute">{k}</dt>
    <dd className="m-0 min-w-0">{children}</dd>
  </>
);

/** 存一個私密欄位（students/{id}/private/profile，帶 rev）；老師端與管理者端各自給 repo、revs */
export type PrivSave = (field: PrivField, value: unknown) => Promise<void>;
export function privSaver(repo: Repo, revs: RevMap, sid: string): PrivSave {
  const id = NX.encId(sid);
  return async (field, value) => {
    try {
      const rev = revs[revKey("privates", id)]?.rev || 0;
      await repo.patch("privates", id, privPatch(field, value), rev);
      toast("已存檔");
    } catch (e) {
      toast(failText(e));
    }
  };
}

export function PrivateFields({ save, p, ro }: { save: PrivSave; p: StudentPrivateDoc; ro: boolean }) {
  const field = (k: "iepDate" | "reviewDate" | "certExp", label: string) => (
    <DL k={label}>
      <Input type="date" className="w-full" disabled={ro} defaultValue={p[k] || ""} key={k + (p[k] || "")} onChange={(e) => save(k, e.target.value)} />
    </DL>
  );
  return (
    <dl className="grid grid-cols-[5.5em_1fr] items-center gap-x-2.5 gap-y-2 text-[15px]">
      <DL k="私密備註">
        <Textarea
          rows={2}
          className="w-full"
          disabled={ro}
          defaultValue={p.privNote || ""}
          key={"n" + (p.privNote || "")}
          onBlur={(e) => e.target.value.trim() !== (p.privNote || "") && save("privNote", e.target.value)}
        />
      </DL>
      {field("iepDate", "IEP 會議")}
      {field("reviewDate", "下次檢討")}
      {field("certExp", "鑑定期限")}
    </dl>
  );
}

export function Contacts({ save, sid, name, cls, p, ro }: { save: PrivSave; sid: string; name: string; cls: string; p: StudentPrivateDoc; ro: boolean }) {
  const today = ymd(new Date());
  const list = sortContacts(p.contacts);
  const blank = { date: today, how: "電話", who: "", note: "" };
  const [edit, setEdit] = useState<string>("");
  const [f, setF] = useState<Omit<Contact, "id">>(blank);
  const [since, setSince] = useState(p.iepDate && p.iepDate <= today ? p.iepDate : "");
  const start = (c?: Contact) => {
    setEdit(c ? c.id : "");
    setF(c ? { date: c.date, how: c.how || "其他", who: c.who || "", note: c.note || "" } : blank);
  };
  const submit = async () => {
    if (!f.date) return toast("請填日期");
    if (!f.note && !f.who) return toast("請填內容");
    await save("contacts", saveContact(p.contacts, { ...f, id: edit || undefined }));
    start();
  };
  const digest = list.length ? contactDigest({ id: sid, cls, name } as never, p.contacts || [], since) : "";
  return (
    <>
      {list.length ? (
        <ul className="mb-3 flex flex-col divide-y divide-line">
          {list.map((c) => (
            <li key={c.id} className="flex items-start gap-2 py-2">
              <span className="min-w-0 flex-1">
                <b>{md(c.date)}</b> <Badge>{c.how || "其他"}</Badge> {c.who}
                {c.note && <small className="block text-sm text-ink2">{c.note}</small>}
              </span>
              {!ro && (
                <>
                  <Button size="sm" tone="ghost" aria-label="編輯" onClick={() => start(c)}>
                    <Pencil size={15} />
                  </Button>
                  <Button
                    size="sm"
                    tone="ghost"
                    aria-label="刪除"
                    onClick={() => confirm("刪除 " + md(c.date) + " 的紀錄？") && save("contacts", dropContact(p.contacts, c.id))}
                  >
                    <Trash2 size={15} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-mute">還沒有紀錄</p>
      )}
      {!ro && (
        <div className="grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
          <Input type="date" aria-label="日期" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Select aria-label="方式" value={f.how} onChange={(e) => setF({ ...f, how: e.target.value })}>
            {CONTACT_HOW.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </Select>
          <Input aria-label="對象" className="w-full min-w-0" placeholder="對象（例：母親）" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} />
          <Input aria-label="內容" className="w-full min-w-0 sm:col-span-3" placeholder="內容" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <div className="flex gap-2 sm:col-span-3">
            <Button size="sm" onClick={submit}>
              {edit ? "存檔" : "新增"}
            </Button>
            {edit && (
              <Button size="sm" tone="ghost" onClick={() => start()}>
                取消
              </Button>
            )}
          </div>
        </div>
      )}
      {list.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-blue">整理給 IEP 會議</summary>
          <div className="mt-2 flex items-center gap-2">
            <Input type="date" aria-label="從哪一天起" value={since} onChange={(e) => setSince(e.target.value)} />
            <span className="text-sm text-mute">起</span>
          </div>
          <Textarea readOnly rows={5} className="mt-2 w-full text-sm" value={digest} aria-label="整理好的聯絡紀錄" />
          <Button size="sm" className="mt-2" onClick={() => navigator.clipboard?.writeText(digest).then(() => toast("已複製"), () => toast("沒辦法自動複製，請手動複製"))}>
            <Copy size={15} />
            複製
          </Button>
        </details>
      )}
    </>
  );
}

export function ExamService({ save, p, ro, subjects }: { save: PrivSave; p: StudentPrivateDoc; ro: boolean; subjects: string[] }) {
  const v = (p.examSvc || {}) as ExamSvc;
  const subs = svcSubjects(subjects, v);
  return (
    <div className="grid grid-cols-[4em_1fr] items-start gap-x-3 gap-y-3 text-[15px]">
      {SVC.map(([k, n]) => {
        const cur = v[k];
        const mode = cur === "*" ? "all" : Array.isArray(cur) ? "some" : "";
        return (
          <div key={k} className="contents">
            <b className="pt-2">{n}</b>
            <div>
              <Select aria-label={n} disabled={ro} value={mode} onChange={(e) => save("examSvc", setSvc(v, k, e.target.value as "" | "all" | "some"))}>
                <option value="">不需要</option>
                <option value="all">全部科目</option>
                <option value="some">指定科目</option>
              </Select>
              {mode === "some" && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {subs.map((sj) => {
                    const on = Array.isArray(cur) && cur.includes(sj);
                    return (
                      <label key={sj} className="inline-flex min-h-9 items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="size-4"
                          disabled={ro}
                          checked={on}
                          onChange={() => save("examSvc", setSvc(v, k, "some", on ? (cur as string[]).filter((x) => x !== sj) : [...((cur as string[]) || []), sj]))}
                        />
                        {sj}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <b className="pt-2">備註</b>
      <Input
        aria-label="段考服務備註"
        disabled={ro}
        placeholder="例：數學可用計算機"
        defaultValue={String(v.note || "")}
        key={"note" + String(v.note || "")}
        onBlur={(e) => {
          const note = e.target.value.trim();
          if (note === String(v.note || "")) return;
          const o = { ...v };
          if (note) o.note = note;
          else delete o.note;
          save("examSvc", o);
        }}
      />
    </div>
  );
}


/** 出缺席：應到、實到、遲到、請假、缺席＋明細 */
export function AttendanceSummary({ att, empty }: { att: ReturnType<typeof attSummary>; empty: string }) {
  if (!att.exp) return <p className="text-sm text-mute">{empty}</p>;
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
        {(
          [
            ["應到", att.exp],
            ["實到", att.in],
            ["遲到", att.late],
            ["請假", att.leave],
            ["缺席", att.abs],
          ] as [string, number][]
        ).map(([k, n]) => (
          <span key={k}>
            <span className="text-mute">{k}</span> <b className={cx("tabular-nums", k === "缺席" && n ? "text-bad" : "")}>{n}</b>
          </span>
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-blue">明細</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="bg-sunk text-left text-[13px] text-mute">
              <th className="px-2 py-1.5 font-normal">日期</th>
              <th className="px-2 py-1.5 font-normal">節次</th>
              <th className="px-2 py-1.5 font-normal">組別</th>
              <th className="px-2 py-1.5 font-normal">狀態</th>
            </tr>
          </thead>
          <tbody>
            {att.rows
              .slice()
              .reverse()
              .map((r, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="px-2 py-1.5">{r.date.slice(5)}</td>
                  <td className="px-2 py-1.5">{r.p}</td>
                  <td className="px-2 py-1.5">{r.g}</td>
                  <td className="px-2 py-1.5">
                    {r.st}
                    {r.note && <small className="text-mute">　{r.note}</small>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

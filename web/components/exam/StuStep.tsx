"use client";
/* ① 名單與服務（舊版 renderStu）：學生來自名冊（班級、座號、姓名在「學生」頁改），服務從個案頁的 IEP 帶入；
   這裡可以改服務（全科／指定科目）、備註、這次不排；名冊以外的學生可以貼上、新增、匯入考評服務名單（PDF／Word）。 */
import { AlertTriangle, ClipboardPaste, FileText, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Dialog } from "@/components/sched/common";
import { toast } from "@/components/Toast";
import { Button, Empty, Textarea, cx } from "@/components/ui";
import { SV, svIsFromRoster, type ExStudent, type Scope } from "@/lib/nx/examCore";
import { pasteStu } from "@/lib/nx/examOut";
import { ImportDialog } from "./ImportDialog";
import { useExam } from "./useExam";

const scopeText = (sc: unknown) => (sc === "*" ? "全科" : Array.isArray(sc) && sc.length ? sc.join("、") : "—");
const SVN: Record<string, string> = { small: "獨立", read: "誦讀", pc: "電腦", oral: "口頭", ext: "延長" };

export function StuStep() {
  const { E, canEdit, edit } = useExam();
  const [scope, setScope] = useState<{ i: number; k: string } | null>(null);
  const [paste, setPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const subjects = [...new Set(E.sessions.map((s) => s.subject))];
  const set = (i: number, fn: (s: ExStudent) => void | false, msg?: string) =>
    edit((e) => {
      const s = e.students[i];
      if (!s) return false;
      return fn(s) === false ? false : msg;
    });
  return (
    <div className="xb">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button tone="primary" disabled={!canEdit} onClick={() => fileRef.current?.click()}>
          <FileText size={16} />
          匯入名單
        </Button>
        <Button disabled={!canEdit} onClick={() => setPaste(true)}>
          <ClipboardPaste size={16} />
          貼上
        </Button>
        <Button
          disabled={!canEdit}
          onClick={() =>
            edit((e) => {
              e.students.push({ id: "n" + Date.now().toString(36), cls: "", seat: "", name: "", sv: {}, memo: "", on: true });
            })
          }
        >
          <Plus size={16} />
          新增
        </Button>
        <span className="text-sm text-mute">考評服務名單 PDF／Word</span>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setFile(f);
          }}
        />
      </div>
      {!E.students.length ? (
        <Empty action={<Button onClick={() => fileRef.current?.click()}>匯入名單</Button>}>還沒有學生</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="ed">
            <thead>
              <tr>
                <th>排入</th>
                <th>班級</th>
                <th>座號</th>
                <th>姓名</th>
                {SV.map((v) => (
                  <th key={v.id}>{SVN[v.id]}</th>
                ))}
                <th>備註</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {E.students.map((s, i) => (
                <tr key={s.id} className={cx(!s.on && "off", !!s.chk && "need")}>
                  <td className="text-center">
                    <input type="checkbox" aria-label="排入" checked={!!s.on} disabled={!canEdit} onChange={(e) => set(i, (x) => void (x.on = e.target.checked))} />
                  </td>
                  {s.rs ? (
                    <>
                      <td>{s.cls}</td>
                      <td>{s.seat}</td>
                      <td className="whitespace-nowrap">
                        {s.name}
                        {svIsFromRoster(s) && <span className="ml-1 rounded-full bg-ok-l px-2 text-xs text-ok">來自 IEP</span>}
                      </td>
                    </>
                  ) : (
                    (["cls", "seat", "name"] as const).map((k) => (
                      <td key={k}>
                        <input
                          type="text"
                          aria-label={k === "cls" ? "班級" : k === "seat" ? "座號" : "姓名"}
                          style={{ width: k === "cls" ? 52 : k === "seat" ? 40 : 80 }}
                          defaultValue={s[k]}
                          key={s[k]}
                          disabled={!canEdit}
                          onBlur={(e) => set(i, (x) => (x[k] === e.target.value.trim() ? false : void (x[k] = e.target.value.trim())))}
                        />
                      </td>
                    ))
                  )}
                  {SV.map((v) => {
                    const sc = s.sv[v.id];
                    const has = sc === "*" || (Array.isArray(sc) && sc.length);
                    return (
                      <td key={v.id} className="relative text-center">
                        <button type="button" className={cx("sc", !!has && "has")} disabled={!canEdit} onClick={() => setScope(scope && scope.i === i && scope.k === v.id ? null : { i, k: v.id })}>
                          {scopeText(sc)}
                        </button>
                        {scope && scope.i === i && scope.k === v.id && (
                          <ScopePop
                            name={s.name + "｜" + v.name}
                            sc={sc}
                            subjects={subjects}
                            onDone={(nsc) => {
                              setScope(null);
                              set(i, (x) => {
                                if (nsc == null) delete x.sv[v.id];
                                else x.sv[v.id] = nsc;
                              });
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td>
                    {s.chk && (
                      <div className="mb-1 max-w-[300px] text-[13px] leading-snug text-warn">
                        <AlertTriangle size={13} className="mr-0.5 inline" /> 請確認：{s.chk}
                        <button type="button" className="ml-1.5 whitespace-nowrap text-blue" onClick={() => set(i, (x) => void (delete x.chk, delete x.hold))}>
                          確認好了
                        </button>
                      </div>
                    )}
                    <input type="text" aria-label="備註" style={{ width: 220 }} defaultValue={s.memo} key={s.memo} disabled={!canEdit} onBlur={(e) => set(i, (x) => (x.memo === e.target.value ? false : void (x.memo = e.target.value)))} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="flex size-9 items-center justify-center rounded-full text-mute hover:bg-hover hover:text-bad disabled:opacity-40"
                      title={s.rs ? "這次不排" : "刪除"}
                      aria-label="刪除"
                      disabled={!canEdit}
                      onClick={() => {
                        // 名冊的學生只能「這次不排」（要刪請到學生頁）
                        if (s.rs) {
                          if (!s.on) return toast("已經是這次不排");
                          set(i, (x) => void (x.on = false), "已設成這次不排");
                        } else if (confirm("刪除 " + s.cls + " " + s.name + "？")) edit((e) => void e.students.splice(i, 1));
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paste && <PasteDialog onClose={() => setPaste(false)} />}
      {file && <ImportDialog file={file} onClose={() => setFile(null)} />}
    </div>
  );
}

function ScopePop({ name, sc, subjects, onDone }: { name: string; sc: Scope | undefined; subjects: string[]; onDone: (s: Scope | null) => void }) {
  const [mode, setMode] = useState(sc === "*" ? "all" : Array.isArray(sc) && sc.length ? "some" : "none");
  const [sel, setSel] = useState<string[]>(Array.isArray(sc) ? sc : []);
  return (
    <div className="absolute top-full left-0 z-30 mt-1 w-56 rounded-xl border border-line bg-card p-3 text-left text-sm shadow-lg">
      <b>{name}</b>
      {(
        [
          ["none", "無"],
          ["all", "全科"],
          ["some", "指定科目："],
        ] as const
      ).map(([k, t]) => (
        <label key={k} className="my-1 flex items-center gap-1.5">
          <input type="radio" checked={mode === k} onChange={() => setMode(k)} /> {t}
        </label>
      ))}
      {subjects.map((x) => (
        <label key={x} className="my-1 ml-5 flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={sel.includes(x)}
            onChange={(e) => {
              setMode("some");
              setSel(e.target.checked ? [...sel, x] : sel.filter((y) => y !== x));
            }}
          />{" "}
          {x}
        </label>
      ))}
      <div className="mt-1.5 text-right">
        <Button size="sm" tone="primary" onClick={() => onDone(mode === "all" ? "*" : mode === "none" ? null : sel.length ? sel : null)}>
          確定
        </Button>
      </div>
    </div>
  );
}

function PasteDialog({ onClose }: { onClose: () => void }) {
  const { edit } = useExam();
  const [t, setT] = useState("");
  return (
    <Dialog
      title="貼上學生名單"
      onClose={onClose}
      foot={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            tone="primary"
            onClick={() => {
              edit((e) => {
                const [n, skip] = pasteStu(e, t);
                return "已加入 " + n + " 位" + (skip ? "（略過重複 " + skip + " 位）" : "");
              });
              onClose();
            }}
          >
            加入
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm text-mute">一行一位：班級 座號 姓名</p>
      <Textarea rows={10} className="w-full" placeholder={"903 15 楊小明\n804 04 李小華"} value={t} onChange={(e) => setT(e.target.value)} />
    </Dialog>
  );
}

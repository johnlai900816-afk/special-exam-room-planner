"use client";
/* ④ 輸出 › 通知單（舊版 notice.html，嵌在段考頁裡的樣子）：日期、考科、時間、地點從排考場自動帶入；補的全名、注意事項、手動改的格子保留。
   紙是學校的公版：HTML 由 lib/nx/notice.ts 產生（和 notice.html 逐字相同），預覽與列印都在 iframe 裡，樣式是 notice.html 逐行複製的。 */
import { ChevronLeft, ChevronRight, Link2, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/sched/common";
import { toast } from "@/components/Toast";
import { Button, Textarea, cx } from "@/components/ui";
import { defaultData, normalize, noticeDoc, stuId, syncNotice, type NoticeData, type NoticeStudent } from "@/lib/nx/notice";
import { useExam } from "./useExam";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const base = () => (typeof location === "undefined" ? "/" : location.origin + (process.env.NEXT_PUBLIC_BASE_PATH || "") + "/");

export function NoticeStep() {
  const { E, N: N0, setN, canEdit } = useExam();
  const [cur, setCur] = useState(0);
  const [tab, setTab] = useState<"stu" | "exam" | "data">("stu");
  const [all, setAll] = useState(false);
  // 打開通知單：沒有就建立；自動連動時從排考場帶入（舊版 autoSync，排考場一存檔就跟著更新）
  const N = useMemo(() => {
    const n = N0 ? clone(N0) : normalize(defaultData());
    if (n.link) syncNotice(n, clone(E), 0);
    return n;
  }, [N0, E]);
  useEffect(() => {
    if (!canEdit || JSON.stringify(N) === JSON.stringify(N0)) return;
    const t = setTimeout(() => setN(N), 0);
    return () => clearTimeout(t);
  }, [N, N0, canEdit, setN]);
  const c = Math.max(0, Math.min(cur, N.students.length - 1));
  const s = N.students[c];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(340px,440px)_1fr]">
      <div className="no-print rounded-2xl border border-line bg-card p-4">
        <div role="tablist" className="mb-3 inline-flex gap-0.5 rounded-full bg-sunk p-1">
          {(
            [
              ["stu", "學生"],
              ["exam", "考試設定"],
              ["data", "其他"],
            ] as const
          ).map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("min-h-9 rounded-full px-4 text-sm", tab === k ? "bg-card font-bold shadow-[0_0_0_1px_var(--line)]" : "text-ink2")}>
              {t}
            </button>
          ))}
        </div>
        {tab === "stu" ? <StuEd N={N} cur={c} setCur={setCur} /> : tab === "exam" ? <ExamEd N={N} /> : <DataEd N={N} onReset={() => setCur(0)} />}
        {!canEdit && <p className="mt-3 text-sm text-mute">過渡期這裡只能看</p>}
      </div>
      <Preview N={N} cur={c} setCur={setCur} all={all} setAll={setAll} cs={s} />
    </div>
  );
}

function Preview({ N, cur, setCur, all, setAll, cs }: { N: NoticeData; cur: number; setCur: (n: number) => void; all: boolean; setAll: (b: boolean) => void; cs: NoticeStudent | undefined }) {
  const fr = useRef<HTMLIFrameElement>(null);
  const [ovf, setOvf] = useState<string[]>([]);
  const doc = useMemo(() => noticeDoc(N, all ? N.students : cs ? [cs] : [], [], base()), [N, all, cs]);
  const fit = useCallback(() => {
    const f = fr.current,
      d = f?.contentDocument;
    if (!f || !d) return;
    const pv = d.getElementById("pv");
    const z = Math.min(1, (f.clientWidth - 52) / 793.7);
    d.querySelectorAll<HTMLElement>("#pv .page").forEach((p) => (p.style.zoom = String(z)));
    f.style.height = Math.max(480, (pv?.scrollHeight || 0) + 8) + "px";
  }, []);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);
  // 超出一張 A4 的：列出來提醒（舊版 checkOverflow；在看不到的 iframe 裡量全部）
  const chk = useRef<HTMLIFrameElement>(null);
  const allDoc = useMemo(() => noticeDoc(N, N.students, [], base()), [N]);
  const measure = () => {
    const d = chk.current?.contentDocument;
    if (!d) return;
    const pages = Array.from(d.querySelectorAll<HTMLElement>("#pv .page"));
    setOvf(pages.map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? stuId(N.students[i]) || "（未命名）" : "")).filter(Boolean));
  };
  const print = (who: NoticeStudent[]) => {
    if (!who.length) return toast("沒有學生可以印");
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    f.srcdoc = noticeDoc(N, [], who, base());
    f.onload = () => {
      const d = f.contentDocument!;
      const imgs = Array.from(d.querySelectorAll("img"));
      Promise.all(imgs.map((im) => (im.complete ? 1 : new Promise((r) => (im.onload = im.onerror = r))))).then(() => {
        f.contentWindow!.focus();
        f.contentWindow!.print();
        setTimeout(() => f.remove(), 1000);
      });
    };
    document.body.appendChild(f);
  };
  const n = N.students.length;
  return (
    <div className="min-w-0">
      <div className="no-print mb-2 flex flex-wrap items-center gap-2">
        <Button aria-label="上一位" onClick={() => setCur((cur - 1 + n) % Math.max(1, n))}>
          <ChevronLeft size={16} />
        </Button>
        <b className="tabular-nums">{n ? cur + 1 + " / " + n + "　" + stuId(N.students[cur]) : ""}</b>
        <Button aria-label="下一位" onClick={() => setCur((cur + 1) % Math.max(1, n))}>
          <ChevronRight size={16} />
        </Button>
        <label className="inline-flex items-center gap-1.5 text-sm text-ink2">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> 預覽全部
        </label>
        <span className="grow" />
        <Button onClick={() => print(cs ? [cs] : [])}>只印這位</Button>
        <Button tone="primary" onClick={() => print(N.students)}>
          <Printer size={16} />
          全部印出
        </Button>
      </div>
      {ovf.length > 0 && (
        <div className="no-print mb-2 rounded-[10px] bg-warn-l px-3 py-2 text-sm text-warn">
          {ovf.length} 張超出一頁，最下面會被切掉：{ovf.join("、")}。請縮短注意事項。
        </div>
      )}
      {n ? (
        <iframe ref={fr} title="學生通知單" srcDoc={doc} onLoad={fit} className="block w-full rounded-2xl border-0 bg-bg" style={{ height: 480 }} />
      ) : (
        <p className="py-16 text-center text-mute">還沒有學生</p>
      )}
      <iframe ref={chk} title="量通知單" aria-hidden srcDoc={allDoc} onLoad={measure} tabIndex={-1} style={{ position: "absolute", left: -9999, top: 0, width: 900, height: 600, visibility: "hidden" }} />
    </div>
  );
}

/* ---------- 編輯區（舊版 edStu、edExam、edData） ---------- */
function useNoticeEdit() {
  const { N, setN, canEdit } = useExam();
  return (fn: (n: NoticeData) => void | false) => {
    if (!canEdit) return;
    const n = clone(N || normalize(defaultData()));
    if (fn(n) === false) return;
    setN(n);
  };
}
/** 寫一個欄位：keep＝留白也存（舊版 setKeep）；否則留白就刪掉（setPath） */
function setAt(o: Record<string, unknown>, path: (string | number)[], v: unknown, keep: boolean) {
  let x = o as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    if (x[path[i]] == null) x[path[i]] = {};
    x = x[path[i]] as Record<string, unknown>;
  }
  const k = path[path.length - 1];
  if (!keep && (v === "" || v === false)) delete x[k];
  else x[k] = v;
}
function TI({ v, ph, on, cls, w, list }: { v: string; ph?: string; on: (v: string) => void; cls?: string; w?: number; list?: string }) {
  const { canEdit } = useExam();
  return (
    <input
      type="text"
      list={list}
      className={cx("min-h-9 w-full rounded-lg border border-line2 bg-field px-2 text-sm", cls)}
      style={w ? { width: w } : undefined}
      defaultValue={v}
      key={v}
      placeholder={ph}
      disabled={!canEdit}
      onBlur={(e) => e.target.value !== v && on(e.target.value)}
    />
  );
}
const tm = (v: string) => v.replace("：", ":").trim();

function StuEd({ N, cur, setCur }: { N: NoticeData; cur: number; setCur: (n: number) => void }) {
  const ed = useNoticeEdit();
  const [paste, setPaste] = useState(false);
  const s = N.students[cur];
  const i = cur;
  return (
    <div>
      <h3 className="mb-2 text-[15px] font-bold">學生名單（{N.students.length} 人）</h3>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {N.students.map((x, k) => (
          <button key={k} type="button" onClick={() => setCur(k)} title={x.pid ? "來自排考場" : undefined} className={cx("inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-[13px]", k === cur ? "border-ink bg-ink text-on-ink" : "border-line2 bg-card text-ink2")}>
            {x.pid && <Link2 size={12} />}
            {stuId(x) || "（未命名）"}
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => {
            ed((n) => void n.students.push({ cls: "", seat: "", name: "", a: {}, c: {}, pm: {}, notes: null }));
            setCur(N.students.length);
          }}>
          新增
        </Button>
        <Button size="sm" onClick={() => setPaste(true)}>
          貼上名單
        </Button>
        <Button
          size="sm"
          onClick={() =>
            ed((n) => {
              const me = n.students[cur];
              n.students.sort((x, y) => String(x.cls).localeCompare(String(y.cls), "zh-Hant", { numeric: true }) || String(x.seat).localeCompare(String(y.seat), "zh-Hant", { numeric: true }));
              setCur(Math.max(0, n.students.indexOf(me)));
            })
          }
        >
          依班級排序
        </Button>
      </div>
      {s && (
        <>
          <h3 className="mt-4 mb-2 text-[15px] font-bold">這位學生</h3>
          <div className="flex gap-2">
            {(
              [
                ["cls", "班級", 0.8],
                ["seat", "座號", 0.6],
                ["name", "姓名", 1.4],
              ] as const
            ).map(([k, t, f]) => (
              <label key={k} className="text-[13px] text-mute" style={{ flex: f }}>
                {t}
                <TI v={s[k]} on={(v) => ed((n) => void (n.students[i][k] = v))} />
              </label>
            ))}
          </div>
          {s.pid && <p className="mt-2 rounded-[10px] bg-ok-l px-3 py-1.5 text-[13px] text-ok">灰字是排考場帶來的，會自動更新；填了會蓋過</p>}
          {N.days.map((dy, d) => (
            <div key={d}>
              <div className="mt-3 mb-1 text-sm font-bold">
                {dy.date}（{dy.dow}）
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-mute">
                    <th></th>
                    <th>考試地點</th>
                    <th>灰底</th>
                    <th>開始</th>
                    <th>結束</th>
                    <th>科目改為</th>
                  </tr>
                </thead>
                <tbody>
                  {N.periods.map((p, pi) => {
                    if (pi >= N.amCount && dy.pmMerge) return null;
                    const std = p.d[d],
                      k = d + "-" + pi,
                      c = s.c[k] || {},
                      a = s.a[k] || {};
                    const set = (f: string, v: unknown, keep = false) => ed((n) => setAt(n.students[i] as unknown as Record<string, unknown>, ["c", k, f], v, keep));
                    return (
                      <tr key={pi} className={cx(pi === N.amCount && "border-t border-dashed border-line2")}>
                        <td className="w-6 text-center font-bold text-mute">{p.n}</td>
                        <td>
                          <TI v={c.loc || ""} ph={a.loc || (std.subj || std.s ? N.defLoc : "")} list="nt-rooms" on={(v) => set("loc", v.trim())} />
                        </td>
                        <td className="text-center">
                          <input type="checkbox" aria-label="灰底" checked={!!(c.shade != null ? c.shade : a.shade)} onChange={(e) => set("shade", e.target.checked, true)} />
                        </td>
                        <td>
                          <TI w={62} v={c.s || ""} ph={a.s || std.s} on={(v) => set("s", tm(v))} />
                        </td>
                        <td>
                          <TI w={62} v={c.e || ""} ph={a.e || std.e} on={(v) => set("e", tm(v))} />
                        </td>
                        <td>
                          <TI v={c.subj || ""} ph={a.subj || std.subj} on={(v) => set("subj", v.trim())} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {dy.pmMerge && (
                <label className="mt-1.5 block text-[13px] text-mute">
                  下午合併格文字（留白＝「{dy.pmText}」，填 - ＝空白）
                  <TI v={s.pm[d] || ""} ph={dy.pmText} on={(v) => ed((n) => setAt(n.students[i] as unknown as Record<string, unknown>, ["pm", d], v.trim(), false))} />
                </label>
              )}
            </div>
          ))}
          <datalist id="nt-rooms">
            {N.rooms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <h3 className="mt-4 mb-1.5 text-[15px] font-bold">注意事項</h3>
          <Textarea rows={5} className="w-full text-sm" defaultValue={s.notes != null ? s.notes : N.notes} key={cur + "|" + (s.notes ?? N.notes)} onBlur={(e) => e.target.value !== (s.notes != null ? s.notes : N.notes) && ed((n) => void (n.students[i].notes = e.target.value))} />
          <p className="text-xs text-mute">一行一項；__底線__ [[外框]] ==灰底==</p>
          {s.notes != null && (
            <button type="button" className="text-sm text-blue" onClick={() => ed((n) => void (n.students[i].notes = null))}>
              改回共同注意事項
            </button>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                ed((n) => {
                  const x = clone(n.students[i]);
                  x.name += "（複製）";
                  delete x.pid;
                  delete x.plName;
                  x.c = Object.assign({}, x.a, x.c);
                  x.a = {};
                  n.students.splice(i + 1, 0, x);
                  setCur(i + 1);
                })
              }
            >
              複製這位
            </Button>
            <Button size="sm" tone="danger" onClick={() => confirm("確定刪除 " + stuId(s) + "？") && ed((n) => void n.students.splice(i, 1))}>
              刪除
            </Button>
          </div>
        </>
      )}
      {paste && <PasteNotice onClose={() => setPaste(false)} />}
    </div>
  );
}

function PasteNotice({ onClose }: { onClose: () => void }) {
  const ed = useNoticeEdit();
  const [t, setT] = useState("");
  return (
    <Dialog
      title="貼上名單"
      onClose={onClose}
      foot={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            tone="primary"
            onClick={() => {
              let a = 0,
                u = 0;
              ed((D) => {
                t.split("\n").forEach((l) => {
                  l = l.trim();
                  if (!l) return;
                  const m = l.match(/^(\d{3,4})\s*[-－\s,\t]\s*(\d{1,2})\s*[,\t\s]*\s*(.+)$/) || l.match(/^(\d{3,4})()\s*(.+)$/);
                  const old = m && m[2] && D.students.find((x) => String(x.cls) === m[1] && x.seat && +x.seat === +m[2]);
                  if (old) {
                    old.name = m![3].trim();
                    u++;
                    return;
                  } // 班級座號已存在：只補上姓名
                  D.students.push(m ? { cls: m[1], seat: m[2] ? m[2].padStart(2, "0") : "", name: m[3].trim(), a: {}, c: {}, pm: {}, notes: null } : { cls: "", seat: "", name: l, a: {}, c: {}, pm: {}, notes: null });
                  a++;
                });
                if (!a && !u) return false;
              });
              if (a || u) toast((a ? "已加入 " + a + " 位　" : "") + (u ? "已補上 " + u + " 位的姓名" : ""));
              onClose();
            }}
          >
            加入
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm text-mute">一行一位，例：903-15 楊明杰；已有的班級座號只會補上姓名</p>
      <Textarea rows={10} className="w-full" value={t} onChange={(e) => setT(e.target.value)} />
    </Dialog>
  );
}

function ExamEd({ N }: { N: NoticeData }) {
  const ed = useNoticeEdit();
  const { canEdit } = useExam();
  const fileRef = useRef<HTMLInputElement>(null);
  const H = N.head;
  const head = (k: keyof NoticeData["head"], t: string, ph?: string) => (
    <label className="mb-2 block text-[13px] text-mute">
      {t}
      <TI v={String(H[k] ?? "")} ph={ph} on={(v) => ed((n) => void ((n.head as Record<string, unknown>)[k] = v))} />
    </label>
  );
  return (
    <div>
      <h3 className="mb-2 text-[15px] font-bold">標題與文字</h3>
      {head("line1", "標題第一行")}
      {head("line2", "標題第二行")}
      <div className="flex gap-2">
        <div className="flex-1">{head("label", "左上角方框（留白＝不顯示）")}</div>
        <label className="mb-2 block flex-1 text-[13px] text-mute">
          沒填地點時顯示
          <TI v={N.defLoc} on={(v) => ed((n) => void (n.defLoc = v))} />
        </label>
      </div>
      {head("teachers", "學習中心導師", "王小明老師、陳小華老師")}
      <h3 className="mt-4 mb-2 text-[15px] font-bold">印章</h3>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={H.stampOn} disabled={!canEdit} onChange={(e) => ed((n) => void (n.head.stampOn = e.target.checked))} /> 顯示印章
        </label>
        <Button size="sm" disabled={!canEdit} onClick={() => fileRef.current?.click()}>
          換印章
        </Button>
        {H.stamp && (
          <Button size="sm" disabled={!canEdit} onClick={() => ed((n) => void (n.head.stamp = ""))}>
            改回原本的
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 600 * 1024) return toast("圖檔太大，請用 600KB 以下的圖");
            const r = new FileReader();
            r.onload = () => ed((n) => void ((n.head.stamp = String(r.result)), (n.head.stampOn = true)));
            r.readAsDataURL(f);
          }}
        />
      </div>
      <h3 className="mt-4 mb-2 text-[15px] font-bold">日期</h3>
      {N.days.map((dy, d) => (
        <div key={d} className="mb-2">
          <div className="flex gap-2">
            <label className="flex-1 text-[13px] text-mute">
              第 {d + 1} 天日期
              <TI v={dy.date} ph="10月14日" on={(v) => ed((n) => void (n.days[d].date = v))} />
            </label>
            <label className="w-20 text-[13px] text-mute">
              星期
              <TI v={dy.dow} ph="三" on={(v) => ed((n) => void (n.days[d].dow = v))} />
            </label>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
              <input type="checkbox" checked={dy.pmMerge} disabled={!canEdit} onChange={(e) => ed((n) => void (n.days[d].pmMerge = e.target.checked))} /> 下午合併成一格
            </label>
            {dy.pmMerge && <TI v={dy.pmText} ph="例：服務學習(回原班)" on={(v) => ed((n) => void (n.days[d].pmText = v))} />}
          </div>
        </div>
      ))}
      <h3 className="mt-4 mb-2 text-[15px] font-bold">節次、時間與科目</h3>
      {N.days.map((dy, d) => (
        <div key={d}>
          <div className="mt-2 mb-1 text-sm font-bold">
            {dy.date}（{dy.dow}）
          </div>
          <table className="w-full text-sm">
            <tbody>
              {N.periods.map((p, pi) => (
                <tr key={pi} className={cx(pi === N.amCount && "border-t border-dashed border-line2")}>
                  <td className="w-6 text-center font-bold text-mute">{p.n}</td>
                  <td>
                    <TI w={62} v={p.d[d].s} on={(v) => ed((n) => void (n.periods[pi].d[d].s = tm(v)))} />
                  </td>
                  <td>
                    <TI w={62} v={p.d[d].e} on={(v) => ed((n) => void (n.periods[pi].d[d].e = tm(v)))} />
                  </td>
                  <td>
                    <TI v={p.d[d].subj} on={(v) => ed((n) => void (n.periods[pi].d[d].subj = v))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <h3 className="mt-4 mb-1.5 text-[15px] font-bold">共同注意事項</h3>
      <Textarea rows={4} className="w-full text-sm" defaultValue={N.notes} key={N.notes} disabled={!canEdit} onBlur={(e) => e.target.value !== N.notes && ed((n) => void (n.notes = e.target.value))} />
      <h3 className="mt-4 mb-1.5 text-[15px] font-bold">常用地點</h3>
      <Textarea
        rows={5}
        className="w-full text-sm"
        defaultValue={N.rooms.join("\n")}
        key={N.rooms.join("|")}
        disabled={!canEdit}
        onBlur={(e) =>
          ed((n) => {
            n.rooms = e.target.value
              .split("\n")
              .map((x) => x.trim())
              .filter((x) => x);
          })
        }
      />
    </div>
  );
}

function DataEd({ N, onReset }: { N: NoticeData; onReset: () => void }) {
  const ed = useNoticeEdit();
  const { E } = useExam();
  const n = N.students.filter((s) => s.pid).length;
  return (
    <div>
      <h3 className="mb-2 text-[15px] font-bold">自動帶入</h3>
      <p className="rounded-[10px] bg-ok-l px-3 py-1.5 text-[13px] text-ok">日期、考科、時間、地點從排考場自動帶入{n ? "（" + n + " 位）" : ""}</p>
      <p className="mt-1.5 text-[13px] text-mute">補的全名、注意事項、手動改的格子會保留。</p>
      <h3 className="mt-4 mb-2 text-[15px] font-bold">整理</h3>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => confirm("清掉手動改過的地點、時間、科目？姓名與注意事項會保留。") && ed((d) => void d.students.forEach((x) => x.pid && ((x.c = {}), (x.pm = {}))))}>
          清掉手動修改
        </Button>
        <Button
          size="sm"
          tone="danger"
          onClick={() => {
            if (!confirm("確定通知單全部重來？補過的全名、注意事項與手動修改都會被清掉。")) return;
            ed((d) => {
              const f = normalize(defaultData());
              Object.keys(d).forEach((k) => delete (d as unknown as Record<string, unknown>)[k]);
              Object.assign(d, f);
              syncNotice(d, clone(E), 0);
            });
            onReset();
          }}
        >
          全部重來
        </Button>
      </div>
    </div>
  );
}

"use client";
/* 查考場（管理者）：全部學生、含服務與備註；「查考場連結」給導師（班級專用、姓名遮一字）與行政（全校），不用登入。 */
import { AlertTriangle, Link2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { copyText } from "@/components/admin/common";
import { Dialog } from "@/components/sched/common";
import { failText, toast } from "@/components/Toast";
import { Button, Empty, Input, Note, Select } from "@/components/ui";
import { firebase } from "@/lib/firebase";
import { EID } from "@/lib/nx/examData";
import { findRowsAll, viewClasses, viewExpTxt } from "@/lib/nx/examOut";
import { pushViews, regOf, rndKey, viewUrl, withClassKeys } from "@/lib/nx/examView";
import { revKey } from "@/lib/repo";
import { FindView } from "./FindView";
import { useExam } from "./useExam";

export function FindStep() {
  const { X, E } = useExam();
  const [link, setLink] = useState(false);
  const all = useMemo(() => findRowsAll(X), [X]);
  return (
    <>
      <FindView
        all={all}
        title={E.title}
        VR={null}
        extra={
          <Button onClick={() => setLink(true)}>
            <Link2 size={16} />
            查考場連結
          </Button>
        }
        empty={
          <Empty
            action={
              <Link href="/admin/exam/" className="inline-flex min-h-10 items-center rounded-full border border-line2 bg-card px-4 hover:bg-hover">
                去排考場
              </Link>
            }
          >
            還沒有排考場
          </Empty>
        }
      />
      {link && <LinkDialog onClose={() => setLink(false)} />}
    </>
  );
}

function LinkDialog({ onClose }: { onClose: () => void }) {
  const { R, revs, repo, x } = useAdmin();
  const { X, E, canEdit } = useExam();
  const reg = regOf(R.examPrivate[EID + "/view"]);
  const rev = revs[revKey("examPrivate", EID + "/view")]?.rev || 0;
  const [cls, setCls] = useState(() => viewClasses(E)[0] || "");
  const [busy, setBusy] = useState(false);
  const fb = repo.kind === "firestore" ? firebase() : null;
  const admin = x.admin?.role === "admin" || x.admin?.role === "editor";
  const key = cls ? reg.vcls[cls] || "" : reg.link;
  const missing = viewClasses(E).filter((c) => !reg.vcls[c]);
  const run = async (next: { link: string; vcls: Record<string, string> }, old: string[], msg: string) => {
    if (!fb) return;
    setBusy(true);
    try {
      const r = await pushViews(fb.db, repo.scope, X, next, rev, old);
      toast(msg);
      if (r.left) toast("有 " + r.left + " 份舊的查考場資料沒刪掉；舊連結已經打不開了");
    } catch (e) {
      toast(failText(e));
    } finally {
      setBusy(false);
    }
  };
  const oldKeys = () => (reg.link ? [reg.link, ...Object.values(reg.vcls)] : []);
  return (
    <Dialog title="查考場連結" onClose={onClose}>
      {!fb ? (
        <p className="text-mute">登入雲端後才能開連結</p>
      ) : !reg.link ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-mute">不用登入就能查考場；班級連結只有那一班、姓名遮一字</p>
          <Button tone="primary" disabled={!canEdit || !admin || busy} onClick={() => run(withClassKeys({ link: rndKey(), vcls: {} }, X), [], "連結已開啟")}>
            開啟查考場連結
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Select aria-label="連結範圍" value={cls} onChange={(e) => setCls(e.target.value)}>
              {viewClasses(E).map((c) => (
                <option key={c} value={c} disabled={!reg.vcls[c]}>
                  {c} 班專用{reg.vcls[c] ? "" : "（還沒產生）"}
                </option>
              ))}
              <option value="">全校（只給特教組／行政）</option>
            </Select>
            <Input readOnly aria-label="連結" className="min-w-40 flex-1 text-sm" value={key ? viewUrl(key) : ""} onFocus={(e) => e.target.select()} />
            <Button tone="primary" disabled={!key} onClick={() => copyText(viewUrl(key))}>
              複製
            </Button>
          </div>
          {!cls && (
            <Note tone="bad">
              <AlertTriangle size={14} className="inline" /> 全校連結有全部學生的全名，只給特教組或行政，<b>不要傳給導師或貼到群組</b>。
            </Note>
          )}
          <p className="text-sm text-mute">只能查考場，{viewExpTxt(E)} 後失效</p>
          {missing.length > 0 && (
            <Button disabled={!canEdit || busy} onClick={() => run(withClassKeys(reg, X), [], "已產生 " + missing.length + " 班的連結")}>
              產生 {missing.length} 班的連結
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canEdit || busy}
              onClick={() => confirm("換新連結後，舊連結（全校和每一班的）馬上失效，已經拿到舊連結的人要重新給。確定嗎？") && run(withClassKeys({ link: rndKey(), vcls: {} }, X), oldKeys(), "連結已換新")}
            >
              換新連結
            </Button>
            <Button tone="danger" disabled={!canEdit || busy} onClick={() => confirm("關閉後，拿到連結的人就看不到了。確定嗎？") && run({ link: "", vcls: {} }, oldKeys(), "連結已關閉")}>
              關閉連結
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

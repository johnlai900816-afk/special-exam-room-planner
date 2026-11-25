"use client";
/* 我的不排課時段。存到哪裡看資料來源與角色：
   - 雲端・管理者：直接改 rc/main（交易；舊版畫面會即時跟著變）
   - 雲端・老師：寫 teacherOff/{teacherId}，等管理者套用（要部署新規則；目標模型改成直接改 teachers/{id}.off）
   - 單機：寫回這台瀏覽器的 resource-class-v1（和舊版同一份）
   - 備份檔、範例資料：只在畫面上，不存檔 */
import { Check, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { OffEditor } from "@/components/OffEditor";
import { TeacherGate, TeacherPicker } from "@/components/TeacherGate";
import { Button, Card, Note, PageHeader } from "@/components/ui";
import { submitTeacherOff, updateMain, watchTeacherOff, type TeacherOffDoc } from "@/lib/cloud";
import { saveLocalMain } from "@/lib/local";
import { useSession } from "@/lib/session";
import type { Period, SlotKey, Teacher } from "@/lib/types";

function Editor({ me, periods }: { me: Teacher; periods: Period[] }) {
  const s = useSession();
  const [off, setOff] = useState<SlotKey[]>(me.off);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "warn"; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [req, setReq] = useState<TeacherOffDoc | null>(null);
  const cloudTeacher = s.source.kind === "cloud" && s.realRole !== "admin";

  useEffect(() => {
    if (!cloudTeacher) return;
    return watchTeacherOff(me.id, setReq);
  }, [cloudTeacher, me.id]);

  const dirty = [...off].sort().join() !== [...me.off].sort().join();
  const memoryOnly = s.source.kind === "file" || s.source.kind === "demo";

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (s.source.kind === "cloud" && s.realRole === "admin") {
        await updateMain(s.user!.email, (D) => {
          const t = D.teachers.find((x) => x.id === me.id);
          if (!t) throw new Error("名冊裡找不到這位老師");
          t.off = off;
        });
        setMsg({ tone: "ok", t: "已存到雲端，舊版畫面也會跟著更新。" });
      } else if (cloudTeacher) {
        await submitTeacherOff(me.id, off, s.user!.email);
        setMsg({ tone: "ok", t: "已送出，組長套用後就會進排課。" });
      } else if (s.source.kind === "local" && s.D) {
        const D = structuredClone(s.D);
        const t = D.teachers.find((x) => x.id === me.id);
        if (t) t.off = off;
        saveLocalMain(D);
        s.loadDefault();
        setMsg({ tone: "ok", t: "已存在這台電腦，舊版下次打開就會看到。" });
      }
    } catch (e) {
      const c = (e as { code?: string }).code || "";
      setMsg({
        tone: "bad",
        t: /permission/.test(c) ? "雲端規則還沒開放老師自己填，請先把時段告訴組長（新規則部署後就可以了）。" : "存檔失敗：" + (c || (e as Error).message),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="我的不排課時段"
        lead={me.name + "・點格子切換「可排／不排」，共 " + off.length + " 節不排"}
        actions={<TeacherPicker />}
      />
      <Card>
        <OffEditor periods={periods} value={off} onChange={setOff} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button tone="primary" disabled={!dirty || busy || memoryOnly} onClick={save}>
            <Save size={16} />
            {cloudTeacher ? "送出給組長" : "儲存"}
          </Button>
          <Button tone="ghost" disabled={!dirty || busy} onClick={() => setOff(me.off)}>
            <RotateCcw size={16} />
            還原
          </Button>
          {req && (
            <span className="flex items-center gap-1 text-md text-ink2">
              {req.status === "applied" ? <Check size={16} className="text-ok" /> : null}
              上次送出：{req.off.length} 節，{req.status === "applied" ? "組長已套用" : "等組長套用"}
            </span>
          )}
        </div>
        {memoryOnly && (
          <div className="mt-3">
            <Note>現在看的是「{s.source.label}」，改了不會存檔。</Note>
          </div>
        )}
        {msg && (
          <div className="mt-3">
            <Note tone={msg.tone}>{msg.t}</Note>
          </div>
        )}
      </Card>
    </>
  );
}

export default function OffPage() {
  return (
    <AppShell allow={["teacher", "admin"]} title="不排課時段">
      <TeacherGate>{(me, board) => <Editor key={me.id + "|" + me.off.join()} me={me} periods={board.M.P} />}</TeacherGate>
    </AppShell>
  );
}

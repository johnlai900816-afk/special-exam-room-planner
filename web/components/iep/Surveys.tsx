"use client";
/* 調查（舊版 iep.js vSurvey）：選調查／建立調查／刪除，一次調查一頁（RoundPage）。老師端（我的 IEP）與管理者端（IEP 會議）共用：
   老師只看自己開的（IEP.ownRounds(D, tid)），管理者全部（tid=''）。
   打開時把填空堂的回覆讀回調查單（比上次新的才收）；「建立並產生 QR」＝存好、讀回來之後再發布（nxIepPublish 要檢查 readers；管理者／編輯也可以）。 */
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { failText, toast } from "@/components/Toast";
import { Button, Select } from "@/components/ui";
import { IEP, type Round } from "@/lib/iep";
import { closeOnline, publish } from "@/lib/nx/iepOnline";
import { mergeInvites } from "@/lib/nx/iepSync";
import { toCoreD } from "@/lib/repo";
import { Create } from "./Create";
import { RoundPage } from "./RoundPage";
import { useIep, useIepSource } from "./useIep";

/** 選調查（管理者另外標出承辦） */
function Picker({ rounds, cur, onPick, onNew, onDel, admin }: { rounds: Round[]; cur: Round | null; onPick(id: string): void; onNew(): void; onDel(): void; admin: boolean }) {
  const { D } = useIepSource();
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      {rounds.length > 0 && (
        <Select aria-label="選調查" value={cur?.id || ""} onChange={(e) => onPick(e.target.value)}>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {(r.name || "未命名的調查") + (admin ? "（" + (IEP.hostLabel(D, r) || "特教組") + "）" : "")}
            </option>
          ))}
        </Select>
      )}
      <Button onClick={onNew}>建立調查</Button>
      {cur && (
        <Button tone="danger" onClick={onDel}>
          <Trash2 size={15} />
          刪除
        </Button>
      )}
    </div>
  );
}

export function Surveys({ pick, setPick, jump }: { pick: string; setPick(id: string): void; jump?: string }) {
  const x = useIepSource();
  const io = useIep();
  const [creating, setCreating] = useState(false);
  const pending = useRef("");
  const [tick, setTick] = useState(0);
  const D = x.D;
  const rounds = IEP.ownRounds(D, x.tid, 0);
  const cur = rounds.find((r) => r.id === pick) || rounds[rounds.length - 1] || null;
  const online = x.online && !io.ro;

  // 填空堂的回覆讀回調查單（比上次新的才收）
  const merging = useRef(false);
  useEffect(() => {
    if (io.ro || merging.current) return;
    const inv = x.data.records.iepInvite;
    const D2 = toCoreD(x.data.records);
    const todo = IEP.ownRounds(D2, x.tid).filter((R) => mergeInvites(D2, R, inv) > 0);
    if (!todo.length) return;
    merging.current = true;
    (async () => {
      for (const R of todo) await io.save(D2, R);
    })().finally(() => (merging.current = false));
  }, [x.data, x.tid, io]);

  // 「建立並產生 QR」：調查單存好、讀回來之後才發布
  useEffect(() => {
    const rid = pending.current;
    if (!rid || !x.data.records.iep[rid]) return;
    pending.current = "";
    io.edit(rid, async (d, r) => {
      if (!r.slots.length || !r.meets.length) return false;
      if (IEP.expMs(r) < Date.now()) {
        toast("回覆期限已過，請先改期限");
        return false;
      }
      const n = await publish(x.scope, d, r);
      toast("已發布 " + n + " 份");
    }).catch((e) => toast(failText(e)));
  }, [x.data, x.scope, io, tick]);

  const delRound = async () => {
    if (!cur || !confirm("刪除「" + (cur.name || "這次調查") + "」？出席名單和回覆都會刪掉。")) return;
    if ((cur.pub || []).length && !x.demo) {
      try {
        await closeOnline(x.scope, cur);
      } catch (e) {
        if (!confirm("線上連結沒有關掉（" + failText(e) + "），連結會到期限才失效。仍要刪除嗎？")) return;
      }
    }
    if (await io.remove(cur.id)) {
      setPick("");
      toast("已刪除");
    }
  };

  if (creating || !cur)
    return (
      <Create
        online={online}
        canCancel={!!cur}
        onCancel={() => setCreating(false)}
        onCreated={(R, cut) => {
          setPick(R.id);
          setCreating(false);
          if (!R.slots.length) toast("沒有可以問的時段，請調整日期或節次");
          else {
            if (cut) toast("已排除有課的 " + cut + " 節");
            if (online) {
              pending.current = R.id;
              setTick(tick + 1);
            }
          }
        }}
      />
    );
  return (
    <>
      <Picker rounds={rounds} cur={cur} onPick={setPick} onNew={() => setCreating(true)} onDel={delRound} admin={x.admin} />
      <RoundPage key={cur.id} R={cur} D={D} jump={jump} />
    </>
  );
}

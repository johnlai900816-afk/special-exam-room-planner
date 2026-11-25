/* 我的 IEP：舊格式的調查單（iep.js 的 round）⇄ 新位置的文件。
     iep/{roundId}                     {ord, name, due, stuIds, readers, json}   readers＝發起人＋學生的個管（nx-split.iepReaders）
     iepInvite/{roundId}_{teacherId}   被邀請的老師的填空堂單（公開欄位＋老師自己的回覆）
   老師只能替自己個管的學生開調查（iep.js addMeetAs）；別人開的調查邀請了我，我在「填空堂」回覆，
   發起人打開「我的 IEP」時把回覆讀回調查單（iep.js applyWeb，和線上連結的回覆同一套）。純函式。 */
import { IEP, type Busy, type Round } from "../iep";
import { NX } from "../legacy";
import type { IepInviteDoc, IepRoundDoc } from "../model";
import type { RcData } from "../types";

const NXI = NX as unknown as { iepReaders(R: Round, stuById: Map<string, { caseMgr?: string }>): { stuIds: string[]; readers: string[] } };

/** 舊格式的調查單 → iep/{id} 文件。prev＝現在的文件（readers 只加不減：別位個管的學生這位老師讀不到，不能把人拿掉） */
export function roundDoc(D: RcData, R: Round, ord: number, prev?: IepRoundDoc | null): IepRoundDoc {
  const byId = new Map(D.students.map((s) => [String(s.id), s]));
  const { stuIds, readers } = NXI.iepReaders(R, byId);
  const all = [...new Set([...(prev?.readers || []), ...readers])].sort();
  return { ord: prev ? prev.ord : ord, name: String(R.name || ""), due: String(R.due || ""), stuIds, readers: all, json: JSON.stringify(R) };
}

/** 新調查單的 ord：比讀得到的都大 */
export function nextOrd(iep: Record<string, IepRoundDoc>): number {
  return Object.values(iep).reduce((m, d) => Math.max(m, (d.ord ?? 0) + 1), 0);
}

export const inviteId = (roundId: string, teacherId: string) => roundId + "_" + teacherId;

/** 這份調查單要發給哪些老師、內容是什麼（只有名冊上的老師 t:…）。readers＝調查單文件的 readers。
    直接開會（quick）沒有要填的空堂（keys 空的），只告訴出席老師排定的場次 */
export function inviteDocs(D: RcData, R: Round, readers: string[], busy?: Busy): Record<string, IepInviteDoc> {
  const out: Record<string, IepInviteDoc> = {};
  if (!R.slots.length) return out;
  const quick = !!R.quick;
  IEP.consolidate(D, R, { busy }).forEach((o) => {
    if (!o.k.startsWith("t:") || !o.keys.length) return;
    if (quick && !o.meets.some((x) => x.m.at)) return;
    const tid = o.k.slice(2);
    const p = IEP.publicDoc(D, R, o, busy);
    const meets = o.meets
      .filter((x) => x.m.at)
      .map((x) => {
        const f = IEP.slotInfo(D, x.m.at!);
        return { id: x.m.id, at: x.m.at!, label: f.label, time: f.time, room: x.m.room || "", stu: IEP.stuShow(x.s, R.priv === "mask" ? "mask" : "cls"), req: x.req ? 1 : 0 };
      });
    out[inviteId(R.id, tid)] = {
      roundId: R.id,
      teacherId: tid,
      readers: [...readers],
      name: p.name,
      round: p.round,
      kind: p.kind,
      host: p.host,
      d1: p.d1,
      d2: p.d2,
      due: p.due,
      keys: quick ? [] : p.keys,
      ps: quick ? [] : p.ps,
      busy: quick ? {} : p.busy,
      stu: p.stu,
      meets,
    };
  });
  return out;
}

/** 發起人要寫的邀請：新增／內容變了的（保留對方的回覆欄位），和要刪掉的（不再被邀請） */
export function inviteWrites(want: Record<string, IepInviteDoc>, have: Record<string, IepInviteDoc>, roundId: string) {
  const ANS = ["free", "note", "ansAt"];
  const pub = (d: IepInviteDoc) => NX.canon(Object.fromEntries(Object.entries(d).filter(([k]) => !ANS.includes(k))));
  const set: { id: string; data: IepInviteDoc; isNew: boolean }[] = [];
  Object.entries(want).forEach(([id, d]) => {
    const h = have[id];
    if (!h) set.push({ id, data: d, isNew: true });
    else if (pub(h) !== pub(d)) {
      const keep: Partial<IepInviteDoc> = {};
      ANS.forEach((k) => {
        const v = (h as unknown as Record<string, unknown>)[k];
        if (v !== undefined) (keep as Record<string, unknown>)[k] = v;
      });
      set.push({ id, data: { ...d, ...keep }, isNew: false });
    }
  });
  const del = Object.keys(have).filter((id) => have[id].roundId === roundId && !want[id]);
  return { set, del };
}

/** 把填空堂的回覆讀回調查單（比上次新的才收）。回傳收了幾份 */
export function mergeInvites(D: RcData, R: Round, invites: Record<string, IepInviteDoc>): number {
  const ppl = new Map(IEP.consolidate(D, R, { all: true }).map((o) => [o.k, o]));
  let n = 0;
  Object.values(invites).forEach((v) => {
    if (v.roundId !== R.id || !v.ansAt || !Array.isArray(v.free)) return;
    const o = ppl.get("t:" + v.teacherId);
    if (o && IEP.applyWeb(R, o, { free: v.free, note: v.note || "", at: v.ansAt })) n++;
  });
  return n;
}

/** 我還沒填、期限還沒過的邀請 */
export function owedInvites(invites: Record<string, IepInviteDoc>, tid: string, today: string): IepInviteDoc[] {
  return Object.values(invites)
    .filter((v) => v.teacherId === tid && !v.ansAt && v.keys.length && (!v.due || v.due >= today))
    .sort((a, b) => String(a.due || "~").localeCompare(String(b.due || "~")));
}

/** 我開的調查：必要的人都回了、還有沒排的場次 */
export function readyRounds(D: RcData, tid: string): Round[] {
  return IEP.ownRounds(D, tid, 0).filter((R) => {
    const p = IEP.progress(D, R);
    return R.meets.length > 0 && p.ready === p.meets.length && R.meets.some((m) => !m.at);
  });
}

export interface Upcoming {
  key: string;
  at: string;
  label: string;
  time: string;
  stu: string;
  room: string;
  kind: string;
}

/** 要開的會：我讀得到的調查單裡我是出席者的（teacher.js iepUpcoming）＋別人邀請我、已排定的（iepInvite.meets） */
export function upcomingMeets(D: RcData, invites: Record<string, IepInviteDoc>, tid: string, today: string): Upcoming[] {
  const pk = "t:" + tid;
  const out = new Map<string, Upcoming>();
  IEP.ensure(D).rounds.forEach((R) =>
    R.meets.forEach((m) => {
      if (!m.at || m.at.slice(0, 10) < today || !m.p.some((x) => x[0] === pk)) return;
      const f = IEP.slotInfo(D, m.at);
      out.set(R.id + "/" + m.id, { key: R.id + "/" + m.id, at: m.at, label: f.label, time: f.time, stu: IEP.stuShow(IEP.stuOf(D, m.s), "cls"), room: m.room || "", kind: R.kind || "IEP" });
    }),
  );
  Object.values(invites).forEach((v) => {
    if (v.teacherId !== tid) return;
    (v.meets || []).forEach((m) => {
      const k = v.roundId + "/" + m.id;
      if (m.at.slice(0, 10) < today || out.has(k)) return;
      out.set(k, { key: k, at: m.at, label: m.label, time: m.time, stu: m.stu, room: m.room, kind: v.kind || "IEP" });
    });
  });
  return [...out.values()].sort((a, b) => a.at.localeCompare(b.at));
}

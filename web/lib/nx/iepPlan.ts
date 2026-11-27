/* IEP 會議排時間的「問題」與「一鍵建議」（調查的 ② 排定、直接開會）。邏輯都用 iep.js 已有的 rank／schedule／busyOf／conflicts，
   這裡只把結果整理成：問題清單、要改哪幾場（先給人看，勾選才套用）、直接開會的建議時段、送給 AI 的去識別化題目。
   busy 是 iep.js busyOf 的結果：每個人每個時段已知的忙碌（資源班課、原班課、已登記不排課、已排的別場 IEP）。 */
import type { AiReq } from "../ai";
import { IEP, type Busy, type Meet, type Round } from "../iep";
import type { RcData } from "../types";

export interface PlanProb {
  lvl: "err" | "warn";
  text: string;
  id?: string;
}
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const stuOfM = (D: RcData, m: Meet) => IEP.stuLabel(IEP.stuOf(D, m.s));

/** ② 排定的問題：同一位必要出席的人同時兩場、地點重疊、和別的調查撞到、排的時間必要的人不能來、時間不在候選時段、還沒排 */
export function planProblems(D: RcData, R: Round, busy: Busy): PlanProb[] {
  const out: PlanProb[] = [];
  IEP.conflicts(D, R).forEach((c) => out.push({ lvl: "err", text: c.m, id: (c as { a?: string }).a }));
  IEP.crossConflicts(D, R).forEach((c) => out.push({ lvl: "err", text: c.m, id: (c as { a?: string }).a }));
  R.meets.forEach((m) => {
    if (!m.at) {
      out.push({ lvl: "warn", text: stuOfM(D, m) + " 還沒排", id: m.id });
      return;
    }
    const rk = IEP.rank(D, R, m, busy).find((r) => r.k === m.at);
    const lab = IEP.slotInfo(D, m.at).label;
    if (!rk) out.push({ lvl: "warn", text: stuOfM(D, m) + "：" + lab + " 不在這次的候選時段裡", id: m.id });
    else if (!rk.ok) out.push({ lvl: "err", text: stuOfM(D, m) + "：" + lab + " " + rk.bad.join("、") + " 不能來", id: m.id });
  });
  return out;
}

export interface PlanChange {
  id: string;
  stu: string;
  from: string;
  to: string;
  room: string;
  fromLabel: string;
  toLabel: string;
  pinned: boolean;
}
/** 一鍵建議（② 排定）：有問題的場次即使固定了也放開，連同還沒排的一起用 iep.js schedule 重排；
   沒問題又固定的不動。回傳要改的場次（還沒套用）與排不進去的原因 */
export function planSuggest(D: RcData, R: Round, busy: Busy): { changes: PlanChange[]; un: { id: string; stu: string; why: string }[] } {
  const bad = new Set(
    planProblems(D, R, busy)
      .filter((p) => p.lvl === "err" || !R.meets.find((m) => m.id === p.id)?.at)
      .map((p) => p.id)
      .filter(Boolean) as string[],
  );
  const R2 = clone(R);
  R2.meets.forEach((m) => {
    if (bad.has(m.id) || !m.at) m.pin = 0;
  });
  const res = IEP.schedule(D, R2, { busy });
  IEP.applyPlan(R2, res);
  const changes: PlanChange[] = [];
  R2.meets.forEach((m2) => {
    const m = R.meets.find((x) => x.id === m2.id)!;
    if ((m.at || "") === (m2.at || "") && (m.room || "") === (m2.room || "")) return;
    if (!m2.at) return; // 排不進去的放在 un
    changes.push({
      id: m.id,
      stu: stuOfM(D, m),
      from: m.at || "",
      to: m2.at,
      room: m2.room || "",
      fromLabel: m.at ? IEP.slotInfo(D, m.at).label : "（未排）",
      toLabel: IEP.slotInfo(D, m2.at).label,
      pinned: !!m.pin,
    });
  });
  const un = res.un.map((u) => ({ id: u.id, stu: stuOfM(D, R.meets.find((m) => m.id === u.id)!), why: u.why }));
  return { changes, un };
}
/** 套用勾選的建議：時間、地點照建議；原本固定的仍然固定（人看過、選了這個時間） */
export function applyPlanChanges(R: Round, changes: PlanChange[], pick: Set<string>): number {
  let n = 0;
  changes.forEach((c) => {
    if (!pick.has(c.id)) return;
    const m = R.meets.find((x) => x.id === c.id);
    if (!m) return;
    m.at = c.to;
    m.room = c.room;
    n++;
  });
  return n;
}

/* ───── 直接開會 ───── */
/** 直接開會的問題：每一位出席者在這個時間已知的忙碌（必要的人＝錯誤，選邀的＝提醒）、地點和別場撞到 */
export function quickProblems(D: RcData, R: Round, busy: Busy): PlanProb[] {
  const m = R.meets[0];
  if (!m || !m.at) return [];
  const out: PlanProb[] = [];
  m.p.forEach((x) => {
    const b = busy[x[0]] && busy[x[0]][m.at!];
    if (b) out.push({ lvl: x[2] ? "err" : "warn", text: IEP.pName(D, R, x[0]) + "：" + b, id: m.id });
  });
  IEP.crossConflicts(D, R)
    .filter((c) => (c as { room?: string }).room)
    .forEach((c) => out.push({ lvl: "err", text: c.m, id: m.id }));
  return out;
}

export interface QuickOpt {
  k: string;
  label: string;
  time: string;
  why: string;
  ok: boolean;
}
const ymd = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
/** 一鍵建議（直接開會）：從原本那一天起兩週內的上課日 × 每一節，必要的人都有空、地點沒被用、學生原班不是主科的排前面；回傳前 n 個 */
export function quickSuggest(D: RcData, R: Round, n = 3, ctx?: unknown): QuickOpt[] {
  const m0 = R.meets[0];
  if (!m0 || !m0.at) return [];
  const [d1] = IEP.splitKey(m0.at);
  const a = new Date(d1 + "T00:00:00");
  if (isNaN(+a)) return [];
  const b = new Date(a);
  b.setDate(b.getDate() + 14);
  const keys = IEP.baseKeys(
    D,
    d1,
    ymd(b),
    D.periods.map((p) => p.id),
  ).filter((k) => k !== m0.at);
  if (!keys.length) return [];
  const R2 = clone(R);
  R2.slots = keys.map((k) => IEP.splitKey(k));
  R2.rooms = R.rooms.slice();
  const m2 = R2.meets[0];
  // 別場用掉這個地點的時段（busyOf 只看 R.rooms 裡的地點）
  const rounds = IEP.ensure(D).rounds;
  const D2 = { ...D, iep: { ...(D as { iep?: object }).iep, rounds: rounds.map((r) => (r.id === R.id ? R2 : r)) } } as RcData;
  const busy = IEP.busyOf(D2, R2, ctx);
  const roomBusy = (k: string) => !!(m2.room && busy.__rooms && (busy.__rooms as unknown as Record<string, Record<string, string>>)[m2.room]?.[k]);
  const stu = IEP.stuOf(D, m0.s);
  const L = IEP.hintLists(D);
  const rk = IEP.rank(D2, R2, m2, busy).map((r) => {
    const f = IEP.slotInfo(D, r.k);
    const sj = stu ? IEP.ttCell(D, stu.cls, f.w, f.p)?.s || "" : "";
    const hint = sj ? IEP.subjHint(sj, L) : "";
    return { r, f, sj, hint, room: roomBusy(r.k) };
  });
  rk.sort(
    (x, y) =>
      +y.r.ok - +x.r.ok ||
      +x.room - +y.room ||
      x.r.bad.length - y.r.bad.length ||
      x.r.miss.length - y.r.miss.length ||
      +(x.hint === "avoid") - +(y.hint === "avoid") ||
      +(y.hint === "prefer") - +(x.hint === "prefer") ||
      x.r.i - y.r.i,
  );
  return rk.slice(0, n).map(({ r, f, sj, hint, room }) => ({
    k: r.k,
    label: f.label,
    time: f.time,
    ok: r.ok && !room,
    why: [
      r.ok ? (r.miss.length ? "選邀不能來：" + r.miss.join("、") : "必要的人都有空") : r.bad.join("、") + " 不能來",
      room ? m2.room + " 已有會議" : "",
      sj ? "原班" + sj + (hint === "avoid" ? "（主科）" : "") : "",
    ]
      .filter(Boolean)
      .join("・"),
  }));
}
/** 直接開會改時間（建議的時段）：候選時段只剩這一個、固定 */
export function quickApply(R: Round, k: string): void {
  R.slots = [IEP.splitKey(k)];
  const m = R.meets[0];
  if (!m) return;
  m.at = k;
  m.pin = 1;
}

/* ───── 請 AI 說明（排不進去的會議） ───── */
export const IEP_AI_SYS =
  "你是國中資源班 IEP 會議的排程顧問，說話簡短、具體、有禮貌。根據題目每一場會議在每個候選時段的出席情形，" +
  "用條列說明排不進去或有衝突的會議為什麼排不進去、建議怎麼調整（例如：多開哪一天哪一節、先請哪一個身分的人改回覆、把哪個身分改成選邀、換地點）。" +
  "只能用題目裡出現的代號（會議1、會議2…）、身分和時段；不要猜人名。不要寫開場白。";

/** 送給 AI 的內容：會議用代號（會議1…）、出席者只寫身分（個管老師、導師、家長…）與是否必要、每個候選時段的狀態（可／不可／待定／沒回覆／有課…）。
   不含學生姓名、班級座號、出席者姓名、障別或任何服務內容。 */
export function iepAiRequest(D: RcData, R: Round, busy: Busy): { req: AiReq; codes: Record<string, string> } {
  const probs = planProblems(D, R, busy);
  const ids = new Set(probs.map((p) => p.id).filter(Boolean) as string[]);
  const sug = planSuggest(D, R, busy);
  sug.un.forEach((u) => ids.add(u.id));
  const codes: Record<string, string> = {};
  R.meets.forEach((m, i) => (codes[m.id] = "會議" + (i + 1)));
  const keys = IEP.keysOf(R);
  const lab = (k: string) => IEP.slotInfo(D, k).label;
  const V: Record<string, string> = { y: "可", n: "不可", m: "待定", "": "沒回覆" };
  const lines: string[] = [];
  lines.push("候選時段：" + (keys.length ? keys.map(lab).join("、") : "（沒有）"));
  if (R.rooms.length) lines.push("可用地點數：" + R.rooms.length);
  R.meets.forEach((m) => {
    const code = codes[m.id];
    const head = code + (m.at ? "（目前排在 " + lab(m.at) + (m.pin ? "，固定" : "") + "）" : "（還沒排）") + (ids.has(m.id) ? "【有問題】" : "");
    const ppl = m.p.map((x) => {
      const slots = (Array.isArray(m.sl) && m.sl.length ? keys.filter((k) => m.sl!.includes(k)) : keys).map((k) => {
        const hard = (busy.__iep as unknown as Record<string, Record<string, string>> | undefined)?.[x[0]]?.[k];
        const st = hard ? { v: "n", auto: true, why: "已有會議" } : IEP.status(R, busy, x[0], k);
        return lab(k) + "＝" + (st.auto ? IEP.shortBusy(st.why || "") : V[st.v] || "沒回覆");
      });
      return "  ・" + x[1] + (x[2] ? "（必要）" : "（選邀）") + "：" + slots.join("、");
    });
    lines.push(head + "\n" + ppl.join("\n"));
  });
  const why = sug.un.map((u) => codes[u.id] + "：" + u.why);
  if (why.length) lines.push("排程程式算出的原因：\n" + why.join("\n"));
  let prompt = lines.join("\n");
  // 保險：學生與老師的姓名、班級座號都不應該出現（身分欄位是程式給的固定字）
  const names = new Set<string>();
  R.meets.forEach((m) => {
    const s = IEP.stuOf(D, m.s);
    if (s && String(s.name || "").length >= 2) names.add(String(s.name));
    m.p.forEach((x) => {
      const nm = IEP.pName(D, R, x[0]);
      if (nm && nm.length >= 2 && nm !== x[1]) names.add(nm);
    });
  });
  let scrubbed = 0;
  [...names]
    .sort((a, b) => b.length - a.length)
    .forEach((n) => {
      const parts = prompt.split(n);
      scrubbed += parts.length - 1;
      prompt = parts.join("（略）");
    });
  return { req: { system: IEP_AI_SYS, prompt, temperature: 0.3, scrubbed }, codes };
}
/** AI 回來的文字：會議代號換回學生（只在本機畫面上） */
export function iepAiRestore(D: RcData, R: Round, text: string, codes: Record<string, string>): string {
  let out = String(text || "").trim();
  Object.entries(codes)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([id, code]) => {
      const m = R.meets.find((x) => x.id === id);
      if (m) out = out.replace(new RegExp(code + "(?![0-9])", "g"), code + "（" + stuOfM(D, m) + "）");
    });
  return out;
}

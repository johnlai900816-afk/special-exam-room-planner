/* eslint-disable @typescript-eslint/no-explicit-any */
/* 段考 ③ 排考場的「一鍵修正」與「請 AI 說明」的題目。全部在 Ctx（E 的副本）上做，由 useExam().edit 包起來（可以復原、0.8 秒後存）。
   - fixViolations：只放開「有違規的那幾間」和沒排入的學生，其他人（含拖過、固定的）不動，用同一個求解器補排；更好才採用
   - procConflicts／fixProcConflicts：監考衝突（不排監考的時段、超出支援範圍、同一人同時兩場）列出是哪一場，清掉那幾場再只補空的
   - examAiRequest：違規與監考衝突的文字，學生、監考老師一律換成代號；送出前再檢查一次沒有任何學生姓名 */
import type { AiReq } from "../ai";
import { evaluate, fromState, sesLabel, shortName, solve as solveFn, weights, type ExState } from "./examCore";
import { asnList, autoProctor, pOff, procSlot, tOk, usedNow, type Ctx } from "./examOut";

interface Out {
  msgs: { t: number; r: number; lvl: string; m: string }[];
  unassigned: number;
}
const evalOut = (X: Ctx): Out => {
  const o: Out = { msgs: [], unassigned: 0 };
  evaluate(X.M, X.ST, o as any);
  return o;
};
/** 違規數（紅色的訊息＋未排入人次）：一鍵修正用來比較好壞 */
export function examBadCount(X: Ctx): number {
  const o = evalOut(X);
  return o.msgs.filter((m) => m.lvl === "err").length + o.unassigned;
}

/** 一鍵修正違規：第一輪只放開違規的那幾間＋未排入；還有違規再放開那幾節的全部學生。違規變少才採用。回傳一句話 */
export function fixViolations(X: Ctx): { text: string; before: number; after: number; moved: number } {
  const { M, D } = X;
  const nR = M.rooms.length;
  const before = examBadCount(X);
  if (!before) return { text: "沒有違規", before, after: 0, moved: 0 };
  const ses0 = X.ST.ses.slice(),
    room0 = X.ST.room.slice();
  M.W = weights(D.settings.pref);
  let best: { ses: any; room: any; bad: number } | null = null;
  for (let round = 0; round < 2; round++) {
    const cur: ExState = best ? { ses: best.ses, room: best.room, pin: X.ST.pin } : X.ST;
    const o: Out = { msgs: [], unassigned: 0 };
    evaluate(M, cur, o as any);
    const cells = new Set(o.msgs.filter((m) => m.lvl === "err" && m.r >= 0).map((m) => m.t * nR + m.r));
    const sess = new Set(o.msgs.filter((m) => m.lvl === "err").map((m) => m.t));
    const pin = new Uint8Array(M.parts.length);
    let free = 0;
    for (let p = 0; p < M.parts.length; p++) {
      const r = cur.room[p],
        t = cur.ses[p];
      const loose = r < 0 || cells.has(t * nR + r) || (round === 1 && sess.has(t));
      pin[p] = loose ? 0 : 1;
      if (loose) free++;
    }
    if (!free) break;
    const R = solveFn(M, { ses: cur.ses.slice(), room: cur.room.slice(), pin }, { seed: D.settings.seed || 1, iters: 60000, restarts: 4 });
    const save = X.ST;
    X.ST = { ses: R.ses, room: R.room, pin: save.pin };
    const bad = examBadCount(X);
    X.ST = save;
    if (bad < (best ? best.bad : before)) best = { ses: R.ses, room: R.room, bad };
    if (best && !best.bad) break;
  }
  if (!best) return { text: "找不到更好的排法；可以多開一間教室或放寬上限", before, after: before, moved: 0 };
  X.ST = { ses: best.ses, room: best.room, pin: X.ST.pin };
  let moved = 0;
  for (let p = 0; p < M.parts.length; p++) if (X.ST.ses[p] !== ses0[p] || X.ST.room[p] !== room0[p]) moved++;
  D.assign = fromState(M, X.ST);
  autoProctor(X, true, true); // 新用到的試場補監考，原本的不換
  return { text: "違規 " + before + " → " + best.bad + "，移動 " + moved + " 人次", before, after: best.bad, moved };
}

/* ───── 監考衝突 ───── */
export interface ProcConf {
  key: string;
  n: string;
  sup: boolean;
  m: string;
}
/** 監考衝突，和 tally 的 conf 同樣三種，但記下是哪一場（key）、主監考或支援；同一人時間重疊的，標後面那一場（後面那場是手動選的就標前面那場） */
export function procConflicts(X: Ctx): ProcConf[] {
  const { D } = X;
  const A = asnList(D, usedNow(X));
  const at = (a: (typeof A)[number]) => a.c.T.date + " " + sesLabel(a.c.T) + a.c.R.name + (a.sup ? "（支援）" : "");
  const man = (a: (typeof A)[number]) => !!(a.sup ? D.supMan || {} : D.procMan || {})[a.c.key];
  const out: ProcConf[] = [];
  const has = new Set<string>();
  const add = (a: (typeof A)[number], m: string) => {
    const id = a.c.key + (a.sup ? "|s" : "|p");
    if (has.has(id)) return;
    has.add(id);
    out.push({ key: a.c.key, n: a.n, sup: a.sup, m });
  };
  A.forEach((a) => {
    if (pOff(D, a.n).includes(procSlot(a.c.T))) add(a, a.n + "：" + at(a) + " 排在他不排監考的時段");
    else if (!tOk(D, a.n, a.c)) add(a, a.n + "：" + at(a) + " 不在他可以支援的範圍");
  });
  for (let i = 0; i < A.length; i++)
    for (let j = i + 1; j < A.length; j++) {
      const a = A[i],
        b = A[j];
      if (a.n === b.n && a.c.T.date === b.c.T.date && a.c.s < b.c.e && b.c.s < a.c.e) {
        const drop = man(b) && !man(a) ? a : b;
        add(drop, a.n + "：" + at(a) + " 與 " + at(b) + " 時間重疊");
      }
    }
  return out;
}
/** 一鍵修正監考衝突：清掉衝突的那幾場（手動選的標記一起清），其他場不動，只補空的。回傳一句話 */
export function fixProcConflicts(X: Ctx): { text: string; cleared: number; left: number } {
  const { D } = X;
  const cf = procConflicts(X);
  if (!cf.length) return { text: "沒有監考衝突", cleared: 0, left: 0 };
  cf.forEach((c) => {
    if (c.sup) {
      if (D.supportOf[c.key] === c.n) delete D.supportOf[c.key];
      if (D.supMan) delete D.supMan[c.key];
    } else {
      if (D.proctorOf[c.key] === c.n) delete D.proctorOf[c.key];
      if (D.procMan) delete D.procMan[c.key];
    }
  });
  autoProctor(X, true, true);
  const left = procConflicts(X).length;
  const miss = usedNow(X).filter((c) => !D.proctors.includes(D.proctorOf[c.key])).length;
  return {
    text: "重新安排 " + cf.length + " 場監考" + (left ? "，還有 " + left + " 個衝突" : "") + (miss ? "，" + miss + " 場沒有主監考" : ""),
    cleared: cf.length,
    left,
  };
}

/* ───── 請 AI 說明（去識別化） ───── */
export const EXAM_AI_SYS =
  "你是國中段考特殊應試服務（延長時間、報讀、口頭作答、電腦作答、人數調整）的考場安排顧問，說話簡短、具體、有禮貌。" +
  "根據題目列出的違規與監考衝突，用條列說明每一項為什麼會發生、建議怎麼改（例如：多開一間教室、提高某間的上限、把學生移到哪一節的哪一間、請哪位監考換場）。" +
  "只能用題目裡出現的代號、教室和節次；「學生1」「監考A」這類代號照抄。不要重複題目，不要寫開場白。";

/** 要送給 AI 的內容與代號對照：學生 → 學生1…，監考老師 → 監考A…（不管有沒有同意送老師姓名都換）。不含服務內容以外的任何學生資料 */
export function examAiRequest(X: Ctx): { req: AiReq; pairs: [string, string][] } {
  const { M, D } = X;
  const pairs: [string, string][] = [];
  D.students.forEach((s, i) => {
    const code = "學生" + (i + 1),
      n = String(s.name || "").trim();
    if (n) pairs.push([shortName(s), code]);
    if (n.length >= 2) pairs.push([n, code]);
    if (n.length >= 3) pairs.push([n.slice(1), code]);
  });
  D.proctors.forEach((n, i) => {
    const t = String(n || "").trim();
    const code = "監考" + (i < 26 ? String.fromCharCode(65 + i) : "A" + (i + 1));
    if (t.length >= 2) pairs.push([t, code]);
  });
  pairs.sort((a, b) => b[0].length - a[0].length);
  let hits = 0;
  const scrub = (t: string) => {
    let s = t;
    pairs.forEach(([k, v]) => {
      const parts = s.split(k);
      hits += parts.length - 1;
      s = parts.join(v);
    });
    return s;
  };
  const o = evalOut(X);
  const lines: string[] = [];
  lines.push("教室：" + M.rooms.map((R: any) => R.name + "（" + (R.type === "wait" ? "自習等候" : R.type === "pc" ? "電腦" : R.type === "spare" ? "備用" : "一般") + "，上限 " + R.cap + "）").join("、"));
  lines.push("節次：" + M.ses.map((T: any) => T.date + " " + sesLabel(T) + (T.makeup ? "（補考節）" : "") + (T.split ? "（分年級）" : "") + (T.waitExam ? "（自習教室開放考試）" : "")).join("、"));
  const un: Record<string, number> = {};
  M.parts.forEach((P: any, p: number) => {
    if (X.ST.room[p] < 0) un[P.subject] = (un[P.subject] || 0) + 1;
  });
  if (Object.keys(un).length) lines.push("未排入：" + Object.entries(un).map(([k, n]) => k + " " + n + " 人次").join("、"));
  const vs = o.msgs.map((e) => "・" + M.ses[e.t].date + " " + sesLabel(M.ses[e.t]) + (e.r >= 0 ? " " + M.rooms[e.r].name : "") + "：" + e.m + (e.lvl === "err" ? "" : "（提醒）"));
  if (vs.length) lines.push("違規與提醒：\n" + vs.join("\n"));
  const pc = procConflicts(X);
  if (pc.length) lines.push("監考衝突：\n" + pc.map((c) => "・" + c.m).join("\n"));
  let prompt = scrub(lines.join("\n"));
  // 最後再檢查一次：任何一位學生的姓名（兩個字以上）還在就整段換掉
  D.students.forEach((s, i) => {
    const n = String(s.name || "").trim();
    if (n.length >= 2 && prompt.includes(n)) prompt = prompt.split(n).join("學生" + (i + 1));
  });
  return { req: { system: EXAM_AI_SYS, prompt, temperature: 0.3, scrubbed: hits }, pairs };
}
/** AI 回來的文字：代號換回名字（只在本機畫面上）。同一位學生有好幾種寫法（班級＋名、全名、名），換回全名；先換長的代號（學生12 在 學生1 之前） */
export function examAiRestore(text: string, pairs: [string, string][]): string {
  const back = new Map<string, string>();
  pairs.forEach(([k, v]) => {
    const cur = back.get(v);
    const full = (x: string) => !/^\d/.test(x); // shortName 以班級開頭
    if (!cur || (full(k) && (!full(cur) || k.length > cur.length))) back.set(v, k);
  });
  let out = String(text || "").trim();
  [...back]
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([code, name]) => (out = out.split(code).join(name)));
  return out;
}

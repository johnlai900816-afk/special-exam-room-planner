/* eslint-disable @typescript-eslint/no-explicit-any */
/* 段考考場的畫面與輸出（舊版 exam.html 第二段程式），逐字照搬成純函式：
     排考場：cellMap、waitMap、groupsOf、usedCells、監考統計（procQuota、asnList、autoProctor）
     輸出：服務表 svcHtml、動線 itinHtml、監考 procMatrix、交卷名單 handPapers、補考名單 mkPapers（和舊版逐字相同）
     查考場：findRowsAll、findRows、findHtml、findCopyText
   舊版的函式讀全域的 D、M、ST；這裡改成傳進來（X）。畫面上的說明、按鈕（.noprint 那一段）由 React 畫，紙張本體逐字相同。
   test/exam-out.test.ts 把 exam.html 的原文放在沙盒裡跑，逐字比對。 */
import {
  GN,
  SV,
  compile,
  dateKey,
  evaluate,
  fmt,
  fromState,
  gradeOf,
  hm,
  labelOf,
  labelRank,
  makeupList,
  mulberry32,
  normDate,
  sesLabel,
  shortName,
  solve as solveFn,
  sortDates,
  toState,
  weights,
  type ExModel,
  type ExState,
  type ExamD,
  type ExStudent,
  type TtSnap,
} from "./examCore";

export interface Ctx {
  D: ExamD;
  M: ExModel;
  ST: ExState;
}
// 單引號也要跳脫：值有時會放進 HTML 屬性裡
export const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// 圖示：舊版用頁首的 SVG 圖示組；紙張裡不會用到
export const ic = (n: string) => '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>';

export function build(D: ExamD): Ctx {
  const M = compile(D);
  return { D, M, ST: toState(M, D) };
}

/* ---------- 排考場 ---------- */
export function cellMap(X: Ctx): Record<string, number[]> {
  const { M, ST } = X;
  const c: Record<string, number[]> = {};
  M.parts.forEach((P: any, p: number) => {
    const k = ST.ses[p] + "|" + ST.room[p];
    (c[k] = c[k] || []).push(p);
  });
  return c;
}
export function waitMap(X: Ctx): Record<number, number[]> {
  const { M, ST } = X;
  const w: Record<number, number[]> = {};
  M.parts.forEach((P: any, p: number) => {
    if (ST.room[p] < 0 || !M.ses[ST.ses[p]].makeup) return;
    P.all.forEach((t: number) => {
      if (!M.ses[t].makeup) (w[t] = w[t] || []).push(p);
    });
  });
  return w;
}
export function groupsOf(M: ExModel, list: number[]): { l: string; rank: number; ps: number[] }[] {
  const g: Record<string, { l: string; rank: number; ps: number[] }> = {};
  list.forEach((p) => {
    const P = M.parts[p],
      l = labelOf(P);
    (g[l] = g[l] || { l, rank: labelRank(P), ps: [] }).ps.push(p);
  });
  return Object.values(g).sort((a, b) => a.rank - b.rank || a.l.localeCompare(b.l));
}
export function gradeCount(M: ExModel, list: number[]): string {
  const c: Record<string, number> = {};
  list.forEach((p) => {
    const g = M.parts[p].g;
    c[g] = (c[g] || 0) + 1;
  });
  return Object.keys(c)
    .sort((a, b) => +b - +a)
    .map((g) => (GN[g] || g) + c[g])
    .join(" ");
}
export function busyHint(M: ExModel, t: number, r: number): string {
  const nR = M.rooms.length,
    T = M.ses[t];
  for (const pr of M.pairs) {
    const o = pr[0] === t ? pr[1] : pr[1] === t ? pr[0] : -1;
    if (o < 0) continue;
    const k = o * nR + r;
    if (!M.c_cnt[k]) continue;
    const O = M.ses[o],
      os = M.c_any[k] ? O.est : O.st,
      oe = M.c_any[k] ? O.een : O.en;
    if (os < T.en && T.st < oe) return "（" + sesLabel(O) + "延長使用中）";
  }
  return "";
}
export interface Used {
  T: any;
  R: any;
  key: string;
  s: number;
  e: number;
  ext: boolean;
  oral: boolean;
}
export function usedCells(M: ExModel, cells: Record<string, number[]>, waits: Record<number, number[]>, waitRoom: number): Used[] {
  const a: Used[] = [];
  M.ses.forEach((T: any) =>
    M.rooms.forEach((R: any, r: number) => {
      const list = cells[T.i + "|" + r] || [],
        w = r === waitRoom ? waits[T.i] || [] : [];
      if (!list.length && !w.length) return;
      const ext = list.some((p) => M.parts[p].ext);
      a.push({ T, R, key: T.id + "|" + R.id, s: ext ? T.est : T.st, e: ext ? T.een : T.en, ext, oral: list.some((p) => M.parts[p].oral) });
    }),
  );
  return a.sort((x, y) => x.T.key - y.T.key || x.R.i - y.R.i);
}
export function usedNow(X: Ctx): Used[] {
  return usedCells(
    X.M,
    cellMap(X),
    waitMap(X),
    X.M.rooms.findIndex((r: any) => r.type === "wait"),
  );
}

/* ---------- 監考：按應授課節數比例分配；延長場算 1.5 節；不排時段記「星期幾上午／下午」，跟著段考日期走 ---------- */
const EXTW = 1.5;
export const DOW = "日一二三四五六";
export const pinfo = (D: ExamD, n: string) => D.proctorInfo[n] || (D.proctorInfo[n] = {});
export const pOff = (D: ExamD, n: string): string[] => (D.proctorInfo[n] && D.proctorInfo[n].off) || [];
const cw = (c: Used) => (c.ext ? EXTW : 1);
export const f1 = (x: number) => String(Math.round(x * 10) / 10);
// 臨時支援：不照比例分，只排他能支援的範圍（某幾節、或只支援口頭作答）；支援口頭作答的場次算 0.5 節
const ORALW = 0.5;
export const isT = (D: ExamD, n: string) => !!(D.proctorInfo[n] && D.proctorInfo[n].temp);
export function tOk(D: ExamD, n: string, c: Used): boolean {
  const f = D.proctorInfo[n];
  if (!f || !f.temp) return true;
  if (f.oralOnly && !c.oral) return false;
  return !(f.only && f.only.length) || f.only.includes(c.T.id);
}
export const pw = (D: ExamD, n: string, c: Used) => (isT(D, n) && c.oral ? ORALW : cw(c));
export function procSlot(T: any): string {
  return (T.ref.dow || T.date) + "|" + (T.st >= 720 ? "pm" : "am");
}
export function procSlots(M: ExModel): { k: string; date: string; dow: string; pm: boolean }[] {
  // 這次段考有哪些「某天上午／下午」
  const seen: Record<string, number> = {},
    a: { k: string; date: string; dow: string; pm: boolean }[] = [];
  M.ses
    .slice()
    .sort((x: any, y: any) => x.key - y.key)
    .forEach((T: any) => {
      const k = procSlot(T);
      if (seen[k]) return;
      seen[k] = 1;
      a.push({ k, date: T.date, dow: T.ref.dow || "", pm: T.st >= 720 });
    });
  return a;
}
export interface Quota {
  q: Record<string, number>;
  W: number;
  fixed: number;
  used: number;
  regs: number;
  tempN: number;
  auto: number;
  noTeach: number;
  ext: number;
}
export function procQuota(D: ExamD, used: Used[], asg?: Record<string, string>): Quota {
  // 正式老師這次應監考幾節：扣掉臨時支援負責的場次，剩下的總節數（延長場 1.5）按應授課節數比例分，以 0.5 節為單位
  asg = asg || D.proctorOf;
  const regs = D.proctors.filter((n) => !isT(D, n)),
    mine = used.filter((c) => !isT(D, asg![c.key]));
  const W = mine.reduce((a, c) => a + cw(c), 0),
    q: Record<string, number> = {},
    auto: string[] = [];
  let fixed = 0;
  regs.forEach((n) => {
    const v = (D.proctorInfo[n] || {}).quota;
    if (v === "" || v == null || isNaN(+v)) auto.push(n);
    else {
      q[n] = +v;
      fixed += +v;
    }
  });
  const tv = auto.map((n) => +((D.proctorInfo[n] || {}).teach as number) || 0),
    known = tv.filter((x) => x > 0);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1,
    w = tv.map((x) => (x > 0 ? x : avg)),
    ws = w.reduce((a, b) => a + b, 0);
  const units = Math.max(0, Math.round((W - fixed) * 2)),
    raw = w.map((x) => (ws ? (units * x) / ws : 0)),
    fl = raw.map(Math.floor);
  let left = units - fl.reduce((a, b) => a + b, 0);
  raw
    .map((x, i) => ({ i, r: x - fl[i] }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .forEach((o) => {
      if (left-- > 0) fl[o.i]++;
    });
  auto.forEach((n, i) => {
    q[n] = fl[i] / 2;
  });
  return { q, W, fixed, used: used.length, regs: regs.length, tempN: used.length - mine.length, auto: auto.length, noTeach: tv.filter((x) => !(x > 0)).length, ext: mine.filter((c) => c.ext).length };
}
export interface Asn {
  n: string;
  c: Used;
  sup: boolean;
}
export function asnList(D: ExamD, used: Used[]): Asn[] {
  // 每一場的主監考與支援
  const a: Asn[] = [];
  used.forEach((c) => {
    const m = D.proctorOf[c.key],
      sp = D.supportOf[c.key];
    if (D.proctors.includes(m)) a.push({ n: m, c, sup: false });
    if (D.proctors.includes(sp)) a.push({ n: sp, c, sup: true });
  });
  return a;
}
/** 監考統計（舊版 renderTally 的數字；畫面由 React 畫） */
export function tally(X: Ctx) {
  const { D } = X;
  const used = usedNow(X),
    A = asnList(D, used),
    cnt: Record<string, number> = {},
    num: Record<string, number> = {},
    extc: Record<string, number> = {},
    supc: Record<string, number> = {},
    conf: string[] = [];
  D.proctors.forEach((n) => {
    cnt[n] = 0;
    num[n] = 0;
    extc[n] = 0;
    supc[n] = 0;
  });
  const at = (a: Asn) => a.c.T.date + " " + sesLabel(a.c.T) + a.c.R.name + (a.sup ? "（支援）" : "");
  A.forEach((a) => {
    const n = a.n,
      c = a.c;
    cnt[n] += pw(D, n, c);
    num[n]++;
    if (c.ext) extc[n]++;
    if (a.sup) supc[n]++;
    if (pOff(D, n).includes(procSlot(c.T))) conf.push(n + "：" + at(a) + " 排在他不排監考的時段");
    if (!tOk(D, n, c)) conf.push(n + "：" + at(a) + " 不在他可以支援的範圍");
  });
  for (let i = 0; i < A.length; i++)
    for (let j = i + 1; j < A.length; j++) {
      const a = A[i],
        b = A[j];
      if (a.n === b.n && a.c.T.date === b.c.T.date && a.c.s < b.c.e && b.c.s < a.c.e) conf.push(a.n + "：" + at(a) + " 與 " + at(b) + " 時間重疊");
    }
  const miss = used.filter((c) => !D.proctors.includes(D.proctorOf[c.key])).length,
    Q = procQuota(D, used),
    supN = A.filter((a) => a.sup).length;
  return { used, cnt, num, extc, supc, conf, miss, Q, supN };
}
export function procMatrix(X: Ctx, cls: string, used?: Used[]): string {
  // 老師 × 節次：在哪一間（主監考或支援）；斜線＝不排的時段
  const { D, M } = X;
  used = used || usedNow(X);
  const A = asnList(D, used),
    ses = M.ses
      .slice()
      .sort((a: any, b: any) => a.key - b.key)
      .filter((T: any) => used!.some((c) => c.T === T));
  if (!D.proctors.length || !ses.length) return '<div class="line">還沒有監考分配</div>';
  let h =
    '<table class="' +
    (cls === "out" ? "out" : "pm") +
    '"><thead><tr><th>老師</th>' +
    ses.map((T: any) => "<th>" + esc(T.date) + (T.ref.dow ? "（" + esc(T.ref.dow) + "）" : "") + "<small>" + esc(sesLabel(T)) + " " + fmt(T.st) + "</small></th>").join("") +
    "<th>合計</th></tr></thead>";
  D.proctors.forEach((n) => {
    let k = 0,
      w = 0;
    h +=
      "<tr><th>" +
      esc(n) +
      (isT(D, n) ? "<small>臨時支援</small>" : "") +
      "</th>" +
      ses
        .map((T: any) => {
          const mine = A.filter((a) => a.n === n && a.c.T === T);
          k += mine.length;
          mine.forEach((a) => (w += pw(D, n, a.c)));
          if (mine.length)
            return (
              '<td class="' +
              (mine.every((a) => a.sup) ? "sup" : "on") +
              '">' +
              mine.map((a) => esc(a.c.R.name) + (a.sup ? "<br><small>支援</small>" : "") + (a.c.ext ? "<br><small>延長 " + fmt(a.c.s) + "~" + fmt(a.c.e) + "</small>" : "")).join("<br>") +
              "</td>"
            );
          const f = D.proctorInfo[n] || {};
          return pOff(D, n).includes(procSlot(T)) || (f.temp && f.only && f.only.length && !f.only.includes(T.id)) ? '<td class="off">不排</td>' : "<td></td>";
        })
        .join("") +
      "<td><b>" +
      f1(w) +
      " 節</b><br><small>" +
      k +
      " 場</small></td></tr>";
  });
  const un = used.filter((c) => !D.proctors.includes(D.proctorOf[c.key]));
  if (un.length)
    h +=
      '<tr><th style="color:var(--bad)">未指定</th>' +
      ses
        .map(
          (T: any) =>
            "<td>" +
            un
              .filter((c) => c.T === T)
              .map((c) => esc(c.R.name))
              .join("<br>") +
            "</td>",
        )
        .join("") +
      "<td><b>" +
      un.length +
      " 場</b></td></tr>";
  return h + "</table>";
}
/** 自動分配監考（舊版 autoProctor）。keep＝已經指定的不動，只補空的。改 D.proctorOf、D.supportOf；回傳要給人看的一句話（quiet 且排滿時 ''） */
export function autoProctor(X: Ctx, keep?: boolean, quiet?: boolean): string {
  const { D } = X;
  if (!D.proctors.length) return quiet ? "" : "請先填監考老師";
  const used = usedNow(X),
    rnd = mulberry32(20261118),
    regs = D.proctors.filter((n) => !isT(D, n)),
    temps = D.proctors.filter((n) => isT(D, n));
  // 手動指定的（procMan／supMan）一律保留；keep＝連自動排的也不動，只補空的
  const PM = D.procMan || {},
    SM = D.supMan || {};
  const kept = used.filter((c) => D.proctors.includes(D.proctorOf[c.key]) && (keep || PM[c.key])).map((c) => ({ n: D.proctorOf[c.key], c }));
  const supd = used.filter((c) => D.proctors.includes(D.supportOf[c.key]) && (keep || SM[c.key])).map((c) => ({ n: D.supportOf[c.key], c }));
  const free = (n: string, c: Used, done: { n: string; c: Used }[]) =>
    tOk(D, n, c) && !pOff(D, n).includes(procSlot(c.T)) && !done.some((d) => d.n === n && d.c.T.date === c.T.date && d.c.s < c.e && c.s < d.c.e);
  // 1) 臨時支援：在他能支援的範圍內加派，口頭作答的場次優先，其次延長場
  const rank = (c: Used) => (c.oral ? 0 : 2) + (c.ext ? 0 : 1);
  temps.forEach((n) => {
    const v = D.proctorInfo[n].quota,
      cap = v === "" || v == null || isNaN(+v) ? 1e9 : +v;
    let tl = supd
      .concat(kept)
      .filter((d) => d.n === n)
      .reduce((a, d) => a + pw(D, n, d.c), 0);
    used
      .filter((c) => !supd.some((d) => d.c === c))
      .sort((a, b) => rank(a) - rank(b) || a.T.key - b.T.key)
      .forEach((c) => {
        const w = pw(D, n, c);
        if (tl + w > cap + 1e-9 || !free(n, c, supd.concat(kept))) return;
        supd.push({ n, c });
        tl += w;
      });
  });
  const sup: Record<string, string> = {};
  supd.forEach((d) => {
    sup[d.c.key] = d.n;
  });
  // 2) 主監考：按應授課節數比例分給正式老師
  const fix: Record<string, string> = {};
  kept.forEach((d) => {
    fix[d.c.key] = d.n;
  });
  const Q = procQuota(D, used, fix).q,
    todo = used.filter((c) => !fix[c.key]);
  const nOk = (c: Used) => regs.filter((n) => !pOff(D, n).includes(procSlot(c.T))).length;
  let best: { cost: number; asg: Record<string, string>; load: Record<string, number>; miss: number } | null = null;
  for (let it = 0; it < 400; it++) {
    // 多試幾種順序，留最接近應監考節數的一組
    const load: Record<string, number> = {},
      extc: Record<string, number> = {},
      done = kept.concat(supd),
      asg: Record<string, string> = Object.assign({}, fix);
    regs.forEach((n) => {
      load[n] = 0;
      extc[n] = 0;
    });
    let miss = 0;
    done.forEach((d) => {
      if (load[d.n] == null) return;
      load[d.n] += cw(d.c);
      if (d.c.ext) extc[d.n]++;
    });
    const order = todo
      .map((c) => ({ c, k: nOk(c) - (c.ext ? 0.5 : 0) + (it ? rnd() * 2 : 0) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.c); // 能排的老師越少越先排
    for (const c of order) {
      let bn: string | null = null,
        bs = -1e9;
      const w = cw(c);
      for (const n of regs) {
        if (!free(n, c, done)) continue;
        const s = (Q[n] - load[n]) * 10 - (load[n] + w > Q[n] + 0.5 ? 100 : 0) - (c.ext ? extc[n] * 3 : 0) + (it ? rnd() * 4 : 0);
        if (s > bs) {
          bs = s;
          bn = n;
        }
      }
      if (bn) {
        asg[c.key] = bn;
        load[bn] += w;
        if (c.ext) extc[bn]++;
        done.push({ n: bn, c });
      } else miss++;
    }
    const em = regs.reduce((a, n) => a + extc[n], 0) / (regs.length || 1);
    let cost = miss * 10000;
    regs.forEach((n) => {
      const d = load[n] - Q[n];
      cost += d * d * 100 + (extc[n] - em) * (extc[n] - em);
    });
    if (!best || cost < best.cost) best = { cost, asg, load, miss };
  }
  D.proctorOf = best!.asg;
  D.supportOf = sup;
  if (quiet && !best!.miss) return "";
  const off = regs.filter((n) => Math.abs(best!.load[n] - Q[n]) > 0.5),
    nMan = keep ? 0 : kept.length;
  return best!.miss
    ? best!.miss + " 場排不到主監考，請手動指定"
    : off.length
      ? "已分配；" + off.join("、") + " 和應監考差較多"
      : "監考已分配" + (nMan ? "（手動指定的 " + nMan + " 場不變）" : "");
}

/** 自動排列（舊版 runSolve）：mode＝all｜fill（補排未排入）｜next（換一組）。改 X.ST、D.assign、監考；回傳 autoProctor 的話 */
export function runSolve(X: Ctx, mode: "all" | "fill" | "next"): string {
  const { D, M } = X;
  if (mode === "next") D.settings.seed = (D.settings.seed || 1) + 1;
  let S0 = X.ST;
  if (mode === "fill") {
    const pin = new Uint8Array(X.ST.pin.length);
    for (let p = 0; p < pin.length; p++) pin[p] = X.ST.room[p] >= 0 ? 1 : 0;
    S0 = { ses: X.ST.ses, room: X.ST.room, pin };
  }
  M.W = weights(D.settings.pref);
  const R = solveFn(M, S0, { seed: D.settings.seed || 1, iters: 60000, restarts: 4 });
  X.ST = { ses: R.ses, room: R.room, pin: X.ST.pin };
  D.assign = fromState(M, X.ST);
  return autoProctor(X, mode === "fill", true);
}

/* ---------- 步驟 2：考試日期 ---------- */
export function dateOf(D: ExamD, s: string, dow?: string, now?: Date): Date | null {
  const m = String(s || "").match(/(\d{1,2})\s*[\/月.\-]\s*(\d{1,2})/);
  if (!m) return null;
  const mo = +m[1],
    da = +m[2],
    nw = now || new Date(),
    y0 = nw.getFullYear(),
    c: number[] = [];
  const t = String(D.title || "").match(/(\d{2,3})\s*(?:學年|[-–])/);
  if (t) c.push(+t[1] + (mo >= 8 ? 1911 : 1912));
  [y0 - 1, y0, y0 + 1]
    .sort((a, b) => Math.abs(+new Date(a, mo - 1, da) - +nw) - Math.abs(+new Date(b, mo - 1, da) - +nw))
    .forEach((y) => c.push(y));
  const ds = c.map((y) => new Date(y, mo - 1, da)).filter((x) => x.getMonth() === mo - 1);
  return (dow && ds.find((x) => DOW[x.getDay()] === dow)) || ds[0] || null;
}
export function noteToOff(note: unknown): string[] | null {
  // 「週二下午不排監考」→ 星期二下午（之後段考日期換了也會跟著對到）
  note = String(note || "");
  if (!/不/.test(note as string)) return null;
  const a: string[] = [];
  for (const m of (note as string).matchAll(/(?:週|周|星期|禮拜)\s*([一二三四五六日天])\s*(上午|下午)?/g)) {
    const d = m[1] === "天" ? "日" : m[1];
    if (m[2] !== "下午") a.push(d + "|am");
    if (m[2] !== "上午") a.push(d + "|pm");
  }
  return a.length ? a : null;
}
/** 貼上老師表（舊版 pasteProcOk）：改 D.proctors、proctorInfo；回傳讀到幾位（0＝讀不出來，D 不變） */
export function pasteProc(D: ExamD, text: string): number {
  const rows = text
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim())
    .map((l) => (l.includes("\t") ? l.split("\t").map((x) => x.trim()) : l.trim().split(/\s{2,}|[,，]/).map((x) => x.trim())));
  if (!rows.length) return -1;
  const list: { n: string; note: string; teach: string | undefined }[] = [];
  if (/老師|教師|姓名/.test(rows[0][0]) && rows[0].length > 1) {
    // 橫的：每一欄是一位老師
    const find = (re: RegExp) => rows.find((r) => re.test(r[0])) || [];
    const N = rows[0],
      need = find(/需求|備註/),
      teach = find(/授課/);
    for (let c = 1; c < N.length; c++) if (N[c]) list.push({ n: N[c], note: need[c] || "", teach: teach[c] });
  } else
    rows.forEach((r) => {
      // 直的：一行一位
      if (r.length === 1) r = r[0].split(/\s+/);
      const nums = r.slice(1).filter((x) => /^\d+(\.\d+)?$/.test(x)),
        txt = r
          .slice(1)
          .filter((x) => x && !/^\d+(\.\d+)?$/.test(x))
          .join(" ");
      if (r[0] && !/^\d+$/.test(r[0])) list.push({ n: r[0], teach: nums[0], note: txt });
    });
  if (!list.length) return 0;
  const num = (v: unknown) => (v == null || v === "" || isNaN(+v) ? "" : +v),
    info: Record<string, any> = {};
  const keepT = D.proctors.filter((n) => isT(D, n) && !list.some((x) => x.n === n)),
    oldInfo = D.proctorInfo;
  D.proctors = [...new Set(list.map((x) => x.n))].concat(keepT);
  list.forEach((x) => {
    const old = D.proctorInfo[x.n] || {},
      f = (info[x.n] = { teach: num(x.teach), quota: "", note: x.note || "", off: (old.off || []).filter((k) => !(noteToOff(old.note) || []).includes(k)) });
    const o = noteToOff(x.note);
    if (o) f.off = [...new Set(f.off.concat(o))];
  });
  keepT.forEach((n) => {
    info[n] = oldInfo[n];
  });
  D.proctorInfo = info;
  for (const k in D.proctorOf) if (!D.proctors.includes(D.proctorOf[k])) delete D.proctorOf[k];
  for (const k in D.supportOf) if (!D.proctors.includes(D.supportOf[k])) delete D.supportOf[k];
  return list.length;
}
/** 貼上學生名單（舊版 pasteStuOk）：回傳 [加入, 略過重複] */
export function pasteStu(D: ExamD, text: string, now = Date.now()): [number, number] {
  let n = 0,
    skip = 0;
  text.split("\n").forEach((l) => {
    l = l.trim();
    if (!l) return;
    const m = l.match(/^(\d{3,4})\s*[-－\s,\t]\s*(\d{1,2})\s*[,\t\s]*\s*(.+)$/) || l.match(/^(\d{3,4})()\s*(.+)$/);
    const s = m ? { cls: m[1], seat: m[2] ? m[2].padStart(2, "0") : "", name: m[3].trim() } : { cls: "", seat: "", name: l };
    if (D.students.some((x) => x.cls === s.cls && x.seat === s.seat && x.name === s.name)) {
      skip++;
      return;
    }
    D.students.push(Object.assign({ id: "n" + now.toString(36) + n, sv: {}, memo: "", on: true }, s));
    n++;
  });
  return [n, skip];
}

/* ---------- 讀進來的舊資料補齊欄位（舊版 normalize） ---------- */
export function normalize(o: any, defaults: () => ExamD): ExamD {
  const d = defaults(),
    pv0 = (o.settings || {}).pv || 0;
  o.settings = Object.assign(d.settings, o.settings || {});
  o.assign = o.assign || {};
  o.proctorOf = o.proctorOf || {};
  o.supportOf = o.supportOf || {};
  o.procMan = o.procMan || {};
  o.supMan = o.supMan || {};
  o.notes = o.notes || {};
  o.handIn = o.handIn || {};
  o.proctors = o.proctors || [];
  o.proctorInfo = o.proctorInfo || {};
  o.sessions = o.sessions || [];
  o.rooms = o.rooms || [];
  o.students = o.students || [];
  if (pv0 < 2) {
    o.settings.pv = 2;
    const dw: Record<string, string> = {};
    o.sessions.forEach((x: any) => {
      if (x.dow) dw[x.date] = x.dow;
    });
    for (const n in o.proctorInfo) {
      const f = o.proctorInfo[n];
      f.quota = "";
      f.off = (f.off || []).map((k: string) => {
        const a = k.split("|");
        return (dw[a[0]] || a[0]) + "|" + a[1];
      });
    }
  }
  // pv3：以前名冊的每週節數被誤寫進「這次監考節數」（auto），清掉改回按比例；日期統一寫法
  if (pv0 < 3) {
    o.settings.pv = 3;
    for (const n in o.proctorInfo) {
      const f = o.proctorInfo[n];
      if (f.auto) {
        f.quota = "";
        delete f.auto;
      }
    }
  }
  o.sessions.forEach((x: any) => {
    x.date = normDate(x.date);
  });
  for (const n in o.proctorInfo) {
    const f = o.proctorInfo[n];
    if (f.off)
      f.off = f.off.map((k: string) => {
        const a = k.split("|");
        return normDate(a[0]) + "|" + a[1];
      });
  }
  o.students.forEach((s: any) => {
    s.sv = s.sv || {};
  });
  return o;
}

/* ---------- 交卷名單：每一科一張，依年級分三欄，每位學生寫上批閱教師（從全校課表或任課老師來） ---------- */
const EXAM_TT: Record<string, string[]> = {
  國文: ["國語文"],
  作文: ["國語文"],
  國語文: ["國語文"],
  英文: ["英語文"],
  英聽: ["英語文"],
  英語文: ["英語文"],
  數學: ["數學"],
  社會: ["歷史", "地理", "公民與社會"],
  歷史: ["歷史"],
  地理: ["地理"],
  公民: ["公民與社會"],
  公民與社會: ["公民與社會"],
  自然: ["生物", "理化", "地球科學", "地科"],
  生物: ["生物"],
  理化: ["理化"],
  地科: ["地球科學", "地科"],
  地球科學: ["地球科學", "地科"],
};
// 名冊裡的全校課表和任課老師，抄一份放進段考資料，雲端上其他老師打開也看得到
export function ttSnap(R: any): TtSnap | null {
  if (!R) return null;
  const tn = (id: string) => {
      const t = (R.teachers || []).find((x: any) => x.id === id);
      return t ? t.name : "";
    },
    cs: Record<string, string> = {};
  Object.keys(R.classSubj || {}).forEach((k) => {
    const n = tn(R.classSubj[k]);
    if (n) cs[k] = n;
  });
  return { tt: R.tt || {}, cs };
}
export function graderOf(G: TtSnap | null, cls: string, subj: string): string {
  if (!G) return "";
  // 合併的科目（例：「生物/理化」）：拆開來各找一次再合起來；七年級班的課表只有生物，就只會找到生物老師
  const pp = String(subj)
    .split(/[\/／、+＋]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (pp.length > 1) return [...new Set(pp.flatMap((x) => graderOf(G, cls, x).split("、")).filter(Boolean))].join("、");
  const want = EXAM_TT[subj] || [subj],
    c = G.tt[String(cls)];
  const names: string[] = c ? [...new Set(want.flatMap((s) => (c.subj[s] || []).slice(0, 1).map((x: any) => x[0])))] as string[] : [];
  if (!names.length) {
    const m: Record<string, string[]> = { 國語文: ["國文", "國語文"], 英語文: ["英文", "英語文"], 數學: ["數學"], 理化: ["理化"] };
    want.forEach((s) =>
      (m[s] || []).forEach((k) => {
        const n = G.cs[cls + "|" + k];
        if (n && !names.includes(n)) names.push(n);
      }),
    );
  }
  return names.join("、");
}
// 方框：畫面上點了會打勾；印出來還是空的「□」，勾了「印出已勾選」才印出勾
function hb(D: ExamD, sj: string, id: string, v: string): string {
  const on = ((D.handIn || {})[sj] || {})[id] === v;
  return (
    '<span class="hb' +
    (on ? " on" : "") +
    '" data-hs="' +
    esc(sj) +
    '" data-hid="' +
    esc(id) +
    '" data-hv="' +
    v +
    '" role="checkbox" aria-checked="' +
    on +
    '" aria-label="' +
    (v === "in" ? "已交" : "未到") +
    '"><i class="u">□</i><i class="k">☑</i></span>'
  );
}
export function absentN(D: ExamD): number {
  const H = D.handIn || {};
  let n = 0;
  for (const sj in H) for (const id in H[sj]) if (H[sj][id] === "absent") n++;
  return n;
}
/** 交卷名單的紙（舊版 handHtml 去掉最前面 .noprint 說明那一段）；miss＝找不到批閱教師的格數、un＝未排入沒印的 */
export function handPapers(X: Ctx, G: TtSnap | null): { html: string; miss: number; un: string[] } {
  const { D, M, ST } = X;
  evaluate(M, ST);
  const subs: string[] = [];
  M.ses
    .slice()
    .sort((a: any, b: any) => a.key - b.key)
    .forEach((T: any) => {
      const s = T.ref.subject;
      if (!subs.includes(s)) subs.push(s);
    });
  let miss = 0,
    h = "";
  const un: string[] = [];
  type E1 = { s: ExStudent; g: number; T: any; R: any };
  const sortS = (a: E1, b: E1) => String(a.s.cls).localeCompare(String(b.s.cls)) || (+a.s.seat || 0) - (+b.s.seat || 0) || a.T.key - b.T.key;
  const who = (s: ExStudent) => esc(s.cls) + (s.seat ? "-" + esc(String(s.seat).padStart(2, "0")) : "") + "　" + esc(s.name); // 沒有座號就只寫班級，不要印出「-00」
  subs.forEach((sj) => {
    const E: E1[] = [];
    M.parts.forEach((P: any, p: number) => {
      if (P.subject !== sj) return;
      if (ST.room[p] < 0) {
        un.push(shortName(P.stu) + "（" + sj + "）");
        return;
      } // 沒排進教室的不印，免得名單上有人卻不知道在哪一間
      const T = M.ses[ST.ses[p]];
      E.push({ s: P.stu, g: P.g, T, R: M.rooms[ST.room[p]] });
    });
    if (!E.length) return;
    // 只列真的有考這一科的年級；看不出年級的另外列在下面
    const GR = [...new Set(E.map((e) => e.g))].filter((g) => g >= 7 && g <= 9).sort(),
      oth = E.filter((e) => !(e.g >= 7 && e.g <= 9)).sort(sortS);
    const cnt = GR.map((g) => E.filter((e) => e.g === g).length),
      tot = E.length;
    // 預設和學校原本的紙本一模一樣；節次試場、簽名欄要勾選才加
    const HO = (D.settings && D.settings.hand) || {};
    const item = (e: E1) => {
      const t = graderOf(G, e.s.cls, sj);
      if (!t) miss++;
      return (
        '<div class="it"><span class="nm">' +
        who(e.s) +
        "</span>" +
        hb(D, sj, e.s.id, "in") +
        "已交" +
        hb(D, sj, e.s.id, "absent") +
        "未到</div>" +
        (HO.info ? '<div class="rv">' + esc(e.T.date + " " + (e.T.ref.period || fmt(e.T.st))) + "・" + esc(e.R.name) + (e.T.makeup ? "<b>（補）</b>" : "") + "</div>" : "") +
        '<div class="rv">批閱教師：' +
        (t ? esc(t) : '<span class="bl"></span>') +
        "</div>"
      );
    };
    h +=
      '<div class="pg hs"><div class="hst"><span>特教組特殊考場學生交卷名單 - ' +
      esc(sj) +
      "</span></div>" +
      '<div class="hsc">' +
      GR.map((g, i) => g + "年級：<b>" + cnt[i] + "</b>名").join("、") +
      (oth.length ? (GR.length ? "、" : "") + "其他：<b>" + oth.length + "</b>名" : "") +
      "，總計：<b>" +
      tot +
      "</b>名</div>" +
      (HO.sign ? '<div class="hsf">考試日期：<span class="bl"></span>　節次：<span class="bl"></span>　監考老師簽名：<span class="bl w"></span>　送交時間：<span class="bl"></span></div>' : "") +
      (GR.length
        ? "<table><tr>" +
          GR.map(
            (g) =>
              "<td>" +
              E.filter((e) => e.g === g)
                .sort(sortS)
                .map(item)
                .join("") +
              "</td>",
          ).join("") +
          "</tr></table>"
        : "") +
      (oth.length ? '<table class="oth"><tr><td><div class="rv"><b>其他（班級看不出年級）</b></div>' + oth.map(item).join("") + "</td></tr></table>" : "") +
      "</div>";
  });
  return { html: h, miss, un };
}
/** 補考名單的紙（舊版 mkHtml 去掉最前面 .noprint 那一段）；沒有人未到時 ''。free＝有沒有可以「建立補考考程」的 */
export function mkPapers(D: ExamD): { html: string; free: boolean } {
  const L = makeupList(D);
  if (!L.length) return { html: "", free: false };
  let h = '<div class="pg"><h2>' + esc(D.title) + '｜補考名單</h2><table class="out"><thead><tr><th>科目</th><th>建議時間</th><th>建議試場</th><th>人數</th><th>學生</th></tr></thead><tbody>';
  L.forEach((x) => {
    const t = x.slot;
    h +=
      '<tr><td class="sh2">' +
      esc(x.subject) +
      "</td><td>" +
      (t ? esc(t.date + (t.dow ? "（" + t.dow + "）" : "") + " " + (t.period ? t.period + " " : "") + t.start + "–" + t.end) + (x.from === "makeup" ? "<br><small>補考節</small>" : "") : "待定") +
      "</td>" +
      "<td>" +
      esc(x.room || "待定") +
      '</td><td style="text-align:center">' +
      x.students.length +
      "</td><td>" +
      x.students.map((y) => esc(y.cls + (y.seat ? "-" + y.seat : "") + " " + y.name)).join("、") +
      "</td></tr>";
  });
  return { html: h + "</tbody></table></div>", free: L.some((x) => x.from === "free") };
}
/** 監考分配表的紙（舊版 renderOut 的 proc） */
export function procPaper(X: Ctx): string {
  return '<div class="pg"><h2>' + esc(X.D.title) + "｜監考分配表</h2>" + procMatrix(X, "out") + "</div>";
}
const SVT: Record<string, string> = { 延長: "x", 口頭: "o", 誦讀: "r", 電腦: "p", 獨立: "s" };
const svTags = (l: string) =>
  l
    .split("+")
    .map((t) => '<span class="tg2 t-' + (SVT[t] || "s") + '">' + esc(t) + "</span>")
    .join("");
/** 服務表（舊版 svcHtml）；now＝製表日期 */
export function svcHtml(X: Ctx, now: Date = new Date()): string {
  const { D, M } = X;
  evaluate(M, X.ST);
  const cells = cellMap(X),
    waits = waitMap(X),
    waitRoom = M.rooms.findIndex((r: any) => r.type === "wait");
  const usedRoom = M.rooms.filter((R: any, r: number) => M.ses.some((T: any) => (cells[T.i + "|" + r] || []).length || (r === waitRoom && (waits[T.i] || []).length)));
  const dates = sortDates([...new Set(M.ses.map((s: any) => s.date as string))] as string[]),
    tr = (a: number, b: number) => fmt(a) + "–" + fmt(b),
    names = (l: number[]) => l.map((p) => esc(shortName(M.parts[p].stu))).join("、");
  // 欄寬依人數：人多的試場寬一點，整張表比較矮、字可以比較大
  const cw_: Record<number, number> = {};
  let cwSum = 0;
  usedRoom.forEach((R: any) => {
    let m = 0;
    M.ses.forEach((T: any) => {
      m = Math.max(m, (cells[T.i + "|" + R.i] || []).length, R.i === waitRoom ? (waits[T.i] || []).length : 0);
    });
    cw_[R.i] = Math.min(11, Math.max(4, m));
    cwSum += cw_[R.i];
  });
  const made = now.getFullYear() + "/" + (now.getMonth() + 1) + "/" + now.getDate();
  // 「延長」直接寫成字，黑白印也分得出來（以前只靠橘色）
  const head = (k: number) =>
    "<h2" +
    (k ? ' class="rep"' : "") +
    ">" +
    esc(D.title) +
    '</h2><div class="lg' +
    (k ? " rep" : "") +
    '">' +
    Object.keys(SVT).map(svTags).join("") +
    "　｜　「延長」後面的時間＝延長後的考試時間　｜　每格下方：主監考、支援、人數　｜　製表日期：" +
    made +
    "</div>";
  let h = "";
  for (const d of dates) {
    const list = M.ses.filter((s: any) => s.date === d).sort((a: any, b: any) => a.key - b.key);
    // 日期列和教室列放在 <thead>：表格跨頁時每一頁都會重複
    h +=
      '<div class="pg">' +
      head(dates.indexOf(d)) +
      '<table class="out svt"><colgroup><col style="width:108px">' +
      usedRoom.map((R: any) => '<col style="width:' + ((cw_[R.i] / cwSum) * 91).toFixed(2) + '%">').join("") +
      '</colgroup><thead><tr><th class="dayh" colspan="' +
      (usedRoom.length + 1) +
      '">' +
      esc(d) +
      "（星期" +
      esc(list[0].ref.dow || "") +
      '）</th></tr><tr><th class="c0">科目</th>' +
      usedRoom.map((R: any) => "<th>" + esc(R.name) + "</th>").join("") +
      "</tr></thead><tbody>";
    for (const T of list) {
      const hasE = T.est !== T.st || T.een !== T.en;
      h +=
        '<tr><td class="sh2 c0"><div class="sj">' +
        esc(sesLabel(T)) +
        '</div><div class="pd">' +
        esc(T.ref.period || "") +
        '</div><div class="tm">' +
        tr(T.st, T.en) +
        "</div>" +
        (hasE ? '<div class="tx">延長 ' + tr(T.est, T.een) + "</div>" : "") +
        "</td>";
      for (const R of usedRoom) {
        const l = cells[T.i + "|" + R.i] || [],
          w = R.i === waitRoom ? waits[T.i] || [] : [],
          key = T.id + "|" + R.id;
        if (!l.length && !w.length) {
          h += '<td class="em"></td>';
          continue;
        }
        h += "<td>";
        if (l.length) {
          if (hasE && l.some((p) => M.parts[p].ext)) h += '<div class="tx">延長 ' + tr(T.est, T.een) + "</div>";
          for (const g of groupsOf(M, l)) h += '<div class="gp">' + svTags(g.l) + names(g.ps.sort((a, b) => M.parts[b].g - M.parts[a].g || M.parts[a].si - M.parts[b].si)) + "</div>";
        }
        if (w.length) h += '<div class="gp"><span class="tg2 t-s">自習等候</span>' + names(w) + '<span class="nt">（之後補考）</span></div>';
        const rd = l.filter((p) => M.parts[p].read).length,
          n = l.length + w.length,
          mix = new Set(l.map((p) => M.parts[p].g)).size > 1;
        h +=
          '<div class="ft"><b>' +
          (l.length ? "監考" : "監視") +
          " " +
          esc(D.proctorOf[key] || "＿＿＿") +
          "</b>" +
          (D.supportOf[key] ? '<b class="sp">支援 ' + esc(D.supportOf[key]) + "</b>" : "") +
          "<span>" +
          n +
          " 人" +
          (mix ? "（" + esc(gradeCount(M, l)) + "）" : "") +
          (rd ? "・平板 " + rd : "") +
          "</span></div>";
        if (D.notes[key]) h += '<div class="nt">※ ' + esc(D.notes[key]) + "</div>";
        h += "</td>";
      }
      h += "</tr>";
    }
    h += "</tbody></table></div>";
  }
  return h;
}
/** 學生動線表（舊版 itinHtml） */
export function itinHtml(X: Ctx): string {
  const { D, M, ST } = X;
  const sesList = M.ses.slice().sort((a: any, b: any) => a.key - b.key),
    wr = M.waitRoom;
  let h =
    '<div class="pg"><h2>' +
    esc(D.title) +
    '｜學生動線表</h2><div class="lg">➜ 加粗框＝和上一場考試不同教室，要換教室　｜　「自習等候」＝這一科改到補考節，正考時段在等候教室自習</div><table class="out"><thead><tr><th>班級座號</th><th>姓名</th><th>服務</th>' +
    sesList.map((T: any) => "<th>" + esc(T.date) + "<br>" + esc(sesLabel(T)) + "<br>" + fmt(T.st) + "</th>").join("") +
    "<th>換教室</th></tr></thead><tbody>";
  const rows = M.byStu
    .map((l: number[]) => l)
    .sort((a: number[], b: number[]) => {
      const x = M.parts[a[0]].stu,
        y = M.parts[b[0]].stu;
      return gradeOf(y) - gradeOf(x) || String(x.cls).localeCompare(y.cls) || String(x.seat).localeCompare(y.seat);
    });
  for (const list of rows) {
    const stu = M.parts[list[0]].stu;
    let prev: number | null = null,
      ch = 0;
    const svs = SV.filter((v) => stu.sv[v.id] === "*" || (Array.isArray(stu.sv[v.id]) && stu.sv[v.id].length))
      .map((v) => (v.id === "small" ? "人數調整" : v.name))
      .join("、");
    h += "<tr><td>" + esc(stu.cls + (stu.seat ? "-" + stu.seat : "")) + "</td><td>" + esc(stu.name) + "</td><td>" + esc(svs) + "</td>";
    for (const T of sesList) {
      const p = list.find((q: number) => ST.ses[q] === T.i && ST.room[q] >= 0);
      // 改到補考節的學生：正考那一節要待在自習等候教室，也要寫出來，不然學生不知道該去哪裡
      const w = p == null && !T.makeup ? list.find((q: number) => ST.room[q] >= 0 && M.ses[ST.ses[q]].makeup && M.parts[q].all.includes(T.i)) : null;
      if (p == null && w == null) {
        h += "<td></td>";
        continue;
      }
      const r = p != null ? ST.room[p] : wr >= 0 ? wr : -2,
        chg = prev !== null && prev !== r;
      if (chg) ch++;
      prev = r;
      const nm = r >= 0 ? M.rooms[r].name : "自習等候",
        P = p != null ? M.parts[p] : null;
      h +=
        "<td" +
        (chg ? ' class="chg"' : "") +
        ">" +
        (chg ? "➜ " : "") +
        esc(nm) +
        (p == null ? "<br><small>自習等候（" + esc(M.parts[w!].subject) + "補考）</small>" : "") +
        (P && P.ext && (T.est !== T.st || T.een !== T.en) ? "<br><small>延長 " + fmt(T.est) + "~" + fmt(T.een) + "</small>" : "") +
        "</td>";
    }
    h += '<td style="text-align:center">' + ch + "</td></tr>";
  }
  return h + "</tbody></table></div>";
}

/* ---------- 查考場：給導師、任課老師查學生在哪裡考 ---------- */
export interface FindRow {
  si: number;
  cls: string;
  seat: string;
  name: string;
  date: string;
  dow: string;
  subj: string;
  lab: string;
  per: string;
  k: number;
  t: string;
  ext: boolean;
  room: string;
  proc: string;
  sup?: string;
  svc?: string;
  memo?: string;
}
export function findRowsAll(X: Ctx): FindRow[] {
  // 每位學生每一科：哪一天、幾點、哪一間、誰監考；svc、memo 只給組內（登入）看，不放進檢視連結
  const { D, M, ST } = X;
  const a: FindRow[] = [];
  M.parts.forEach((P: any, p: number) => {
    const x = P.stu,
      T = M.ses[ST.ses[p]],
      r = ST.room[p],
      R = r >= 0 ? M.rooms[r] : null,
      ext = !!(P.ext && (T.est !== T.st || T.een !== T.en)),
      lb = labelOf(P);
    a.push({
      si: P.si,
      cls: String(x.cls),
      seat: String(x.seat || ""),
      name: x.name || "",
      date: T.date,
      dow: T.ref.dow || "",
      subj: P.subject,
      lab: sesLabel(T),
      per: T.ref.period || "",
      k: T.key,
      t: ext ? fmt(T.est) + "～" + fmt(T.een) : fmt(T.st) + "～" + fmt(T.en),
      ext,
      room: R ? R.name : "",
      proc: R ? D.proctorOf[T.id + "|" + R.id] || "" : "",
      sup: R ? D.supportOf[T.id + "|" + R.id] || "" : "",
      svc: lb + (P.small && lb !== "獨立" ? "、人數調整" : ""),
      memo: x.memo || "",
    });
  });
  return a;
}
/** 查考場的篩選（舊版 FD） */
export interface FindFilter {
  g: string;
  cls: string;
  subj: string;
  date: string;
  q: string;
  mode: "stu" | "room";
  proc: string;
}
export const FD0: FindFilter = { g: "", cls: "", subj: "", date: "", q: "", mode: "stu", proc: "" };
export function findRows(all: FindRow[], FD: FindFilter): FindRow[] {
  const q = FD.q.trim().toLowerCase();
  return all.filter(
    (r) =>
      (!FD.g || r.cls[0] === FD.g) &&
      (!FD.cls || r.cls === FD.cls) &&
      (!FD.subj || r.subj === FD.subj) &&
      (!FD.date || r.date === FD.date) &&
      (!FD.proc || r.proc === FD.proc || r.sup === FD.proc) &&
      (!q || r.name.toLowerCase().includes(q) || (r.cls + "-" + r.seat).includes(q) || (r.cls + r.seat).includes(q)),
  );
}
const fProc = (r: FindRow) => esc(r.proc) + (r.sup ? "<br><small>支援 " + esc(r.sup) + "</small>" : "");
const fWho = (r: FindRow) => r.cls + (r.seat ? "-" + r.seat : "") + " " + r.name,
  fDay = (r: FindRow) => r.date + (r.dow ? "（" + r.dow + "）" : "");
export function findRooms(rows: FindRow[]) {
  // 依試場：同一節、同一間的學生放一起
  const g: Record<string, { k: number; r0: FindRow; list: FindRow[] }> = {};
  rows
    .filter((r) => r.room)
    .forEach((r) => {
      const key = r.k + "|" + r.lab + "|" + r.room;
      (g[key] = g[key] || { k: r.k, r0: r, list: [] }).list.push(r);
    });
  return Object.values(g).sort((a, b) => a.k - b.k || a.r0.lab.localeCompare(b.r0.lab) || a.r0.room.localeCompare(b.r0.room));
}
/** 「複製」的文字（可以貼到 LINE）；沒有內容時 '' */
export function findCopyText(rows: FindRow[], FD: FindFilter, title: string): string {
  const L = [title || "特殊試場"];
  if (!rows.length) return "";
  if (FD.mode === "room")
    findRooms(rows).forEach((G) => {
      const r = G.r0;
      L.push("", "【" + fDay(r) + " " + r.lab + "】" + r.room + (r.proc ? "｜監考 " + r.proc : "") + (r.sup ? "｜支援 " + r.sup : ""));
      G.list
        .sort((a, b) => a.cls.localeCompare(b.cls) || (+a.seat || 0) - (+b.seat || 0))
        .forEach((x) => L.push("　" + fWho(x) + "　" + x.t + (x.ext ? "（延長）" : "")));
    });
  else {
    const st = rows.slice().sort((a, b) => a.cls.localeCompare(b.cls) || (+a.seat || 0) - (+b.seat || 0) || a.si - b.si || a.k - b.k);
    let last: number | null = null;
    st.forEach((r) => {
      if (r.si !== last) {
        L.push("", "■ " + fWho(r));
        last = r.si;
      }
      L.push("　" + fDay(r) + " " + r.lab + "　" + r.t + (r.ext ? "（延長）" : "") + "　" + (r.room || "尚未排入"));
    });
  }
  return L.join("\n");
}
/** 檢視連結的資料（VR） */
export interface ViewData {
  title: string;
  rows: FindRow[];
  cls?: string;
  exp?: Date | null;
  all?: boolean;
}
/** 查考場的表格（舊版 renderFind 的 #findOut）。VR＝用檢視連結打開時；沒有符合的學生時回傳 null（畫面畫空白狀態） */
export function findHtml(all: FindRow[], FD: FindFilter, VR: ViewData | null): string | null {
  const flt = findRows(all, FD),
    inGrp = !VR; // 組內（登入或本機）看得到服務內容
  const rows = flt.slice().sort((a, b) => a.cls.localeCompare(b.cls) || (+a.seat || 0) - (+b.seat || 0) || a.si - b.si || a.k - b.k);
  const n = new Set(rows.map((r) => r.si)).size;
  if (!rows.length) return null;
  const xd = VR && VR.exp ? new Date(VR.exp.getTime() - 1) : null,
    ex = xd ? xd.getFullYear() + "/" + (xd.getMonth() + 1) + "/" + xd.getDate() : ""; // exp 是隔天 0 點，顯示「用到哪一天」
  let h =
    (VR && VR.all ? '<div class="warnbox noprint">' + ic("alert") + " 全校名單，只給特教組和行政，請勿轉傳。</div>" : "") +
    '<div class="fsum">' +
    n +
    " 位、" +
    rows.length +
    " 場。沒列出的學生在原班考。" +
    (ex ? "連結到 " + ex + " 失效。" : "") +
    "</div>";
  if (FD.mode === "room") {
    const G = findRooms(rows);
    h += '<table class="find"><thead><tr><th>日期</th><th>科目</th><th>試場</th><th>監考</th><th>人數</th><th>學生</th></tr></thead>';
    for (let i = 0; i < G.length; ) {
      let j = i;
      while (j < G.length && G[j].k === G[i].k && G[j].r0.lab === G[i].r0.lab) j++;
      for (let k = i; k < j; k++) {
        const r = G[k].r0,
          L = G[k].list.sort((a, b) => a.cls.localeCompare(b.cls) || (+a.seat || 0) - (+b.seat || 0));
        h +=
          "<tr" +
          (k === i ? ' class="top"' : "") +
          ">" +
          (k === i
            ? '<td class="who" rowspan="' + (j - i) + '">' + esc(fDay(r)) + '</td><td class="who" rowspan="' + (j - i) + '">' + esc(r.lab) + "<br><small>" + esc(r.per) + "</small></td>"
            : "") +
          '<td class="room">' +
          esc(r.room) +
          "</td><td>" +
          fProc(r) +
          "</td><td>" +
          L.length +
          '</td><td class="l">' +
          L.map(
            (x) =>
              '<span class="st">' + esc(fWho(x)) + (x.ext ? '<span class="tg">延長 ' + esc(x.t) + "</span>" : "") + (inGrp && x.svc ? ' <span class="sv">' + esc(x.svc) + "</span>" : "") + "</span>",
          ).join("") +
          "</td></tr>";
      }
      i = j;
    }
    if (rows.some((r) => !r.room))
      h +=
        '<tr class="top"><td colspan="6" style="color:var(--bad)">尚未排入：' +
        esc(
          rows
            .filter((r) => !r.room)
            .map((r) => fWho(r) + "（" + r.lab + "）")
            .join("、"),
        ) +
        "</td></tr>";
  } else {
    h +=
      '<table class="find"><thead><tr><th>班級座號</th><th>姓名</th><th>日期</th><th>科目</th><th>時間</th><th>試場</th><th>監考</th>' + (inGrp ? "<th>服務</th>" : "") + "</tr></thead>";
    for (let i = 0; i < rows.length; ) {
      let j = i;
      while (j < rows.length && rows[j].si === rows[i].si) j++;
      for (let k = i; k < j; k++) {
        const r = rows[k];
        h +=
          "<tr" +
          (k === i ? ' class="top"' : "") +
          ">" +
          (k === i
            ? '<td class="who" rowspan="' +
              (j - i) +
              '">' +
              esc(r.cls + (r.seat ? "-" + r.seat : "")) +
              '</td><td class="who" rowspan="' +
              (j - i) +
              '">' +
              esc(r.name) +
              (inGrp && r.memo ? '<br><small style="font-weight:normal;white-space:normal">' + esc(r.memo) + "</small>" : "") +
              "</td>"
            : "") +
          "<td>" +
          esc(fDay(r)) +
          "</td><td>" +
          esc(r.lab) +
          "<br><small>" +
          esc(r.per) +
          "</small></td>" +
          "<td>" +
          esc(r.t) +
          (r.ext ? '<span class="tg">延長</span>' : "") +
          "</td>" +
          (r.room ? '<td class="room">' + esc(r.room) + "</td><td>" + fProc(r) + "</td>" : '<td colspan="2" style="color:var(--bad)">尚未排入</td>') +
          (inGrp ? '<td class="sv">' + esc(r.svc || "") + "</td>" : "") +
          "</tr>";
      }
      i = j;
    }
  }
  return h + "</table>";
}

/* ---------- 檢視連結 ---------- */
// 姓名遮一個字：王小明→王○明、陳華→陳○、歐陽小明→歐○○明
export function maskName(n: unknown): string {
  n = String(n || "");
  const s = n as string;
  if (s.length < 2) return s;
  if (s.length === 2) return s[0] + "○";
  return s[0] + "○".repeat(s.length - 2) + s[s.length - 1];
}
export const viewClasses = (D: ExamD) => [...new Set(D.students.filter((x) => x.on !== false && x.cls).map((x) => String(x.cls)))].sort();
export const clsSafe = (c: string) => String(c).replace(/[^0-9A-Za-z]/g, "") || "x";
// 檢視連結的有效期限：最後一天考試後 7 天；讀不出日期就 30 天後
export function viewExp(D: ExamD, now?: Date): Date {
  const ds = sortDates([...new Set(D.sessions.map((s) => s.date))]),
    last = ds.length ? dateOf(D, ds[ds.length-1], (D.sessions.find((s) => s.date === ds[ds.length - 1]) || ({} as any)).dow, now) : null;
  const d = last ? new Date(last.getFullYear(), last.getMonth(), last.getDate() + 8) : new Date((now ? now.getTime() : Date.now()) + 30 * 864e5);
  return d;
} // +8 天的 0 點＝第 7 天整天都能用
export function viewExpTxt(D: ExamD, now?: Date): string {
  const d = new Date(viewExp(D, now).getTime() - 1);
  return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
}
/** 檢視連結的內容（舊版 linkPush）：全校一份（全名、不含服務與備註）、每一班一份（姓名遮一字、欄位最少） */
export function viewDocs(X: Ctx, vcls: Record<string, string>): { all: { v: number; title: string; all: true; rows: string }; cls: Record<string, { v: number; title: string; cls: string; rows: string }> } {
  const all = findRowsAll(X),
    title = X.D.title || "";
  const out = {
    all: {
      v: 3,
      title,
      all: true as const,
      rows: JSON.stringify(
        all.map((r) => {
          const o: Partial<FindRow> = Object.assign({}, r);
          delete o.svc;
          delete o.memo;
          return o;
        }),
      ),
    },
    cls: {} as Record<string, { v: number; title: string; cls: string; rows: string }>,
  };
  for (const c in vcls) {
    const rows = all
      .filter((r) => r.cls === c)
      .map((r) => ({ si: r.si, cls: r.cls, seat: r.seat, name: maskName(r.name), date: r.date, dow: r.dow, subj: r.subj, lab: r.lab, per: r.per, k: r.k, t: r.t, ext: r.ext, room: r.room, proc: r.proc }));
    out.cls[vcls[c]] = { v: 3, title, cls: c, rows: JSON.stringify(rows) };
  }
  return out;
}

/* ---------- 列印：服務表每天一頁，內容稍多就縮小一點；縮到 70% 還放不下，就讓它自然分頁（表頭每頁重複） ---------- */
const PGW = 1056,
  PGH = 710,
  ZMIN = 0.7; // A4 橫向、邊界 8mm 的可用範圍（px）
export function fitPrint(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("#outArea .pg").forEach((el) => {
    el.style.zoom = "";
    el.classList.remove("flow");
    const hs = el.classList.contains("hs"),
      PW = hs ? 718 : PGW,
      PH = hs ? 1040 : PGH; // 交卷名單是 A4 直式
    const fits = (z: number) => {
      el.style.width = PW / z + "px";
      return el.offsetHeight * z <= PH;
    };
    let z = 1;
    if (!fits(1)) {
      let lo = ZMIN,
        hi = 1;
      if (fits(lo)) {
        for (let i = 0; i < 9; i++) {
          const m = (lo + hi) / 2;
          if (fits(m)) lo = m;
          else hi = m;
        }
      } else el.classList.add("flow");
      z = lo;
    }
    el.style.width = PW / z + "px";
    el.style.zoom = String(z);
  });
}
export function unfitPrint(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("#outArea .pg").forEach((el) => {
    el.style.zoom = "";
    el.style.width = "";
    el.classList.remove("flow");
  });
}

/** 段考的待辦（舊 app.js examInfo）：已排／全部科次 */
export function examProgress(D: ExamD | null): { total: number; placed: number } | null {
  if (!D || !Array.isArray(D.students)) return null;
  const a = Object.values(D.assign || {});
  return { total: a.length, placed: a.filter((x) => x && x.room).length };
}
export { dateKey, hm, normDate };

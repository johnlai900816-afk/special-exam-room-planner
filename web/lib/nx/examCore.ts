/* eslint-disable @typescript-eslint/no-explicit-any */
/* 段考考場的核心（舊版 exam.html 的 /*CORE-START*\/…/*CORE-END*\/ 那一段），逐行照搬：
   排列（compile、evaluate、solve）、狀態轉換（toState、fromState）、服務從 IEP 帶入、開始新段考、補考名單。
   舊版沒有拆成獨立檔（exam.html 自己一頁），所以這裡是複製；test/exam.test.ts 把 exam.html 的原文放在沙盒裡跑，
   同樣的輸入（含自習教室開放考試、補考節、分年級、口頭獨立…）排出來的結果一模一樣。改這裡要一起改 exam.html。 */

export type Scope = "*" | string[];
export type Sv = Partial<Record<"ext" | "read" | "oral" | "pc" | "small", Scope>>;
export interface ExStudent {
  id: string;
  cls: string;
  seat: string;
  name: string;
  sv: Sv;
  memo: string;
  on: boolean;
  /** 已經和名冊連上（exam.html 的 rs） */
  rs?: number;
  chk?: string;
  hold?: number;
  svFromRoster?: string;
  [k: string]: unknown;
}
export interface ExSession {
  id: string;
  date: string;
  dow: string;
  period: string;
  subject: string;
  grades: number[];
  start: string;
  end: string;
  extMin: number | string;
  extMode: "before" | "after" | string;
  oralCap: number | string;
  split: boolean;
  noRead: boolean;
  makeup: boolean;
  oralSep: boolean;
  /** 自習教室開放考試 */
  waitExam: boolean;
  [k: string]: unknown;
}
export interface ExRoom {
  id: string;
  name: string;
  cap: number | string;
  type: "normal" | "pc" | "spare" | "wait" | string;
}
export interface ProctorInfo {
  teach?: number | string;
  quota?: number | string;
  note?: string;
  off?: string[];
  temp?: boolean;
  only?: string[];
  oralOnly?: boolean;
  autoT?: number;
  [k: string]: unknown;
}
export interface AssignCell {
  ses: string;
  room: string | null;
  pin: boolean;
}
/** exam.html 的整份資料（localStorage special-exam-room-v1、Firestore exams/main.json） */
export interface ExamD {
  title: string;
  students: ExStudent[];
  sessions: ExSession[];
  rooms: ExRoom[];
  proctors: string[];
  settings: { smallMax?: number | string; pref?: number; seed?: number; pv?: number; hand?: Record<string, number>; [k: string]: unknown };
  assign: Record<string, AssignCell>;
  proctorOf: Record<string, string>;
  supportOf: Record<string, string>;
  procMan?: Record<string, number>;
  supMan?: Record<string, number>;
  proctorInfo: Record<string, ProctorInfo>;
  notes: Record<string, string>;
  handIn: Record<string, Record<string, "in" | "absent">>;
  ttCopy?: TtSnap | null;
  [k: string]: unknown;
}
/** 全校課表與任課老師的副本（批閱教師用） */
export interface TtSnap {
  tt: Record<string, any>;
  cs: Record<string, string>;
}
/** compile 的結果（排列用的模型；陣列欄位是 typed array，和舊版一樣） */
export type ExModel = any;
/** 排法：每一科次在哪一節、哪一間（-1＝未排入）、固定 */
export interface ExState {
  ses: Int16Array;
  room: Int16Array;
  pin: Uint8Array;
  cost?: number;
}

export const SV = [
  { id: "ext", name: "延長" },
  { id: "read", name: "誦讀" },
  { id: "oral", name: "口頭" },
  { id: "pc", name: "電腦" },
  { id: "small", name: "獨立" },
] as const;
export const GN: Record<number | string, string> = { 7: "七", 8: "八", 9: "九" };
export function defaultData(): ExamD {
  const A = "*",
    KW = ["國文", "作文"];
  const S = (cls: string, seat: string, name: string, sv: Sv, memo?: string, on?: boolean): ExStudent => ({ id: cls + "-" + seat + name, cls, seat, name, sv, memo: memo || "", on: on !== false });
  const T = (id: string, date: string, dow: string, period: string, subject: string, grades: number[], start: string, end: string, extMin: number, extMode: string, o?: Partial<ExSession>): ExSession =>
    Object.assign({ id, date, dow, period, subject, grades, start, end, extMin, extMode, oralCap: 8, split: false, noRead: false, makeup: false, oralSep: false, waitExam: false }, o || {});
  const G = [7, 8, 9];
  return {
    title: "○○學年度第○學期 第○次段考服務表（範例資料）",
    students: [
      S("901", "01", "王小明", { ext: A }),
      S("901", "02", "陳小華", { small: A }),
      S("902", "03", "林小美", { read: A, oral: KW }),
      S("903", "04", "張小安", { pc: KW }),
      S("801", "05", "李小芳", { read: A }),
      S("802", "06", "黃小傑", { small: A, ext: A }),
      S("803", "07", "吳小婷", { oral: KW }),
      S("701", "08", "劉小宇", { ext: A }),
      S("702", "09", "蔡小晴", { read: A, small: A }),
      S("703", "10", "楊小恩", { pc: KW, ext: KW }),
    ],
    sessions: [
      T("d1p1", "12/1", "二", "第1節", "作文", G, "08:20", "09:05", 20, "before", { oralCap: 2, noRead: true, oralSep: true }),
      T("d1p2", "12/1", "二", "第2節", "數學", G, "09:15", "10:00", 20, "after"),
      T("d1p3", "12/1", "二", "第3節", "作文", G, "10:10", "10:55", 0, "after", { oralCap: 2, noRead: true, makeup: true, oralSep: true }),
      T("d1p4", "12/1", "二", "第4節", "英文", G, "11:05", "11:50", 20, "before", { oralCap: 3, split: true }),
      T("d1p5", "12/1", "二", "第5節", "地科", [9], "13:10", "13:55", 20, "after"),
      T("d1p7", "12/1", "二", "第7節", "社會", G, "15:10", "15:55", 20, "before"),
      T("d2p2", "12/2", "三", "第2節", "國文", G, "09:15", "10:00", 20, "after", { oralCap: 7, oralSep: true }),
      T("d2p4", "12/2", "三", "第4節", "生物/理化", G, "11:05", "11:50", 20, "before"),
    ],
    rooms: [
      { id: "A", name: "環教中心", cap: 20, type: "normal" },
      { id: "B", name: "學中一", cap: 8, type: "normal" },
      { id: "C", name: "學中二", cap: 8, type: "normal" },
      { id: "D", name: "學中三", cap: 8, type: "normal" },
      { id: "E", name: "學中四", cap: 8, type: "normal" },
      { id: "F", name: "電腦教室", cap: 30, type: "pc" },
      { id: "G", name: "特教辦公室", cap: 2, type: "spare" },
      { id: "H", name: "綠光教室", cap: 30, type: "wait" },
    ],
    proctors: ["老師A", "老師B", "老師C", "老師D", "老師E", "老師F"],
    settings: { smallMax: 20, pref: 50, seed: 1, pv: 2 },
    assign: {},
    proctorOf: {},
    supportOf: {},
    proctorInfo: {},
    notes: {},
    handIn: {},
  };
}
export function hm(s: unknown): number {
  const a = String(s || "0:0").split(":");
  return +a[0] * 60 + (+a[1] || 0);
}
export function fmt(m: number): string {
  return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
}
export function gradeOf(stu: { cls: unknown }): number {
  const g = parseInt(String(stu.cls).trim()[0], 10);
  return isNaN(g) ? 0 : g;
}
export function shortName(stu: { cls: unknown; name?: unknown }): string {
  const n = String(stu.name || "");
  return stu.cls + (n.length >= 3 ? n.slice(1) : n);
}
export function applies(scope: unknown, subject: string): boolean {
  return scope === "*" || (Array.isArray(scope) && scope.includes(subject));
}
export function weights(pref: unknown) {
  const x = (pref == null ? 50 : +pref) / 100;
  return { room: 6 + 18 * (1 - x), change: 0.5 + 5 * x, distinct: 1, mix: 4, extSplit: 300, makeup: 0.5 };
}
export function labelOf(P: any): string {
  const a: string[] = [];
  if (P.oral) a.push("口頭");
  if (P.ext) a.push("延長");
  if (P.read) a.push("誦讀");
  if (P.pc) a.push("電腦");
  return a.length ? a.join("+") : "獨立";
}
export function labelRank(P: any): number {
  return P.pc ? 0 : P.ext ? 1 : !P.read && !P.oral ? 2 : P.read && !P.oral ? 3 : 4;
}
// 人數上限留白＝不限（以前留白會被當成 0，整間都排不進去）
export function capOf(v: unknown): number {
  return v === "" || v == null ? 999 : +v || 0;
}
export const capTxt = (c: number) => (c >= 999 ? "不限" : String(c));
// 日期統一寫成「12/1」或「2025/12/1」：「12/01」「12月1日」都會變成同一天
export function normDate(s: unknown): string {
  const t = String(s == null ? "" : s).trim(),
    m = t.match(/^(?:(\d{2,4})\s*[\/.\-年]\s*)?(\d{1,2})\s*[\/.\-月]\s*(\d{1,2})\s*日?$/);
  if (!m) return t;
  return (m[1] ? +m[1] + "/" : "") + +m[2] + "/" + +m[3];
}
// 排序用：有寫年就照年；沒寫年就照學年（8 月以後在前、1～7 月在後）
export function dateKey(s: unknown): number {
  const m = normDate(s).match(/^(?:(\d+)\/)?(\d+)\/(\d+)$/);
  if (!m) return 9e8;
  let y = m[1] ? +m[1] : 0;
  if (y && y < 1000) y += 1911;
  const mo = +m[2],
    d = +m[3];
  return y ? y * 10000 + mo * 100 + d : (mo >= 8 ? 0 : 1) * 10000 + mo * 100 + d;
}
export function sortDates(a: string[]): string[] {
  return a.slice().sort((x, y) => dateKey(x) - dateKey(y));
}
export function hasSvc(stu: { sv?: Sv }): boolean {
  return SV.some((v) => {
    const x = stu.sv && stu.sv[v.id];
    return x === "*" || (Array.isArray(x) && x.length > 0);
  });
}

export function compile(D: ExamD): ExModel {
  const rooms = D.rooms.map((r, i) => ({ i, id: r.id, name: r.name, cap: capOf(r.cap), type: r.type || "normal" }));
  const dates = sortDates([...new Set(D.sessions.map((s) => s.date))]);
  const ses = D.sessions.map((s, i) => {
    const st = hm(s.start),
      en = hm(s.end),
      e = +s.extMin || 0;
    return {
      i,
      id: s.id,
      ref: s,
      date: s.date,
      subject: s.subject,
      st,
      en,
      est: s.extMode === "before" ? st - e : st,
      een: s.extMode === "after" ? en + e : en,
      oralCap: s.oralCap === "" || s.oralCap == null ? 99 : +s.oralCap,
      split: !!s.split,
      makeup: !!s.makeup,
      oralSep: !!s.oralSep,
      waitExam: !!s.waitExam,
      grades: s.grades || [],
      key: dates.indexOf(s.date) * 10000 + st,
    };
  });
  const subj: Record<string, { name: string; ses: number[]; noRead: boolean }> = {};
  ses.forEach((s) => {
    const o = (subj[s.subject] = subj[s.subject] || { name: s.subject, ses: [], noRead: false });
    o.ses.push(s.i);
    if (s.ref.noRead) o.noRead = true;
  });
  const parts: any[] = [],
    byStu: number[][] = [],
    noPart: any[] = [],
    multi: Record<string, any> = {};
  D.students.forEach((stu, si) => {
    if (!stu.on) return;
    const g = gradeOf(stu),
      list: number[] = [];
    let anySubj = false;
    for (const name in subj) {
      const sj = subj[name],
        f: Record<string, boolean> = {};
      let any = false;
      for (const v of SV) {
        let a = applies(stu.sv && stu.sv[v.id], name);
        if (v.id === "read" && sj.noRead) a = false;
        f[v.id] = a;
        any = any || a;
      }
      if (!any) continue;
      anySubj = true;
      const cand = sj.ses.filter((t) => ses[t].grades.includes(g)).sort((a, b) => +ses[a].makeup - +ses[b].makeup || ses[a].key - ses[b].key);
      if (!cand.length) continue;
      const mains = cand.filter((t) => !ses[t].makeup);
      const mk = (opts: number[], all: number[], key: string) => {
        const P: any = Object.assign({ p: parts.length, si, stu, subject: name, key, g, opts, all }, f);
        P.kind = P.pc ? "pc" : P.ext ? "ext" : P.oral ? "oral" : P.read ? "read" : "small";
        list.push(P.p);
        parts.push(P);
      };
      // 同一年級、同一科有兩個以上正式節次（例：一科分兩節考）：每一節各排一次，學生才不會只出現在其中一節
      if (mains.length > 1) {
        mains.forEach((t) => mk([t], [t], name + "@" + ses[t].id));
        multi[g + "|" + name] = { g, subject: name, n: mains.length, mk: cand.length > mains.length };
      } else mk(f.oral ? cand : mains.length ? mains : cand, cand, name);
    }
    if (list.length) byStu.push(list);
    // 有服務卻一節都沒排進去：通常是班級打錯（看不出年級），或考程裡沒有他那個年級
    else if (hasSvc(stu))
      noPart.push({ stu, why: !g ? "班級「" + (stu.cls || "") + "」看不出年級" : !anySubj ? "服務的科目都不在這次考程裡" : "考程裡沒有" + (GN[g] || g) + "年級的節次" });
  });
  const pairs: [number, number][] = [];
  for (let a = 0; a < ses.length; a++)
    for (let b = a + 1; b < ses.length; b++) if (ses[a].date === ses[b].date && ses[a].est < ses[b].een && ses[b].est < ses[a].een) pairs.push([a, b]);
  const n = ses.length * rooms.length;
  return {
    D,
    rooms,
    ses,
    subj,
    parts,
    byStu,
    noPart,
    multi: Object.values(multi),
    waitRoom: rooms.findIndex((r) => r.type === "wait"),
    c_wait: new Int16Array(ses.length),
    pairs,
    W: weights(D.settings.pref),
    smallMax: +(D.settings.smallMax as number) || 99,
    pcRooms: rooms.filter((r) => r.type === "pc").map((r) => r.i), // 有任何一節勾了「自習教室開放考試」，自習等候教室也列入候選；沒勾的節次排進去會算違規，排列時自然會避開
    exRooms: rooms.filter((r) => r.type === "normal" || r.type === "spare" || (r.type === "wait" && ses.some((s) => s.waitExam))).map((r) => r.i),
    c_cnt: new Int16Array(n),
    c_ext: new Int16Array(n),
    c_any: new Int16Array(n),
    c_oral: new Int16Array(n),
    c_small: new Int16Array(n),
    c_gm: new Int32Array(n),
    c_eg: new Int32Array(n),
    c_gc: new Int16Array(n * 10),
  };
}
function pop(x: number): number {
  let c = 0;
  while (x) {
    c += x & 1;
    x >>>= 1;
  }
  return c;
}
export function sesLabel(T: { subject: string; makeup?: boolean }): string {
  return T.subject + (T.makeup ? "（補）" : "");
}

export interface EvalOut {
  msgs: { t: number; r: number; lvl: string; m: string }[];
  unassigned: number;
  uses?: number;
  changes?: number;
}
export function evaluate(M: ExModel, S: ExState, out?: EvalOut): number {
  const nS = M.ses.length,
    nR = M.rooms.length,
    W = M.W,
    H = M.H || 1000;
  let viol = 0;
  const cnt = M.c_cnt,
    ext = M.c_ext,
    any = M.c_any,
    oral = M.c_oral,
    small = M.c_small,
    gm = M.c_gm,
    eg = M.c_eg,
    gc = M.c_gc;
  const wait = M.c_wait;
  gc.fill(0);
  cnt.fill(0);
  ext.fill(0);
  any.fill(0);
  oral.fill(0);
  small.fill(0);
  gm.fill(0);
  eg.fill(0);
  wait.fill(0);
  let cost = 0;
  const msg = out ? (t: number, r: number, lvl: string, m: string) => out.msgs.push({ t, r, lvl, m }) : null;
  for (let p = 0; p < M.parts.length; p++) {
    const P = M.parts[p],
      t = S.ses[p],
      r = S.room[p];
    if (r < 0) {
      viol++;
      if (out) out.unassigned++;
      continue;
    }
    if (M.ses[t].makeup) for (const u of P.all) if (!M.ses[u].makeup) wait[u]++; // 改到補考節的學生，正考時段在自習等候教室
    const k = t * nR + r,
      R = M.rooms[r];
    cnt[k]++;
    if (P.ext) {
      any[k]++;
      if (!P.pc) {
        ext[k]++;
        eg[k] |= 1 << P.g;
      }
    }
    if (P.oral) oral[k]++;
    if (P.small) small[k]++;
    gm[k] |= 1 << P.g;
    gc[k * 10 + P.g]++;
    if (R.type === "wait" && !M.ses[t].waitExam) {
      viol++;
      if (msg) msg(t, r, "err", shortName(P.stu) + " 排在自習等候教室，這一節沒有開放考試");
    } else if (P.pc && R.type !== "pc" && M.pcRooms.length) {
      viol++;
      if (msg) msg(t, r, "err", shortName(P.stu) + " 需要電腦作答，這間不是電腦教室");
    } else if (!P.pc && R.type === "pc") {
      viol++;
      if (msg) msg(t, r, "err", shortName(P.stu) + " 不需電腦，卻排在電腦教室");
    }
    if (M.ses[t].makeup) cost += W.makeup;
  }
  let uses = 0;
  for (let t = 0; t < nS; t++) {
    const T = M.ses[t];
    let extRooms = 0;
    if (wait[t]) {
      const wr = M.waitRoom;
      if (wr < 0) {
        if (msg) msg(t, -1, "warn", "有 " + wait[t] + " 位學生改到補考節，但教室裡沒有設定「自習等候」，正考時段不知道要待在哪裡");
      } else if (!cnt[t * nR + wr]) {
        const cap = M.rooms[wr].cap;
        if (wait[t] > cap) {
          viol += wait[t] - cap;
          if (msg) msg(t, wr, "err", "自習等候 " + wait[t] + " 人，超過容量 " + cap);
        }
      }
    } // 有人在這間考試時，容量在下面一起算
    for (let r = 0; r < nR; r++) {
      const k = t * nR + r,
        c = cnt[k];
      if (!c) continue;
      const R = M.rooms[r],
        wt = r === M.waitRoom ? wait[t] : 0;
      // 自習教室開放考試：多用一間要多一位監考，所以算成本；已經有自習學生、本來就有人監視，成本低一點
      if (R.type !== "wait") {
        uses++;
        cost += W.room * (R.type === "spare" ? 2.5 : 1) + 0.2 * r;
      } else {
        uses++;
        cost += W.room * (wt ? 0.8 : 1.5) + 0.2 * r;
      }
      if (c + wt > R.cap) {
        viol += c + wt - R.cap;
        if (msg) msg(t, r, "err", "超過容量（" + (wt ? "考試 " + c + "＋自習 " + wt + "＝" + (c + wt) : c) + "／" + R.cap + "）");
      }
      // 口頭作答要出聲，不能和自習等候的學生同一間（自習的人會被打擾，也聽得到答案）
      if (wt && oral[k]) {
        viol += oral[k];
        if (msg) msg(t, r, "err", "口頭作答的學生不能和自習等候的學生同一間");
      }
      if (oral[k] > T.oralCap) {
        viol += oral[k] - T.oralCap;
        if (msg) msg(t, r, "err", "口頭學生 " + oral[k] + " 人，超過上限 " + T.oralCap);
      }
      if (small[k] && c > M.smallMax) {
        viol += c - M.smallMax;
        if (msg) msg(t, r, "err", "有人數調整學生，但本間 " + c + " 人超過 " + M.smallMax);
      }
      if (T.split) {
        const n = pop(gm[k]);
        if (n > 1) {
          let mx = 0;
          for (let g = 0; g < 10; g++) if (gc[k * 10 + g] > mx) mx = gc[k * 10 + g];
          viol += c - mx;
          if (msg) msg(t, r, "err", "本科要分年級，這間混了 " + n + " 個年級");
        }
      }
      if (R.type !== "pc" && oral[k] && oral[k] < c) {
        if (T.oralSep) {
          cost += 200 * Math.min(oral[k], c - oral[k]);
          if (msg) msg(t, r, "warn", "口頭學生和其他學生混在同一間");
        } else cost += W.mix;
      }
      if (ext[k]) extRooms++;
    }
    if (!T.split) {
      if (extRooms > 1) {
        cost += W.extSplit * (extRooms - 1);
        if (msg) msg(t, -1, "warn", "延長學生被分在 " + extRooms + " 間試場");
      }
    } else
      for (let g = 0; g < 10; g++) {
        let n = 0;
        for (let r = 0; r < nR; r++) if (eg[t * nR + r] & (1 << g)) n++;
        if (n > 1) {
          cost += W.extSplit * (n - 1);
          if (msg) msg(t, -1, "warn", (GN[g] || g) + "年級延長學生被分在 " + n + " 間試場");
        }
      }
  }
  for (const pr of M.pairs) {
    const a = M.ses[pr[0]],
      b = M.ses[pr[1]];
    for (let r = 0; r < nR; r++) {
      const ka = pr[0] * nR + r,
        kb = pr[1] * nR + r;
      if (!cnt[ka] || !cnt[kb]) continue;
      const as = any[ka] ? a.est : a.st,
        ae = any[ka] ? a.een : a.en,
        bs = any[kb] ? b.est : b.st,
        be = any[kb] ? b.een : b.en;
      if (as < be && bs < ae) {
        viol++;
        if (msg) msg(pr[1], r, "err", "時間重疊：" + sesLabel(a) + " " + fmt(as) + "~" + fmt(ae) + " 還在用這間");
      }
    }
  }
  let changes = 0;
  const tk = M._tk || (M._tk = []),
    tp = M._tp || (M._tp = []);
  for (const list of M.byStu) {
    let n = 0;
    for (const p of list) {
      if (S.room[p] < 0) continue;
      const key = M.ses[S.ses[p]].key;
      let j = n++;
      while (j > 0 && tk[j - 1] > key) {
        tk[j] = tk[j - 1];
        tp[j] = tp[j - 1];
        j--;
      }
      tk[j] = key;
      tp[j] = p;
    }
    let ch = 0,
      dist = 0;
    for (let i = 0; i < n; i++) {
      const p = tp[i],
        r = S.room[p];
      let seen = false;
      for (let j = 0; j < i; j++)
        if (S.room[tp[j]] === r) {
          seen = true;
          break;
        }
      if (!seen) dist++;
      if (i > 0) {
        const q = tp[i - 1];
        if (S.room[q] !== r) ch++;
        const Ta = M.ses[S.ses[q]],
          Tb = M.ses[S.ses[p]];
        if (Ta.date === Tb.date) {
          const ae = M.parts[q].ext ? Ta.een : Ta.en,
            bs = M.parts[p].ext ? Tb.est : Tb.st;
          if (bs < ae) {
            viol++;
            if (msg) msg(S.ses[p], S.room[p], "err", shortName(M.parts[p].stu) + " 與 " + sesLabel(Ta) + " 時間重疊");
          }
        }
      }
    }
    changes += ch;
    cost += W.change * ch + W.distinct * Math.max(0, dist - 1);
  }
  if (out) {
    out.uses = uses;
    out.changes = changes;
  }
  M.viol = viol;
  return cost + H * viol;
}
export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function solve(M: ExModel, S0: ExState, opt?: { iters?: number; restarts?: number; seed?: number }): ExState {
  opt = opt || {};
  const N = opt.iters || 60000,
    RS = opt.restarts || 4;
  const rnd = mulberry32(opt.seed || 1),
    ri = (n: number) => Math.floor(rnd() * n);
  const free: number[] = [];
  for (let p = 0; p < M.parts.length; p++) if (!S0.pin[p]) free.push(p);
  if (!free.length || !M.exRooms.length) return S0;
  const isPc = (p: number) => M.parts[p].pc && M.pcRooms.length > 0;
  const allowed = (p: number): number[] => (isPc(p) ? M.pcRooms : M.exRooms);
  const ex = M.exRooms,
    nS = M.ses.length;
  let best: ExState | null = null,
    bestC = Infinity;
  const lp = new Int32Array(4000),
    ls = new Int16Array(4000),
    lr = new Int16Array(4000);
  const mark = new Uint8Array(M.D.students.length);
  for (let rs = 0; rs < RS; rs++) {
    const S: ExState = { ses: Int16Array.from(S0.ses), room: Int16Array.from(S0.room), pin: S0.pin };
    for (const p of free) {
      S.ses[p] = M.parts[p].opts[0];
      S.room[p] = allowed(p)[0];
    }
    let ln = 0;
    const set = (p: number, t: number, r: number) => {
      if (S.ses[p] === t && S.room[p] === r) return;
      lp[ln] = p;
      ls[ln] = S.ses[p];
      lr[ln] = S.room[p];
      ln++;
      S.ses[p] = t;
      S.room[p] = r;
    };
    M.H = 1000;
    const c0 = evaluate(M, S);
    let curV = M.viol,
      curSoft = c0 - 1000 * curV;
    if (c0 < bestC) {
      bestC = c0;
      best = { ses: Int16Array.from(S.ses), room: Int16Array.from(S.room), pin: S0.pin };
    }
    const T0 = 40,
      T1 = 0.05;
    for (let i = 0; i < N; i++) {
      const T = T0 * Math.pow(T1 / T0, i / N),
        m = rnd();
      ln = 0;
      M.H = Math.min(1000, 15 * Math.pow(1000 / 15, i / (0.35 * N)));
      if (m < 0.35) {
        const p = free[ri(free.length)],
          P = M.parts[p];
        let t = S.ses[p];
        if (P.opts.length > 1 && rnd() < 0.3) t = P.opts[ri(P.opts.length)];
        const a = allowed(p);
        set(p, t, a[ri(a.length)]);
      } else if (m < 0.5) {
        const list = M.byStu[ri(M.byStu.length)],
          r = ex[ri(ex.length)];
        for (const p of list) if (!S.pin[p] && !isPc(p)) set(p, S.ses[p], r);
      } else if (m < 0.72) {
        const p0 = free[ri(free.length)];
        if (isPc(p0)) continue;
        const t = S.ses[p0],
          r0 = S.room[p0],
          kind = M.parts[p0].kind,
          g = M.parts[p0].g,
          mode = rnd(),
          r = ex[ri(ex.length)];
        for (const p of free)
          if (S.ses[p] === t && S.room[p] === r0 && !isPc(p) && (mode < 0.3 || (M.parts[p].kind === kind && (mode < 0.65 || M.parts[p].g === g)))) set(p, t, r);
      } else if (m < 0.82) {
        const t = ri(nS),
          a = ex[ri(ex.length)],
          b = ex[ri(ex.length)];
        if (a === b) continue;
        for (const p of free) {
          if (S.ses[p] !== t || isPc(p)) continue;
          if (S.room[p] === a) set(p, t, b);
          else if (S.room[p] === b) set(p, t, a);
        }
      } else {
        const p0 = free[ri(free.length)];
        if (isPc(p0)) continue;
        const t = S.ses[p0],
          r0 = S.room[p0],
          kind = M.parts[p0].kind,
          g = M.parts[p0].g,
          mode = rnd(),
          r = ex[ri(ex.length)];
        mark.fill(0);
        for (const p of free)
          if (S.ses[p] === t && S.room[p] === r0 && !isPc(p) && (mode < 0.3 || (M.parts[p].kind === kind && (mode < 0.65 || M.parts[p].g === g)))) mark[M.parts[p].si] = 1;
        for (const p of free) if (mark[M.parts[p].si] && !isPc(p)) set(p, S.ses[p], r);
      }
      if (!ln) continue;
      const c = evaluate(M, S),
        v = M.viol,
        soft = c - M.H * v,
        cur = curSoft + M.H * curV;
      if (c <= cur || rnd() < Math.exp((cur - c) / T)) {
        curSoft = soft;
        curV = v;
        const tr = soft + 1000 * v;
        if (tr < bestC) {
          bestC = tr;
          best!.ses.set(S.ses);
          best!.room.set(S.room);
        }
      } else
        for (let j = ln - 1; j >= 0; j--) {
          S.ses[lp[j]] = ls[j];
          S.room[lp[j]] = lr[j];
        }
    }
  }
  // 收尾：逐一嘗試更好的位置
  const B = best!;
  M.H = 1000;
  let cur = evaluate(M, B),
    imp = true,
    pass = 0;
  while (imp && pass++ < 6) {
    imp = false;
    for (const p of free) {
      const P = M.parts[p],
        ot = B.ses[p],
        or = B.room[p];
      let bt = ot,
        br = or;
      for (const t of P.opts)
        for (const r of allowed(p)) {
          if (t === ot && r === or) continue;
          B.ses[p] = t;
          B.room[p] = r;
          const c = evaluate(M, B);
          if (c < cur - 1e-9) {
            cur = c;
            bt = t;
            br = r;
          }
        }
      B.ses[p] = bt;
      B.room[p] = br;
      if (bt !== ot || br !== or) imp = true;
    }
  }
  B.cost = cur;
  return B;
}
export function toState(M: ExModel, D: ExamD): ExState {
  const n = M.parts.length,
    S: ExState = { ses: new Int16Array(n), room: new Int16Array(n).fill(-1), pin: new Uint8Array(n) };
  M.parts.forEach((P: any, p: number) => {
    S.ses[p] = P.opts[0];
    const a = D.assign && (D.assign[P.stu.id + "|" + P.key] || (P.key !== P.subject && D.assign[P.stu.id + "|" + P.subject]));
    if (!a) return;
    const t = M.ses.findIndex((s: any) => s.id === a.ses),
      r = M.rooms.findIndex((x: any) => x.id === a.room);
    if (t >= 0 && P.all.includes(t)) {
      S.ses[p] = t;
      if (r >= 0) {
        S.room[p] = r;
        S.pin[p] = a.pin ? 1 : 0;
      }
    }
  });
  return S;
}
export function fromState(M: ExModel, S: ExState): Record<string, AssignCell> {
  const a: Record<string, AssignCell> = {};
  M.parts.forEach((P: any, p: number) => {
    a[P.stu.id + "|" + P.key] = { ses: M.ses[S.ses[p]].id, room: S.room[p] >= 0 ? M.rooms[S.room[p]].id : null, pin: !!S.pin[p] };
  });
  return a;
}
/* ---------- 段考服務從名冊帶入：名冊學生的 examSvc（個案頁的 IEP 填的）＝和 stu.sv 同樣的格式 ---------- */
export function svNorm(sv: unknown): Sv {
  const o: Record<string, Scope> = {};
  SV.forEach((v) => {
    const x = sv && (sv as Record<string, unknown>)[v.id];
    if (x === "*") o[v.id] = "*";
    else if (Array.isArray(x) && x.length) o[v.id] = [...new Set(x.map(String))].sort();
  });
  return o;
}
export function svSig(sv: unknown): string {
  return JSON.stringify(svNorm(sv));
}
// 名冊這份和上次帶入的不一樣才套用（IEP 改了）；沒變就不動，考場這邊之後手動改的會保留。svFromRoster＝上次帶入的內容
export function svcFromRoster(stu: ExStudent, es: unknown): boolean {
  if (!es || typeof es !== "object") return false;
  const sig = svSig(es);
  if (stu.svFromRoster === sig) return false;
  stu.sv = svNorm(es);
  stu.svFromRoster = sig;
  const n = String((es as Record<string, unknown>).note || "").trim();
  if (n && !stu.memo) stu.memo = n;
  return true;
}
export function svIsFromRoster(stu: ExStudent): boolean {
  return !!stu.svFromRoster && svSig(stu.sv) === stu.svFromRoster;
}
// 開始新的段考：學生、考程、教室、監考老師留著；排法、監考分配、備註、交卷勾選清掉。keepSv＝沿用上次段考的服務
export function startNewExam(D: ExamD, keepSv: boolean): ExamD {
  const o = JSON.parse(JSON.stringify(D)) as ExamD;
  o.title = "";
  o.assign = {};
  o.proctorOf = {};
  o.supportOf = {};
  o.procMan = {};
  o.supMan = {};
  o.notes = {};
  o.handIn = {};
  (o.students || []).forEach((x) => {
    x.on = true;
    delete x.chk;
    delete x.hold;
    if (!keepSv) {
      x.sv = {};
      delete x.svFromRoster;
    }
  });
  for (const n in o.proctorInfo || {}) o.proctorInfo[n].quota = "";
  return o;
}
/* ---------- 補考名單：交卷名單上勾「未到」的學生（D.handIn[科目][學生id]＝'in'｜'absent'） ---------- */
export interface MakeupItem {
  subject: string;
  students: { id: string; cls: string; seat: string; name: string }[];
  grades: number[];
  slot: { date: string; dow: string; period: string; start: string; end: string } | null;
  from: string;
  room: string;
}
export function makeupList(D: ExamD): MakeupItem[] {
  const hi = D.handIn || {},
    byId: Record<string, ExStudent> = {},
    out: MakeupItem[] = [];
  (D.students || []).forEach((x) => {
    byId[x.id] = x;
  });
  type Sl = { date: string; dow: string; period: string; start: string; end: string };
  const tk = (x: { date: string; start: string }) => dateKey(x.date) * 10000 + hm(x.start),
    xs = (x: any) => hm(x.start) - (x.extMode === "before" ? +x.extMin || 0 : 0),
    xe = (x: any) => hm(x.end) + (x.extMode === "after" ? +x.extMin || 0 : 0), // 含延長時間
    same = (a: any, b: any) => normDate(a.date) === normDate(b.date) && xs(a) < xe(b) && xs(b) < xe(a);
  const slots: Sl[] = [],
    seen: Record<string, number> = {};
  (D.sessions || []).forEach((x) => {
    const k = normDate(x.date) + "|" + x.start + "|" + x.end;
    if (seen[k]) return;
    seen[k] = 1;
    slots.push({ date: x.date, dow: x.dow || "", period: x.period || "", start: x.start, end: x.end });
  });
  // 考試日當天、兩節考試之間空出來的節次（例：第5節和第7節之間的第6節），也可以當補考時段
  const byDay: Record<string, ExSession[]> = {};
  (D.sessions || []).forEach((x) => {
    (byDay[normDate(x.date)] = byDay[normDate(x.date)] || []).push(x);
  });
  const gaps = (dur: number) => {
    const g: Sl[] = [];
    for (const d in byDay) {
      const l = byDay[d].slice().sort((p, q) => hm(p.start) - hm(q.start));
      for (let i = 0; i + 1 < l.length; i++) {
        const e = Math.max(...l.slice(0, i + 1).map(xe)),
          n = xs(l[i + 1]);
        if (n - e < dur + 20) continue;
        const pa = String(l[i].period || "").match(/^第(\d+)節$/),
          pb = String(l[i + 1].period || "").match(/^第(\d+)節$/),
          st = e + 10,
          p2 = (x: number) => String(x).padStart(2, "0");
        if (!pa || !pb || +pb[1] - +pa[1] < 2) continue; // 節次相連（例：第4、5節中間是午休）不算空堂
        g.push({
          date: l[i].date,
          dow: l[i].dow || "",
          period: "第" + (+pa[1] + 1) + "節",
          start: p2(Math.floor(st / 60)) + ":" + p2(st % 60),
          end: p2(Math.floor((st + dur) / 60)) + ":" + p2((st + dur) % 60),
        });
      }
    }
    return g;
  };
  slots.sort((a, b) => tk(a) - tk(b));
  const first = (sj: string) => {
    const l = (D.sessions || []).filter((x) => x.subject === sj).map(tk);
    return l.length ? Math.min(...l) : 9e15;
  };
  Object.keys(hi)
    .sort((a, b) => first(a) - first(b))
    .forEach((sj) => {
      const st = Object.keys(hi[sj] || {})
        .filter((id) => hi[sj][id] === "absent" && byId[id])
        .map((id) => byId[id])
        .sort((a, b) => String(a.cls).localeCompare(String(b.cls)) || (+a.seat || 0) - (+b.seat || 0));
      if (!st.length) return;
      const grades = [...new Set(st.map(gradeOf))].filter(Boolean).sort();
      const main = (D.sessions || []).filter((x) => x.subject === sj && !x.makeup).sort((a, b) => tk(a) - tk(b)),
        mk = (D.sessions || []).find((x) => x.subject === sj && x.makeup);
      let slot: Sl | null = null,
        from = "";
      if (mk) {
        slot = { date: mk.date, dow: mk.dow || "", period: mk.period || "", start: mk.start, end: mk.end };
        from = "makeup";
      } // 已經有這一科的補考節
      else {
        const after = main.length ? tk(main[main.length - 1]) : -1; // 這一科考完之後、這些年級都沒有考試的時段
        const dur = main.length ? Math.max(30, hm(main[0].end) - hm(main[0].start)) : 45,
          cand = slots.concat(gaps(dur)).sort((p, q) => tk(p) - tk(q));
        slot = cand.find((x) => tk(x) > after && !(D.sessions || []).some((y) => same(x, y) && (y.grades || []).some((g) => grades.includes(g)))) || null;
        if (slot) from = "free";
      }
      let room = "";
      if (slot) {
        const ids = new Set((D.sessions || []).filter((y) => same(slot, y) && !(mk && y.id === mk.id)).map((y) => y.id)),
          used = new Set<string>();
        for (const k in D.assign || {}) {
          const a = D.assign[k];
          if (a && a.room && ids.has(a.ses)) used.add(a.room);
        }
        const rs = D.rooms || [],
          ok = (r: ExRoom) => !used.has(r.id) && capOf(r.cap) >= st.length;
        const r =
          rs.find((x) => x.type === "normal" && ok(x)) ||
          rs.find((x) => x.type === "spare" && ok(x)) ||
          rs.find((x) => x.type === "wait" && ok(x)) ||
          rs.find((x) => x.type !== "pc" && !used.has(x.id)) ||
          null;
        room = r ? r.name : "";
      }
      out.push({ subject: sj, students: st.map((x) => ({ id: x.id, cls: x.cls, seat: x.seat, name: x.name })), grades, slot, from, room });
    });
  return out;
}
// 「建立補考考程」：還沒有補考節的科目，在建議的時段加一節補考（makeup:true）。回傳新增幾節
export function addMakeupSessions(D: ExamD, list: MakeupItem[]): number {
  let n = 0;
  (list || []).forEach((x) => {
    if (x.from !== "free" || !x.slot || D.sessions.some((y) => y.subject === x.subject && y.makeup)) return;
    const m: Partial<ExSession> = D.sessions.find((y) => y.subject === x.subject && !y.makeup) || {};
    let id = "mk" + (D.sessions.length + 1);
    while (D.sessions.some((y) => y.id === id)) id += "_";
    D.sessions.push({
      id,
      date: x.slot.date,
      dow: x.slot.dow,
      period: x.slot.period,
      subject: x.subject,
      grades: x.grades.length ? x.grades.slice() : (m.grades || [7, 8, 9]).slice(),
      start: x.slot.start,
      end: x.slot.end,
      extMin: m.extMin != null ? m.extMin : 20,
      extMode: m.extMode || "after",
      oralCap: m.oralCap != null ? m.oralCap : 8,
      split: false,
      noRead: !!m.noRead,
      makeup: true,
      oralSep: !!m.oralSep,
      waitExam: false,
    });
    n++;
  });
  return n;
}

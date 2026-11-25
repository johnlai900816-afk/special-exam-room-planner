/* eslint-disable @typescript-eslint/no-explicit-any */
/* 段考資料 ⇄ 分拆文件：
     exam/main                 考程、試場、監考對照（大家讀；functions/nx-split.js splitExam）
     exam/main/private/data    學生名單、服務、排法、交卷勾選…（只有管理者／編輯）
     exam/main/private/notice  學生通知單補的資料
     exam/main/private/view    查考場連結的鑰匙（只有管理者／編輯；規則用它檢查 publicViews 還有沒有效）
     exam/main/placements/*    一節一間試場：監考老師讀自己的（交卷名單）   ← 存段考時一起產生
     exam/main/seats/*         一位學生的考場：讀得到這位學生的老師讀得到  ← 存段考時一起產生
   學生、監考老師來自名冊（舊版 exam.html?embed 的 rosterPull，逐行照搬）：學生 id 和名冊一樣，服務從個案頁的 IEP（private.examSvc）帶入。 */
import { sameTeacher } from "../exam";
import { NX, type DiffOps } from "../legacy";
import type { ExamPlaceDoc, ExamSeatDoc, TermRecords } from "../model";
import type { RcData } from "../types";
import { defaultData, fmt, labelOf, svcFromRoster, type ExamD } from "./examCore";
import { build, cellMap, findRowsAll, normalize, pinfo, ttSnap, usedCells, waitMap, type Ctx } from "./examOut";
import { normalize as nNormalize, type NoticeData } from "./notice";

export const EID = "main";
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/* ---------- 名冊 → 考場（舊版 rosterPull）：班級、座號、姓名以名冊為準；在名冊刪除的人這裡也拿掉。rs＝已經和名冊連上 ---------- */
// 對學生的順序：①同一個編號 ②同班＋同姓名（名冊換了編號也能重新連上）③同班同座號、但只有一邊有姓名。
// 同班同座號、姓名不同＝不同的人，不合併，標出來請老師確認
export function rosterPull(D: ExamD, R: any): { ch: boolean; relink: number; warnN: number } {
  let ch = false,
    relink = 0,
    warnN = 0;
  if (!R || !Array.isArray(R.students)) return { ch, relink, warnN };
  const seen = new Set<any>(),
    rid = new Set(R.students.map((r: any) => r.id)),
    gone = new Set(R.gone || []);
  const nm = (x: unknown) => String(x || "").replace(/\s+/g, ""),
    seatEq = (a: unknown, b: unknown) => String(+(a as number) || "") === String(+(b as number) || "");
  const flag = (x: any, msg: string) => {
    if (x.chk !== msg) {
      x.chk = msg;
      ch = true;
      warnN++;
    }
    x.hold = 1;
  }; // hold＝先不寫回名冊，等老師按「確認好了」
  R.students.forEach((r: any) => {
    if (!r.name && !r.cls) return;
    const free = (x: any) => !seen.has(x) && !rid.has(x.id) && String(x.cls) === String(r.cls);
    let s: any = D.students.find((x) => x.id === r.id);
    if (!s) s = D.students.find((x) => free(x) && x.name && nm(x.name) === nm(r.name) && (x.rs ? seatEq(x.seat, r.seat) : !x.seat || !r.seat || seatEq(x.seat, r.seat)));
    if (s && s.rs && s.id !== r.id) relink++;
    if (!s) {
      const y: any = D.students.find((x) => free(x) && !x.rs && r.seat && x.seat && seatEq(x.seat, r.seat));
      if (y && (!nm(y.name) || !nm(r.name))) s = y;
      else if (y) flag(y, "名冊的 " + r.cls + "-" + r.seat + " 是「" + r.name + "」，同座號不同名，沒有合併。同一人請改成和名冊一樣；不同人請按「確認好了」");
    }
    if (!s) {
      s = { id: r.id, cls: r.cls, seat: r.seat, name: r.name, sv: {}, memo: "", on: true, rs: 1 };
      D.students.push(s);
      ch = true;
    }
    if (s.id !== r.id) {
      const o = s.id + "|",
        m = D.assign || {};
      for (const k of Object.keys(m))
        if (k.startsWith(o)) {
          m[r.id + "|" + k.slice(o.length)] = m[k];
          delete m[k];
        }
      s.id = r.id;
      ch = true;
    }
    const rn = r.name || s.name; // 名冊還沒填姓名時，保留這裡的姓名
    if (String(s.cls) !== String(r.cls) || String(s.seat || "") !== String(r.seat || "") || s.name !== rn || !s.rs) {
      s.cls = r.cls;
      s.seat = r.seat;
      s.name = rn;
      s.rs = 1;
      ch = true;
    }
    if (s.hold) {
      delete s.hold;
      delete s.chk;
      ch = true;
    } // 又對上名冊了
    if (r.examSvc && svcFromRoster(s, r.examSvc)) ch = true; // IEP 填的段考服務
    seen.add(s);
  });
  // 只有在名冊明確刪除過的學生（R.gone）才從考場拿掉；單純「名冊裡沒有」不會刪，避免空白或舊的名冊把考場清空
  const n = D.students.length;
  if (gone.size) {
    D.students = D.students.filter((s) => !gone.has(s.id));
    if (D.students.length !== n) ch = true;
  }
  // 連過名冊、現在名冊裡卻找不到的：可能在名冊改了班級座號姓名。不刪，標出來請老師確認
  D.students.forEach((s) => {
    if (s.rs && !seen.has(s) && !rid.has(s.id)) flag(s, "名冊裡找不到這位學生（可能改了班級座號姓名）。還要排就按「確認好了」");
  });
  // 資源班老師 → 監考老師；「應授課節數」沒有自己填的，帶入排課結果的每週節數
  const wk: Record<string, number> = {};
  (R.groups || []).forEach((g: any) => {
    const c = ((R.assign || {})[g.id] || []).filter((e: any) => e && e.s).length;
    if (g.teacher) wk[g.teacher] = (wk[g.teacher] || 0) + c;
  });
  (R.teachers || [])
    .filter((t: any) => t.role === "資源班" && t.name)
    .forEach((t: any) => {
      if (!D.proctors.includes(t.name)) {
        D.proctors.push(t.name);
        ch = true;
      }
      const f = pinfo(D, t.name);
      if (!f.temp && wk[t.id] && (f.teach === "" || f.teach == null || f.autoT) && String(f.teach) !== String(wk[t.id])) {
        f.teach = wk[t.id];
        f.autoT = 1;
        ch = true;
      }
    });
  const snap = ttSnap(R);
  if (snap && (Object.keys(snap.tt).length || Object.keys(snap.cs).length) && JSON.stringify(snap) !== JSON.stringify(D.ttCopy)) {
    D.ttCopy = snap;
    ch = true;
  } // 批閱教師用
  return { ch, relink, warnN };
}

export interface Loaded {
  /** 段考的整份資料（已經和名冊對過） */
  E: ExamD;
  /** 通知單；沒有存過時 null */
  N: NoticeData | null;
  /** 存過嗎（沒有＝第一次打開：和舊版一樣先用範例的考程與教室） */
  saved: boolean;
  /** 和名冊對過以後有變（要存） */
  changed: boolean;
  relink: number;
  warnN: number;
}
/** records ＋ 名冊（toCoreD 的 D）→ 段考資料（舊版 exam.html?embed 一打開做的事） */
export function loadExam(R: TermRecords, roster: RcData | null): Loaded {
  const j = NX.joinExam(R, EID);
  const saved = !!j.exam;
  // 沒存過也先補齊欄位（舊版第一次存的是沒補齊的，下次打開補齊後又要再存一次）
  const E: ExamD = normalize(saved ? clone(j.exam) : defaultData(), defaultData);
  if (!saved) {
    E.students = [];
    E.proctors = [];
    E.proctorInfo = {};
    E.title = "";
  }
  const r = rosterPull(E, roster);
  if (!saved && roster && /範例資料/.test(String(roster.title || ""))) {
    const demo = defaultData().students;
    E.title = "○○學年度第○學期 第○次段考（範例資料）";
    E.students.forEach((s, i) => {
      if (i % 2 === 0) s.sv = clone(demo[(i / 2) % demo.length].sv);
    });
  }
  return { E, N: j.notice ? nNormalize(clone(j.notice)) : null, saved, changed: r.ch, relink: r.relink, warnN: r.warnN };
}

/* ---------- 老師端的兩種文件 ---------- */
const sk = (s: { cls: string; seat: string }) => String(s.cls) + "|" + String(+s.seat || 0).padStart(3, "0");
/** 每一節每一間試場（有考試或自習等候的）→ placements 文件；proctorIds 用姓名對名冊老師 */
export function placementDocs(X: Ctx, teachers: Record<string, { name: string }>): Record<string, ExamPlaceDoc> {
  const { D, M, ST } = X;
  const cells = cellMap(X),
    waits = waitMap(X),
    wr = M.rooms.findIndex((r: any) => r.type === "wait");
  const tids = (name: string) =>
    name
      ? Object.entries(teachers)
          .filter(([, t]) => sameTeacher(name, t.name))
          .map(([id]) => NX.decId(id))
      : [];
  const out: Record<string, ExamPlaceDoc> = {};
  usedCells(M, cells, waits, wr).forEach((c) => {
    const T = c.T,
      R = c.R,
      list = cells[T.i + "|" + R.i] || [],
      w = R.i === wr ? waits[T.i] || [] : [];
    const proctor = D.proctorOf[c.key] || "",
      support = D.supportOf[c.key] || "";
    const hasE = T.est !== T.st || T.een !== T.en;
    const stu = list
      .map((p) => {
        const P = M.parts[p],
          lb = labelOf(P);
        return { c: String(P.stu.cls), s: String(P.stu.seat || ""), n: String(P.stu.name || ""), sv: lb + (P.small && lb !== "獨立" ? "、人數調整" : ""), x: P.ext && hasE ? fmt(T.est) + "～" + fmt(T.een) : "" };
      })
      .sort((a, b) => sk({ cls: a.c, seat: a.s }).localeCompare(sk({ cls: b.c, seat: b.s })));
    const wait = w
      .map((p) => ({ c: String(M.parts[p].stu.cls), s: String(M.parts[p].stu.seat || ""), n: String(M.parts[p].stu.name || ""), j: String(M.parts[p].subject) }))
      .sort((a, b) => sk({ cls: a.c, seat: a.s }).localeCompare(sk({ cls: b.c, seat: b.s })));
    out[EID + "/" + NX.encId(c.key)] = {
      ses: T.id,
      room: R.id,
      date: String(T.date || ""),
      dow: String(T.ref.dow || ""),
      per: String(T.ref.period || ""),
      lab: T.subject + (T.makeup ? "（補）" : ""),
      t: fmt(c.s) + "～" + fmt(c.e),
      roomName: String(R.name || ""),
      proctor,
      support,
      proctorIds: [...new Set([...tids(proctor), ...tids(support)])].slice(0, 4),
      stu,
      wait,
    };
  });
  void ST;
  return out;
}
/** 名冊裡的學生（有 teacherIds 的）→ seats 文件；內容和舊版班級查考場連結的欄位一樣少 */
export function seatDocs(X: Ctx, students: TermRecords["students"]): Record<string, ExamSeatDoc> {
  const rows = findRowsAll(X);
  const out: Record<string, ExamSeatDoc> = {};
  X.D.students.forEach((s, si) => {
    const doc = students[NX.encId(s.id)];
    if (!doc || s.on === false) return;
    const readers = [...new Set([...(doc.teacherIds || []), ...(doc.caseMgrId ? [doc.caseMgrId] : [])])];
    const mine = rows.filter((r) => r.si === si).sort((a, b) => a.k - b.k);
    if (!readers.length || !mine.length) return;
    out[EID + "/" + NX.encId(s.id)] = {
      teacherIds: readers,
      cls: String(s.cls),
      seat: String(s.seat || ""),
      name: String(s.name || ""),
      rows: mine.map((r) => ({ date: r.date, dow: r.dow, lab: r.lab, per: r.per, t: r.t, ext: r.ext, room: r.room, proc: r.proc })),
    };
  });
  return out;
}

/** 要寫的段考文件（考程、名單、通知單、試場、學生考場）；內容一樣的不寫。view（連結鑰匙）不在這裡動 */
export function examOps(R: TermRecords, E: ExamD, N: NoticeData | null): DiffOps {
  const X = build(clone(E));
  const sp = NX.splitExam(clone(E), N ? clone(N) : undefined, EID);
  const keepNotice = !N && R.examPrivate[EID + "/notice"];
  const noView = <T,>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).filter(([k]) => !k.endsWith("/view") && !(keepNotice && k.endsWith("/notice"))));
  // private 是整份 JSON 字串：內容一樣（只有 key 的順序不同，例如讀進來補齊欄位後）就沿用原本的字串，不重寫
  for (const id of Object.keys(sp.examPrivate)) {
    const b = R.examPrivate[id];
    try {
      if (b && NX.canon(JSON.parse(b.json)) === NX.canon(JSON.parse(sp.examPrivate[id].json))) sp.examPrivate[id] = { ...sp.examPrivate[id], json: b.json };
    } catch {
      /* 舊的讀不懂就照新的寫 */
    }
  }
  const before = { exam: R.exam, examPrivate: noView(R.examPrivate), examPlace: R.examPlace || {}, examSeat: R.examSeat || {} };
  const after = { exam: sp.exam, examPrivate: noView(sp.examPrivate), examPlace: placementDocs(X, R.teachers), examSeat: seatDocs(X, R.students) };
  return NX.diff(before, after, ["exam", "examPrivate", "examPlace", "examSeat"]);
}

/** 今天的待辦用：段考還有幾科次沒排考場（舊 app.js examInfo） */
export function examTodo(R: TermRecords): { total: number; placed: number; title: string } | null {
  const j = NX.joinExam(R, EID);
  const E = j.exam as ExamD | null;
  if (!E || !Array.isArray(E.students)) return null;
  const a = Object.values(E.assign || {});
  return { total: a.length, placed: a.filter((x) => x && x.room).length, title: E.title || "" };
}

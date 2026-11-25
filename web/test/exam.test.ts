/* 段考考場（lib/nx/examCore.ts、examOut.ts）和舊版 exam.html 一模一樣：
     排列：同樣的資料、同樣的種子，自動排列／補排／換一組的結果（每一科次在哪一節哪一間、固定）一樣，含「自習教室開放考試」開關、補考節、
          分年級、口頭獨立、電腦教室、備用、獨立考場上限；監考分配（按應授課節數比例、臨時支援、不排時段、手動指定）一樣
     輸出：服務表、動線、監考、交卷名單（預設和每一種選項組合）、補考名單、查考場（依學生、依試場、篩選）、複製的文字，逐字相同
     檢視連結：全校、每一班的內容（遮名）和舊版 linkPush 寫的一樣
   舊版原文放在 vm 沙盒裡跑（test/examOld.ts）。 */
import { describe, expect, it } from "vitest";
import { addMakeupSessions, compile, defaultData, evaluate, makeupList, startNewExam, svcFromRoster, toState, type ExamD } from "../lib/nx/examCore";
import {
  autoProctor,
  build,
  findRows,
  findCopyText,
  findHtml,
  findRowsAll,
  FD0,
  handPapers,
  itinHtml,
  mkPapers,
  normalize,
  pasteProc,
  procPaper,
  procQuota,
  runSolve,
  svcHtml,
  tally,
  ttSnap,
  usedNow,
  viewDocs,
  viewExp,
  type FindFilter,
} from "../lib/nx/examOut";
import { examSandbox } from "./examOld";

const NOW = new Date(2026, 10, 26, 10, 30).getTime();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const SOLVE_FNS = ["rebuild", "commit", "pushUndo", "runSolve", "autoProctor", "usedNow", "cellMap", "waitMap", "usedCells", "EXTW", "pinfo", "pOff", "cw", "f1", "ORALW", "isT", "tOk", "pw", "procSlot", "procSlots", "procQuota", "asnList", "normalize"];
const OUT_FNS = [
  "groupsOf",
  "gradeCount",
  "procMatrix",
  "hb",
  "absentN",
  "EXAM_TT",
  "ttSnap",
  "graderOf",
  "handHtml",
  "mkHtml",
  "SVT",
  "svTags",
  "svcHtml",
  "itinHtml",
  "FD",
  "VR",
  "findRowsAll",
  "findRows",
  "fProc",
  "fWho",
  "findRooms",
  "findCopy",
  "renderFind",
  "maskName",
  "dateOf",
  "viewExp",
  "linkPush",
  "noteToOff",
  "pasteProcOk",
];

/** 比較大的資料：好幾班、每一種服務、三天、電腦教室、備用、自習等候、臨時支援、不排時段 */
function bigExam(seed: number): ExamD {
  let a = seed;
  const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(l: T[]) => l[Math.floor(rnd() * l.length)];
  const D = defaultData();
  D.title = "115學年度第1學期第2次段考";
  D.students = [];
  const subs = ["國文", "作文", "數學", "英文", "社會", "生物/理化", "地科"];
  for (let i = 0; i < 34; i++) {
    const cls = String(pick([7, 8, 9])) + "0" + (1 + Math.floor(rnd() * 5)),
      sv: Record<string, unknown> = {};
    const k = rnd();
    if (k < 0.25) sv.ext = "*";
    else if (k < 0.4) sv.small = "*";
    else if (k < 0.55) Object.assign(sv, { read: "*", oral: ["國文", "作文"] });
    else if (k < 0.65) sv.pc = ["作文"];
    else if (k < 0.8) Object.assign(sv, { ext: [pick(subs), pick(subs)], read: "*" });
    else if (k < 0.9) Object.assign(sv, { small: "*", ext: "*" });
    else sv.oral = [pick(subs)];
    D.students.push({ id: "s" + i, cls, seat: String(1 + i).padStart(2, "0"), name: "學生" + "甲乙丙丁戊己庚辛"[i % 8] + i, sv: sv as never, memo: i % 7 ? "" : "備註" + i, on: i !== 5 });
  }
  D.students.push({ id: "bad", cls: "X1", seat: "", name: "看不出年級", sv: { ext: "*" }, memo: "", on: true });
  D.sessions.push({ ...D.sessions[1], id: "d3p2", date: "12/3", dow: "四", period: "第2節", subject: "英聽", grades: [7, 8], oralCap: "", split: true });
  D.sessions.push({ ...D.sessions[1], id: "d3p3", date: "12/3", dow: "四", period: "第3節", subject: "數學", grades: [9], extMode: "before" });
  D.rooms.push({ id: "I", name: "備用二", cap: "", type: "spare" });
  D.proctors = ["王老師", "陳老師", "林老師", "張老師", "李老師", "黃老師", "支援1", "支援2"];
  D.proctorInfo = {
    王老師: { teach: 7, quota: "", note: "週二下午不排監考", off: ["二|pm"] },
    陳老師: { teach: 4, quota: "" },
    林老師: { teach: 12, quota: "" },
    張老師: { teach: "", quota: "" },
    李老師: { teach: 9, quota: 3 },
    黃老師: { teach: 6, quota: "", off: ["三|am"] },
    支援1: { temp: true, quota: "", only: ["d1p1", "d2p2"], oralOnly: false, note: "" },
    支援2: { temp: true, quota: 2, only: [], oralOnly: true, note: "" },
  };
  D.settings.seed = seed;
  return D;
}

function variants(): [string, ExamD][] {
  const demo = defaultData();
  const wait = defaultData();
  wait.sessions.forEach((s, i) => (s.waitExam = i % 2 === 0));
  const allWait = bigExam(3);
  allWait.sessions.forEach((s) => (s.waitExam = true));
  const big = bigExam(7);
  big.settings.pref = 80;
  big.settings.smallMax = 6;
  return [
    ["範例資料", demo],
    ["自習教室開放考試（一半的節次）", wait],
    ["比較大的資料", big],
    ["自習教室開放考試（全部）", allWait],
  ];
}

function oldSolve(D: ExamD, mode: string, pre?: string) {
  const sb = examSandbox(SOLVE_FNS);
  sb.ctx.__J = JSON.stringify(D);
  sb.run("D=normalize(JSON.parse(__J));rebuild();" + (pre || "") + "runSolve(" + JSON.stringify(mode) + ");");
  return { sb, out: sb.run<string>("JSON.stringify({a:D.assign,p:D.proctorOf,s:D.supportOf,seed:D.settings.seed})"), toasts: sb.run<string[]>("toasts") };
}
function newSolve(D: ExamD, mode: "all" | "fill" | "next", pre?: (X: ReturnType<typeof build>) => void) {
  const X = build(normalize(clone(D), defaultData));
  pre?.(X);
  const msg = runSolve(X, mode);
  return { X, out: JSON.stringify({ a: X.D.assign, p: X.D.proctorOf, s: X.D.supportOf, seed: X.D.settings.seed }), msg };
}

describe("排列和舊版一模一樣", () => {
  for (const [name, D] of variants())
    it(name + "：自動排列", { timeout: 180000 }, () => {
      const o = oldSolve(D, "all");
      const n = newSolve(D, "all");
      expect(n.out).toBe(o.out);
      expect(Object.keys(n.X.D.assign).length).toBeGreaterThan(5);
      // 監考的話（排滿時不說話）
      expect(n.msg ? [n.msg] : []).toEqual(o.toasts);
    });
  it("換一組（種子 +1）、補排未排入（已排的固定）", { timeout: 180000 }, () => {
    const D = bigExam(11);
    expect(newSolve(D, "next").out).toBe(oldSolve(D, "next").out);
    // 先排一次，拿掉幾位的位置，再補排
    const first = newSolve(D, "all").X.D;
    Object.keys(first.assign)
      .slice(0, 6)
      .forEach((k) => (first.assign[k].room = null));
    expect(newSolve(first, "fill").out).toBe(oldSolve(first, "fill").out);
  });
  it("自習教室開放考試：關掉時不會排進自習等候教室；打開時可以（口頭作答除外）", { timeout: 180000 }, () => {
    const D = defaultData();
    D.rooms.forEach((r) => {
      if (r.type === "normal" && r.id !== "A") r.cap = 1;
    });
    D.rooms.find((r) => r.id === "A")!.cap = 2;
    const off = newSolve(D, "all").X;
    const wr = off.M.rooms.findIndex((r: { type: string }) => r.type === "wait");
    const inWait = (X: ReturnType<typeof build>) => X.M.parts.filter((_: unknown, p: number) => X.ST.room[p] === wr && !X.M.ses[X.ST.ses[p]].makeup);
    expect(inWait(off).length).toBe(0);
    D.sessions.forEach((s) => (s.waitExam = true));
    const on = newSolve(D, "all");
    expect(on.out).toBe(oldSolve(D, "all").out);
    expect(inWait(on.X).length).toBeGreaterThan(0);
    expect(inWait(on.X).every((P: { oral: boolean }) => !P.oral)).toBe(true);
  });
  it("違規訊息與成本一樣（評分 evaluate）", () => {
    for (const [, D] of variants()) {
      const sb = examSandbox(["normalize"]);
      sb.ctx.__J = JSON.stringify(D);
      const old = sb.run<string>("D=normalize(JSON.parse(__J));M=compile(D);ST=toState(M,D);for(let p=0;p<M.parts.length;p++){ST.room[p]=p%M.rooms.length;}const o={msgs:[],unassigned:0};const c=evaluate(M,ST,o);JSON.stringify([c,o])");
      const N = normalize(clone(D), defaultData);
      const M = compile(N),
        ST = toState(M, N);
      for (let p = 0; p < M.parts.length; p++) ST.room[p] = p % M.rooms.length;
      const o = { msgs: [], unassigned: 0 };
      const c = evaluate(M, ST, o);
      expect(JSON.stringify([c, o])).toBe(old);
    }
  });
  it("手動指定的監考保留、重新分配監考一樣", { timeout: 180000 }, () => {
    const D = newSolve(bigExam(5), "all").X.D;
    const k = Object.keys(D.proctorOf);
    D.procMan = { [k[0]]: 1, [k[1]]: 1 };
    D.proctorOf[k[0]] = "張老師";
    D.proctorOf[k[1]] = "張老師";
    D.supMan = { [k[2]]: 1 };
    D.supportOf[k[2]] = "支援1";
    const sb = examSandbox(SOLVE_FNS);
    sb.ctx.__J = JSON.stringify(D);
    sb.run("D=normalize(JSON.parse(__J));rebuild();autoProctor(false,false);");
    const X = build(normalize(clone(D), defaultData));
    const m = autoProctor(X, false, false);
    expect(JSON.stringify([X.D.proctorOf, X.D.supportOf])).toBe(sb.run<string>("JSON.stringify([D.proctorOf,D.supportOf])"));
    expect([m]).toEqual(sb.run("toasts"));
    expect(X.D.proctorOf[k[0]]).toBe("張老師");
    // 應監考節數、統計
    const q = procQuota(X.D, usedNow(X));
    expect(JSON.stringify(q)).toBe(sb.run<string>("JSON.stringify(procQuota(usedNow()))"));
    expect(tally(X).conf.length).toBeGreaterThanOrEqual(0);
  });
});

/** 排好的資料（輸出比對用） */
function arranged(D: ExamD) {
  const X = build(normalize(clone(D), defaultData));
  runSolve(X, "all");
  return X.D;
}
const ROSTER = {
  teachers: [
    { id: "t1", name: "國文王" },
    { id: "t2", name: "英文陳" },
    { id: "t3", name: "數學林" },
  ],
  classSubj: { "901|國文": "t1", "801|英文": "t2", "702|數學": "t3" },
  tt: { "902": { subj: { 國語文: [["林國文", 5, 0]], 生物: [["生物張", 3, 0]] } }, "803": { subj: { 歷史: [["史老師", 2, 0]], 地理: [["地老師", 2, 0]] } } },
};

function oldOut(D: ExamD, code: string, extra?: string) {
  const sb = examSandbox([...SOLVE_FNS, ...OUT_FNS], { now: NOW, roster: ROSTER, extra: "var cloudReady=true;let lTimer=null;const __sets={};" + (extra || "") });
  sb.ctx.__J = JSON.stringify(D);
  sb.run("D=normalize(JSON.parse(__J));rebuild();");
  return { sb, v: sb.run<string>(code) };
}

describe("輸出和舊版逐字相同", () => {
  const cases = variants().map(([n, D]) => [n, arranged(D)] as [string, ExamD]);
  it("服務表、動線、監考分配表", { timeout: 60000 }, () => {
    for (const [, D] of cases) {
      const X = build(normalize(clone(D), defaultData));
      expect(svcHtml(X, new Date(NOW))).toBe(oldOut(D, "svcHtml()").v);
      expect(itinHtml(X)).toBe(oldOut(D, "itinHtml()").v);
      expect(procPaper(X)).toBe(oldOut(D, "'<div class=\"pg\"><h2>'+esc(D.title)+'｜監考分配表</h2>'+procMatrix('out')+'</div>'").v);
      expect(svcHtml(X, new Date(NOW)).length).toBeGreaterThan(500);
    }
  });
  it("交卷名單：預設（學校原本的紙本）＝舊版預設，逐字相同", () => {
    for (const [, D] of cases) {
      const X = build(normalize(clone(D), defaultData));
      const old = oldOut(D, "handHtml()").v;
      const i = old.indexOf('<div class="pg hs">');
      expect(i).toBeGreaterThan(0);
      const p = handPapers(X, ttSnap(ROSTER));
      expect(p.html).toBe(old.slice(i));
      // 說明列上的「n 格找不到批閱教師」「未排入、沒有印出」也一樣
      if (p.miss) expect(old).toContain("<b>" + p.miss + " 格找不到批閱教師，留白手寫</b>");
      else expect(old).not.toContain("格找不到批閱教師");
      if (p.un.length) expect(old).toContain(" 未排入、沒有印出：" + [...new Set(p.un)].join("、"));
      // 預設沒有節次試場、沒有簽名欄
      expect(p.html).not.toContain('class="hsf"');
      expect(p.html).not.toContain("（補）</b>");
    }
  });
  it("交卷名單：選項（加註節次與試場、加簽名欄、印出已勾選）的每一種組合都和舊版一樣", () => {
    const D0 = cases[2][1];
    const combos: Record<string, number>[] = [{}, { info: 1 }, { sign: 1 }, { mark: 1 }, { info: 1, sign: 1 }, { info: 1, mark: 1 }, { sign: 1, mark: 1 }, { info: 1, sign: 1, mark: 1 }];
    for (const hand of combos) {
      const D = clone(D0);
      D.settings.hand = hand;
      // 勾一些已交、未到
      const ids = D.students.map((s) => s.id);
      D.handIn = { 國文: { [ids[0]]: "in", [ids[1]]: "absent" }, 數學: { [ids[2]]: "absent" } };
      const X = build(normalize(clone(D), defaultData));
      const old = oldOut(D, "handHtml()").v;
      expect(handPapers(X, null).html).not.toBe(""); // 沒有課表也印
      expect(handPapers(X, ttSnap(ROSTER)).html).toBe(old.slice(old.indexOf('<div class="pg hs">')));
      if (hand.sign) expect(old).toContain('class="hsf"');
    }
  });
  it("交卷名單：沒有名冊時用段考資料裡的課表副本（ttCopy）", () => {
    const D = clone(cases[0][1]);
    D.ttCopy = ttSnap(ROSTER);
    const sb = examSandbox([...SOLVE_FNS, ...OUT_FNS], { now: NOW, roster: null });
    sb.ctx.__J = JSON.stringify(D);
    const old = sb.run<string>("D=normalize(JSON.parse(__J));rebuild();handHtml()");
    const X = build(normalize(clone(D), defaultData));
    expect(handPapers(X, X.D.ttCopy || null).html).toBe(old.slice(old.indexOf('<div class="pg hs">')));
  });
  it("補考名單（未到的學生、建議時段與試場）、建立補考考程", () => {
    const D = clone(cases[2][1]);
    const ids = D.students.filter((s) => s.on).map((s) => s.id);
    D.handIn = { 國文: { [ids[0]]: "absent", [ids[3]]: "absent" }, 數學: { [ids[1]]: "absent" }, 作文: { [ids[2]]: "absent" } };
    const old = oldOut(D, "mkHtml()").v;
    const p = mkPapers(D);
    expect(p.html).toBe(old.slice(old.indexOf('<div class="pg">')));
    const sb = examSandbox([], {});
    sb.ctx.__J = JSON.stringify(D);
    const oldN = sb.run<string>("D=JSON.parse(__J);const n=addMakeupSessions(D,makeupList(D));JSON.stringify([n,D.sessions])");
    const D2 = clone(D);
    const n = addMakeupSessions(D2, makeupList(D2));
    expect(JSON.stringify([n, D2.sessions])).toBe(oldN);
  });
  it("查考場：依學生、依試場、各種篩選的表格與複製的文字", () => {
    const D = cases[2][1];
    const X = build(normalize(clone(D), defaultData));
    const all = findRowsAll(X);
    const filters: Partial<FindFilter>[] = [{}, { mode: "room" }, { g: "8" }, { cls: all[0].cls }, { subj: "國文", mode: "room" }, { q: "甲" }, { proc: "王老師" }, { date: "12/2", mode: "room" }];
    for (const f of filters) {
      const FD = { ...FD0, ...f };
      const { sb } = oldOut(D, "1");
      sb.ctx.__FD = FD;
      sb.run("Object.assign(FD,__FD);renderFind(false);findCopy();");
      expect(findHtml(all, FD, null)).toBe(sb.run<string>("$('findOut').innerHTML"));
      expect(findCopyText(findRows(all, FD), FD, D.title)).toBe(sb.run<string>("__copied"));
    }
  });
  it("檢視連結：全校（全名、不含服務與備註）、每一班（遮名、欄位最少）和舊版 linkPush 一樣；期限是最後一天考試後 7 天", () => {
    const D = cases[2][1];
    const X = build(normalize(clone(D), defaultData));
    const vcls: Record<string, string> = {};
    [...new Set(D.students.map((s) => s.cls))].forEach((c, i) => (vcls[c] = "k" + i + "_" + c));
    const { sb } = oldOut(
      D,
      "1",
      "var firebase={firestore:{Timestamp:{fromDate:d=>({toMillis:()=>d.getTime(),d})},FieldValue:{serverTimestamp:()=>'TS'}}};" +
        "CLOUD={access:{link:'LINK',vcls:" +
        JSON.stringify(vcls) +
        "},user:{email:'a@example.com'},db:{doc:p=>({set:o=>{__sets[p]=o;return Promise.resolve();},delete:()=>Promise.resolve()})}};",
    );
    sb.run("linkPush(true);");
    const sets = sb.run<Record<string, Record<string, unknown>>>("__sets");
    const mine = viewDocs(X, vcls);
    expect(mine.all.rows).toBe(sets["view/LINK"].rows);
    expect(mine.all.title).toBe(sets["view/LINK"].title);
    expect(sets["view/LINK"].all).toBe(true);
    for (const c in vcls) {
      expect(mine.cls[vcls[c]].rows).toBe(sets["view/" + vcls[c]].rows);
      expect(mine.cls[vcls[c]].cls).toBe(c);
      expect(JSON.parse(mine.cls[vcls[c]].rows).every((r: { name: string; svc?: string; memo?: string; sup?: string }) => r.name.includes("○") && r.svc === undefined && r.memo === undefined && r.sup === undefined)).toBe(true);
    }
    expect(JSON.parse(mine.all.rows).every((r: { svc?: string; memo?: string }) => r.svc === undefined && r.memo === undefined)).toBe(true);
    const exp = (sets["view/LINK"].exp as { d: Date }).d;
    expect(viewExp(X.D, new Date(NOW)).getTime()).toBe(exp.getTime());
  });
});

describe("名單、新段考、貼上老師表", () => {
  it("服務從 IEP 帶入、開始新段考和 test-exam.js 的行為一樣", () => {
    const s = { id: "r1", cls: "801", seat: "05", name: "王小明", sv: {}, memo: "", on: true };
    expect(svcFromRoster(s, { ext: "*", oral: ["作文", "國文"], note: "n" })).toBe(true);
    expect(s.sv).toEqual({ ext: "*", oral: ["作文", "國文"].sort() });
    const D = defaultData();
    D.assign = { x: { ses: "d1p1", room: "A", pin: true } };
    const N = startNewExam(D, false);
    expect(N.assign).toEqual({});
    expect(N.students.every((x) => JSON.stringify(x.sv) === "{}")).toBe(true);
  });
  it("貼上老師表（直的、橫的）和舊版 pasteProcOk 一樣", () => {
    const texts = ["王老師\t7\n陳老師\t4\t週二下午不排監考\n林老師  12", "老師\t王老師\t陳老師\n授課節數\t7\t4\n需求\t\t週三不排"];
    for (const t of texts) {
      const D = arranged(defaultData());
      const sb = examSandbox([...SOLVE_FNS, ...OUT_FNS]);
      sb.ctx.__J = JSON.stringify(D);
      sb.run("D=normalize(JSON.parse(__J));rebuild();$('pasteTa').value=" + JSON.stringify(t) + ";pasteProcOk();");
      const X = build(normalize(clone(D), defaultData));
      pasteProc(X.D, t);
      autoProctor(X, false, true);
      expect(JSON.stringify([X.D.proctors, X.D.proctorInfo, X.D.proctorOf, X.D.supportOf])).toBe(sb.run<string>("JSON.stringify([D.proctors,D.proctorInfo,D.proctorOf,D.supportOf])"));
    }
  });
  it("evaluate 對空的考程不會出錯", () => {
    const D = defaultData();
    D.sessions = [];
    const M = compile(D);
    expect(evaluate(M, toState(M, D))).toBe(0);
  });
});

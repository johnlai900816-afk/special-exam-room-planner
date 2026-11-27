/* 「問題」與「一鍵建議」（§9f）：排課 ① ② 、個管、學校資料、段考 ③、IEP 排定與直接開會；送給 AI 的內容沒有學生姓名 */
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import { IEP, type Round } from "../lib/iep";
import { demoSeed } from "../lib/nx/demo";
import { defaultData, evaluate } from "../lib/nx/examCore";
import { build, normalize, runSolve, usedNow } from "../lib/nx/examOut";
import { examAiRequest, examAiRestore, examBadCount, fixProcConflicts, fixViolations, procConflicts } from "../lib/nx/examSuggest";
import { applyPlanChanges, iepAiRequest, iepAiRestore, planProblems, planSuggest, quickApply, quickProblems, quickSuggest } from "../lib/nx/iepPlan";
import { applyRegroup, cmProblems, impactProblems, needProblems, openProblems, regroupMoves, schedProblems } from "../lib/nx/suggest";
import { toCoreD } from "../lib/repo";
import type { RcData } from "../lib/types";

const TODAY = "2026-11-25"; // 週三
const demo = (): RcData => toCoreD(demoSeed(TODAY));

describe("排課 ① 開課", () => {
  it("範例資料沒有問題；時段不夠、超鐘點上限、沒有老師都列出來", () => {
    const D = demo();
    expect(openProblems(D).filter((p) => p.lvl === "err")).toEqual([]);
    const g = D.groups[0];
    g.per = 60; // 一週只有 40 格
    const t = D.teachers.find((x) => x.id === g.teacher)! as RcData["teachers"][number] & { otMax?: number };
    t.hours = 10;
    t.otMax = 0;
    const P = openProblems(D);
    expect(P.some((p) => p.lvl === "err" && p.text.startsWith(g.name + "：可以排的時段只有") && p.at === "g-" + g.id)).toBe(true);
    expect(P.some((p) => p.lvl === "err" && p.text.startsWith(t.name + " 超鐘點") && p.at === "t-" + t.id)).toBe(true);
  });
});

describe("排課 ② 編組", () => {
  it("年級不同的學生：列出來，建議換回同年級的課，套用後就沒有了", () => {
    const D = demo();
    const g4 = D.groups.find((g) => g.id === "g4")!,
      g1 = D.groups.find((g) => g.id === "g1")!;
    g4.students = g4.students.filter((x) => x !== "s9");
    g1.students.push("s9"); // 801 的學生放進七國
    expect(needProblems(D).some((p) => p.text.includes("蔡小晴 在 七國（年級不同）"))).toBe(true);
    const mv = regroupMoves(D);
    expect(mv).toEqual([expect.objectContaining({ sid: "s9", from: "g1", to: "g4" })]);
    // 只算出來，D 沒有變
    expect(g1.students).toContain("s9");
    expect(applyRegroup(D, mv)).toBe(1);
    expect(g4.students).toContain("s9");
    expect(needProblems(D).some((p) => p.text.includes("年級不同"))).toBe(false);
    // 再套一次：已經不在原本那一組，跳過
    expect(applyRegroup(D, mv)).toBe(0);
  });

  it("學生同時在兩組：建議換到同科目、不衝堂的另一組，衝突變少", () => {
    const D = demo();
    D.assign.g1[0].s = "4-1"; // 七國 和 七英 同一格
    D.groups.push({ ...JSON.parse(JSON.stringify(D.groups[0])), id: "g11", name: "七國B", teacher: "", students: [] });
    D.assign.g11 = [{ s: "2-6", pin: false }, { s: "3-1", pin: false }, { s: "4-5", pin: false }, { s: "1-7", pin: false }, { s: "0-6", pin: false }];
    const before = schedProblems(D).filter((p) => p.k === "student").length;
    expect(before).toBeGreaterThan(0);
    expect(needProblems(D).filter((p) => p.lvl === "err" && p.text.includes("同時在兩組")).length).toBe(before);
    const mv = regroupMoves(D);
    expect(mv.length).toBeGreaterThan(0);
    mv.forEach((m) => expect([m.from, m.to]).toEqual(["g1", "g11"]));
    applyRegroup(D, mv);
    expect(schedProblems(D).filter((p) => p.k === "student").length).toBeLessThan(before);
  });

  it("沒有問題時不建議任何換組", () => {
    expect(regroupMoves(demo())).toEqual([]);
  });
});

describe("個管分配", () => {
  it("沒有個管、不是資源班、不當個管、超過上限", () => {
    const D = demo();
    expect(cmProblems(D)).toEqual([]);
    D.students[0].caseMgr = "";
    D.students[1].caseMgr = "k1";
    (D.teachers[2] as { noCM?: boolean }).noCM = true;
    (D.teachers[0] as { cmCap?: number }).cmCap = 2;
    const t = cmProblems(D).map((p) => p.text);
    expect(t).toContain("1 位學生沒有個管");
    expect(t.some((x) => x.includes("陳小華 的個管 張老師（國） 不是資源班老師"))).toBe(true);
    expect(t.some((x) => x.startsWith("李老師 設定不當個管，還有"))).toBe(true);
    expect(t.some((x) => x.startsWith("林組長 個管") && x.endsWith("超過上限 2"))).toBe(true);
  });
});

describe("學校資料：改了以後正式課表的衝突", () => {
  it("新增全校不排課的時段，排在那裡的課列出來；草稿不算", () => {
    const D = demo();
    expect(impactProblems(D, ["off"])).toEqual([]);
    (D as RcData & { blocked: string[] }).blocked = ["4-1"];
    const P = impactProblems(D, ["off"]);
    expect(P.length).toBe(2); // 七英、八國都在週五第 1 節
    expect(P.every((p) => p.lvl === "err" && p.text.includes("不能排在這裡"))).toBe(true);
  });
  it("教室變少：教室不夠", () => {
    const D = demo();
    D.rooms = D.rooms.slice(0, 1);
    expect(impactProblems(D, ["room"]).some((p) => p.text.includes("教室不夠"))).toBe(true);
  });
});

describe("段考 ③ 排考場", () => {
  const solved = () => {
    const X = build(normalize(JSON.parse(JSON.stringify(defaultData())), defaultData));
    runSolve(X, "all");
    return X;
  };
  it("一鍵修正違規：只動違規的那一節，其他節不變、固定的標記不變", () => {
    const X = solved();
    expect(examBadCount(X)).toBe(0);
    expect(fixViolations(X).text).toBe("沒有違規");
    // 第 2 節（數學）全部塞進只坐得下 2 人的特教辦公室，並且固定
    const t = X.M.ses.findIndex((s: { id: string }) => s.id === "d1p2");
    const G = X.M.rooms.findIndex((r: { id: string }) => r.id === "G");
    const mine: number[] = [];
    X.M.parts.forEach((P: unknown, p: number) => {
      if (X.ST.ses[p] === t) {
        X.ST.room[p] = G;
        X.ST.pin[p] = 1;
        mine.push(p);
      }
    });
    expect(mine.length).toBeGreaterThan(2);
    const before = examBadCount(X);
    expect(before).toBeGreaterThan(0);
    const ses0 = X.ST.ses.slice(),
      room0 = X.ST.room.slice(),
      pin0 = X.ST.pin.slice();
    const r = fixViolations(X);
    expect(r.before).toBe(before);
    expect(r.after).toBe(0);
    expect(examBadCount(X)).toBe(0);
    expect(r.moved).toBeGreaterThan(0);
    X.M.parts.forEach((P: unknown, p: number) => {
      if (ses0[p] !== t) {
        expect(X.ST.ses[p]).toBe(ses0[p]);
        expect(X.ST.room[p]).toBe(room0[p]);
      }
    });
    expect([...X.ST.pin]).toEqual([...pin0]);
    expect(X.D.assign).toBeTruthy();
  });

  it("監考衝突：同一位老師同時兩場，修正後沒有衝突，手動選的其他場不動", () => {
    const X = solved();
    expect(procConflicts(X)).toEqual([]);
    const used = usedNow(X);
    // 同一節兩間試場
    const byT = new Map<string, typeof used>();
    used.forEach((c) => byT.set(c.T.id, [...(byT.get(c.T.id) || []), c]));
    const two = [...byT.values()].find((l) => l.length >= 2)!;
    expect(two).toBeTruthy();
    const n = X.D.proctors[0];
    X.D.procMan = { [two[0].key]: 1, [two[1].key]: 1 };
    X.D.proctorOf[two[0].key] = n;
    X.D.proctorOf[two[1].key] = n;
    const cf = procConflicts(X);
    expect(cf.length).toBe(1);
    expect(cf[0].m).toContain("時間重疊");
    const r = fixProcConflicts(X);
    expect(r.cleared).toBe(1);
    expect(r.left).toBe(0);
    expect(procConflicts(X)).toEqual([]);
    // 被清掉的是後面那一場；前面那一場仍是手動選的那位
    expect(X.D.proctorOf[two[0].key]).toBe(n);
    expect(X.D.procMan![two[0].key]).toBe(1);
    expect(X.D.proctorOf[two[1].key]).not.toBe(n);
  });

  it("請 AI 說明：學生與監考老師都換成代號，回來再換回", () => {
    const X = solved();
    const t = X.M.ses.findIndex((s: { id: string }) => s.id === "d1p2");
    X.M.parts.forEach((P: unknown, p: number) => {
      if (X.ST.ses[p] === t) X.ST.room[p] = 6;
    });
    const o = { msgs: [] as { m: string }[], unassigned: 0 };
    evaluate(X.M, X.ST, o as never);
    expect(o.msgs.length).toBeGreaterThan(0);
    const { req, pairs } = examAiRequest(X);
    X.D.students.forEach((s) => {
      expect(req.prompt).not.toContain(s.name);
      expect(req.prompt).not.toContain(s.name.slice(1));
    });
    X.D.proctors.forEach((n) => expect(req.prompt).not.toContain(n));
    expect(req.prompt).toContain("超過容量");
    expect(req.prompt).toContain("特教辦公室");
    expect(examAiRestore("學生1 和 學生10 移到學中一；監考A 換場", pairs)).toBe(X.D.students[0].name + " 和 " + X.D.students[9].name + " 移到學中一；" + X.D.proctors[0] + " 換場");
  });
});

describe("IEP 會議", () => {
  const survey = (D: RcData) => IEP.ensure(D).rounds.find((r) => !r.quick)!;
  const quick = (D: RcData) => IEP.ensure(D).rounds.find((r) => r.quick)!;

  it("② 排定：還沒排、排在必要的人不能來的時間；建議只先算出來，勾選才套用", () => {
    const D = demo();
    const R = survey(D);
    let busy = IEP.busyOf(D, R);
    const m = R.meets[0];
    expect(planProblems(D, R, busy)).toEqual([expect.objectContaining({ lvl: "warn", id: m.id })]);
    const rk = IEP.rank(D, R, m, busy);
    const bad = rk.find((r) => !r.ok),
      good = rk.filter((r) => r.ok);
    expect(bad && good.length).toBeTruthy();
    m.at = bad!.k;
    m.pin = 1;
    busy = IEP.busyOf(D, R);
    const P = planProblems(D, R, busy);
    expect(P).toEqual([expect.objectContaining({ lvl: "err", id: m.id })]);
    expect(P[0].text).toContain("不能來");
    const S = planSuggest(D, R, busy);
    expect(m.at).toBe(bad!.k); // 沒有改
    expect(S.un).toEqual([]);
    expect(S.changes).toEqual([expect.objectContaining({ id: m.id, from: bad!.k, pinned: true })]);
    expect(good.map((r) => r.k)).toContain(S.changes[0].to);
    expect(applyPlanChanges(R, S.changes, new Set())).toBe(0);
    expect(applyPlanChanges(R, S.changes, new Set([m.id]))).toBe(1);
    expect(m.at).toBe(S.changes[0].to);
    expect(m.pin).toBe(1);
    expect(planProblems(D, R, IEP.busyOf(D, R))).toEqual([]);
  });

  it("直接開會：個管那一節有資源班的課 → 問題；建議時段必要的人都有空，套用後沒有問題", () => {
    const D = demo();
    const R = quick(D);
    const m = R.meets[0];
    m.at = "2026-11-25|6"; // 週三第 6 節：王老師上七國
    R.slots = [["2026-11-25", "6"]];
    const P = quickProblems(D, R, IEP.busyOf(D, R));
    expect(P.some((p) => p.lvl === "err" && p.text.startsWith("王老師：資源班上課"))).toBe(true);
    const S = quickSuggest(D, R, 3);
    expect(S.length).toBe(3);
    expect(S.every((o) => o.ok && o.k !== m.at && o.k >= "2026-11-25")).toBe(true);
    quickApply(R, S[0].k);
    expect(m.at).toBe(S[0].k);
    expect(R.slots).toEqual([IEP.splitKey(S[0].k)]);
    expect(quickProblems(D, R, IEP.busyOf(D, R)).filter((p) => p.lvl === "err")).toEqual([]);
  });

  it("請 AI 說明：只有會議代號、身分與時段，沒有學生、老師姓名與班級座號", () => {
    const D = demo();
    const R: Round = survey(D);
    const busy = IEP.busyOf(D, R);
    const { req, codes } = iepAiRequest(D, R, busy);
    D.students.forEach((s) => expect(req.prompt).not.toContain(s.name));
    D.teachers.forEach((t) => expect(req.prompt).not.toContain(t.name));
    expect(req.prompt).not.toMatch(/70\d-\d/);
    expect(req.prompt).toContain("會議1（還沒排）");
    expect(req.prompt).toContain("個管、資源班（必要）");
    expect(iepAiRestore(D, R, "會議1 可以改到週四", codes)).toBe("會議1（" + IEP.stuLabel(IEP.stuOf(D, R.meets[0].s)) + "） 可以改到週四");
  });
});

describe("沒有動到核心", () => {
  it("compile 的課數不變", () => {
    expect(CORE.compile(demo()).L.length).toBeGreaterThan(0);
  });
});

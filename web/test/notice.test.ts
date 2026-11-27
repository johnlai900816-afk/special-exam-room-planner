/* 學生通知單（lib/nx/notice.ts）是學校的公版：和舊版 notice.html 逐字相同。
     HTML：好幾種輸入（範例、從段考帶入、手動改格子、灰底、時間加框、下午合併、印章換圖／不顯示、沒有左上角方框、多行地點與科目、注意事項的標記）
          每一位學生的 noticeHtml 逐字相同
     連動：syncNotice（舊 syncPlanner）帶入後的整份資料一樣
     CSS：NOTICE_CSS 每一行都是 notice.html <style> 的原文；notice.html 裡所有影響紙張（.page）與列印的規則一行不少
     公版的固定內容：頁高 296.8mm、左上角方框 top 5.7mm、「請找學習中心導師：」、沒有家長回條 */
import { describe, expect, it } from "vitest";
import { defaultData as examDefault, type ExamD } from "../lib/nx/examCore";
import { build, normalize as exNormalize, runSolve } from "../lib/nx/examOut";
import { defaultData, normalize, NOTICE_CSS, noticeDoc, noticeHtml, syncNotice, type NoticeData } from "../lib/nx/notice";
import { noticeSandbox, noticeStyleLines } from "./examOld";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const OLD_FNS = ["esc", "normDate", "dateKey", "defaultData", "normalize", "hm", "fmt", "stuId", "mark", "lines2", "locHtml", "timeHtml", "cellOf", "dayCells", "noticeHtml", "GN", "syncPlanner"];

function oldNotice(N: NoticeData, code: string, P?: unknown) {
  const sb = noticeSandbox(OLD_FNS);
  sb.ctx.__N = JSON.stringify(N);
  sb.ctx.__P = P ? JSON.stringify(P) : "";
  sb.run("D=normalize(JSON.parse(__N));");
  return { sb, v: sb.run<string>(code) };
}
function arrangedExam(D: ExamD): ExamD {
  const X = build(exNormalize(clone(D), examDefault));
  runSolve(X, "all");
  return X.D;
}
function bigExam(): ExamD {
  const D = examDefault();
  D.title = "115學年度第1學期第2次段考";
  D.students.push({ id: "x1", cls: "905", seat: "11", name: "歐陽小明", sv: { ext: "*", pc: ["作文"] }, memo: "", on: true });
  D.students.push({ id: "x2", cls: "707", seat: "", name: "沒座號", sv: { small: "*" }, memo: "", on: true });
  D.students.push({ id: "x3", cls: "801", seat: "02", name: "這次不排", sv: { ext: "*" }, memo: "", on: false });
  D.sessions.push({ ...D.sessions[2], id: "mk9", subject: "數學", makeup: true, period: "第6節", start: "14:05", end: "14:50" });
  return D;
}

/** 好幾種通知單資料 */
function cases(): [string, NoticeData, unknown][] {
  const out: [string, NoticeData, unknown][] = [];
  out.push(["範例資料", normalize(defaultData()), null]);
  const E1 = arrangedExam(examDefault());
  out.push(["從段考帶入（範例段考）", normalize(defaultData()), E1]);
  const E2 = arrangedExam(bigExam());
  const N2 = normalize(defaultData());
  N2.head.stamp = "data:image/png;base64,iVBORw0KGgo=";
  N2.head.label = "";
  N2.days[0].pmMerge = true;
  N2.days[0].pmText = "回原班上課";
  N2.notes = "__底線__和[[外框]]、==灰底==\n第二項\n\n  第三項  ";
  out.push(["換印章、沒有方框、兩天下午合併、注意事項標記（帶入比較大的段考）", N2, E2]);
  const N3 = normalize(defaultData());
  N3.head.stampOn = false;
  N3.amCount = 3;
  N3.head.teachers = "王<老師>、陳&老師";
  out.push(["不顯示印章、上午 3 節、要跳脫的字", N3, E2]);
  return out;
}
/** 帶入後再手動改一些格子（舊版編輯區會做的事） */
function touch(N: NoticeData) {
  const s = N.students[0];
  if (!s) return;
  s.c["0-1"] = { loc: "學習中心一/(先到特教辦公室)", shade: true, s: "09:00", e: "10:40", subj: "數學/(延長)" };
  s.c["1-3"] = { loc: "原班" };
  s.pm = { 0: "-", 1: "回家" };
  s.notes = "只有這位：==帶尺==\n第二行 __底線__";
  if (N.students[1]) N.students[1].pm = { 1: "" };
}

describe("通知單 HTML 和 notice.html 逐字相同", () => {
  for (const [name, N0, P] of cases())
    it(name, { timeout: 60000 }, () => {
      const N = clone(N0);
      let oldJ = "";
      if (P) {
        const { sb } = oldNotice(N, "1", P);
        sb.run("syncPlanner(JSON.parse(__P),true,'');");
        oldJ = sb.run<string>("JSON.stringify(D)");
        const r = syncNotice(N, clone(P), 0, { extStudy: false });
        expect(r.ok).toBe(true);
        // 連動後的整份資料一樣（學生、每一格、日期、考科、時間、常用地點）
        expect(JSON.stringify(N)).toBe(oldJ);
        expect(N.students.length).toBeGreaterThan(2);
      }
      touch(N);
      const { sb } = oldNotice(N, "1");
      expect(N.students.length).toBeGreaterThan(0);
      N.students.forEach((s, i) => {
        const old = sb.run<string>("noticeHtml(D.students[" + i + "])");
        expect(noticeHtml(N, s)).toBe(old);
      });
    });
  it("連動兩次（考程改了）結果也一樣；手動改過的學生留下來", { timeout: 60000 }, () => {
    const N = normalize(defaultData());
    const E = arrangedExam(bigExam());
    syncNotice(N, clone(E), 0, { extStudy: false });
    touch(N);
    const { sb } = oldNotice(N, "1");
    const E2 = clone(E);
    E2.students = E2.students.slice(2);
    E2.sessions[1].start = "09:20";
    sb.ctx.__P = JSON.stringify(E2);
    sb.run("syncPlanner(JSON.parse(__P),true,'');");
    syncNotice(N, clone(E2), 0, { extStudy: false });
    expect(JSON.stringify(N)).toBe(sb.run<string>("JSON.stringify(D)"));
    N.students.forEach((s, i) => expect(noticeHtml(N, s)).toBe(sb.run<string>("noticeHtml(D.students[" + i + "])")));
  });
  it("排列機換了學生 id（例：搬到新版）：手改過的不會變成重複的一份，手改的格子併進連動的那份", { timeout: 60000 }, () => {
    const N = normalize(defaultData());
    const E = arrangedExam(bigExam());
    syncNotice(N, clone(E));
    const n0 = N.students.length;
    const s0 = N.students[0];
    const key = s0.cls + "-" + s0.seat;
    const exCell = Object.keys(s0.a)[0];
    s0.c["0-2"] = { loc: "學習中心四" }; // 自習節手改的地點
    const E2 = clone(E);
    E2.students.forEach((s) => (s.id = "new-" + s.id));
    E2.assign = Object.fromEntries(Object.entries(E2.assign || {}).map(([k, v]) => ["new-" + k, v]));
    const r = syncNotice(N, clone(E2));
    expect(r.add).toBe(0);
    expect(N.students.length).toBe(n0);
    const same = N.students.filter((s) => s.cls + "-" + s.seat === key);
    expect(same.length).toBe(1);
    expect(same[0].pid).toMatch(/^new-/);
    expect(same[0].c["0-2"]).toEqual({ loc: "學習中心四" });
    expect(same[0].a[exCell]).toEqual(s0.a[exCell]);
    // 印出來：考試那幾節照排考場，手改的自習節照手改
    const html = noticeHtml(N, same[0]);
    expect(html).toContain("學習中心四");
    expect(html).toContain(String(s0.a[exCell].loc).split("/")[0]);
  });
  it("已經有重複的（板橋：一份沒連動、只有手改的自習節，一份連動）：下一次連動併成一份", { timeout: 60000 }, () => {
    const N = normalize(defaultData());
    const E = arrangedExam(bigExam());
    syncNotice(N, clone(E));
    const n0 = N.students.length;
    const t = N.students[0];
    N.students.push({ cls: t.cls, seat: t.seat, name: t.name, a: {}, c: { "0-5": { shade: true, loc: "環教中心" } }, pm: {}, notes: null });
    const r = syncNotice(N, clone(E));
    expect(r.merged).toBe(1);
    expect(N.students.length).toBe(n0);
    const same = N.students.filter((s) => s.cls === t.cls && s.seat === t.seat);
    expect(same.length).toBe(1);
    expect(same[0].pid).toBeTruthy();
    expect(same[0].c["0-5"]).toEqual({ shade: true, loc: "環教中心" });
  });
});

describe("延長考試的前後一節在同一間教室自習（板橋 2026-11）", () => {
  // 自己做一份小段考：第 1 天第 1、3 節考試，第 2 節沒考；第 2 天下午第 5 節延長、第 4 節（上午最後一節）不跨午休
  function mini(mode1: "after" | "before", mode3: "after" | "before") {
    const D = examDefault();
    D.title = "115學年度第1學期第2次段考";
    const base = D.sessions[0];
    D.sessions = [
      { ...base, id: "a1", date: "12/01", period: "第1節", start: "08:20", end: "09:05", subject: "國文", grades: [7, 8, 9], extMin: 20, extMode: mode1, makeup: false },
      { ...base, id: "a3", date: "12/01", period: "第3節", start: "10:10", end: "10:55", subject: "數學", grades: [7, 8, 9], extMin: 20, extMode: mode3, makeup: false },
      { ...base, id: "b5", date: "12/02", period: "第5節", start: "13:10", end: "13:55", subject: "英文", grades: [7, 8, 9], extMin: 20, extMode: "before", makeup: false },
    ];
    D.students = [
      { id: "e1", cls: "907", seat: "05", name: "延長生", sv: { ext: "*" }, memo: "", on: true },
      { id: "n1", cls: "907", seat: "06", name: "沒延長", sv: { small: "*" }, memo: "", on: true },
    ];
    return arrangedExam(D);
  }
  const stuOf = (N: NoticeData, seat: string) => N.students.find((s) => s.seat === seat)!;
  it("前一節延長到下一節：第 2 節在第 1 節的教室自習", { timeout: 60000 }, () => {
    const E = mini("after", "after");
    const N = normalize(defaultData());
    syncNotice(N, clone(E));
    const s = stuOf(N, "05");
    expect(s.a["0-1"]).toEqual({ loc: s.a["0-0"].loc, subj: "自習" });
    // 沒有延長的學生不變（照舊回原班）
    expect(stuOf(N, "06").a["0-1"]).toBeUndefined();
    // 第 4 節（上午最後一節）後面是午休，第 5 節的延長不往上跨
    expect(s.a["1-3"]).toBeUndefined();
    // 關掉這個功能時和舊版一樣
    const N0 = normalize(defaultData());
    syncNotice(N0, clone(E), 0, { extStudy: false });
    expect(stuOf(N0, "05").a["0-1"]).toBeUndefined();
  });
  it("後一節提早開始：第 2 節在第 3 節的教室自習；手改過的格子照手改", { timeout: 60000 }, () => {
    const E = mini("before", "before");
    const N = normalize(defaultData());
    syncNotice(N, clone(E));
    const s = stuOf(N, "05");
    expect(s.a["0-1"]).toEqual({ loc: s.a["0-2"].loc, subj: "自習" });
    s.c["0-1"] = { loc: "學習中心四" };
    syncNotice(N, clone(E));
    expect(noticeHtml(N, stuOf(N, "05"))).toContain("學習中心四");
  });
});

describe("公版的樣式與固定內容不變", () => {
  const css = NOTICE_CSS.split("\n");
  const old = noticeStyleLines();
  it("NOTICE_CSS 每一行都是 notice.html 的原文", () => {
    css.forEach((l) => expect(old).toContain(l));
  });
  it("notice.html 裡影響紙張與列印的規則，一行不少", () => {
    const i = old.findIndex((l) => l.startsWith("/* ---------- 通知單本體"));
    const j = old.findIndex((l) => l.startsWith("/* ---------- 操作介面"));
    // 紙張本體那一段整段（.page 的所有規則）
    old
      .slice(i, j)
      .filter((l) => l.trim())
      .forEach((l) => expect(css).toContain(l));
    // 列印：@page 與 @media print 那一段
    const k = old.findIndex((l) => l === "@page{size:A4;margin:0}");
    expect(k).toBeGreaterThan(0);
    for (let x = k; x < old.length && old[x] !== "}"; x++) expect(css).toContain(old[x]);
    expect(css).toContain("}");
    ["*{box-sizing:border-box}", "#print{display:none}", "html,body{height:100%}"].forEach((l) => expect(css).toContain(l));
  });
  it("頁高 296.8mm、左上角方框 top 5.7mm、標楷體", () => {
    expect(NOTICE_CSS).toContain(".page{width:210mm;height:296.8mm;");
    expect(NOTICE_CSS).toContain(".page .label{position:absolute;left:15.9mm;top:5.7mm;");
    expect(NOTICE_CSS).toContain('"標楷體","DFKai-SB"');
  });
  it("固定文字「請找學習中心導師：…」、沒有家長回條", () => {
    const N = normalize(defaultData());
    const h = noticeHtml(N, N.students[0]);
    expect(h).toContain("如有疑問，請找學習中心導師：○○○老師、○○○老師。</p>");
    expect(h).not.toMatch(/回條|家長簽名|家長回/);
    const doc = noticeDoc(N, N.students, N.students, "/");
    expect(doc).not.toMatch(/回條/);
    expect(doc).toContain('<div id="print">' + N.students.map((s) => noticeHtml(N, s)).join("") + "</div>");
  });
});

/* 全校課表（lib/nx/tt.ts）和舊版逐項比對：
     tt.js 畫面那一半（saveCur、nextPending、acceptAll、pend、rosterHtml、runJob 的存檔順序）與
     app.js 的 ttApplyCS、ttEditOk（只有統計的核對）、readTT（文字 PDF → ttParseAll → ttStore）
   原文都放在 node 的 vm 沙盒裡跑（test/oldApp.ts），畫面的東西給最少的替身；同一份資料兩邊跑完，整份 D.tt／classHead／classSubj 一樣。
   讀圖用假的 Gemini（不連網）：tt.js 的 readPage 原封不動，只換掉 fetch。資料是 repo 根目錄 test-tt-data.js 的虛構課表。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import FX_JS from "../../test-tt-data.js";
import { GEMINI } from "../lib/ai";
import { CORE } from "../lib/core";
import { planOnD } from "../lib/nx/apply";
import {
  acceptAll,
  applyCS,
  applyGridEdit,
  C,
  clsSort,
  csList,
  keepName,
  nextPending,
  pend,
  recheckAll,
  renameName,
  rosterCheck,
  rowsOf,
  runPages,
  saveSummary,
  storeOcr,
  sumRows,
  textPage,
  TTR,
  ttOf,
  type GridCheck,
  type PdfTextItem,
  type TtGrid,
  type TtPage,
} from "../lib/nx/tt";
import { splitD, toCoreD } from "../lib/repo";
import type { RcData } from "../lib/types";
import { oldSandbox, pick } from "./oldApp";

interface Fx {
  TEACHERS: string[];
  truth(c: string): { cls: string; head: string; cells: ({ s: string; t: string } | null)[][]; summary: { subject: string; teacher: string; periods: number }[] };
  answer(c: string, inject?: boolean): Record<string, unknown>;
  reply(o: unknown): unknown;
}
const FX = FX_JS as unknown as Fx;

const TT_SRC = readFileSync(resolve(__dirname, "../../tt.js"), "utf8").replace(/\r/g, "").split("\n");
/** tt.js 畫面那一半的函式原文（IIFE 裡最外層的 function／const，到下一個沒有縮排的敘述為止） */
function ttPick(name: string): string {
  const re = new RegExp("^(async )?function " + name + "\\(|^const " + name + "=");
  const i = TT_SRC.findIndex((l) => re.test(l));
  if (i < 0) throw new Error("tt.js 裡找不到 " + name);
  const out = [TT_SRC[i]];
  for (let j = i + 1; j < TT_SRC.length && /^\s/.test(TT_SRC[j]); j++) out.push(TT_SRC[j]);
  return out.join("\n");
}
const TT_UI = ["clsSort", "pend", "hints", "recheckAll", "rowsOf", "saveCur", "nextPending", "acceptAll", "rosterHtml", "runJob"].map(ttPick);
const APP_TT = ["TT_COL", "ttCell", "ttApplyCS", "ttEditOk", "TTJOB", "PDF_OPT", "readTT"].map((n) => {
  if (n === "PDF_OPT") return "const PDF_OPT={};";
  return pick(n);
});

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const sb0 = (extra: Record<string, unknown> = {}) =>
  oldSandbox(
    [
      `const C=CORE;let CUR='',JOB=null,PREV=false;const TTP={};function changed(){}function repaint(){}
       const gmMsg=e=>e&&e.message;const secH=(n,t,x)=>'<h3>'+t+(x||'')+'</h3>';
       function ttPdf(){return Promise.resolve();}`,
      ...TT_UI,
      ...APP_TT,
    ],
    { extra: { AbortController, ...extra } },
  );

/** 名冊：課表上的老師都在名冊裡（和 test-tt.js 的 sample 一樣） */
function sample(): RcData {
  const D = CORE.normalize(CORE.defaultData());
  D.teachers = FX.TEACHERS.map((n, i) => ({ id: "t" + i, name: n, role: "普通班", off: [], note: "", hours: 0 }));
  D.classSubj = {};
  D.classHead = {};
  D.students = [
    { id: "s1", cls: "701", seat: "01", name: "學生甲", caseMgr: "", needs: [] },
    { id: "s2", cls: "801", seat: "02", name: "學生乙", caseMgr: "", needs: [] },
    { id: "s3", cls: "901", seat: "03", name: "學生丙", caseMgr: "", needs: [] },
  ] as unknown as RcData["students"];
  return D;
}
/** 讀三班（故意放的錯字都在）＋一頁班級看不清楚 */
function readSome(D: RcData) {
  const K = C.ttHintNames(D);
  ["701", "702", "801"].forEach((c) => C.ttGridStore(D, c, C.ttGridCheck(D, FX.answer(c)), { src: c + ".pdf", known: K }));
  const bad = C.ttGridCheck(D, { ...FX.answer("801", false), class: "" });
  C.ttGridStore(D, "?4", bad, { src: "x.pdf 第 4 頁", known: K });
  return D;
}
const pick2 = (D: RcData) => clone({ tt: D.tt, classHead: D.classHead, ttOk: D.ttOk ?? null });

describe("讀圖：tt.js 原封不動（假的 Gemini）", () => {
  it("TTR 就是 repo 根目錄的 tt.js；readPage 整理出的格子＝core.ttGridCheck", async () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, String(v)), removeItem: (k: string) => mem.delete(k) };
    const sent: { url: string; body: { contents: { parts: { inlineData?: { data: string }; text?: string }[] }[] } }[] = [];
    // tt.js 用的是 globalThis.GEMINI（gemini.js 載入時設的那一份）
    const G = (globalThis as unknown as { GEMINI?: typeof GEMINI }).GEMINI || GEMINI;
    G.config({
      store: () => store,
      now: () => 1.7e12,
      sleep: async () => {},
      signedIn: () => false,
      projectId: () => "demo",
      fetch: async (url: string, init: { body: string }) => {
        sent.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 200, json: async () => FX.reply(FX.answer("801")), headers: { get: () => null } };
      },
    });
    G.setMode("browser");
    G.setKey("AIzaFAKE");
    G.setModel("gemini-3-flash");
    const D = sample(),
      K = C.ttHintNames(D);
    const r = await TTR.readPage("data:image/jpeg;base64,QUJD", K, { D });
    expect(r.e).toEqual(C.ttGridCheck(D, FX.answer("801")));
    expect(sent[0].body.contents[0].parts[0].inlineData!.data).toBe("QUJD");
    expect(sent[0].body.contents[0].parts[1].text).toMatch(/李惠婷/);
    expect(JSON.stringify(sent[0].body)).not.toMatch(/學生甲/);
    expect(TTR.estimate(30, "proxy")).toMatchObject({ req: 30, min: 6 });
  });

  it("整批讀（runJob）：同時兩頁、班級重複改成 ?頁碼、失敗的頁、最後重算——存下來的和舊版一樣", async () => {
    const imgs = ["701", "702", "801", "701", "", "bad"];
    const fake = (img: string, D: RcData) => {
      if (img === "img:bad") return Promise.reject(Object.assign(new Error("被安全規則擋下"), { code: "safety" }));
      const c = img.slice(4);
      return Promise.resolve({ e: C.ttGridCheck(D, c ? FX.answer(c) : { ...FX.answer("702", false), class: "" }), logId: "L" + c });
    };
    const pages = (): TtPage[] => imgs.map((c, i) => ({ n: i + 1, img: "img:" + c, src: "a.pdf 第 " + (i + 1) + " 頁", st: "" }));

    // 舊版：tt.js runJob 原文，readPage 換成假的
    const old = sb0({ TTR: { ...TTR, readPage: (img: string, _K: unknown, o: { D: RcData }) => fake(img, o.D) }, GEMINI: { setSeen() {}, logUpdate() {} } });
    old.ctx.__D = sample();
    old.ctx.__P = pages();
    old.run("D=__D;JOB={run:false,pages:__P};");
    await old.run<Promise<void>>("runJob(JOB.pages)");
    const oldD = old.ctx.D as RcData;

    // 新版
    const D = sample(),
      K = C.ttHintNames(D),
      P = pages();
    const r = await runPages(P, {
      read: (p) => fake(p.img, D),
      store: (c, e, p) => C.ttGridStore(D, c, e, { src: p.src, known: K }),
      finish: () => recheckAll(D),
      signal: new AbortController().signal,
    });
    expect(Object.keys(ttOf(D)).sort()).toEqual(["701", "702", "801", "?4", "?5"]);
    expect(pick2(D)).toEqual(pick2(oldD));
    expect(P.map((p) => [p.st, p.cls || "", p.msg || ""])).toEqual((old.ctx.__P as TtPage[]).map((p) => [p.st, p.cls || "", p.msg || ""]));
    expect(r).toMatchObject({ ok: 5, bad: 1, halt: null, stopped: false });
  });
});

/** 核對表的格子（tt.js open 的 input）：作息的每一節 × 星期一～五，fix 是要改的 */
function inputs(D: RcData, c: string, fix: Record<string, { s?: string; t?: string }>) {
  const o = ttOf(D)[c];
  const list: { dataset: { d: string; p: string; f: string }; value: string }[] = [];
  const cells: Record<string, { s: string; t: string }> = {};
  rowsOf(D, o).forEach((p) =>
    [0, 1, 2, 3, 4].forEach((d) => {
      const x = C.ttCellAt(D, c, d + "-" + p) || { s: "", t: "" },
        f = fix[d + "|" + p] || {};
      const v = { s: f.s ?? x.s, t: f.t ?? x.t };
      cells[d + "|" + p] = v;
      list.push({ dataset: { d: String(d), p, f: "s" }, value: v.s }, { dataset: { d: String(d), p, f: "t" }, value: v.t });
    }),
  );
  return { list, cells };
}
function oldSave(D: RcData, c: string, cls: string, head: string, fix: Record<string, { s?: string; t?: string }>, accept: boolean) {
  const sb = sb0();
  sb.ctx.__D = clone(D);
  sb.run("D=__D;");
  const { list } = inputs(sb.ctx.D as RcData, c, fix);
  const els = sb.ctx.els as Record<string, unknown>;
  els.ttC = { value: cls };
  els.ttH = { value: head };
  els.dlgBody = { querySelectorAll: () => list };
  sb.ctx.__c = c;
  const ok = sb.run<boolean>("CUR=__c;saveCur(" + accept + ")");
  return { ok, D: sb.ctx.D as RcData, cur: sb.run<string>("CUR") };
}
function newSave(D: RcData, c: string, cls: string, head: string, fix: Record<string, { s?: string; t?: string }>, accept: boolean) {
  const { cells } = inputs(D, c, fix);
  return applyGridEdit(D, c, { cls, head, cells, accept });
}
/** 第一個寫著 name 的格子 */
function findCell(D: RcData, c: string, t: string): string {
  const o = ttOf(D)[c];
  for (const p of rowsOf(D, o)) for (let d = 0; d < 5; d++) if (C.ttCellAt(D, c, d + "-" + p)?.t === t) return d + "|" + p;
  throw new Error("找不到 " + t);
}

describe("核對表存檔（saveCur）和舊版一樣", () => {
  const cases: [string, (D: RcData) => [string, string, string, Record<string, { s?: string; t?: string }>, boolean]][] = [
    ["改錯字（李惠亭→李惠婷）、儲存", (D) => ["701", "", "李惠婷", { [findCell(D, "701", "李惠亭")]: { t: "李惠婷" } }, false]],
    ["改班級、改導師、接受", () => ["702", "703", "新導師", {}, true]],
    ["清掉一格、早自習與第8節（作息沒有的）補字、科目簡稱（國文→國語文）、老師名字有空白", () => ["801", "", "蔡依珊", { "0|1": { s: "", t: "" }, "4|m": { s: "閱讀", t: "蔡依珊" }, "4|第8節": { s: "國文", t: "李 惠婷" } }, false]],
    ["看不清楚的班改成已經有課表的 701（蓋掉）", () => ["?4", "701", "", {}, false]],
    ["只改導師（導師欄原本有別人）", (D) => ((D.classHead as Record<string, string>)["801"] = "別人", ["801", "", "王大明", {}, false])],
    ["什麼都沒改、接受", () => ["701", "", "李惠婷", {}, true]],
  ];
  for (const [name, mk] of cases)
    it(name, () => {
      const D = readSome(sample());
      const [c, cls, head, fix, accept] = mk(D);
      const o = oldSave(D, c, cls, head, fix, accept);
      const nc = newSave(D, c, cls, head, fix, accept);
      expect(o.ok).toBe(true);
      expect(nc).toBe(o.cur);
      expect(pick2(D)).toEqual(pick2(o.D));
    });
  it("改過之後重算的待核對（flags）、統計（subj）、nextPending、pend 和舊版一樣", () => {
    const D = readSome(sample());
    newSave(D, "701", "", "李惠婷", { [findCell(D, "701", "李惠亭")]: { t: "李惠婷" } }, false);
    const sb = sb0();
    sb.ctx.__D = clone(D);
    sb.run("D=__D;");
    for (const c of Object.keys(ttOf(D))) {
      expect(ttOf(D)[c].flags).toEqual((ttOf(sb.ctx.D as RcData)[c] as TtGrid).flags);
      sb.ctx.__c = c;
      expect(pend(c, ttOf(D)[c])).toBe(sb.run("pend(__c,D.tt[__c])"));
      expect(nextPending(D, c)).toBe(sb.run("nextPending(__c)"));
    }
    expect(nextPending(D, "")).toBe(sb.run("nextPending('')"));
    const ks = ["?4", "701", "1001", "?12", "801", "702"];
    expect([...ks].sort(clsSort)).toEqual(sb.run<string[]>("['?4','701','1001','?12','801','702'].sort(clsSort)"));
  });
});

describe("全部接受、名字一次改、用課表更新任課老師", () => {
  it("全部接受（acceptAll）", () => {
    const D = readSome(sample());
    C.ttStore(D, "901", [{ sj: "數學", t: "王大朋", n: 4, unk: true }], "ocr");
    const sb = sb0();
    sb.ctx.__D = clone(D);
    sb.run("D=__D;acceptAll();");
    expect(acceptAll(D)).toBe(5);
    expect(pick2(D)).toEqual(pick2(sb.ctx.D as RcData));
    expect(nextPending(D)).toBe("");
  });
  it("全部改、名字沒錯（和 tt.js 的事件處理一樣：ttRename／ttOk 之後 recheckAll）", () => {
    const D = readSome(sample());
    const L = C.ttNameList(D);
    expect(L[0]).toMatchObject({ t: "李惠亭", n: 2, sug: "李惠婷" });
    const sb = sb0();
    sb.ctx.__D = clone(D);
    sb.run("D=__D;C.ttRename(D,'李惠亭','李惠婷');recheckAll();D.ttOk=[...new Set((D.ttOk||[]).concat(['林志豪']))];recheckAll();");
    expect(renameName(D, "李惠亭", "李惠婷")).toBe(2);
    keepName(D, "林志豪");
    expect(pick2(D)).toEqual(pick2(sb.ctx.D as RcData));
    expect(C.ttNameList(D)).toEqual([]);
  });
  it("用課表更新任課老師（ttApplyCS）：名冊沒有的老師新增成普通班", () => {
    const D = readSome(sample());
    renameName(D, "李惠亭", "李惠婷");
    D.teachers = D.teachers.filter((t) => t.name !== "郭嘉琳");
    D.groups.push({ id: "gx", name: "國文A", subject: "國文", teacher: "", per: 1, mode: "抽離", room: "", students: [] } as unknown as RcData["groups"][number]);
    const sb = sb0();
    sb.ctx.__D = clone(D);
    sb.run("D=__D;ttApplyCS();");
    const oldD = sb.ctx.D as RcData;
    const n = applyCS(D, csList(D));
    const byName = (X: RcData) =>
      Object.fromEntries(Object.entries(X.classSubj).map(([k, id]) => [k, X.teachers.find((t) => t.id === id)?.name + "/" + X.teachers.find((t) => t.id === id)?.role]));
    expect(n).toBeGreaterThan(0);
    expect(byName(CORE.normalize(D))).toEqual(byName(oldD));
    expect(D.teachers.map((t) => t.name)).toEqual(oldD.teachers.map((t) => t.name));
    expect(sb.run<string[]>("toasts")[0]).toBe("更新 " + n + " 格");
    expect((oldD.teachers.find((t) => t.name === "郭嘉琳") as Record<string, unknown>)._new).toBe(1); // 舊版會留下 _new，新版不存
  });
  it("和名冊對照（rosterHtml）：課表沒有的班、任課老師不同的格子", () => {
    const D = readSome(sample());
    D.classSubj["701|國文"] = "t3";
    const sb = sb0();
    sb.ctx.__D = clone(D);
    sb.run("D=__D;");
    const html = sb.run<string>("rosterHtml(3,D.tt,Object.keys(D.tt).sort(clsSort))");
    const r = rosterCheck(D);
    expect(r.noTT).toEqual(["901"]);
    expect(html).toContain("課表沒有的班級：901");
    expect(r.diff.length).toBeGreaterThan(1);
    expect(html).toContain("任課老師和課表不同 " + r.diff.length + " 格：</span>" + r.diff.slice(0, 30).join("；"));
  });
});

/** 文字 PDF 的一頁（pdf.js getTextContent 的 items）：頁首、格子、左下角編號、下方統計 */
function textItems(cls: string, withNo: boolean): PdfTextItem[] {
  const T = FX.truth(cls),
    it: PdfTextItem[] = [];
  const put = (str: string, x: number, y: number) => it.push({ str, transform: [1, 0, 0, 1, x, y] });
  put("○○國中 班級課表", 200, 800);
  put(withNo ? "班級：" + cls : "班級：", 60, 780);
  put("導師：" + T.head, 200, 780.5);
  T.cells.forEach((row, d) => row.forEach((c, p) => c && (put(c.s, 100 + d * 90, 740 - p * 40), put(c.t, 100 + d * 90, 725 - p * 40))));
  put(withNo ? "編號：" + cls : "編號：", 60, 300);
  T.summary.forEach((s, i) => put(s.subject + " " + s.teacher + " " + s.periods, 60 + (i % 4) * 130, 280 - Math.floor(i / 4) * 12));
  put("總時數：40", 60, 150);
  put(" ", 0, 0);
  return it;
}

describe("離線辨識（app.js readTT）：文字 PDF → ttParseAll → ttStore 和舊版一樣", () => {
  it("三頁（一頁沒有編號，用任課老師猜班級）", async () => {
    const D = sample();
    D.classSubj = { "702|國文": "t0", "702|英文": "t3", "702|數學": "t5" };
    const pg = [textItems("701", true), textItems("702", false), textItems("801", true)];
    const sb = sb0({
      pdfjsLib: {
        getDocument: () => ({ promise: Promise.resolve({ numPages: pg.length, getPage: async (n: number) => ({ getTextContent: async () => ({ items: pg[n - 1] }) }) }) }),
      },
    });
    sb.ctx.__D = clone(D);
    sb.run("D=__D;");
    await sb.run<Promise<void>>("readTT({files:[{name:'tt.pdf',arrayBuffer:async()=>new ArrayBuffer(1)}],value:''})");
    const pages = pg.map((items, i) => textPage(items, "tt.pdf 第 " + (i + 1) + " 頁", i));
    const r = storeOcr(D, pages);
    expect(r).toMatchObject({ n: 3, miss: 0 });
    expect(Object.keys(ttOf(D)).sort()).toEqual(["701", "702", "801"]);
    expect((ttOf(D)["702"] as TtGrid).guessCls).toBe(1);
    expect(pick2(D)).toEqual(pick2(sb.ctx.D as RcData));
  });
  it("只有統計的班的核對（ttEditOk）：改名字、刪一列、加一列、改班級", () => {
    const D = sample();
    C.ttStore(D, "?2", [{ sj: "數學", t: "王大朋", n: 4, unk: true }, { sj: "國語文", t: "李惠婷", n: 5 }], "b.pdf");
    const rows = sumRows(ttOf(D)["?2"]).concat([["", "", ""]]);
    rows[0] = ["數學", "王大明", "4", 1];
    rows[1] = ["", "", "", 0];
    rows[2] = ["英語文", "郭嘉琳", "x"];
    const sb = sb0();
    sb.ctx.__D = clone(D);
    sb.run("D=__D;");
    const els = sb.ctx.els as Record<string, unknown>;
    els.ttCls = { value: "802" };
    els.ttRows = { querySelectorAll: () => [{}, ...rows.map((r) => ({ querySelectorAll: () => [r[0], r[1], r[2]].map((v) => ({ value: String(v) })) }))] };
    sb.run("ttEditOk('?2')");
    expect(saveSummary(D, "?2", "802", rows)).toBe("802");
    expect(pick2(D)).toEqual(pick2(sb.ctx.D as RcData));
    expect(ttOf(D)["802"].subj).toEqual({ 數學: [["王大明", 4, 0]], 英語文: [["郭嘉琳", 1, 0]] });
  });
});

describe("存到新位置（classes.ttJson）之後 core.js 的查詢照用", () => {
  it("toCoreD(splitD(D)) 來回：格子、待核對、導師、名字沒錯都在；ttCellAt／ttTeacherBusy／ttStudentMissed 一樣", () => {
    const D = readSome(sample());
    keepName(D, "林志豪");
    const R = splitD(D);
    expect(typeof R.classes["701"].ttJson).toBe("string");
    expect(R.classes["701"].head).toBe("李惠婷");
    const D2 = toCoreD(R);
    expect(pick2(D2)).toEqual(pick2(D));
    const X = CORE as unknown as Record<string, (...a: unknown[]) => unknown>;
    expect(X.ttCellAt(D2, "701", "1-3")).toEqual(X.ttCellAt(D, "701", "1-3"));
    expect(X.ttStudentMissed(D2, "s2", "0-1")).toBe(X.ttStudentMissed(D, "s2", "0-1"));
    const busy = (Y: RcData) => Object.fromEntries(Object.entries(X.ttTeacherBusy(Y) as Record<string, Set<string>>).map(([k, v]) => [k, [...v].sort()]));
    expect(busy(D2)).toEqual(busy(D));
  });
  it("改一格只寫那一班的 classes 文件；名字沒錯另外寫 staff", () => {
    const R = splitD(readSome(sample()));
    const p = planOnD(R, (D) => void newSave(D, "701", "", "李惠婷", { [findCell(D, "701", "李惠亭")]: { t: "李惠婷" } }, false));
    expect(p.ops.set.map((o) => o.col + "/" + o.id)).toEqual(["classes/701"]);
    expect(p.ops.del).toEqual([]);
    const q = planOnD(R, (D) => keepName(D, "李惠亭"));
    expect(q.ops.set.map((o) => o.col).sort()).toEqual(["classes", "classes", "staff"]);
    const big = (p.ops.set[0].data as { ttJson: string }).ttJson.length;
    expect(big).toBeLessThan(60000); // 規則 classShape 的上限
  });
  it("清除課表：每一班的 ttJson 拿掉", () => {
    const R = splitD(readSome(sample()));
    const p = planOnD(R, (D) => void (D.tt = {}));
    expect(p.ops.set.every((o) => o.col === "classes" && !("ttJson" in (o.data as object)))).toBe(true);
  });
});

export type { GridCheck };

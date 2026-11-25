/* 開會通知、紙本時段表、QR 小單：新版（lib/nx/iepPrint.ts）印出來的 HTML 要和舊版 iep.js 畫面一模一樣。
   做法：在 node 的 vm 裡載入舊版 iep.js（連同畫面段落），給它最少的假 DOM 與 app.js 全域，讓它畫一次調查的頁面
   （U.pr＝notice／paper／qr 時頁面最後是預覽區 #outArea），取出 #outArea 的內容，和新版同一份資料的輸出逐字比對。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import { IEP, type Round } from "../lib/iep";
import { esc, noticesHtml, paperHtml, qrSlipsHtml, type PrintOpt } from "../lib/nx/iepPrint";
import type { RcData } from "../lib/types";

const SRC = readFileSync(resolve(__dirname, "../../iep.js"), "utf8");
const sortStu = (a: { cls: string; seat: string; name: string }, b: typeof a) =>
  String(a.cls).localeCompare(String(b.cls)) || (+a.seat || 0) - (+b.seat || 0) || String(a.name).localeCompare(String(b.name));

function setup() {
  const D = CORE.defaultData() as RcData;
  const M = CORE.compile(D);
  const ST = CORE.toState(M, D);
  (M as Record<string, unknown>).lroom = ST.rfix;
  const ROOM = CORE.assignRooms(M, ST.slot);
  (D as Record<string, unknown>).classHead = { "701": "張老師（國）", "702": "吳老師" };
  const R = IEP.newRoundAs(D, "r2", { name: "期初調查", stu: ["s2", "s5", "s8"] }) as Round;
  R.kind = IEP.KINDS[0];
  R.due = "2026-12-04";
  R.rooms = ["會議室", "資源教室一"];
  IEP.setRange(D, R, "2026-12-07", "2026-12-11", ["5", "6", "7"]);
  const m0 = R.meets[0];
  IEP.addOther(D, R, m0, "陳媽媽", "家長", 1);
  const busy = IEP.busyOf(D, R, { M, slot: ST.slot, room: ROOM });
  IEP.progress(D, R).people.forEach((o) => IEP.fillRest(R, o.k, "y", null, busy));
  IEP.applyPlan(R, IEP.schedule(D, R, { busy }));
  R.cdue = "2026-12-03";
  // 線上連結的鑰匙：舊版存在這台電腦的 localStorage（rc-iep-tok），調查單只有雜湊
  const local = {};
  IEP.ensureTokens(D, R, local);
  return { D, M, ST, ROOM, R, busy, local };
}

/** 在 vm 裡跑舊版的畫面，回傳 #page 的 innerHTML */
const ORIGIN = "https://x.test",
  PATH = "/app/index.html";
const oldUrl = (t: string) => ORIGIN + "/app/iep.html?k=" + t;
function oldRender(env: ReturnType<typeof setup>, U: Record<string, unknown>) {
  const page = { innerHTML: "", addEventListener() {} };
  const store: Record<string, string> = { "rc-iep-tok": JSON.stringify({ [env.R.id]: env.local }) };
  const sb: Record<string, unknown> = {
    console,
    esc,
    CORE,
    D: env.D,
    M: env.M,
    ST: env.ST,
    ROOM: env.ROOM,
    save() {},
    render() {},
    go() {},
    toast() {},
    PAGES: {},
    page: "me_iep",
    sub: "survey",
    isRO: () => false,
    cloudState: "off",
    CLOUD: null,
    sortStu,
    libLoad: () => Promise.resolve(),
    location: { origin: ORIGIN, pathname: PATH },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] },
    document: { getElementById: (id: string) => (id === "page" ? page : null), querySelectorAll: () => [] },
    ME_TID: "r2",
    confirm: () => true,
    Date,
    Math,
    JSON,
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  const W = sb as unknown as { IEP: { ui: { install(): boolean; draw(sc: string, t: boolean): void; state: Record<string, unknown> } } };
  W.IEP.ui.install();
  const st = W.IEP.ui.state;
  (st.cur as Record<string, string>).r2 = env.R.id;
  Object.assign(st, U);
  W.IEP.ui.draw("r2", true);
  return page.innerHTML;
}
/** 預覽區是頁面的最後一段 */
const outArea = (h: string) => {
  const i = h.indexOf('<div id="outArea">');
  expect(i).toBeGreaterThanOrEqual(0);
  expect(h.endsWith("</div>")).toBe(true);
  return h.slice(i + '<div id="outArea">'.length, -"</div>".length);
};
function same(now: string, old: string) {
  if (now !== old) {
    let i = 0;
    while (now[i] === old[i]) i++;
    console.log("DIFF@" + i, "NEW:", now.slice(i - 80, i + 120), "OLD:", old.slice(i - 80, i + 120));
  }
  expect(now).toBe(old);
}

describe("開會通知和舊版一模一樣", () => {
  const env = setup();
  const host = IEP.hostLabel(env.D, env.R);
  it("有排定的會議（資料前提）", () => {
    expect(env.R.meets.filter((m) => m.at).length).toBeGreaterThan(1);
    expect(host).toBe("王老師");
  });
  const cases: Partial<PrintOpt>[] = [
    { nm: "cut", per: 4, priv: "full", all: false },
    { nm: "cut", per: 3, priv: "mask", all: true },
    { nm: "cut", per: 6, priv: "full", all: true },
    { nm: "cut", per: 4, priv: "cls", all: false },
    { nm: "sum", per: 4, priv: "full", all: false },
    { nm: "each", per: 4, priv: "full", all: false },
    { nm: "each", per: 4, priv: "mask", all: true },
  ];
  for (const c of cases)
    it(`${c.nm}／裁 ${c.per}／${c.priv}／${c.all ? "含家長" : "只有老師"}`, () => {
      const old = outArea(oldRender(env, { pr: "notice", ...c }));
      const now = noticesHtml(env.D, env.R, { ...(c as PrintOpt), host });
      expect(now.length).toBeGreaterThan(200);
      same(now, old);
    });
});

describe("紙本時段表和舊版一模一樣", () => {
  const env = setup();
  const host = IEP.hostLabel(env.D, env.R);
  for (const priv of ["full", "cls", "mask"] as const)
    it(priv, () => {
      const old = outArea(oldRender(env, { pr: "paper", priv }));
      const now = IEP.webPeople(env.D, env.R)
        .map((o) => paperHtml(env.D, env.R, o, { priv, host }))
        .join("");
      expect(now).not.toContain("有課");
      same(now, old);
    });
});

describe("QR 小單和舊版一模一樣（全寬，一張 3／4／6 份）", () => {
  const env = setup();
  const host = IEP.hostLabel(env.D, env.R);
  const url = (pk: string) => {
    const t = IEP.linkTok(env.R, env.local, pk);
    return t ? oldUrl(t) : "";
  };
  it("每個人都有連結（資料前提）", () => {
    const ppl = IEP.webPeople(env.D, env.R);
    expect(ppl.length).toBeGreaterThan(3);
    expect(ppl.every((o) => url(o.k))).toBe(true);
  });
  for (const per of [3, 4, 6] as const)
    for (const priv of ["full", "mask"] as const)
      it(`一張 ${per} 份／${priv}`, () => {
        const old = outArea(oldRender(env, { pr: "qr", per, priv }));
        const now = qrSlipsHtml(env.D, env.R, IEP.webPeople(env.D, env.R), url, { per, priv, host });
        expect(now).toContain('class="pg iepcut n' + per + '"');
        same(now, old);
      });
});

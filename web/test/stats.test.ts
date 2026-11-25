/* 統計（lib/nx/stats.ts）：
     每月超鐘點的紙：新版 otMonthHtml vs 舊版 extras.js loadPage 的 #outArea，逐字相同（好幾個月、放假日、學期外、減授、外加課算或不算）
     老師工作量：減授、應授、每週超鐘點、外加、超過／不足和舊版 loadPage 補的一樣
     otm.css 的每一行都從 extras.js 逐字複製；鎖課異動的匯出、標記
   舊版原文放在 node 的 vm 沙盒裡跑（test/oldApp.ts）。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planOnD } from "../lib/nx/apply";
import { recordLocksD, SCHED_COLS } from "../lib/nx/sched";
import { examDuty, freeRooms, loadRows, lockEntries, lockTSV, otMonthHtml, overtimeMonth, roomUsage, setLockSent, slotName, sortLoad } from "../lib/nx/stats";
import { demoRecords, toCoreD } from "../lib/repo";
import { buildBoard } from "../lib/schedule";
import type { RcData } from "../lib/types";
import { oldSandbox } from "./oldApp";

const EXTRAS = readFileSync(resolve(__dirname, "../../extras.js"), "utf8");

function oldLoad(D: RcData, now: number): { html: string; paper: string } {
  const sb = oldSandbox([EXTRAS], { now });
  sb.ctx.__D = JSON.parse(JSON.stringify(D));
  sb.run("D=normalize(__D);");
  const el = { innerHTML: "", firstElementChild: { addEventListener() {} } };
  sb.ctx.__el = el;
  sb.run("EXTRAS.loadPage(__el);");
  const h = el.innerHTML;
  const i = h.indexOf('<div id="outArea">');
  const j = h.indexOf('<p class="xx-otsg">', i);
  const k = h.indexOf("</div></div>", j);
  return { html: h, paper: i < 0 ? "" : h.slice(i + '<div id="outArea">'.length, k + "</div>".length) };
}

function data(): RcData {
  const D = toCoreD(demoRecords());
  D.title = "範例國中";
  const r = D.teachers.filter((t) => t.role === "資源班");
  r[0].hours = 18;
  (r[0] as Record<string, unknown>).reduce = 4;
  (r[0] as Record<string, unknown>).reduceNote = "組長";
  if (r[1]) r[1].hours = 2; // 一定超鐘點
  if (r[2]) r[2].hours = 0; // 沒填基本鐘點
  return D;
}

describe("每月超鐘點的紙和舊版一字不差", () => {
  const cases: [string, number, (D: RcData) => void][] = [
    ["本月（11 月）", new Date(2026, 10, 26, 10).getTime(), () => {}],
    ["有放假日、學期外", new Date(2026, 8, 10, 10).getTime(), (D) => ((D.settings.noClass = ["2026-09-25", "2026-09-28~2026-09-29"]), (D.settings.dates = "115.09.02-116.01.20"))],
    ["外加課算進超鐘點", new Date(2027, 0, 5, 10).getTime(), (D) => ((D.settings.otCountExtra = true), (D.settings.dates = "115.09.02-116.01.20"))],
  ];
  for (const [name, now, fix] of cases)
    it(name, () => {
      const D = data();
      fix(D);
      const old = oldLoad(D, now);
      expect(old.paper.length).toBeGreaterThan(200);
      const B = buildBoard(D);
      const d = new Date(now);
      const ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      expect(otMonthHtml(D, overtimeMonth(D, B.M, B.S.slot, ym))).toBe(old.paper);
    });
  it("沒有課表的月份也一樣（只有標題與老師）", () => {
    const D = data();
    D.assign = {};
    const now = new Date(2026, 10, 26, 10).getTime();
    const B = buildBoard(D);
    expect(otMonthHtml(D, overtimeMonth(D, B.M, B.S.slot, "2026-11"))).toBe(oldLoad(D, now).paper);
  });
});

describe("老師工作量", () => {
  it("減授、應授、每週超鐘點、外加、超過／不足：和舊版表格裡的數字一樣", () => {
    const D = data();
    const B = buildBoard(D);
    const rows = loadRows(D, B.M, B.S.slot, {});
    const old = oldLoad(D, new Date(2026, 10, 26, 10).getTime()).html;
    for (const r of rows) {
      expect(old).toContain(r.name);
      expect(r.due).toBe(Math.max(0, r.hours - r.reduce));
    }
    const t0 = rows.find((r) => r.reduce === 4)!;
    expect(t0.due).toBe(14);
    expect(old).toContain("組長");
    const over = rows.filter((r) => r.fl === "over").length;
    if (over) expect(old).toContain("超過上限 " + over + " 位");
    expect(sortLoad(rows, "per", -1)[0].per).toBe(Math.max(...rows.map((r) => r.per)));
    expect(sortLoad(rows, "name", 1).map((r) => r.name)).toEqual(rows.map((r) => r.name).sort((a, b) => a.localeCompare(b)));
  });
  it("監考：每一份段考的監考對照合起來", () => {
    expect(examDuty({ main: { proctorOf: { a: "王老師" }, supportOf: { b: "李老師" } }, e2: { proctorOf: { a: "王老師" } } })).toEqual({
      proctorOf: { "main/a": "王老師", "e2/a": "王老師" },
      supportOf: { "main/b": "李老師" },
    });
  });
});

describe("教室使用", () => {
  it("使用率與空教室（core.roomUsage、freeRooms）", () => {
    const D = data();
    const B = buildBoard(D);
    const U = roomUsage(B.M, B.S.slot, B.S.rfix);
    expect(U.rooms.length).toBe(D.rooms.length);
    for (let s = 0; s < U.NS; s++) expect(freeRooms(U, s).every((r) => !(U.cells[r.i][s] || []).length)).toBe(true);
    const busy = U.rooms.reduce((n, r) => n + r.used, 0);
    expect(busy).toBeGreaterThan(0);
  });
});

describe("鎖課異動", () => {
  it("記錄目前的鎖課 → 時間軸 → 標記為已交教務處 → 匯出", () => {
    const R = demoRecords();
    const p = planOnD(R, (D) => recordLocksD(D, null, "admin@x", 1000), SCHED_COLS);
    // 鎖課紀錄一份、學期的 lockLast（第一次記錄時 staff/legacy 的欄位清單也會多 lockLog）
    expect(p.ops.set.map((o) => o.col)).toEqual(expect.arrayContaining(["lockLog", "term"]));
    const R2 = { ...R, lockLog: Object.fromEntries(p.ops.set.filter((o) => o.col === "lockLog").map((o) => [o.id, o.data])) } as typeof R;
    const L = lockEntries(R2);
    expect(L.length).toBe(1);
    expect(L[0].e.first).toBe(true);
    const q = planOnD(R2, (D) => setLockSent(D, 0, 5000), SCHED_COLS);
    expect(q.ops.set.map((o) => o.col + "/" + o.id)).toEqual(["lockLog/" + L[0].id]);
    expect(JSON.parse(String(q.ops.set[0].data.json)).sentAt).toBe(5000);
    const D = toCoreD(R2);
    const tsv = lockTSV(D, L[0].e).split("\n");
    expect(tsv[0]).toBe("異動\t班級\t時段\t科目\t老師");
    expect(tsv.length).toBe(L[0].e.added.length + 1);
    expect(slotName(D, "0-" + D.periods[0].id)).toBe("週一" + D.periods[0].name);
  });
});

describe("列印樣式從 extras.js 逐字複製", () => {
  it("otm.css 的每一行規則都在 extras.js 的 css() 裡", () => {
    const css = readFileSync(resolve(__dirname, "../components/stats/otm.css"), "utf8");
    const lines = css
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("/*") && !l.endsWith("*/") && l !== "}" && !l.startsWith("@media"));
    expect(lines.length).toBeGreaterThan(4);
    for (const l of lines) expect(EXTRAS).toContain(l);
  });
  it("cards.css 的每一行規則都在 app.css 裡", () => {
    const app = readFileSync(resolve(__dirname, "../../app.css"), "utf8");
    const css = readFileSync(resolve(__dirname, "../components/check/cards.css"), "utf8");
    const lines = css
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("/*") && !l.endsWith("*/") && l !== "}" && !l.startsWith("@media"));
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) expect(app).toContain(l);
  });
});

/* 課表輸出：新版（lib/nx/schedOut.ts）印出來的 HTML 要和舊版 app.js renderOut 的 #outArea 一模一樣。
   舊版的 renderOut 原文放在沙盒裡跑（test/oldApp.ts），同一份範例資料、同一個日期，逐字比對全部的輸出種類。
   另外檢查 components/sched/out.css 的每一條規則都是從 app.css 逐字複製的。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import { outBoard, outHtml, OUT_MODES, type OutMode } from "../lib/nx/schedOut";
import { demoRecords, toCoreD } from "../lib/repo";
import type { RcData } from "../lib/types";
import { block, oldSandbox, pick } from "./oldApp";

const NOW = new Date(2026, 10, 26, 10, 30).getTime();

function oldOut(D: RcData, mode: OutMode, outG = ""): string {
  const sb = oldSandbox([pick("stuLabel"), pick("sortStu"), pick("setST"), pick("rebuild"), block("/* ───── 排課｜課表輸出 ───── */", "function copyOut")], { now: NOW });
  sb.ctx.__D = JSON.parse(JSON.stringify(D));
  sb.run(`D=normalize(__D);rebuild();outMode=${JSON.stringify(mode)};outG=${JSON.stringify(outG)};renderOut();`);
  const html = (sb.ctx.els as Record<string, { innerHTML: string }>).page.innerHTML;
  const i = html.indexOf('<div id="outArea">');
  if (i < 0) return "(沒有輸出)";
  return html.slice(i + '<div id="outArea">'.length, -"</div>".length);
}
function newOut(D: RcData, mode: OutMode, outG = ""): string {
  const D2 = CORE.normalize(JSON.parse(JSON.stringify(D)));
  const { M, S, ROOM } = outBoard(D2);
  return outHtml(D2, M, S, ROOM, mode, { outG, now: new Date(NOW) }) ?? "(沒有輸出)";
}

describe("課表輸出和舊版一模一樣（範例資料）", () => {
  const D = toCoreD(demoRecords());
  (D as Record<string, unknown>).classHead = { "701": "張老師（國）" };
  D.settings.dates = "115.09.02-116.01.20";
  for (const [mode, name] of OUT_MODES)
    it(name + "（" + mode + "）", () => {
      const a = oldOut(D, mode),
        b = newOut(D, mode);
      expect(a.length).toBeGreaterThan(200);
      expect(b).toBe(a);
    });
  it("學生個人課表只印一個年級", () => {
    expect(newOut(D, "card", "8")).toBe(oldOut(D, "card", "8"));
  });
  it("彈性鎖課（flex）的鎖課表、鎖課清單、導師抽離表也一樣", () => {
    const F = JSON.parse(JSON.stringify(D)) as RcData;
    F.settings.lockMode = "flex";
    for (const mode of ["lock", "lockraw", "homeroom", "regular"] as OutMode[]) expect(newOut(F, mode)).toBe(oldOut(F, mode));
  });
  it("沒有排課時兩邊都沒有輸出", () => {
    const E = JSON.parse(JSON.stringify(D)) as RcData;
    E.assign = {};
    expect(newOut(E, "teacher")).toBe("(沒有輸出)");
    expect(oldOut(E, "teacher")).toBe("(沒有輸出)");
  });
});

describe("列印樣式從 app.css 逐字複製", () => {
  it("out.css 的每一行規則都在 app.css 裡", () => {
    const app = readFileSync(resolve(__dirname, "../../app.css"), "utf8");
    const css = readFileSync(resolve(__dirname, "../components/sched/out.css"), "utf8");
    const rules = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && l !== "}" && !/^@media|^#outArea\s*\{$|^\.schedout\s*\{$/.test(l));
    expect(rules.length).toBeGreaterThan(30);
    for (const r of rules) expect(app, r).toContain(r);
  });
});

/* 段考輸出的紙張樣式（lib/nx/examPaperCss.ts）：每一行都是 exam.html 的原文；exam.html 裡紙本、列印、交卷名單、查考場的規則一行不少。 */
import { describe, expect, it } from "vitest";
import { EXAM_PAPER_CSS } from "../lib/nx/examPaperCss";
import { examStyleLines } from "./examOld";

describe("段考紙張樣式和 exam.html 一樣", () => {
  const css = EXAM_PAPER_CSS.split("\n");
  const old = examStyleLines();
  const section = (from: string, to: string) => {
    const i = old.findIndex((l) => l.startsWith(from)),
      j = old.findIndex((l, k) => k > i && l.startsWith(to));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThan(i);
    return old.slice(i, j).filter((l) => l.trim());
  };
  it("每一行都是原文", () => css.forEach((l) => expect(old).toContain(l)));
  it("紙本（服務表、動線、監考表、交卷名單）整段", () => section("/* ===== 紙本", "#noticeFrame").forEach((l) => expect(css).toContain(l)));
  it("查考場整段", () => section("/* 查考場 */", "/* 對話框 */").forEach((l) => expect(css).toContain(l)));
  it("列印、交卷名單（標楷體、A4 直式）整段", () => {
    const i = old.findIndex((l) => l === "@media print{");
    expect(i).toBeGreaterThan(0);
    old
      .slice(i)
      .filter((l) => l.trim())
      .forEach((l) => expect(css).toContain(l));
  });
  it("交卷名單是標楷體、黑字白底", () => {
    expect(EXAM_PAPER_CSS).toContain('.pg.hs{font-family:"標楷體","DFKai-SB","BiauKai","Kaiti TC",serif;color:#000;background:#fff;');
  });
});

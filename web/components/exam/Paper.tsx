"use client";
/* 段考的紙（服務表、動線、監考、交卷名單、補考名單、查考場）放在 iframe 裡：
   文件只有 exam.html 逐行複製的樣式（lib/nx/examPaperCss.ts）＋和舊版一樣的 HTML，所以畫面與列印都和舊版一樣，不受新版頁面樣式影響。
   印出：只印這個 iframe（列印前照舊版 fitPrint 縮放每一頁）。複製：選取 #outArea（貼到 Word 保留表格）。Word：舊版 downloadDoc。 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { EXAM_PAPER_CSS } from "@/lib/nx/examPaperCss";
import { fitPrint, unfitPrint } from "@/lib/nx/examOut";

export interface PaperHandle {
  print(): void;
  copy(): boolean;
  word(name: string): void;
}
export interface PaperProps {
  html: string;
  /** #outArea（輸出）或 #findOut（查考場） */
  area?: "outArea" | "findOut";
  /** 加在 <head> 的東西（交卷名單的直式頁面設定） */
  head?: string;
  /** #outArea 的 class（印出已勾選：pmark） */
  cls?: string;
  title: string;
  /** 點了交卷名單的方框（data-hs、data-hid、data-hv） */
  onBox?: (sj: string, id: string, v: string) => void;
}

const docOf = (p: PaperProps) =>
  '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><title>' +
  p.title.replace(/[<&]/g, "") +
  "</title><style>" +
  EXAM_PAPER_CSS +
  "</style>" +
  (p.head || "") +
  '</head><body><div class="wrap"><div class="tab on" id="tab-' +
  (p.area === "findOut" ? "find" : "out") +
  '"><div id="' +
  (p.area || "outArea") +
  '"' +
  (p.area === "findOut" ? "" : ' class="paper' + (p.cls ? " " + p.cls : "") + '"') +
  ">" +
  p.html +
  "</div></div></div></body></html>";

export const Paper = forwardRef<PaperHandle, PaperProps>(function Paper(p, ref) {
  const fr = useRef<HTMLIFrameElement>(null);
  const onBox = useRef(p.onBox);
  useEffect(() => {
    onBox.current = p.onBox;
  }, [p.onBox]);
  const size = useCallback(() => {
    const f = fr.current,
      d = f?.contentDocument;
    if (f && d?.documentElement) f.style.height = Math.max(160, d.documentElement.scrollHeight + 4) + "px";
  }, []);
  const onLoad = () => {
    const f = fr.current,
      w = f?.contentWindow,
      d = f?.contentDocument;
    if (!w || !d) return;
    size();
    d.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".hb");
      if (b && onBox.current) onBox.current(b.dataset.hs || "", b.dataset.hid || "", b.dataset.hv || "");
    });
    w.addEventListener("beforeprint", () => fitPrint(d));
    w.addEventListener("afterprint", () => {
      unfitPrint(d);
      size();
    });
    try {
      new ResizeObserver(size).observe(d.body);
    } catch {
      /* 舊瀏覽器：載入時量一次就好 */
    }
  };
  useImperativeHandle(ref, () => ({
    print() {
      const w = fr.current?.contentWindow;
      if (w) {
        w.focus();
        w.print();
      }
    },
    copy() {
      const d = fr.current?.contentDocument,
        el = d?.getElementById(p.area || "outArea");
      if (!d || !el) return false;
      const r = d.createRange();
      r.selectNodeContents(el);
      const s = d.getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
      let ok = false;
      try {
        ok = d.execCommand("copy");
      } catch {
        /* 舊版也是這樣 */
      }
      s.removeAllRanges();
      return ok;
    },
    word(name: string) {
      const d = fr.current?.contentDocument,
        el = d?.getElementById("outArea");
      if (!d || !el) return;
      downloadDoc(d, el, name);
    },
  }));
  return <iframe ref={fr} title={p.title} srcDoc={docOf(p)} onLoad={onLoad} className="block w-full rounded-2xl border-0 bg-white" style={{ height: 480 }} />;
});

/* 舊版 downloadDoc：Word（.doc＝HTML）；交卷名單的樣式（.hs）直接從這一頁的樣式表抄過去 */
function downloadDoc(doc: Document, area: HTMLElement, name: string) {
  const css =
    'table.svt{table-layout:fixed;border:2px solid #1f2a44}table.svt th,table.svt td{border:1px solid #8a93a6}table.svt th.dayh{background:#1f2a44;color:#fff;font-size:15px;text-align:left;padding:6px 12px;letter-spacing:1px}table.svt th{background:#e4e8f2;font-size:13px;padding:5px 4px}table.svt .c0{width:84px}table.svt td.sh2{background:#f1f3f9;vertical-align:middle;line-height:1.5}table.svt .sj{font-size:16px}table.svt .pd,table.svt .tm{font-weight:normal;font-size:12px;color:#333}table.svt .tx{font-weight:bold;font-size:12px;color:#b45309}table.svt td.em{background:#f7f7f8}table.svt .gp{margin:0 0 3px;line-height:1.55}table.svt .tg2{display:inline-block;font-size:11px;font-weight:bold;border-radius:4px;padding:0 4px;margin-right:3px;border:1px solid #999;line-height:1.45}table.svt .t-x,.lg .t-x{color:#b45309;border-color:#f0c58a;background:#fff6e8}table.svt .t-o,.lg .t-o{color:#15803d;border-color:#a7d7b5;background:#eefaf1}table.svt .t-r,.lg .t-r{color:#1d4ed8;border-color:#b0c4f5;background:#eef3ff}table.svt .t-p,.lg .t-p{color:#7e22ce;border-color:#d3b5f0;background:#f7efff}table.svt .t-s,.lg .t-s{color:#475569;border-color:#c5ccd6;background:#f3f4f6}table.svt .ft{margin-top:4px;padding-top:3px;border-top:1px dashed #8a93a6;font-size:12px;line-height:1.5}table.svt .ft b{margin-right:8px;white-space:nowrap}table.svt .ft .sp{color:#0f766e}table.svt .ft span{color:#555;white-space:nowrap}table.svt .nt{font-size:11.5px;color:#555}.lg{font-size:12px;color:#555;text-align:center;margin:0 0 8px}.lg .tg2{display:inline-block;font-size:11px;font-weight:bold;border-radius:4px;padding:0 4px;margin:0 3px 0 10px;border:1px solid #999}' +
    'body{font-family:"Microsoft JhengHei"}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:3px 4px;vertical-align:top;font-size:10pt}th,td.sh2{background:#d9d9d9;text-align:center}td.chg{background:#fff3c4}h2{text-align:center;font-size:14pt}' +
    // Word 用具名頁面切換方向：S1＝A4 橫向（服務表、動線表、監考表），S2＝A4 直式（交卷名單）
    "@page S1{size:841.9pt 595.3pt;mso-page-orientation:landscape;margin:1cm}div.S1{page:S1}@page S2{size:595.3pt 841.9pt;mso-page-orientation:portrait;margin:1cm}div.S2{page:S2}" +
    "td.chg{outline:none;border:2px solid #000;font-weight:bold}";
  let hsCss = "";
  try {
    for (const sh of Array.from(doc.styleSheets))
      for (const r of Array.from(sh.cssRules)) {
        const sel = (r as CSSStyleRule).selectorText;
        if (sel && /\.hs\b|\.hs[a-z]/.test(sel)) hsCss += r.cssText;
      }
  } catch {
    /* 讀不到樣式表就算了 */
  }
  const box = area.cloneNode(true) as HTMLElement;
  box.querySelectorAll(".noprint,style,script,svg").forEach((x) => x.remove()); // 畫面上的說明、按鈕、圖示不放進 Word
  box.querySelectorAll(".rep").forEach((x) => x.classList.remove("rep")); // 每天的標題在 Word 裡也要出現
  box.querySelectorAll(".tg2").forEach((x) => x.replaceWith("〔" + x.textContent + "〕")); // Word 不支援小色塊，改成括號文字
  const pm = area.classList.contains("pmark");
  box.querySelectorAll(".hb").forEach((x) => x.replaceWith(pm && x.classList.contains("on") ? "☑" : "□")); // 交卷名單的方框
  const pgs = Array.from(box.querySelectorAll(".pg"));
  const body = pgs.length
    ? pgs.map((p, i) => (i ? '<br clear="all" style="page-break-before:always">' : "") + '<div class="' + (p.classList.contains("hs") ? "S2 pg hs" : "S1") + '">' + p.innerHTML + "</div>").join("")
    : box.innerHTML;
  const html =
    '﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>' +
    css +
    hsCss +
    "</style></head><body>" +
    body +
    "</body></html>";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "application/msword" }));
  a.download = name + ".doc";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

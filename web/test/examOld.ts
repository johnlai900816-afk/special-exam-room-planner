/* 舊版 exam.html、notice.html 的程式放進 node 的 vm 裡跑（測試新版和舊版一樣用）。
   exam.html：核心那一段（CORE-START…CORE-END）整段放進去；畫面那一段只取要比對的函式原文（頂層的 function／const／let，
   到下一個頂層敘述為止），畫面的東西（$、toast、save…）給最少的替身。notice.html 同樣做法。
   檔案可能是 CRLF，一律先換成 LF。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const lf = (s: string) => s.replace(/\r\n/g, "\n");
export const EXAM_HTML = lf(readFileSync(resolve(__dirname, "../../exam.html"), "utf8"));
export const NOTICE_HTML = lf(readFileSync(resolve(__dirname, "../../notice.html"), "utf8"));
const CORE = EXAM_HTML.slice(EXAM_HTML.indexOf("/*CORE-START*/"), EXAM_HTML.indexOf("/*CORE-END*/"));
const MAIN = EXAM_HTML.slice(EXAM_HTML.indexOf("/*CORE-END*/")).split("\n");
const NOTICE = NOTICE_HTML.slice(NOTICE_HTML.indexOf("<script>\n'use strict';")).split("\n");

function pickFrom(lines: string[], name: string, file: string): string {
  const re = new RegExp("^(async )?function " + name + "\\(|^const " + name + "=|^let " + name + "=|^var " + name + "=|^const [^=]*," + name + "=");
  const i = lines.findIndex((l) => re.test(l));
  if (i < 0) throw new Error(file + " 裡找不到 " + name);
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l === "" || /^\s/.test(l)) out.push(l);
    else if (/^\}/.test(l)) {
      out.push(l);
      break;
    } else break;
  }
  return out.join("\n");
}
export const pickExam = (name: string) => pickFrom(MAIN, name, "exam.html");
export const pickNotice = (name: string) => pickFrom(NOTICE, name, "notice.html");

export interface Sandbox {
  ctx: vm.Context;
  run<T = unknown>(code: string): T;
}
const STUB_DOM = `
  const __els={};const $=id=>(__els[id]=__els[id]||{innerHTML:'',textContent:'',value:'',checked:false,style:{},dataset:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},close(){},showModal(){},focus(){},setAttribute(){},getAttribute(){return null},addEventListener(){}});
  const toasts=[];function toast(m){toasts.push(m);}
  function setTimeout(f){f();return 0;}function clearTimeout(){}
  const location={search:'',href:'http://x/exam.html',pathname:'/exam.html'};
`;
function fixedDate(now: number) {
  return `const __RealDate=Date;Date=class extends __RealDate{constructor(...a){super(...(a.length?a:[${now}]))}static now(){return ${now}}};`;
}

/** exam.html：核心＋取出的函式。全域 D、M、ST 和舊版一樣 */
export function examSandbox(names: string[], opt: { now?: number; roster?: unknown; extra?: string } = {}): Sandbox {
  const ctx = vm.createContext({ console, URLSearchParams, __roster: opt.roster ?? null });
  const now = opt.now ?? Date.UTC(2026, 10, 26, 2, 30);
  const pre = `
    ${fixedDate(now)}
    var module={exports:{}};
    ${CORE}
    ;
    ${STUB_DOM}
    var D,M,ST,undoStack=[],outMode='svc',curTab='board',VIEWK='',EMBED=true,cloudState='local',CLOUD=null;
    const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const ic=n=>'<svg class="ic" aria-hidden="true"><use href="#i-'+n+'"/></svg>';
    function save(){}function renderBoard(){}function renderProc(){}function renderOut(){}function isRO(){return false;}
    function rosterRead(){return __roster;}function pullOK(){return true;}function copyText(t){__copied=t;}var __copied='';
    ${opt.extra || ""}
  `;
  const src = [pre, ...names.map(pickExam)].join("\n;\n");
  vm.runInContext(src, ctx, { filename: "old-exam-sandbox.js" });
  return { ctx, run: <T,>(code: string) => vm.runInContext(code, ctx) as T };
}

/** notice.html：取出的函式（D＝通知單資料） */
export function noticeSandbox(names: string[], opt: { now?: number } = {}): Sandbox {
  const ctx = vm.createContext({ console });
  const now = opt.now ?? Date.UTC(2026, 10, 26, 2, 30);
  const pre = `
    ${fixedDate(now)}
    ${STUB_DOM}
    var D,cur=0,tab='stu',linkMsg='';
    function renderAll(){}function save(){}function tellBox(){}
  `;
  const src = [pre, ...names.map(pickNotice)].join("\n;\n");
  vm.runInContext(src, ctx, { filename: "old-notice-sandbox.js" });
  return { ctx, run: <T,>(code: string) => vm.runInContext(code, ctx) as T };
}

/** notice.html 的 <style> 內容（一行一行） */
export function noticeStyleLines(): string[] {
  const a = NOTICE_HTML.indexOf("<style>"),
    b = NOTICE_HTML.indexOf("</style>");
  return NOTICE_HTML.slice(a + 7, b).split("\n");
}
/** exam.html 的 <style> 內容（一行一行） */
export function examStyleLines(): string[] {
  const a = EXAM_HTML.indexOf("<style>"),
    b = EXAM_HTML.indexOf("</style>");
  return EXAM_HTML.slice(a + 7, b).split("\n");
}

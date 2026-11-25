/* 舊版 app.js 的排課程式放進 node 的 vm 裡跑（測試新版和舊版一樣用）。
   app.js 是整頁的程式（一載入就碰 DOM），所以不整份載入：只取出要比對的函式原文（頂層的 function／const，
   到下一個頂層敘述為止），和 core.js 原文放在同一個沙盒，畫面的東西（$、toast、render…）給最少的替身。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const APP = readFileSync(resolve(__dirname, "../../app.js"), "utf8").split("\n");
const CORE_SRC = readFileSync(resolve(__dirname, "../../core.js"), "utf8").replace(/\nif\(typeof module!=='undefined'\)module\.exports=CORE;?\s*$/, "\n");

/** 取出頂層的 `function name(` 或 `const name=` 那一段原文 */
export function pick(name: string): string {
  const re = new RegExp("^(async )?function " + name + "\\(|^const " + name + "=|^let " + name + "=|^var " + name + "=");
  const i = APP.findIndex((l) => re.test(l));
  if (i < 0) throw new Error("app.js 裡找不到 " + name);
  const out = [APP[i]];
  for (let j = i + 1; j < APP.length; j++) {
    const l = APP[j];
    if (l === "" || /^\s/.test(l)) out.push(l);
    else if (/^\}/.test(l)) {
      out.push(l);
      break;
    } else break;
  }
  return out.join("\n");
}
/** 取出兩行標記之間的原文（含開頭那一行，不含結尾那一行） */
export function block(from: string, to: string): string {
  const i = APP.findIndex((l) => l.includes(from)),
    j = APP.findIndex((l, k) => k > i && l.includes(to));
  if (i < 0 || j < 0) throw new Error("app.js 裡找不到 " + from + " … " + to);
  return APP.slice(i, j).join("\n");
}

export interface OldSandbox {
  ctx: vm.Context;
  run<T = unknown>(code: string): T;
}

/** 沙盒：core.js 全部的函式都是全域（和瀏覽器一樣），加上 app.js 取出的原文與替身 */
export function oldSandbox(parts: string[], opt: { now?: number; extra?: Record<string, unknown> } = {}): OldSandbox {
  const els: Record<string, { innerHTML: string; style: Record<string, string>; value: string; checked: boolean }> = {};
  const $ = (id: string) => (els[id] = els[id] || { innerHTML: "", style: {}, value: "", checked: false });
  const ctx = vm.createContext({ console, $, els, structuredClone, ...opt.extra });
  const now = opt.now ?? Date.UTC(2026, 10, 26, 2, 30);
  const pre = `
    const __RealDate=Date;
    Date=class extends __RealDate{constructor(...a){super(...(a.length?a:[${now}]))}static now(){return ${now}}};
    var D,M,ST,ROOM,undoStack=[],page='sched',sub='board',offSel='*',view='',outMode='teacher',selL=-1,draftST=null;
    const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const jsArg=v=>esc(JSON.stringify(v==null?'':v));
    const tip=()=>'';const emptyBox=(t,btn)=>'<div class="empty"><span>'+t+'</span>'+(btn||'')+'</div>';
    const toasts=[];function toast(m){toasts.push(m);}
    function isRO(){return false;}function save(){}function render(){}function snapshot(){}function go(){}function closeDlg(){}function openDlg(){}
    function confirm(){return true;}
    function setTimeout(f){f();}
  `;
  const src = [CORE_SRC, pre, ...parts].join("\n;\n");
  vm.runInContext(src, ctx, { filename: "old-app-sandbox.js" });
  return { ctx, run: <T,>(code: string) => vm.runInContext(code, ctx) as T };
}

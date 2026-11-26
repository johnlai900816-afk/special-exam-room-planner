/* eslint-disable @typescript-eslint/no-explicit-any */
/* 匯入考評服務名單（PDF／Word，舊版 exam.html importList…applyImport），逐行照搬：
   檔案只在這台電腦的瀏覽器裡讀取，不上傳。Word：解開 .docx 讀表格；PDF：pdf.js 4.10.38（帶 SRI，和舊版同一組）讀文字與表格線。
   表格列 → 學生與服務（rowsToStudents、parseSvc）由 test/exam-import.test.ts 和舊版逐項比對。 */
import type { ExamD, ExStudent, Sv } from "./examCore";

export interface ImpRow {
  cls: string;
  seat: string;
  name: string;
  pre: string;
  svcT: string;
  scopeT: string;
  sv: Sv;
  why: string[];
  memo: string;
  old?: ExStudent | null;
}
const subjectsOf = (D: ExamD) => [...new Set(D.sessions.map((s) => s.subject))];
// --- 表格列 → 學生與服務
export function subjAliases(D: ExamD): [string, string][] {
  const S0 = subjectsOf(D),
    a: [string, string][] = [];
  S0.forEach((S) => {
    a.push([S, S]);
    if (S.includes("/")) S.split("/").forEach((x) => a.push([x.trim(), S]));
    if (/生物|理化|地科/.test(S)) a.push(["自然", S]);
  });
  (
    [
      ["國語", "國文"],
      ["英語", "英文"],
      ["寫作", "作文"],
    ] as [string, string][]
  ).forEach(([al, S]) => {
    if (S0.includes(S)) a.push([al, S]);
  });
  return a.filter((x) => x[0]);
}
export function rowsToStudents(D: ExamD, rows: string[][]): ImpRow[] {
  const AL = subjAliases(D),
    out: ImpRow[] = [];
  let map: Record<string, number> | null = null;
  for (const r of rows) {
    if (r.length < 3) continue;
    if (r.some((c) => /班級|座號/.test(c)) && r.some((c) => /學生|姓名/.test(c))) {
      const fi = (re: RegExp) => r.findIndex((c) => re.test(c));
      map = { cls: fi(/班級/), seat: fi(/座號/), name: fi(/學生|姓名/), svc: fi(/服務|調整項目|考場/), scope: fi(/科目|備[註住注]/) };
      if (map.cls < 0) map.cls = map.seat;
      continue;
    }
    const m = map || { cls: 0, seat: 0, name: 1, svc: 2, scope: 3 },
      g = (k: string) => (m[k] >= 0 ? r[m[k]] || "" : "");
    const idT = g("cls") + (m.seat >= 0 && m.seat !== m.cls ? "-" + g("seat") : ""),
      dg = idT.replace(/\D/g, ""),
      name = g("name").replace(/\s+/g, "");
    if (!dg && !name) {
      if (out.length && (g("svc") || g("scope"))) {
        const p = out[out.length - 1];
        p.svcT += g("svc");
        p.scopeT += g("scope");
      }
      continue;
    } // 跨頁被切開的列，接回上一位
    if (dg.length < 3 || !name || name.length > 8) continue;
    out.push({ cls: dg.slice(0, 3), seat: dg.length >= 4 ? dg.slice(3, 5).padStart(2, "0") : "", name, pre: idT.replace(/[\d\s\-－–—]/g, ""), svcT: g("svc"), scopeT: g("scope"), sv: {}, why: [], memo: "" });
  }
  out.forEach((s) => {
    const r = parseSvc(D, s.svcT, s.scopeT, AL);
    s.sv = r.sv;
    s.why = r.why;
    s.memo = [s.pre].concat(r.memo).filter(Boolean).join("；");
  });
  return out;
}
export function parseSvc(D: ExamD, svcT: string, scopeT: string, AL: [string, string][]): { sv: Sv; memo: string[]; why: string[] } {
  const N = (s: unknown) =>
    String(s || "")
      .replace(/\s+/g, "")
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .replace(/[，,；;。]/g, "、")
      .replace(/：/g, ":");
  const order = subjectsOf(D),
    find = (t: string) => order.filter((S) => AL.some((x) => x[1] === S && t.includes(x[0])));
  const KW: Record<string, string> = {
    small: "特殊考場(?:\\(人數(?:調整)?\\))?|人數調整|獨立考場",
    pc: "(?:作文)?電腦(?:作答|打字)?|打字",
    oral: "(?:口頭|口述)(?:回答|作答)?",
    read: "(?:誦讀|報讀|讀題)(?:題目)?",
    ext: "延長(?:時間)?",
  };
  const SN: Record<string, string> = { ext: "延長", read: "誦讀", oral: "口頭", pc: "電腦", small: "人數調整" };
  let a = N(svcT),
    b = N(scopeT);
  const memo: string[] = [],
    why: string[] = [],
    kinds: Record<string, number> = {},
    inline: Record<string, string[]> = {},
    skip: Record<string, number> = {},
    prefix: Record<string, string[]> = {},
    expl: Record<string, string[]> = {},
    neg: string[] = [],
    exNeg: string[] = [];
  // 「除作文外」「作文以外」「作文除外」＝全科扣掉這幾科
  const EXRE = /除了?([^、:()]+?)(?:以|之)?外|([^、:()除]+?)(?:以外|之外|除外)/g;
  const exOf = (t: string) => {
    const o: string[] = [];
    String(t).replace(EXRE, (m, x, y) => {
      o.push(...find(x || y || ""));
      return m;
    });
    return o;
  };
  // 服務欄
  for (const k in KW) {
    a = a.replace(new RegExp("(" + KW[k] + ")(?:\\(([^)]*)\\))?", "g"), (m, w, p) => {
      kinds[k] = 1;
      if (k === "pc" && w.startsWith("作文") && order.includes("作文")) prefix.pc = ["作文"];
      const px = p ? exOf(p) : [];
      if (px.length) {
        inline[k] = order.filter((S) => !px.includes(S));
        why.push(SN[k] + "寫「" + p + "」：讀成全科但不含 " + px.join("、") + "，請確認");
      } else if (p) {
        const ps = find(p);
        if (ps.length) inline[k] = ps;
        else if (/訓練|觀察|暫|考慮|未定|評估|待/.test(p)) {
          skip[k] = 1;
          memo.push(SN[k] + "（" + p + "）");
          why.push(SN[k] + "註明「" + p + "」，先不排入");
        } else memo.push(p);
      }
      return "、";
    });
  }
  a.split(/[、()\/]+/)
    .filter(Boolean)
    .forEach((x) => {
      memo.push(x);
      why.push("「" + x + "」不是系統裡的服務，已放進備註");
    });
  // 科目、備註欄
  b = b.replace(/[^、():]*?不用(?:口頭|誦讀|延長|電腦)?/g, (m) => {
    neg.push(...find(m));
    memo.push(m);
    return "";
  });
  b = b.replace(EXRE, (m, x, y) => {
    const sj = find(x || y || "");
    if (!sj.length) return m;
    exNeg.push(...sj);
    why.push("「" + m + "」：讀成全科但不含 " + sj.join("、") + "，請確認");
    return "、全、";
  });
  b = b
    .replace(/\(([^)]*)\)/g, (m, c) => {
      if (/觀察|問|要不要|不確定|待|再說|可能|看看/.test(c)) {
        memo.push(c);
        why.push("註明「" + c + "」");
        return "";
      }
      return "、" + c + "、";
    })
    .replace(/[()]/g, "、");
  const esc2 = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"),
    SA = AL.map((x) => esc2(x[0]))
      .sort((x, y) => y.length - x.length)
      .join("|");
  if (SA) {
    const LIST = "((?:(?:" + SA + ")[、:]*)+)";
    for (const k in KW) {
      const m = b.match(new RegExp("(?:" + KW[k] + ")[:、]*" + LIST)) || b.match(new RegExp(LIST + "(?:" + KW[k] + ")"));
      if (m) {
        expl[k] = find(m[1]);
        kinds[k] = 1;
        b = b.replace(m[0], "、");
      }
    }
  }
  const hasAll = /全/.test(b),
    S = find(b);
  let rest = b.replace(/全科|全|科目/g, "");
  AL.map((x) => x[0])
    .sort((x, y) => y.length - x.length)
    .forEach((x) => {
      rest = rest.split(x).join("");
    });
  rest
    .split(/[、:]+/)
    .filter(Boolean)
    .forEach((x) => memo.push(x));
  // 決定每種服務的科目
  const lim = (k: string) => k === "pc" || k === "oral",
    ks = ["ext", "read", "oral", "pc", "small"].filter((k) => kinds[k] && !skip[k]),
    sv: Record<string, any> = {};
  if (S.length && hasAll && !Object.keys(kinds).some(lim) && ks.length) why.push("科目同時寫了「全」和個別科目，先當成全科");
  ks.forEach((k) => {
    let sc: any;
    if (inline[k]) sc = inline[k];
    else if (expl[k]) sc = expl[k];
    else if (S.length && !hasAll) sc = S;
    else if (S.length && hasAll) sc = lim(k) ? S : "*";
    else if (hasAll) sc = "*";
    else if (prefix[k]) sc = prefix[k];
    else {
      sc = "*";
      why.push(SN[k] + "沒寫科目，先當成全科");
    }
    if (sc === "*" && exNeg.length && !inline[k]) sc = order.slice(); // 全科扣掉「除…外」的科目
    if (Array.isArray(sc)) {
      sc = sc.filter((x: string) => !neg.includes(x) && (inline[k] || !exNeg.includes(x)));
      if (!sc.length) return;
    }
    sv[k] = sc;
  });
  if (!Object.keys(sv).length) why.push("沒有讀出可以排入的服務");
  const u = (x: string[]) => [...new Set(x)];
  return { sv, memo: u(memo), why: u(why) };
}
// 對到名單上的哪一位：先比「班級＋姓名」，姓名對不上時才看座號。同班同座號但姓名不同不能合併
const sameNm = (a: string, b: string) => !!(a && b && (a === b || a.endsWith(b) || b.endsWith(a)));
function impFind(D: ExamD, s: ImpRow, used: Set<ExStudent>): { o: ExStudent | null; clash?: ExStudent | null } {
  const pool = D.students.filter((x) => !used.has(x) && String(x.cls) === s.cls);
  const byName = pool.find((x) => sameNm(s.name, x.name) && (!s.seat || !x.seat || +x.seat === +s.seat)) || pool.find((x) => sameNm(s.name, x.name));
  if (byName) return { o: byName };
  const bySeat = s.seat ? pool.find((x) => x.seat && +x.seat === +s.seat) : undefined;
  if (bySeat && !bySeat.name) return { o: bySeat };
  return { o: null, clash: bySeat || null };
}
/** 對到現有的學生（舊版 showImport 的前半）；回傳新增、更新、要確認、名單上其他幾位 */
export function matchImport(D: ExamD, list: ImpRow[]) {
  const used = new Set<ExStudent>();
  list.forEach((s) => {
    const f = impFind(D, s, used);
    s.old = f.o;
    if (s.old) used.add(s.old);
    if (f.clash && !s.why.some((w) => /同座號/.test(w)))
      s.why.push("名單上 " + f.clash.cls + "-" + f.clash.seat + " 是「" + f.clash.name + "」，和檔案上的「" + s.name + "」同座號不同名，會新增一位，請確認是不是同一人");
  });
  const nNew = list.filter((s) => !s.old).length;
  return { nNew, nUpd: list.length - nNew, nWhy: list.filter((s) => s.why.length).length, nOut: D.students.filter((x) => !used.has(x)).length };
}
/** 匯入（舊版 applyImport）；list 是 matchImport 過的（s.old 指向 D 裡的學生，用 id 找） */
export function applyImport(D: ExamD, list: ImpRow[], replace: boolean, now = Date.now()): void {
  const keep = new Set<ExStudent>(),
    front: ExStudent[] = [];
  list.forEach((s, i) => {
    let o = s.old ? D.students.find((x) => x.id === s.old!.id) || null : null;
    if (o) {
      o.cls = s.cls;
      if (s.seat) o.seat = s.seat;
      o.name = s.name;
      o.sv = s.sv;
      if (s.memo) o.memo = s.memo;
    } else {
      o = { id: "n" + now.toString(36) + i, cls: s.cls, seat: s.seat, name: s.name, sv: s.sv, memo: s.memo, on: true };
    }
    if (s.why.length) o.chk = s.why.join("；");
    else delete o.chk;
    keep.add(o);
    front.push(o);
  });
  D.students = front.concat(replace ? [] : D.students.filter((x) => !keep.has(x)));
}

/* ---------- 讀檔 ---------- */
// --- Word：解開 .docx（zip）讀 word/document.xml 的表格
async function unzipOne(buf: ArrayBuffer, name: string): Promise<string> {
  const dv = new DataView(buf),
    u8 = new Uint8Array(buf),
    td = new TextDecoder();
  let i = buf.byteLength - 22;
  while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
  if (i < 0) throw new Error("這不是有效的 Word 檔（.docx）。");
  let p = dv.getUint32(i + 16, true);
  const n = dv.getUint16(i + 10, true);
  for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true),
      csz = dv.getUint32(p + 20, true),
      fl = dv.getUint16(p + 28, true),
      el = dv.getUint16(p + 30, true),
      cl = dv.getUint16(p + 32, true),
      off = dv.getUint32(p + 42, true);
    if (td.decode(u8.subarray(p + 46, p + 46 + fl)) === name) {
      const st = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true),
        data = u8.subarray(st, st + csz);
      if (method === 0) return td.decode(data);
      return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    }
    p += 46 + fl + el + cl;
  }
  throw new Error("這不是有效的 Word 檔（.docx）。");
}
export async function docxRows(buf: ArrayBuffer): Promise<string[][]> {
  const doc = new DOMParser().parseFromString(await unzipOne(buf, "word/document.xml"), "application/xml"),
    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    rows: string[][] = [];
  for (const tr of Array.from(doc.getElementsByTagNameNS(W, "tr"))) {
    const cells: string[] = [];
    for (const tc of Array.from(tr.children)) {
      if (tc.localName !== "tc") continue;
      let t = "";
      for (const p of Array.from(tc.getElementsByTagNameNS(W, "p"))) {
        for (const x of Array.from(p.getElementsByTagName("*"))) {
          if (x.localName === "t") t += x.textContent;
          else if (x.localName === "br" || x.localName === "tab") t += " ";
        }
        t += "\n";
      }
      cells.push(t.trim());
    }
    rows.push(cells);
  }
  return rows;
}
// --- PDF：用 pdf.js 讀文字與表格線，把文字放回格子裡（pdf.js 4.10.38，先用 fetch 帶檢查碼下載、核對無誤才載入）
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/";
const PDFJS_SRI: Record<string, string> = {
  "legacy/build/pdf.min.mjs": "sha384-z/XbAtvhBXJoK+yvYimnFuTCF6/2wTCDSIFD09/HtIfwFtvDKOMdAe5Z3wOChkmW",
  "legacy/build/pdf.worker.min.mjs": "sha384-vbNBYP03jHFPlgtK4qSXtazEmGfmpTWlSsfq9OiU20MroW/Q9TbaEXiM7PpeWg+6",
};
async function sriBlob(f: string) {
  const r = await fetch(PDFJS + f, { integrity: PDFJS_SRI[f], credentials: "omit" });
  if (!r.ok) throw new Error("pdf.js " + r.status);
  return URL.createObjectURL(new Blob([await r.text()], { type: "text/javascript" }));
}
let pdfjsLib: any = null;
export async function pdfLib() {
  if (pdfjsLib) return pdfjsLib;
  try {
    const [lib, wk] = await Promise.all([sriBlob("legacy/build/pdf.min.mjs"), sriBlob("legacy/build/pdf.worker.min.mjs")]);
    const m = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ lib);
    m.GlobalWorkerOptions.workerPort = new Worker(wk, { type: "module" });
    pdfjsLib = m;
  } catch {
    throw new Error("PDF 讀取元件載入失敗，請確認網路連線後再試一次。");
  }
  return pdfjsLib;
}
export async function pdfRows(buf: ArrayBuffer): Promise<string[][]> {
  const lib = await pdfLib();
  // isEvalSupported:false：不讓 PDF 裡的字型資料被當成程式執行
  const pdf = await lib.getDocument({ data: buf, cMapUrl: PDFJS + "cmaps/", cMapPacked: true, isEvalSupported: false }).promise;
  const O = lib.OPS,
    U = lib.Util,
    rows: string[][] = [];
  let anyLine = false;
  const uniq = (a: number[], tol: number) => {
    a.sort((x, y) => x - y);
    const o: number[] = [];
    a.forEach((v) => {
      if (!o.length || v - o[o.length - 1] > tol) o.push(v);
    });
    return o;
  };
  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const page = await pdf.getPage(pn),
      vp = page.getViewport({ scale: 1 }),
      PW = vp.width,
      PH = vp.height;
    const ol = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0],
      pend: any[] = [];
    const st: number[][] = [],
      H: any[] = [],
      V: any[] = [];
    const PAINT = new Set([O.stroke, O.closeStroke, O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
    const pt = (x: number, y: number) => U.applyTransform(U.applyTransform([x, y], ctm), vp.transform);
    const seg = (x1: number, y1: number, x2: number, y2: number) => {
      const p = pt(x1, y1),
        q = pt(x2, y2);
      if (Math.abs(p[1] - q[1]) < 1.5 && Math.abs(p[0] - q[0]) > 8) pend.push({ y: (p[1] + q[1]) / 2, x1: Math.min(p[0], q[0]), x2: Math.max(p[0], q[0]) });
      else if (Math.abs(p[0] - q[0]) < 1.5 && Math.abs(p[1] - q[1]) > 4) pend.push({ x: (p[0] + q[0]) / 2, y1: Math.min(p[1], q[1]), y2: Math.max(p[1], q[1]) });
    };
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i],
        a = ol.argsArray[i];
      if (fn === O.save) st.push(ctm);
      else if (fn === O.restore) ctm = st.pop() || ctm;
      else if (fn === O.transform) ctm = U.transform(ctm, a);
      else if (PAINT.has(fn)) {
        pend.forEach((s) => (s.y !== undefined ? H : V).push(s));
        pend = [];
      } // 真的畫出來的線才算表格線
      else if (fn === O.endPath) pend = []; // 只是裁切範圍，不算
      else if (fn === O.constructPath) {
        const ops = a[0],
          c = a[1];
        let k = 0,
          cx = 0,
          cy = 0,
          sx = 0,
          sy = 0;
        for (const op of ops) {
          if (op === O.rectangle) {
            const x = c[k],
              y = c[k + 1],
              w = c[k + 2],
              hh = c[k + 3];
            k += 4;
            const p = pt(x, y),
              q = pt(x + w, y + hh),
              rw = Math.abs(p[0] - q[0]),
              rh = Math.abs(p[1] - q[1]);
            if (rw > PW * 0.6 && rh > PH * 0.6) continue; // 整頁底色
            if (rh < 3) seg(x, y + hh / 2, x + w, y + hh / 2);
            else if (rw < 3) seg(x + w / 2, y, x + w / 2, y + hh);
            else {
              seg(x, y, x + w, y);
              seg(x, y + hh, x + w, y + hh);
              seg(x, y, x, y + hh);
              seg(x + w, y, x + w, y + hh);
            }
          } else if (op === O.moveTo) {
            cx = sx = c[k];
            cy = sy = c[k + 1];
            k += 2;
          } else if (op === O.lineTo) {
            seg(cx, cy, c[k], c[k + 1]);
            cx = c[k];
            cy = c[k + 1];
            k += 2;
          } else if (op === O.curveTo) k += 6;
          else if (op === O.curveTo2 || op === O.curveTo3) k += 4;
          else if (op === O.closePath) {
            seg(cx, cy, sx, sy);
            cx = sx;
            cy = sy;
          }
        }
      }
    }
    if (H.length && V.length) anyLine = true;
    const tc = await page.getTextContent(),
      items: { s: string; x: number; y: number; h: number }[] = [];
    tc.items.forEach((it: any) => {
      if (!it.str || !it.str.trim()) return;
      const t = U.transform(vp.transform, it.transform),
        hh = Math.hypot(t[2], t[3]) || it.height || 10;
      items.push({ s: it.str, x: t[4], y: t[5] - hh * 0.35, h: hh });
    });
    const ys = uniq(
      H.map((l) => l.y),
      2,
    );
    for (let j = 0; j < ys.length - 1; j++) {
      const y1 = ys[j],
        y2 = ys[j + 1];
      if (y2 - y1 < 6) continue;
      const ym = (y1 + y2) / 2;
      const xs = uniq(
        V.filter((l) => l.y1 - 2 <= ym && ym <= l.y2 + 2).map((l) => l.x),
        2,
      );
      if (xs.length < 4) continue;
      const cells: string[] = [];
      for (let c = 0; c < xs.length - 1; c++) {
        const its = items.filter((it) => it.y > y1 && it.y < y2 && it.x + 1 >= xs[c] && it.x + 1 < xs[c + 1]).sort((a, b) => a.y - b.y);
        const lines: { y: number; a: typeof items }[] = [];
        its.forEach((it) => {
          const L = lines[lines.length - 1];
          if (L && it.y - L.y < it.h * 0.6) L.a.push(it);
          else lines.push({ y: it.y, a: [it] });
        });
        cells.push(
          lines
            .map((L) =>
              L.a
                .sort((a, b) => a.x - b.x)
                .map((i) => i.s)
                .join(""),
            )
            .join("\n")
            .trim(),
        );
      }
      rows.push(cells);
    }
  }
  if (!anyLine) throw new Error("這份 PDF 讀不到表格線（可能是掃描的圖片）。請改用 Word 檔，或用「貼上名單」。");
  return rows;
}
/** 讀一個檔 → 學生與服務 */
export async function readList(D: ExamD, f: File): Promise<ImpRow[]> {
  const buf = await f.arrayBuffer(),
    nm = f.name.toLowerCase();
  let rows: string[][];
  if (nm.endsWith(".docx")) rows = await docxRows(buf);
  else if (nm.endsWith(".pdf")) rows = await pdfRows(buf);
  else throw new Error("只能讀 PDF 或 Word（.docx）檔。" + (nm.endsWith(".doc") ? "舊版 .doc 請先用 Word 另存成 .docx 或 PDF。" : ""));
  const list = rowsToStudents(D, rows);
  if (!list.length) throw new Error("找不到學生名單的表格。\n需要「班級座號、學生、服務、科目」這幾欄；掃描的 PDF 請改用 Word 檔。");
  return list;
}

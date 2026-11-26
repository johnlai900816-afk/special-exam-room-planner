/* eslint-disable @typescript-eslint/no-explicit-any */
/* 全校課表的讀檔（只在瀏覽器裡跑，檔案不上傳；只有用 AI 時每一頁的圖會送到 Gemini）：
   - 用 AI：PDF 每頁轉成圖（寬約 1600px 的 JPEG），圖片檔直接縮放（tt.js toJpeg／pagesOf）
   - 離線辨識（app.js readTT）：文字 PDF 直接讀文字；掃描檔用 Tesseract 5.1.1（和舊版同一組 CDN＋SRI）讀左下角編號與下方統計
   pdf.js 用段考匯入同一個載入器（4.10.38＋SRI，lib/nx/examImport.ts）。 */
import { pdfLib } from "./examImport";
import { C, isTextPage, textPage, type OcrPage, type TtPage } from "./tt";

const PDFJS_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/";
const PDF_OPT = { cMapUrl: PDFJS_SRC + "cmaps/", cMapPacked: true, standardFontDataUrl: PDFJS_SRC + "standard_fonts/", isEvalSupported: false, enableXfa: false };
const TESS_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  TESS_SRI = "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F";

const isPdf = (f: File) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);

async function openPdf(f: File): Promise<any> {
  const lib = await pdfLib();
  return lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), ...PDF_OPT }).promise;
}

function toJpeg(src: CanvasImageSource, w0: number, h0: number): string {
  const k = Math.min(1, 1600 / w0) || 1,
    c = document.createElement("canvas");
  c.width = Math.round(w0 * k);
  c.height = Math.round(h0 * k);
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, 0, 0, c.width, c.height);
  const u = c.toDataURL("image/jpeg", 0.85);
  c.width = c.height = 0;
  return u;
}

/** 用 AI：每一頁一張圖 */
export async function pagesOf(files: File[]): Promise<TtPage[]> {
  const out: { img: string; src: string }[] = [];
  for (const f of files) {
    if (/^image\//.test(f.type)) {
      const b = await createImageBitmap(f);
      out.push({ img: toJpeg(b, b.width, b.height), src: f.name });
      b.close?.();
      continue;
    }
    if (!isPdf(f)) continue;
    const pdf = await openPdf(f);
    for (let n = 1; n <= pdf.numPages; n++) {
      const pg = await pdf.getPage(n),
        v1 = pg.getViewport({ scale: 1 }),
        vp = pg.getViewport({ scale: Math.min(4, 1600 / v1.width) });
      const c = document.createElement("canvas");
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const x = c.getContext("2d")!;
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: x, viewport: vp }).promise;
      out.push({ img: c.toDataURL("image/jpeg", 0.85), src: f.name + " 第 " + n + " 頁" });
      c.width = c.height = 0;
    }
    pdf.destroy?.();
  }
  return out.map((p, i) => ({ ...p, n: i + 1, st: "" }));
}

/* ───── 離線辨識 ───── */
interface TessWorker {
  setParameters(o: Record<string, string>): Promise<unknown>;
  recognize(c: HTMLCanvasElement): Promise<{ data: { text: string } }>;
}
let tessP: Promise<{ zh: TessWorker; en: TessWorker }> | null = null;
function loadTess(): Promise<void> {
  const w = window as any;
  if (w.Tesseract) return Promise.resolve();
  return new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = TESS_SRC;
    s.integrity = TESS_SRI;
    s.crossOrigin = "anonymous";
    s.onload = () => ok();
    s.onerror = () => bad(new Error("文字辨識元件下載失敗，請確認網路"));
    document.head.appendChild(s);
  });
}
function workers(): Promise<{ zh: TessWorker; en: TessWorker }> {
  if (!tessP)
    tessP = (async () => {
      await loadTess();
      const T = (window as any).Tesseract;
      const zh: TessWorker = await T.createWorker("chi_tra");
      await zh.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
      const en: TessWorker = await T.createWorker("eng");
      await en.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "7" });
      return { zh, en };
    })().catch((e) => {
      tessP = null;
      throw e;
    });
  return tessP;
}
function crop(c: HTMLCanvasElement, xa: number, xb: number, ya: number, yb: number, th?: number): HTMLCanvasElement {
  const W = c.width,
    H = c.height,
    d = document.createElement("canvas");
  d.width = Math.round((xb - xa) * W);
  d.height = Math.round((yb - ya) * H);
  const x = d.getContext("2d")!;
  x.drawImage(c, xa * W, ya * H, d.width, d.height, 0, 0, d.width, d.height);
  if (th) {
    const im = x.getImageData(0, 0, d.width, d.height),
      a = im.data;
    for (let i = 0; i < a.length; i += 4) {
      const g = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11 < th ? 0 : 255;
      a[i] = a[i + 1] = a[i + 2] = g;
    }
    x.putImageData(im, 0, 0);
  }
  return d;
}
function thumb(c: HTMLCanvasElement): string {
  const w = Math.min(1100, c.width),
    d = document.createElement("canvas");
  d.width = w;
  d.height = Math.round((c.height * w) / c.width);
  d.getContext("2d")!.drawImage(c, 0, 0, d.width, d.height);
  return d.toDataURL("image/jpeg", 0.7);
}

/** 離線辨識每一頁（app.js readTT）。progress(已讀, 總頁數, 訊息) */
export async function ocrPages(files: File[], progress: (done: number, total: number, msg: string) => void, signal?: AbortSignal): Promise<OcrPage[]> {
  const pages: OcrPage[] = [];
  let total = 0,
    done = 0;
  for (const f of files.filter(isPdf)) {
    const pdf = await openPdf(f);
    total += pdf.numPages;
    for (let n = 1; n <= pdf.numPages; n++) {
      if (signal?.aborted) throw Object.assign(new Error("已取消"), { code: "cancel" });
      const pg = await pdf.getPage(n),
        tc = await pg.getTextContent(),
        src = f.name + " 第 " + n + " 頁";
      if (isTextPage(tc.items)) pages.push(textPage(tc.items, src, pages.length));
      else {
        progress(done, total, "第一次會下載文字辨識資料（約 20MB），請稍候…");
        const W = await workers();
        const vp = pg.getViewport({ scale: 6 }),
          c = document.createElement("canvas");
        c.width = vp.width;
        c.height = vp.height;
        await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        const no = (await W.en.recognize(crop(c, 0.17, 0.3, 0.765, 0.788))).data.text;
        const box = crop(c, 0, 1, 0.79, 0.895, 150),
          txt = (await W.zh.recognize(box)).data.text;
        pages.push({ text: txt, cls: C.ttClassNo(no), src, page: pages.length, img: thumb(box) });
        c.width = c.height = 0;
      }
      done++;
      progress(done, total, "已讀 " + done + " 頁");
    }
    pdf.destroy?.();
  }
  return pages;
}

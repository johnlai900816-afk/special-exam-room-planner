/* IEP 的紙本：開會通知（小通知單、安排總表、每人一張彙整）與紙本時段表。
   和舊版 iep.js 畫面段落的 cut／slipC／notices／paper 產生一模一樣的 HTML（test/iep-print.test.ts 會拿舊版的輸出比對），
   樣式用 repo 根目錄的 iep.css（app/layout.tsx 匯入同一份），所以印出來和舊版一樣。
   QR 小單（slipQR：全寬、一張 A4 裁 3／4／6 份）也在這裡，components/iep/QrSlips.tsx 負責畫 QR。 */
import { IEP, type PersonSheet, type Round, type SlipItem } from "../iep";
import type { RcData } from "../types";

/** 和舊版 app.js 的 esc 一樣 */
export const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const E = esc;

export type Per = 3 | 4 | 6;
/** 舊版 perGet：只認 3、4、6，其他一律 4 */
export const perOf = (v: unknown): Per => ([3, 4, 6].includes(+(v as number)) ? (+(v as number) as Per) : 4);

export interface PrintOpt {
  /** 一張 A4 裁 3、4 或 6 份 */
  per: Per;
  /** full＝班級座號＋姓名、cls＝只印班級座號、mask＝姓名遮字 */
  priv: "full" | "cls" | "mask";
  /** 家長、專業人員也印 */
  all: boolean;
  /** cut＝小通知單、sum＝安排總表、each＝每人一張彙整 */
  nm: "cut" | "sum" | "each";
  /** 承辦（舊版 host(R)：老師開的是老師姓名） */
  host: string;
}

/** 一張 A4 裁成 n 份 */
export function cut<T>(items: T[], per: Per, fn: (x: T) => string): string {
  const n = perOf(per);
  let h = "";
  for (let i = 0; i < items.length; i += n) h += '<div class="pg iepcut n' + n + '">' + items.slice(i, i + n).map(fn).join("") + "</div>";
  return h;
}

/** 開會通知小單（一場會議、一位出席者一張） */
export function slipC(D: RcData, x: SlipItem): string {
  const t = x.time;
  const ttl = E(D.title || "");
  return (
    '<div class="slip"><div class="hd"><b>' + E(x.kind) + "開會通知</b><span>" + ttl + '</span></div><div class="to">' + E(x.to) + " 您好：</div>" +
    "<p>學生 <b>" + E(x.stu) + "</b> 的" + E(x.kind) + '訂於：</p><p class="big"><b>' + E(IEP.fmtDate(t.date)) + "　" + E(t.custom ? "" : t.name) + (t.time ? "（" + E(t.time) + "）" : "") + "</b></p>" +
    "<p>地點：<b>" + (x.room ? E(x.room) : '<span class="ln"></span>') + "</b>　　個管老師：" + E(x.cm) + "</p><p>敬請" + (x.req ? "出席" : "撥冗參加") + "。" + (x.host ? "　" + E(x.host) + " 敬啟" : "") + "</p>" +
    '<div class="rt">回條：□可以出席　□無法出席，原因：<span class="ln"></span><br>簽名：<span class="ln"></span>' + (x.due ? "　請於 " + E(IEP.fmtDate(x.due)) + " 前交回個管老師" : "") + '</div><span class="cut">✂</span></div>'
  );
}

/** 開會通知（#outArea 裡的內容） */
export function noticesHtml(D: RcData, R: Round, o: PrintOpt): string {
  const ttl = E(D.title || "");
  if (o.nm === "cut") return cut(IEP.slipItems(D, R, { all: o.all, privacy: o.priv }), o.per, (x) => slipC(D, x));
  if (o.nm === "sum") {
    const ms = R.meets.filter((m) => m.at).sort((a, b) => a.at!.localeCompare(b.at!));
    return (
      '<div class="pg iepA4"><h2>' + ttl + "　" + E(R.kind || "IEP 會議") + "安排表</h2><table><tr><th>日期</th><th>時間</th><th>地點</th><th>學生</th><th>個管</th><th>出席人員</th></tr>" +
      ms
        .map((m) => {
          const f = IEP.slotInfo(D, m.at!);
          const s = IEP.stuOf(D, m.s);
          return (
            "<tr><td>" + E(IEP.fmtDate(f.date)) + "</td><td>" + E((f.custom ? "" : f.name + " ") + f.time) + "</td><td>" + E(m.room || "") + "</td><td>" + E(IEP.stuLabel(s)) + "</td><td>" +
            E(s && s.caseMgr ? IEP.pName(D, R, "t:" + s.caseMgr) : "") + "</td>" +
            '<td class="l">' + m.p.map((x) => E(IEP.pName(D, R, x[0])) + (x[2] ? "" : "（邀）")).join("、") + "</td></tr>"
          );
        })
        .join("") +
      "</table></div>"
    );
  }
  return IEP.notices(D, R, { all: o.all })
    .map(
      (p: PersonSheet) =>
        '<div class="pg iepA4"><h2>' + ttl + "　" + E(R.kind || "IEP 會議") + "開會通知</h2><p>" + E(IEP.salute(p.name, p.meets.map((x) => x.role).join("、"), p.teacher)) + " 您好：</p><p>下列會議時間已經排定，敬請準時出席。</p>" +
        "<table><tr><th>日期</th><th>時間</th><th>地點</th><th>學生</th><th>個管老師</th><th>您的身分</th></tr>" +
        p.meets
          .map((x) => {
            const f = IEP.slotInfo(D, x.m.at!);
            return (
              "<tr><td>" + E(IEP.fmtDate(f.date)) + "</td><td>" + E((f.custom ? "" : f.name + " ") + f.time) + "</td><td>" + E(x.m.room || "") + "</td><td>" + E(IEP.stuShow(x.s, o.priv)) + "</td><td>" + E(x.cm) +
              "</td><td>" + E(x.role) + (x.req ? "" : "（邀請）") + "</td></tr>"
            );
          })
          .join("") +
        "</table>" + '<p class="sg">' + E(o.host || "特教組") + " 敬啟</p></div>",
    )
    .join("");
}

/** 紙本時段表（A4，一人一張）：沒有用線上連結時印給老師勾。不寫任何人哪一節有課（承辦有課的節次建立時就拿掉了） */
export function paperHtml(D: RcData, R: Round, p: PersonSheet, o: Pick<PrintOpt, "priv" | "host">): string {
  const G = IEP.grid(D, p.keys);
  const ttl = E(D.title || "");
  return (
    '<div class="pg iepA4"><h2>' + ttl + "　" + E(R.kind || "IEP 會議") + "時間調查表</h2><p>" + E(IEP.salute(p.name, p.meets.map((x) => x.role).join("、"), p.teacher)) + " 您好：</p>" +
    "<p>下列學生的會議需要您參與。請在您可以的時段打「○」、不行的打「╳」，" + (R.due ? "於 " + E(IEP.fmtDate(R.due)) + " 前" : "") + "交回" + E(o.host || "個管老師") + "。</p>" +
    "<table><tr><th>班級座號</th><th>學生</th><th>個管老師</th><th>您的身分</th><th>出席</th></tr>" +
    p.meets
      .map(
        (x) =>
          "<tr><td>" + E(IEP.stuShow(x.s, "cls")) + "</td><td>" + E(o.priv === "full" ? (x.s ? x.s.name : "") : IEP.stuShow(x.s, o.priv).split(" ")[1] || "") + "</td><td>" + E(x.cm) + "</td><td>" + E(x.role) + "</td><td>" +
          (x.req ? "必要" : "邀請") + "</td></tr>",
      )
      .join("") +
    "</table>" +
    "<table><tr><th>日期</th>" + G.cols.map((c) => "<th>" + E(c.name) + '<span class="bz">' + E(c.time) + "</span></th>").join("") + "</tr>" +
    G.dates
      .map((d) => "<tr><th>" + E(d.label) + "</th>" + G.cols.map((c) => (G.cell(d.date, c.p) ? "<td></td>" : '<td class="x"></td>')).join("") + "</tr>")
      .join("") +
    "</table>" +
    '<p>備註：<span class="ln" style="min-width:30em"></span></p><p class="sg">填表人：<span class="ln"></span></p></div>'
  );
}

/** 印出來的網址：去掉 https://，中文路徑解碼（比較短、看得懂） */
export function urlShow(u: string): string {
  let x = String(u || "").replace(/^https?:\/\//, "");
  try {
    x = decodeURI(x);
  } catch {
    /* 解不開就印原樣 */
  }
  return x;
}

/** QR 小單一份：左邊大 QR，右邊稱呼、期限，下面學生、範圍、承辦、網址（舊版 slipQR） */
export function qrSlipHtml(D: RcData, R: Round, o: PersonSheet, url: string, opt: Pick<PrintOpt, "per" | "priv" | "host">): string {
  const max = opt.per === 6 ? 3 : opt.per === 4 ? 4 : 6;
  const ms = o.meets.slice(0, max);
  return (
    '<div class="slip qs"><div class="iepqr" data-t="' + E(url) + '"></div><div class="qa"><div class="hd"><b>' + E(R.kind || "IEP 會議") + "時間調查</b><span>" + E(D.title || "") + "</span></div>" +
    '<div class="to">' + E(IEP.salute(o.name, o.meets.map((x) => x.role).join("、"), o.teacher)) + " 您好：</div>" +
    '<p>手機掃描 QR Code，點選您<b>有空</b>的節次後送出。</p><p class="due">請於 <b>' + E(IEP.fmtDate(R.due)) + "</b> 前填寫</p></div>" +
    '<div class="qb"><p>學生：' + ms.map((x) => E(IEP.stuShow(x.s, opt.priv))).join("、") + (o.meets.length > max ? " 等 " + o.meets.length + " 位" : "") + "</p>" +
    "<p>範圍：" + E(IEP.fmtDate(R.d1 || "")) + "～" + E(IEP.fmtDate(R.d2 || "")) + "</p>" + (opt.host ? "<p>承辦：" + E(opt.host) + "</p>" : "") +
    '<p class="url">' + E(urlShow(url)) + '</p></div><span class="cut" aria-hidden="true">✂</span></div>'
  );
}

/** QR 小單（#outArea 的內容）：有連結的人才印 */
export function qrSlipsHtml(D: RcData, R: Round, people: PersonSheet[], urlOf: (pk: string) => string, opt: Pick<PrintOpt, "per" | "priv" | "host">): string {
  const pk = people.filter((o) => urlOf(o.k));
  return pk.length ? cut(pk, opt.per, (o) => qrSlipHtml(D, R, o, urlOf(o.k), opt)) : "";
}

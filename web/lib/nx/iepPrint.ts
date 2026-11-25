/* IEP 的紙本：開會通知（小通知單、安排總表、每人一張彙整）與紙本時段表。
   和舊版 iep.js 畫面段落的 cut／slipC／notices／paper 產生一模一樣的 HTML（test/iep-print.test.ts 會拿舊版的輸出比對），
   樣式用 repo 根目錄的 iep.css（app/layout.tsx 匯入同一份），所以印出來和舊版一樣。
   QR 小單（slipQR）不在這裡：舊版正在改版面，新版放在 components/iep/QrSlips.tsx，之後跟著新設計改。 */
import { IEP, type Busy, type PersonSheet, type Round, type SlipItem } from "../iep";
import type { RcData } from "../types";

/** 和舊版 app.js 的 esc 一樣 */
export const esc = (s: unknown): string =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const E = esc;

export interface PrintOpt {
  /** 一張 A4 裁 3 或 4 張 */
  per: 3 | 4;
  /** full＝班級座號＋姓名、cls＝只印班級座號、mask＝姓名遮字 */
  priv: "full" | "cls" | "mask";
  /** 家長、專業人員也印 */
  all: boolean;
  /** cut＝小通知單、sum＝安排總表、each＝每人一張彙整 */
  nm: "cut" | "sum" | "each";
  /** 承辦（舊版 host(R)：老師開的是老師姓名） */
  host: string;
}

/** 一張 A4 裁成 n 張 */
export function cut<T>(items: T[], per: 3 | 4, fn: (x: T) => string): string {
  const n = per === 3 ? 3 : 4;
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

/** 紙本時段表（A4，一人一張）：沒有用線上連結時印給老師勾 */
export function paperHtml(D: RcData, R: Round, p: PersonSheet, busy: Busy, o: Pick<PrintOpt, "priv" | "host">): string {
  const G = IEP.grid(D, p.keys);
  const b = busy[p.k] || {};
  const bz = (w: string) => (/上課/.test(w) ? "有課" : /IEP/.test(w) ? "已有會議" : "已登記有事");
  const ttl = E(D.title || "");
  return (
    '<div class="pg iepA4"><h2>' + ttl + "　" + E(R.kind || "IEP 會議") + "時間調查表</h2><p>" + E(IEP.salute(p.name, p.meets.map((x) => x.role).join("、"), p.teacher)) + " 您好：</p>" +
    "<p>下列學生的會議需要您參與。請在您可以的時段打「○」、不行的打「╳」，" + (R.due ? "於 " + E(IEP.fmtDate(R.due)) + " 前" : "") + "交回" + E(o.host || "個管老師") + "。標「有課」的節次如果可以調課，仍請打○。</p>" +
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
      .map(
        (d) =>
          "<tr><th>" + E(d.label) + "</th>" +
          G.cols
            .map((c) => {
              const k = G.cell(d.date, c.p);
              return k ? "<td>" + (b[k] ? '<span class="bz">' + bz(b[k]) + "</span>" : "") + "</td>" : '<td class="x"></td>';
            })
            .join("") +
          "</tr>",
      )
      .join("") +
    "</table>" +
    '<p>備註：<span class="ln" style="min-width:30em"></span></p><p class="sg">填表人：<span class="ln"></span></p></div>'
  );
}

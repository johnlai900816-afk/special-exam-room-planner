"use client";
/* IEP 調查的 QR 小單（可列印）。舊版 iep.js 的 slipQR 正在改版面（左右邊界太寬），這個元件刻意獨立出來：
   之後照新設計改這一個檔就好，資料（誰、哪些學生、網址）由呼叫的頁面給。
   QR 用和舊版相同的 qrcodejs 1.0.0（cdnjs，SRI 檢查）。 */
import { useEffect, useRef } from "react";
import { IEP, type PersonSheet, type Round } from "@/lib/iep";
import { esc as E } from "@/lib/nx/iepPrint";
import type { RcData } from "@/lib/types";

const QR_SRC = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
const QR_SRI = "sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU";

type QRCtor = new (el: HTMLElement, o: { text: string; width: number; height: number; correctLevel: number }) => unknown;
declare global {
  interface Window {
    QRCode?: QRCtor & { CorrectLevel: { M: number } };
  }
}
let loading: Promise<void> | null = null;
function loadQr(): Promise<void> {
  if (window.QRCode) return Promise.resolve();
  if (!loading)
    loading = new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = QR_SRC;
      s.integrity = QR_SRI;
      s.crossOrigin = "anonymous";
      s.referrerPolicy = "no-referrer";
      s.onload = () => ok();
      s.onerror = () => {
        loading = null;
        no(new Error("QR Code 載入失敗"));
      };
      document.head.appendChild(s);
    });
  return loading;
}

/** 把容器裡所有 .iepqr[data-t] 畫成 QR */
export function useDrawQr(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = [...(ref.current?.querySelectorAll<HTMLElement>(".iepqr[data-t]") || [])];
    if (!els.length) return;
    loadQr()
      .then(() => {
        els.forEach((el) => {
          el.innerHTML = "";
          new window.QRCode!(el, { text: el.dataset.t || "", width: 220, height: 220, correctLevel: window.QRCode!.CorrectLevel.M });
        });
      })
      .catch(() => els.forEach((el) => (el.textContent = "QR Code 載入失敗，請檢查網路")));
  }, [dep]);
  return ref;
}

/** 一位出席者一張小單 */
function slipHtml(D: RcData, R: Round, o: PersonSheet, url: string, priv: string, host: string): string {
  const max = 7;
  const ms = o.meets.slice(0, max);
  return (
    '<div class="slip"><div class="hd"><b>' + E(R.kind || "IEP 會議") + "時間調查</b><span>" + E(D.title || "") + '</span></div><div class="qs"><div class="qt">' +
    '<div class="to">' + E(IEP.salute(o.name, o.meets.map((x) => x.role).join("、"), o.teacher)) + " 您好：</div>" +
    "<p>請用手機掃描右邊的 QR Code，點選您<b>有空</b>的節次後送出。</p>" +
    "<p>學生：" + ms.map((x) => E(IEP.stuShow(x.s, priv))).join("、") + (o.meets.length > max ? " 等 " + o.meets.length + " 位" : "") + "</p>" +
    "<p>調查範圍：" + E(IEP.fmtDate(R.d1 || "")) + "～" + E(IEP.fmtDate(R.d2 || "")) + "</p><p>請於 <b>" + E(IEP.fmtDate(R.due)) + "</b> 前填寫" + (host ? "　" + E(host) : "") + "</p>" +
    '<p class="url">' + E(url) + '</p></div><div class="iepqr" data-t="' + E(url) + '"></div></div><span class="cut">✂</span></div>'
  );
}

export function QrSlips({ D, R, people, urlOf, per, priv, host }: {
  D: RcData;
  R: Round;
  people: PersonSheet[];
  urlOf: (pk: string) => string;
  per: 3 | 4;
  priv: string;
  host: string;
}) {
  const list = people.filter((o) => urlOf(o.k));
  const n = per === 3 ? 3 : 4;
  let h = "";
  for (let i = 0; i < list.length; i += n)
    h += '<div class="pg iepcut n' + n + '">' + list.slice(i, i + n).map((o) => slipHtml(D, R, o, urlOf(o.k), priv, host)).join("") + "</div>";
  const ref = useDrawQr(h);
  return <div id="outArea" ref={ref} dangerouslySetInnerHTML={{ __html: h }} />;
}

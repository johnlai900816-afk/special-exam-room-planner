"use client";
/* IEP 調查的 QR：畫 QR（和舊版相同的 qrcodejs 1.0.0，cdnjs，SRI 檢查）。
   QR 小單的 HTML 在 lib/nx/iepPrint.ts（qrSlipsHtml，和舊版 slipQR 一模一樣：全寬、一張 A4 裁 3／4／6 份），
   樣式是 repo 根目錄的 iep.css。 */
import { useEffect, useRef } from "react";

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

/** 把容器裡所有 .iepqr[data-t] 畫成 QR（畫完才 resolve，列印前要等） */
export function drawQr(root: HTMLElement | null): Promise<void> {
  const els = [...(root?.querySelectorAll<HTMLElement>(".iepqr[data-t]") || [])];
  if (!els.length) return Promise.resolve();
  return loadQr()
    .then(() => {
      els.forEach((el) => {
        el.innerHTML = "";
        new window.QRCode!(el, { text: el.dataset.t || "", width: 256, height: 256, correctLevel: window.QRCode!.CorrectLevel.M });
      });
    })
    .catch(() => els.forEach((el) => (el.textContent = "QR Code 載入失敗，請檢查網路")));
}

/** dep 變了就重畫容器裡的 QR */
export function useDrawQr(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void drawQr(ref.current);
  }, [dep]);
  return ref;
}

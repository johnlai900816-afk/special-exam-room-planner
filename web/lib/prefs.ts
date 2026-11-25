/* 個人設定（只存在這台瀏覽器；公用電腦模式下存在 sessionStorage，關掉分頁就沒了） */
export type FontSize = "md" | "lg" | "xl";
const KEY = "rc-next-font";

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem("rc-next-public") === "1" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function getFontSize(): FontSize {
  const v = store()?.getItem(KEY);
  return v === "lg" || v === "xl" ? v : "md";
}

export function applyFontSize(v: FontSize = getFontSize()): void {
  if (typeof document === "undefined") return;
  if (v === "md") delete document.documentElement.dataset.font;
  else document.documentElement.dataset.font = v;
}

export function setFontSize(v: FontSize): void {
  store()?.setItem(KEY, v);
  applyFontSize(v);
}

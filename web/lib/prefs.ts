/* 個人設定（只存在這台瀏覽器；公用電腦模式下存在 sessionStorage，關掉分頁就沒了）：字的大小、深色。
   深色用舊版同一個鍵 rc-theme（'light'｜'dark'，沒有＝跟系統），新舊版在同一個網域時一致。 */
export type FontSize = "md" | "lg" | "xl";
export type Theme = "auto" | "light" | "dark";
const KEY = "rc-next-font";
const THEME_KEY = "rc-theme";

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

export function getTheme(): Theme {
  const v = store()?.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

export function applyTheme(v: Theme = getTheme()): void {
  if (typeof document === "undefined") return;
  if (v === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
}

export function setTheme(v: Theme): void {
  const st = store();
  if (v === "auto") st?.removeItem(THEME_KEY);
  else st?.setItem(THEME_KEY, v);
  applyTheme(v);
}

/** 放在 <head> 的小程式：畫面出來之前套上深色與字級 */
export const THEME_BOOT = `try{var p=sessionStorage.getItem('rc-next-public')==='1',s=p?sessionStorage:localStorage,t=s.getItem('${THEME_KEY}'),f=s.getItem('${KEY}'),r=document.documentElement;if(t==='dark'||t==='light')r.dataset.theme=t;if(f==='lg'||f==='xl')r.dataset.font=f;}catch(e){}`;

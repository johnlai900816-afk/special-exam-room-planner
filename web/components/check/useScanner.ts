"use client";
/* 鏡頭掃學生卡（舊版 checkin.js camToggle）：和舊版同一個 html5-qrcode 2.3.8（cdnjs，SRI 檢查），按了才載入。
   同一張卡 3 秒內只算一次。關掉頁面或切換時會停掉鏡頭。 */
import { useCallback, useEffect, useRef, useState } from "react";

const SRC = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
const SRI = "sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+";

interface Cam {
  start(cfg: { facingMode: string }, o: { fps: number; qrbox: number }, ok: (t: string) => void): Promise<unknown>;
  stop(): Promise<unknown>;
  clear(): void;
}
declare global {
  interface Window {
    Html5Qrcode?: new (id: string) => Cam;
  }
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (window.Html5Qrcode) return Promise.resolve();
  if (!loading)
    loading = new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = SRC;
      s.integrity = SRI;
      s.crossOrigin = "anonymous";
      s.referrerPolicy = "no-referrer";
      s.onload = () => ok();
      s.onerror = () => {
        loading = null;
        no(new Error("掃碼元件載入失敗"));
      };
      document.head.appendChild(s);
    });
  return loading;
}

export function useScanner(onText: (t: string) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cam = useRef<Cam | null>(null);
  const last = useRef({ t: "", at: 0 });
  const cb = useRef(onText);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    cb.current = onText;
  });
  const stop = useCallback(() => {
    const c = cam.current;
    cam.current = null;
    setOn(false);
    if (c)
      c.stop()
        .then(() => c.clear())
        .catch(() => {});
  }, []);
  useEffect(() => stop, [stop]);
  const toggle = useCallback(async () => {
    if (cam.current) return stop();
    setErr("");
    try {
      await load();
      setOn(true);
      const el = ref.current;
      if (!el || !window.Html5Qrcode) throw new Error("掃碼元件載入失敗");
      el.id = el.id || "camBox";
      const c = new window.Html5Qrcode(el.id);
      cam.current = c;
      await c.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, (t) => {
        const now = Date.now();
        if (t === last.current.t && now - last.current.at < 3000) return;
        last.current = { t, at: now };
        cb.current(t);
      });
    } catch (e) {
      cam.current = null;
      setOn(false);
      setErr("鏡頭打不開：" + ((e as Error)?.message || "請允許使用鏡頭"));
    }
  }, [stop]);
  return { ref, on, err, toggle };
}

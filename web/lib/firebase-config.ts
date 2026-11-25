/* Firebase 網頁設定。和舊系統 repo 根目錄的 firebase-config.js 是同一組（本來就是公開的設定，
   資料安全靠 firestore.rules 與 Google 登入把關）。舊檔是設定 window 全域變數的 script，沒辦法 import，
   所以在這裡另外寫一份；換專案時兩邊要一起改，或用 NEXT_PUBLIC_FIREBASE_CONFIG（JSON）在建置時覆寫。

   「學校自己的雲端」：舊系統把學校自己的 Firebase 設定存在 localStorage `rc-school-cloud`（school.js）。
   新版和舊版在同一個網域（github.io）底下，讀得到同一個 localStorage，所以沿用同一個鍵、同一個格式：
   {apiKey, authDomain, projectId, ...} 或 {local:true}（不用雲端）。 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

export const SCHOOL_CLOUD_KEY = "rc-school-cloud";

export const BUILTIN_FIREBASE: FirebaseWebConfig = (() => {
  const env = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (env) {
    try {
      return JSON.parse(env) as FirebaseWebConfig;
    } catch {
      /* 格式錯就用內建的 */
    }
  }
  return {
    apiKey: "AIzaSyDGHEklua5Ze1DfX2Zj4KnPulWbzJygjJA",
    authDomain: "special-exam-rooms.firebaseapp.com",
    projectId: "special-exam-rooms",
    storageBucket: "special-exam-rooms.firebasestorage.app",
    messagingSenderId: "624322262257",
    appId: "1:624322262257:web:e5b600c8b02b362e76a550",
  };
})();

/** 這台瀏覽器實際要用的設定；null＝單機（不連雲端）。只能在瀏覽器裡呼叫 */
export function activeFirebaseConfig(): FirebaseWebConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const o = JSON.parse(window.localStorage.getItem(SCHOOL_CLOUD_KEY) || "null");
    if (o && o.local) return null;
    if (o && o.apiKey && o.projectId && o.authDomain) return o as FirebaseWebConfig;
  } catch {
    /* 壞掉的設定就當作沒有 */
  }
  return BUILTIN_FIREBASE.projectId ? BUILTIN_FIREBASE : null;
}

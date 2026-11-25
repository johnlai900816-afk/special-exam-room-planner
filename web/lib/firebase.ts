/* Firebase（modular SDK）初始化。只在瀏覽器裡用；靜態輸出時伺服器端不會碰到。 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { activeFirebaseConfig } from "./firebase-config";

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  projectId: string;
}

let cached: FirebaseHandles | null | undefined;

/** 回傳 Firebase；這台瀏覽器設成「單機」或沒有設定時回傳 null */
export function firebase(): FirebaseHandles | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  const cfg = activeFirebaseConfig();
  if (!cfg) {
    cached = null;
    return cached;
  }
  const app = getApps().length ? getApp() : initializeApp(cfg);
  cached = { app, auth: getAuth(app), db: getFirestore(app), projectId: cfg.projectId };
  return cached;
}

export async function signInWithGoogle(): Promise<void> {
  const fb = firebase();
  if (!fb) throw new Error("這台電腦設定成不使用雲端");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(fb.auth, provider);
}

export async function signOutNow(): Promise<void> {
  const fb = firebase();
  if (fb) await signOut(fb.auth);
}

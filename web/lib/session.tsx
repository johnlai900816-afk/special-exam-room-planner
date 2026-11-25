"use client";
/* 登入狀態＋資料來源，整個 App 共用一份。

   資料來源：
     1. 登入且在名單裡 → Firestore（過渡期讀舊位置 rc/main、exams/main，和舊版同一份，即時同步）
     2. 這台設成「不使用雲端」（單機）→ 這台瀏覽器的 localStorage（舊版存的 resource-class-v1）
        登入了但暫時連不上雲端時，也先用這一份
     3. 使用者自己選的備份檔（只在記憶體裡）或範例資料（core.defaultData()）

   共用電腦的安全：
     - 有雲端時，沒登入就不顯示任何真實資料（只能看範例資料）
     - 登出時把記憶體裡的資料全部清掉
     - 「公用電腦模式」：不讀不寫 localStorage、登入狀態只留在這個分頁（關掉就登出）

   角色：custom claims {sid, role}（Cloud Function 設定）優先；還沒有的話從舊名單 config/access 推（accounts.ts）。
   單機模式就是這台電腦的主人，當作管理者。管理者可以「以教師身分預覽」。 */
import { browserLocalPersistence, browserSessionPersistence, onAuthStateChanged, setPersistence } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { appRoleOf, boundTeacherId, claimsOf, isHost, normEmail, roleOf, type Access, type AppRole } from "./accounts";
import { watchAccess, watchExam, watchMain } from "./cloud";
import { firebase, signOutNow } from "./firebase";
import { demoData, getLocalMe, KEY_ME, loadLocalExam, loadLocalMain, readBackupFile, setLocalMe } from "./local";
import type { RoleClaims } from "./model";
import type { ExamData, RcData } from "./types";

/** off＝這台設成單機；out＝有雲端但沒登入；wait＝連線中；on＝已同步；
    denied＝登入了但不在名單；nohost＝雲端還沒有主持人；error＝連不上 */
export type CloudState = "off" | "out" | "wait" | "on" | "denied" | "nohost" | "error";
export type SourceKind = "cloud" | "local" | "file" | "demo" | "none";

const PUBLIC_KEY = "rc-next-public";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  photo: string;
}

export interface Session {
  ready: boolean;
  cloud: CloudState;
  projectId: string;
  user: SessionUser | null;
  access: Access | null;
  claims: RoleClaims | null;
  /** 畫面用的角色（預覽時是 teacher）；null＝沒有權限 */
  role: AppRole | null;
  /** 帳號真正的角色 */
  realRole: AppRole | null;
  host: boolean;
  preview: boolean;
  publicMode: boolean;
  source: { kind: SourceKind; label: string; by?: string; at?: Date | null };
  /** null＝沒有可以顯示的資料（例如有雲端但沒登入） */
  D: RcData | null;
  exam: ExamData | null;
  /** 「我的」頁面顯示哪一位老師（teacher id） */
  meId: string;
  /** 帳號綁定的老師；單機模式是自己選的 */
  boundId: string;
  setMe(id: string): void;
  setPreview(on: boolean): void;
  setPublicMode(on: boolean): void;
  loadFile(f: File): Promise<void>;
  loadDemo(): void;
  loadDefault(): void;
  logout(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession 要放在 <SessionProvider> 裡");
  return s;
}

interface Override {
  kind: "file" | "demo";
  D: RcData;
  exam: ExamData | null;
  label: string;
}

const readPublic = () => {
  try {
    return window.sessionStorage.getItem(PUBLIC_KEY) === "1";
  } catch {
    return false;
  }
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cloud, setCloud] = useState<CloudState>("wait");
  const [projectId, setProjectId] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [claims, setClaims] = useState<RoleClaims | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [main, setMain] = useState<{ D: RcData | null; by?: string; at?: Date | null } | null>(null);
  const [cloudExam, setCloudExam] = useState<ExamData | null>(null);
  const [local, setLocal] = useState<{ D: RcData | null; exam: ExamData | null }>({ D: null, exam: null });
  const [override, setOverride] = useState<Override | null>(null);
  const [viewAs, setViewAs] = useState("");
  const [preview, setPreview] = useState(false);
  const [publicMode, setPublicModeState] = useState(false);
  const [localMe, setLocalMeState] = useState("");
  const subs = useRef<(() => void)[]>([]);
  const fallbackDemo = useMemo(() => demoData(), []);

  const stopData = useCallback(() => {
    subs.current.forEach((u) => u());
    subs.current = [];
  }, []);

  const clearAll = useCallback(() => {
    stopData();
    setAccess(null);
    setClaims(null);
    setMain(null);
    setCloudExam(null);
    setOverride(null);
    setViewAs("");
    setPreview(false);
  }, [stopData]);

  useEffect(() => {
    let alive = true;
    const later = (f: () => void) => Promise.resolve().then(() => alive && f());
    const pub = readPublic();
    later(() => {
      setPublicModeState(pub);
      if (!pub) {
        setLocal({ D: loadLocalMain(), exam: loadLocalExam() });
        setLocalMeState(getLocalMe());
      }
    });
    const fb = firebase();
    if (!fb) {
      later(() => {
        setCloud("off");
        setReady(true);
      });
      return () => {
        alive = false;
      };
    }
    later(() => setProjectId(fb.projectId));
    let unAccess: (() => void) | null = null;
    const unAuth = onAuthStateChanged(fb.auth, (u) => {
      unAccess?.();
      unAccess = null;
      clearAll();
      if (!u || !u.email) {
        setUser(null);
        setCloud("out");
        setReady(true);
        return;
      }
      const email = normEmail(u.email);
      setUser({ uid: u.uid, email, name: u.displayName || email.split("@")[0], photo: u.photoURL || "" });
      setCloud("wait");
      u.getIdTokenResult()
        .then((r) => alive && setClaims(claimsOf(r.claims)))
        .catch(() => {});
      unAccess = watchAccess(
        (a) => {
          setAccess(a);
          setReady(true);
          if (!a) {
            stopData();
            setCloud("nohost");
            return;
          }
          if (!roleOf(a, email)) {
            stopData();
            setCloud("denied");
            return;
          }
          setCloud("on");
          if (subs.current.length) return;
          subs.current.push(
            watchMain(
              (d) => setMain({ D: d.data, by: d.by, at: d.at }),
              () => setCloud("error"),
            ),
            watchExam(
              (d) => setCloudExam(d.data),
              () => setCloudExam(null),
            ),
          );
        },
        (e) => {
          // 不在名單時 config/access 讀不到（規則只給成員讀）
          stopData();
          setReady(true);
          setCloud(/permission/i.test(String(e.message)) ? "denied" : "error");
        },
      );
    });
    return () => {
      alive = false;
      unAccess?.();
      unAuth();
      stopData();
    };
  }, [stopData, clearAll]);

  const realRole: AppRole | null =
    cloud === "off"
      ? "admin"
      : cloud === "on"
        ? appRoleOf(claims) || roleOf(access, user?.email)
        : cloud === "error" && user
          ? "admin"
          : override?.kind === "demo"
            ? "admin" // 沒登入也可以看虛構的範例資料
            : null;
  const role: AppRole | null = realRole === "admin" && preview ? "teacher" : realRole;
  const host = cloud === "on" && isHost(access, user?.email);

  // 有雲端但沒登入（或不在名單）時只能看範例資料
  const mayShowReal = cloud === "off" || (!!user && (cloud === "on" || cloud === "error"));
  let D: RcData | null = null;
  let exam: ExamData | null = null;
  let source: Session["source"] = { kind: "none", label: "沒有資料" };
  if (override && (override.kind === "demo" || mayShowReal)) {
    D = override.D;
    exam = override.exam;
    source = { kind: override.kind, label: override.label };
  } else if (cloud === "on" && main?.D) {
    D = main.D;
    exam = cloudExam;
    source = { kind: "cloud", label: "雲端共用", by: main.by, at: main.at };
  } else if (mayShowReal && local.D) {
    D = local.D;
    exam = local.exam;
    source = { kind: "local", label: "這台電腦的資料" };
  } else if (mayShowReal && ready && cloud !== "on") {
    D = fallbackDemo;
    source = { kind: "demo", label: "範例資料" };
  } else if (cloud === "on" && main && !main.D) {
    source = { kind: "none", label: "雲端還沒有資料" };
  }

  const boundId = cloud === "on" ? claims?.tid || boundTeacherId(access, user?.email) : localMe;
  const meId = (realRole === "admin" && viewAs) || boundId;

  const value: Session = {
    ready,
    cloud,
    projectId,
    user,
    access,
    claims,
    role,
    realRole,
    host,
    preview,
    publicMode,
    source,
    D,
    exam,
    meId,
    boundId,
    setMe(id) {
      if (cloud === "on" || publicMode) setViewAs(id);
      else {
        setLocalMe(id);
        setLocalMeState(id);
      }
    },
    setPreview,
    setPublicMode(on) {
      try {
        if (on) window.sessionStorage.setItem(PUBLIC_KEY, "1");
        else window.sessionStorage.removeItem(PUBLIC_KEY);
      } catch {
        /* 無痕視窗等不能存就算了 */
      }
      setPublicModeState(on);
      const fb = firebase();
      if (fb) setPersistence(fb.auth, on ? browserSessionPersistence : browserLocalPersistence).catch(() => {});
      if (on) {
        setLocal({ D: null, exam: null });
        setLocalMeState("");
      } else {
        setLocal({ D: loadLocalMain(), exam: loadLocalExam() });
        setLocalMeState(getLocalMe());
      }
    },
    async loadFile(f) {
      if (!mayShowReal) throw new Error("請先登入再讀取備份檔");
      const b = await readBackupFile(f);
      setOverride({ kind: "file", D: b.D, exam: b.exam, label: "備份檔：" + b.name });
    },
    loadDemo() {
      setOverride({ kind: "demo", D: demoData(), exam: null, label: "範例資料" });
    },
    loadDefault() {
      setOverride(null);
      if (!publicMode) setLocal({ D: loadLocalMain(), exam: loadLocalExam() });
    },
    async logout() {
      clearAll();
      if (publicMode) {
        try {
          window.localStorage.removeItem(KEY_ME);
          window.sessionStorage.clear();
        } catch {
          /* 略過 */
        }
        setPublicModeState(false);
      }
      await signOutNow();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

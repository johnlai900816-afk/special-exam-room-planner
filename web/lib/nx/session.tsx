"use client";
/* 新資料模型（schools/{sid}/terms/{tid}/…）的登入與資料來源。老師端（/me/…）與登入頁用這個；
   舊位置 rc/main 的 lib/session.tsx 留給還沒搬的管理者頁面。

   登入流程：
     1. Google 登入（公用電腦模式：browserSessionPersistence，關掉分頁就登出）
     2. ID token 沒有 claims → 呼叫 nxAcceptInvite（有邀請就領取角色）→ getIdToken(true) 拿到新的 claims
        沒有邀請 → 「還沒有邀請」
     3. claims {sid, role, tid}：讀 schools/{sid}（currentTerm、mode）
          teacher → 名冊上要有 teachers/{tid}，沒有就是「找不到綁定的老師」→ Firestore 版 Repo
          admin／editor → 管理者端（/admin/…，Firestore 版 Repo 讀全部）；可以「以老師身分預覽」（記憶體版、唯讀、照規則過濾）
          viewer → 這一階段先用舊版（畫面給連結）
   沒登入、這台電腦設定成單機、或沒有雲端設定 → 範例資料（記憶體版 Repo，虛構的；可以選看哪一位老師）。

   過渡期：schools/{sid}.mode=='legacy' 時資料由舊版單向同步，新版只讀；
   schools/{sid}.native（和 nxLink/main.native 一樣的集合名稱）列出已經交給新版的部分，那幾塊可以寫。 */
import { browserLocalPersistence, browserSessionPersistence, onAuthStateChanged, setPersistence, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { claimsOf, normEmail } from "../accounts";
import { firebase, signInWithGoogle, signOutNow } from "../firebase";
import type { RoleClaims } from "../model";
import { createFirestoreRepo, createMemoryRepo, memoryStore, toCoreD, type Loaded, type Repo, type RepoScope, type WritableCol } from "../repo";
import { buildBoard, type Board } from "../schedule";
import type { RcData, Teacher } from "../types";
import { DEMO_DEFAULT_TID, demoAdminRepo, demoRepo } from "./demo";

export type NxPhase =
  | "boot" // 還在判斷
  | "demo" // 範例資料
  | "signing" // 登入後：領取邀請、讀學校
  | "noInvite" // 還沒有邀請
  | "missingTeacher" // 找不到綁定的老師
  | "noTerm" // 學校還沒有目前的學期
  | "staff" // 管理者／編輯：管理者端
  | "viewer" // 檢視：先用舊版
  | "teacher" // 老師，Firestore
  | "error";

export interface NxUser {
  uid: string;
  email: string;
  name: string;
}

/** 管理者端：讀得到全部（管理者／編輯登入；範例資料時是記憶體版） */
/** 管理者端可以寫的一塊：集合名稱，或整塊功能（'sched' 排課、'checkin' 點名） */
export type AdminArea = WritableCol | "sched" | "checkin";

export interface AdminSide {
  repo: Repo;
  data: Loaded | null;
  D: RcData | null;
  board: Board | null;
  role: "admin" | "editor";
  /** 這一塊可以寫嗎（過渡期 schools/{sid}.mode=='legacy' 時，只有交給新版的集合可以寫）。
      'sched'＝排課整塊（課程、草稿、版本、鎖課紀錄）：native 列了 'sched' 就可以；'checkin'＝點名（native 列了 'checkin' 或 'attendance'） */
  canWrite(col: AdminArea): boolean;
}

export interface Nx {
  phase: NxPhase;
  /** 錯誤或狀態的一句話 */
  msg: string;
  user: NxUser | null;
  claims: RoleClaims | null;
  /** 有雲端設定（不是單機） */
  cloud: boolean;
  schoolName: string;
  repo: Repo | null;
  scope: RepoScope | null;
  data: Loaded | null;
  /** toCoreD(records)：舊格式 D，給 core.js／iep.js／teacher.js */
  D: RcData | null;
  board: Board | null;
  me: Teacher | null;
  tid: string;
  /** 這一塊可以寫嗎（過渡期只讀） */
  writable(col: WritableCol): boolean;
  /** 管理者端的資料（不是管理者／編輯、或學校還沒有學期時是 null） */
  admin: AdminSide | null;
  /** 學校文件（範例資料時是 null） */
  school: School | null;
  /** 管理者正在以哪一位老師的身分預覽（''＝沒有）；預覽時老師頁讀的是唯讀的記憶體版 */
  previewTid: string;
  setPreview(tid: string): void;
  demo: boolean;
  setDemoTid(tid: string): void;
  publicMode: boolean;
  setPublicMode(on: boolean): void;
  login(): Promise<void>;
  logout(): Promise<void>;
  /** 重新讀 claims（管理者剛改了角色） */
  refresh(): void;
}

const Ctx = createContext<Nx | null>(null);
export function useNx(): Nx {
  const x = useContext(Ctx);
  if (!x) throw new Error("useNx 要放在 <NxSessionProvider> 裡");
  return x;
}

const PUBLIC_KEY = "rc-next-public";
const DEMO_TID_KEY = "rc-nx-demo-tid";
const ss = {
  get(k: string) {
    try {
      return window.sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v == null) window.sessionStorage.removeItem(k);
      else window.sessionStorage.setItem(k, v);
    } catch {
      /* 無痕視窗等 */
    }
  },
};

export interface School {
  name: string;
  termId: string;
  mode: "legacy" | "native";
  native: string[];
}

/** 呼叫 Cloud Function（asia-east1） */
export async function callNx<T = unknown>(name: string, data: unknown): Promise<T> {
  const fb = firebase();
  if (!fb) throw new Error("沒有雲端");
  const r = await httpsCallable(getFunctions(fb.app, "asia-east1"), name)(data);
  return r.data as T;
}

export function NxSessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<NxPhase>("boot");
  const [msg, setMsg] = useState("");
  const [user, setUser] = useState<NxUser | null>(null);
  const [claims, setClaims] = useState<RoleClaims | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [cloud, setCloud] = useState(false);
  const [demoTid, setDemoTidState] = useState(DEMO_DEFAULT_TID);
  const [publicMode, setPublicModeState] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [adminData, setAdminData] = useState<Loaded | null>(null);
  const [previewTid, setPreviewTid] = useState("");
  const [nonce, setNonce] = useState(0);
  const authUser = useRef<User | null>(null);

  // 1. 登入狀態 → 階段
  useEffect(() => {
    let alive = true;
    const later = (f: () => void) => Promise.resolve().then(() => alive && f());
    later(() => {
      setPublicModeState(ss.get(PUBLIC_KEY) === "1");
      setDemoTidState(ss.get(DEMO_TID_KEY) || DEMO_DEFAULT_TID);
    });
    const fb = firebase();
    if (!fb) {
      later(() => setPhase("demo"));
      return () => {
        alive = false;
      };
    }
    later(() => setCloud(true));
    const un = onAuthStateChanged(fb.auth, async (u) => {
      authUser.current = u;
      setData(null);
      setAdminData(null);
      setPreviewTid("");
      setSchool(null);
      setClaims(null);
      setMsg("");
      if (!u || !u.email) {
        setUser(null);
        setPhase("demo");
        return;
      }
      setUser({ uid: u.uid, email: normEmail(u.email), name: u.displayName || u.email.split("@")[0] });
      setPhase("signing");
      try {
        let c = claimsOf((await u.getIdTokenResult()).claims);
        // 快取的 token 可能是領角色以前的：先強制換一次再判斷
        if (!c) c = claimsOf((await u.getIdTokenResult(true)).claims);
        if (!c) {
          try {
            await callNx("nxAcceptInvite", {});
          } catch (e) {
            const code = String((e as { code?: string }).code || "");
            if (!alive) return;
            if (/not-found/.test(code)) {
              setPhase("noInvite");
              return;
            }
            throw e;
          }
          await u.getIdToken(true);
          c = claimsOf((await u.getIdTokenResult()).claims);
        }
        if (!alive) return;
        if (!c) {
          setPhase("noInvite");
          return;
        }
        setClaims(c);
        if (c.role === "viewer") return setPhase("viewer");
        const s = await getDoc(doc(fb.db, "schools/" + c.sid));
        const sd = s.data() || {};
        const termId = String(sd.currentTerm || "");
        if (!alive) return;
        const sch: School = { name: String(sd.name || ""), termId, mode: sd.mode === "native" ? "native" : "legacy", native: Array.isArray(sd.native) ? sd.native.map(String) : [] };
        // 管理者／編輯：學期還沒有時也進得去（帳號與共用、搬移）
        if (c.role === "admin" || c.role === "editor") {
          setSchool(sch);
          return setPhase("staff");
        }
        if (!termId) return setPhase("noTerm");
        const tid = c.tid || "";
        const t = tid ? await getDoc(doc(fb.db, `schools/${c.sid}/terms/${termId}/teachers/${tid}`)) : null;
        if (!alive) return;
        setSchool(sch);
        setPhase(t && t.exists() ? "teacher" : "missingTeacher");
      } catch (e) {
        if (!alive) return;
        setMsg(String((e as { code?: string }).code || (e as Error).message));
        setPhase("error");
      }
    });
    return () => {
      alive = false;
      un();
    };
  }, [nonce]);

  // 2. 資料來源
  // 管理者端：管理者／編輯讀全部；範例資料是同一份記憶體資料庫的管理者視角
  const adminRepo = useMemo<Repo | null>(() => {
    if (phase === "demo") return demoAdminRepo();
    if (phase !== "staff" || !claims || !school || !school.termId || !user) return null;
    const fb = firebase();
    if (!fb) return null;
    const role = claims.role === "editor" ? "editor" : "admin";
    const scope: RepoScope = claims.tid
      ? { sid: claims.sid, termId: school.termId, uid: user.uid, role, tid: claims.tid }
      : { sid: claims.sid, termId: school.termId, uid: user.uid, role };
    return createFirestoreRepo(fb.db, scope, { readOnly: school.mode === "legacy" && !school.native.length });
  }, [phase, claims, school, user]);

  useEffect(() => {
    if (!adminRepo) return;
    return adminRepo.watch(
      (x) => setAdminData(x),
      (e) => setMsg(String((e as { code?: string }).code || e.message)),
    );
  }, [adminRepo]);

  const repo = useMemo<Repo | null>(() => {
    if (phase === "demo") return demoRepo(demoTid);
    // 管理者以老師身分預覽：用管理者讀到的資料做一份唯讀的記憶體版，權限照規則過濾（只看得到那位老師的學生）
    if (phase === "staff" && previewTid && adminData && claims && school && user)
      return createMemoryRepo(
        { sid: claims.sid, termId: school.termId, uid: user.uid, role: "teacher", tid: previewTid },
        memoryStore(adminData.records),
        { readOnly: true },
      );
    if (phase !== "teacher" || !claims || !school || !user) return null;
    const fb = firebase();
    if (!fb) return null;
    const scope: RepoScope = { sid: claims.sid, termId: school.termId, uid: user.uid, role: "teacher", tid: claims.tid };
    return createFirestoreRepo(fb.db, scope, { readOnly: school.mode === "legacy" && !school.native.length });
  }, [phase, demoTid, claims, school, user, previewTid, adminData]);

  useEffect(() => {
    if (!repo) return;
    return repo.watch(
      (x) => setData(x),
      (e) => setMsg(String((e as { code?: string }).code || e.message)),
    );
  }, [repo]);

  const D = useMemo(() => (data ? toCoreD(data.records) : null), [data]);
  const board = useMemo(() => {
    if (!D) return null;
    try {
      return buildBoard(D);
    } catch {
      return null;
    }
  }, [D]);
  const tid = repo?.scope.tid || "";
  const me = D?.teachers.find((t) => t.id === tid) || null;

  const writable = useCallback(
    (col: WritableCol) => {
      if (!repo || repo.readOnly) return false;
      if (repo.kind === "memory") return true;
      if (!school || school.mode === "native") return true;
      return school.native.includes(col === "privates" ? "privates" : col);
    },
    [repo, school],
  );

  const adminD = useMemo(() => (adminData ? toCoreD(adminData.records) : null), [adminData]);
  const adminBoard = useMemo(() => {
    if (!adminD) return null;
    try {
      return buildBoard(adminD);
    } catch {
      return null;
    }
  }, [adminD]);
  const admin = useMemo<AdminSide | null>(() => {
    if (!adminRepo) return null;
    return {
      repo: adminRepo,
      data: adminData,
      D: adminD,
      board: adminBoard,
      role: adminRepo.scope.role === "editor" ? "editor" : "admin",
      canWrite(col: AdminArea) {
        if (adminRepo.readOnly) return false;
        if (adminRepo.kind === "memory" || !school || school.mode === "native") return true;
        if (col === "checkin") return school.native.includes("checkin") || school.native.includes("attendance");
        return school.native.includes(col);
      },
    };
  }, [adminRepo, adminData, adminD, adminBoard, school]);

  const value: Nx = {
    phase,
    msg,
    user,
    claims,
    cloud,
    schoolName: phase === "demo" ? "範例國中（虛構）" : school?.name || "",
    repo,
    scope: repo?.scope || null,
    data: repo ? data : null,
    D: repo ? D : null,
    board: repo ? board : null,
    me: repo ? me : null,
    tid,
    writable,
    admin,
    school,
    previewTid,
    setPreview(t) {
      setData(null);
      setPreviewTid(t);
    },
    demo: phase === "demo",
    setDemoTid(t) {
      ss.set(DEMO_TID_KEY, t);
      setData(null);
      setDemoTidState(t);
    },
    publicMode,
    setPublicMode(on) {
      ss.set(PUBLIC_KEY, on ? "1" : null);
      setPublicModeState(on);
      const fb = firebase();
      if (fb) setPersistence(fb.auth, on ? browserSessionPersistence : browserLocalPersistence).catch(() => {});
    },
    async login() {
      const fb = firebase();
      if (fb) await setPersistence(fb.auth, publicMode ? browserSessionPersistence : browserLocalPersistence).catch(() => {});
      await signInWithGoogle();
    },
    async logout() {
      setData(null);
      setAdminData(null);
      setPreviewTid("");
      if (publicMode) {
        // 公用電腦：這個分頁存的東西（IEP 連結的鑰匙、設定、範例資料的選擇）全部清掉
        try {
          window.sessionStorage.clear();
          window.localStorage.removeItem("rc-next-me");
        } catch {
          /* 略過 */
        }
        setPublicModeState(false);
      }
      await signOutNow();
    },
    refresh() {
      const u = authUser.current;
      if (u) u.getIdToken(true).finally(() => setNonce((n) => n + 1));
      else setNonce((n) => n + 1);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

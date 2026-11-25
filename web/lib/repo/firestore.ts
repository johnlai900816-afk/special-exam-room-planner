/* Firestore 版 Repo：schools/{sid}/terms/{tid}/…。查詢照角色下（規則才不會拒絕整個查詢）：
     管理者／編輯：整個集合
     老師：students where teacherIds array-contains tid ＋ where caseMgrId == tid（兩個合併）；private 只讀自己個管的；
           attendance where teacherId == tid；iep where readers array-contains tid
     檢視：只讀學期設定、老師、班級、課程、段考
   寫入一律用交易：先讀現在的 rev，不一樣就丟 RevConflictError；寫的時候 rev+1、updatedBy、updatedAt=serverTimestamp()。 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QuerySnapshot,
  type Timestamp,
  type Unsubscribe as FsUnsub,
} from "firebase/firestore";
import { NX } from "../legacy";
import { isStaff, type Collection, type StudentDoc, type TermRecords, type Versioned } from "../model";
import { applyWrite, infoOf, linkPatches, withLinks } from "./derive";
import { emptyRecords } from "./toCoreD";
import {
  RepoDeniedError,
  RevConflictError,
  revKey,
  type BatchOp,
  type BatchResult,
  type DocOf,
  type Loaded,
  type Repo,
  type RepoScope,
  type RevMap,
  type Unsubscribe,
  type WritableCol,
} from "./types";

export interface FirestoreRepoOptions {
  /** 過渡期（schools/{sid}.mode=='legacy'）設 true：畫面只讀 */
  readOnly?: boolean;
  /** 點名只讀這一天（YYYY-MM-DD）以後的；預設今天往前 14 天 */
  attendanceSince?: string;
}

const META = ["rev", "updatedBy", "updatedAt"];
const toDate = (t: unknown): Date | null => (t && typeof (t as Timestamp).toDate === "function" ? (t as Timestamp).toDate() : null);
function split(data: DocumentData): { doc: Record<string, unknown>; meta: Versioned } {
  const doc: Record<string, unknown> = {};
  Object.keys(data).forEach((k) => {
    if (!META.includes(k)) doc[k] = data[k];
  });
  return { doc, meta: { rev: +data.rev || 0, updatedBy: String(data.updatedBy || ""), updatedAt: toDate(data.updatedAt) } };
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function createFirestoreRepo(db: Firestore, scope: RepoScope, opt: FirestoreRepoOptions = {}): Repo {
  const T = `schools/${scope.sid}/terms/${scope.termId}`;
  const staff = isStaff(scope.role);
  const tid = scope.role === "teacher" ? scope.tid || "" : "";
  const readOnly = !!opt.readOnly;
  const since = opt.attendanceSince || ymd(new Date(Date.now() - 14 * 864e5));

  const ref = (col: WritableCol | Collection, id: string): DocumentReference =>
    doc(db, col === "term" ? T : NX.pathOf(scope.sid, scope.termId, col, id));

  /** 每一個來源（一個查詢或一份文件）→ 它在 records 裡的位置 */
  type Src =
    | { kind: "doc"; col: "term"; ref: DocumentReference }
    | { kind: "query"; col: Collection; q: Query; key?: (id: string, data: DocumentData) => string };
  function sources(): Src[] {
    const c = (name: string) => collection(db, T + "/" + name);
    const s: Src[] = [{ kind: "doc", col: "term", ref: doc(db, T) }];
    (["teachers", "classes", "groups", "exam"] as const).forEach((n) => s.push({ kind: "query", col: n, q: c(n) }));
    if (staff) {
      (["students", "iep", "iepInvite", "versions", "lockLog", "staff"] as const).forEach((n) => s.push({ kind: "query", col: n, q: c(n) }));
      s.push({ kind: "query", col: "attendance", q: query(c("attendance"), where("date", ">=", since)) });
    } else if (tid) {
      s.push({ kind: "query", col: "students", q: query(c("students"), where("teacherIds", "array-contains", tid)) });
      s.push({ kind: "query", col: "students", q: query(c("students"), where("caseMgrId", "==", tid)) });
      s.push({ kind: "query", col: "attendance", q: query(c("attendance"), where("teacherId", "==", tid), where("date", ">=", since)) });
      s.push({ kind: "query", col: "iep", q: query(c("iep"), where("readers", "array-contains", tid)) });
      // 填空堂：邀請我的、我發的
      s.push({ kind: "query", col: "iepInvite", q: query(c("iepInvite"), where("teacherId", "==", tid)) });
      s.push({ kind: "query", col: "iepInvite", q: query(c("iepInvite"), where("readers", "array-contains", tid)) });
    }
    return s;
  }
  /** private 與段考的 private：一份一份讀（管理者全部、老師只有自己個管的） */
  function privateRefs(R: TermRecords): { col: Collection; id: string; ref: DocumentReference }[] {
    const out: { col: Collection; id: string; ref: DocumentReference }[] = [];
    Object.entries(R.students).forEach(([id, s]) => {
      if (staff || (tid && s.caseMgrId === tid)) out.push({ col: "privates", id, ref: ref("privates", id) });
    });
    if (staff)
      Object.keys(R.exam).forEach((eid) =>
        ["data", "notice"].forEach((d) => out.push({ col: "examPrivate", id: eid + "/" + d, ref: ref("examPrivate", eid + "/" + d) })),
      );
    return out;
  }

  let cache: Loaded = { records: emptyRecords(), revs: {} };

  function put1(L: Loaded, col: WritableCol | Collection, id: string, snap: DocumentSnapshot | null) {
    const k = revKey(col, id);
    if (!snap || !snap.exists()) return;
    const { doc: d, meta } = split(snap.data());
    if (col === "term") L.records.term = d;
    else (L.records[col] as Record<string, unknown>)[id] = d;
    L.revs[k] = meta;
  }

  async function load(): Promise<Loaded> {
    const L: Loaded = { records: emptyRecords(), revs: {} };
    await Promise.all(
      sources().map(async (s) => {
        if (s.kind === "doc") put1(L, "term", "", await getDoc(s.ref));
        else (await getDocs(s.q)).forEach((d) => put1(L, s.col, d.id, d));
      }),
    );
    await Promise.all(privateRefs(L.records).map(async (p) => put1(L, p.col, p.id, await getDoc(p.ref))));
    cache = L;
    return L;
  }

  function watch(next: (x: Loaded) => void, fail?: (e: Error) => void): Unsubscribe {
    const srcs = sources();
    const state: (DocumentSnapshot | QuerySnapshot | null)[] = srcs.map(() => null);
    const privSnaps = new Map<string, { unsub: FsUnsub; snap: DocumentSnapshot | null; col: Collection; id: string }>();
    let stopped = false;
    const emit = () => {
      if (stopped || state.some((x) => x === null)) return;
      const L: Loaded = { records: emptyRecords(), revs: {} };
      srcs.forEach((s, i) => {
        const x = state[i]!;
        if (s.kind === "doc") put1(L, "term", "", x as DocumentSnapshot);
        else (x as QuerySnapshot).forEach((d) => put1(L, s.col, d.id, d));
      });
      // private 的監看跟著學生名單增減
      const want = privateRefs(L.records);
      const keys = new Set(want.map((w) => w.col + "/" + w.id));
      privSnaps.forEach((v, k) => {
        if (!keys.has(k)) {
          v.unsub();
          privSnaps.delete(k);
        }
      });
      want.forEach((w) => {
        const k = w.col + "/" + w.id;
        if (privSnaps.has(k)) return;
        const entry = { unsub: () => {}, snap: null as DocumentSnapshot | null, col: w.col, id: w.id };
        privSnaps.set(k, entry);
        entry.unsub = onSnapshot(
          w.ref,
          (snap) => {
            entry.snap = snap;
            emit();
          },
          (e) => fail?.(e),
        );
      });
      if ([...privSnaps.values()].some((v) => v.snap === null)) return;
      privSnaps.forEach((v) => put1(L, v.col, v.id, v.snap));
      cache = L;
      next(L);
    };
    const unsubs = srcs.map((s, i) =>
      s.kind === "doc"
        ? onSnapshot(s.ref, (snap) => ((state[i] = snap), emit()), (e) => fail?.(e))
        : onSnapshot(s.q, (snap) => ((state[i] = snap), emit()), (e) => fail?.(e)),
    );
    return () => {
      stopped = true;
      unsubs.forEach((u) => u());
      privSnaps.forEach((v) => v.unsub());
    };
  }

  /** 交易：主文件＋衍生的學生／private 一起寫；每一份都檢查 rev */
  async function write<C extends WritableCol>(col: C, id: string, data: DocOf<C> | null, expectRev: number | null, merge?: Partial<DocOf<C>>) {
    if (readOnly) throw new RepoDeniedError("過渡期資料由舊版同步，這裡不能修改");
    if (staff && !cache.records.term) await load(); // 衍生欄位要用到全部的課程與學生
    return runTransaction(db, async (tx) => {
      const mainRef = ref(col, id);
      const snap = await tx.get(mainRef);
      const cur = snap.exists() ? split(snap.data()) : null;
      const curRev = cur ? cur.meta.rev : 0;
      if (expectRev != null && curRev !== expectRev)
        throw new RevConflictError(col, id, expectRev, cur ? { rev: cur.meta.rev, updatedBy: cur.meta.updatedBy } : null);
      let body = (merge ? { ...(cur?.doc || {}), ...merge } : data) as Record<string, unknown> | null;
      if (col === "students" && body) body = withLinks(cache.records, id, body as unknown as StudentDoc) as unknown as Record<string, unknown>;
      // 衍生的學生／private（只有管理者／編輯會改到課程、班級、學生）
      const extra =
        staff && (col === "groups" || col === "students" || col === "classes")
          ? linkPatches(applyWrite(cache.records, col, id, body))
          : [];
      const extraSnaps = await Promise.all(extra.map((p) => tx.get(ref(p.col, p.id))));
      const stamp = (rev: number) => ({ rev, updatedBy: scope.uid, updatedAt: serverTimestamp() });
      if (body == null) {
        if (col === "students") tx.delete(ref("privates", id));
        tx.delete(mainRef);
      } else tx.set(mainRef, { ...body, ...stamp(curRev + 1) });
      extra.forEach((p, i) => {
        const s = extraSnaps[i];
        if (col === "students" && body == null && p.id === id) return;
        const r = s.exists() ? +s.data().rev || 0 : 0;
        const d = s.exists() ? { ...split(s.data()).doc, ...p.data } : p.data;
        tx.set(ref(p.col, p.id), { ...d, ...stamp(r + 1) });
      });
      return body == null ? 0 : curRev + 1;
    });
  }

  /** 一批寫入：同一位學生的學生文件與 private 放同一個交易（規則的 getAfter 要看得到同一批的學生文件） */
  async function batch(ops: BatchOp[], opt: { chunk?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<BatchResult> {
    if (readOnly) throw new RepoDeniedError("過渡期資料由舊版同步，這裡不能修改");
    if (staff && !cache.records.term) await load();
    const all: BatchOp[] = ops.map((o) => ({ ...o }));
    // 刪學生時連 private 一起刪
    all.filter((o) => o.col === "students" && !o.data).forEach((o) => {
      if (!all.some((x) => x.col === "privates" && x.id === o.id)) all.push({ col: "privates", id: o.id, data: null, expectRev: null });
    });
    let after = cache.records;
    all.forEach((o) => (after = applyWrite(after, o.col, o.id, o.data)));
    let linked = 0;
    if (staff)
      linkPatches(after).forEach((p) => {
        const w = all.find((x) => x.col === p.col && x.id === p.id);
        if (w) {
          if (w.data) w.data = p.data as unknown as Record<string, unknown>;
        } else {
          all.push({ col: p.col, id: p.id, data: p.data as unknown as Record<string, unknown>, expectRev: null });
          linked++;
        }
      });
    // 分組：學生＋private 一組，其他一份一組；再裝進一個個交易
    const groups = new Map<string, BatchOp[]>();
    all.forEach((o) => {
      const k = o.col === "students" || o.col === "privates" ? "s:" + o.id : o.col + "/" + o.id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(o);
    });
    const size = Math.max(2, Math.min(opt.chunk || 300, 450));
    const chunks: BatchOp[][] = [];
    let cur: BatchOp[] = [];
    groups.forEach((g) => {
      if (cur.length + g.length > size) {
        chunks.push(cur);
        cur = [];
      }
      cur.push(...g);
    });
    if (cur.length) chunks.push(cur);
    let done = 0;
    const stamp = (rev: number) => ({ rev, updatedBy: scope.uid, updatedAt: serverTimestamp() });
    for (const ch of chunks) {
      try {
        await runTransaction(db, async (tx) => {
          const snaps = await Promise.all(ch.map((o) => tx.get(ref(o.col, o.id))));
          ch.forEach((o, i) => {
            const s = snaps[i];
            const r = s.exists() ? +s.data().rev || 0 : 0;
            if (o.expectRev != null && r !== o.expectRev)
              throw new RevConflictError(o.col, o.id, o.expectRev, s.exists() ? { rev: r, updatedBy: String(s.data().updatedBy || "") } : null);
          });
          ch.forEach((o, i) => {
            const s = snaps[i];
            if (!o.data) {
              if (s.exists()) tx.delete(ref(o.col, o.id));
              return;
            }
            const r = s.exists() ? +s.data().rev || 0 : 0;
            tx.set(ref(o.col, o.id), { ...o.data, ...stamp(r + 1) });
          });
        });
      } catch (e) {
        if (done && e instanceof Error) e.message += `（前面 ${done} 份已寫入）`;
        throw e;
      }
      done += ch.length;
      opt.onProgress?.(done, all.length);
    }
    return { written: ops.filter((o) => o.data).length, deleted: ops.filter((o) => !o.data).length, linked };
  }

  const repo: Repo = {
    kind: "firestore",
    scope,
    readOnly,
    load,
    watch,
    put: (col, id, data, expectRev) => write(col, id, data, expectRev),
    patch: (col, id, partial, expectRev) => write(col, id, null, expectRev, partial),
    async remove(col, id) {
      await write(col, id, null, null);
    },
    batch,
    async saveMyOff(off, expectRev) {
      if (!scope.tid) throw new RepoDeniedError("帳號沒有綁定名冊上的老師");
      return write("teachers", scope.tid, null, expectRev, { off });
    },
    async mark(date, gid, pid, studentId, rec) {
      if (readOnly) throw new RepoDeniedError("過渡期資料由舊版同步，這裡不能修改");
      const id = date + "_" + gid + "@" + pid;
      const r = ref("attendance", id);
      const g = cache.records.groups[gid] || ((await getDoc(ref("groups", gid))).data() as DocOf<"groups"> | undefined);
      await runTransaction(db, async (tx) => {
        const s = await tx.get(r);
        const cur = s.exists() ? split(s.data()) : null;
        const base: DocOf<"attendance"> = (cur?.doc as unknown as DocOf<"attendance"> | undefined) || {
          date,
          key: gid + "@" + pid,
          gid,
          pid,
          teacherId: g?.teacherId || "",
          marks: {},
          roster: g ? [...g.studentIds] : [],
          ...infoOf(g, cache.records.term?.periods, pid),
        };
        const marks = { ...(base.marks || {}) };
        if (rec) marks[studentId] = rec;
        else delete marks[studentId];
        tx.set(r, { ...base, marks, rev: (cur?.meta.rev || 0) + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
      });
    },
  };
  return repo;
}

export type { RevMap, TermRecords };

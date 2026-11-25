/* 記憶體版 Repo：範例資料、單機預覽、測試用。權限照 access.ts（和規則同一套），老師只拿到自己的學生。 */
import { demoData } from "../local";
import type { TermRecords, Versioned } from "../model";
import { visible, writeDenied } from "./access";
import { applyWrite, infoOf, linkPatches, withLinks } from "./derive";
import { splitD } from "./toCoreD";
import {
  RepoDeniedError,
  RevConflictError,
  revKey,
  type BatchResult,
  type DocOf,
  type Loaded,
  type Repo,
  type RepoScope,
  type RevMap,
  type WritableCol,
} from "./types";
import type { StudentDoc } from "../model";

/** 範例資料（core.defaultData() 排好課）的 records */
export function demoRecords(): TermRecords {
  return splitD(demoData());
}

const clone = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));

/** 共用的「資料庫」：同一份 store 可以給好幾個 scope 的 Repo（測試：管理者改、老師看） */
export interface MemoryStore {
  records: TermRecords;
  revs: RevMap;
  listeners: Set<() => void>;
}

export function memoryStore(records?: TermRecords): MemoryStore {
  const R = clone(records || demoRecords());
  const revs: RevMap = {};
  const at = new Date(0);
  const stamp = (k: string) => (revs[k] = { rev: 1, updatedBy: "seed", updatedAt: at });
  if (R.term) stamp("term");
  (Object.keys(R) as (keyof TermRecords)[]).forEach((c) => {
    if (c === "term") return;
    Object.keys(R[c] || {}).forEach((id) => stamp(c + "/" + id));
  });
  return { records: R, revs, listeners: new Set() };
}

export function createMemoryRepo(scope: RepoScope, init?: TermRecords | MemoryStore, opt?: { readOnly?: boolean }): Repo {
  const store: MemoryStore = init && "listeners" in init ? init : memoryStore(init as TermRecords | undefined);
  const readOnly = !!opt?.readOnly;

  const snapshot = (): Loaded => {
    const records = clone(visible(scope, store.records));
    const revs: RevMap = {};
    if (records.term) revs.term = store.revs.term;
    (Object.keys(records) as (keyof TermRecords)[]).forEach((c) => {
      if (c === "term") return;
      Object.keys(records[c] || {}).forEach((id) => {
        const k = c + "/" + id;
        if (store.revs[k]) revs[k] = store.revs[k];
      });
    });
    return { records, revs };
  };

  const current = (col: WritableCol, id: string): Record<string, unknown> | null => {
    if (col === "term") return (store.records.term as Record<string, unknown>) ?? null;
    return ((store.records[col] as Record<string, unknown>)[id] as Record<string, unknown>) ?? null;
  };
  const canSee = (col: WritableCol, id: string) => {
    if (col === "term") return true;
    const v = visible(scope, store.records)[col] as Record<string, unknown>;
    return !!v[id];
  };

  function commit(writes: { col: WritableCol; id: string; data: unknown | null }[]) {
    const now = new Date();
    writes.forEach((w) => {
      store.records = applyWrite(store.records, w.col, w.id, w.data == null ? null : clone(w.data));
      const k = revKey(w.col, w.id);
      if (w.data == null) {
        delete store.revs[k];
        if (w.col === "students") delete store.revs[revKey("privates", w.id)];
      } else store.revs[k] = { rev: (store.revs[k]?.rev || 0) + 1, updatedBy: scope.uid, updatedAt: now } as Versioned;
    });
    store.listeners.forEach((f) => f());
  }

  async function write<C extends WritableCol>(col: C, id: string, data: DocOf<C> | null, expectRev: number | null): Promise<number> {
    if (readOnly) throw new RepoDeniedError("過渡期資料由舊版同步，這裡不能修改");
    const before = current(col, id);
    if (before && !canSee(col, id)) throw new RepoDeniedError("沒有權限");
    const k = revKey(col, id);
    const cur = store.revs[k];
    if (expectRev != null && (cur?.rev || 0) !== expectRev)
      throw new RevConflictError(col, id, expectRev, cur ? { rev: cur.rev, updatedBy: cur.updatedBy } : null);
    let doc = data as Record<string, unknown> | null;
    if (col === "students" && doc) doc = withLinks(store.records, id, doc as unknown as StudentDoc) as unknown as Record<string, unknown>;
    const why = writeDenied(scope, store.records, col, id, before, doc);
    if (why) throw new RepoDeniedError(why);
    const after = applyWrite(store.records, col, id, doc);
    const extra = col === "groups" || col === "students" || col === "classes" ? linkPatches(after) : [];
    commit([{ col, id, data: doc }, ...extra.map((p) => ({ col: p.col as WritableCol, id: p.id, data: p.data }))]);
    return store.revs[k]?.rev || 0;
  }

  const repo: Repo = {
    kind: "memory",
    scope,
    readOnly,
    load: async () => snapshot(),
    watch(next) {
      const f = () => next(snapshot());
      store.listeners.add(f);
      f();
      return () => {
        store.listeners.delete(f);
      };
    },
    put: (col, id, data, expectRev) => write(col, id, data, expectRev),
    async patch(col, id, partial, expectRev) {
      const before = current(col, id);
      if (!before || !canSee(col, id)) throw new RepoDeniedError("找不到這份文件");
      return write(col, id, { ...before, ...partial } as DocOf<typeof col>, expectRev);
    },
    async remove(col, id) {
      await write(col, id, null, null);
    },
    async batch(ops, opt): Promise<BatchResult> {
      if (readOnly) throw new RepoDeniedError("過渡期資料由舊版同步，這裡不能修改");
      // 先全部檢查（rev、權限），一份不對就整批不寫
      for (const o of ops) {
        const cur = store.revs[revKey(o.col, o.id)];
        if (o.expectRev != null && (cur?.rev || 0) !== o.expectRev)
          throw new RevConflictError(o.col, o.id, o.expectRev, cur ? { rev: cur.rev, updatedBy: cur.updatedBy } : null);
        const before = current(o.col, o.id);
        if (before && !canSee(o.col, o.id)) throw new RepoDeniedError("沒有權限");
        const why = writeDenied(scope, store.records, o.col, o.id, before, o.data);
        if (why) throw new RepoDeniedError(why);
      }
      let after = store.records;
      ops.forEach((o) => (after = applyWrite(after, o.col, o.id, o.data == null ? null : clone(o.data))));
      const writes: { col: WritableCol; id: string; data: unknown | null }[] = ops.map((o) => ({ col: o.col, id: o.id, data: o.data }));
      let linked = 0;
      linkPatches(after).forEach((p) => {
        const w = writes.find((x) => x.col === p.col && x.id === p.id);
        if (w) {
          if (w.data) w.data = p.data;
        } else {
          writes.push({ col: p.col, id: p.id, data: p.data });
          linked++;
        }
      });
      commit(writes);
      opt?.onProgress?.(writes.length, writes.length);
      return { written: ops.filter((o) => o.data).length, deleted: ops.filter((o) => !o.data).length, linked };
    },
    async saveMyOff(off, expectRev) {
      if (!scope.tid) throw new RepoDeniedError("帳號沒有綁定名冊上的老師");
      return repo.patch("teachers", scope.tid, { off }, expectRev);
    },
    async mark(date, gid, pid, studentId, rec) {
      const id = date + "_" + gid + "@" + pid;
      const before = current("attendance", id) as DocOf<"attendance"> | null;
      const g = store.records.groups[gid];
      const base: DocOf<"attendance"> = before
        ? clone(before)
        : { date, key: gid + "@" + pid, gid, pid, teacherId: g?.teacherId || "", marks: {}, roster: g ? [...g.studentIds] : [], ...infoOf(g, store.records.term?.periods, pid) };
      if (rec) base.marks[studentId] = rec;
      else delete base.marks[studentId];
      await write("attendance", id, base, store.revs[revKey("attendance", id)]?.rev || 0);
    },
  };
  return repo;
}

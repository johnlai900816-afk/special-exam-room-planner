/* 資源班管理系統｜搬移與同步的核心（不依賴 firebase 套件；deps 注入，方便用假的資料庫在本機測）
   nx-migrate.js（nxMigrateLegacy）與 nx-sync.js（nxSyncFromLegacy…）共用。

   資料庫介面（firebase-admin 的 Firestore 剛好符合）：
     db.doc(path) → ref（ref.path、ref.get()）
     db.collection(path).get() → { docs:[{id, data()}] }
     db.getAll(...refs) → [snap{exists, id, data()}]
     db.batch() → { set(ref,data), delete(ref), commit() }
   deps.serverTime() → 寫進 updatedAt 的值（firebase-admin：FieldValue.serverTimestamp()） */
'use strict';
const NX = require('./nx-split');

const BY_SYNC = 'sync:legacy';
const BY_MIGRATE = 'migrate:legacy';
const LINK_DOC = 'nxLink/main'; // {sid, termId, mode, at}：搬移後才有；同步看這份決定寫到哪裡
const SYNC_STATE = 'sync'; // terms/{tid}/staff/sync：上次同步到的 rc/main 版本（避免舊事件蓋掉新資料）
const META = ['rev', 'updatedBy', 'updatedAt'];

const parseJsonDoc = (d) => {
  if (!d || typeof d.json !== 'string') return null;
  try { return JSON.parse(d.json); } catch (e) { return null; }
};
const stripMeta = (d) => {
  const o = {};
  Object.keys(d || {}).forEach((k) => {
    if (!META.includes(k)) o[k] = d[k];
  });
  return o;
};
const toMs = (t) => (t == null ? 0 : typeof t.toMillis === 'function' ? t.toMillis() : +t || 0);
/** rc/main 的版本：有 rev 用 rev，沒有用 at（毫秒）；比大小用 */
const verOf = (d) => (d ? { rev: Number.isInteger(d.rev) ? d.rev : -1, at: toMs(d.at) } : { rev: -1, at: 0 });
const newer = (a, b) => (a.rev !== b.rev && a.rev >= 0 && b.rev >= 0 ? a.rev > b.rev : a.at > b.at);

/** 舊位置的全部資料：rc/main（D）、rc/att-*（點名）、exams/main、exams/notice */
async function readLegacy(db) {
  const [main, ex, no] = await db.getAll(db.doc('rc/main'), db.doc('exams/main'), db.doc('exams/notice'));
  const D = main.exists ? parseJsonDoc(main.data()) : null;
  const rc = await db.collection('rc').get();
  const att = {};
  rc.docs.forEach((d) => {
    const m = /^att-(\d{4}-\d{2}-\d{2})$/.exec(d.id);
    if (m) att[m[1]] = d.data();
  });
  return {
    D,
    ver: main.exists ? verOf(main.data()) : verOf(null),
    exam: ex.exists ? parseJsonDoc(ex.data()) : null,
    notice: no.exists ? parseJsonDoc(no.data()) : null,
    att,
  };
}

/** 舊資料 → 新位置的全部 records（D 是 null 時回傳 null） */
function recordsFromLegacy(L) {
  if (!L.D) return null;
  const R = NX.split(L.D);
  Object.keys(L.att || {}).forEach((date) => Object.assign(R.attendance, NX.splitAttendance(date, L.att[date], L.D)));
  const E = NX.splitExam(L.exam, L.notice, 'main');
  R.exam = L.exam ? E.exam : {};
  R.examPrivate = E.examPrivate;
  return R;
}

/** 新位置現在的內容（只讀 want 裡會用到的集合；private 讀「現在有的學生」與「要寫的學生」兩邊） */
async function readExisting(db, sid, termId, want) {
  const T = 'schools/' + sid + '/terms/' + termId;
  const cur = NX.emptyRecords();
  const revs = {};
  const keep = (col, id, data) => {
    if (col === 'term') cur.term = stripMeta(data);
    else cur[col][id] = stripMeta(data);
    revs[col === 'term' ? 'term' : col + '/' + id] = { rev: +data.rev || 0, updatedBy: String(data.updatedBy || '') };
  };
  const [t] = await db.getAll(db.doc(T));
  if (t.exists) keep('term', '', t.data());
  const cols = ['teachers', 'classes', 'groups', 'students', 'attendance', 'iep', 'versions', 'lockLog', 'staff', 'exam'];
  await Promise.all(
    cols.map(async (c) => {
      const q = await db.collection(T + '/' + c).get();
      q.docs.forEach((d) => {
        if (c === 'staff' && d.id === SYNC_STATE) return; // 同步狀態不算資料
        keep(c, d.id, d.data());
      });
    }),
  );
  const pIds = [...new Set(Object.keys(cur.students).concat(Object.keys((want && want.students) || {})))];
  const eIds = [...new Set(Object.keys(cur.exam).concat(Object.keys((want && want.exam) || {})))];
  const pRefs = pIds.map((id) => ['privates', id]).concat(eIds.flatMap((e) => [['examPrivate', e + '/data'], ['examPrivate', e + '/notice']]));
  for (let i = 0; i < pRefs.length; i += 300) {
    const part = pRefs.slice(i, i + 300);
    const snaps = await db.getAll(...part.map(([c, id]) => db.doc(NX.pathOf(sid, termId, c, id))));
    snaps.forEach((s, j) => {
      if (s.exists) keep(part[j][0], part[j][1], s.data());
    });
  }
  return { records: cur, revs };
}

/** 寫入計畫的筆數：{ set:{集合:n}, del:{集合:n} } */
function countOps(ops) {
  const c = { set: {}, del: {} };
  ops.set.forEach((o) => (c.set[o.col] = (c.set[o.col] || 0) + 1));
  ops.del.forEach((o) => (c.del[o.col] = (c.del[o.col] || 0) + 1));
  c.total = ops.set.length + ops.del.length;
  return c;
}

/** 刪學生時 private 也刪；刪段考時 private 也刪 */
function withCascade(ops, cur) {
  const del = ops.del.slice();
  const has = new Set(del.map((d) => d.col + '/' + d.id));
  ops.del.forEach((d) => {
    if (d.col === 'students' && cur.privates && cur.privates[d.id] && !has.has('privates/' + d.id)) del.push({ col: 'privates', id: d.id });
  });
  return { set: ops.set, del };
}

/**
 * 照計畫寫進去：每份文件 rev = 現在的 rev + 1（沒有就 1），updatedBy = by，updatedAt = 伺服器時間。
 * revs：現在的 rev（readExisting 的結果，或 null＝自己讀）。
 * 回傳 { written, deleted, conflicts }：conflicts＝新版那邊有人改過（updatedBy 不是同步／搬移）又被舊版蓋掉的文件。
 */
async function applyOps(db, deps, sid, termId, ops, by, revs) {
  const path = (o) => NX.pathOf(sid, termId, o.col, o.id);
  let cur = revs;
  if (!cur) {
    cur = {};
    const refs = ops.set.map((o) => db.doc(path(o)));
    for (let i = 0; i < refs.length; i += 300) {
      const snaps = await db.getAll(...refs.slice(i, i + 300));
      snaps.forEach((s, j) => {
        const o = ops.set[i + j];
        if (s.exists) cur[o.col === 'term' ? 'term' : o.col + '/' + o.id] = { rev: +s.data().rev || 0, updatedBy: String(s.data().updatedBy || '') };
      });
    }
  }
  const conflicts = [];
  const writes = [];
  ops.set.forEach((o) => {
    const k = o.col === 'term' ? 'term' : o.col + '/' + o.id;
    const r = cur[k];
    if (r && r.updatedBy && r.updatedBy !== BY_SYNC && r.updatedBy !== BY_MIGRATE) conflicts.push(k);
    writes.push(['set', db.doc(path(o)), Object.assign({}, o.data, { rev: (r ? r.rev : 0) + 1, updatedBy: by, updatedAt: deps.serverTime() })]);
  });
  ops.del.forEach((o) => writes.push(['delete', db.doc(path(o))]));
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    writes.slice(i, i + 400).forEach((w) => (w[0] === 'set' ? b.set(w[1], w[2]) : b.delete(w[1])));
    await b.commit();
  }
  return { written: ops.set.length, deleted: ops.del.length, conflicts };
}

/* ───── 同步（rc/main、rc/att-*、exams/main、exams/notice 寫入時觸發） ───── */

/** rc/main 前後兩版 → 要寫的文件。before/after 是 Firestore 文件內容（{json, by, at, rev}）或 null */
function planMain(before, after) {
  const Da = after ? parseJsonDoc(after) : null;
  if (!Da) return null; // 刪除或壞掉的 JSON：不動新位置（rc/main 規則本來就不能刪）
  const Db = before ? parseJsonDoc(before) : null;
  const A = NX.split(Da);
  const B = Db ? NX.split(Db) : NX.emptyRecords();
  // 點名、段考由各自的觸發處理；這裡只比 rc/main 拆出來的集合
  const cols = ['teachers', 'classes', 'groups', 'students', 'privates', 'iep', 'versions', 'lockLog', 'staff'];
  return { ops: NX.diff(B, A, ['term'].concat(cols)), ver: verOf(after), D: Da };
}

/** rc/att-日期 前後兩版 → 要寫的點名文件。groups：{gid: teacherId}（從新位置的 groups 讀） */
function planAttendance(date, before, after, groupTeacher) {
  const D = { groups: Object.keys(groupTeacher || {}).map((id) => ({ id, teacher: groupTeacher[id] })) };
  const A = { attendance: NX.splitAttendance(date, after || {}, D) };
  const B = { attendance: NX.splitAttendance(date, before || {}, D) };
  return NX.diff(B, A, ['attendance']);
}

/** exams/main 或 exams/notice 前後兩版 → 要寫的段考文件 */
function planExam(which, before, after) {
  const pa = after ? parseJsonDoc(after) : null;
  const pb = before ? parseJsonDoc(before) : null;
  const A = which === 'notice' ? NX.splitExam(null, pa, 'main') : NX.splitExam(pa, undefined, 'main');
  const B = which === 'notice' ? NX.splitExam(null, pb, 'main') : NX.splitExam(pb, undefined, 'main');
  return NX.diff(B, A, ['exam', 'examPrivate']);
}

module.exports = {
  BY_SYNC,
  BY_MIGRATE,
  LINK_DOC,
  SYNC_STATE,
  parseJsonDoc,
  stripMeta,
  verOf,
  newer,
  readLegacy,
  recordsFromLegacy,
  readExisting,
  countOps,
  withCascade,
  applyOps,
  planMain,
  planAttendance,
  planExam,
};

/* 資源班管理系統｜過渡期的單向同步：舊位置 → 新位置（Cloud Functions v2 Firestore 觸發，asia-east1）
   nxSyncFromLegacy       rc/{docId} 寫入時（main＝名冊與排課；att-YYYY-MM-DD＝點名；presence 不管）
   nxSyncExamFromLegacy   exams/{docId} 寫入時（main、notice）

   只有 nxLink/main 存在而且 mode=='legacy' 時才同步（nxMigrateLegacy 寫的；切換後把 mode 改成 'native' 就停）。
   比對方式（functions/nx-core.js planMain）：
     1. 前一版與這一版的 rc/main 各自用 nx-split.split 拆開，再用 nx-split.diff 一份一份比（排好 key 的 JSON 一樣就跳過）。
     2. 只寫有變的文件，rev = 新位置現在的 rev + 1，updatedBy = 'sync:legacy'；舊版刪掉的學生／課程…在新位置也刪（學生連 private）。
     3. 防止亂序：terms/{tid}/staff/sync 記著上次同步到的 rc/main 版本（rev，沒有 rev 用 at）。
        - 這次的「之後」比記錄舊 → 不做（較新的已經處理過）
        - 記錄剛好等於這次的「之前」→ 照第 1 步只寫差異（快）
        - 其他（中間漏了事件）→ 拿這次的「之後」和新位置現在的內容整個比一次（慢但一定對）
   新版那邊有人改過、又被舊版蓋掉的文件記在 auditLogs（action: nxSyncConflict）。過渡期新版是唯讀，正常不會發生。 */
'use strict';
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const NX = require('./nx-split');
const C = require('./nx-core');

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const deps = { serverTime: () => admin.firestore.FieldValue.serverTimestamp() };
const OPTS = { region: 'asia-east1', memory: '512MiB', timeoutSeconds: 300, maxInstances: 1 /* 一次一個，減少亂序 */ };

async function link() {
  const s = await db().doc(C.LINK_DOC).get();
  const d = s.exists ? s.data() : null;
  return d && d.mode === 'legacy' && d.sid && d.termId ? d : null;
}
const dataOf = (snap) => (snap && snap.exists ? snap.data() : null);

async function logConflicts(sid, conflicts, src) {
  if (!conflicts.length) return;
  await db().collection('auditLogs').add({
    sid, by: C.BY_SYNC, action: 'nxSyncConflict', target: src, detail: { docs: conflicts.slice(0, 100), n: conflicts.length }, at: deps.serverTime(),
  });
}

async function syncMain(L, before, after) {
  const plan = C.planMain(before, after);
  if (!plan) return { skipped: 'no-data' };
  const stRef = db().doc(NX.pathOf(L.sid, L.termId, 'staff', C.SYNC_STATE));
  const st = dataOf(await stRef.get());
  let last = null;
  try { last = st && st.json ? JSON.parse(st.json) : null; } catch (e) { last = null; }
  if (last && C.newer(last, plan.ver)) return { skipped: 'stale' };
  let ops = plan.ops;
  let revs = null;
  const vb = C.verOf(before);
  if (!last || last.rev !== vb.rev || last.at !== vb.at) {
    // 漏了事件：整個和新位置現在的內容比
    const want = NX.split(plan.D);
    const ex = await C.readExisting(db(), L.sid, L.termId, want);
    const cols = ['teachers', 'classes', 'groups', 'students', 'privates', 'iep', 'versions', 'lockLog', 'staff'];
    ops = C.withCascade(NX.diff(ex.records, want, ['term'].concat(cols)), ex.records);
    revs = ex.revs;
  }
  const res = await C.applyOps(db(), deps, L.sid, L.termId, ops, C.BY_SYNC, revs);
  await stRef.set({ json: JSON.stringify(plan.ver), rev: ((st && st.rev) || 0) + 1, updatedBy: C.BY_SYNC, updatedAt: deps.serverTime() });
  await logConflicts(L.sid, res.conflicts, 'rc/main');
  return res;
}

async function syncAtt(L, date, before, after) {
  const gq = await db().collection('schools/' + L.sid + '/terms/' + L.termId + '/groups').get();
  const gt = {};
  gq.docs.forEach((d) => (gt[NX.decId(d.id)] = String(d.data().teacherId || '')));
  const ops = C.planAttendance(date, before, after, gt);
  const res = await C.applyOps(db(), deps, L.sid, L.termId, ops, C.BY_SYNC, null);
  await logConflicts(L.sid, res.conflicts, 'rc/att-' + date);
  return res;
}

const nxSyncFromLegacy = onDocumentWritten({ ...OPTS, document: 'rc/{docId}' }, async (event) => {
  const id = event.params.docId;
  const m = /^att-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (id !== 'main' && !m) return;
  const L = await link();
  if (!L) return;
  const before = dataOf(event.data && event.data.before);
  const after = dataOf(event.data && event.data.after);
  const res = id === 'main' ? await syncMain(L, before, after) : await syncAtt(L, m[1], before, after);
  console.log('nxSyncFromLegacy', id, JSON.stringify(res && { w: res.written, d: res.deleted, c: res.conflicts && res.conflicts.length, s: res.skipped }));
});

const nxSyncExamFromLegacy = onDocumentWritten({ ...OPTS, document: 'exams/{docId}' }, async (event) => {
  const id = event.params.docId;
  if (id !== 'main' && id !== 'notice') return;
  const L = await link();
  if (!L) return;
  const ops = C.planExam(id, dataOf(event.data && event.data.before), dataOf(event.data && event.data.after));
  const res = await C.applyOps(db(), deps, L.sid, L.termId, ops, C.BY_SYNC, null);
  await logConflicts(L.sid, res.conflicts, 'exams/' + id);
});

module.exports = { nxSyncFromLegacy, nxSyncExamFromLegacy, _internal: { syncMain, syncAtt } };

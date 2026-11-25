/* 資源班管理系統｜舊位置 → 新位置的搬移（Cloud Functions v2，Node 22，asia-east1）
   nxMigrateLegacy（callable）
     誰能叫：舊名單 config/access.admin（主持人，Google 驗證過的信箱）或這間學校 claims 是 admin 的人
     輸入：{ sid, termId, name?, dryRun?=true, prune?=true }
     做什麼：讀 rc/main、rc/att-*、exams/main、exams/notice → functions/nx-split.js 拆開 →
            和新位置 schools/{sid}/terms/{termId}/… 現在的內容比對 → 只寫有變的（rev+1）、刪多出來的（prune）
     可以重複叫（冪等）：第二次叫，資料沒變就是 0 筆。dryRun（預設）只回傳筆數不寫。
     寫完：schools/{sid} {name, currentTerm, mode:'legacy'}、nxLink/main {sid, termId}（同步從這時候開始）、auditLogs。
   舊文件一律不動。 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const NX = require('./nx-split');
const C = require('./nx-core');

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const OPTS = { region: 'asia-east1', timeoutSeconds: 540, memory: '1GiB', enforceAppCheck: false /* 上線前改 true */ };
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const norm = (e) => String(e || '').trim().toLowerCase();

/** 舊名單的主持人，或這間學校的 admin（claims） */
async function requireLegacyAdmin(req, sid) {
  const t = req.auth && req.auth.token;
  if (!t || t.email_verified !== true) throw new HttpsError('unauthenticated', '請用已驗證的 Google 帳號登入');
  if (t.sid === sid && t.role === 'admin') return t;
  const a = await db().doc('config/access').get();
  if (a.exists && norm(a.data().admin) && norm(a.data().admin) === norm(t.email)) return t;
  throw new HttpsError('permission-denied', '只有舊名單的主持人或這間學校的管理者可以搬移');
}

async function migrate(sid, termId, opt) {
  const L = await C.readLegacy(db());
  const want = C.recordsFromLegacy(L);
  if (!want) throw new HttpsError('failed-precondition', 'rc/main 沒有資料或格式不對');
  const { records: cur, revs } = await C.readExisting(db(), sid, termId, want);
  let ops = NX.diff(cur, want);
  if (!opt.prune) ops = { set: ops.set, del: [] };
  ops = C.withCascade(ops, cur);
  const counts = C.countOps(ops);
  const sizes = {
    students: Object.keys(want.students).length,
    teachers: Object.keys(want.teachers).length,
    groups: Object.keys(want.groups).length,
    classes: Object.keys(want.classes).length,
    attendance: Object.keys(want.attendance).length,
    iep: Object.keys(want.iep).length,
  };
  if (opt.dryRun) return { dryRun: true, counts, sizes, unchanged: counts.total === 0 };
  const res = await C.applyOps(db(), { serverTime: () => admin.firestore.FieldValue.serverTimestamp() }, sid, termId, ops, C.BY_MIGRATE, revs);
  return { dryRun: false, counts, sizes, conflicts: res.conflicts, ver: L.ver, title: L.D.title || '' };
}

const nxMigrateLegacy = onCall(OPTS, async (req) => {
  const d = req.data || {};
  const sid = String(d.sid || '');
  const termId = String(d.termId || '');
  if (!ID_RE.test(sid) || !ID_RE.test(termId)) throw new HttpsError('invalid-argument', 'sid、termId 只能用小寫英數、-、_（2–40 字）');
  const me = await requireLegacyAdmin(req, sid);
  const dryRun = d.dryRun !== false;
  const out = await migrate(sid, termId, { dryRun, prune: d.prune !== false });
  if (!dryRun) {
    const FV = admin.firestore.FieldValue;
    await db().doc('schools/' + sid).set({ name: String(d.name || out.title || sid).slice(0, 100), currentTerm: termId, mode: 'legacy' }, { merge: true });
    await db().doc(C.LINK_DOC).set({ sid, termId, mode: 'legacy', by: norm(me.email), at: FV.serverTimestamp() });
    await db()
      .doc(NX.pathOf(sid, termId, 'staff', C.SYNC_STATE))
      .set({ json: JSON.stringify(out.ver), rev: 1, updatedBy: C.BY_MIGRATE, updatedAt: FV.serverTimestamp() });
    await db().collection('auditLogs').add({
      sid, by: norm(me.email), action: 'nxMigrateLegacy', target: termId, detail: { counts: out.counts, conflicts: out.conflicts.length }, at: FV.serverTimestamp(),
    });
  }
  return out;
});

module.exports = { nxMigrateLegacy, _internal: { migrate, requireLegacyAdmin } };

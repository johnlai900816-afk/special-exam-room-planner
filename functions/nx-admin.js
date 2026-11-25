/* 資源班管理系統｜管理者端用的 Cloud Functions（v2，Node 22，asia-east1）
     nxLinkStatus({sid})               admin／editor：搬移與同步的狀態（nxLink/main 只有 Function 讀得到）
     nxSetCurrentTerm({sid, termId})   admin：把 schools/{sid}.currentTerm 換到新學期（新學期的文件由新版用戶端先寫好）。
                                       過渡期（nxLink.mode=='legacy'）不能換：舊版會繼續同步到原本的學期。
   純邏輯在 nx-admin-core.js（web/test/nx-admin.test.ts）。每一個都寫 auditLogs。 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const C = require('./nx-admin-core');
const NC = require('./nx-core');
const NX = require('./nx-split');

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const OPTS = { region: 'asia-east1', enforceAppCheck: false /* 上線前改 true */ };
const norm = (e) => String(e || '').trim().toLowerCase();

function staffOf(req, sid, adminOnly) {
  const t = req.auth && req.auth.token;
  if (!t || !t.email || t.email_verified !== true) throw new HttpsError('unauthenticated', '請用已驗證的 Google 帳號登入');
  if (!C.ID_RE.test(String(sid || ''))) throw new HttpsError('invalid-argument', '學校代碼只能用小寫英數、-、_');
  const ok = t.sid === sid && (t.role === 'admin' || (!adminOnly && t.role === 'editor'));
  if (!ok) throw new HttpsError('permission-denied', adminOnly ? '只有這間學校的管理者可以做這件事' : '只有管理者或編輯可以看');
  return t;
}

const nxLinkStatus = onCall(OPTS, async (req) => {
  const sid = String((req.data || {}).sid || '');
  staffOf(req, sid, false);
  const [l, s] = await Promise.all([db().doc(NC.LINK_DOC).get(), db().doc('schools/' + sid).get()]);
  const link = l.exists ? l.data() : null;
  const school = s.exists ? s.data() : null;
  let sync = null;
  if (link && link.sid === sid && link.termId) {
    const y = await db().doc(NX.pathOf(sid, link.termId, 'staff', NC.SYNC_STATE)).get();
    sync = y.exists ? y.data() : null;
  }
  return C.linkView(sid, link, school, sync);
});

const nxSetCurrentTerm = onCall(OPTS, async (req) => {
  const d = req.data || {};
  const sid = String(d.sid || '');
  const termId = String(d.termId || '');
  const me = staffOf(req, sid, true);
  const [l, s, t] = await Promise.all([db().doc(NC.LINK_DOC).get(), db().doc('schools/' + sid).get(), db().doc(`schools/${sid}/terms/${termId}`).get()]);
  const link = l.exists && l.data().sid === sid ? l.data() : null;
  const why = C.switchTermDenied(link, s.exists ? s.data() : null, termId, t.exists);
  if (why) throw new HttpsError('failed-precondition', why);
  const from = s.exists ? String(s.data().currentTerm || '') : '';
  await db().doc('schools/' + sid).set({ currentTerm: termId }, { merge: true });
  await db().collection('auditLogs').add({
    sid, by: norm(me.email), action: 'nxSetCurrentTerm', target: termId, detail: { from }, at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, from, termId };
});

module.exports = { nxLinkStatus, nxSetCurrentTerm };

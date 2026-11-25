/* 資源班管理系統｜新位置的帳號與角色（Cloud Functions v2，Node 22，asia-east1）
   改寫自 functions/roles.js：claims 改成 { sid, role, tid }（role 多了 editor；tid＝名冊老師 id），
   第一位管理者改由舊名單的主持人（config/access.admin）自己領取，不必再用服務帳號跑腳本。
   成員文件 schools/{sid}/members/{uid}、邀請 schools/{sid}/invites/{emailLower} 只有這裡寫；每個動作寫 auditLogs。

   匯出：
     nxBootstrap             主持人（舊名單 admin，Google 驗證過的信箱）領取這間學校的 admin；學校已有其他 admin 時拒絕
     nxSetClaims             admin 設定某人（uid 或 email，要登入過）的角色與 tid
     nxCreateInvite          admin 邀請一個信箱（還沒登入過也可以），預設 14 天
     nxAcceptInvite          被邀請的人登入後領取角色（給 sid 直接找；不給就用 collection group 查 email）
     nxRevokeMember          admin 停用某人：清 claims、撤銷 refresh token、active:false
     nxImportLegacyMembers   admin 把舊名單 config/access 轉成邀請（dryRun 預設 true）：
                             主持人→admin、編輯→editor、檢視且 bind 了老師→teacher（tid）、其他檢視→viewer
   用戶端改完角色要 getIdToken(true)；members/{uid}.claimsAt 會更新，畫面可以監看它自動刷新。 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;
const OPTS = { region: 'asia-east1', enforceAppCheck: false /* 上線前改 true */ };
const ROLES = ['admin', 'editor', 'teacher', 'viewer'];
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
const norm = (e) => String(e || '').trim().toLowerCase();

async function audit(sid, by, action, target, detail) {
  await db().collection('auditLogs').add({ sid: sid || '', by: by || '', action, target: target || '', detail: detail || {}, at: FV().serverTimestamp() });
}
function verified(req) {
  const t = req.auth && req.auth.token;
  if (!t || !t.email || t.email_verified !== true) throw new HttpsError('unauthenticated', '請用已驗證的 Google 帳號登入');
  return t;
}
function checkSid(sid) {
  if (!ID_RE.test(String(sid || ''))) throw new HttpsError('invalid-argument', '學校代碼只能用小寫英數、-、_');
}
function requireAdmin(req, sid) {
  const t = verified(req);
  checkSid(sid);
  if (t.role !== 'admin' || t.sid !== sid) throw new HttpsError('permission-denied', '只有這間學校的管理者可以做這件事');
  return t;
}
function checkRole(role, tid) {
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', '角色只能是 admin、editor、teacher、viewer');
  if (role === 'teacher' && !tid) throw new HttpsError('invalid-argument', '老師一定要綁定名冊上的老師（tid）');
  if (tid != null && tid !== '' && (typeof tid !== 'string' || tid.length > 60 || tid.includes('/'))) throw new HttpsError('invalid-argument', 'tid 格式不對');
}

/** claims＋成員文件。claims 一律只有 {sid, role, tid?}（會蓋掉這個帳號原本的 claims） */
async function applyRole(sid, user, role, tid, by) {
  const claims = { sid, role };
  if (tid) claims.tid = String(tid);
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await db()
    .doc(`schools/${sid}/members/${user.uid}`)
    .set(
      { email: norm(user.email), role, teacherId: tid ? String(tid) : FV().delete(), active: true, updatedBy: by, claimsAt: FV().serverTimestamp() },
      { merge: true },
    );
  return claims;
}
async function adminCount(sid) {
  const q = await db().collection(`schools/${sid}/members`).where('role', '==', 'admin').where('active', '==', true).get();
  return q.size;
}

const nxBootstrap = onCall(OPTS, async (req) => {
  const t = verified(req);
  const { sid, name } = req.data || {};
  checkSid(sid);
  const acc = await db().doc('config/access').get();
  const host = acc.exists ? norm(acc.data().admin) : '';
  if (!host || host !== norm(t.email)) throw new HttpsError('permission-denied', '只有舊名單的主持人可以建立第一位管理者');
  const q = await db().collection(`schools/${sid}/members`).where('role', '==', 'admin').where('active', '==', true).get();
  if (q.docs.some((d) => d.id !== req.auth.uid)) throw new HttpsError('already-exists', '這間學校已經有管理者，請找他邀請你');
  const bind = (acc.data().bind || {})[host] || '';
  await db().doc(`schools/${sid}`).set({ name: String(name || sid).slice(0, 100) }, { merge: true });
  const user = await admin.auth().getUser(req.auth.uid);
  const claims = await applyRole(sid, user, 'admin', bind, host);
  await audit(sid, host, 'nxBootstrap', host, { tid: bind || null });
  return { sid, claims };
});

const nxSetClaims = onCall(OPTS, async (req) => {
  const { sid, email, uid, role, tid } = req.data || {};
  const me = requireAdmin(req, sid);
  checkRole(role, tid);
  let user;
  try {
    user = uid ? await admin.auth().getUser(String(uid)) : await admin.auth().getUserByEmail(norm(email));
  } catch (e) {
    throw new HttpsError('not-found', '這個帳號還沒登入過，請改用邀請');
  }
  const cur = (await db().doc(`schools/${sid}/members/${user.uid}`).get()).data();
  if (cur && cur.role === 'admin' && cur.active !== false && role !== 'admin' && (await adminCount(sid)) <= 1)
    throw new HttpsError('failed-precondition', '至少要留一位管理者');
  const claims = await applyRole(sid, user, role, tid, norm(me.email));
  await audit(sid, norm(me.email), 'nxSetClaims', norm(user.email), { from: cur ? cur.role : null, to: role, tid: tid || null });
  return { uid: user.uid, claims };
});

async function invite(sid, email, role, tid, by, days) {
  const e = norm(email);
  if (!EMAIL_RE.test(e)) throw new HttpsError('invalid-argument', '信箱格式不對');
  const exp = new Date(Date.now() + Math.min(Math.max(+days || 14, 1), 60) * 864e5);
  await db()
    .doc(`schools/${sid}/invites/${e}`)
    .set({ email: e, role, teacherId: tid || null, by, exp: admin.firestore.Timestamp.fromDate(exp) });
  return { email: e, exp: exp.toISOString() };
}

const nxCreateInvite = onCall(OPTS, async (req) => {
  const { sid, email, role, tid, days } = req.data || {};
  const me = requireAdmin(req, sid);
  checkRole(role, tid);
  const out = await invite(sid, email, role, tid, norm(me.email), days);
  await audit(sid, norm(me.email), 'nxCreateInvite', out.email, { role, tid: tid || null, exp: out.exp });
  return out;
});

const nxAcceptInvite = onCall(OPTS, async (req) => {
  const t = verified(req);
  const e = norm(t.email);
  const sid = req.data && req.data.sid;
  let snap = null;
  if (sid) {
    checkSid(sid);
    const s = await db().doc(`schools/${sid}/invites/${e}`).get();
    snap = s.exists ? s : null;
  } else {
    const q = await db().collectionGroup('invites').where('email', '==', e).get();
    snap = q.docs.find((d) => d.data().exp && d.data().exp.toMillis() > Date.now()) || null;
  }
  if (!snap || !snap.data().exp || snap.data().exp.toMillis() <= Date.now()) throw new HttpsError('not-found', '沒有找到有效的邀請，請找特教組長');
  const s = snap.ref.parent.parent.id;
  const { role, teacherId, by } = snap.data();
  checkRole(role, teacherId);
  const user = await admin.auth().getUser(req.auth.uid);
  const claims = await applyRole(s, user, role, teacherId, by || 'invite');
  await snap.ref.delete();
  await audit(s, e, 'nxAcceptInvite', e, { role, tid: teacherId || null, invitedBy: by || null });
  return { sid: s, claims };
});

const nxRevokeMember = onCall(OPTS, async (req) => {
  const { sid, uid } = req.data || {};
  const me = requireAdmin(req, sid);
  const ref = db().doc(`schools/${sid}/members/${String(uid || '')}`);
  const cur = (await ref.get()).data();
  if (!cur) throw new HttpsError('not-found', '找不到這位成員');
  if (cur.role === 'admin' && (await adminCount(sid)) <= 1) throw new HttpsError('failed-precondition', '至少要留一位管理者');
  await admin.auth().setCustomUserClaims(uid, null);
  await admin.auth().revokeRefreshTokens(uid);
  await ref.set({ active: false, updatedBy: norm(me.email), claimsAt: FV().serverTimestamp() }, { merge: true });
  await audit(sid, norm(me.email), 'nxRevokeMember', cur.email, { role: cur.role });
  return { ok: true };
});

/** 舊名單 → 新角色（純函式，測試用） */
function legacyRoles(access) {
  const a = access || {};
  const host = norm(a.admin);
  const viewers = new Set((a.viewers || []).map(norm));
  const bind = {};
  Object.keys(a.bind || {}).forEach((k) => (bind[norm(k)] = a.bind[k]));
  return [...new Set((a.emails || []).map(norm).concat(host ? [host] : []))].filter(Boolean).map((e) => {
    if (e === host) return { email: e, role: 'admin', tid: bind[e] || '' };
    if (!viewers.has(e)) return { email: e, role: 'editor', tid: bind[e] || '' };
    return bind[e] ? { email: e, role: 'teacher', tid: bind[e] } : { email: e, role: 'viewer', tid: '' };
  });
}

const nxImportLegacyMembers = onCall(OPTS, async (req) => {
  const { sid, dryRun } = req.data || {};
  const me = requireAdmin(req, sid);
  const acc = await db().doc('config/access').get();
  const list = legacyRoles(acc.exists ? acc.data() : null).filter((x) => x.email !== norm(me.email));
  if (dryRun !== false) return { dryRun: true, list };
  for (const x of list) await invite(sid, x.email, x.role, x.tid, norm(me.email), 30);
  await audit(sid, norm(me.email), 'nxImportLegacyMembers', sid, { n: list.length });
  return { dryRun: false, list };
});

module.exports = {
  nxBootstrap,
  nxSetClaims,
  nxCreateInvite,
  nxAcceptInvite,
  nxRevokeMember,
  nxImportLegacyMembers,
  _internal: { applyRole, legacyRoles, audit },
};

/* 資源班管理系統｜帳號與角色（Cloud Functions v2，Node 20，asia-east1）
   角色放在 Firebase Auth custom claims：{ sid, role, teacherId }
     sid        學校 id（schools/{sid}）
     role       'admin' | 'teacher' | 'viewer'
     teacherId  名冊上的老師（schools/{sid}/terms/{tid}/teachers/{id} 的 id）；沒有就省略
   同時寫 schools/{sid}/members/{uid}，讓規則與畫面查得到；成員文件只有這裡（Admin SDK）寫得進去。
   每一個動作都寫一筆 auditLogs。

   匯出（請在 functions/index.js 合併）：
     setMemberRole  callable：管理者設定某人的角色與老師綁定
     createInvite   callable：管理者邀請一個信箱（還沒登入過的人也可以）
     acceptInvite   callable：被邀請的人登入後呼叫，領取角色
     revokeMember   callable：管理者停用某人（清掉 claims、active:false）
   第一位管理者用 scripts/bootstrap-admin.js 建立（手動、用管理員憑證執行），不再是「第一個登入的人」。

   需要的套件：firebase-functions (v6+)、firebase-admin (v12+)。用戶端改完角色後要 getIdToken(true) 才會拿到新 claims；
   members/{uid}.claimsAt 會更新，畫面可以監看它來自動刷新。 */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const OPTS = { region: 'asia-east1', enforceAppCheck: false /* 上線前改成 true（App Check） */ };
const ROLES = ['admin', 'teacher', 'viewer'];
const norm = (e) => String(e || '').trim().toLowerCase();

async function audit(sid, by, action, target, detail) {
  await db().collection('auditLogs').add({
    sid: sid || '',
    by: by || '',
    action,
    target: target || '',
    detail: detail || {},
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** 呼叫者必須是這間學校的管理者 */
function requireAdmin(req, sid) {
  const t = req.auth && req.auth.token;
  if (!t) throw new HttpsError('unauthenticated', '請先登入');
  if (t.role !== 'admin' || t.sid !== sid) throw new HttpsError('permission-denied', '只有這間學校的管理者可以做這件事');
  return t;
}

function checkRole(role) {
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', '角色只能是 admin、teacher、viewer');
}

/** 把角色寫進 claims＋成員文件（內部共用） */
async function applyRole(sid, user, role, teacherId, by) {
  const claims = { sid, role };
  if (teacherId) claims.teacherId = String(teacherId);
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await db()
    .doc(`schools/${sid}/members/${user.uid}`)
    .set(
      {
        email: norm(user.email),
        role,
        teacherId: teacherId ? String(teacherId) : admin.firestore.FieldValue.delete(),
        active: true,
        updatedBy: by,
        claimsAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return claims;
}

/** 這間學校還剩幾位有效的管理者（不能把最後一位降級或停用） */
async function adminCount(sid) {
  const q = await db().collection(`schools/${sid}/members`).where('role', '==', 'admin').where('active', '==', true).get();
  return q.size;
}

const setMemberRole = onCall(OPTS, async (req) => {
  const { sid, email, uid, role, teacherId } = req.data || {};
  const me = requireAdmin(req, sid);
  checkRole(role);
  let user;
  try {
    user = uid ? await admin.auth().getUser(uid) : await admin.auth().getUserByEmail(norm(email));
  } catch (e) {
    throw new HttpsError('not-found', '這個帳號還沒登入過，請改用「邀請」');
  }
  const cur = (await db().doc(`schools/${sid}/members/${user.uid}`).get()).data();
  if (cur && cur.role === 'admin' && role !== 'admin' && (await adminCount(sid)) <= 1)
    throw new HttpsError('failed-precondition', '至少要留一位管理者');
  const claims = await applyRole(sid, user, role, teacherId, me.email);
  await audit(sid, me.email, 'setMemberRole', user.email, { from: cur ? cur.role : null, to: role, teacherId: teacherId || null });
  return { uid: user.uid, claims };
});

const createInvite = onCall(OPTS, async (req) => {
  const { sid, email, role, teacherId, days } = req.data || {};
  const me = requireAdmin(req, sid);
  checkRole(role);
  const e = norm(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpsError('invalid-argument', '信箱格式不對');
  const exp = new Date(Date.now() + Math.min(Math.max(+days || 14, 1), 60) * 864e5);
  await db()
    .doc(`schools/${sid}/invites/${e}`)
    .set({ email: e, role, teacherId: teacherId || null, by: me.email, exp: admin.firestore.Timestamp.fromDate(exp) });
  await audit(sid, me.email, 'createInvite', e, { role, teacherId: teacherId || null, exp: exp.toISOString() });
  return { email: e, exp: exp.toISOString() };
});

/** 被邀請的人第一次登入後呼叫。用 Google 驗證過的信箱找邀請（collection group 查詢 invites.email） */
const acceptInvite = onCall(OPTS, async (req) => {
  const t = req.auth && req.auth.token;
  if (!t || !t.email || t.email_verified !== true) throw new HttpsError('unauthenticated', '請用已驗證的 Google 帳號登入');
  const e = norm(t.email);
  const q = await db().collectionGroup('invites').where('email', '==', e).get();
  const now = Date.now();
  const inv = q.docs.find((d) => d.data().exp && d.data().exp.toMillis() > now);
  if (!inv) throw new HttpsError('not-found', '沒有找到有效的邀請，請找特教組長');
  const sid = inv.ref.parent.parent.id;
  const { role, teacherId, by } = inv.data();
  checkRole(role);
  const user = await admin.auth().getUser(req.auth.uid);
  const claims = await applyRole(sid, user, role, teacherId, by || 'invite');
  await inv.ref.delete();
  await audit(sid, e, 'acceptInvite', e, { role, teacherId: teacherId || null, invitedBy: by || null });
  return { sid, claims };
});

const revokeMember = onCall(OPTS, async (req) => {
  const { sid, uid } = req.data || {};
  const me = requireAdmin(req, sid);
  const ref = db().doc(`schools/${sid}/members/${uid}`);
  const cur = (await ref.get()).data();
  if (!cur) throw new HttpsError('not-found', '找不到這位成員');
  if (cur.role === 'admin' && (await adminCount(sid)) <= 1) throw new HttpsError('failed-precondition', '至少要留一位管理者');
  await admin.auth().setCustomUserClaims(uid, null);
  await admin.auth().revokeRefreshTokens(uid);
  await ref.set({ active: false, updatedBy: me.email, claimsAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await audit(sid, me.email, 'revokeMember', cur.email, { role: cur.role });
  return { ok: true };
});

module.exports = { setMemberRole, createInvite, acceptInvite, revokeMember, _internal: { applyRole, audit } };

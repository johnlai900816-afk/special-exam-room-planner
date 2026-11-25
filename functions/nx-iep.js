/* IEP 線上時間調查｜新資料模型（schools/{sid}/terms/{tid}/iep/{round}）用的 Cloud Functions。
   不改正式的 functions/iep.js、iep-core.js：公開頁照舊呼叫 iepGetSurvey／iepSubmit，讀 iepTok/{雜湊}、寫 iepResp/{round}/r/{雜湊}。
   這裡補三件事：

   nxIepPublish  老師（自己是那份調查單的 readers）或管理者／編輯發布連結。
                 舊規則的 iepTok 只有舊名單的「編輯」能寫，新版的老師寫不進去，所以改由這個 Function 代寫。
                 用戶端只送「鑰匙的雜湊」和公開內容（鑰匙本身只留在發布的那台電腦）；這裡檢查欄位、上限（400 節、80 位學生、120 天），
                 再寫 iepTok/{h}，多加 sid、termId（回覆要抄到哪個學期）。別的調查或別間學校已經用了的雜湊不能蓋。
                 drop：要作廢的舊雜湊（重新產生連結時），只刪得到同一份調查單、同一間學校的。
   nxIepClose    結束調查：刪掉這份調查單發布過的 iepTok、舊位置的 iepResp 回覆與新位置抄過來的回覆。
   nxIepMirror   iepResp/{round}/r/{h} 有新的回覆（iepSubmit 寫的）→ 看 iepTok/{h} 的 sid、termId，
                 抄一份到 schools/{sid}/terms/{tid}/iep/{round}/responses/{h}（規則已備好：readers 讀、只有 Function 寫）。
                 沒有 sid 的（舊版發布的）不動，舊版照舊從 iepResp 抓。

   純邏輯在 nx-iep-core.js（有單元測試）。
   functions/index.js 加一行：Object.assign(exports, require('./nx-iep'));（nx-index.js 已經一起匯出） */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const OPTS = { region: 'asia-east1', enforceAppCheck: false /* 上線前改 true */, maxInstances: 5 };

const { ID_RE, TERM_RE, ROUND_RE, HASH_RE, LIM, PUBLIC, mayTouch, cleanDoc: cleanCore, mirrorPath } = require('./nx-iep-core');
const bad = (msg) => new HttpsError('invalid-argument', msg);
/** 檢查失敗時換成 HttpsError，訊息原樣給用戶端 */
function cleanDoc(d, now) {
  try {
    return cleanCore(d, now);
  } catch (e) {
    throw bad(e.message);
  }
}

function args(req) {
  const t = req.auth && req.auth.token;
  if (!t || t.email_verified !== true) throw new HttpsError('unauthenticated', '請先登入');
  const { sid, termId, roundId } = req.data || {};
  if (!ID_RE.test(String(sid || '')) || !TERM_RE.test(String(termId || '')) || !ROUND_RE.test(String(roundId || ''))) throw bad('學校、學期或調查單代碼不對');
  return { t, sid, termId, roundId };
}
async function roundOf(sid, termId, roundId) {
  const s = await db().doc(`schools/${sid}/terms/${termId}/iep/${roundId}`).get();
  return s.exists ? s.data() : null;
}

const nxIepPublish = onCall(OPTS, async (req) => {
  const { t, sid, termId, roundId } = args(req);
  const round = await roundOf(sid, termId, roundId);
  if (!round) throw new HttpsError('not-found', '找不到這份調查單，請先存檔');
  if (!mayTouch(t, sid, round)) throw new HttpsError('permission-denied', '只有發起人、學生的個管或管理者可以發布');
  const docs = Array.isArray(req.data.docs) ? req.data.docs : [];
  const drop = Array.isArray(req.data.drop) ? req.data.drop : [];
  if (docs.length > LIM.docs || drop.length > LIM.docs) throw bad('一次最多 ' + LIM.docs + ' 份');
  const now = Date.now();
  const rows = docs.map((x) => {
    if (!x || !HASH_RE.test(String(x.h))) throw bad('連結的雜湊不對');
    return { h: x.h, ...cleanDoc(x.doc, now) };
  });
  const TS = admin.firestore.Timestamp;
  const FV = admin.firestore.FieldValue;
  // 別的調查單、別間學校已經用的雜湊不能蓋（雜湊撞到幾乎不可能，這裡是防惡意）
  const snaps = await Promise.all(rows.map((r) => db().doc('iepTok/' + r.h).get()));
  snaps.forEach((s) => {
    if (s.exists && (s.data().r !== roundId || (s.data().sid && s.data().sid !== sid))) throw new HttpsError('already-exists', '連結的雜湊已經被別的調查用了，請重新產生');
  });
  const batch = db().batch();
  rows.forEach((r) =>
    batch.set(db().doc('iepTok/' + r.h), { ...r.out, r: roundId, pk: r.pk, exp: TS.fromMillis(r.exp), sid, termId, by: t.email || '', pubAt: FV.serverTimestamp() }, { merge: false }),
  );
  let dropped = 0;
  for (const h of drop) {
    if (!HASH_RE.test(String(h))) continue;
    const s = await db().doc('iepTok/' + h).get();
    if (s.exists && s.data().r === roundId && s.data().sid === sid) {
      batch.delete(s.ref);
      dropped++;
    }
  }
  await batch.commit();
  return { ok: true, n: rows.length, dropped };
});

const nxIepClose = onCall(OPTS, async (req) => {
  const { t, sid, termId, roundId } = args(req);
  const round = await roundOf(sid, termId, roundId);
  if (!mayTouch(t, sid, round || { readers: [] }) && !(t.sid === sid && (t.role === 'admin' || t.role === 'editor')))
    throw new HttpsError('permission-denied', '只有發起人、學生的個管或管理者可以結束調查');
  const toks = await db().collection('iepTok').where('r', '==', roundId).where('sid', '==', sid).get();
  const resp = await db().collection(`iepResp/${roundId}/r`).get();
  const mine = new Set(toks.docs.map((d) => d.id));
  const mirrored = await db().collection(`schools/${sid}/terms/${termId}/iep/${roundId}/responses`).get();
  const refs = [...toks.docs.map((d) => d.ref), ...resp.docs.filter((d) => mine.has(d.id)).map((d) => d.ref), ...mirrored.docs.map((d) => d.ref)];
  for (let i = 0; i < refs.length; i += 400) {
    const b = db().batch();
    refs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
  return { ok: true, tokens: toks.size, responses: mirrored.size };
});

const nxIepMirror = onDocumentWritten({ document: 'iepResp/{round}/r/{h}', region: 'asia-east1' }, async (ev) => {
  const { round, h } = ev.params;
  const tok = await db().doc('iepTok/' + h).get();
  const path = mirrorPath(tok.exists ? tok.data() : null, round, h);
  if (!path) return;
  const after = ev.data && ev.data.after && ev.data.after.exists ? ev.data.after.data() : null;
  if (after) await db().doc(path).set(after);
  else await db().doc(path).delete();
});

module.exports = { nxIepPublish, nxIepClose, nxIepMirror, _internal: { mayTouch, cleanDoc, mirrorPath, PUBLIC, LIM } };

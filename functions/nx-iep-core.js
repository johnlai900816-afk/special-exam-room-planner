/* nx-iep.js 的純邏輯（不依賴 firebase 套件，web/test/nx-iep.test.ts 直接測）：誰能動一份調查單、發布內容的檢查、回覆要抄到哪裡。 */
'use strict';
const bad = (msg) => {
  const e = new Error(msg);
  e.code = 'invalid-argument';
  return e;
};

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const TERM_RE = /^[A-Za-z0-9_-]{1,60}$/;
const ROUND_RE = /^[A-Za-z0-9_-]{1,60}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const SLOT_RE = /^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_:\-]{1,20}$/;
const PK_RE = /^[tnx]:[^/]{1,60}$/;
const LIM = { keys: 400, stu: 80, days: 120, docs: 300 };
/** 公開頁讀得到的欄位（和 iep-core.js PUBLIC 一樣） */
const PUBLIC = ['v', 'who', 'once', 'name', 'title', 'round', 'kind', 'd1', 'd2', 'due', 'host', 'keys', 'ps', 'busy', 'stu', 'keep'];

const str = (v, n) => typeof v === 'string' && v.length <= n;

/** 呼叫的人能不能動這份調查單：同一間學校的管理者／編輯，或 readers 有自己的老師 */
function mayTouch(token, sid, round) {
  if (!token || token.sid !== sid) return false;
  if (token.role === 'admin' || token.role === 'editor') return true;
  return token.role === 'teacher' && !!token.tid && !!round && Array.isArray(round.readers) && round.readers.includes(token.tid);
}

/** 檢查一份要發布的公開內容，回傳要寫進 iepTok 的欄位（不含時間戳記）；不合格丟錯 */
function cleanDoc(d, now) {
  if (!d || typeof d !== 'object') throw bad('內容格式不對');
  const out = {};
  PUBLIC.forEach((k) => {
    if (d[k] !== undefined) out[k] = d[k];
  });
  if (!['t', 'p'].includes(out.who)) throw bad('who 只能是 t 或 p');
  if (!Array.isArray(out.keys) || out.keys.length > LIM.keys || !out.keys.every((k) => typeof k === 'string' && SLOT_RE.test(k)))
    throw bad('要回覆的節次最多 ' + LIM.keys + ' 個');
  if (!Array.isArray(out.stu) || out.stu.length > LIM.stu) throw bad('一份連結最多 ' + LIM.stu + ' 位學生');
  ['name', 'title', 'round', 'kind', 'd1', 'd2', 'due', 'host', 'keep'].forEach((k) => {
    if (out[k] !== undefined && !str(out[k], 300)) throw bad(k + ' 格式不對');
  });
  if (JSON.stringify(out).length > 60000) throw bad('內容太大');
  if (!str(d.pk, 64) || !PK_RE.test(d.pk)) throw bad('出席者代號不對');
  const exp = Number(d.expMs);
  if (!(exp > now)) throw bad('回覆期限已過');
  if (exp > now + LIM.days * 864e5) throw bad('連結最多只能開 ' + LIM.days + ' 天');
  return { out, pk: d.pk, exp };
}

/** 回覆要抄到哪裡；不用抄回傳 '' */
function mirrorPath(tok, round, h) {
  if (!tok || !tok.sid || !tok.termId || tok.r !== round) return '';
  if (!ID_RE.test(tok.sid) || !TERM_RE.test(tok.termId) || !ROUND_RE.test(round) || !HASH_RE.test(h)) return '';
  return `schools/${tok.sid}/terms/${tok.termId}/iep/${round}/responses/${h}`;
}

module.exports = { ID_RE, TERM_RE, ROUND_RE, HASH_RE, SLOT_RE, PK_RE, LIM, PUBLIC, mayTouch, cleanDoc, mirrorPath };

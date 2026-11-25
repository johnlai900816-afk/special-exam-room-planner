/* AI 代理（佔位）：瀏覽器不直接呼叫 AI，一律經過這裡。合約見 web/MIGRATION.md「AI 代理」。
   之後實作：驗證 ID token 與角色 → 每人每分鐘限流 → 去識別化（姓名、座號換代號）→
   呼叫 Vertex AI Gemini（asia-east1）→ 把代號換回來 → 寫 auditLogs（只記動作、字數，不記內容）。
   匯出：aiProxy（callable） */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const aiProxy = onCall({ region: 'asia-east1', enforceAppCheck: false }, async (req) => {
  const t = req.auth && req.auth.token;
  if (!t) throw new HttpsError('unauthenticated', '請先登入');
  if (!t.sid || !['admin', 'teacher'].includes(t.role)) throw new HttpsError('permission-denied', '沒有使用 AI 的權限');
  throw new HttpsError('unimplemented', 'AI 代理尚未開放');
});

module.exports = { aiProxy };

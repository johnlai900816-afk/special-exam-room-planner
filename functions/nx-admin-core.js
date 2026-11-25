/* 管理者端 Functions 的純邏輯（不依賴 firebase，可以在 web/test 直接測）：
   換目前學期之前的檢查、搬移狀態的整理。 */
'use strict';

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;

/** 能不能把 schools/{sid}.currentTerm 換成 termId：回傳 null＝可以，不然是原因 */
function switchTermDenied(link, school, termId, termExists) {
  if (!ID_RE.test(String(termId || ''))) return '學期代碼只能用小寫英數、-、_（2–40 字）';
  if (!termExists) return '這個學期還沒有資料';
  if (school && school.currentTerm === termId) return '已經是目前的學期';
  // 過渡期：舊版 rc/main 單向同步到 nxLink.termId；換學期會讓老師讀到沒有同步的那一份
  if (link && link.mode === 'legacy') return '過渡期（舊版是正本）不能在新版換學期，請先在舊版開始新學期';
  return null;
}

const iso = (t) => (t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null);

/** nxLink/main、schools/{sid}、staff/sync → 給畫面看的狀態（不含其他學校的東西） */
function linkView(sid, link, school, sync) {
  const L = link && link.sid === sid ? link : null;
  return {
    link: L ? { sid: L.sid, termId: String(L.termId || ''), mode: String(L.mode || ''), native: Array.isArray(L.native) ? L.native.map(String) : [], by: String(L.by || ''), at: iso(L.at) } : null,
    school: school
      ? { name: String(school.name || ''), currentTerm: String(school.currentTerm || ''), mode: String(school.mode || ''), native: Array.isArray(school.native) ? school.native.map(String) : [] }
      : null,
    sync: sync ? { at: iso(sync.updatedAt), ver: (() => { try { return JSON.parse(sync.json || 'null'); } catch (e) { return null; } })() } : null,
  };
}

module.exports = { switchTermDenied, linkView, ID_RE };

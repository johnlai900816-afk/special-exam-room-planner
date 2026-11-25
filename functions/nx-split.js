/* 資源班管理系統｜舊資料 D（rc/main 的整份 JSON）⇄ 新的「一筆一份文件」(schools/{sid}/terms/{tid}/…) 的轉換
   純函式、不依賴任何套件。三個地方共用同一份：
     - Cloud Functions（nx-migrate.js 的 nxMigrateLegacy、nx-sync.js 的 nxSyncFromLegacy）
     - 新版網頁（web/lib/legacy.ts、web/lib/repo/toCoreD.ts 直接 import 這個檔，和 core.js 一樣不複製）
     - 測試（web/test/*.test.ts）

   records（記憶體裡的形狀；每一項＝一份 Firestore 文件的內容，不含 rev/updatedBy/updatedAt）：
     term                           terms/{tid}
     teachers[docId]                terms/{tid}/teachers/{docId}
     classes[docId]                 terms/{tid}/classes/{docId}
     groups[docId]                  terms/{tid}/groups/{docId}
     students[docId]                terms/{tid}/students/{docId}
     privates[docId]                terms/{tid}/students/{docId}/private/profile
     attendance[docId]              terms/{tid}/attendance/{docId}
     iep[docId]                     terms/{tid}/iep/{docId}
     versions[docId]                terms/{tid}/versions/{docId}
     lockLog[docId]                 terms/{tid}/lockLog/{docId}
     staff[docId]                   terms/{tid}/staff/{docId}        只有管理者／編輯讀得到的雜項（交接基準、未知欄位…）
     exam[docId]                    terms/{tid}/exam/{docId}
     examPrivate[`${eid}/${docId}`] terms/{tid}/exam/{eid}/private/{docId}
   docId 都經過 encId（'/' 之類 Firestore 不收的字元換掉），原本的 id 用 decId 還原。

   不能放進 Firestore 的值（陣列裡直接放陣列、undefined、NaN）一律改存 JSON 字串，
   例如全校課表 tt（[姓名, 節數, 旗標][]）、lockLast.list、IEP 調查單。 */
'use strict';

const STU_PUB = ['cls', 'seat', 'name', 'note', 'needs'];
const STU_PRIV = ['privNote', 'iepDate', 'reviewDate', 'certExp', 'examSvc'];
// 減授、超鐘點（舊版 overtime）、個管分配的上限：都是一般欄位，不敏感
const TEA_KEYS = ['name', 'role', 'off', 'note', 'hours', 'prefRooms', 'reduce', 'reduceNote', 'otMax', 'prefSubj', 'prefGrade', 'avoidSubj', 'cmCap', 'noCM'];
const GRP_KEYS = ['name', 'subject', 'per', 'mode', 'room', 'on', 'grade', 'fixed'];
const TERM_KEYS = ['v', 'title', 'periods', 'rooms', 'settings', 'blocked', 'offBy', 'sets', 'lockFix', 'offPool', 'lockLast'];
const EXAM_PUB = ['title', 'sessions', 'rooms', 'proctors', 'proctorOf', 'supportOf'];
// 這些頂層欄位由上面的文件負責；其他（handoverBase、weekly、tgrid、gone、未知欄位）放 staff/legacy
const HANDLED = new Set(TERM_KEYS.concat(['students', 'teachers', 'groups', 'assign', 'classSubj', 'tt', 'classHead', 'contacts', 'iep', 'sched', 'lockLog']));
const COLS = ['teachers', 'classes', 'groups', 'students', 'privates', 'attendance', 'iep', 'versions', 'lockLog', 'staff', 'exam', 'examPrivate'];

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

/** Firestore 收得下這個值嗎（不能有陣列直接包陣列、空白的 map key、__x__ 這種保留 key、NaN） */
function fsSafe(v, inArr) {
  if (v === null) return true;
  const t = typeof v;
  if (t === 'string' || t === 'boolean') return true;
  if (t === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return !inArr && v.every((x) => fsSafe(x, true));
  if (t === 'object') return Object.keys(v).every((k) => k !== '' && !/^__.*__$/.test(k) && fsSafe(v[k], false));
  return false;
}

/** 文件 id：Firestore 不收 '/'、'.'、'..'、__x__；換成 %xx，decId 還原 */
function encId(s) {
  let x = String(s).replace(/%/g, '%25').replace(/\//g, '%2F');
  if (x === '.' || x === '..') x = x.replace(/\./g, '%2E');
  if (/^__.*__$/.test(x)) x = '%5F' + x.slice(1);
  if (x === '') x = '%00';
  return x;
}
function decId(s) {
  if (s === '%00') return '';
  try { return decodeURIComponent(s); } catch (e) { return s; }
}
const pad = (i) => String(i).padStart(4, '0');

/** 從 obj 拿 keys 裡有的欄位；Firestore 收不下的丟進 extra（之後存成 JSON 字串 x） */
function pick(obj, keys, out, extra) {
  keys.forEach((k) => {
    if (!has(obj, k) || obj[k] === undefined) return;
    if (fsSafe(obj[k])) out[k] = obj[k];
    else extra[k] = obj[k];
  });
}
function rest(obj, skip, extra) {
  Object.keys(obj).forEach((k) => {
    if (!skip.includes(k) && obj[k] !== undefined) extra[k] = obj[k];
  });
}
function withX(doc, extra) {
  if (Object.keys(extra).length) doc.x = JSON.stringify(extra);
  return doc;
}
const parseX = (d) => (d && typeof d.x === 'string' && d.x ? JSON.parse(d.x) : {});

/** 誰可以讀這位學生：個管＋教他資源班課的老師＋他原班該科的任課老師（和新版「我的學生」同一個定義）。
    groups 是 D.groups 的形狀。 */
function readersOf(s, groups, classSubj) {
  const set = new Set();
  if (s.caseMgr) set.add(String(s.caseMgr));
  (groups || []).forEach((g) => {
    if (!g || g.on === false || !Array.isArray(g.students) || !g.students.includes(s.id)) return;
    if (g.teacher) set.add(String(g.teacher));
    const cs = classSubj && classSubj[s.cls + '|' + g.subject];
    if (cs) set.add(String(cs));
  });
  return [...set].sort();
}

/** IEP 調查單：哪些學生、誰讀得到（發起人＋那些學生的個管） */
function iepReaders(R, stuById) {
  const stuIds = [...new Set((Array.isArray(R.meets) ? R.meets : []).map((m) => m && m.s).filter(Boolean).map(String))];
  const set = new Set();
  if (R.host) set.add(String(R.host));
  stuIds.forEach((id) => {
    const s = stuById.get(id);
    if (s && s.caseMgr) set.add(String(s.caseMgr));
  });
  return { stuIds, readers: [...set].sort() };
}

function emptyRecords() {
  const R = { term: null };
  COLS.forEach((c) => (R[c] = {}));
  return R;
}

/** 舊格式 D → records。D 不會被改動。 */
function split(D0) {
  const D = clone(D0) || {};
  const R = emptyRecords();
  const arr = (k) => (Array.isArray(D[k]) ? D[k] : []);
  const students = arr('students');
  const teachers = arr('teachers');
  const groups = arr('groups');
  const classSubj = D.classSubj && typeof D.classSubj === 'object' ? D.classSubj : {};
  const stuIds = new Set(students.map((s) => String(s.id)));
  const stuById = new Map(students.map((s) => [String(s.id), s]));
  const leftover = {};

  // 學期設定（大家都讀得到；不放任何學生姓名）
  const term = { packed: {} };
  TERM_KEYS.forEach((k) => {
    if (!has(D, k)) return;
    let v = D[k];
    if (k === 'offBy' && v && typeof v === 'object') {
      v = {};
      Object.keys(D.offBy).forEach((x) => {
        if (x.slice(0, 2) === 's:' && stuIds.has(x.slice(2))) return; // 學生個人的不排課放在學生文件
        v[x] = D.offBy[x];
      });
    }
    if (fsSafe(v)) term[k] = v;
    else term.packed[k] = JSON.stringify(v);
  });
  R.term = term;

  teachers.forEach((t, i) => {
    const doc = { ord: i };
    const extra = {};
    pick(t, TEA_KEYS, doc, extra);
    rest(t, ['id'].concat(TEA_KEYS), extra);
    R.teachers[encId(t.id)] = withX(doc, extra);
  });

  const assign = D.assign && typeof D.assign === 'object' ? D.assign : {};
  const grpIds = new Set();
  const groupIdsOf = {};
  groups.forEach((g, i) => {
    grpIds.add(String(g.id));
    (Array.isArray(g.students) ? g.students : []).forEach((id) => (groupIdsOf[id] = groupIdsOf[id] || []).push(String(g.id)));
    const doc = { ord: i, teacherId: String(g.teacher || ''), studentIds: Array.isArray(g.students) ? g.students.map(String) : [] };
    const extra = {};
    pick(g, GRP_KEYS, doc, extra);
    rest(g, ['id', 'teacher', 'students'].concat(GRP_KEYS), extra);
    if (has(assign, g.id)) {
      if (fsSafe(assign[g.id])) doc.slots = assign[g.id];
      else extra.__slots = assign[g.id];
    }
    R.groups[encId(g.id)] = withX(doc, extra);
  });
  const orphanAssign = {};
  Object.keys(assign).forEach((id) => {
    if (!grpIds.has(id)) orphanAssign[id] = assign[id];
  });
  if (Object.keys(orphanAssign).length) leftover.assign = orphanAssign;

  const offBy = D.offBy && typeof D.offBy === 'object' ? D.offBy : {};
  const contacts = D.contacts && typeof D.contacts === 'object' ? D.contacts : {};
  students.forEach((s, i) => {
    const id = String(s.id);
    const doc = {
      ord: i,
      caseMgrId: String(s.caseMgr || ''),
      groupIds: groupIdsOf[id] || [],
      teacherIds: readersOf(s, groups, classSubj),
    };
    const pubExtra = {};
    pick(s, STU_PUB, doc, pubExtra);
    if (has(offBy, 's:' + id)) doc.off = offBy['s:' + id];
    const priv = { caseMgrId: doc.caseMgrId };
    const extra = {};
    pick(s, STU_PRIV, priv, extra);
    rest(s, ['id', 'caseMgr'].concat(STU_PUB, STU_PRIV), extra);
    Object.assign(extra, pubExtra); // 收不下的公開欄位也放私密那邊，寧可少給不要多給
    if (has(contacts, id)) {
      if (fsSafe(contacts[id])) priv.contacts = contacts[id];
      else extra.__contacts = contacts[id];
    }
    R.students[encId(id)] = doc;
    R.privates[encId(id)] = withX(priv, extra);
  });
  const orphanContacts = {};
  Object.keys(contacts).forEach((id) => {
    if (!stuIds.has(id)) orphanContacts[id] = contacts[id];
  });
  if (Object.keys(orphanContacts).length) leftover.contacts = orphanContacts;

  // 班級：任課老師（classSubj）、全校課表（tt）、導師（classHead）
  const tt = D.tt && typeof D.tt === 'object' ? D.tt : {};
  const head = D.classHead && typeof D.classHead === 'object' ? D.classHead : {};
  const cls = new Map();
  const C = (c) => {
    if (!cls.has(c)) cls.set(c, { cls: c, subj: {} });
    return cls.get(c);
  };
  Object.keys(classSubj).forEach((k) => {
    const i = k.indexOf('|');
    if (i < 0) return;
    C(k.slice(0, i)).subj[k.slice(i + 1)] = classSubj[k];
  });
  const badSubj = {};
  Object.keys(classSubj).forEach((k) => {
    if (k.indexOf('|') < 0) badSubj[k] = classSubj[k];
  });
  if (Object.keys(badSubj).length) leftover.classSubj = badSubj;
  Object.keys(tt).forEach((c) => (C(c).ttJson = JSON.stringify(tt[c])));
  Object.keys(head).forEach((c) => (C(c).head = head[c]));
  cls.forEach((doc, c) => {
    if (!fsSafe(doc.subj) || !fsSafe(doc.head === undefined ? null : doc.head)) {
      const x = { subj: doc.subj, head: doc.head };
      delete doc.head;
      doc.subj = {};
      doc.x = JSON.stringify(x);
    }
    R.classes[encId(c)] = doc;
  });

  // IEP 會議時間調查
  if (has(D, 'iep') && D.iep && typeof D.iep === 'object') {
    const I = D.iep;
    (Array.isArray(I.rounds) ? I.rounds : []).forEach((r, i) => {
      if (!r || r.id == null) return;
      const { stuIds: ids, readers } = iepReaders(r, stuById);
      R.iep[encId(r.id)] = { ord: i, name: String(r.name || ''), due: String(r.due || ''), stuIds: ids, readers, json: JSON.stringify(r) };
    });
    const iRest = {};
    rest(I, ['rounds'], iRest);
    iRest.__rounds = Array.isArray(I.rounds);
    const bad = (Array.isArray(I.rounds) ? I.rounds : []).filter((r) => !r || r.id == null);
    if (bad.length) iRest.__badRounds = bad;
    R.staff.iep = { json: JSON.stringify(iRest) };
  }

  // 試排與確定的版本
  if (has(D, 'sched') && D.sched && typeof D.sched === 'object') {
    const S = D.sched;
    if (S.draft) R.versions.draft = { kind: 'draft', label: String(S.draft.label || ''), at: +S.draft.at || 0, json: JSON.stringify(S.draft) };
    (Array.isArray(S.vers) ? S.vers : []).forEach((v, i) => {
      R.versions['v' + pad(i)] = { kind: 'ver', ord: i, label: String((v && v.label) || ''), at: +(v && v.at) || 0, json: JSON.stringify(v) };
    });
    const sRest = {};
    rest(S, ['draft', 'vers'], sRest);
    sRest.__vers = Array.isArray(S.vers);
    sRest.__draft = has(S, 'draft') && !S.draft ? S.draft : undefined;
    R.staff.sched = { json: JSON.stringify(sRest) };
  } else if (has(D, 'sched')) leftover.sched = D.sched;

  // 鎖課紀錄（最多 50 筆）
  if (Array.isArray(D.lockLog)) {
    D.lockLog.forEach((e, i) => {
      R.lockLog['L' + pad(i)] = { ord: i, at: +(e && e.at) || 0, json: JSON.stringify(e) };
    });
  } else if (has(D, 'lockLog')) leftover.lockLog = D.lockLog;

  Object.keys(D).forEach((k) => {
    if (!HANDLED.has(k)) leftover[k] = D[k];
  });
  R.staff.legacy = { keys: Object.keys(D), json: JSON.stringify(leftover) };
  return R;
}

const byOrd = (o) =>
  Object.keys(o || {})
    .map((id) => [decId(id), o[id]])
    .sort((a, b) => (a[1].ord == null ? 1e9 : a[1].ord) - (b[1].ord == null ? 1e9 : b[1].ord) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
function copy(src, keys, out) {
  keys.forEach((k) => {
    if (has(src, k)) out[k] = clone(src[k]);
  });
  return out;
}

/** records → 舊格式 D。records 可以只有一部分（例：老師只讀得到自己的學生，沒有 staff 文件）：
    讀不到的部分就是沒有；groups 裡讀不到的學生 id 會被拿掉（opt.keepUnknown＝true 時保留）。 */
function join(R, opt) {
  opt = opt || {};
  R = R || {};
  const st = R.staff || {};
  const L = st.legacy && st.legacy.json ? JSON.parse(st.legacy.json) : {};
  const keys = st.legacy && Array.isArray(st.legacy.keys) ? st.legacy.keys : null;
  const D = {};
  const t = R.term || {};
  TERM_KEYS.forEach((k) => {
    if (has(t, k)) D[k] = clone(t[k]);
    else if (t.packed && has(t.packed, k)) D[k] = JSON.parse(t.packed[k]);
  });

  D.teachers = byOrd(R.teachers).map(([id, d]) => Object.assign(copy(d, TEA_KEYS, { id }), parseX(d)));

  const students = byOrd(R.students);
  const known = new Set(students.map(([id]) => id));
  const assign = {};
  D.groups = byOrd(R.groups).map(([id, d]) => {
    const x = parseX(d);
    const g = { id, name: d.name, subject: d.subject, teacher: d.teacherId || '' };
    copy(d, GRP_KEYS, g);
    g.students = (d.studentIds || []).filter((s) => opt.keepUnknown || known.has(s));
    if (has(d, 'slots')) assign[id] = clone(d.slots);
    if (has(x, '__slots')) {
      assign[id] = x.__slots;
      delete x.__slots;
    }
    // 欄位順序跟 core.defaultData 一樣（只是好讀；比對時不看順序）
    const out = { id, name: g.name, subject: g.subject, teacher: g.teacher, per: g.per, students: g.students };
    return Object.assign(out, g, x);
  });

  const contacts = {};
  const privs = R.privates || {};
  D.students = students.map(([id, d]) => {
    const s = { id };
    copy(d, ['cls', 'seat', 'name'], s);
    s.caseMgr = d.caseMgrId || '';
    copy(d, ['note', 'needs'], s);
    if (has(d, 'off')) {
      if (!D.offBy) D.offBy = {};
      D.offBy['s:' + id] = clone(d.off);
    }
    const p = privs[encId(id)];
    if (p) {
      copy(p, STU_PRIV, s);
      const x = parseX(p);
      if (has(p, 'contacts')) contacts[id] = clone(p.contacts);
      if (has(x, '__contacts')) {
        contacts[id] = x.__contacts;
        delete x.__contacts;
      }
      Object.assign(s, x);
    }
    return s;
  });

  if (has(L, 'assign')) Object.assign(assign, L.assign);
  if (!keys || keys.includes('assign') || Object.keys(assign).length) D.assign = assign;

  const classSubj = Object.assign({}, L.classSubj || {});
  const tt = {};
  const head = {};
  Object.keys(R.classes || {}).forEach((id) => {
    const d = R.classes[id];
    const c = d.cls != null ? d.cls : decId(id);
    const x = parseX(d);
    const subj = has(x, 'subj') ? x.subj : d.subj || {};
    Object.keys(subj).forEach((sj) => (classSubj[c + '|' + sj] = subj[sj]));
    if (typeof d.ttJson === 'string') tt[c] = JSON.parse(d.ttJson);
    if (has(x, 'head') && x.head !== undefined) head[c] = x.head;
    else if (has(d, 'head')) head[c] = d.head;
  });
  D.classSubj = classSubj;
  if ((keys && keys.includes('tt')) || Object.keys(tt).length) D.tt = tt;
  if ((keys && keys.includes('classHead')) || Object.keys(head).length) D.classHead = head;

  if (has(L, 'contacts')) Object.assign(contacts, L.contacts);
  if ((keys && keys.includes('contacts')) || Object.keys(contacts).length) D.contacts = contacts;

  if (st.iep) {
    const I = JSON.parse(st.iep.json || '{}');
    const rounds = byOrd(R.iep).map(([, d]) => JSON.parse(d.json));
    if (I.__badRounds) rounds.push(...I.__badRounds);
    const hadRounds = I.__rounds;
    delete I.__rounds;
    delete I.__badRounds;
    D.iep = Object.assign(I, hadRounds || rounds.length ? { rounds } : {});
  } else if (Object.keys(R.iep || {}).length) {
    D.iep = { rounds: byOrd(R.iep).map(([, d]) => JSON.parse(d.json)) };
  }

  if (st.sched) {
    const S = JSON.parse(st.sched.json || '{}');
    const vers = byOrd(R.versions)
      .filter(([, d]) => d.kind === 'ver')
      .map(([, d]) => JSON.parse(d.json));
    const draft = R.versions && R.versions.draft;
    const hv = S.__vers;
    const nd = S.__draft;
    delete S.__vers;
    delete S.__draft;
    if (draft) S.draft = JSON.parse(draft.json);
    else if (nd !== undefined) S.draft = nd;
    if (hv || vers.length) S.vers = vers;
    D.sched = S;
  } else if (has(L, 'sched')) D.sched = L.sched;

  if (Object.keys(R.lockLog || {}).length || (keys && keys.includes('lockLog') && !has(L, 'lockLog')))
    D.lockLog = byOrd(R.lockLog).map(([, d]) => JSON.parse(d.json));
  else if (has(L, 'lockLog')) D.lockLog = L.lockLog;

  Object.keys(L).forEach((k) => {
    if (!HANDLED.has(k)) D[k] = L[k];
  });
  if (!keys) return D;
  // 照原本的欄位順序排（新出現的放後面）
  const out = {};
  keys.forEach((k) => {
    if (has(D, k)) out[k] = D[k];
  });
  Object.keys(D).forEach((k) => {
    if (!has(out, k)) out[k] = D[k];
  });
  return out;
}

/* ───── 點名：舊 rc/att-YYYY-MM-DD ＝ { `${gid}@${pid}`: { [學生id]: 紀錄, _roster: [...], _info: {...} } } ───── */
/** 一天的舊點名 → attendance 文件（一節課一份，id＝`${date}_${gid}@${pid}`），teacherId＝那門課的資源班老師 */
function splitAttendance(date, data, D) {
  const out = {};
  const gT = new Map(((D && D.groups) || []).map((g) => [String(g.id), String(g.teacher || '')]));
  Object.keys(data || {}).forEach((key) => {
    const v = data[key];
    if (!v || typeof v !== 'object' || !Object.keys(v).length) return;
    const at = key.lastIndexOf('@');
    const gid = at > 0 ? key.slice(0, at) : key;
    const pid = at > 0 ? key.slice(at + 1) : '';
    const marks = {};
    const doc = { date, key, gid, pid, teacherId: gT.get(gid) || '', marks };
    Object.keys(v).forEach((k) => {
      if (k === '_roster') doc.roster = Array.isArray(v[k]) ? v[k].map(String) : [];
      else if (k === '_info') doc.info = v[k];
      else if (k[0] !== '_') marks[k] = v[k];
    });
    if (!fsSafe(doc)) return;
    out[encId(date + '_' + key)] = doc;
  });
  return out;
}
/** attendance 文件 → 舊的一天格式（給舊畫面或比對用） */
function joinAttendance(docs) {
  const days = {};
  Object.values(docs || {}).forEach((d) => {
    const day = (days[d.date] = days[d.date] || {});
    const o = Object.assign({}, clone(d.marks || {}));
    if (d.roster) o._roster = clone(d.roster);
    if (d.info) o._info = clone(d.info);
    day[d.key] = o;
  });
  return days;
}

/* ───── 段考：舊 exams/main（exam.html 的整份資料）、exams/notice（通知單補充） ───── */
/** 考程、試場、監考對照給大家讀（exam/{eid}）；學生名單與調整等其餘內容只給管理者（exam/{eid}/private/data） */
function splitExam(E, notice, eid) {
  eid = eid || 'main';
  const out = { exam: {}, examPrivate: {} };
  if (E && typeof E === 'object') {
    const pub = { packed: {} };
    const extra = {};
    pick(E, EXAM_PUB, pub, extra);
    Object.keys(extra).forEach((k) => (pub.packed[k] = JSON.stringify(extra[k])));
    out.exam[encId(eid)] = pub;
    const r = {};
    rest(E, EXAM_PUB, r);
    out.examPrivate[encId(eid) + '/data'] = { json: JSON.stringify(r) };
  }
  if (notice !== undefined && notice !== null) out.examPrivate[encId(eid) + '/notice'] = { json: JSON.stringify(notice) };
  return out;
}
function joinExam(R, eid) {
  eid = encId(eid || 'main');
  const p = (R.exam || {})[eid];
  const d = (R.examPrivate || {})[eid + '/data'];
  const n = (R.examPrivate || {})[eid + '/notice'];
  let E = null;
  if (p || d) {
    E = Object.assign({}, d ? JSON.parse(d.json) : {});
    if (p) {
      copy(p, EXAM_PUB, E);
      Object.keys(p.packed || {}).forEach((k) => (E[k] = JSON.parse(p.packed[k])));
    }
  }
  return { exam: E, notice: n ? JSON.parse(n.json) : null };
}

/* ───── 比對：兩份 records 之間要寫哪些文件、刪哪些文件（nxSyncFromLegacy 用） ───── */
/** 排好 key 的 JSON：內容一樣就一樣（不管 key 順序） */
function canon(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
const META = ['rev', 'updatedBy', 'updatedAt', 'src'];
function content(d) {
  if (!d) return d;
  const o = {};
  Object.keys(d).forEach((k) => {
    if (!META.includes(k)) o[k] = d[k];
  });
  return o;
}
/** before/after：records（split 的結果；可以只放其中幾個集合）。
    回傳 { set:[{col,id,data}], del:[{col,id}] }：col＝'term' 或 COLS 之一。
    內容一樣的文件不寫（rev 不會白白增加）；after 沒有、before 有的刪掉。
    只比較 after 裡「有出現」的集合，沒出現的集合整個不動（例：只同步點名時不會刪學生）。 */
function diff(before, after, cols) {
  before = before || {};
  after = after || {};
  const set = [];
  const del = [];
  if (has(after, 'term') && after.term && (!cols || cols.includes('term'))) {
    if (canon(content(before.term)) !== canon(content(after.term))) set.push({ col: 'term', id: '', data: after.term });
  }
  (cols || COLS).forEach((c) => {
    if (c === 'term' || !has(after, c)) return;
    const a = after[c] || {};
    const b = before[c] || {};
    Object.keys(a).forEach((id) => {
      if (!has(b, id) || canon(content(b[id])) !== canon(content(a[id]))) set.push({ col: c, id, data: a[id] });
    });
    Object.keys(b).forEach((id) => {
      if (!has(a, id)) del.push({ col: c, id });
    });
  });
  return { set, del };
}

/** records 的一項 → Firestore 路徑（相對於資料庫根目錄） */
function pathOf(sid, termId, col, id) {
  const T = 'schools/' + sid + '/terms/' + termId;
  if (col === 'term') return T;
  if (col === 'privates') return T + '/students/' + id + '/private/profile';
  // 段考底下的子集合：id＝`${eid}/${docId}`（examPlace、examSeat 是新版才有的，搬移與同步不碰）
  const SUB = { examPrivate: 'private', examPlace: 'placements', examSeat: 'seats' };
  if (SUB[col]) {
    const i = id.indexOf('/');
    return T + '/exam/' + id.slice(0, i) + '/' + SUB[col] + '/' + id.slice(i + 1);
  }
  return T + '/' + col + '/' + id;
}

module.exports = {
  split,
  join,
  splitAttendance,
  joinAttendance,
  splitExam,
  joinExam,
  diff,
  canon,
  content,
  pathOf,
  readersOf,
  iepReaders,
  fsSafe,
  encId,
  decId,
  emptyRecords,
  COLS,
  STU_PUB,
  STU_PRIV,
  TEA_KEYS,
  GRP_KEYS,
  TERM_KEYS,
  META,
};

/* 新資料模型（schools/{sid}/…）用的 Cloud Functions，一次匯出。functions/index.js 加一行：
     Object.assign(exports, require('./nx-index'));
   匯出：nxBootstrap、nxSetClaims、nxCreateInvite、nxAcceptInvite、nxRevokeMember、nxImportLegacyMembers（nx-claims.js）
         nxMigrateLegacy（nx-migrate.js）
         nxSyncFromLegacy、nxSyncExamFromLegacy（nx-sync.js，Firestore 觸發）
         nxIepPublish、nxIepClose、nxIepMirror（nx-iep.js：新版老師發布 IEP 連結、把線上回覆抄到新位置） */
'use strict';
const pub = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== '_internal'));
module.exports = Object.assign({}, pub(require('./nx-claims')), pub(require('./nx-migrate')), pub(require('./nx-sync')), pub(require('./nx-iep')));

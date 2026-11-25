/* Cloud Functions 進入點：只負責轉出各模組的函式，邏輯放在各自的檔案。
   ai.js＝AI 代理（Gemini／Vertex AI）；iep.js＝IEP 線上時間調查。
   roles.js（帳號角色、custom claims）是 Next.js 版的設計，目前的網站沒有用到，先不部署（檔案留著，見 web/MIGRATION.md）。 */
'use strict';
const ai=require('./ai');
exports.aiGenerate=ai.aiGenerate;
exports.aiListModels=ai.aiListModels;
Object.assign(exports,require('./iep'));

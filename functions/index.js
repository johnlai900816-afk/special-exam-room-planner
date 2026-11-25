/* Cloud Functions 進入點：只負責轉出各模組的函式，邏輯放在各自的檔案。
   ai.js＝AI 代理（Gemini／Vertex AI）；iep.js、roles.js 由其他分支加入時，在下面各加一行。 */
'use strict';
const ai=require('./ai');
exports.aiGenerate=ai.aiGenerate;
exports.aiListModels=ai.aiListModels;

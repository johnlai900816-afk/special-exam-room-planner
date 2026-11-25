/* IEP 會議線上時間調查｜Cloud Functions（v2、Node 20、asia-east1）
   functions/index.js 請加：  Object.assign(exports, require('./iep'));
   會匯出：iepGetSurvey、iepSubmit（都是 callable，公開頁不用登入就能呼叫）
   App Check：先「準備好」，設環境變數 IEP_APPCHECK=enforce 再部署就會強制檢查（公開頁要先設好 reCAPTCHA 金鑰） */
'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {makeIep}=require('./iep-core');

if(!getApps().length)initializeApp();
const core=makeIep({db:getFirestore(),now:()=>Date.now(),stamp:ms=>Timestamp.fromMillis(ms),fail:(code,msg)=>{throw new HttpsError(code,msg);}});
const OPT={region:'asia-east1',enforceAppCheck:process.env.IEP_APPCHECK==='enforce',cors:true,maxInstances:5,memory:'256MiB',timeoutSeconds:20};

// 對外 IP：Cloud Run 前面有 Google 的負載平衡，取 x-forwarded-for 的第一個
function ipOf(req){const r=req&&req.rawRequest;if(!r)return '';const x=String((r.headers&&r.headers['x-forwarded-for'])||'').split(',')[0].trim();return x||r.ip||'';}
// 錯誤訊息只回固定的文字，不把內部錯誤細節傳給公開頁
const wrap=fn=>async req=>{try{return await fn(req.data,{ip:ipOf(req),app:req.app||null});}
  catch(e){if(e instanceof HttpsError)throw e;console.error('iep',e);throw new HttpsError('internal','系統忙碌，請稍後再試');}};

exports.iepGetSurvey=onCall(OPT,wrap(core.getSurvey));
exports.iepSubmit=onCall(OPT,wrap(core.submit));

/* 資源班管理系統｜伺服器端 AI 代理（Cloud Functions v2，asia-east1）
   瀏覽器不放任何金鑰：老師用 Firebase 登入，這裡驗證身分與共用名單、限制使用次數、再去識別化一次，
   然後用 Functions 的服務帳號呼叫 Vertex AI 上的 Gemini，最後寫一筆稽核紀錄（只記題目的雜湊，不記內容）。
   回覆格式和 Gemini API 的 generateContent 一樣，前端 gemini.js 的 proxy 模式直接沿用。規格見 ../GEMINI.md。

   邏輯都在 makeAI(deps) 裡，Firestore、驗證、Vertex 都從 deps 傳進來，node 測試時可以換成假的（functions/test-ai.js）。 */
'use strict';
const crypto=require('crypto');

const DAY=864e5;
function config(env){
  env=env||process.env;const num=(v,d)=>{const n=parseInt(v,10);return n>0?n:d;};
  return {
    // 只接受這些網站來的呼叫（新版 Firebase Hosting、舊版 GitHub Pages 與本機測試）；其他網站就算拿到 token 也不給用
    origins:String(env.AI_ALLOWED_ORIGINS||'https://special-exam-rooms.web.app,https://special-exam-rooms.firebaseapp.com,https://johnlai900816-afk.github.io,http://localhost:5000,http://127.0.0.1:5000,http://localhost:8080').split(',').map(s=>s.trim()).filter(Boolean),
    location:env.AI_VERTEX_LOCATION||'global',          // 新的 Gemini 模型多半先在 global 提供
    project:env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||'',
    perMinute:num(env.AI_PER_MINUTE,10),perDay:num(env.AI_PER_DAY,200),
    serverDeid:env.AI_SERVER_DEID!=='false',            // 預設開：伺服器再把名冊上的姓名換成代號一次
    allowViewers:env.AI_ALLOW_VIEWERS==='true',         // 預設只有「編輯」以上可以用（會花錢）
    maxBytes:num(env.AI_MAX_BYTES,4*1024*1024),
    fallbackModels:String(env.AI_MODELS||'').split(',').map(s=>s.trim()).filter(Boolean),
    // 額外允許的模型（逗號分隔）：自動查到的清單只留 flash、flash-lite、pro 三個系列，其他要用的模型寫在這裡
    allowModels:String(env.AI_ALLOWED_MODELS||'').split(',').map(s=>s.trim().replace(/^models\//,'')).filter(Boolean)
  };
}
// 允許的模型系列：gemini-版本-flash／flash-lite／pro，後面只能接 preview、exp、latest 或數字（日期、版號）。
// 圖片、語音、即時、嵌入等特殊模型（…-image、…-tts、…-live、embedding）都不在內
const FAMILY_RE=/^gemini-\d+(?:\.\d+)?-(?:flash-lite|flash|pro)(?:-(?:preview|exp|latest|\d+))*$/i;
function modelAllowed(id,cfg){id=String(id||'').replace(/^models\//,'');return FAMILY_RE.test(id)||((cfg&&cfg.allowModels)||[]).includes(id);}
// generationConfig 只留這幾個欄位（tools、safetySettings、thinkingConfig… 一律丟掉），一次只產生一份回覆
const GC_NUM={temperature:[0,2],topP:[0,1],topK:[1,1000],maxOutputTokens:[1,65536]};
function cleanGC(gc){const o={};gc=gc&&typeof gc==='object'&&!Array.isArray(gc)?gc:{};
  for(const k in GC_NUM){const v=gc[k];if(typeof v==='number'&&isFinite(v)&&v>=GC_NUM[k][0]&&v<=GC_NUM[k][1])o[k]=k==='topK'||k==='maxOutputTokens'?Math.floor(v):v;}
  if(gc.responseMimeType==='application/json'||gc.responseMimeType==='text/plain')o.responseMimeType=gc.responseMimeType;
  if(gc.responseSchema&&typeof gc.responseSchema==='object'&&!Array.isArray(gc.responseSchema))o.responseSchema=gc.responseSchema;
  o.candidateCount=1;return o;}

/* ───── 去識別化（和前端 ai.js 的 scrub 同一套規則；伺服器是第二道防線） ───── */
const baseName=n=>String(n||'').replace(/（[^）]*）|\([^)]*\)/g,'').trim();
function namePairs(D,allowTeacherNames){
  const pairs=[];(D.students||[]).forEach((s,i)=>{const n=String(s&&s.name||'').trim();if(n.length>=2)pairs.push([n,'S'+(i+1)]);});
  if(!allowTeacherNames){const sur={};
    (D.teachers||[]).forEach((t,i)=>{const code='T'+(i+1),full=String(t&&t.name||'').trim(),b=baseName(full);
      if(full.length>=2)pairs.push([full,code]);if(b.length>=2&&b!==full)pairs.push([b,code]);
      const f=b.replace(/老師$/,'')[0];if(f)(sur[f]=sur[f]||new Set()).add(code);});
    for(const f in sur)if(sur[f].size===1)pairs.push([f+'老師',[...sur[f]][0]]);}
  return pairs.sort((a,b)=>b[0].length-a[0].length);
}
function scrubText(t,pairs){let out=String(t),n=0;pairs.forEach(([k,v])=>{if(!out.includes(k))return;const p=out.split(k);n+=p.length-1;out=p.join(v);});return {text:out,n};}
// 只改文字部分；圖片（全校課表的統計區）不動，前端要老師勾選「可以送出老師姓名」才會送圖
function scrubRequest(request,pairs){
  let n=0;const fix=parts=>(parts||[]).forEach(p=>{if(p&&typeof p.text==='string'){const r=scrubText(p.text,pairs);p.text=r.text;n+=r.n;}});
  (request.contents||[]).forEach(c=>fix(c&&c.parts));if(request.systemInstruction)fix(request.systemInstruction.parts);
  return n;
}

function httpError(status,code,message,details){const e=new Error(message);e.http=status;e.status=code;e.details=details;return e;}
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');

function makeAI(deps){
  const cfg=Object.assign(config(deps.env),deps.cfg||{}),db=deps.db,now=deps.now||(()=>Date.now());
  let memModels=null;

  function cors(req,res){
    const o=req.headers&&req.headers.origin;
    if(o&&!cfg.origins.includes(o))return false;
    if(o){res.set('Access-Control-Allow-Origin',o);res.set('Vary','Origin');}
    res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','POST, OPTIONS');res.set('Access-Control-Max-Age','3600');
    return true;
  }
  // 身分：Firebase ID token → 信箱已驗證 → 在 config/access 的共用名單裡（和 firestore.rules 的 member()／editor() 相同）
  async function who(req){
    const m=String((req.headers&&req.headers.authorization)||'').match(/^Bearer\s+(.+)$/i);
    if(!m)throw httpError(401,'UNAUTHENTICATED','請先登入');
    let u;try{u=await deps.verifyIdToken(m[1]);}catch(e){throw httpError(401,'UNAUTHENTICATED','登入已過期，請重新登入');}
    if(!u||!u.email||u.email_verified!==true)throw httpError(401,'UNAUTHENTICATED','這個帳號的信箱還沒驗證');
    const email=String(u.email).toLowerCase();
    // 新版（schools/{sid}）：角色在 custom claims；檢視不能用 AI（除非 allowViewers）
    if(typeof u.sid==='string'&&u.sid&&['admin','editor','teacher','viewer'].includes(u.role)){
      if(u.role==='viewer'&&!cfg.allowViewers)throw httpError(403,'PERMISSION_DENIED','檢視權限不能使用 AI');
      return {uid:u.uid,email,role:u.role==='admin'?'admin':u.role==='viewer'?'viewer':'editor',sid:u.sid};
    }
    const snap=await db.doc('config/access').get(),a=snap.exists?snap.data():null;
    const lc=x=>(x||[]).map(e=>String(e).toLowerCase());
    if(!a||!lc(a.emails).includes(email))throw httpError(403,'PERMISSION_DENIED','你不在共用名單裡，請主持人把你加進去');
    const role=String(a.admin||'').toLowerCase()===email?'admin':lc(a.viewers).includes(email)?'viewer':'editor';
    if(role==='viewer'&&!cfg.allowViewers)throw httpError(403,'PERMISSION_DENIED','檢視權限不能使用 AI，請主持人把你改成編輯');
    return {uid:u.uid,email,role};
  }
  // 每人每分鐘、每天的次數上限：Firestore 計數器＋時間窗，用交易避免同時送出時算錯
  async function rateLimit(uid){
    const ref=db.doc('aiRate/'+uid),t=now();
    return db.runTransaction(async tx=>{
      const s=await tx.get(ref),d=s.exists?s.data():{},W=[['m',60000,cfg.perMinute],['d',DAY,cfg.perDay]],next={};
      for(const [k,ms,max] of W){const w=d[k]&&t-d[k].start<ms?d[k]:{start:t,count:0};
        if(w.count>=max){const wait=Math.ceil((w.start+ms-t)/1000);
          throw httpError(429,'RESOURCE_EXHAUSTED',k==='d'?'今天的 AI 使用次數到上限了（每人每天 '+max+' 次），明天再試':'用得太快，每分鐘最多 '+max+' 次',
            [{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:wait+'s'},{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:k==='d'?'AiRequestsPerDayPerUser':'AiRequestsPerMinutePerUser'}]}]);}
        next[k]={start:w.start,count:w.count+1};}
      tx.set(ref,Object.assign(next,{at:t}),{merge:true});
    });
  }
  async function roster(){
    try{const s=await db.doc('rc/main').get();if(!s.exists)return {};const x=s.data();return typeof x.json==='string'?JSON.parse(x.json):(x||{});}catch(e){return {};}
  }
  async function audit(e){try{await db.collection('auditLogs').add(Object.assign({at:deps.serverTime?deps.serverTime():new Date(now())},e));}catch(err){console.error('auditLogs 寫入失敗',err);}}
  function send(res,status,body){res.status(status).json(body);}
  function fail(res,e){const st=e.http||502;send(res,st,{error:{code:st,status:e.status||'INTERNAL',message:e.http?e.message:'AI 服務暫時出錯，請稍後再試',details:e.details||[]}});}
  // Vertex 丟出的錯誤（ApiError 有 status）轉成前端認得的狀態碼
  function vertexErr(e){const s=+(e&&(e.status||e.code))||0;
    if(s===429)return httpError(429,'RESOURCE_EXHAUSTED','AI 服務目前太忙或額度用完，請稍後再試',[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'20s'}]);
    if(s===404)return httpError(404,'NOT_FOUND','找不到這個模型');
    if(s===400)return httpError(400,'INVALID_ARGUMENT',String(e.message||'請求格式不對').slice(0,300));
    return httpError(503,'UNAVAILABLE','AI 服務暫時出錯，請稍後再試');}

  async function handleGenerate(req,res){
    if(!cors(req,res))return send(res,403,{error:{code:403,status:'PERMISSION_DENIED',message:'這個網站不能使用'}});
    if(req.method==='OPTIONS')return res.status(204).send('');
    let user=null,log={op:'generate'};
    try{
      if(req.method!=='POST')throw httpError(405,'INVALID_ARGUMENT','只接受 POST');
      user=await who(req);Object.assign(log,{uid:user.uid,email:user.email,role:user.role});
      const b=req.body||{},model=String(b.model||''),request=b.request;
      log.purpose=String(b.purpose||'other').slice(0,20);log.model=model;
      if(!/^gemini-[a-z0-9.\-]+$/i.test(model))throw httpError(400,'INVALID_ARGUMENT','模型名稱不對');
      if(!(await modelOk(model)))throw httpError(400,'INVALID_ARGUMENT','這個模型不能用（只開放 Gemini 的 flash、flash-lite、pro 系列）');
      if(!request||!Array.isArray(request.contents)||!request.contents.length)throw httpError(400,'INVALID_ARGUMENT','缺少 contents');
      const raw=JSON.stringify(request);if(Buffer.byteLength(raw)>cfg.maxBytes)throw httpError(400,'INVALID_ARGUMENT','資料太多，超過一次能送的大小');
      await rateLimit(user.uid);
      log.scrubbed=cfg.serverDeid?scrubRequest(request,namePairs(await roster(),!!b.allowTeacherNames)):0;
      log.promptHash=sha256(JSON.stringify(request));   // 只記雜湊：之後可以比對是不是同一份題目，但看不到內容
      const conf=cleanGC(request.generationConfig);if(request.systemInstruction&&Array.isArray(request.systemInstruction.parts))conf.systemInstruction={parts:request.systemInstruction.parts};
      let r;try{r=await deps.genai().models.generateContent({model,contents:request.contents,config:conf});}catch(e){throw vertexErr(e);}
      const u=r.usageMetadata||{};Object.assign(log,{ok:true,promptTokens:u.promptTokenCount||0,outputTokens:u.candidatesTokenCount||0,thoughtTokens:u.thoughtsTokenCount||0,totalTokens:u.totalTokenCount||0,finish:((r.candidates||[])[0]||{}).finishReason||''});
      await audit(log);
      return send(res,200,{candidates:r.candidates||[],promptFeedback:r.promptFeedback||null,usageMetadata:r.usageMetadata||null,modelVersion:r.modelVersion||model});
    }catch(e){if(user)await audit(Object.assign(log,{ok:false,error:e.status||'INTERNAL'}));if(!e.http)console.error(e);return fail(res,e);}
  }

  /* 模型清單：向 Vertex 問目前有哪些 Gemini，伺服器快取一天（記憶體＋Firestore aiCache/models），新模型出來不用改程式 */
  async function fetchModels(){
    const list=[];const pager=await deps.genai().models.list({config:{queryBase:true,pageSize:100}});
    for await(const m of pager){const id=String(m.name||'').split('/').pop();if(!/^gemini/i.test(id))continue;
      if(!modelAllowed(id,cfg))continue;   // 只留允許的系列（或 AI_ALLOWED_MODELS）
      const acts=m.supportedActions||[];
      list.push({name:'models/'+id,displayName:m.displayName||id,description:m.description||'',inputTokenLimit:m.inputTokenLimit||0,outputTokenLimit:m.outputTokenLimit||0,
        supportedGenerationMethods:acts.length?acts:['generateContent']});}
    return list;
  }
  async function models(force){
    const t=now();if(!force&&memModels&&t-memModels.at<DAY)return memModels;
    const ref=db.doc('aiCache/models');
    if(!force){try{const s=await ref.get();if(s.exists){const c=s.data();if(c&&t-c.at<DAY&&Array.isArray(c.models)&&c.models.length)return (memModels=c);}}catch(e){}}
    let list=[];try{list=await fetchModels();}catch(e){console.error('列模型失敗',e);}
    if(!list.length&&cfg.fallbackModels.length)list=cfg.fallbackModels.filter(id=>modelAllowed(id,cfg)).map(id=>({name:'models/'+id,displayName:id,supportedGenerationMethods:['generateContent']}));
    if(!list.length){if(memModels)return memModels;throw httpError(503,'UNAVAILABLE','暫時查不到可以用的模型');}
    memModels={at:t,models:list};try{await ref.set(memModels);}catch(e){}
    return memModels;
  }
  // 這個模型能不能用：額外允許的直接可以；其他要是允許的系列，而且在自動查到的清單裡（查不到清單時只看系列）
  async function modelOk(model){if(cfg.allowModels.includes(model))return true;if(!modelAllowed(model,cfg))return false;
    let c=null;try{c=await models(false);}catch(e){return true;}
    return !c||!Array.isArray(c.models)||!c.models.length||c.models.some(m=>String(m.name).replace(/^models\//,'')===model);}
  async function handleModels(req,res){
    if(!cors(req,res))return send(res,403,{error:{code:403,status:'PERMISSION_DENIED',message:'這個網站不能使用'}});
    if(req.method==='OPTIONS')return res.status(204).send('');
    try{if(req.method!=='POST')throw httpError(405,'INVALID_ARGUMENT','只接受 POST');
      await who(req);const c=await models(!!(req.body&&req.body.refresh));
      return send(res,200,{models:c.models,cachedAt:c.at});}
    catch(e){if(!e.http)console.error(e);return fail(res,e);}
  }
  return {cfg,cors,who,rateLimit,handleGenerate,handleModels,models,fetchModels,modelOk};
}

module.exports={makeAI,config,namePairs,scrubText,scrubRequest,sha256,cleanGC,modelAllowed,FAMILY_RE};

/* ───── 真正部署的兩個函式（本機測試沒有安裝 firebase-functions 時略過） ───── */
let https=null;try{https=require('firebase-functions/v2/https');}catch(e){}
if(https){
  let inst=null;
  const get=()=>{if(inst)return inst;
    const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp();
    const {GoogleGenAI}=require('@google/genai');const cfg=config();let ai=null;
    inst=makeAI({db:admin.firestore(),verifyIdToken:t=>admin.auth().verifyIdToken(t),serverTime:()=>admin.firestore.FieldValue.serverTimestamp(),
      genai:()=>ai||(ai=new GoogleGenAI({vertexai:true,project:cfg.project,location:cfg.location}))});
    return inst;};
  const opt={region:'asia-east1',timeoutSeconds:300,memory:'512MiB',maxInstances:5};
  module.exports.aiGenerate=https.onRequest(opt,(req,res)=>get().handleGenerate(req,res));
  module.exports.aiListModels=https.onRequest(Object.assign({},opt,{timeoutSeconds:60}),(req,res)=>get().handleModels(req,res));
}

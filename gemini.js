/* 資源班管理系統｜Gemini 連線（不碰畫面，瀏覽器與 node 共用）
   兩種連線方式（transport），換方式不用改其他程式：
   - browser：老師自己的金鑰，瀏覽器直接呼叫 Google。適合個人試用；金鑰放在這台瀏覽器的 localStorage，
     頁面若有 XSS 就可能被偷，所以畫面上要清楚提醒。
   - proxy：送到這個 Firebase 專案的 Cloud Functions（functions/ai.js），由伺服器用服務帳號呼叫 Vertex AI，
     帶 Firebase 登入的 ID token，瀏覽器裡沒有金鑰。登入雲端時預設用這個。介面規格見 GEMINI.md。
   這些設定都只放在 localStorage：不寫進名冊資料 D，所以不會跟著雲端同步、備份檔或程式碼出去。 */
(function(root){
'use strict';
const API='https://generativelanguage.googleapis.com/v1beta/';
const SK={key:'rc-gemini-key',model:'rc-gemini-model',list:'rc-gemini-models',mode:'rc-gemini-mode',proxy:'rc-gemini-proxy',names:'rc-gemini-names',seen:'rc-gemini-seen',log:'rc-gemini-log'};
const DAY=864e5;

// 外部依賴都經過 env，node 測試時換成假的 fetch、假的儲存空間；idToken 由畫面那一層接上 Firebase
const env={
  fetch:(...a)=>root.fetch(...a),
  store:()=>root.localStorage,
  now:()=>Date.now(),
  sleep:ms=>new Promise(r=>setTimeout(r,ms)),
  idToken:async()=>'',
  signedIn:()=>false,            // 有沒有登入雲端（畫面那一層接上 Firebase）
  projectId:()=>''               // 目前連的 Firebase 專案；代理網址預設由它推出來
};
function config(o){Object.assign(env,o||{});}
function sget(k){try{return env.store().getItem(k);}catch(e){return null;}}
function sset(k,v){try{if(v==null||v==='')env.store().removeItem(k);else env.store().setItem(k,String(v));}catch(e){}}

function getKey(){return (sget(SK.key)||'').trim();}
function setKey(v){sset(SK.key,String(v||'').trim());}
function hasKey(){return !!getKey();}
// 代理網址：自己填的 > school.js 的 GEMINI_PROXY_URL > 目前 Firebase 專案在 asia-east1 的 Cloud Functions
function getProxy(){const p=env.projectId();return (sget(SK.proxy)||root.GEMINI_PROXY_URL||(p?'https://asia-east1-'+p+'.cloudfunctions.net':'')).trim().replace(/\/+$/,'');}
function setProxy(v){sset(SK.proxy,String(v||'').trim());}
// 登入雲端時預設走學校的代理；老師明確選了「自己的金鑰」才直連
function getMode(){const m=sget(SK.mode);if(m==='browser'||m==='proxy')return m;return env.signedIn()?'proxy':'browser';}
function setMode(m){sset(SK.mode,m==='proxy'||m==='browser'?m:'');}
// 這台瀏覽器現在能不能用 AI：代理要登入雲端，直連要有金鑰
function ready(){return getMode()==='proxy'?!!(env.signedIn()&&getProxy()):hasKey();}
// 老師姓名要不要送出：預設不送（換成代號），老師自己勾選才送；學生姓名一律不送
function namesOk(){return sget(SK.names)==='1';}
function setNamesOk(v){sset(SK.names,v?'1':'');}
// 第一次送出某一種資料前要先給老師看預覽
function seen(kind){return (sget(SK.seen)||'').split(',').includes(kind);}
function setSeen(kind){const a=(sget(SK.seen)||'').split(',').filter(Boolean);if(!a.includes(kind))a.push(kind);sset(SK.seen,a.join(','));}
function cached(){try{const c=JSON.parse(sget(SK.list)||'null');return c&&Array.isArray(c.list)?c:null;}catch(e){return null;}}
// 使用者選的模型；沒選過、或選的已經不在清單上，就用建議的那一個
function getModel(){const m=sget(SK.model)||'',c=cached();if(m&&(!c||!c.list.length||c.list.some(x=>x.id===m)))return m;return c&&c.list.length?defaultModel(c.list):'';}
function setModel(id){sset(SK.model,id||'');}
// 清掉這台瀏覽器裡跟 Gemini 有關的一切（含使用紀錄）
function forget(){Object.values(SK).forEach(k=>sset(k,''));}

/* ───── 使用紀錄：每次呼叫的題目、回覆、最後套用了什麼，只存在這台瀏覽器，方便事後查核與復原 ───── */
const LOG_MAX=25,LOG_CUT=15000;
function logList(){try{const a=JSON.parse(sget(SK.log)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function logSave(a){a=a.slice(-LOG_MAX);while(a.length){try{env.store().setItem(SK.log,JSON.stringify(a));return;}catch(e){a.shift();}}}   // 空間不夠就丟最舊的
const cut=t=>{t=String(t==null?'':t);return t.length>LOG_CUT?t.slice(0,LOG_CUT)+'…（共 '+t.length+' 字，後面省略）':t;};
function logAdd(e){const id=env.now().toString(36)+Math.random().toString(36).slice(2,6);
  const a=logList();a.push(Object.assign({id,at:env.now()},e,{prompt:cut(e.prompt),reply:cut(e.reply)}));logSave(a);return id;}
function logUpdate(id,patch){const a=logList(),x=a.find(o=>o.id===id);if(!x)return false;Object.assign(x,patch);logSave(a);return true;}
function logClear(){sset(SK.log,'');}

/* ───── 錯誤：全部換成老師看得懂的話 ───── */
class GeminiError extends Error{constructor(code,msg,extra){super(msg);this.name='GeminiError';this.code=code;Object.assign(this,extra||{});}}
const E=(code,msg,extra)=>new GeminiError(code,msg,extra);
function secs(v){const m=String(v||'').match(/([\d.]+)\s*s/);return m?Math.ceil(+m[1]):(/^\d+$/.test(String(v||''))?+v:0);}
function mapError(status,body,headers,mode){
  const er=(body&&body.error)||{},msg=String(er.message||''),st=String(er.status||''),det=Array.isArray(er.details)?er.details:[];
  const info=det.find(d=>/ErrorInfo/.test(d['@type']||''))||{},reason=String(info.reason||'');
  const ri=det.find(d=>/RetryInfo/.test(d['@type']||'')),qf=det.find(d=>/QuotaFailure/.test(d['@type']||''));
  const ra=Math.max(secs(ri&&ri.retryDelay),secs(headers&&headers.get&&headers.get('retry-after')));
  if(mode==='proxy'&&(status===401||status===403))
    return E('login','學校的 AI 服務不讓你使用：請先在側邊欄登入雲端，或請管理者把你的帳號加進可以使用的名單。');
  if(reason==='API_KEY_INVALID'||/api key not valid|api_key_invalid|invalid api key/i.test(msg))
    return E('key','金鑰不正確：請到 Google AI Studio 重新複製一次，整串貼上（通常是 AIza 開頭）。');
  if(reason==='API_KEY_SERVICE_BLOCKED'||reason==='SERVICE_DISABLED'||(status===403&&/disabled|blocked|not been used/i.test(msg)))
    return E('perm','這把金鑰沒有開通 Gemini API。請到 Google AI Studio 建立新的金鑰，或請管理者開通。');
  if(/location is not supported|user location/i.test(msg))
    return E('region','Google 目前不提供你所在地區使用這個 API。');
  if(status===401||status===403)return E('perm','這把金鑰沒有使用權限，請到 Google AI Studio 確認，或換一把金鑰。');
  if(status===404)return E('model','找不到這個模型（或代理網址不對），可能已經下架。請到「AI 設定」按「重新整理模型清單」再選一次。');
  if(status===429||st==='RESOURCE_EXHAUSTED'){
    const day=!!((qf&&/PerDay/i.test(JSON.stringify(qf)))||/per ?day|daily/i.test(msg));
    return E('quota',day?'今天這個模型的免費額度用完了：明天再試，或到「AI 設定」換一個模型（flash 類的額度比較多）。'
      :'用得太快，超過每分鐘的使用上限'+(ra?'，請 '+ra+' 秒後再試':'，請等一下再試')+'。',{retryAfter:ra,daily:day});}
  if(status===400&&/token|too large|exceeds/i.test(msg))return E('big','資料太多，超過這個模型一次能讀的長度，請換一個模型或分年級來做。');
  if(status===500||status===502||status===503||status===504)return E('busy','Gemini 現在很忙（伺服器 '+status+'），請過一會兒再試，或換一個模型。',{retryAfter:ra||5});
  return E('http','Gemini 回覆錯誤（'+status+'）'+(msg?'：'+msg.slice(0,160):''));
}

async function call(url,init,opt){
  opt=opt||{};const AC=root.AbortController,ctl=AC?new AC():null;let timedOut=false,tm=null;
  const ext=opt.signal;if(ext&&ctl){if(ext.aborted)ctl.abort();else ext.addEventListener('abort',()=>ctl.abort(),{once:true});}
  if(ctl&&opt.timeout)tm=setTimeout(()=>{timedOut=true;ctl.abort();},opt.timeout);
  let res;
  try{res=await env.fetch(url,Object.assign({},init,ctl?{signal:ctl.signal}:{}));}
  catch(e){
    if(ext&&ext.aborted)throw E('cancel','已取消。');
    if(timedOut)throw E('timeout','Gemini 想太久了（超過 '+Math.round(opt.timeout/1000)+' 秒），請再試一次，或換一個比較快的模型（flash）。');
    throw E('network',opt.mode==='proxy'?'連不上學校的 AI 服務，請確認網路與代理網址。':'連不上 Google：請確認網路，或學校防火牆是否擋了 generativelanguage.googleapis.com。');}
  finally{if(tm)clearTimeout(tm);}
  let body=null;try{body=await res.json();}catch(e){}
  if(!res.ok)throw mapError(res.status,body,res.headers,opt.mode);
  return body||{};
}

/* ───── 連線方式：兩種都提供 models(pageToken) 與 generate(model, body)，回傳 Google 原本的格式 ───── */
const TRANSPORTS={
  browser:{
    // 金鑰放在標頭（x-goog-api-key），不放網址：網址容易留在瀏覽紀錄、代理伺服器的紀錄裡
    models:(tok,o)=>{const key=o.key||getKey();if(!key)throw E('nokey','還沒有設定 Gemini 金鑰，請先到「AI 設定」貼上。');
      return call(API+'models?pageSize=1000'+(tok?'&pageToken='+encodeURIComponent(tok):''),{method:'GET',headers:{'x-goog-api-key':key}},{timeout:30000,signal:o.signal});},
    generate:(model,body,o)=>{const key=o.key||getKey();if(!key)throw E('nokey','還沒有設定 Gemini 金鑰，請先到「AI 設定」貼上。');
      return call(API+'models/'+model+':generateContent',{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(body)},{timeout:o.timeout,signal:o.signal});}
  },
  proxy:{
    models:(tok,o)=>proxyCall('aiListModels',{pageToken:tok||'',refresh:!!o.force},Object.assign({timeout:30000},o)),
    generate:(model,body,o)=>proxyCall('aiGenerate',{model,request:body,purpose:o.kind||'other',allowTeacherNames:!!o.names},o)
  }
};
async function proxyCall(fn,payload,o){
  const base=o.proxy||getProxy(),url=base&&base+'/'+fn;if(!url)throw E('noproxy','還沒有設定學校 AI 服務的網址，請到「AI 設定」填入，或改用自己的金鑰。');
  let tok='';try{tok=await env.idToken();}catch(e){}
  if(!tok)throw E('login','用學校的 AI 服務要先在側邊欄登入雲端；沒有登入的話，可以到「AI 設定」改用自己的金鑰。');
  return call(url,{method:'POST',headers:{'Authorization':'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify(payload)},{timeout:o.timeout,signal:o.signal,mode:'proxy'});
}
const tp=o=>TRANSPORTS[(o&&o.mode)||getMode()]||TRANSPORTS.browser;

/* ───── 模型清單：每次向 Google（或代理）問有哪些，新模型出來不用改程式 ───── */
// 不適合拿來回 JSON 文字的：向量、問答專用、畫圖、影片、語音、即時語音、操作電腦、機器人
const SKIP=/embed|aqa|imagen|veo|tts|image|audio|live|computer-use|robotics|learnlm/i;
function parseModel(m){
  const id=String(m.name||'').replace(/^.*models\//,''),low=id.toLowerCase();
  const vm=low.match(/gemini-(\d+)(?:\.(\d+))?/),ver=vm?(+vm[1])+(+(vm[2]||0))/100:0;
  const tier=/ultra/.test(low)?4:/pro/.test(low)?3:/flash-lite|flash-8b|lite/.test(low)?1:/flash/.test(low)?2:0;
  const alias=/latest$/.test(low)||!vm;                 // gemini-flash-latest 這類：會自己換成最新版，結果可能不穩
  const preview=/preview|exp|experimental/.test(low);
  return {id,label:String(m.displayName||id),desc:String(m.description||''),ver,tier,alias,stable:!preview&&!alias,preview,
    inTok:+m.inputTokenLimit||0,outTok:+m.outputTokenLimit||0};
}
// 排序：版本新的在前（3.x > 2.5），同版本 pro > flash > flash-lite，正式版在預覽版前，會自動換版的別名放最後
function cmpModel(a,b){
  return (a.alias-b.alias)||(b.ver-a.ver)||(b.tier-a.tier)||(b.stable-a.stable)||b.id.localeCompare(a.id,undefined,{numeric:true});
}
function pickModels(raw){
  const seenIds=new Set();
  return (raw||[]).filter(m=>{const id=String(m&&m.name||'').replace(/^.*models\//,'');
    if(!id||seenIds.has(id))return false;seenIds.add(id);
    return /gemini/i.test(id)&&!SKIP.test(id)&&(m.supportedGenerationMethods||[]).includes('generateContent');})
    .map(parseModel).sort(cmpModel);
}
// 預設：最新的正式版 flash（夠聰明、快、免費額度多）；沒有就最新的正式版 pro；再沒有就清單第一個
function defaultModel(list){
  list=list||[];const st=list.filter(m=>m.stable);
  const f=st.find(m=>m.tier===2)||st.find(m=>m.tier===3)||st[0]||list[0];return f?f.id:'';
}
async function listModels(o){
  o=o||{};let raw=[],tok='',n=0;const T=tp(o);
  do{const j=await T.models(tok,o);raw=raw.concat(j.models||[]);tok=j.nextPageToken||'';}while(tok&&++n<30);
  return pickModels(raw);
}
// 清單快取一天；過期或 force 時重新問，並找出這次新出現的模型
async function ensureModels(opt){
  opt=opt||{};const old=cached(),fresh=old&&env.now()-old.at<(opt.maxAge||DAY);
  if(fresh&&!opt.force)return {list:old.list,added:[],removed:[],fresh:false,at:old.at};
  const list=await listModels(opt),ids=new Set(list.map(m=>m.id)),was=new Set(old?old.list.map(m=>m.id):[]);
  const added=old?list.filter(m=>!was.has(m.id)).map(m=>m.id):[],removed=old?[...was].filter(id=>!ids.has(id)):[];
  const at=env.now();sset(SK.list,JSON.stringify({at,list,added}));
  const cur=sget(SK.model),dropped=cur&&!ids.has(cur)?cur:'';if(dropped)sset(SK.model,'');   // 選的模型下架了：改回建議的
  return {list,added,removed,fresh:true,at,dropped};
}

/* ───── 產生內容 ───── */
function imgPart(im){
  if(typeof im==='string'){const m=im.match(/^data:([^;,]+);base64,(.*)$/);if(!m)throw E('format','圖片格式看不懂');return {inlineData:{mimeType:m[1],data:m[2]}};}
  return {inlineData:{mimeType:im.mimeType||'image/jpeg',data:im.data}};
}
function stripFence(t){t=String(t||'').trim();const m=t.match(/```(?:json)?\s*([\s\S]*?)```/);return m?m[1].trim():t;}
// 把 generateContent 的回覆整理成文字（和 JSON）；被擋下、被截斷都轉成白話錯誤
function parseResponse(j,wantJson){
  const pf=j&&j.promptFeedback;
  if(pf&&pf.blockReason)throw E('safety','Gemini 基於安全規則拒絕處理這份資料（'+pf.blockReason+'）。請改用複製貼上，或刪掉可能被誤判的文字再試。');
  const c=j&&j.candidates&&j.candidates[0];if(!c)throw E('empty','Gemini 沒有回覆內容，請再試一次。');
  const fr=c.finishReason||'';
  if(/SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(fr))throw E('safety','Gemini 基於安全規則中途停下（'+fr+'），請再試一次或改用複製貼上。');
  const text=((c.content&&c.content.parts)||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');   // 思考過程不算回覆
  if(fr==='MAX_TOKENS')throw E('cut','回覆太長被截斷了。請換一個輸出上限比較大的模型，或分年級來做。');
  if(!text.trim())throw E('empty','Gemini 回了空白，請再試一次。');
  const out={text,finish:fr,usage:j.usageMetadata||null,model:j.modelVersion||''};
  if(wantJson){try{out.json=JSON.parse(stripFence(text));}catch(e){throw E('format','Gemini 的回覆不是完整的 JSON，請再試一次。',{text});}}
  return out;
}
// 組出 generateContent 的 request body（直連和代理送的是同一份）
function buildBody(o){
  const parts=(o.images||[]).map(imgPart);parts.push({text:String(o.prompt||'')});
  const gc={};if(o.temperature!=null)gc.temperature=o.temperature;if(o.maxTokens)gc.maxOutputTokens=o.maxTokens;
  if(o.schema||o.json)gc.responseMimeType='application/json';if(o.schema)gc.responseSchema=o.schema;
  const body={contents:[{role:'user',parts}],generationConfig:gc};
  if(o.system)body.systemInstruction={parts:[{text:String(o.system)}]};
  return body;
}
async function generate(o){
  o=o||{};const model=o.model||getModel();
  if(!model)throw E('model','還沒有選模型，請到「AI 設定」按「測試連線」或「重新整理模型清單」。');
  const body=buildBody(o),wantJson=!!(o.schema||o.json),T=tp(o),opt=Object.assign({},o,{timeout:o.timeout||240000});
  let tries=o.retries==null?1:o.retries;
  const log=o.kind?e=>logAdd(Object.assign({kind:o.kind,model,mode:o.mode||getMode(),images:(o.images||[]).length,
    prompt:(o.system?'【系統說明】\n'+o.system+'\n\n':'')+String(o.prompt||'')},e)):()=>'';
  for(;;){
    try{const r=parseResponse(await T.generate(model,body,opt),wantJson);r.model=r.model||model;r.logId=log({reply:r.text,usage:r.usage});return r;}
    catch(e){   // 每分鐘上限、伺服器忙：等一下自動再試一次；每日額度用完就不用等了
      const wait=e.code==='busy'||(e.code==='quota'&&!e.daily&&e.retryAfter&&e.retryAfter<=20);
      if(tries-->0&&wait&&!(o.signal&&o.signal.aborted)){if(o.onWait)o.onWait(e);await env.sleep((e.retryAfter||5)*1000);continue;}
      log({reply:'',error:e.message});throw e;}
  }
}
// 測試連線：先列模型（確認金鑰或代理），再用建議的模型回一個字（確認額度）
async function test(o){
  o=o||{};const r=await ensureModels(Object.assign({force:true},o));const model=getModel()||defaultModel(r.list);
  let reply='',err=null;
  try{reply=(await generate(Object.assign({},o,{model,prompt:'請只回覆兩個字：可以',retries:0,timeout:60000}))).text.trim();}catch(e){err=e;}
  return Object.assign(r,{model,reply,err});
}
// 結構化輸出的 schema 小幫手（Gemini 用 OpenAPI 的子集）
const S={
  str:(d,o)=>Object.assign({type:'STRING'},d?{description:d}:{},o||{}),
  int:d=>Object.assign({type:'INTEGER'},d?{description:d}:{}),
  bool:d=>Object.assign({type:'BOOLEAN'},d?{description:d}:{}),
  arr:(items,d)=>Object.assign({type:'ARRAY',items},d?{description:d}:{}),
  obj:(props,req,d)=>Object.assign({type:'OBJECT',properties:props,propertyOrdering:Object.keys(props)},req?{required:req}:{},d?{description:d}:{})
};

const GEMINI={API,SK,config,getKey,setKey,hasKey,getProxy,setProxy,getMode,setMode,ready,namesOk,setNamesOk,seen,setSeen,logList,logAdd,logUpdate,logClear,
  getModel,setModel,forget,cached,listModels,ensureModels,pickModels,parseModel,defaultModel,
  generate,buildBody,parseResponse,mapError,test,S,GeminiError,TRANSPORTS,AI_STUDIO:'https://aistudio.google.com/app/apikey'};
root.GEMINI=GEMINI;
if(typeof module!=='undefined'&&module.exports)module.exports=GEMINI;
})(typeof window!=='undefined'?window:globalThis);

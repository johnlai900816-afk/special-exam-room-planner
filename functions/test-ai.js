/* node functions/test-ai.js：用假的 Firestore、假的登入驗證、假的 Vertex 測 AI 代理的邏輯（不需要安裝套件、不連網） */
'use strict';
const {makeAI,namePairs,scrubRequest}=require('./ai');
let fail=0;const ok=(c,m)=>{console.log((c?'  通過 ':'  失敗 ')+m);if(!c)fail++;};

// 假的 Firestore：doc().get/set、collection().add、runTransaction
function fakeDb(init){
  const data=Object.assign({},init),added=[];
  const doc=p=>({get:async()=>({exists:p in data,data:()=>JSON.parse(JSON.stringify(data[p]))}),set:async(v,o)=>{data[p]=o&&o.merge?Object.assign({},data[p],v):v;},_p:p});
  return {data,added,doc,collection:n=>({add:async v=>{added.push(Object.assign({_c:n},v));}}),
    runTransaction:async fn=>fn({get:r=>r.get(),set:(r,v,o)=>{data[r._p]=o&&o.merge?Object.assign({},data[r._p],v):v;}})};
}
function fakeRes(){const r={code:0,body:null,h:{},status(c){r.code=c;return r;},json(b){r.body=b;return r;},send(b){r.body=b;return r;},set(k,v){r.h[k]=v;}};return r;}
const D={students:[{name:'王小明'},{name:'陳小華'}],teachers:[{name:'林組長'},{name:'張老師（國）'},{name:'黃大同'}]};
const ORIGIN='https://johnlai900816-afk.github.io';
function setup(o){
  o=o||{};let t=1e12;const calls=[];
  const db=fakeDb(Object.assign({'config/access':{admin:'a@x.tw',emails:['a@x.tw','E@x.tw','v@x.tw'],viewers:['v@x.tw']},'rc/main':{json:JSON.stringify(D)}},o.data||{}));
  const tokens={good:{uid:'u1',email:'e@x.tw',email_verified:true},admin:{uid:'u0',email:'a@x.tw',email_verified:true},viewer:{uid:'u2',email:'v@x.tw',email_verified:true},
    stranger:{uid:'u3',email:'s@x.tw',email_verified:true},unverified:{uid:'u4',email:'a@x.tw',email_verified:false}};
  const genai={models:{
    generateContent:async a=>{calls.push(a);if(o.vertexErr)throw o.vertexErr;return {candidates:[{content:{parts:[{text:'{"ok":1}'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:120,candidatesTokenCount:8,totalTokenCount:128},modelVersion:a.model};},
    list:async()=>{calls.push('list');if(o.listErr)throw new Error('x');return (async function*(){
      yield {name:'publishers/google/models/gemini-3-flash',displayName:'Gemini 3 Flash'};
      yield {name:'publishers/google/models/text-embedding-005',displayName:'Embedding'};
      yield {name:'publishers/google/models/gemini-2.5-pro',displayName:'Gemini 2.5 Pro',supportedActions:['generateContent','countTokens']};})();}}};
  const api=makeAI({db,verifyIdToken:async tk=>{if(!tokens[tk])throw new Error('bad');return tokens[tk];},genai:()=>genai,now:()=>t,
    env:Object.assign({GCLOUD_PROJECT:'demo',AI_PER_MINUTE:'3',AI_PER_DAY:'5'},o.env||{})});
  return {api,db,calls,tick:ms=>{t+=ms;}};
}
const req=(tok,body,extra)=>Object.assign({method:'POST',headers:{origin:ORIGIN,authorization:tok?'Bearer '+tok:''},body},extra||{});
const genBody=()=>({model:'gemini-3-flash',purpose:'adj',request:{contents:[{role:'user',parts:[{text:'王小明和張老師、黃老師的課'}]}],systemInstruction:{parts:[{text:'說明'}]},generationConfig:{responseMimeType:'application/json',temperature:0.2}}});

(async()=>{
console.log('1. 身分與共用名單');
{const {api}=setup();let r=fakeRes();await api.handleGenerate(req('',genBody()),r);ok(r.code===401,'沒有登入：401');
  r=fakeRes();await api.handleGenerate(req('stranger',genBody()),r);ok(r.code===403,'不在共用名單：403');
  r=fakeRes();await api.handleGenerate(req('viewer',genBody()),r);ok(r.code===403&&/檢視/.test(r.body.error.message),'檢視權限：403');
  r=fakeRes();await api.handleGenerate(req('unverified',genBody()),r);ok(r.code===401,'信箱沒驗證：401');
  r=fakeRes();await api.handleGenerate(req('good',genBody(),{headers:{origin:'https://evil.example',authorization:'Bearer good'}}),r);ok(r.code===403&&!r.h['Access-Control-Allow-Origin'],'別的網站來的呼叫：拒絕，也不給 CORS');
  r=fakeRes();await api.handleGenerate(req('good',genBody(),{method:'OPTIONS'}),r);ok(r.code===204&&r.h['Access-Control-Allow-Origin']===ORIGIN,'預檢（OPTIONS）只回允許的網站');
  r=fakeRes();await api.handleGenerate(req('good',Object.assign(genBody(),{model:'../../x'})),r);ok(r.code===400,'奇怪的模型名稱：400');}

console.log('2. 產生內容、去識別化、稽核紀錄');
{const {api,db,calls}=setup();const r=fakeRes();await api.handleGenerate(req('good',genBody()),r);
  ok(r.code===200&&r.body.candidates[0].content.parts[0].text==='{"ok":1}'&&r.body.usageMetadata.totalTokenCount===128,'回覆是 generateContent 的格式');
  const sent=calls[0].contents[0].parts[0].text;ok(sent==='S1和T2、T3的課','伺服器把學生、老師姓名（含「黃老師」這種叫法）換成代號：'+sent);
  ok(calls[0].config.systemInstruction&&calls[0].config.responseMimeType==='application/json','系統說明與 JSON 設定照傳給 Vertex');
  const a=db.added[0];ok(a&&a._c==='auditLogs'&&a.uid==='u1'&&a.purpose==='adj'&&a.model==='gemini-3-flash'&&a.totalTokens===128&&/^[0-9a-f]{64}$/.test(a.promptHash)&&a.scrubbed===3,'稽核紀錄：誰、用途、模型、token 數、題目雜湊');
  ok(!JSON.stringify(a).includes('S1和'),'稽核紀錄不含題目內容');}
{const {api,calls}=setup();await api.handleGenerate(req('good',Object.assign(genBody(),{allowTeacherNames:true})),fakeRes());
  ok(calls[0].contents[0].parts[0].text==='S1和張老師、黃老師的課','老師勾選可以送老師姓名時，只換學生姓名');}
{const {api,calls}=setup({env:{AI_SERVER_DEID:'false'}});await api.handleGenerate(req('good',genBody()),fakeRes());
  ok(calls[0].contents[0].parts[0].text.includes('王小明'),'AI_SERVER_DEID=false 時伺服器不改內容（前端仍會先去識別化）');}

console.log('3. 使用次數上限');
{const {api,tick,db}=setup();const codes=[];for(let i=0;i<4;i++){const r=fakeRes();await api.handleGenerate(req('good',genBody()),r);codes.push(r.code);}
  ok(codes.join()==='200,200,200,429','每分鐘 3 次，第 4 次 429');
  const r=fakeRes();await api.handleGenerate(req('good',genBody()),r);ok(r.body.error.details.some(d=>/RetryInfo/.test(d['@type'])),'429 附上要等幾秒（前端會照著顯示）');
  tick(61000);const r2=fakeRes();await api.handleGenerate(req('good',genBody()),r2);ok(r2.code===200,'過一分鐘又可以用');
  tick(61000);await api.handleGenerate(req('good',genBody()),fakeRes());tick(61000);const r3=fakeRes();await api.handleGenerate(req('good',genBody()),r3);
  ok(r3.code===429&&JSON.stringify(r3.body).includes('PerDay'),'每天 5 次，用完回每日上限');
  ok(db.added.some(x=>x.ok===false&&x.error==='RESOURCE_EXHAUSTED'),'被擋下的也記進稽核紀錄');}

console.log('4. Vertex 的錯誤');
{const {api}=setup({vertexErr:Object.assign(new Error('quota'),{status:429})});const r=fakeRes();await api.handleGenerate(req('good',genBody()),r);ok(r.code===429,'Vertex 429 → 429');}
{const {api}=setup({vertexErr:new Error('boom')});const r=fakeRes();await api.handleGenerate(req('good',genBody()),r);ok(r.code===503&&!/boom/.test(JSON.stringify(r.body)),'其他錯誤 → 503，不洩漏內部訊息');}

console.log('5. 模型清單與快取');
{const {api,db,calls,tick}=setup();let r=fakeRes();await api.handleModels(req('good',{}),r);
  ok(r.code===200&&r.body.models.map(m=>m.name).join()==='models/gemini-3-flash,models/gemini-2.5-pro','只列 Gemini，名稱換成 models/… 的格式');
  ok(r.body.models[0].supportedGenerationMethods.includes('generateContent'),'沒有標動作的模型當成可以 generateContent');
  ok(db.data['aiCache/models']&&db.data['aiCache/models'].models.length===2,'清單存進 Firestore 快取');
  await api.handleModels(req('good',{}),fakeRes());ok(calls.filter(c=>c==='list').length===1,'一天內再問不會再找 Vertex');
  tick(864e5+1);await api.handleModels(req('good',{}),fakeRes());ok(calls.filter(c=>c==='list').length===2,'超過一天重新查');
  await api.handleModels(req('good',{refresh:true}),fakeRes());ok(calls.filter(c=>c==='list').length===3,'按重新整理時強制重查');
  r=fakeRes();await api.handleModels(req('stranger',{}),r);ok(r.code===403,'模型清單也要在共用名單裡');}
{const {api}=setup({listErr:1,env:{AI_MODELS:'gemini-2.5-flash'}});const r=fakeRes();await api.handleModels(req('good',{}),r);
  ok(r.code===200&&r.body.models[0].name==='models/gemini-2.5-flash','Vertex 查不到時用 AI_MODELS 設定的備用清單');}

console.log('6. 去識別化細節');
{const p=namePairs({students:[{name:'林小美'}],teachers:[{name:'林老師'},{name:'林大華'}]},false),q={contents:[{parts:[{text:'林小美、林大華、林老師'},{inlineData:{data:'x'}}]}]};
  scrubRequest(q,p);ok(q.contents[0].parts[0].text==='S1、T2、T1'&&q.contents[0].parts[1].inlineData.data==='x','同姓兩位老師時，只換得掉完整姓名；圖片不動');}

console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');process.exit(fail?1:0);
})();

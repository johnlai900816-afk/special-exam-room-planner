/* node test-gemini.js：用假的 fetch 和假的 localStorage 測 gemini.js 與 ai.js（不需要金鑰、不連網） */
'use strict';
const C=require('./core.js'),G=require('./gemini.js'),AI=require('./ai.js');
let fail=0;const ok=(c,m)=>{console.log((c?'  通過 ':'  失敗 ')+m);if(!c)fail++;};

// 假的儲存空間、時間、睡眠、fetch
const mem=new Map(),store={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
let NOW=1.7e12,slept=[],calls=[],queue=[];
const res=(status,body,hdr)=>({ok:status>=200&&status<300,status,json:async()=>body,headers:{get:k=>(hdr||{})[k.toLowerCase()]||null}});
G.config({store:()=>store,now:()=>NOW,sleep:async ms=>{slept.push(ms);},fetch:async(url,init)=>{calls.push({url,init});const q=queue.shift();if(!q)throw new Error('沒有準備回覆');if(q==='neterr')throw new TypeError('Failed to fetch');return typeof q==='function'?q(url,init):q;},
  signedIn:()=>false,projectId:()=>'demo-proj',idToken:async()=>'tok123'});
const mdl=(name,m,extra)=>Object.assign({name:'models/'+name,displayName:name.toUpperCase(),supportedGenerationMethods:m||['generateContent','countTokens']},extra||{});
const PAGE1={models:[mdl('gemini-2.5-pro'),mdl('gemini-2.5-flash'),mdl('text-embedding-004',['embedContent']),mdl('gemini-embedding-001',['embedContent']),
  mdl('aqa',['generateAnswer']),mdl('imagen-4.0-generate-001',['predict']),mdl('veo-3.0-generate-001',['predictLongRunning']),mdl('gemini-2.5-flash-preview-tts'),
  mdl('gemini-3-pro-preview'),mdl('gemma-3-27b-it')],nextPageToken:'p2'};
const PAGE2={models:[mdl('gemini-2.5-flash-lite'),mdl('gemini-3-flash'),mdl('gemini-flash-latest'),mdl('gemini-2.0-flash-001'),mdl('gemini-2.5-flash-image'),mdl('gemini-live-2.5-flash',['bidiGenerateContent']),mdl('gemini-2.5-pro')]};
const reply=(text,extra)=>res(200,Object.assign({candidates:[{content:{parts:[{text}]},finishReason:'STOP'}],usageMetadata:{totalTokenCount:10}},extra||{}));

(async()=>{
console.log('1. 模型清單：分頁、過濾、排序、預設');
G.setKey('AIzaTEST');queue=[res(200,PAGE1),res(200,PAGE2)];
let list=await G.listModels();
ok(calls.length===2&&/pageToken=p2/.test(calls[1].url),'會照 nextPageToken 讀下一頁');
ok(calls.every(c=>!c.url.includes('AIzaTEST')&&c.init.headers['x-goog-api-key']==='AIzaTEST'),'金鑰放在標頭，不在網址裡');
ok(list.map(m=>m.id).join()==='gemini-3-pro-preview,gemini-3-flash,gemini-2.5-pro,gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash-001,gemini-flash-latest',
  '去掉向量、問答、畫圖、影片、語音、即時、gemma，重複的只留一個；新版在前、pro > flash > lite、別名最後 → '+list.map(m=>m.id).join(' '));
ok(G.defaultModel(list)==='gemini-3-flash','預設選最新的正式版 flash（不選預覽版）');
ok(G.defaultModel(list.filter(m=>m.tier!==2))==='gemini-2.5-pro','沒有正式版 flash 時改選正式版 pro');

console.log('2. 快取一天、發現新模型、選的模型下架');
calls=[];queue=[res(200,{models:PAGE1.models.slice(0,2)})];
let r=await G.ensureModels();ok(r.fresh&&r.added.length===0&&r.list.length===2,'第一次：存起來，不算「新模型」');
r=await G.ensureModels();ok(!r.fresh&&calls.length===1,'一天內不再問 Google');
G.setModel('gemini-2.5-pro');ok(G.getModel()==='gemini-2.5-pro','使用者可以自己選模型');
NOW+=864e5+1;queue=[res(200,{models:[mdl('gemini-2.5-flash'),mdl('gemini-3-flash')]})];
r=await G.ensureModels();ok(r.fresh&&r.added.join()==='gemini-3-flash'&&r.removed.join()==='gemini-2.5-pro','過了一天自動重問，列出新增與下架的');
ok(r.dropped==='gemini-2.5-pro'&&G.getModel()==='gemini-3-flash','選的模型下架了，改回建議的');
queue=[res(200,{models:[mdl('gemini-3-flash')]})];r=await G.ensureModels({force:true});ok(r.fresh,'按重新整理時強制重問');

console.log('3. 錯誤換成白話');
const err=async(q,code,re)=>{queue=[q];try{await G.generate({prompt:'x',retries:0});ok(false,code);}catch(e){ok(e.code===code&&(!re||re.test(e.message)),code+'：'+e.message);return e;}};
await err(res(400,{error:{code:400,status:'INVALID_ARGUMENT',message:'API key not valid. Please pass a valid API key.',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'API_KEY_INVALID'}]}}),'key',/金鑰不正確/);
let e429=await err(res(429,{error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Quota exceeded',details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'37s'}]}}),'quota',/37 秒/);
ok(e429.retryAfter===37&&!e429.daily,'429 讀出要等幾秒');
let eday=await err(res(429,{error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Quota exceeded',details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]}}),'quota',/今天/);
ok(eday.daily,'每日額度用完會分辨出來');
await err(res(503,{error:{code:503,message:'overloaded'}}),'busy',/很忙/);
await err(res(404,{error:{code:404,message:'not found'}}),'model',/重新整理模型清單/);
await err(res(403,{error:{code:403,message:'Permission denied'}}),'perm');
await err('neterr','network',/連不上/);
await err(reply('',{promptFeedback:{blockReason:'SAFETY'},candidates:[]}),'safety',/安全/);
await err(res(200,{candidates:[{content:{parts:[{text:'{"a":'}]},finishReason:'MAX_TOKENS'}]}),'cut',/截斷/);
queue=[reply('不是 JSON')];try{await G.generate({prompt:'x',json:true,retries:0});ok(false,'format');}catch(e){ok(e.code==='format','回覆不是 JSON：format');}

console.log('4. 產生內容：結構化輸出、圖片、思考過程、自動重試、使用紀錄');
calls=[];slept=[];G.logClear();
queue=[res(429,{error:{code:429,status:'RESOURCE_EXHAUSTED',details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'2s'}]}}),
  res(200,{candidates:[{content:{parts:[{text:'想一想…',thought:true},{text:'```json\n{"ok":true}\n```'}]},finishReason:'STOP'}],usageMetadata:{totalTokenCount:42}})];
const sch=G.S.obj({ok:G.S.bool()});
r=await G.generate({prompt:'看圖',system:'你是助理',schema:sch,images:['data:image/jpeg;base64,QUJD'],temperature:0,kind:'tt'});
const body=JSON.parse(calls[1].init.body);
ok(slept.join()==='2000'&&calls.length===2,'每分鐘上限、等 2 秒會自動再試一次');
ok(body.generationConfig.responseMimeType==='application/json'&&body.generationConfig.responseSchema.type==='OBJECT'&&body.systemInstruction.parts[0].text==='你是助理','送出 responseMimeType、responseSchema、systemInstruction');
ok(body.contents[0].parts[0].inlineData.mimeType==='image/jpeg'&&body.contents[0].parts[0].inlineData.data==='QUJD','圖片用 inlineData 送');
ok(/\/models\/gemini-3-flash:generateContent$/.test(calls[1].url),'用選定的模型');
ok(r.json&&r.json.ok===true&&!r.text.includes('想一想'),'去掉思考過程與 ```json 外框');
const L=G.logList();ok(L.length===1&&L[0].kind==='tt'&&L[0].prompt.includes('看圖')&&L[0].reply.includes('ok')&&r.logId===L[0].id,'每次呼叫記在這台瀏覽器的使用紀錄');
G.logUpdate(r.logId,{applied:'測試',snapAt:5});ok(G.logList()[0].applied==='測試','套用之後補記套用了什麼');

console.log('5. 代理模式（學校的 AI 服務）');
G.config({signedIn:()=>true});G.setMode('');
ok(G.getMode()==='proxy'&&G.ready(),'登入雲端時預設用代理');
ok(G.getProxy()==='https://asia-east1-demo-proj.cloudfunctions.net','代理網址由 Firebase 專案推出來');
calls=[];queue=[res(200,{models:[mdl('gemini-3-flash')]}),reply('{"a":1}')];
await G.ensureModels({force:true});
r=await G.generate({prompt:'p',json:true,kind:'adj',names:false,retries:0});
ok(calls[0].url.endsWith('/aiListModels')&&calls[1].url.endsWith('/aiGenerate')&&calls.every(c=>c.init.headers.Authorization==='Bearer tok123'&&!c.init.headers['x-goog-api-key']),'代理：帶 Firebase ID token，不帶金鑰');
const pb=JSON.parse(calls[1].init.body);ok(pb.model==='gemini-3-flash'&&pb.purpose==='adj'&&pb.allowTeacherNames===false&&pb.request.contents[0].parts[0].text==='p','代理收到 model、用途、是否可送老師姓名、generateContent 的 request');
queue=[res(401,{error:{code:401,message:'no'}})];try{await G.generate({prompt:'p',retries:0});}catch(e){ok(e.code==='login','代理拒絕時提示登入或請主持人加權限');}
G.config({signedIn:()=>false});ok(G.getMode()==='browser','沒登入時退回自己的金鑰');
G.setMode('browser');G.config({signedIn:()=>true});ok(G.getMode()==='browser','老師明確選自己的金鑰時就照選的');G.setMode('');G.config({signedIn:()=>false});

console.log('6. 去識別化');
const D=C.defaultData();
const req=AI.schedRequest(D,{names:false});
ok(!D.students.some(s=>req.prompt.includes(s.name))&&!D.teachers.some(t=>req.prompt.includes(t.name)),'AI 排課的題目沒有任何學生、老師姓名');
ok(req.schema&&/^[0-9a-f]{16}$/.test(req.v)&&req.prompt.includes('"v":"'+req.v+'"'),'題目帶著版本 v，回覆要照抄');
const sc=AI.scrub(D,'王小明和王老師、林組長、張老師（國）談過',{names:false});
ok(sc.text==='S1和T2、T1、T4談過','文字裡的學生、老師姓名換成代號：'+sc.text);
ok(AI.scrub(D,'王小明和林組長',{names:true}).text==='S1和林組長','同意送老師姓名時只換學生');
ok(AI.unscrub(D,'T1 週三不行，C2 要移').startsWith('林組長'),'回覆裡的代號在本機換回名字');

console.log('7. AI 排法是候選：本機檢查、比現在好才給套用');
{const M=C.compile(D),S=C.toState(M,D),R=C.solve(M,S,{seed:1}),v=C.aiProblem(D).v;
  const slots=D.groups.map((g,i)=>({course:'C'+(i+1),keys:M.L.map((x,l)=>x.g===i?M.s2key(R.slot[l]):null).filter(Boolean)}));
  const K=AI.schedCheck(D,{v,slots},v);ok(K.viol===0&&K.r.bad.length===0,'好的排法套在複本上沒有衝突，原本的資料不動');
  ok(!D.assign.g1||!D.assign.g1.length,'檢查時不改原本的資料');
  const J=AI.schedJudge(M,S.slot,K.M,K.S.slot);ok(J.ok,'比空白課表好：可以套用');
  const J2=AI.schedJudge(K.M,K.S.slot,K.M,K.S.slot);ok(!J2.ok&&J2.why.length,'跟現在一樣好：不採用並說明原因');
  const bad=JSON.parse(JSON.stringify(slots));bad[1].keys=bad[0].keys.slice();   // 七數全部排到七國的時段：老師或學生衝堂
  const K2=AI.schedCheck(D,{v,slots:bad},v),J3=AI.schedJudge(K.M,K.S.slot,K2.M,K2.S.slot);
  ok(K2.viol>0&&!J3.ok&&/比現在/.test(J3.why[0]),'衝突變多的排法不採用：'+J3.why[0]);
  const Rp=AI.schedRepair(K2.M,K2.S,K2.out,{seed:3}),o=[];C.evaluate(K2.M,Rp.slot,o);
  ok(o.length<K2.out.length&&Rp.moved>0&&Rp.moved<K2.M.L.length,'衝突的幾節交給本機修，其餘保留（修了 '+Rp.moved+' 節）');
  let e=null;try{AI.schedCheck(D,{v:'0000',slots},'0000');}catch(x){e=x;}ok(e&&e.code==='stale','版本對不上就不套用');}

console.log('8. 用文字調整：代號、原文、檢查');
{const D2=C.defaultData(),M=C.compile(D2),R=C.solve(M,C.toState(M,D2),{seed:1}),St={slot:R.slot,pin:R.pin};
  const q=AI.adjRequest(D2,M,St,'王老師週三下午不能排，七國移到早上',{names:false});
  ok(!D2.teachers.some(t=>q.prompt.includes(t.name))&&q.said==='T2週三下午不能排，七國移到早上','送出的要求與資料都換成代號');
  const its=AI.adjCheck(D2,M,St,[
    {type:'teacherOff',teacher:'T2',keys:['2-5','2-6','2-7'],quote:'T2週三下午不能排'},
    {type:'teacherOff',teacher:'林組長',keys:['2-5','2-6','2-7'],quote:'林組長週三'},
    {type:'move',course:'C1',to:['0-1','0-2','0-3','0-4','1-1','1-2','1-3','1-4'],quote:'七國移到早上'},
    {type:'room',course:'八數',room:'資源教室二',quote:'不存在的一句'},
    {type:'teacherOff',teacher:'T99',keys:['0-1'],quote:'T2週三下午不能排'},{type:'hack'}],q.said);
  ok(its[0].ok&&/王老師/.test(its[0].text)&&!its[0].warn,'T2 換回王老師，週三下午設為不排課');
  ok(!its[1].ok&&/本來就是/.test(its[1].text),'已經是不排課的不會重複做');
  ok(its[2].ok&&its[2].act.type==='move'&&/^[01]-[1-4]$/.test(its[2].act.key),'移課：從列出的上午時段挑一個 → '+its[2].text);
  ok(its[3].ok&&/原文裡找不到/.test(its[3].warn),'原文找不到那一句的會標出來讓老師確認');
  ok(!its[4].ok&&!its[5].ok,'找不到的老師、看不懂的動作不能勾');
  const ops=AI.adjApply(D2,its.filter(x=>x.ok).map(x=>x.act));
  ok(D2.teachers[1].off.includes('2-6')&&D2.groups.find(g=>g.name==='八數').room==='B'&&ops.length===1,'套用：改不排課時段與教室，移課留到重新整理後');
  const M2=C.compile(D2),S2=C.toState(M2,D2);S2.slot.set(R.slot);const n=AI.adjLessons(M2,S2,ops),l=M2.L.findIndex(x=>M2.G[x.g].ref.id==='g1'&&x.k===ops[0].k);
  ok(n===1&&M2.s2key(S2.slot[l])===ops[0].key&&S2.pin[l]===1,'移課後固定在新的時段');}

console.log('9. 說明問題：選項由系統算，AI 只說明');
{const D3=C.defaultData();D3.teachers[1].off=C.DAYS.flatMap((d,di)=>['1','2','3','4','5','6'].map(p=>di+'-'+p));   // 王老師幾乎都不能排
  const M=C.compile(D3),S=C.toState(M,D3),R=C.solve(M,S,{seed:1}),out=[];C.evaluate(M,R.slot,out);
  const q=AI.explainRequest(D3,M,{slot:R.slot,pin:R.pin},out,{names:false});
  ok(out.length>0&&q.options.length>0&&q.options.every(o=>o.teacher==='T2'||/^T\d+$/.test(o.teacher)),'找得到「哪位老師哪一節可以排就解得開」的選項（'+q.options.length+' 個）');
  ok(!D3.teachers.some(t=>q.prompt.includes(t.name))&&!D3.students.some(s=>q.prompt.includes(s.name)),'送出的說明題目沒有姓名');}

console.log('10. 全校課表看圖：只能從名單挑、看把握程度');
{const known=new Set(['王大明','陳老師','林英華']);
  ok(AI.ttRequest('data:image/jpeg;base64,QQ==','701',known).schema.properties.entries.items.properties.teacher.enum.includes('王大明'),'老師欄限定只能填名單上的名字');
  const m=AI.ttMerge([['國語文','王小明x',5,1],['數學','陳老師',4,0],['理化','??',3,1]],{class:'班級 701',entries:[
    {subject:'國語文',seen:'王大明',teacher:'王大明',confidence:0.9,periods:5},{subject:'數學',seen:'陳老帥',teacher:'林英華',confidence:0.8,periods:4},
    {subject:'理化',seen:'??',teacher:'林英華',confidence:0.3,periods:3},{subject:'英語文',seen:'劉某',teacher:'劉自編',confidence:0.99,periods:3}]},known);
  ok(m.rows[0].t==='王大明'&&!m.rows[0].unk&&m.rows[0].was==='王小明x'&&/90%/.test(m.rows[0].sug),'認不出的換成名單上的名字，標出原本認成什麼、把握多少');
  ok(m.rows[1].t==='陳老師'&&/看成/.test(m.rows[1].sug),'原本認得的不會被換掉，只標出 AI 看法不同');
  ok(m.rows[2].unk&&/不確定/.test(m.rows[2].sug),'把握太低的不採用');
  ok(m.rejected===1&&!m.rows.some(r=>r.t==='劉自編')&&m.cls==='701'&&m.changed===1,'名單上沒有的名字一律略過，不會自己編');}

console.log('11. 這台瀏覽器的設定不會跑到名冊資料裡');
{const D4=C.defaultData();G.setKey('AIzaSECRET');G.setNamesOk(true);const j=JSON.stringify(D4);
  ok(!j.includes('AIzaSECRET')&&[...mem.keys()].every(k=>k.startsWith('rc-gemini-')),'金鑰、模型、紀錄都只在 rc-gemini-* 這幾個 localStorage 欄位');
  G.forget();ok(mem.size===0,'「全部清除」會清掉金鑰、模型、紀錄');}

console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

/* node test-tt.js：全校課表（整張格子）——節次對應、AI 回覆的檢查、存進 D.tt、一次改名字、查詢函式，以及用假的 Gemini 從頭跑一次（不連網） */
'use strict';
const C=require('./core.js'),G=require('./gemini.js'),TTR=require('./tt.js'),FX=require('./test-tt-data.js');
let fail=0;const ok=(c,m)=>{console.log((c?'  通過 ':'  失敗 ')+m);if(!c)fail++;};
const mem=new Map(),store={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
// 名冊：課表上的老師都在名冊裡（虛構）
function sample(){const D=C.defaultData();D.teachers=FX.TEACHERS.map((n,i)=>({id:'t'+i,name:n,role:'普通班',off:[],note:''}));D.classSubj={};D.classHead={};
  D.students=[{id:'s1',cls:'701',seat:'01',name:'學生甲',caseMgr:'',needs:[]},{id:'s2',cls:'801',seat:'02',name:'學生乙',caseMgr:'',needs:[]}];return D;}
const cnt=(o,k)=>(o.flags||[]).filter(f=>f.k===k).length;

(async()=>{
console.log('1. 節次對應');
{const D=sample();
  ok(['第一節','第1節','1','一','第 一 節'].every(l=>C.ttPeriodId(D,l)==='1'),'第一節／第1節／1／一 都對到第 1 節');
  ok(C.ttPeriodId(D,'第七節')==='7'&&C.ttPeriodId(D,'早自習')==='m','第七節、早自習（extra）對得到');
  ok(C.ttPeriodId(D,'第八節')===''&&C.ttPeriodId(D,'午休')==='','作息沒有的第八節、午休回空字串');
  D.periods.push({id:'8',name:'第8節',start:'16:05',end:'16:50',extra:true});
  ok(C.ttPeriodId(D,'第八節')==='8','作息有第8節（extra）就對到它');
  const E=sample();E.periods=[{id:'a',name:'早修',extra:true},{id:'p1',name:'一'},{id:'p2',name:'二'}];
  ok(C.ttPeriodId(E,'第二節')==='p2'&&C.ttPeriodId(E,'早自習')==='a','節次名稱是「一、二」、id 不是數字也對得到；早自習對到「早修」');
  ok(C.ttLabelNorm('第十節')==='第10節'&&C.ttLabelNorm('早 自 習')==='早自習','第十節、去空白');}

console.log('2. 檢查 AI 的回覆、存進 D.tt');
{const D=sample(),K=C.ttHintNames(D);
  const e=C.ttGridCheck(D,FX.answer('701',false)),T=FX.truth('701');
  ok(e.cls==='701'&&e.head==='李惠婷','班級、導師');
  ok(e.grid.length===5&&e.grid.every(r=>r.length===7)&&e.pids.join()==='1,2,3,4,5,6,7','格子是 5 天 × 7 個一般節次');
  ok(e.grid[1][2].s===T.cells[1][3].s&&e.grid[1][2].t===T.cells[1][3].t,'週二第3節放在 grid[1][2]');
  ok(e.gridExtra.m&&e.gridExtra.m[2].s==='閱讀'&&e.gridExtra['第8節']&&e.gridExtra['第8節'].filter(Boolean).length===3,'早自習存在 extra 節次 m，作息沒有的第8節用標籤存');
  const o=C.ttGridStore(D,'701',e,{src:'a.pdf 第 1 頁',known:K});
  ok(o.flags.length===0,'讀對的一頁沒有待核對（統計含第8節、早自習也對得上）'+(o.flags.length?' → '+o.flags.map(f=>f.m).join('；'):''));
  ok(D.classHead['701']==='李惠婷','導師空白時填進 D.classHead');
  ok(o.subj['國語文'][0][0]==='李惠婷'&&o.subj['國語文'][0][1]===T.summary.find(x=>x.subject==='國語文').periods,'統計（subj）由格子＋下方統計推出');
  ok(C.ttTeachers(D.tt,'701','國文').join()==='李惠婷'&&C.ttTeachers(D.tt,'701','英文').join()==='郭嘉琳','段考用的 ttTeachers 照常可用');
  D.classHead['702']='原本的導師';C.ttGridStore(D,'702',C.ttGridCheck(D,FX.answer('702',false)),{known:K});
  ok(D.classHead['702']==='原本的導師','已經有導師就不蓋掉');
  const bad=C.ttGridCheck(D,{class:'七年一班',grid:[{day:9,period:'第1節',subject:'數學',teacher:'王大明'},{day:'一',period:'第一節',subject:'國文',teacher:'李惠婷 老師'},{day:1,period:'第1節',subject:'數學',teacher:'王大明'}],summary:[]});
  ok(bad.cls===''&&bad.grid[0][0].s==='數學'&&bad.dups.length===1&&bad.skipped.length===1,'星期超出範圍的略過；同一格讀到兩種記下來；「國文」→國語文、「老師」去掉');
  const o2=C.ttGridStore(D,'?3',bad,{known:K});ok(cnt(o2,'cls')===1&&cnt(o2,'dup')===1,'班級編號看不清楚、同一格兩種都列待核對');}

console.log('3. 名單比對、格子和統計對不上');
{const D=sample(),K=C.ttHintNames(D);
  ['701','702','801'].forEach(c=>C.ttGridStore(D,c,C.ttGridCheck(D,FX.answer(c)),{known:K}));
  const a=D.tt['701'],b=D.tt['702'],c=D.tt['801'];
  ok(cnt(a,'name')===1&&a.flags.find(f=>f.k==='name').t==='李惠亭','701：名單上沒有的「李惠亭」標出來');
  ok(cnt(a,'count')===2,'701：李惠亭 1 節／李惠婷少 1 節，和統計對不上（2 處）');
  ok(cnt(b,'count')===4&&b.flags.some(f=>f.k==='count'&&f.s==='數學'),'702：數學看成生物，數學、生物的節數都和統計不同');
  ok(cnt(c,'unsure')===1&&c.flags.length===1,'801：AI 說沒把握的那一格列出來，其他沒事');
  ok(a.subj['國語文'].some(x=>x[0]==='李惠亭'&&x[2]===1),'名單上沒有的名字在 subj 標成待確認（更新任課老師不會用）');
  const L=C.ttNameList(D,K);
  ok(L.length===1&&L[0].t==='李惠亭'&&L[0].n===2&&L[0].cls.join()==='701,702'&&L[0].sug==='李惠婷','一次改名字：同一個錯字跨兩班列成一筆，建議「李惠婷」');
  const n=C.ttRename(D,'李惠亭','李惠婷');
  ok(n===2&&cnt(a,'name')===0&&cnt(a,'count')===0&&cnt(b,'name')===0,'全部改：兩班各一格改好，701 的待核對清空');
  ok(cnt(b,'count')===2,'702 只剩數學／生物那兩處');
  // 把看錯的那一格改回數學
  let fixed=false;const tr=FX.truth('702');b.grid.forEach((r,d)=>r.forEach((v,i)=>{if(!fixed&&v&&v.s==='生物'&&tr.cells[d][i+1].s==='數學'){r[i]={s:'數學',t:tr.cells[d][i+1].t};fixed=true;}}));
  C.ttGridRecheck(D,'702',K);ok(fixed&&b.flags.length===0,'改回數學之後 702 沒有待核對');
  c.ok=1;C.ttGridRecheck(D,'801',K);ok(c.flags.length===0,'老師按「接受」（ok）之後不再列');
  D.ttOk=['新老師'];ok(C.ttHintNames(D).has('新老師'),'按過「名字沒錯」的名字算在名單裡');
  // 只有統計（離線辨識）的班也改得到
  C.ttStore(D,'901',[{sj:'數學',t:'王大朋',n:4,unk:true}],'ocr');ok(C.ttRename(D,'王大朋','王大明')===1&&D.tt['901'].subj['數學'][0][0]==='王大明'&&D.tt['901'].subj['數學'][0][2]===0,'只有統計的班（離線辨識）一起改');}

console.log('4. 給別的功能用的查詢');
{const D=sample(),K=C.ttHintNames(D);['701','702','801'].forEach(c=>C.ttGridStore(D,c,C.ttGridCheck(D,FX.answer(c,false)),{known:K}));
  const T=FX.truth('701'),busy=C.ttTeacherBusy(D);
  const want=new Set();['701','702','801'].forEach(c=>FX.truth(c).cells.forEach((r,d)=>r.forEach((x,p)=>{if(x&&x.t==='李惠婷'&&p>=1&&p<=7)want.add(d+'-'+p);if(x&&x.t==='李惠婷'&&p===0)want.add(d+'-m');})));
  ok(busy['李惠婷']instanceof Set&&[...want].every(k=>busy['李惠婷'].has(k))&&busy['李惠婷'].size===want.size,'ttTeacherBusy：李惠婷在各班上課的時段（含早自習，不含作息沒有的第8節）');
  ok(C.ttClassSubjectAt(D,'701','1-3')===T.cells[1][3].s&&C.ttClassSubjectAt(D,'701','2-m')==='閱讀','ttClassSubjectAt：週二第3節、週三早自習');
  ok(C.ttClassSubjectAt(D,'999','0-1')===null&&C.ttClassSubjectAt(D,'701','7-1')===null&&C.ttClassSubjectAt(D,'701','x')===null,'沒有的班、星期超出、格式不對都回 null');
  ok(C.ttStudentMissed(D,'s2','0-1')===FX.truth('801').cells[0][1].s&&C.ttStudentMissed(D,'nobody','0-1')===null,'ttStudentMissed：學生被抽離時原班在上的科目');
  ok(JSON.stringify(C.ttCellAt(D,'701','0-1'))===JSON.stringify(T.cells[0][1]),'ttCellAt 回 {s,t}');
  // 作息改了（多一節、順序變），用存的 pids 還是查得到
  D.periods.splice(1,0,{id:'x',name:'第0節'});ok(C.ttClassSubjectAt(D,'701','1-3')===T.cells[1][3].s,'作息之後改了，舊課表照 pids 查得到');}

console.log('5. 假的 Gemini：送出的內容、從頭讀一頁');
{G.config({store:()=>store,now:()=>1.7e12,sleep:async()=>{},signedIn:()=>false,projectId:()=>'demo'});G.setKey('AIzaFAKE');G.setModel('gemini-3-flash');
  const D=sample(),K=C.ttHintNames(D),sent=[];
  G.config({fetch:async(url,init)=>{sent.push({url,body:JSON.parse(init.body)});return {ok:true,status:200,json:async()=>FX.reply(FX.answer('801')),headers:{get:()=>null}};}});
  const r=await TTR.readPage('data:image/jpeg;base64,QUJD',K,{D});
  const b=sent[0].body,parts=b.contents[0].parts,gc=b.generationConfig;
  ok(parts[0].inlineData&&parts[0].inlineData.mimeType==='image/jpeg'&&parts[0].inlineData.data==='QUJD','圖片用 inlineData 送');
  ok(gc.responseMimeType==='application/json'&&gc.responseSchema.properties.grid.items.properties.period.enum.includes('第8節')&&gc.temperature===0,'用 responseSchema（節次限定寫法）、temperature 0');
  ok(/李惠婷/.test(parts[1].text)&&/國語文/.test(parts[1].text)&&!/學生甲/.test(JSON.stringify(b)),'題目附老師名單和科目用詞；沒有學生資料');
  ok(r.e.cls==='801'&&r.e.unsure.length===1&&r.logId,'回覆整理好，記在使用紀錄');
  const log=G.logList().pop();ok(log.kind==='ttgrid'&&log.images===1,'使用紀錄：種類 ttgrid、1 張圖');
  C.ttGridStore(D,r.e.cls,r.e,{known:K});ok(D.tt['801'].flags.length===1&&D.classHead['801']==='蔡依珊','存進 D.tt');
  // 代理模式：帶 allowTeacherNames
  G.config({signedIn:()=>true,idToken:async()=>'tok'});G.setMode('proxy');sent.length=0;
  await TTR.readPage('data:image/jpeg;base64,QUJD',K,{D});ok(/aiGenerate$/.test(sent[0].url)&&sent[0].body.allowTeacherNames===true&&sent[0].body.purpose==='ttgrid','代理模式：送到 aiGenerate、可以送老師姓名、用途 ttgrid');
  G.setMode('browser');
  // 回覆不是 JSON：format 錯誤（排隊會再試）
  G.config({fetch:async()=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'不是 JSON'}]},finishReason:'STOP'}]}),headers:{get:()=>null}})});
  let err=null;try{await TTR.readPage('data:image/jpeg;base64,QUJD',K,{D});}catch(e){err=e;}ok(err&&err.code==='format','回覆不是 JSON 時丟出 format 錯誤');}

console.log('6. 排隊：同時兩頁、再試、整批停下、取消');
{let run=0,peak=0;const waits=[];const items=[1,2,3,4,5];const tries={};
  const R=await TTR.runQueue(items,async x=>{run++;peak=Math.max(peak,run);await new Promise(r=>setTimeout(r,5));run--;tries[x]=(tries[x]||0)+1;
    if(x===2&&tries[x]<3){const e=new Error('忙');e.code='busy';e.retryAfter=7;throw e;}if(x===4){const e=new Error('壞');e.code='safety';throw e;}return x*10;},
    {conc:2,sleep:async ms=>{waits.push(ms);},onUpdate:()=>{}});
  ok(peak===2,'同時最多兩頁');
  ok(R.res[1].ok&&R.res[1].v===20&&tries[2]===3&&waits.join()==='7000,12000','忙的時候照伺服器的秒數或 4／12／30 秒再試（第 2 頁試第 3 次成功）');
  ok(!R.res[3].ok&&R.res[3].e.code==='safety'&&R.res[4].ok&&!R.halt,'被安全規則擋的那一頁算失敗，其他照讀');
  const R2=await TTR.runQueue([1,2,3,4],async x=>{if(x===1){const e=new Error('登入');e.code='login';throw e;}await new Promise(r=>setTimeout(r,5));return x;},{conc:2,sleep:async()=>{}});
  ok(R2.halt&&R2.halt.code==='login'&&R2.res[2].skip&&R2.res[3].skip,'要登入這類錯誤：整批停下，還沒開始的不送');
  const day=await TTR.runQueue([1,2,3],async()=>{const e=new Error('今天用完');e.code='quota';e.daily=true;throw e;},{conc:1,sleep:async()=>{}});
  ok(day.halt&&day.halt.daily&&day.res[1].skip,'每日額度用完也整批停下，不再試');
  const ac=new AbortController();const R3=await TTR.runQueue([1,2,3,4,5],async x=>{if(x===2)ac.abort();await new Promise(r=>setTimeout(r,5));return x;},{conc:1,signal:ac.signal,sleep:async()=>{}});
  ok(R3.res.filter(r=>r.ok).length===2&&R3.res[4].skip,'按取消：正在讀的讀完，後面的不送');}

console.log('7. 估計');
{const a=TTR.estimate(30,'proxy'),b=TTR.estimate(2,'browser');
  ok(a.req===30&&a.min>=6&&a.ntd>=5&&a.ntd<=20,'30 頁：30 次呼叫，至少 6 分鐘（每分鐘 10 次），費用約 NT$'+a.ntd+'，約 '+a.min+' 分鐘');
  ok(b.req===2&&b.min===1,'2 頁：約 1 分鐘');}

console.log(fail?'\n有 '+fail+' 項失敗':'\n全部通過');process.exitCode=fail?1:0;
})();

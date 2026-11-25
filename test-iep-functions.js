/* node test-iep-functions.js：用假的 Firestore 測 Cloud Functions 的邏輯（不連網路、不需要 firebase 套件） */
'use strict';
const F=require('./functions/iep-core.js'),I=require('./iep.js'),C=require('./core.js');
let fail=0;
const ok=(c,m)=>{console.log((c?'  通過 ':'  失敗 ')+m);if(!c)fail++;};

// 假的資料庫：交易內的寫入在成功結束時一次寫入；中途丟錯就全部不寫
function fakeDb(){const S=new Map();
  const snap=p=>({exists:S.has(p),data:()=>S.has(p)?JSON.parse(JSON.stringify(S.get(p))):undefined});
  return {S,doc:p=>({path:p}),
    async runTransaction(fn){const W=[];let wrote=false;const tx={get:async r=>{if(wrote)throw new Error('交易裡要先讀完再寫');return snap(r.path);},set:(r,d)=>{wrote=true;W.push([r.path,d]);}};
      const out=await fn(tx);W.forEach(([p,d])=>S.set(p,JSON.parse(JSON.stringify(d))));return out;}};}
const errOf=async p=>{try{await p;return null;}catch(e){return e.code||'?';}};

(async()=>{
  // 用範例資料做出一份真的公開內容（跟 app 發布時一樣的函式）
  const D=C.defaultData();D.classHead={'701':'張老師（國）'};
  const R=I.newRound(D,{stu:['s1','s2']});R.due='2026-12-05';I.setRange(D,R,'2026-11-30','2026-12-04',['1','2','3']);
  I.addOther(D,R,R.meets[0],'王媽媽','家長',1);R.par=1;
  const LOC={},list=I.ensureTokens(D,R,LOC),tea=list.find(o=>o.teacher),par=list.find(o=>!o.teacher);
  const db=fakeDb();let T=new Date(2026,10,28,9).getTime();
  const api=F.makeIep({db,now:()=>T});
  for(const o of list){const d=I.publicDoc(D,R,o,{}),h=R.tokH[o.k];d.exp=d.expMs;delete d.expMs;d.r=R.id;d.pk=o.k;db.S.set('iepTok/'+h,d);}
  const kT=I.linkTok(R,LOC,tea.k),kP=I.linkTok(R,LOC,par.k);
  ok(await I.tokHash(kT)===F.sha(kT)&&I.sha256hex(kT)===F.sha(kT)&&R.tokH[tea.k]===F.sha(kT),'瀏覽器（同步、非同步）和 Function 算出來的鑰匙雜湊一樣（文件名稱不是鑰匙本身）');

  const g=await api.getSurvey({k:kT},{ip:'1.2.3.4'});
  ok(g.name===I.salute(tea.name,'',true)&&g.keys.length===15&&g.resp===null,'拿得到公開內容：稱呼、15 個節次，還沒有回覆');
  ok(!('pk' in g)&&!('r' in g)&&!('by' in g),'不會回傳出席者代號、調查 id 等內部資料');
  ok(!D.students.some(s=>JSON.stringify(g).includes(s.name)),'回傳內容沒有學生姓名');
  ok(await errOf(api.getSurvey({k:'short'},{}))==='invalid-argument','鑰匙格式不對直接拒絕');
  ok(await errOf(api.getSurvey({k:'A'.repeat(24)},{ip:'9.9.9.9'}))==='not-found','猜的鑰匙找不到');

  // 送出
  const free=[g.keys[0],g.keys[3]];
  const s1=await api.submit({k:kT,free,note:' 週三下午不行\u0007 '},{ip:'1.2.3.4'});
  const rp='iepResp/'+R.id+'/r/'+F.sha(kT),saved=db.S.get(rp);
  ok(s1.ok&&saved&&saved.n===1&&saved.pk===tea.k&&saved.free.join()===free.join(),'回覆寫進只有成員讀得到的 iepResp/調查/r/雜湊');
  ok(saved.note==='週三下午不行','備註去掉控制字元與前後空白');
  ok(await errOf(api.submit({k:kT,free:['2099-01-01|1']},{ip:'1.2.3.4'}))==='invalid-argument','不在調查範圍的節次拒絕');
  ok(await errOf(api.submit({k:kT,free:'all'},{ip:'1.2.3.4'}))==='invalid-argument','格式不對拒絕');
  ok(await errOf(api.submit({k:kT,free:[],note:{x:1}},{ip:'1.2.3.4'}))==='invalid-argument','備註不是文字拒絕');
  ok(await errOf(api.submit({k:kT,free:[],note:'x'.repeat(5000)},{ip:'1.2.3.4'}))===null&&db.S.get(rp).note.length===300,'備註太長只留 300 字');
  ok(db.S.get(rp).n===2,'老師期限前可以再改（第 2 次）');
  const g2=await api.getSurvey({k:kT},{ip:'1.2.3.4'});ok(g2.resp&&g2.resp.n===2,'再打開連結看得到自己上次的回覆');

  // 家長：只能送一次
  ok((await api.submit({k:kP,free:[g.keys[1]]},{ip:'5.5.5.5'})).ok,'家長送出第一次');
  ok(await errOf(api.submit({k:kP,free:[]},{ip:'5.5.5.5'}))==='failed-precondition','家長的連結不能送第二次');

  // 讀回 app：applyWeb 照 pk 對回出席者
  const resp=db.S.get('iepResp/'+R.id+'/r/'+F.sha(kP));ok(I.applyWeb(R,par,{free:resp.free,note:resp.note,at:resp.at}),'app 抓回回覆後對得上是哪一位');

  // 過期
  T=new Date(2026,11,6,0,0,1).getTime();
  ok(await errOf(api.getSurvey({k:kT},{ip:'1.2.3.4'}))==='not-found','過了期限（12/5 23:59:59）就打不開');
  ok(await errOf(api.submit({k:kT,free:[]},{ip:'1.2.3.4'}))==='not-found','過了期限不能送出');
  T=new Date(2026,10,29,9).getTime();

  // 次數限制：同一個鑰匙 10 分鐘 30 次；同一個 IP 10 分鐘 120 次
  const db2=fakeDb(),api2=F.makeIep({db:db2,now:()=>T});db2.S.set('iepTok/'+F.sha(kT),db.S.get('iepTok/'+F.sha(kT)));
  let first=-1;for(let i=1;i<=35;i++){const e=await errOf(api2.getSurvey({k:kT},{ip:'7.7.7.'+i}));if(e==='resource-exhausted'&&first<0)first=i;}
  ok(first===31,'同一個鑰匙第 31 次被擋（'+first+'）');
  T+=11*60e3;ok(await errOf(api2.getSurvey({k:kT},{ip:'7.7.7.1'}))===null,'過 10 分鐘就恢復');
  let firstIp=-1;for(let i=1;i<=125;i++){const e=await errOf(api2.getSurvey({k:I.token()},{ip:'8.8.8.8'}));if(e==='resource-exhausted'&&firstIp<0)firstIp=i;}
  ok(firstIp===121,'同一個 IP 亂猜鑰匙，第 121 次被擋（'+firstIp+'）');
  ok([...db2.S.keys()].filter(k=>k.startsWith('iepRate/')).every(k=>!/8\.8\.8\.8|7\.7\.7/.test(k)),'次數紀錄只存 IP 的雜湊，不存 IP 本身');

  // 全部加起來每分鐘 300 次：換 IP、換鑰匙也擋得住
  const db3=fakeDb(),api3=F.makeIep({db:db3,now:()=>T});let firstAll=-1;
  for(let i=1;i<=305;i++){const e=await errOf(api3.getSurvey({k:I.token()},{ip:'10.0.'+(i>>8)+'.'+(i&255)}));if(e==='resource-exhausted'&&firstAll<0)firstAll=i;}
  ok(firstAll===301,'全部加起來每分鐘第 301 次被擋（'+firstAll+'）');
  T+=61e3;ok(await errOf(api3.getSurvey({k:I.token()},{ip:'10.9.9.9'}))==='not-found','過一分鐘又可以查');

  // 對外 IP：只信 Google 前端加在 x-forwarded-for 最後面的那一個
  const rq=(xff,ip)=>({rawRequest:{headers:xff==null?{}:{'x-forwarded-for':xff},ip}});
  ok(F.ipOf(rq('1.1.1.1, 203.0.113.9'))==='203.0.113.9','用戶端自己帶的 x-forwarded-for（前面）不算，取最後一個');
  ok(F.ipOf(rq('203.0.113.9'))==='203.0.113.9'&&F.ipOf(rq(' 9.9.9.9 ,  203.0.113.7 '))==='203.0.113.7','只有一個、或有空白也對');
  ok(F.ipOf(rq(null,'198.51.100.2'))==='198.51.100.2'&&F.ipOf(rq('', '198.51.100.3'))==='198.51.100.3','沒有標頭時用 rawRequest.ip');
  ok(F.ipOf({})===''&&F.ipOf(null)===''&&F.ipOf(rq(['5.5.5.5','203.0.113.1']))==='203.0.113.1','沒有請求、或標頭是陣列也不會出錯');
  const many=[];for(let i=0;i<5;i++)many.push(F.ipOf(rq('6.6.6.'+i+', 203.0.113.50')));
  ok(new Set(many).size===1,'換前面的假 IP 不能換到新的次數額度');

  console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

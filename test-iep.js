/* node test-iep.js：IEP 會議時間調查（只用範例資料與虛構資料） */
'use strict';
const C=require('./core.js'),I=require('./iep.js');
let fail=0;
const ok=(c,m)=>{console.log((c?'  通過 ':'  失敗 ')+m);if(!c)fail++;};


// 範例資料先排好課，才有「資源班上課」可以標
function sample(){const D=C.defaultData(),M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:1});D.assign=C.fromState(M,R);D.classHead={'701':'張老師（國）','702':'吳'};return D;}

// 1. 出席名單自動帶入
{
  const D=sample();I.ensure(D);D.iep.cfg.admin=[['t:r1','特教組長',0],['n:輔導主任','輔導主任',0]];
  const s1=D.students.find(s=>s.id==='s1');   // 701 王小明，個管 r1（林組長）
  const p=I.derive(D,'s1'),get=id=>p.find(x=>x[0]===id);
  ok(get('t:'+s1.caseMgr)&&get('t:'+s1.caseMgr)[2]===1,'個管老師自動帶入，而且是必要出席');
  ok(get('t:k1')&&/導師/.test(get('t:k1')[1])&&get('t:k1')[2]===1,'導師從 D.classHead（姓名）帶入，對回名冊的老師');
  const res=D.groups.filter(g=>g.students.includes('s1')).map(g=>'t:'+g.teacher);
  ok(res.every(x=>get(x)&&/資源班|個管/.test(get(x)[1])),'有教他的資源班老師都帶入');
  ok(new Set(p.map(x=>x[0])).size===p.length,'同一個人只列一次（個管兼資源班、組長兼個管合併身分）');
  ok(/特教組長/.test(get('t:r1')[1])&&get('t:r1')[2]===1,'行政（特教組長）帶入；他本身是個管，所以仍是必要');
  ok(get('n:輔導主任')&&get('n:輔導主任')[2]===0,'名冊沒有的行政用姓名帶入，預設邀請');
  const subs=D.groups.filter(g=>g.students.includes('s1')).map(g=>g.subject);
  ok(subs.every(sj=>{const id=D.classSubj['701|'+sj];return !id||get('t:'+id);}),'學生在資源班上的科目，原班任課老師自動帶入');
  ok(p.filter(x=>/^任課$/.test(x[1])).every(x=>x[2]===0),'只是任課老師的預設是邀請（非必要）');
  ok(I.derive(D,'s5').some(x=>x[0]==='t:k2'&&/導師/.test(x[1])),'導師只寫姓（吳）也對得上吳老師（國）');
  ok(I.subjOptions(D,'s1').length>=3,'可以再手動勾選這一班其他科的任課老師');
  // 手動修改後重新帶入：手動加的和改過的必要保留，手動刪掉的不回來
  const R=I.newRound(D,{stu:['s1'],slots:[['2026-12-08','3']]}),m=R.meets[0];
  I.addOther(D,R,m,'王媽媽','家長',1);I.removePerson(R,m,'n:輔導主任');I.setReq(m,'t:k1',0);
  I.rederive(D,R,m);
  ok(m.p.some(x=>R.ppl[x[0].slice(2)]&&R.ppl[x[0].slice(2)].n==='王媽媽'),'重新帶入後家長還在');
  ok(!m.p.some(x=>x[0]==='n:輔導主任'),'手動刪掉的人不會被重新帶回來');
  ok(m.p.find(x=>x[0]==='t:k1')[2]===0,'手動改成邀請的不會被改回必要');
}

// 2. 時段與自動標出有課
{
  const D=sample(),M=C.compile(D),S=C.toState(M,D);
  const l=M.L.findIndex((x,l)=>S.slot[l]>=0&&M.G[x.g].t>=0),s=S.slot[l],g=M.G[M.L[l].g],t=D.teachers[g.t];
  const day=Math.floor(s/M.NP),pid=D.periods[s%M.NP].id;
  const date=['2026-12-07','2026-12-08','2026-12-09','2026-12-10','2026-12-11'][day];   // 12/7 是週一
  const R=I.newRound(D,{stu:D.students.filter(x=>D.groups.some(gg=>gg.teacher===t.id&&gg.students.includes(x.id))).slice(0,1).map(x=>x.id),slots:[[date,pid],['2026-12-12','3']]});
  if(!R.meets[0].p.some(x=>x[0]==='t:'+t.id))I.addPerson(D,R,R.meets[0],'t:'+t.id,'資源班',1);
  const b=I.busyOf(D,R);
  ok(b['t:'+t.id]&&/資源班上課/.test(b['t:'+t.id][I.key(date,pid)]),'資源班老師這一節有課，自動標成不可（'+t.name+' '+I.slotInfo(D,I.key(date,pid)).label+'）');
  ok(!b['t:'+t.id]||!b['t:'+t.id]['2026-12-12|3'],'週六沒有課表，不會亂標');
  ok(I.status(R,b,'t:'+t.id,I.key(date,pid)).auto,'沒回覆時用系統查到的');
  I.record(R,'t:'+t.id,I.key(date,pid),'y');
  ok(I.status(R,b,'t:'+t.id,I.key(date,pid)).v==='y','老師自己回「可」（例：可以調課）就以回覆為準');
  // 自訂時間：和第 5、6 節重疊
  const f=I.slotInfo(D,'2026-12-08|13:30-14:30');
  ok(f.custom&&f.pis.length===2&&f.w===1,'自訂時間會對到重疊的節次');
  ok(I.dateRange('2026-12-01','2026-12-12',[2,4]).length===4,'日期區間挑星期幾');
  ok(I.keysOf({slots:I.genSlots(['2026-12-08','2026-12-09'],['3','4'])}).length===4,'日期 × 節次產生時段');
}

// 3. 每位老師一張調查單
{
  const D=sample(),R=I.newRound(D,{stu:['s1','s2','s3','s4'],slots:[['2026-12-08','3'],['2026-12-08','4']]});
  const L=I.consolidate(D,R,{});
  ok(new Set(L.map(o=>o.k)).size===L.length,'一位老師只有一張');
  const cm=L.find(o=>o.k==='t:r1');
  ok(cm&&cm.meets.length===R.meets.filter(m=>m.p.some(x=>x[0]==='t:r1')).length&&cm.meets.length>=2,'被好幾場邀請的老師，一張單子列出全部學生（'+(cm?cm.meets.length:0)+' 位）');
  ok(L.every(o=>o.teacher),'預設不印家長');
  I.addOther(D,R,R.meets[0],'王媽媽','家長',1);
  ok(I.consolidate(D,R,{all:true}).some(o=>o.name==='王媽媽'),'勾「家長也印」就會有家長的');
  const G=I.grid(D,I.keysOf(R));ok(G.dates.length===1&&G.cols.length===2,'調查單格子：日期 × 節次');
}

// 4. 單場排名
{
  const D=sample(),R=I.newRound(D,{stu:['s1'],slots:[['2026-12-14','2'],['2026-12-14','3'],['2026-12-14','4']]}),m=R.meets[0];
  m.p.forEach(x=>{I.record(R,x[0],'2026-12-14|2','y');I.record(R,x[0],'2026-12-14|3','y');I.record(R,x[0],'2026-12-14|4','y');});
  const req=m.p.find(x=>x[2]),opt=m.p.find(x=>!x[2]);
  I.record(R,req[0],'2026-12-14|2','n');if(opt)I.record(R,opt[0],'2026-12-14|3','n');
  const r=I.rank(D,R,m,{});
  ok(r[0].k==='2026-12-14|4'&&r[0].ok,'必要和選邀的都能來的排第一');
  ok(!r[2].ok&&r[2].k==='2026-12-14|2'&&r[2].bad.length===1,'必要出席的人不行的排最後，並列出是誰');
  ok(!opt||(r[1].ok&&r[1].miss.length===1),'只有選邀的人不行，還是可以開，排中間');
}

// 5. 全部一起排：不讓同一位老師、同一間教室同時兩場
{
  // 虛構：5 位學生都同一位個管、同一位導師，只有 3 個時段 → 不可能全排，且不能重複
  const D=C.emptyData();D.teachers=[{id:'a',name:'甲老師',role:'資源班',off:[]},{id:'b',name:'乙老師',role:'普通班',off:[]},{id:'c',name:'丙老師',role:'資源班',off:[]}];
  D.students=[1,2,3,4,5].map(i=>({id:'s'+i,cls:'701',seat:String(i),name:'學生'+i,caseMgr:i<=3?'a':'c',needs:[]}));D.classHead={'701':'乙老師'};
  const sl=[['2026-12-08','1'],['2026-12-08','2'],['2026-12-08','3']];
  D.periods=[{id:'1',name:'第1節',start:'08:20',end:'09:05'},{id:'2',name:'第2節',start:'09:15',end:'10:00'},{id:'3',name:'第3節',start:'10:10',end:'10:55'}];
  const R=I.newRound(D,{stu:D.students.map(s=>s.id),slots:sl});
  let res=I.schedule(D,R,{busy:{}});I.applyPlan(R,res);
  ok(Object.keys(res.at).length===3&&res.un.length===2,'導師是共同必要出席：3 個時段最多排 3 場，其餘列為排不進去');
  ok(I.conflicts(D,R).length===0,'排出來沒有人同時兩場');
  ok(res.un.every(u=>/其他會議/.test(u.why)),'排不進去有說明原因');
  // 導師改成邀請：甲老師的 3 場要分開，丙老師的 2 場分開，可以同時開兩場 → 需要兩間教室
  R.meets.forEach(m=>I.setReq(m,'t:b',0));R.rooms=['會議室'];
  res=I.schedule(D,R,{busy:{}});
  ok(res.un.length===2,'只有一間會議室：同一時段只能一場');
  R.rooms=['會議室','資源教室一'];res=I.schedule(D,R,{busy:{}});I.applyPlan(R,res);
  ok(res.un.length===0,'兩間教室就全部排得進去');
  ok(I.conflicts(D,R).length===0,'沒有老師重複、教室也不重複');
  const byKey={};R.meets.forEach(m=>{(byKey[m.at]=byKey[m.at]||[]).push(m);});
  ok(Object.values(byKey).every(a=>a.length<=2&&new Set(a.map(m=>m.room)).size===a.length),'同一時段的會議分到不同教室');
  // 有人不行：甲老師第 1 節不行 → 甲的三場只剩 2 個時段，一場排不進去
  I.record(R,'t:a','2026-12-08|1','n');res=I.schedule(D,R,{busy:{}});
  ok(res.un.length===1&&Object.values(res.at).filter(k=>k==='2026-12-08|1').every(k=>true),'必要出席的人不行的時段不會排');
  ok(R.meets.filter(m=>res.at[m.id]==='2026-12-08|1').every(m=>!m.p.some(x=>x[0]==='t:a')),'甲老師不行的那一節沒有他的會議');
  // 釘住：學生 4 釘在第 3 節，重排也不動
  const m4=R.meets.find(m=>m.s==='s4');m4.at='2026-12-08|3';m4.pin=1;res=I.schedule(D,R,{busy:{}});
  ok(res.at[m4.id]==='2026-12-08|3','釘住的會議時間不會被改');
}

// 6. 修補：貪婪先排會擋到別人，靠擠開可以全排
{
  const D=C.emptyData();D.periods=[{id:'1',name:'第1節',start:'08:20',end:'09:05'},{id:'2',name:'第2節',start:'09:15',end:'10:00'}];
  D.teachers=[{id:'a',name:'甲老師',role:'資源班',off:[]}];
  D.students=[{id:'s1',cls:'801',seat:'1',name:'學生一',caseMgr:'a',needs:[]},{id:'s2',cls:'801',seat:'2',name:'學生二',caseMgr:'a',needs:[]}];
  const R=I.newRound(D,{stu:['s1','s2'],slots:[['2026-12-08','1'],['2026-12-08','2']]});
  // 學生一的會議兩個時段都行、但第 1 節比較好；學生二只能第 1 節
  const m2=R.meets[1];I.addOther(D,R,m2,'學生二家長','家長',1);const pk=m2.p.find(x=>x[0][0]==='x')[0];I.record(R,pk,'2026-12-08|2','n');
  const res=I.schedule(D,R,{busy:{}});
  ok(res.un.length===0&&res.at[m2.id]==='2026-12-08|1','只能第 1 節的那場排到第 1 節，另一場讓開');
}

// 7. 開會通知小單（一張 A4 裁 3～4 張）與直接開會
{
  const D=sample(),R=I.quickMeet(D,{sid:'s1',date:'2026-12-10',p:'5',room:'會議室',kind:'個案會議'});
  I.addOther(D,R,R.meets[0],'王小明媽媽','家長',1);
  const L=I.slipItems(D,R,{all:true});
  ok(L.length===R.meets[0].p.length,'每位出席者一張（含家長）');
  ok(L.every(x=>x.time.date==='2026-12-10'&&x.time.time==='13:10–13:55'&&x.room==='會議室'&&x.kind==='個案會議'),'通知有日期、節次與時間、地點、會議類型');
  ok(L.some(x=>x.to==='王小明媽媽')&&L.some(x=>/老師$/.test(x.to)),'稱呼：老師加「老師」，已有稱謂的不重複');
  ok(I.salute('張老師（國）','任課',true)==='張老師（國）','名字已經是「○老師（科）」不再加老師');
  ok(I.stuShow(D.students[0],'mask')==='701-03 王○明'&&I.stuShow(D.students[0],'cls')==='701-03','學生可以只印班級座號，或遮住名字');
  const S=I.newRound(D,{stu:['s1','s2'],slots:I.genSlots(['2026-12-14'],['2','3'])});S.meets.forEach((m,i)=>{m.at='2026-12-14|'+(i?'3':'2');});
  const L2=I.slipItems(D,S,{});
  ok(L2.filter(x=>x.m===S.meets[0]).length===S.meets[0].p.filter(x=>I.isTeacher(x[0])).length&&L2.findIndex(x=>x.m===S.meets[1])===L2.filter(x=>x.m===S.meets[0]).length,'同一場會議的通知單排在一起');
}

// 9. 線上調查：專屬連結、公開內容、回覆讀回
{
  const D=sample(),R=I.newRound(D,{stu:['s1','s2','s3']});R.due='2026-12-05';R.priv='cls';
  const n=I.setRange(D,R,'2026-11-30','2026-12-11',['1','2','3','4','5','6','7']);
  ok(n===10*7,'日期範圍只取週一到週五（11/30～12/11 共 10 天 × 7 節）');
  const t=I.token();ok(I.TOKEN_RE.test(t)&&t.length>=24&&I.token()!==t,'連結鑰匙 24 碼英數亂數（超過 128 位元），每次不同');
  const list=I.ensureTokens(D,R),tok=Object.assign({},R.tok);
  ok(list.length&&list.every(o=>I.TOKEN_RE.test(R.tok[o.k])),'每位出席的老師都有自己的鑰匙');
  ok(new Set(Object.values(R.tok)).size===Object.keys(R.tok).length,'鑰匙不重複');
  const cm=list.find(o=>o.k==='t:r1');ok(cm&&cm.meets.length>=2,'被好幾場邀請的老師還是只有一個連結（'+(cm?cm.meets.length:0)+' 場）');
  I.ensureTokens(D,R);ok(JSON.stringify(R.tok)===JSON.stringify(tok),'重新發布不會換掉已經發出去的鑰匙');
  ok(!list.some(o=>!o.teacher),'預設不發給家長');
  I.addOther(D,R,R.meets[0],'王媽媽','家長',1);R.par=1;const l2=I.ensureTokens(D,R),par=l2.find(o=>!o.teacher);
  const busy=I.busyOf(D,R),doc=I.publicDoc(D,R,cm,busy),pdoc=I.publicDoc(D,R,par,busy),txt=JSON.stringify(doc);
  ok(par&&pdoc.who==='p'&&pdoc.once===1&&doc.once===0,'家長的連結只能送出一次，老師的可以一直改到期限');
  ok(!D.students.some(s=>txt.includes(s.name)),'公開內容沒有學生姓名');
  ok(!/needs|障|服務|svc/.test(txt),'公開內容沒有障別、服務');
  ok(doc.stu.every(x=>/^\d{3}-\d{2}$/.test(x.c)),'學生只顯示班級座號');
  R.priv='mask';ok(I.publicDoc(D,R,cm,busy).stu[0].c.includes('○'),'也可以選遮住的姓名');
  ok(Object.values(doc.busy).every(v=>['資源班課','原班課','不排課','已有會議','有事'].includes(v)),'有課只寫種類，不寫組名');
  ok(Object.keys(doc.busy).length>0,'這位老師已知有課的節次有先標出來（'+Object.keys(doc.busy).length+' 節）');
  ok(doc.expMs===new Date(2026,11,5,23,59,59).getTime(),'連結在回覆期限當天 23:59:59 到期');
  // 公開頁的格子
  const G=I.webGrid(doc,new Set([doc.keys[0]]));
  ok(G.length===10&&G[0].cells.length===7&&G[0].cells[0].on&&G[0].label==='11/30（一）','公開頁的格子：每天一列、每節一格');
  // 讀回回覆：勾的是可、沒勾的是不可；舊的不會蓋掉新的
  const free=[doc.keys[0],doc.keys[1],'2099-01-01|1'];
  ok(I.applyWeb(R,cm,{free,note:'週三下午不行',at:1000}),'收到線上回覆');
  ok(I.status(R,{},cm.k,doc.keys[0]).v==='y'&&I.status(R,{},cm.k,doc.keys[5]).v==='n','勾的節次是可、沒勾的是不可');
  ok(!R.ans[cm.k]['2099-01-01|1'],'不在調查範圍的節次不會收進來');
  ok(!I.applyWeb(R,cm,{free:[],at:999}),'比較舊的回覆不會蓋掉新的');
  const P=I.progress(D,R);ok(P.people.find(o=>o.k===cm.k).done==='web'&&P.people.some(o=>!o.done),'回覆情形：分得出誰填了、誰還沒填');
  ok(P.meets.every(x=>!x.ready),'還有必要的人沒回，那場會議就不算齊');
  const rt=I.remindText(D,R,list.find(o=>o.k!==cm.k),'https://example.test/iep.html?k='+tok[list[1].k]);
  ok(/提醒您填寫/.test(rt)&&rt.includes(tok[list[1].k])&&!D.students.some(s=>rt.includes(s.name)),'提醒訊息有連結、沒有學生姓名');
}

// 8. 存檔：D.iep 可以 JSON 來回，核心的 normalize 不會弄掉
{
  const D=sample();I.newRound(D,{stu:['s1'],slots:[['2026-12-08','3']]});
  const D2=C.normalize(JSON.parse(JSON.stringify(D)));I.ensure(D2);
  ok(D2.iep.rounds.length===1&&D2.iep.rounds[0].meets.length===1&&D2.classHead['701']==='張老師（國）','存檔讀回來 IEP 資料還在');
}

console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');
process.exit(fail?1:0);

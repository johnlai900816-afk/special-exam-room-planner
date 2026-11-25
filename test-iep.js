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
  const LOC={},list=I.ensureTokens(D,R,LOC),tok=Object.assign({},R.tokH);
  ok(list.length&&list.every(o=>I.TOKEN_RE.test(I.linkTok(R,LOC,o.k))),'每位出席的老師都有自己的鑰匙（存在這台電腦）');
  ok(new Set(Object.values(LOC).map(x=>x[0])).size===Object.keys(LOC).length,'鑰匙不重複');
  ok(!R.tok&&list.every(o=>I.HASH_RE.test(R.tokH[o.k])&&R.tokH[o.k]===I.sha256hex(LOC[o.k][0]))&&!JSON.stringify(R).includes(LOC[list[0].k][0]),'共用資料（調查）只存鑰匙的雜湊，不存鑰匙');
  const cm=list.find(o=>o.k==='t:r1');ok(cm&&cm.meets.length>=2,'被好幾場邀請的老師還是只有一個連結（'+(cm?cm.meets.length:0)+' 場）');
  I.ensureTokens(D,R,LOC);ok(JSON.stringify(R.tokH)===JSON.stringify(tok),'重新發布不會換掉已經發出去的鑰匙');
  const other={};I.ensureTokens(D,R,other);ok(!Object.keys(other).length&&JSON.stringify(R.tokH)===JSON.stringify(tok)&&!I.linkTok(R,other,list[0].k),'別台電腦更新線上內容不換鑰匙，但做不出連結（要重新產生）');
  const rg=I.regenTok(R,other,list[0].k);ok(rg.old===tok[list[0].k]&&rg.h!==rg.old&&I.linkTok(R,other,list[0].k)===rg.t&&!I.linkTok(R,LOC,list[0].k),'重新產生：換新鑰匙，舊電腦上的舊連結對不上了');
  const old={tok:{'t:r1':'A'.repeat(24)},pub:['A'.repeat(24)]},L2={};ok(I.migrateTok(old,L2)&&!old.tok&&old.tokH['t:r1']===I.sha256hex('A'.repeat(24))&&old.pub[0]===old.tokH['t:r1']&&L2['t:r1'][0]==='A'.repeat(24),'舊資料的鑰匙搬到這台電腦，共用資料只留雜湊');
  ok(!I.migrateTok(old,L2),'搬過就不再搬');
  ok(!list.some(o=>!o.teacher),'預設不發給家長');
  I.addOther(D,R,R.meets[0],'王媽媽','家長',1);R.par=1;const l2=I.ensureTokens(D,R),par=l2.find(o=>!o.teacher);
  const busy=I.busyOf(D,R),doc=I.publicDoc(D,R,cm,busy),pdoc=I.publicDoc(D,R,par,busy),txt=JSON.stringify(doc);
  ok(par&&pdoc.who==='p'&&pdoc.once===1&&doc.once===0,'家長的連結只能送出一次，老師的可以一直改到期限');
  ok(!D.students.some(s=>txt.includes(s.name)),'公開內容沒有學生姓名');
  ok(!/needs|障|服務|svc/.test(txt),'公開內容沒有障別、服務');
  ok(doc.stu.every(x=>/^\d{3}-\d{2}$/.test(x.c)),'學生只顯示班級座號');
  R.priv='mask';ok(I.publicDoc(D,R,cm,busy).stu[0].c.includes('○'),'也可以選遮住的姓名');
  ok(!('busy' in doc)&&!/資源班課|原班課|不排課|已有會議/.test(txt),'公開內容不寫誰哪一節有課（承辦有課的節次在建立時就拿掉了）');
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

// 10. 老師模式：每位個管只看得到、只能動自己的學生和調查
{
  const T=require('./teacher.js'),D=sample();I.ensure(D);
  const mine=I.mineStu(D,'r2');
  ok(mine.length&&mine.every(s=>s.caseMgr==='r2')&&I.mineStu(D,'').length===D.students.length,'學生選單：老師只有自己個管的，管理者是全部');
  const other=D.students.find(s=>s.caseMgr==='r1');
  const R2=I.newRoundAs(D,'r2',{name:'王老師的調查',stu:[mine[0].id,other.id]});
  ok(R2.host==='r2'&&I.hostId(D,R2)==='r2'&&I.hostLabel(D,R2)==='王老師','老師開的調查記 host＝老師 id，顯示成姓名');
  ok(R2.meets.length===1&&R2.meets[0].s===mine[0].id,'老師開的調查放不進別人個管的學生');
  ok(I.addMeetAs(D,R2,other.id,'r2')===null&&!!I.addMeetAs(D,R2,mine[1].id,'r2'),'addMeetAs：別人的學生加不進去，自己的可以');
  const R1=I.newRoundAs(D,'r1',{name:'林組長的調查',stu:[other.id]}),RA=I.newRound(D,{name:'特教組'});RA.host='特教組';
  ok(I.ownRounds(D,'r2',0).map(r=>r.id).join()===R2.id,'老師只看到自己開的調查');
  ok(I.ownRounds(D,'',0).length===3,'管理者看到全部調查');
  ok(I.canEdit(D,R2,'r2')&&!I.canEdit(D,R1,'r2')&&!I.canEdit(D,RA,'r2')&&I.canEdit(D,R1,''),'只能改自己的調查；管理者都可以');
  ok(I.hostId(D,RA)===''&&I.hostLabel(D,RA)==='特教組','文字的承辦（特教組）不是任何老師的');
  // 被邀請：r2 在 R1 的名單裡（例如他教這位學生）
  const m1=R1.meets[0];if(!m1.p.some(x=>x[0]==='t:r2'))I.addPerson(D,R1,m1,'t:r2','資源班',1);
  I.setRange(D,R1,'2026-12-07','2026-12-11',['1','2','3']);I.setRange(D,R2,'2026-12-07','2026-12-11',['1','2','3']);
  ok(I.invited(D,'r2').includes(R1)&&!I.invited(D,'m1').includes(R1),'邀請我的會議：有在名單裡才看得到');
  ok(I.selfAnswer(D,R1,'t:r2',['2026-12-08|2'],'可以調課')&&R1.ans['t:r2']['2026-12-08|2']==='y'&&R1.ans['t:r2']['2026-12-08|3']==='n'&&R1.web['t:r2'].note==='可以調課','直接填空堂：點的是可，其他是不可，和線上回覆同格式');
  ok(I.progress(D,R1).people.find(o=>o.k==='t:r2').done==='web','填完之後顯示「填了」');
  ok(I.selfAnswer(D,R1,'t:r2',['2026-12-08|3'])&&R1.ans['t:r2']['2026-12-08|3']==='y','可以再改（時間戳記比上次新）');
  ok(T.iepOwed(D,'r2','2026-12-01').every(x=>x.R!==R1),'待辦：填過的不再列出');
  // 跨老師：別人的會議已經排在那一節，我的調查不能排同一個人在同一節（就算他回覆「可」）
  m1.at='2026-12-08|3';m1.pin=1;R1.rooms=['會議室'];m1.room='會議室';
  const m2=R2.meets[0];if(!m2.p.some(x=>x[0]==='t:r2'))I.addPerson(D,R2,m2,'t:r2','個管',1);
  R2.meets.forEach(m=>{m.p.forEach(x=>I.fillRest(R2,x[0],'y'));});R2.rooms=['會議室'];
  const b2=I.busyOf(D,R2);
  ok(b2.__iep['t:r2']&&b2.__iep['t:r2']['2026-12-08|3'],'別人開的、已排定的會議記成硬限制');
  ok(b2.__rooms['會議室']&&b2.__rooms['會議室']['2026-12-08|3'],'別人的會議占用的地點也標出來');
  const res=I.schedule(D,R2,{busy:b2});
  ok(Object.keys(res.at).length===R2.meets.length&&Object.values(res.at).every(k=>k!=='2026-12-08|3'),'排時間時不會和別位老師已排定的會議撞到（同一個人、同一間）');
  ok(I.rank(D,R2,m2,b2).find(r=>r.k==='2026-12-08|3').ok===false,'那一節在排名裡是不能開');
  m2.at='2026-12-08|3';m2.room='會議室';ok(I.crossConflicts(D,R2).some(c=>c.k==='t:r2')&&I.crossConflicts(D,R2).some(c=>c.room==='會議室'),'手動排到同一節會提醒（人和地點）');
  ok(!I.crossConflicts(D,R2).some(c=>c.m.includes(other.name)),'提醒不寫出別場的學生');
  const R3=I.newRoundAs(D,'r2',{stu:[mine[0].id]});R3.due='2026-12-05';I.setRange(D,R3,'2026-12-07','2026-12-08',['1']);
  const pd=I.publicDoc(D,R3,I.webPeople(D,R3)[0],{});
  ok(pd.host==='王老師'&&!JSON.stringify(pd).includes('"r2"'),'公開頁的承辦是老師姓名，不是老師 id');
  // 學生與私密欄位
  const S=T.myStudents(D,'r2');
  ok(S.cm.every(s=>s.caseMgr==='r2')&&S.taught.every(s=>s.caseMgr!=='r2'&&D.groups.some(g=>g.teacher==='r2'&&g.students.includes(s.id))),'我的學生：個管的＋我教的（不重複）');
  ok(S.taught.length>0,'範例資料裡王老師也教別人個管的學生');
  const x=Object.assign({},S.taught[0],{privNote:'私密',iepDate:'2026-12-01'}),y=Object.assign({},S.cm[0],{privNote:'私密'});
  ok(!T.canSeePriv(x,'r2','teacher')&&T.canSeePriv(y,'r2','teacher')&&T.canSeePriv(x,'','admin'),'私密欄位只給個管本人和管理者');
  ok(!('privNote' in T.studentView(x,'r2','teacher'))&&!('iepDate' in T.studentView(x,'r2','teacher'))&&T.studentView(y,'r2','teacher').privNote==='私密','不是個管的看不到私密備註和日期');
  ok(T.myGroups(D,'r2').every(g=>g.teacher==='r2')&&T.myGroups(D,'r2').length===3,'我的組別：只有我教的');
  D.students.find(s=>s.id===S.cm[0].id).reviewDate='2026-12-10';
  ok(T.dueSoon(D,'r2','2026-12-01',30).some(d=>d.k==='reviewDate'&&d.left===9)&&!T.dueSoon(D,'r1','2026-12-01',30).some(d=>d.s.caseMgr!=='r1'),'到期提醒只算我個管的');
  const E={sessions:[{id:'d1p1',date:'12/1',dow:'二',period:'第1節',subject:'作文',start:'08:20',end:'09:05'}],rooms:[{id:'A',name:'環教中心'}],proctorOf:{'d1p1|A':'王老師'},supportOf:{'d1p1|A':'林組長'}};
  ok(T.proctorDuties(E,'王老師').length===1&&T.proctorDuties(E,'王').length===1&&T.proctorDuties(E,'林組長')[0].sup===true&&!T.proctorDuties(E,'李老師').length,'我的監考：從段考資料找自己的姓名（含支援）');
}

// 11. 綁定：信箱 → 老師 → 身分
{
  const T=require('./teacher.js'),D=C.defaultData();
  const A={admin:'boss@school.tw',emails:['boss@school.tw','wang@school.tw','lin@school.tw','new@school.tw'],viewers:['lin@school.tw'],bind:{'wang@school.tw':'r2','lin@school.tw':'r1','boss@school.tw':'r3'}};
  ok(T.roleFor(A,'wang@school.tw',D.teachers).role==='teacher'&&T.roleFor(A,'wang@school.tw',D.teachers).tid==='r2','綁定的信箱登入是老師，帶老師 id');
  ok(T.roleFor(A,'Wang@School.tw',D.teachers).tid==='r2','信箱大小寫不影響');
  ok(T.roleFor(A,'lin@school.tw',D.teachers).role==='teacher','檢視權限的人綁定了也是老師畫面');
  ok(T.roleFor(A,'boss@school.tw',D.teachers).role==='admin','主持人一律是管理者（就算被綁定）');
  ok(T.roleFor(A,'new@school.tw',D.teachers).role==='admin','沒綁定的編輯維持管理者');
  ok(T.roleFor(null,'wang@school.tw').role==='admin'&&T.roleFor(A,'').role==='admin','沒有共用名單或沒登入：管理者（單機）');
  const gone=T.roleFor(Object.assign({},A,{bind:{'wang@school.tw':'gone'}}),'wang@school.tw',D.teachers);
  ok(gone.role==='teacher'&&gone.tid===''&&gone.missing==='gone','綁到已刪除的老師：還是老師身分（沒有老師 id、標出找不到），絕不變成管理者');
  const b=T.setBind(A.bind,'NEW@school.tw','m1');
  ok(b['new@school.tw']==='m1'&&T.setBind(b,'new@school.tw','')['new@school.tw']===undefined,'設定、取消綁定');
  const c=T.cleanBind(b,['boss@school.tw','wang@school.tw'],'boss@school.tw');
  ok(JSON.stringify(c)==='{"wang@school.tw":"r2"}','移出名單的人、主持人的綁定都清掉');
  const keys=Object.keys(Object.assign({},A,{bind:c}));
  ok(keys.every(k=>['admin','emails','viewers','link','vcls','vk','bind'].includes(k)),'寫回 config/access 的欄位都在安全規則允許的範圍');
}

// 12. 老師身分的頁面白名單、個案頁只給自己的學生、私密欄位
{
  const T=require('./teacher.js'),D=C.defaultData(),S=T.myStudents(D,'r2'),cm=S.cm[0],tg=S.taught[0];
  const other=D.students.find(s=>T.relation(D,'r2',s)==='');
  ok(T.relation(D,'r2',cm)==='cm'&&T.relation(D,'r2',tg)==='taught'&&!!other,'和學生的關係：個管、有教、沒關係');
  const R=(p,s,sid)=>JSON.stringify(T.route(D,'r2',p,s,sid));
  ok(['me_today','me_stu','me_iep','me_check','me_set'].every(p=>T.route(D,'r2',p).p===p),'我的頁面都可以去');
  ok(['home','stu','sched','exam','checkin','stats','set','x','',undefined].every(p=>T.route(D,'r2',p,'data').p==='me_today'),'管理者的頁面（名單、排課、段考、設定…）一律回「今天」');
  ok(T.route(D,'r2','set','data').p==='me_today'&&T.route(D,'r2','set','account').p==='me_today','備份、帳號與共用都去不了');
  ok(R('iep','plan')==='{"p":"me_iep","s":"plan"}'&&T.route(D,'r2','iep','ans').p==='me_iep'&&T.route(D,'r2','iep').s===undefined,'IEP 會議頁換成「我的 IEP」');
  ok(R('stu','case',cm.id)==='{"p":"stu","s":"case"}'&&R('stu','case',tg.id)==='{"p":"stu","s":"case"}','自己個管、自己有教的學生可以看個案頁');
  ok(R('stu','case',other.id)==='{"p":"me_stu"}'&&R('stu','case','nobody')==='{"p":"me_stu"}','別人的學生、不存在的學生：回「我的學生」');
  ok(T.route(D,'','stu','case',cm.id).p==='me_stu','沒有老師 id（綁定的老師找不到）：任何個案頁都不能看');
  ok(['contacts','examSvc','privNote','iepDate','reviewDate','certExp'].every(k=>T.PRIV.includes(k)),'家長聯絡、段考服務也算私密欄位');
  const x=Object.assign({},tg,{examSvc:{ext:'*'},contacts:[1]}),v=T.studentView(x,'r2','teacher');
  ok(!('examSvc' in v)&&!('contacts' in v)&&v.name===tg.name&&x.examSvc,'不是個管的看不到段考服務、家長聯絡（只拿掉副本的欄位，名冊不動）');
  ok(T.studentView(Object.assign({},cm,{examSvc:{ext:'*'}}),'r2','teacher').examSvc.ext==='*','個管看得到');
}

// 13. 發布前檢查安全規則的上限：一份連結最多 400 個節次、80 位學生、到期最多 120 天後
{
  const D=sample(),R=I.newRound(D,{stu:['s1']});R.due='2026-12-05';I.setRange(D,R,'2026-11-30','2026-12-04',['1','2']);
  const now=new Date(2026,10,20).getTime();
  ok(I.pubLimits(D,R,now).length===0,'一般大小的調查沒有超過');
  I.setRange(D,R,'2026-09-01','2027-06-30',['1','2','3','4','5','6','7']);const o1=I.pubLimits(D,R,now).filter(x=>x.what==='keys');
  ok(o1.length&&o1[0].n>400&&/縮短日期範圍/.test(I.pubLimitText(o1[0])),'節次超過 400：擋下來並建議縮短範圍');
  const R2=I.newRound(D,{stu:[]});R2.due='2026-12-05';I.setRange(D,R2,'2026-11-30','2026-12-04',['1']);
  for(let i=0;i<85;i++){const s={id:'z'+i,cls:'701',seat:String(i),name:'學生'+i,caseMgr:'r1',needs:[]};D.students.push(s);I.addMeet(D,R2,s.id);}
  const o2=I.pubLimits(D,R2,now).filter(x=>x.what==='stu');ok(o2.length&&o2.some(x=>x.k==='t:r1'&&x.n>=85)&&/拆成兩次/.test(I.pubLimitText(o2[0])),'同一位要回覆超過 80 位學生：擋下來並建議拆開');
  R2.due='2027-06-30';ok(I.pubLimits(D,R2,now).some(x=>x.what==='due'),'回覆期限超過 120 天後：擋下來');
}

// 14. 候選時段：承辦（個管）有課的節次先拿掉；公開資料沒有任何忙碌原因
{
  const D=sample(),M=C.compile(D),S=C.toState(M,D);
  const busyS=new Set();M.L.forEach((x,l)=>{const s=S.slot[l],g=M.G[x.g];if(s>=0&&g.t>=0&&D.teachers[g.t].id==='r2')busyS.add(s);});
  const dates=['2026-12-07','2026-12-08','2026-12-09','2026-12-10','2026-12-11'],ps=D.periods.filter(p=>!p.extra).map(p=>p.id);
  const R=I.newRoundAs(D,'r2',{stu:D.students.filter(s=>s.caseMgr==='r2').slice(0,2).map(s=>s.id)});R.due='2026-12-04';R.d1='2026-12-07';R.d2='2026-12-11';R.ps=ps;
  const r=I.buildSlots(D,R),keys=I.keysOf(R);
  const hit=keys.filter(k=>{const f=I.slotInfo(D,k);return busyS.has(f.w*M.NP+f.pis[0]);});
  ok(r.base===35&&r.cut>=busyS.size&&r.kept===35-r.cut&&keys.length===r.kept,'候選時段＝日期×節次－承辦有課的（'+r.cut+' 節拿掉，剩 '+r.kept+'）');
  ok(hit.length===0,'承辦（王老師）的資源班課那幾節不會問任何人');
  ok(Object.values(r.why).every(w=>/上課|不排課|IEP/.test(w)),'拿掉的原因只在 app 裡看得到（資源班上課…）');
  const k0=keys[0],f0=I.slotInfo(D,k0);D.teachers.find(t=>t.id==='r2').off=[f0.w+'-'+f0.p];const r2=I.buildSlots(D,R);ok(!I.keysOf(R).includes(k0)&&/不排課/.test(r2.why[k0]),'承辦登記的不排課時段也拿掉');
  R.inclBusy=1;I.buildSlots(D,R);ok(I.keysOf(R).length===35,'勾「有課的節次也問」就全部都問');R.inclBusy=0;
  // 別的調查已排定、承辦要出席的會議
  const RX=I.newRoundAs(D,'r2',{stu:[R.meets[0].s]});RX.meets[0].at='2026-12-09|2';
  I.buildSlots(D,R);ok(!I.keysOf(R).includes('2026-12-09|2'),'承辦已經排定的 IEP 會議那一節也拿掉');
  // 放假日
  D.settings.noClass=['2026-12-10'];const r3=I.buildSlots(D,R);ok(r3.base===28&&!I.keysOf(R).some(k=>k.startsWith('2026-12-10')),'放假日不列入');D.settings.noClass=[];I.buildSlots(D,R);
  // 只問勾的時段
  const free=I.keysOf(R);R.pick=[free[0],free[1],'1999-01-01|1'];I.buildSlots(D,R);
  ok(I.keysOf(R).length===2&&I.keysOf(R)[0]===free[0],'承辦勾了偏好的時段：只問勾的（不在候選裡的勾選忽略）');
  R.pick=[];I.buildSlots(D,R);ok(I.keysOf(R).length===free.length,'沒勾：全部沒課的時段都問');
  // 特教組開的、個管不同：每場會議各自扣掉自己個管有課的
  const RA=I.newRound(D,{stu:['s1','s2']});RA.d1='2026-12-07';RA.d2='2026-12-11';RA.ps=ps;const ra=I.buildSlots(D,RA);
  ok(ra.hosts.length===0&&ra.cut===0&&RA.meets.every(m=>Array.isArray(m.sl)&&m.sl.length<35),'個管不同時不統一拿掉，每場會議各自扣掉自己個管有課的節次');
  const RB=I.newRound(D,{stu:['s1','s4']});RB.d1='2026-12-07';RB.d2='2026-12-11';RB.ps=ps;ok(I.buildSlots(D,RB).hosts.join()==='r1','學生都同一位個管：拿他當承辦');
  // 公開資料、公開頁的格子沒有忙碌
  R.due='2026-12-04';const o=I.webPeople(D,R)[0],doc=I.publicDoc(D,R,o,I.busyOf(D,R)),txt=JSON.stringify(doc);
  ok(!('busy' in doc)&&!/上課|不排課|已有會議|資源班課|原班課/.test(txt),'公開內容沒有「有課」「不排課」這類原因');
  ok(I.webGrid(doc,new Set()).every(d=>d.cells.every(c=>!('busy' in c))),'公開頁的格子沒有忙碌標記');
  // 排時間仍然把必要的人有課當成不行（內部）
  const b=I.busyOf(D,R);ok(Object.keys(b).some(k=>k[0]==='t'&&Object.keys(b[k]).length),'排時間時仍然知道其他出席者哪幾節有課');
}

// 15. 承辦挑時段的格子：原班課表的科目、主科（避開）、適合開會（建議）
{
  const L=I.hintLists({settings:{}});
  ok(L.avoid.join()==='國語文,英語文,數學'&&L.prefer.includes('綜合活動'),'預設：國英數避開；綜合、彈性、社團、輔導、班會建議');
  ok(I.subjHint('國文',L)==='avoid'&&I.subjHint('英語文',L)==='avoid'&&I.subjHint('數學',L)==='avoid','國文、英文寫法不同也算主科');
  ok(I.subjHint('綜合活動（輔導）',L)==='prefer'&&I.subjHint('彈性學習',L)==='prefer'&&I.subjHint('班會',L)==='prefer','綜合、彈性、班會是建議時段');
  ok(I.subjHint('自然',L)===''&&I.subjHint('',L)==='','其他科目不標');
  ok(I.subjHint('自然',I.hintLists({settings:{iepAvoidSubj:['自然'],iepPreferSubj:['體育']}}))==='avoid'&&I.subjHint('數學',I.hintLists({settings:{iepAvoidSubj:['自然']}}))==='','可以在設定改清單');
  const D=sample(),reg=D.periods.filter(p=>!p.extra);D.teachers.push({id:'z9',name:'周老師',role:'普通班',off:[]});
  const row=sj=>reg.map((p,i)=>i===0?{s:sj,t:'張老師（國）'}:i===1?{s:'綜合活動',t:'周老師'}:null);
  D.tt={'701':{subj:{},grid:[row('國語文'),row('數學'),row('彈性'),row('英語文'),row('社團')]},'702':{subj:{},grid:[row('自然'),row('數學'),row('彈性'),row('英語文'),row('社團')]}};
  const keys=I.baseKeys(D,'2026-12-07','2026-12-11',reg.map(p=>p.id));
  ok(keys.length===35&&!keys.some(k=>k.includes('|m')),'候選：週一到五 × 一般節次');
  const s701=D.students.find(s=>s.cls==='701'),s702=D.students.find(s=>s.cls==='702');
  let G=I.pickGrid(D,{keys,sids:[s701.id],busy:{'2026-12-07|2':'資源班上課'}});
  const cell=(G,d,p)=>G.rows.find(r=>r.date===d).cells[G.cols.findIndex(c=>c.p===p)];
  ok(G.hasTT&&cell(G,'2026-12-07','1').subj==='國語文'&&cell(G,'2026-12-07','1').tint==='avoid','一位學生：格子寫他原班的科目，主科標「避開」');
  ok(cell(G,'2026-12-07','2').tint==='prefer'&&cell(G,'2026-12-07','2').busy,'綜合活動標「建議」；承辦有課的格子不能選');
  ok(cell(G,'2026-12-09','1').tint==='prefer'&&cell(G,'2026-12-07','3').subj===''&&cell(G,'2026-12-07','3').tint==='','彈性是建議；課表空白的格子不標');
  const sug=I.suggestPick(G);ok(sug.includes('2026-12-09|1')&&sug.includes('2026-12-11|2')&&!sug.includes('2026-12-07|2')&&!sug.includes('2026-12-07|1'),'「勾選建議時段」：建議的、承辦有空的');
  G=I.pickGrid(D,{keys,sids:[s701.id,s702.id]});
  ok(cell(G,'2026-12-07','1').tint==='avoid','兩位學生：有一位在上主科就標避開');
  ok(cell(G,'2026-12-09','1').tint==='prefer'&&cell(G,'2026-12-09','1').subj==='彈性','兩位都在上彈性：建議，顯示最多的科目');
  const B=I.weekBusy(D,I.ctxOf(D)),ti=B.M.tIdx.z9;
  ok(/原班上課（701綜合活動）/.test(B.tb.get(ti*B.M.NS+0*B.M.NP+D.periods.findIndex(p=>p.id===reg[1].id))||''),'有原班課表時，任課老師在哪幾節上課也算進忙碌（只在內部）');
  delete D.tt;G=I.pickGrid(D,{keys,sids:[s701.id]});
  ok(!G.hasTT&&G.rows.every(r=>r.cells.every(c=>c&&c.subj===''&&c.tint===''))&&I.suggestPick(G).length===0,'沒有原班課表：格子都是中性，不標科目');
}

console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');
process.exit(fail?1:0);

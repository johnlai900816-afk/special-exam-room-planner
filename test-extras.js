/* node test-extras.js：額外功能的純邏輯（導師週報、學年交接、老師工作量、教室使用率、鎖課異動、家長聯絡）
   test.js 也會呼叫這裡的 run() */
'use strict';
const C=require('./core.js');

function solved(mut){const D=C.defaultData();if(mut)mut(D);C.normalize(D);const M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:1});D.assign=C.fromState(M,R);return {D,M:C.compile(D)};}

function run(ok){
  // 40. 導師週報
  {
    console.log('\n40. 導師週報 weeklySummary');
    const {D,M}=solved(),S=C.toState(M,D),WS='2026-11-16';D.classHead={'701':'陳大文'};
    const ws=C.weekStartOf('2026-11-19');ok(ws===WS,'週三算出那一週的星期一');
    ok(C.weekStartOf('2026-11-22')===WS,'週日算前一週');
    // 找 701 一位學生被抽出去的兩節
    const stu=D.students.find(s=>s.cls==='701'&&M.L.some((x,l)=>M.G[x.g].pull&&M.G[x.g].stu.includes(M.sIdx[s.id])&&S.slot[l]>=0));
    const mine=M.L.map((x,l)=>({g:M.G[x.g],s:S.slot[l]})).filter(o=>o.s>=0&&o.g.pull&&o.g.stu.includes(M.sIdx[stu.id])).sort((a,b)=>a.s-b.s);
    const dateOf=s=>C.addDays(WS,Math.floor(s/M.NP)),keyOf=o=>o.g.ref.id+'@'+M.P[o.s%M.NP].id;
    const ATT={};const put=(o,sid,rec)=>{const d=dateOf(o.s),k=keyOf(o);ATT[d]=ATT[d]||{};ATT[d][k]=ATT[d][k]||{};ATT[d][k][sid]=rec;};
    put(mine[0],stu.id,{st:'late',tin:'08:30',tout:'',note:'忘了帶課本'});
    const other=mine[1].g.stu.map(i=>D.students[i]).find(s=>s.id!==stu.id);put(mine[1],other.id,{st:'in',tin:'',tout:'',note:''});   // 有點名但沒有他 → 缺席
    // 已經不在課表上的一節（週中改過課表）
    ATT[C.addDays(WS,4)]=Object.assign(ATT[C.addDays(WS,4)]||{},{'gOld@3':{_roster:[stu.id],_info:{g:'舊的課',p:'第3節'},[stu.id]:{st:'leave',tin:'',tout:'',note:'病假'}}});
    const W=C.weeklySummary(D,ATT,'2026-11-19',{today:'2026-11-25'});
    ok(W.weekStart===WS&&W.weekEnd==='2026-11-20'&&W.dates.length===5,'週一到週五');
    ok(W.classes.map(c=>c.cls).join()===[...new Set(W.classes.map(c=>c.cls))].sort().join(),'班級照順序');
    const c701=W.classes.find(c=>c.cls==='701'),e=c701.students.find(s=>s.id===stu.id);
    ok(c701.head==='陳大文','導師姓名從 D.classHead 帶入');
    ok(e.rows[0].st==='late'&&e.rows[0].note==='忘了帶課本','遲到與備註');
    ok(e.rows.some(r=>r.st==='abs'),'那一節有點名但沒有他：算缺席');
    ok(e.rows.some(r=>r.gname==='舊的課'&&r.st==='leave'),'課表已經沒有的那一節照點名紀錄列出');
    ok(e.c.late===1&&e.c.abs===1&&e.c.leave===1&&e.c.in===1&&e.c.in+e.c.leave+e.c.abs+e.c.none===e.c.n,'各狀態的次數加起來等於節數');
    ok(e.c.none>0&&e.c.n===e.rows.length,'沒點過名的節次算「未點名」');
    const pulls=M.L.filter((x,l)=>S.slot[l]>=0&&M.G[x.g].pull&&M.G[x.g].stu.includes(M.sIdx[stu.id])).length;
    ok(e.rows.length===pulls+1,'每一節抽離課都列出（外加課不列）');
    const ex=D.groups.find(g=>g.mode==='外加');
    ok(!W.classes.some(c=>c.students.some(s=>s.rows.some(r=>r.gid===ex.id))),'外加課（早自習）預設不列');
    ok(C.weeklySummary(D,ATT,WS,{today:'2026-11-25',all:true}).classes.some(c=>c.students.some(s=>s.rows.some(r=>r.gid===ex.id))),'opt.all 才列外加課');
    const F=C.weeklySummary(D,ATT,WS,{today:'2026-11-17'}),fe=F.classes.find(c=>c.cls==='701').students.find(s=>s.id===stu.id);
    ok(fe.rows.filter(r=>r.date>'2026-11-17').every(r=>r.future)&&fe.c.future>0,'今天以後的節次算「還沒上」');
    // 刪掉的學生不列
    const D2=JSON.parse(JSON.stringify(D));D2.students=D2.students.filter(s=>s.id!==stu.id);
    ok(!C.weeklySummary(D2,ATT,WS,{today:'2026-11-25'}).classes.some(c=>c.students.some(s=>s.id===stu.id)),'已刪除的學生不列');
    const txt=C.weeklyText(W,c701,{from:'資源班 林組長'});
    ok(/^陳大文老師您好/.test(txt)&&txt.includes('遲到 1 次')&&txt.includes('忘了帶課本')&&txt.endsWith('資源班 林組長'),'草稿有稱呼、遲到、備註、署名');
    ok(C.weeklySummary(C.emptyData(),{},WS).classes.length===0,'空資料不會出錯');
    const noHead=C.weeklyText(W,Object.assign({},c701,{head:''}));ok(/^導師您好/.test(noHead),'沒填導師時稱呼「導師」');
  }
  // 41. 學年交接檢查
  {
    console.log('\n41. 學年交接 handoverCheck');
    const D=C.defaultData(),today='2026-11-25',base=C.handoverBase(D,123);
    ok(base.at===123&&Object.keys(base.s).length===D.students.length&&base.s.s1.cls==='701','基準存每位學生的班級、座號、個管');
    ok(!C.handoverCheck(D,base,today).items.some(x=>['moved','in','out'].includes(x.k)),'剛設好基準：沒有異動');
    D.students[0].cls='702';D.students[1].seat='99';D.students.splice(2,1);D.students.push({id:'sNew',cls:'801',seat:'30',name:'新同學',caseMgr:'r1',needs:[]});
    let R=C.handoverCheck(D,base,today),k=x=>R.items.filter(i=>i.k===x);
    ok(k('moved').length===2&&k('moved')[0].d.includes('701 → 702')&&k('moved')[1].d.includes('座號'),'班級、座號改了');
    ok(k('out').length===1&&k('out')[0].t.includes('林小美'),'轉出（基準裡有、名冊沒有）');
    ok(k('in').length===1&&k('in')[0].go.id==='sNew','轉入');
    ok(k('tt').length===1&&k('tt')[0].t==='全校課表','完全沒有全校課表：只列一項');
    D.tt={'701':{subj:{}},'802':{subj:{}}};R=C.handoverCheck(D,base,today);
    ok(k('tt').map(x=>x.t).join()==='702 班,801 班,901 班,902 班','有學生但全校課表沒有的班級');
    D.students[3].caseMgr='';D.students[4].caseMgr='nobody';R=C.handoverCheck(D,base,today);
    ok(k('cm').length===2&&k('cm').some(x=>x.level==='bad'&&x.d.includes('不在名冊'))&&k('cm').some(x=>x.d==='沒有個管'),'沒有個管、個管已不在名冊');
    D.students[5].iepDate='2026-12-25';D.students[6].certExp='2026-11-24';D.students[7].reviewDate='2027-01-25';D.students[8].iepDate='亂寫';D.students[9].iepDate=today;
    R=C.handoverCheck(D,base,today);
    ok(k('due').length===3,'60 天內、已過期、今天：3 項（61 天後和看不懂的日期不列）');
    ok(k('due').some(x=>x.level==='bad'&&x.d.includes('已過 1 天'))&&k('due').some(x=>x.d.includes('還有 30 天'))&&k('due').some(x=>x.d.includes('就是今天')),'到期的說明');
    const g=D.groups.find(x=>x.grade==='7');g.students.push(D.students.find(s=>s.cls==='801').id);R=C.handoverCheck(D,base,today);
    ok(k('grade').length===1&&k('grade')[0].go.id===g.id,'課的年級和學生的年級不合');
    R=C.handoverCheck(D,null,today);ok(!R.hasBase&&!k('moved').length&&!k('out').length,'沒有基準：只做資料本身的檢查');
    ok(C.handoverCheck(C.emptyData(),null,today).items.length===0,'空資料沒有項目');
    ok(R.items.every(x=>x.go&&x.go.to),'每一項都有前往的目標');
  }
  // 42. 老師工作量
  {
    console.log('\n42. 老師工作量 teacherLoad');
    const {D,M}=solved(),S=C.toState(M,D);
    D.iep={rounds:[{meets:[{at:'x',p:[['t:r1','個管',1]]},{at:'',p:[['t:r1','個管',1]]},{at:'y',p:[['n:王老師','任課',0],['t:r3','個管',1]]}]}]};
    const E={proctorOf:{a:'林組長',b:'王老師',c:'王'},supportOf:{x:'李老師',y:''}};
    const L=C.teacherLoad(D,M,S.slot,E),by=id=>L.find(x=>x.id===id);
    ok(L.length===3&&L.every(x=>D.teachers.find(t=>t.id===x.id).role==='資源班'),'只列資源班老師');
    const placed=M.L.filter((x,l)=>S.slot[l]>=0&&M.G[x.g].t>=0).length;
    ok(L.reduce((n,x)=>n+x.per,0)===placed,'排了幾節加起來等於排進去的節數');
    ok(by('r1').groups===D.groups.filter(g=>g.teacher==='r1').length&&by('r1').cases===8,'幾門課、個管幾位');
    ok(by('r1').proctor===1&&by('r2').proctor===2&&by('r3').support===1,'監考、支援照姓名對（「王」也算王老師）');
    ok(by('r1').iep===1&&by('r2').iep===1&&by('r3').iep===1,'IEP 會議只算排定時間的');
    const r1=by('r1');ok(r1.flag===(r1.per>12?'over':r1.per<12?'under':'')&&r1.diff===r1.per-12,'超過、不足鐘點');
    D.teachers.find(t=>t.id==='r2').hours=0;ok(C.teacherLoad(D,M,S.slot,null).find(x=>x.id==='r2').flag==='','沒填鐘點不標超過或不足');
    ok(C.teacherLoad(D,null,null,null).every(x=>x.proctor===0&&x.iep>=0),'沒有段考資料、不給 M 也可以');
  }
  // 43. 教室使用率
  {
    console.log('\n43. 教室使用率 roomUsage');
    const {D,M}=solved(),S=C.toState(M,D),U=C.roomUsage(M,S.slot,S.rfix);
    ok(U.cells.every(r=>r.every(c=>c.length<=1)),'一間教室一節最多一門課');
    const used=U.cells.reduce((n,r)=>n+r.reduce((m,c)=>m+c.length,0),0),placed=[...S.slot].filter(s=>s>=0).length;
    ok(used+U.none.length===placed,'每一節課都在格子裡（或列為沒有教室）');
    ok(U.rooms.every(r=>r.pct>=0&&r.pct<=100&&r.total===U.reg.length),'使用率 0～100%');
    ok(U.reg.length===5*D.periods.filter(p=>!p.extra).length-D.blocked.length,'分母不含早自習、全校共同不排');
    const s=U.reg.find(x=>U.cells.reduce((n,r)=>n+r[x].length,0)===1);
    ok(s==null||C.freeRooms(U,s).length===D.rooms.length-1,'找空教室：那一節有一門課，空的少一間');
    const D0=C.defaultData();D0.rooms=[];const M0=C.compile(D0),S0=C.solve(M0,C.toState(M0,D0),{seed:1}),U0=C.roomUsage(M0,S0.slot);
    ok(U0.rooms.length===0&&U0.none.length===[...S0.slot].filter(x=>x>=0).length,'沒有教室：全部列為沒有教室');
  }
  // 44. 鎖課異動
  {
    console.log('\n44. 鎖課異動 lockDiff／lockList／lockLogAdd');
    const a={cls:'701',k:'0-1',sj:'國文',t:'張老師'},b={cls:'701',k:'0-2',sj:'數學',t:'陳老師'},c={cls:'702',k:'1-3',sj:'英文',t:'劉老師'};
    let d=C.lockDiff([a,b],[b,c]);ok(d.added.length===1&&d.added[0].cls==='702'&&d.removed.length===1&&d.removed[0].k==='0-1','新增一筆、取消一筆');
    d=C.lockDiff([a,b],[b,a]);ok(!d.added.length&&!d.removed.length,'順序不同不算異動');
    d=C.lockDiff([a],[Object.assign({},a,{t:'吳老師'})]);ok(d.added.length===1&&d.removed.length===1,'換老師＝取消舊的、新增新的');
    d=C.lockDiff(null,[a]);ok(d.added.length===1&&!d.removed.length,'沒有上一次：全部算新增');
    const {D,M}=solved(),S=C.toState(M,D),LL=C.lockList(M,S.slot);
    ok(LL.length===C.lockTable(M,S.slot).reduce((n,r)=>n+r.slots.length,0)&&LL.every(o=>o.cls&&/^\d-/.test(o.k)&&o.sj),'一般鎖課：照鎖課表逐節列出');
    const F=solved(D=>{D.settings.lockMode='flex';}),FS=C.toState(F.M,F.D);
    ok(C.lockList(F.M,FS.slot).length===C.assignLocks(F.M,FS.slot).locks.length,'彈性鎖課：照配鎖課的結果');
    const X={};let e=C.lockLogAdd(X,LL,{label:'第一版',by:'a@b.c',at:1});
    ok(e.first&&e.added.length===LL.length&&X.lockLast.list.length===LL.length&&e.by==='a@b.c','第一次：全部是新增，記下這次的清單');
    e=C.lockLogAdd(X,LL,{label:'第二版'});ok(!e.first&&!e.added.length&&!e.removed.length&&e.by==='本機','沒變：新增 0、取消 0；沒登入記「本機」');
    e=C.lockLogAdd(X,LL.slice(1).concat([{cls:'9|9',k:'4-7',sj:'理化',t:'王|老師'}]),{label:'第三版'});
    ok(e.removed.length===1&&e.added.length===1&&C.lockUnpack(X.lockLast.list).some(o=>o.t==='王|老師'),'異動算得對，名字有「|」也讀得回來');
    for(let i=0;i<60;i++)C.lockLogAdd(X,LL,{label:'v'+i});ok(X.lockLog.length===50&&X.lockLog[49].label==='v59','最多留 50 筆');
  }
  // 45. 家長聯絡紀錄
  {
    console.log('\n45. 家長聯絡紀錄 contactDigest');
    const D=C.defaultData();D.contacts={s1:[{id:'c1',date:'2026-10-05',how:'LINE',who:'母',note:'作業\n太多'},{id:'c2',date:'2026-09-01',how:'電話',who:'父',note:'開學'},
      {id:'c3',date:'2026-10-01',how:'飛鴿',who:'',note:''},{id:'c4',date:'',how:'電話'},{id:'c5',date:'2026-10-01',how:'面談',who:'母',note:'IEP 前'}]};
    let r=C.contactDigest(D,'s1','2026-10-01');
    ok(r.n===3&&r.list[0].date==='2026-10-01'&&r.list[2].id==='c1','當天起（含當天），照日期排；沒有日期的不算');
    ok(r.by['其他']===1&&r.by['面談']===1&&r.by.LINE===1,'看不懂的方式算「其他」');
    ok(r.text.startsWith('701 王小明')&&r.text.includes('10/5 LINE｜母：作業 太多')&&r.text.includes('共 3 次'),'整理成文字，備註換行變空白');
    r=C.contactDigest(D,'s1','');ok(r.n===4&&r.text.includes('9/1'),'沒給日期：全部');
    D.contacts.s1.push({id:'c6',date:'2025-12-31',how:'電話',who:'',note:''});ok(C.contactDigest(D,'s1').text.includes('2025-12-31'),'跨年就寫完整日期');
    ok(C.contactDigest(D,'s2').n===0&&C.contactDigest({students:[]},'zz').n===0,'沒有紀錄、找不到學生都不會出錯');
  }
  // 46. 超鐘點：資料、開課摘要、建議分配
  {
    console.log('\n46. 超鐘點 otSummary／suggestOvertime');
    const fresh=mut=>{const D=C.defaultData();if(mut)mut(D);return C.normalize(D);};
    let D=fresh(D=>{const t=D.teachers[0];t.reduce='2';t.reduceNote=' 組長 ';t.otMax='';t.prefSubj='國文、數學';t.avoidSubj=[];
      D.settings.otCap='3';D.settings.noClass=['2026-10-10','115.12.25','2027/1/2 ~ 2026-12-31','壞的','2026-02-30','2026-10-10'];D.settings.otCountExtra=0;
      D.claims=[{gid:'g1',tid:'r1',at:1,status:'pending'},{gid:'g1',tid:'r1',status:'怪'},null,{gid:'<x>',tid:'r1',status:'pending'}];});
    const t0=D.teachers[0];
    ok(t0.reduce===2&&t0.reduceNote==='組長'&&!('otMax' in t0)&&t0.prefSubj.join()==='國文,數學'&&!('avoidSubj' in t0),'老師的減授、意願欄位整理好；空的拿掉');
    ok(D.settings.otCap===3&&!('otCountExtra' in D.settings),'全校上限是數字；外加課預設不算');
    ok(D.settings.noClass.join('|')==='2026-10-10|2026-12-25|2026-12-31~2027-01-02','放假日：民國年、斜線、一段日期（前後顛倒也行）；寫錯和重複的拿掉');
    ok(D.claims.length===1&&D.claims[0].gid==='g1','壞掉的認領拿掉');
    ok(JSON.stringify(C.normalize(JSON.parse(JSON.stringify(D))))===JSON.stringify(D),'再整理一次不會變');
    ok(C.otDue({hours:12,reduce:2})===10&&C.otDue({hours:2,reduce:4})===0&&C.otDue({})===0,'應授＝基本－減授，不會小於 0');
    D=fresh();let S=C.otSummary(D);
    ok(S.need===37&&S.needReg===36&&S.due===38&&S.short===0&&S.open.length===0,'範例：要 37 節（一般 36），應授 38，足夠');
    const r1=S.rows.find(r=>r.id==='r1');ok(r1.reg===11&&r1.extra===1&&r1.ot===0&&r1.short===1,'林組長：一般 11、外加 1，還差 1 節');
    D=fresh(D=>{D.teachers[0].reduce=4;D.teachers[2].otMax=2;D.settings.otCap=1;});S=C.otSummary(D);
    ok(S.due===34&&S.short===2,'減授 4 節後應授 34，缺 2 節');
    const r3=S.rows.find(r=>r.id==='r3');ok(r3.ot===0&&r3.limit===1,'上限取願意的和全校上限比較小的');
    D=fresh(D=>{D.teachers[2].hours=12;D.teachers[2].otMax=2;});
    ok(C.otSummary(D).rows.find(r=>r.id==='r3').ot===1&&!C.otSummary(D).rows.find(r=>r.id==='r3').over,'超 1 節，沒超過意願');
    D.teachers[2].otMax=0;ok(C.otSummary(D).rows.find(r=>r.id==='r3').over,'不願意卻超鐘點：標紅');
    D.settings.otCountExtra=true;D.teachers[0].hours=11;ok(C.otSummary(D).rows.find(r=>r.id==='r1').ot===1,'外加課算進超鐘點時，外加的節數也算');

    // 建議分配
    const sg=(mut,o)=>{const D=fresh(mut);return {D,R:C.suggestOvertime(D,o)};};
    let {R}=sg(D=>{D.groups.find(g=>g.id==='g7').teacher='';});
    ok(R.list.length===1&&R.list[0].to==='r1'&&R.list[0].otAdd===0&&R.list[0].why.some(w=>/應授內/.test(w)),'沒有老師的課先給還沒滿應授的老師（不用超鐘點）');
    ({R}=sg(D=>{D.groups.find(g=>g.id==='g7').teacher='';D.teachers[0].hours=6;D.teachers[1].otMax=0;D.teachers[2].otMax=3;}));
    ok(R.list.length===0&&R.left.length===1&&R.left[0].why.some(w=>/王老師：不願意/.test(w))&&R.left[0].why.some(w=>/李老師：超鐘點會超過上限/.test(w)),'超過願意的節數就不給；分不出去的列出原因');
    ({R}=sg(D=>{D.groups.find(g=>g.id==='g7').teacher='';D.teachers[0].hours=6;D.teachers[2].otMax=6;D.settings.otCap=3;}));
    ok(R.list.length===0,'全校上限也要遵守');
    ({R}=sg(D=>{D.groups.find(g=>g.id==='g7').teacher='';D.teachers[0].hours=6;D.teachers[2].otMax=6;}));
    ok(R.list.length===1&&R.list[0].to==='r3'&&R.list[0].otAdd===4&&R.rows.find(r=>r.id==='r3').ot===4,'有意願的老師接，超鐘點 +4');
    ({R}=sg(D=>{D.groups.find(g=>g.id==='g7').teacher='';D.teachers[0].hours=6;D.teachers[2].otMax=6;D.teachers[2].avoidSubj=['國文'];}));
    ok(R.list.length===0&&R.left[0].why.some(w=>/不想教國文/.test(w)),'不想教的科目不給');
    ({R}=sg(D=>{D.groups.find(g=>g.id==='g7').teacher='';D.teachers[0].hours=6;D.teachers[1].hours=17;D.teachers[2].hours=18;D.teachers[1].prefSubj=['國文'];D.teachers[1].prefGrade=['9'];}));
    ok(R.list[0].to==='r2'&&R.list[0].why.includes('想教國文')&&R.list[0].why.includes('想教九年級'),'想教的科目、年級優先');
    ({R}=sg(D=>{D.teachers[1].hours=15;D.teachers[2].hours=16;const g9=D.groups.find(g=>g.id==='g9');D.groups.push({id:'gx',name:'九英補救',subject:'英文',teacher:'',per:2,students:g9.students.slice(0,3),mode:'抽離',on:true,grade:''});}));
    ok(R.list[0].to==='r2'&&R.list[0].why.some(w=>/已經教 3 位/.test(w)),'同一位學生的課給同一位老師');
    ({R}=sg(D=>{D.teachers[1].otMax=10;D.teachers[2].hours=13;D.teachers[2].otMax=10;D.teachers[0].otMax=0;D.teachers[0].hours=11;
      D.groups.push({id:'ga',name:'甲',subject:'自然',teacher:'',per:3,students:[],mode:'抽離',on:true,grade:''},{id:'gb',name:'乙',subject:'自然',teacher:'',per:3,students:[],mode:'抽離',on:true,grade:''});}));
    ok(R.list.length===2&&R.list[0].to!==R.list[1].to,'超鐘點平均分給兩位老師');
    ({R}=sg(D=>{D.groups.find(g=>g.id==='g7').teacher='';D.teachers[0].hours=6;D.teachers[2].otMax=6;
      const keep=['0-1','0-2'];D.teachers[2].off=[];for(let d=0;d<5;d++)D.periods.forEach(p=>{const k=d+'-'+p.id;if(!keep.includes(k))D.teachers[2].off.push(k);});}));
    ok(R.list.length===0&&R.left[0].why.some(w=>/李老師：不排課時段太多/.test(w)),'不排課時段太多、排不下這門課的老師跳過');
    ({R}=sg(D=>{D.teachers[2].hours=8;D.teachers[2].otMax=0;D.teachers[0].otMax=5;},{overflow:true}));
    ok(R.list.length===1&&R.list[0].from==='r3'&&R.list[0].to==='r1'&&R.list[0].per===5,'超過上限的老師多出來的課，可以建議改給別人');
    D=fresh();ok(C.suggestOvertime(D).list.length===0&&C.suggestOvertime(D).left.length===0,'都有老師：沒有建議');
  }
  // 47. 認領
  {
    console.log('\n47. 認領 claimAdd／claimDecide');
    const D=C.normalize(C.defaultData()),g=D.groups.find(x=>x.id==='g7');g.teacher='';
    ok(C.openCourses(D).map(x=>x.id).join()==='g7','沒有老師的課是「待認領」');
    ok(C.claimAdd(D,'g7','r2',1).ok&&!C.claimAdd(D,'g7','r2',2).ok,'同一位老師不能重複認領');
    ok(C.claimAdd(D,'g7','r3',3).ok&&C.claimsPending(D).length===2,'兩位老師認領同一門課：都在等管理者');
    ok(!C.claimAdd(D,'g1','r3').ok,'已經有老師的課不能認領');
    D.teachers[0].avoidSubj=['國文'];ok(!C.claimAdd(D,'g7','r1').ok,'設定不教的科目不能認領');
    ok(C.claimDecide(D,'g7','r3',true,9).ok&&g.teacher==='r3','核准：課給這位老師');
    ok(D.claims.find(c=>c.tid==='r3').status==='ok'&&D.claims.find(c=>c.tid==='r2').status==='no'&&C.claimsPending(D).length===0,'同一門課的其他認領自動沒選上');
    ok(!C.claimDecide(D,'g7','r2',true).ok,'決定過的不能再核准');
    g.teacher='';D.teachers[0].avoidSubj=[];ok(C.claimAdd(D,'g7','r1').ok,'課又沒有老師時可以再認領');
    ok(C.claimDecide(D,'g7','r1',false,10).ok&&g.teacher===''&&C.claimsPending(D).length===0&&D.claims.filter(c=>c.tid==='r1').pop().status==='no','不核准：課還是沒有老師');
    C.claimAdd(D,'g7','r2',11);ok(C.claimCancel(D,'g7','r2')&&C.claimsPending(D).length===0,'老師可以收回自己的認領');
    C.claimAdd(D,'g7','r2',12);g.teacher='r1';ok(C.claimsPending(D).length===0,'課已經有老師了：不算待確認');
    const E=C.defaultData();E.groups[6].id='g 7';E.claims=[{gid:'g 7',tid:'r2',at:1,status:'pending'}];C.normalize(E);
    ok(E.claims[0].gid===E.groups[6].id&&C.ID_RE.test(E.claims[0].gid),'不合格的課程 id 換掉時，認領也跟著換');
  }
  // 48. 每月超鐘點
  {
    console.log('\n48. 每月超鐘點 overtimeMonth');
    const {D,M}=solved(d=>{d.teachers[1].hours=10;}),S=C.toState(M,D);
    const by=(R,id)=>R.rows.find(r=>r.id===id);
    const perDay=id=>{const a=[0,0,0,0,0];M.L.forEach((x,l)=>{const s=S.slot[l],g=M.G[x.g];if(s>=0&&g.pull&&g.t>=0&&M.T[g.t].id===id)a[Math.floor(s/M.NP)]++;});return a;};
    const P2=perDay('r2');let R=C.overtimeMonth(D,M,S.slot,'2026-12');
    ok(R.days.length===23&&R.weeks.length===5,'2026 年 12 月有 23 個上課日、5 週');
    ok(by(R,'r2').weekly===12&&by(R,'r2').weekOT===2&&by(R,'r2').due===10,'每週 12 節、應授 10：每週超 2 節');
    const w1=by(R,'r2').weeks[0],t1=P2[1]+P2[2]+P2[3]+P2[4];
    ok(w1.n===4&&w1.taught===t1&&w1.ot===Math.max(0,Math.round((t1-8)*10)/10),'月初不滿一週：只算這個月的上課日，應授照比例 10×4÷5');
    ok(by(R,'r2').weeks[1].ot===2&&by(R,'r2').weeks[1].n===5,'整週：就是每週超鐘點');
    D.settings.noClass=['2026-12-25'];R=C.overtimeMonth(D,M,S.slot,'2026-12');
    const w4=by(R,'r2').weeks[3];ok(R.days.length===22&&R.off.some(o=>o.date==='2026-12-25'&&o.why==='放假'),'放假日不算上課日');
    ok(w4.n===4&&w4.taught===12-P2[4]&&w4.ot===Math.max(0,Math.round((12-P2[4]-8)*10)/10),'放假那天的課不算，應授也少一天');
    D.settings.noClass=['2026-12-24~2026-12-31'];R=C.overtimeMonth(D,M,S.slot,'2026-12');ok(R.days.length===17,'一段放假日');
    D.settings.noClass=[];D.settings.dates='115.09.01-115.12.18';R=C.overtimeMonth(D,M,S.slot,'2026-12');
    ok(R.days.length===14&&R.days[R.days.length-1].date==='2026-12-18'&&R.off.some(o=>o.why==='學期外'),'學期結束之後不算（實施日期用民國年也讀得懂）');
    ok(by(R,'r2').month===Math.round(by(R,'r2').weeks.reduce((n,w)=>n+w.ot,0)*10)/10,'本月＝各週相加');
    D.settings.dates='';const r1=by(C.overtimeMonth(D,M,S.slot,'2026-12'),'r1');
    ok(r1.extraMonth>0&&/外加 \d+ 節另計/.test(r1.note),'外加課另外列，不算進超鐘點');
    D.settings.otCountExtra=true;ok(by(C.overtimeMonth(D,M,S.slot,'2026-12'),'r1').weekly===r1.weekly+1,'打開「外加課算進超鐘點」就算進去');
    D.teachers[2].hours=0;const r3=by(C.overtimeMonth(D,M,S.slot,'2026-12'),'r3');ok(r3.month===0&&/沒填基本鐘點/.test(r3.note),'沒填基本鐘點：不算超鐘點');
    ok(C.overtimeMonth(D,M,S.slot,'2026-13x')===null,'月份寫錯回傳 null');
    const L=C.teacherLoad(D,M,S.slot,null).find(x=>x.id==='r1');ok(L.ot&&L.ot.extra===1&&L.ot.reg===L.per-1,'老師工作量也有應授、超鐘點、外加課');
    ok(C.termRange('2026/9/1～2027/1/20').to==='2027-01-20'&&C.termRange('')===null,'學期起訖');
  }
}
module.exports={run};
if(require.main===module){let fail=0;run((c,m)=>{console.log((c?'  通過 ':'  失敗 ')+m);if(!c)fail++;});console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');process.exit(fail?1:0);}

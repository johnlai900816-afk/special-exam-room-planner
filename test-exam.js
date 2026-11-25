/* node test-exam.js：段考頁（exam.html）的核心：服務從 IEP 帶入、開始新段考、補考名單 */
'use strict';
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/exam.html','utf8');
const code=html.slice(html.indexOf('/*CORE-START*/'),html.indexOf('/*CORE-END*/'));
const ctx={module:{exports:{}},console};vm.createContext(ctx);vm.runInContext(code,ctx);
const C=ctx.module.exports;
let fail=0;
const ok=(c,m)=>{console.log((c?'  通過 ':'  失敗 ')+m);if(!c)fail++;};
const J=x=>JSON.stringify(x);

console.log('A. 段考服務從 IEP 帶入');
{
  const s={id:'r1',cls:'801',seat:'05',name:'王小明',sv:{},memo:''};
  ok(C.svcFromRoster(s,{ext:'*',oral:['作文','國文'],note:'需要提醒時間'})===true,'第一次帶入：有變動');
  ok(J(s.sv)===J({ext:'*',oral:['作文','國文'].sort()}),'服務照 IEP 寫入 sv');
  ok(s.memo==='需要提醒時間','備註是空的時，帶入 IEP 的 note');
  ok(C.svIsFromRoster(s),'標成「來自 IEP」');
  ok(C.svcFromRoster(s,{oral:['國文','作文'],ext:'*'})===false,'IEP 沒變（科目順序不同也一樣）：不動');
  s.sv.pc=['作文'];
  ok(C.svcFromRoster(s,{ext:'*',oral:['作文','國文']})===false,'考場手動改過、IEP 沒變：保留手動修改');
  ok(J(s.sv.pc)===J(['作文']),'手動加的電腦作答還在');
  ok(!C.svIsFromRoster(s),'手動改過就不再標「來自 IEP」');
  ok(C.svcFromRoster(s,{ext:'*',read:'*'})===true,'IEP 改了：重新帶入');
  ok(J(s.sv)===J({ext:'*',read:'*'})&&C.svIsFromRoster(s),'帶入新的 IEP 服務');
  ok(C.svcFromRoster(s,null)===false&&J(s.sv)===J({ext:'*',read:'*'}),'名冊沒有 examSvc：不動');
  const t={id:'r2',sv:{},memo:'原本的備註'};C.svcFromRoster(t,{small:[],read:'*',note:'x'});
  ok(J(t.sv)===J({read:'*'})&&t.memo==='原本的備註','空陣列不算服務；已有備註不覆蓋');
}
{
  const D=C.defaultData();D.title='舊段考';D.assign={'x|國文':{ses:'d2p2',room:'A',pin:true}};D.proctorOf={k:'老師A'};D.handIn={'國文':{x:'absent'}};
  D.students[0].on=false;D.students[1].svFromRoster=C.svSig(D.students[1].sv);D.proctorInfo={'老師A':{teach:7,quota:3}};
  const N=C.startNewExam(D,true);
  ok(N.title===''&&J(N.assign)==='{}'&&J(N.proctorOf)==='{}'&&J(N.handIn)==='{}','新段考：名稱、排法、監考分配、交卷勾選清掉');
  ok(N.students.length===D.students.length&&N.sessions.length===D.sessions.length&&N.rooms.length===D.rooms.length,'名單、考程、教室留著');
  ok(J(N.students.map(x=>x.sv))===J(D.students.map(x=>x.sv)),'沿用上次段考的服務');
  ok(N.students.every(x=>x.on),'每位學生重新排入');
  ok(N.proctorInfo['老師A'].teach===7&&N.proctorInfo['老師A'].quota==='','監考老師留著、指定節數改回按比例');
  ok(D.title==='舊段考','原本的資料沒有被改到');
  const E=C.startNewExam(D,false);
  ok(E.students.every(x=>J(x.sv)==='{}'&&!x.svFromRoster),'服務清空（之後名冊的 IEP 會重新帶入）');
  const s=E.students[1];ok(C.svcFromRoster(s,{small:'*'})===true&&J(s.sv)===J({small:'*'}),'清空後 IEP 服務再帶入');
}

console.log('B. 補考名單');
{
  const D=C.defaultData(),id=n=>D.students.find(x=>x.name===n).id;
  ok(C.makeupList(D).length===0,'沒有勾未到：補考名單是空的');
  D.handIn={'數學':{[id('王小明')]:'absent',[id('劉小宇')]:'absent',[id('陳小華')]:'in'},'作文':{[id('林小美')]:'absent'}};
  const L=C.makeupList(D);
  ok(L.length===2,'兩科有未到');
  ok(L[0].subject==='作文'&&L[1].subject==='數學','依考試順序排（作文在數學前）');
  const math=L[1];
  ok(math.students.map(x=>x.name).join()===['劉小宇','王小明'].join(),'只列未到的學生，依班級排序');
  ok(J(math.grades)===J([7,9]),'記下年級');
  const zw=L[0];
  ok(zw.from==='makeup'&&zw.slot.start==='10:10','作文已有補考節：用那一節的時間');
  ok(math.from==='free'&&!!math.slot,'數學沒有補考節：找空的時段');
  ok(math.slot.date==='12/1'&&math.slot.period==='第6節'&&math.slot.start==='14:05'&&math.slot.end==='14:50','空的時段＝第5、7節之間的第6節 14:05–14:50');
  const busy=D.sessions.filter(x=>C.normDate(x.date)===C.normDate(math.slot.date)&&x.start<math.slot.end&&math.slot.start<x.end&&x.grades.some(g=>[7,9].includes(g)));
  ok(busy.length===0,'建議的時段，這些年級都沒有考試');
  ok(C.dateKey(math.slot.date)*10000+(+math.slot.start.replace(':',''))>C.dateKey('12/1')*10000+915,'建議的時段在數學考完之後');
  ok(!!math.room&&D.rooms.find(r=>r.name===math.room).type!=='pc','有建議的試場（不是電腦教室）');
  const n0=D.sessions.length,n=C.addMakeupSessions(D,L);
  ok(n===1&&D.sessions.length===n0+1,'建立補考考程：只替沒有補考節的數學加一節');
  const mk=D.sessions[D.sessions.length-1];
  ok(mk.subject==='數學'&&mk.makeup===true&&mk.start===math.slot.start&&J(mk.grades)===J([7,9]),'新的補考節：科目、時間、年級正確');
  ok(C.addMakeupSessions(D,C.makeupList(D))===0,'再按一次不會重複新增');
  ok(C.makeupList(D)[1].from==='makeup','之後數學改用新的補考節');
  const M=C.compile(D);ok(M.ses.some(t=>t.makeup&&t.subject==='數學'),'新的補考節排得進考程');
  D.handIn['數學']={};D.handIn['作文']={[id('林小美')]:'in'};
  ok(C.makeupList(D).length===0,'改成已交：補考名單就沒有');
}

console.log(fail?'\n有 '+fail+' 項失敗':'\n全部通過');
process.exit(fail?1:0);

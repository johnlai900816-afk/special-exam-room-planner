/* node test.js：用範例資料檢查求解器 */
'use strict';
const C=require('./core.js');
let fail=0;
const ok=(c,m)=>{console.log((c?'  通過 ':'  失敗 ')+m);if(!c)fail++;};

// 1. 範例資料：全部排入、沒有違規
{
  const D=C.defaultData(),M=C.compile(D);
  const warns=M.G.flatMap(g=>g.warn.map(w=>g.name+'：'+w));
  ok(warns.length===0,'範例資料沒有分組警告'+(warns.length?' → '+warns.join('；'):''));
  const t=Date.now(),R=C.solve(M,C.toState(M,D),{seed:1});
  console.log('  排課耗時 '+(Date.now()-t)+' ms，共 '+M.L.length+' 節，分數 '+R.cost.toFixed(1));
  const out=[];C.evaluate(M,R.slot,out);
  ok(R.viol===0,'沒有違規'+(out.length?' → '+out.map(o=>o.m).join('；'):''));
  ok([...R.slot].every(s=>s>=0),'每一節都排進去了');
  // 獨立驗算：不靠 evaluate，再檢查一次硬性規則
  const seenT={},seenS={},seenReg={},seenCls={};let bad=0;
  M.L.forEach((x,l)=>{const g=M.G[x.g],s=R.slot[l];
    if(!g.allowed[s])bad++;
    const kt=s+'|'+g.t;if(seenT[kt])bad++;seenT[kt]=1;
    g.stu.forEach(i=>{const k=s+'|'+i;if(seenS[k])bad++;seenS[k]=1;});
    g.locks.forEach(k=>{const a=s+'|'+k.t;if(seenReg[a]!=null&&seenReg[a]!==k.c)bad++;seenReg[a]=k.c;
      const b=s+'|'+k.c;if(seenCls[b]!=null&&seenCls[b]!==g.subject)bad++;seenCls[b]=g.subject;});});
  ok(bad===0,'獨立驗算也沒有衝突');
  const perSlot={};R.slot.forEach(s=>{perSlot[s]=(perSlot[s]||0)+1;});
  ok(Object.values(perSlot).every(n=>n<=D.rooms.length),'同一節的組數不超過教室數');
  const rooms=C.assignRooms(M,R.slot);
  const rk={};let dup=0;rooms.forEach((r,l)=>{const k=R.slot[l]+'|'+r;if(r<0||rk[k])dup++;rk[k]=1;});
  ok(dup===0,'每一節都分到教室，而且不重複');
  // 存檔再讀回來要一樣
  D.assign=C.fromState(M,R);const S2=C.toState(C.compile(D),D);
  ok([...S2.slot].join()===[...R.slot].join(),'存檔後讀回來排法不變');
  const lt=C.lockTable(M,R.slot);
  ok(lt.length===18&&lt.every(r=>r.teacher),'鎖課表有 18 列（6 班 × 3 科）且都有任課老師');
  // 外加課只會排在早自習
  const ex=M.L.map((x,l)=>({g:M.G[x.g],s:R.slot[l]})).filter(o=>!o.g.pull);
  ok(ex.length===1&&ex.every(o=>M.P[o.s%M.NP].extra),'外加課排在外加時段');
}

// 2. 固定的節次不會被動到
{
  const D=C.defaultData(),M=C.compile(D),S=C.toState(M,D);
  const want=M.key2s('0-3');S.slot[0]=want;S.pin[0]=1;
  const R=C.solve(M,S,{seed:3});
  ok(R.slot[0]===want&&R.viol===0,'固定在週一第3節的那一節沒被移走，其餘照樣排好');
}

// 3. 同一位普通班老師教兩個班：分在同一組要被擋下來
{
  const D=C.defaultData();D.classSubj['702|國文']='k1';
  const M=C.compile(D),g=M.G[0];
  ok(g.warn.some(w=>w.includes('同一位老師')),'701、702 國文同一位老師時，七國會出現警告');
  const R=C.solve(M,C.toState(M,D),{seed:1,iters:4000,restarts:1});
  ok(R.viol>0,'這種情況排不出零違規（規則有擋）');
  D.settings.regClash=false;const M2=C.compile(D),R2=C.solve(M2,C.toState(M2,D),{seed:1});
  ok(R2.viol===0,'關掉這條規則後可以排出來');
}

// 4. 老師完全沒空：要回報排不進去，而不是亂排
{
  const D=C.defaultData(),all=[];for(let d=0;d<5;d++)D.periods.forEach(p=>all.push(d+'-'+p.id));
  D.teachers.find(t=>t.id==='r2').off=all;
  const M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:1,iters:3000,restarts:1});
  const mine=M.L.map((x,l)=>l).filter(l=>M.G[M.L[l].g].ref.teacher==='r2');
  ok(mine.length===12&&mine.every(l=>R.slot[l]===-1),'王老師整週不排課時，他的 12 節都留在「還沒排」');
}

// 5. 壞掉的存檔不會讓程式掛掉
{
  const D=C.normalize({title:'x',groups:[{name:'a',per:'99'}]}),M=C.compile(D);
  ok(M.L.length===15&&D.periods.length===8,'缺欄位的存檔會補齊（節數上限 15）');
}


// 6. 分層的不排課：年級、學生群組、個人都要被避開
{
  const D=C.defaultData(),M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:5});
  const at=(g,k)=>M.L.map((x,l)=>l).filter(l=>M.G[M.L[l].g].grades.includes(g)&&R.slot[l]===M.key2s(k)).length;
  ok(R.viol===0&&at(7,'4-6')===0&&at(8,'4-6')===0&&at(9,'3-6')===0,'各年級的社團時段都沒有排課（七八年級週五第6節、九年級週四第6節）');
  ok(at(9,'4-6')>=0&&M.G.find(g=>g.grades.includes(9)).allowed[M.key2s('4-6')]===1,'九年級在七八年級的社團時段仍然可以排');
  const tech=new Set(D.sets[0].students),hit=M.L.some((x,l)=>['1-5','1-6','1-7'].includes(M.s2key(R.slot[l]))&&M.G[x.g].ref.students.some(id=>tech.has(id)));
  ok(!hit,'技藝班學生所在的組，週二下午都沒有排課');
  ok(C.why(M,M.G.findIndex(g=>g.grades.includes(9)&&g.pull),M.key2s('1-5')).some(t=>t.includes('技藝班')),'原因會寫出是哪一層擋住（技藝班）');
  D.offBy['s:'+D.students[0].id]=['0-2'];const M2=C.compile(D);
  ok(M2.G.filter(g=>g.ref.students.includes(D.students[0].id)).every(g=>!g.allowed[M2.key2s('0-2')]),'個人的不排課時段會擋住他所在的每一組');
}

// 7. 實際學校的規模：三個年級各 17 班、78 位學生、33 組、每週一百多節、6 間教室
{
  const D=C.emptyData();D.rooms=[1,2,3,4,5,6].map(i=>({id:'R'+i,name:'教室'+i}));
  const subj=['國文','英文','數學'],per={國文:5,英文:3,數學:4};let tn=0;
  for(let i=0;i<9;i++)D.teachers.push({id:'r'+i,name:'資源'+i,role:'資源班',off:i<3?['2-5','2-6','2-7']:[]});
  [7,8,9].forEach(g=>{
    const codes=g===9?['A','B','C','D','E']:['A','B','C'],stu=[];
    for(let c=1;c<=17;c++){const cls=g+String(c).padStart(2,'0');
      subj.forEach(sj=>{const id='k'+(tn++);D.teachers.push({id,name:'任課'+id,role:'普通班',off:tn%4===0?[(tn%5)+'-1',(tn%5)+'-2']:[]});D.classSubj[cls+'|'+sj]=id;});
      const n=c%3===0?1:2;for(let k=0;k<n;k++){const s={id:'s'+cls+k,cls,seat:String(k+1),name:'生'+cls+k,caseMgr:'',note:''};D.students.push(s);stu.push(s);}}
    subj.forEach((sj,si)=>codes.forEach((code,ci)=>{
      D.groups.push({id:'g'+g+code+si,name:g+code+sj,subject:sj,teacher:'r'+((g-7)*3+ci+si)%9,per:per[sj],students:stu.filter((s,i)=>i%codes.length===ci).map(s=>s.id),mode:'抽離',room:'',on:true});}));
  });
  D.offBy={'g:7':['4-6','4-7'],'g:8':['3-6','3-7'],'g:9':['2-6','2-7']};D.blocked=['0-7'];
  const M=C.compile(D),t=Date.now(),R=C.solve(M,C.toState(M,D),{seed:2}),ms=Date.now()-t;
  const out=[];C.evaluate(M,R.slot,out);
  console.log('  規模：'+D.students.length+' 位學生、'+D.groups.length+' 組、'+M.L.length+' 節、'+D.teachers.length+' 位老師；耗時 '+ms+' ms；剩 '+R.viol+' 個問題');
  ok(R.viol===0,'實際規模也排得出零衝突'+(out.length?' → '+[...new Set(out.map(o=>o.m))].slice(0,3).join('；'):''));
  ok(ms<15000,'實際規模在 15 秒內排完（'+ms+' ms）');
}

// 8. 可以自由調整的部分：單節指定教室、規則開關、老師跨角色衝堂
{
  const D=C.defaultData(),M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:1});
  const S=C.toState(M,Object.assign(D,{assign:C.fromState(M,R)}));
  const a=0,b=M.L.findIndex((x,l)=>l!==a&&R.slot[l]===R.slot[a]);
  S.rfix[a]=2;M.lroom=S.rfix;let rooms=C.assignRooms(M,S.slot);
  ok(rooms[a]===2,'單獨指定某一節的教室會照指定排');
  if(b>=0){S.rfix[b]=2;const out=[];C.evaluate(M,S.slot,out);ok(out.some(o=>o.k==='room'),'兩節指定同一間教室、同一時段會被抓出來');S.rfix[b]=-1;}
  D.assign=C.fromState(M,S);const S2=C.toState(C.compile(D),D);ok(S2.rfix[a]===2,'指定的教室會跟著存檔');
  M.lroom=null;
  // 資源班老師同時是某班的任課老師：兩邊撞在同一節要算衝堂
  const D2=C.defaultData();D2.classSubj['701|國文']='r3';
  const M2=C.compile(D2),S3=C.toState(M2,D2),g1=M2.G.findIndex(g=>g.name==='七國'),g2=M2.G.findIndex(g=>g.ref.teacher==='r3');
  const l1=M2.L.findIndex(x=>x.g===g1),l2=M2.L.findIndex(x=>x.g===g2),sl=M2.key2s('1-3');
  S3.slot[l1]=sl;S3.slot[l2]=sl;const o3=[];C.evaluate(M2,S3.slot,o3);
  ok(o3.some(o=>o.k==='reg'&&o.m.includes('被鎖在原班')),'老師同一節既上資源班又被鎖在原班，會被抓出來');
  // 規則數字可調：同一組一天最多 2 節時，不會因為一天兩節被扣分
  const D3=C.defaultData();D3.settings.maxDay=2;const M3=C.compile(D3);ok(M3.maxDay===2&&C.compile(C.defaultData()).maxDay===1,'「同一組一天最多幾節」可以調整');
  const D4=C.defaultData();D4.settings.roomCheck=false;D4.rooms=[D4.rooms[0]];const M4=C.compile(D4),R4=C.solve(M4,C.toState(M4,D4),{seed:1});
  ok(R4.viol===0,'關掉教室數量檢查後，只有一間教室也排得出來');
}

// 9. 老師優先：先只有老師開的課（沒有學生）排出鐘點，再把學生編進課裡
{
  const D=C.defaultData();
  D.groups.forEach(g=>{if(g.mode!=='外加'){g.students.forEach(id=>{const s=D.students.find(x=>x.id===id);if(!s.needs.includes(g.subject))s.needs.push(g.subject);});g.students=[];}});
  C.normalize(D);const need0=C.needList(D).length;
  ok(need0>0&&D.groups.filter(g=>g.mode!=='外加').every(g=>!g.students.length),'開課時可以先沒有學生（待安排 '+need0+' 人次）');
  let M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:1});D.assign=C.fromState(M,R);
  ok(R.viol===0,'只有老師與課的時候，老師的鐘點排得出來');
  const g7=M.G.find(g=>g.name==='七國');ok(g7.alist.every(s=>M.s2key(s)!=='4-6'),'指定年級的課，還沒有學生也會避開該年級的社團時段');
  const r=C.placeStudents(D);
  ok(r.placed===need0&&!r.left.length&&!C.needList(D).length,'學生全部編進課裡（'+r.placed+' 人次）');
  ok(D.groups.every(g=>g.students.every(id=>!g.grade||String(D.students.find(s=>s.id===id).cls)[0]===g.grade)),'學生只會進到同年級的課');
  M=C.compile(D);R=C.solve(M,C.toState(M,D),{seed:2});
  ok(R.viol===0,'編完學生再修正一次，沒有衝堂');
  const s0=D.students[0];s0.needs.push('理化');ok(C.placeStudents(D).left.length===1,'沒有對應的課時會留在待安排，不會亂塞');
  // AI 接口：題目不含姓名，回覆可以套回來
  const txt=C.aiPrompt(D);ok(!D.students.some(s=>txt.includes(s.name))&&!D.teachers.some(t=>txt.includes(t.name)),'給 AI 的題目不含學生與老師姓名');
  const D5=C.defaultData();D5.students[7].needs=['國文'];
  const res=C.aiApply(D5,'好的：```json\n{"slots":{"C1":["0-1","1-2","9-9"]},"members":{"C1":["S1","S8"]}}\n```');
  ok(D5.groups[0].students.join()==='s1,s8'&&D5.assign.g1.length===2&&res.bad===1,'AI 的回覆會套回課表，看不懂的時段會略過並回報');
}

// 10. 貼上課程一覽表：每一組各自的節數、遮名對回名冊、鐘點表
{
  const D=C.defaultData();D.groups=[];D.assign={};
  const t=['領域名稱\t年級\t組別\t抽離或外加\t學生名單\t節數\t人數\t人次\t授課教師',
    '數學\t7\tA\t抽離\t701王○明、701陳○華\t3\t2\t6\t王老師\t\t\t\t\t教師\t基鐘\t部兼\t局兼\t總節數',
    '數學\t7\tB\t抽離\t702李○芳、702不○在\t4\t2\t8\t王老師\t\t\t\t\t王老師\t12\t2\t1\t15',
    '社會技巧\t8.9\tA\t外加\t801蔡小晴\t1\t1\t1\t新來的老師'].join('\n');
  const r=C.importCourseTable(D,t),g=n=>D.groups.find(x=>x.name===n);
  ok(r.added===3&&g('7A數學').per===3&&g('7B數學').per===4,'同科目不同組可以有不同節數（7A 3 節、7B 4 節）');
  ok(g('7A數學').students.join()==='s1,s2'&&g('7B數學').students.join()==='s5'&&r.miss.join()==='702不○在','遮名的學生對回名冊，對不到的會列出來');
  ok(g('A社會技巧').mode==='外加'&&g('A社會技巧').grade===''&&g('A社會技巧').students.join()==='s9'&&D.teachers.some(x=>x.name==='新來的老師'),'跨年級、外加、全名、新老師都處理');
  ok(D.teachers.find(x=>x.name==='王老師').hours===15,'右邊的鐘點表帶入基本鐘點');
  const r2=C.importCourseTable(D,t.replace('\t3\t2\t6','\t5\t2\t10'));ok(r2.updated===3&&r2.added===0&&D.groups.length===3&&g('7A數學').per===5,'再貼一次是更新，不會重複建立');
}

// 11. 彈性鎖課、不鎖課的課、貼上不排課表
{
  const D=C.defaultData();D.settings.lockMode='flex';D.settings.lockCap={國文:5,英文:3,數學:4};
  let M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:1});
  ok(M.flex&&R.viol===0,'彈性鎖課排得出零衝堂');
  let A=C.assignLocks(M,R.slot);const seen={};let dup=0;A.locks.forEach(k=>{const key=k.t+'|'+k.s;if(seen[key])dup++;seen[key]=1;});
  ok(A.pulled>0&&A.locks.length+A.open.length>=A.pulled&&dup===0,'配鎖課：同一位老師同一節只被一個班鎖（'+A.locks.length+' 鎖到、'+A.open.length+' 鎖不到）');
  const cnt={};A.locks.forEach(k=>{cnt[k.cls+k.sj]=(cnt[k.cls+k.sj]||0)+1;});ok(Object.keys(cnt).every(k=>cnt[k]<=M.capOf(k.slice(3))),'每班每科鎖的節數不超過上限');
  // 任課老師不排課時，改鎖別科而不是排不進去
  const D2=C.defaultData();D2.settings.lockMode='flex';D2.teachers.find(t=>t.id==='k1').off=[0,1,2,3,4].flatMap(dd=>['1','2','3','4','5','6','7'].map(p=>dd+'-'+p));
  M=C.compile(D2);R=C.solve(M,C.toState(M,D2),{seed:1});A=C.assignLocks(M,R.slot);
  ok(R.viol===0&&A.locks.some(k=>!k.same),'任課老師整週不排課時仍排得出來，原班改鎖其他主科');
  const D3=C.defaultData();D3.teachers.find(t=>t.id==='k1').off=D2.teachers.find(t=>t.id==='k1').off.slice();const M3=C.compile(D3);
  ok(M3.G.find(g=>g.name==='七國').alist.length===0,'同一科同時上的方式下，這種情況會排不進去（兩種方式確實不同）');
  // 不鎖課的課
  const D4=C.defaultData();D4.groups.find(g=>g.name==='七國').mode='不鎖課';const M4=C.compile(D4),g4=M4.G.find(g=>g.name==='七國');
  ok(g4.pull&&!g4.need&&!g4.locks.length&&g4.alist.every(s=>!M4.P[s%M4.NP].extra),'不鎖課的課排在一般節次，但不需要原班配合');
  // 貼上不排課表
  const D5=C.defaultData();const tx=['班級名稱'+'\t起始星期','701\t2\t2\t7\t7\t社團時間','702\t2\t2\t7\t7','701\t5\t5\t1\t2\t導師時間','張老師（國）\t2\t3\t5\t7\t領域','不在名冊\t1\t1\t1\t1'].join('\n');
  const r5=C.importOff(D5,tx,{hard:'社團'});
  ok(D5.offBy['c:701'].join()==='1-7'&&D5.offBy['c:702'].join()==='1-7'&&D5.offBy['k:701'].join()==='4-1,4-2','班級不排課：社團是不能抽離，其餘是不能鎖課；原因會沿用到下一列');
  ok(D5.teachers.find(t=>t.id==='k1').off.includes('2-6')&&r5.skipT.join()==='不在名冊'&&r5.tea===1,'教師不排課帶入，名冊沒有的老師略過並回報');
  D5.settings.lockMode='flex';const M5=C.compile(D5);ok(M5.lkav[M5.cIdx['701']*M5.NS+M5.key2s('4-1')]===0&&M5.lkav[M5.cIdx['702']*M5.NS+M5.key2s('4-1')]>0,'不能鎖課的時段，配鎖課時不會用到');
  // 連堂
  const D6=C.defaultData();D6.settings.lockMode='flex';D6.settings.lockCap={國文:5};D6.settings.lockDouble='國文';const M6=C.compile(D6),R6=C.solve(M6,C.toState(M6,D6),{seed:1}),A6=C.assignLocks(M6,R6.slot),by={};
  A6.locks.filter(k=>k.sj==='國文').forEach(k=>{(by[k.cls]=by[k.cls]||[]).push(k.s);});
  ok(Object.keys(by).every(c=>by[c].length<4||by[c].some(s=>by[c].includes(s+1)&&(s+1)%M6.NP!==0)),'國文鎖到只剩 1 節時，鎖的節次裡一定有連堂（不然就少鎖）');
}

console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');
process.exit(fail?1:0);

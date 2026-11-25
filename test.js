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
  const v5=C.aiProblem(D5).v,before=D5.groups[0].students.slice();
  const res=C.aiApply(D5,'好的：```json\n{"slots":{"C1":["0-1","1-2","9-9"]},"members":{"C1":["S1","S8"]}}\n```',v5);
  ok(D5.groups[0].students.join()===before.concat('s8').join()&&D5.assign.g1.length===1&&res.bad.length===2&&res.members===1,'AI 的回覆會套回課表，學生只會加進去；看不懂的時段、新學生原班老師不能排的時段都會略過並回報');
  // 代號對錯人的保護：題目版本對不上就不套用
  {const X=C.defaultData(),P=C.aiProblem(X);
    ok(/^[0-9a-f]{16}$/.test(P.v)&&P.codes.S.S1==='s1'&&!JSON.stringify(P).includes('"codes"'),'題目附上版本 v；代號對照表留在本機、不會送出');
    ok(P.courses.every(c=>Array.isArray(c.allowedSlots)&&c.allowedSlots.length)&&P.courses.find(c=>c.id==='C1').allowedSlots.every(k=>!/-m$/.test(k)),'每門課附上可排時段，抽離課不含早自習');
    X.students.splice(0,1);let e1=null;try{C.aiApply(X,JSON.stringify({v:P.v,slots:{C1:['0-1']}}));}catch(e){e1=e;}
    ok(e1&&e1.code==='stale','資料改過（少一位學生）之後，舊題目的回覆會被拒絕');
    let e2=null;try{C.aiApply(C.defaultData(),'{"slots":{"C1":["0-1"]}}');}catch(e){e2=e;}ok(e2&&e2.code==='stale','回覆沒有版本 v 也不套用');}
  {const X=C.defaultData(),v=C.aiProblem(X).v,n0=X.groups[0].students.length;
    const r=C.aiApply(X,JSON.stringify({v,members:{C1:['S99']}}));
    ok(X.groups[0].students.length===n0&&r.bad.length===1,'不認得的學生不會把整組清空');}
  {const X=C.defaultData();X.students[20].needs=['國文'];const v=C.aiProblem(X).v,n0=X.groups[0].students.length;
    const r=C.aiApply(X,JSON.stringify({v,members:{C1:['S21'],C2:['S1']}}));
    ok(X.groups[0].students.length===n0&&!X.groups[1].students.includes('s1')&&r.bad.length===2,'年級不對（902 進七國）、科目不需要（七國的學生進七數）都會拒絕');}
  {const X=C.defaultData(),v=C.aiProblem(X).v,r=C.aiApply(X,JSON.stringify({v,slots:{C1:['0-m','0-1'],C10:['0-m']}}));
    ok(X.assign.g1.length===1&&X.assign.g1[0].s==='0-1'&&X.assign.g10.length===1&&r.bad.length===1,'抽離課排在早自習會被拒絕；外加課可以');}
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

// 12. 學校自己維護：任課老師名單、學生名單、科目別名、新學期與升年級
{
  const J=rows=>rows.map(r=>r.join('\t')).join('\n');
  const D=C.defaultData();
  const tl=J([['','701','702','703','704'],['國語文','張老師（國）','新來的','','-'],['英語文','劉老師（英）','蔡主任（英）','劉老師（英）','-'],['','801','802','803'],['數學','陳老師（數）','黃老師（數）','陳老師（數）'],['901','國語文','吳老師（國）']]);
  const r=C.importTeacherList(D,tl),tn=k=>(D.teachers.find(x=>x.id===D.classSubj[k])||{}).name;
  ok(tn('702|國文')==='新來的'&&tn('703|英文')==='劉老師（英）'&&!D.classSubj['704|國文']&&tn('803|數學')==='陳老師（數）'&&tn('901|國文')==='吳老師（國）','教師名單（班級橫排）與一列一筆都讀得懂，空白和「-」略過');
  ok(r.newT.join()==='新來的'&&r.changed>=1,'名冊沒有的老師會新增，換老師會計數');
  ok(C.canonSubj(D,'英語文')==='英文'&&C.canonSubj(D,'國語')==='國文','科目別名統一成這份資料用的寫法');
  const D0=C.defaultData(),bad=J([['701','','節次','星期一','','','','','','801','','節次','','','','','','','901'],['國語文','李老師','3','','','','','','','國語文','王老師']]);
  ok(C.importTeacherList(D0,bad).set===0,'「資料輸入」這種有班級號碼但不是名單的表，不會被誤讀');
  const D2=C.defaultData(),r2=C.importStudents(D2,J([['班級','座號','姓名','個管老師','導師'],['701','3','王小明','王老師','蕭老師'],['799-05新同學'],['798','1','另一位','不存在']]));
  const s=D2.students.find(x=>x.cls==='701'&&x.seat==='03');
  ok(r2.add+r2.upd===3&&s&&s.caseMgr==='r2'&&D2.classHead['701']==='蕭'&&D2.students.some(x=>x.cls==='799'&&x.seat==='05'&&x.name==='新同學')&&r2.newCM.join()==='不存在','學生名單：照標題找欄位、班級座號姓名同一格、個管老師對回名冊（沒有的建成資源班老師）、導師另外存');
  { const E=C.defaultData(),o=E.students[0],r=C.importStudents(E,[o.cls,o.seat,'新轉入生'].join('\t')+'\n'+[o.cls,'','沒有座號','王老師'].join('\t'));
    ok(o.name!=='新轉入生'&&r.conflict.length===1&&E.students.some(x=>x.name==='新轉入生')&&E.students.some(x=>x.name==='沒有座號'&&!x.seat),'座號相同但名字不同不會蓋掉原本的學生；沒有座號時欄位不會錯位'); }
  const D3=C.defaultData(),n9=D3.students.filter(x=>x.cls[0]==='9').length,n7=D3.students.filter(x=>x.cls[0]==='7').length,n8=D3.students.filter(x=>x.cls[0]==='8').length;
  const r3=C.newTerm(D3,{promote:true,title:'新學年'});
  ok(r3.grad===n9&&D3.students.filter(x=>x.cls[0]==='8').length===n7&&D3.students.filter(x=>x.cls[0]==='9').length===n8&&!D3.students.some(x=>x.cls[0]==='7'),'升年級：七升八、八升九、九年級畢業');
  ok(!D3.groups.length&&!Object.keys(D3.classSubj).length&&!Object.keys(D3.assign).length&&D3.title==='新學年'&&D3.teachers.length===9&&D3.offBy['g:7'],'升年級時課程與任課老師清空，老師與年級時段保留');
  const D4=C.defaultData();D4.assign={g1:[{s:'0-1',pin:true}]};C.newTerm(D4,{clearAssign:true});ok(!Object.keys(D4.assign).length&&D4.groups.length===10,'只清排課結果時課程留著');
  const D5=C.defaultData();D5.settings.lockMode='flex';D5.settings.lockCap={國文:5,數學:4};const M5=C.compile(D5);
  ok(M5.copt.every(a=>a.every(x=>x.sj!=='英文')),'彈性鎖課只會改鎖有設上限的科目');
}

// 13. 學校原表：班級不排課全部鎖定、起訖填反、名冊外老師先記著
{
  console.log('\n13. 學校原表的不排課');
  const D=C.defaultData();D.offBy={};
  const r=C.importOff(D,'班級名稱\t起始星期\t結束星期\t首節\t末節\n701\t2\t2\t7\t7\t社團時間\n702\t2\t2\t7\t7\n教師姓名\t起始星期\t結束星期\t首節\t末節\n新來的\t4\t2\t5\t7\t資訊領域\n',{hard:'*'});
  ok(r.cls===2&&D.offBy['c:702']&&!Object.keys(D.offBy).some(k=>k[0]==='k'),'全部鎖定時，班級時段都當成不能被抽離');
  ok(r.bad===0&&D.offPool['新來的']&&D.offPool['新來的'].length===9,'起訖星期填反也照收，名冊外的老師先記著');
  C.importTeacherList(D,'\t701\t702\t703\n國語文\t新來的\t新來的\t新來的\n');
  const t=D.teachers.find(x=>x.name==='新來的');ok(t&&t.off.length===9,'之後加進名冊的老師自動帶上不排課時段');
  C.newTerm(D,{clearTeaOff:true});ok(!Object.keys(D.offPool).length,'新學期清老師不排課時一併清掉');
}

// 14. 手排鎖課：資料輸入的格子、資料輸出的清單；原因用勾選
{
  console.log('\n14. 手排鎖課與勾選原因');
  const D=C.defaultData();D.offBy={};
  const r0=C.importOff(D,'701\t2\t2\t7\t7\t社團時間\n702\t2\t2\t7\t7\n701\t5\t5\t1\t1\t導師時間\n',{hard:['社團時間']});
  ok(D.offBy['c:701']&&D.offBy['c:702']&&D.offBy['k:701'],'只鎖勾選的原因（原因往下沿用），其他只是不能鎖課');
  const tn=D.teachers[0].name,grid=['701\t\t節次\t星期一\t星期二\t星期三\t星期四\t星期五','\t\t1\t'+tn+'\t\t\t\t','科目\t教師\t2\t\t數學\t\t\t','數學\t'+tn+'\t3\t\t\t\t\t'].join('\n');
  const r1=C.importLocks(D,grid);
  ok(r1.n===1&&D.lockFix[0].cls==='701'&&D.lockFix[0].sj==='數學'&&D.lockFix[0].k.startsWith('0-'),'資料輸入：格子裡的老師名字讀成鎖課，科目寫在格子裡的略過');
  const r2=C.importLocks(D,'班級名稱\t科目名稱\t星期\t首節\t末節\t教師姓名\n701\t數學\t3\t2\t3\t'+tn+'\n');
  ok(r2.n===2&&D.lockFix.length===2&&D.lockFix.every(x=>x.k.startsWith('2-')),'資料輸出：首節到末節展開，整份換掉');
  C.newTerm(D,{clearAssign:true});ok(!D.lockFix.length,'新學期清空排課結果時一併清掉手排鎖課');
}

// 15. 全校課表：OCR 的錯字、黏在一起的數字、認班級；備用教室
{
  console.log('\n15. 全校課表與備用教室');
  const D=C.defaultData();D.offPool={'李惠婷':[],'房素琴':[],'蔡侑珊':[],'嚴于涵':[],'郭嘉琳':[]};
  const known=C.ttKnown(D);
  const txt='國語文   李惠婷”5 海洋之心A  李惠婷“1 類語文  房素琴 3 英語文  郭豆琳 1\n數學   蔡依珊4 歷史  嚴于涵“1\n髓育  李次萍“2';
  const L=C.ttParse(txt,known);const f=s=>L.find(x=>x.sj===s);
  ok(f('國語文')&&f('國語文').t==='李惠婷'&&f('國語文').n===5,'名字和節數黏在一起、前後的引號雜字都能拆開');
  ok(f('數學')&&f('數學').t==='蔡侑珊'&&!f('數學').unk,'名字錯一個字（蔡依珊）會對回已知的老師');
  const P=C.ttParseAll(D,[{text:txt,cls:'701',page:0},{text:'英語文 房素琴 3 國語文 李惠婷 5',cls:'702',page:1}],known),L1=P[0].list;
  ok(L1.filter(x=>x.sj==='英語文').map(x=>x.t).sort().join()===['房素琴','郭嘉琳'].sort().join(),'科目錯一個字（類語文）：整份一起讀，看老師在別班教什麼判斷是英語文');
  ok(f('體育')&&f('體育').t,'兩個字的科目錯一個字（髓育）也認得');
  ok(C.ttClassNo('2708')==='708'&&C.ttClassNo('04')==='','班級編號多讀的雜字會去掉，太短的不猜');
  C.ttStore(D,'701',L1,'test');ok(C.ttTeachers(D.tt,'701','作文').join()==='李惠婷'&&C.ttTeachers(D.tt,'701','英文').join()==='房素琴','作文找國語文老師、英文找節數最多的英語文老師');
  // 備用教室：平常用的教室夠就不會用到備用的
  const E=C.defaultData();E.rooms=[{id:'a',name:'一'},{id:'b',name:'二',spare:true}];const M=C.compile(E);
  ok(M.mainR===1&&M.roomOrder[0]===0,'勾備用的教室排在最後，平常只算沒勾的');
}

// 16. 全校課表 OCR 的反例：不能亂認；漏字、形近字要認得；節數 ≥10 不截斷；四碼班級
{
  console.log('\n16. 全校課表 OCR 反例');
  const K=new Set(['陳美玲','蔡依珊','王大明']);
  const a=C.ttNameFix('陳美華',K);ok(a.t!=='陳美玲'||a.guess,'陳美華 不會被自動改成 陳美玲（最多只是推測，要人確認）');
  const b=C.ttNameFix('黃美珠',K,null,'陳美玲');ok(b.t!=='陳美玲'&&b.unk,'黃美珠 只和預期的 陳美玲 同一個字，不猜');
  const c=C.ttNameFix('蔡珊',K);ok(c.t==='蔡依珊'&&!c.unk&&!c.guess,'漏一個字（蔡珊）對得回 蔡依珊');
  const d=C.ttNameFix('王大朋',new Set(['王大明','王大同']));ok(d.unk||d.guess,'兩位一樣像時不自動選');
  const P=s=>C.ttParse(s+' 王大明 2',K)[0];
  ok(['家長','生活','理由','體重'].every(s=>{const x=P(s);return !x||x.unk;}),'兩個字的科目差一個字（家長、生活、理由、體重）都標成待確認');
  ok(P('家政')&&!P('家政').unk&&P('髓育')&&P('髓育').sj==='體育'&&!P('髓育').unk,'完全相同、或只差形近字（髓育）的科目照常認');
  const n12=C.ttParse('體育 王大明 12',K)[0];ok(n12&&n12.n===12&&n12.unk,'節數 12 不會被截成 2，標成待確認');
  ok(C.ttClassNo('1201')==='1201'&&C.ttClassNo('2708')==='708'&&C.ttClassNo('x705')==='705','四碼班級（1201）照收，多讀的雜字仍去掉');
  const E=C.defaultData();C.ttStore(E,'701',[{sj:'數學',t:'陳美玲',n:4,guess:true}],'');ok(E.tt['701'].subj['數學'][0][2]===2,'推測的名字存成「推測」，不當成確定的');
}

// 17. 匯入的名字比對、課程一覽表重貼、兩位老師、新學年
{
  console.log('\n17. 匯入的名字比對與新學年');
  const D=C.defaultData();
  ok(C.normName(' 王 老師')==='王'&&C.teaByName(D,'王')===D.teachers.find(t=>t.id==='r2')&&C.teaByName(D,'林組長').id==='r1','normName 去掉空白和稱謂，老師用名字對得回來');
  // 學生名單先自動建了個管老師「周」，課程一覽表寫「周老師」：不會多一位
  C.importStudents(D,'701\t03\t王小明\t周老師');const n0=D.teachers.length;
  const t=['領域名稱\t年級\t組別\t抽離或外加\t學生名單\t節數\t人數\t人次\t授課教師','數學\t7\tA\t抽離\t701王○明、701陳○華\t3\t2\t6\t周老師、李老師'].join('\n');
  const r=C.importCourseTable(D,t),g=D.groups.find(x=>x.name==='7A數學');
  ok(D.teachers.length===n0&&D.teachers.find(x=>x.id===g.teacher).name==='周'&&r.coT.length===1&&/李老師/.test(r.coT[0]),'個管老師不重複建立；兩位老師時第一位當授課老師，另一位列出來');
  const r2=C.importCourseTable(D,t.replace('701陳○華','701不○在'));
  ok(g.students.length===2&&r2.kept.length===1&&/表上沒找到/.test(r2.kept[0]),'重貼時有名字對不到，原本的學生留著並標「表上沒找到」');
  const r3=C.importCourseTable(D,t.replace('、701陳○華',''));ok(g.students.length===1&&!r3.kept.length,'全部都對得到時，照表更新名單');
  C.importOff(D,'周老師\t1\t1\t1\t1',{});ok(D.teachers.find(x=>x.name==='周').off.length===1,'不排課表的「周老師」對得回名冊的「周」');
  C.importLocks(D,'班級名稱\t科目名稱\t星期\t首節\t末節\t教師姓名\n701\t數學\t1\t2\t2\t陳老師（數）\n');ok(D.lockFix[0].t==='陳老師（數）','手排鎖課存名冊裡的寫法');
  const D2=C.defaultData();D2.tt={'701':{subj:{},src:''}};D2.classHead={'701':'蕭'};const r4=C.newTerm(D2,{promote:true});
  ok(!Object.keys(D2.tt).length&&!Object.keys(D2.classHead).length&&r4.ttCleared,'升年級時清掉全校課表和導師');
}

// 18. 簽到退統計：學期中加入的學生、新學期清掉組別；備註拆成公開與私密
{
  console.log('\n18. 出缺席統計與私密備註');
  const vm=require('vm'),fs=require('fs');
  const D=C.defaultData(),g=D.groups[0],[a,b]=g.students;
  const ctx={D,console,localStorage:{getItem:()=>null,setItem:()=>{}},isRO:()=>false,attPush:()=>{},toast:()=>{},document:{},window:{}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/checkin.js','utf8')+';this.attSet=attSet;this.attStats=attStats;this.ATTref=()=>ATT;this.setATT=x=>{ATT=x;};',ctx);
  const key=g.id+'@1',late=D.students.find(s=>!g.students.includes(s.id));
  ctx.attSet('2026-09-01',key,a,{st:'in',tin:'',tout:'',note:''});           // 這時候 late 還不在組裡
  g.students.push(late.id);
  ctx.attSet('2026-09-08',key,a,{st:'in',tin:'',tout:'',note:''});
  let S=ctx.attStats('2026-01-01','2026-12-31','');
  ok(S[late.id]&&S[late.id].exp===1&&S[b].exp===2&&S[b].abs===2,'學期中才加入的學生，只算加入之後的節次（之前的不算缺席）');
  ok(Array.isArray(ctx.ATTref()['2026-09-01'][key]._roster)&&ctx.ATTref()['2026-09-01'][key]._info.g===g.name,'點名時記下當時的名單、組名和節次');
  // 舊紀錄沒有 _roster：只從學生第一次有紀錄那天開始算
  ctx.setATT({'2026-09-01':{[key]:{[a]:{st:'in'}}},'2026-09-08':{[key]:{[a]:{st:'in'},[b]:{st:'in'}}},'2026-09-15':{[key]:{[a]:{st:'in'}}}});
  S=ctx.attStats('2026-01-01','2026-12-31','');ok(S[b].exp===2&&S[b].abs===1,'舊紀錄：從第一次有紀錄的那天開始算應到');
  // 新學期把組別清掉，統計還在，用存下來的組名
  ctx.setATT({});ctx.attSet('2026-09-01',key,a,{st:'in',tin:'',tout:'',note:''});const nm=g.name;D.groups=[];
  S=ctx.attStats('2026-01-01','2026-12-31','');ok(S[a]&&S[a].exp===1&&S[a].rows[0].g===nm&&S[b].abs===1,'新學期清掉組別後，出缺席統計還在');
  const E=C.normalize({students:[{id:'x',cls:'701',name:'甲',note:'情緒障礙，需要冷靜角'}],settings:{}});
  ok(E.students[0].privNote==='情緒障礙，需要冷靜角'&&!E.students[0].note&&C.normalize(Object.assign(E,{students:[Object.assign(E.students[0],{note:'帶課本'})]})).students[0].note==='帶課本','舊的備註先搬到私密備註，之後寫的公開提醒不會再被搬走');
  const F=C.defaultData();C.importStudents(F,'班級\t座號\t姓名\t備註\n701\t03\t王小明\t服藥中');ok(F.students[0].privNote==='服藥中'&&!F.students[0].note,'名單上的備註匯入成私密備註');
}
// 19. 個管分配建議
{
  console.log('\n19. 個管分配建議');
  const D=C.defaultData(),res=D.teachers.filter(t=>t.role==='資源班');
  let R=C.suggestCaseMgr(D);ok(R.list.length===D.students.length&&!R.list.some(x=>x.change),'已經平均又有教到的分配，不會亂改');
  D.students.forEach(s=>{s.caseMgr='';});R=C.suggestCaseMgr(D);
  const n=R.summary.map(s=>s.n);ok(Math.max(...n)-Math.min(...n)<=1,'沒有個管的學生平均分給每位老師（'+n.join('、')+'）');
  ok(R.list.every(x=>x.to),'每位學生都有建議的個管');
  res[0].cmCap=2;R=C.suggestCaseMgr(D);ok(R.summary.find(s=>s.id===res[0].id).n<=2,'設了上限的老師不超過上限');
  res[1].noCM=true;R=C.suggestCaseMgr(D);ok(!R.list.some(x=>x.to===res[1].id),'勾「不當個管」的老師不會被分到');
  const S=D.students.find(s=>D.groups.some(g=>g.teacher===res[2].id&&g.students.includes(s.id)));
  delete res[0].cmCap;delete res[1].noCM;D.students.forEach(s=>{s.caseMgr='';});R=C.suggestCaseMgr(D);
  ok(!S||R.list.filter(x=>x.why.some(w=>/有教到/.test(w))).length>=R.list.length*0.7,'大多數學生分給有教到他的老師');
}
// 20. 老師偏好教室：指定教室最優先，再來是偏好，最後才是備用教室；兩位老師搶同一間時 evaluate 會扣分
{
  console.log('\n16. 老師偏好教室');
  const D=C.defaultData(),r2=D.teachers.find(t=>t.id==='r2');r2.prefRooms=['B'];
  let M=C.compile(D);ok(M.pref[M.tIdx.r2].join()==='1'&&!M.prefOn,'只有一位老師偏好時不需要在 evaluate 多算');
  const R=C.solve(M,C.toState(M,D),{seed:1}),room=C.assignRooms(M,R.slot);
  const mine=M.L.map((x,l)=>l).filter(l=>M.G[M.L[l].g].t===M.tIdx.r2);
  ok(mine.every(l=>room[l]===1),'王老師偏好資源教室二，她的課都排在那間');
  ok(M.L.every((x,l)=>M.G[x.g].t===M.tIdx.r2||room[l]!==1),'其他老師的常用教室會避開別人的第一志願');
  // 某一組指定了教室：指定的比偏好優先
  D.groups.find(g=>g.id==='g1').room='C';M=C.compile(D);const rm2=C.assignRooms(M,R.slot);
  ok(M.L.every((x,l)=>M.G[x.g].ref.id!=='g1'||rm2[l]===2)&&mine.filter(l=>M.G[M.L[l].g].ref.id!=='g1').every(l=>rm2[l]===1),'指定教室的那一組在指定教室，其他照偏好');
  D.groups.find(g=>g.id==='g1').room='';
  // 兩位老師都要 B：同一節都有課的格數 × 1.5 就是多出來的分數；分教室時一人拿 B、另一人拿別間
  D.teachers.find(t=>t.id==='r1').prefRooms=['B','C'];const M2=C.compile(D),M0=C.compile(C.defaultData());
  ok(M2.prefOn,'兩位老師第一志願相同時才開始計分');
  const has=(t,sl,s)=>M2.L.some((x,l)=>sl[l]===s&&M2.G[x.g].t===M2.tIdx[t]);
  const share=sl=>{let n=0;for(let s=0;s<M2.NS;s++)if(has('r1',sl,s)&&has('r2',sl,s))n++;return n;};
  const both=share(R.slot),d=C.evaluate(M2,R.slot)-C.evaluate(M0,R.slot);
  ok(Math.abs(d-both*1.5)<1e-6,'搶同一間的節數 '+both+'，分數多 '+d);
  const rm3=C.assignRooms(M2,R.slot);let dup=0;const seen={};rm3.forEach((r,l)=>{const k=R.slot[l]+'|'+r;if(r<0||seen[k])dup++;seen[k]=1;});
  ok(dup===0,'兩人搶同一間的那幾節也都分到教室、不重複');
  const inB=(t,s)=>M2.L.some((x,l)=>R.slot[l]===s&&M2.G[x.g].t===M2.tIdx[t]&&rm3[l]===1);
  ok(M2.L.every((x,l)=>{if(M2.G[x.g].t!==M2.tIdx.r1||!has('r2',R.slot,R.slot[l]))return true;const s=R.slot[l];return (inB('r1',s)||inB('r2',s))&&(rm3[l]===1||rm3[l]===2);}),'兩人同一節時一人拿到資源教室二；林組長沒拿到就拿第二志願');
  const R2=C.solve(M2,C.toState(M2,D),{seed:1});
  ok(R2.viol===0&&share(R2.slot)<=both,'加上偏好以後一樣沒有違規，兩人同一節從 '+both+' 格變成 '+share(R2.slot)+' 格');
  // 備用教室：偏好之外，平常的教室用完才用備用
  const E=C.defaultData();E.rooms=[{id:'A',name:'一',spare:true},{id:'B',name:'二'},{id:'C',name:'三'}];
  const ME=C.compile(E),RE=C.solve(ME,C.toState(ME,E),{seed:2}),rE=C.assignRooms(ME,RE.slot),cnt={};RE.slot.forEach(s=>{cnt[s]=(cnt[s]||0)+1;});
  ok(RE.slot.every((s,l)=>rE[l]!==0||cnt[s]>2),'只有同一節超過兩組時才用到備用教室');
}

// 21. 試排草稿：排法壓縮存放、比較兩份排法
{
  console.log('\n17. 試排草稿與版本');
  const D=C.defaultData(),M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:3});
  const S={slot:Int16Array.from(R.slot),pin:new Uint8Array(M.L.length),rfix:new Int16Array(M.L.length).fill(-1)};S.pin[0]=1;S.rfix[1]=2;S.slot[2]=-1;
  const a=C.fromState(M,S),p=C.packAssign(a),b=C.unpackAssign(JSON.parse(JSON.stringify(p)));
  const S2=C.toState(M,Object.assign({},D,{assign:b}));
  ok([...S2.slot].join()===[...S.slot].join()&&[...S2.pin].join()===[...S.pin].join()&&[...S2.rfix].join()===[...S.rfix].join(),'壓縮再還原，時段、固定、指定教室都一樣');
  ok(JSON.stringify(p).length*2<JSON.stringify(a).length,'壓縮後不到原本的一半（'+JSON.stringify(p).length+' / '+JSON.stringify(a).length+' 字）');
  const st=C.schedStats(M,S.slot,S.rfix);ok(st.placed===M.L.length-1&&st.un===1&&st.probs===0,'摘要：少排一節、沒有衝突');
  const T=Int16Array.from(S.slot),j=M.L.findIndex((x,l)=>l>3&&M.G[x.g].t===M.G[M.L[3].g].t);T[3]=T[j];
  ok(C.schedDiff(S.slot,T)===1&&C.schedStats(M,T,null).probs>0,'把一節放到同一位老師的另一節：換了一節、算出衝突');
  const F=C.defaultData();F.settings.lockMode='flex';const MF=C.compile(F),sf=C.schedStats(MF,C.solve(MF,C.toState(MF,F),{seed:1}).slot);
  ok(sf.locks&&sf.locks.pulled>0&&sf.locks.open>=0,'彈性鎖課時摘要包含鎖課（'+(sf.locks&&sf.locks.pulled-sf.locks.open)+'／'+(sf.locks&&sf.locks.pulled)+'）');
  const N=C.normalize({teachers:[{id:'t',name:'x',prefRooms:'B'}],sched:[1]});ok(!('prefRooms' in N.teachers[0])&&!('sched' in N),'壞掉的偏好與草稿欄位會被清掉');
}

// 小工具：固定亂數，和一份從空白開始的小題目
const rng=seed=>{let a=seed|0;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
const mini=()=>{const D=C.emptyData();D.rooms=[{id:'A',name:'一'},{id:'B',name:'二'},{id:'C',name:'三'}];D.settings.maxDay=9;return D;};
const slotOf=(M,keys)=>Int16Array.from(keys.map(k=>k==null?-1:M.key2s(k)));

// 22. 配鎖課：鎖課上限卡住時會繞路；和窮舉比，鎖到的節數一樣多
{
  console.log('\n18. 配鎖課的最佳性');
  // 審查時的例子：701 被抽離兩節，國文、數學各只能鎖 1 節，數學老師只有第 1 節有空 → 第 1 節鎖數學、第 2 節鎖國文
  const D=mini();D.settings.lockMode='flex';D.settings.lockCap={國文:1,數學:1};
  D.teachers=[{id:'r',name:'資',role:'資源班',off:[]},{id:'k',name:'國',role:'普通班',off:[]},{id:'m',name:'數',role:'普通班',off:['0-2']}];
  D.students=[{id:'s',cls:'701',seat:'1',name:'甲',needs:[]}];D.classSubj={'701|國文':'k','701|數學':'m'};
  D.groups=[{id:'g',name:'七國',subject:'國文',teacher:'r',per:2,students:['s'],mode:'抽離',room:'',on:true,grade:''}];
  const M=C.compile(C.normalize(D)),A=C.assignLocks(M,slotOf(M,['0-1','0-2']));
  ok(A.open.length===0&&A.locks.map(k=>M.s2key(k.s)+k.sj).sort().join()==='0-1數學,0-2國文','國文鎖滿時，把第 1 節改鎖數學，讓第 2 節鎖得到國文');
  // 隨機小題目和窮舉比
  const brute=(M,slot)=>{const NS=M.NS,busy=new Set(),P=new Map();
    M.L.forEach((x,l)=>{const s=slot[l],g=M.G[x.g];if(s<0)return;if(g.t>=0)busy.add(g.t*NS+s);if(!g.need)return;g.locks.forEach(k=>P.set(k.c*NS+s,{c:k.c,s}));});
    const os=[...P.values()].map(o=>({c:o.c,s:o.s,opt:(M.klay[o.c]&&M.klay[o.c][o.s])?[]:M.copt[o.c].filter(x=>!M.off[x.t][o.s]&&!busy.has(x.t*NS+o.s))}));
    let best=0;const uT=new Set(),cnt={};
    const rec=(i,n)=>{if(n+os.length-i<=best)return;if(i===os.length){best=n;return;}const o=os[i];
      for(const x of o.opt){const kt=x.t*NS+o.s,kc=o.c+'|'+x.sj;if(uT.has(kt)||(cnt[kc]||0)>=M.capOf(x.sj))continue;uT.add(kt);cnt[kc]=(cnt[kc]||0)+1;rec(i+1,n+1);uT.delete(kt);cnt[kc]--;}
      rec(i+1,n);};
    rec(0,0);return best;};
  let worse=0,cases=0,tot=0,fastWorse=0;const SJ=['國文','數學','英文'];
  for(let seed=1;seed<=300;seed++){const r=rng(seed),ri=n=>Math.floor(r()*n),E=mini();E.settings.lockMode='flex';
    E.settings.lockCap={國文:1+ri(2),數學:1+ri(2),英文:1};
    const regs=['a','b','c','d'];E.teachers=[{id:'r0',name:'資0',role:'資源班',off:[]},{id:'r1',name:'資1',role:'資源班',off:[]}].concat(regs.map(id=>({id,name:'任'+id,role:'普通班',off:[0,1,2].map(()=>ri(2)+'-'+(1+ri(4)))})));
    const cls=['701','702','703'];E.students=cls.map(c=>({id:'s'+c,cls:c,seat:'1',name:'生'+c,needs:[]}));
    cls.forEach(c=>SJ.forEach(sj=>{E.classSubj[c+'|'+sj]=regs[ri(4)];}));
    E.groups=[0,1,2].map(i=>({id:'g'+i,name:'組'+i,subject:SJ[ri(3)],teacher:'r'+(i%2),per:1+ri(2),students:cls.filter(()=>r()<0.6).map(c=>'s'+c),mode:'抽離',room:'',on:true,grade:''}));
    const N=C.compile(C.normalize(E)),slot=Int16Array.from(N.L.map(()=>ri(2)*N.NP+1+ri(4)));
    const A=C.assignLocks(N,slot),b=brute(N,slot);if(C.assignLocks(N,slot,{exact:false}).locks.length<b)fastWorse++;if(A.pulled>1)cases++;tot+=b;if(A.locks.length<b){worse++;if(process.env.DBG&&worse===1){console.log('seed',seed,'brute',b,'got',A.locks.length,'cap',JSON.stringify(E.settings.lockCap));
      console.log(' locks',A.locks.map(k=>k.cls+'@'+N.s2key(k.s)+k.sj+'/'+N.T[k.t].id+(k.same?'':'(別科)')).join(' '));console.log(' open',A.open.map(o=>o.cls+'@'+N.s2key(o.s)).join(' '));
      console.log(' cs',JSON.stringify(E.classSubj));console.log(' off',E.teachers.map(t=>t.id+':'+t.off.join(',')).join(' '));console.log(' busy',N.L.map((x,l)=>N.T[N.G[x.g].t].id+'@'+N.s2key(slot[l])+N.G[x.g].subject+N.G[x.g].cls.join('+')).join(' '));}}}
  ok(worse===0,'隨機 300 題（'+cases+' 題有兩節以上要鎖）和窮舉一樣多：共 '+tot+' 節'+(worse?'，有 '+worse+' 題比較少':'')+'（只用快速搜尋時有 '+fastWorse+' 題少一點）');
}

// 27. 衝突的個數和說明的條數一致；同一組兩節同一格只算一個
{
  console.log('\n19. 衝突計數');
  const D=C.defaultData(),M=C.compile(D),r=rng(5);let bad=0;
  for(let i=0;i<300;i++){const slot=Int16Array.from(M.L.map(()=>r()<0.1?-1:Math.floor(r()*M.NS)));
    // 故意讓同一組的幾節擠在同一格
    if(i%3===0){const l=Math.floor(r()*(M.L.length-1));if(M.L[l+1].g===M.L[l].g)slot[l+1]=slot[l];}
    const out=[];C.evaluate(M,slot,out);if(M.viol!==out.length)bad++;}
  ok(bad===0,'隨機 300 種排法，衝突個數都等於說明的條數');
  const E=mini();E.settings.roomCheck=false;E.groups=[{id:'g',name:'空組',subject:'國文',teacher:'',per:3,students:[],mode:'抽離',room:'',on:true,grade:''}];
  const ME=C.compile(C.normalize(E)),out=[];C.evaluate(ME,slotOf(ME,['0-1','0-1','0-1']),out);
  ok(ME.viol===2&&out.every(o=>o.k==='dup'&&/有兩節排在同一格/.test(o.m)),'沒有老師也沒有學生的組，三節擠同一格：算 2 個（不靠教室檢查）');
  const g1=D.groups.find(g=>g.id==='g1'),M1=C.compile(D),ls=M1.L.map((x,l)=>l).filter(l=>M1.G[M1.L[l].g].ref===g1),slot=Int16Array.from(M1.L.map(()=>-1));
  slot[ls[0]]=slot[ls[1]]=M1.key2s('0-2');const o1=[];C.evaluate(M1,slot,o1);
  ok(o1.filter(o=>o.k!=='un').length===1&&M1.viol===o1.length,'有 '+g1.students.length+' 位學生的組兩節同一格，只算 1 個衝突');
}

// 24. 手排鎖課遇到同名的老師
{
  console.log('\n20. 同名的老師');
  const D=mini();D.settings.lockMode='flex';
  D.teachers=[{id:'a',name:'王老師',role:'普通班',off:[]},{id:'b',name:'王老師',role:'普通班',off:[]},{id:'r',name:'資',role:'資源班',off:[]}];
  D.students=[{id:'s',cls:'701',seat:'1',name:'甲',needs:[]}];D.classSubj={'701|數學':'b','702|國文':'a'};
  D.lockFix=[{cls:'701',k:'0-1',t:'王老師',sj:'數學'},{cls:'701',k:'0-2',t:'王老師',sj:''},{cls:'703',k:'0-3',t:'王老師',sj:''}];
  D.students.push({id:'s2',cls:'703',seat:'1',name:'乙',needs:[]});
  const M=C.compile(C.normalize(D)),f=k=>M.lfix.get(M.cIdx[k.split('|')[0]]*M.NS+M.key2s(k.split('|')[1]));
  ok(f('701|0-1')&&M.T[f('701|0-1').t].id==='b','寫了科目：用這一班這一科的任課老師（第二位王老師）');
  ok(f('701|0-2')&&M.T[f('701|0-2').t].id==='b','沒寫科目：用有教這一班的那一位');
  ok(!f('703|0-3')&&M.lfixAmb.length===1,'兩位都沒教這一班：不猜，列出來請老師確認');
  D.groups=[{id:'g',name:'七數',subject:'數學',teacher:'r',per:1,students:['s'],mode:'抽離',room:'',on:true,grade:''}];
  const A=C.assignLocks(C.compile(C.normalize(D)),Int16Array.from([M.key2s('0-1')]));ok(A.warn.some(w=>/同名/.test(w)),'配鎖課的提醒裡會寫出同名的問題');
}

// 25. 四位數的班級
{
  console.log('\n21. 四位數班級');
  ok(C.gradeOfCls('1012')===10&&C.gradeOfCls('701')===7&&C.gradeOfCls(' 905 ')===9,'三位數看第一位，四位數看前兩位');
  ok(C.promoteCls('1012')==='1112'&&C.promoteCls('701')==='801','升年級：1012→1112、701→801');
  const D=mini();D.students=['701','901','1012','1201'].map((c,i)=>({id:'s'+i,cls:c,seat:'1',name:'生'+i,needs:[]}));
  const r=C.newTerm(D,{promote:true});ok(r.grad===2&&D.students.map(s=>s.cls).join()==='801,1112','九年級、高三畢業，其他升一個年級');
  ok(C.ttClassNo('1012')==='1012'&&C.ttClassNo('2708')==='708','課表編號：高中四位數照收，前面多讀到的雜字照樣去掉');
}

// 26. 午休：與下一節不相連
{
  console.log('\n22. 午休不算相連');
  const D=mini();D.settings.tRun=1;D.teachers=[{id:'r',name:'資',role:'資源班',off:[]}];
  D.groups=[{id:'g',name:'組',subject:'國文',teacher:'r',per:2,students:[],mode:'外加',room:'',on:true,grade:''}];
  D.periods.forEach(p=>{p.extra=true;});
  const cost=brk=>{D.periods.find(p=>p.id==='4').breakAfter=brk;const M=C.compile(C.normalize(D));return C.evaluate(M,slotOf(M,['0-4','0-5']));};
  ok(Math.abs(cost(false)-cost(true)-2)<1e-9,'第 4、5 節中間隔著午休，老師連續上課不再算超過');
  // 連堂：國文鎖到只剩 1 節時要找相鄰的一節多鎖；第 3 節老師不排課，第 5 節隔著午休也不能用
  const E=mini();E.settings.lockMode='flex';E.settings.lockCap={國文:2};E.settings.lockDouble='國文';
  E.teachers=[{id:'r',name:'資',role:'資源班',off:[]},{id:'k',name:'國',role:'普通班',off:['0-3']}];
  E.students=[{id:'s',cls:'701',seat:'1',name:'甲',needs:[]}];E.classSubj={'701|國文':'k'};
  E.groups=[{id:'g',name:'七國',subject:'國文',teacher:'r',per:1,students:['s'],mode:'抽離',room:'',on:true,grade:''}];
  const run=brk=>{E.periods.forEach(p=>{if(p.id==='4')p.breakAfter=brk;});const M=C.compile(C.normalize(E));return C.assignLocks(M,slotOf(M,['0-4'])).locks.filter(k=>k.extra).map(k=>M.s2key(k.s)).join();};
  ok(run(false)==='0-5'&&run(true)==='','沒有午休時多鎖第 5 節湊連堂；勾了「與下一節不相連」就不會這樣湊');
}

// 27. 彈性鎖課的收尾：課表品質最多只比原本差一個固定的量
{
  console.log('\n23. 收尾不會越走越差');
  const D=C.defaultData();D.settings.lockMode='flex';const M=C.compile(D),R=C.solve(M,C.toState(M,D),{seed:4});
  const c0=C.evaluate(M,R.slot),v0=M.viol,R2=C.refineLocks(M,R,{passes:4}),c1=C.evaluate(M,R2.slot);
  ok(M.viol<=v0&&c1<=c0+3+1e-9,'分數從 '+c0.toFixed(1)+' 到 '+c1.toFixed(1)+'（最多 +3）');
}

// 24. 大一點的題目（180 節）：排得出來、時間合理
const synth=(seed,K,OFF)=>{K=K||3;OFF=OFF||3;const r=rng(seed),ri=n=>Math.floor(r()*n);
  const D=C.defaultData();D.students=[];D.teachers=[];D.groups=[];D.classSubj={};D.offBy={};D.sets=[];D.blocked=['4-7'];
  D.rooms=[1,2,3,4,5,6,7].map(i=>({id:'R'+i,name:'教室'+i}));
  const reg=D.periods.filter(p=>!p.extra).map(p=>p.id),key=()=>ri(5)+'-'+reg[ri(reg.length)],SJ=[['國文',5],['數學',4],['英文',3]];
  for(let i=0;i<10;i++)D.teachers.push({id:'r'+i,name:'資'+i,role:'資源班',off:[key(),key()]});
  [7,8,9].forEach(gr=>{const cls=[...Array(10)].map((x,i)=>gr+'0'+i);
    SJ.forEach(([sj],j)=>{for(let k=0;k<4;k++){const id='k'+gr+j+k;D.teachers.push({id,name:'任'+id,role:'普通班',off:[...Array(OFF)].map(key)});cls.forEach((c,ci)=>{if(ci%4===k)D.classSubj[c+'|'+sj]=id;});}});
    const stu=[];cls.forEach(c=>{for(let s=0;s<5;s++){const o={id:'s'+c+s,cls:c,seat:String(s+1),name:'生'+c+s,caseMgr:'',note:'',needs:[]};D.students.push(o);stu.push(o);}});
    SJ.forEach(([sj,per],j)=>{for(let gq=0;gq<5;gq++){const picks=[];const rs=[0,1,2,3].sort(()=>r()-.5).slice(0,K);
      for(const q of rs){const c=cls.filter((x,ci)=>ci%4===q);const cc=c[ri(c.length)];
        stu.filter(s=>s.cls===cc&&!D.groups.some(g=>g.subject===sj&&g.students.includes(s.id))&&!picks.includes(s.id)).slice(0,1+ri(3)).forEach(s=>picks.push(s.id));}
      D.groups.push({id:'g'+gr+j+gq,name:gr+'-'+sj+gq,subject:sj,teacher:'r'+((gr*7+j*5+gq)%10),per,students:picks,mode:'抽離',room:'',on:true,grade:String(gr)});}});});
  return C.normalize(D);};
{
  console.log('\n24. 180 節的題目');
  const D=synth(11),M=C.compile(D),t=Date.now(),R=C.solve(M,C.toState(M,D),{seed:1}),ms=Date.now()-t;
  console.log('  '+M.L.length+' 節，耗時 '+ms+' ms，違規 '+R.viol+'，分數 '+R.cost.toFixed(1));
  ok(R.viol===0,'排得出沒有衝突的課表');
  ok(ms<20000,'20 秒內排完');
  const R2=C.solve(M,C.toState(M,D),{seed:1});ok([...R2.slot].join()===[...R.slot].join(),'同一個亂數種子排出一樣的結果');
}

console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');
process.exit(fail?1:0);

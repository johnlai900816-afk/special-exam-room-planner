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

console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');
process.exit(fail?1:0);

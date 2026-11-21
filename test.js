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

console.log(fail?('\n有 '+fail+' 項失敗'):'\n全部通過');
process.exit(fail?1:0);

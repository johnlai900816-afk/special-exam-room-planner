/* 資源班管理系統｜AI 功能的題目、回覆格式與檢查（不碰畫面、不連網，瀏覽器與 node 共用）
   原則：
   - 本機的排課程式是裁判。AI 給的只是「候選」：一律用 evaluate／assignLocks 檢查，比現在好才給老師選，否則說明為什麼不採用。
   - 送出前去識別化：學生姓名一律換成代號；老師姓名預設也換成代號，老師自己勾選才送。
   - AI 的每個提議都要有來源（原文那一句、或系統算出的選項），老師逐項確認才套用。 */
(function(root){
'use strict';
const C=(typeof CORE!=='undefined'?CORE:null)||(typeof require==='function'?require('./core.js'):null);
const G=(typeof GEMINI!=='undefined'?GEMINI:null)||root.GEMINI||(typeof require==='function'?require('./gemini.js'):null);
const S=G.S;
const clone=o=>JSON.parse(JSON.stringify(o));
const norm=s=>String(s==null?'':s).replace(/\s+/g,'').toLowerCase();

/* ───── 去識別化 ───── */
const baseName=n=>String(n||'').replace(/（[^）]*）|\([^)]*\)/g,'').trim();
// 把文字裡的學生姓名換成 S 代號；names 沒有打開時，老師姓名（和「王老師」這種叫法）也換成 T 代號
function scrub(D,text,opt){
  const names=!!(opt&&opt.names),pairs=[];
  D.students.forEach((s,i)=>{const n=String(s.name||'').trim();if(n.length>=2)pairs.push([n,'S'+(i+1)]);});
  if(!names){const sur={};
    D.teachers.forEach((t,i)=>{const code='T'+(i+1),full=String(t.name||'').trim(),b=baseName(full);
      if(full.length>=2)pairs.push([full,code]);if(b.length>=2&&b!==full)pairs.push([b,code]);
      const f=b.replace(/老師$/,'')[0];if(f)(sur[f]=sur[f]||new Set()).add(code);});
    for(const f in sur)if(sur[f].size===1)pairs.push([f+'老師',[...sur[f]][0]]);}   // 只有一位姓王時，「王老師」才換得掉
  pairs.sort((a,b)=>b[0].length-a[0].length);
  let out=String(text==null?'':text),n=0;
  pairs.forEach(([k,v])=>{if(!out.includes(k))return;const parts=out.split(k);n+=parts.length-1;out=parts.join(v);});
  return {text:out,n};
}
// 回覆裡的代號換回名字，只在本機畫面上顯示
function unscrub(D,text){
  return String(text==null?'':text).replace(/(^|[^A-Za-z0-9])([STC])(\d+)(?![0-9])/g,(m,pre,k,d)=>{const i=+d-1;
    const x=k==='S'?D.students[i]:k==='T'?D.teachers[i]:D.groups[i];if(!x)return m;
    return pre+(k==='S'?x.cls+' '+x.name:x.name);});
}
const tCode=(D,id)=>{const i=D.teachers.findIndex(t=>t.id===id);return i<0?'':'T'+(i+1);};
const gCode=(D,id)=>{const i=D.groups.findIndex(g=>g.id===id);return i<0?'':'C'+(i+1);};
// 每一個要送出的請求最後再整段掃一次，確保沒有漏掉的姓名
function finalize(D,req,opt){
  const b=scrub(D,req.prompt,opt);   // system 是程式自己寫的說明，不含資料
  return Object.assign({},req,{prompt:b.text,scrubbed:b.n});
}

/* ───── (a) AI 排課：沿用 aiProblem／aiPrompt（代號＋版本 v＋每門課可排時段），改用結構化輸出 ───── */
const SCHED_SYS='你是嚴謹的國中資源班排課助理。硬性規則一條都不能違反：寧可少排一節，也不要排出衝堂。只能使用題目裡出現的代號與時段。';
const SCHED_FMT='回覆格式：v 照抄題目的 v；slots 是陣列，每門課一筆 {"course":"C1","keys":["0-1","2-3"]}，要包含每一門課，時段只能從那門課的 allowedSlots 挑；members 只列出要新增進課的學生 {"course":"C1","students":["S1"]}；note 用一兩句中文說明哪裡排不開，沒有就留空。';
const SCHED_SCHEMA=S.obj({
  v:S.str('題目的版本 v，照抄'),
  slots:S.arr(S.obj({course:S.str('課的代號，例如 C1'),keys:S.arr(S.str('時段代號，例如 0-1'))},['course','keys'])),
  members:S.arr(S.obj({course:S.str(),students:S.arr(S.str('學生代號，例如 S1'))},['course','students'])),
  note:S.str('排不開的地方，用中文簡短說明')
},['v','slots']);
// 題目文字照 aiPrompt；只把最後的「回覆格式」換成 schema 版。萬一 aiPrompt 的寫法改了，就退回原本整段＋只要求 JSON
function schedRequest(D,opt){
  const P=C.aiPrompt(D),v=C.aiProblem(D).v,i=P.indexOf('只回覆一段 JSON'),j=P.lastIndexOf('題目：');
  const req=i<0||j<i?{system:SCHED_SYS,prompt:P,json:true}:{system:SCHED_SYS,prompt:P.slice(0,i)+SCHED_FMT+'\n\n'+P.slice(j),schema:SCHED_SCHEMA};
  req.v=v;req.kind='sched';return finalize(D,req,opt);
}
// 結構化回覆 → aiApply 看得懂的 {v, slots:{C1:[...]}, members:{C1:[...]}}；也接受原本的格式或一段文字
function schedToApply(j){
  if(typeof j==='string'){const a=j.indexOf('{'),b=j.lastIndexOf('}');if(a<0||b<=a)throw new Error('找不到 JSON');j=JSON.parse(j.slice(a,b+1));}
  j=j||{};const out={v:j.v,slots:{},members:{}};
  if(Array.isArray(j.slots))j.slots.forEach(x=>{if(x&&x.course)out.slots[x.course]=(x.keys||[]).map(String);});else if(j.slots)out.slots=j.slots;
  if(Array.isArray(j.members))j.members.forEach(x=>{if(x&&x.course)out.members[x.course]=(x.students||[]).map(String);});else if(j.members)out.members=j.members;
  return out;
}
// 在 D 的複本上套用並檢查衝堂；D 本身不動。v 對不上時 aiApply 會丟出 code='stale'
function schedCheck(D,j,v){
  const X=clone(D),A=schedToApply(j),r=C.aiApply(X,JSON.stringify(A),v),M=C.compile(X),St=C.toState(M,X),out=[];
  C.evaluate(M,St.slot,out);
  return {X,M,S:St,r,out,viol:M.viol,un:[...St.slot].filter(s=>s<0).length,note:String((j&&j.note)||'')};
}
// AI 排好、不衝堂的先暫時固定，只把有衝突或還沒排的那幾節交給本機的排課程式修
function schedRepair(M,St,out,opt){
  const bad=new Set(out.filter(o=>o.k!=='un'&&o.l!=null).map(o=>o.l)),tmp=new Uint8Array(M.L.length);
  for(let l=0;l<M.L.length;l++)tmp[l]=(St.pin[l]||(St.slot[l]>=0&&!bad.has(l)))?1:0;
  const R=C.solve(M,{slot:St.slot,pin:tmp},Object.assign({seed:1},opt||{}));
  let moved=0;for(let l=0;l<M.L.length;l++)if(R.slot[l]!==St.slot[l])moved++;
  return {slot:R.slot,pin:St.pin,moved};
}
// 裁判：候選排法和現在的比。違規不能變多；待安排的學生變少、或分數變好，才算比較好；彈性鎖課時鎖不到的班級節次不能變多
function score(M,slot){const cost=C.evaluate(M,slot),viol=M.viol,D=M.D;
  return {cost,viol,pend:C.needList(D).length,open:M.flex?C.assignLocks(M,slot).open.length:0,placed:[...slot].filter(s=>s>=0).length,total:M.L.length};}
function schedJudge(Mc,slotC,Mn,slotN){
  const a=score(Mc,slotC),b=score(Mn,slotN),why=[];
  if(b.viol>a.viol)why.push('衝突或沒排到的有 '+b.viol+' 個，比現在的 '+a.viol+' 個多');
  if(b.open>a.open)why.push('原班鎖不到課的有 '+b.open+' 節，比現在的 '+a.open+' 節多');
  const better=b.pend<a.pend||b.viol<a.viol||b.cost<a.cost-1e-6;
  if(!why.length&&!better)why.push('沒有比現在的排法好（分數 '+b.cost.toFixed(1)+'，現在 '+a.cost.toFixed(1)+'）');
  return {ok:!why.length,why,cur:a,cand:b};
}
// 給紀錄用的差異：移動幾節、新加幾位學生
function schedDiff(Dc,Mc,slotC,X,slotN){
  let moved=0;for(let l=0;l<Mc.L.length;l++)if(slotC[l]!==slotN[l])moved++;
  let add=0;X.groups.forEach(g=>{const d=Dc.groups.find(x=>x.id===g.id);if(d)add+=g.students.filter(id=>!d.students.includes(id)).length;});
  return '移動 '+moved+' 節'+(add?'，新編入 '+add+' 人次':'');
}

/* ───── (b) 用文字加限制、調整：每一項都要附原文那一句，老師逐項確認 ───── */
const ADJ_TYPES=['teacherOff','teacherFree','classOff','move','pin','unpin','room'];
const ADJ_SYS=`你是國中資源班排課系統裡的助理。老師會用文字（一句話、或一段會議紀錄）要求修改，你把它拆成下列動作。
人名、課名都已經換成代號：老師是 T1、T2…，課是 C1、C2…，學生是 S1…。只能使用 JSON 裡出現的代號、班級、教室和時段代號 k：
- teacherOff：老師 teacher 這些時段 keys 不能排課（例：「T2週三下午不能排」→ 週三下午的每一節）
- teacherFree：老師 teacher 這些時段 keys 改回可以排
- classOff：班級 cls 這些時段 keys 不排資源班的課
- move：把課 course 的一節從 from（目前所在時段，可省略）移到 to；to 依照優先順序列出所有可以接受的時段（例：「移到早上」就列出上午的每一節）。要移好幾節就給好幾個 move
- pin／unpin：固定或解除固定課 course 在 from 的那一節；from 留空表示這門課每一節
- room：課 course 固定用 room 這間教室
「上午」是 12:00 以前開始的節次，「下午」是 12:00 以後；extra 為 true 的是早自習等外加時段，除非原文明講，不要用。
每個動作的 quote 要逐字抄出原文裡對應的那一句（或那一段），不能改寫；原文沒寫的事不要自己加。
做不到或看不懂的部分不要硬做，寫在 reply 裡說明。why 用一句中文說明這個動作。`;
const ADJ_SCHEMA=S.obj({
  actions:S.arr(S.obj({
    type:S.str('動作種類',{enum:ADJ_TYPES}),
    quote:S.str('原文裡對應的那一句，逐字抄'),
    teacher:S.str('老師代號，例如 T2'),cls:S.str('班級'),course:S.str('課的代號，例如 C3'),room:S.str('教室名稱'),
    from:S.str('目前所在的時段代號 k'),to:S.arr(S.str('時段代號 k')),keys:S.arr(S.str('時段代號 k')),why:S.str('一句說明')
  },['type','quote'])),
  reply:S.str('給老師看的一兩句說明')
},['actions','reply']);
// 給 AI 的現況：代號、課名、時段；不放學生
function adjContext(D,M,St,opt){
  const P=D.periods,names=!!(opt&&opt.names);
  return {
    slots:C.DAYS.flatMap((d,di)=>P.map(p=>({k:di+'-'+p.id,name:'週'+d+p.name,start:p.start||'',extra:!!p.extra}))),
    blocked:D.blocked,
    teachers:D.teachers.map((t,i)=>Object.assign({id:'T'+(i+1)},names?{name:t.name}:{},{role:t.role,off:t.off})),
    classes:M.classes,
    rooms:D.rooms.map(r=>r.name),
    courses:M.G.filter(g=>g.per).map(g=>({id:'C'+(g.gi+1),name:g.name,subject:g.subject,teacher:g.t>=0?'T'+(g.t+1):'',grade:g.ref.grade||'',
      room:g.room>=0?D.rooms[g.room].name:'',lessons:M.L.map((x,l)=>x.g===g.gi?{at:St.slot[l]>=0?M.s2key(St.slot[l]):'',fixed:!!St.pin[l]}:null).filter(Boolean)}))
  };
}
function adjRequest(D,M,St,text,opt){
  const said=scrub(D,String(text||'').trim(),opt).text;
  const req=finalize(D,{kind:'adj',system:ADJ_SYS,schema:ADJ_SCHEMA,prompt:'老師寫的原文：\n'+said+'\n\n目前的資料：\n'+JSON.stringify(adjContext(D,M,St,opt))},opt);
  req.said=said;return req;
}
function findBy(list,name,get){
  const n=norm(name);if(!n)return null;
  let a=list.filter(x=>norm(get(x))===n);if(a.length===1)return a[0];
  const n2=n.replace(/老師$/,'');a=list.filter(x=>norm(baseName(get(x))).replace(/老師$/,'')===n2);if(a.length===1)return a[0];
  a=list.filter(x=>{const v=norm(get(x));return v&&(v.includes(n)||n.includes(v));});return a.length===1?a[0]:null;
}
const byCode=(list,code,k)=>{const m=String(code||'').trim().match(new RegExp('^'+k+'(\\d+)$'));return m?list[+m[1]-1]||null:null;};
// 時段文字：「週三 第5節、第6節」
function keysText(M,ss){
  const by={};ss.slice().sort((a,b)=>a-b).forEach(s=>{const d=Math.floor(s/M.NP);(by[d]=by[d]||[]).push(M.P[s%M.NP].name);});
  return Object.keys(by).map(d=>'週'+C.DAYS[d]+' '+by[d].join('、')).join('；');
}
// 逐一檢查 AI 的動作：找得到人、課、時段才算數；原文找不到那一句、會造成衝突的照樣列出，但附上警告
function adjCheck(D,M,St,actions,said){
  const W=Int16Array.from(St.slot),used=new Set(),items=[],src=norm(said||'');
  const keysOf=a=>[...new Set((a||[]).map(k=>M.key2s(String(k))).filter(s=>s>=0))];
  const lessonsOf=g=>M.L.map((x,l)=>x.g===g.gi?l:-1).filter(l=>l>=0);
  const findT=x=>byCode(D.teachers,x,'T')||findBy(D.teachers,x,t=>t.name);
  const findG=x=>{const g=byCode(D.groups,x,'C');const cg=g?M.G[D.groups.indexOf(g)]:null;return cg&&cg.per?cg:findBy(M.G.filter(o=>o.per),x,o=>o.name);};
  (actions||[]).forEach(a=>{
    const it={ok:false,text:'',warn:'',why:unscrub(D,a&&a.why||''),quote:unscrub(D,a&&a.quote||''),act:null},type=a&&a.type;items.push(it);
    const w=m=>{it.warn=it.warn?it.warn+'；'+m:m;};
    if(src&&!(a&&a.quote&&src.includes(norm(a.quote))))w('原文裡找不到這一句，請確認是不是你要的');
    if(!ADJ_TYPES.includes(type)){it.text='看不懂的動作（'+String(type)+'）';return;}
    if(type==='teacherOff'||type==='teacherFree'){
      const t=findT(a.teacher),ss=keysOf(a.keys);
      if(!t){it.text='找不到老師「'+unscrub(D,a.teacher||'')+'」';return;}
      if(!ss.length){it.text=t.name+'：沒有說是哪些時段';return;}
      const ti=M.tIdx[t.id],on=new Set((t.off||[]).map(k=>M.key2s(k)));
      const todo=ss.filter(s=>type==='teacherOff'?!on.has(s):on.has(s));
      it.text=t.name+'：'+keysText(M,ss)+(type==='teacherOff'?' 設為不排課':' 改回可以排課');
      if(!todo.length){it.text+='（本來就是這樣）';return;}
      if(type==='teacherOff'){const hit=M.L.map((x,l)=>l).filter(l=>{const g=M.G[M.L[l].g];return W[l]>=0&&todo.includes(W[l])&&(g.t===ti||g.locks.some(k=>k.t===ti));});
        if(hit.length)w('已經排在這些時段的 '+hit.length+' 節（'+[...new Set(hit.map(l=>M.G[M.L[l].g].name))].join('、')+'）會變成衝突，之後要移開');}
      it.ok=true;it.act={type,tid:t.id,keys:todo.map(M.s2key)};return;}
    if(type==='classOff'){
      const cls=String(a.cls||'').trim(),ss=keysOf(a.keys);
      if(!M.classes.includes(cls)){it.text='找不到班級「'+cls+'」';return;}
      if(!ss.length){it.text=cls+'：沒有說是哪些時段';return;}
      const cur=new Set(((D.offBy||{})['c:'+cls]||[]).map(k=>M.key2s(k))),todo=ss.filter(s=>!cur.has(s));
      it.text=cls+' 班：'+keysText(M,ss)+' 不排資源班的課';if(!todo.length){it.text+='（本來就是這樣）';return;}
      it.ok=true;it.act={type,cls,keys:todo.map(M.s2key)};return;}
    const g=findG(a.course);
    if(!g){it.text='找不到課「'+unscrub(D,a.course||'')+'」';return;}
    const Ls=lessonsOf(g);
    if(type==='room'){const r=findBy(D.rooms,a.room,x=>x.name)||D.rooms.find(x=>x.id===a.room);
      if(!r){it.text=g.name+'：找不到教室「'+String(a.room||'')+'」';return;}
      it.text=g.name+'：固定用'+r.name;if(g.ref.room===r.id){it.text+='（本來就是）';return;}
      const other=D.groups.filter(x=>x!==g.ref&&x.room===r.id).map(x=>x.name);if(other.length)w(r.name+'也是 '+other.join('、')+' 指定的教室，同一節排到時會衝突');
      it.ok=true;it.act={type,gid:g.ref.id,rid:r.id};return;}
    const fs=a.from?M.key2s(String(a.from)):-1;
    if(type==='pin'||type==='unpin'){
      const ls=fs>=0?Ls.filter(l=>W[l]===fs):Ls.filter(l=>W[l]>=0);
      if(!ls.length){it.text=g.name+'：'+(fs>=0?M.sn(fs)+'沒有這門課':'還沒有排好的節');return;}
      it.text=g.name+'：'+keysText(M,ls.map(l=>W[l]))+(type==='pin'?' 固定':' 解除固定');
      it.ok=true;it.act={type,gid:g.ref.id,ks:ls.map(l=>M.L[l].k)};return;}
    // move：先找要移的那一節，再從 to 裡挑第一個不衝突的時段
    const free=Ls.filter(x=>!used.has(x));let l=-1;
    if(fs>=0)l=free.find(x=>W[x]===fs);
    if(l==null||l<0)l=free.find(x=>W[x]<0);
    if(l==null||l<0)l=free.find(x=>!St.pin[x]);
    if(l==null||l<0)l=free[0];
    if(l==null||l<0){it.text=g.name+'：沒有可以移的節';return;}
    const ts=keysOf(a.to).filter(s=>s!==W[l]);
    if(!ts.length){it.text=g.name+'：沒有說要移到哪裡，或已經在那裡了';return;}
    let s=ts.find(x=>g.allowed[x]&&C.canPlace(M,W,l,x));
    if(s==null){s=ts[0];const r=C.why(M,g.gi,s);w(M.sn(s)+(r.length?'：'+r.join('、'):' 會和別的課衝突')+(ts.length>1?'（列出的 '+ts.length+' 個時段都會衝突）':''));}
    it.text=g.name+'：'+(W[l]>=0?M.sn(W[l]):'還沒排的一節')+' → '+M.sn(s)+'，並固定';
    used.add(l);W[l]=s;it.ok=true;it.act={type:'move',gid:g.ref.id,k:M.L[l].k,key:M.s2key(s)};
  });
  return items;
}
// 先改資料（不排課時段、教室）；回傳要在重新整理後套到課表上的動作
function adjApply(D,acts){
  const ops=[];
  acts.forEach(a=>{
    if(a.type==='teacherOff'||a.type==='teacherFree'){const t=D.teachers.find(x=>x.id===a.tid);if(!t)return;
      if(a.type==='teacherOff')a.keys.forEach(k=>{if(!t.off.includes(k))t.off.push(k);});else t.off=t.off.filter(k=>!a.keys.includes(k));}
    else if(a.type==='classOff'){const k='c:'+a.cls,arr=D.offBy[k]=D.offBy[k]||[];a.keys.forEach(x=>{if(!arr.includes(x))arr.push(x);});}
    else if(a.type==='room'){const g=D.groups.find(x=>x.id===a.gid);if(g)g.room=a.rid;}
    else ops.push(a);
  });
  return ops;
}
function adjLessons(M,St,ops){
  const at={};M.L.forEach((x,l)=>{at[M.G[x.g].ref.id+'|'+x.k]=l;});let n=0;
  ops.forEach(a=>{
    if(a.type==='move'){const l=at[a.gid+'|'+a.k],s=M.key2s(a.key);if(l==null||s<0)return;St.slot[l]=s;St.pin[l]=1;n++;}
    else (a.ks||[]).forEach(k=>{const l=at[a.gid+'|'+k];if(l==null)return;St.pin[l]=a.type==='pin'?1:0;n++;});
  });
  return n;
}

/* ───── (d) 說明問題：系統先算出「哪一位老師哪一節可以排就解得開」，AI 只負責用白話說明、排出先問誰 ───── */
const KIND={teacher:'同一位資源班老師同一節有兩組',student:'同一位學生同一節在兩組',class:'原班同一節被要求上兩科',reg:'原班任課老師同一節被兩邊用到',
  room:'教室不夠或被重複指定',off:'排在不排課時段',un:'還有節數排不進去'};
// 只擋在「某一位老師這一節不能排」的格子：問那位老師能不能通融，是最常見的協商
function options(M,gis,max){
  const out=[];
  gis.forEach(gi=>{const g=M.G[gi];let n=0;
    for(let s=0;s<M.NS&&n<4&&out.length<(max||40);s++){if(g.allowed[s])continue;const p=M.P[s%M.NP];
      if((g.pull&&p.extra)||(!g.pull&&!p.extra)||M.blocked[s]||g.soff.some(o=>o.arr[s]))continue;
      if(!M.flex&&g.locks.some(k=>M.klay[k.c]&&M.klay[k.c][s]))continue;
      const ts=new Set();if(g.t>=0&&M.off[g.t][s])ts.add(g.t);if(!M.flex)g.locks.forEach(k=>{if(k.t>=0&&M.off[k.t][s])ts.add(k.t);});
      if(ts.size!==1)continue;const t=[...ts][0];
      out.push({id:'O'+(out.length+1),course:'C'+(gi+1),slot:M.s2key(s),slotName:M.sn(s),teacher:'T'+(t+1),gi,s,t});n++;}});
  return out;
}
const EXPLAIN_SCHEMA=S.obj({
  summary:S.str('兩三句白話總結：為什麼排不開'),
  items:S.arr(S.obj({course:S.str('課的代號'),explain:S.str('白話說明原因'),suggest:S.str('協商建議，例如「若 T3 週三第2節可以排，C2 就排得進去」'),options:S.arr(S.str('用到的選項代號 O1…'))},['course','explain']))
},['summary','items']);
function explainRequest(D,M,St,out,opt){
  const probs=[],seen=new Set(),gis=new Set();
  out.forEach(o=>{const key=o.k+'|'+o.g+'|'+o.s;if(seen.has(key))return;seen.add(key);gis.add(o.g);
    probs.push({kind:o.k,what:KIND[o.k]||o.k,course:'C'+(o.g+1),slot:o.s>=0?M.s2key(o.s):''});});
  const cs=[...gis].map(gi=>{const g=M.G[gi];return {id:'C'+(gi+1),subject:g.subject,teacher:g.t>=0?'T'+(g.t+1):'',perWeek:g.per,allowedSlots:g.alist.length,
    placed:M.L.filter((x,l)=>x.g===gi&&St.slot[l]>=0).length,classes:g.cls,regularTeachers:[...new Set(g.locks.filter(k=>k.t>=0).map(k=>'T'+(k.t+1)))]};});
  const ops=options(M,[...gis].sort((a,b)=>M.G[a].alist.length-M.G[b].alist.length));
  const prompt='排課系統檢查出下面這些問題。請用國中老師聽得懂的白話說明原因，並提出協商建議。\n'+
    '協商建議只能用 options 裡系統算好的選項（某位老師某一節如果可以排，那門課就多一個可以排的位置），寫出用到的選項代號；不要自己編新的時段或人。\n'+
    '老師、課都是代號（T1、C1…），請照用代號，系統會換回名字。\n\n'+JSON.stringify({problems:probs.slice(0,80),courses:cs,options:ops.map(o=>({id:o.id,course:o.course,slot:o.slotName,teacher:o.teacher}))});
  const req=finalize(D,{kind:'explain',system:'你是國中資源班的排課顧問，說話簡短、具體、有禮貌。',prompt,schema:EXPLAIN_SCHEMA,temperature:0.3},opt);
  req.options=ops;return req;
}

/* ───── (c) 全校課表：文字辨識認不出的，請 Gemini 看圖，從「已知的老師名單」裡挑，附把握程度；不准自己編名字 ───── */
function ttSchema(known){
  const names=[...(known||[])];
  return S.obj({
    class:S.str('班級編號，三位數，例如 701；圖上看不到就留空'),
    entries:S.arr(S.obj({subject:S.str('科目'),seen:S.str('圖上看到的老師名字（照抄，看不清楚的字用 ? 代替）'),
      teacher:S.str('從名單挑出的老師；名單上沒有相符的就留空字串',names.length?{enum:names.concat([''])}:{}),
      confidence:{type:'NUMBER',description:'0 到 1，有多確定'},periods:S.int('每週節數')},['subject','seen','teacher','confidence','periods']))
  },['entries']);
}
// 圖上一定有老師姓名，所以要老師勾選「可以送出老師姓名」才用；名單太長只取前 400 位
function ttRequest(img,cls,known){
  const names=[...(known||[])].slice(0,400);
  return {kind:'tt',images:[img],schema:ttSchema(names),temperature:0,
    system:'你是仔細的資料登打員。老師一定要從提供的名單裡挑，名單上沒有就留空，絕對不要自己編名字。',
    prompt:'這是一所國中'+(cls&&cls[0]!=='?'?' '+cls+' 班':'某一班')+'課程表下方的統計區，每一格有「科目、老師、節數」。請逐格抄出科目和節數，'+
      '老師欄先照抄圖上看到的字，再從下面名單挑出最像的一位並給把握程度（0～1）。\n名單：'+names.join('、')};
}
// 合併：只採用名單上的名字、把握程度夠高的；認不出的換成建議，原本認得的不動但標出不同；全部要老師按儲存才算數
function ttMerge(rows,ans,known,minConf){
  known=known||new Set();const lo=minConf==null?0.6:minConf;let rejected=0;
  const es=((ans&&ans.entries)||[]).map(e=>({sj:C.ttSubjFix(String(e.subject||'').trim())||String(e.subject||'').trim(),t:String(e.teacher||'').replace(/\s+/g,''),seen:String(e.seen||''),
    conf:Math.max(0,Math.min(1,+e.confidence||0)),n:Math.max(1,parseInt(e.periods,10)||1),used:false})).filter(e=>{if(!e.sj)return false;if(e.t&&!known.has(e.t)){rejected++;return false;}return true;});
  const pct=e=>'（把握 '+Math.round(e.conf*100)+'%）';
  const out=rows.map(r=>({sj:r[0],t:r[1],n:r[2],unk:!!r[3],sug:'',was:''}));let changed=0;
  out.forEach(r=>{const cand=es.filter(e=>!e.used&&e.sj===r.sj),e=cand.find(x=>x.t===r.t)||cand[0];if(!e)return;e.used=true;
    if(!e.t){if(r.unk)r.sug='Gemini 也認不出（看到「'+e.seen+'」）';return;}
    if(r.unk){if(e.conf<lo){r.sug='Gemini 猜是「'+e.t+'」但不確定'+pct(e);return;}
      r.was=r.t;r.t=e.t;r.n=e.n;r.unk=false;r.sug='Gemini 建議'+pct(e);changed++;}
    else if(e.t!==r.t)r.sug='Gemini 看成「'+e.t+'」'+pct(e);});
  es.filter(e=>!e.used&&e.t&&e.conf>=lo).forEach(e=>{out.push({sj:e.sj,t:e.t,n:e.n,unk:false,sug:'Gemini 新增'+pct(e),was:''});changed++;});
  const c=String((ans&&ans.class)||'').match(/\d{3,4}/);
  return {rows:out,cls:c?c[0]:'',changed,rejected};
}

const AI={scrub,unscrub,finalize,tCode,gCode,schedRequest,schedToApply,schedCheck,schedRepair,schedJudge,schedDiff,score,
  adjContext,adjRequest,adjCheck,adjApply,adjLessons,explainRequest,options,ttRequest,ttMerge,ttSchema,keysText,findBy,
  SCHED_SCHEMA,ADJ_SCHEMA,EXPLAIN_SCHEMA,ADJ_TYPES};
root.AI=AI;
if(typeof module!=='undefined'&&module.exports)module.exports=AI;
})(typeof window!=='undefined'?window:globalThis);

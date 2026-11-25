/* 資源班管理系統｜IEP 會議時間調查：出席名單、候選時段、調查單彙整、回覆、排定時間
   瀏覽器（全域 IEP）與 node（module.exports）共用，不碰畫面。資料放在 D.iep；導師用 D.classHead[班級]＝導師姓名（和名冊匯入共用同一個欄位）。
   設計說明見 IEP-DESIGN.md。 */
'use strict';
(function(root){

// core.js 在瀏覽器是全域的 CORE，在 node 要 require；用到時才找，載入順序不影響
function core(){if(typeof CORE!=='undefined')return CORE;return require('./core.js');}   // eslint-disable-line no-undef
const DAYW='日一二三四五六';
const ROLES=['個管','導師','資源班','任課','家長','行政','專業'];
// 預設哪些身分是「必要出席」：開會一定要有的人沒來就不能開，所以排時間時一定要全到
const DEF_REQ={個管:1,導師:1,資源班:1,任課:0,家長:1,行政:0,專業:0};
// 回覆的分數：可＝1、不確定＝0.5、沒回也沒查到有課＝0.3（多半可以，但沒把握）
const W={y:1,m:.5,'':.3,n:0};
const ANS={y:'可',n:'不可',m:'不確定'};

function uid(p){return (p||'x')+Date.now().toString(36).slice(-4)+Math.random().toString(36).slice(2,6);}
const pad=s=>{const m=String(s||'').trim().match(/^(\d{1,2}):(\d{2})$/);return m?m[1].padStart(2,'0')+':'+m[2]:'';};

/* ───── 資料 ───── */
function normRound(R){
  if(!Array.isArray(R.slots))R.slots=[];
  R.slots=R.slots.filter(x=>Array.isArray(x)&&x[0]&&x[1]);
  if(!Array.isArray(R.rooms))R.rooms=[];
  if(!R.ppl||typeof R.ppl!=='object')R.ppl={};
  if(!R.ans||typeof R.ans!=='object')R.ans={};
  if(!Array.isArray(R.meets))R.meets=[];
  R.meets.forEach(m=>{if(!Array.isArray(m.p))m.p=[];if(!Array.isArray(m.no))m.no=[];});
  if(R.name==null)R.name='';if(R.due==null)R.due='';if(R.note==null)R.note='';
  return R;
}
function ensure(D){
  if(!D.iep||typeof D.iep!=='object')D.iep={};
  const I=D.iep;
  if(!I.cfg||typeof I.cfg!=='object')I.cfg={};
  const c=I.cfg;
  if(!c.req||typeof c.req!=='object')c.req={};
  for(const k in DEF_REQ)if(c.req[k]==null)c.req[k]=DEF_REQ[k];
  if(!Array.isArray(c.admin))c.admin=[];
  if(c.subj==null)c.subj=1;          // 1＝自動帶入「學生在資源班上的那幾科」的原班任課老師（邀請、非必要）
  if(!Array.isArray(I.rounds))I.rounds=[];
  I.rounds.forEach(normRound);
  if(!D.classHead||typeof D.classHead!=='object')D.classHead={};   // 導師：D.classHead[班級]＝姓名（名冊匯入學生名單時也會填）
  return I;
}
function round(D,id){const I=ensure(D);return I.rounds.find(r=>r.id===id)||null;}

/* ───── 人 ─────
   人的代號（pk）：t:老師id（名冊裡的老師）、n:姓名（課表裡有、名冊沒有的老師）、x:id（家長、專業人員等，存在 R.ppl） */
const normName=s=>String(s||'').replace(/s+/g,'').replace(/[（(][^）)]*[）)]$/,'').replace(/(老師|教師|主任|組長|導師|校長)$/,'');
// 找名冊裡的老師：先比 id、再比姓名；匯入的導師常少了「老師」或多了科目括號，去掉稱謂再比一次（只有一位對得上才算）
function teacherOf(D,v){if(!v)return null;const a=D.teachers.find(t=>t.id===v)||D.teachers.find(t=>t.name===v);if(a)return a;
  const n=normName(v);if(!n)return null;const c=D.teachers.filter(t=>normName(t.name)===n);return c.length===1?c[0]:null;}
function tKey(D,v){if(!v)return '';const t=teacherOf(D,v);return t?'t:'+t.id:'n:'+String(v).trim();}
function pName(D,R,k){if(!k)return '';const ty=k.slice(0,2),v=k.slice(2);
  if(ty==='t:'){const t=D.teachers.find(x=>x.id===v);return t?t.name:'（已刪除的老師）';}
  if(ty==='x:'){const p=R&&R.ppl[v];return p?p.n:'（未填姓名）';}
  return v;}
function isTeacher(k){return k&&(k[0]==='t'||k[0]==='n');}
function stuOf(D,id){return D.students.find(s=>s.id===id)||null;}
function stuLabel(s){return s?String(s.cls)+(s.seat?'-'+String(s.seat).padStart(2,'0'):'')+' '+s.name:'（已刪除的學生）';}

// 一班某一科的原班任課老師：先看「任課老師」（classSubj），再看全校課表
function subjTeachers(D,cls,sj){const out=[],C=core();
  const id=D.classSubj&&D.classSubj[cls+'|'+sj];if(id)out.push(tKey(D,id));
  try{C.ttTeachers(D.tt,cls,sj).forEach(n=>out.push(tKey(D,n)));}catch(e){}
  return [...new Set(out.filter(Boolean))];}
// 可以手動勾選加入的原班任課老師（這一班所有有資料的科目）
function subjOptions(D,sid){const s=stuOf(D,sid);if(!s)return [];const cls=String(s.cls),seen=new Map();
  Object.keys(D.classSubj||{}).forEach(k=>{const i=k.indexOf('|');if(k.slice(0,i)!==cls)return;const pk=tKey(D,D.classSubj[k]);if(pk&&!seen.has(pk))seen.set(pk,k.slice(i+1));});
  const c=D.tt&&D.tt[cls];if(c)Object.keys(c.subj||{}).forEach(sj=>{const x=(c.subj[sj]||[])[0];if(!x)return;const pk=tKey(D,x[0]);if(!seen.has(pk))seen.set(pk,sj);});
  return [...seen].map(([k,sj])=>({k,sj,name:pName(D,null,k)}));}

/* 一位學生的出席名單（自動帶入的部分）→ [[pk, 身分, 必要]] */
function derive(D,sid){const I=ensure(D),cfg=I.cfg,s=stuOf(D,sid);if(!s)return [];
  const out=new Map(),q=r=>cfg.req[r]?1:0;
  // 同一個人身兼好幾個身分（例：個管也教他國文、組長也是資源班老師）只列一次，身分合併；有一個身分是必要就算必要
  const add=(k,role,req)=>{if(!k)return;const o=out.get(k);
    if(o){if(!o[1].split('、').includes(role))o[1]+='、'+role;o[2]=o[2]||(req?1:0);}else out.set(k,[k,role,req?1:0]);};
  if(s.caseMgr)add(tKey(D,s.caseMgr),'個管',q('個管'));
  const hr=D.classHead[String(s.cls)];if(hr)add(tKey(D,hr),'導師',q('導師'));
  const subs=[];
  D.groups.filter(g=>g.on!==false&&(g.students||[]).includes(sid)).forEach(g=>{if(g.teacher)add(tKey(D,g.teacher),'資源班',q('資源班'));if(g.subject&&!subs.includes(g.subject))subs.push(g.subject);});
  if(cfg.subj)subs.forEach(sj=>subjTeachers(D,String(s.cls),sj).forEach(k=>add(k,'任課',q('任課'))));
  cfg.admin.forEach(a=>{if(a&&a[0])add(a[0],a[1]||'行政',a[2]!=null?a[2]:q('行政'));});
  return [...out.values()];}

/* 重新帶入：自動的照最新名冊重算；手動加的（家長、專業人員、手動加的老師）和手動改過的必要／邀請保留；手動刪掉的不再帶回來 */
function rederive(D,R,m){const old=new Map(m.p.map(x=>[x[0],x])),p=derive(D,m.s).filter(x=>!m.no.includes(x[0]));
  p.forEach(x=>{const o=old.get(x[0]);if(o&&o[4]){x[2]=o[2];x[3]=0;x[4]=1;}});
  m.p.forEach(x=>{if((x[0][0]==='x'||x[3]===1)&&!p.some(y=>y[0]===x[0]))p.push(x);});
  m.p=p;return m;}

/* 參與者：[pk, 身分, 必要(1/0), 手動加入(1), 改過必要(1)] */
function addPerson(D,R,m,k,role,req){if(!k)return null;const o=m.p.find(x=>x[0]===k);
  if(o){if(!o[1].split('、').includes(role))o[1]+='、'+role;return o;}
  m.no=m.no.filter(x=>x!==k);const e=[k,role,req?1:0,1];m.p.push(e);return e;}
function addOther(D,R,m,name,role,req){const id=uid('x');R.ppl[id]={n:String(name||'').trim(),r:role||'家長',s:m.s};return addPerson(D,R,m,'x:'+id,role||'家長',req);}
function removePerson(R,m,k){m.p=m.p.filter(x=>x[0]!==k);if(k[0]!=='x'){if(!m.no.includes(k))m.no.push(k);}
  else{const id=k.slice(2);if(!R.meets.some(o=>o.p.some(x=>x[0]===k)))delete R.ppl[id];}
}   // 回覆先留著：可能只是暫時拿掉
function setReq(m,k,req){const o=m.p.find(x=>x[0]===k);if(!o)return;o[2]=req?1:0;while(o.length<4)o.push(0);o[4]=1;}

/* ───── 調查回合 ───── */
function newRound(D,opt){const I=ensure(D);opt=opt||{};
  const R=normRound({id:uid('iep'),name:opt.name||'IEP 會議',due:opt.due||'',note:opt.note||'',at:Date.now(),
    slots:(opt.slots||[]).map(k=>Array.isArray(k)?k:splitKey(k)),rooms:(opt.rooms||[]).slice(),ppl:{},ans:{},meets:[]});
  (opt.stu||[]).forEach(sid=>addMeet(D,R,sid));
  I.rounds.push(R);I.cur=R.id;return R;}
function addMeet(D,R,sid){if(R.meets.some(m=>m.s===sid))return null;const m={id:uid('m'),s:sid,p:derive(D,sid),no:[]};R.meets.push(m);return m;}
function delMeet(R,id){R.meets=R.meets.filter(m=>m.id!==id);
  Object.keys(R.ppl).forEach(x=>{if(!R.meets.some(m=>m.p.some(e=>e[0]==='x:'+x)))delete R.ppl[x];});}

/* ───── 時段 ─────
   時段的代號：「日期|節次id」或「日期|HH:MM-HH:MM」（自訂時間，例：放學後） */
const key=(d,p)=>d+'|'+p;
function splitKey(k){const i=String(k).indexOf('|');return [String(k).slice(0,i),String(k).slice(i+1)];}
function keysOf(R){return R.slots.map(x=>key(x[0],x[1]));}
function parseDate(s){const m=String(s||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);return m?new Date(+m[1],+m[2]-1,+m[3]):null;}
function fmtDate(s){const d=parseDate(s);return d?(d.getMonth()+1)+'/'+d.getDate()+'（'+DAYW[d.getDay()]+'）':String(s||'');}
function slotInfo(D,k){const [date,p]=splitKey(k),d=parseDate(date),wd=d?d.getDay():-1,w=wd>=1&&wd<=5?wd-1:-1;
  let st='',en='',name='',pis=[];const tm=String(p).match(/^(\d{1,2}:\d{2})\s*[-~～－]\s*(\d{1,2}:\d{2})$/);
  if(tm){st=pad(tm[1]);en=pad(tm[2]);name=st+'–'+en;}
  else{const i=D.periods.findIndex(x=>x.id===p);if(i>=0){st=pad(D.periods[i].start);en=pad(D.periods[i].end);name=D.periods[i].name;pis=[i];}else name=p;}
  // 自訂時間：和哪幾節重疊，就看那幾節有沒有課
  if(tm)D.periods.forEach((x,i)=>{const a=pad(x.start),b=pad(x.end);if(a&&b&&a<en&&st<b)pis.push(i);});
  return {k,date,p,w,st,en,name,pis,custom:!!tm,label:fmtDate(date)+name,time:st&&en?st+'–'+en:''};}
// 日期區間 × 星期幾 → 日期清單（例：12/1～12/12 的週二、週四）
function dateRange(from,to,wds){const a=parseDate(from),b=parseDate(to),out=[];if(!a||!b)return out;
  for(let d=new Date(a);d<=b&&out.length<120;d.setDate(d.getDate()+1)){if(wds&&wds.length&&!wds.includes(d.getDay()))continue;
    out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));}
  return out;}
function genSlots(dates,pids){const out=[];dates.forEach(d=>pids.forEach(p=>out.push([d,p])));return out;}
function sortSlots(D,R){const inf=R.slots.map(x=>slotInfo(D,key(x[0],x[1])));
  const o=R.slots.map((x,i)=>i).sort((i,j)=>inf[i].date.localeCompare(inf[j].date)||inf[i].st.localeCompare(inf[j].st)||String(inf[i].p).localeCompare(String(inf[j].p)));
  const seen=new Set();R.slots=o.map(i=>R.slots[i]).filter(x=>{const k=key(x[0],x[1]);if(seen.has(k))return false;seen.add(k);return true;});}
function overlap(a,b){return a.date===b.date&&(a.k===b.k||(!!a.st&&!!b.st&&a.st<b.en&&b.st<a.en));}

/* ───── 有課、有事：自動標出 ─────
   ctx＝{M, slot, room}：app 傳現成的（M、ST.slot、ROOM）；沒傳就自己從 D 算一次 */
function ctxOf(D){const C=core(),M=C.compile(D),S=C.toState(M,D);M.lroom=S.rfix;return {M,slot:S.slot,room:C.assignRooms(M,S.slot)};}
function weekBusy(D,ctx){const C=core(),{M,slot,room}=ctx,NS=M.NS,tb=new Map(),rb=new Map();
  const put=(map,k,why)=>{if(!map.has(k))map.set(k,why);};
  // 先放資源班的課（最確定），再放鎖課（原班老師同一節在上原班的課），最後才是老師登記的不排課時段
  M.L.forEach((x,l)=>{const s=slot[l],g=M.G[x.g];if(s<0)return;if(g.t>=0)put(tb,g.t*NS+s,'資源班上課（'+g.name+'）');
    if(room&&room[l]>=0)put(rb,room[l]*NS+s,g.name);});
  try{let locks=[];
    if(M.flex)locks=C.assignLocks(M,slot).locks;
    else M.L.forEach((x,l)=>{const s=slot[l],g=M.G[x.g];if(s>=0&&g.need)g.locks.forEach(k=>{if(k.t>=0)locks.push({t:k.t,s,cls:k.cls,sj:g.subject});});});
    locks.forEach(k=>put(tb,k.t*NS+k.s,'原班上課（'+k.cls+k.sj+'）'));}catch(e){}
  // 之後有每位老師的原班課表（全校配課格子）時放在 D.tgrid[老師id或姓名]=['星期-節次id', …]，這裡就會一起標
  const TG=D.tgrid||{};
  M.T.forEach((t,ti)=>{for(let s=0;s<NS;s++)if(M.off[ti][s])put(tb,ti*NS+s,'已登記不排課'+(t.note?'（'+t.note+'）':''));
    (TG[t.id]||TG[t.name]||[]).forEach(k=>{const s=M.key2s(k);if(s>=0)put(tb,ti*NS+s,'原班上課');});});
  return {tb,rb,M};}
/* 每個人每個候選時段已知的忙碌原因 → {pk:{時段:原因}}，教室 → {教室名稱:{時段:原因}} */
function busyOf(D,R,ctx){ctx=ctx||ctxOf(D);const {tb,rb,M}=weekBusy(D,ctx),NS=M.NS,NP=M.NP,keys=keysOf(R),inf=keys.map(k=>slotInfo(D,k));
  const people=new Set();R.meets.forEach(m=>m.p.forEach(x=>people.add(x[0])));
  const out={},rooms={};
  people.forEach(k=>{if(!isTeacher(k))return;const t=teacherOf(D,k.slice(2));if(!t)return;const ti=M.tIdx[t.id];
    inf.forEach(f=>{if(f.w<0)return;for(const pi of f.pis){const why=tb.get(ti*NS+f.w*NP+pi);if(why){(out[k]=out[k]||{})[f.k]=why;break;}}});});
  // 別的調查回合已經排定的 IEP 會議
  // 不管是哪一位老師開的調查都算：同一個人、同一間開會地點不會同時排兩場。__iep 是硬限制（自己回覆「可」也不排）
  const hard={};
  ensure(D).rounds.forEach(R2=>{if(R2===R)return;R2.meets.forEach(m=>{if(!m.at)return;const f2=slotInfo(D,m.at),hit=inf.filter(f=>overlap(f,f2));if(!hit.length)return;
    const lab='已排 IEP（'+stuLabel(stuOf(D,m.s))+'）';
    m.p.forEach(x=>{if(!people.has(x[0]))return;const o=out[x[0]]=out[x[0]]||{},h=hard[x[0]]=hard[x[0]]||{};hit.forEach(f=>{if(!o[f.k])o[f.k]=lab;h[f.k]=lab;});});
    if(m.room&&R.rooms.includes(m.room)){const o=rooms[m.room]=rooms[m.room]||{};hit.forEach(f=>{o[f.k]='已排 IEP';});}});});
  R.rooms.forEach(name=>{const ri=D.rooms.findIndex(r=>r.name===name);if(ri<0)return;
    inf.forEach(f=>{if(f.w<0)return;for(const pi of f.pis){const g=rb.get(ri*NS+f.w*NP+pi);if(g){const o=rooms[name]=rooms[name]||{};if(!o[f.k])o[f.k]='資源班上課（'+g+'）';break;}}});});
  out.__rooms=rooms;out.__iep=hard;return out;}

/* ───── 回覆 ───── */
function record(R,k,sk,v){if(!k||!sk)return;if(v==='y'||v==='n'||v==='m'){(R.ans[k]=R.ans[k]||{})[sk]=v;}
  else if(R.ans[k]){delete R.ans[k][sk];if(!Object.keys(R.ans[k]).length)delete R.ans[k];}}
// 其餘沒填的格子一次填好（已知有課的不動，讓老師自己決定能不能調）
function fillRest(R,k,v,keys,busy){(keys||keysOf(R)).forEach(sk=>{if(R.ans[k]&&R.ans[k][sk])return;if(busy&&busy[k]&&busy[k][sk])return;record(R,k,sk,v);});}
// 一個人某個時段的狀態：自己回覆的最準；沒回覆而系統查到有課就當「不可」（auto）；都沒有是 ''
function status(R,busy,k,sk){const a=R.ans[k]&&R.ans[k][sk];if(a)return {v:a,auto:false};
  const b=busy&&busy[k]&&busy[k][sk];if(b)return {v:'n',auto:true,why:b};return {v:'',auto:false};}
const CYCLE={'':'y',y:'n',n:'m',m:''};
function cycle(R,busy,k,sk){const a=R.ans[k]&&R.ans[k][sk];record(R,k,sk,CYCLE[a||'']);return (R.ans[k]&&R.ans[k][sk])||'';}

/* ───── 每一位老師一張調查單 ─────
   同一位老師被好幾位學生的會議邀請時，合併成一張：列出所有學生，下面一個時段格子 */
function meetSlots(R,m){const all=keysOf(R);return Array.isArray(m.sl)&&m.sl.length?all.filter(k=>m.sl.includes(k)):all;}
function consolidate(D,R,opt){opt=opt||{};const busy=opt.busy||{},by=new Map(),all=keysOf(R);
  R.meets.forEach(m=>{if(opt.fixed&&!m.at)return;const s=stuOf(D,m.s);
    m.p.forEach(x=>{const k=x[0];if(!opt.all&&!isTeacher(k))return;let o=by.get(k);
      if(!o)by.set(k,o={k,name:pName(D,R,k),teacher:isTeacher(k),meets:[],keys:new Set()});
      o.meets.push({m,s,stu:stuLabel(s),role:x[1],req:!!x[2],cm:s&&s.caseMgr?pName(D,R,tKey(D,s.caseMgr)):''});
      meetSlots(R,m).forEach(sk=>o.keys.add(sk));});});
  const list=[...by.values()].map(o=>{o.keys=all.filter(k=>o.keys.has(k));o.busy=busy[o.k]||{};
    o.meets.sort((a,b)=>String(a.s&&a.s.cls).localeCompare(String(b.s&&b.s.cls))||(+(a.s&&a.s.seat)||0)-(+(b.s&&b.s.seat)||0));
    const a=R.ans[o.k]||{};o.answered=o.keys.filter(k=>a[k]).length;return o;});
  return list.sort((a,b)=>(b.teacher-a.teacher)||a.name.localeCompare(b.name,'zh-Hant'));}
// 調查單上的格子：列＝日期、欄＝節次（自訂時間另成一欄）
function grid(D,keys){const inf=keys.map(k=>slotInfo(D,k)),dates=[...new Set(inf.map(f=>f.date))].sort();
  const cols=[];inf.forEach(f=>{if(!cols.some(c=>c.p===f.p))cols.push({p:f.p,name:f.name,time:f.time,st:f.st});});
  cols.sort((a,b)=>a.st.localeCompare(b.st)||String(a.p).localeCompare(String(b.p)));
  const has=new Set(keys);return {dates:dates.map(d=>({date:d,label:fmtDate(d)})),cols,cell:(d,p)=>has.has(key(d,p))?key(d,p):''};}

/* ───── 一場會議的時段排名 ───── */
function rank(D,R,m,busy){const ppl=m.p,hard=(busy&&busy.__iep)||{};
  return meetSlots(R,m).map((sk,i)=>{let ok=true,val=0,yes=0;const bad=[],miss=[],unk=[];
    ppl.forEach(x=>{const st=hard[x[0]]&&hard[x[0]][sk]?{v:'n',auto:true}:status(R,busy,x[0],sk),n=pName(D,R,x[0]);
      if(st.v==='n'){if(x[2]){ok=false;bad.push(n);}else miss.push(n);return;}
      if(st.v==='y')yes++;else unk.push(n);
      val+=(x[2]?2:1)*W[st.v];});
    return {k:sk,i,ok,val,yes,tot:ppl.length,bad,miss,unk};})
  // 必要的人都能來的排前面；同樣能開，看「大家能來的程度」（必要的人算兩倍），再比日期早晚
  .sort((a,b)=>(b.ok-a.ok)||(a.bad.length-b.bad.length)||(b.val-a.val)||(a.i-b.i));}

/* ───── 全部會議一起排 ─────
   同一位必要出席的人不能同時在兩場；教室同一時段只能開一場（有設定教室時）。
   選邀的人撞到只扣分不禁止。先貪婪（最難排的先排），再把排不進去的試著擠開一場別的（repair），最後逐場換時段、兩兩交換改善。 */
function schedule(D,R,opt){opt=opt||{};const busy=opt.busy||busyOf(D,R,opt.ctx),keys=keysOf(R),K=keys.length,inf=keys.map(k=>slotInfo(D,k)),kidx={};keys.forEach((k,i)=>{kidx[k]=i;});
  const MS=R.meets,N=MS.length,BIG=1000;
  const ov=keys.map((k,i)=>keys.map((k2,j)=>i===j||overlap(inf[i],inf[j])));
  const rb=busy.__rooms||{},rooms=R.rooms.slice(),roomFree=keys.map(k=>rooms.filter(r=>!(rb[r]&&rb[r][k])));
  // 每場會議每個時段的分數（不能開＝null）
  const val=MS.map(m=>{const a=new Array(K).fill(null);rank(D,R,m,busy).forEach(r=>{if(r.ok)a[kidx[r.k]]=r.val;});return a;});
  // 兩場會議之間：hard＝有人在兩場都是必要；soft＝撞到的選邀人數
  const reqOf=MS.map(m=>new Map(m.p.map(x=>[x[0],!!x[2]])));
  const hard=[],soft=[];for(let i=0;i<N;i++){hard.push(new Uint8Array(N));soft.push(new Float32Array(N));}
  for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){let h=0,s=0;reqOf[i].forEach((r,k)=>{if(!reqOf[j].has(k))return;const r2=reqOf[j].get(k);if(r&&r2)h=1;else s+=1;});hard[i][j]=hard[j][i]=h;soft[i][j]=soft[j][i]=s;}
  const a=new Int16Array(N).fill(-1),pin=new Uint8Array(N);
  MS.forEach((m,i)=>{if(m.pin&&m.at&&kidx[m.at]!=null){a[i]=kidx[m.at];pin[i]=1;}});
  const roomsOK=(i,ki,skip)=>{if(!rooms.length)return true;let n=0;for(let j=0;j<N;j++)if(j!==i&&j!==skip&&a[j]>=0&&ov[ki][a[j]])n++;return n<roomFree[ki].length;};
  const blockers=(i,ki)=>{const b=[];for(let j=0;j<N;j++)if(j!==i&&a[j]>=0&&ov[ki][a[j]]&&hard[i][j])b.push(j);return b;};
  const feasible=(i,ki,skip)=>val[i][ki]!=null&&blockers(i,ki).filter(j=>j!==skip).length===0&&roomsOK(i,ki,skip);
  const contrib=(i,ki)=>{let c=BIG+val[i][ki]-ki*1e-4;for(let j=0;j<N;j++)if(j!==i&&a[j]>=0&&ov[ki][a[j]])c-=soft[i][j];return c;};
  const nCand=val.map(v=>v.filter(x=>x!=null).length);
  const order=MS.map((m,i)=>i).sort((i,j)=>nCand[i]-nCand[j]||MS[j].p.filter(x=>x[2]).length-MS[i].p.filter(x=>x[2]).length||i-j);
  const best=i=>{let bk=-1,bv=-Infinity;for(let ki=0;ki<K;ki++){if(!feasible(i,ki))continue;const c=contrib(i,ki);if(c>bv){bv=c;bk=ki;}}return bk;};
  // 1. 貪婪
  order.forEach(i=>{if(pin[i])return;a[i]=-1;a[i]=best(i);});
  // 2. 修補：排不進去的，找一個只被一場擋住的時段，把那一場移到別的時段
  for(let pass=0;pass<4;pass++){let moved=false;
    order.forEach(i=>{if(a[i]>=0||pin[i]||!nCand[i])return;
      const ks=[...Array(K).keys()].filter(ki=>val[i][ki]!=null).sort((x,y)=>val[i][y]-val[i][x]);
      for(const ki of ks){const b=blockers(i,ki);let room=roomsOK(i,ki);
        if(b.length>1||(b.length===0&&room))continue;
        // 擋住的是人：移開那一場；擋住的是教室：試著移開同時段任一場
        const cand=b.length?b:[...Array(N).keys()].filter(j=>j!==i&&a[j]>=0&&ov[ki][a[j]]);
        let done=false;
        for(const j of cand){if(pin[j])continue;const old=a[j];a[j]=-1;a[i]=ki;
          if(blockers(i,ki).length||!roomsOK(i,ki)){a[i]=-1;a[j]=old;continue;}
          const nk=best(j);if(nk>=0){a[j]=nk;done=true;break;}
          a[i]=-1;a[j]=old;}
        if(done){moved=true;break;}}});
    if(!moved)break;}
  // 3. 改善：一場一場換到更好的時段；兩場互換
  for(let pass=0;pass<20;pass++){let imp=false;
    for(let i=0;i<N;i++){if(pin[i])continue;
      if(a[i]<0){const k=best(i);if(k>=0){a[i]=k;imp=true;}continue;}
      const cur=a[i],c0=contrib(i,cur);a[i]=-1;let bk=cur,bv=c0;
      for(let ki=0;ki<K;ki++){if(ki===cur||!feasible(i,ki))continue;const c=contrib(i,ki);if(c>bv+1e-9){bv=c;bk=ki;}}
      a[i]=bk;if(bk!==cur)imp=true;}
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){if(pin[i]||pin[j]||a[i]<0||a[j]<0||a[i]===a[j])continue;
      const ki=a[i],kj=a[j];if(val[i][kj]==null||val[j][ki]==null)continue;
      const before=contrib(i,ki)+contrib(j,kj)-(ov[ki][kj]?soft[i][j]:0);
      a[i]=kj;a[j]=ki;
      const ok=!blockers(i,kj).length&&!blockers(j,ki).length&&roomsOK(i,kj)&&roomsOK(j,ki);
      const after=ok?contrib(i,kj)+contrib(j,ki)-(ov[ki][kj]?soft[i][j]:0):-Infinity;
      if(after>before+1e-9)imp=true;else{a[i]=ki;a[j]=kj;}}
    if(!imp)break;}
  // 4. 分配教室：釘住的保留原教室；其餘照設定的順序，避開資源班正在上課的教室
  const room={},at={};
  const idx=[...Array(N).keys()].filter(i=>a[i]>=0).sort((i,j)=>pin[j]-pin[i]||a[i]-a[j]);
  const used=[];  // [ki, 教室]
  idx.forEach(i=>{const m=MS[i],ki=a[i];at[m.id]=keys[ki];if(!rooms.length)return;
    const taken=new Set(used.filter(u=>ov[ki][u[0]]).map(u=>u[1]));
    let r=pin[i]&&m.room&&roomFree[ki].includes(m.room)&&!taken.has(m.room)?m.room:roomFree[ki].find(x=>!taken.has(x));
    if(r==null)r='';room[m.id]=r;if(r)used.push([ki,r]);});
  // 排不進去的原因
  const un=[];MS.forEach((m,i)=>{if(a[i]>=0)return;const rk=rank(D,R,m,busy),b=rk[0];
    let why;if(!K)why='還沒有候選時段';
    else if(!nCand[i])why='沒有一個時段必要出席的人都能來'+(b&&b.bad.length?'；最接近的是 '+slotInfo(D,b.k).label+'，'+b.bad.join('、')+' 不行':'');
    else why='能開的時段都被其他會議排走了（同一位必要出席的人或教室撞到），可以多開幾個時段或多一間教室';
    un.push({id:m.id,why});});
  let score=0;for(let i=0;i<N;i++)if(a[i]>=0)score+=contrib(i,a[i])-BIG;
  return {at,room,un,score};}
function applyPlan(R,res){R.meets.forEach(m=>{if(m.pin)return;if(res.at[m.id]){m.at=res.at[m.id];m.room=res.room[m.id]||'';}else{m.at='';m.room='';}});}

/* 檢查目前排定的時間有沒有撞到（給畫面提醒，也給測試用） */
function conflicts(D,R){const out=[],ms=R.meets.filter(m=>m.at);
  for(let i=0;i<ms.length;i++)for(let j=i+1;j<ms.length;j++){const a=ms[i],b=ms[j],fa=slotInfo(D,a.at),fb=slotInfo(D,b.at);if(!overlap(fa,fb))continue;
    const rb=new Map(b.p.map(x=>[x[0],x[2]]));
    a.p.forEach(x=>{if(rb.has(x[0])&&x[2]&&rb.get(x[0]))out.push({a:a.id,b:b.id,k:x[0],m:pName(D,R,x[0])+' 同時要參加 '+stuLabel(stuOf(D,a.s))+' 和 '+stuLabel(stuOf(D,b.s))+' 的會議'});});
    if(a.room&&a.room===b.room)out.push({a:a.id,b:b.id,room:a.room,m:a.room+' 同時排了兩場會議'});}
  return out;}
// 和別的調查（別位老師開的也算）已經排定的會議撞到：同一個人或同一間地點。不寫出別場是哪位學生
function crossConflicts(D,R){const out=[];
  R.meets.forEach(a=>{if(!a.at)return;const fa=slotInfo(D,a.at),pa=new Set(a.p.map(x=>x[0]));
    ensure(D).rounds.forEach(R2=>{if(R2===R)return;R2.meets.forEach(b=>{if(!b.at||!overlap(fa,slotInfo(D,b.at)))return;
      b.p.forEach(x=>{if(pa.has(x[0]))out.push({a:a.id,r:R2.id,b:b.id,k:x[0],m:pName(D,R,x[0])+' 在 '+fa.label+' 已經有另一場會議（'+stuLabel(stuOf(D,a.s))+'）'});});
      if(a.room&&a.room===b.room)out.push({a:a.id,r:R2.id,b:b.id,room:a.room,m:a.room+' 在 '+fa.label+' 已經有另一場會議'});});});});
  return out;}

/* ───── 每位老師自己的調查（老師登入後的「我的 IEP」） ─────
   R.host＝承辦：老師自己開的記老師 id（畫面和公開頁顯示成老師姓名）；特教組開的是文字（例：特教組）。
   老師只能替自己個管的學生開調查、只看到自己開的；別人開的會議邀請了他，他可以直接填空堂。 */
function hostId(D,R){const h=String((R&&R.host)||'');return h&&D.teachers.some(t=>t.id===h)?h:'';}
function hostLabel(D,R){const id=hostId(D,R);return id?D.teachers.find(t=>t.id===id).name:String((R&&R.host)||'');}
function mineStu(D,tid){return D.students.filter(s=>!tid||s.caseMgr===tid);}
// 一位老師看得到、改得動的調查：tid 空白＝管理者，全部；quick：直接開會的（1）或調查（0）；undefined＝兩種都要
function ownRounds(D,tid,quick){return ensure(D).rounds.filter(R=>(quick==null||!!R.quick===!!quick)&&(!tid||hostId(D,R)===tid));}
function canEdit(D,R,tid){return !!R&&(!tid||hostId(D,R)===tid);}
// 別人（或自己）開的調查裡，有邀請這位老師、而且有候選時段的
function invited(D,tid){const k='t:'+tid;return ensure(D).rounds.filter(R=>!R.quick&&R.slots.length&&R.meets.some(m=>m.p.some(x=>x[0]===k)));}
// 老師模式加學生：只收自己個管的
function addMeetAs(D,R,sid,tid){const s=stuOf(D,sid);if(!s||(tid&&s.caseMgr!==tid))return null;return addMeet(D,R,sid);}
function newRoundAs(D,tid,opt){const R=newRound(D,Object.assign({},opt||{},{stu:[]}));if(tid)R.host=tid;
  ((opt&&opt.stu)||[]).forEach(sid=>addMeetAs(D,R,sid,tid));return R;}
// 老師在系統裡直接填自己的空堂（不用連結）：free＝有空的時段，其餘當「不可」；和線上回覆同一個格式
function selfAnswer(D,R,pk,free,note){const o=consolidate(D,R,{all:true}).find(x=>x.k===pk);if(!o)return false;
  const prev=R.web&&R.web[pk],at=Math.max(Date.now(),prev?prev.at+1:0);return applyWeb(R,o,{free:free||[],note:note||'',at});}

/* 開會通知：每個人一張，只列已排定的會議 */
function notices(D,R,opt){return consolidate(D,R,Object.assign({},opt||{},{fixed:true})).map(o=>{o.meets.sort((x,y)=>String(x.m.at).localeCompare(String(y.m.at)));return o;});}

/* ───── 小通知單（一張 A4 裁成 3～4 張，每位出席者一張、每場會議一張） ───── */
const KINDS=['IEP 期初會議','IEP 期末會議','個案會議','轉銜會議'];
// 學生怎麼印：full＝班級座號＋姓名，cls＝只印班級座號，mask＝姓名中間遮成○（小紙條容易掉，給學校選）
function stuShow(s,mode){if(!s)return '（已刪除的學生）';const cs=String(s.cls)+(s.seat?'-'+String(s.seat).padStart(2,'0'):'');
  if(mode==='cls')return cs;const n=String(s.name||'');
  if(mode==='mask')return cs+' '+(n.length<=1?n:n.length===2?n[0]+'○':n[0]+'○'.repeat(n.length-2)+n[n.length-1]);
  return cs+' '+n;}
// 稱呼：名字已經帶職稱就不再加；老師加「老師」、家長加「家長」
function salute(name,role,teacher){const n=String(name||'').trim();
  const base=n.replace(/[（(][^）)]*[）)]$/,'');if(/(老師|主任|組長|校長|家長|先生|女士|媽媽|爸爸|阿嬤|阿公|奶奶|爺爺|心理師|治療師|社工師?)$/.test(base))return n;
  if(teacher)return n+'老師';if(/家長/.test(role))return n+'家長';return n;}
const ROLE_ORDER=r=>{const i=ROLES.indexOf(String(r).split('、')[0]);return i<0?99:i;};
/* 開會通知小單（時間已排定）：每場會議、每位出席者一張；opt.all＝家長、專業人員也印；opt.only＝只印這幾場 */
function slipItems(D,R,opt){opt=opt||{};const out=[];
  const ms=R.meets.filter(m=>(!opt.only||opt.only.includes(m.id))&&m.at).slice()
    .sort((a,b)=>String(a.at).localeCompare(String(b.at))||String((stuOf(D,a.s)||{}).cls).localeCompare(String((stuOf(D,b.s)||{}).cls)));
  ms.forEach(m=>{const s=stuOf(D,m.s),cm=s&&s.caseMgr?pName(D,R,tKey(D,s.caseMgr)):'',t0=slotInfo(D,m.at);
    m.p.slice().sort((a,b)=>ROLE_ORDER(a[1])-ROLE_ORDER(b[1])).forEach(x=>{const t=isTeacher(x[0]);if(!opt.all&&!t)return;
      const name=pName(D,R,x[0]);
      out.push({m,k:x[0],name,to:salute(name,x[1],t),role:x[1],req:!!x[2],stu:stuShow(s,opt.privacy),cm,kind:R.kind||KINDS[0],
        time:t0,room:m.room||R.place||'',due:R.cdue||'',host:hostLabel(D,R)});});});
  return out;}
// 很快開一場：已經知道時間的個管老師，選學生、填日期時間地點，就能印通知單
function quickMeet(D,o){const I=ensure(D),s=stuOf(D,o.sid);if(!s)return null;
  const k=key(o.date,o.p),R=normRound({id:uid('iep'),name:(o.kind||KINDS[0])+'　'+stuLabel(s),kind:o.kind||KINDS[0],quick:1,cdue:o.due||'',host:o.host||'',place:o.room||'',
    at:Date.now(),slots:[[o.date,o.p]],rooms:o.room?[o.room]:[],ppl:{},ans:{},meets:[]});
  const m=addMeet(D,R,o.sid);m.at=k;m.room=o.room||'';m.pin=1;I.rounds.push(R);I.cur=R.id;return R;}

/* ───── 線上調查：每位出席者一個專屬連結（QR） ─────
   一位老師被好幾場會議邀請，仍然只有一個連結，一次回答全部。家長另有自己的連結（只能送出一次）。
   公開頁只放必要的東西：稱呼、學生的班級座號（或遮住的姓名）、日期範圍、節次、已知有課的節次；不放障別、服務等任何資料。 */
const B62='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// 24 碼、每碼 62 選 1（約 142 位元，超過 128 位元）。位元組 ≥248 丟掉重抽，避免某些字母機率偏高
function token(n){n=n||24;const cr=typeof globalThis!=='undefined'?globalThis.crypto:null;
  if(!cr||!cr.getRandomValues)throw new Error('這個瀏覽器不能產生安全的亂數，請換新版瀏覽器');
  let out='';while(out.length<n){for(const x of cr.getRandomValues(new Uint8Array(n*2)))if(x<248&&out.length<n)out+=B62[x%62];}
  return out;}
const TOKEN_RE=/^[A-Za-z0-9]{24,64}$/;
// SHA-256（同步版，鑰匙只有英數字）：共用資料裡只存鑰匙的雜湊，算雜湊不用等瀏覽器的非同步 API。結果和 tokHash、Function 端一樣
function sha256hex(str){const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const b=[];const s=unescape(encodeURIComponent(String(str)));for(let i=0;i<s.length;i++)b.push(s.charCodeAt(i));
  const bits=b.length*8;b.push(0x80);while(b.length%64!==56)b.push(0);for(let i=7;i>=0;i--)b.push(i>=4?0:(bits>>>(i*8))&255);
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];const W=new Array(64),r=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let o=0;o<b.length;o+=64){for(let i=0;i<16;i++)W[i]=(b[o+4*i]<<24)|(b[o+4*i+1]<<16)|(b[o+4*i+2]<<8)|b[o+4*i+3];
    for(let i=16;i<64;i++){const s0=r(W[i-15],7)^r(W[i-15],18)^(W[i-15]>>>3),s1=r(W[i-2],17)^r(W[i-2],19)^(W[i-2]>>>10);W[i]=(W[i-16]+s0+W[i-7]+s1)|0;}
    let [a,c,d,e,f,g,h,k]=H;
    for(let i=0;i<64;i++){const t1=(k+(r(f,6)^r(f,11)^r(f,25))+((f&g)^(~f&h))+K[i]+W[i])|0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&c)^(a&d)^(c&d)))|0;k=h;h=g;g=f;f=(e+t1)|0;e=d;d=c;c=a;a=(t1+t2)|0;}
    H=[H[0]+a,H[1]+c,H[2]+d,H[3]+e,H[4]+f,H[5]+g,H[6]+h,H[7]+k].map(x=>x|0);}
  return H.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');}
const HASH_RE=/^[0-9a-f]{64}$/;
// 雲端文件名稱用鑰匙的 SHA-256，不直接用鑰匙：資料庫被看到也拿不到能用的連結（Function 端算法相同）
async function tokHash(t){const b=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(t)));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
// 調查範圍：日期區間的週一到週五 × 勾選的節次
function setRange(D,R,d1,d2,ps){R.d1=d1||'';R.d2=d2||'';R.ps=(ps||[]).filter(p=>D.periods.some(x=>x.id===p));
  R.slots=genSlots(dateRange(R.d1,R.d2,[1,2,3,4,5]),R.ps);sortSlots(D,R);return R.slots.length;}
// 連結到期：回覆期限那一天的晚上 23:59:59（本機時間）
function expMs(R){const d=parseDate(R.due);return d?new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59).getTime():0;}
// 要發連結的人：老師一定有；家長、專業人員要勾 R.par 才發
function webPeople(D,R){return consolidate(D,R,{all:!!R.par});}
/* 鑰匙放哪裡：
   ・共用資料（rc/main）只放雜湊：R.tokH＝{出席者代號: sha256(鑰匙)}，R.pub＝已經寫到雲端的 iepTok 文件名稱（雜湊）。
   ・鑰匙本身只放在發布的那台電腦（app 的 localStorage「rc-iep-tok」）：local＝{出席者代號: [鑰匙, 雜湊]}。
   ・別台電腦沒有鑰匙，就做不出連結：按「重新產生連結」換一把新的（舊的 iepTok 文件刪掉，舊連結失效）。
   更新線上內容不需要鑰匙（文件名稱就是雜湊）。 */
// 舊資料：鑰匙直接存在 R.tok、R.pub 也是鑰匙 → 搬到 local，共用資料只留雜湊。回傳有沒有搬
function migrateTok(R,local){if(!R)return false;let ch=false;R.tokH=R.tokH&&typeof R.tokH==='object'?R.tokH:{};
  if(R.tok&&typeof R.tok==='object'){for(const k in R.tok){const t=R.tok[k];if(typeof t==='string'&&TOKEN_RE.test(t)){const h=sha256hex(t);R.tokH[k]=h;if(local)local[k]=[t,h];}}delete R.tok;ch=true;}
  if(Array.isArray(R.pub)&&R.pub.some(t=>!HASH_RE.test(String(t)))){R.pub=R.pub.map(t=>HASH_RE.test(String(t))?t:sha256hex(t));ch=true;}
  return ch;}
// 要發連結的每一位：已經有雜湊的沿用（重新發布不換鑰匙）；新的人產生鑰匙（鑰匙進 local、雜湊進 R.tokH）
function ensureTokens(D,R,local){local=local||{};migrateTok(R,local);const list=webPeople(D,R);
  list.forEach(o=>{if(R.tokH[o.k]&&HASH_RE.test(R.tokH[o.k]))return;const t=token(),h=sha256hex(t);local[o.k]=[t,h];R.tokH[o.k]=h;});return list;}
// 這台電腦能不能做出這個人的連結：local 有鑰匙、而且和共用資料的雜湊對得上（別台電腦重新產生過就對不上）
function linkTok(R,local,pk){const x=local&&local[pk],h=R&&R.tokH&&R.tokH[pk];return Array.isArray(x)&&h&&x[1]===h&&TOKEN_RE.test(x[0])?x[0]:'';}
// 重新產生一個人的鑰匙：回傳舊的雜湊（要刪掉的 iepTok 文件）與新的雜湊
function regenTok(R,local,pk){R.tokH=R.tokH||{};const old=R.tokH[pk]||'',t=token(),h=sha256hex(t);local[pk]=[t,h];R.tokH[pk]=h;return {old,h,t};}
// 安全規則的上限：一份連結最多 400 個節次、80 位學生；到期最多 120 天後。超過的列出來（發布前先擋）
const PUB_MAX={keys:400,stu:80,days:120};
function pubLimits(D,R,now){const out=[],list=webPeople(D,R),lim=(now||Date.now())+PUB_MAX.days*864e5;
  list.forEach(o=>{if(o.keys.length>PUB_MAX.keys)out.push({k:o.k,name:o.name,what:'keys',n:o.keys.length,max:PUB_MAX.keys});
    if(o.meets.length>PUB_MAX.stu)out.push({k:o.k,name:o.name,what:'stu',n:o.meets.length,max:PUB_MAX.stu});});
  const e=expMs(R);if(e&&e>lim)out.push({what:'due',n:Math.ceil((e-(now||Date.now()))/864e5),max:PUB_MAX.days});
  return out;}
function pubLimitText(x){return x.what==='keys'?(x.name+'：要回覆的節次有 '+x.n+' 個，一份連結最多 '+x.max+' 個。請縮短日期範圍或少勾幾節'):
  x.what==='stu'?(x.name+'：要回覆 '+x.n+' 位學生的會議，一份連結最多 '+x.max+' 位。請把這次調查拆成兩次'):
  ('回覆期限在 '+x.n+' 天後，連結最多只能開 '+x.max+' 天。請把回覆期限提早');}
// 公開頁上的「有課」只寫種類，不寫組別名稱、不寫別的學生
function shortBusy(why){why=String(why||'');return /資源班上課/.test(why)?'資源班課':/原班上課/.test(why)?'原班課':/IEP/.test(why)?'已有會議':/不排課/.test(why)?'不排課':'有事';}
// 寫到 iepTok/{鑰匙的雜湊} 的公開內容（app 另外加上 exp 時間戳記、r 調查 id、pk 出席者代號；Function 只回傳公開欄位）
function publicDoc(D,R,o,busy){const pk=o.k,keys=o.keys,b={};keys.forEach(k=>{const w=busy&&busy[pk]&&busy[pk][k];if(w)b[k]=shortBusy(w);});
  const pids=[...new Set(keys.map(k=>splitKey(k)[1]))],ps=D.periods.filter(p=>pids.includes(p.id)).map(p=>({id:p.id,n:p.name,t:pad(p.start)+'–'+pad(p.end)}));
  const role=o.meets.map(x=>x.role).join('、');
  return {v:1,who:o.teacher?'t':'p',once:o.teacher?0:1,name:salute(o.name,role,o.teacher),title:String(D.title||''),round:String(R.name||''),kind:String(R.kind||KINDS[0]),
    d1:R.d1||'',d2:R.d2||'',due:R.due||'',host:hostLabel(D,R),keys:keys.slice(),ps,busy:b,
    stu:o.meets.map(x=>({c:stuShow(x.s,R.priv==='mask'?'mask':'cls'),r:x.role,q:x.req?1:0,cm:x.cm})),
    keep:String(R.keep||'會議時間排定後由特教組刪除，最晚保留到本學期結束'),expMs:expMs(R)};}
// 讀回老師在手機上送出的回覆：勾的節次＝可，沒勾的＝不可；只收比上次新的
function applyWeb(R,o,resp){if(!resp||!resp.at||!Array.isArray(resp.free))return false;R.web=R.web||{};const prev=R.web[o.k];
  if(prev&&prev.at>=resp.at)return false;const free=new Set(resp.free.map(String));
  o.keys.forEach(k=>record(R,o.k,k,free.has(k)?'y':'n'));R.web[o.k]={at:+resp.at,note:String(resp.note||'').slice(0,300)};return true;}
// 公開頁用的格子：每一天一列，每節一格
function webGrid(doc,free){const keys=new Set(doc.keys||[]),dates=[...new Set((doc.keys||[]).map(k=>splitKey(k)[0]))].sort();free=free||new Set();
  return dates.map(d=>({date:d,label:fmtDate(d),cells:(doc.ps||[]).filter(p=>keys.has(key(d,p.id))).map(p=>{const k=key(d,p.id);return {k,n:p.n,t:p.t,busy:(doc.busy||{})[k]||'',on:free.has(k)};})}));}
// 預設勾起來的：上次送出的那些；沒送過一律不勾，讓老師自己點有空的節次（已知有課的會先標灰，仍可以點）
function webInit(doc){return new Set(Array.isArray(doc.free)?doc.free:[]);}
// 回覆情形：誰填了（線上或紙本）、哪幾場必要的人都回了
function progress(D,R){const list=consolidate(D,R,{all:true}),done=new Map();
  list.forEach(o=>{const web=R.web&&R.web[o.k],a=R.ans[o.k]||{},paper=o.keys.length&&o.keys.every(k=>a[k]);done.set(o.k,web?'web':paper?'paper':'');o.done=done.get(o.k);o.at=web?web.at:0;o.note=web?web.note:'';});
  const meets=R.meets.map(m=>{const wait=m.p.filter(x=>x[2]&&!done.get(x[0])).map(x=>pName(D,R,x[0]));return {m,ready:!wait.length,wait};});
  return {people:list,meets,ready:meets.filter(x=>x.ready).length};}
function remindText(D,R,o,url){const n=o.meets.length,first=o.meets[0];
  return salute(o.name,o.meets.map(x=>x.role).join('、'),o.teacher)+'您好：提醒您填寫 IEP 會議時間調查'+(first?'（學生 '+stuShow(first.s,'cls')+(n>1?' 等 '+n+' 位':'')+'）':'')+
    '，請'+(R.due?'於 '+fmtDate(R.due)+' 前':'儘快')+'打開連結，點選您有空的節次：'+url+'　謝謝！'+(hostLabel(D,R)?'（'+hostLabel(D,R)+'）':'');}

const IEP={token,tokHash,sha256hex,HASH_RE,TOKEN_RE,setRange,expMs,webPeople,ensureTokens,migrateTok,linkTok,regenTok,pubLimits,pubLimitText,PUB_MAX,shortBusy,publicDoc,applyWeb,webGrid,webInit,progress,remindText,KINDS,stuShow,salute,slipItems,quickMeet,ROLES,DEF_REQ,ANS,W,ensure,round,normRound,newRound,addMeet,delMeet,derive,rederive,addPerson,addOther,removePerson,setReq,subjTeachers,subjOptions,
  tKey,pName,isTeacher,stuOf,stuLabel,key,splitKey,keysOf,slotInfo,fmtDate,dateRange,genSlots,sortSlots,overlap,ctxOf,busyOf,
  record,fillRest,status,cycle,meetSlots,consolidate,grid,rank,schedule,applyPlan,conflicts,crossConflicts,notices,
  hostId,hostLabel,mineStu,ownRounds,canEdit,invited,addMeetAs,newRoundAs,selfAnswer};
if(typeof module!=='undefined'&&module.exports)module.exports=IEP;
else root.IEP=IEP;
})(typeof window!=='undefined'?window:globalThis);

/* ═════════════ 畫面（只在瀏覽器）：IEP 會議（管理者，全部）與「我的 IEP」（老師，只有自己的） ═════════════
   三個分頁：調查（①建立 ②名單 ③連結與 QR ④回覆）、排定與通知、直接開會；老師多一個「填空堂」（別人邀請我的會議）。
   用到 app.js、cloud.js、checkin.js 的全域（D、M、ST、ROOM、save、render、go、esc、toast、CLOUD…），都是用到時才找。
   teacher.js 在 app.js 之後呼叫 IEP.ui.install()，把 PAGES.iep 換成這裡的版本，並登記 PAGES.me_iep。
   事件用 data-ia（點擊）／data-ic（改值），不和 app.js 舊的 IEP 畫面（data-a／data-c）互相觸發。 */
(function(){
if(typeof document==='undefined'||typeof window==='undefined'||!window.IEP)return;
const IEP=window.IEP;
const U={step:{},cur:{},cm:'',per:4,priv:'full',pm:'qr',nm:'cut',all:false,only:false,qr:'',qk:'',open:0,un:{},pullAt:0,q:null,free:{}};
let SC='';   // ''＝管理者（全部）；老師 id＝只看他開的調查、只能放他個管的學生
const E=s=>esc(s);
const attrs=o=>Object.keys(o||{}).map(k=>' data-'+k+'="'+esc(o[k])+'"').join('');
const A=(a,o)=>' data-ia="'+a+'"'+attrs(o);
const C=(a,o)=>' data-ic="'+a+'"'+attrs(o);
const SEL=(c,o,list,cur)=>'<select'+C(c,o)+'>'+list.map(x=>{const v=Array.isArray(x)?x[0]:x,n=Array.isArray(x)?x[1]:x;return '<option value="'+esc(v)+'"'+(String(v)===String(cur)?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</select>';
const RAW=(id,list)=>'<select id="'+esc(id)+'">'+list.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select>';
const out=h=>{document.getElementById('page').innerHTML=h;};
const ymdNow=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const stuSort=(a,b)=>typeof sortStu==='function'?sortStu(a||{},b||{}):0;
const ttl=()=>esc(D.title||'');
function rounds(){return IEP.ownRounds(D,SC,0);}
function curR(){const rs=rounds(),id=SC?U.cur[SC]:D.iep.cur;return rs.find(r=>r.id===id)||rs[rs.length-1]||null;}
function setCur(id){if(SC)U.cur[SC]=id;else D.iep.cur=id;}
function findM(mid){for(const R of IEP.ownRounds(D,SC)){const m=R.meets.find(x=>x.id===mid);if(m)return {R,m};}return {};}
function busyOf(R){try{return IEP.busyOf(D,R,{M,slot:ST.slot,room:ROOM});}catch(e){return {};}}
function cloudOK(){return typeof cloudState!=='undefined'&&cloudState==='on'&&!!(CLOUD&&CLOUD.db&&CLOUD.user)&&!isRO();}
// 連結的鑰匙只存在發布的那台電腦：localStorage「rc-iep-tok」＝{調查 id: {出席者代號: [鑰匙, 雜湊]}}（共用資料只有雜湊）
const LTKEY='rc-iep-tok';let LT=null;
function ltAll(){if(!LT){try{LT=JSON.parse(localStorage.getItem(LTKEY))||{};}catch(e){LT={};}if(!LT||typeof LT!=='object')LT={};}return LT;}
function ltRound(rid){const a=ltAll();return a[rid]=a[rid]&&typeof a[rid]==='object'?a[rid]:{};}
function ltSave(){const a=ltAll();Object.keys(a).forEach(k=>{if(!a[k]||!Object.keys(a[k]).length)delete a[k];});
  try{if(Object.keys(a).length)localStorage.setItem(LTKEY,JSON.stringify(a));else localStorage.removeItem(LTKEY);}catch(e){}}
function ltDrop(rid){const a=ltAll();delete a[rid];ltSave();}
// 舊資料把鑰匙存在共用資料裡：搬到這台電腦，共用資料只留雜湊（檢視權限不能改共用資料，就不搬）
function migrateAll(){if(typeof isRO==='function'&&isRO())return;let ch=false;
  ((D.iep&&D.iep.rounds)||[]).forEach(R=>{if(IEP.migrateTok(R,ltRound(R.id)))ch=true;});if(ch){ltSave();save();}}
function urlOf(R,pk){const t=R&&IEP.linkTok(R,ltRound(R.id),pk);return t?location.origin+location.pathname.replace(/[^/]*$/,'')+'iep.html?k='+t:'';}
function keep(){save();render();}
function host(R){return IEP.hostLabel(D,R)||(SC?'':'特教組');}
function empty(t,btn){return '<div class="iepempty"><span>'+E(t)+'</span>'+(btn||'')+'</div>';}

/* ── 共用：選調查、步驟列 ── */
function pick(R){const rs=rounds();
  return '<div class="bar iepui">'+SEL('pick',{},rs.map(r=>[r.id,r.name||'未命名的調查']),R&&R.id)+'<button class="b"'+A('newR')+'>新增調查</button>'+(R?'<button class="b danger"'+A('delR')+'>刪除</button>':'')+'</div>';}
const STEPS=['建立','名單','連結與 QR','回覆'],NUM='①②③④';
function steps(n){return '<nav class="iepsteps iepui">'+STEPS.map((t,i)=>'<button class="'+(i+1===n?'on':'')+'"'+A('step',{n:i+1})+'><i>'+NUM[i]+'</i>'+E(t)+'</button>').join('')+'</nav>';}
function next(n){return '<div class="bar iepui iepnext">'+(n<4?'<button class="b"'+A('step',{n:n+1})+'>下一步：'+NUM[n]+' '+E(STEPS[n])+'</button>':'<button class="b"'+A('goPlan')+'>下一步：排定與通知</button>')+'</div>';}

/* ── 調查 ── */
function vSurvey(){const R=curR();if(!R){out(empty('還沒有調查','<button class="b pri"'+A('newR')+'>新增調查</button>'));return;}
  const n=U.step[SC]||1;out(pick(R)+steps(n)+[s1,s2,s3,s4][n-1](R)+next(n));if(n===3)drawQR();}
function s1(R){const ps=R.ps||[],hid=IEP.hostId(D,R);
  let h='<div class="iepcard"><h4>基本資料</h4><div class="iepf">'+
    '<span>名稱</span><input type="text" value="'+E(R.name)+'"'+C('rset',{f:'name'})+'>'+
    '<span>會議</span>'+SEL('rset',{f:'kind'},IEP.KINDS,R.kind||IEP.KINDS[0])+
    '<span>回覆期限</span><input type="date" value="'+E(R.due)+'"'+C('rset',{f:'due'})+'>'+
    '<span>承辦</span>'+(hid||SC?'<span class="iepv">'+E(IEP.hostLabel(D,R))+'</span>':'<input type="text" value="'+E(R.host||'')+'" placeholder="特教組"'+C('rset',{f:'host'})+'>')+
    '<span>地點</span><input type="text" value="'+E(R.rooms.join('、'))+'" placeholder="會議室、資源教室一"'+C('rooms')+'>'+
    '</div><details class="more"><summary>線上頁與家長</summary><div class="iepf">'+
    '<span>學生顯示</span>'+SEL('rset',{f:'priv'},[['cls','班級座號'],['mask','班級座號＋王○明']],R.priv||'cls')+
    '<span>家長</span><label class="iepchk"><input type="checkbox"'+(R.par?' checked':'')+C('rset',{f:'par'})+'> 家長、專業人員也發連結</label>'+
    '<span>保存期間</span><input type="text" value="'+E(R.keep||'')+'" placeholder="排定後刪除，最晚到學期結束"'+C('rset',{f:'keep'})+'>'+
    '</div></details></div>';
  h+='<div class="iepcard"><h4>日期與節次<small>'+R.slots.length+' 個時段</small></h4><div class="bar">'+
    '<input type="date" id="iuD1" value="'+E(R.d1||'')+'"'+C('range')+' aria-label="開始日期"> – <input type="date" id="iuD2" value="'+E(R.d2||'')+'"'+C('range')+' aria-label="結束日期"></div><div>'+
    D.periods.map(p=>'<label class="iepchk"><input type="checkbox" class="iups" value="'+E(p.id)+'"'+(ps.includes(p.id)?' checked':'')+C('range')+'> '+E(p.name)+' <small class="dim">'+E(p.start)+'</small></label>').join('')+'</div></div>';
  const S=IEP.mineStu(D,SC).slice().sort(stuSort).filter(s=>SC||!U.cm||s.caseMgr===U.cm),inR=new Set(R.meets.map(m=>m.s)),by={};S.forEach(s=>{(by[s.cls]=by[s.cls]||[]).push(s);});
  const cms=[...new Set(D.students.map(s=>s.caseMgr).filter(Boolean))];
  h+='<div class="iepcard"><h4>學生<small>已選 '+R.meets.length+' 位</small></h4><div class="bar">'+
    (SC?'':'<label class="note" style="margin:0">個管 '+SEL('cmf',{},[['','全部']].concat(cms.map(id=>[id,IEP.pName(D,null,'t:'+id)])),U.cm)+'</label>')+
    (S.length?'<button class="b sm"'+A('stuAll')+'>全選</button><button class="b sm"'+A('stuNone')+'>全不選</button>':'')+'</div>'+
    Object.keys(by).sort().map(c=>'<div class="iepcls"><b>'+E(c)+'</b>'+by[c].map(s=>'<label class="iepchk"><input type="checkbox"'+(inR.has(s.id)?' checked':'')+C('stu',{s:s.id})+'> '+E(s.seat)+' '+E(s.name)+'</label>').join('')+'</div>').join('')+
    (S.length?'':'<p class="note">'+(SC?'還沒有你個管的學生':'名冊還沒有學生')+'</p>')+'</div>';
  if((R.pub||[]).length)h+='<p class="note">已發布：改了之後到 ③ 按「更新線上內容」</p>';
  if(!SC)h+=settings();
  return h;}
function settings(){const c=D.iep.cfg,cls=[...new Set(D.students.map(s=>String(s.cls)))].sort();
  return '<details class="more iepui"><summary>會議設定：必要出席、行政、導師</summary>'+
    '<h4>必要出席的身分</h4><div>'+IEP.ROLES.map(r=>'<label class="iepchk"><input type="checkbox"'+(c.req[r]?' checked':'')+C('req',{r})+'> '+E(r)+'</label>').join('')+'</div>'+
    '<p><label class="iepchk"><input type="checkbox"'+(c.subj?' checked':'')+C('subj')+'> 邀請資源班科目的原班任課老師</label></p>'+
    '<h4>每場都邀請</h4><table class="ed"><tr><th>姓名</th><th>職稱</th><th>必要</th><th></th></tr>'+c.admin.map((a,i)=>'<tr><td>'+E(IEP.pName(D,null,a[0]))+'</td><td><input type="text" class="w5" value="'+E(a[1]||'')+'"'+C('adm',{i,f:1})+'></td><td><input type="checkbox"'+(a[2]?' checked':'')+C('adm',{i,f:2})+' aria-label="必要"></td><td><button class="x" title="移除"'+A('admDel',{i})+'>✕</button></td></tr>').join('')+'</table>'+
    '<div class="bar"><select id="iuAdmT">'+tOpts('','res')+'</select><input type="text" class="w5" id="iuAdmN" placeholder="或打姓名"><input type="text" class="w5" id="iuAdmR" placeholder="職稱"><button class="b sm"'+A('admAdd')+'>加入</button></div>'+
    '<h4>導師</h4><datalist id="iuTN">'+D.teachers.map(t=>'<option value="'+E(t.name)+'">').join('')+'</datalist>'+
    '<table class="ed"><tr><th>班級</th><th>導師</th></tr>'+cls.map(k=>'<tr><td>'+E(k)+'</td><td><input type="text" class="w5" list="iuTN" value="'+E(D.classHead[k]||'')+'"'+C('hr',{c:k})+' aria-label="'+E(k)+' 導師"></td></tr>').join('')+'</table></details>';}
// 一場會議的出席名單
function PE(R,m){const all=IEP.subjOptions(D,m.s),opts=all.filter(o=>!m.p.some(x=>x[0]===o.k)),mid=m.id;
  return '<div class="scroll"><table class="ed"><tr><th>姓名</th><th>身分</th><th>必要</th><th></th></tr>'+m.p.map((x,i)=>'<tr><td>'+(x[0][0]==='x'?'<input type="text" class="w5" value="'+E(IEP.pName(D,R,x[0]))+'"'+C('pname',{m:mid,i})+' aria-label="姓名">':E(IEP.pName(D,R,x[0])))+'</td>'+
    '<td><input type="text" class="w8" value="'+E(x[1])+'"'+C('prole',{m:mid,i})+' aria-label="身分"></td><td><input type="checkbox"'+(x[2]?' checked':'')+C('preq',{m:mid,i})+' aria-label="必要出席"></td>'+
    '<td><button class="x" title="移除"'+A('pdel',{m:mid,i})+'>✕</button></td></tr>').join('')+'</table></div>'+
    '<div class="bar"><select id="iuT_'+E(mid)+'" aria-label="老師">'+tOpts('','res')+'</select>'+RAW('iuTR_'+mid,['資源班','任課','導師','行政','專業'])+'<button class="b sm"'+A('paddT',{m:mid})+'>加入老師</button>'+
    '<input type="text" class="w5" id="iuO_'+E(mid)+'" placeholder="家長或其他人">'+RAW('iuOR_'+mid,['家長','專業','行政','其他'])+'<button class="b sm"'+A('paddO',{m:mid})+'>加入</button>'+
    '<button class="b sm"'+A('prederive',{m:mid})+'>照名冊重新帶入</button></div>'+
    (opts.length?'<div class="iepchips">'+opts.map(o=>'<button class="b sm"'+A('paddK',{m:mid,j:all.indexOf(o)})+'>＋'+E(o.sj+' '+o.name)+'</button>').join('')+'</div>':'');}
function s2(R){if(!R.meets.length)return empty('還沒有學生','<button class="b"'+A('step',{n:1})+'>選學生</button>');
  let h='';const noHr=[...new Set(R.meets.map(m=>{const s=IEP.stuOf(D,m.s);return s&&!D.classHead[String(s.cls)]?String(s.cls):'';}).filter(Boolean))];
  if(noHr.length)h+='<p class="note iepwarn">還沒設定導師：'+E(noHr.join('、'))+'</p>';
  R.meets.slice().sort((a,b)=>stuSort(IEP.stuOf(D,a.s),IEP.stuOf(D,b.s))).forEach(m=>{const s=IEP.stuOf(D,m.s);
    h+='<div class="iepcard"><h4>'+E(IEP.stuLabel(s))+'<small>個管 '+E(s&&s.caseMgr?IEP.pName(D,R,'t:'+s.caseMgr):'未指定')+'・'+m.p.length+' 人，必要 '+m.p.filter(x=>x[2]).length+'</small></h4>'+PE(R,m)+'</div>';});
  return h;}
// ③ 連結與 QR
function slipQR(R,o){const url=urlOf(R,o.k),max=7,ms=o.meets.slice(0,max);
  return '<div class="slip"><div class="hd"><b>'+E(R.kind||'IEP 會議')+'時間調查</b><span>'+ttl()+'</span></div><div class="qs"><div class="qt">'+
    '<div class="to">'+E(IEP.salute(o.name,o.meets.map(x=>x.role).join('、'),o.teacher))+' 您好：</div>'+
    '<p>請用手機掃描右邊的 QR Code，點選您<b>有空</b>的節次後送出。</p>'+
    '<p>學生：'+ms.map(x=>E(IEP.stuShow(x.s,U.priv))).join('、')+(o.meets.length>max?' 等 '+o.meets.length+' 位':'')+'</p>'+
    '<p>調查範圍：'+E(IEP.fmtDate(R.d1))+'～'+E(IEP.fmtDate(R.d2))+'</p><p>請於 <b>'+E(IEP.fmtDate(R.due))+'</b> 前填寫'+(host(R)?'　'+E(host(R)):'')+'</p>'+
    '<p class="url">'+E(url)+'</p></div><div class="iepqr" data-t="'+E(url)+'"></div></div><span class="cut">✂</span></div>';}
function cut(items,fn){const n=U.per===3?3:4;let h='';for(let i=0;i<items.length;i+=n)h+='<div class="pg iepcut n'+n+'">'+items.slice(i,i+n).map(fn).join('')+'</div>';return h;}
function paper(R,o,busy){const G=IEP.grid(D,o.keys),b=busy[o.k]||{},bz=w=>/上課/.test(w)?'有課':/IEP/.test(w)?'已有會議':'已登記有事';
  return '<div class="pg iepA4"><h2>'+ttl()+'　'+E(R.kind||'IEP 會議')+'時間調查表</h2><p>'+E(IEP.salute(o.name,o.meets.map(x=>x.role).join('、'),o.teacher))+' 您好：</p>'+
    '<p>下列學生的會議需要您參與。請在您可以的時段打「○」、不行的打「╳」，'+(R.due?'於 '+E(IEP.fmtDate(R.due))+' 前':'')+'交回'+E(host(R)||'個管老師')+'。標「有課」的節次如果可以調課，仍請打○。</p>'+
    '<table><tr><th>班級座號</th><th>學生</th><th>個管老師</th><th>您的身分</th><th>出席</th></tr>'+o.meets.map(x=>'<tr><td>'+E(IEP.stuShow(x.s,'cls'))+'</td><td>'+E(U.priv==='full'?(x.s?x.s.name:''):IEP.stuShow(x.s,U.priv).split(' ')[1]||'')+'</td><td>'+E(x.cm)+'</td><td>'+E(x.role)+'</td><td>'+(x.req?'必要':'邀請')+'</td></tr>').join('')+'</table>'+
    '<table><tr><th>日期</th>'+G.cols.map(c=>'<th>'+E(c.name)+'<span class="bz">'+E(c.time)+'</span></th>').join('')+'</tr>'+
    G.dates.map(d=>'<tr><th>'+E(d.label)+'</th>'+G.cols.map(c=>{const k=G.cell(d.date,c.p);return k?'<td>'+(b[k]?'<span class="bz">'+bz(b[k])+'</span>':'')+'</td>':'<td class="x"></td>';}).join('')+'</tr>').join('')+'</table>'+
    '<p>備註：<span class="ln" style="min-width:30em"></span></p><p class="sg">填表人：<span class="ln"></span></p></div>';}
function s3(R){const busy=busyOf(R),list=IEP.webPeople(D,R),pg=IEP.progress(D,R),st=new Map(pg.people.map(o=>[o.k,o.done])),pub=(R.pub||[]).length;let h='';
  const noKey=pub?list.filter(o=>R.tokH&&R.tokH[o.k]&&!urlOf(R,o.k)):[];
  if(!cloudOK())h+='<p class="note iepui">'+(typeof isRO==='function'&&isRO()?'檢視權限不能發布連結':'登入雲端共用後才能發布連結')+'；也可以印紙本時段表。</p>';
  const miss=[!R.due&&'回覆期限',!R.slots.length&&'日期與節次',!R.meets.length&&'學生'].filter(Boolean);
  if(miss.length)h+='<p class="note iepwarn iepui">還沒填：'+E(miss.join('、'))+'</p>';
  const over=IEP.pubLimits(D,R);if(over.length)h+='<p class="note iepwarn iepui">'+over.map(x=>E(IEP.pubLimitText(x))).join('<br>')+'</p>';
  if(noKey.length)h+='<p class="note iepwarn iepui">這台電腦沒有 '+noKey.length+' 位的連結（在別台電腦發布的，連結的鑰匙只存在那台電腦）。要在這裡發，請按「重新產生連結」：會換新的連結，舊的立刻失效。'+
    (noKey.length>1&&cloudOK()?' <button class="b sm"'+A('regenAll')+'>全部重新產生</button>':'')+'</p>';
  h+='<div class="bar iepui"><button class="b pri"'+A('publish')+(cloudOK()&&!miss.length?'':' disabled')+'>'+(pub?'更新線上內容':'發布連結')+'</button>'+
    (pub?'<button class="b danger"'+A('unpub')+(cloudOK()?'':' disabled')+'>結束調查</button><span class="note" style="margin:0">已發布 '+pub+' 份'+(R.pubAt?'・'+E(new Date(R.pubAt).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})):'')+'</span>':'')+'</div>';
  h+='<div class="scroll iepui"><table class="ed"><tr><th>姓名</th><th>身分</th><th>學生</th><th>狀態</th><th></th></tr>'+list.map(o=>{const url=pub?urlOf(R,o.k):'';
    return '<tr><td>'+E(o.name)+'</td><td class="dim">'+E([...new Set(o.meets.map(x=>x.role.split('、')[0]))].join('、'))+'</td><td class="dim">'+E(o.meets.map(x=>IEP.stuShow(x.s,'cls')).join('、'))+'</td><td>'+(st.get(o.k)?'<span class="iepok">填了</span>':'還沒填')+'</td>'+
      '<td class="nw">'+(url?'<button class="b sm"'+A('copyUrl',{k:o.k})+'>複製連結</button><button class="b sm"'+A('showQR',{k:o.k})+'>QR</button>':pub&&R.tokH&&R.tokH[o.k]?'<button class="b sm"'+A('regen',{k:o.k})+(cloudOK()?'':' disabled')+'>重新產生連結</button>':'')+'</td></tr>'+
      (U.qr===o.k&&url?'<tr><td colspan="5"><div class="iepqr big" data-t="'+E(url)+'"></div></td></tr>':'');}).join('')+'</table></div>';
  const pk=list.filter(o=>(!U.only||!st.get(o.k))&&(U.pm!=='qr'||!pub||urlOf(R,o.k)));
  h+='<h3 class="iepui">列印</h3><div class="bar iepui">'+SEL('iv',{f:'pm'},[['qr','QR 小單'],['paper','紙本時段表（A4）']],U.pm)+
    (U.pm==='qr'?SEL('iv',{f:'per'},[[4,'一張裁 4'],[3,'一張裁 3']],U.per):'')+SEL('iv',{f:'priv'},[['full','班級座號＋姓名'],['cls','只印班級座號'],['mask','姓名遮字']],U.priv)+
    '<label class="iepchk"><input type="checkbox"'+(U.only?' checked':'')+C('iv',{f:'only'})+'> 只印還沒填的</label><button class="b"'+A('print')+'>印出</button><span class="note" style="margin:0">'+pk.length+' 人</span></div>';
  h+=U.pm==='qr'&&!pub?'<p class="note iepui">發布後才有 QR</p>':'<div id="outArea">'+(U.pm==='qr'?cut(pk,o=>slipQR(R,o)):pk.map(o=>paper(R,o,busy)).join(''))+'</div>';
  return h;}
function drawQR(){const els=[...document.querySelectorAll('#page .iepqr')];if(!els.length)return;
  libLoad(()=>window.QRCode,'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',QR_SRI).then(()=>{els.forEach(el=>{el.innerHTML='';new QRCode(el,{text:el.dataset.t,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});});})
    .catch(()=>{els.forEach(el=>{el.textContent='QR Code 載入失敗，請檢查網路';});});}
// 發布：每位出席者一份 iepTok/{鑰匙的雜湊}；老師自己開的調查，承辦顯示老師姓名（公開頁不出現老師 id）
const PUB_FIELDS=['v','who','once','name','title','round','kind','d1','d2','due','host','keys','ps','busy','stu','keep','exp','r','pk','by','pubAt'];
function pubDoc(R,o,busy){const F=firebase.firestore,d=IEP.publicDoc(D,R,o,busy);d.exp=F.Timestamp.fromMillis(d.expMs);delete d.expMs;d.r=R.id;d.pk=o.k;d.by=CLOUD.user.email;d.pubAt=F.FieldValue.serverTimestamp();return d;}
// 發布：先檢查安全規則的上限；寫到一半失敗時，已經寫上去的記進 R.pub（「結束調查」才刪得到）
async function publish(){const R=curR();if(!R||!cloudOK()||!canR(R))return;
  if(IEP.expMs(R)<Date.now()){toast('回覆期限已過，請先改期限');return;}
  const over=IEP.pubLimits(D,R);if(over.length){listDlg('沒有發布：超過一份連結的上限','',[{h:'請先修改',items:over.map(IEP.pubLimitText)}]);return;}
  const local=ltRound(R.id),list=IEP.ensureTokens(D,R,local),busy=busyOf(R),db=CLOUD.db,kept=new Set(list.map(o=>R.tokH[o.k])),done=[];ltSave();
  try{for(const o of list){const h=R.tokH[o.k];await db.doc('iepTok/'+h).set(pubDoc(R,o,busy),{mergeFields:PUB_FIELDS});done.push(h);}
    const left=[];for(const h of (R.pub||[]))if(!kept.has(h))await db.doc('iepTok/'+h).delete().catch(()=>{left.push(h);});
    Object.keys(R.tokH).forEach(k=>{if(!list.some(o=>o.k===k)){delete R.tokH[k];delete local[k];}});ltSave();
    R.pub=[...kept].concat(left);R.pubAt=Date.now();keep();toast('已發布 '+list.length+' 份'+(left.length?'；有 '+left.length+' 份舊連結沒刪掉，按「結束調查」會再刪一次':''));}
  catch(e){R.pub=[...new Set((R.pub||[]).concat(done))];if(done.length&&!R.pubAt)R.pubAt=Date.now();keep();
    toast('發布到一半失敗（寫上去 '+done.length+'/'+list.length+' 份）：'+(e.code||e.message)+'。請再按一次；要撤回請按「結束調查」');}}
// 結束調查：刪掉所有發布過的 iepTok 與線上回覆；有刪不掉的就留在 R.pub，下次再刪
async function unpub(R,quiet){if(!R)return true;migrateAll();
  if(!(R.pub||[]).length){R.tokH={};ltDrop(R.id);return true;}
  if(!cloudOK()){toast('要先登入雲端共用');return false;}
  const left=[];for(const h of R.pub){try{await CLOUD.db.doc('iepTok/'+h).delete();}catch(e){left.push(h);}}
  if(left.length){R.pub=left;keep();toast('有 '+left.length+' 份連結沒刪掉，請稍後再按一次「結束調查」');return false;}
  try{const rs=await CLOUD.db.collection('iepResp/'+R.id+'/r').get();for(const d of rs.docs)await d.ref.delete();}
  catch(e){R.pub=[];keep();toast('連結都失效了，但線上回覆沒刪掉：'+(e.code||e.message));return false;}
  R.pub=[];R.tokH={};ltDrop(R.id);if(!quiet)keep();toast('舊連結都失效了');return true;}
// 重新產生連結（這台電腦沒有鑰匙時）：寫一份新的 iepTok、刪掉舊的；舊連結立刻失效。刪不掉的舊文件留在 R.pub，結束調查時再刪
async function regen(R,keys){if(!R||!cloudOK()||!canR(R))return;const local=ltRound(R.id),busy=busyOf(R),ppl=IEP.webPeople(D,R).filter(o=>keys.includes(o.k)&&R.tokH&&R.tokH[o.k]);
  let n=0,left=0;
  for(const o of ppl){const prev=local[o.k],r=IEP.regenTok(R,local,o.k);
    try{await CLOUD.db.doc('iepTok/'+r.h).set(pubDoc(R,o,busy),{mergeFields:PUB_FIELDS});}
    catch(e){R.tokH[o.k]=r.old;if(prev)local[o.k]=prev;else delete local[o.k];toast('重新產生失敗：'+(e.code||e.message));break;}
    let gone=true;if(r.old&&r.old!==r.h)try{await CLOUD.db.doc('iepTok/'+r.old).delete();}catch(e){gone=false;left++;}
    R.pub=(R.pub||[]).filter(h=>gone?h!==r.old:true).concat([r.h]);n++;}
  ltSave();keep();if(n)toast('已重新產生 '+n+' 個連結，舊的連結失效了'+(left?'（有 '+left+' 份舊連結沒刪掉，結束調查時會再刪）':''));}
async function pull(R,quiet){if(!R||!cloudOK()||!(R.pub||[]).length)return;U.pullAt=Date.now();let n=0;
  try{const by=new Map(IEP.webPeople(D,R).map(o=>[o.k,o])),rs=await CLOUD.db.collection('iepResp/'+R.id+'/r').get();
    rs.forEach(d=>{const x=d.data(),o=by.get(x.pk);if(o&&IEP.applyWeb(R,o,{free:x.free,note:x.note,at:x.at&&x.at.toMillis?x.at.toMillis():+x.at||0}))n++;});}
  catch(e){if(!quiet)toast('抓取失敗：'+(e.code||e.message));return;}
  if(n)save();if(page==='iep'||page==='me_iep')render();if(!quiet||n)toast(n?'收到 '+n+' 份新的回覆':'沒有新的回覆');}
// ④ 回覆
function s4(R){if(cloudOK()&&(R.pub||[]).length&&Date.now()-U.pullAt>60000)setTimeout(()=>pull(R,true),0);
  const pg=IEP.progress(D,R),wait=pg.people.filter(o=>!o.done&&(o.teacher||R.par)),pub=(R.pub||[]).length;
  let h='<div class="bar"><span class="stat">填了 <b>'+pg.people.filter(o=>o.done).length+'</b> / '+pg.people.length+' 人</span><span class="stat">可以排：<b>'+pg.ready+'</b> / '+pg.meets.length+' 場</span>'+
    (cloudOK()&&pub?'<button class="b"'+A('pull')+'>抓取回覆</button>':'')+(wait.length&&pub?'<button class="b"'+A('copyAll')+'>複製提醒（'+wait.length+'）</button>':'')+'</div>';
  h+='<div class="scroll"><table class="ed"><tr><th>姓名</th><th>會議</th><th>狀態</th><th>備註</th><th></th></tr>'+pg.people.map(o=>'<tr><td>'+E(o.name)+'</td><td class="dim">'+o.meets.length+' 場'+(o.meets.some(x=>x.req)?'・必要':'')+'</td>'+
    '<td>'+(o.done==='web'?'<span class="iepok">填了</span> <small class="dim">'+E(new Date(o.at).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))+'</small>':o.done==='paper'?'<span class="iepok">填了</span> <small class="dim">手動</small>':'還沒填')+'</td>'+
    '<td class="dim">'+E(o.note||'')+'</td><td class="nw">'+(!o.done&&urlOf(R,o.k)?'<button class="b sm"'+A('copyRem',{k:o.k})+'>複製提醒</button>':'')+'</td></tr>').join('')+'</table></div>';
  const busy=busyOf(R),keys=IEP.keysOf(R),inf=keys.map(k=>IEP.slotInfo(D,k)),sym={y:'○',n:'╳',m:'△'};U.busy=busy;
  h+='<details class="more"'+(U.open?' open':'')+'><summary>手動登錄（紙本、電話）</summary><p class="ieplegend">點格子：○ 可 → ╳ 不可 → △ 不確定 → 空白。「課」＝查到有課、沒回覆</p>'+
    '<div class="scroll"><table class="iepans"><tr><th>姓名</th>'+inf.map(f=>'<th>'+E(IEP.fmtDate(f.date))+'<br>'+E(f.name)+'</th>').join('')+'<th></th></tr>'+
    pg.people.map(o=>{const ks=new Set(o.keys);return '<tr><td class="nm">'+E(o.name)+'</td>'+keys.map(k=>{if(!ks.has(k))return '<td></td>';const s=IEP.status(R,busy,o.k,k);
      return '<td><button class="c '+(s.auto?'a':s.v)+'" title="'+E(s.why||'')+'"'+A('cyc',{k:o.k,s:k})+'>'+(s.auto?'課':sym[s.v]||'')+'</button></td>';}).join('')+
      '<td class="nw"><button class="b sm"'+A('rest',{k:o.k})+'>其餘都可</button></td></tr>';}).join('')+'</table></div></details>';
  return h;}

/* ── 排定與通知 ── */
function vPlan(){const R=curR();if(!R){out(empty('還沒有調查','<button class="b pri"'+A('newR')+'>新增調查</button>'));return;}
  const busy=busyOf(R),pg=IEP.progress(D,R),cf=IEP.conflicts(D,R).concat(IEP.crossConflicts(D,R)),ready=new Map(pg.meets.map(x=>[x.m.id,x]));
  let h=pick(R)+'<div class="bar iepui"><button class="b pri"'+A('run')+(R.meets.length?'':' disabled')+'>排出時間</button><button class="b"'+A('clearPlan')+'>清除沒固定的</button><span class="stat">可以排：<b>'+pg.ready+'</b> / '+pg.meets.length+' 場</span></div>';
  if(cf.length)h+='<div class="probs iepui">'+cf.map(c=>E(c.m)).join('<br>')+'</div>';
  if(!R.meets.length){out(h+empty('還沒有學生','<button class="b"'+A('goStep',{n:1})+'>選學生</button>'));return;}
  h+='<div class="scroll iepui"><table class="ed"><tr><th>學生</th><th>回覆</th><th>時間</th><th>地點</th><th>固定</th><th>情形</th></tr>'+
    R.meets.slice().sort((a,b)=>String(a.at||'~').localeCompare(String(b.at||'~'))).map(m=>{const s=IEP.stuOf(D,m.s),rk=IEP.rank(D,R,m,busy),cur=rk.find(r=>r.k===m.at),rd=ready.get(m.id);
      const opts=[['','（未排）']].concat(rk.map(r=>[r.k,(r.ok?'':'✗ ')+IEP.slotInfo(D,r.k).label+'　'+(r.ok?r.yes+'/'+r.tot+' 人可':r.bad.join('、')+' 不行')]));
      const rooms=[['','（未定）']].concat(R.rooms.map(x=>[x,x]));if(m.room&&!R.rooms.includes(m.room))rooms.push([m.room,m.room]);
      return '<tr><td>'+E(IEP.stuLabel(s))+'</td><td>'+(rd&&rd.ready?'<span class="iepok">齊了</span>':'<small class="dim">等 '+E((rd?rd.wait:[]).join('、'))+'</small>')+'</td><td>'+SEL('at',{m:m.id},opts,m.at||'')+'</td><td>'+SEL('room',{m:m.id},rooms,m.room||'')+'</td>'+
        '<td><input type="checkbox"'+(m.pin?' checked':'')+C('pin',{m:m.id})+' aria-label="固定"></td><td class="dim">'+(U.un[m.id]?'<span class="iepwarn">'+E(U.un[m.id])+'</span>':cur?E([cur.miss.length?'不能來：'+cur.miss.join('、'):'',cur.unk.length?'沒回：'+cur.unk.join('、'):''].filter(Boolean).join('；'))||'都可以':'')+'</td></tr>';}).join('')+'</table></div>';
  out(h+noticeUI(R));}
function noticeUI(R){const fixed=R.meets.filter(m=>m.at);let h='<h3 class="iepui">開會通知</h3>';if(!fixed.length)return h+'<p class="note">排好時間才能印通知</p>';
  h+='<div class="bar iepui">'+SEL('iv',{f:'nm'},[['cut','小通知單'],['sum','安排總表'],['each','每人一張彙整']],U.nm)+
    (U.nm==='cut'?SEL('iv',{f:'per'},[[4,'裁 4'],[3,'裁 3']],U.per):'')+(U.nm!=='sum'?SEL('iv',{f:'priv'},[['full','班級座號＋姓名'],['cls','只印班級座號'],['mask','姓名遮字']],U.priv)+'<label class="iepchk"><input type="checkbox"'+(U.all?' checked':'')+C('iv',{f:'all'})+'> 家長、專業人員也印</label>':'')+
    '<label class="note" style="margin:0">回條交回 <input type="date" value="'+E(R.cdue||'')+'"'+C('rset',{f:'cdue',r:R.id})+'></label><button class="b"'+A('print')+'>印出</button></div>';
  return h+'<div id="outArea">'+notices(R)+'</div>';}
function slipC(x){const t=x.time;
  return '<div class="slip"><div class="hd"><b>'+E(x.kind)+'開會通知</b><span>'+ttl()+'</span></div><div class="to">'+E(x.to)+' 您好：</div>'+
    '<p>學生 <b>'+E(x.stu)+'</b> 的'+E(x.kind)+'訂於：</p><p class="big"><b>'+E(IEP.fmtDate(t.date))+'　'+E(t.custom?'':t.name)+(t.time?'（'+E(t.time)+'）':'')+'</b></p>'+
    '<p>地點：<b>'+(x.room?E(x.room):'<span class="ln"></span>')+'</b>　　個管老師：'+E(x.cm)+'</p><p>敬請'+(x.req?'出席':'撥冗參加')+'。'+(x.host?'　'+E(x.host)+' 敬啟':'')+'</p>'+
    '<div class="rt">回條：□可以出席　□無法出席，原因：<span class="ln"></span><br>簽名：<span class="ln"></span>'+(x.due?'　請於 '+E(IEP.fmtDate(x.due))+' 前交回個管老師':'')+'</div><span class="cut">✂</span></div>';}
function notices(R){
  if(U.nm==='cut')return cut(IEP.slipItems(D,R,{all:U.all,privacy:U.priv}),slipC);
  if(U.nm==='sum'){const ms=R.meets.filter(m=>m.at).sort((a,b)=>a.at.localeCompare(b.at));
    return '<div class="pg iepA4"><h2>'+ttl()+'　'+E(R.kind||'IEP 會議')+'安排表</h2><table><tr><th>日期</th><th>時間</th><th>地點</th><th>學生</th><th>個管</th><th>出席人員</th></tr>'+
      ms.map(m=>{const f=IEP.slotInfo(D,m.at),s=IEP.stuOf(D,m.s);return '<tr><td>'+E(IEP.fmtDate(f.date))+'</td><td>'+E((f.custom?'':f.name+' ')+f.time)+'</td><td>'+E(m.room||'')+'</td><td>'+E(IEP.stuLabel(s))+'</td><td>'+E(s&&s.caseMgr?IEP.pName(D,R,'t:'+s.caseMgr):'')+'</td>'+
        '<td class="l">'+m.p.map(x=>E(IEP.pName(D,R,x[0]))+(x[2]?'':'（邀）')).join('、')+'</td></tr>';}).join('')+'</table></div>';}
  return IEP.notices(D,R,{all:U.all}).map(o=>'<div class="pg iepA4"><h2>'+ttl()+'　'+E(R.kind||'IEP 會議')+'開會通知</h2><p>'+E(IEP.salute(o.name,o.meets.map(x=>x.role).join('、'),o.teacher))+' 您好：</p><p>下列會議時間已經排定，敬請準時出席。</p>'+
    '<table><tr><th>日期</th><th>時間</th><th>地點</th><th>學生</th><th>個管老師</th><th>您的身分</th></tr>'+o.meets.map(x=>{const f=IEP.slotInfo(D,x.m.at);
      return '<tr><td>'+E(IEP.fmtDate(f.date))+'</td><td>'+E((f.custom?'':f.name+' ')+f.time)+'</td><td>'+E(x.m.room||'')+'</td><td>'+E(IEP.stuShow(x.s,U.priv))+'</td><td>'+E(x.cm)+'</td><td>'+E(x.role)+(x.req?'':'（邀請）')+'</td></tr>';}).join('')+'</table>'+
    '<p class="sg">'+E(host(R)||'特教組')+' 敬啟</p></div>').join('');}

/* ── 直接開會（已經知道時間） ── */
function vQuick(){const Q=U.q=U.q||{sid:'',kind:IEP.KINDS[0],date:'',p:'',room:''},qs=IEP.ownRounds(D,SC,1),R=qs.find(r=>r.id===U.qk);
  const S=IEP.mineStu(D,SC).slice().sort(stuSort),cust=Q.p==='*'||/:/.test(Q.p);
  let h='<div class="iepcard iepui"><div class="iepf"><span>學生</span>'+SEL('q',{f:'sid'},[['','（選擇）']].concat(S.map(s=>[s.id,IEP.stuLabel(s)])),Q.sid)+
    '<span>會議</span>'+SEL('q',{f:'kind'},IEP.KINDS,Q.kind)+'<span>日期</span><input type="date" value="'+E(Q.date)+'"'+C('q',{f:'date'})+'>'+
    '<span>時間</span><div>'+SEL('q',{f:'p'},[['','（選擇）']].concat(D.periods.map(p=>[p.id,p.name+' '+p.start+'–'+p.end])).concat([['*','自訂時間']]),cust?'*':Q.p)+
      (cust?' <input type="text" class="w8" placeholder="15:10-16:00" value="'+E(/:/.test(Q.p)?Q.p:'')+'"'+C('q',{f:'pt'})+'>':'')+'</div>'+
    '<span>地點</span><input type="text" value="'+E(Q.room)+'" placeholder="會議室"'+C('q',{f:'room'})+'>'+
    '</div><div class="bar" style="margin:10px 0 0"><button class="b pri"'+A('qgo')+(S.length?'':' disabled')+'>帶入出席名單</button></div></div>';
  if(R){const m=R.meets[0],f=m&&m.at?IEP.slotInfo(D,m.at):null;
    h+='<div class="iepcard iepui"><h4>'+E(R.name)+'<small>'+E(f?f.label+' '+f.time:'')+(m&&m.room?'・'+E(m.room):'')+'</small></h4>'+(m?PE(R,m):'')+'</div>'+noticeUI(R);}
  if(qs.length)h+='<h3 class="iepui">最近的會</h3><div class="scroll iepui"><table class="ed">'+qs.slice().reverse().slice(0,20).map(r=>{const m=r.meets[0];return '<tr><td>'+E(r.name)+'</td><td class="dim">'+E(m&&m.at?IEP.slotInfo(D,m.at).label:'')+'</td><td class="nw"><button class="b sm"'+A('qopen',{r:r.id})+'>開啟</button><button class="x" title="刪除"'+A('qdel',{r:r.id})+'>✕</button></td></tr>';}).join('')+'</table></div>';
  out(h);}

/* ── 填空堂（老師：別人或自己開的調查邀請了我） ── */
function vInv(){const pk='t:'+SC,rs=IEP.invited(D,SC).slice().sort((a,b)=>String(a.due||'~').localeCompare(String(b.due||'~')));
  const list=rs.map(R=>({R,o:IEP.progress(D,R).people.find(x=>x.k===pk)})).filter(x=>x.o&&x.o.keys.length);
  if(!list.length){out(empty('目前沒有要填的會議時間'));return;}
  const t=ymdNow();
  out(list.map(({R,o})=>{const busy=busyOf(R),G=IEP.grid(D,o.keys),b=busy[pk]||{},a=R.ans[pk]||{};
    const F=U.free[R.id]=U.free[R.id]||new Set(o.keys.filter(k=>a[k]==='y'));
    return '<section class="iepcard"><h4>'+E(R.name||R.kind||'IEP 會議')+'<small>'+E([host(R),R.due?IEP.fmtDate(R.due)+' 前':''].filter(Boolean).join('・'))+'</small>'+
      (o.done?'<span class="iepok">已填</span>':R.due&&R.due<t?'<span class="iepwarn">已過期限</span>':'')+'</h4>'+
      '<div class="iepchips">'+o.meets.map(x=>'<span class="iepchip">'+E(IEP.stuShow(x.s,'cls'))+'・'+E(x.role.split('、')[0])+(x.req?'':'（邀）')+'</span>').join('')+'</div>'+
      '<div class="scroll"><table class="iepans iepme"><tr><th></th>'+G.cols.map(c=>'<th>'+E(c.name)+'</th>').join('')+'</tr>'+
      G.dates.map(d=>'<tr><th>'+E(d.label)+'</th>'+G.cols.map(c=>{const k=G.cell(d.date,c.p);if(!k)return '<td></td>';const on=F.has(k),bz=b[k];
        return '<td><button class="c '+(on?'y':bz?'a':'')+'" aria-pressed="'+on+'" title="'+E(bz?IEP.shortBusy(bz):'')+'"'+A('meTog',{r:R.id,s:k})+'>'+(on?'○':bz?IEP.shortBusy(bz).slice(0,2):'')+'</button></td>';}).join('')+'</tr>').join('')+'</table></div>'+
      '<div class="bar"><input type="text" class="iepnote" placeholder="備註（例：可以調課）" value="'+E((R.web&&R.web[pk]&&R.web[pk].note)||'')+'" id="iuN_'+E(R.id)+'"><button class="b"'+A('meSend',{r:R.id})+'>'+(o.done?'更新':'送出')+'</button></div></section>';}).join(''));}

/* ── 事件 ── */
function canR(R){return IEP.canEdit(D,R,SC);}
const ACT={
  step(el){U.step[SC]=+el.dataset.n;render();},
  goStep(el){U.step[SC]=+el.dataset.n;go(page,'survey');},
  goPlan(){go(page,'plan');},
  newR(){const c0=D.iep.cur,R=IEP.newRoundAs(D,SC,{name:'IEP 會議時間調查'});R.kind=IEP.KINDS[0];R.priv='cls';if(!SC)R.host='特教組';else D.iep.cur=c0;
    R.ps=D.periods.filter(p=>!p.extra).map(p=>p.id);setCur(R.id);U.step[SC]=1;save();go(page,'survey');},
  async delR(){const R=curR();if(!canR(R)||!confirm('刪除「'+(R.name||'這次調查')+'」？出席名單和回覆都會刪掉。'))return;
    if((R.pub||[]).length&&!(await unpub(R,true))&&!confirm('線上資料沒有刪掉，連結會到期限才失效。仍要刪除嗎？'))return;
    ltDrop(R.id);
    if(typeof snapshot==='function')snapshot('刪除 IEP 調查之前');D.iep.rounds=D.iep.rounds.filter(r=>r!==R);keep();},
  stuAll(){const R=curR();if(!canR(R))return;IEP.mineStu(D,SC).filter(s=>SC||!U.cm||s.caseMgr===U.cm).forEach(s=>IEP.addMeetAs(D,R,s.id,SC));keep();},
  stuNone(){const R=curR();if(!canR(R))return;if(R.meets.length&&!confirm('移除全部學生？名單的修改也會清掉。'))return;R.meets.slice().forEach(m=>IEP.delMeet(R,m.id));keep();},
  pdel(el){const {R,m}=findM(el.dataset.m);if(!m)return;IEP.removePerson(R,m,m.p[+el.dataset.i][0]);keep();},
  paddT(el){const {R,m}=findM(el.dataset.m);if(!m)return;const id=document.getElementById('iuT_'+el.dataset.m).value,role=document.getElementById('iuTR_'+el.dataset.m).value;if(!id){toast('請先選老師');return;}IEP.addPerson(D,R,m,'t:'+id,role,D.iep.cfg.req[role]);keep();},
  paddO(el){const {R,m}=findM(el.dataset.m);if(!m)return;const n=document.getElementById('iuO_'+el.dataset.m).value.trim(),role=document.getElementById('iuOR_'+el.dataset.m).value;if(!n){toast('請先填姓名');return;}IEP.addOther(D,R,m,n,role,D.iep.cfg.req[role]);keep();},
  paddK(el){const {R,m}=findM(el.dataset.m);if(!m)return;const o=IEP.subjOptions(D,m.s)[+el.dataset.j];if(o)IEP.addPerson(D,R,m,o.k,'任課',0);keep();},
  prederive(el){const {R,m}=findM(el.dataset.m);if(!m)return;IEP.rederive(D,R,m);keep();toast('已重新帶入');},
  publish(){publish();},
  async unpub(){const R=curR();if(!canR(R)||!confirm('結束線上調查？連結會立刻失效，線上的回覆會刪掉（已抓回的留著）。'))return;await pull(R,true);await unpub(R);},
  copyUrl(el){copyText(urlOf(curR(),el.dataset.k),'已複製連結');},
  regen(el){const R=curR();if(!canR(R)||!confirm('重新產生這位的連結？舊的連結（QR）會立刻失效，要把新的連結再給對方一次。'))return;regen(R,[el.dataset.k]);},
  regenAll(){const R=curR();if(!canR(R))return;const ks=IEP.webPeople(D,R).filter(o=>R.tokH&&R.tokH[o.k]&&!urlOf(R,o.k)).map(o=>o.k);
    if(!ks.length||!confirm('重新產生 '+ks.length+' 位的連結？舊的連結（QR）會立刻失效，要把新的連結再給他們一次。'))return;regen(R,ks);},
  showQR(el){U.qr=U.qr===el.dataset.k?'':el.dataset.k;render();},
  copyRem(el){const R=curR(),o=IEP.webPeople(D,R).find(x=>x.k===el.dataset.k);if(o)copyText(IEP.remindText(D,R,o,urlOf(R,o.k)),'已複製提醒');},
  copyAll(){const R=curR(),pg=IEP.progress(D,R);copyText(pg.people.filter(o=>!o.done&&urlOf(R,o.k)).map(o=>IEP.remindText(D,R,o,urlOf(R,o.k))).join('\n\n'),'已複製提醒');},
  pull(){pull(curR());},
  cyc(el){const R=curR();if(!canR(R))return;IEP.cycle(R,U.busy,el.dataset.k,el.dataset.s);U.open=1;keep();},
  rest(el){const R=curR();if(!canR(R))return;IEP.fillRest(R,el.dataset.k,'y',null,U.busy);U.open=1;keep();},
  run(){const R=curR();if(!canR(R))return;const res=IEP.schedule(D,R,{busy:busyOf(R)});IEP.applyPlan(R,res);U.un={};res.un.forEach(u=>{U.un[u.id]=u.why;});keep();
    toast('排好 '+Object.keys(res.at).length+' 場'+(res.un.length?'，'+res.un.length+' 場排不進去':''));},
  clearPlan(){const R=curR();if(!canR(R))return;R.meets.forEach(m=>{if(!m.pin){m.at='';m.room='';}});U.un={};keep();},
  print(){window.print();},
  qgo(){const Q=U.q;if(!Q.sid||!Q.date||!Q.p||Q.p==='*'){toast('請選學生、日期和時間');return;}
    const s=IEP.stuOf(D,Q.sid);if(SC&&(!s||s.caseMgr!==SC)){toast('只能替自己個管的學生開會');return;}
    const c0=D.iep.cur,R=IEP.quickMeet(D,{sid:Q.sid,date:Q.date,p:Q.p,room:Q.room,kind:Q.kind,host:SC||'特教組'});if(SC)D.iep.cur=c0;U.qk=R.id;keep();},
  qopen(el){U.qk=el.dataset.r;render();},
  qdel(el){const R=IEP.ownRounds(D,SC,1).find(r=>r.id===el.dataset.r);if(!R||!confirm('刪除這場會議的通知資料？'))return;D.iep.rounds=D.iep.rounds.filter(r=>r!==R);if(U.qk===R.id)U.qk='';keep();},
  admDel(el){if(SC)return;D.iep.cfg.admin.splice(+el.dataset.i,1);keep();},
  admAdd(){if(SC)return;const id=document.getElementById('iuAdmT').value,n=document.getElementById('iuAdmN').value.trim(),r=document.getElementById('iuAdmR').value.trim()||'行政';const k=id?'t:'+id:n?IEP.tKey(D,n):'';if(!k){toast('請選老師或打姓名');return;}
    if(D.iep.cfg.admin.some(a=>a[0]===k)){toast('已經在名單裡');return;}D.iep.cfg.admin.push([k,r,0]);keep();},
  meTog(el){const F=U.free[el.dataset.r];if(!F)return;const k=el.dataset.s;if(F.has(k))F.delete(k);else F.add(k);render();},
  meSend(el){const R=D.iep.rounds.find(r=>r.id===el.dataset.r),F=U.free[el.dataset.r];if(!R||!F||!SC)return;const nt=document.getElementById('iuN_'+R.id);
    if(IEP.selfAnswer(D,R,'t:'+SC,[...F],nt?nt.value.trim():'')){save();render();toast('已送出：有空 '+F.size+' 節');}}
};
const CHG={
  pick(el){setCur(el.value);U.un={};if(SC)render();else keep();},
  rset(el){const R=el.dataset.r?IEP.ownRounds(D,SC).find(r=>r.id===el.dataset.r):curR();if(!canR(R))return;const f=el.dataset.f;R[f]=el.type==='checkbox'?(el.checked?1:0):el.value.trim();keep();},
  rooms(el){const R=curR();if(!canR(R))return;R.rooms=el.value.split(/[、,，;；\s]+/).map(x=>x.trim()).filter(Boolean);keep();},
  range(){const R=curR();if(!canR(R))return;const ps=[...document.querySelectorAll('#page .iups')].filter(x=>x.checked).map(x=>x.value);IEP.setRange(D,R,document.getElementById('iuD1').value,document.getElementById('iuD2').value,ps);keep();},
  cmf(el){U.cm=el.value;render();},
  stu(el){const R=curR();if(!canR(R))return;const sid=el.dataset.s;if(el.checked){if(!IEP.addMeetAs(D,R,sid,SC)){el.checked=false;return;}}else{const m=R.meets.find(x=>x.s===sid);if(m)IEP.delMeet(R,m.id);}keep();},
  pname(el){const {R,m}=findM(el.dataset.m);const x=m&&m.p[+el.dataset.i];if(x&&R.ppl[x[0].slice(2)])R.ppl[x[0].slice(2)].n=el.value.trim();save();},
  prole(el){const {m}=findM(el.dataset.m);const x=m&&m.p[+el.dataset.i];if(x)x[1]=el.value.trim()||'其他';save();},
  preq(el){const {m}=findM(el.dataset.m);const x=m&&m.p[+el.dataset.i];if(x)IEP.setReq(m,x[0],el.checked);keep();},
  iv(el){const f=el.dataset.f;U[f]=el.type==='checkbox'?el.checked:f==='per'?+el.value:el.value;render();},
  at(el){const {m}=findM(el.dataset.m);if(!m)return;m.at=el.value;m.pin=el.value?1:0;delete U.un[m.id];keep();},
  room(el){const {m}=findM(el.dataset.m);if(m){m.room=el.value;keep();}},
  pin(el){const {m}=findM(el.dataset.m);if(m){m.pin=el.checked?1:0;keep();}},
  q(el){const Q=U.q,f=el.dataset.f;if(f==='pt'){const v=el.value.trim().replace(/[~～－—]/g,'-');if(!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v)){toast('時間寫成 15:10-16:00');return;}Q.p=v;}else Q[f]=el.value;if(f==='p')render();},
  req(el){if(SC)return;D.iep.cfg.req[el.dataset.r]=el.checked?1:0;save();},
  subj(el){if(SC)return;D.iep.cfg.subj=el.checked?1:0;save();},
  adm(el){if(SC)return;const a=D.iep.cfg.admin[+el.dataset.i];if(!a)return;if(el.dataset.f==='2')a[2]=el.checked?1:0;else a[1]=el.value.trim();save();},
  hr(el){if(SC)return;const v=el.value.trim();if(!v)delete D.classHead[el.dataset.c];else D.classHead[el.dataset.c]=v;save();}
};
const meTid=()=>String((typeof ME_TID!=='undefined'?ME_TID:window.ME_TID)||'');
// qrcodejs 1.0.0 的完整性檢查碼（和 checkin.js 同一個檔案）
const QR_SRI='sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU';
const onIep=()=>typeof page!=='undefined'&&(page==='iep'||page==='me_iep');

// scope：''＝全部（管理者）；老師 id＝只有他的。老師頁沒有綁定老師時不顯示任何調查
function draw(scope,teacherPage){if(teacherPage&&!scope){out(empty('還沒有綁定老師'));return;}
  SC=scope||'';IEP.ensure(D);migrateAll();({survey:vSurvey,plan:vPlan,quick:vQuick,inv:SC?vInv:vSurvey}[sub]||vSurvey)();}
let wired=false;
function install(){if(typeof PAGES==='undefined')return false;
  PAGES.iep={t:'IEP 會議',subs:[['survey','調查'],['plan','排定與通知'],['quick','直接開會']],render:()=>draw('')};
  PAGES.me_iep={t:'我的 IEP',subs:[['inv','填空堂'],['survey','調查'],['plan','排定與通知'],['quick','直接開會']],render:()=>draw(meTid(),true)};
  if(!wired){wired=true;const P=document.getElementById('page');
    P.addEventListener('click',e=>{if(!onIep())return;const el=e.target.closest('[data-ia]');if(!el||el.disabled||!ACT[el.dataset.ia])return;e.preventDefault();ACT[el.dataset.ia](el,e);});
    P.addEventListener('change',e=>{if(!onIep())return;const el=e.target.closest('[data-ic]');if(!el||!CHG[el.dataset.ic])return;CHG[el.dataset.ic](el,e);});}
  return true;}
IEP.ui={install,draw,state:U};
})();

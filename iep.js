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
  ensure(D).rounds.forEach(R2=>{if(R2===R)return;R2.meets.forEach(m=>{if(!m.at)return;const f2=slotInfo(D,m.at);
    m.p.forEach(x=>{if(!people.has(x[0]))return;inf.forEach(f=>{if(overlap(f,f2)){const o=out[x[0]]=out[x[0]]||{};if(!o[f.k])o[f.k]='已排 IEP（'+stuLabel(stuOf(D,m.s))+'）';}});});});});
  R.rooms.forEach(name=>{const ri=D.rooms.findIndex(r=>r.name===name);if(ri<0)return;
    inf.forEach(f=>{if(f.w<0)return;for(const pi of f.pis){const g=rb.get(ri*NS+f.w*NP+pi);if(g){(rooms[name]=rooms[name]||{})[f.k]='資源班上課（'+g+'）';break;}}});});
  out.__rooms=rooms;return out;}

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
function rank(D,R,m,busy){const ppl=m.p;
  return meetSlots(R,m).map((sk,i)=>{let ok=true,val=0,yes=0;const bad=[],miss=[],unk=[];
    ppl.forEach(x=>{const st=status(R,busy,x[0],sk),n=pName(D,R,x[0]);
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
        time:t0,room:m.room||R.place||'',due:R.cdue||'',host:R.host||''});});});
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
// 雲端文件名稱用鑰匙的 SHA-256，不直接用鑰匙：資料庫被看到也拿不到能用的連結（Function 端算法相同）
async function tokHash(t){const b=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(t)));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
// 調查範圍：日期區間的週一到週五 × 勾選的節次
function setRange(D,R,d1,d2,ps){R.d1=d1||'';R.d2=d2||'';R.ps=(ps||[]).filter(p=>D.periods.some(x=>x.id===p));
  R.slots=genSlots(dateRange(R.d1,R.d2,[1,2,3,4,5]),R.ps);sortSlots(D,R);return R.slots.length;}
// 連結到期：回覆期限那一天的晚上 23:59:59（本機時間）
function expMs(R){const d=parseDate(R.due);return d?new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59).getTime():0;}
// 要發連結的人：老師一定有；家長、專業人員要勾 R.par 才發
function webPeople(D,R){return consolidate(D,R,{all:!!R.par});}
function ensureTokens(D,R){R.tok=R.tok&&typeof R.tok==='object'?R.tok:{};const list=webPeople(D,R);
  list.forEach(o=>{if(!R.tok[o.k]||!TOKEN_RE.test(R.tok[o.k]))R.tok[o.k]=token();});return list;}
// 公開頁上的「有課」只寫種類，不寫組別名稱、不寫別的學生
function shortBusy(why){why=String(why||'');return /資源班上課/.test(why)?'資源班課':/原班上課/.test(why)?'原班課':/IEP/.test(why)?'已有會議':/不排課/.test(why)?'不排課':'有事';}
// 寫到 iepTok/{鑰匙的雜湊} 的公開內容（app 另外加上 exp 時間戳記、r 調查 id、pk 出席者代號；Function 只回傳公開欄位）
function publicDoc(D,R,o,busy){const pk=o.k,keys=o.keys,b={};keys.forEach(k=>{const w=busy&&busy[pk]&&busy[pk][k];if(w)b[k]=shortBusy(w);});
  const pids=[...new Set(keys.map(k=>splitKey(k)[1]))],ps=D.periods.filter(p=>pids.includes(p.id)).map(p=>({id:p.id,n:p.name,t:pad(p.start)+'–'+pad(p.end)}));
  const role=o.meets.map(x=>x.role).join('、');
  return {v:1,who:o.teacher?'t':'p',once:o.teacher?0:1,name:salute(o.name,role,o.teacher),title:String(D.title||''),round:String(R.name||''),kind:String(R.kind||KINDS[0]),
    d1:R.d1||'',d2:R.d2||'',due:R.due||'',host:String(R.host||''),keys:keys.slice(),ps,busy:b,
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
    '，請'+(R.due?'於 '+fmtDate(R.due)+' 前':'儘快')+'打開連結，點選您有空的節次：'+url+'　謝謝！'+(R.host?'（'+R.host+'）':'');}

const IEP={token,tokHash,TOKEN_RE,setRange,expMs,webPeople,ensureTokens,shortBusy,publicDoc,applyWeb,webGrid,webInit,progress,remindText,KINDS,stuShow,salute,slipItems,quickMeet,ROLES,DEF_REQ,ANS,W,ensure,round,normRound,newRound,addMeet,delMeet,derive,rederive,addPerson,addOther,removePerson,setReq,subjTeachers,subjOptions,
  tKey,pName,isTeacher,stuOf,stuLabel,key,splitKey,keysOf,slotInfo,fmtDate,dateRange,genSlots,sortSlots,overlap,ctxOf,busyOf,
  record,fillRest,status,cycle,meetSlots,consolidate,grid,rank,schedule,applyPlan,conflicts,notices};
if(typeof module!=='undefined'&&module.exports)module.exports=IEP;
else root.IEP=IEP;
})(typeof window!=='undefined'?window:globalThis);

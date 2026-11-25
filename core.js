/* 資源班管理系統｜核心：資料模型、排課規則、求解器（瀏覽器與 node 共用，不碰畫面） */
'use strict';
const DAYS=['一','二','三','四','五'];
const ROLES=['資源班','普通班','兼課','代理','行政'];
const MODES=['抽離','外加','不鎖課'];   // 不鎖課：一樣排在一般節次把學生抽出來，但不需要原班配合（例：社會技巧）

function uid(p){return (p||'x')+Date.now().toString(36).slice(-4)+Math.random().toString(36).slice(2,6);}

/* 內建的是虛構範例資料 */
function defaultData(){
  const T=(id,name,role,off,note)=>({id,name,role,off:off||[],note:note||''});
  const span=(d,ps)=>ps.map(p=>d+'-'+p);
  const AM=['1','2','3','4'],PM=['5','6','7'],ALL=AM.concat(PM);
  const teachers=[
    T('r1','林組長','資源班',span(2,PM),'週三下午行政會議'),
    T('r2','王老師','資源班'),
    T('r3','李老師','資源班',span(0,['1'])),
    T('k1','張老師（國）','普通班',span(3,PM)),
    T('k2','吳老師（國）','代理',span(1,AM)),
    T('m1','陳老師（數）','普通班'),
    T('m2','黃老師（數）','兼課',span(2,ALL).concat(span(4,ALL)),'兼課，只有週一、二、四到校'),
    T('e1','劉老師（英）','普通班',span(4,PM)),
    T('e2','蔡主任（英）','行政',span(0,AM).concat(span(2,ALL),span(4,PM)),'主任，會議多')
  ];
  const names=['王小明','陳小華','林小美','張小安','李小芳','黃小傑','吳小婷','劉小宇','蔡小晴','楊小恩','許小凱','鄭小雯',
    '謝小哲','洪小彤','郭小翔','邱小涵','曾小睿','廖小琪','賴小恩','徐小安','周小宸','葉小語','蘇小樂','莊小晴'];
  const classes=['701','702','801','802','901','902'],cm=['r1','r2','r3'];
  const students=names.map((name,i)=>{const cls=classes[Math.floor(i/4)],seat=String(3+(i%4)*7).padStart(2,'0');
    return {id:'s'+(i+1),cls,seat,name,caseMgr:cm[i%3],note:'',needs:[]};});
  const inG=g=>students.filter(s=>s.cls[0]===String(g));
  const ids=(list,skip)=>list.filter((s,i)=>!(skip||[]).includes(i)).map(s=>s.id);
  const classSubj={};
  classes.forEach((c,i)=>{const odd=i%2===0;classSubj[c+'|國文']=odd?'k1':'k2';classSubj[c+'|數學']=odd?'m1':'m2';classSubj[c+'|英文']=odd?'e1':'e2';});
  teachers[0].hours=12;teachers[1].hours=12;teachers[2].hours=14;
  const Gp=(id,name,subject,teacher,per,stu,mode)=>({id,name,subject,teacher,per,students:stu,mode:mode||'抽離',room:'',on:true,grade:({七:'7',八:'8',九:'9'})[name[0]]||''});
  const g7=inG(7),g8=inG(8),g9=inG(9);
  return {
    v:1,
    title:'○○國中 ○○學年度第○學期 資源班（範例資料）',
    periods:[
      {id:'m',name:'早自習',start:'07:40',end:'08:10',extra:true},
      {id:'1',name:'第1節',start:'08:20',end:'09:05'},
      {id:'2',name:'第2節',start:'09:15',end:'10:00'},
      {id:'3',name:'第3節',start:'10:10',end:'10:55'},
      {id:'4',name:'第4節',start:'11:05',end:'11:50',breakAfter:true},
      {id:'5',name:'第5節',start:'13:10',end:'13:55'},
      {id:'6',name:'第6節',start:'14:05',end:'14:50'},
      {id:'7',name:'第7節',start:'15:10',end:'15:55'}
    ],
    students,teachers,
    rooms:[{id:'A',name:'資源教室一'},{id:'B',name:'資源教室二'},{id:'C',name:'資源教室三'}],
    classSubj,
    groups:[
      Gp('g1','七國','國文','r2',5,ids(g7,[7])),
      Gp('g2','七數','數學','r3',4,ids(g7,[0])),
      Gp('g3','七英','英文','r1',3,ids(g7,[2,5])),
      Gp('g4','八國','國文','r3',5,ids(g8,[1])),
      Gp('g5','八數','數學','r2',4,ids(g8,[6])),
      Gp('g6','八英','英文','r1',3,ids(g8,[0,3])),
      Gp('g7','九國','國文','r1',5,ids(g9,[4])),
      Gp('g8','九數','數學','r3',4,ids(g9,[2])),
      Gp('g9','九英','英文','r2',3,ids(g9,[1,7])),
      Gp('g10','社會技巧','社會技巧','r1',1,[g7[1].id,g7[6].id,g8[2].id,g9[5].id],'外加')
    ],
    blocked:['4-7'],
    offBy:{'g:7':['4-6'],'g:8':['4-6'],'g:9':['3-6']},
    sets:[{id:'x1',name:'技藝班',students:[g9[3].id,g9[6].id],off:['1-5','1-6','1-7'],note:'週二下午到合作學校上課'}],
    assign:{},
    settings:{regClash:true,seed:1,noteSplit:1,kSplit:1}
  };
}

/* 空白的一份：只留作息，其餘清空 */
function emptyData(){const B=defaultData();return Object.assign(B,{title:'',students:[],teachers:[],groups:[],classSubj:{},blocked:[],offBy:{},sets:[],assign:{},rooms:[{id:'A',name:'資源教室一'}]});}

function normalize(D){
  const B=defaultData();
  if(!D||typeof D!=='object')return B;
  ['periods','students','teachers','rooms','groups','blocked'].forEach(k=>{if(!Array.isArray(D[k]))D[k]=k==='periods'?B.periods:[];});
  if(!Array.isArray(D.sets))D.sets=[];
  D.sets.forEach(x=>{if(!Array.isArray(x.students))x.students=[];if(!Array.isArray(x.off))x.off=[];});
  ['classSubj','assign','settings','offBy'].forEach(k=>{if(!D[k]||typeof D[k]!=='object')D[k]={};});
  if(D.settings.regClash==null)D.settings.regClash=true;
  if(!D.settings.seed)D.settings.seed=1;
  D.teachers.forEach(t=>{if(!Array.isArray(t.off))t.off=[];if(!t.role)t.role='普通班';t.hours=Math.max(0,+t.hours||0);if(t.prefRooms!=null&&!Array.isArray(t.prefRooms))delete t.prefRooms;otNormT(t);});
  if(D.sched!=null&&(typeof D.sched!=='object'||Array.isArray(D.sched)))delete D.sched;   // 試排草稿與確定的版本（沒用過就不存）
  D.students.forEach(s=>{if(!Array.isArray(s.needs))s.needs=[];});
  // 備註拆成「公開提醒」（note，簽到時給學生看）和「個管私密備註」（privNote）。舊資料的備註不知道能不能給學生看，一律先搬到私密
  // 舊資料：班級不排課以前用「完全鎖定」帶入，改成「不能排國英數」——社會技巧這類不鎖課的課可以排進導師時間等時段（只轉一次）
  if(!D.settings.kSplit){Object.keys(D.offBy).forEach(k=>{if(k.slice(0,2)!=='c:')return;const kk='k:'+k.slice(2);D.offBy[kk]=[...new Set((D.offBy[kk]||[]).concat(D.offBy[k]))];delete D.offBy[k];});D.settings.kSplit=1;D.settings.kSplitNote=1;}
  if(!D.settings.noteSplit){D.students.forEach(s=>{if(s.note&&!s.privNote){s.privNote=s.note;s.note='';}});D.settings.noteSplit=1;}
  D.groups.forEach(g=>{if(!Array.isArray(g.students))g.students=[];g.per=Math.max(0,Math.min(15,+g.per||0));if(!g.mode)g.mode='抽離';if(g.on==null)g.on=true;g.grade=g.grade?String(g.grade):'';});
  if(D.title==null)D.title='';
  sanitizeIds(D);
  otNormD(D);
  return D;
}

/* id 只能是英數字、底線、減號（1～40 字）。畫面會把 id 放進 HTML 屬性與事件，不合格的（引號、角括號、中文…）一律換掉，
   換法固定（同一份資料在每台電腦換出來一樣），並把引用它的地方一起改：個管、任課老師、組別成員、教室、排法、不排課時段… */
const ID_RE=/^[A-Za-z0-9_-]{1,40}$/;
const okId=v=>(typeof v==='string'||typeof v==='number')&&ID_RE.test(String(v));
function safeId(v,used){const b=String(v==null?'':v).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,40)||'x';let id=b,n=2;
  while(used.has(id)){const suf='_'+(n++);id=b.slice(0,40-suf.length)+suf;}used.add(id);return id;}
// 一張清單裡不合格的 id 換掉；回傳 Map(舊 id 字串 → 新 id)。同一個舊 id 出現兩次也換成同一個
function fixIds(list){const used=new Set(),map=new Map();if(!Array.isArray(list))return map;
  list.forEach(x=>{if(x&&okId(x.id))used.add(String(x.id));});
  list.forEach(x=>{if(!x||typeof x!=='object'||okId(x.id))return;const k=String(x.id==null?'':x.id);if(!map.has(k))map.set(k,safeId(k,used));x.id=map.get(k);});
  return map;}
function sanitizeIds(D){
  const mS=fixIds(D.students),mT=fixIds(D.teachers),mG=fixIds(D.groups),mR=fixIds(D.rooms),mP=fixIds(D.periods),mX=fixIds(D.sets);
  if(![mS,mT,mG,mR,mP,mX].some(m=>m.size))return 0;
  const r=(m,v)=>v!=null&&m.has(String(v))?m.get(String(v)):v;
  const slot=k=>{const s=String(k),i=s.indexOf('-');return i<1||!mP.size?k:s.slice(0,i+1)+r(mP,s.slice(i+1));};
  const slots=a=>Array.isArray(a)?a.map(slot):a;
  const pk=k=>{const s=String(k);return /^t:/.test(s)?'t:'+r(mT,s.slice(2)):/^s:/.test(s)?'s:'+r(mS,s.slice(2)):s;};
  const rekey=(o,f)=>{if(!o||typeof o!=='object'||Array.isArray(o))return o;const n={};Object.keys(o).forEach(k=>{n[f(k)]=o[k];});return n;};
  D.students.forEach(s=>{if(s&&s.caseMgr!=null)s.caseMgr=r(mT,s.caseMgr);});
  D.teachers.forEach(t=>{if(!t)return;t.off=slots(t.off);if(Array.isArray(t.prefRooms))t.prefRooms=t.prefRooms.map(x=>r(mR,x));});
  D.groups.forEach(g=>{if(!g)return;g.teacher=r(mT,g.teacher);g.room=r(mR,g.room);if(Array.isArray(g.students))g.students=g.students.map(x=>r(mS,x));});
  D.sets.forEach(x=>{if(!x)return;x.students=x.students.map(y=>r(mS,y));x.off=slots(x.off);});
  D.blocked=slots(D.blocked);
  for(const k in D.classSubj)D.classSubj[k]=r(mT,D.classSubj[k]);
  D.offBy=rekey(D.offBy,pk);for(const k in D.offBy)D.offBy[k]=slots(D.offBy[k]);
  D.assign=rekey(D.assign,k=>r(mG,k));
  for(const k in D.assign){const a=D.assign[k];if(Array.isArray(a))a.forEach(e=>{if(e&&typeof e==='object'){if(e.s)e.s=slot(e.s);if(e.r!=null)e.r=r(mR,e.r);}});}
  if(D.contacts)D.contacts=rekey(D.contacts,k=>r(mS,k));
  if(Array.isArray(D.claims))D.claims.forEach(c=>{if(c&&typeof c==='object'){c.gid=r(mG,c.gid);c.tid=r(mT,c.tid);}});
  const I=D.iep;if(I&&Array.isArray(I.rounds))I.rounds.forEach(R=>{if(R&&Array.isArray(R.meets))R.meets.forEach(m=>{if(!m)return;m.s=r(mS,m.s);if(Array.isArray(m.p))m.p.forEach(x=>{if(Array.isArray(x))x[0]=pk(x[0]);});});});
  if(I&&I.cfg&&Array.isArray(I.cfg.admin))I.cfg.admin.forEach(a=>{if(Array.isArray(a))a[0]=pk(a[0]);});
  return [mS,mT,mG,mR,mP,mX].reduce((n,m)=>n+m.size,0);
}

const GRADE={7:'七年級',8:'八年級',9:'九年級',1:'一年級',2:'二年級',3:'三年級',4:'四年級',5:'五年級',6:'六年級',10:'高一',11:'高二',12:'高三'};
// 班級號碼看年級：三位數看第一位（701→7），四位數看前兩位（1012→10）；其他寫法（例：7年1班）退回看第一個字
function gradeOfCls(c){const x=String(c==null?'':c).trim();if(/^\d{4}$/.test(x))return parseInt(x.slice(0,2),10);const g=parseInt(x[0],10);return isNaN(g)?0:g;}
// 升一個年級後的班級號碼：701→801、1012→1112；不是三、四位數的不改
function promoteCls(c){const x=String(c).trim(),g=gradeOfCls(x);if(/^\d{3}$/.test(x))return String(g+1)+x.slice(1);if(/^\d{4}$/.test(x))return String(g+1).padStart(2,'0')+x.slice(2);return x;}

/* 把資料整理成求解器用的索引與「每一組可以排的時段」 */
function compile(D){
  const P=D.periods,NP=P.length,NS=5*NP;
  const pidx={};P.forEach((p,i)=>{pidx[p.id]=i;});
  const key2s=k=>{const str=String(k),i=str.indexOf('-'),d=+str.slice(0,i),p=pidx[str.slice(i+1)];return (i<1||p==null||!(d>=0&&d<5))?-1:d*NP+p;};
  const s2key=s=>Math.floor(s/NP)+'-'+P[s%NP].id;
  const sn=s=>'週'+DAYS[Math.floor(s/NP)]+P[s%NP].name;
  const T=D.teachers,NT=T.length,tIdx={};T.forEach((t,i)=>{tIdx[t.id]=i;});
  const mark=list=>{const a=new Uint8Array(NS);(list||[]).forEach(k=>{const s=key2s(k);if(s>=0)a[s]=1;});return a;};
  const off=T.map(t=>mark(t.off)),blocked=mark(D.blocked);
  // 學生這一邊的不排課：年級、班級、學生群組（例：技藝班）、個人，一層一層疊起來
  const OB=D.offBy||{},layer={},lay=(k,label)=>{if(!(OB[k]&&OB[k].length))return null;return layer[k]||(layer[k]={label,arr:mark(OB[k])});};
  const setsOf={};(D.sets||[]).forEach(x=>{if(!x.off||!x.off.length)return;const o={label:x.name||'學生群組',arr:mark(x.off)};(x.students||[]).forEach(id=>{(setsOf[id]=setsOf[id]||[]).push(o);});});
  const stuOff=D.students.map(st=>{const c=String(st.cls),a=[lay('g:'+gradeOfCls(c),GRADE[gradeOfCls(c)]||''),lay('c:'+c,c+' 班'),lay('s:'+st.id,c+' '+st.name)].filter(Boolean);return a.concat(setsOf[st.id]||[]);});
  const NStu=D.students.length,sIdx={};D.students.forEach((s,i)=>{sIdx[s.id]=i;});
  const classes=[...new Set(D.students.map(s=>String(s.cls)))].sort(),cIdx={};classes.forEach((c,i)=>{cIdx[c]=i;});
  const subjects=[...new Set(D.groups.map(g=>g.subject))],jIdx={};subjects.forEach((c,i)=>{jIdx[c]=i;});
  const rIdx={};D.rooms.forEach((r,i)=>{rIdx[r.id]=i;});
  // 鎖課方式：same＝原班和資源班同一節上同一科；flex＝鎖不到同一科可以改鎖其他主科，都不行就不鎖（排完再配鎖課）
  const flex=D.settings.lockMode==='flex',NR=D.rooms.length,strict=D.settings.regClash!==false&&!flex;
  const klay=classes.map(c=>OB['k:'+c]&&OB['k:'+c].length?mark(OB['k:'+c]):null);      // 這一班只是不能鎖課的時段
  const capSet=Object.keys((D.settings||{}).lockCap||{}).filter(k=>D.settings.lockCap[k]>0);
  const copt=classes.map(()=>[]);for(const k in D.classSubj){const i=k.indexOf('|'),c=cIdx[k.slice(0,i)],tt=tIdx[D.classSubj[k]],sj=k.slice(i+1);if(c!=null&&tt!=null&&(!capSet.length||capSet.includes(sj)))copt[c].push({sj,t:tt});}
  const coff=classes.map(c=>{const a=new Uint8Array(NS);[OB['g:'+gradeOfCls(c)],OB['c:'+c],OB['k:'+c],D.blocked].forEach(li=>(li||[]).forEach(k=>{const s=key2s(k);if(s>=0)a[s]=1;}));
    P.forEach((p,pi)=>{if(p.extra)for(let dd=0;dd<5;dd++)a[dd*NP+pi]=1;});return a;});
  const idxOf=(map,k)=>(k!=null&&map[k]!=null)?map[k]:-1;
  const G=D.groups.map((g,gi)=>{
    const stu=[...new Set((g.students||[]).map(id=>sIdx[id]).filter(i=>i!=null))];
    const pull=g.mode!=='外加',need=g.mode==='抽離',t=idxOf(tIdx,g.teacher);
    const cls=[...new Set(stu.map(i=>String(D.students[i].cls)))].sort();
    const locks=need?cls.map(c=>({c:cIdx[c],cls:c,t:idxOf(tIdx,D.classSubj[c+'|'+g.subject])})):[];
    const gr=+g.grade||0;   // 這門課指定的年級：還沒有學生時也先避開該年級的不排課時段
    const soff=[...new Set(stu.flatMap(i=>stuOff[i]).concat(gr?[lay('g:'+gr,GRADE[gr]||'')].filter(Boolean):[]))],grades=[...new Set(cls.map(gradeOfCls).concat(gr?[gr]:[]))];
    const o={gi,ref:g,name:g.name||'（未命名）',subject:g.subject,j:jIdx[g.subject],t,stu,pull,need,cls,locks,soff,grades,room:idxOf(rIdx,g.room),
      per:g.on===false?0:(+g.per||0),allowed:new Uint8Array(NS),alist:[],warn:[]};
    return o;
  });
  const ST_=D.settings||{},num=(v,d)=>(v===''||v==null||isNaN(+v))?d:+v;
  const M={D,P,NP,NS,NT,NStu,NC:classes.length,NR,T,G,classes,subjects,off,blocked,strict,key2s,s2key,sn,tIdx,sIdx,cIdx,L:[],viol:0,
    classClash:ST_.classClash!==false&&!flex,flex,klay,copt,coff,roomCheck:ST_.roomCheck!==false,maxDay:Math.max(1,num(ST_.maxDay,1)),tRun:Math.max(1,num(ST_.tRun,3)),sDay:Math.max(1,num(ST_.sDay,3)),lroom:null};
  // 教室：勾「備用」的平常不用；同一節的組數盡量不超過平常用的教室數，真的排不下才用備用的
  M.spareR=D.rooms.map(r=>!!r.spare);M.mainR=D.rooms.filter(r=>!r.spare).length;M.roomOrder=D.rooms.map((r,i)=>i).sort((a,b)=>M.spareR[a]-M.spareR[b]);
  const caps=ST_.lockCap||{};M.capOf=sj=>caps[sj]>0?+caps[sj]:99;
  // 手排鎖課（從學校的資料輸入讀進來）：這一班這一節指定鎖這位老師
  const byName={};T.forEach((t,i)=>{(byName[t.name]=byName[t.name]||[]).push(i);});M.lfix=new Map();M.lfixAmb=[];M.fixW=ST_.keepFix===false?0:1.5;
  // 手排鎖課只記老師名字。有同名的老師時：先看這一班這一科的任課老師是不是其中一位，再看誰有教這一班；還是分不出來就不猜，列出來請老師確認
  (D.lockFix||[]).forEach(f=>{const c=cIdx[f.cls],s=key2s(f.k),list=byName[f.t]||[];if(c==null||s<0||!list.length)return;
    let t=list.length===1?list[0]:-1;
    if(list.length>1){const cs=f.sj?tIdx[D.classSubj[f.cls+'|'+f.sj]]:null;
      if(cs!=null&&list.includes(cs))t=cs;
      else{const hit=list.filter(i=>Object.keys(D.classSubj).some(k=>k.startsWith(f.cls+'|')&&D.classSubj[k]===T[i].id));if(hit.length===1)t=hit[0];}}
    if(t<0){M.lfixAmb.push({cls:f.cls,s,t:f.t});return;}
    M.lfix.set(c*NS+s,{t,sj:f.sj,cls:f.cls,c,s});});
  M.dbl=new Set(String(ST_.lockDouble||'').split(/[,，、\s]+/).filter(Boolean));
  M.lkav=new Uint8Array(NS*Math.max(1,M.NC));      // 彈性鎖課：這一班這一節還有幾位主科老師可以鎖
  if(flex)for(let c=0;c<M.NC;c++)for(let s=0;s<NS;s++)if(!(klay[c]&&klay[c][s])){let n=0;copt[c].forEach(x=>{if(!off[x.t][s])n++;});M.lkav[c*NS+s]=Math.min(n,200);}
  G.forEach(g=>{
    for(let s=0;s<NS;s++)if(!why(M,g.gi,s).length){g.allowed[s]=1;g.alist.push(s);}
    if(!g.per)return;
    if(g.t<0)g.warn.push('還沒指定資源班老師');
    if(!g.stu.length)g.warn.push('還沒有學生');
    g.locks.forEach(k=>{if(k.t<0)g.warn.push(k.cls+' 的'+g.subject+'還沒指定任課老師');});
    if(strict){const by={};g.locks.forEach(k=>{if(k.t>=0)(by[k.t]=by[k.t]||[]).push(k.cls);});
      for(const t in by)if(by[t].length>1)g.warn.push(by[t].join('、')+' 的'+g.subject+'都是'+T[t].name+'，同一位老師沒辦法讓這幾班同時上'+g.subject+'，請把學生分到不同組');}
    if(g.alist.length<g.per)g.warn.push('可以排的時段只有 '+g.alist.length+' 格，不夠排 '+g.per+' 節');
    for(let k=0;k<g.per;k++)M.L.push({g:g.gi,k});
  });
  M.rts=[...new Set(G.filter(g=>g.per&&g.t>=0).map(g=>g.t))];
  M.a_tc=new Int16Array(NS*Math.max(1,NT));M.a_sc=new Int16Array(NS*Math.max(1,NStu));M.a_cs=new Int16Array(NS*Math.max(1,M.NC));
  M.a_rt=new Int16Array(NS*Math.max(1,NT));M.a_rc=new Int16Array(NS);M.a_fr=new Int16Array(NS*Math.max(1,NR));M.a_gd=new Int16Array(G.length*5);
  // 老師偏好的教室（依志願序）。分教室時照志願給；排課時盡量別讓兩位想要同一間的老師排在同一節
  M.pref=T.map(t=>[...new Set((Array.isArray(t.prefRooms)?t.prefRooms:[]).map(id=>rIdx[id]).filter(i=>i!=null))]);
  M.pr1=Int16Array.from(M.pref.map(a=>a.length?a[0]:-1));M.prefW=1.5;
  // 只有真的有人搶同一間（兩位老師的第一志願相同，或第一志願是別人指定的教室）才在 evaluate 多算，沒有就完全不花時間
  const wantBy={};G.forEach(g=>{if(!g.per||g.t<0)return;const w=g.room>=0?g.room:M.pr1[g.t];if(w<0)return;(wantBy[w]=wantBy[w]||{p:0,t:new Set()});wantBy[w].t.add(g.t);if(g.room<0)wantBy[w].p=1;});
  M.prefOn=NR>0&&Object.values(wantBy).some(o=>o.p&&o.t.size>1);
  M.a_pw=new Int16Array(NS*Math.max(1,NR));M.a_pf=new Int16Array(NS*Math.max(1,NR));
  M.a_gs=new Int32Array(Math.max(1,G.length*NS));M.gsStamp=0;
  M.H=1000;   // 一個違規算幾分；排課時會從低慢慢升到 1000（見 solve），其他時候都是 1000
  M.brk=Uint8Array.from(P.map(p=>p.breakAfter?1:0));   // 這一節和下一節中間隔著午休等，不算相連
  return M;
}

/* 這一組為什麼不能排在這個時段（只看「不排課」類的原因，不看和別組撞不撞） */
function why(M,gi,s){
  const g=M.G[gi],p=M.P[s%M.NP],r=[];
  if(g.pull&&p.extra)r.push(p.name+'只排外加課');
  if(!g.pull&&!p.extra)r.push('外加課只排在外加時段');
  if(M.blocked[s])r.push('全校共同不排');
  g.soff.forEach(o=>{if(o.arr[s])r.push(o.label+'不排課');});
  if(g.t>=0&&M.off[g.t][s])r.push(M.T[g.t].name+'不排課');
  // 班級不排課（不能鎖課）的時段：要鎖課的抽離課（國英數）不能排；不鎖課、外加的課（例：社會技巧）可以排
  if(g.need){const bk=g.locks.filter(k=>M.klay[k.c]&&M.klay[k.c][s]).map(k=>k.cls);if(bk.length)r.push(bk.join('、')+' 這一節不能排國英數');}
  if(!M.flex){const seen={};     // 彈性鎖課時原班老師不排課不是硬性的：鎖不到就改鎖別科
    g.locks.forEach(k=>{if(k.t>=0&&!seen[k.t]&&M.off[k.t][s]){seen[k.t]=1;r.push(M.T[k.t].name+'不排課');}});}
  return r;
}

/* 算一個排法的分數：違規數 ×1000 ＋ 不理想的程度。out 給陣列時會把每個問題寫成文字 */
function evaluate(M,slot,out){
  const {NS,NP,NT,NStu,NC,NR,G,L}=M;
  const tc=M.a_tc.fill(0),sc=M.a_sc.fill(0),cs=M.a_cs.fill(0),rt=M.a_rt.fill(0),rc=M.a_rc.fill(0),fr=M.a_fr.fill(0),gd=M.a_gd.fill(0);
  let v=0,soft=0;
  const pw=M.prefOn?M.a_pw.fill(0):null,pf=pw?M.a_pf.fill(0):null;
  // 同一組同一格：用「這一輪的編號」標記，不必每次把整個陣列清成 0
  if(++M.gsStamp>2e9){M.a_gs.fill(0);M.gsStamp=1;}const gs=M.a_gs,stp=M.gsStamp;
  const bad=(k,gi,l,s,m)=>{v++;if(out)out.push({k,g:gi,l,s,m});};
  for(let l=0;l<L.length;l++){
    const gi=L[l].g,g=G[gi],s=slot[l];
    if(s<0){bad('un',gi,l,-1,out&&(g.name+'還有節數沒排進去'));continue;}
    if(!g.allowed[s])bad('off',gi,l,s,out&&(M.sn(s)+'：'+g.name+'不能排在這裡（'+why(M,gi,s).join('、')+'）'));
    // 同一組兩節排在同一格只算一個問題；後面的老師、學生、教室都不再重複算這一節（不然一組 8 個學生會算成 8 個）
    const kg=gi*NS+s;if(gs[kg]===stp){bad('dup',gi,l,s,out&&(M.sn(s)+'：'+g.name+'有兩節排在同一格'));continue;}gs[kg]=stp;
    if(g.t>=0){const k=s*NT+g.t;if(tc[k])bad('teacher',gi,l,s,out&&(M.sn(s)+'：'+M.T[g.t].name+'同時有兩組（'+G[tc[k]-1].name+'、'+g.name+'）'));else tc[k]=gi+1;}
    if(g.t>=0&&M.strict&&rt[s*NT+g.t])bad('reg',gi,l,s,out&&(M.sn(s)+'：'+M.T[g.t].name+'這一節要上'+g.name+'，但他同時是 '+M.classes[rt[s*NT+g.t]-1]+' 的任課老師、被鎖在原班'));
    for(let a=0;a<g.stu.length;a++){const i=g.stu[a],k=s*NStu+i;
      if(sc[k])bad('student',gi,l,s,out&&(M.sn(s)+'：'+M.D.students[i].cls+' '+M.D.students[i].name+'同時在兩組（'+G[sc[k]-1].name+'、'+g.name+'）'));else sc[k]=gi+1;}
    for(let a=0;a<g.locks.length;a++){const lk=g.locks[a],k=s*NC+lk.c,j=g.j+1;
      if(M.flex){   // 盡量排在「原班鎖得到課」的時段：完全鎖不到扣最多，鎖不到同一科或要和別班搶同一位老師扣一點
        if(M.lfix.size&&!M.lfix.has(lk.c*NS+s))soft+=M.fixW;   // 有手排鎖課時，盡量排回手排鎖課的節次
        if(!M.lkav[lk.c*NS+s])soft+=3;else if(lk.t<0||M.off[lk.t][s])soft+=0.6;else{const k2=s*NT+lk.t;if(rt[k2]&&rt[k2]!==lk.c+1)soft+=0.6;else rt[k2]=lk.c+1;}
        continue;}
      if(M.classClash&&cs[k]&&cs[k]!==j)bad('class',gi,l,s,out&&(M.sn(s)+'：'+lk.cls+' 同一節被要求上兩科（'+M.subjects[cs[k]-1]+'、'+g.subject+'）'));else cs[k]=j;
      if(M.strict&&lk.t>=0){const k2=s*NT+lk.t,c=lk.c+1;
        if(tc[k2]&&!rt[k2])bad('reg',gi,l,s,out&&(M.sn(s)+'：'+M.T[lk.t].name+'這一節要上'+G[tc[k2]-1].name+'，但他同時是 '+lk.cls+' 的任課老師、被鎖在原班'));
        if(rt[k2]&&rt[k2]!==c)bad('reg',gi,l,s,out&&(M.sn(s)+'：'+M.T[lk.t].name+'同一節要在兩個班上課（'+M.classes[rt[k2]-1]+'、'+lk.cls+'）'));else rt[k2]=c;}}
    const fx=NR>0?(M.lroom&&M.lroom[l]>=0&&M.lroom[l]<NR?M.lroom[l]:g.room):-1;
    if(pw&&g.t>=0){const w=fx>=0?fx:M.pr1[g.t];   // 同一節有幾位老師想要同一間：每多一對扣一點（兩組都是指定教室的已經算違規，不重複扣）
      if(w>=0){const k=s*NR+w;soft+=M.prefW*(fx>=0?pw[k]-pf[k]:pw[k]);pw[k]++;if(fx>=0)pf[k]++;}}
    if(NR>0&&M.roomCheck){
      if(fx>=0){const k=s*NR+fx;if(fr[k])bad('room',gi,l,s,out&&(M.sn(s)+'：'+M.D.rooms[fx].name+'同時被兩組指定（'+G[fr[k]-1].name+'、'+g.name+'）'));else fr[k]=gi+1;}
      if(++rc[s]>NR)bad('room',gi,l,s,out&&(M.sn(s)+'：教室不夠，同時有 '+rc[s]+' 組但只有 '+NR+' 間'));
      else if(M.mainR<NR&&rc[s]>M.mainR)soft+=8;   // 用到備用教室
    }
    gd[gi*5+((s/NP)|0)]++;
  }
  for(let gi=0;gi<G.length;gi++)for(let d=0;d<5;d++){const c=gd[gi*5+d];if(c>M.maxDay)soft+=(c-M.maxDay)*4;}
  for(let a=0;a<M.rts.length;a++){const t=M.rts[a];let tot=0;const dc=[0,0,0,0,0];
    for(let d=0;d<5;d++){let run=0;for(let p=0;p<NP;p++){if(tc[(d*NP+p)*NT+t]){dc[d]++;tot++;if(++run>M.tRun)soft+=2;}else run=0;if(M.brk[p])run=0;}}   // 午休等「與下一節不相連」的地方，連續節數重新算
    const avg=tot/5;for(let d=0;d<5;d++)soft+=(dc[d]-avg)*(dc[d]-avg)*0.4;}
  for(let i=0;i<NStu;i++)for(let d=0;d<5;d++){let c=0;for(let p=0;p<NP;p++)if(sc[(d*NP+p)*NStu+i])c++;if(c>M.sDay)soft+=c-M.sDay;}
  M.viol=v;return v*M.H+soft;
}

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* 自動排課：已固定的不動，其餘用模擬退火找違規最少、最平均的排法 */
function solve(M,S0,opt){
  opt=opt||{};const N=opt.iters||60000,RS=opt.restarts||4;
  const rnd=mulberry32(opt.seed||1),ri=n=>Math.floor(rnd()*n);
  const L=M.L,base=Int16Array.from(S0.slot),free=[];
  for(let l=0;l<L.length;l++){if(S0.pin[l]&&base[l]>=0)continue;if(opt.only&&!opt.only(l))continue;if(M.G[L[l].g].alist.length)free.push(l);else base[l]=-1;}
  if(!free.length){const o={slot:base,pin:S0.pin};o.cost=evaluate(M,base);o.viol=M.viol;return o;}
  let best=null,bestC=Infinity;
  const isFree=new Uint8Array(L.length);free.forEach(l=>{isFree[l]=1;});
  const cl=new Int32Array(L.length),co=new Int16Array(L.length);   // 這一步動了哪些節、原本在哪，退回用
  try{
  for(let rs=0;rs<RS;rs++){
    const slot=Int16Array.from(base);
    for(const l of free){const a=M.G[L[l].g].alist;slot[l]=a[ri(a.length)];}
    M.H=1000;let c0=evaluate(M,slot),curV=M.viol,curSoft=c0-1000*curV;
    if(c0<bestC){bestC=c0;best=Int16Array.from(slot);}
    const T0=30,T1=0.05;
    for(let i=0;i<N&&bestC>0;i++){
      const T=T0*Math.pow(T1/T0,i/N);
      // 違規的分數一開始很低、慢慢升到 1000：前期可以先接受暫時的衝突、跨過去找別的排法，後期才嚴格（和段考考場的做法一樣）
      M.H=Math.min(1000,15*Math.pow(1000/15,i/(0.35*N)));
      let n=0;const mv=(x,s)=>{cl[n]=x;co[n]=slot[x];n++;slot[x]=s;};
      const m=rnd(),l=free[ri(free.length)],g=M.G[L[l].g],o1=slot[l];
      if(m<0.55||free.length<2){const ns=g.alist[ri(g.alist.length)];if(ns===o1)continue;mv(l,ns);}
      else if(m<0.9){const l2=free[ri(free.length)],o2=slot[l2],g2=M.G[L[l2].g];   // 兩節互換
        if(l2===l||o1===o2||g2===g||!g.allowed[o2]||!g2.allowed[o1])continue;mv(l,o2);mv(l2,o1);}
      else{const b=g.alist[ri(g.alist.length)];if(b===o1)continue;   // 兩個時段整批對調：卡在一起的一串課一起搬，比一節一節搬容易解開
        for(const x of free){const s=slot[x],gx=M.G[L[x].g];if(s===o1&&gx.allowed[b])mv(x,b);else if(s===b&&gx.allowed[o1])mv(x,o1);}
        if(!n)continue;}
      const c=evaluate(M,slot),v=M.viol,soft=c-M.H*v,cur=curSoft+M.H*curV;
      if(c<=cur||rnd()<Math.exp((cur-c)/T)){curSoft=soft;curV=v;const tr=soft+1000*v;if(tr<bestC){bestC=tr;best.set(slot);}}
      else for(let j=n-1;j>=0;j--)slot[cl[j]]=co[j];
    }
    if(bestC===0)break;
  }
  }finally{M.H=1000;}   // 其他地方用 evaluate 時一律是 1000
  let cur=evaluate(M,best),imp=true,pass=0;
  while(imp&&pass++<5){imp=false;
    for(const l of free){const g=M.G[L[l].g],o=best[l];let b=o;
      for(const s of g.alist){if(s===o)continue;best[l]=s;const c=evaluate(M,best);if(c<cur-1e-9){cur=c;b=s;}}
      best[l]=b;if(b!==o)imp=true;}
  }
  const res={slot:best,pin:S0.pin};res.cost=evaluate(M,best);res.viol=M.viol;return res;
}

function toState(M,D){
  const n=M.L.length,S={slot:new Int16Array(n).fill(-1),pin:new Uint8Array(n),rfix:new Int16Array(n).fill(-1)};
  M.L.forEach((x,l)=>{const a=D.assign&&D.assign[M.G[x.g].ref.id],e=a&&a[x.k];if(!e)return;
    if(e.r){const r=D.rooms.findIndex(o=>o.id===e.r);if(r>=0)S.rfix[l]=r;}
    if(!e.s)return;const s=M.key2s(e.s);if(s>=0){S.slot[l]=s;S.pin[l]=e.pin?1:0;}});
  M.L.forEach((x,l)=>{const f=M.G[x.g].ref.fixed;if(!Array.isArray(f)||x.k>=f.length)return;const s=M.key2s(f[x.k]);if(s>=0){S.slot[l]=s;S.pin[l]=1;}});   // 固定時段
  return S;
}
function fromState(M,S){const a={};M.L.forEach((x,l)=>{const id=M.G[x.g].ref.id,e={s:S.slot[l]>=0?M.s2key(S.slot[l]):'',pin:!!S.pin[l]};if(S.rfix&&S.rfix[l]>=0&&M.D.rooms[S.rfix[l]])e.r=M.D.rooms[S.rfix[l]].id;(a[id]=a[id]||[])[x.k]=e;});return a;}

/* 把 l 這一節放到 s 會不會多出違規 */
function canPlace(M,slot,l,s){
  const o=slot[l];slot[l]=-1;evaluate(M,slot);const v0=M.viol;
  slot[l]=s;evaluate(M,slot);const v1=M.viol;slot[l]=o;return v1<v0;
}

/* 分配教室，順序是：這一節或這一組指定的教室（硬性）→ 老師偏好的教室（依志願序）→ 平常用的教室 → 備用教室。
   沒填偏好的老師輪流分一間「常用教室」，而且先避開別人的第一志願，讓有偏好的老師比較拿得到 */
function assignRooms(M,slot){
  const room=new Int16Array(M.L.length).fill(-1);if(!M.NR)return room;
  const order=M.roomOrder||[...Array(M.NR).keys()],spare=M.spareR||[],pref=M.pref||[],home={};
  const main=order.filter(i=>!spare[i]),first=new Set();M.rts.forEach(t=>{if(pref[t]&&pref[t].length)first.add(pref[t][0]);});
  const open=main.filter(i=>!first.has(i)),pool=open.length?open:main.length?main:order;let k=0;
  M.rts.forEach(t=>{if(!(pref[t]&&pref[t].length))home[t]=pool[k++%pool.length];});
  const want=l=>{const t=M.G[M.L[l].g].t;return t>=0&&pref[t]?pref[t]:[];};
  const by={};M.L.forEach((x,l)=>{if(slot[l]>=0)(by[slot[l]]=by[slot[l]]||[]).push(l);});
  for(const s in by){const used=new Uint8Array(M.NR),rest=[];
    by[s].forEach(l=>{const g=M.G[M.L[l].g],fx=M.lroom&&M.lroom[l]>=0&&M.lroom[l]<M.NR?M.lroom[l]:g.room;if(fx>=0&&!used[fx]){used[fx]=1;room[l]=fx;}else rest.push(l);});
    // 一輪一輪照志願分：這一節每位老師的第一志願先分完，才輪到第二志願，避免有人第二志願搶走別人的第一志願
    const nw=rest.reduce((n,l)=>Math.max(n,want(l).length),0);
    for(let r=0;r<nw;r++)rest.forEach(l=>{if(room[l]>=0)return;const w=want(l)[r];if(w!=null&&!used[w]){used[w]=1;room[l]=w;}});
    rest.forEach(l=>{if(room[l]>=0)return;const g=M.G[M.L[l].g];let r=g.room>=0?-1:(home[g.t]!=null?home[g.t]:-1);
      if(r<0||used[r]){r=-1;for(const i of order)if(!used[i]){r=i;break;}}   // order 已經把備用教室排在最後
      if(r>=0){used[r]=1;room[l]=r;}});}
  return room;
}

/* ───── 試排草稿與確定的版本：排法用短字串存，資料才不會越存越大 ───── */
// assign {組id:[{s:'0-1',pin:true,r:'A'}]} → {組id:'0-1*@A,2-3'}；* 是固定、@ 後面是這一節指定的教室
function packAssign(a){const o={};for(const id in a||{})o[id]=(a[id]||[]).map(e=>!e?'':(e.s||'')+(e.pin?'*':'')+(e.r?'@'+e.r:'')).join(',');return o;}
function unpackAssign(o){const a={};for(const id in o||{})a[id]=String(o[id]).split(',').map(x=>{const m=x.match(/^([^*@]*)(\*?)(?:@(.*))?$/)||[];const e={s:m[1]||'',pin:!!m[2]};if(m[3])e.r=m[3];return e;});return a;}
// 一份排法的摘要：排了幾節、幾個衝突、不理想的程度；彈性鎖課時加上原班鎖得到課的比例。rfix 是這份排法自己指定的教室
function schedStats(M,slot,rfix){
  const keep=M.lroom;if(rfix)M.lroom=rfix;const out=[],cost=evaluate(M,slot,out),viol=M.viol;
  const r={placed:0,un:0,probs:out.filter(o=>o.k!=='un').length,cost,soft:Math.round((cost-viol*1000)*10)/10,locks:null};
  for(let l=0;l<slot.length;l++){if(slot[l]>=0)r.placed++;else r.un++;}
  if(M.flex){const A=assignLocks(M,slot);r.locks={pulled:A.pulled,open:A.open.length};}
  M.lroom=keep;return r;
}
// 兩份排法有幾節換了時段（同一份 M 下逐節比）
function schedDiff(a,b){let n=0;for(let l=0;l<a.length;l++)if(a[l]!==b[l])n++;return n;}

/* 給教務處的鎖課表：哪一班、哪一科、哪幾節必須排這一科 */
function lockTable(M,slot){
  if(M.flex){const rs={};assignLocks(M,slot).locks.forEach(k=>{const key=k.cls+'|'+k.sj,r=rs[key]=rs[key]||{cls:k.cls,subject:k.sj,teacher:M.T[k.t].name,slots:[],groups:new Set()};r.slots.push(k.s);k.groups.forEach(n=>r.groups.add(n));});
    return Object.values(rs).map(r=>({cls:r.cls,subject:r.subject,teacher:r.teacher,slots:r.slots.sort((a,b)=>a-b),groups:[...r.groups]})).sort((a,b)=>a.cls.localeCompare(b.cls)||a.subject.localeCompare(b.subject));}
  const rows={};
  M.L.forEach((x,l)=>{const s=slot[l],g=M.G[x.g];if(s<0)return;
    g.locks.forEach(k=>{const key=k.cls+'|'+g.subject,r=rows[key]=rows[key]||{cls:k.cls,subject:g.subject,t:k.t,slots:new Set(),groups:new Set()};r.slots.add(s);r.groups.add(g.name);});});
  return Object.values(rows).map(r=>({cls:r.cls,subject:r.subject,teacher:r.t>=0?M.T[r.t].name:'',slots:[...r.slots].sort((a,b)=>a-b),groups:[...r.groups]}))
    .sort((a,b)=>a.cls.localeCompare(b.cls)||a.subject.localeCompare(b.subject));
}

/* ───── 老師優先：先開課、排老師的鐘點，再把學生編進課裡 ───── */
// 學生需要上、但還沒進任何一門課的科目
function needList(D){
  const inSub={};D.groups.forEach(g=>g.students.forEach(id=>{(inSub[id]=inSub[id]||{})[g.subject]=1;}));
  const o=[];D.students.forEach(s=>(s.needs||[]).forEach(sj=>{if(!(inSub[s.id]&&inSub[s.id][sj]))o.push({id:s.id,subject:sj});}));return o;
}
// 這位學生這一科可以去哪幾門課（同科目、年級相符）
function candidates(D,stu,subject){
  const gr=gradeOfCls(stu.cls),cls={};D.students.forEach(s=>{cls[s.id]=s.cls;});
  return D.groups.filter(g=>{if(g.on===false||g.subject!==subject)return false;if(g.grade)return +g.grade===gr;
    const gs=g.students.map(id=>gradeOfCls(cls[id])).filter(Boolean);return !gs.length||gs.includes(gr);});
}
// 把待安排的學生放進「放進去之後衝堂最少、人數最平均」的那門課；課表已經排好時會照實際時段判斷
function placeStudents(D,opt){
  opt=opt||{};const byId={};D.students.forEach(s=>{byId[s.id]=s;});
  const cost=g=>{const M=compile(D),S=toState(M,D);evaluate(M,S.slot);let c=M.viol*1000;
    M.G.forEach(x=>{if(!x.per)return;c+=x.warn.length*300;});return c+g.students.length*2;};
  const todo=needList(D).filter(n=>!opt.filter||opt.filter(byId[n.id])).map(n=>({n,c:candidates(D,byId[n.id],n.subject)})).sort((a,b)=>a.c.length-b.c.length);
  const left=[];let placed=0;
  todo.forEach(({n,c})=>{if(!c.length){left.push(n);return;}
    let best=null,bc=Infinity;c.forEach(g=>{g.students.push(n.id);const v=cost(g);g.students.pop();if(v<bc){bc=v;best=g;}});
    best.students.push(n.id);placed++;});
  return {placed,left};
}

/* ───── AI 排課接口：把題目整理成去識別化的文字，AI 回傳 JSON 後再套回來（之後可改成直接呼叫 API）───── */
function aiProblem(D){
  const sc={},tc={},P=D.periods;D.students.forEach((s,i)=>{sc[s.id]='S'+(i+1);});D.teachers.forEach((t,i)=>{tc[t.id]='T'+(i+1);});
  const setOff={};(D.sets||[]).forEach(x=>(x.students||[]).forEach(id=>{setOff[id]=(setOff[id]||[]).concat(x.off||[]);}));
  const OB=D.offBy||{},pend={};needList(D).forEach(n=>{(pend[n.id]=pend[n.id]||[]).push(n.subject);});
  const st=D.settings||{},cs={};for(const k in D.classSubj)if(tc[D.classSubj[k]])cs[k]=tc[D.classSubj[k]];
  // 每門課「可以排的時段」直接用 compile 算好的 alist：班級不能鎖課、鎖課方式、外加／抽離……這些規則 AI 不用自己推
  const M=compile(D);
  const P0={
    slots:DAYS.flatMap((d,di)=>P.map(p=>({k:di+'-'+p.id,name:'週'+d+p.name,extra:!!p.extra}))),
    blocked:D.blocked,rooms:D.rooms.length,
    rules:{maxPerDayPerCourse:st.maxDay>0?st.maxDay:1,teacherMaxConsecutive:st.tRun>0?st.tRun:3,studentMaxPerDay:st.sDay>0?st.sDay:3,lockMode:M.flex?'flex':'same'},
    teachers:D.teachers.map(t=>({id:tc[t.id],role:t.role,hours:t.hours||0,off:t.off})),
    courses:D.groups.map((g,i)=>({id:'C'+(i+1),on:g.on!==false,subject:g.subject,grade:g.grade||'',mode:g.mode,teacher:tc[g.teacher]||null,perWeek:g.per,
      members:g.students.map(id=>sc[id]).filter(Boolean),fixed:(D.assign[g.id]||[]).filter(e=>e&&e.pin&&e.s).map(e=>e.s),
      allowedSlots:M.G[i].alist.map(M.s2key)})).filter(c=>c.on),
    students:D.students.map(s=>({id:sc[s.id],cls:String(s.cls),toPlace:pend[s.id]||[],
      off:[...new Set([].concat(OB['g:'+gradeOfCls(s.cls)]||[],OB['c:'+s.cls]||[],OB['s:'+s.id]||[],setOff[s.id]||[]))]})),
    classSubjectTeacher:cs
  };
  // 代號是陣列位置：資料一改就會對錯人。所以把題目內容和每個代號對到的 id 一起算成版本 v，套回來時要一樣才准套用
  const codes={S:{},T:{},C:{}};D.students.forEach((s,i)=>{codes.S['S'+(i+1)]=s.id;});D.teachers.forEach((t,i)=>{codes.T['T'+(i+1)]=t.id;});D.groups.forEach((g,i)=>{codes.C['C'+(i+1)]=g.id;});
  const out=Object.assign({v:aiHash(JSON.stringify(P0)+JSON.stringify(codes))},P0);
  Object.defineProperty(out,'codes',{value:codes,enumerable:false});   // 不送給 AI，只留在本機對照
  return out;
}
// 兩組 FNV-1a 合成 16 位十六進位；只用來判斷「資料有沒有變」，不是加密
function aiHash(s){let a=0x811c9dc5,b=0x01000193^0x5bd1e995;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,16777619)>>>0;b=Math.imul(b^c,0x5bd1e995)>>>0;b^=b>>>15;}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function aiPrompt(D){
  return `你是國中資源班的排課助理。下面的 JSON 是題目（人名都已換成代號），請排出一份沒有衝堂的課表。

做法（老師優先）：
1. 先替每門課 courses 決定時段：每門課要排 perWeek 節，時段用 slots 裡的 k。fixed 是已經固定的時段，一定要保留。
2. 再把 students 裡 toPlace 列出的科目，分配到同科目、同年級（grade 空白表示不限）的課，寫進該課的 members。已經在 members 裡的學生不要移動，也不能拿掉。

一定要遵守：
- 每門課只能排在它自己的 allowedSlots 裡（系統已經扣掉外加／抽離、blocked、老師與學生的 off、班級不能鎖課等規則）。新加進課的學生，他的 off 時段也要避開。
- mode 是「抽離」的課只能排在 extra 為 false 的時段；「外加」只能排在 extra 為 true 的時段。
- blocked 的時段都不能排。課的老師、課裡每位學生的 off 時段都不能排。
- 同一位老師同一個時段只能有一門課；同一位學生同一個時段只能在一門課。
- 抽離課會佔用學生原班同一科的時間：classSubjectTeacher["班級|科目"] 是那個班該科的任課老師，他的 off 時段也不能排；同一位任課老師同一個時段不能被兩個不同的班同時用到；同一個班同一個時段不能被兩個不同科目的抽離課用到。
- 同一個時段的課數不能超過 rooms。
盡量做到：rules 裡的三個上限、每位老師每天節數平均。

只回覆一段 JSON，不要其他文字，格式：
{"v":"題目裡的 v 原樣抄回","slots":{"C1":["0-1","2-3"]},"members":{"C1":["S1","S2"]}}
slots 要包含每一門課；members 只要列出要新增進課的學生。

題目：
`+JSON.stringify(aiProblem(D));
}
// 把 AI 的回覆套回資料。v 是題目的版本（呼叫端記下的，或 AI 抄回來的），和現在的資料不一樣就拒絕，免得代號對錯人。
// 學生只會「加進」課裡、不會被拿掉；年級或科目不對、時段不在這門課可以排的範圍，都不套用並列在 bad。
// 回傳 {courses, lessons, members, bad:[說明]}；排得好不好交給原本的衝堂檢查
function aiApply(D,text,v){
  const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a<0||b<=a)throw new Error('找不到 JSON');
  const R=JSON.parse(text.slice(a,b+1)),cur=aiProblem(D),want=v||R.v;
  if(want!==cur.v){const e=new Error(want?'題目已經過期：複製題目之後資料改過了，請重新複製題目給 AI':'回覆裡沒有題目版本 v，請重新複製題目給 AI');e.code='stale';throw e;}
  const byId={},gid={};D.students.forEach(s=>{byId[s.id]=s;});D.groups.forEach(g=>{gid[g.id]=g;});
  const stu=c=>byId[cur.codes.S[c]],grp=c=>gid[cur.codes.C[c]],lab=s=>s.cls+' '+s.name;
  let nm=0,nl=0;const bad=[],mem=R.members||{},sl=R.slots||{};
  for(const c in mem){const g=grp(c);if(!g||!Array.isArray(mem[c])){bad.push('不認得的課 '+c);continue;}
    if(g.on===false){bad.push(g.name+' 這學期不開，不能加學生');continue;}
    mem[c].forEach(x=>{const s=stu(x);if(!s){bad.push(g.name+'：不認得的學生 '+x);return;}if(g.students.includes(s.id))return;
      if(!needList(D).some(n=>n.id===s.id&&n.subject===g.subject)){bad.push(lab(s)+' 不需要再排'+g.subject+'，沒有加進 '+g.name);return;}
      if(!candidates(D,s,g.subject).includes(g)){bad.push(lab(s)+' 的年級和 '+g.name+' 不同，沒有加進去');return;}
      g.students.push(s.id);nm++;});}
  const M=compile(D),gi={};D.groups.forEach((g,i)=>{gi[g.id]=i;});   // 學生加完再算可排時段：新學生的不排課也要算進去
  for(const c in sl){const g=grp(c);if(!g||!Array.isArray(sl[c])){bad.push('不認得的課 '+c);continue;}
    const G=M.G[gi[g.id]],arr=(D.assign[g.id]||[]).filter(e=>e&&e.pin&&e.s),used=new Set(arr.map(e=>e.s));
    sl[c].forEach(k=>{k=String(k);const s=M.key2s(k);if(s<0){bad.push(g.name+'：看不懂的時段 '+k);return;}
      if(!G.allowed[s]){bad.push(g.name+' 不能排在'+M.sn(s)+'（'+why(M,G.gi,s).join('、')+'）');return;}
      if(arr.length>=g.per||used.has(k))return;used.add(k);arr.push({s:k,pin:false});nl++;});
    D.assign[g.id]=arr;}
  return {courses:Object.keys(sl).length,lessons:nl,members:nm,bad};
}

/* 貼上「課程領域分組及節數一覽表」：領域、年級、組別、抽離或外加、學生名單、節數、人數、人次、授課教師。
   每一組各自的節數照表上的來；學生名單可以是遮名的（704林○哲），用班級＋姓＋名字最後的字對回名冊。
   同一列右邊如果有「教師…總節數」的鐘點表，也一起讀成老師的基本鐘點。 */
function importCourseTable(D,text){
  const R={added:0,updated:0,members:0,miss:[],teachers:0,hours:0,kept:[],coT:[]},MK=/[○〇ＯO＊*]/;
  // 名字用 normName 比對：匯入學生名單時已經自動建好的個管老師（王）和表上的「王老師」是同一位，不會重複新增
  const tOf=name=>{let t=teaByName(D,name);if(!t){t=newTeacher(D,name,'資源班');R.teachers++;}return t;};
  let ti=-1,hi=-1;
  String(text).split(/\r?\n/).forEach(line=>{const c=line.split('\t').map(x=>x.trim());
    const a=c.indexOf('教師'),b=c.indexOf('總節數');
    if(a>=0&&b>a){ti=a;hi=b;}else if(ti>=0&&c[ti]&&+c[hi]>0&&!/節數|合計/.test(c[ti])){tOf(c[ti]).hours=+c[hi];R.hours++;}
    const per=+c[5];if(!c[0]||!c[2]||!(per>0)||/領域|名稱/.test(c[0]))return;
    const subject=canonSubj(D,c[0]),grade=/^([1-9]|1[0-2])$/.test(c[1])?c[1]:'',name=grade+c[2]+subject,ids=[],miss0=R.miss.length;
    (c[4]||'').split(/[、,，;；\/\s]+/).filter(Boolean).forEach(m=>{const mm=m.match(/^(\d{3,4})[-－]?\d{0,2}(\D.*)$/);if(!mm){R.miss.push(m);return;}
      const nm=mm[2],k=nm.search(MK),f=k<0?nm:nm.slice(0,k),l=k<0?'':nm.replace(/^.*[○〇ＯO＊*]/,'');
      const hit=D.students.filter(s=>String(s.cls)===mm[1]&&(k<0?s.name===nm:s.name.length>=f.length+l.length&&s.name.startsWith(f)&&s.name.endsWith(l)));
      if(hit.length===1){if(!ids.includes(hit[0].id))ids.push(hit[0].id);}else R.miss.push(m);});
    let g=D.groups.find(x=>x.name===name);
    const isNew=!g;
    if(g)R.updated++;else{g={id:uid('g'),name,subject,teacher:'',per,students:[],mode:'抽離',room:'',on:true,grade};D.groups.push(g);R.added++;}
    g.subject=subject;g.grade=grade;g.per=Math.min(15,per);
    // 表上只分抽離、外加；已經設成「不鎖課」的保留。彈性鎖課時，不在鎖課科目裡的新課（例：社會技巧）預設不鎖課
    const caps=Object.keys((D.settings||{}).lockCap||{});
    if(/外加/.test(c[3]||''))g.mode='外加';else if(g.mode!=='不鎖課')g.mode=(isNew&&D.settings.lockMode==='flex'&&caps.length&&!caps.includes(subject))?'不鎖課':'抽離';
    // 兩位老師（王老師、李老師／王/李）：第一位當授課老師，其他的列出來讓人決定
    if(c[8]){const ts=c[8].split(/[、,，\/／;；&＆+＋]+|\s{2,}/).map(x=>x.trim()).filter(Boolean);
      if(ts.length){g.teacher=tOf(ts[0]).id;if(ts.length>1)R.coT.push(name+'：'+ts[0]+' 當授課老師，另外還有 '+ts.slice(1).join('、'));}}
    R.members+=ids.length;
    // 表上有名字對不到名冊時，原本在課裡、這次沒對到的學生先留著（可能就是對不到的那幾位），列出來讓人確認
    if(!isNew&&R.miss.length>miss0)g.students.filter(id=>!ids.includes(id)).forEach(id=>{const s=D.students.find(x=>x.id===id);if(!s)return;ids.push(id);R.kept.push(name+'：'+s.cls+' '+s.name+'（表上沒找到）');});
    g.students=ids;
    ids.forEach(id=>{const s=D.students.find(x=>x.id===id);if(!Array.isArray(s.needs))s.needs=[];if(!s.needs.includes(subject))s.needs.push(subject);});});
  return R;
}

/* 配鎖課的精確搜尋（assignLocks 內部用）。增廣搜尋多半已經是最好的，但這個問題同時有「老師一節只能被一班鎖」
   和「一班一科最多鎖幾節」兩種限制，偶爾會差一兩節。做法：
   1. 算上限：每一班自己最多能鎖幾節（只看這一班的老師有沒有空、各科上限），加起來。增廣搜尋已經到上限就結束。
   2. 沒到上限才分支定界：一班一班試，每一步用「這一班剩下的最多還能鎖幾節＋後面各班的上限」剪枝。
      最多試 nodes 步（預設 20000），找不到更好的就維持增廣搜尋的結果，所以只會更好、不會更差。
   目標：鎖到的節數最多，其次同一科的最多。手排鎖課（fixed）不動。 */
function exactLocks(M,list,byC,K){
  const {put,rem,own,NS}=K,LIMIT=K.nodes||20000,free=list.filter(o=>!o.fixed&&o.opt.length);if(!free.length)return;
  const val=os=>{let n=0,s=0;os.forEach(o=>{if(o.pick){n++;if(o.want.has(o.pick.sj))s++;}});return n*100+s;};
  const keep=free.map(o=>o.pick);let best=val(free),bestPick=keep;
  free.forEach(o=>put(o,null));   // 先全部拿掉，只留手排鎖課，算上限和搜尋都從這裡開始
  // 一班之內：節次配科目的最大配對（每一科的容量是還能鎖的節數）
  const match=(os,c)=>{const asg=new Map();let n=0;
    const tryM=(o,seen)=>{for(const x of o.opt){if(own.has(x.t*NS+o.s)||seen.has(x.sj))continue;seen.add(x.sj);
        const hold=[];asg.forEach((sj,p)=>{if(sj===x.sj)hold.push(p);});
        if(hold.length<rem(c,x.sj)){asg.set(o,x.sj);return true;}
        for(const h of hold)if(tryM(h,seen)){asg.set(o,x.sj);return true;}}
      return false;};
    for(const o of os)if(tryM(o,new Set()))n++;return n;};
  const cls=[...new Set(free.map(o=>o.c))],groups=cls.map(c=>free.filter(o=>o.c===c)),stat=groups.map((g,i)=>match(g,cls[i])),suf=new Array(cls.length+1).fill(0);
  for(let i=cls.length-1;i>=0;i--)suf[i]=suf[i+1]+stat[i];
  if(Math.floor(best/100)>=suf[0]){free.forEach((o,i)=>put(o,keep[i]));return;}
  const flat=[],ci=[],pos=[];groups.forEach((g,i)=>g.forEach((o,k)=>{flat.push(o);ci.push(i);pos.push(k);}));
  let nodes=0;
  const dfs=(i,n,s)=>{if(++nodes>LIMIT)return;
    if(i===flat.length){const v=n*100+s;if(v>best){best=v;bestPick=flat.map(o=>o.pick);}return;}
    const o=flat[i],ub=n+match(groups[ci[i]].slice(pos[i]),o.c)+suf[ci[i]+1];
    if(ub*100+ub<=best)return;   // 同一科的節數不會超過鎖到的節數，所以最多 ub*101
    for(const x of o.opt){if(own.has(x.t*NS+o.s)||rem(o.c,x.sj)<=0)continue;put(o,x);dfs(i+1,n+1,s+(o.want.has(x.sj)?1:0));put(o,null);if(nodes>LIMIT)return;}
    dfs(i+1,n,s);};
  dfs(0,0,0);
  const pick=bestPick===keep?keep:bestPick,order=bestPick===keep?free:flat;
  order.forEach((o,i)=>put(o,pick[i]));
}

/* 配鎖課：課表排好之後，替每個「有學生被抽離的班級 × 節次」決定請教務處鎖哪一科。
   先盡量鎖和資源班同一科；鎖不到（老師不排課、被別班鎖走、該科節數用完）就改鎖其他主科；都不行就列為鎖不到。
   同一位老師同一節只能被一個班鎖。回傳 locks、open（鎖不到的）、warn（連堂提醒）。 */
function assignLocks(M,slot,opt){const K_BUDGET=opt&&opt.exact===false?120:400;   // 每次增廣搜尋最多試幾步；快速模式（收尾時大量呼叫）少一點
  const {NS,NP,G,L}=M,P=new Map(),busy=new Set();
  for(let l=0;l<L.length;l++){const s=slot[l],g=G[L[l].g];if(s<0)continue;if(g.t>=0)busy.add(g.t*NS+s);if(!g.need)continue;
    g.locks.forEach(k=>{const key=k.c*NS+s;let o=P.get(key);if(!o)P.set(key,o={c:k.c,cls:k.cls,s,want:new Set(),groups:new Set(),pick:null});o.want.add(g.subject);o.groups.add(g.name);});}
  const used={},own=new Map(),rem=(c,sj)=>M.capOf(sj)-(used[c+'|'+sj]||0);
  // 把 o 改成鎖 x（null 是不鎖），同時維護「老師這一節被誰鎖」和「這一班這一科鎖了幾節」。每一步記在 log，搜尋失敗時整串退回
  const log=[];
  const put=(o,x)=>{const old=o.pick;if(old){used[o.c+'|'+old.sj]--;if(own.get(old.t*NS+o.s)===o)own.delete(old.t*NS+o.s);}
    o.pick=x;if(x){used[o.c+'|'+x.sj]=(used[o.c+'|'+x.sj]||0)+1;own.set(x.t*NS+o.s,o);}};
  const set=(o,x)=>{log.push([o,o.pick]);put(o,x);},back=n=>{while(log.length>n){const e=log.pop();put(e[0],e[1]);}};
  const list=[...P.values()].sort((a,b)=>a.s-b.s||a.c-b.c),byC={};
  list.forEach(o=>{const w=x=>o.want.has(x.sj)?1:0;o.opt=(M.klay[o.c]&&M.klay[o.c][o.s])?[]:M.copt[o.c].filter(x=>!M.off[x.t][o.s]&&!busy.has(x.t*NS+o.s)).sort((a,b)=>w(b)-w(a));(byC[o.c]=byC[o.c]||[]).push(o);});
  /* 增廣搜尋：替 o 找一個（和現在不同的）科目來鎖。會卡住的資源有兩種，都可以「請別人讓」：
     1. 那位老師這一節已經被別班鎖了 → 請那一班改鎖別的；
     2. 這一班這一科已經鎖到上限 → 請這一班另一節改鎖別科。
     讓得動才算成功，否則把這一串都退回。seen 讓同一次搜尋裡每一節只被請一次，搜尋量才不會爆掉
     （所以偶爾會漏掉更好的配法，交給後面的 exactLocks 補）；budget 是保險，最壞情況也不會卡住 */
  let budget=0;
  const aug=(o,seen,same,depth)=>{
    for(const x of o.opt){if(same&&!o.want.has(x.sj))continue;if(o.pick&&o.pick.sj===x.sj)continue;
      if(--budget<0)return false;
      const mk=log.length,w=own.get(x.t*NS+o.s),other=w&&w!==o;
      if(other&&(w.fixed||seen.has(w)||depth>=12))continue;
      if(other){seen.add(w);set(w,null);}
      set(o,x);
      let ok=!other||aug(w,seen,same,depth+1);
      if(ok&&rem(o.c,x.sj)<0){ok=false;
        for(const o2 of byC[o.c]){if(o2===o||!o2.pick||o2.pick.sj!==x.sj||o2.fixed||seen.has(o2)||depth>=12)continue;
          const mk2=log.length;seen.add(o2);if(aug(o2,seen,same,depth+1)){ok=true;break;}back(mk2);}}
      if(ok)return true;back(mk);}
    return false;};
  // 這一班能鎖的科目都已經鎖滿：多鎖一節不可能，不用搜尋（大部分鎖不到的節都是這種，省很多時間）
  const full=c=>{const seen=new Set();for(const x of M.copt[c]){if(seen.has(x.sj))continue;seen.add(x.sj);if(rem(c,x.sj)>0)return false;}return true;};
  const tryA=(o,same)=>{if(full(o.c))return false;const mk=log.length;budget=K_BUDGET;if(aug(o,new Set([o]),same,0))return true;back(mk);return false;};
  // 手排鎖課優先：這一節有學生被抽離、而且那位老師沒有在資源班上課，就照手排的鎖
  const idle=[];
  if(M.lfix&&M.lfix.size)M.lfix.forEach((f,key)=>{const o=P.get(key);
    if(!o){idle.push({cls:f.cls,s:f.s,t:M.T[f.t].name,sj:f.sj});return;}
    if(busy.has(f.t*NS+o.s)||own.has(f.t*NS+o.s))return;
    const x=M.copt[o.c].find(y=>y.t===f.t)||{sj:f.sj,t:f.t};set(o,x);o.fixed=true;});
  list.forEach(o=>{if(!o.pick)tryA(o,true);});
  list.forEach(o=>{if(!o.pick)tryA(o,false);});
  if(!(opt&&opt.exact===false))exactLocks(M,list,byC,{put,rem,own,NS,nodes:opt&&opt.nodes});
  // 連堂：某一科鎖到只剩 1 節（或全鎖）時，鎖的節次裡要有兩節連在一起，不然教務處排不出連堂；沒有就在旁邊多鎖一節
  const warn=(M.lfixAmb||[]).map(a=>a.cls+' '+M.sn(a.s)+' 手排鎖課的「'+a.t+'」名冊裡有兩位以上同名，分不出是哪一位，這一節先不照手排。請到名冊把名字改成分得出來的寫法（例：王小明（國））'),extra=[];
  if(M.dbl.size){const byC={};list.forEach(o=>{if(o.pick&&M.dbl.has(o.pick.sj)){const k=o.c+'|'+o.pick.sj;(byC[k]=byC[k]||[]).push(o);}});
    for(const key in byC){if(byC[key].some(o=>o.fixed))continue;const a=byC[key],c=a[0].c,sj=a[0].pick.sj,t=a[0].pick.t,capv=M.capOf(sj);if(capv>=99||a.length<capv-1)continue;
      const has=new Set(a.map(o=>o.s)),adj=s=>[s%NP&&!M.brk[(s-1)%NP]?s-1:-1,(s+1)%NP&&!M.brk[s%NP]?s+1:-1].filter(x=>x>=0);   // 中間隔著午休的兩節不算連堂
      if(a.some(o=>adj(o.s).some(x=>has.has(x))))continue;
      let done=false;
      if(a.length<capv)for(const o of a){for(const s2 of adj(o.s)){if(M.coff[c][s2]||M.off[t][s2]||busy.has(t*NS+s2)||own.has(t*NS+s2))continue;const p=P.get(c*NS+s2);if(p&&p.pick)continue;
          if(p)set(p,{sj,t});else{const e={c,cls:a[0].cls,s:s2,want:new Set(),groups:new Set(),pick:null,extra:true};set(e,{sj,t});extra.push(e);}done=true;break;}
        if(done)break;}
      if(!done){   // 旁邊加不了：把其中一節改鎖別科，再不行就不鎖，讓原班留得出兩節排連堂
        let n=a.length;const alt=o=>o.opt.find(x=>x.sj!==sj&&rem(c,x.sj)>0&&!own.has(x.t*NS+o.s));
        a.slice().sort((p,q)=>(alt(q)?1:0)-(alt(p)?1:0)).forEach(o=>{if(n<capv-1)return;const x=alt(o);own.delete(t*NS+o.s);
          if(x)set(o,x);else{used[c+'|'+sj]--;o.pick=null;o.dropped=sj;}n--;});
        warn.push(a[0].cls+' 的'+sj+'原本會鎖到只剩 '+(capv-a.length)+' 節又沒有連堂，已改成只鎖 '+n+' 節');}}}
  const locks=list.concat(extra).filter(o=>o.pick).map(o=>({c:o.c,cls:o.cls,s:o.s,sj:o.pick.sj,t:o.pick.t,same:o.want.has(o.pick.sj),extra:!!o.extra,fixed:!!o.fixed,groups:[...o.groups]}));
  const open=list.filter(o=>!o.pick).map(o=>({cls:o.cls,s:o.s,groups:[...o.groups],why:o.dropped?'為了讓原班留得出'+o.dropped+'連堂，這一節不鎖':(M.klay[o.c]&&M.klay[o.c][o.s])?'這一節班級不能鎖課':!M.copt[o.c].length?'還沒填這一班的任課老師':!o.opt.length?'主科老師這一節都不排課':'主科老師被別班鎖走，或該科可以鎖的節數用完'}));
  return {locks,open,warn,idle,pulled:list.length,same:locks.filter(k=>k.same).length,fixed:locks.filter(k=>k.fixed).length,fixAll:M.lfix?M.lfix.size:0};
}

/* 彈性鎖課的收尾：排完之後逐節試著換時段，只要不增加衝堂、課表品質不明顯變差，而鎖不到的節次變少（或同科變多）就換過去 */
function refineLocks(M,S,opt){
  opt=opt||{};const slot=Int16Array.from(S.slot),sc=()=>{const A=assignLocks(M,slot,{exact:false});return A.open.length*20-A.same-A.fixed*8;};   // 也盡量回到手排鎖課的節次
  // 課表品質最多只能比一開始差 tol（總共），不是每換一次都再放寬，不然換很多次會越走越差
  const c0=evaluate(M,slot),v0=M.viol,tol=opt.tol!=null?opt.tol:3;let b=sc();
  for(let pass=0;pass<(opt.passes||2);pass++){let imp=false;
    for(let l=0;l<M.L.length;l++){if(S.pin[l]||slot[l]<0||(opt.only&&!opt.only(l)))continue;const g=M.G[M.L[l].g];if(!g.need)continue;const o=slot[l];let best=o;
      for(const s of g.alist){if(s===o)continue;slot[l]=s;const c=evaluate(M,slot);if(M.viol>v0||c>c0+tol)continue;const x=sc();if(x<b){b=x;best=s;}}
      slot[l]=best;if(best!==o)imp=true;}
    if(!imp)break;}
  return {slot,pin:S.pin};
}

/* 貼上不排課表：名稱、起始星期、結束星期、首節、末節、（原因）。名稱是三四位數就是班級，其他當老師姓名。
   原因可以只寫在每一段的第一列。班級的時段預設當成「不能鎖課」（學生仍可被抽離，排課時盡量避開）；
   opt.hard：原因含這些字的（例：社團）才當成學生不能被抽離，寫 * 表示全部都是。 */
/* 讀手排鎖課：「特教鎖課需求」的資料輸入（每班 7 節 × 5 天的格子裡填老師名字，左邊列科目和老師），
   或資料輸出（班級名稱、科目名稱、星期、首節、末節、教師姓名）。結果整份存在 D.lockFix。 */
function importLocks(D,text){
  const rows=String(text).split(/\r?\n/).map(l=>l.split('\t').map(x=>x.trim().replace(/^(\d+)\.0$/,'$1')));
  const reg=D.periods.filter(p=>!p.extra),pOf=n=>D.periods.find(p=>String(p.name).replace(/\s/g,'')==='第'+n+'節')||reg[n-1];
  const isSubj=v=>SUBJ_FAM.some(f=>f.includes(v))||/^(國|英|數|理|自然|社會|彈性)/.test(v)&&v.length<=4&&/文|學|化|然|會|課/.test(v);
  const R={n:0,cls:0,newT:[],bad:0},out=[],seen=new Set(),cs=new Set();
  const add=(cls,d,p,tn,sj)=>{tn=String(tn||'').trim();const per=pOf(p);
    if(!tn||/^[#\-－0]/.test(tn)||/^\d+$/.test(tn)||isSubj(tn))return;
    if(!per||!(d>=1&&d<=5)){R.bad++;return;}
    const k=(d-1)+'-'+per.id,key=cls+'|'+k;if(seen.has(key))return;seen.add(key);
    const same=D.teachers.filter(x=>x.name===tn||normName(x.name)===normName(tn));   // 同名時優先選有教這一班的那一位
    let t=same.find(x=>Object.keys(D.classSubj).some(q=>q.startsWith(cls+'|')&&D.classSubj[q]===x.id))||same[0];if(!t){t=newTeacher(D,tn,'普通班');R.newT.push(tn);}
    sj=sj?canonSubj(D,sj):'';
    if(!sj){const e=Object.keys(D.classSubj).find(q=>q.startsWith(cls+'|')&&D.classSubj[q]===t.id);sj=e?e.slice(e.indexOf('|')+1):'';}
    if(sj&&!D.classSubj[cls+'|'+sj])D.classSubj[cls+'|'+sj]=t.id;
    out.push({cls,k,t:t.name,sj});R.n++;cs.add(cls);};   // t 存名冊裡的寫法，排課時才對得回這位老師
  const hi=rows.findIndex(r=>r.includes('班級名稱')&&r.includes('教師姓名')&&r.includes('首節'));
  if(hi>=0){const h=rows[hi],ci=n=>h.indexOf(n);
    rows.slice(hi+1).forEach(r=>{const c=r[ci('班級名稱')];if(!/^\d{3,4}$/.test(c||''))return;const d=+r[ci('星期')],p1=+r[ci('首節')],p2=+r[ci('末節')]||p1;
      for(let p=p1;p<=p2;p++)add(c,d,p,r[ci('教師姓名')],r[ci('科目名稱')]);});}
  else rows.forEach((r,i)=>r.forEach((x,j)=>{if(x!=='節次'||j<2||!/^\d{3,4}$/.test(r[j-2]||'')||!/星期一|一/.test(r[j+1]||''))return;
    const cls=r[j-2],nm={};
    for(let q=i+1;q<=i+8&&q<rows.length;q++){const a=rows[q][j-2],b=rows[q][j-1];if(a&&b&&a!=='科目')nm[b]=a;}
    for(let p=1;p<=8;p++){const rr=rows[i+p];if(!rr||rr[j]!==String(p))continue;
      for(let d=1;d<=5;d++)add(cls,d,p,rr[j+d],nm[String(rr[j+d]||'').trim()]);}}));
  R.cls=cs.size;R.newT=[...new Set(R.newT)];if(R.n)D.lockFix=out;return R;
}
/* ───── 全校課表：每班一頁的課程表，底下有「科目 老師 節數」的統計，從這裡讀出各班各科老師 ───── */
const TT_SUBJ=['國語文','英語文','數學','生物','理化','地球科學','地科','歷史','地理','公民與社會','健康教育','體育','音樂','視覺藝術','表演藝術','家政','童軍','輔導','生活科技','資訊科技','本土語文','課業指導'];
const cjk=s=>String(s||'').replace(/[^一-鿿]/g,'');
/* OCR 常見的形近字：同一組裡互換只算小錯。只放辨識容易混淆的字，不放「玲／伶」這種本來就是不同名字的字 */
const TT_LIKE=['已己巳','未末','珊姍','于於','婷停','髓體','依侑','士土','日曰','戊戌戍','汩汨','崇祟','析折','人入','刀力','夭天','壬王'];
const ttLike=(a,b)=>TT_LIKE.some(g=>g.includes(a)&&g.includes(b));
// 編輯距離：少一個字、多一個字算 0.6，形近字 0.4，其他換字 1。漏字（蔡珊）、多字都對得回去
function ttDist(a,b){a=String(a);b=String(b);let p=Array.from({length:b.length+1},(x,j)=>j*0.6);
  for(let i=1;i<=a.length;i++){const c=[i*0.6];for(let j=1;j<=b.length;j++){const x=a[i-1],y=b[j-1];c[j]=Math.min(p[j]+0.6,c[j-1]+0.6,p[j-1]+(x===y?0:ttLike(x,y)?0.4:1));}p=c;}
  return Math.round(p[b.length]*10)/10;}
// 科目：完全相同或只差形近字才直接認；差一個普通的字只當候選（兩個字的科目一律待確認，例：家長≠家政、生活≠生物）。
// 兩個科目一樣像（例：類語文＝國語文或英語文）就全部回傳，交給老師名字決定。回傳陣列，ok＝不用再確認
function ttSubjCand(s){s=String(s||'').trim();const R=a=>{a.ok=true;return a;};if(TT_SUBJ.includes(s))return R([s]);const c=cjk(s);if(TT_SUBJ.includes(c))return R([c]);
  if(c.length<2)return [s];
  let bd=9,best=[];TT_SUBJ.forEach(v=>{if(v.length!==c.length)return;const d=ttDist(c,v);if(d<bd){bd=d;best=[v];}else if(d===bd)best.push(v);});
  if(bd<=0.4*Math.max(1,c.length-1)&&best.length===1)return R(best);   // 只錯形近字（髓育→體育）
  if(bd<=1){best.loose=true;return best;}                              // 錯一個普通的字：候選，要看老師名字或人工確認
  return [s];}
function ttSubjFix(s){return ttSubjCand(s)[0];}
// 舊的「同位置對上幾個字」，猜班級時還在用
const ttScore=(s,k)=>{let sc=0;for(let off=0;off<=Math.max(0,s.length-k.length);off++){let m=0;for(let i=0;i<k.length;i++)if(s[i+off]===k[i])m++;sc=Math.max(sc,m);}return sc;};
// 名字：完全相同、或多讀了雜字但裡面含有已知名字的，直接認；
// 編輯距離很小（只錯形近字、少一個字）而且明顯比第二像的近，才自動改；只差一個普通的字算「推測」；只對上一個字的不猜
function ttNameFix(raw,known,pool,exp){const s=cjk(raw);if(!s)return {t:String(raw||'').trim(),unk:true};
  if(known.has(s))return {t:s};
  for(let i=0;i+3<=s.length;i++){const x=s.slice(i,i+3);if(known.has(x))return {t:x};}
  const rank=set=>{const a=[];(set||[]).forEach(k=>{const kk=cjk(k);if(kk)a.push({k,d:ttDist(s,kk),n:kk.length});});a.sort((x,y)=>x.d-y.d);return a;};
  const close=o=>o&&Math.min(s.length,o.n)>=2&&o.d<=1&&o.d<Math.max(s.length,o.n)-1;   // 至少對上兩個字
  const K=rank(known),b1=K[0],gap=K.length>1?K[1].d-b1.d:9;
  if(b1&&b1.d<=0.6&&gap>=0.4&&Math.min(s.length,b1.n)>=2)return {t:b1.k,fix:true};
  if(exp){const e=rank([exp])[0];if(close(e))return {t:exp,guess:true};}   // 這一班任課老師名單上的那位優先
  if(pool&&pool.size){const P=rank(pool);if(close(P[0])&&(P.length<2||P[1].d-P[0].d>=0.4))return {t:P[0].k,guess:true};}
  if(close(b1)&&gap>=0.4)return {t:b1.k,guess:true};
  return {t:s,unk:true};}
// 一頁的統計文字 → [{sj,t,n,unk,guess}]。ctx.pool(科目)＝這一科可能的老師
function ttParse(text,known,ctx){ctx=ctx||{};const poolOf=s=>ctx.pool?ctx.pool(s):null,expOf=s=>ctx.exp?ctx.exp(s):null;
  const toks=String(text).replace(/[”“"'’‘。，,、:：|\[\]【】_~．·()（）;；]/g,' ').split(/\s+/).flatMap(t=>t.split(/(\d+)/)).map(t=>t.trim()).filter(Boolean);
  const out=[];let sj=null,nm=null;
  const push=n=>{const C=ttSubjCand(sj);let S=C[0],N=null,byCtx=false;
    if(C.length>1||C.loose){for(const c of C){const x=ttNameFix(nm,known,poolOf(c),expOf(c));const p=poolOf(c);if(!x.unk&&!x.guess&&p&&p.has(x.t)){S=c;N=x;byCtx=true;break;}}}
    if(!N)N=ttNameFix(nm,known,poolOf(S),expOf(S));
    if(cjk(N.t).length<2||!/[一-鿿]{2}/.test(S))return;
    // 科目只是「差一個字」的候選：三個字以上、而且老師確定教這一科才算數；兩個字的科目一律待確認
    const subjBad=C.loose&&!(byCtx&&cjk(S).length>=3);
    out.push({sj:S,t:N.t,n,unk:!!N.unk||subjBad||n>9||C.length>1&&!byCtx&&!N.guess||!TT_SUBJ.includes(S)&&!/colorful|心|家|範/.test(S),guess:!!N.guess});};
  // 節數超過 9 不截斷（12 不會變成 2），標成待確認
  toks.forEach(t=>{if(/^\d+$/.test(t)){if(sj&&nm)push(+t);sj=nm=null;return;}
    if(!sj||!/[一-鿿]{2}|colorful/i.test(sj))sj=t;else if(!nm)nm=t;else{push(1);sj=t;nm=null;}});   // 前面是雜字就丟掉
  return out;}
// 整份檔案一起讀：先讀一遍收集各科確定的老師，再用「同一科的老師」和「這一班的任課老師」補認不出來的名字
function ttParseAll(D,pages,known){
  const CS={'國語文':'國文','英語文':'英文','數學':'數學','理化':'理化'},tn=id=>{const t=D.teachers.find(x=>x.id===id);return t?t.name:'';};
  const exp=(cls,s)=>{if(!cls||!CS[s])return null;const id=D.classSubj[cls+'|'+canonSubj(D,CS[s])];return id?tn(id):null;};
  const first=pages.map(p=>({p,list:ttParse(p.text,known)}));
  const by={};first.forEach(o=>o.list.forEach(x=>{if(!x.unk&&!x.guess)(by[x.sj]=by[x.sj]||new Set()).add(x.t);}));
  return first.map(o=>{let cls=o.p.cls||ttGuessClass(D,o.list)||'';
    const list=ttParse(o.p.text,known,{exp:s=>exp(cls,s),pool:s=>{const a=new Set(by[s]||[]),e=exp(cls,s);if(e)a.add(e);return a;}});
    const c2=cls||ttGuessClass(D,list);   // 第一遍猜不出來，用補認過的名字再猜一次
    return {cls:c2,guessCls:!o.p.cls&&!!c2,list,page:o.p.page,src:o.p.src};});}
// 班級編號：三碼（年級是第一碼）或四碼（年級是前兩碼，10～12 年級）。OCR 數字常多讀一個雜字，對不上四碼就取最後三碼
function ttClassNo(s){const d=String(s||'').replace(/\D/g,''),m=d.match(/(1[0-2]\d{2})$/)||d.match(/([1-9]\d{2})$/);return m?m[1]:'';}
// 沒讀到編號時，用國英數老師對照「任課老師」猜是哪一班
function ttGuessClass(D,list){let best='',bs=0,tie=false;const cls=[...new Set(Object.keys(D.classSubj).map(k=>k.split('|')[0]))];
  const tn=id=>{const t=D.teachers.find(x=>x.id===id);return t?t.name:'';};
  const top={};list.forEach(x=>{if(!top[x.sj]||x.n>top[x.sj].n)top[x.sj]=x;});   // 每科只看節數最多的老師（第八節輔導課的不算）
  cls.forEach(c=>{let m=0;Object.values(top).forEach(x=>{const k=c+'|'+canonSubj(D,x.sj.replace('國語文','國文').replace('英語文','英文'));if(D.classSubj[k]){const n=tn(D.classSubj[k]);if(n===x.t)m++;else if(n&&ttScore(cjk(x.t),n)>=2)m+=0.6;}});
    if(m>bs){bs=m;best=c;tie=false;}else if(m===bs&&m)tie=true;});
  return bs>=2&&!tie?best:'';}
function ttKnown(D){const k=new Set(D.teachers.map(t=>t.name).concat(Object.keys(D.offPool||{})));Object.values(D.tt||{}).forEach(c=>Object.values(c.subj||{}).forEach(a=>a.forEach(x=>{if(!x[2])k.add(x[0]);})));
  return new Set([...k].filter(n=>cjk(n).length>=2&&cjk(n)===n));}
// 存進 D.tt[班級]={subj:{科目:[[老師,節數,待確認]]},src}。待確認：0 確定、1 認不出、2 推測（都要人核對）
function ttStore(D,cls,list,src){const subj={};list.forEach(x=>{const a=subj[x.sj]=subj[x.sj]||[];const o=a.find(y=>y[0]===x.t);if(o)o[1]+=x.n;else a.push([x.t,x.n,x.unk?1:x.guess?2:0]);});
  Object.values(subj).forEach(a=>a.sort((p,q)=>q[1]-p[1]));D.tt=D.tt||{};D.tt[cls]={subj,src:src||''};}
// 一班某一科的老師（節數最多的；社會、自然這類一次對好幾科）
const EXAM_TT={'國文':['國語文'],'作文':['國語文'],'國語文':['國語文'],'英文':['英語文'],'英聽':['英語文'],'英語文':['英語文'],'數學':['數學'],
  '社會':['歷史','地理','公民與社會'],'歷史':['歷史'],'地理':['地理'],'公民':['公民與社會'],'公民與社會':['公民與社會'],
  '自然':['生物','理化','地球科學','地科'],'生物':['生物'],'理化':['理化'],'地科':['地球科學','地科'],'地球科學':['地球科學','地科']};
function ttTeachers(tt,cls,subject){const c=tt&&tt[String(cls)];if(!c)return [];const want=EXAM_TT[subject]||[subject];
  return [...new Set(want.flatMap(s=>(c.subj[s]||[]).slice(0,1).map(x=>x[0])))];}
/* 新增老師：先前匯入過、但當時不在名冊裡的老師不排課時段（offPool）會自動帶上 */
function newTeacher(D,name,role){const P=D.offPool||{},pk=P[name]?name:Object.keys(P).find(k=>normName(k)===normName(name)),t={id:uid('t'),name,role,off:(P[pk]||[]).slice(),note:'',hours:0};D.teachers.push(t);return t;}
function importOff(D,text,opt){
  opt=opt||{};const R={cls:0,tea:0,cells:0,skipT:[],newT:0,bad:0};
  const kw=Array.isArray(opt.hard)?opt.hard.filter(Boolean):String(opt.hard||'').split(/[,，、\s]+/).filter(Boolean),reg=D.periods.filter(p=>!p.extra);
  const pOf=n=>D.periods.find(p=>String(p.name).replace(/\s/g,'')==='第'+n+'節')||reg[n-1];
  let why='';
  String(text).split(/\r?\n/).forEach(line=>{const c=line.split('\t').map(x=>x.trim());if(!c[0])return;
    const name=c[0].replace(/\.0$/,'');let d1=parseInt(c[1],10),d2=parseInt(c[2],10),p1=parseInt(c[3],10),p2=parseInt(c[4],10);
    if(d1>d2)[d1,d2]=[d2,d1];if(p1>p2)[p1,p2]=[p2,p1];   // 起訖填反了也照收
    if(!(d1>=1&&d2>=d1&&d2<=7&&p1>=1&&p2>=p1&&p2<=20)){if(!/名稱|姓名/.test(name))R.bad++;return;}
    if(c[5])why=c[5];
    const keys=[];for(let dd=d1;dd<=Math.min(d2,5);dd++)for(let p=p1;p<=p2;p++){const per=pOf(p);if(per)keys.push((dd-1)+'-'+per.id);}
    let arr;
    if(/^\d{3,4}$/.test(name)){const k=(kw.includes('*')||kw.some(w=>why.includes(w))?'c:':'k:')+name;arr=D.offBy[k]=D.offBy[k]||[];R.cls++;}
    else{let t=teaByName(D,name);
      if(!t){if(!opt.addTeachers){R.skipT.push(name);const P=D.offPool=D.offPool||{},a=P[name]=P[name]||[];keys.forEach(k=>{if(!a.includes(k))a.push(k);});return;}t=newTeacher(D,name,'普通班');R.newT++;}
      arr=t.off;R.tea++;}
    keys.forEach(k=>{if(!arr.includes(k)){arr.push(k);R.cells++;}});});
  R.skipT=[...new Set(R.skipT)];return R;
}

/* ───── 讓學校自己維護資料：各種表格的匯入、新學期 ───── */
// 科目名稱：國語文＝國文、英語文＝英文……。用這一份資料裡已經在用的寫法
const SUBJ_FAM=[['國文','國語文','國語'],['英文','英語文','英語'],['數學'],['理化','自然'],['社會'],['社會技巧']];
function canonSubj(D,name){
  name=String(name||'').trim();const fam=SUBJ_FAM.find(f=>f.includes(name));if(!fam)return name;
  const used=new Set(D.groups.map(g=>g.subject).concat(Object.keys(D.classSubj||{}).map(k=>k.split('|')[1])));
  return fam.find(x=>used.has(x))||fam[0];
}
function findTeacher(D,name,role){
  name=String(name||'').trim();if(!name)return null;
  let t=teaByName(D,name);if(!t&&role){t=newTeacher(D,name,role);t._new=1;}
  return t;
}
/* 任課老師名單。兩種格式都可以：
   1. 教務處的「教師名單」：一列班級（701 702 …），下面每列是一科（國語文、英語文、數學、理化）與各班老師
   2. 一列一筆：班級、科目、老師 */
function importTeacherList(D,text){
  const R={set:0,changed:0,newT:[],classes:new Set()},rows=String(text).split(/\r?\n/).map(l=>l.split('\t').map(x=>x.trim().replace(/\.0$/,'')));
  let head=null;
  const okName=n=>/^[\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2ffff}·．A-Za-z （）()]{2,12}$/u.test(n)&&!SUBJ_FAM.some(f=>f.includes(n))&&!/節|星期|科目|教師|班級/.test(n);
  const put=(cls,sj,name)=>{if(!name||!okName(name))return;const k=cls+'|'+canonSubj(D,sj),t=findTeacher(D,name,'普通班');
    if(t._new){R.newT.push(name);delete t._new;}if(D.classSubj[k]!==t.id){if(D.classSubj[k])R.changed++;D.classSubj[k]=t.id;}R.set++;R.classes.add(cls);};
  rows.forEach(c=>{
    const nums=c.map((x,i)=>/^\d{3,4}$/.test(x)?i:-1).filter(i=>i>=0),run=nums.some((v,i)=>i>=2&&nums[i-1]===v-1&&nums[i-2]===v-2);
    if(run){head=c;return;}if(nums.length>=3){head=null;return;}
    const lead=c.findIndex(x=>x);if(lead<0){return;}
    if(head&&SUBJ_FAM.some(f=>f.includes(c[lead]))&&nums.length===0){for(let i=lead+1;i<c.length;i++)if(/^\d{3,4}$/.test(head[i]||''))put(head[i],c[lead],c[i]);return;}
    if(/^\d{3,4}$/.test(c[lead])&&c[lead+1]&&c[lead+2]){head=null;put(c[lead],c[lead+1],c[lead+2]);}
  });
  R.classes=R.classes.size;R.newT=[...new Set(R.newT)];return R;
}
/* 學生名單：班級、座號、姓名，可以再加個管老師、備註。也接受「701-13」或「701-13王小明」寫在同一格。
   有標題列時照標題找欄位（班級、座號、姓名、個管、備註/導師）。班級座號相同的會更新，不會重複新增 */
function importStudents(D,text){
  const R={add:0,upd:0,skip:0,cm:0,noCM:[],newCM:[],conflict:[]};let col=null;
  String(text).split(/\r?\n/).forEach(line=>{
    const tab=line.includes('\t');let a=line.split(tab?'\t':/[,，\s]+/).map(x=>x.trim());if(!a.some(Boolean))return;
    if(!col&&a.some(x=>/^(學生)?姓名$/.test(x))&&a.some(x=>/班級/.test(x))){const f=re=>a.findIndex(x=>re.test(x));col={cls:f(/班級/),seat:f(/座號/),name:f(/^(學生)?姓名$/),cm:f(/個管/),note:f(/備註/),hr:f(/導師/)};return;}
    let cls,seat='',name,cm='',note='',hr='';
    if(col){cls=a[col.cls];seat=col.seat>=0?a[col.seat]:'';name=a[col.name];cm=col.cm>=0?a[col.cm]:'';note=col.note>=0?a[col.note]:'';hr=col.hr>=0?a[col.hr]:'';}
    else if(tab){[cls,seat,name,cm,note]=a;if(!name&&seat&&!/^\d+$/.test(seat)){name=seat;seat='';}}   // 有 Tab 就照欄位位置讀，空的座號不會讓後面的欄位往前擠
    else{a=a.filter(Boolean);[cls,seat,name,cm,note]=a.length>=3?a:[a[0],'',a[1]];}
    const m=String(cls||'').match(/^(\d{3,4})\s*[-－]\s*(\d{1,2})\s*(.*)$/);
    if(m){cls=m[1];if(!seat||!name){name=m[3]||seat||name;seat=m[2];}}
    if(!/^\d{3,4}$/.test(String(cls||''))||!name){R.skip++;return;}
    seat=seat?String(+seat||seat).padStart(2,'0'):'';
    // 先用「同班同名」對；座號相同但名字不同，不直接改名（可能是轉入、換座號），新增一筆並列出來讓人確認
    let s=D.students.find(x=>String(x.cls)===cls&&x.name===name);
    const same=!s&&seat&&D.students.find(x=>String(x.cls)===cls&&x.seat&&+x.seat===+seat);
    if(same&&!same.name)s=same;
    if(s){s.name=name;if(seat)s.seat=seat;R.upd++;}else{s={id:uid('s'),cls,seat,name,caseMgr:'',note:'',needs:[]};D.students.push(s);R.add++;}
    if(same&&same!==s)R.conflict.push({cls,seat,old:same.id,oldName:same.name,id:s.id,name,text:cls+'-'+seat+'：名冊是 '+same.name+'，表上是 '+name});
    if(cm){const nm=normName(cm);let t=D.teachers.find(x=>normName(x.name)===nm);
      if(!t&&nm){t=newTeacher(D,nm,'資源班');R.newCM.push(nm);}   // 個管老師一定是資源班老師：名冊還沒有就先建起來
      if(t){s.caseMgr=t.id;R.cm++;}else R.noCM.push(cm);}
    if(note)s.privNote=note;   // 學校名冊的備註常有個資，先放私密備註；要給學生看的提醒另外寫在「公開提醒」
    if(hr){D.classHead=D.classHead||{};D.classHead[cls]=normName(hr);}
  });
  R.noCM=[...new Set(R.noCM)];R.newCM=[...new Set(R.newCM)];return R;
}
// 姓名比對用：去掉空白和稱謂（老師、主任、組長…）
function normName(s){const a=String(s||'').replace(/\s+/g,''),b=a.replace(/(老師|教師|主任|組長|導師|校長)$/,'');return b||a;}
// 用名字找老師：先找完全一樣的（王老師、王主任同時在名冊時不會認錯），再用 normName 比對
function teaByName(D,name){const n=String(name||'').trim();if(!n)return null;const k=normName(n);return D.teachers.find(x=>x.name===n)||D.teachers.find(x=>normName(x.name)===k)||null;}
/* 開始新學期。opt：clearAssign 清空排課結果、clearGroups 清空課程、clearCS 清空任課老師、clearClassOff 清空班級不排課、
   clearTeaOff 清空所有老師的不排課、promote 升年級（七→八、八→九，九年級畢業移出名冊；國小一到六年級同理）。
   升年級時班級號碼會變，所以課程、任課老師、班級不排課一定一起清空 */
function newTerm(D,opt){
  const R={grad:0,up:0};
  if(opt.promote){opt.clearAssign=opt.clearGroups=opt.clearCS=opt.clearClassOff=true;
    const gone=[];D.students=D.students.filter(s=>{const g=gradeOfCls(s.cls);if(g===9||g===6||g===12){gone.push(s.id);R.grad++;return false;}
      if(g>=1&&g<=11&&/^\d{3,4}$/.test(String(s.cls))){s.cls=promoteCls(s.cls);R.up++;}return true;});
    D.gone=(D.gone||[]).concat(gone).slice(-500);
    gone.forEach(id=>{delete D.offBy['s:'+id];});D.sets.forEach(x=>{x.students=x.students.filter(id=>!gone.includes(id));});
    // 班級號碼變了，舊的全校課表和導師會對到錯的班（批閱教師、任課老師都會錯），一起清掉
    D.tt={};D.classHead={};R.ttCleared=true;}
  if(opt.clearAssign){D.assign={};D.lockFix=[];}
  if(opt.clearGroups){D.groups=[];D.assign={};}
  if(opt.clearCS)D.classSubj={};
  if(opt.clearClassOff)Object.keys(D.offBy).forEach(k=>{if(k[0]==='c'||k[0]==='k')delete D.offBy[k];});
  if(opt.clearTeaOff){D.teachers.forEach(t=>{t.off=[];});D.offPool={};}
  if(opt.title!=null)D.title=opt.title;
  return R;
}

/* ───── 個管分配建議：每位學生配一位資源班老師當個管 ─────
   原則（分數越低越好）：
   1. 已經是他的個管就盡量不換（家長、導師都認得這位老師）；
   2. 有教到他的老師優先（教越多門越熟）；
   3. 同年級、同班的學生盡量給同一位，個管要聯絡的導師、要開的會比較少；
   4. 人數平均；老師可以設上限 cmCap（例：組長行政多，少帶幾位），noCM＝不當個管。
   只產生建議，不直接改資料。 */
function suggestCaseMgr(D,opt){
  opt=opt||{};const keep=opt.keep!==false;
  const T=D.teachers.filter(t=>t.role==='資源班'&&!t.noCM);if(!T.length)return {list:[],summary:[],note:'還沒有資源班老師'};
  const S=D.students.filter(s=>s.on!==false),W=s=>+s.cmWeight>0?+s.cmWeight:1,total=S.reduce((a,s)=>a+W(s),0);
  // 上限：有填的照填，其餘平分剩下的人數
  const capped=T.filter(t=>+t.cmCap>0),fixed=capped.reduce((a,t)=>a+ +t.cmCap,0),freeN=T.length-capped.length;
  const avg=freeN?Math.max(0,total-fixed)/freeN:0,cap={};T.forEach(t=>{cap[t.id]=+t.cmCap>0?+t.cmCap:Math.ceil(avg);});
  const teach={};D.groups.forEach(g=>{if(!g.teacher)return;(g.students||[]).forEach(id=>{const k=id+'|'+g.teacher;teach[k]=(teach[k]||0)+1;});});
  const grade=s=>String(s.cls||'').slice(0,Math.max(1,String(s.cls||'').length-2));
  const load={},byT={};T.forEach(t=>{load[t.id]=0;byT[t.id]=[];});
  const score=(s,t)=>{let x=0;const mine=byT[t.id];
    if(keep&&s.caseMgr===t.id)x-=6;
    x-=2.5*(teach[s.id+'|'+t.id]||0);
    if(mine.length){x-=2*mine.filter(o=>grade(o)===grade(s)).length/mine.length;x-=0.8*Math.min(3,mine.filter(o=>String(o.cls)===String(s.cls)).length);}
    const over=load[t.id]+W(s)-cap[t.id];if(over>0)x+=40*over;   // 上限幾乎當成硬規定：除非大家都滿了
    return x;};
  const res=new Map();
  // 先放已經有個管的；再依「有教到他的老師越少越難安排」的順序放其他學生
  const has=s=>keep&&T.some(t=>t.id===s.caseMgr),nT=s=>T.filter(t=>teach[s.id+'|'+t.id]).length||9;
  const order=S.slice().sort((a,b)=>(has(a)?0:1)-(has(b)?0:1)||nT(a)-nT(b)||String(a.cls).localeCompare(String(b.cls)));
  order.forEach(s=>{let best=null,bs=Infinity;T.forEach(t=>{const x=score(s,t);if(x<bs-1e-9){bs=x;best=t;}});res.set(s.id,best.id);load[best.id]+=W(s);byT[best.id].push(s);});
  // 微調：兩兩交換，整體變好就換
  const tot=()=>S.reduce((a,s)=>{const t=res.get(s.id);return a+(keep&&s.caseMgr===t?-6:0)-2.5*(teach[s.id+'|'+t]||0);},0)
    +T.reduce((a,t)=>{const m=byT[t.id];return a+Math.max(0,load[t.id]-cap[t.id])*40+new Set(m.map(grade)).size*1.2+new Set(m.map(o=>String(o.cls))).size*0.4;},0);
  let cur=tot();
  for(let pass=0;pass<4&&S.length<=400;pass++){let imp=false;
    for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){const a=S[i],b=S[j],ta=res.get(a.id),tb=res.get(b.id);if(ta===tb)continue;
      const sw=(x,y,tx,ty)=>{res.set(x.id,ty);res.set(y.id,tx);byT[tx]=byT[tx].filter(o=>o!==x).concat([y]);byT[ty]=byT[ty].filter(o=>o!==y).concat([x]);load[tx]+=W(y)-W(x);load[ty]+=W(x)-W(y);};
      sw(a,b,ta,tb);const n=tot();if(n<cur-1e-9){cur=n;imp=true;}else sw(b,a,ta,tb);}
    if(!imp)break;}
  const name=id=>(D.teachers.find(t=>t.id===id)||{}).name||'';
  const list=S.map(s=>{const to=res.get(s.id),why=[];
    if(s.caseMgr===to)why.push('維持原個管');if(teach[s.id+'|'+to])why.push('有教到他（'+teach[s.id+'|'+to]+' 門）');
    const same=byT[to].filter(o=>o!==s&&String(o.cls)===String(s.cls)).length;if(same)why.push('同班還有 '+same+' 位');
    return {sid:s.id,cls:s.cls,seat:s.seat,name:s.name,from:s.caseMgr||'',fromName:name(s.caseMgr),to,toName:name(to),why,change:(s.caseMgr||'')!==to};});
  const summary=T.map(t=>{const m=byT[t.id];return {id:t.id,name:t.name,n:m.length,cap:cap[t.id],capSet:+t.cmCap>0,grades:[...new Set(m.map(grade))].sort(),classes:new Set(m.map(o=>String(o.cls))).size,taught:m.filter(o=>teach[o.id+'|'+t.id]).length};});
  return {list,summary};
}
/* ───── 超鐘點：應授＝基本鐘點（hours）− 減授（reduce）；超過應授的節數是超鐘點 ─────
   老師：reduce（減授節數）、reduceNote（減授原因，例：組長）、otMax（每週最多願意超幾節；0＝不願意，沒填＝還沒問）、
         prefSubj、prefGrade（想教的科目、年級，可不填）、avoidSubj（不想教的科目）。
   全校：D.settings.otCap（每人每週超鐘點上限；沒填＝不限）、otCountExtra（外加課算進超鐘點；預設不算，另列「外加課」）、
         noClass（放假日：'YYYY-MM-DD' 或 'YYYY-MM-DD~YYYY-MM-DD'）。
   認領：D.claims＝[{gid,tid,at,status:'pending'|'ok'|'no',dt}]：沒有老師的課，老師按「我可以帶」，管理者核准才指定。 */
const otN=v=>{v=+v;return isFinite(v)&&v>0?Math.min(99,Math.round(v*10)/10):0;};
const otList=v=>(Array.isArray(v)?v:typeof v==='string'?v.split(/[,，、;；\s]+/):[]).map(x=>String(x).trim().slice(0,20)).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).slice(0,30);
const otYmd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
// 一個日期：2026-10-10、2026/10/10、115.10.10（民國年）都可以；不對的回傳 ''
function otDay(s){const m=String(s==null?'':s).trim().match(/^(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})$/);if(!m)return '';let y=+m[1];if(y<1000)y+=1911;
  const d=new Date(y,+m[2]-1,+m[3]);return d.getFullYear()===y&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?otYmd(d):'';}
// 放假日清單：一天一筆，或「開始~結束」一段；排序、去掉重複和寫錯的
function noClassNorm(v){const out=new Set();
  (Array.isArray(v)?v:String(v==null?'':v).split(/[\n\r,，、;；]+/)).forEach(x=>{const p=String(x==null?'':x).replace(/\s+/g,'').split(/[~～至–—]/).filter(Boolean);
    if(p.length===1){const a=otDay(p[0]);if(a)out.add(a);}
    else if(p.length===2){let a=otDay(p[0]),b=otDay(p[1]);if(!a||!b)return;if(b<a)[a,b]=[b,a];out.add(a===b?a:a+'~'+b);}});
  return [...out].sort().slice(0,200);}
// 放假日展開成一天一天（只看 from～to 之間）
function noClassSet(list,from,to){const set=new Set();(list||[]).forEach(x=>{const p=String(x).split('~'),a=otDay(p[0]),b=otDay(p[1]||p[0]);if(!a||!b)return;
  const d=new Date(+a.slice(0,4),+a.slice(5,7)-1,+a.slice(8,10));for(let i=0;i<400;i++){const s=otYmd(d);if(s>b)break;if((!from||s>=from)&&(!to||s<=to))set.add(s);d.setDate(d.getDate()+1);}});
  return set;}
// 學期起訖：D.settings.dates（例：115.09.02-116.01.20、2026/9/2～2027/1/20）。讀不出來回傳 null
function termRange(str){const a=[];String(str==null?'':str).replace(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/g,(m)=>{const d=otDay(m);if(d)a.push(d);return m;});
  if(!a.length)return null;return {from:a[0],to:a.length>1?a[a.length-1]:''};}
function otNormT(t){
  if(t.reduce!=null){t.reduce=otN(t.reduce);if(!t.reduce)delete t.reduce;}
  if(t.reduceNote!=null){t.reduceNote=String(t.reduceNote).trim().slice(0,40);if(!t.reduceNote)delete t.reduceNote;}
  if(t.otMax!=null){const v=Math.floor(otN(t.otMax));if(t.otMax===''||t.otMax==null)delete t.otMax;else t.otMax=v;}
  ['prefSubj','prefGrade','avoidSubj'].forEach(k=>{if(t[k]!=null){t[k]=otList(t[k]);if(!t[k].length)delete t[k];}});}
function otNormD(D){const S=D.settings;
  if(S.otCap!=null){S.otCap=Math.floor(otN(S.otCap));if(!S.otCap)delete S.otCap;}
  if(S.otCountExtra!=null){if(S.otCountExtra)S.otCountExtra=true;else delete S.otCountExtra;}
  if(S.noClass!=null){S.noClass=noClassNorm(S.noClass);if(!S.noClass.length)delete S.noClass;}
  if(D.claims!=null){D.claims=(Array.isArray(D.claims)?D.claims:[]).filter(c=>c&&typeof c==='object'&&okId(c.gid)&&okId(c.tid)&&['pending','ok','no'].includes(c.status))
    .map(c=>{const o={gid:String(c.gid),tid:String(c.tid),at:+c.at||0,status:c.status};if(+c.dt)o.dt=+c.dt;return o;}).slice(-300);if(!D.claims.length)delete D.claims;}}
// 應授＝基本 − 減授（不會小於 0）
function otDue(t){return Math.max(0,Math.round((otN(t&&t.hours)-otN(t&&t.reduce))*10)/10);}
// 這位老師每週最多可以超幾節：願意的節數，再受全校上限限制。沒填 otMax 當 0（沒說願意）
function otLimit(D,t){const m=otN(t&&t.otMax),c=otN(D.settings&&D.settings.otCap);return m?(c?Math.min(m,c):m):0;}
const otCounts=(D,g)=>g.mode!=='外加'||!!(D.settings&&D.settings.otCountExtra);
// 課的年級：有指定就用指定的，沒有就看學生（全部同一個年級才算）
function otGradeOf(D,g){if(g.grade)return String(g.grade);const S={};D.students.forEach(s=>{S[s.id]=s;});const gs=[...new Set((g.students||[]).map(id=>S[id]).filter(Boolean).map(s=>String(gradeOfCls(s.cls))))];return gs.length===1?gs[0]:'';}
// 一位老師的一列：基本、減授、應授、已開（一般、外加）、超鐘點、上限、超過上限沒
function otRow(D,t,reg,extra){const base=otN(t.hours),due=otDue(t),cnt=!!D.settings.otCountExtra,counted=reg+(cnt?extra:0),cap=otN(D.settings.otCap);
  const ot=base?Math.max(0,Math.round((counted-due)*10)/10):0,otMax=t.otMax==null?null:+t.otMax;
  const over=ot>0&&((cap>0&&ot>cap)||(otMax!=null&&ot>otMax));
  return {id:t.id,name:t.name,role:t.role,base,reduce:otN(t.reduce),reduceNote:t.reduceNote||'',due,reg,extra,open:reg+extra,counted,ot,short:base?Math.max(0,Math.round((due-counted)*10)/10):0,
    otMax,cap,limit:otLimit(D,t),over,noHours:!base};}
function otAssigned(D,g){return !!g.teacher&&D.teachers.some(t=>t.id===g.teacher);}
// 開課頁的摘要：用「開了幾節」（g.per）算，還沒排課也算得出來
function otSummary(D){const L={};D.teachers.forEach(t=>{L[t.id]={reg:0,extra:0};});let need=0,needReg=0;
  D.groups.forEach(g=>{if(g.on===false||!(+g.per))return;need+=+g.per;if(g.mode!=='外加')needReg+=+g.per;const o=L[g.teacher];if(o){if(g.mode==='外加')o.extra+=+g.per;else o.reg+=+g.per;}});
  const T=D.teachers.filter(t=>t.role==='資源班'||(L[t.id].reg+L[t.id].extra)>0||otN(t.otMax)>0),rows=T.map(t=>otRow(D,t,L[t.id].reg,L[t.id].extra));
  const due=D.teachers.filter(t=>t.role==='資源班').reduce((n,t)=>n+otDue(t),0),cnt=!!D.settings.otCountExtra,want=cnt?need:needReg;
  const open=D.groups.filter(g=>g.on!==false&&+g.per>0&&!otAssigned(D,g));
  return {need,needReg,want,due:Math.round(due*10)/10,short:Math.max(0,Math.round((want-due)*10)/10),rows,open:open.map(g=>g.id),openPer:open.reduce((n,g)=>n+(+g.per),0)};}

/* 建議分配：沒有老師的課（opt.overflow：連超過上限的老師多出來的課）分給還有餘裕的老師。只產生建議，不改資料。
   一定要遵守：每週超鐘點不超過老師願意的節數（otMax）與全校上限（otCap）；不給列在「不想教」的科目；
               老師的不排課時段扣掉之後，可以排的節數要夠這門課每週的節數。
   盡量做到（分數越低越好）：先補還沒滿應授的老師、超鐘點平均分；想教的科目、年級優先；
               同一位學生的課給同一位老師（已經教他、是他的個管）。 */
function suggestOvertime(D,opt){opt=opt||{};
  const M=compile(D),byId={};D.teachers.forEach(t=>{byId[t.id]=t;});
  const T=D.teachers.filter(t=>t.role==='資源班'||otN(t.otMax)>0);
  const load={},extraN={};T.forEach(t=>{load[t.id]=0;extraN[t.id]=0;});
  D.groups.forEach(g=>{if(g.on===false||!(+g.per)||load[g.teacher]==null)return;if(otCounts(D,g))load[g.teacher]+=+g.per;else extraN[g.teacher]+=+g.per;});
  const teach={},cm={};D.groups.forEach(g=>{if(!byId[g.teacher])return;(g.students||[]).forEach(id=>{(teach[g.teacher]=teach[g.teacher]||new Set()).add(id);});});
  D.students.forEach(s=>{if(s.caseMgr)(cm[s.caseMgr]=cm[s.caseMgr]||new Set()).add(s.id);});
  const cap=t=>{const b=otN(t.hours);return b?otDue(t)+otLimit(D,t):otLimit(D,t);};   // 沒填基本鐘點的：只能用願意超的節數
  // 要分的課
  const todo=[];D.groups.forEach((g,gi)=>{if(g.on===false||!(+g.per))return;if(!otAssigned(D,g))todo.push({g,gi,from:''});});
  if(opt.overflow)T.forEach(t=>{let over=load[t.id]-cap(t);if(over<=0||!otN(t.hours))return;
    D.groups.map((g,gi)=>({g,gi})).filter(x=>x.g.teacher===t.id&&x.g.on!==false&&+x.g.per>0&&otCounts(D,x.g)).sort((a,b)=>b.g.per-a.g.per).forEach(x=>{if(over<=0)return;todo.push({g:x.g,gi:x.gi,from:t.id});over-=x.g.per;load[t.id]-=x.g.per;});});
  const feas={};   // 老師 × 課：扣掉老師不排課之後還有幾格可以排
  const slots=(t,gi)=>{const k=t.id+'|'+gi;if(feas[k]==null){const ti=M.tIdx[t.id],G=M.G[gi];feas[k]=G.alist.filter(s=>!(ti>=0&&M.off[ti][s])).length;}return feas[k];};
  const reasons=(t,x)=>{const g=x.g,per=+g.per,c=otCounts(D,g);
    if((t.avoidSubj||[]).includes(g.subject))return {no:'不想教'+g.subject};
    if(x.from===t.id)return {no:'原本的老師'};
    if(slots(t,x.gi)<per)return {no:'不排課時段太多（只剩 '+slots(t,x.gi)+' 格）'};
    if(c&&load[t.id]+per>cap(t))return {no:otLimit(D,t)?'超鐘點會超過上限':'不願意超鐘點'};
    return null;};
  const score=(t,x)=>{const g=x.g,per=+g.per,due=otN(t.hours)?otDue(t):0,c=otCounts(D,g),now=load[t.id],aft=c?now+per:now;
    const otNow=Math.max(0,now-due),otAft=Math.max(0,aft-due),why=[];let s=0;
    s+=(otAft-otNow)*2+otAft*0.6;                                  // 新增的超鐘點；已經超很多的少給（平均）
    s+=(c?aft:now+extraN[t.id]+per)/Math.max(1,due||1)*1.2;         // 負擔比例平均
    if(c){if(otAft>otNow)why.push('超鐘點 +'+(otAft-otNow)+(otLimit(D,t)?'（上限 '+otLimit(D,t)+'）':''));else why.push('應授內（還差 '+Math.max(0,due-now)+' 節）');}
    else why.push('外加課');
    if((t.prefSubj||[]).includes(g.subject)){s-=3;why.push('想教'+g.subject);}
    const gr=otGradeOf(D,g);if(gr&&(t.prefGrade||[]).includes(gr)){s-=2;why.push('想教'+(GRADE[gr]||gr+' 年級'));}
    const st=g.students||[],tc=st.filter(id=>teach[t.id]&&teach[t.id].has(id)).length,cc=st.filter(id=>cm[t.id]&&cm[t.id].has(id)).length;
    if(st.length&&(tc||cc)){s-=4*Math.max(tc,cc)/st.length;if(tc)why.push('已經教 '+tc+' 位學生');if(cc)why.push('個管 '+cc+' 位');}
    return {s,why,otAdd:c?otAft-otNow:0};};
  // 選擇少的課先分；一樣時節數多的先分
  const nOK=x=>T.filter(t=>!reasons(t,x)).length;
  todo.forEach(x=>{x.n=nOK(x);});todo.sort((a,b)=>a.n-b.n||b.g.per-a.g.per||a.gi-b.gi);
  const list=[],left=[];
  todo.forEach(x=>{let best=null,bs=Infinity,bw=null;const no=[];
    T.forEach(t=>{const r=reasons(t,x);if(r){no.push(t.name+'：'+r.no);return;}const o=score(t,x);if(o.s<bs-1e-9){bs=o.s;best=t;bw=o;}});
    const g=x.g;
    if(!best){if(x.from)load[x.from]+=+g.per;left.push({gid:g.id,name:g.name,subject:g.subject,per:+g.per,from:x.from,why:no.length?no:['沒有可以帶的老師']});return;}
    if(otCounts(D,g))load[best.id]+=+g.per;else extraN[best.id]+=+g.per;
    (g.students||[]).forEach(id=>{(teach[best.id]=teach[best.id]||new Set()).add(id);});
    list.push({gid:g.id,name:g.name,subject:g.subject,grade:otGradeOf(D,g),per:+g.per,mode:g.mode,from:x.from,fromName:x.from&&byId[x.from]?byId[x.from].name:'',to:best.id,toName:best.name,why:bw.why,otAdd:bw.otAdd});});
  const rows=T.map(t=>({id:t.id,name:t.name,due:otDue(t),limit:otLimit(D,t),after:load[t.id],ot:otN(t.hours)?Math.max(0,load[t.id]-otDue(t)):0,extra:extraN[t.id]}));
  return {list,left,rows};}

/* 認領：沒有老師的課（待認領）。老師只能替自己認領；管理者核准才會改 g.teacher */
function openCourses(D){return D.groups.filter(g=>g.on!==false&&+g.per>0&&!otAssigned(D,g));}
function claimsOf(D,st){return (Array.isArray(D.claims)?D.claims:[]).filter(c=>!st||c.status===st);}
// 還在等管理者的認領（課已經有老師、老師或課被刪掉的不算）
function claimsPending(D){const open=new Set(openCourses(D).map(g=>g.id)),T=new Set(D.teachers.map(t=>t.id));return claimsOf(D,'pending').filter(c=>open.has(c.gid)&&T.has(c.tid));}
function claimAdd(D,gid,tid,at){const g=D.groups.find(x=>x.id===gid),t=D.teachers.find(x=>x.id===tid);
  if(!g||!t)return {ok:false,why:'找不到這門課或老師'};
  if(otAssigned(D,g)||g.on===false||!(+g.per))return {ok:false,why:'這門課已經有老師了'};
  if((t.avoidSubj||[]).includes(g.subject))return {ok:false,why:'你設定不教'+g.subject};
  if(!Array.isArray(D.claims))D.claims=[];
  if(D.claims.some(c=>c.gid===gid&&c.tid===tid&&c.status==='pending'))return {ok:false,why:'已經送出了'};
  D.claims.push({gid,tid,at:+at||Date.now(),status:'pending'});if(D.claims.length>300)D.claims=D.claims.slice(-300);return {ok:true};}
function claimCancel(D,gid,tid){const n=claimsOf(D).length;if(!Array.isArray(D.claims))return false;D.claims=D.claims.filter(c=>!(c.gid===gid&&c.tid===tid&&c.status==='pending'));return D.claims.length<n;}
// 核准：課給這位老師，同一門課其他人的認領改成沒選上；不核准：只改這一筆
function claimDecide(D,gid,tid,yes,at){const c=claimsOf(D,'pending').find(x=>x.gid===gid&&x.tid===tid),g=D.groups.find(x=>x.id===gid);
  if(!c||!g)return {ok:false,why:'找不到這筆認領'};
  if(yes){if(otAssigned(D,g))return {ok:false,why:'這門課已經有老師了'};if(!D.teachers.some(t=>t.id===tid))return {ok:false,why:'找不到這位老師'};
    g.teacher=tid;D.claims.forEach(x=>{if(x.gid===gid&&x.status==='pending'){x.status=x===c?'ok':'no';x.dt=+at||Date.now();}});}
  else{c.status='no';c.dt=+at||Date.now();}
  return {ok:true};}

/* 每月超鐘點（印給教務處、人事核薪）。
   上課日：這個月的星期一到五，扣掉放假日（noClass）和學期起訖（D.settings.dates）以外的日子。
   算法：一週一週算。那一週在這個月裡的上課日，照課表把每天的節數加起來（實際上課節數），
         減掉應授 × 上課日數 ÷ 5（放假的日子應授也跟著少），少於 0 算 0、最多算到每週超鐘點（月初月底不滿一週的不會多算）；
         這個月的超鐘點＝各週相加，取到小數一位。
         一整週都上課時，就是「每週超鐘點」；放假那天的課不算。
   外加課預設不算進超鐘點（另列外加節數）；D.settings.otCountExtra 打開才算。沒填基本鐘點的老師不算超鐘點。 */
function overtimeMonth(D,M,slot,ym){
  const m=String(ym||'').match(/^(\d{4})-(\d{1,2})$/);if(!m)return null;
  M=M||compile(D);slot=slot||toState(M,D).slot;
  const y=+m[1],mo=+m[2]-1,last=new Date(y,mo+1,0).getDate(),first=otYmd(new Date(y,mo,1)),end=otYmd(new Date(y,mo,last));
  const hol=noClassSet(D.settings.noClass,first,end),term=termRange(D.settings.dates),days=[],off=[];
  for(let d=1;d<=last;d++){const dt=new Date(y,mo,d),wd=dt.getDay(),s=otYmd(dt);if(wd<1||wd>5)continue;
    if(hol.has(s)){off.push({date:s,why:'放假'});continue;}
    if(term&&((term.from&&s<term.from)||(term.to&&s>term.to))){off.push({date:s,why:'學期外'});continue;}
    const mon=new Date(dt);mon.setDate(dt.getDate()-(wd-1));days.push({date:s,wd:wd-1,week:otYmd(mon)});}
  const reg={},ext={},Z=[0,0,0,0,0];
  M.L.forEach((x,l)=>{const s=slot[l];if(s<0)return;const g=M.G[x.g];if(g.t<0)return;const id=M.T[g.t].id,d=Math.floor(s/M.NP),o=g.pull?reg:ext;(o[id]=o[id]||[0,0,0,0,0])[d]++;});
  const cnt=!!D.settings.otCountExtra,weeks=[...new Set(days.map(x=>x.week))],r1=v=>Math.round(v*10)/10;
  const rows=D.teachers.filter(t=>t.role==='資源班'||reg[t.id]||ext[t.id]).map(t=>{const R=reg[t.id]||Z,X=ext[t.id]||Z,per=d=>R[d]+(cnt?X[d]:0),base=otN(t.hours),due=otDue(t);
    const weekly=[0,1,2,3,4].reduce((n,d)=>n+per(d),0),weekOT=base?Math.max(0,r1(weekly-due)):0;
    const W=weeks.map(w=>{const ds=days.filter(x=>x.week===w),taught=ds.reduce((n,x)=>n+per(x.wd),0),share=due*ds.length/5;return {week:w,n:ds.length,taught,share:r1(share),ot:base?Math.min(weekOT,Math.max(0,r1(taught-share))):0};});
    const note=[t.reduceNote?'減授 '+otN(t.reduce)+'（'+t.reduceNote+'）':otN(t.reduce)?'減授 '+otN(t.reduce):'',!base?'沒填基本鐘點':''].filter(Boolean);
    const extraMonth=days.reduce((n,x)=>n+X[x.wd],0);if(!cnt&&extraMonth)note.push('外加 '+extraMonth+' 節另計');
    return {id:t.id,name:t.name,base,reduce:otN(t.reduce),due,weekly,weekOT,days:days.length,month:r1(W.reduce((n,w)=>n+w.ot,0)),extraMonth,weeks:W,note:note.join('；')};});
  return {ym:y+'-'+String(mo+1).padStart(2,'0'),days,off,weeks,rows,term};}

const CORE={sanitizeIds,ID_RE,okId,suggestCaseMgr,otDay,noClassNorm,noClassSet,termRange,otDue,otLimit,otRow,otSummary,otGradeOf,suggestOvertime,openCourses,claimsOf,claimsPending,claimAdd,claimCancel,claimDecide,overtimeMonth,normName,teaByName,ttDist,ttParseAll,ttParse,ttNameFix,ttSubjFix,ttClassNo,ttGuessClass,ttKnown,ttStore,ttTeachers,EXAM_TT,TT_SUBJ,importLocks,newTeacher,canonSubj,importTeacherList,importStudents,newTerm,assignLocks,refineLocks,importOff,importCourseTable,needList,candidates,placeStudents,aiProblem,aiPrompt,aiApply,DAYS,ROLES,MODES,GRADE,gradeOfCls,uid,defaultData,emptyData,normalize,compile,why,evaluate,solve,toState,fromState,canPlace,assignRooms,lockTable,aiHash,promoteCls,packAssign,unpackAssign,schedStats,schedDiff};
/* ───── 額外功能（extras.js 的畫面用；這裡只算，不碰畫面）：導師週報、學年交接、老師工作量、教室使用率、鎖課異動、家長聯絡 ───── */
Object.assign(CORE,(function(){
const xYmd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function xDate(s){const m=String(s||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);return m?new Date(+m[1],+m[2]-1,+m[3]):null;}
function addDays(s,n){const d=xDate(s);if(!d)return '';d.setDate(d.getDate()+n);return xYmd(d);}
// 那一週的星期一（週日算前一週）
function weekStartOf(s){const d=xDate(s);if(!d)return '';d.setDate(d.getDate()-((d.getDay()+6)%7));return xYmd(d);}
function daysBetween(a,b){const x=xDate(a),y=xDate(b);if(!x||!y)return NaN;return Math.round((y-x)/864e5);}
const md=s=>{const d=xDate(s);return d?(d.getMonth()+1)+'/'+d.getDate():String(s||'');};
const XST={in:'已到',late:'遲到',leave:'請假',abs:'缺席'};
const callName=n=>{n=String(n||'').trim();return n&&!/(老師|主任|組長|校長|導師)$/.test(n)?n+'老師':n;};

/* 導師週報：weekStart 那一週（週一～週五）每位學生被抽出去上的課與出缺席。
   只算正式課表（D.assign）；外加課（早自習）不在原班上課時間，預設不列（opt.all 才列）。
   ATT 的格式見 checkin.js。opt.today：之後的日子算「還沒上」，不算未點名 */
function weeklySummary(D,ATT,weekStart,opt){
  opt=opt||{};ATT=ATT||{};
  const ws=weekStartOf(weekStart),today=opt.today||'',M=opt.M||compile(D),slot=opt.slot||toState(M,D).slot;
  const dates=[0,1,2,3,4].map(d=>addDays(ws,d)),byS={},seen=new Set(),sIdx={};D.students.forEach(s=>{sIdx[s.id]=s;});
  const add=(sid,date,pi,p,g,rec)=>{if(!sIdx[sid])return;
    const r=rec&&rec[sid],any=rec&&Object.keys(rec).some(k=>k[0]!=='_'),future=!!today&&date>today;
    const st=r?r.st:(any&&!future?'abs':'');
    (byS[sid]=byS[sid]||[]).push({date,pi,pid:p?p.id:'',pname:p?p.name:'',gid:g.id,gname:g.name,subject:g.subject||'',st,tin:r&&r.tin||'',note:r&&r.note||'',future});};
  M.L.forEach((x,l)=>{const s=slot[l];if(s<0)return;const g=M.G[x.g];if(!g.pull&&!opt.all)return;
    const d=Math.floor(s/M.NP),pi=s%M.NP,p=M.P[pi],date=dates[d],key=g.ref.id+'@'+p.id,rec=(ATT[date]||{})[key]||null;
    if(seen.has(date+'|'+key))return;seen.add(date+'|'+key);
    const roster=rec&&Array.isArray(rec._roster)?rec._roster:g.stu.map(i=>D.students[i].id);
    new Set(roster.concat(rec?Object.keys(rec).filter(k=>k[0]!=='_'):[])).forEach(sid=>add(sid,date,pi,p,{id:g.ref.id,name:g.name,subject:g.subject},rec));});
  // 這一週有點名、但現在的課表已經沒有的節次（週中改過課表）：照點名紀錄算
  dates.forEach(date=>{const day=ATT[date]||{};for(const key in day){if(seen.has(date+'|'+key))continue;
    const rec=day[key],at=key.lastIndexOf('@'),gid=key.slice(0,at),pid=key.slice(at+1),g0=D.groups.find(x=>x.id===gid),info=rec._info||{};
    if(g0&&g0.mode==='外加'&&!opt.all)continue;
    const pi=D.periods.findIndex(x=>x.id===pid),p=pi>=0?D.periods[pi]:{id:pid,name:info.p||''};
    if(pi>=0&&D.periods[pi].extra&&!opt.all)continue;
    const g={id:gid,name:g0?g0.name:(info.g||''),subject:g0?g0.subject:''};
    new Set((Array.isArray(rec._roster)?rec._roster:[]).concat(Object.keys(rec).filter(k=>k[0]!=='_'))).forEach(sid=>add(sid,date,pi,p,g,rec));}});
  const classes={};
  Object.keys(byS).forEach(sid=>{const s=sIdx[sid],rows=byS[sid].sort((a,b)=>a.date.localeCompare(b.date)||a.pi-b.pi);
    const c={n:0,in:0,late:0,leave:0,abs:0,none:0,future:0};
    rows.forEach(r=>{if(r.future){c.future++;return;}c.n++;if(r.st==='in'||r.st==='late')c.in++;if(r.st==='late'||r.st==='leave'||r.st==='abs')c[r.st]++;else if(!r.st)c.none++;});
    const cls=String(s.cls);(classes[cls]=classes[cls]||[]).push({id:sid,cls,seat:s.seat,name:s.name,rows,c});});
  const head=D.classHead||{};
  return {weekStart:ws,weekEnd:dates[4],dates,classes:Object.keys(classes).sort().map(cls=>({cls,head:head[cls]||'',
    students:classes[cls].sort((a,b)=>(+a.seat||0)-(+b.seat||0)||String(a.name).localeCompare(String(b.name)))}))};
}
// 一班的週報草稿（給導師，用 LINE 傳）。opt.from：署名
function weeklyText(W,entry,opt){opt=opt||{};
  const L=[(entry.head?callName(entry.head):'導師')+'您好：',entry.cls+' 班 '+md(W.weekStart)+'～'+md(W.weekEnd)+' 到資源班上課的情形：'];
  entry.students.forEach(s=>{const done=s.rows.filter(r=>!r.future),sub={};done.forEach(r=>{const k=r.subject||r.gname;sub[k]=(sub[k]||0)+1;});
    const subj=Object.keys(sub).map(k=>k+' '+sub[k]+' 節').join('、');
    if(!done.length){L.push('・'+s.name+'：這週的課還沒上。');return;}
    const when=r=>md(r.date)+' '+r.pname,parts=[];
    [['late','遲到'],['leave','請假'],['abs','缺席']].forEach(([k,n])=>{const rs=done.filter(r=>r.st===k);if(rs.length)parts.push(n+' '+rs.length+' 次（'+rs.map(when).join('、')+'）');});
    const notes=done.filter(r=>r.note).map(r=>md(r.date)+' '+r.note);
    let line='・'+s.name+'：'+subj+'，'+(parts.length?parts.join('、'):s.c.none?'其餘正常':'全勤')+'。';
    if(s.c.none===s.c.n)line='・'+s.name+'：'+subj+'。';
    if(notes.length)line+='備註：'+notes.join('；')+'。';
    L.push(line);});
  L.push('有任何問題再跟我說，謝謝！');if(opt.from)L.push(String(opt.from));
  return L.join('\n');
}

/* 學年交接檢查：和上次的基準（D.handoverBase）比、加上資料本身的檢查。today 是 'YYYY-MM-DD'。
   每一項 {k, level:'bad'|'warn', t（哪一個）, d（怎麼了）, go:{to,id}} */
const XDUE=[['iepDate','IEP 會議'],['reviewDate','下次檢討'],['certExp','鑑定有效期限']];
function handoverBase(D,at){const s={};D.students.forEach(x=>{s[x.id]={cls:String(x.cls==null?'':x.cls),seat:String(x.seat==null?'':x.seat),caseMgr:x.caseMgr||'',name:String(x.name||'')};});return {at:at||Date.now(),s};}
function handoverCheck(D,base,today,opt){
  opt=opt||{};const days=opt.days||60,items=[],lab=s=>String(s.cls)+' '+(s.seat!==''&&s.seat!=null?String(s.seat).padStart(2,'0')+' ':'')+(s.name||'');
  const put=(k,level,t,d,go)=>items.push({k,level,t,d,go});
  if(base&&base.s){const ids=new Set();
    D.students.forEach(s=>{ids.add(s.id);const b=base.s[s.id];
      if(!b){put('in','warn',lab(s),'新加入（轉入）',{to:'stu',id:s.id});return;}
      const c=String(s.cls)!==b.cls,se=String(s.seat)!==b.seat;
      if(c||se)put('moved','warn',lab(s),[c?'班級 '+b.cls+' → '+s.cls:'',se?'座號 '+b.seat+' → '+s.seat:''].filter(Boolean).join('、'),{to:'stu',id:s.id});});
    Object.keys(base.s).forEach(id=>{if(ids.has(id))return;const b=base.s[id];put('out','warn',lab(b),'已不在名冊（轉出）',{to:'stulist'});});}
  const cls=[...new Set(D.students.map(s=>String(s.cls)).filter(Boolean))].sort(),tt=D.tt||{};
  if(cls.length&&!Object.keys(tt).length)put('tt','warn','全校課表','還沒有讀進來',{to:'tt'});
  else cls.filter(c=>!tt[c]).forEach(c=>put('tt','warn',c+' 班','有學生，全校課表沒有這一班',{to:'tt'}));
  const tids=new Set(D.teachers.map(t=>t.id));
  D.students.forEach(s=>{if(!s.caseMgr)put('cm','warn',lab(s),'沒有個管',{to:'stu',id:s.id});
    else if(!tids.has(s.caseMgr))put('cm','bad',lab(s),'個管已不在名冊',{to:'stu',id:s.id});});
  D.students.forEach(s=>XDUE.forEach(([k,n])=>{const v=s[k];if(!v)return;const d=daysBetween(today,v);if(isNaN(d)||d>days)return;
    put('due',d<0?'bad':'warn',lab(s),n+' '+v+(d<0?' 已過 '+(-d)+' 天':d===0?' 就是今天':' 還有 '+d+' 天'),{to:'stu',id:s.id});}));
  const sIdx={};D.students.forEach(s=>{sIdx[s.id]=s;});
  D.groups.forEach(g=>{if(!g.grade)return;const bad=(g.students||[]).map(id=>sIdx[id]).filter(s=>s&&gradeOfCls(s.cls)!==+g.grade);
    if(bad.length)put('grade','bad',g.name||'（未命名）',(GRADE[+g.grade]||g.grade+' 年級')+'的課，有 '+bad.map(s=>s.cls+' '+s.name).join('、'),{to:'group',id:g.id});});
  return {items,hasBase:!!(base&&base.s),at:base&&base.at||0};
}

/* 老師工作量：每位資源班老師的鐘點、排了幾節、幾門課、個管幾位、段考監考幾節、IEP 會議幾場 */
const xBare=n=>normName(String(n||'').replace(/（[^）]*）|\([^)]*\)/g,'').trim());
function teacherLoad(D,M,slot,E){
  M=M||compile(D);slot=slot||toState(M,D).slot;const per={},sameName=(a,b)=>!!a&&xBare(a)===xBare(b);
  const ext={};M.L.forEach((x,l)=>{if(slot[l]<0)return;const g=M.G[x.g];if(g.t<0)return;const id=M.T[g.t].id;per[id]=(per[id]||0)+1;if(!g.pull)ext[id]=(ext[id]||0)+1;});
  const vals=o=>Object.values(o&&typeof o==='object'?o:{}),pro=vals(E&&E.proctorOf),sup=vals(E&&E.supportOf);
  const meets=[];((D.iep&&D.iep.rounds)||[]).forEach(R=>(R.meets||[]).forEach(m=>{if(m&&m.at)meets.push(m);}));
  return D.teachers.filter(t=>t.role==='資源班').map(t=>{const hours=+t.hours||0,p=per[t.id]||0;
    const iep=meets.filter(m=>(m.p||[]).some(e=>e&&(e[0]==='t:'+t.id||(String(e[0]).slice(0,2)==='n:'&&sameName(String(e[0]).slice(2),t.name))))).length;
    return {id:t.id,name:t.name,hours,per:p,diff:hours?p-hours:0,groups:D.groups.filter(g=>g.teacher===t.id&&g.on!==false).length,
      cases:D.students.filter(s=>s.caseMgr===t.id).length,proctor:pro.filter(n=>sameName(n,t.name)).length,support:sup.filter(n=>sameName(n,t.name)).length,iep,
      flag:!hours?'':p>hours?'over':p<hours?'under':'',ot:otRow(D,t,p-(ext[t.id]||0),ext[t.id]||0)};});
}

/* 教室使用率：每間教室每一節是哪幾節課（照 assignRooms 分的教室）。rfix：這份排法指定的教室（toState 的 rfix）
   使用率的分母是「一般節次、不含全校共同不排」的格子數；早自習有用到也算進分子 */
function roomUsage(M,slot,rfix){
  const keep=M.lroom;if(rfix)M.lroom=rfix;const room=assignRooms(M,slot);M.lroom=keep;
  const NR=M.NR,NS=M.NS,cells=[...Array(NR)].map(()=>[...Array(NS)].map(()=>[])),none=[];
  M.L.forEach((x,l)=>{const s=slot[l];if(s<0)return;const g=M.G[x.g],o={l,gi:x.g,name:g.name,subject:g.subject,teacher:g.t>=0?M.T[g.t].name:''};
    if(room[l]>=0)cells[room[l]][s].push(o);else none.push(Object.assign({s},o));});
  const reg=[];for(let s=0;s<NS;s++)if(!M.P[s%M.NP].extra&&!M.blocked[s])reg.push(s);
  const rooms=M.D.rooms.map((r,i)=>{let used=0;for(let s=0;s<NS;s++)if(cells[i][s].length&&(reg.includes(s)||M.P[s%M.NP].extra))used++;
    return {i,id:r.id,name:r.name,spare:!!r.spare,used,total:reg.length,pct:reg.length?Math.round(Math.min(used,reg.length)/reg.length*100):0};});
  return {rooms,cells,none,reg,NS,NP:M.NP};
}
function freeRooms(U,s){return U.rooms.filter(r=>!(U.cells[r.i][s]||[]).length);}

/* 鎖課異動：每一筆鎖課 {cls, k（時段 '星期-節次id'）, sj, t（老師姓名）} */
const lkKey=o=>JSON.stringify([o.cls,o.k,o.sj,o.t]);
function lockSort(a){return a.sort((x,y)=>String(x.cls).localeCompare(String(y.cls))||String(x.k).localeCompare(String(y.k))||String(x.sj).localeCompare(String(y.sj)));}
// 現在這份排法給教務處的鎖課清單：彈性鎖課照配鎖課（assignLocks），其他照 lockTable
function lockList(M,slot){const out=[];
  if(M.flex)assignLocks(M,slot).locks.forEach(k=>out.push({cls:String(k.cls),k:M.s2key(k.s),sj:k.sj,t:M.T[k.t]?M.T[k.t].name:''}));
  else lockTable(M,slot).forEach(r=>r.slots.forEach(s=>out.push({cls:String(r.cls),k:M.s2key(s),sj:r.subject,t:r.teacher||''})));
  const seen=new Set();return lockSort(out.filter(o=>{const k=lkKey(o);if(seen.has(k))return false;seen.add(k);return true;}));}
function lockDiff(prev,cur){prev=prev||[];cur=cur||[];
  const P=new Set(prev.map(lkKey)),C=new Set(cur.map(lkKey));
  return {added:lockSort(cur.filter(o=>!P.has(lkKey(o)))),removed:lockSort(prev.filter(o=>!C.has(lkKey(o))))};}
const lockPack=list=>list.map(o=>[o.cls,o.k,o.sj,o.t]);
const lockUnpack=a=>(a||[]).filter(Array.isArray).map(p=>({cls:String(p[0]||''),k:String(p[1]||''),sj:String(p[2]||''),t:String(p[3]||'')}));
// 確定課表時記一筆：和上次確定時的清單（D.lockLast）比，最多留 50 筆
function lockLogAdd(D,cur,meta){meta=meta||{};
  const prev=D.lockLast&&Array.isArray(D.lockLast.list)?lockUnpack(D.lockLast.list):null,d=lockDiff(prev||[],cur);
  const e={at:meta.at||Date.now(),by:meta.by||'本機',label:String(meta.label||''),added:d.added,removed:d.removed,n:cur.length};if(!prev)e.first=true;
  D.lockLog=(Array.isArray(D.lockLog)?D.lockLog:[]).concat([e]).slice(-50);D.lockLast={at:e.at,list:lockPack(cur)};return e;}

/* 家長聯絡紀錄：D.contacts[學生id]＝[{id,date,how,who,note}]。since 之後（含當天）的整理成一段文字，給 IEP 會議用 */
const CONTACT_HOW=['電話','LINE','面談','聯絡簿','其他'];
function contactDigest(D,sid,since){
  const s=D.students.find(x=>x.id===sid),all=(((D.contacts||{})[sid])||[]).filter(e=>e&&e.date);
  const list=all.filter(e=>!since||String(e.date)>=String(since)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const by={};list.forEach(e=>{const h=CONTACT_HOW.includes(e.how)?e.how:'其他';by[h]=(by[h]||0)+1;});
  const yr=new Set(list.map(e=>String(e.date).slice(0,4))).size>1,dt=e=>yr?String(e.date):md(e.date);
  const head=(s?String(s.cls)+' '+s.name+'　':'')+'家長聯絡紀錄'+(since?'（'+since+' 起）':'')+'：共 '+list.length+' 次'+(list.length?'（'+CONTACT_HOW.filter(h=>by[h]).map(h=>h+' '+by[h]).join('、')+'）':'');
  const text=[head].concat(list.map(e=>'・'+dt(e)+' '+(CONTACT_HOW.includes(e.how)?e.how:'其他')+(e.who?'｜'+e.who:'')+(e.note?'：'+String(e.note).replace(/\s*\n\s*/g,' '):''))).join('\n');
  return {n:list.length,list,by,text};
}

return {weeklySummary,weeklyText,handoverBase,handoverCheck,teacherLoad,roomUsage,freeRooms,lockList,lockDiff,lockPack,lockUnpack,lockLogAdd,contactDigest,
  CONTACT_HOW,addDays,weekStartOf,daysBetween};
})());
if(typeof module!=='undefined')module.exports=CORE;

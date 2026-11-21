/* 資源班管理系統｜核心：資料模型、排課規則、求解器（瀏覽器與 node 共用，不碰畫面） */
'use strict';
const DAYS=['一','二','三','四','五'];
const ROLES=['資源班','普通班','兼課','代理','行政'];
const MODES=['抽離','外加'];

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
    return {id:'s'+(i+1),cls,seat,name,caseMgr:cm[i%3],note:''};});
  const inG=g=>students.filter(s=>s.cls[0]===String(g));
  const ids=(list,skip)=>list.filter((s,i)=>!(skip||[]).includes(i)).map(s=>s.id);
  const classSubj={};
  classes.forEach((c,i)=>{const odd=i%2===0;classSubj[c+'|國文']=odd?'k1':'k2';classSubj[c+'|數學']=odd?'m1':'m2';classSubj[c+'|英文']=odd?'e1':'e2';});
  const Gp=(id,name,subject,teacher,per,stu,mode)=>({id,name,subject,teacher,per,students:stu,mode:mode||'抽離',room:'',on:true});
  const g7=inG(7),g8=inG(8),g9=inG(9);
  return {
    v:1,
    title:'○○國中 ○○學年度第○學期 資源班（範例資料）',
    periods:[
      {id:'m',name:'早自習',start:'07:40',end:'08:10',extra:true},
      {id:'1',name:'第1節',start:'08:20',end:'09:05'},
      {id:'2',name:'第2節',start:'09:15',end:'10:00'},
      {id:'3',name:'第3節',start:'10:10',end:'10:55'},
      {id:'4',name:'第4節',start:'11:05',end:'11:50'},
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
    blocked:['4-6','4-7'],
    assign:{},
    settings:{regClash:true,seed:1}
  };
}

/* 空白的一份：只留作息，其餘清空 */
function emptyData(){const B=defaultData();return Object.assign(B,{title:'',students:[],teachers:[],groups:[],classSubj:{},blocked:[],assign:{},rooms:[{id:'A',name:'資源教室一'}]});}

function normalize(D){
  const B=defaultData();
  if(!D||typeof D!=='object')return B;
  ['periods','students','teachers','rooms','groups','blocked'].forEach(k=>{if(!Array.isArray(D[k]))D[k]=k==='periods'?B.periods:[];});
  ['classSubj','assign','settings'].forEach(k=>{if(!D[k]||typeof D[k]!=='object')D[k]={};});
  if(D.settings.regClash==null)D.settings.regClash=true;
  if(!D.settings.seed)D.settings.seed=1;
  D.teachers.forEach(t=>{if(!Array.isArray(t.off))t.off=[];if(!t.role)t.role='普通班';});
  D.groups.forEach(g=>{if(!Array.isArray(g.students))g.students=[];g.per=Math.max(0,Math.min(15,+g.per||0));if(!g.mode)g.mode='抽離';if(g.on==null)g.on=true;});
  if(D.title==null)D.title='';
  return D;
}

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
  const NStu=D.students.length,sIdx={};D.students.forEach((s,i)=>{sIdx[s.id]=i;});
  const classes=[...new Set(D.students.map(s=>String(s.cls)))].sort(),cIdx={};classes.forEach((c,i)=>{cIdx[c]=i;});
  const subjects=[...new Set(D.groups.map(g=>g.subject))],jIdx={};subjects.forEach((c,i)=>{jIdx[c]=i;});
  const rIdx={};D.rooms.forEach((r,i)=>{rIdx[r.id]=i;});
  const NR=D.rooms.length,strict=D.settings.regClash!==false;
  const idxOf=(map,k)=>(k!=null&&map[k]!=null)?map[k]:-1;
  const G=D.groups.map((g,gi)=>{
    const stu=[...new Set((g.students||[]).map(id=>sIdx[id]).filter(i=>i!=null))];
    const pull=g.mode!=='外加',t=idxOf(tIdx,g.teacher);
    const cls=[...new Set(stu.map(i=>String(D.students[i].cls)))].sort();
    const locks=pull?cls.map(c=>({c:cIdx[c],cls:c,t:idxOf(tIdx,D.classSubj[c+'|'+g.subject])})):[];
    const o={gi,ref:g,name:g.name||'（未命名）',subject:g.subject,j:jIdx[g.subject],t,stu,pull,cls,locks,room:idxOf(rIdx,g.room),
      per:g.on===false?0:(+g.per||0),allowed:new Uint8Array(NS),alist:[],warn:[]};
    return o;
  });
  const M={D,P,NP,NS,NT,NStu,NC:classes.length,NR,T,G,classes,subjects,off,blocked,strict,key2s,s2key,sn,tIdx,sIdx,cIdx,L:[],viol:0};
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
  return M;
}

/* 這一組為什麼不能排在這個時段（只看「不排課」類的原因，不看和別組撞不撞） */
function why(M,gi,s){
  const g=M.G[gi],p=M.P[s%M.NP],r=[];
  if(g.pull&&p.extra)r.push(p.name+'只排外加課');
  if(!g.pull&&!p.extra)r.push('外加課只排在外加時段');
  if(M.blocked[s])r.push('全校共同不排');
  if(g.t>=0&&M.off[g.t][s])r.push(M.T[g.t].name+'不排課');
  const seen={};
  g.locks.forEach(k=>{if(k.t>=0&&!seen[k.t]&&M.off[k.t][s]){seen[k.t]=1;r.push(M.T[k.t].name+'不排課');}});
  return r;
}

/* 算一個排法的分數：違規數 ×1000 ＋ 不理想的程度。out 給陣列時會把每個問題寫成文字 */
function evaluate(M,slot,out){
  const {NS,NP,NT,NStu,NC,NR,G,L}=M;
  const tc=M.a_tc.fill(0),sc=M.a_sc.fill(0),cs=M.a_cs.fill(0),rt=M.a_rt.fill(0),rc=M.a_rc.fill(0),fr=M.a_fr.fill(0),gd=M.a_gd.fill(0);
  let v=0,soft=0;
  const bad=(k,gi,l,s,m)=>{v++;if(out)out.push({k,g:gi,l,s,m});};
  for(let l=0;l<L.length;l++){
    const gi=L[l].g,g=G[gi],s=slot[l];
    if(s<0){bad('un',gi,l,-1,out&&(g.name+'還有節數沒排進去'));continue;}
    if(!g.allowed[s])bad('off',gi,l,s,out&&(M.sn(s)+'：'+g.name+'不能排在這裡（'+why(M,gi,s).join('、')+'）'));
    if(g.t>=0){const k=s*NT+g.t;if(tc[k])bad('teacher',gi,l,s,out&&(M.sn(s)+'：'+(tc[k]-1===gi?g.name+'有兩節排在同一格':M.T[g.t].name+'同時有兩組（'+G[tc[k]-1].name+'、'+g.name+'）')));else tc[k]=gi+1;}
    for(let a=0;a<g.stu.length;a++){const i=g.stu[a],k=s*NStu+i;
      if(sc[k]-1===gi)v++;else if(sc[k])bad('student',gi,l,s,out&&(M.sn(s)+'：'+M.D.students[i].cls+' '+M.D.students[i].name+'同時在兩組（'+G[sc[k]-1].name+'、'+g.name+'）'));else sc[k]=gi+1;}
    for(let a=0;a<g.locks.length;a++){const lk=g.locks[a],k=s*NC+lk.c,j=g.j+1;
      if(cs[k]&&cs[k]!==j)bad('class',gi,l,s,out&&(M.sn(s)+'：'+lk.cls+' 同一節被要求上兩科（'+M.subjects[cs[k]-1]+'、'+g.subject+'）'));else cs[k]=j;
      if(M.strict&&lk.t>=0){const k2=s*NT+lk.t,c=lk.c+1;
        if(rt[k2]&&rt[k2]!==c)bad('reg',gi,l,s,out&&(M.sn(s)+'：'+M.T[lk.t].name+'同一節要在兩個班上課（'+M.classes[rt[k2]-1]+'、'+lk.cls+'）'));else rt[k2]=c;}}
    if(NR>0){
      if(g.room>=0){const k=s*NR+g.room;if(fr[k])bad('room',gi,l,s,out&&(M.sn(s)+'：'+M.D.rooms[g.room].name+'同時被兩組指定（'+G[fr[k]-1].name+'、'+g.name+'）'));else fr[k]=gi+1;}
      if(++rc[s]>NR)bad('room',gi,l,s,out&&(M.sn(s)+'：教室不夠，同時有 '+rc[s]+' 組但只有 '+NR+' 間'));
    }
    gd[gi*5+((s/NP)|0)]++;
  }
  for(let gi=0;gi<G.length;gi++)for(let d=0;d<5;d++){const c=gd[gi*5+d];if(c>1)soft+=(c-1)*4;}
  for(let a=0;a<M.rts.length;a++){const t=M.rts[a];let tot=0;const dc=[0,0,0,0,0];
    for(let d=0;d<5;d++){let run=0;for(let p=0;p<NP;p++){if(tc[(d*NP+p)*NT+t]){dc[d]++;tot++;if(++run>3)soft+=2;}else run=0;}}
    const avg=tot/5;for(let d=0;d<5;d++)soft+=(dc[d]-avg)*(dc[d]-avg)*0.4;}
  for(let i=0;i<NStu;i++)for(let d=0;d<5;d++){let c=0;for(let p=0;p<NP;p++)if(sc[(d*NP+p)*NStu+i])c++;if(c>3)soft+=c-3;}
  M.viol=v;return v*1000+soft;
}

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* 自動排課：已固定的不動，其餘用模擬退火找違規最少、最平均的排法 */
function solve(M,S0,opt){
  opt=opt||{};const N=opt.iters||60000,RS=opt.restarts||4;
  const rnd=mulberry32(opt.seed||1),ri=n=>Math.floor(rnd()*n);
  const L=M.L,base=Int16Array.from(S0.slot),free=[];
  for(let l=0;l<L.length;l++){if(S0.pin[l]&&base[l]>=0)continue;if(M.G[L[l].g].alist.length)free.push(l);else base[l]=-1;}
  if(!free.length){const o={slot:base,pin:S0.pin};o.cost=evaluate(M,base);o.viol=M.viol;return o;}
  let best=null,bestC=Infinity;
  for(let rs=0;rs<RS;rs++){
    const slot=Int16Array.from(base);
    for(const l of free){const a=M.G[L[l].g].alist;slot[l]=a[ri(a.length)];}
    let cur=evaluate(M,slot);
    if(cur<bestC){bestC=cur;best=Int16Array.from(slot);}
    const T0=30,T1=0.05;
    for(let i=0;i<N&&bestC>0;i++){
      const T=T0*Math.pow(T1/T0,i/N);
      const l=free[ri(free.length)],g=M.G[L[l].g],o1=slot[l];let l2=-1,o2=-1;
      if(rnd()<0.6||free.length<2){const ns=g.alist[ri(g.alist.length)];if(ns===o1)continue;slot[l]=ns;}
      else{l2=free[ri(free.length)];o2=slot[l2];const g2=M.G[L[l2].g];
        if(l2===l||o1===o2||g2===g||!g.allowed[o2]||!g2.allowed[o1])continue;slot[l]=o2;slot[l2]=o1;}
      const c=evaluate(M,slot);
      if(c<=cur||rnd()<Math.exp((cur-c)/T)){cur=c;if(c<bestC){bestC=c;best.set(slot);}}
      else{slot[l]=o1;if(l2>=0)slot[l2]=o2;}
    }
    if(bestC===0)break;
  }
  let cur=evaluate(M,best),imp=true,pass=0;
  while(imp&&pass++<5){imp=false;
    for(const l of free){const g=M.G[L[l].g],o=best[l];let b=o;
      for(const s of g.alist){if(s===o)continue;best[l]=s;const c=evaluate(M,best);if(c<cur-1e-9){cur=c;b=s;}}
      best[l]=b;if(b!==o)imp=true;}
  }
  const res={slot:best,pin:S0.pin};res.cost=evaluate(M,best);res.viol=M.viol;return res;
}

function toState(M,D){
  const n=M.L.length,S={slot:new Int16Array(n).fill(-1),pin:new Uint8Array(n)};
  M.L.forEach((x,l)=>{const a=D.assign&&D.assign[M.G[x.g].ref.id],e=a&&a[x.k];if(!e||!e.s)return;
    const s=M.key2s(e.s);if(s>=0){S.slot[l]=s;S.pin[l]=e.pin?1:0;}});
  return S;
}
function fromState(M,S){const a={};M.L.forEach((x,l)=>{const id=M.G[x.g].ref.id;(a[id]=a[id]||[])[x.k]={s:S.slot[l]>=0?M.s2key(S.slot[l]):'',pin:!!S.pin[l]};});return a;}

/* 把 l 這一節放到 s 會不會多出違規 */
function canPlace(M,slot,l,s){
  const o=slot[l];slot[l]=-1;evaluate(M,slot);const v0=M.viol;
  slot[l]=s;evaluate(M,slot);const v1=M.viol;slot[l]=o;return v1<v0;
}

/* 分配教室：有指定的照指定；其餘同一位老師盡量固定同一間 */
function assignRooms(M,slot){
  const room=new Int16Array(M.L.length).fill(-1);if(!M.NR)return room;
  const home={};M.rts.forEach((t,i)=>{home[t]=i%M.NR;});
  const by={};M.L.forEach((x,l)=>{if(slot[l]>=0)(by[slot[l]]=by[slot[l]]||[]).push(l);});
  for(const s in by){const used=new Uint8Array(M.NR),rest=[];
    by[s].forEach(l=>{const g=M.G[M.L[l].g];if(g.room>=0&&!used[g.room]){used[g.room]=1;room[l]=g.room;}else rest.push(l);});
    rest.forEach(l=>{const g=M.G[M.L[l].g];let r=g.room>=0?-1:(home[g.t]!=null?home[g.t]:0);
      if(r<0||used[r]){r=-1;for(let i=0;i<M.NR;i++)if(!used[i]){r=i;break;}}
      if(r>=0){used[r]=1;room[l]=r;}});}
  return room;
}

/* 給教務處的鎖課表：哪一班、哪一科、哪幾節必須排這一科 */
function lockTable(M,slot){
  const rows={};
  M.L.forEach((x,l)=>{const s=slot[l],g=M.G[x.g];if(s<0)return;
    g.locks.forEach(k=>{const key=k.cls+'|'+g.subject,r=rows[key]=rows[key]||{cls:k.cls,subject:g.subject,t:k.t,slots:new Set(),groups:new Set()};r.slots.add(s);r.groups.add(g.name);});});
  return Object.values(rows).map(r=>({cls:r.cls,subject:r.subject,teacher:r.t>=0?M.T[r.t].name:'',slots:[...r.slots].sort((a,b)=>a-b),groups:[...r.groups]}))
    .sort((a,b)=>a.cls.localeCompare(b.cls)||a.subject.localeCompare(b.subject));
}

const CORE={DAYS,ROLES,MODES,uid,defaultData,emptyData,normalize,compile,why,evaluate,solve,toState,fromState,canPlace,assignRooms,lockTable};
if(typeof module!=='undefined')module.exports=CORE;

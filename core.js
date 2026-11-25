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
    blocked:['4-7'],
    offBy:{'g:7':['4-6'],'g:8':['4-6'],'g:9':['3-6']},
    sets:[{id:'x1',name:'技藝班',students:[g9[3].id,g9[6].id],off:['1-5','1-6','1-7'],note:'週二下午到合作學校上課'}],
    assign:{},
    settings:{regClash:true,seed:1}
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
  D.teachers.forEach(t=>{if(!Array.isArray(t.off))t.off=[];if(!t.role)t.role='普通班';t.hours=Math.max(0,+t.hours||0);});
  D.students.forEach(s=>{if(!Array.isArray(s.needs))s.needs=[];});
  D.groups.forEach(g=>{if(!Array.isArray(g.students))g.students=[];g.per=Math.max(0,Math.min(15,+g.per||0));if(!g.mode)g.mode='抽離';if(g.on==null)g.on=true;g.grade=g.grade?String(g.grade):'';});
  if(D.title==null)D.title='';
  return D;
}

const GRADE={7:'七年級',8:'八年級',9:'九年級',1:'一年級',2:'二年級',3:'三年級',4:'四年級',5:'五年級',6:'六年級'};
function gradeOfCls(c){const g=parseInt(String(c).trim()[0],10);return isNaN(g)?0:g;}

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
  const tByName={};T.forEach((t,i)=>{tByName[t.name]=i;});M.lfix=new Map();M.fixW=ST_.keepFix===false?0:1.5;
  (D.lockFix||[]).forEach(f=>{const c=cIdx[f.cls],t=tByName[f.t],s=key2s(f.k);if(c==null||t==null||s<0)return;M.lfix.set(c*NS+s,{t,sj:f.sj,cls:f.cls,c,s});});
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
  if(!M.flex){const seen={};     // 彈性鎖課時這兩項不是硬性的：鎖不到就改鎖別科或不鎖
    g.locks.forEach(k=>{if(k.t>=0&&!seen[k.t]&&M.off[k.t][s]){seen[k.t]=1;r.push(M.T[k.t].name+'不排課');}
      if(M.klay[k.c]&&M.klay[k.c][s])r.push(k.cls+' 這一節不能鎖課');});}
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
    if(g.t>=0&&M.strict&&rt[s*NT+g.t])bad('reg',gi,l,s,out&&(M.sn(s)+'：'+M.T[g.t].name+'這一節要上'+g.name+'，但他同時是 '+M.classes[rt[s*NT+g.t]-1]+' 的任課老師、被鎖在原班'));
    for(let a=0;a<g.stu.length;a++){const i=g.stu[a],k=s*NStu+i;
      if(sc[k]-1===gi)v++;else if(sc[k])bad('student',gi,l,s,out&&(M.sn(s)+'：'+M.D.students[i].cls+' '+M.D.students[i].name+'同時在兩組（'+G[sc[k]-1].name+'、'+g.name+'）'));else sc[k]=gi+1;}
    for(let a=0;a<g.locks.length;a++){const lk=g.locks[a],k=s*NC+lk.c,j=g.j+1;
      if(M.flex){   // 盡量排在「原班鎖得到課」的時段：完全鎖不到扣最多，鎖不到同一科或要和別班搶同一位老師扣一點
        if(M.lfix.size&&!M.lfix.has(lk.c*NS+s))soft+=M.fixW;   // 有手排鎖課時，盡量排回手排鎖課的節次
        if(!M.lkav[lk.c*NS+s])soft+=3;else if(lk.t<0||M.off[lk.t][s])soft+=0.6;else{const k2=s*NT+lk.t;if(rt[k2]&&rt[k2]!==lk.c+1)soft+=0.6;else rt[k2]=lk.c+1;}
        continue;}
      if(M.classClash&&cs[k]&&cs[k]!==j)bad('class',gi,l,s,out&&(M.sn(s)+'：'+lk.cls+' 同一節被要求上兩科（'+M.subjects[cs[k]-1]+'、'+g.subject+'）'));else cs[k]=j;
      if(M.strict&&lk.t>=0){const k2=s*NT+lk.t,c=lk.c+1;
        if(tc[k2]&&!rt[k2])bad('reg',gi,l,s,out&&(M.sn(s)+'：'+M.T[lk.t].name+'這一節要上'+G[tc[k2]-1].name+'，但他同時是 '+lk.cls+' 的任課老師、被鎖在原班'));
        if(rt[k2]&&rt[k2]!==c)bad('reg',gi,l,s,out&&(M.sn(s)+'：'+M.T[lk.t].name+'同一節要在兩個班上課（'+M.classes[rt[k2]-1]+'、'+lk.cls+'）'));else rt[k2]=c;}}
    if(NR>0&&M.roomCheck){const fx=M.lroom&&M.lroom[l]>=0&&M.lroom[l]<NR?M.lroom[l]:g.room;
      if(fx>=0){const k=s*NR+fx;if(fr[k])bad('room',gi,l,s,out&&(M.sn(s)+'：'+M.D.rooms[fx].name+'同時被兩組指定（'+G[fr[k]-1].name+'、'+g.name+'）'));else fr[k]=gi+1;}
      if(++rc[s]>NR)bad('room',gi,l,s,out&&(M.sn(s)+'：教室不夠，同時有 '+rc[s]+' 組但只有 '+NR+' 間'));
      else if(M.mainR<NR&&rc[s]>M.mainR)soft+=8;   // 用到備用教室
    }
    gd[gi*5+((s/NP)|0)]++;
  }
  for(let gi=0;gi<G.length;gi++)for(let d=0;d<5;d++){const c=gd[gi*5+d];if(c>M.maxDay)soft+=(c-M.maxDay)*4;}
  for(let a=0;a<M.rts.length;a++){const t=M.rts[a];let tot=0;const dc=[0,0,0,0,0];
    for(let d=0;d<5;d++){let run=0;for(let p=0;p<NP;p++){if(tc[(d*NP+p)*NT+t]){dc[d]++;tot++;if(++run>M.tRun)soft+=2;}else run=0;}}
    const avg=tot/5;for(let d=0;d<5;d++)soft+=(dc[d]-avg)*(dc[d]-avg)*0.4;}
  for(let i=0;i<NStu;i++)for(let d=0;d<5;d++){let c=0;for(let p=0;p<NP;p++)if(sc[(d*NP+p)*NStu+i])c++;if(c>M.sDay)soft+=c-M.sDay;}
  M.viol=v;return v*1000+soft;
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
  const n=M.L.length,S={slot:new Int16Array(n).fill(-1),pin:new Uint8Array(n),rfix:new Int16Array(n).fill(-1)};
  M.L.forEach((x,l)=>{const a=D.assign&&D.assign[M.G[x.g].ref.id],e=a&&a[x.k];if(!e)return;
    if(e.r){const r=D.rooms.findIndex(o=>o.id===e.r);if(r>=0)S.rfix[l]=r;}
    if(!e.s)return;const s=M.key2s(e.s);if(s>=0){S.slot[l]=s;S.pin[l]=e.pin?1:0;}});
  return S;
}
function fromState(M,S){const a={};M.L.forEach((x,l)=>{const id=M.G[x.g].ref.id,e={s:S.slot[l]>=0?M.s2key(S.slot[l]):'',pin:!!S.pin[l]};if(S.rfix&&S.rfix[l]>=0&&M.D.rooms[S.rfix[l]])e.r=M.D.rooms[S.rfix[l]].id;(a[id]=a[id]||[])[x.k]=e;});return a;}

/* 把 l 這一節放到 s 會不會多出違規 */
function canPlace(M,slot,l,s){
  const o=slot[l];slot[l]=-1;evaluate(M,slot);const v0=M.viol;
  slot[l]=s;evaluate(M,slot);const v1=M.viol;slot[l]=o;return v1<v0;
}

/* 分配教室：有指定的照指定；其餘同一位老師盡量固定同一間 */
function assignRooms(M,slot){
  const room=new Int16Array(M.L.length).fill(-1);if(!M.NR)return room;
  const order=M.roomOrder||[...Array(M.NR).keys()],nMain=Math.max(1,M.mainR||M.NR),home={};M.rts.forEach((t,i)=>{home[t]=order[i%nMain];});
  const by={};M.L.forEach((x,l)=>{if(slot[l]>=0)(by[slot[l]]=by[slot[l]]||[]).push(l);});
  for(const s in by){const used=new Uint8Array(M.NR),rest=[];
    by[s].forEach(l=>{const g=M.G[M.L[l].g],fx=M.lroom&&M.lroom[l]>=0&&M.lroom[l]<M.NR?M.lroom[l]:g.room;if(fx>=0&&!used[fx]){used[fx]=1;room[l]=fx;}else rest.push(l);});
    rest.forEach(l=>{const g=M.G[M.L[l].g];let r=g.room>=0?-1:(home[g.t]!=null?home[g.t]:0);
      if(r<0||used[r]){r=-1;for(const i of order)if(!used[i]){r=i;break;}}
      if(r>=0){used[r]=1;room[l]=r;}});}
  return room;
}

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
  return {
    slots:DAYS.flatMap((d,di)=>P.map(p=>({k:di+'-'+p.id,name:'週'+d+p.name,extra:!!p.extra}))),
    blocked:D.blocked,rooms:D.rooms.length,
    rules:{maxPerDayPerCourse:st.maxDay>0?st.maxDay:1,teacherMaxConsecutive:st.tRun>0?st.tRun:3,studentMaxPerDay:st.sDay>0?st.sDay:3},
    teachers:D.teachers.map(t=>({id:tc[t.id],role:t.role,hours:t.hours||0,off:t.off})),
    courses:D.groups.map((g,i)=>({id:'C'+(i+1),on:g.on!==false,subject:g.subject,grade:g.grade||'',mode:g.mode,teacher:tc[g.teacher]||null,perWeek:g.per,
      members:g.students.map(id=>sc[id]).filter(Boolean),fixed:(D.assign[g.id]||[]).filter(e=>e&&e.pin&&e.s).map(e=>e.s)})).filter(c=>c.on),
    students:D.students.map(s=>({id:sc[s.id],cls:String(s.cls),toPlace:pend[s.id]||[],
      off:[...new Set([].concat(OB['g:'+gradeOfCls(s.cls)]||[],OB['c:'+s.cls]||[],OB['s:'+s.id]||[],setOff[s.id]||[]))]})),
    classSubjectTeacher:cs
  };
}
function aiPrompt(D){
  return `你是國中資源班的排課助理。下面的 JSON 是題目（人名都已換成代號），請排出一份沒有衝堂的課表。

做法（老師優先）：
1. 先替每門課 courses 決定時段：每門課要排 perWeek 節，時段用 slots 裡的 k。fixed 是已經固定的時段，一定要保留。
2. 再把 students 裡 toPlace 列出的科目，分配到同科目、同年級（grade 空白表示不限）的課，寫進該課的 members。已經在 members 裡的學生不要移動。

一定要遵守：
- mode 是「抽離」的課只能排在 extra 為 false 的時段；「外加」只能排在 extra 為 true 的時段。
- blocked 的時段都不能排。課的老師、課裡每位學生的 off 時段都不能排。
- 同一位老師同一個時段只能有一門課；同一位學生同一個時段只能在一門課。
- 抽離課會佔用學生原班同一科的時間：classSubjectTeacher["班級|科目"] 是那個班該科的任課老師，他的 off 時段也不能排；同一位任課老師同一個時段不能被兩個不同的班同時用到；同一個班同一個時段不能被兩個不同科目的抽離課用到。
- 同一個時段的課數不能超過 rooms。
盡量做到：rules 裡的三個上限、每位老師每天節數平均。

只回覆一段 JSON，不要其他文字，格式：
{"slots":{"C1":["0-1","2-3"]},"members":{"C1":["S1","S2"]}}
slots 要包含每一門課；members 只要列出有新增學生的課（要寫出完整名單）。

題目：
`+JSON.stringify(aiProblem(D));
}
// 把 AI 的回覆套回資料；回傳套用了幾門課、幾節，以及看不懂的項目數。排得對不對交給原本的衝堂檢查
function aiApply(D,text){
  const a=text.indexOf('{'),b=text.lastIndexOf('}');if(a<0||b<=a)throw new Error('找不到 JSON');
  const R=JSON.parse(text.slice(a,b+1)),sid={},gid={},M=compile(D);
  D.students.forEach((s,i)=>{sid['S'+(i+1)]=s.id;});D.groups.forEach((g,i)=>{gid['C'+(i+1)]=g;});
  let nm=0,nl=0,bad=0;const mem=R.members||{},sl=R.slots||{};
  for(const c in mem){const g=gid[c];if(!g||!Array.isArray(mem[c])){bad++;continue;}
    const ids=[...new Set(mem[c].map(x=>sid[x]))];if(ids.some(x=>!x))bad++;g.students=ids.filter(Boolean);nm++;}
  for(const c in sl){const g=gid[c];if(!g||!Array.isArray(sl[c])){bad++;continue;}
    const arr=(D.assign[g.id]||[]).filter(e=>e&&e.pin&&e.s),used=new Set(arr.map(e=>e.s));
    sl[c].forEach(k=>{k=String(k);if(M.key2s(k)<0){bad++;return;}if(arr.length>=g.per||used.has(k))return;used.add(k);arr.push({s:k,pin:false});nl++;});
    D.assign[g.id]=arr;}
  return {courses:Math.max(nm,Object.keys(sl).length),lessons:nl,bad};
}

/* 貼上「課程領域分組及節數一覽表」：領域、年級、組別、抽離或外加、學生名單、節數、人數、人次、授課教師。
   每一組各自的節數照表上的來；學生名單可以是遮名的（704林○哲），用班級＋姓＋名字最後的字對回名冊。
   同一列右邊如果有「教師…總節數」的鐘點表，也一起讀成老師的基本鐘點。 */
function importCourseTable(D,text){
  const R={added:0,updated:0,members:0,miss:[],teachers:0,hours:0},MK=/[○〇ＯO＊*]/;
  const tOf=name=>{let t=D.teachers.find(x=>x.name===name);if(!t){t=newTeacher(D,name,'資源班');R.teachers++;}return t;};
  let ti=-1,hi=-1;
  String(text).split(/\r?\n/).forEach(line=>{const c=line.split('\t').map(x=>x.trim());
    const a=c.indexOf('教師'),b=c.indexOf('總節數');
    if(a>=0&&b>a){ti=a;hi=b;}else if(ti>=0&&c[ti]&&+c[hi]>0&&!/節數|合計/.test(c[ti])){tOf(c[ti]).hours=+c[hi];R.hours++;}
    const per=+c[5];if(!c[0]||!c[2]||!(per>0)||/領域|名稱/.test(c[0]))return;
    const subject=canonSubj(D,c[0]),grade=/^[1-9]$/.test(c[1])?c[1]:'',name=grade+c[2]+subject,ids=[];
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
    if(c[8])g.teacher=tOf(c[8]).id;
    g.students=ids;R.members+=ids.length;
    ids.forEach(id=>{const s=D.students.find(x=>x.id===id);if(!Array.isArray(s.needs))s.needs=[];if(!s.needs.includes(subject))s.needs.push(subject);});});
  return R;
}

/* 配鎖課：課表排好之後，替每個「有學生被抽離的班級 × 節次」決定請教務處鎖哪一科。
   先盡量鎖和資源班同一科；鎖不到（老師不排課、被別班鎖走、該科節數用完）就改鎖其他主科；都不行就列為鎖不到。
   同一位老師同一節只能被一個班鎖。回傳 locks、open（鎖不到的）、warn（連堂提醒）。 */
function assignLocks(M,slot){
  const {NS,NP,G,L}=M,P=new Map(),busy=new Set();
  for(let l=0;l<L.length;l++){const s=slot[l],g=G[L[l].g];if(s<0)continue;if(g.t>=0)busy.add(g.t*NS+s);if(!g.need)continue;
    g.locks.forEach(k=>{const key=k.c*NS+s;let o=P.get(key);if(!o)P.set(key,o={c:k.c,cls:k.cls,s,want:new Set(),groups:new Set(),pick:null});o.want.add(g.subject);o.groups.add(g.name);});}
  const used={},own=new Map(),rem=(c,sj)=>M.capOf(sj)-(used[c+'|'+sj]||0);
  const set=(o,x)=>{if(o.pick)used[o.c+'|'+o.pick.sj]--;o.pick=x;used[o.c+'|'+x.sj]=(used[o.c+'|'+x.sj]||0)+1;own.set(x.t*NS+o.s,o);};
  const list=[...P.values()].sort((a,b)=>a.s-b.s||a.c-b.c);
  list.forEach(o=>{const w=x=>o.want.has(x.sj)?1:0;o.opt=(M.klay[o.c]&&M.klay[o.c][o.s])?[]:M.copt[o.c].filter(x=>!M.off[x.t][o.s]&&!busy.has(x.t*NS+o.s)).sort((a,b)=>w(b)-w(a));});
  const tryA=(o,seen,same)=>{for(const x of o.opt){if(same&&!o.want.has(x.sj))continue;if(seen.has(x.t))continue;
      if(!(rem(o.c,x.sj)>0||(o.pick&&o.pick.sj===x.sj)))continue;seen.add(x.t);
      const w=own.get(x.t*NS+o.s);if(w&&w!==o&&w.fixed)continue;if(!w||w===o||tryA(w,seen,same)){set(o,x);return true;}}
    return false;};
  // 手排鎖課優先：這一節有學生被抽離、而且那位老師沒有在資源班上課，就照手排的鎖
  const idle=[];
  if(M.lfix&&M.lfix.size)M.lfix.forEach((f,key)=>{const o=P.get(key);
    if(!o){idle.push({cls:f.cls,s:f.s,t:M.T[f.t].name,sj:f.sj});return;}
    if(busy.has(f.t*NS+o.s)||own.has(f.t*NS+o.s))return;
    const x=M.copt[o.c].find(y=>y.t===f.t)||{sj:f.sj,t:f.t};set(o,x);o.fixed=true;});
  list.forEach(o=>{if(!o.pick)tryA(o,new Set(),true);});
  list.forEach(o=>{if(!o.pick)tryA(o,new Set(),false);});
  // 連堂：某一科鎖到只剩 1 節（或全鎖）時，鎖的節次裡要有兩節連在一起，不然教務處排不出連堂；沒有就在旁邊多鎖一節
  const warn=[],extra=[];
  if(M.dbl.size){const byC={};list.forEach(o=>{if(o.pick&&M.dbl.has(o.pick.sj)){const k=o.c+'|'+o.pick.sj;(byC[k]=byC[k]||[]).push(o);}});
    for(const key in byC){if(byC[key].some(o=>o.fixed))continue;const a=byC[key],c=a[0].c,sj=a[0].pick.sj,t=a[0].pick.t,capv=M.capOf(sj);if(capv>=99||a.length<capv-1)continue;
      const has=new Set(a.map(o=>o.s)),adj=s=>[s%NP?s-1:-1,(s+1)%NP?s+1:-1].filter(x=>x>=0);
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
  opt=opt||{};const slot=Int16Array.from(S.slot),sc=()=>{const A=assignLocks(M,slot);return A.open.length*20-A.same-A.fixed*8;};   // 也盡量回到手排鎖課的節次
  let c0=evaluate(M,slot);const v0=M.viol;let b=sc();
  for(let pass=0;pass<(opt.passes||2);pass++){let imp=false;
    for(let l=0;l<M.L.length;l++){if(S.pin[l]||slot[l]<0||(opt.only&&!opt.only(l)))continue;const g=M.G[M.L[l].g];if(!g.need)continue;const o=slot[l];let best=o;
      for(const s of g.alist){if(s===o)continue;slot[l]=s;const c=evaluate(M,slot);if(M.viol>v0||c>c0+1.5)continue;const x=sc();if(x<b){b=x;best=s;c0=c;}}
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
    let t=D.teachers.find(x=>x.name===tn);if(!t){t=newTeacher(D,tn,'普通班');R.newT.push(tn);}
    sj=sj?canonSubj(D,sj):'';
    if(!sj){const e=Object.keys(D.classSubj).find(q=>q.startsWith(cls+'|')&&D.classSubj[q]===t.id);sj=e?e.slice(e.indexOf('|')+1):'';}
    if(sj&&!D.classSubj[cls+'|'+sj])D.classSubj[cls+'|'+sj]=t.id;
    out.push({cls,k,t:tn,sj});R.n++;cs.add(cls);};
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
// 科目：OCR 常錯一個字。找同長度、只差一個字的科目；兩個科目一樣像（例：類語文＝國語文或英語文）就全部回傳，交給老師名字決定
function ttSubjCand(s){s=String(s||'').trim();if(TT_SUBJ.includes(s))return [s];const c=cjk(s);if(TT_SUBJ.includes(c))return [c];
  let bs=0,best=[];TT_SUBJ.forEach(v=>{if(v.length!==c.length||c.length<2)return;let m=0;for(let i=0;i<c.length;i++)if(c[i]===v[i])m++;if(m>bs){bs=m;best=[v];}else if(m===bs&&m)best.push(v);});
  return bs>=c.length-1&&bs>=1?best:[s];}
function ttSubjFix(s){return ttSubjCand(s)[0];}
// 名字：先找完全相同、或多讀了雜字但裡面含有已知名字的；再找同位置對上兩個字的；平手就不猜
const ttScore=(s,k)=>{let sc=0;for(let off=0;off<=Math.max(0,s.length-k.length);off++){let m=0;for(let i=0;i<k.length;i++)if(s[i+off]===k[i])m++;sc=Math.max(sc,m);}return sc;};
function ttNameFix(raw,known,pool,exp){const s=cjk(raw);if(!s)return {t:String(raw||'').trim(),unk:true};
  if(known.has(s))return {t:s};
  for(let i=0;i+3<=s.length;i++){const x=s.slice(i,i+3);if(known.has(x))return {t:x};}
  const pick=(set,min)=>{let best=null,bs=0,tie=false;set.forEach(k=>{const sc=ttScore(s,k);if(sc>bs){bs=sc;best=k;tie=false;}else if(sc===bs)tie=true;});return best&&!tie&&bs>=min?best:null;};
  let b=pick(known,2);if(b)return {t:b,fix:true};
  // 這一科在別班、或這一班任課老師名單上的老師裡，只有一位對得上一個字：當成推測，標示讓人確認
  if(exp&&ttScore(s,exp)>=1)return {t:exp,guess:true};   // 這一班任課老師名單上的那位優先
  if(pool&&pool.size){b=pick(pool,1);if(b)return {t:b,guess:true};}
  return {t:s,unk:true};}
// 一頁的統計文字 → [{sj,t,n,unk,guess}]。ctx.pool(科目)＝這一科可能的老師
function ttParse(text,known,ctx){ctx=ctx||{};const poolOf=s=>ctx.pool?ctx.pool(s):null,expOf=s=>ctx.exp?ctx.exp(s):null;
  const toks=String(text).replace(/[”“"'’‘。，,、:：|\[\]【】_~．·()（）;；]/g,' ').split(/\s+/).flatMap(t=>t.split(/(\d+)/)).map(t=>t.trim()).filter(Boolean);
  const out=[];let sj=null,nm=null;
  const push=n=>{const C=ttSubjCand(sj);let S=C[0],N=null;
    if(C.length>1){for(const c of C){const x=ttNameFix(nm,known,poolOf(c),expOf(c));const p=poolOf(c);if(!x.unk&&p&&p.has(x.t)){S=c;N=x;break;}}}
    if(!N)N=ttNameFix(nm,known,poolOf(S),expOf(S));
    if(cjk(N.t).length<2||!/[一-鿿]{2}/.test(S))return;
    out.push({sj:S,t:N.t,n,unk:!!N.unk||C.length>1&&!N.guess&&!(poolOf(S)||new Set()).has(N.t)||!TT_SUBJ.includes(S)&&!/colorful|心|家|範/.test(S),guess:!!N.guess});};
  toks.forEach(t=>{if(/^\d+$/.test(t)){if(sj&&nm)push(+t>9?+String(t).slice(-1):+t);sj=nm=null;return;}
    if(!sj||!/[一-鿿]{2}|colorful/i.test(sj))sj=t;else if(!nm)nm=t;else{push(1);sj=t;nm=null;}});   // 前面是雜字就丟掉
  return out;}
// 整份檔案一起讀：先讀一遍收集各科確定的老師，再用「同一科的老師」和「這一班的任課老師」補認不出來的名字
function ttParseAll(D,pages,known){
  const CS={'國語文':'國文','英語文':'英文','數學':'數學','理化':'理化'},tn=id=>{const t=D.teachers.find(x=>x.id===id);return t?t.name:'';};
  const exp=(cls,s)=>{if(!cls||!CS[s])return null;const id=D.classSubj[cls+'|'+canonSubj(D,CS[s])];return id?tn(id):null;};
  const first=pages.map(p=>({p,list:ttParse(p.text,known)}));
  const by={};first.forEach(o=>o.list.forEach(x=>{if(!x.unk)(by[x.sj]=by[x.sj]||new Set()).add(x.t);}));
  return first.map(o=>{let cls=o.p.cls||ttGuessClass(D,o.list)||'';
    const list=ttParse(o.p.text,known,{exp:s=>exp(cls,s),pool:s=>{const a=new Set(by[s]||[]),e=exp(cls,s);if(e)a.add(e);return a;}});
    const c2=cls||ttGuessClass(D,list);   // 第一遍猜不出來，用補認過的名字再猜一次
    return {cls:c2,guessCls:!o.p.cls&&!!c2,list,page:o.p.page,src:o.p.src};});}
// 班級編號：OCR 數字常多讀一個雜字，取最後三碼
function ttClassNo(s){const m=String(s||'').replace(/\D/g,'').match(/([5-9]\d{2})$/);return m?m[1]:'';}
// 沒讀到編號時，用國英數老師對照「任課老師」猜是哪一班
function ttGuessClass(D,list){let best='',bs=0,tie=false;const cls=[...new Set(Object.keys(D.classSubj).map(k=>k.split('|')[0]))];
  const tn=id=>{const t=D.teachers.find(x=>x.id===id);return t?t.name:'';};
  const top={};list.forEach(x=>{if(!top[x.sj]||x.n>top[x.sj].n)top[x.sj]=x;});   // 每科只看節數最多的老師（第八節輔導課的不算）
  cls.forEach(c=>{let m=0;Object.values(top).forEach(x=>{const k=c+'|'+canonSubj(D,x.sj.replace('國語文','國文').replace('英語文','英文'));if(D.classSubj[k]){const n=tn(D.classSubj[k]);if(n===x.t)m++;else if(n&&ttScore(cjk(x.t),n)>=2)m+=0.6;}});
    if(m>bs){bs=m;best=c;tie=false;}else if(m===bs&&m)tie=true;});
  return bs>=2&&!tie?best:'';}
function ttKnown(D){const k=new Set(D.teachers.map(t=>t.name).concat(Object.keys(D.offPool||{})));Object.values(D.tt||{}).forEach(c=>Object.values(c.subj||{}).forEach(a=>a.forEach(x=>{if(!x[2])k.add(x[0]);})));
  return new Set([...k].filter(n=>cjk(n).length>=2&&cjk(n)===n));}
// 存進 D.tt[班級]={subj:{科目:[[老師,節數,待確認]]},src}
function ttStore(D,cls,list,src){const subj={};list.forEach(x=>{const a=subj[x.sj]=subj[x.sj]||[];const o=a.find(y=>y[0]===x.t);if(o)o[1]+=x.n;else a.push([x.t,x.n,x.unk?1:0]);});
  Object.values(subj).forEach(a=>a.sort((p,q)=>q[1]-p[1]));D.tt=D.tt||{};D.tt[cls]={subj,src:src||''};}
// 一班某一科的老師（節數最多的；社會、自然這類一次對好幾科）
const EXAM_TT={'國文':['國語文'],'作文':['國語文'],'國語文':['國語文'],'英文':['英語文'],'英聽':['英語文'],'英語文':['英語文'],'數學':['數學'],
  '社會':['歷史','地理','公民與社會'],'歷史':['歷史'],'地理':['地理'],'公民':['公民與社會'],'公民與社會':['公民與社會'],
  '自然':['生物','理化','地球科學','地科'],'生物':['生物'],'理化':['理化'],'地科':['地球科學','地科'],'地球科學':['地球科學','地科']};
function ttTeachers(tt,cls,subject){const c=tt&&tt[String(cls)];if(!c)return [];const want=EXAM_TT[subject]||[subject];
  return [...new Set(want.flatMap(s=>(c.subj[s]||[]).slice(0,1).map(x=>x[0])))];}
/* 新增老師：先前匯入過、但當時不在名冊裡的老師不排課時段（offPool）會自動帶上 */
function newTeacher(D,name,role){const P=D.offPool||{},t={id:uid('t'),name,role,off:(P[name]||[]).slice(),note:'',hours:0};D.teachers.push(t);return t;}
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
    else{let t=D.teachers.find(x=>x.name===name);
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
  let t=D.teachers.find(x=>x.name===name);if(!t&&role){t=newTeacher(D,name,role);t._new=1;}
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
  const R={add:0,upd:0,skip:0,cm:0,noCM:[]};let col=null;
  String(text).split(/\r?\n/).forEach(line=>{
    let a=line.split(line.includes('\t')?'\t':/[,，\s]+/).map(x=>x.trim());if(!a.some(Boolean))return;
    if(!col&&a.some(x=>/^(學生)?姓名$/.test(x))&&a.some(x=>/班級/.test(x))){const f=re=>a.findIndex(x=>re.test(x));col={cls:f(/班級/),seat:f(/座號/),name:f(/^(學生)?姓名$/),cm:f(/個管/),note:f(/備註|導師/)};return;}
    let cls,seat='',name,cm='',note='';
    if(col){cls=a[col.cls];seat=col.seat>=0?a[col.seat]:'';name=a[col.name];cm=col.cm>=0?a[col.cm]:'';note=col.note>=0?a[col.note]:'';}
    else{a=a.filter(Boolean);[cls,seat,name,cm,note]=a.length>=3?a:[a[0],'',a[1]];}
    const m=String(cls||'').match(/^(\d{3,4})\s*[-－]\s*(\d{1,2})\s*(.*)$/);
    if(m){cls=m[1];if(!seat||!name){name=m[3]||seat||name;seat=m[2];}}
    if(!/^\d{3,4}$/.test(String(cls||''))||!name){R.skip++;return;}
    seat=seat?String(+seat||seat).padStart(2,'0'):'';
    let s=D.students.find(x=>String(x.cls)===cls&&((seat&&x.seat&&+x.seat===+seat)||x.name===name));
    if(s){s.name=name;if(seat)s.seat=seat;R.upd++;}else{s={id:uid('s'),cls,seat,name,caseMgr:'',note:'',needs:[]};D.students.push(s);R.add++;}
    if(cm){const t=D.teachers.find(x=>x.name===cm.replace(/老師$/,''))||D.teachers.find(x=>x.name===cm);if(t){s.caseMgr=t.id;R.cm++;}else R.noCM.push(cm);}
    if(note)s.note=note;
  });
  R.noCM=[...new Set(R.noCM)];return R;
}
/* 開始新學期。opt：clearAssign 清空排課結果、clearGroups 清空課程、clearCS 清空任課老師、clearClassOff 清空班級不排課、
   clearTeaOff 清空所有老師的不排課、promote 升年級（七→八、八→九，九年級畢業移出名冊；國小一到六年級同理）。
   升年級時班級號碼會變，所以課程、任課老師、班級不排課一定一起清空 */
function newTerm(D,opt){
  const R={grad:0,up:0};
  if(opt.promote){opt.clearAssign=opt.clearGroups=opt.clearCS=opt.clearClassOff=true;
    const gone=[];D.students=D.students.filter(s=>{const g=gradeOfCls(s.cls);if(g===9||g===6){gone.push(s.id);R.grad++;return false;}
      if(g>=1&&g<=8&&/^\d{3,4}$/.test(String(s.cls))){s.cls=String(g+1)+String(s.cls).slice(1);R.up++;}return true;});
    D.gone=(D.gone||[]).concat(gone).slice(-500);
    gone.forEach(id=>{delete D.offBy['s:'+id];});D.sets.forEach(x=>{x.students=x.students.filter(id=>!gone.includes(id));});}
  if(opt.clearAssign){D.assign={};D.lockFix=[];}
  if(opt.clearGroups){D.groups=[];D.assign={};}
  if(opt.clearCS)D.classSubj={};
  if(opt.clearClassOff)Object.keys(D.offBy).forEach(k=>{if(k[0]==='c'||k[0]==='k')delete D.offBy[k];});
  if(opt.clearTeaOff){D.teachers.forEach(t=>{t.off=[];});D.offPool={};}
  if(opt.title!=null)D.title=opt.title;
  return R;
}

const CORE={ttParseAll,ttParse,ttNameFix,ttSubjFix,ttClassNo,ttGuessClass,ttKnown,ttStore,ttTeachers,EXAM_TT,TT_SUBJ,importLocks,newTeacher,canonSubj,importTeacherList,importStudents,newTerm,assignLocks,refineLocks,importOff,importCourseTable,needList,candidates,placeStudents,aiProblem,aiPrompt,aiApply,DAYS,ROLES,MODES,GRADE,gradeOfCls,uid,defaultData,emptyData,normalize,compile,why,evaluate,solve,toState,fromState,canPlace,assignRooms,lockTable};
if(typeof module!=='undefined')module.exports=CORE;

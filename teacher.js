/* 資源班管理系統｜老師模式：登入後信箱被綁定到名冊裡一位老師，只看「我的」。
   頁面：今天（me_today）、我的學生（me_stu）、我的 IEP（me_iep，畫面在 iep.js）、點名（me_check）、我的設定（me_set）。
   上半部是純邏輯（TEACH，瀏覽器與 node 共用，test-iep.js 會測）；下半部是畫面，載入順序在 app.js 之後。
   和 app.js 的約定：window.APPROLE（'admin'／'teacher'）、window.ME_TID（綁定的老師 id）、setRole(role,tid)；
   APPROLE 是 teacher 時導覽列顯示這裡登記的 PAGES.me_*。app.js 還沒有 setRole 時，下面有一個最小的替代版本。 */
'use strict';
(function(root){

/* ───── 純邏輯 ───── */
const lc=e=>String(e||'').trim().toLowerCase();
// 這個信箱登入後是什麼身分：主持人一律是管理者；有綁定老師的是老師；沒綁定的編輯、檢視維持原本（管理者畫面）
// 綁定的老師已經從名冊刪掉：還是老師身分，但沒有老師 id（missing＝原本綁的 id，畫面顯示「找不到綁定的老師」），絕不變成管理者
function roleFor(access,email,teachers){const e=lc(email);if(!access||!e)return {role:'admin',tid:''};
  if(lc(access.admin)===e)return {role:'admin',tid:''};
  const B=access.bind&&typeof access.bind==='object'?access.bind:{};let tid='';
  for(const k in B)if(lc(k)===e){tid=String(B[k]||'');break;}
  if(!tid)return {role:'admin',tid:''};
  if(Array.isArray(teachers)&&teachers.length&&!teachers.some(t=>t.id===tid))return {role:'teacher',tid:'',missing:tid};   // 綁到已刪除的老師
  return {role:'teacher',tid};}
// 綁定只留在共用名單裡、而且不是主持人的信箱；老師 id 空白的拿掉
function cleanBind(bind,emails,admin){const out={},E=new Set((emails||[]).map(lc));
  for(const k in bind||{}){const e=lc(k),v=String(bind[k]||'');if(v&&E.has(e)&&e!==lc(admin))out[e]=v.slice(0,60);}
  return out;}
function setBind(bind,email,tid){const o=Object.assign({},bind||{}),e=lc(email);Object.keys(o).forEach(k=>{if(lc(k)===e)delete o[k];});if(tid)o[e]=String(tid);return o;}
function myGroups(D,tid){return (D.groups||[]).filter(g=>g.teacher===tid&&g.on!==false);}
// 我的學生：cm＝我個管的；taught＝我有教、但不是我個管的
function myStudents(D,tid){const cm=D.students.filter(s=>s.caseMgr===tid),inG=new Set(myGroups(D,tid).flatMap(g=>g.students||[]));
  return {cm,taught:D.students.filter(s=>s.caseMgr!==tid&&inG.has(s.id))};}
// 私密欄位（個管私密備註、IEP 日期、檢討日、鑑定有效期限、家長聯絡、段考服務）：管理者，或這位學生的個管
const PRIV=['privNote','iepDate','reviewDate','certExp','contacts','examSvc'];
function canSeePriv(s,tid,role){return role!=='teacher'||(!!tid&&!!s&&s.caseMgr===tid);}
// 老師看到的一位學生：不是個管的，私密欄位拿掉
function studentView(s,tid,role){const o=Object.assign({},s);if(!canSeePriv(s,tid,role))PRIV.forEach(k=>delete o[k]);return o;}
// 老師和這位學生的關係：cm＝個管、taught＝有教（在他的組別裡）、''＝沒關係（老師身分看不到這位學生）
function relation(D,tid,s){if(!tid||!s)return '';if(s.caseMgr===tid)return 'cm';return myGroups(D,tid).some(g=>(g.students||[]).includes(s.id))?'taught':'';}
// 老師身分能去的頁面（白名單）：我的頁面（me_*）、自己學生（個管＋有教）的個案頁；IEP 會議頁換成「我的 IEP」；其他一律回「今天」
// 回傳 {p,s}（頁面、分頁）；sid＝個案頁的學生 id
const ME_PAGES=['me_today','me_stu','me_iep','me_check','me_set'];
function route(D,tid,p,s,sid){p=String(p||'');
  if(ME_PAGES.includes(p))return {p,s};
  if(p==='iep')return {p:'me_iep',s:['survey','plan','quick'].includes(s)?s:undefined};
  if(p==='stu'&&s==='case'){const st=D&&(D.students||[]).find(x=>x.id===sid);return st&&relation(D,tid,st)?{p:'stu',s:'case'}:{p:'me_stu'};}
  return {p:'me_today'};}
const DUE=[['iepDate','IEP 會議'],['reviewDate','下次檢討'],['certExp','鑑定有效期限']];
// 我個管的學生，days 天內到期（或已經過了）的日期
function dueSoon(D,tid,today,days){const t=new Date(today+'T00:00:00'),lim=new Date(t);lim.setDate(lim.getDate()+(days==null?30:days));const out=[];
  D.students.filter(s=>s.caseMgr===tid).forEach(s=>DUE.forEach(([k,n])=>{const v=s[k];if(!v||!/^\d{4}-\d{2}-\d{2}$/.test(v))return;const d=new Date(v+'T00:00:00');
    if(d<=lim)out.push({s,k,name:n,date:v,left:Math.round((d-t)/864e5)});}));
  return out.sort((a,b)=>a.date.localeCompare(b.date));}
// IEP：我還沒填的調查（別人或自己開的、期限還沒過）
function iepOwed(D,tid,today){const I=root.IEP||(typeof require==='function'?require('./iep.js'):null);if(!I)return [];const pk='t:'+tid;
  return I.invited(D,tid).filter(R=>!R.due||R.due>=today).map(R=>({R,o:I.progress(D,R).people.find(x=>x.k===pk)})).filter(x=>x.o&&x.o.keys.length&&!x.o.done);}
// 我要出席、已經排定的會議（today 之後）
function iepUpcoming(D,tid,today){const I=root.IEP||(typeof require==='function'?require('./iep.js'):null);if(!I)return [];const pk='t:'+tid,out=[];
  I.ensure(D).rounds.forEach(R=>R.meets.forEach(m=>{if(m.at&&m.at.slice(0,10)>=today&&m.p.some(x=>x[0]===pk))out.push({R,m,f:I.slotInfo(D,m.at)});}));
  return out.sort((a,b)=>a.m.at.localeCompare(b.m.at));}
// 段考監考：exam.html 的資料（proctorOf／supportOf：「節次id|教室id」→ 老師姓名）。姓名去掉稱謂、科目括號再比
const nn=s=>String(s||'').replace(/\s+/g,'').replace(/[（(][^）)]*[）)]$/,'').replace(/(老師|教師|主任|組長)$/,'');
function proctorDuties(E,name){if(!E||!name)return [];const me=nn(name),out=[],ses=E.sessions||[],rooms=E.rooms||[];
  const add=(map,sup)=>Object.keys(map||{}).forEach(k=>{if(!map[k]||nn(map[k])!==me)return;const i=k.indexOf('|'),T=ses.find(s=>s.id===k.slice(0,i)),Rm=rooms.find(r=>r.id===k.slice(i+1));
    if(T)out.push({key:k,date:T.date||'',dow:T.dow||'',period:T.period||'',subject:T.subject||'',start:T.start||'',end:T.end||'',room:Rm?Rm.name:'',sup,order:ses.indexOf(T)});});
  add(E.proctorOf,false);add(E.supportOf,true);
  return out.sort((a,b)=>a.order-b.order||a.room.localeCompare(b.room));}

const TEACH={roleFor,cleanBind,setBind,myGroups,myStudents,canSeePriv,studentView,PRIV,relation,route,ME_PAGES,dueSoon,iepOwed,iepUpcoming,proctorDuties,normName:nn};
if(typeof module!=='undefined'&&module.exports){module.exports=TEACH;return;}
root.TEACH=TEACH;
if(typeof document==='undefined'||typeof PAGES==='undefined')return;

/* ───── 和 app.js 的約定：還沒有 setRole 時的最小替代 ───── */
if(root.APPROLE==null)root.APPROLE='admin';
if(root.ME_TID==null)root.ME_TID='';
if(typeof setRole!=='function'){
  root.setRole=function(role,tid){root.APPROLE=role==='teacher'?'teacher':'admin';root.ME_TID=root.APPROLE==='teacher'?String(tid||''):'';
    const onMe=/^me_/.test(page);if(root.APPROLE==='teacher'&&!onMe)go('me_today');else if(root.APPROLE==='admin'&&onMe)go('home');else render();};
  root.setRole.shim=true;}
const ROLE=()=>String((typeof APPROLE!=='undefined'?APPROLE:root.APPROLE)||'admin');
const TID=()=>String((typeof ME_TID!=='undefined'?ME_TID:root.ME_TID)||'');
const me=()=>D.teachers.find(t=>t.id===TID())||null;
const H=(n,t,extra)=>'<h3 class="tp-h"><i>'+n+'</i>'+esc(t)+(extra||'')+'</h3>';
// 替代版 setRole（app.js 還沒有切換鈕）時，管理者預覽老師畫面要有路回去；綁定自動切成老師的不顯示
const back=()=>root.setRole&&root.setRole.shim&&!(typeof bindAuto!=='undefined'&&bindAuto)&&me()?'<div class="bar"><span class="note" style="margin:0">預覽 '+esc(me().name)+'</span><button class="b sm" onclick="setRole(&quot;admin&quot;)">回到管理者</button></div>':'';
const pg=h=>{$('page').innerHTML='<div class="tp">'+back()+h+'</div>';};
const noMe=()=>'<div class="iepempty"><span>'+(TID()||root.ME_MISSING?'找不到綁定的老師，請洽管理者':'還沒有綁定老師')+'</span></div>';
const sLab=s=>s.cls+(s.seat?'-'+String(s.seat).padStart(2,'0'):'')+' '+s.name;
const addD=(ymd0,n)=>{const d=new Date(ymd0+'T00:00:00');d.setDate(d.getDate()+n);return ymd(d);};
const md=v=>{const d=new Date(v+'T00:00:00');return (d.getMonth()+1)+'/'+d.getDate();};
// 某一天我的課（照正式課表）
function mySessions(date){const tid=TID();return sessionsOn(date).filter(x=>x.g.ref&&x.g.ref.teacher===tid);}

/* ── 今天 ── */
function rToday(){const t=me();if(!t){pg(noMe());return;}
  const now=new Date(),td=today(),wd=now.getDay(),school=wd>=1&&wd<=5,hm=hmNow();
  const day=school?td:addD(td,wd===6?2:1),ses=mySessions(day),pis=[...new Set(ses.map(x=>x.pi))].sort((a,b)=>a-b);
  let h='<div class="tp-hello"><span>'+(now.getMonth()+1)+' 月 '+now.getDate()+' 日　週'+'日一二三四五六'[wd]+'</span><h2>'+esc(t.name)+'</h2></div>';
  h+=H('01',school?'今天的課':'週一的課');
  h+=pis.length?'<div class="tp-list">'+pis.map(pi=>{const p=D.periods[pi],xs=ses.filter(x=>x.pi===pi),cur=school&&hm>=p.start&&hm<p.end;
    return '<div class="tp-row'+(cur?' now':'')+'"><div class="tp-tm"><b>'+esc(p.name)+'</b><small>'+esc(p.start)+'</small></div><div class="tp-ev">'+xs.map(x=>{
      const inn=school?countIn(day,x):0,room=ROOM&&ROOM[x.l]>=0?D.rooms[ROOM[x.l]].name:'';
      return '<span><b>'+esc(x.g.name)+'</b><small>'+esc([room,(school&&(cur||hm>=p.end)?'到 '+inn+'/':'')+x.g.stu.length+' 人'].filter(Boolean).join('・'))+'</small></span>';}).join('')+'</div>'+
      (cur?'<button class="b pri sm" onclick="go(\'me_check\')">點名</button>':'')+'</div>';}).join('')+'</div>':'<p class="tp-none">沒有課</p>';
  // 待辦
  const todo=[];
  if(school)ses.filter(x=>hm>=x.p.start).forEach(x=>{const miss=x.g.stu.filter(i=>!attGet(td,x.key,D.students[i].id)).length;if(miss)todo.push([x.p.name+' '+x.g.name+'：'+miss+' 人還沒點名','點名',"go('me_check')"]);});
  TEACH.iepOwed(D,t.id,td).forEach(({R})=>todo.push(['IEP 時間調查「'+(R.name||R.kind)+'」還沒填'+(R.due?'（'+md(R.due)+' 前）':''),'填空堂',"go('me_iep','inv')"]));
  IEP.ownRounds(D,t.id,0).forEach(R=>{const p=IEP.progress(D,R),un=R.meets.filter(m=>!m.at).length;if(R.meets.length&&p.ready===p.meets.length&&un)todo.push(['「'+(R.name||R.kind)+'」回覆齊了，可以排時間','排定',"go('me_iep','plan')"]);});
  TEACH.dueSoon(D,t.id,td,30).forEach(x=>todo.push([sLab(x.s)+'　'+x.name+' '+md(x.date)+(x.left<0?'（已過）':x.left===0?'（今天）':'（'+x.left+' 天）'),'學生',"go('me_stu')"]));
  h+=H('02','待辦')+(todo.length?'<ul class="tp-todo">'+todo.map(([a,b,f])=>'<li><button type="button" onclick="'+f+'"><span>'+esc(a)+'</span><em>'+esc(b)+' ›</em></button></li>').join('')+'</ul>':'<p class="tp-none">沒有待辦</p>');
  const up=TEACH.iepUpcoming(D,t.id,td).slice(0,5);
  if(up.length)h+=H('03','要開的會')+'<ul class="tp-todo">'+up.map(x=>'<li><button type="button" onclick="go(\'me_iep\',\'inv\')"><span>'+esc(x.f.label+' '+x.f.time)+'　'+esc(IEP.stuShow(IEP.stuOf(D,x.m.s),'cls'))+(x.m.room?'・'+esc(x.m.room):'')+'</span><em>'+esc(x.R.kind||'IEP')+'</em></button></li>').join('')+'</ul>';
  pg(h);}

/* ── 我的學生 ── */
let stuQ='';
function lessonsOf(sid){const out=[];if(!M||!ST)return out;
  M.L.forEach((x,l)=>{const g=M.G[x.g],s=ST.slot[l];if(s<0||!g.ref||!(g.ref.students||[]).includes(sid))return;out.push({s,t:'週'+DAYS[Math.floor(s/M.NP)]+' '+M.P[s%M.NP].name,g:g.name});});
  return out.sort((a,b)=>a.s-b.s);}
function card(s,mine){const tid=TID(),G=D.groups.filter(g=>g.on!==false&&(g.students||[]).includes(s.id)),cm=D.teachers.find(t=>t.id===s.caseMgr),ls=lessonsOf(s.id);
  const due=TEACH.dueSoon(D,tid,today(),30).filter(x=>x.s===s);
  let h='<details class="tp-card"><summary><b>'+esc(s.name)+'</b><span>'+esc(s.cls)+(s.seat?'-'+esc(String(s.seat).padStart(2,'0')):'')+'</span>'+
    (due.length?'<span class="tp-chip warn">'+esc(due[0].name)+' '+md(due[0].date)+'</span>':'')+'</summary><dl>'+
    '<dt>組別</dt><dd>'+(G.length?G.map(g=>esc(g.name)).join('、'):'—')+'</dd>'+
    '<dt>課表</dt><dd>'+(ls.length?ls.map(x=>esc(x.t)+' '+esc(x.g)).join('<br>'):'—')+'</dd>'+
    '<dt>個管</dt><dd>'+esc(cm?cm.name:'未指定')+'</dd>'+
    (s.note?'<dt>提醒</dt><dd>'+esc(s.note)+'</dd>':'');
  if(TEACH.canSeePriv(s,tid,ROLE())){const ro=typeof isRO==='function'&&isRO(),f=(k,type)=>'<input type="'+type+'" value="'+esc(s[k]||'')+'"'+(ro?' disabled':'')+' data-sid="'+esc(s.id)+'" data-k="'+k+'" onchange="tpSet(this)">';
    h+='<dt>私密備註</dt><dd><textarea rows="2" data-sid="'+esc(s.id)+'" data-k="privNote" onchange="tpSet(this)"'+(ro?' disabled':'')+'>'+esc(s.privNote||'')+'</textarea></dd>'+
      '<dt>IEP 會議</dt><dd>'+f('iepDate','date')+'</dd><dt>下次檢討</dt><dd>'+f('reviewDate','date')+'</dd><dt>鑑定期限</dt><dd>'+f('certExp','date')+'</dd>';}
  return h+'</dl></details>';}
function rStu(){const t=me();if(!t){pg(noMe());return;}
  const S=TEACH.myStudents(D,t.id),q=stuQ.trim(),hit=s=>!q||String(s.name).includes(q)||String(s.cls).includes(q);
  const cm=S.cm.filter(hit).sort(sortStu),tg=S.taught.filter(hit).sort(sortStu);
  let h='<div class="bar tp-search"><input type="search" placeholder="找姓名或班級" value="'+esc(stuQ)+'" oninput="tpQ(this.value)" aria-label="找學生"></div>';
  h+=H('01','我個管的','<small>'+S.cm.length+' 人</small>')+(cm.length?'<div class="tp-cards">'+cm.map(s=>card(s,true)).join('')+'</div>':'<p class="tp-none">'+(S.cm.length?'沒有符合的':'沒有個管的學生')+'</p>');
  h+=H('02','我教的','<small>'+S.taught.length+' 人</small>')+(tg.length?'<div class="tp-cards">'+tg.map(s=>card(s,false)).join('')+'</div>':'<p class="tp-none">'+(S.taught.length?'沒有符合的':'沒有')+'</p>');
  pg(h);
  const el=document.querySelector('.tp-search input');if(el&&q){el.focus();el.setSelectionRange(el.value.length,el.value.length);}}
root.tpQ=function(v){stuQ=v;clearTimeout(root.tpQ.h);root.tpQ.h=setTimeout(rStu,150);};
// 只改得到自己個管的學生（管理者預覽也一樣）
root.tpSet=function(el){const s=D.students.find(x=>x.id===el.dataset.sid),k=el.dataset.k;if(!s||!TEACH.PRIV.includes(k)||!TEACH.canSeePriv(s,TID(),ROLE()))return;
  const v=el.value.trim();if(v)s[k]=v;else delete s[k];save();};

/* ── 點名：用 checkin.js 的點名畫面，只留我的課（暫時把 sessionsOn 換成過濾過的版本，畫完換回來） ── */
function rCheck(){if(!me()){pg(noMe());return;}const orig=sessionsOn,tid=TID();
  try{sessionsOn=date=>orig(date).filter(x=>x.g.ref&&x.g.ref.teacher===tid);renderCheckin();}finally{sessionsOn=orig;}
  clearInterval(ciTimer);ciTimer=setInterval(()=>{if(page==='me_check'&&ciAuto&&!$('dlg').open&&document.activeElement!==$('ciIn')&&!cam)render();},30000);}

/* ── 我的設定 ── */
function rSet(){const t=me();if(!t){pg(noMe());return;}const ro=typeof isRO==='function'&&isRO(),off=new Set(t.off||[]),reg=D.periods;
  let h=H('01','我的不排課時段','<small>'+off.size+' 節</small>')+'<div class="scroll"><table class="tp-off"><tr><th></th>'+DAYS.map(d=>'<th>'+d+'</th>').join('')+'</tr>'+
    reg.map(p=>'<tr><th>'+esc(p.name)+'<small>'+esc(p.start)+'</small></th>'+DAYS.map((d,di)=>{const k=di+'-'+p.id,on=off.has(k);
      return '<td><button type="button" class="'+(on?'on':'')+'" aria-pressed="'+on+'" aria-label="週'+d+esc(p.name)+(on?' 不排課':'')+'" data-k="'+esc(k)+'" onclick="tpOff(this.dataset.k)"'+(ro?' disabled':'')+'>'+(on?'不排':'')+'</button></td>';}).join('')+'</tr>').join('')+'</table></div>';
  let E=null;try{E=JSON.parse(localStorage.getItem(typeof EXKEY!=='undefined'?EXKEY:'special-exam-room-v1'));}catch(e){}
  const du=TEACH.proctorDuties(E,t.name);
  h+=H('02','我的監考','<small>'+du.length+' 場</small>')+(du.length?'<ul class="tp-todo">'+du.map(x=>'<li><div><span>'+esc(x.date+(x.dow?'（'+x.dow+'）':'')+' '+x.period+' '+x.subject)+'</span><em>'+esc(x.room)+(x.sup?'・支援':'')+'</em></div></li>').join('')+'</ul>':'<p class="tp-none">'+(E?'沒有排到監考':'還沒有段考資料')+'</p>');
  const r=document.documentElement,th=r.dataset.theme||'auto',big=r.classList.contains('big');
  h+=H('03','外觀')+'<div class="bar"><div class="seg" role="group" aria-label="主題">'+[['auto','自動'],['light','淺色'],['dark','深色']].map(([k,n])=>'<button type="button" class="'+(th===k?'on':'')+'" aria-pressed="'+(th===k)+'" onclick="tpTheme(\''+k+'\')">'+n+'</button>').join('')+'</div>'+
    '<button type="button" class="b" aria-pressed="'+big+'" onclick="tpBig()">'+(big?'字恢復':'字放大')+'</button></div>';
  pg(h);}
root.tpOff=function(k){const t=me();if(!t||(typeof isRO==='function'&&isRO()))return;const a=t.off=t.off||[],i=a.indexOf(k);if(i>=0)a.splice(i,1);else a.push(k);changed();render();};
// 外觀：有 index.html 的外觀按鈕就按它（狀態一致），沒有就直接改
function pref(sel,fn){const b=document.querySelector(sel);if(b)b.click();else fn();render();}
root.tpTheme=k=>pref('#prefs [data-th="'+k+'"]',()=>{const r=document.documentElement;try{if(k==='auto'){delete r.dataset.theme;localStorage.removeItem('rc-theme');}else{r.dataset.theme=k;localStorage.setItem('rc-theme',k);}}catch(e){}});
root.tpBig=()=>pref('#fsBig',()=>{const on=document.documentElement.classList.toggle('big');try{if(on)localStorage.setItem('rc-big','1');else localStorage.removeItem('rc-big');}catch(e){}});

/* ───── 登記頁面 ───── */
PAGES.me_today={t:'今天',render:rToday};
PAGES.me_stu={t:'我的學生',render:rStu};
PAGES.me_check={t:'點名',render:rCheck};
PAGES.me_set={t:'我的設定',render:rSet};
if(IEP.ui)IEP.ui.install();   // PAGES.iep（三個分頁）與 PAGES.me_iep
// 網址是 #me_… 或 #iep… 時，app.js 啟動時還沒有這些頁，重新開一次
(function(){const a=location.hash.slice(1).split('/');if(/^me_|^iep$/.test(a[0])&&typeof go==='function')go(a[0],a[1]);})();
// 雲端登入後的身分（cloud.js 的 applyBind）：teacher.js 載入前就登入好的，這裡補一次
if(typeof applyBind==='function')applyBind();
})(typeof window!=='undefined'?window:globalThis);

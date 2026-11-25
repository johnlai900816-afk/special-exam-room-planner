/* 資源班管理系統｜畫面：總覽、名冊、排課；段考考場是 exam.html（讀同一份名冊） */
'use strict';
const KEY='resource-class-v1',EXKEY='special-exam-room-v1',NKEY='exam-notice-v1';
let D,M,ST,ROOM,undoStack=[],page='home',sub='',offSel='*',view='',outMode='teacher',selL=-1,dlgDone=null;
const lastSub={};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 放進 onclick="f(…)" 裡的資料：先轉成 JSON 字串，再轉成 HTML 屬性可用的字元（瀏覽器會先還原 &#39; 等字元才執行）
const jsArg=v=>esc(JSON.stringify(v==null?'':v));
function load(){try{const s=localStorage.getItem(KEY);if(s)return JSON.parse(s);}catch(e){}return null;}
// 存不進去（空間滿了）：先從最舊的開始丟掉存在 localStorage 的版本再試；還是不行就一直顯示警告
function localSave(){let j;try{j=JSON.stringify(D);}catch(e){return;}
  let ok=lsTry(KEY,j);while(!ok&&snapEvictLS())ok=lsTry(KEY,j);
  storeWarn(!ok);if(!ok)return;
  try{const a=snaps(),l=a[a.length-1];if(!l||new Date(l.at).toDateString()!==new Date().toDateString())snapshot('每天自動保留',j);}catch(e){}}
function lsTry(k,v){try{localStorage.setItem(k,v);return true;}catch(e){return false;}}
function storeWarn(on,src){const f=storeWarn.f=storeWarn.f||{};f[src||'main']=!!on;on=Object.values(f).some(Boolean);
  let el=$('storeBar');if(!on){if(el)el.remove();return;}
  if(!el){el=document.createElement('div');el.id='storeBar';el.setAttribute('role','alert');
    el.style.cssText='position:fixed;left:0;right:0;top:0;z-index:9999;padding:10px 14px;background:#b42318;color:#fff;font-weight:bold;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    el.innerHTML='<span style="flex:1">這台電腦的儲存空間滿了，資料沒有存進去，請立刻下載備份檔</span><button class="b" onclick="exportJson()">下載備份檔</button>';document.body.appendChild(el);}}
function save(){if(isRO()){clearTimeout(save.h);save.h=setTimeout(roRevert,0);return;}localSave();cloudPush();}
function toast(m){const t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>{t.style.display='none';},2600);}
function setST(S){ST=S;if(!ST.rfix)ST.rfix=new Int16Array(M.L.length).fill(-1);M.lroom=ST.rfix;}
function rebuild(){M=compile(D);setST(toState(M,D));ROOM=assignRooms(M,ST.slot);selL=-1;}
function changed(){rebuild();D.assign=fromState(M,ST);save();}                                  // 名冊、分組、不排時段有改
function commit(){D.assign=fromState(M,ST);ROOM=assignRooms(M,ST.slot);save();render();}        // 排法有改
function pushUndo(){undoStack.push(JSON.stringify({a:D.assign,m:D.groups.map(g=>[g.id,g.students])}));if(undoStack.length>40)undoStack.shift();}
function tOpts(sel,first){const rk=t=>t.role==='資源班'?0:1,list=D.teachers.slice().sort((a,b)=>first==='res'?rk(a)-rk(b):rk(b)-rk(a));
  return '<option value="">（未指定）</option>'+list.map(t=>`<option value="${esc(t.id)}"${t.id===sel?' selected':''}>${esc(t.name)}${t.role==='普通班'||t.role==='資源班'?'':'・'+esc(t.role)}</option>`).join('');}
function stuLabel(s){return s.cls+' '+s.name;}
function sortStu(a,b){return String(a.cls).localeCompare(String(b.cls))||(+a.seat||0)-(+b.seat||0)||String(a.name).localeCompare(String(b.name));}
function paintSchool(){$('school').textContent=D.title||'';}
function colorOf(g){const i=M.rts.indexOf(g.t);return i<0?6:i%6;}

/* ───── 頁面切換 ───── */
const PAGES={
  home:{t:'總覽'},
  roster:{t:'名冊',subs:[['stu','學生'],['tea','老師'],['env','教室與作息'],['tt','全校課表'],['data','匯入與新學期']]},
  sched:{t:'排課',subs:[['groups','老師開課'],['need','學生編組'],['teach','任課老師'],['off','不排課時段'],['board','排課'],['out','課表輸出']]},
  exam:{t:'段考考場'},
  checkin:{t:'簽到退',subs:[['now','點名'],['log','出缺席紀錄'],['cards','學生卡']]}
};
function go(p,s){
  if(!PAGES[p])p='home';const P=PAGES[p];page=p;
  sub=P.subs?(P.subs.some(x=>x[0]===s)?s:(lastSub[p]||P.subs[0][0])):'';lastSub[p]=sub;selL=-1;if(cam&&!(p==='checkin'&&sub==='now'))camStop();
  try{history.replaceState(null,'','#'+p+(sub?'/'+sub:''));}catch(e){}
  render();$('main').scrollTo(0,0);
}
function render(){
  const P=PAGES[page];
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.p===page));
  $('pgTitle').textContent=P.t;
  $('sub').innerHTML=(P.subs||[]).map(([k,n])=>`<button class="${k===sub?'on':''}" onclick="go('${page}','${k}')">${n}</button>`).join('');
  const gate=typeof cloudGateHtml==='function'?cloudGateHtml():'';   // 用過雲端的電腦登出時不顯示學生資料
  if(gate){$('page').hidden=false;$('examFrame').hidden=true;$('page').innerHTML=gate;return;}
  const ex=page==='exam',f=$('examFrame');$('page').hidden=ex;f.hidden=!ex;
  if(ex){if(!f.getAttribute('src'))f.src='exam.html?embed';return;}
  ({home:renderHome,'roster/stu':renderStu,'roster/tea':renderTea,'roster/env':renderEnv,'roster/tt':renderTT,'roster/data':renderData,'sched/groups':renderGroups,'sched/need':renderNeed,'sched/off':renderOff,'sched/teach':renderTeach,'sched/board':renderBoard,'sched/out':renderOut,'checkin/now':renderCheckin,'checkin/log':renderAttLog,'checkin/cards':renderCards})[page+(sub?'/'+sub:'')]();
}
document.querySelectorAll('#nav button[data-p]').forEach(b=>{b.onclick=()=>go(b.dataset.p);});

/* ───── 總覽 ───── */
const SVN={ext:'延長',read:'誦讀',oral:'口頭',pc:'電腦',small:'獨立'};
function examInfo(){
  try{const E=JSON.parse(localStorage.getItem(EXKEY));if(!E||!Array.isArray(E.students))return null;
    const has=s=>s.sv&&Object.keys(s.sv).some(k=>s.sv[k]==='*'||(Array.isArray(s.sv[k])&&s.sv[k].length));
    const a=Object.values(E.assign||{}),sv={};E.students.forEach(s=>{if(has(s))sv[s.id]=Object.keys(SVN).filter(k=>s.sv[k]==='*'||(Array.isArray(s.sv[k])&&s.sv[k].length)).map(k=>SVN[k]);});
    return {title:E.title||'',n:E.students.filter(s=>s.on!==false&&has(s)).length,dates:[...new Set((E.sessions||[]).map(s=>s.date))],total:a.length,placed:a.filter(x=>x&&x.room).length,sv};
  }catch(e){return null;}
}
function renderHome(){
  const now=new Date(),wd=now.getDay(),isSchool=wd>=1&&wd<=5,d=isSchool?wd-1:0,hm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const out=[];evaluate(M,ST.slot,out);
  const total=M.L.length,placed=[...ST.slot].filter(s=>s>=0).length,probs=out.filter(o=>o.k!=='un').length;
  const inG=new Set(D.groups.flatMap(g=>g.students)),noG=D.students.filter(s=>!inG.has(s.id)).length,noCM=D.students.filter(s=>!s.caseMgr).length;
  const warns=M.G.filter(g=>g.per).reduce((n,g)=>n+g.warn.length,0),E=examInfo();
  let h=`<div class="hello"><div class="date">${now.getMonth()+1} 月 ${now.getDate()} 日　週${'日一二三四五六'[wd]}</div><h2>${esc(D.title||'資源班')}</h2></div>`;
  if(!D.students.length&&!D.groups.length){
    $('page').innerHTML=h+`<div class="start"><b>從這三步開始</b><ol><li>到「名冊」貼上學生名單、加入老師。</li><li>到「排課」填每位老師的基本鐘點、替他開課，再勾選每位學生要上的科目，並點選不排課的時段。</li><li>按「一鍵排課」，再到「課表輸出」印出課表與鎖課表。</li></ol>
      <div class="bar" style="margin:0"><button class="b pri" onclick="go('roster','data')">上傳學校的 Excel</button><button class="b" onclick="go('roster','stu')">前往名冊</button><button class="b" onclick="loadDemo()">先載入範例資料看看</button></div></div>`;return;}
  h+=`<div class="stats">
    <button class="stt" onclick="go('roster','stu')"><span class="k">學生</span><b>${D.students.length}<small>人</small></b><span class="d${noG?' warn':''}">${noG?noG+' 位還沒分組':'都已分組'}</span></button>
    <button class="stt" onclick="go('sched','groups')"><span class="k">組別</span><b>${M.G.filter(g=>g.per).length}<small>組</small></b><span class="d">每週共 ${total} 節</span></button>
    <button class="stt" onclick="go('sched','board')"><span class="k">排課進度</span><b>${placed}<small>/ ${total} 節</small></b><div class="prog"><i style="width:${total?Math.round(placed/total*100):0}%"></i></div><span class="d ${probs||placed<total?'warn':'ok'}">${probs?probs+' 個衝突':placed<total?'還有 '+(total-placed)+' 節沒排':total?'沒有衝突':'尚未建立組別'}</span></button>
    <button class="stt" onclick="go('exam')"><span class="k">段考考場</span>${E&&(E.n||E.title)?`<b class="t">${esc(E.title||'未命名的段考')}</b><span class="d">${E.n} 位學生有考評服務${E.dates.length?'　'+esc(E.dates[0]+(E.dates.length>1?'～'+E.dates[E.dates.length-1]:'')):''}</span>`:`<b class="t">尚未設定</b><span class="d">設定考評服務後自動排考場</span>`}</button>
  </div><div class="cols"><section><h3>${isSchool?'今天的課':'下週一的課'}</h3>`;
  const td=today(),by={};M.L.forEach((x,l)=>{const s=ST.slot[l];if(s>=0&&Math.floor(s/M.NP)===d)(by[s%M.NP]=by[s%M.NP]||[]).push(l);});
  if(!placed)h+=`<p class="note">還沒有排課。到「排課」按一鍵排課之後，這裡會顯示每天的課表。</p>`;
  else h+=D.periods.map((p,pi)=>{const ls=(by[pi]||[]).sort((a,b)=>colorOf(M.G[M.L[a].g])-colorOf(M.G[M.L[b].g]));
    return `<div class="tl${isSchool&&hm>=p.start&&hm<p.end?' now':''}"><div class="tm">${esc(p.name)}<small>${esc(p.start)}</small></div><div>${ls.length?ls.map(l=>{const g=M.G[M.L[l].g];
      const k=g.ref.id+'@'+p.id,taken=isSchool&&(ATT[td]||{})[k],inn=taken?g.stu.filter(i=>{const r=taken[D.students[i].id];return r&&(r.st==='in'||r.st==='late');}).length:0;
      return `<span class="ev c${colorOf(g)}">${esc(g.name)}<small>${esc([g.t>=0?M.T[g.t].name:'',ROOM[l]>=0?D.rooms[ROOM[l]].name:'',taken?'到 '+inn+'/'+g.stu.length:g.stu.length+' 人'].filter(Boolean).join('・'))}</small></span>`;}).join(''):'<span class="none">沒有課</span>'}</div></div>`;}).join('');
  h+=`</section><section><h3>待處理</h3>`;
  const todo=[];
  if(isSchool){const cur=sessionsOn(td).filter(x=>hm>=x.p.start&&hm<x.p.end),miss=cur.reduce((n,x)=>n+x.g.stu.filter(i=>!attGet(td,x.key,D.students[i].id)).length,0);
    if(miss)todo.push(['','現在'+cur[0].p.name+'還有 '+miss+' 位學生沒簽到','點名',"go('checkin','now')"]);}
  if(probs)todo.push(['err','排課有 '+probs+' 個衝突','排課',"go('sched','board')"]);
  if(warns)todo.push(['','有 '+warns+' 則開課提醒（缺老師、缺任課老師或時段不夠）','老師開課',"go('sched','groups')"]);
  if(total&&placed<total)todo.push(['','還有 '+(total-placed)+' 節沒排進課表','排課',"go('sched','board')"]);
  const pn=needList(D).length,hb=D.teachers.filter(t=>t.role==='資源班'&&t.hours&&t.hours!==hoursOf(t.id)).length;
  if(hb)todo.push(['',hb+' 位老師開的課和基本鐘點不符','老師開課',"go('sched','groups')"]);
  if(pn)todo.push(['',pn+' 人次的學生還沒編進課裡','學生編組',"go('sched','need')"]);
  if(noG)todo.push(['',noG+' 位學生還沒分到任何一組','名冊',"go('roster','stu')"]);
  if(noCM)todo.push(['',noCM+' 位學生還沒指定個管老師','名冊',"go('roster','stu')"]);
  if(E&&E.total>E.placed)todo.push(['','段考還有 '+(E.total-E.placed)+' 個科次沒排進考場','段考考場',"go('exam')"]);
  if(cloudState==='local'||cloudState==='out'||cloudState==='part'){const lb=+localStorage.getItem(LBKEY)||0,dd=lb?Math.floor((Date.now()-lb)/864e5):-1;
    if(dd<0||dd>=14)todo.push(['info','資料只存在這台電腦，'+(dd<0?'還沒下載過備份檔':'上次下載備份是 '+dd+' 天前')+(cloudState==='out'?'，或登入共用':''),cloudState==='out'?'共用':'備份','openShare()']);}
  h+=todo.length?'<ul class="todo">'+todo.map(([c,t,w,f])=>`<li class="${c}" onclick="${f}"><span>${esc(t)}</span><em>${w} ›</em></li>`).join('')+'</ul>':'<div class="allok">目前沒有待處理的事項。</div>';
  const res=D.teachers.filter(t=>t.role==='資源班');
  if(res.length){const ld=t=>{const ti=M.tIdx[t.id];return M.L.filter((x,l)=>M.G[x.g].t===ti&&ST.slot[l]>=0).length;},mx=Math.max(1,...res.map(ld));
    h+=`<h3>資源班老師</h3>`+res.map(t=>{const n=ld(t),ci=M.rts.indexOf(M.tIdx[t.id]),cs=D.students.filter(s=>s.caseMgr===t.id).length;
      return `<div class="tload"><span>${esc(t.name)}</span><div class="bar2"><i class="b${ci<0?6:ci%6}" style="width:${Math.round(n/mx*100)}%"></i></div><small>每週 ${n}${t.hours?' / '+t.hours:''} 節・個案 ${cs} 人</small></div>`;}).join('');}
  $('page').innerHTML=h+'</section></div>';
}
function loadDemo(){D=defaultData();changed();$('title').value=D.title;paintSchool();render();}

/* ───── 名冊 ───── */
function renderStu(){
  const gOf={};D.groups.forEach(g=>g.students.forEach(id=>{(gOf[id]=gOf[id]||[]).push(g.name);}));
  const E=examInfo(),sv=(E&&E.sv)||{};
  let h=`<p class="guide">整個系統共用這一份名冊：排課、段考考場、通知單都讀這裡，只要維護一次。考評服務在「段考考場」設定，這裡會同步顯示。</p>
  <div class="bar"><button class="b pri" onclick="addStu()">新增學生</button><button class="b" onclick="pasteStu()">從 Excel 貼上名單</button><button class="b" onclick="D.students.sort(sortStu);changed();render()">依班級座號排序</button><span class="stat">共 <b>${D.students.length}</b> 人</span></div>
  <div class="scroll"><table class="ed"><tr><th>班級</th><th>座號</th><th>姓名</th><th>個管老師</th><th>所屬組別</th><th>考評服務</th><th>備註</th><th></th></tr>`;
  D.students.forEach((s,i)=>{h+=`<tr><td><input type="text" class="w3" value="${esc(s.cls)}" onchange="setStu(${i},'cls',this.value)"></td>
    <td><input type="text" class="w2" value="${esc(s.seat)}" onchange="setStu(${i},'seat',this.value)"></td>
    <td><input type="text" class="w5" value="${esc(s.name)}" onchange="setStu(${i},'name',this.value)"></td>
    <td><select onchange="setStu(${i},'caseMgr',this.value)">${tOpts(s.caseMgr,'res')}</select></td>
    <td class="dim">${esc((gOf[s.id]||[]).join('、'))||'尚未分組'}</td>
    <td>${(sv[s.id]||[]).map(x=>`<span class="tagv">${x}</span>`).join('')}</td>
    <td><input type="text" class="w8" value="${esc(s.note)}" onchange="setStu(${i},'note',this.value)"></td>
    <td class="nw"><button class="b sm" onclick="stuCard(${i})">檢視</button><button class="x" title="刪除" onclick="delStu(${i})">✕</button></td></tr>`;});
  $('page').innerHTML=h+'</table></div>';
}
function renderTea(){
  const use={};D.groups.forEach(g=>{if(g.teacher)(use[g.teacher]=use[g.teacher]||[]).push(g.name);});
  M.G.forEach(g=>g.locks.forEach(k=>{if(k.t>=0){const id=D.teachers[k.t].id;(use[id]=use[id]||[]).push(k.cls+g.subject);}}));
  for(const k in D.classSubj){const id=D.classSubj[k];(use[id]=use[id]||[]).push(k.replace('|',''));}
  let h=`<p class="guide">除了資源班老師，也要把<b>學生原班的任課老師</b>加進來，排課才知道哪些時段會卡到他們。資源班老師會自動成為段考的監考老師。</p>
  <div class="bar"><button class="b pri" onclick="addTeacher()">新增老師</button><button class="b" onclick="pasteTL()">貼上任課老師名單</button><button class="b" onclick="go('roster','data')">上傳學校的 Excel</button><button class="b" onclick="pruneTeachers()">移除沒用到的任課老師</button><span class="stat">共 <b>${D.teachers.length}</b> 位</span></div>
  <datalist id="roleList">${ROLES.map(r=>`<option value="${r}">`).join('')}</datalist><p class="note">身分可以自己打（例：專輔、巡迴）；只有「資源班」會被當成資源班老師與監考老師。</p>
  <div class="scroll"><table class="ed"><tr><th>姓名</th><th>身分</th><th>不排課</th><th>個案</th><th>開的課、任課班級</th><th>備註</th><th></th></tr>`;
  D.teachers.forEach((t,i)=>{h+=`<tr><td><input type="text" class="w5" value="${esc(t.name)}" onchange="setTea(${i},'name',this.value)"></td>
    <td><input type="text" class="w3" list="roleList" value="${esc(t.role)}" onchange="setTea(${i},'role',this.value||'普通班')"></td>
    <td><button class="b sm" onclick="offSel='t:'+D.teachers[${i}].id;go('sched','off')">${t.off.length?t.off.length+' 格':'設定'}</button></td>
    <td class="dim">${D.students.filter(s=>s.caseMgr===t.id).length||''}</td>
    <td class="dim">${esc([...new Set(use[t.id]||[])].join('、'))}</td>
    <td><input type="text" class="w8" value="${esc(t.note)}" onchange="setTea(${i},'note',this.value)"></td>
    <td><button class="x" title="刪除" onclick="delTeacher(${i})">✕</button></td></tr>`;});
  $('page').innerHTML=h+'</table></div>';
}
function renderEnv(){
  const nMain=D.rooms.filter(r=>!r.spare).length,nSp=D.rooms.length-nMain;
  let h=`<h3>教室</h3><p class="note">教室名稱可以直接改。勾「備用」的教室平常不排：同一節最多排 <b>${nMain}</b> 組（平常用的教室數）${nSp?`，真的排不下才會用到備用的 ${nSp} 間，最多 <b>${D.rooms.length}</b> 組`:''}。排課時會照這個上限，不會在同一節塞進比教室還多的課。</p>
  <div class="bar">`+D.rooms.map((r,i)=>`<span class="stu${r.spare?' dim':''}"><input type="text" class="w5" style="border:0;background:transparent" value="${esc(r.name)}" onchange="D.rooms[${i}].name=this.value;changed()"><label class="note" style="margin:0 4px" title="平常不排，排不下才用"><input type="checkbox"${r.spare?' checked':''} onchange="D.rooms[${i}].spare=this.checked;changed();render()"> 備用</label><button class="x" onclick="delRoom(${i})">✕</button></span>`).join('')+
  `<button class="b sm" onclick="D.rooms.push({id:uid('r'),name:'新教室'});changed();render()">新增教室</button></div>${D.rooms.length?'':'<p class="note warn">還沒有教室：排課時不會限制同一節的組數。請至少新增一間。</p>'}
  <h3>作息</h3><p class="note">勾「外加」的時段（早自習、午休、第 8 節）只會排外加課；抽離課只排在一般節次。</p>
  <div class="scroll"><table class="ed"><tr><th>名稱</th><th>開始</th><th>結束</th><th>外加時段</th><th></th></tr>`;
  D.periods.forEach((p,i)=>{h+=`<tr><td><input type="text" class="w5" value="${esc(p.name)}" onchange="setPer(${i},'name',this.value)"></td>
    <td><input type="time" value="${esc(p.start)}" onchange="setPer(${i},'start',this.value)"></td><td><input type="time" value="${esc(p.end)}" onchange="setPer(${i},'end',this.value)"></td>
    <td><input type="checkbox"${p.extra?' checked':''} onchange="setPer(${i},'extra',this.checked)"></td><td class="nw"><button class="b sm" title="往上移" onclick="movePer(${i})"${i?'':' disabled'}>↑</button><button class="x" onclick="delPer(${i})">✕</button></td></tr>`;});
  h+=`</table></div><div class="bar"><button class="b sm" onclick="D.periods.push({id:uid('p'),name:'新節次',start:'16:05',end:'16:50',extra:true});changed();render()">新增節次</button></div>
  <h3>排課規則</h3><p class="note">每一條都可以依學校的做法開關或改數字，改完回排課頁就會照新的規則檢查衝堂。</p>
  <div class="rules">${[['regClash','同一位任課老師，同一節不能被兩個班同時鎖課（也包含資源班老師自己兼原班任課）',true],['classClash','同一個班，同一節不能被要求上兩科',true],['roomCheck','同一節的組數不能超過教室數，指定的教室不能重複',true]].map(([k,t])=>`<label><input type="checkbox"${D.settings[k]!==false?' checked':''} onchange="D.settings.${k}=this.checked;changed()"> ${t}</label>`).join('')}
    ${[['maxDay','同一組一天最多排',1,'節（設成 2 就允許一天兩節或連堂）'],['tRun','資源班老師最多連續上',3,'節'],['sDay','學生一天最多被抽離',3,'節']].map(([k,a,d,b])=>`<label>${a} <input type="number" min="1" max="9" class="w2" value="${D.settings[k]>0?D.settings[k]:d}" onchange="D.settings.${k}=+this.value;changed()"> ${b}</label>`).join('')}
    <label>抽離課請教務處鎖課的方式 <select onchange="D.settings.lockMode=this.value;changed();render()"><option value="same">原班和資源班同一節上同一科</option><option value="flex"${D.settings.lockMode==='flex'?' selected':''}>彈性：鎖不到同一科就改鎖其他主科，都不行就不鎖</option></select></label>
    ${D.settings.lockMode==='flex'?`<label>各科每週最多可以鎖幾節 <input type="text" class="w8" value="${esc(Object.keys(D.settings.lockCap||{}).map(k=>k+D.settings.lockCap[k]).join(' '))}" placeholder="國文5 英文3 數學4" onchange="setLockCap(this.value)"></label>
    <label>鎖到只剩 1 節時要留連堂的科目 <input type="text" class="w5" value="${esc(D.settings.lockDouble||'')}" placeholder="國文" onchange="D.settings.lockDouble=this.value.trim();changed()"></label>
    <p class="note" style="margin:0">彈性鎖課時，上面第一、二條規則改由「配鎖課」處理：同一位老師同一節只會被一個班鎖。可以改鎖的科目，是「任課老師」頁有填老師的那些科目。</p>`:''}
    <label>上課超過 <input type="number" min="0" max="60" class="w2" value="${D.settings.grace>=0?D.settings.grace:5}" onchange="D.settings.grace=+this.value;save()"> 分鐘才到算遲到（簽到退用）</label></div>`;
  $('page').innerHTML=h;
}
function setLockCap(v){const o={};String(v).replace(/([^\d\s,，、:：]+)\s*[:：]?\s*(\d+)/g,(m,k,n)=>{o[k]=+n;});D.settings.lockCap=o;changed();render();}
function stuCard(i){const s=D.students[i],si=M.sIdx[s.id],E=examInfo(),sv=((E&&E.sv)||{})[s.id]||[],at=attStats('0000','9999','')[s.id];
  const gs=M.G.filter(g=>g.stu.includes(si)),cm=D.teachers.find(t=>t.id===s.caseMgr),sets=D.sets.filter(x=>x.students.includes(s.id));
  const rows=gs.map(g=>{const ls=M.L.map((x,l)=>l).filter(l=>M.L[l].g===g.gi&&ST.slot[l]>=0).map(l=>ST.slot[l]).sort((a,b)=>a-b);return `<tr><td><b>${esc(g.name)}</b></td><td>${esc(g.t>=0?M.T[g.t].name:'')}</td><td>${esc(ls.length?slotsText(ls):'還沒排')}</td></tr>`;}).join('');
  openDlg(`<h3>${esc(stuLabel(s))}</h3><p class="lead">${esc(s.cls)} 班 ${esc(s.seat)} 號　個管老師：${esc(cm?cm.name:'未指定')}${s.note?'<br>'+esc(s.note):''}</p>
    <h4>資源班課程（每週 ${gs.reduce((n,g)=>n+M.L.filter((x,l)=>x.g===g.gi&&ST.slot[l]>=0).length,0)} 節）</h4>${rows?`<table class="ed" style="width:100%"><tr><th>組別</th><th>老師</th><th>上課節次</th></tr>${rows}</table>`:'<p class="note">還沒分到任何一組。</p>'}
    <h4>考評服務</h4><p>${sv.length?sv.map(x=>`<span class="tagv">${x}</span>`).join(''):'<span class="note">沒有設定</span>'}</p>
    <h4>出缺席</h4><p>${at?'應到 '+at.exp+'　實到 '+at.in+'　遲到 '+at.late+'　請假 '+at.leave+'　缺席 '+at.abs:'<span class="note">還沒有點名紀錄</span>'}</p>
    ${sets.length?`<h4>學生群組</h4><p>${sets.map(x=>`<span class="tagv">${esc(x.name)}</span>`).join('')}</p>`:''}
    <div class="bar" style="margin:14px 0 0"><button class="b" data-id="${esc(s.id)}" onclick="offSel='s:'+this.dataset.id;closeDlg();go('sched','off')">個人不排課時段${(D.offBy['s:'+s.id]||[]).length?'（'+D.offBy['s:'+s.id].length+' 格）':''}</button><span class="grow"></span><button class="b" onclick="closeDlg()">關閉</button></div>`);}
function setStu(i,k,v){D.students[i][k]=String(v).trim();changed();}
function addStu(){D.students.push({id:uid('s'),cls:'',seat:'',name:'',caseMgr:'',note:''});changed();render();$('main').scrollTo(0,1e6);}
function delStu(i){const s=D.students[i];if(!confirm('確定刪除 '+stuLabel(s)+'？\n會從所屬組別移除，段考考場裡他的考評服務也會一起清掉。'))return;
  D.groups.forEach(g=>{g.students=g.students.filter(id=>id!==s.id);});D.students.splice(i,1);D.gone=(D.gone||[]).concat([s.id]).slice(-500);delete D.offBy['s:'+s.id];D.sets.forEach(x=>{x.students=x.students.filter(id=>id!==s.id);});changed();render();}
function setTea(i,k,v){const t=D.teachers[i];t[k]=String(v).trim();
  if(k==='name'&&!(t.off||[]).length&&D.offPool&&D.offPool[t.name]){t.off=D.offPool[t.name].slice();toast('帶入 '+t.name+' 先前匯入的不排課時段 '+t.off.length+' 格');}
  changed();if(k==='role')render();}
function addTeacher(){D.teachers.push({id:uid('t'),name:'新老師',role:'普通班',off:[],note:''});changed();render();$('main').scrollTo(0,1e6);}
function delTeacher(i){const t=D.teachers[i];if(!confirm('確定刪除 '+t.name+'？他負責的組別與任課設定會變成未指定。'))return;
  D.groups.forEach(g=>{if(g.teacher===t.id)g.teacher='';});for(const k in D.classSubj)if(D.classSubj[k]===t.id)delete D.classSubj[k];
  D.students.forEach(s=>{if(s.caseMgr===t.id)s.caseMgr='';});if(offSel==='t:'+t.id)offSel='*';if(view===t.id)view='';D.teachers.splice(i,1);changed();render();}
function delRoom(i){const r=D.rooms[i];D.groups.forEach(g=>{if(g.room===r.id)g.room='';});D.rooms.splice(i,1);changed();render();}
function setPer(i,k,v){D.periods[i][k]=v;changed();}
function movePer(i){if(i<1)return;const a=D.periods;[a[i-1],a[i]]=[a[i],a[i-1]];changed();render();}
function delPer(i){if(D.periods.length<2)return;if(!confirm('確定刪除「'+D.periods[i].name+'」？排在這一節的課會變成還沒排。'))return;D.periods.splice(i,1);changed();render();}
function openDlg(html,done){$('dlgBody').innerHTML=html;dlgDone=done||null;if(!$('dlg').open)$('dlg').showModal();}
function closeDlg(){$('dlg').close();}
$('dlg').addEventListener('close',()=>{const f=dlgDone;dlgDone=null;if(f)f();});
function pasteStu(){openDlg(`<h3>從 Excel 貼上名單</h3><p class="note">在 Excel 選取「班級、座號、姓名」三欄後複製，貼到下面，後面可以再多一欄<b>個管老師</b>、一欄<b>備註</b>。「701-13」或「701-13王小明」寫在同一格也可以；有標題列時會照標題找欄位。每行一位，班級座號相同的會更新，不會重複新增。</p>
  <textarea id="pasteBox" placeholder="701&#9;03&#9;王小明&#10;701&#9;10&#9;陳小華"></textarea>
  <div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="pasteStuOk()">加入名冊</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteStuOk(){const txt=$('pasteBox').value;if(!txt.trim())return;snapshot('貼上學生名單之前');const r=importStudents(D,txt);
  changed();closeDlg();render();toast('新增 '+r.add+' 人，更新 '+r.upd+' 人'+(r.cm?'，指定個管老師 '+r.cm+' 人':'')+(r.noCM.length?'；找不到這些個管老師：'+r.noCM.join('、'):'')+(r.skip?'，略過 '+r.skip+' 行（看起來不是學生資料）':''));}

/* ───── 排課｜分組 ───── */
function grpCard(g,i,byId,grs){const c=M.G[i];
  let h=`<div class="gc${g.on===false?' off':''}"><div class="hd"><input type="text" class="nm" value="${esc(g.name)}" placeholder="課名" onchange="setGrp(${i},'name',this.value)">
      <label class="note" style="margin:0;white-space:nowrap"><input type="checkbox"${g.on!==false?' checked':''} onchange="setGrp(${i},'on',this.checked)"> 要排</label><button class="x" title="刪除這門課" onclick="delGroup(${i})">✕</button></div>
    <div class="f"><span>科目</span><input type="text" list="subjList" value="${esc(g.subject)}" onchange="setGrp(${i},'subject',this.value)">
      <span>每週節數</span><input type="number" min="0" max="15" value="${g.per}" onchange="setGrp(${i},'per',+this.value)">
      <span>老師</span><select onchange="setGrp(${i},'teacher',this.value)">${tOpts(g.teacher,'res')}</select>
      <span>年級</span><select onchange="setGrp(${i},'grade',this.value)"><option value="">不限</option>${grs.map(x=>`<option value="${x}"${String(x)===g.grade?' selected':''}>${GRADE[x]}</option>`).join('')}</select>
      <span>型態</span><select onchange="setGrp(${i},'mode',this.value)">${MODES.map(m=>`<option${m===g.mode?' selected':''}>${m}</option>`).join('')}</select>
      <span>教室</span><select onchange="setGrp(${i},'room',this.value)"><option value="">自動安排</option>${D.rooms.map(r=>`<option value="${esc(r.id)}"${r.id===g.room?' selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
    <div class="sec">學生（${g.students.length} 人）</div><div>`+
      g.students.map(id=>byId[id]).filter(Boolean).sort(sortStu).map(s=>`<span class="stu">${esc(stuLabel(s))}<button class="x" data-id="${esc(s.id)}" onclick="togGS(${i},this.dataset.id);render()">✕</button></span>`).join('')+
      `<button class="b sm" onclick="pickStu(${i})">選學生</button></div>`;
  if(c.pull&&c.cls.length){h+=`<div class="sec">原班的${esc(g.subject)}任課老師</div>`+c.cls.map(cl=>`<div class="cs2"><span>${esc(cl)}</span><select data-k="${esc(cl+'|'+g.subject)}" onchange="setCS(this)">${tOpts(D.classSubj[cl+'|'+g.subject],'reg')}</select></div>`).join('');}
  const w=c.warn.filter(x=>x!=='還沒有學生');
  h+=g.on===false?'':w.length?`<div class="st warn">${w.map(x=>'<div>'+esc(x)+'</div>').join('')}</div>`:`<div class="st">可以排的時段有 ${c.alist.length} 格，要排 ${c.per} 節${g.students.length?'':'；學生之後再編進來'}</div>`;
  return h+'</div>';}
function hoursOf(id){return D.groups.reduce((n,g)=>n+(g.teacher===id&&g.on!==false?g.per:0),0);}
function renderGroups(){
  const subj=[...new Set(D.groups.map(g=>g.subject).concat(['國文','數學','英文']))],byId={};D.students.forEach(s=>{byId[s.id]=s;});
  let grs=[...new Set(D.students.map(s=>gradeOfCls(s.cls)))].filter(x=>GRADE[x]).sort();if(!grs.length)grs=[7,8,9];
  const list=D.teachers.filter(t=>t.role==='資源班'||D.groups.some(g=>g.teacher===t.id)),ids=new Set(list.map(t=>t.id)),lone=D.groups.map((g,i)=>i).filter(i=>!ids.has(D.groups[i].teacher));
  let h=`<p class="guide">從老師開始：先填每位資源班老師的<b>基本鐘點</b>，再替他開課，把節數補到剛好。這時候課裡可以還沒有學生，之後到「學生編組」勾選每位學生要上的科目，系統會把學生放進不衝堂的課。</p>
  <div class="bar"><button class="b" onclick="pasteCourses()">貼上課程一覽表</button><button class="b" onclick="pasteGroups()">貼上現成的分組表</button><span class="stat">共 <b>${D.groups.length}</b> 門課、每週 <b>${M.L.length}</b> 節</span></div>
  <datalist id="subjList">${subj.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`;
  if(!list.length)h+=`<div class="probs">還沒有資源班老師。<button class="b sm" onclick="addTeacherHere('資源班');go('sched','groups')">新增一位資源班老師</button></div>`;
  list.forEach(t=>{const ti=D.teachers.indexOf(t),n=hoursOf(t.id),hr=+t.hours||0,d=hr-n;
    h+=`<section class="tsec"><div class="thd"><b>${esc(t.name)}</b><label>基本鐘點 <input type="number" min="0" max="40" class="w2" value="${hr||''}" placeholder="未填" onchange="D.teachers[${ti}].hours=+this.value||0;changed();render()"> 節</label>
      <div class="hb"><i class="${hr&&d<0?'over':''}" style="width:${hr?Math.min(100,Math.round(n/hr*100)):n?100:0}%"></i></div>
      <span class="hs ${!hr?'':d===0?'ok':'warn'}">已開 ${n} 節${!hr?'':d>0?'，還差 '+d+' 節':d<0?'，超出 '+(-d)+' 節（超鐘點）':'，剛好'}</span>
      <button class="b sm pri" data-id="${esc(t.id)}" onclick="addGroup(this.dataset.id)">替他開一門課</button></div><div class="cards">`+
      D.groups.map((g,i)=>g.teacher===t.id?grpCard(g,i,byId,grs):'').join('')+`</div></section>`;});
  if(lone.length)h+=`<section class="tsec"><div class="thd"><b>還沒指定老師的課</b><span class="hs warn">共 ${lone.reduce((n,i)=>n+D.groups[i].per,0)} 節，請在卡片上選老師</span></div><div class="cards">`+lone.map(i=>grpCard(D.groups[i],i,byId,grs)).join('')+`</div></section>`;
  h+=`<div class="bar"><button class="b" onclick="addGroup('')">新增一門還沒指定老師的課</button></div>`;
  $('page').innerHTML=h;
}
function setGrp(i,k,v){D.groups[i][k]=typeof v==='string'?v.trim():v;D=normalize(D);changed();render();}
function addGroup(tid){D.groups.push({id:uid('g'),name:'新的課',subject:'國文',teacher:tid||'',per:3,students:[],mode:'抽離',room:'',on:true,grade:''});changed();render();if(!tid)$('main').scrollTo(0,1e6);}

/* ───── 排課｜學生編組：每位學生每一科要去哪一門課 ───── */
let needG='';
function renderNeed(){
  const on=D.groups.filter(g=>g.on!==false),subs=[...new Set(on.map(g=>g.subject))],grs=[...new Set(D.students.map(s=>gradeOfCls(s.cls)))].filter(x=>GRADE[x]).sort();
  const pend=needList(D),pk=new Set(pend.map(n=>n.id+'|'+n.subject)),tn=g=>{const t=D.teachers.find(x=>x.id===g.teacher);return t?'｜'+t.name:'';};
  renderNeed.subs=subs;
  let h=`<p class="guide">老師的課開好之後，在這裡決定<b>每位學生每一科要去哪一門課</b>。不確定就選「待安排」，按<b>自動編組</b>（或排課頁的一鍵排課）時，系統會把他放進同科目、同年級、放進去不會衝堂而且人數最平均的課。也可以直接指定。</p>`;
  if(!subs.length){$('page').innerHTML=h+`<div class="probs">還沒有開課。請先到「老師開課」替老師開課，這裡就會列出各科目。</div>`;return;}
  h+=`<div class="bar"><button class="b pri" onclick="autoPlace()">自動編組</button><button class="b" onclick="undo()">復原</button><select onchange="needG=this.value;render()"><option value="">全部年級</option>${grs.map(x=>`<option value="${x}"${String(x)===needG?' selected':''}>${GRADE[x]}</option>`).join('')}</select>
    <span class="stat${pend.length?' bad':''}">待安排 <b>${pend.length}</b> 人次</span></div>
  <div class="scroll"><table class="ed need"><tr><th>學生</th>${subs.map(x=>`<th>${esc(x)}</th>`).join('')}</tr>`;
  D.students.forEach((s,i)=>{if(needG&&gradeOfCls(s.cls)!==+needG)return;
    h+=`<tr><td class="nw"><b>${esc(stuLabel(s))}</b></td>`+subs.map((sj,j)=>{const cur=on.find(g=>g.subject===sj&&g.students.includes(s.id)),p=pk.has(s.id+'|'+sj),c=candidates(D,s,sj),rest=on.filter(g=>g.subject===sj&&!c.includes(g));
      const op=g=>`<option value="${esc(g.id)}"${g===cur?' selected':''}>${esc(g.name+tn(g))}（${g.students.length} 人）</option>`;
      return `<td><select class="${p?'pend':cur?'':'none'}" onchange="setNeed(${i},${j},this.value)"><option value="">不上</option><option value="?"${p?' selected':''}>待安排</option>${c.map(op).join('')}${rest.length?'<optgroup label="其他年級的課">'+rest.map(op).join('')+'</optgroup>':''}</select></td>`;}).join('')+'</tr>';});
  $('page').innerHTML=h+'</table></div>';
}
function setNeed(i,j,v){const s=D.students[i],sj=renderNeed.subs[j];if(!s||sj==null)return;
  D.groups.forEach(g=>{if(g.subject===sj)g.students=g.students.filter(id=>id!==s.id);});s.needs=(s.needs||[]).filter(x=>x!==sj);
  if(v){s.needs.push(sj);const g=D.groups.find(x=>x.id===v);if(g)g.students.push(s.id);}changed();render();}
function autoPlace(){if(!needList(D).length){toast('沒有待安排的學生');return;}pushUndo();const r=placeStudents(D);changed();render();
  const o=[];evaluate(M,ST.slot,o);const v=o.filter(x=>x.k!=='un').length;
  toast('已把 '+r.placed+' 人次編進課裡'+(r.left.length?'；'+r.left.length+' 人次找不到同科目同年級的課':'')+(v?'；課表有 '+v+' 個衝突，請到排課頁按一鍵排課修正':''));}

/* ───── 排課｜AI 排課（現在用複製貼上；接上 API 之後只要換掉 aiCopy 到 aiOk 中間這一段）───── */
function aiOpen(){openDlg(`<h3>用 AI 排課</h3><p class="note">系統把目前的老師、開課、不排課時段和待安排的學生整理成一段題目，<b>人名都換成代號</b>（S1、T1…），貼給 AI 請它排。AI 回覆的結果貼回來後，一樣會經過這裡的衝堂檢查，有問題再按一鍵排課修正。</p>
  <div class="bar"><button class="b pri" onclick="aiCopy()">1. 複製題目</button><span class="note" style="margin:0">貼到 Claude 等 AI 對話</span></div>
  <textarea id="aiBox" placeholder="2. 把 AI 回覆的 JSON 貼在這裡"></textarea>
  <div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="aiOk()">3. 套用並檢查衝堂</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function aiCopy(){const t=aiPrompt(D),fb=()=>{const b=$('aiBox');b.value=t;b.select();toast('沒辦法自動複製，請手動複製下面的文字，貼給 AI 後再把這格換成它的回覆');};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>toast('題目已複製（'+t.length+' 字），人名都換成代號了'),fb);else fb();}
function aiOk(){const txt=$('aiBox').value;if(!txt.trim()){toast('請先貼上 AI 的回覆');return;}pushUndo();let r;
  try{r=aiApply(D,txt);}catch(e){undoStack.pop();toast('看不懂這段回覆，請確認貼的是 AI 回傳的 JSON');return;}
  rebuild();closeDlg();commit();const o=[];evaluate(M,ST.slot,o);
  toast('已套用 '+r.lessons+' 節'+(r.bad?'（略過 '+r.bad+' 項看不懂的）':'')+'；'+(o.length?'檢查出 '+o.length+' 個問題，可按一鍵排課修正':'沒有衝堂'));}
function delGroup(i){if(!confirm('確定刪除「'+D.groups[i].name+'」？'))return;D.groups.splice(i,1);changed();render();}
function setCS(el){if(el.value)D.classSubj[el.dataset.k]=el.value;else delete D.classSubj[el.dataset.k];changed();render();}
function togGS(i,id){const a=D.groups[i].students,k=a.indexOf(id);if(k>=0)a.splice(k,1);else a.push(id);changed();}
function pickStu(i){const g=D.groups[i],same={};
  D.groups.forEach((o,j)=>{if(j!==i&&o.subject===g.subject)o.students.forEach(id=>{same[id]=o.name;});});
  pickList(g.name+'的學生',g.students,same);}

/* ───── 排課｜不排課時段（一層一層疊）───── */
// offSel：'*' 全校、'g:7' 年級、'x:id' 學生群組、'c:701' 班級、's:id' 學生個人、't:id' 老師
function offTarget(){
  const k=offSel,id=k.slice(2),ob=n=>(D.offBy[n]=D.offBy[n]||[]);
  if(k==='*')return {arr:D.blocked,name:'全校共同不排',hint:'所有年級、所有組別都不排的時段，例如全校週會。'};
  if(k[0]==='g'&&GRADE[id])return {arr:ob(k),name:GRADE[id],hint:'這個年級的學生都不能被抽離的時段，例如社團、班會、彈性課程。各年級時間不一樣就分開點。',up:['*']};
  if(k[0]==='c')return {arr:ob(k),name:id+' 班',hint:'只有這一班不能被抽離的時段。',up:['*','g:'+gradeOfCls(id)]};
  if(k[0]==='k')return {arr:ob(k),name:id+' 班（不能鎖課）',hint:'這一班這些時段不能請教務處鎖課（例：導師時間、本土語、特色課程）。需要鎖課的抽離課會盡量避開；不用鎖課的課（例：社會技巧）仍然可以排。',up:['*','g:'+gradeOfCls(id),'c:'+id]};
  if(k[0]==='s'){const s=D.students.find(x=>x.id===id);if(s)return {arr:ob(k),name:stuLabel(s),hint:'這位學生個人不能被抽離的時段，例如巡迴輔導、治療、校隊練習。',up:['*','g:'+gradeOfCls(s.cls),'c:'+s.cls].concat(D.sets.filter(x=>x.students.includes(id)).map(x=>'x:'+x.id))};}
  if(k[0]==='x'){const x=D.sets.find(o=>o.id===id);if(x)return {arr:x.off,name:x.name,hint:'這一群學生共同不能被抽離的時段。有他們在的組別，這些時段都不會排。',set:x,up:['*']};}
  if(k[0]==='t'){const t=D.teachers.find(o=>o.id===id);if(t)return {arr:t.off,name:t.name,hint:'格子裡的字是他現在已經排到的課。',tea:t,up:['*']};}
  offSel='*';return offTarget();
}
function offKeys(k){if(k==='*')return D.blocked;if(k[0]==='x'){const x=D.sets.find(o=>o.id===k.slice(2));return x?x.off:[];}if(k[0]==='t'){const t=D.teachers.find(o=>o.id===k.slice(2));return t?t.off:[];}return D.offBy[k]||[];}
function offNav(){
  const it=[{k:'*',name:'全校共同不排',grp:'全校'}];
  let gs=[...new Set(D.students.map(s=>gradeOfCls(s.cls)).filter(g=>GRADE[g]))].sort();if(!gs.length)gs=[7,8,9];
  gs.forEach(g=>it.push({k:'g:'+g,name:GRADE[g],grp:'年級'}));
  D.sets.forEach(x=>it.push({k:'x:'+x.id,name:x.name,sub:x.students.length+' 人',grp:'學生群組'}));
  Object.keys(D.offBy).filter(k=>(k[0]==='c'||k[0]==='s'||k[0]==='k')&&(D.offBy[k].length||k===offSel)).sort().forEach(k=>{
    if(k[0]==='c')it.push({k,name:k.slice(2)+' 班',grp:'班級與個人'});else if(k[0]==='k')it.push({k,name:k.slice(2)+' 班',sub:'不能鎖課',grp:'班級與個人'});else{const s=D.students.find(x=>x.id===k.slice(2));if(s)it.push({k,name:stuLabel(s),grp:'班級與個人'});}});
  D.teachers.filter(t=>t.role==='資源班').forEach(t=>it.push({k:'t:'+t.id,name:t.name,grp:'資源班老師'}));
  D.teachers.filter(t=>t.role!=='資源班').forEach(t=>it.push({k:'t:'+t.id,name:t.name,sub:t.role==='普通班'?'':t.role,grp:'其他老師'}));
  it.forEach(o=>{o.n=offKeys(o.k).length;});return it;
}
function occOf(ti){const m={};M.L.forEach((x,l)=>{const s=ST.slot[l];if(s<0)return;const g=M.G[x.g];
  if(g.t===ti)(m[s]=m[s]||[]).push(g.name);g.locks.forEach(k=>{if(k.t===ti)(m[s]=m[s]||[]).push(k.cls+g.subject);});});return m;}
function renderOff(){
  const T=offTarget(),a=T.arr,items=offNav(),ti=T.tea?M.tIdx[T.tea.id]:-1,occ=ti>=0?occOf(ti):{};
  const up=new Set((T.up||[]).flatMap(offKeys)),grps=['全校','年級','學生群組','班級與個人','資源班老師','其他老師'];
  const cls=[...new Set(D.students.map(s=>String(s.cls)))].filter(Boolean).sort();
  const btn=o=>`<button class="${offSel===o.k?'on':''}" data-k="${esc(o.k)}" onclick="offSel=this.dataset.k;render()"><span>${esc(o.name)}${o.sub?` <small>${esc(o.sub)}</small>`:''}</span><small>${o.n?o.n+' 格':''}</small></button>`;
  const extra={'學生群組':`<button class="add" onclick="addSet()">＋ 新增群組（例：技藝班）</button>`,
    '班級與個人':`<select onchange="if(this.value){offSel=this.value;render()}"><option value="">＋ 選一個班級…</option>${cls.map(c=>`<option value="c:${esc(c)}">${esc(c)} 班</option>`).join('')}</select>
      <select onchange="if(this.value){offSel=this.value;render()}"><option value="">＋ 班級不能鎖課的時段…</option>${cls.map(c=>`<option value="k:${esc(c)}">${esc(c)} 班</option>`).join('')}</select>
      <select onchange="if(this.value){offSel=this.value;render()}"><option value="">＋ 選一位學生…</option>${D.students.slice().sort(sortStu).map(s=>`<option value="s:${esc(s.id)}">${esc(stuLabel(s))}</option>`).join('')}</select>`,
    '資源班老師':`<button class="add" onclick="addTeacherHere('資源班')">＋ 新增資源班老師</button>`,'其他老師':`<button class="add" onclick="addTeacherHere('普通班')">＋ 新增原班任課老師</button>`};
  let h=`<p class="guide">不排課的時段分成幾層，排課時會<b>全部疊在一起</b>避開：全校 → 年級（各年級社團時間不同就分開點）→ 學生群組（例：技藝班）→ 班級或個人 → 老師。點格子切換，點<b>星期</b>或<b>節次</b>可以整排切換。</p>
  <div class="bar"><button class="b" onclick="pasteOff()">貼上不排課表（班級或老師）</button><span class="note" style="margin:0">教務處整理好的班級不排課、教師不排課可以整張貼進來</span></div>
  <select class="tsel" onchange="offSel=this.value;render()">${grps.map(g=>{const li=items.filter(o=>o.grp===g);return li.length?`<optgroup label="${g}">${li.map(o=>`<option value="${esc(o.k)}"${o.k===offSel?' selected':''}>${esc(o.name)}${o.n?'（'+o.n+' 格）':''}</option>`).join('')}</optgroup>`:'';}).join('')}</select>
  <div class="offadd"><button class="b sm" onclick="addSet()">＋ 學生群組</button><button class="b sm" onclick="addTeacherHere('資源班')">＋ 資源班老師</button><button class="b sm" onclick="addTeacherHere('普通班')">＋ 任課老師</button>${extra['班級與個人']}</div>
  <div class="offwrap"><div class="tlist">`+grps.map(g=>`<div class="grp">${g}</div>`+items.filter(o=>o.grp===g).map(btn).join('')+(extra[g]||'')).join('')+`</div><div class="offmain">`;
  if(T.set)h+=`<div class="bar"><input type="text" class="nmin" value="${esc(T.set.name)}" onchange="offTarget().set.name=this.value.trim()||'學生群組';changed();render()"><button class="b sm" onclick="pickSet()">選學生（${T.set.students.length} 人）</button><button class="b sm danger" onclick="delSet()">刪除群組</button></div>
    <p class="note">${esc(T.set.students.map(id=>D.students.find(s=>s.id===id)).filter(Boolean).sort(sortStu).map(stuLabel).join('、'))||'還沒有學生，請按「選學生」。'}</p>`;
  else if(T.tea)h+=`<div class="bar"><input type="text" class="nmin" value="${esc(T.tea.name)}" onchange="offTarget().tea.name=this.value.trim()||'老師';changed();render()"><select onchange="offTarget().tea.role=this.value;changed();render()">${ROLES.map(r=>`<option${r===T.tea.role?' selected':''}>${r}</option>`).join('')}</select></div>`;
  else h+=`<h3>${esc(T.name)}</h3>`;
  h+=`<p class="note">${esc(T.hint)}${a.length?'　目前 '+a.length+' 格。':''}${up.size?'　灰色斜線是上一層已經不排的時段。':''}</p>
  <div class="scroll"><table class="grid"><tr><th onclick="togOff(allKeys())">全部</th>`+DAYS.map((d,di)=>`<th onclick="togOff(dayKeys(${di}))">週${d}</th>`).join('')+'</tr>';
  D.periods.forEach((p,pi)=>{h+=`<tr><th onclick="togOff(perKeys(${pi}))">${esc(p.name)}<small>${esc(p.start)}</small></th>`+DAYS.map((d,di)=>{const k=di+'-'+p.id,on=a.includes(k);
    return `<td class="${on?'x':up.has(k)?'g':''}" data-k="${esc(k)}" onclick="togOff([this.dataset.k])">${on?'不排':esc((occ[di*M.NP+pi]||[]).join(' '))}</td>`;}).join('')+'</tr>';});
  const src=items.filter(o=>o.n&&o.k!==offSel);
  h+=`</table></div><div class="bar" style="margin-top:12px">${src.length?`<select onchange="copyOff(this.value);this.value=''"><option value="">複製另一個的時段過來…</option>${src.map(o=>`<option value="${esc(o.k)}">${esc(o.name)}（${o.n} 格）</option>`).join('')}</select>`:''}
    <button class="b sm" onclick="clearOff()">清空</button>${T.tea?`<input type="text" style="flex:1;min-width:160px" placeholder="備註，例：兼課只有週一、二到校" value="${esc(T.tea.note)}" onchange="offTarget().tea.note=this.value;save()">`:T.set?`<input type="text" style="flex:1;min-width:160px" placeholder="備註" value="${esc(T.set.note||'')}" onchange="offTarget().set.note=this.value;save()">`:''}</div></div></div>`;
  $('page').innerHTML=h;
}
/* 班級不排課怎麼帶入：預設全部鎖定（那一班的學生這些時段不能被抽離、也不能排課） */
function hardPick(p){return `<div class="note" style="margin:6px 0"><b>班級不排課</b>的時段要怎麼處理？</div>
  <label class="note" style="display:block"><input type="radio" name="${p}HM" value="all" checked onchange="fillReasons('${p}')"> 全部鎖定：這些時段那一班的學生不能被抽離，系統不會排課進去</label>
  <label class="note" style="display:block"><input type="radio" name="${p}HM" value="kw" onchange="fillReasons('${p}')"> 只鎖定勾選的原因，其餘只是不能鎖課（不用鎖課的課照樣可排）</label>
  <div id="${p}HR" class="note" style="margin:2px 0 6px 22px"></div>`;}
// 從表裡找出班級不排課出現過的原因（原因只寫在每段第一列，往下沿用）
function offReasons(text){const set=new Set();let why='';String(text||'').split(/\r?\n/).forEach(l=>{const c=l.split('\t').map(x=>x.trim());if(c[5])why=c[5];if(/^\d{3,4}(\.0)?$/.test(c[0])&&why)set.add(why);});return [...set];}
function fillReasons(p){const box=$(p+'HR');if(!box)return;const r=document.querySelector('input[name="'+p+'HM"]:checked');if(!r||r.value==='all'){box.innerHTML='';return;}
  const src=p==='xl'?XL.filter(x=>x.type==='off'&&x.on).map(x=>x.tsv).join('\n'):($('pasteBox')?$('pasteBox').value:''),list=offReasons(src);
  box.innerHTML=list.length?list.map(w=>`<label style="margin-right:12px;white-space:nowrap"><input type="checkbox" class="${p}HW" value="${esc(w)}"${/社團/.test(w)?' checked':''}> ${esc(w)}</label>`).join('')+'<br>沒有寫原因的列只算不能鎖課。':'表裡的班級不排課沒有寫原因，先貼上表格就會列出來。';}
function hardVal(p){const r=document.querySelector('input[name="'+p+'HM"]:checked');if(!r||r.value==='all')return '*';return [...document.querySelectorAll('input.'+p+'HW:checked')].map(x=>x.value);}
function pasteOff(){openDlg(`<h3>貼上不排課表</h3><p class="note">從 Excel 複製這幾欄貼上：<b>名稱、起始星期、結束星期、首節、末節、（原因）</b>。名稱是三位數班級就當成班級，其他當成老師姓名。原因只寫在每一段的第一列也可以。</p>
  ${hardPick('po')}
  <label class="note"><input type="checkbox" id="poAdd"> 名冊裡沒有的老師也新增進來（不勾就略過，只帶入名冊裡有的老師）</label>
  <textarea id="pasteBox" oninput="fillReasons('po')" placeholder="701&#9;2&#9;2&#9;7&#9;7&#9;社團時間&#10;王小華&#9;5&#9;5&#9;3&#9;3&#9;導師會報"></textarea>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="pasteOffOk()">帶入</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteOffOk(){const txt=$('pasteBox').value;if(!txt.trim())return;snapshot('貼上不排課表之前');const r=importOff(D,txt,{hard:hardVal('po'),addTeachers:$('poAdd').checked});
  if(!r.cls&&!r.tea){toast(r.skipT.length?'這些老師都不在名冊裡，沒有帶入。可以勾選「名冊裡沒有的老師也新增」':'沒有讀到資料，請確認是從 Excel 複製、而且有星期和節次');return;}
  changed();closeDlg();render();toast('帶入班級 '+r.cls+' 列、老師 '+r.tea+' 列，共 '+r.cells+' 格'+(r.newT?'；新增 '+r.newT+' 位老師':'')+(r.skipT.length?'；略過 '+r.skipT.length+' 位不在名冊的老師':'')+(r.bad?'；'+r.bad+' 列看不懂':''));offWarn();}
function dayKeys(d){return D.periods.map(p=>d+'-'+p.id);}
function perKeys(p){return DAYS.map((x,d)=>d+'-'+D.periods[p].id);}
function allKeys(){return DAYS.flatMap((x,d)=>dayKeys(d));}
function offWarn(){const o=[];evaluate(M,ST.slot,o);const n=o.filter(x=>x.k==='off').length;if(n)toast('有 '+n+' 節已經排好的課落在不排課時段，請到排課頁調整');}
function togOff(keys){const a=offTarget().arr,all=keys.every(k=>a.includes(k));
  keys.forEach(k=>{const i=a.indexOf(k);if(all)a.splice(i,1);else if(i<0)a.push(k);});changed();render();if(!all)offWarn();}
function clearOff(){offTarget().arr.length=0;changed();render();}
function copyOff(k){if(!k)return;const a=offTarget().arr;offKeys(k).forEach(x=>{if(!a.includes(x))a.push(x);});changed();render();offWarn();}
function addSet(){const x={id:uid('x'),name:'技藝班',students:[],off:[],note:''};D.sets.push(x);offSel='x:'+x.id;changed();render();}
function delSet(){const x=offTarget().set;if(!x||!confirm('確定刪除「'+x.name+'」這個群組？'))return;D.sets=D.sets.filter(o=>o!==x);offSel='*';changed();render();}
function pickSet(){const x=offTarget().set;if(!x)return;pickList(x.name+'的學生',x.students,{});}
function addTeacherHere(role){const t={id:uid('t'),name:role==='資源班'?'新老師':'新任課老師',role,off:[],note:''};D.teachers.push(t);offSel='t:'+t.id;changed();render();toast('已新增，請在上方改成老師的名字');}
// 共用的「勾選學生」對話框：arr 是要增減的學生 id 陣列
function pickList(title,arr,same){
  pickList.arr=arr;const by={};D.students.slice().sort(sortStu).forEach(s=>{(by[s.cls]=by[s.cls]||[]).push(s);});
  let h=`<h3>${esc(title)}</h3><div class="pick">`;
  for(const c in by)h+=`<div class="cl">${esc(c)}</div>`+by[c].map(s=>`<label><input type="checkbox"${arr.includes(s.id)?' checked':''} data-id="${esc(s.id)}" onchange="pickTog(this.dataset.id)">${esc(s.name)}${same[s.id]?` <small>已在${esc(same[s.id])}</small>`:''}</label>`).join('');
  if(!D.students.length)h+='<p class="note">名冊還沒有學生。</p>';
  openDlg(h+`</div><div class="bar" style="margin:0"><button class="b pri" onclick="closeDlg()">完成</button></div>`,render);}
function pickTog(id){const a=pickList.arr,k=a.indexOf(id);if(k>=0)a.splice(k,1);else a.push(id);changed();}

/* ───── 排課｜任課老師（班級 × 科目）───── */
function renderTeach(){
  const need={},subs=[];M.G.forEach(g=>{if(!g.pull||!g.per)return;if(!subs.includes(g.subject))subs.push(g.subject);g.cls.forEach(c=>{(need[c]=need[c]||{})[g.subject]=1;});});
  const cls=Object.keys(need).sort(),tot=cls.reduce((n,c)=>n+Object.keys(need[c]).length,0),done=cls.reduce((n,c)=>n+Object.keys(need[c]).filter(sj=>D.classSubj[c+'|'+sj]).length,0);
  let h=`<div class="bar"><button class="b" onclick="pasteTL()">貼上任課老師名單</button><button class="b" onclick="go('roster','data')">上傳學校的 Excel</button></div><p class="guide">抽離課要和原班同一科同時上，所以要知道<b>每個班這一科是哪位老師</b>，他不排課的時段才會被算進去。直接打老師的名字就好：名冊裡沒有的會自動新增，之後再到「不排課時段」點他的時間。</p>`;
  if(!cls.length){$('page').innerHTML=h+`<div class="probs">還沒有抽離課的組別。請先到「老師開課」建立組別、放進學生，這裡就會列出需要填的班級與科目。</div>`;return;}
  h+=`<div class="bar"><span class="stat">已填 <b>${done}</b> / ${tot} 格</span></div><datalist id="tnames">${D.teachers.filter(t=>t.role!=='資源班').map(t=>`<option value="${esc(t.name)}">`).join('')}</datalist>
  <div class="scroll"><table class="ed"><tr><th>班級</th>${subs.map(s=>`<th>${esc(s)}</th>`).join('')}</tr>`+
  cls.map(c=>`<tr><td><b>${esc(c)}</b></td>`+subs.map(sj=>need[c][sj]?`<td><input type="text" class="w5${D.classSubj[c+'|'+sj]?'':' miss'}" list="tnames" data-k="${esc(c+'|'+sj)}" value="${esc((D.teachers.find(t=>t.id===D.classSubj[c+'|'+sj])||{}).name||'')}" placeholder="老師姓名" onchange="setCSName(this)"></td>`:'<td class="dim">不需要</td>').join('')+'</tr>').join('')+`</table></div>`;
  $('page').innerHTML=h;
}
function setCSName(el){const k=el.dataset.k,name=el.value.trim();
  if(!name){delete D.classSubj[k];changed();render();return;}
  let t=D.teachers.find(x=>x.name===name);if(!t){t=newTeacher(D,name,'普通班');toast('已把 '+name+' 加進老師名冊');}
  D.classSubj[k]=t.id;changed();
  const all=[...document.querySelectorAll('#page input[data-k]')],i=all.indexOf(el);render();const nx=document.querySelectorAll('#page input[data-k]')[i+1];if(nx)nx.focus();}

/* ───── 排課｜貼上課程一覽表（每一組各自的節數、老師、學生一次帶入）───── */
function pasteCourses(){openDlg(`<h3>貼上課程一覽表</h3><p class="note">從 Excel 的「課程領域分組及節數一覽表」整張複製貼上。欄位依序是：<b>領域、年級、組別、抽離或外加、學生名單、節數、人數、人次、授課教師</b>。</p>
  <p class="note">每一組的節數照表上的來，所以同科目不同組可以不一樣（例：數學 7A 3 節、7B 4 節）。組名相同的課會更新，不會重複建立。學生名單遮名的（704林○哲）會用班級和姓名頭尾對回名冊，所以要先有名冊。右邊的教師鐘點表如果一起貼，會帶入基本鐘點。</p>
  <textarea id="pasteBox" placeholder="國文&#9;7&#9;A&#9;抽離&#9;704林○哲、704黃○侖&#9;3&#9;2&#9;6&#9;王老師"></textarea>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="pasteCoursesOk()">帶入課程</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteCoursesOk(){const txt=$('pasteBox').value;if(!txt.trim())return;snapshot('貼上課程一覽表之前');const r=importCourseTable(D,txt);
  if(!r.added&&!r.updated){toast('沒有讀到任何一門課，請確認是從 Excel 複製（欄位之間是 Tab）、而且有節數');return;}
  D=normalize(D);changed();render();
  const miss=[...new Set(r.miss)];
  if(miss.length)openDlg(`<h3>已帶入，但有 ${miss.length} 位學生對不到名冊</h3><p class="note">新增 ${r.added} 門課、更新 ${r.updated} 門，放進 ${r.members} 人次${r.hours?'，並帶入 '+r.hours+' 位老師的基本鐘點':''}。下面這些在名冊裡找不到，或同班有兩位符合，請到「名冊」新增後，再到「學生編組」放進課裡：</p><p>${miss.map(m=>`<span class="tagv">${esc(m)}</span>`).join(' ')}</p><div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="closeDlg()">知道了</button></div>`);
  else{closeDlg();toast('新增 '+r.added+' 門課、更新 '+r.updated+' 門，放進 '+r.members+' 人次'+(r.hours?'，帶入 '+r.hours+' 位老師的基本鐘點':''));}
  offWarn();}

/* ───── 排課｜貼上分組表 ───── */
function pasteGroups(){openDlg(`<h3>貼上分組表</h3><p class="note">從 Excel 或 Google 試算表複製整張分組表貼上。每位學生一格「班級-座號姓名」（例 <b>701-13王小明</b>），後面幾格依序是各科的組別代號（例 7C、7B、空白＝不抽）。一列可以並排好幾位學生。</p>
  <div class="bar"><span class="note" style="margin:0">各欄科目</span><input type="text" id="pgSubj" style="flex:1;min-width:0" value="國文,英文,數學,特需"></div>
  <div class="bar"><span class="note" style="margin:0">每週節數</span><input type="text" id="pgPer" style="flex:1;min-width:0" value="5,3,4,1"></div>
  <textarea id="pasteBox" placeholder="701-13王小明&#9;7C&#9;7C&#9;7C&#10;702-03陳小華&#9;7B&#9;7B&#9;7A"></textarea>
  <p class="note">請從試算表複製（欄位之間是 Tab），空白的格子才對得上科目。直接從 PDF 複製會把空格吃掉。</p>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="pasteGroupsOk()">建立學生與組別</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteGroupsOk(){
  const subj=$('pgSubj').value.split(/[,，、\s]+/).filter(Boolean),per=$('pgPer').value.split(/[,，、\s]+/).map(Number),RE=/^(\d{3,4})\s*[-－–]\s*(\d{1,2})?\s*(\S.*)$/;
  let nS=0,nG=0,nM=0,bad=0;
  $('pasteBox').value.split(/\r?\n/).forEach(line=>{if(!line.trim())return;const cells=line.includes('\t')?line.split('\t'):line.trim().split(/\s+/);let cur=null,col=0,any=false;
    cells.forEach(c=>{c=c.trim();const m=c.match(RE);
      if(m){any=true;const cls=m[1],seat=m[2]?String(+m[2]).padStart(2,'0'):'',name=m[3].trim();
        cur=D.students.find(s=>String(s.cls)===cls&&((seat&&s.seat&&+s.seat===+seat)||s.name===name));
        if(!cur){cur={id:uid('s'),cls,seat,name,caseMgr:'',note:''};D.students.push(cur);nS++;}col=0;return;}
      if(!cur)return;const sj=subj[col],i=col;col++;if(!c||!sj)return;
      const gname=c+sj;let g=D.groups.find(x=>x.name===gname);
      if(!g){g={id:uid('g'),name:gname,subject:sj,teacher:'',per:per[i]>0?per[i]:3,students:[],mode:'抽離',room:'',on:true};D.groups.push(g);nG++;}
      if(!g.students.includes(cur.id)){g.students.push(cur.id);nM++;}});
    if(!any)bad++;});
  D=normalize(D);changed();closeDlg();render();toast('新增 '+nS+' 位學生、'+nG+' 組，放進組別 '+nM+' 人次'+(bad?'；略過 '+bad+' 行':''));}

/* ───── 排課｜排課板 ───── */
function chipHtml(l,errs){const g=M.G[M.L[l].g],r=ROOM[l],names=g.stu.map(i=>stuLabel(D.students[i])).join('、');
  return `<span class="chip c${colorOf(g)}${ST.pin[l]?' pin':''}${errs[l]?' err':''}${selL===l?' sel':''}" draggable="true" data-l="${l}" title="${esc((g.t>=0?M.T[g.t].name+'｜':'')+names+(errs[l]?'\n'+errs[l]:''))}">${esc(g.name)}<small>${esc(ST.slot[l]>=0&&r>=0?D.rooms[r].name:(g.t>=0?M.T[g.t].name:''))}</small></span>`;}
function renderBoard(){
  const out=[];evaluate(M,ST.slot,out);
  const errs={},msg=new Map(),cnt={};out.forEach(o=>{cnt[o.k]=(cnt[o.k]||0)+1;if(o.k!=='un')errs[o.l]=(errs[o.l]?errs[o.l]+'\n':'')+o.m;const e=msg.get(o.m);if(e)e.n++;else msg.set(o.m,{n:1,l:o.l,k:o.k});});
  const CK=[['teacher','老師'],['student','學生'],['class','原班兩科'],['reg','任課老師'],['room','教室'],['off','不排課時段'],['un','還沒排']];
  const warns=M.G.filter(g=>g.per).flatMap(g=>g.warn.map(w=>g.name+'：'+w));
  const placed=[...ST.slot].filter(s=>s>=0).length,total=M.L.length,gv=view.slice(0,2)==='g:'?+view.slice(2):0,ti=view&&!gv?M.tIdx[view]:-1;
  const show=shownL,gOff=gv?new Set(D.offBy[view]||[]):null,gname=gv?GRADE[gv]:'';
  const at={},un=[];M.L.forEach((x,l)=>{if(!show(l))return;const s=ST.slot[l];if(s<0)un.push(l);else(at[s]=at[s]||[]).push(l);});
  let h=`<p class="guide">按<b>一鍵排課</b>，系統會先排出每位老師的課，再把「待安排」的學生編進不衝堂的課，最後確認老師、學生、教室都不撞。排完可以直接拖曳調整（或點一下組別、再點要放的格子）；動過的會<b>固定</b>住，再按一次排課時不會被移走。</p>
  <div class="bar"><button class="b pri big" onclick="runSolve(false)">${gv?'排'+gname:'一鍵排課'}</button><button class="b" onclick="runSolve(true)">${gv?gname+'重排':'全部重排'}</button><button class="b" onclick="undo()">復原</button><button class="b" onclick="unpinAll()">解除全部固定</button><button class="b" onclick="aiOpen()">用 AI 排</button><button class="b danger" onclick="clearAll()">清空排法</button>
    <span class="stat">已排 <b>${placed}</b> / ${total} 節</span><span class="stat${out.length?' bad':''}">問題 <b>${out.length}</b></span><span class="grow"></span>
    <select onchange="view=this.value;selL=-1;render()"><option value="">全部年級</option>${[...new Set(M.G.flatMap(g=>g.grades))].filter(g=>GRADE[g]).sort().map(g=>`<option value="g:${g}"${view==='g:'+g?' selected':''}>只看、只排${GRADE[g]}</option>`).join('')}${D.teachers.map(t=>`<option value="${esc(t.id)}"${t.id===view?' selected':''}>只看 ${esc(t.name)}</option>`).join('')}</select></div>`;
  if(!total)h+=`<div class="probs">還沒有要排的組，請先到「老師開課」建立。</div>`;
  else if(!out.length&&!warns.length&&placed===total)h+=`<div class="probs ok">全部排好了，沒有衝突。</div>`;
  else if(out.length||warns.length)h+=`<div class="probs">`+warns.map(w=>`<div>${esc(w)}</div>`).join('')+[...msg].map(([m,e])=>`<div class="err${e.k==='un'?'':' go'}" data-l="${e.l}" onclick="pickL(+this.dataset.l)">${esc(m)}${e.n>1?'（'+e.n+' 節）':''}</div>`).join('')+`</div>`;
  if(total)h+=`<div class="chk"><b>衝堂檢查</b>`+CK.map(([k,n])=>`<span class="${cnt[k]?'bad':'ok'}">${n} ${cnt[k]||0}</span>`).join('')+(M.flex?(A=>`<span class="${A.open.length?'mid':'ok'}" title="有學生被抽離、但原班鎖不到任何主科的班級節次。詳細在「課表輸出 › 鎖課表」">鎖不到課 ${A.open.length}／${A.pulled}</span>`)(assignLocks(M,ST.slot)):'')+`<small>每次調整都會重新檢查；點上面的紅字會跳到那一節</small></div>`;
  if(selL>=0&&selL<M.L.length){const g=M.G[M.L[selL].g],s=ST.slot[selL],fx=ST.rfix[selL];
    h+=`<div class="selbar"><b>${esc(g.name)}</b><span>${s>=0?esc(M.sn(s)):'還沒排'}</span><label>教室 <select onchange="setLRoom(this.value)"><option value="-1">自動${s>=0&&fx<0&&ROOM[selL]>=0?'（'+esc(D.rooms[ROOM[selL]].name)+'）':''}</option>${D.rooms.map((r,i)=>`<option value="${i}"${i===fx?' selected':''}>${esc(r.name)}</option>`).join('')}</select></label>
      ${s>=0?`<button class="b sm" onclick="togPin()">${ST.pin[selL]?'解除固定':'固定在這一節'}</button><button class="b sm" onclick="moveLesson(selL,-1)">拿下來</button>`:''}<span class="note" style="margin:0">點要放的格子可以移動；綠色是不會衝堂的位置</span><span class="grow"></span><button class="b sm" onclick="selL=-1;render()">取消選取</button></div>`;}
  h+=`<div class="tray" data-s="-1">${un.length?'還沒排：'+un.map(l=>chipHtml(l,errs)).join(''):(placed<total?'':'拖到這裡可以把一節拿下來')}</div>
  <div class="scroll"><table class="board"><tr><th class="ph2"></th>${DAYS.map(d=>`<th>週${d}</th>`).join('')}</tr>`;
  D.periods.forEach((p,pi)=>{h+=`<tr class="${p.extra?'ex':''}"><th class="ph2">${esc(p.name)}<small>${esc(p.start)}</small></th>`+DAYS.map((d,di)=>{const s=di*M.NP+pi,blk=M.blocked[s]||(ti>=0&&M.off[ti][s])||(gOff&&gOff.has(M.s2key(s)));
    return `<td class="${blk?'blk':''}" data-s="${s}">${(at[s]||[]).sort((a,b)=>colorOf(M.G[M.L[a].g])-colorOf(M.G[M.L[b].g])).map(l=>chipHtml(l,errs)).join('')}</td>`;}).join('')+'</tr>';});
  h+=`</table></div><div class="legend">`+M.rts.map((t,i)=>`<span class="chip c${i%6}">${esc(M.T[t].name)}</span>`).join('')+`　粗框＝已固定（連點兩下可切換）　斜線＝不排課　紅框＝有衝突，滑鼠停在上面看原因</div>`;
  const rows=M.G.filter(g=>g.per).map(g=>({g,slack:g.alist.length-g.per})).sort((a,b)=>a.slack-b.slack);
  if(rows.length)h+=`<h3>哪一組最難排</h3><p class="note">「可排時段」是扣掉這一組所有相關老師的不排課時段之後剩下的格數，越少越難排。系統會自動先顧這些組。</p>
  <div class="scroll"><table class="ed"><tr><th>組別</th><th>老師</th><th>每週節數</th><th>可排時段</th><th>一起算進去的原班老師</th></tr>`+rows.map(({g})=>`<tr><td>${esc(g.name)}</td><td>${esc(g.t>=0?M.T[g.t].name:'')}</td><td>${g.per}</td><td>${g.alist.length} 格</td><td class="dim">${esc([...new Set(g.locks.filter(k=>k.t>=0).map(k=>M.T[k.t].name))].join('、'))}</td></tr>`).join('')+`</table></div>`;
  $('page').innerHTML=h;
  if(selL>=0)markCells(selL);
}
function pickL(l){if(!(l>=0))return;selL=l;if(view&&!shownL(l))view='';render();const c=document.querySelector('#page .chip[data-l="'+l+'"]');if(c&&c.scrollIntoView)c.scrollIntoView({block:'center',inline:'center'});}
function setLRoom(v){if(selL<0)return;pushUndo();const l=selL;ST.rfix[l]=+v;commit();selL=l;render();}
function togPin(){if(selL<0||ST.slot[selL]<0)return;pushUndo();const l=selL;ST.pin[l]=ST.pin[l]?0:1;commit();selL=l;render();}
function markCells(l){document.querySelectorAll('#page td[data-s]').forEach(td=>{const s=+td.dataset.s;if(s===ST.slot[l])return;
  const ok=canPlace(M,ST.slot,l,s);td.classList.add(ok?'ok':'no');if(!ok){const r=why(M,M.L[l].g,s);td.title=r.length?r.join('、'):'放這裡會和別組衝突';}});}
function clearMarks(){document.querySelectorAll('#page td[data-s]').forEach(td=>{td.classList.remove('ok','no','over');td.removeAttribute('title');});const t=document.querySelector('.tray');if(t)t.classList.remove('over');}
function moveLesson(l,s){if(ST.slot[l]===s){selL=-1;render();return;}pushUndo();const bad=s>=0&&!canPlace(M,ST.slot,l,s);
  ST.slot[l]=s;ST.pin[l]=s>=0?1:0;selL=-1;commit();if(bad)toast('放進去了，但這一格有衝突，請看上方說明');}
(function(){const B=$('page');let dragL=-1;const onBoard=()=>page==='sched'&&sub==='board'&&!isRO();
  B.addEventListener('dragstart',e=>{const c=onBoard()&&e.target.closest&&e.target.closest('.chip[data-l]');if(!c)return;dragL=+c.dataset.l;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(dragL));}catch(x){}
    setTimeout(()=>{clearMarks();if(dragL>=0)markCells(dragL);},0);});
  B.addEventListener('dragend',()=>{if(dragL<0)return;dragL=-1;clearMarks();if(selL>=0)markCells(selL);});
  B.addEventListener('dragover',e=>{const td=e.target.closest('[data-s]');if(!td||dragL<0)return;e.preventDefault();
    B.querySelectorAll('.over').forEach(x=>{if(x!==td)x.classList.remove('over');});td.classList.add('over');});
  B.addEventListener('drop',e=>{const td=e.target.closest('[data-s]');if(!td||dragL<0)return;e.preventDefault();const l=dragL;dragL=-1;moveLesson(l,+td.dataset.s);});
  B.addEventListener('dblclick',e=>{const c=onBoard()&&e.target.closest('.chip[data-l]');if(!c)return;const l=+c.dataset.l;if(ST.slot[l]<0)return;pushUndo();ST.pin[l]=ST.pin[l]?0:1;selL=-1;commit();});
  B.addEventListener('click',e=>{if(!onBoard())return;const c=e.target.closest('.chip[data-l]');
    if(c){const l=+c.dataset.l;selL=selL===l?-1:l;render();return;}
    const td=e.target.closest('[data-s]');if(td&&selL>=0)moveLesson(selL,+td.dataset.s);});
})();
// 目前的檢視（某個年級或某位老師）包含哪些節
function shownL(l){if(!view)return true;const g=M.G[M.L[l].g];if(view.slice(0,2)==='g:')return g.grades.includes(+view.slice(2));const ti=M.tIdx[view];return ti==null||g.t===ti||g.locks.some(k=>k.t===ti);}
function runSolve(all){
  if(!M.L.length){toast('還沒有要排的組，請先到「老師開課」建立');return;}
  const part=view.slice(0,2)==='g:';if(all&&ST.pin.some((x,l)=>x&&(!part||shownL(l)))&&!confirm('重排會連已經固定的也一起重排，確定嗎？'))return;
  pushUndo();snapshot('一鍵排課之前');$('busy').style.display='flex';
  setTimeout(()=>{try{if(all)ST.pin.forEach((x,l)=>{if(!part||shownL(l))ST.pin[l]=0;});D.settings.seed=(D.settings.seed||1)+1;const sv=()=>{const R=solve(M,ST,{seed:D.settings.seed,only:part?shownL:null});setST({slot:R.slot,pin:R.pin,rfix:ST.rfix});};
      sv();let pl=null;const gv=part?+view.slice(2):0;
      if(needList(D).length){D.assign=fromState(M,ST);pl=placeStudents(D,gv?{filter:s=>gradeOfCls(s.cls)===gv}:null);if(pl.placed){rebuild();evaluate(M,ST.slot);if(M.viol)sv();}}
      if(M.flex){const R2=refineLocks(M,ST,{only:part?shownL:null});setST({slot:R2.slot,pin:ST.pin,rfix:ST.rfix});}
      runSolve.msg=pl&&(pl.placed||pl.left.length)?'；'+(pl.placed?'把 '+pl.placed+' 人次的學生編進課裡':'')+(pl.left.length?(pl.placed?'，':'')+pl.left.length+' 人次找不到同科目同年級的課':''):'';
      if(M.flex){const A=assignLocks(M,ST.slot);runSolve.msg+='；原班鎖得到課 '+(A.pulled-A.open.length)+'／'+A.pulled+(A.fixAll?'，沿用手排鎖課 '+A.fixed+'／'+A.fixAll:'');}
      selL=-1;commit();
      const n=part?M.L.filter((x,l)=>shownL(l)).length:M.L.length;const o2=[];evaluate(M,ST.slot,o2);const v=o2.filter(o=>!part||shownL(o.l)).length;toast((v?'排好了，但還有 '+v+' 個問題排不開，請看上方說明':'排好了：'+(part?GRADE[+view.slice(2)]+' ':'')+n+' 節全部排入，沒有衝突')+runSolve.msg);}
    finally{$('busy').style.display='none';}},40);
}
function undo(){if(!undoStack.length){toast('沒有可以復原的動作');return;}const u=JSON.parse(undoStack.pop());D.assign=u.a;u.m.forEach(([id,st])=>{const g=D.groups.find(x=>x.id===id);if(g)g.students=st;});rebuild();commit();}
function unpinAll(){pushUndo();ST.pin.fill(0);commit();}
function clearAll(){if(!confirm('確定清空目前的排法？（可以按「復原」救回來）'))return;snapshot('清空排法之前');pushUndo();ST.slot.fill(-1);ST.pin.fill(0);ST.rfix.fill(-1);selL=-1;commit();}

/* ───── 排課｜課表輸出 ───── */
let outG='';
const LOCKN={國文:'國語文',英文:'英語文'};
const TCOL=['#d96a00','#d81e1e','#8a3b12','#4b1a8c','#111111','#0a9fd2','#e02fb4','#7a7a7a','#0b6b1e','#1a2be0','#0d857a','#9a6f00'];
const SUBC={'':['#eef5ee','#5aa06f','#22603a'],國:['#fdecec','#e86a6a','#a11d1d'],數:['#eaf1fa','#6a9ad8','#234a94'],英:['#fdf7dc','#f0c000','#8a5a00'],社:['#f3ecfa','#9a6fd0','#4b2a8c']};
// 總課表上的組別代號：組名如果帶著科目（8A國文）就只留代號（8A）
function shortName(g){const n=String(g.name||''),j=String(g.subject||'');return j&&n.length>j.length&&n.endsWith(j)?n.slice(0,-j.length):j&&n.length>j.length&&n.startsWith(j)?n.slice(j.length):n;}
function slotsText(list){const by={};list.forEach(s=>{const d=Math.floor(s/M.NP);(by[d]=by[d]||[]).push(M.P[s%M.NP].name);});
  return Object.keys(by).sort().map(d=>'週'+DAYS[d]+' '+by[d].join('、')).join('；');}
function renderOut(){
  const modes=[['master','總課表'],['teacher','資源班老師課表'],['lock','給教務處的鎖課表'],['lockraw','鎖課清單（教務處格式）'],['homeroom','給導師的班級抽離表'],['card','學生個人課表'],['student','學生抽離一覽'],['group','組別總表']];
  const placed=[...ST.slot].filter(s=>s>=0).length;
  let h=`<p class="guide">排好之後，在這裡印出或複製各種表。<b>鎖課表</b>是給教務處的：列出每個班哪幾節必須排哪一科，原班才會和資源班同時上同一科。</p>
  <div class="bar">`+modes.map(([k,n])=>`<button class="b${outMode===k?' pri':''}" onclick="outMode='${k}';render()">${n}</button>`).join('')+`<span class="grow"></span><button class="b" onclick="copyOut()">複製</button><button class="b" onclick="window.print()">列印</button></div>`;
  if(outMode==='master')h+=`<div class="bar"><label class="note" style="margin:0">實施日期 <input type="text" class="w8" value="${esc(D.settings.dates||'')}" placeholder="115.09.02-116.01.20" onchange="D.settings.dates=this.value.trim();save();render()"></label><span class="note" style="margin:0">欄是教室、顏色是老師；列印時會自動用橫式。教室名稱取最後一個字當欄名。</span></div>`;
  if(outMode==='card')h+=`<div class="bar"><label class="note" style="margin:0">課表名稱 <input type="text" class="w8" value="${esc(D.settings.cardTitle||'資源班課表')}" onchange="D.settings.cardTitle=this.value.trim();save();render()"></label>
    <select onchange="outG=this.value;render()"><option value="">全部年級</option>${[...new Set(D.students.map(x=>gradeOfCls(x.cls)))].filter(x=>GRADE[x]).sort().map(x=>`<option value="${x}"${String(x)===outG?' selected':''}>${GRADE[x]}</option>`).join('')}</select><span class="note" style="margin:0">一位學生一頁</span></div>`;
  if(!placed){$('page').innerHTML=h+`<div class="probs">還沒有排法，請先到「排課」按一鍵排課。</div>`;return;}
  const T=esc(D.title||'資源班');let b='';
  if(outMode==='master'){
    const names=D.rooms.map(r=>String(r.name||'')),uq=a=>new Set(a).size===a.length,la=names.map(n=>n.slice(-1)),fa=names.map(n=>n.slice(0,1)),rn=names.every(n=>n.length<=2)?names:uq(la)?la:uq(fa)?fa:names;
    const cols=D.rooms.map((r,i)=>({i,n:rn[i]})).concat(M.L.some((x,l)=>ST.slot[l]>=0&&ROOM[l]<0)?[{i:-1,n:'其他'}]:[]),at={};
    M.L.forEach((x,l)=>{const sl=ST.slot[l];if(sl>=0){const k=sl+'|'+ROOM[l];(at[k]=at[k]||[]).push(l);}});
    const tc=t=>TCOL[Math.max(0,M.rts.indexOf(t))%TCOL.length];
    b=`<style>@page{size:A4 landscape;margin:10mm}</style><div class="pg master">${D.settings.dates?`<p class="dt">實施日期：${esc(D.settings.dates)}</p>`:''}<h2>${T} 課表</h2><p class="lg">教師：${M.rts.map(t=>`<b style="color:${tc(t)}">${esc(M.T[t].name)}</b>`).join('、')}</p>
      <table class="out mt"><tr><th rowspan="2"></th>${DAYS.map(d=>`<th colspan="${cols.length}" class="dl">星期${d}</th>`).join('')}</tr><tr>${DAYS.map(()=>cols.map((c,k)=>`<th class="${k?'':'dl'}">${esc(c.n)}</th>`).join('')).join('')}</tr>`+
      D.periods.map((p,pi)=>`<tr><th>${esc(String(p.name).replace(/^第\s*(\S+?)\s*節$/,'$1'))}</th>`+DAYS.map((d,di)=>cols.map((c,k)=>`<td class="${k?'':'dl'}">${(at[(di*M.NP+pi)+'|'+c.i]||[]).map(l=>{const g=M.G[M.L[l].g];
        return `<span style="color:${tc(g.t)}"><b>${esc(String(g.subject).slice(0,1))}</b><br>${esc(shortName(g.ref))}</span>`;}).join('')}</td>`).join('')).join('')+'</tr>').join('')+'</table></div>';
  }else if(outMode==='teacher'){
    M.rts.forEach(t=>{const at={};M.L.forEach((x,l)=>{const g=M.G[x.g];if(g.t===t&&ST.slot[l]>=0)at[ST.slot[l]]=l;});
      b+=`<div class="pg"><h2>${T}｜${esc(M.T[t].name)}課表（每週 ${Object.keys(at).length} 節）</h2><table class="out"><tr><th style="width:92px">節次</th>${DAYS.map(d=>`<th>週${d}</th>`).join('')}</tr>`+
        D.periods.map((p,pi)=>`<tr><td class="c">${esc(p.name)}<br><small>${esc(p.start)}～${esc(p.end)}</small></td>`+DAYS.map((d,di)=>{const l=at[di*M.NP+pi];if(l==null)return '<td></td>';const g=M.G[M.L[l].g];
          return `<td class="c"><b>${esc(g.name)}</b><br><small>${esc(ROOM[l]>=0?D.rooms[ROOM[l]].name:'')}　${g.stu.length} 人</small></td>`;}).join('')+'</tr>').join('')+'</table></div>';});
  }else if(outMode==='lockraw'){
    const reg=D.periods.filter(p=>!p.extra),pn=s=>{const p=M.P[s%M.NP],m=String(p.name).match(/^第\s*(\d+)\s*節$/);return m?+m[1]:reg.indexOf(p)+1;};
    const rows=(M.flex?assignLocks(M,ST.slot).locks.map(k=>({cls:k.cls,sj:k.sj,s:k.s,t:M.T[k.t].name})):lockTable(M,ST.slot).flatMap(r=>r.slots.map(s=>({cls:r.cls,sj:r.subject,s,t:r.teacher})))).sort((a,c)=>a.cls.localeCompare(c.cls)||a.s-c.s);
    b=`<div class="pg"><h2>${T}｜鎖課清單</h2><table class="out"><tr><th>班級名稱</th><th>科目名稱</th><th>星期</th><th>首節</th><th>末節</th><th>教師姓名</th></tr>`+
      rows.map(r=>`<tr><td class="c">${esc(r.cls)}</td><td class="c">${esc(LOCKN[r.sj]||r.sj)}</td><td class="c">${Math.floor(r.s/M.NP)+1}</td><td class="c">${pn(r.s)}</td><td class="c">${pn(r.s)}</td><td>${esc(r.t)}</td></tr>`).join('')+
      `</table><p class="note">欄位和教務處「特教鎖課需求」的資料輸出相同，按「複製」可以貼到試算表。科目名稱國文、英文會寫成國語文、英語文。共 ${rows.length} 筆。</p></div>`;
    // 特教鎖課整理：每班各科鎖幾節、國文有沒有連 2 節（同一天相鄰兩節）
    const CS=['國語文','英語文','數學','理化'],cnt={};
    rows.forEach(r=>{const o=cnt[r.cls]=cnt[r.cls]||{n:{},g:[]},sj=LOCKN[r.sj]||r.sj;o.n[sj]=(o.n[sj]||0)+1;if(sj==='國語文')o.g.push(r.s);});
    const dbl=g=>g.some(s=>g.includes(s+1)&&Math.floor(s/M.NP)===Math.floor((s+1)/M.NP)&&pn(s+1)===pn(s)+1)?1:0;
    b+=`<div class="pg"><h2>${T}｜特教鎖課整理</h2><table class="out"><tr><th>班級名稱</th><th>國語文</th><th>英語文</th><th>數學</th><th>國文連2</th><th>理化</th></tr>`+
      Object.keys(cnt).sort().map(c=>{const o=cnt[c];return `<tr><td class="c">${esc(c)}</td>${CS.slice(0,3).map(s=>`<td class="c">${o.n[s]||0}</td>`).join('')}<td class="c">${dbl(o.g)}</td><td class="c">${o.n['理化']||0}</td></tr>`;}).join('')+
      `</table><p class="note">欄位和「特教鎖課需求」的特教鎖課整理相同。國文連2 是 1 表示這一班有鎖到同一天相鄰的兩節國文。</p></div>`;
  }else if(outMode==='lock'){
    if(M.flex){const A=assignLocks(M,ST.slot),n=A.locks.filter(k=>!k.extra).length,ex=A.locks.length-n;
      b=`<div class="pg"><p class="note">有學生被抽離的班級節次共 <b>${A.pulled}</b> 個：鎖到 <b>${n}</b> 個（同一科 ${A.same}、改鎖別科 ${n-A.same}），鎖不到 <b>${A.open.length}</b> 個${ex?'；另外為了連堂多鎖 '+ex+' 節':''}。${A.fixAll?`手排鎖課 ${A.fixAll} 節，沿用 <b>${A.fixed}</b> 節。`:''}</p>${A.warn.length?`<div class="probs">${A.warn.map(w=>'<div>'+esc(w)+'</div>').join('')}</div>`:''}</div>`+
        (A.open.length?`<div class="pg"><h2>${T}｜鎖不到課的節次</h2><table class="out"><tr><th>班級</th><th>節次</th><th>資源班組別</th><th>原因</th></tr>`+A.open.map(o=>`<tr><td class="c">${esc(o.cls)}</td><td>${esc(M.sn(o.s))}</td><td>${esc(o.groups.join('、'))}</td><td>${esc(o.why)}</td></tr>`).join('')+`</table><p class="note">這些節次學生照樣到資源班上課，只是原班那一節不是主科。想減少的話，可以到排課頁把那一節移到別的時段。</p></div>`:'')+
        (A.idle.length?`<div class="pg"><h2>${T}｜手排鎖課沒用到的節次</h2><table class="out"><tr><th>班級</th><th>節次</th><th>手排鎖的老師</th><th>科目</th></tr>`+A.idle.sort((a,c)=>a.cls.localeCompare(c.cls)||a.s-c.s).map(o=>`<tr><td class="c">${esc(o.cls)}</td><td>${esc(M.sn(o.s))}</td><td>${esc(o.t)}</td><td>${esc(o.sj||'')}</td></tr>`).join('')+`</table><p class="note">手排時有鎖，但現在的課表這一節沒有這一班的學生被抽離，所以不會交給教務處。九年級英數理如果是教學組統一鎖的，也會列在這裡。</p></div>`:'');}
    b+=`<div class="pg"><h2>${T}｜資源班抽離課鎖課表</h2><table class="out"><tr><th>班級</th><th>科目</th><th>任課老師</th><th>請排這一科的節次</th><th>節數</th><th>資源班組別</th></tr>`+
      lockTable(M,ST.slot).map(r=>`<tr><td class="c">${esc(r.cls)}</td><td class="c">${esc(r.subject)}</td><td>${esc(r.teacher)}</td><td>${esc(slotsText(r.slots))}</td><td class="c">${r.slots.length}</td><td>${esc(r.groups.join('、'))}</td></tr>`).join('')+
      `</table><p class="note">外加課和不鎖課的課不占原班主科時間，沒有列在這張表。</p></div>`;
  }else if(outMode==='homeroom'||outMode==='card'){
    const of={};M.L.forEach((x,l)=>{const s=ST.slot[l],g=M.G[x.g];if(s<0)return;g.stu.forEach(i=>{(of[i]=of[i]||{})[s]={g,l};});});
    const list=D.students.map((s,i)=>({s,i})).filter(o=>of[o.i]).sort((a,b2)=>sortStu(a.s,b2.s));
    const cell=o=>o?`<b>${esc(o.g.subject)}</b><br><small>${esc(o.g.name)}${ROOM[o.l]>=0?'・'+esc(D.rooms[ROOM[o.l]].name):''}</small>`:'';
    if(outMode==='card'){const ttl=D.settings.cardTitle||'資源班課表';
      b=list.filter(o=>!outG||gradeOfCls(o.s.cls)===+outG).map(({s,i})=>`<div class="pg pcard"><h2>${esc(s.cls)}-${esc(s.seat)}${esc(s.name)}　${esc(ttl)}</h2><table class="out pt"><tr><th style="width:100px">節次/時間</th>${DAYS.map(d=>`<th>星期${d}</th>`).join('')}</tr>`+
        D.periods.map((p,pi)=>`<tr class="${pi%2?'alt':''}"><th>${esc(p.name)}${p.start&&!p.extra?`<small>${esc(p.start)}–${esc(p.end)}</small>`:''}</th>`+DAYS.map((d,di)=>{const o=of[i][di*M.NP+pi];if(!o)return '<td></td>';
          const c=SUBC[String(o.g.subject)[0]]||SUBC[''],tn=o.g.t>=0?M.T[o.g.t].name:'';
          return `<td><div class="pc" style="background:${c[0]};border-left-color:${c[1]};color:${c[2]}"><b>${esc(o.g.subject)}</b><span>${esc(tn&&!/(老師|主任|組長)/.test(tn)?tn+'老師':tn)}</span><small>${ROOM[o.l]>=0?'@ '+esc(D.rooms[ROOM[o.l]].name):''}</small></div></td>`;}).join('')+'</tr>').join('')+`</table></div>`).join('')||'<p class="note">這個年級沒有學生有排課。</p>';}
    else b=[...new Set(list.map(o=>String(o.s.cls)))].map(c=>`<div class="pg"><h2>${T}｜${esc(c)} 班 資源班抽離表</h2><table class="out"><tr><th>座號</th><th>姓名</th>${DAYS.map(d=>`<th>週${d}</th>`).join('')}</tr>`+
      list.filter(o=>String(o.s.cls)===c).map(({s,i})=>`<tr><td class="c">${esc(s.seat)}</td><td>${esc(s.name)}</td>`+DAYS.map((d,di)=>'<td>'+Object.keys(of[i]).map(Number).filter(x=>Math.floor(x/M.NP)===di).sort((a,b2)=>a-b2).map(x=>esc(M.P[x%M.NP].name+' '+of[i][x].g.subject)).join('<br>')+'</td>').join('')+'</tr>').join('')+`</table><p class="note">以上節次學生到資源班上課，請導師協助提醒。</p></div>`).join('');
  }else if(outMode==='student'){
    const of={};M.L.forEach((x,l)=>{const s=ST.slot[l],g=M.G[x.g];if(s<0)return;g.stu.forEach(i=>{(of[i]=of[i]||[]).push({s,g});});});
    b=`<div class="pg"><h2>${T}｜學生抽離一覽</h2><table class="out"><tr><th>班級</th><th>座號</th><th>姓名</th>${DAYS.map(d=>`<th>週${d}</th>`).join('')}<th>每週</th></tr>`+
      D.students.map((s,i)=>({s,i})).filter(o=>of[o.i]).sort((a,b2)=>sortStu(a.s,b2.s)).map(({s,i})=>`<tr><td class="c">${esc(s.cls)}</td><td class="c">${esc(s.seat)}</td><td>${esc(s.name)}</td>`+
        DAYS.map((d,di)=>'<td>'+of[i].filter(o=>Math.floor(o.s/M.NP)===di).sort((a,b2)=>a.s-b2.s).map(o=>esc(M.P[o.s%M.NP].name+' '+o.g.name)).join('<br>')+'</td>').join('')+`<td class="c">${of[i].length}</td></tr>`).join('')+'</table></div>';
  }else{
    b=`<div class="pg"><h2>${T}｜組別總表</h2><table class="out"><tr><th>組別</th><th>科目</th><th>型態</th><th>老師</th><th>教室</th><th>上課節次</th><th>學生</th></tr>`+
      M.G.filter(g=>g.per).map(g=>{const ls=M.L.map((x,l)=>l).filter(l=>M.L[l].g===g.gi&&ST.slot[l]>=0),rs=[...new Set(ls.map(l=>ROOM[l]).filter(r=>r>=0).map(r=>D.rooms[r].name))];
        return `<tr><td><b>${esc(g.name)}</b></td><td class="c">${esc(g.subject)}</td><td class="c">${g.pull?'抽離':'外加'}</td><td>${esc(g.t>=0?M.T[g.t].name:'')}</td><td>${esc(rs.join('、'))}</td><td>${esc(slotsText(ls.map(l=>ST.slot[l]).sort((a,c)=>a-c)))}</td><td>${esc(g.stu.map(i=>stuLabel(D.students[i])).join('、'))}</td></tr>`;}).join('')+'</table></div>';
  }
  $('page').innerHTML=h+`<div id="outArea">${b}</div>`;
}
function copyOut(){const el=$('outArea');if(!el)return;const r=document.createRange();r.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(r);
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}s.removeAllRanges();toast(ok?'已複製，可以貼到 Word 或 LINE':'複製失敗，請手動選取後複製');}

/* ───── 名冊｜匯入與新學期：讓學校自己把每學期的資料帶進來 ───── */
const SNKEY='resource-class-snap',LBKEY='resource-class-lastbackup';
// 自動版本：最多留 12 份（每天一份，加上大動作之前各一份），空間不夠就丟掉最舊的。
// 存在 IndexedDB（總量上限約 30MB）；瀏覽器不支援時退回 localStorage（上限約 1.5MB，才不會擠掉名冊本身）。
// 公用電腦模式：只留在這次開著的頁面，不寫進這台電腦。
const SNMAX=12,SNCAP_IDB=30*1024*1024,SNCAP_LS=1.5*1024*1024;
let SNAPS=null,snapDB=null,snapLS=false;
function snaps(){if(!SNAPS){try{SNAPS=JSON.parse(localStorage.getItem(SNKEY))||[];}catch(e){SNAPS=[];}}return SNAPS;}
const snapBytes=a=>a.reduce((n,x)=>n+(x.json||'').length*2,0);
// 超過份數或總量就從最舊的開始丟（最新的一份留著）；回傳丟掉的
function snapTrim(a,cap){const rm=[];while(a.length>1&&(a.length>SNMAX||snapBytes(a)>cap))rm.push(a.shift());return rm;}
function snapLSWrite(a){while(a.length){if(lsTry(SNKEY,JSON.stringify(a)))return;a.shift();}try{localStorage.removeItem(SNKEY);}catch(e){}}
// 名冊存不進 localStorage 時：丟掉一份存在 localStorage 的最舊版本，回傳有沒有丟
function snapEvictLS(){let a;try{a=JSON.parse(localStorage.getItem(SNKEY))||[];}catch(e){a=[];}if(!a.length)return false;
  a.shift();if(a.length)lsTry(SNKEY,JSON.stringify(a));else try{localStorage.removeItem(SNKEY);}catch(e){}
  if(snapLS&&SNAPS)SNAPS.splice(0,SNAPS.length-a.length);return true;}
function snapshot(label,json){const a=snaps(),l=a[a.length-1];let at=Date.now();if(l&&l.at>=at)at=l.at+1;
  const x={at,label:String(label||''),json:json||JSON.stringify(D)};
  if(snapLS&&$('storeBar'))return;   // 空間已經滿了：先不要再存版本
  a.push(x);const rm=snapTrim(a,snapLS?SNCAP_LS:SNCAP_IDB);
  if(typeof pcMode==='function'&&pcMode())return;
  if(snapDB)snapTx('readwrite',st=>{st.put(x);rm.forEach(r=>st.delete(r.at));}).catch(()=>{});
  else if(snapLS)snapLSWrite(a.slice());}
function snapTx(mode,fn){return new Promise((ok,no)=>{const t=snapDB.transaction('s',mode),r=fn(t.objectStore('s'));t.oncomplete=()=>ok(r&&r.result);t.onerror=t.onabort=()=>no(t.error);});}
function snapOpen(){return new Promise((ok,no)=>{if(!window.indexedDB)return no(new Error('no idb'));const r=indexedDB.open('rc-snap',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('s',{keyPath:'at'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);r.onblocked=()=>no(new Error('blocked'));});}
// 啟動時：打開 IndexedDB，把舊的 localStorage 版本搬過去
async function snapInit(){
  if(typeof pcMode==='function'&&pcMode()){snapWipe();return;}
  try{snapDB=await snapOpen();const old=await snapTx('readonly',st=>st.getAll());let leg=[];try{leg=JSON.parse(localStorage.getItem(SNKEY))||[];}catch(e){}
    const map=new Map();[].concat(old||[],leg,SNAPS||[]).forEach(x=>{if(x&&x.at&&typeof x.json==='string')map.set(x.at,x);});
    const a=[...map.values()].sort((p,q)=>p.at-q.at);snapTrim(a,SNCAP_IDB);
    await snapTx('readwrite',st=>{st.clear();a.forEach(x=>st.put(x));});
    try{localStorage.removeItem(SNKEY);}catch(e){}SNAPS=a;}
  catch(e){snapDB=null;snapLS=true;snapLSWrite(snaps().slice());}
  if(page==='roster'&&sub==='data')render();}
// 清除所有自動保留的版本（公用電腦模式、清除這台電腦上的資料）
function snapWipe(){SNAPS=[];try{localStorage.removeItem(SNKEY);}catch(e){}
  if(snapDB)snapTx('readwrite',st=>{st.clear();}).catch(()=>{});else if(window.indexedDB)try{indexedDB.deleteDatabase('rc-snap');}catch(e){}}
function restoreSnap(i){const a=snaps(),x=a[i];if(!x)return;if(!confirm('要回到 '+fmtTime(x.at)+'（'+x.label+'）的版本嗎？\n目前的資料會先自動保留一份，之後還可以再換回來。'))return;
  snapshot('回到舊版本之前');try{D=normalize(JSON.parse(x.json));}catch(e){toast('這個版本讀不出來');return;}undoStack=[];changed();$('title').value=D.title;paintSchool();render();toast('已回到 '+fmtTime(x.at)+' 的版本');}
function fmtTime(t){const d=new Date(t),p=n=>String(n).padStart(2,'0');return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes());}

// 讀學校原本的 Excel（在這台電腦的瀏覽器裡讀，不會上傳）
// 只用 SheetJS 官方 CDN 的 0.20.3（npm 上的 0.18.5 有已知漏洞 CVE-2023-30533、CVE-2024-22363，不再當備用）
const XLSX_SRC=[['https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT']];
const XLT={stu:'學生名單',tl:'任課老師名單',course:'課程一覽表',off:'不排課時段',lock:'手排鎖課'};
let XL=[];
async function needXLSX(){if(window.XLSX)return;for(const [s,i] of XLSX_SRC){try{await loadScript(s,i);if(window.XLSX)return;}catch(e){}}throw new Error('xlsx');}
function sheetType(rows){
  const top=rows.slice(0,6),has=re=>top.some(r=>r.some(c=>re.test(c)));
  if(has(/起始星期/)&&has(/首節/))return 'off';
  if(has(/^班級名稱$/)&&has(/^教師姓名$/)&&has(/^首節$/))return 'lock';   // 資料輸出
  if(rows.some(r=>r.some((c,j)=>c==='節次'&&j>=2&&/^\d{3,4}$/.test(r[j-2])&&/星期一/.test(r[j+1]||''))))return 'lock';   // 資料輸入
  if(has(/學生名單/)&&has(/節數/))return 'course';
  for(let i=0;i<rows.length;i++){const nums=rows[i].map((x,j)=>/^\d{3,4}$/.test(x)?j:-1).filter(j=>j>=0);
    if(nums.some((v,k)=>k>=2&&nums[k-1]===v-1&&nums[k-2]===v-2)){const nx=rows.slice(i+1,i+3).find(r=>r.some(Boolean));if(nx&&/^(國語?文?|國語文|英語?文?|英語文|數學|理化|自然|社會)$/.test(nx.find(Boolean)))return 'tl';}}
  if(has(/^(學生)?姓名$/)&&has(/班級/)&&!has(/科目/))return 'stu';
  return '';
}
async function readXls(inp){const fs=[...inp.files];inp.value='';if(!fs.length)return;$('busy').style.display='flex';
  try{await needXLSX();}catch(e){$('busy').style.display='none';toast('讀 Excel 的元件下載失敗，請確認有網路；或改用各頁的「貼上」');return;}
  XL=[];let skip=0;
  try{for(const f of fs){const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    wb.SheetNames.forEach((n,i)=>{const w=wb.Workbook&&wb.Workbook.Sheets&&wb.Workbook.Sheets[i];if(w&&w.Hidden){skip++;return;}
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:'',blankrows:false}).map(r=>r.map(c=>String(c).replace(/[\t\r\n]+/g,' ').trim()));
      const t=sheetType(rows),tsv=rows.map(r=>r.join('\t')).join('\n');if(!t){skip++;return;}
      // 先在副本上試一次，帶不出任何資料的工作表就不列出來
      const X=JSON.parse(JSON.stringify(D)),got=t==='tl'?importTeacherList(X,tsv).set:t==='stu'?(r=>r.add+r.upd)(importStudents(X,tsv)):t==='course'?(r=>r.added+r.updated)(importCourseTable(X,tsv)):t==='lock'?importLocks(X,tsv).n:(r=>r.cls+r.tea)(importOff(X,tsv,{}));
      if(!got){skip++;return;}
      XL.push({file:f.name,sheet:n,type:t,on:true,n:rows.length,tsv});});}}
  catch(e){toast('有檔案讀不出來：'+(e.message||e));}
  finally{$('busy').style.display='none';}
  XL.skip=skip;if(!XL.length)toast('這些檔案裡沒有認得的工作表（學生名單、任課老師名單、課程一覽表、不排課時段、手排鎖課）');render();}
function xlImport(){const on=XL.filter(x=>x.on);if(!on.length){toast('請先勾選要匯入的工作表');return;}
  if(!confirm('要匯入勾選的 '+on.length+' 張工作表嗎？\n匯入前會自動保留一份目前的資料，匯錯了可以回到舊版本。'))return;
  snapshot('匯入 Excel 之前');const order=['stu','tl','course','off','lock'],out=[];
  // 資料輸入和資料輸出是同一份鎖課，兩張都勾時只讀一張
  const lk=on.filter(x=>x.type==='lock');if(lk.length>1)lk.slice(1).forEach(x=>{x.on=false;});
  order.forEach(t=>on.filter(x=>x.type===t&&x.on).forEach(x=>{const nm='「'+x.sheet+'」';
    if(t==='lock'){const r=importLocks(D,x.tsv);out.push(nm+'：手排鎖課 '+r.n+' 節、'+r.cls+' 個班（之前的手排鎖課整份換成這一份）'+(r.newT.length?'；新增老師 '+r.newT.join('、'):''));}
    if(t==='stu'){const r=importStudents(D,x.tsv);out.push(nm+'：新增 '+r.add+' 位學生、更新 '+r.upd+' 位'+(r.cm?'，個管老師 '+r.cm+' 位':'')+(r.noCM.length?'；找不到的個管老師：'+r.noCM.join('、'):''));}
    if(t==='tl'){const r=importTeacherList(D,x.tsv);out.push(nm+'：'+r.classes+' 個班、'+r.set+' 格任課老師'+(r.changed?'（其中 '+r.changed+' 格換了老師）':'')+(r.newT.length?'，新增 '+r.newT.length+' 位老師':''));}
    if(t==='course'){const r=importCourseTable(D,x.tsv);out.push(nm+'：新增 '+r.added+' 門課、更新 '+r.updated+' 門，放進 '+r.members+' 人次'+(r.hours?'，基本鐘點 '+r.hours+' 位':'')+(r.miss.length?'；名冊找不到的學生：'+[...new Set(r.miss)].join('、'):''));}
    if(t==='off'){const r=importOff(D,x.tsv,{hard:hardVal('xl'),addTeachers:$('xlAdd')&&$('xlAdd').checked});out.push(nm+'：班級 '+r.cls+' 列、老師 '+r.tea+' 列，新增 '+r.cells+' 格（已經有的不會重複加）'+(r.skipT.length?'；不在名冊、略過的老師 '+r.skipT.length+' 位':''));}}));
  D=normalize(D);XL=[];changed();render();
  openDlg(`<h3>匯入完成</h3><ul class="plain">${out.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul><p class="note">如果匯錯了，到「名冊 › 匯入與新學期」最下面的「自動保留的版本」回到匯入之前。</p><div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="closeDlg()">知道了</button></div>`);offWarn();}

function pasteTL(){openDlg(`<h3>貼上任課老師名單</h3><p class="note">兩種格式都可以：</p><ol class="note"><li>教務處的<b>教師名單</b>：一列是班級（701、702…），下面每一列是一科（國語文、英語文、數學、理化）和各班的老師。七、八、九年級可以一起貼。</li><li>一列一筆：<b>班級、科目、老師</b>。</li></ol>
  <p class="note">名冊裡沒有的老師會自動新增；同一班同一科已經有老師的會換成新的。</p>
  <textarea id="pasteBox" placeholder="&#9;701&#9;702&#9;703&#10;國語文&#9;王老師&#9;李老師&#9;陳老師&#10;英語文&#9;…"></textarea>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="pasteTLOk()">帶入</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteTLOk(){const txt=$('pasteBox').value;if(!txt.trim())return;snapshot('貼上任課老師名單之前');const r=importTeacherList(D,txt);
  if(!r.set){toast('沒有讀到任課老師，請確認是從 Excel 複製（欄位之間是 Tab）');return;}
  changed();closeDlg();render();toast(r.classes+' 個班、'+r.set+' 格任課老師'+(r.changed?'，'+r.changed+' 格換了老師':'')+(r.newT.length?'，新增 '+r.newT.length+' 位老師':''));}
function pasteLocks(){openDlg(`<h3>貼上手排鎖課</h3><p class="note">已經手排好的鎖課可以帶進來，排課時會盡量沿用，配鎖課時優先照手排的老師。兩種都可以：</p><ol class="note"><li>「特教鎖課需求」的<b>資料輸入</b>：整張選取（Ctrl+A）複製貼上，格子裡填的是老師名字。</li><li><b>資料輸出</b>：班級名稱、科目名稱、星期、首節、末節、教師姓名。</li></ol>
  <p class="note">貼上後會整份換掉之前的手排鎖課。不想沿用時，到「匯入與新學期」按清除。</p>
  <textarea id="pasteBox" placeholder="班級名稱&#9;科目名稱&#9;星期&#9;首節&#9;末節&#9;教師姓名&#10;701&#9;數學&#9;1&#9;4&#9;4&#9;王老師"></textarea>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="pasteLocksOk()">帶入</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteLocksOk(){const txt=$('pasteBox').value;if(!txt.trim())return;const X=JSON.parse(JSON.stringify(D));if(!importLocks(X,txt).n){toast('沒有讀到鎖課：請確認貼的是資料輸入（格子裡是老師名字）或資料輸出');return;}
  snapshot('貼上手排鎖課之前');const r=importLocks(D,txt);changed();closeDlg();render();toast('手排鎖課 '+r.n+' 節、'+r.cls+' 個班'+(r.newT.length?'；新增老師 '+r.newT.length+' 位':''));}
function clearLocks(){if(!confirm('清除手排鎖課？之後排課和配鎖課就完全由系統決定。'))return;snapshot('清除手排鎖課之前');D.lockFix=[];changed();render();toast('已清除手排鎖課');}
function pruneTeachers(){const used=new Set(Object.values(D.classSubj).concat(D.groups.map(g=>g.teacher),D.students.map(s=>s.caseMgr)));
  const a=D.teachers.filter(t=>t.role!=='資源班'&&!used.has(t.id)&&!t.off.length&&!t.note);
  if(!a.length){toast('沒有可以移除的老師');return;}
  if(!confirm('這 '+a.length+' 位老師沒有任課、沒有開課、不是個管老師，也沒有不排課時段和備註：\n'+a.map(t=>t.name).join('、')+'\n\n要從名冊移除嗎？（會先自動保留一份）'))return;
  snapshot('移除沒用到的老師之前');const ids=new Set(a.map(t=>t.id));D.teachers=D.teachers.filter(t=>!ids.has(t.id));changed();render();toast('已移除 '+a.length+' 位');}

function startTerm(){const v=id=>$(id)&&$(id).checked,o={clearAssign:v('ntAssign'),clearGroups:v('ntGroups'),clearCS:v('ntCS'),clearClassOff:v('ntCOff'),clearTeaOff:v('ntTOff'),promote:v('ntUp'),title:$('ntTitle').value.trim()};
  const what=[o.promote&&'升年級（九年級學生移出名冊）',o.clearAssign&&'清空排課結果',o.clearGroups&&'清空所有課程',o.clearCS&&'清空任課老師',o.clearClassOff&&'清空班級不排課',o.clearTeaOff&&'清空所有老師的不排課'].filter(Boolean);
  if(!confirm('開始新學期：\n'+(what.length?what.map(x=>'・'+x).join('\n'):'只改學期名稱')+'\n\n目前的資料會先自動保留一份；也建議先按「下載備份檔」存一份在電腦裡。確定嗎？'))return;
  snapshot('開始新學期之前');const r=newTerm(D,o);D=normalize(D);undoStack=[];changed();$('title').value=D.title;paintSchool();render();
  toast('已開始新學期'+(o.promote?'：'+r.up+' 位學生升一個年級，'+r.grad+' 位畢業移出名冊':''));}

function renderData(){
  const need=new Set();M.G.forEach(g=>{if(g.need)g.cls.forEach(c=>need.add(c+'|'+g.subject));});
  const csN=[...need].filter(k=>D.classSubj[k]).length,res=D.teachers.filter(t=>t.role==='資源班'),cOff=Object.keys(D.offBy).filter(k=>(k[0]==='c'||k[0]==='k')&&D.offBy[k].length).length;
  const tOff=D.teachers.filter(t=>t.role!=='資源班'&&t.off.length).length,rOff=res.filter(t=>t.off.length).length,cm=D.students.filter(s=>s.caseMgr).length;
  const st=(ok,t)=>`<span class="${ok?'ok':'warn'}">${t}</span>`;
  const rows=[
    ['學生名冊',st(D.students.length,D.students.length+' 位'),'個管學生一覽表',`<button class="b sm" onclick="pasteStu()">貼上</button>`],
    ['個管老師',st(cm===D.students.length&&cm,cm+' / '+D.students.length+' 位已指定'),'個管學生一覽表',`<button class="b sm" onclick="go('roster','stu')">名冊</button>`],
    ['資源班老師與基本鐘點',st(res.length&&res.every(t=>t.hours),res.length+' 位，'+res.filter(t=>t.hours).length+' 位有基本鐘點'),'課程一覽表右側的鐘點表',`<button class="b sm" onclick="go('sched','groups')">老師開課</button>`],
    ['課程（分組、節數、學生）',st(D.groups.length,D.groups.length+' 門課'),'課程領域分組及節數一覽表',`<button class="b sm" onclick="pasteCourses()">貼上</button>`],
    ['各班任課老師',st(!need.size||csN===need.size,need.size?csN+' / '+need.size+' 格':'還沒有抽離課'),'特教鎖課需求 › 教師名單',`<button class="b sm" onclick="pasteTL()">貼上</button>`],
    ['班級不排課、不能鎖課',st(cOff,cOff+' 個班有設定'),'特教鎖課需求 › 班級不排課',`<button class="b sm" onclick="pasteOff()">貼上</button>`],
    ['任課老師不排課',st(tOff,tOff+' 位有設定'),'特教鎖課需求 › 教師不排課',`<button class="b sm" onclick="pasteOff()">貼上</button>`],
    ['手排鎖課（選填）',st(1,(D.lockFix||[]).length?D.lockFix.length+' 節，排課時盡量沿用':'沒有，系統自己配'),'特教鎖課需求 › 資料輸入或資料輸出',`<button class="b sm" onclick="pasteLocks()">貼上</button>${(D.lockFix||[]).length?`<button class="b sm" onclick="clearLocks()">清除</button>`:''}`],
    ['資源班老師個人不排課',st(rOff===res.length&&res.length,rOff+' / '+res.length+' 位有設定'),'各位老師自己點',`<button class="b sm" onclick="go('sched','off')">不排課時段</button>`],
    ['年級共同時段（社團等）',st(Object.keys(D.offBy).some(k=>k[0]==='g'&&D.offBy[k].length),Object.keys(D.offBy).filter(k=>k[0]==='g'&&D.offBy[k].length).map(k=>GRADE[k.slice(2)]).join('、')||'沒有設定'),'教學組',`<button class="b sm" onclick="offSel='g:7';go('sched','off')">不排課時段</button>`],
    ['鎖課方式與上限',st(1,D.settings.lockMode==='flex'?'彈性鎖課'+(D.settings.lockCap?'（'+esc(Object.keys(D.settings.lockCap).map(k=>k+D.settings.lockCap[k]).join(' '))+'）':''):'同一科同時上'),'和教學組確認',`<button class="b sm" onclick="go('roster','env')">規則</button>`]];
  let h=`<p class="guide">每學期照下面的順序，把學校本來就有的表格帶進來，就能自己排課，不需要找人幫忙：<b>①</b> 視需要按「開始新學期」<b>②</b> 上傳學校的 Excel（或在各列按「貼上」）<b>③</b> 補上資源班老師自己的不排課時段 <b>④</b> 到「排課」按一鍵排課。</p>
  <h3>上傳學校的 Excel</h3><p class="note">可以一次選好幾個檔案。系統會自己認出裡面的<b>學生名單、任課老師名單（教師名單）、課程一覽表、班級不排課、教師不排課、手排鎖課（資料輸入或資料輸出）</b>，其他工作表會略過。Google 試算表請先按「檔案 › 下載 › Microsoft Excel」。檔案只在這台電腦的瀏覽器裡讀，不會上傳到任何地方。</p>
  <div class="bar"><input type="file" id="xlsIn" accept=".xlsx,.xls,.xlsm,.csv,.ods" multiple style="display:none" onchange="readXls(this)"><button class="b pri" onclick="$('xlsIn').click()">選擇 Excel 檔</button></div>`;
  if(XL.length)h+=`<div class="xlbox"><table class="ed"><tr><th></th><th>檔案</th><th>工作表</th><th>認成</th><th>列數</th></tr>${XL.map((x,i)=>`<tr><td><input type="checkbox"${x.on?' checked':''} onchange="XL[${i}].on=this.checked"></td><td class="dim">${esc(x.file)}</td><td>${esc(x.sheet)}</td><td><b>${XLT[x.type]}</b></td><td class="dim">${x.n}</td></tr>`).join('')}</table>
    ${XL.skip?`<p class="note">另外有 ${XL.skip} 張工作表看不出是哪一種，已略過。</p>`:''}
    ${XL.some(x=>x.type==='off')?`${hardPick('xl')}<label class="note"><input type="checkbox" id="xlAdd"> 教師不排課裡名冊沒有的老師也新增（不勾就只帶入名冊裡有的老師）</label>`:''}
    <div class="bar"><button class="b pri" onclick="xlImport()">匯入勾選的工作表</button><button class="b" onclick="XL=[];render()">取消</button></div></div>`;
  h+=`<h3>資料清單</h3><div class="scroll"><table class="ed chklist"><tr><th>資料</th><th>目前</th><th>學校的哪一份表</th><th></th></tr>${rows.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="dim">${r[2]}</td><td class="nw">${r[3]}</td></tr>`).join('')}</table></div>
  <h3>開始新學期</h3><p class="note">勾選要清掉的部分，沒勾的會留著。學生、老師、教室、作息、個管老師、年級共同時段都會保留。</p>
  <div class="rules"><label>學期名稱 <input type="text" id="ntTitle" class="w12" value="${esc(D.title||'')}"></label>
    <label><input type="checkbox" id="ntAssign" checked> 清空排課結果（課程留著，重新排）</label>
    <label><input type="checkbox" id="ntGroups"> 清空所有課程（之後重新貼課程一覽表）</label>
    <label><input type="checkbox" id="ntCS"> 清空各班任課老師</label>
    <label><input type="checkbox" id="ntCOff"> 清空班級不排課、不能鎖課</label>
    <label><input type="checkbox" id="ntTOff"> 清空所有老師的不排課時段</label>
    <label><input type="checkbox" id="ntUp"> <b>新學年升年級</b>：七年級變八年級、八年級變九年級（701→801），九年級學生畢業移出名冊。班級號碼會變，所以課程、任課老師、班級不排課會一起清空</label></div>
  <div class="bar"><button class="b pri" onclick="startTerm()">開始新學期</button><button class="b" onclick="exportJson()">先下載備份檔</button></div>
  <h3>資料保存</h3><p class="note">${cloudState==='on'?'目前登入共用中，資料存在雲端，名單裡的老師都看得到同一份。':'目前資料只存在這台電腦的這個瀏覽器。換電腦或清除瀏覽器資料前，請先下載備份檔；想讓幾位老師共用同一份，可以設定學校自己的雲端。'}</p>
  <div class="bar"><button class="b" onclick="exportJson()">下載備份檔</button><button class="b" onclick="openShare(1)">共用與學校自己的雲端</button>${(()=>{const lb=+localStorage.getItem(LBKEY)||0;return `<span class="note" style="margin:0">${lb?'上次下載備份：'+fmtTime(lb):'還沒下載過備份檔'}</span>`;})()}</div>
  <h4>自動保留的版本</h4><p class="note">每天第一次修改，以及匯入、開始新學期、還原之前，都會在這台電腦自動留一份（最多 12 份）。改壞了可以回到之前的版本。</p>`;
  const a=snaps();h+=a.length?`<div class="scroll"><table class="ed"><tr><th>時間</th><th>說明</th><th>學生／課程</th><th></th></tr>${a.map((x,i)=>{let n='';try{const o=JSON.parse(x.json);n=(o.students||[]).length+' 位／'+(o.groups||[]).length+' 門';}catch(e){}return `<tr><td>${fmtTime(x.at)}</td><td>${esc(x.label)}</td><td class="dim">${n}</td><td><button class="b sm" onclick="restoreSnap(${i})">回到這個版本</button></td></tr>`;}).reverse().join('')}</table></div>`:'<p class="note">還沒有。</p>';
  $('page').innerHTML=h;
}

/* ───── 備份與還原（名冊、排課、段考考場、通知單一起） ───── */
function reloadExam(){const f=$('examFrame');if(f.getAttribute('src'))f.src='exam.html?embed';}
function backupObj(){const o=Object.assign({},D),g=k=>{try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}};
  o._exam=g(EXKEY);o._notice=g(NKEY);o._att=ATT;return o;}
function download(name,text){try{localStorage.setItem(LBKEY,String(Date.now()));}catch(e){}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
const bkDate=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate());};
function exportJson(){download('資源班管理系統_備份_'+bkDate()+'.json',JSON.stringify(backupObj(),null,1));}
// 加密備份：AES-GCM 256，金鑰由密碼經 PBKDF2-SHA256（31 萬次）產生；密碼忘了就打不開
const ENC_ITER=310000;
function b64(u){const a=new Uint8Array(u);let s='';for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode.apply(null,a.subarray(i,i+0x8000));return btoa(s);}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function encKey(pw,salt,iter){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encPack(text,pw){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await encKey(pw,salt,ENC_ITER);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(text));
  return {rcEnc:1,app:'資源班管理系統',alg:'AES-GCM-256/PBKDF2-SHA256',iter:ENC_ITER,salt:b64(salt),iv:b64(iv),data:b64(ct)};}
async function encOpen(o,pw){const it=+o.iter;if(!(it>=100000&&it<=5000000)||typeof o.salt!=='string'||typeof o.iv!=='string'||typeof o.data!=='string')throw new Error('format');
  const key=await encKey(pw,unb64(o.salt),it);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(o.iv)},key,unb64(o.data)));}
// 輸入密碼的小視窗；取消回傳 null
function askPw(title,twice){shareOpen=false;return new Promise(res=>{let done=false;const fin=v=>{if(!done){done=true;res(v);}};
  openDlg('<h3>'+esc(title)+'</h3>'+(twice?'<p class="note">請設一組至少 8 個字的密碼，並另外記下來。<b>密碼忘了，這個備份檔就打不開</b>，系統也沒辦法幫你找回。</p>':'<p class="note">請輸入下載這個備份檔時設的密碼。</p>')+
    '<div class="bar"><input type="password" id="pw1" autocomplete="'+(twice?'new-password':'current-password')+'" placeholder="密碼" style="flex:1;min-width:0"></div>'+
    (twice?'<div class="bar"><input type="password" id="pw2" autocomplete="new-password" placeholder="再輸入一次" style="flex:1;min-width:0"></div>':'')+
    '<div class="bar" style="margin:8px 0 0"><span class="grow"></span><button class="b pri" id="pwOk">確定</button><button class="b" onclick="closeDlg()">取消</button></div>',()=>fin(null));
  const ok=()=>{const a=$('pw1').value;if(!a)return;if(twice){if(a.length<8){toast('密碼至少要 8 個字');return;}if(a!==$('pw2').value){toast('兩次輸入的密碼不一樣');return;}}
    dlgDone=null;closeDlg();fin(a);};
  $('pwOk').onclick=ok;['pw1','pw2'].forEach(id=>{const el=$(id);if(el)el.onkeydown=e=>{if(e.key==='Enter')ok();};});setTimeout(()=>$('pw1').focus(),50);});}
async function exportEnc(){if(!(window.crypto&&crypto.subtle)){toast('這個瀏覽器不能加密（網址要是 https）');return;}
  const pw=await askPw('下載加密備份檔',true);if(!pw)return;
  try{const o=await encPack(JSON.stringify(backupObj()),pw);download('資源班管理系統_加密備份_'+bkDate()+'.json',JSON.stringify(o));toast('已下載加密備份檔，請記好密碼');}
  catch(e){toast('加密失敗：'+(e.message||e));}}
// 備份檔的格式檢查：型別、清單、數量上限、文字欄位是文字
const BK_MAX_BYTES=30*1024*1024;
function checkBackup(o){
  const err=[],isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),txt=(v,n)=>v==null||((typeof v==='string'||typeof v==='number')&&String(v).length<=n);
  if(!isObj(o))return {ok:false,err:['這不是備份檔']};
  if(!Array.isArray(o.students)||!Array.isArray(o.groups))return {ok:false,err:['這不是資源班管理系統的備份檔（沒有學生或課程清單）']};
  const LIM={students:5000,teachers:3000,groups:3000,rooms:300,periods:40,sets:1000,blocked:2000,lockFix:20000};
  for(const k in LIM){const v=o[k];if(v==null)continue;if(!Array.isArray(v)){err.push(k+' 應該是清單');continue;}
    if(v.length>LIM[k])err.push(k+' 筆數太多（'+v.length+'）');else if(k!=='blocked'&&v.some(x=>!isObj(x)))err.push(k+' 裡有格式不對的資料');}
  if(err.length)return {ok:false,err};
  const row=(list,name,f)=>{const i=list.findIndex(x=>!f(x));if(i>=0)err.push(name+'第 '+(i+1)+' 筆的格式不對');};
  row(o.students,'學生',s=>txt(s.id,80)&&txt(s.name,100)&&txt(s.cls,20)&&txt(s.seat,10)&&txt(s.note,2000)&&txt(s.caseMgr,80)&&(s.needs==null||Array.isArray(s.needs)));
  row(o.teachers||[],'老師',t=>txt(t.id,80)&&txt(t.name,100)&&txt(t.role,40)&&txt(t.note,2000)&&(t.off==null||Array.isArray(t.off)));
  row(o.groups,'課程',g=>txt(g.id,80)&&txt(g.name,200)&&txt(g.subject,100)&&txt(g.teacher,80)&&txt(g.room,80)&&txt(g.mode,20)&&(g.students==null||Array.isArray(g.students)));
  row(o.rooms||[],'教室',r=>txt(r.id,80)&&txt(r.name,100));
  row(o.periods||[],'作息',p=>txt(p.id,40)&&txt(p.name,40)&&txt(p.start,10)&&txt(p.end,10));
  if(!txt(o.title,200))err.push('學期名稱的格式不對');
  ['classSubj','assign','settings','offBy','tt'].forEach(k=>{if(o[k]!=null&&!isObj(o[k]))err.push(k+' 的格式不對');});
  if(o._att!=null){if(!isObj(o._att))err.push('點名紀錄的格式不對');
    else{let bad=false,n=0;
      for(const d in o._att){const day=o._att[d];if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!isObj(day)){bad=true;break;}
        for(const k in day){const g=day[k];if(!isObj(g)){bad=true;break;}
          for(const sid in g){n++;const r=g[sid];if(!isObj(r)||!txt(r.st,10)||!txt(r.tin,10)||!txt(r.tout,10)||!txt(r.note,500)){bad=true;break;}}
          if(bad)break;}
        if(bad)break;}
      if(bad)err.push('點名紀錄的格式不對');else if(n>500000)err.push('點名紀錄太多');}}
  if(o._exam!=null&&!(isObj(o._exam)&&Array.isArray(o._exam.students)))err.push('段考考場資料的格式不對');
  if(o._notice!=null&&!isObj(o._notice))err.push('通知單資料的格式不對');
  return {ok:!err.length,err:err.slice(0,6)};
}
function bkSum(o){return {t:String(o.title||'').trim()||'（沒有名稱）',s:(o.students||[]).length,te:(o.teachers||[]).length,g:(o.groups||[]).length,a:Object.keys(o._att||{}).length,e:!!o._exam};}
function importJson(inp){const f=inp.files[0];if(!f)return;inp.value='';
  if(f.size>BK_MAX_BYTES){toast('檔案太大（超過 30MB），不像是備份檔');return;}
  const rd=new FileReader();rd.onload=()=>{let o;try{o=JSON.parse(rd.result);}catch(e){toast('這不是備份檔');return;}restoreFrom(o);};rd.readAsText(f);}
async function restoreFrom(o){
  if(isRO()){toast('你是檢視權限，不能還原');return;}
  if(o&&o.rcEnc){const pw=await askPw('打開加密備份檔',false);if(!pw)return;
    try{o=JSON.parse(await encOpen(o,pw));}catch(e){toast('密碼不對，或檔案壞掉了');return;}}
  const v=checkBackup(o);if(!v.ok){toast('備份檔有問題，沒有還原：'+v.err.join('；'));return;}
  let ex0=null;try{ex0=JSON.parse(localStorage.getItem(EXKEY));}catch(e){}
  const a=bkSum(Object.assign({},D,{_att:ATT,_exam:ex0})),b=bkSum(o);
  if(!confirm('要用這個備份檔還原嗎？\n\n　　　　目前 → 備份檔\n學期名稱：'+a.t+' → '+b.t+'\n學生：'+a.s+' → '+b.s+' 位\n老師：'+a.te+' → '+b.te+' 位\n課程：'+a.g+' → '+b.g+' 門\n點名紀錄：'+a.a+' → '+b.a+' 天\n段考考場：'+(a.e?'有':'沒有')+' → '+(b.e?'有':'沒有')+
    '\n\n還原會取代目前的名冊、排課、段考考場與點名紀錄。還原前會先自動保留一份目前的資料。'))return;
  if(cloudState==='on'&&!confirm('你正在和其他老師共用雲端「'+((window.FIREBASE_CONFIG||{}).projectId||'')+'」。\n還原會取代「所有共用的老師」看到的名冊與排課，不只是這台電腦。\n\n真的要還原嗎？'))return;
  snapshot('從備份檔還原之前');
  const ex=o._exam,nt=o._notice,at=o._att;delete o._exam;delete o._notice;delete o._att;
  if(at){ATT=at;attSave();}
  try{if(ex)localStorage.setItem(EXKEY,JSON.stringify(ex));if(nt)localStorage.setItem(NKEY,JSON.stringify(nt));}catch(e){}
  D=normalize(o);undoStack=[];offSel='*';view='';changed();$('title').value=D.title;paintSchool();if($('dlg').open)closeDlg();reloadExam();render();toast('已還原');}
function resetAll(){if(isRO()){toast('你是檢視權限，不能清空');return;}
  if(cloudState==='on'&&!isAdmin()){toast('共用中只有主持人可以全部清空');return;}
  const t=String(D.title||'').trim(),pc=typeof pcMode==='function'&&pcMode();
  const w=prompt('全部清空會清掉目前的名冊、分組、排法、段考考場與點名紀錄'+(cloudState==='on'?'，共用中的其他老師也會一起被清掉':'')+'。\n'+
    '清空前會先自動保留一份，在「名冊 › 匯入與新學期 › 自動保留的版本」可以找回'+(pc?'（公用電腦模式只留到關掉分頁為止）':'')+'。\n\n'+
    '確定要清空，請輸入「清空」'+(t?'或學期名稱「'+t+'」':'')+'：','');
  if(w==null)return;if(w.trim()!=='清空'&&!(t&&w.trim()===t)){toast('輸入的字不對，沒有清空');return;}
  snapshot('全部清空之前');try{localStorage.removeItem(EXKEY);localStorage.removeItem(NKEY);}catch(e){}
  ATT={};attSave();D=emptyData();undoStack=[];offSel='*';view='';changed();$('title').value=D.title;paintSchool();closeDlg();reloadExam();go('home');}

/* 段考考場（另一個視窗框）改了名冊，或另一個分頁改了資料：這裡跟著更新 */
window.addEventListener('storage',e=>{
  if(e.key===KEY){const o=load();if(!o||JSON.stringify(o)===JSON.stringify(D))return;D=normalize(o);rebuild();cloudPush();if(page!=='exam')render();}
  else if(e.key===AKEY){try{ATT=JSON.parse(e.newValue)||{};}catch(x){}if(page==='checkin'||page==='home')render();}
  else if(e.key===EXKEY&&page!=='exam'&&(page==='home'||sub==='stu'))render();
});

/* ───── 全校課表：讀學校每班一頁的課程表 PDF（文字檔直接讀，掃描檔用文字辨識），得到各班各科老師 ───── */
// pdf.js 4.10.38（3.11.174 有 CVE-2024-4367：惡意 PDF 可以執行程式）。4 版只有 ES module，用 legacy 版支援較舊的瀏覽器；
// 先用 fetch 帶檢查碼（SRI）下載、核對無誤才載入，worker 也一樣。exam.html 用同一版。
const PDFJS_SRC='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/',PDFJS_SRI={
  'legacy/build/pdf.min.mjs':'sha384-z/XbAtvhBXJoK+yvYimnFuTCF6/2wTCDSIFD09/HtIfwFtvDKOMdAe5Z3wOChkmW',
  'legacy/build/pdf.worker.min.mjs':'sha384-vbNBYP03jHFPlgtK4qSXtazEmGfmpTWlSsfq9OiU20MroW/Q9TbaEXiM7PpeWg+6'};
const TESS_SRC='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',TESS_SRI='sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';
let TTJOB=null;const TTIMG={};   // 辨識時截下的統計區圖片，只留在這次開著的頁面，方便核對
async function sriBlob(f){const r=await fetch(PDFJS_SRC+f,{integrity:PDFJS_SRI[f],credentials:'omit'});if(!r.ok)throw new Error('pdf.js '+r.status);
  return URL.createObjectURL(new Blob([await r.text()],{type:'text/javascript'}));}
async function ttPdf(){if(window.pdfjsLib)return;
  const [lib,wk]=await Promise.all([sriBlob('legacy/build/pdf.min.mjs'),sriBlob('legacy/build/pdf.worker.min.mjs')]);
  const m=await import(lib);m.GlobalWorkerOptions.workerPort=new Worker(wk,{type:'module'});window.pdfjsLib=m;}
const PDF_OPT={cMapUrl:PDFJS_SRC+'cmaps/',cMapPacked:true,standardFontDataUrl:PDFJS_SRC+'standard_fonts/',isEvalSupported:false,enableXfa:false};
async function ttWorkers(){if(!window.Tesseract)await loadScript(TESS_SRC,TESS_SRI);
  if(!ttWorkers.zh){ttWorkers.zh=await Tesseract.createWorker('chi_tra');await ttWorkers.zh.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});}
  if(!ttWorkers.en){ttWorkers.en=await Tesseract.createWorker('eng');await ttWorkers.en.setParameters({tessedit_char_whitelist:'0123456789',tessedit_pageseg_mode:'7'});}}
function ttCrop(c,xa,xb,ya,yb,th){const W=c.width,H=c.height,d=document.createElement('canvas');d.width=Math.round((xb-xa)*W);d.height=Math.round((yb-ya)*H);const x=d.getContext('2d');
  x.drawImage(c,xa*W,ya*H,d.width,d.height,0,0,d.width,d.height);
  if(th){const im=x.getImageData(0,0,d.width,d.height),a=im.data;for(let i=0;i<a.length;i+=4){const g=(a[i]*0.3+a[i+1]*0.59+a[i+2]*0.11)<th?0:255;a[i]=a[i+1]=a[i+2]=g;}x.putImageData(im,0,0);}return d;}
function ttThumb(c){const w=Math.min(1100,c.width),d=document.createElement('canvas');d.width=w;d.height=Math.round(c.height*w/c.width);d.getContext('2d').drawImage(c,0,0,d.width,d.height);return d.toDataURL('image/jpeg',0.7);}
async function readTT(inp){const fs=[...inp.files];inp.value='';if(!fs.length||TTJOB)return;
  TTJOB={done:0,total:0,msg:'讀取 PDF…',pages:[]};render();
  try{await ttPdf();
    for(const f of fs){const pdf=await pdfjsLib.getDocument(Object.assign({data:new Uint8Array(await f.arrayBuffer())},PDF_OPT)).promise;
      TTJOB.total+=pdf.numPages;
      for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n),tc=await pg.getTextContent();
        const items=tc.items.filter(i=>i.str.trim()),src=f.name+' 第 '+n+' 頁';
        if(items.reduce((a,i)=>a+i.str.length,0)>80){   // 文字 PDF：依位置排成一行一行，從「總時數／編號」以下讀統計
          const rows=[];items.forEach(i=>{const y=Math.round(i.transform[5]/3);let r=rows.find(o=>Math.abs(o.y-y)<=1);if(!r)rows.push(r={y,it:[]});r.it.push(i);});
          const lines=rows.sort((a,b)=>b.y-a.y).map(r=>r.it.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' '));
          const all=lines.join('\n'),k=lines.findIndex(l=>/總時數|編\s*號/.test(l));
          const no=(all.match(/編\s*號[:：\s]*(\d{3,4})/)||all.match(/班\s*級[:：\s]*(\d{3,4})/)||[])[1]||'';
          TTJOB.pages.push({text:(k>=0?lines.slice(k):lines).join('\n'),cls:ttClassNo(no),src,page:TTJOB.pages.length});}
        else{   // 掃描檔：放大、轉黑白，辨識底下的統計和左下角的編號
          TTJOB.msg='第一次會下載文字辨識資料（約 20MB），請稍候…';render();await ttWorkers();
          const vp=pg.getViewport({scale:6}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
          const no=(await ttWorkers.en.recognize(ttCrop(c,0.17,0.30,0.765,0.788))).data.text;
          const box=ttCrop(c,0,1,0.79,0.895,150),txt=(await ttWorkers.zh.recognize(box)).data.text;
          TTJOB.pages.push({text:txt,cls:ttClassNo(no),src,page:TTJOB.pages.length,img:ttThumb(box)});c.width=c.height=0;}
        TTJOB.done++;TTJOB.msg='已讀 '+TTJOB.done+' 頁';render();}}
    const R=ttParseAll(D,TTJOB.pages,ttKnown(D));snapshot('讀入全校課表之前');let miss=0;
    R.forEach((o,i)=>{const cls=o.cls||('?'+(i+1));if(!o.cls)miss++;ttStore(D,cls,o.list,o.src);D.tt[cls].guessCls=o.guessCls?1:0;const img=TTJOB.pages[o.page]&&TTJOB.pages[o.page].img;if(img)TTIMG[cls]=img;});
    TTJOB=null;changed();render();toast('讀了 '+R.length+' 頁課表'+(miss?'；'+miss+' 頁認不出班級，請點進去填':'')+'。橘色是認不出的老師，請點班級核對');}
  catch(e){TTJOB=null;render();toast('課表讀不出來：'+(e.message||e));}}
const TT_MAIN=['國語文','英語文','數學','歷史','地理','公民與社會','生物','理化','地球科學','地科'];
const TT_COL=[['國語文','國文'],['英語文','英文'],['數學','數學'],['社會',['歷史','地理','公民與社會']],['自然',['生物','理化','地球科學','地科']]];
function ttCell(c,subs){const arr=[].concat(subs).flatMap(s=>(c.subj[s]||[]).slice(0,1).map(x=>({s,x})));
  if(!arr.length)return '<span class="dim">－</span>';
  return arr.map(({s,x})=>`<span class="${x[2]?'warn':''}" title="${esc(s+' '+x[1]+' 節'+(x[2]?'（認不出，請核對）':''))}">${esc(x[0])}</span>`).join('<br>');}
function renderTT(){const tt=D.tt||{},cls=Object.keys(tt).sort();
  const stuCls=[...new Set(D.students.map(s=>String(s.cls)).filter(c=>/^\d{3,4}$/.test(c)))].sort(),noTT=stuCls.filter(c=>!tt[c]);
  const unk=cls.reduce((a,c)=>a+Object.values(tt[c].subj).flat().filter(x=>x[2]).length,0);
  let h=`<p class="guide">學期初拿到的<b>全校課表 PDF</b>（每班一頁、下面有「科目、老師、節數」統計的那種）直接選進來，系統會讀出每一班每一科的老師。文字 PDF 一下就讀完；掃描成圖片的 PDF 會用文字辨識，大約一頁一秒，第一次要先下載辨識資料。檔案只在這台電腦的瀏覽器裡讀，不會上傳。</p>
  <div class="bar"><input type="file" id="ttIn" accept=".pdf" multiple style="display:none" onchange="readTT(this)"><button class="b pri" onclick="$('ttIn').click()"${TTJOB?' disabled':''}>選擇課表 PDF</button>
  ${cls.length?`<button class="b" onclick="ttApplyCS()">用課表更新任課老師</button><button class="b" onclick="ttClear()">清除課表</button>`:''}<span class="note" style="margin:0">七、八、九年級的檔案可以一次選，重讀同一班會蓋掉舊的。</span></div>`;
  if(TTJOB)h+=`<div class="chk"><b>${esc(TTJOB.msg)}</b>${TTJOB.total?`<span class="mid">${TTJOB.done} / ${TTJOB.total} 頁</span>`:''}</div>`;
  if(cls.length){
    h+=`<h3>各班老師 <span class="note" style="font-weight:normal">${cls.length} 個班${unk?`，<span class="warn">${unk} 個名字認不出來（橘色）</span>`:''}；點班級可以核對、修改</span></h3><div class="scroll"><table class="ed"><tr><th>班級</th>${TT_COL.map(x=>`<th>${x[0]}</th>`).join('')}<th>其他</th><th></th></tr>`+
      cls.map(c=>{const o=tt[c],other=Object.keys(o.subj).filter(s=>!TT_MAIN.includes(s)),u=Object.values(o.subj).flat().filter(x=>x[2]).length;
        return `<tr><td><button class="b sm${c[0]==='?'||o.guessCls?' warn':''}" data-c="${esc(c)}" onclick="ttEdit(this.dataset.c)">${esc(c)}</button></td>${TT_COL.map(x=>`<td>${ttCell(o,x[1]==='國文'||x[1]==='英文'||x[1]==='數學'?x[0]:x[1])}</td>`).join('')}<td class="dim">${other.length} 科${u?` <span class="warn">${u} 個待核對</span>`:''}</td><td class="dim">${esc(o.src||'')}</td></tr>`;}).join('')+`</table></div>`;
    // 勾稽
    const diff=[];const tn=id=>{const t=D.teachers.find(x=>x.id===id);return t?t.name:'';};
    cls.forEach(c=>[['國語文','國文'],['英語文','英文'],['數學','數學'],['理化','理化']].forEach(([a,b])=>{const k=c+'|'+canonSubj(D,b),x=(tt[c].subj[a]||[])[0];if(!x||x[2])return;const cur=D.classSubj[k]?tn(D.classSubj[k]):'';if(cur!==x[0])diff.push({c,s:b,cur,tt:x[0]});}));
    h+=`<h3>和學生名單對照</h3><ul class="plain">
      <li>${noTT.length?`<span class="warn">名冊裡有學生、但課表沒有的班級：${noTT.map(esc).join('、')}</span>`:`<span class="ok">名冊裡學生的 ${stuCls.length} 個班，課表都有。</span>`}</li>
      <li>${diff.length?`<span class="warn">任課老師（國英數理）和課表不一樣的有 ${diff.length} 格：</span>${diff.slice(0,30).map(d=>esc(d.c+d.s+'：任課老師 '+(d.cur||'沒填')+'，課表 '+d.tt)).join('；')}${diff.length>30?'…':''}。按上面「用課表更新任課老師」可以一次改成課表的。`:'<span class="ok">任課老師（國英數理）和課表一致。</span>'}</li></ul>`;
    const S=D.students.slice().sort((a,b)=>String(a.cls).localeCompare(String(b.cls))||String(a.seat||'').localeCompare(String(b.seat||''),undefined,{numeric:true}));
    h+=`<div class="scroll"><table class="ed"><tr><th>班級座號</th><th>姓名</th>${TT_COL.map(x=>`<th>${x[0]}</th>`).join('')}</tr>`+S.map(s=>{const o=tt[String(s.cls)];
      return `<tr><td>${esc(s.cls)}${s.seat?'-'+esc(String(s.seat).padStart(2,'0')):''}</td><td>${esc(s.name)}</td>${o?TT_COL.map(x=>`<td>${ttCell(o,x[1]==='國文'||x[1]==='英文'||x[1]==='數學'?x[0]:x[1])}</td>`).join(''):`<td colspan="${TT_COL.length}" class="warn">課表沒有這一班</td>`}</tr>`;}).join('')+`</table></div>
      <p class="note">段考頁的「交卷名單」會用這裡的老師當批閱教師（作文、國文找國語文老師，社會找歷史、地理、公民老師，自然找生物、理化、地科老師）。</p>`;}
  $('page').innerHTML=h;}
function ttEdit(c){const o=D.tt[c];if(!o)return;const rows=Object.keys(o.subj).flatMap(s=>o.subj[s].map(x=>[s,x[0],x[1],x[2]]));
  openDlg(`<h3>核對課表：${esc(c)}</h3>${TTIMG[c]?`<img src="${TTIMG[c]}" style="width:100%;border:1px solid var(--line);border-radius:6px" alt="課表統計">`:`<p class="note">${esc(o.src||'')}</p>`}
  <div class="bar"><label class="note" style="margin:0">班級 <input type="text" id="ttCls" class="w5" value="${esc(c[0]==='?'?'':c)}" placeholder="例：701"></label><span class="note" style="margin:0">橘色是認不出來的，對照上面的圖改成正確的名字；整列清空就會刪掉。</span></div>
  <div class="scroll" style="max-height:50vh"><table class="ed" id="ttRows"><tr><th>科目</th><th>老師</th><th>節數</th></tr>${rows.concat([['','','']]).map(r=>`<tr><td><input type="text" class="w8" value="${esc(r[0])}"></td><td><input type="text" class="w5${r[3]?' warn':''}" value="${esc(r[1])}"></td><td><input type="text" class="w3" value="${esc(r[2])}"></td></tr>`).join('')}</table></div>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="ttEditOk(${jsArg(c)})">儲存</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function ttEditOk(c){const nc=$('ttCls').value.trim()||c,list=[];
  [...$('ttRows').querySelectorAll('tr')].slice(1).forEach(tr=>{const v=[...tr.querySelectorAll('input')].map(i=>i.value.trim());if(v[0]&&v[1])list.push({sj:v[0],t:v[1],n:+v[2]||1,unk:false});});
  snapshot('修改課表之前');const src=D.tt[c].src;delete D.tt[c];if(TTIMG[c]){TTIMG[nc]=TTIMG[c];}ttStore(D,nc,list,src);changed();closeDlg();render();toast('已儲存 '+nc+' 的課表');}
function ttApplyCS(){const tt=D.tt||{};let n=0;const list=[];
  Object.keys(tt).filter(c=>/^\d{3,4}$/.test(c)).forEach(c=>[['國語文','國文'],['英語文','英文'],['數學','數學'],['理化','理化']].forEach(([a,b])=>{const x=(tt[c].subj[a]||[])[0];if(!x||x[2])return;list.push([c,b,x[0]]);}));
  if(!list.length){toast('課表裡沒有可以用的國英數理老師');return;}
  if(!confirm('用課表裡的國英數理老師更新各班任課老師（'+list.length+' 格）？認不出來的名字不會用。'))return;
  snapshot('用課表更新任課老師之前');list.forEach(([c,b,name])=>{const t=findTeacher(D,name,'普通班'),k=c+'|'+canonSubj(D,b);if(D.classSubj[k]!==t.id){D.classSubj[k]=t.id;n++;}});
  D=normalize(D);changed();render();toast('更新了 '+n+' 格任課老師');}
function ttClear(){if(!confirm('清除讀進來的全校課表？'))return;snapshot('清除全校課表之前');D.tt={};changed();render();}

/* ───── 啟動 ───── */
D=normalize(load()||emptyData());rebuild();$('title').value=D.title;paintSchool();if(!load())localSave();snapInit();
(function(){const a=location.hash.slice(1).split('/');go(a[0]||'home',a[1]);})();
cloudInit();

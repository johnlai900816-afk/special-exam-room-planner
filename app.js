/* 資源班管理系統｜畫面：總覽、名冊、排課；段考考場是 exam.html（讀同一份名冊） */
'use strict';
const KEY='resource-class-v1',EXKEY='special-exam-room-v1',NKEY='exam-notice-v1';
let D,M,ST,ROOM,undoStack=[],page='home',sub='',offSel='*',view='',outMode='teacher',selL=-1,dlgDone=null;
const lastSub={};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(){try{const s=localStorage.getItem(KEY);if(s)return JSON.parse(s);}catch(e){}return null;}
function localSave(){try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e){}}
function save(){if(isRO()){clearTimeout(save.h);save.h=setTimeout(roRevert,0);return;}localSave();cloudPush();}
function toast(m){const t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>{t.style.display='none';},2600);}
function setST(S){ST=S;if(!ST.rfix)ST.rfix=new Int16Array(M.L.length).fill(-1);M.lroom=ST.rfix;}
function rebuild(){M=compile(D);setST(toState(M,D));ROOM=assignRooms(M,ST.slot);selL=-1;}
function changed(){rebuild();D.assign=fromState(M,ST);save();}                                  // 名冊、分組、不排時段有改
function commit(){D.assign=fromState(M,ST);ROOM=assignRooms(M,ST.slot);save();render();}        // 排法有改
function pushUndo(){undoStack.push(JSON.stringify(D.assign));if(undoStack.length>40)undoStack.shift();}
function tOpts(sel,first){const rk=t=>t.role==='資源班'?0:1,list=D.teachers.slice().sort((a,b)=>first==='res'?rk(a)-rk(b):rk(b)-rk(a));
  return '<option value="">（未指定）</option>'+list.map(t=>`<option value="${esc(t.id)}"${t.id===sel?' selected':''}>${esc(t.name)}${t.role==='普通班'||t.role==='資源班'?'':'・'+esc(t.role)}</option>`).join('');}
function stuLabel(s){return s.cls+' '+s.name;}
function sortStu(a,b){return String(a.cls).localeCompare(String(b.cls))||(+a.seat||0)-(+b.seat||0)||String(a.name).localeCompare(String(b.name));}
function paintSchool(){$('school').textContent=D.title||'';}
function colorOf(g){const i=M.rts.indexOf(g.t);return i<0?6:i%6;}

/* ───── 頁面切換 ───── */
const PAGES={
  home:{t:'總覽'},
  roster:{t:'名冊',subs:[['stu','學生'],['tea','老師'],['env','教室與作息']]},
  sched:{t:'排課',subs:[['groups','分組'],['teach','任課老師'],['off','不排課時段'],['board','排課'],['out','課表輸出']]},
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
  const ex=page==='exam',f=$('examFrame');$('page').hidden=ex;f.hidden=!ex;
  if(ex){if(!f.getAttribute('src'))f.src='exam.html?embed';return;}
  ({home:renderHome,'roster/stu':renderStu,'roster/tea':renderTea,'roster/env':renderEnv,'sched/groups':renderGroups,'sched/off':renderOff,'sched/teach':renderTeach,'sched/board':renderBoard,'sched/out':renderOut,'checkin/now':renderCheckin,'checkin/log':renderAttLog,'checkin/cards':renderCards})[page+(sub?'/'+sub:'')]();
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
    $('page').innerHTML=h+`<div class="start"><b>從這三步開始</b><ol><li>到「名冊」貼上學生名單、加入老師。</li><li>到「排課」把學生分組，點選每位老師不排課的時段。</li><li>按「一鍵排課」，再到「課表輸出」印出課表與鎖課表。</li></ol>
      <div class="bar" style="margin:0"><button class="b pri" onclick="go('roster','stu')">前往名冊</button><button class="b" onclick="loadDemo()">先載入範例資料看看</button></div></div>`;return;}
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
  if(warns)todo.push(['','有 '+warns+' 則分組提醒（缺老師、缺任課老師或時段不夠）','分組',"go('sched','groups')"]);
  if(total&&placed<total)todo.push(['','還有 '+(total-placed)+' 節沒排進課表','排課',"go('sched','board')"]);
  if(noG)todo.push(['',noG+' 位學生還沒分到任何一組','名冊',"go('roster','stu')"]);
  if(noCM)todo.push(['',noCM+' 位學生還沒指定個管老師','名冊',"go('roster','stu')"]);
  if(E&&E.total>E.placed)todo.push(['','段考還有 '+(E.total-E.placed)+' 個科次沒排進考場','段考考場',"go('exam')"]);
  if(cloudState==='local'||cloudState==='out'||cloudState==='part')todo.push(['info','資料只存在這台電腦，記得備份'+(cloudState==='out'?'或登入共用':''),cloudState==='out'?'共用':'備份','openShare()']);
  h+=todo.length?'<ul class="todo">'+todo.map(([c,t,w,f])=>`<li class="${c}" onclick="${f}"><span>${esc(t)}</span><em>${w} ›</em></li>`).join('')+'</ul>':'<div class="allok">目前沒有待處理的事項。</div>';
  const res=D.teachers.filter(t=>t.role==='資源班');
  if(res.length){const ld=t=>{const ti=M.tIdx[t.id];return M.L.filter((x,l)=>M.G[x.g].t===ti&&ST.slot[l]>=0).length;},mx=Math.max(1,...res.map(ld));
    h+=`<h3>資源班老師</h3>`+res.map(t=>{const n=ld(t),ci=M.rts.indexOf(M.tIdx[t.id]),cs=D.students.filter(s=>s.caseMgr===t.id).length;
      return `<div class="tload"><span>${esc(t.name)}</span><div class="bar2"><i class="b${ci<0?6:ci%6}" style="width:${Math.round(n/mx*100)}%"></i></div><small>每週 ${n} 節・個案 ${cs} 人</small></div>`;}).join('');}
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
  let h=`<p class="guide">除了資源班老師，也要把<b>學生原班的任課老師</b>加進來，排課才知道哪些時段會卡到他們。資源班老師會自動成為段考的監考老師。</p>
  <div class="bar"><button class="b pri" onclick="addTeacher()">新增老師</button><span class="stat">共 <b>${D.teachers.length}</b> 位</span></div>
  <datalist id="roleList">${ROLES.map(r=>`<option value="${r}">`).join('')}</datalist><p class="note">身分可以自己打（例：專輔、巡迴）；只有「資源班」會被當成資源班老師與監考老師。</p>
  <div class="scroll"><table class="ed"><tr><th>姓名</th><th>身分</th><th>不排課</th><th>個案</th><th>相關的組別與班級</th><th>備註</th><th></th></tr>`;
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
  let h=`<h3>教室</h3><div class="bar">`+D.rooms.map((r,i)=>`<span class="stu"><input type="text" class="w5" style="border:0;background:transparent" value="${esc(r.name)}" onchange="D.rooms[${i}].name=this.value;changed()"><button class="x" onclick="delRoom(${i})">✕</button></span>`).join('')+
  `<button class="b sm" onclick="D.rooms.push({id:uid('r'),name:'新教室'});changed();render()">新增教室</button></div>
  <h3>作息</h3><p class="note">勾「外加」的時段（早自習、午休、第 8 節）只會排外加課；抽離課只排在一般節次。</p>
  <div class="scroll"><table class="ed"><tr><th>名稱</th><th>開始</th><th>結束</th><th>外加時段</th><th></th></tr>`;
  D.periods.forEach((p,i)=>{h+=`<tr><td><input type="text" class="w5" value="${esc(p.name)}" onchange="setPer(${i},'name',this.value)"></td>
    <td><input type="time" value="${esc(p.start)}" onchange="setPer(${i},'start',this.value)"></td><td><input type="time" value="${esc(p.end)}" onchange="setPer(${i},'end',this.value)"></td>
    <td><input type="checkbox"${p.extra?' checked':''} onchange="setPer(${i},'extra',this.checked)"></td><td class="nw"><button class="b sm" title="往上移" onclick="movePer(${i})"${i?'':' disabled'}>↑</button><button class="x" onclick="delPer(${i})">✕</button></td></tr>`;});
  h+=`</table></div><div class="bar"><button class="b sm" onclick="D.periods.push({id:uid('p'),name:'新節次',start:'16:05',end:'16:50',extra:true});changed();render()">新增節次</button></div>
  <h3>排課規則</h3><p class="note">每一條都可以依學校的做法開關或改數字，改完回排課頁就會照新的規則檢查衝堂。</p>
  <div class="rules">${[['regClash','同一位任課老師，同一節不能被兩個班同時鎖課（也包含資源班老師自己兼原班任課）',true],['classClash','同一個班，同一節不能被要求上兩科',true],['roomCheck','同一節的組數不能超過教室數，指定的教室不能重複',true]].map(([k,t])=>`<label><input type="checkbox"${D.settings[k]!==false?' checked':''} onchange="D.settings.${k}=this.checked;changed()"> ${t}</label>`).join('')}
    ${[['maxDay','同一組一天最多排',1,'節（設成 2 就允許一天兩節或連堂）'],['tRun','資源班老師最多連續上',3,'節'],['sDay','學生一天最多被抽離',3,'節']].map(([k,a,d,b])=>`<label>${a} <input type="number" min="1" max="9" class="w2" value="${D.settings[k]>0?D.settings[k]:d}" onchange="D.settings.${k}=+this.value;changed()"> ${b}</label>`).join('')}
    <label>上課超過 <input type="number" min="0" max="60" class="w2" value="${D.settings.grace>=0?D.settings.grace:5}" onchange="D.settings.grace=+this.value;save()"> 分鐘才到算遲到（簽到退用）</label></div>`;
  $('page').innerHTML=h;
}
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
function setTea(i,k,v){D.teachers[i][k]=String(v).trim();changed();if(k==='role')render();}
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
function pasteStu(){openDlg(`<h3>從 Excel 貼上名單</h3><p class="note">在 Excel 選取「班級、座號、姓名」三欄後複製，貼到下面。每行一位；班級座號相同的會更新姓名，不會重複新增。</p>
  <textarea id="pasteBox" placeholder="701&#9;03&#9;王小明&#10;701&#9;10&#9;陳小華"></textarea>
  <div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="pasteStuOk()">加入名冊</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteStuOk(){let add=0,upd=0,skip=0;
  $('pasteBox').value.split(/\r?\n/).forEach(line=>{const a=line.trim().split(/[\t,，\s]+/).filter(Boolean);if(!a.length)return;
    if(a.length<2||!/^\d/.test(a[0])){skip++;return;}
    const cls=a[0],seat=a.length>=3?a[1]:'',name=a.length>=3?a[2]:a[1];
    const old=D.students.find(s=>s.cls===cls&&((seat&&s.seat&&+s.seat===+seat)||s.name===name));
    if(old){old.name=name;if(seat)old.seat=seat;upd++;}else{D.students.push({id:uid('s'),cls,seat,name,caseMgr:'',note:''});add++;}});
  changed();closeDlg();render();toast('新增 '+add+' 人，更新 '+upd+' 人'+(skip?'，略過 '+skip+' 行（看起來不是學生資料）':''));}

/* ───── 排課｜分組 ───── */
function renderGroups(){
  const subj=[...new Set(D.groups.map(g=>g.subject).concat(['國文','數學','英文']))],byId={};D.students.forEach(s=>{byId[s.id]=s;});
  let h=`<p class="guide">一組就是一堂資源班的課。<b>抽離</b>課會用到原班上同一科的時間，所以要指定每個班的任課老師，他們不排課的時段會一起算進去；<b>外加</b>課只排在早自習這類時段，不影響原班。</p>
  <div class="bar"><button class="b pri" onclick="addGroup()">新增一組</button><button class="b" onclick="pasteGroups()">貼上分組表</button><span class="stat">共 <b>${D.groups.length}</b> 組、每週 <b>${M.L.length}</b> 節</span></div>
  <datalist id="subjList">${subj.map(s=>`<option value="${esc(s)}">`).join('')}</datalist><div class="cards">`;
  D.groups.forEach((g,i)=>{const c=M.G[i];
    h+=`<div class="gc${g.on===false?' off':''}"><div class="hd"><input type="text" class="nm" value="${esc(g.name)}" placeholder="組名" onchange="setGrp(${i},'name',this.value)">
      <label class="note" style="margin:0;white-space:nowrap"><input type="checkbox"${g.on!==false?' checked':''} onchange="setGrp(${i},'on',this.checked)"> 要排</label><button class="x" title="刪除這一組" onclick="delGroup(${i})">✕</button></div>
    <div class="f"><span>科目</span><input type="text" list="subjList" value="${esc(g.subject)}" onchange="setGrp(${i},'subject',this.value)">
      <span>每週</span><input type="number" min="0" max="15" value="${g.per}" onchange="setGrp(${i},'per',+this.value)">
      <span>老師</span><select onchange="setGrp(${i},'teacher',this.value)">${tOpts(g.teacher,'res')}</select>
      <span>型態</span><select onchange="setGrp(${i},'mode',this.value)">${MODES.map(m=>`<option${m===g.mode?' selected':''}>${m}</option>`).join('')}</select>
      <span>教室</span><select onchange="setGrp(${i},'room',this.value)"><option value="">自動安排</option>${D.rooms.map(r=>`<option value="${esc(r.id)}"${r.id===g.room?' selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
    <div class="sec">學生（${g.students.length} 人）</div><div>`+
      g.students.map(id=>byId[id]).filter(Boolean).sort(sortStu).map(s=>`<span class="stu">${esc(stuLabel(s))}<button class="x" data-id="${esc(s.id)}" onclick="togGS(${i},this.dataset.id);render()">✕</button></span>`).join('')+
      `<button class="b sm" onclick="pickStu(${i})">選學生</button></div>`;
    if(c.pull&&c.cls.length){h+=`<div class="sec">原班的${esc(g.subject)}任課老師</div>`+c.cls.map(cl=>`<div class="cs2"><span>${esc(cl)}</span><select data-k="${esc(cl+'|'+g.subject)}" onchange="setCS(this)">${tOpts(D.classSubj[cl+'|'+g.subject],'reg')}</select></div>`).join('');}
    h+=g.on===false?'':c.warn.length?`<div class="st warn">${c.warn.map(w=>'<div>'+esc(w)+'</div>').join('')}</div>`:`<div class="st">可以排的時段有 ${c.alist.length} 格，要排 ${c.per} 節</div>`;
    h+='</div>';});
  $('page').innerHTML=h+'</div>';
}
function setGrp(i,k,v){D.groups[i][k]=typeof v==='string'?v.trim():v;D=normalize(D);changed();render();}
function addGroup(){D.groups.push({id:uid('g'),name:'新的一組',subject:'國文',teacher:'',per:3,students:[],mode:'抽離',room:'',on:true});changed();render();$('main').scrollTo(0,1e6);}
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
  Object.keys(D.offBy).filter(k=>(k[0]==='c'||k[0]==='s')&&(D.offBy[k].length||k===offSel)).sort().forEach(k=>{
    if(k[0]==='c')it.push({k,name:k.slice(2)+' 班',grp:'班級與個人'});else{const s=D.students.find(x=>x.id===k.slice(2));if(s)it.push({k,name:stuLabel(s),grp:'班級與個人'});}});
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
      <select onchange="if(this.value){offSel=this.value;render()}"><option value="">＋ 選一位學生…</option>${D.students.slice().sort(sortStu).map(s=>`<option value="s:${esc(s.id)}">${esc(stuLabel(s))}</option>`).join('')}</select>`,
    '資源班老師':`<button class="add" onclick="addTeacherHere('資源班')">＋ 新增資源班老師</button>`,'其他老師':`<button class="add" onclick="addTeacherHere('普通班')">＋ 新增原班任課老師</button>`};
  let h=`<p class="guide">不排課的時段分成幾層，排課時會<b>全部疊在一起</b>避開：全校 → 年級（各年級社團時間不同就分開點）→ 學生群組（例：技藝班）→ 班級或個人 → 老師。點格子切換，點<b>星期</b>或<b>節次</b>可以整排切換。</p>
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
  let h=`<p class="guide">抽離課要和原班同一科同時上，所以要知道<b>每個班這一科是哪位老師</b>，他不排課的時段才會被算進去。直接打老師的名字就好：名冊裡沒有的會自動新增，之後再到「不排課時段」點他的時間。</p>`;
  if(!cls.length){$('page').innerHTML=h+`<div class="probs">還沒有抽離課的組別。請先到「分組」建立組別、放進學生，這裡就會列出需要填的班級與科目。</div>`;return;}
  h+=`<div class="bar"><span class="stat">已填 <b>${done}</b> / ${tot} 格</span></div><datalist id="tnames">${D.teachers.filter(t=>t.role!=='資源班').map(t=>`<option value="${esc(t.name)}">`).join('')}</datalist>
  <div class="scroll"><table class="ed"><tr><th>班級</th>${subs.map(s=>`<th>${esc(s)}</th>`).join('')}</tr>`+
  cls.map(c=>`<tr><td><b>${esc(c)}</b></td>`+subs.map(sj=>need[c][sj]?`<td><input type="text" class="w5${D.classSubj[c+'|'+sj]?'':' miss'}" list="tnames" data-k="${esc(c+'|'+sj)}" value="${esc((D.teachers.find(t=>t.id===D.classSubj[c+'|'+sj])||{}).name||'')}" placeholder="老師姓名" onchange="setCSName(this)"></td>`:'<td class="dim">不需要</td>').join('')+'</tr>').join('')+`</table></div>`;
  $('page').innerHTML=h;
}
function setCSName(el){const k=el.dataset.k,name=el.value.trim();
  if(!name){delete D.classSubj[k];changed();render();return;}
  let t=D.teachers.find(x=>x.name===name);if(!t){t={id:uid('t'),name,role:'普通班',off:[],note:''};D.teachers.push(t);toast('已把 '+name+' 加進老師名冊');}
  D.classSubj[k]=t.id;changed();
  const all=[...document.querySelectorAll('#page input[data-k]')],i=all.indexOf(el);render();const nx=document.querySelectorAll('#page input[data-k]')[i+1];if(nx)nx.focus();}

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
  let h=`<p class="guide">按<b>一鍵排課</b>，系統會避開所有人的不排課時段，並確認老師、學生、教室都不撞。排完可以直接拖曳調整（或點一下組別、再點要放的格子）；動過的會<b>固定</b>住，再按一次排課時不會被移走。</p>
  <div class="bar"><button class="b pri big" onclick="runSolve(false)">${gv?'排'+gname:'一鍵排課'}</button><button class="b" onclick="runSolve(true)">${gv?gname+'重排':'全部重排'}</button><button class="b" onclick="undo()">復原</button><button class="b" onclick="unpinAll()">解除全部固定</button><button class="b danger" onclick="clearAll()">清空排法</button>
    <span class="stat">已排 <b>${placed}</b> / ${total} 節</span><span class="stat${out.length?' bad':''}">問題 <b>${out.length}</b></span><span class="grow"></span>
    <select onchange="view=this.value;selL=-1;render()"><option value="">全部年級</option>${[...new Set(M.G.flatMap(g=>g.grades))].filter(g=>GRADE[g]).sort().map(g=>`<option value="g:${g}"${view==='g:'+g?' selected':''}>只看、只排${GRADE[g]}</option>`).join('')}${D.teachers.map(t=>`<option value="${esc(t.id)}"${t.id===view?' selected':''}>只看 ${esc(t.name)}</option>`).join('')}</select></div>`;
  if(!total)h+=`<div class="probs">還沒有要排的組，請先到「分組」建立。</div>`;
  else if(!out.length&&!warns.length&&placed===total)h+=`<div class="probs ok">全部排好了，沒有衝突。</div>`;
  else if(out.length||warns.length)h+=`<div class="probs">`+warns.map(w=>`<div>${esc(w)}</div>`).join('')+[...msg].map(([m,e])=>`<div class="err${e.k==='un'?'':' go'}" data-l="${e.l}" onclick="pickL(+this.dataset.l)">${esc(m)}${e.n>1?'（'+e.n+' 節）':''}</div>`).join('')+`</div>`;
  if(total)h+=`<div class="chk"><b>衝堂檢查</b>`+CK.map(([k,n])=>`<span class="${cnt[k]?'bad':'ok'}">${n} ${cnt[k]||0}</span>`).join('')+`<small>每次調整都會重新檢查；點上面的紅字會跳到那一節</small></div>`;
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
  if(!M.L.length){toast('還沒有要排的組，請先到「分組」建立');return;}
  const part=view.slice(0,2)==='g:';if(all&&ST.pin.some((x,l)=>x&&(!part||shownL(l)))&&!confirm('重排會連已經固定的也一起重排，確定嗎？'))return;
  pushUndo();$('busy').style.display='flex';
  setTimeout(()=>{try{if(all)ST.pin.forEach((x,l)=>{if(!part||shownL(l))ST.pin[l]=0;});D.settings.seed=(D.settings.seed||1)+1;const R=solve(M,ST,{seed:D.settings.seed,only:part?shownL:null});setST({slot:R.slot,pin:R.pin,rfix:ST.rfix});selL=-1;commit();
      const n=part?M.L.filter((x,l)=>shownL(l)).length:M.L.length;const o2=[];evaluate(M,ST.slot,o2);const v=o2.filter(o=>!part||shownL(o.l)).length;toast(v?'排好了，但還有 '+v+' 個問題排不開，請看上方說明':'排好了：'+(part?GRADE[+view.slice(2)]+' ':'')+n+' 節全部排入，沒有衝突');}
    finally{$('busy').style.display='none';}},40);
}
function undo(){if(!undoStack.length){toast('沒有可以復原的動作');return;}D.assign=JSON.parse(undoStack.pop());setST(toState(M,D));selL=-1;commit();}
function unpinAll(){pushUndo();ST.pin.fill(0);commit();}
function clearAll(){if(!confirm('確定清空目前的排法？（可以按「復原」救回來）'))return;pushUndo();ST.slot.fill(-1);ST.pin.fill(0);ST.rfix.fill(-1);selL=-1;commit();}

/* ───── 排課｜課表輸出 ───── */
function slotsText(list){const by={};list.forEach(s=>{const d=Math.floor(s/M.NP);(by[d]=by[d]||[]).push(M.P[s%M.NP].name);});
  return Object.keys(by).sort().map(d=>'週'+DAYS[d]+' '+by[d].join('、')).join('；');}
function renderOut(){
  const modes=[['teacher','資源班老師課表'],['lock','給教務處的鎖課表'],['homeroom','給導師的班級抽離表'],['card','學生個人課表'],['student','學生抽離一覽'],['group','組別總表']];
  const placed=[...ST.slot].filter(s=>s>=0).length;
  let h=`<p class="guide">排好之後，在這裡印出或複製各種表。<b>鎖課表</b>是給教務處的：列出每個班哪幾節必須排哪一科，原班才會和資源班同時上同一科。</p>
  <div class="bar">`+modes.map(([k,n])=>`<button class="b${outMode===k?' pri':''}" onclick="outMode='${k}';render()">${n}</button>`).join('')+`<span class="grow"></span><button class="b" onclick="copyOut()">複製</button><button class="b" onclick="window.print()">列印</button></div>`;
  if(!placed){$('page').innerHTML=h+`<div class="probs">還沒有排法，請先到「排課」按一鍵排課。</div>`;return;}
  const T=esc(D.title||'資源班');let b='';
  if(outMode==='teacher'){
    M.rts.forEach(t=>{const at={};M.L.forEach((x,l)=>{const g=M.G[x.g];if(g.t===t&&ST.slot[l]>=0)at[ST.slot[l]]=l;});
      b+=`<div class="pg"><h2>${T}｜${esc(M.T[t].name)}課表（每週 ${Object.keys(at).length} 節）</h2><table class="out"><tr><th style="width:92px">節次</th>${DAYS.map(d=>`<th>週${d}</th>`).join('')}</tr>`+
        D.periods.map((p,pi)=>`<tr><td class="c">${esc(p.name)}<br><small>${esc(p.start)}～${esc(p.end)}</small></td>`+DAYS.map((d,di)=>{const l=at[di*M.NP+pi];if(l==null)return '<td></td>';const g=M.G[M.L[l].g];
          return `<td class="c"><b>${esc(g.name)}</b><br><small>${esc(ROOM[l]>=0?D.rooms[ROOM[l]].name:'')}　${g.stu.length} 人</small></td>`;}).join('')+'</tr>').join('')+'</table></div>';});
  }else if(outMode==='lock'){
    b=`<div class="pg"><h2>${T}｜資源班抽離課鎖課表</h2><table class="out"><tr><th>班級</th><th>科目</th><th>任課老師</th><th>請排這一科的節次</th><th>節數</th><th>資源班組別</th></tr>`+
      lockTable(M,ST.slot).map(r=>`<tr><td class="c">${esc(r.cls)}</td><td class="c">${esc(r.subject)}</td><td>${esc(r.teacher)}</td><td>${esc(slotsText(r.slots))}</td><td class="c">${r.slots.length}</td><td>${esc(r.groups.join('、'))}</td></tr>`).join('')+
      `</table><p class="note">外加課不占原班時間，沒有列在這張表。</p></div>`;
  }else if(outMode==='homeroom'||outMode==='card'){
    const of={};M.L.forEach((x,l)=>{const s=ST.slot[l],g=M.G[x.g];if(s<0)return;g.stu.forEach(i=>{(of[i]=of[i]||{})[s]={g,l};});});
    const list=D.students.map((s,i)=>({s,i})).filter(o=>of[o.i]).sort((a,b2)=>sortStu(a.s,b2.s));
    const cell=o=>o?`<b>${esc(o.g.subject)}</b><br><small>${esc(o.g.name)}${ROOM[o.l]>=0?'・'+esc(D.rooms[ROOM[o.l]].name):''}</small>`:'';
    if(outMode==='card')b='<div class="cardsheet2">'+list.map(({s,i})=>`<div class="tcard"><h2>${esc(s.cls)} 班 ${esc(s.seat)} 號　${esc(s.name)}｜資源班課表</h2><table class="out"><tr><th style="width:70px">節次</th>${DAYS.map(d=>`<th>週${d}</th>`).join('')}</tr>`+
      D.periods.map((p,pi)=>DAYS.some((d,di)=>of[i][di*M.NP+pi])?`<tr><td class="c">${esc(p.name)}<br><small>${esc(p.start)}</small></td>`+DAYS.map((d,di)=>`<td class="c">${cell(of[i][di*M.NP+pi])}</td>`).join('')+'</tr>':'').join('')+`</table><p class="note">表上的節次請到資源班上課，其餘時間在原班。${esc(D.title||'')}</p></div>`).join('')+'</div>';
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

/* ───── 備份與還原（名冊、排課、段考考場、通知單一起） ───── */
function reloadExam(){const f=$('examFrame');if(f.getAttribute('src'))f.src='exam.html?embed';}
function exportJson(){const o=Object.assign({},D),g=k=>{try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}};
  o._exam=g(EXKEY);o._notice=g(NKEY);o._att=ATT;
  const a=document.createElement('a'),d=new Date(),p=n=>String(n).padStart(2,'0');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(o,null,1)],{type:'application/json'}));a.download='資源班管理系統_備份_'+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'.json';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
function importJson(inp){const f=inp.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{inp.value='';let o;try{o=JSON.parse(rd.result);}catch(e){toast('這不是備份檔');return;}
    if(!o||!Array.isArray(o.students)||!Array.isArray(o.groups)){toast('這不是資源班管理系統的備份檔');return;}
    if(isRO()){toast('你是檢視權限，不能還原');return;}
    if(!confirm('還原後會取代目前的名冊、排課、段考考場與點名紀錄，確定嗎？'))return;
    const ex=o._exam,nt=o._notice,at=o._att;delete o._exam;delete o._notice;delete o._att;if(at&&typeof at==='object'){ATT=at;attSave();}
    try{if(ex)localStorage.setItem(EXKEY,JSON.stringify(ex));if(nt)localStorage.setItem(NKEY,JSON.stringify(nt));}catch(e){}
    D=normalize(o);undoStack=[];offSel='*';view='';changed();$('title').value=D.title;paintSchool();if($('dlg').open)closeDlg();reloadExam();render();toast('已還原');};
  rd.readAsText(f);}
function resetAll(){if(isRO()){toast('你是檢視權限，不能清空');return;}
  if(!confirm('確定全部清空？\n目前的名冊、分組、排法、段考考場與點名紀錄都會被清掉'+(cloudState==='on'?'，共用中的其他老師也會一起被清掉':'')+'。'))return;
  try{localStorage.removeItem(EXKEY);localStorage.removeItem(NKEY);}catch(e){}
  ATT={};attSave();D=emptyData();undoStack=[];offSel='*';view='';changed();$('title').value=D.title;paintSchool();closeDlg();reloadExam();go('home');}

/* 段考考場（另一個視窗框）改了名冊，或另一個分頁改了資料：這裡跟著更新 */
window.addEventListener('storage',e=>{
  if(e.key===KEY){const o=load();if(!o||JSON.stringify(o)===JSON.stringify(D))return;D=normalize(o);rebuild();cloudPush();if(page!=='exam')render();}
  else if(e.key===AKEY){try{ATT=JSON.parse(e.newValue)||{};}catch(x){}if(page==='checkin'||page==='home')render();}
  else if(e.key===EXKEY&&page!=='exam'&&(page==='home'||sub==='stu'))render();
});

/* ───── 啟動 ───── */
D=normalize(load()||emptyData());rebuild();$('title').value=D.title;paintSchool();if(!load())localSave();
(function(){const a=location.hash.slice(1).split('/');go(a[0]||'home',a[1]);})();
cloudInit();

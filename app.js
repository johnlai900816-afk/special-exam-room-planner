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
/* 提示：顯示時間照字數（大約 10 個字 1 秒，至少 4 秒），滑鼠停在上面會暫停，可以按 ✕ 關掉。
   o.act＋o.fn：多一個動作按鈕（.toast-act），例如刪除後的「復原」；o.ms 指定顯示多久 */
function toast(m,o){o=o||{};const t=$('toast'),ms=o.ms||Math.max(4000,String(m).length*100),hide=()=>{clearTimeout(toast.h);t.style.display='none';};
  t.setAttribute('role','status');t.innerHTML=`<span>${esc(m)}</span>${o.act?`<button type="button" class="toast-act">${esc(o.act)}</button>`:''}<button type="button" class="toast-x" aria-label="關閉">✕</button>`;
  const arm=()=>{clearTimeout(toast.h);toast.h=setTimeout(hide,ms);};t.onmouseenter=()=>clearTimeout(toast.h);t.onmouseleave=arm;
  t.querySelector('.toast-x').onclick=hide;if(o.act)t.querySelector('.toast-act').onclick=()=>{hide();o.fn();};t.style.display='block';arm();}
// 結果很長（找不到的名字、衝突清單）時用對話框，不要塞在提示裡
function listDlg(title,lead,groups){openDlg(`<h3>${esc(title)}</h3>${lead?`<p class="note">${esc(lead)}</p>`:''}`+groups.filter(g=>g&&g.items&&g.items.length).map(g=>`<h4>${esc(g.h)}</h4>${g.note?`<p class="note">${esc(g.note)}</p>`:''}<ul class="plain">${g.items.map(x=>'<li>'+(g.raw?x:esc(x))+'</li>').join('')}</ul>`).join('')+
  `<div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="closeDlg()">知道了</button></div>`);}
// 刪除之後 8 秒內可以按「復原」：用刪除前的整份資料蓋回來
function undoToast(label,before){toast('已刪除 '+label,{act:'復原',ms:8000,fn:()=>{D=normalize(JSON.parse(before));undoStack=[];changed();render();toast('已復原 '+label);}});}
function busyOn(t){const b=$('busy');b.textContent=t;b.style.display='flex';}
function busyOff(){$('busy').style.display='none';}
function setST(S){ST=S;if(!ST.rfix)ST.rfix=new Int16Array(M.L.length).fill(-1);M.lroom=ST.rfix;}
function rebuild(){M=compile(D);setST(toState(M,D));ROOM=assignRooms(M,ST.slot);selL=-1;}
function changed(){rebuild();D.assign=fromState(M,ST);save();}                                  // 名冊、分組、不排時段有改
function commit(){if(onDraftST())D.sched.draft.a=packAssign(fromState(M,ST));else D.assign=fromState(M,ST);ROOM=assignRooms(M,ST.slot);save();render();}        // 排法有改
function pushUndo(){undoStack.push(JSON.stringify({a:D.assign,d:(D.sched&&D.sched.draft)||null,m:D.groups.map(g=>[g.id,g.students])}));if(undoStack.length>40)undoStack.shift();}
function tOpts(sel,first){const rk=t=>t.role==='資源班'?0:1,list=D.teachers.slice().sort((a,b)=>first==='res'?rk(a)-rk(b):rk(b)-rk(a));
  return '<option value="">（未指定）</option>'+list.map(t=>`<option value="${esc(t.id)}"${t.id===sel?' selected':''}>${esc(t.name)}${t.role==='普通班'||t.role==='資源班'?'':'・'+esc(t.role)}</option>`).join('');}
function stuLabel(s){return s.cls+' '+s.name;}
function sortStu(a,b){return String(a.cls).localeCompare(String(b.cls))||(+a.seat||0)-(+b.seat||0)||String(a.name).localeCompare(String(b.name));}
function paintSchool(){$('school').textContent=D.title||'';}
function colorOf(g){const i=M.rts.indexOf(g.t);return i<0?6:i%6;}

/* ───── 頁面切換 ───── */
const PAGES={
  home:{t:'總覽'},
  roster:{t:'名冊',subs:[['stu','學生'],['tea','老師'],['env','教室與作息'],['tt','全校課表'],['data','學期初匯入'],['backup','資料與備份']]},
  // 照實際做的順序排：先開課、填任課老師、點不排課，再編學生、排課、輸出
  sched:{t:'排課',subs:[['groups','① 老師開課'],['teach','② 任課老師'],['off','③ 不排課時段'],['need','④ 學生編組'],['board','⑤ 排課表'],['out','⑥ 課表輸出']]},
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
  if(P.render){P.render();return;}   // 外掛頁（例：IEP 會議）自己畫
  syncST();   // 排課頁有試排草稿時看的是草稿，其他頁是正式課表
  ({home:renderHome,'roster/stu':renderStu,'roster/tea':renderTea,'roster/env':renderEnv,'roster/tt':renderTT,'roster/data':renderData,'roster/backup':renderBackup,'sched/groups':renderGroups,'sched/need':renderNeed,'sched/off':renderOff,'sched/teach':renderTeach,'sched/board':renderBoard,'sched/out':renderOut,'checkin/now':renderCheckin,'checkin/log':renderAttLog,'checkin/cards':renderCards})[page+(sub?'/'+sub:'')]();
  draftBanner();
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
    $('page').innerHTML=h+`<div class="start"><b>從這三步開始</b><ol><li>到「名冊」貼上學生名單、加入老師。</li><li>到「排課」填每位老師的基本鐘點、替他開課，填好各班原班的<b>任課老師</b>，再勾選每位學生要上的科目，並點選不排課的時段。</li><li>按「一鍵排課」，再到「課表輸出」印出課表與鎖課表。</li></ol>
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
  if(pn)todo.push(['',pnText(),'學生編組',"go('sched','need')"]);
  if(noG)todo.push(['',noG+' 位學生還沒分到任何一組','學生編組',"go('sched','need')"]);
  const due=dueList();if(due.length)todo.push(['',due.length+' 位學生的 IEP、檢討日或鑑定有效期限在本月到期','名冊',"stuMine='';stuDue=1;go('roster','stu')"]);
  if(noCM)todo.push(['',noCM+' 位學生還沒指定個管老師','名冊',"go('roster','stu')"]);
  if(E&&E.total>E.placed)todo.push(['','段考還有 '+(E.total-E.placed)+' 個科次沒排進考場','段考考場',"go('exam')"]);
  if(cloudState==='local'||cloudState==='out'||cloudState==='part'){const lb=+localStorage.getItem(LBKEY)||0,dd=lb?Math.floor((Date.now()-lb)/864e5):-1;
    if(dd<0||dd>=14)todo.push(['info','資料只存在這台電腦，'+(dd<0?'還沒下載過備份檔':'上次下載備份是 '+dd+' 天前')+(cloudState==='out'?'，或登入共用':''),cloudState==='out'?'共用':'備份','openShare()']);}
  // 待辦是按鈕，鍵盤（Tab、Enter）和螢幕報讀都用得到
  h+=todo.length?'<ul class="todo">'+todo.map(([c,t,w,f])=>`<li class="${c}"><button type="button" class="todo-b" style="display:flex;flex:1;gap:10px;align-items:baseline;border:0;background:none;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer" onclick="${f}"><span>${esc(t)}</span><em>${w} ›</em></button></li>`).join('')+'</ul>':'<div class="allok">目前沒有待處理的事項。</div>';
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
  const E=examInfo(),sv=(E&&E.sv)||{},res=D.teachers.filter(t=>t.role==='資源班'),dueIds=new Set(dueList().map(s=>s.id));
  // 篩選：只看某位個管老師的個案、還沒指定個管的、本月到期的
  const show=s=>(!stuMine||(stuMine==='-'?!s.caseMgr:s.caseMgr===stuMine))&&(!stuDue||dueIds.has(s.id));
  const rows=D.students.map((s,i)=>({s,i})).filter(o=>show(o.s)),pv=stuPriv?'':' hidden';
  let h=`<p class="guide">整個系統共用這一份名冊：排課、段考考場、通知單都讀這裡，只要維護一次。考評服務在「段考考場」設定，這裡會同步顯示。</p>
  <div class="bar"><button class="b pri" onclick="addStu()">新增學生</button><button class="b" onclick="pasteStu()">從 Excel 貼上名單</button><button class="b" onclick="D.students.sort(sortStu);changed();render()">依班級座號排序</button><button class="b" onclick="cmOpen()">建議個管分配</button>
    <select aria-label="篩選學生" onchange="stuMine=this.value;render()"><option value="">全部學生</option>${res.map(t=>`<option value="${esc(t.id)}"${stuMine===t.id?' selected':''}>只看我的個案：${esc(t.name)}</option>`).join('')}<option value="-"${stuMine==='-'?' selected':''}>還沒指定個管老師</option></select>
    ${stuDue?`<button class="b warn" onclick="stuDue=0;render()">只顯示本月到期 ✕</button>`:''}
    <label class="note" style="margin:0"><input type="checkbox"${stuPriv?' checked':''} onchange="stuPriv=this.checked;render()"> 顯示私密欄位</label>
    <span class="stat">共 <b>${D.students.length}</b> 人${rows.length<D.students.length?`，顯示 ${rows.length} 人`:''}</span></div>
  <div class="bar"><span class="note" style="margin:0">勾選的 <b>${stuChk.size}</b> 位學生</span><select id="bulkCM" aria-label="要指定的個管老師">${cmOpts('')}</select><button class="b sm" onclick="bulkCM()"${stuChk.size?'':' disabled'}>一起指定個管老師</button>${stuChk.size?`<button class="b sm" onclick="stuChk.clear();render()">取消勾選</button>`:''}</div>
  <style>@media print{.priv{display:none!important}}</style>
  <div class="scroll"><table class="ed"><tr><th><input type="checkbox" aria-label="全選" ${rows.length&&rows.every(o=>stuChk.has(o.s.id))?'checked':''} onchange="stuChkAll(this.checked)"></th><th>班級</th><th>座號</th><th>姓名</th><th>個管老師</th><th>所屬組別</th><th>考評服務</th><th title="簽到時會顯示給學生看">公開提醒</th>
    <th class="priv"${pv}>個管私密備註</th><th class="priv"${pv}>IEP 會議日期</th><th class="priv"${pv}>下次檢討日</th><th class="priv"${pv}>鑑定有效期限</th><th></th></tr>`;
  rows.forEach(({s,i})=>{h+=`<tr><td><input type="checkbox" aria-label="勾選 ${esc(s.name)}" data-id="${esc(s.id)}"${stuChk.has(s.id)?' checked':''} onchange="stuChkOne(this.dataset.id,this.checked)"></td><td><input type="text" class="w3" value="${esc(s.cls)}" onchange="setStu(${i},'cls',this.value)"></td>
    <td><input type="text" class="w2" value="${esc(s.seat)}" onchange="setStu(${i},'seat',this.value)"></td>
    <td><input type="text" class="w5" value="${esc(s.name)}" onchange="setStu(${i},'name',this.value)"></td>
    <td><select aria-label="${esc(s.name)} 的個管老師" onchange="setStu(${i},'caseMgr',this.value)">${cmOpts(s.caseMgr)}</select></td>
    <td class="dim">${esc((gOf[s.id]||[]).join('、'))||'尚未分組'}</td>
    <td>${(sv[s.id]||[]).map(x=>`<span class="tagv">${x}</span>`).join('')}</td>
    <td><input type="text" class="w8" value="${esc(s.note)}" placeholder="例：要帶課本" onchange="setStu(${i},'note',this.value)"></td>
    <td class="priv"${pv}><input type="text" class="w8" value="${esc(s.privNote||'')}" onchange="setStu(${i},'privNote',this.value)"></td>
    ${DUEF.map(([k])=>`<td class="priv${dueIds.has(s.id)&&String(s[k]||'').slice(0,7)===today().slice(0,7)?' warn':''}"${pv}><input type="date" value="${esc(s[k]||'')}" onchange="setStu(${i},'${k}',this.value)"></td>`).join('')}
    <td class="nw"><button class="b sm" onclick="stuCard(${i})">檢視</button><button class="x" title="刪除" aria-label="刪除 ${esc(s.name)}" onclick="delStu(${i})">✕</button></td></tr>`;});
  $('page').innerHTML=h+'</table></div>'+(stuPriv?'':'<p class="note">「公開提醒」會在簽到時顯示給學生看；不想讓學生看到的，勾「顯示私密欄位」寫在「個管私密備註」（不會出現在簽到畫面，也不會印出來）。</p>');
}
let stuMine='',stuDue=0,stuPriv=false;const stuChk=new Set();
// 私密日期欄位：只在名冊（勾「顯示私密欄位」）和學生檢視裡看得到，不印、不出現在簽到畫面
const DUEF=[['iepDate','IEP 會議'],['reviewDate','下次檢討'],['certExp','鑑定有效期限']];
function dueList(){const m=today().slice(0,7);return D.students.filter(s=>DUEF.some(([k])=>String(s[k]||'').slice(0,7)===m));}
function pnText(){const p=needList(D);return new Set(p.map(x=>x.id)).size+' 位學生的 '+p.length+' 個科目還沒編組';}
// 個管老師下拉：資源班老師在前面，其他老師收在「其他」
function cmOpts(sel){const r=D.teachers.filter(t=>t.role==='資源班'),o=D.teachers.filter(t=>t.role!=='資源班'),op=t=>`<option value="${esc(t.id)}"${t.id===sel?' selected':''}>${esc(t.name)}</option>`;
  return '<option value="">（未指定）</option>'+r.map(op).join('')+(o.length?`<optgroup label="其他">${o.map(op).join('')}</optgroup>`:'');}
function stuChkOne(id,on){if(on)stuChk.add(id);else stuChk.delete(id);render();}
function stuChkAll(on){document.querySelectorAll('#page td input[type=checkbox][data-id]').forEach(el=>{if(on)stuChk.add(el.dataset.id);else stuChk.delete(el.dataset.id);});render();}
function bulkCM(){const v=$('bulkCM').value,t=D.teachers.find(x=>x.id===v),n=D.students.filter(s=>stuChk.has(s.id)).length;if(!n)return;
  if(!confirm('把勾選的 '+n+' 位學生的個管老師都改成「'+(t?t.name:'未指定')+'」？'))return;
  D.students.forEach(s=>{if(stuChk.has(s.id))s.caseMgr=v;});stuChk.clear();changed();render();toast('已指定 '+n+' 位學生的個管老師');}
function renderTea(){
  const use={};D.groups.forEach(g=>{if(g.teacher)(use[g.teacher]=use[g.teacher]||[]).push(g.name);});
  M.G.forEach(g=>g.locks.forEach(k=>{if(k.t>=0){const id=D.teachers[k.t].id;(use[id]=use[id]||[]).push(k.cls+g.subject);}}));
  for(const k in D.classSubj){const id=D.classSubj[k];(use[id]=use[id]||[]).push(k.replace('|',''));}
  let h=`<p class="guide">除了資源班老師，也要把<b>學生原班的任課老師</b>加進來，排課才知道哪些時段會卡到他們。資源班老師會自動成為段考的監考老師。</p>
  <div class="bar"><button class="b pri" onclick="addTeacher()">新增老師</button><button class="b" onclick="pasteTL()">貼上任課老師名單</button><button class="b" onclick="go('roster','data')">上傳學校的 Excel</button><button class="b" onclick="pruneTeachers()">移除沒用到的任課老師</button><span class="stat">共 <b>${D.teachers.length}</b> 位</span></div>
  <datalist id="roleList">${ROLES.map(r=>`<option value="${r}">`).join('')}</datalist><p class="note">身分可以自己打（例：專輔、巡迴）；只有「資源班」會被當成資源班老師與監考老師。</p>
  <div class="scroll"><table class="ed"><tr><th>姓名</th><th>身分</th><th>不排課</th><th>個案</th><th>開的課、任課班級</th><th>偏好教室</th><th>備註</th><th></th></tr>`;
  D.teachers.forEach((t,i)=>{h+=`<tr><td><input type="text" class="w5" value="${esc(t.name)}" onchange="setTea(${i},'name',this.value)"></td>
    <td><input type="text" class="w3" list="roleList" value="${esc(t.role)}" onchange="setTea(${i},'role',this.value||'普通班')"></td>
    <td><button class="b sm" onclick="offSel='t:'+D.teachers[${i}].id;go('sched','off')">${t.off.length?t.off.length+' 格':'設定'}</button></td>
    <td class="dim">${D.students.filter(s=>s.caseMgr===t.id).length||''}</td>
    <td class="dim">${esc([...new Set(use[t.id]||[])].join('、'))}</td>
    <td>${t.role==='資源班'?prefCell(i):''}</td>
    <td><input type="text" class="w8" value="${esc(t.note)}" onchange="setTea(${i},'note',this.value)"></td>
    <td><button class="x" title="刪除" aria-label="刪除 ${esc(t.name)}" onclick="delTeacher(${i})">✕</button></td></tr>`;});
  $('page').innerHTML=h+'</table></div>';
}
function renderEnv(){
  const nMain=D.rooms.filter(r=>!r.spare).length,nSp=D.rooms.length-nMain;
  let h=`<h3>教室</h3><p class="note">教室名稱可以直接改。勾「備用」的教室平常不排：同一節最多排 <b>${nMain}</b> 組（平常用的教室數）${nSp?`，真的排不下才會用到備用的 ${nSp} 間，最多 <b>${D.rooms.length}</b> 組`:''}。排課時會照這個上限，不會在同一節塞進比教室還多的課。</p>
  <div class="bar">`+D.rooms.map((r,i)=>`<span class="stu${r.spare?' dim':''}"><input type="text" class="w5" style="border:0;background:transparent" value="${esc(r.name)}" onchange="D.rooms[${i}].name=this.value;changed()"><label class="note" style="margin:0 4px" title="平常不排，排不下才用"><input type="checkbox"${r.spare?' checked':''} onchange="D.rooms[${i}].spare=this.checked;changed();render()"> 備用</label><button class="x" onclick="delRoom(${i})">✕</button></span>`).join('')+
  `<button class="b sm" onclick="D.rooms.push({id:uid('r'),name:'新教室'});changed();render()">新增教室</button></div>${D.rooms.length?'':'<p class="note warn">還沒有教室：排課時不會限制同一節的組數。請至少新增一間。</p>'}${prefBox()}
  <h3>作息</h3><p class="note">勾「外加」的時段（早自習、午休、第 8 節）只會排外加課；抽離課只排在一般節次。中間隔著午休的兩節（例如第 4、5 節），請在前一節勾「與下一節不相連」，連續上課和連堂才不會把它們算在一起。</p>
  <div class="scroll"><table class="ed"><tr><th>名稱</th><th>開始</th><th>結束</th><th>外加時段</th><th>與下一節不相連</th><th></th></tr>`;
  D.periods.forEach((p,i)=>{h+=`<tr><td><input type="text" class="w5" value="${esc(p.name)}" onchange="setPer(${i},'name',this.value)"></td>
    <td><input type="time" value="${esc(p.start)}" onchange="setPer(${i},'start',this.value)"></td><td><input type="time" value="${esc(p.end)}" onchange="setPer(${i},'end',this.value)"></td>
    <td><input type="checkbox"${p.extra?' checked':''} onchange="setPer(${i},'extra',this.checked)"></td><td>${i<D.periods.length-1?`<input type="checkbox"${p.breakAfter?' checked':''} onchange="setPer(${i},'breakAfter',this.checked||undefined)">`:''}</td><td class="nw"><button class="b sm" title="往上移" onclick="movePer(${i})"${i?'':' disabled'}>↑</button><button class="x" title="刪除" aria-label="刪除 ${esc(p.name)}" onclick="delPer(${i})">✕</button></td></tr>`;});
  h+=`</table></div><div class="bar"><button class="b sm" onclick="D.periods.push({id:uid('p'),name:'新節次',start:'16:05',end:'16:50',extra:true});changed();render()">新增節次</button></div>
  <h3>排課規則</h3><p class="note">每一條都可以依學校的做法開關或改數字，改完回排課頁就會照新的規則檢查衝堂。</p>
  <div class="rules">${[['regClash','同一位任課老師，同一節不能被兩個班同時鎖課（也包含資源班老師自己兼原班任課）',true],['classClash','同一個班，同一節不能被要求上兩科',true],['roomCheck','同一節的組數不能超過教室數，指定的教室不能重複',true]].map(([k,t])=>`<label><input type="checkbox"${D.settings[k]!==false?' checked':''} onchange="D.settings.${k}=this.checked;changed()"> ${t}</label>`).join('')}
    ${[['maxDay','同一組一天排的節數盡量不超過',1,'節（設成 2 就允許一天兩節或連堂）'],['tRun','資源班老師連續上課盡量不超過',3,'節'],['sDay','學生一天被抽離盡量不超過',3,'節']].map(([k,a,d,b])=>`<label>${a} <input type="number" min="1" max="9" class="w2" value="${D.settings[k]>0?D.settings[k]:d}" onchange="D.settings.${k}=+this.value;changed()"> ${b}</label>`).join('')}
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
    ${s.privNote||DUEF.some(([k])=>s[k])?`<h4>私密（不會印出、不會出現在簽到畫面）</h4><p>${[s.privNote?esc(s.privNote):''].concat(DUEF.filter(([k])=>s[k]).map(([k,n])=>esc(n+'：'+s[k]))).filter(Boolean).join('<br>')}</p>`:''}
    <div class="bar" style="margin:14px 0 0"><button class="b" data-id="${esc(s.id)}" onclick="offSel='s:'+this.dataset.id;closeDlg();go('sched','off')">個人不排課時段${(D.offBy['s:'+s.id]||[]).length?'（'+D.offBy['s:'+s.id].length+' 格）':''}</button><span class="grow"></span><button class="b" onclick="closeDlg()">關閉</button></div>`);}
function setStu(i,k,v){D.students[i][k]=String(v).trim();changed();}
function addStu(){D.students.push({id:uid('s'),cls:'',seat:'',name:'',caseMgr:'',note:''});changed();render();$('main').scrollTo(0,1e6);}
function delStu(i){const s=D.students[i];if(!s||!confirm('確定刪除 '+stuLabel(s)+'？\n會從所屬組別移除，段考考場裡他的考評服務也會一起清掉。'))return;
  const before=JSON.stringify(D);snapshot('刪除 '+stuLabel(s)+' 之前');stuChk.delete(s.id);
  D.groups.forEach(g=>{g.students=g.students.filter(id=>id!==s.id);});D.students.splice(i,1);D.gone=(D.gone||[]).concat([s.id]).slice(-500);delete D.offBy['s:'+s.id];D.sets.forEach(x=>{x.students=x.students.filter(id=>id!==s.id);});changed();render();undoToast(stuLabel(s),before);}
function setTea(i,k,v){const t=D.teachers[i];t[k]=String(v).trim();
  if(k==='name'&&!(t.off||[]).length&&D.offPool&&D.offPool[t.name]){t.off=D.offPool[t.name].slice();toast('帶入 '+t.name+' 先前匯入的不排課時段 '+t.off.length+' 格');}
  changed();if(k==='role')render();}
function addTeacher(){D.teachers.push({id:uid('t'),name:'新老師',role:'普通班',off:[],note:''});changed();render();$('main').scrollTo(0,1e6);}
// 刪老師：他有個管學生時先問誰接手，不要默默把個管清空
function delTeacher(i){const t=D.teachers[i];if(!t)return;const cs=D.students.filter(s=>s.caseMgr===t.id).sort(sortStu);
  if(!cs.length){if(confirm('確定刪除 '+t.name+'？他負責的組別與任課設定會變成未指定。'))delTeaDo(t.id,'');return;}
  const others=D.teachers.filter(x=>x.role==='資源班'&&x.id!==t.id);
  openDlg(`<h3>刪除 ${esc(t.name)}</h3><p class="note">他是下面 ${cs.length} 位學生的個管老師。刪除之前，請選誰接手（他負責的組別與任課設定會變成未指定）：</p>
    <p>${cs.map(s=>`<span class="tagv">${esc(stuLabel(s))}</span>`).join(' ')}</p>
    <div class="bar"><label class="note" style="margin:0">接手的個管老師 <select id="delTo"><option value="">先不指定</option>${others.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label></div>
    <div class="bar" style="margin:12px 0 0"><button class="b danger" data-id="${esc(t.id)}" onclick="const v=$('delTo').value;closeDlg();delTeaDo(this.dataset.id,v)">刪除</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function delTeaDo(id,to){const i=D.teachers.findIndex(x=>x.id===id),t=D.teachers[i];if(!t)return;const before=JSON.stringify(D);snapshot('刪除 '+t.name+' 之前');
  D.groups.forEach(g=>{if(g.teacher===t.id)g.teacher='';});for(const k in D.classSubj)if(D.classSubj[k]===t.id)delete D.classSubj[k];
  D.students.forEach(s=>{if(s.caseMgr===t.id)s.caseMgr=to||'';});if(offSel==='t:'+t.id)offSel='*';if(view===t.id)view='';D.teachers.splice(i,1);changed();render();undoToast(t.name,before);}
function delRoom(i){const r=D.rooms[i];if(!r||!confirm('確定刪除『'+r.name+'』？指定這間的課會改成自動安排。'))return;const before=JSON.stringify(D);snapshot('刪除 '+r.name+' 之前');
  D.groups.forEach(g=>{if(g.room===r.id)g.room='';});D.rooms.splice(i,1);changed();render();undoToast(r.name,before);}
function setPer(i,k,v){D.periods[i][k]=v;changed();}
function movePer(i){if(i<1)return;const a=D.periods;[a[i-1],a[i]]=[a[i],a[i-1]];changed();render();}
function delPer(i){if(D.periods.length<2)return;if(!confirm('確定刪除「'+D.periods[i].name+'」？排在這一節的課會變成還沒排。'))return;D.periods.splice(i,1);changed();render();}
// 每個對話框右上角都有 ✕；Esc 也會關（dialog 本來就支援）
function openDlg(html,done){$('dlgBody').innerHTML='<button type="button" class="dlg-x" aria-label="關閉" onclick="closeDlg()">✕</button>'+html;dlgDone=done||null;if(!$('dlg').open)$('dlg').showModal();}
function closeDlg(){$('dlg').close();}
$('dlg').addEventListener('close',()=>{const f=dlgDone;dlgDone=null;if(f)f();});
function pasteStu(){openDlg(`<h3>從 Excel 貼上名單</h3><p class="note">在 Excel 選取「班級、座號、姓名」複製後貼到下面。</p>
  <details class="note"><summary>怎麼做？</summary>後面可以再多一欄<b>個管老師</b>、一欄<b>備註</b>。「701-13」或「701-13王小明」寫在同一格也可以；有標題列時會照標題找欄位（也認得「導師」欄）。每行一位，同班同名的會更新，不會重複新增；座號相同但名字不同的會另外新增，再列出來讓你確認。名冊裡沒有的個管老師會自動建成資源班老師。</details>
  <textarea id="pasteBox" placeholder="701&#9;03&#9;王小明&#10;701&#9;10&#9;陳小華"></textarea>
  <div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="pasteStuOk()">加入名冊</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteStuOk(){const txt=$('pasteBox').value;if(!txt.trim())return;snapshot('貼上學生名單之前');const r=importStudents(D,txt);
  changed();closeDlg();render();const msg='新增 '+r.add+' 人，更新 '+r.upd+' 人'+(r.cm?'，指定個管老師 '+r.cm+' 人':'')+(r.skip?'，略過 '+r.skip+' 行（看起來不是學生資料）':'');
  if(r.conflict.length||r.newCM.length||r.noCM.length)stuImportDlg(msg,r);else toast(msg);}
// 學生名單匯入後要人確認的：座號相同但姓名不同、新建的個管老師
function stuImportHtml(r){return (r.conflict.length?`<h4>座號相同但姓名不同（可能是轉入或換座號），已另外新增，請確認是否要刪掉舊的</h4><ul class="plain">${r.conflict.map(c=>`<li data-old="${esc(c.old)}">${esc(c.text)} <button class="b sm danger" data-id="${esc(c.old)}" onclick="delOldStu(this)">刪掉舊的（${esc(c.oldName)}）</button></li>`).join('')}</ul>`:'')+
  (r.newCM.length?`<h4>新建立的個管老師（資源班）</h4><p class="note">名冊裡原本沒有，已經新增為資源班老師：${r.newCM.map(esc).join('、')}。名字打錯的話，到「名冊 › 老師」改或刪掉。</p>`:'')+
  (r.noCM.length?`<h4>找不到的個管老師</h4><p>${r.noCM.map(esc).join('、')}</p>`:'');}
function stuImportDlg(msg,r){openDlg(`<h3>名單已帶入</h3><p class="note">${esc(msg)}</p>${stuImportHtml(r)}<div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="closeDlg()">知道了</button></div>`);}
// 從匯入結果直接刪掉舊的那位（不關掉對話框，可以一筆一筆處理）
function delOldStu(btn){const id=btn.dataset.id,i=D.students.findIndex(s=>s.id===id),s=D.students[i];if(!s){btn.disabled=true;return;}
  if(!confirm('刪掉名冊裡原本的 '+stuLabel(s)+'？\n他所屬的組別、不排課時段也會一起移除。'))return;snapshot('刪除 '+stuLabel(s)+' 之前');
  D.groups.forEach(g=>{g.students=g.students.filter(x=>x!==id);});D.students.splice(i,1);D.gone=(D.gone||[]).concat([id]).slice(-500);delete D.offBy['s:'+id];D.sets.forEach(x=>{x.students=x.students.filter(y=>y!==id);});
  changed();render();btn.disabled=true;btn.textContent='已刪除';}

/* ───── 排課｜分組 ───── */
function grpCard(g,i,byId,grs){const c=M.G[i];
  let h=`<div class="gc${g.on===false?' off':''}"><div class="hd"><input type="text" class="nm" value="${esc(g.name)}" placeholder="課名" onchange="setGrp(${i},'name',this.value)">
      <label class="note" style="margin:0;white-space:nowrap"><input type="checkbox"${g.on!==false?' checked':''} onchange="setGrp(${i},'on',this.checked)"> 要排</label><button class="x" title="刪除這門課" aria-label="刪除 ${esc(g.name)}" onclick="delGroup(${i})">✕</button></div>
    <div class="f"><span>科目</span><input type="text" list="subjList" value="${esc(g.subject)}" onchange="setGrp(${i},'subject',this.value)">
      <span>每週節數</span><input type="number" min="0" max="15" value="${g.per}" onchange="setGrp(${i},'per',+this.value)">
      <span>老師</span><select onchange="setGrp(${i},'teacher',this.value)">${tOpts(g.teacher,'res')}</select>
      <span>年級</span><select onchange="setGrp(${i},'grade',this.value)"><option value="">不限</option>${grs.map(x=>`<option value="${x}"${String(x)===g.grade?' selected':''}>${GRADE[x]}</option>`).join('')}</select>
      <span>型態</span><select onchange="setGrp(${i},'mode',this.value)">${MODES.map(m=>`<option${m===g.mode?' selected':''}>${m}</option>`).join('')}</select>
      <span>教室</span><select onchange="setGrp(${i},'room',this.value)"><option value="">自動安排</option>${D.rooms.map(r=>`<option value="${esc(r.id)}"${r.id===g.room?' selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
    <div class="sec">學生（${g.students.length} 人）</div><div>`+
      g.students.map(id=>byId[id]).filter(Boolean).sort(sortStu).map(s=>`<span class="stu">${esc(stuLabel(s))}<button class="x" title="從這門課拿掉" aria-label="從這門課拿掉 ${esc(s.name)}" data-id="${esc(s.id)}" onclick="togGS(${i},this.dataset.id);render()">✕</button></span>`).join('')+
      `<button class="b sm" onclick="pickStu(${i})">選學生</button></div>`;
  if(c.need&&c.cls.length){h+=`<div class="sec">原班的${esc(g.subject)}任課老師</div>`+c.cls.map(cl=>`<div class="cs2"><span>${esc(cl)}</span><select data-k="${esc(cl+'|'+g.subject)}" onchange="setCS(this)">${tOpts(D.classSubj[cl+'|'+g.subject],'reg')}</select></div>`).join('');}
  const w=c.warn.filter(x=>x!=='還沒有學生');
  h+=g.on===false?'':w.length?`<div class="st warn">${w.map(x=>'<div>'+esc(x)+'</div>').join('')}</div>`:`<div class="st">可以排的時段有 ${c.alist.length} 格，要排 ${c.per} 節${g.students.length?'':'；學生之後再編進來'}</div>`;
  return h+'</div>';}
function hoursOf(id){return D.groups.reduce((n,g)=>n+(g.teacher===id&&g.on!==false?g.per:0),0);}
function renderGroups(){
  const subj=[...new Set(D.groups.map(g=>g.subject).concat(['國文','數學','英文']))],byId={};D.students.forEach(s=>{byId[s.id]=s;});
  let grs=[...new Set(D.students.map(s=>gradeOfCls(s.cls)))].filter(x=>GRADE[x]).sort();if(!grs.length)grs=[7,8,9];
  const list=D.teachers.filter(t=>t.role==='資源班'||D.groups.some(g=>g.teacher===t.id)),ids=new Set(list.map(t=>t.id)),lone=D.groups.map((g,i)=>i).filter(i=>!ids.has(D.groups[i].teacher));
  let h=`<p class="guide">先填每位資源班老師的<b>基本鐘點</b>，再替他開課，把節數補到剛好。</p>
  <details class="note"><summary>怎麼做？</summary>這時候課裡可以還沒有學生。開好課之後，到「任課老師」填各班原班老師、到「不排課時段」點時間，再到「學生編組」決定每位學生每一科去哪一門課，系統會把學生放進不衝堂的課。也可以按「貼上課程一覽表」把學校的表整張帶進來。</details>
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
    <span class="stat${pend.length?' bad':''}">待安排：<b>${new Set(pend.map(n=>n.id)).size}</b> 位學生的 ${pend.length} 個科目</span></div>
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
  toast('已把學生編進 '+r.placed+' 個科目的課'+(r.left.length?'；'+r.left.length+' 個科目找不到同科目同年級的課':'')+(v?'；課表有 '+v+' 個衝突，請到排課頁按一鍵排課修正':''));}

/* ───── 排課｜AI 排課（現在用複製貼上；接上 API 之後只要換掉 aiCopy 到 aiOk 中間這一段）───── */
function aiOpen(){openDlg(`<h3>用 AI 排課</h3><p class="note">系統把目前的老師、開課、不排課時段和待安排的學生整理成一段題目，<b>人名都換成代號</b>（S1、T1…），貼給 AI 請它排。AI 回覆的結果貼回來後，一樣會經過這裡的衝堂檢查，有問題再按一鍵排課修正。</p>
  <div class="bar"><button class="b pri" onclick="aiCopy()">1. 複製題目</button><span class="note" style="margin:0">貼到 Claude 等 AI 對話</span></div>
  <textarea id="aiBox" placeholder="2. 把 AI 回覆的整段文字貼在這裡"></textarea>
  <div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="aiOk()">3. 套用並檢查衝堂</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function aiCopy(){const t=aiPrompt(D);aiCopy.v=aiProblem(D).v;const fb=()=>{const b=$('aiBox');b.value=t;b.select();toast('沒辦法自動複製，請手動複製下面的文字，貼給 AI 後再把這格換成它的回覆');};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>toast('題目已複製（'+t.length+' 字），人名都換成代號了'),fb);else fb();}
// 貼回來的排法和 Gemini 的一樣只是候選：在複本上檢查，比現在好才給套用（gmOffer 在檔案後面的 Gemini 區塊）
function aiOk(){const txt=$('aiBox').value;if(!txt.trim()){toast('請先貼上 AI 的回覆');return;}
  const v=aiCopy.v,id=GEMINI.logAdd({kind:'paste',model:'外部 AI',mode:'paste',prompt:'（複製出去的題目，版本 '+(v||'不明')+'）',reply:txt});
  openDlg('<h3>AI 的排法</h3><div id="gmRes"></div><div class="bar" style="margin:12px 0 0"><button class="b" onclick="closeDlg()">關閉</button></div>');
  gmOffer(JSON.parse(JSON.stringify(D)),txt,v,true,id,$('gmRes'));}
function delGroup(i){const g=D.groups[i];if(!g||!confirm('確定刪除「'+g.name+'」？'))return;const before=JSON.stringify(D);snapshot('刪除 '+g.name+' 之前');D.groups.splice(i,1);changed();render();undoToast(g.name,before);}
function setCS(el){if(el.value)D.classSubj[el.dataset.k]=el.value;else delete D.classSubj[el.dataset.k];changed();render();}
// 把學生從課裡拿掉：如果他這一科已經沒有別的課，問是不上了、還是改成待安排。
// 不問的話 needs 裡還有這一科，一鍵排課又會把他放回去
function togGS(i,id){const g=D.groups[i],a=g.students,k=a.indexOf(id);if(k>=0){a.splice(k,1);askDrop([{id,subject:g.subject}]);}else a.push(id);changed();}
function dropAsk(list){return list.filter(o=>{const s=D.students.find(x=>x.id===o.id);return s&&(s.needs||[]).includes(o.subject)&&!D.groups.some(g=>g.subject===o.subject&&g.students.includes(o.id));});}
function askDrop(list){const L=dropAsk(list);if(!L.length)return;askDrop.L=L;
  openDlg(`<h3>是不上這科了，還是改成待安排？</h3><p class="note">下面的學生這一科已經沒有在任何一門課裡。「待安排」的話，按一鍵排課或自動編組時會再幫他找一門課。</p>
    <table class="ed" style="width:100%"><tr><th>學生</th><th>科目</th><th></th></tr>${L.map((o,j)=>{const s=D.students.find(x=>x.id===o.id);return `<tr><td>${esc(stuLabel(s))}</td><td>${esc(o.subject)}</td><td class="nw"><label><input type="radio" name="drop${j}" value="no" checked> 不上這科了</label>　<label><input type="radio" name="drop${j}" value="wait"> 改成待安排</label></td></tr>`;}).join('')}</table>
    <div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="askDropOk()">確定</button></div>`,render);}
function askDropOk(){(askDrop.L||[]).forEach((o,j)=>{const r=document.querySelector('input[name="drop'+j+'"]:checked'),s=D.students.find(x=>x.id===o.id);
  if(s&&(!r||r.value==='no'))s.needs=(s.needs||[]).filter(x=>x!==o.subject);});askDrop.L=null;changed();closeDlg();}
function pickStu(i){const g=D.groups[i],same={};
  D.groups.forEach((o,j)=>{if(j!==i&&o.subject===g.subject)o.students.forEach(id=>{same[id]=o.name;});});
  pickList(g.name+'的學生',g.students,same,g.subject);}

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
// subject：是課的學生名單時傳科目，關掉時對拿掉的學生問「不上了還是待安排」
function pickList(title,arr,same,subject){
  pickList.arr=arr;pickList.subj=subject||'';pickList.gone=[];const by={};D.students.slice().sort(sortStu).forEach(s=>{(by[s.cls]=by[s.cls]||[]).push(s);});
  let h=`<h3>${esc(title)}</h3><div class="pick">`;
  for(const c in by)h+=`<div class="cl">${esc(c)}</div>`+by[c].map(s=>`<label><input type="checkbox"${arr.includes(s.id)?' checked':''} data-id="${esc(s.id)}" onchange="pickTog(this.dataset.id)">${esc(s.name)}${same[s.id]?` <small>已在${esc(same[s.id])}</small>`:''}</label>`).join('');
  if(!D.students.length)h+='<p class="note">名冊還沒有學生。</p>';
  openDlg(h+`</div><div class="bar" style="margin:0"><button class="b pri" onclick="closeDlg()">完成</button></div>`,()=>{render();const sj=pickList.subj,g=pickList.gone.filter(id=>!pickList.arr.includes(id));if(sj&&g.length)askDrop(g.map(id=>({id,subject:sj})));});}
function pickTog(id){const a=pickList.arr,k=a.indexOf(id);if(k>=0){a.splice(k,1);pickList.gone.push(id);}else a.push(id);changed();}

/* ───── 排課｜任課老師（班級 × 科目）───── */
function renderTeach(){
  const need={},subs=[];M.G.forEach(g=>{if(!g.need||!g.per)return;   // 只有「抽離」要原班配合；不鎖課的課不用填任課老師
  if(!subs.includes(g.subject))subs.push(g.subject);g.cls.forEach(c=>{(need[c]=need[c]||{})[g.subject]=1;});});
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
  let t=teaByName(D,name);if(!t){t=newTeacher(D,name,'普通班');toast('已把 '+name+' 加進老師名冊');}
  D.classSubj[k]=t.id;changed();
  const all=[...document.querySelectorAll('#page input[data-k]')],i=all.indexOf(el);render();const nx=document.querySelectorAll('#page input[data-k]')[i+1];if(nx)nx.focus();}

/* ───── 排課｜貼上課程一覽表（每一組各自的節數、老師、學生一次帶入）───── */
function pasteCourses(){openDlg(`<h3>貼上課程一覽表</h3><p class="note">從 Excel 的「課程領域分組及節數一覽表」整張複製貼上。欄位依序是：<b>領域、年級、組別、抽離或外加、學生名單、節數、人數、人次、授課教師</b>。</p>
  <details class="note"><summary>怎麼做？</summary>每一組的節數照表上的來，所以同科目不同組可以不一樣（例：數學 7A 3 節、7B 4 節）。組名相同的課會更新，不會重複建立；表上有名字對不到名冊時，原本在課裡的學生會先留著並列出來。學生名單遮名的（704林○哲）會用班級和姓名頭尾對回名冊，所以要先有名冊。授課教師寫兩位的，第一位當授課老師。右邊的教師鐘點表如果一起貼，會帶入基本鐘點。</details>
  <textarea id="pasteBox" placeholder="國文&#9;7&#9;A&#9;抽離&#9;704林○哲、704黃○侖&#9;3&#9;2&#9;6&#9;王老師"></textarea>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="pasteCoursesOk()">帶入課程</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteCoursesOk(){const txt=$('pasteBox').value;if(!txt.trim())return;snapshot('貼上課程一覽表之前');const r=importCourseTable(D,txt);
  if(!r.added&&!r.updated){toast('沒有讀到任何一門課，請確認是從 Excel 複製（欄位之間是 Tab）、而且有節數');return;}
  D=normalize(D);changed();render();
  const miss=[...new Set(r.miss)],msg='新增 '+r.added+' 門課、更新 '+r.updated+' 門，放進 '+r.members+' 位學生'+(r.hours?'，帶入 '+r.hours+' 位老師的基本鐘點':'');
  if(miss.length||r.kept.length||r.coT.length)openDlg(`<h3>${miss.length?`已帶入，但有 ${miss.length} 位學生對不到名冊`:'已帶入，有幾件事請確認'}</h3><p class="note">${esc(msg)}。</p>${miss.length?`<p class="note">下面這些在名冊裡找不到，或同班有兩位符合，請到「名冊」新增後，再到「學生編組」放進課裡：</p><p>${miss.map(m=>`<span class="tagv">${esc(m)}</span>`).join(' ')}</p>`:''}${courseNoteHtml(r)}<div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="closeDlg()">知道了</button></div>`);
  else{closeDlg();toast(msg);}
  offWarn();}
// 課程一覽表重貼時留下來的學生、一格寫了兩位老師的課
function courseNoteHtml(r){return (r.kept.length?`<h4>表上沒找到、先留在課裡的學生</h4><p class="note">這幾門課表上有名字對不到名冊，所以原本在課裡的學生先不移除。確定不上了，再到「學生編組」改成不上：</p><ul class="plain">${r.kept.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>`:'')+
  (r.coT.length?`<h4>一門課寫了兩位老師</h4><p class="note">系統只能指定一位授課老師，用的是第一位；要換人請在「老師開課」的卡片上改：</p><ul class="plain">${r.coT.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>`:'');}

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
  D=normalize(D);changed();closeDlg();render();toast('新增 '+nS+' 位學生、'+nG+' 組，放進組別的學生共 '+nM+' 筆'+(bad?'；略過 '+bad+' 行':''));}

/* ───── 排課｜排課板 ───── */
function chipHtml(l,errs){const g=M.G[M.L[l].g],r=ROOM[l],names=g.stu.map(i=>stuLabel(D.students[i])).join('、');
  return `<span class="chip c${colorOf(g)}${ST.pin[l]?' pin':''}${errs[l]?' err':''}${selL===l?' sel':''}" tabindex="0" role="button" data-l="${l}" title="${esc((g.t>=0?M.T[g.t].name+'｜':'')+names+roomNote(l)+(errs[l]?'\n'+errs[l]:''))}">${esc(g.name)}<small>${esc(ST.slot[l]>=0&&r>=0?D.rooms[r].name:(g.t>=0?M.T[g.t].name:''))}</small></span>`;}
function renderBoard(){
  const out=[];evaluate(M,ST.slot,out);
  const errs={},msg=new Map(),cnt={};out.forEach(o=>{cnt[o.k]=(cnt[o.k]||0)+1;if(o.k!=='un')errs[o.l]=(errs[o.l]?errs[o.l]+'\n':'')+o.m;const e=msg.get(o.m);if(e)e.n++;else msg.set(o.m,{n:1,l:o.l,k:o.k});});
  const CK=[['teacher','老師'],['student','學生'],['class','原班兩科'],['reg','任課老師'],['room','教室'],['off','不排課時段'],['un','還沒排']];
  const warns=M.G.filter(g=>g.per).flatMap(g=>g.warn.map(w=>g.name+'：'+w));
  const placed=[...ST.slot].filter(s=>s>=0).length,total=M.L.length,gv=view.slice(0,2)==='g:'?+view.slice(2):0,ti=view&&!gv?M.tIdx[view]:-1;
  const show=shownL,gOff=gv?new Set(D.offBy[view]||[]):null,gname=gv?GRADE[gv]:'';
  const at={},un=[];M.L.forEach((x,l)=>{if(!show(l))return;const s=ST.slot[l];if(s<0)un.push(l);else(at[s]=at[s]||[]).push(l);});
  let h=preCheck()+`<p class="guide">按<b>一鍵試排</b>，系統會先排出每位老師的課，再把「待安排」的學生編進不衝堂的課，最後確認老師、學生、教室都不撞。排出來的是<b>草稿</b>，會和正式課表並排比較，滿意了再按<b>確定採用</b>。可以直接拖曳調整（或點一下組別、再點要放的格子）；動過的會<b>固定</b>住，按重排時不會被移走。</p>
  <div class="bar">${solveBtns(gv,gname)}<span class="vsep"></span><button class="b" onclick="undo()">復原</button><button class="b" onclick="unpinAll()">解除全部固定</button><span class="vsep"></span><button class="b" onclick="aiOpen()">用 AI 排</button>
    <span class="stat">已排 <b>${placed}</b> / ${total} 節</span><span class="stat${out.length?' bad':''}">問題 <b>${out.length}</b></span><span class="grow"></span>
    <select onchange="view=this.value;selL=-1;render()"><option value="">全部年級</option>${[...new Set(M.G.flatMap(g=>g.grades))].filter(g=>GRADE[g]).sort().map(g=>`<option value="g:${g}"${view==='g:'+g?' selected':''}>只看、只排${GRADE[g]}</option>`).join('')}${D.teachers.map(t=>`<option value="${esc(t.id)}"${t.id===view?' selected':''}>只看 ${esc(t.name)}</option>`).join('')}</select><button class="b danger" onclick="clearAll()">清空排法</button></div>`;
  if(!total)h+=`<div class="probs">還沒有要排的組，請先到「老師開課」建立。</div>`;
  else if(!out.length&&!warns.length&&placed===total)h+=`<div class="probs ok">全部排好了，沒有衝突。</div>`;
  else if(out.length||warns.length)h+=`<div class="probs">`+warns.map(w=>`<div>${esc(w)}</div>`).join('')+[...msg].map(([m,e])=>`<div class="err${e.k==='un'?'':' go'}" data-l="${e.l}" onclick="pickL(+this.dataset.l)">${esc(m)}${e.n>1?'（'+e.n+' 節）':''}</div>`).join('')+`</div>`;
  if(total){const A=M.flex?assignLocks(M,ST.slot):null,bad=CK.filter(([k])=>cnt[k]);
    h+=bad.length||A&&A.open.length?`<div class="chk"><b>衝堂檢查</b>`+bad.map(([k,n])=>`<span class="bad">${n} ${cnt[k]}</span>`).join('')+(A&&A.open.length?`<span class="mid" title="有學生被抽離、但原班鎖不到任何主科的班級節次。詳細在「課表輸出 › 鎖課表」">鎖不到課 ${A.open.length}／${A.pulled}</span>`:'')+`<small>每次調整都會重新檢查；點上面的紅字會跳到那一節</small></div>`:`<div class="chk"><span class="ok">衝堂檢查全數通過</span></div>`;}
  if(selL>=0&&selL<M.L.length){const g=M.G[M.L[selL].g],s=ST.slot[selL],fx=ST.rfix[selL];
    h+=`<div class="selbar"><b>${esc(g.name)}</b><span>${s>=0?esc(M.sn(s)):'還沒排'}</span><label>教室 <select onchange="setLRoom(this.value)"><option value="-1">自動${s>=0&&fx<0&&ROOM[selL]>=0?'（'+esc(D.rooms[ROOM[selL]].name)+'）':''}</option>${D.rooms.map((r,i)=>`<option value="${i}"${i===fx?' selected':''}>${esc(r.name)}</option>`).join('')}</select></label>
      ${s>=0?`<button class="b sm" onclick="togPin()">${ST.pin[selL]?'解除固定':'固定在這一節'}</button><button class="b sm" onclick="moveLesson(selL,-1)">拿下來</button>`:''}<span class="note" style="margin:0">點要放的格子可以移動；綠色是不會衝堂的位置</span><span class="grow"></span><button class="b sm" onclick="selL=-1;render()">取消選取</button></div>`;}
  h+=`<div class="tray" data-s="-1">${un.length?'還沒排：'+un.map(l=>chipHtml(l,errs)).join(''):(placed<total?'':'拖到這裡可以把一節拿下來')}</div>
  <div class="scroll"><table class="board"><tr><th class="ph2"></th>${DAYS.map(d=>`<th>週${d}</th>`).join('')}</tr>`;
  D.periods.forEach((p,pi)=>{h+=`<tr class="${p.extra?'ex':''}"><th class="ph2">${esc(p.name)}<small>${esc(p.start)}</small></th>`+DAYS.map((d,di)=>{const s=di*M.NP+pi,blk=M.blocked[s]||(ti>=0&&M.off[ti][s])||(gOff&&gOff.has(M.s2key(s)));
    return `<td class="${blk?'blk':''}" data-s="${s}">${(at[s]||[]).sort((a,b)=>colorOf(M.G[M.L[a].g])-colorOf(M.G[M.L[b].g])).map(l=>chipHtml(l,errs)).join('')}</td>`;}).join('')+'</tr>';});
  h+=`</table></div><div class="legend">`+M.rts.map((t,i)=>`<span class="chip c${i%6}">${esc(M.T[t].name)}</span>`).join('')+`　粗框＝已固定（連點兩下可切換）　斜線＝不排課　紅框＝有衝突，滑鼠停在上面看原因</div>`;
  const rows=M.G.filter(g=>g.per).map(g=>({g,slack:g.alist.length-g.per})).sort((a,b)=>a.slack-b.slack);
  if(rows.length)h+=`<h3>哪一組最難排</h3><p class="note">「可排時段」是扣掉這一組所有相關老師的不排課時段之後剩下的格數，越少越難排，排不進去時先看這幾組。</p>
  <div class="scroll"><table class="ed"><tr><th>組別</th><th>老師</th><th>每週節數</th><th>可排時段</th><th>一起算進去的原班老師</th></tr>`+rows.map(({g})=>`<tr><td>${esc(g.name)}</td><td>${esc(g.t>=0?M.T[g.t].name:'')}</td><td>${g.per}</td><td>${g.alist.length} 格</td><td class="dim">${esc([...new Set(g.locks.filter(k=>k.t>=0).map(k=>M.T[k.t].name))].join('、'))}</td></tr>`).join('')+`</table></div>`;
  $('page').innerHTML=h;
  if(selL>=0)markCells(selL);
}
// 排課前的檢查：任課老師填了幾格、不排課時段匯入了沒、還有多少待安排；每一項都可以點過去
function preCheck(){const need=new Set();M.G.forEach(g=>{if(g.need&&g.per)g.cls.forEach(c=>need.add(c+'|'+g.subject));});
  const cs=[...need].filter(k=>D.classSubj[k]).length,off=D.teachers.some(t=>t.role!=='資源班'&&t.off.length)||Object.keys(D.offBy).some(k=>/^[ck]:/.test(k)&&D.offBy[k].length),pn=needList(D);
  const it=(ok,txt,f)=>`<button type="button" class="b sm${ok?'':' warn'}" onclick="${f}">${ok?'✓':'!'} ${txt}</button>`;
  return `<div class="bar precheck"><span class="note" style="margin:0">排課前先確認：</span>${it(cs===need.size,'任課老師 '+cs+'/'+need.size,"go('sched','teach')")}${it(off,'不排課時段'+(off?'已匯入':'還沒匯入'),"go('sched','off')")}${it(!pn.length,'待安排 '+pn.length,"go('sched','need')")}</div>`;}
// 排課板的組別可以用鍵盤：Tab 選到，Enter 或空白鍵等於點一下
$('page').addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const c=e.target.closest&&e.target.closest('.chip[data-l]');if(!c||page!=='sched'||sub!=='board')return;e.preventDefault();const l=c.dataset.l;c.click();const n=document.querySelector('#page .chip[data-l="'+l+'"]');if(n)n.focus();});
function pickL(l){if(!(l>=0))return;selL=l;if(view&&!shownL(l))view='';render();const c=document.querySelector('#page .chip[data-l="'+l+'"]');if(c&&c.scrollIntoView)c.scrollIntoView({block:'center',inline:'center'});}
function setLRoom(v){if(selL<0)return;pushUndo();const l=selL;ST.rfix[l]=+v;commit();selL=l;render();}
function togPin(){if(selL<0||ST.slot[selL]<0)return;pushUndo();const l=selL;ST.pin[l]=ST.pin[l]?0:1;commit();selL=l;render();}
function markCells(l){const b=probSet();document.querySelectorAll('#page td[data-s]').forEach(td=>{const s=+td.dataset.s;if(s===ST.slot[l])return;
  const r=cellInfo(l,s,b);td.classList.add(r.ok?'ok':'no');td.title=r.t;});}
function clearMarks(){document.querySelectorAll('#page td[data-s]').forEach(td=>{td.classList.remove('ok','no','over');td.removeAttribute('title');});const t=document.querySelector('.tray');if(t)t.classList.remove('over');}
function moveLesson(l,s){if(ST.slot[l]===s){selL=-1;render();return;}pushUndo();const bad=s>=0&&!canPlace(M,ST.slot,l,s);
  ST.slot[l]=s;ST.pin[l]=s>=0?1:0;selL=-1;commit();if(bad)toast('放進去了，但這一格有衝突，請看上方說明');}
(function(){const B=$('page');const onBoard=()=>page==='sched'&&sub==='board'&&!isRO();
  // 拖曳改用 pointer 事件（滑鼠和平板都能用），寫在檔案後面的「拖曳調整」
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
  pushUndo();snapshot('一鍵排課之前');busyOn('正在排課，通常 5–20 秒，請不要關閉頁面');
  setTimeout(()=>{try{if(all)ST.pin.forEach((x,l)=>{if(!part||shownL(l))ST.pin[l]=0;});D.settings.seed=(D.settings.seed||1)+1;const sv=()=>{const R=solve(M,ST,{seed:D.settings.seed,only:part?shownL:null});setST({slot:R.slot,pin:R.pin,rfix:ST.rfix});};
      sv();let pl=null;const gv=part?+view.slice(2):0;
      if(needList(D).length){D.assign=fromState(M,ST);pl=placeStudents(D,gv?{filter:s=>gradeOfCls(s.cls)===gv}:null);if(pl.placed){rebuild();evaluate(M,ST.slot);if(M.viol)sv();}}
      if(M.flex){const R2=refineLocks(M,ST,{only:part?shownL:null});setST({slot:R2.slot,pin:ST.pin,rfix:ST.rfix});}
      runSolve.msg=pl&&(pl.placed||pl.left.length)?'；'+(pl.placed?'把學生編進 '+pl.placed+' 個科目的課':'')+(pl.left.length?(pl.placed?'，':'')+pl.left.length+' 個科目找不到同科目同年級的課':''):'';
      if(M.flex){const A=assignLocks(M,ST.slot);runSolve.msg+='；原班鎖得到課 '+(A.pulled-A.open.length)+'／'+A.pulled+(A.fixAll?'，沿用手排鎖課 '+A.fixed+'／'+A.fixAll:'');}
      selL=-1;commit();
      const n=part?M.L.filter((x,l)=>shownL(l)).length:M.L.length;const o2=[];evaluate(M,ST.slot,o2);const v=o2.filter(o=>!part||shownL(o.l)).length;toast((v?'排好了，但還有 '+v+' 個問題排不開，請看上方說明':'排好了：'+(part?GRADE[+view.slice(2)]+' ':'')+n+' 節全部排入，沒有衝突')+runSolve.msg);}
    finally{busyOff();}},40);
}
function undo(){if(!undoStack.length){toast('沒有可以復原的動作');return;}const u=JSON.parse(undoStack.pop());D.assign=u.a;if('d' in u){if(u.d)schedBox().draft=u.d;else if(D.sched)delete D.sched.draft;draftST=null;}u.m.forEach(([id,st])=>{const g=D.groups.find(x=>x.id===id);if(g)g.students=st;});rebuild();commit();}
function unpinAll(){pushUndo();ST.pin.fill(0);commit();}
function clearAll(){if(!confirm('確定清空目前的排法？（可以按「復原」救回來）'))return;snapshot('清空排法之前');pushUndo();ST.slot.fill(-1);ST.pin.fill(0);ST.rfix.fill(-1);selL=-1;commit();}

/* ───── 排課｜課表輸出 ───── */
let outG='';
const LOCKN={國文:'國語文',英文:'英語文'};
const TCOL=['#b4541a','#b02a2a','#7a4a22','#5a3a8c','#2a2620','#1f7fa8','#a83a86','#6f6556','#2f6a3a','#2f47a8','#1f7a70','#8a6a10'];// 與 app.css 的 .t0～.t11 同一組
const SUBC={'':['#eef5ee','#5aa06f','#22603a'],國:['#fdecec','#e86a6a','#a11d1d'],數:['#eaf1fa','#6a9ad8','#234a94'],英:['#fdf7dc','#c99a1a','#8a5a00'],社:['#f3ecfa','#9a6fd0','#4b2a8c']};
// 總課表上的組別代號：組名如果帶著科目（8A國文）就只留代號（8A）
function shortName(g){const n=String(g.name||''),j=String(g.subject||'');return j&&n.length>j.length&&n.endsWith(j)?n.slice(0,-j.length):j&&n.length>j.length&&n.startsWith(j)?n.slice(j.length):n;}
function slotsText(list){const by={};list.forEach(s=>{const d=Math.floor(s/M.NP);(by[d]=by[d]||[]).push(M.P[s%M.NP].name);});
  return Object.keys(by).sort().map(d=>'週'+DAYS[d]+' '+by[d].join('、')).join('；');}
// 表頭放在 <thead>，印很多頁時每一頁都會重複表頭
const thead=(cells,cls)=>`<thead><tr>${cells.map(c=>`<th${cls?` class="${cls}"`:''}>${c}</th>`).join('')}</tr></thead>`;
const signLine=(x)=>`<p class="sign">製表：＿＿＿＿＿＿　日期：＿＿＿＿＿＿${x||''}</p>`;
function printDate(){const d=new Date();return (d.getFullYear()-1911)+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');}
const tName=t=>t>=0&&M.T[t]?M.T[t].name:'';
const tCall=n=>n&&!/(老師|主任|組長|校長)/.test(n)?n+'老師':n;   // 王 → 王老師；林組長照原樣
// 現在的鎖課：每一筆 {cls,s,sj,t,groups,extra}。彈性鎖課照配鎖課的結果（原班實際鎖的科目可能和資源班不一樣）
function locksNow(){if(M.flex)return assignLocks(M,ST.slot).locks.map(k=>({cls:k.cls,s:k.s,sj:k.sj,t:k.t,groups:k.groups,extra:k.extra}));
  const m=new Map();M.L.forEach((x,l)=>{const s=ST.slot[l],g=M.G[x.g];if(s<0||!g.need)return;g.locks.forEach(k=>{const key=k.cls+'|'+s;let o=m.get(key);if(!o)m.set(key,o={cls:k.cls,s,sj:g.subject,t:k.t,groups:[],extra:false});if(!o.groups.includes(g.name))o.groups.push(g.name);});});
  return [...m.values()];}
// 總課表格子裡的老師簡稱：用姓；同姓的老師就用 normName 後的名字
function tShort(){const o={},nm=t=>normName(M.T[t].name).replace(/（.*?）|\(.*?\)/g,''),sur=M.rts.map(t=>nm(t).slice(0,1));
  M.rts.forEach((t,i)=>{o[t]=sur.filter(x=>x===sur[i]).length>1?nm(t):sur[i];});return o;}
function renderOut(){
  const modes=[['master','總課表'],['teacher','資源班老師課表'],['lock','給教務處的鎖課表'],['lockraw','鎖課清單（教務處格式）'],['homeroom','給導師的班級抽離表'],['regular','給任課老師的抽離名單'],['card','學生個人課表'],['student','學生抽離一覽'],['cm','個管個案一覽'],['group','組別總表']];
  const placed=[...ST.slot].filter(s=>s>=0).length;
  let h=`<p class="guide">排好之後，在這裡印出或複製各種表。<b>鎖課表</b>是給教務處的：列出每個班哪幾節必須排哪一科，原班才會和資源班同時上同一科。</p>
  <div class="bar">`+modes.map(([k,n])=>`<button class="b${outMode===k?' pri':''}" onclick="outMode='${k}';render()">${n}</button>`).join('')+`<span class="grow"></span><button class="b" onclick="copyOut()">複製</button><button class="b" onclick="window.print()">列印</button></div>`;
  const dateIn=`<label class="note" style="margin:0">實施日期 <input type="text" class="w8" value="${esc(D.settings.dates||'')}" placeholder="115.09.02-116.01.20" onchange="D.settings.dates=this.value.trim();save();render()"></label>`;
  if(outMode==='master')h+=`<div class="bar">${dateIn}<span class="note" style="margin:0">欄是教室；每格寫科目、組別和老師的姓，印成黑白也分得出老師。列印時會自動用橫式。教室名稱取最後一個字當欄名。</span></div>`;
  if(outMode==='homeroom'||outMode==='regular')h+=`<div class="bar">${dateIn}<span class="note" style="margin:0">一班（一位老師）一頁。</span></div>`;
  if(outMode==='card')h+=`<div class="bar"><label class="note" style="margin:0">課表名稱 <input type="text" class="w8" value="${esc(D.settings.cardTitle||'資源班課表')}" onchange="D.settings.cardTitle=this.value.trim();save();render()"></label>
    <select onchange="outG=this.value;render()"><option value="">全部年級</option>${[...new Set(D.students.map(x=>gradeOfCls(x.cls)))].filter(x=>GRADE[x]).sort().map(x=>`<option value="${x}"${String(x)===outG?' selected':''}>${GRADE[x]}</option>`).join('')}</select><span class="note" style="margin:0">一位學生一頁</span></div>`;
  if(!placed){$('page').innerHTML=h+`<div class="probs">還沒有排法，請先到「排課表」按一鍵排課。</div>`;return;}
  const T=esc(D.title||'資源班'),dt=D.settings.dates?`<p class="dt">實施日期：${esc(D.settings.dates)}</p>`:'';let b='';
  const cmName=s=>{const t=D.teachers.find(x=>x.id===s.caseMgr);return t?t.name:'';};
  const roomOf=l=>ROOM[l]>=0&&D.rooms[ROOM[l]]?D.rooms[ROOM[l]].name:'';
  if(outMode==='master'){
    const names=D.rooms.map(r=>String(r.name||'')),uq=a=>new Set(a).size===a.length,la=names.map(n=>n.slice(-1)),fa=names.map(n=>n.slice(0,1)),rn=names.every(n=>n.length<=2)?names:uq(la)?la:uq(fa)?fa:names;
    const cols=D.rooms.map((r,i)=>({i,n:rn[i]})).concat(M.L.some((x,l)=>ST.slot[l]>=0&&ROOM[l]<0)?[{i:-1,n:'其他'}]:[]),at={};
    M.L.forEach((x,l)=>{const sl=ST.slot[l];if(sl>=0){const k=sl+'|'+ROOM[l];(at[k]=at[k]||[]).push(l);}});
    const ti=t=>Math.max(0,M.rts.indexOf(t))%12,tc=t=>TCOL[ti(t)%TCOL.length],sh=tShort();
    // 老師除了顏色，還有 .t0～.t11（樣式另外加框線花紋）和格子裡的姓，黑白印也認得出來
    b=`<style>@page{size:A4 landscape;margin:10mm}</style><div class="pg master">${dt}<h2>${T} 課表</h2><p class="lg">教師：${M.rts.map(t=>`<b class="t${ti(t)}" style="color:${tc(t)}">${esc(M.T[t].name)}（${esc(sh[t])}）</b>`).join('、')}</p>
      <table class="out mt"><thead><tr><th rowspan="2"></th>${DAYS.map(d=>`<th colspan="${cols.length}" class="dl">星期${d}</th>`).join('')}</tr><tr>${DAYS.map(()=>cols.map((c,k)=>`<th class="${k?'':'dl'}">${esc(c.n)}</th>`).join('')).join('')}</tr></thead>`+
      D.periods.map((p,pi)=>`<tr><th>${esc(String(p.name).replace(/^第\s*(\S+?)\s*節$/,'$1'))}</th>`+DAYS.map((d,di)=>cols.map((c,k)=>`<td class="${k?'':'dl'}">${(at[(di*M.NP+pi)+'|'+c.i]||[]).map(l=>{const g=M.G[M.L[l].g];
        return `<span class="t${ti(g.t)}" style="color:${tc(g.t)}"><b>${esc(String(g.subject).slice(0,1))}</b><br>${esc(shortName(g.ref))}${g.t>=0?`<br><small>${esc(sh[g.t]||'')}</small>`:''}</span>`;}).join('')}</td>`).join('')).join('')+'</tr>').join('')+'</table></div>';
  }else if(outMode==='teacher'){
    M.rts.forEach(t=>{const at={};M.L.forEach((x,l)=>{const g=M.G[x.g];if(g.t===t&&ST.slot[l]>=0)at[ST.slot[l]]=l;});
      b+=`<div class="pg"><h2>${T}｜${esc(M.T[t].name)}課表（每週 ${Object.keys(at).length} 節）</h2><table class="out">${thead(['節次'].concat(DAYS.map(d=>'週'+d)))}`+
        D.periods.map((p,pi)=>`<tr><td class="c">${esc(p.name)}<br><small>${esc(p.start)}～${esc(p.end)}</small></td>`+DAYS.map((d,di)=>{const l=at[di*M.NP+pi];if(l==null)return '<td></td>';const g=M.G[M.L[l].g];
          return `<td class="c"><b>${esc(g.name)}</b><br><small>${esc(roomOf(l))}　${g.stu.length} 人</small></td>`;}).join('')+'</tr>').join('')+'</table></div>';});
  }else if(outMode==='lockraw'){
    const reg=D.periods.filter(p=>!p.extra),pn=s=>{const p=M.P[s%M.NP],m=String(p.name).match(/^第\s*(\d+)\s*節$/);return m?+m[1]:reg.indexOf(p)+1;};
    const rows=(M.flex?assignLocks(M,ST.slot).locks.map(k=>({cls:k.cls,sj:k.sj,s:k.s,t:M.T[k.t].name})):lockTable(M,ST.slot).flatMap(r=>r.slots.map(s=>({cls:r.cls,sj:r.subject,s,t:r.teacher})))).sort((a,c)=>a.cls.localeCompare(c.cls)||a.s-c.s);
    b=`<div class="pg"><h2>${T}｜鎖課清單（${printDate()} 印）</h2><table class="out">${thead(['班級名稱','科目名稱','星期','首節','末節','教師姓名'])}`+
      rows.map(r=>`<tr><td class="c">${esc(r.cls)}</td><td class="c">${esc(LOCKN[r.sj]||r.sj)}</td><td class="c">${Math.floor(r.s/M.NP)+1}</td><td class="c">${pn(r.s)}</td><td class="c">${pn(r.s)}</td><td>${esc(r.t)}</td></tr>`).join('')+
      `</table><p class="note">欄位和教務處「特教鎖課需求」的資料輸出相同，按「複製」可以貼到試算表。科目名稱國文、英文會寫成國語文、英語文。共 ${rows.length} 筆。</p>${signLine()}</div>`;
    // 特教鎖課整理：每班各科鎖幾節、國文有沒有連 2 節（同一天相鄰兩節）
    const CS=['國語文','英語文','數學','理化'],cnt={};
    rows.forEach(r=>{const o=cnt[r.cls]=cnt[r.cls]||{n:{},g:[]},sj=LOCKN[r.sj]||r.sj;o.n[sj]=(o.n[sj]||0)+1;if(sj==='國語文')o.g.push(r.s);});
    const dbl=g=>g.some(s=>g.includes(s+1)&&Math.floor(s/M.NP)===Math.floor((s+1)/M.NP)&&pn(s+1)===pn(s)+1&&!M.brk[s%M.NP])?1:0;   // 隔著午休的不算連 2
    b+=`<div class="pg"><h2>${T}｜特教鎖課整理（${printDate()} 印）</h2><table class="out">${thead(['班級名稱','國語文','英語文','數學','國文連2','理化'])}`+
      Object.keys(cnt).sort().map(c=>{const o=cnt[c];return `<tr><td class="c">${esc(c)}</td>${CS.slice(0,3).map(s=>`<td class="c">${o.n[s]||0}</td>`).join('')}<td class="c">${dbl(o.g)}</td><td class="c">${o.n['理化']||0}</td></tr>`;}).join('')+
      `</table><p class="note">欄位和「特教鎖課需求」的特教鎖課整理相同。國文連2 是 1 表示這一班有鎖到同一天相鄰的兩節國文。</p>${signLine()}</div>`;
  }else if(outMode==='lock'){
    if(M.flex){const A=assignLocks(M,ST.slot),n=A.locks.filter(k=>!k.extra).length,ex=A.locks.length-n;
      b=`<div class="pg"><p class="note">有學生被抽離的班級節次共 <b>${A.pulled}</b> 個：鎖到 <b>${n}</b> 個（同一科 ${A.same}、改鎖別科 ${n-A.same}），鎖不到 <b>${A.open.length}</b> 個${ex?'；另外為了連堂多鎖 '+ex+' 節':''}。${A.fixAll?`手排鎖課 ${A.fixAll} 節，沿用 <b>${A.fixed}</b> 節。`:''}</p>${A.warn.length?`<div class="probs">${A.warn.map(w=>'<div>'+esc(w)+'</div>').join('')}</div>`:''}</div>`+
        (A.open.length?`<div class="pg"><h2>${T}｜鎖不到課的節次</h2><table class="out">${thead(['班級','節次','資源班組別','原因'])}`+A.open.map(o=>`<tr><td class="c">${esc(o.cls)}</td><td>${esc(M.sn(o.s))}</td><td>${esc(o.groups.join('、'))}</td><td>${esc(o.why)}</td></tr>`).join('')+`</table><p class="note">這些節次學生照樣到資源班上課，只是原班那一節不是主科。想減少的話，可以到排課表把那一節移到別的時段。</p></div>`:'')+
        (A.idle.length?`<div class="pg"><h2>${T}｜手排鎖課沒用到的節次</h2><table class="out">${thead(['班級','節次','手排鎖的老師','科目'])}`+A.idle.sort((a,c)=>a.cls.localeCompare(c.cls)||a.s-c.s).map(o=>`<tr><td class="c">${esc(o.cls)}</td><td>${esc(M.sn(o.s))}</td><td>${esc(o.t)}</td><td>${esc(o.sj||'')}</td></tr>`).join('')+`</table><p class="note">手排時有鎖，但現在的課表這一節沒有這一班的學生被抽離，所以不會交給教務處。九年級英數理如果是教學組統一鎖的，也會列在這裡。</p></div>`:'');}
    b+=`<div class="pg"><h2>${T}｜資源班抽離課鎖課表（${printDate()} 印）</h2><table class="out">${thead(['班級','科目','任課老師','請排這一科的節次','節數','資源班組別'])}`+
      lockTable(M,ST.slot).map(r=>`<tr><td class="c">${esc(r.cls)}</td><td class="c">${esc(r.subject)}</td><td>${esc(r.teacher)}</td><td>${esc(slotsText(r.slots))}</td><td class="c">${r.slots.length}</td><td>${esc(r.groups.join('、'))}</td></tr>`).join('')+
      `</table><p class="note">外加課和不鎖課的課不占原班主科時間，沒有列在這張表。</p>${signLine()}</div>`;
  }else if(outMode==='homeroom'||outMode==='card'){
    const of={};M.L.forEach((x,l)=>{const s=ST.slot[l],g=M.G[x.g];if(s<0)return;g.stu.forEach(i=>{(of[i]=of[i]||{})[s]={g,l};});});
    const list=D.students.map((s,i)=>({s,i})).filter(o=>of[o.i]).sort((a,b2)=>sortStu(a.s,b2.s));
    if(outMode==='card'){const ttl=D.settings.cardTitle||'資源班課表';
      b=list.filter(o=>!outG||gradeOfCls(o.s.cls)===+outG).map(({s,i})=>`<div class="pg pcard"><h2>${esc(s.cls)}-${esc(s.seat)}${esc(s.name)}　${esc(ttl)}</h2>${cmName(s)?`<p class="dt">個管老師：${esc(tCall(cmName(s)))}</p>`:''}<table class="out pt">${thead(['節次/時間'].concat(DAYS.map(d=>'星期'+d)))}`+
        D.periods.map((p,pi)=>`<tr class="${pi%2?'alt':''}"><th>${esc(p.name)}${p.start&&!p.extra?`<small>${esc(p.start)}–${esc(p.end)}</small>`:''}</th>`+DAYS.map((d,di)=>{const o=of[i][di*M.NP+pi];if(!o)return '<td></td>';
          const c=SUBC[String(o.g.subject)[0]]||SUBC[''],tn=tName(o.g.t);
          return `<td><div class="pc" style="background:${c[0]};border-left-color:${c[1]};color:${c[2]}"><b>${esc(o.g.subject)}</b><span>${esc(tCall(tn))}</span><small>${roomOf(o.l)?'@ '+esc(roomOf(o.l)):''}</small></div></td>`;}).join('')+'</tr>').join('')+`</table></div>`).join('')||'<p class="note">這個年級沒有學生有排課。</p>';}
    else{
      // 給導師：每一節寫「原班 ○○課 → 資源班 ○○（老師・教室）」。彈性鎖課時原班鎖的科目可能和資源班不同，照配鎖課的結果寫
      const lk={};locksNow().forEach(k=>{lk[k.cls+'|'+k.s]=k;});
      const line=(s,x)=>{const o=of[s.i][x],g=o.g,pn=M.P[x%M.NP].name,to='資源班 '+g.subject+'（'+[tCall(tName(g.t)),roomOf(o.l)].filter(Boolean).join('・')+'）';
        if(!g.pull)return `<b>${esc(pn)}</b> <span class="tagv">外加</span> → ${esc(to)}`;
        const k=lk[s.s.cls+'|'+x],from=g.need&&k?'原班 '+k.sj+'課':g.need?'原班（這一節沒有鎖課）':'原班照常上課（不鎖課）';
        return `<b>${esc(pn)}</b> ${esc(from)} → ${esc(to)}`;};
      b=[...new Set(list.map(o=>String(o.s.cls)))].map(c=>{const ss=list.filter(o=>String(o.s.cls)===c),cms=[...new Set(ss.map(o=>cmName(o.s)).filter(Boolean))],hr=(D.classHead||{})[c];
        return `<div class="pg">${dt}<h2>${T}｜${esc(c)} 班 資源班抽離表</h2><p class="note">${hr?'導師：'+esc(tCall(hr))+'　':''}個管老師：${esc(cms.map(tCall).join('、')||'未指定')}</p><table class="out">${thead(['座號','姓名','個管老師'].concat(DAYS.map(d=>'週'+d)))}`+
        ss.map(o=>`<tr><td class="c">${esc(o.s.seat)}</td><td>${esc(o.s.name)}</td><td class="c">${esc(cmName(o.s))}</td>`+DAYS.map((d,di)=>'<td>'+Object.keys(of[o.i]).map(Number).filter(x=>Math.floor(x/M.NP)===di).sort((a,b2)=>a-b2).map(x=>line(o,x)).join('<br>')+'</td>').join('')+'</tr>').join('')+
        `</table><p class="note">以上節次學生到資源班上課，請導師協助提醒。標「外加」的是早自習、午休等外加時段，不占原班的課。</p>${signLine('　導師簽收：＿＿＿＿＿＿')}</div>`;}).join('');}
  }else if(outMode==='regular'){
    // 給原班任課老師：他哪一班、哪一節有學生被抽離、去上什麼。老師來自鎖課（彈性鎖課照配鎖課結果）
    const by={};locksNow().forEach(k=>{if(k.t>=0&&!k.extra)(by[k.t]=by[k.t]||[]).push(k);});
    const outAt=(cls,s)=>{const r=[];M.L.forEach((x,l)=>{if(ST.slot[l]!==s)return;const g=M.G[x.g];if(!g.need)return;g.stu.forEach(i=>{const st=D.students[i];if(String(st.cls)===cls)r.push({st,g,l});});});return r.sort((a,c)=>sortStu(a.st,c.st));};
    b=Object.keys(by).map(Number).sort((a,c)=>tName(a).localeCompare(tName(c))).map(t=>`<div class="pg">${dt}<h2>${T}｜給 ${esc(tCall(tName(t)))} 的抽離名單</h2><table class="out">${thead(['節次','班級','您這節的課','被抽離的學生','去資源班上'])}`+
      by[t].sort((a,c)=>a.s-c.s||a.cls.localeCompare(c.cls)).map(k=>{const st=outAt(k.cls,k.s);return `<tr><td>${esc(M.sn(k.s))}</td><td class="c">${esc(k.cls)}</td><td class="c">${esc(k.sj)}</td><td>${esc(st.map(o=>o.st.seat+' '+o.st.name).join('、'))}</td><td>${esc([...new Set(st.map(o=>o.g.subject+'（'+[tCall(tName(o.g.t)),roomOf(o.l)].filter(Boolean).join('・')+'）'))].join('、'))}</td></tr>`;}).join('')+
      `</table><p class="note">這些節次上面的學生到資源班上課，不在原班教室。</p>${signLine()}</div>`).join('')||'<p class="note">還沒有任何鎖課，請先到「任課老師」填各班原班老師。</p>';
  }else if(outMode==='cm'){
    // 一位個管老師一頁：他的個案在哪一班、上哪些組、每週幾節（私密欄位不印）
    const cms=D.teachers.filter(t=>D.students.some(s=>s.caseMgr===t.id));
    b=cms.map(t=>{const ss=D.students.map((s,i)=>({s,i})).filter(o=>o.s.caseMgr===t.id).sort((a,c)=>sortStu(a.s,c.s));
      return `<div class="pg"><h2>${T}｜${esc(tCall(t.name))} 個管個案一覽（${ss.length} 人）</h2><table class="out">${thead(['班級','座號','姓名','組別（老師）','每週節數','上課節次'])}`+
      ss.map(({s,i})=>{const gs=M.G.filter(g=>g.per&&g.stu.includes(i)),ls=M.L.map((x,l)=>l).filter(l=>gs.includes(M.G[M.L[l].g])&&ST.slot[l]>=0);
        return `<tr><td class="c">${esc(s.cls)}</td><td class="c">${esc(s.seat)}</td><td>${esc(s.name)}</td><td>${esc(gs.map(g=>g.name+(g.t>=0?'（'+tName(g.t)+'）':'')).join('、')||'尚未分組')}</td><td class="c">${ls.length}</td><td>${esc(slotsText(ls.map(l=>ST.slot[l]).sort((a,c)=>a-c)))}</td></tr>`;}).join('')+'</table></div>';}).join('')||'<p class="note">還沒有學生指定個管老師。</p>';
  }else if(outMode==='student'){
    const of={};M.L.forEach((x,l)=>{const s=ST.slot[l],g=M.G[x.g];if(s<0)return;g.stu.forEach(i=>{(of[i]=of[i]||[]).push({s,g});});});
    b=`<div class="pg"><h2>${T}｜學生抽離一覽</h2><table class="out">${thead(['班級','座號','姓名'].concat(DAYS.map(d=>'週'+d),['每週']))}`+
      D.students.map((s,i)=>({s,i})).filter(o=>of[o.i]).sort((a,b2)=>sortStu(a.s,b2.s)).map(({s,i})=>`<tr><td class="c">${esc(s.cls)}</td><td class="c">${esc(s.seat)}</td><td>${esc(s.name)}</td>`+
        DAYS.map((d,di)=>'<td>'+of[i].filter(o=>Math.floor(o.s/M.NP)===di).sort((a,b2)=>a.s-b2.s).map(o=>esc(M.P[o.s%M.NP].name+' '+o.g.name)).join('<br>')+'</td>').join('')+`<td class="c">${of[i].length}</td></tr>`).join('')+'</table></div>';
  }else{
    b=`<div class="pg"><h2>${T}｜組別總表</h2><table class="out">${thead(['組別','科目','型態','老師','教室','上課節次','學生'])}`+
      M.G.filter(g=>g.per).map(g=>{const ls=M.L.map((x,l)=>l).filter(l=>M.L[l].g===g.gi&&ST.slot[l]>=0),rs=[...new Set(ls.map(l=>ROOM[l]).filter(r=>r>=0).map(r=>D.rooms[r].name))];
        return `<tr><td><b>${esc(g.name)}</b></td><td class="c">${esc(g.subject)}</td><td class="c">${esc(g.ref.mode||'抽離')}</td><td>${esc(tName(g.t))}</td><td>${esc(rs.join('、'))}</td><td>${esc(slotsText(ls.map(l=>ST.slot[l]).sort((a,c)=>a-c)))}</td><td>${esc(g.stu.map(i=>stuLabel(D.students[i])).join('、'))}</td></tr>`;}).join('')+'</table></div>';
  }
  $('page').innerHTML=h+`<div id="outArea">${b}</div>`;
}
function copyOut(){const el=$('outArea');if(!el)return;const r=document.createRange();r.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(r);
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}s.removeAllRanges();toast(ok?'已複製，可以貼到 Word 或 LINE':'複製失敗，請手動選取後複製');}

/* ───── 名冊｜學期初匯入、資料與備份：讓學校自己把每學期的資料帶進來 ───── */
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
async function readXls(inp){const fs=[...inp.files];inp.value='';if(!fs.length)return;busyOn('正在讀取 Excel…');
  try{await needXLSX();}catch(e){busyOff();toast('讀 Excel 的元件下載失敗，請確認有網路；或改用各頁的「貼上」');return;}
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
  finally{busyOff();}
  XL.skip=skip;if(!XL.length)toast('這些檔案裡沒有認得的工作表（學生名單、任課老師名單、課程一覽表、不排課時段、手排鎖課）');render();}
function xlImport(){const on=XL.filter(x=>x.on);if(!on.length){toast('請先勾選要匯入的工作表');return;}
  if(!confirm('要匯入勾選的 '+on.length+' 張工作表嗎？\n匯入前會自動保留一份目前的資料，匯錯了可以回到舊版本。'))return;
  // 學生名單先讀：個管老師會先建成資源班老師，課程一覽表後面用 normName 對回同一位，不會重複
  snapshot('匯入 Excel 之前');const order=['stu','tl','course','off','lock'],out=[],SR={conflict:[],newCM:[],noCM:[]},CR={kept:[],coT:[]};
  // 資料輸入和資料輸出是同一份鎖課，兩張都勾時只讀一張
  const lk=on.filter(x=>x.type==='lock');if(lk.length>1)lk.slice(1).forEach(x=>{x.on=false;});
  order.forEach(t=>on.filter(x=>x.type===t&&x.on).forEach(x=>{const nm='「'+x.sheet+'」';
    if(t==='lock'){const r=importLocks(D,x.tsv);out.push(nm+'：手排鎖課 '+r.n+' 節、'+r.cls+' 個班（之前的手排鎖課整份換成這一份）'+(r.newT.length?'；新增老師 '+r.newT.join('、'):''));}
    if(t==='stu'){const r=importStudents(D,x.tsv);['conflict','newCM','noCM'].forEach(k=>{SR[k]=SR[k].concat(r[k]);});out.push(nm+'：新增 '+r.add+' 位學生、更新 '+r.upd+' 位'+(r.cm?'，個管老師 '+r.cm+' 位':'')+(r.conflict.length?'；'+r.conflict.length+' 筆座號相同但姓名不同（見下方）':''));}
    if(t==='tl'){const r=importTeacherList(D,x.tsv);out.push(nm+'：'+r.classes+' 個班、'+r.set+' 格任課老師'+(r.changed?'（其中 '+r.changed+' 格換了老師）':'')+(r.newT.length?'，新增 '+r.newT.length+' 位老師':''));}
    if(t==='course'){const r=importCourseTable(D,x.tsv);CR.kept=CR.kept.concat(r.kept);CR.coT=CR.coT.concat(r.coT);out.push(nm+'：新增 '+r.added+' 門課、更新 '+r.updated+' 門，放進課裡的學生共 '+r.members+' 筆'+(r.hours?'，基本鐘點 '+r.hours+' 位':'')+(r.miss.length?'；名冊找不到的學生：'+[...new Set(r.miss)].join('、'):''));}
    if(t==='off'){const r=importOff(D,x.tsv,{hard:hardVal('xl'),addTeachers:$('xlAdd')&&$('xlAdd').checked});out.push(nm+'：班級 '+r.cls+' 列、老師 '+r.tea+' 列，新增 '+r.cells+' 格（已經有的不會重複加）'+(r.skipT.length?'；不在名冊、略過的老師 '+r.skipT.length+' 位':''));}}));
  D=normalize(D);XL=[];changed();render();
  SR.newCM=[...new Set(SR.newCM)];SR.noCM=[...new Set(SR.noCM)];
  openDlg(`<h3>匯入完成</h3><ul class="plain">${out.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>${stuImportHtml(SR)}${courseNoteHtml(CR)}<p class="note">如果匯錯了，到「名冊 › 資料與備份」的「自動保留的版本」回到匯入之前。</p><div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="closeDlg()">知道了</button></div>`);offWarn();}

function pasteTL(){openDlg(`<h3>貼上任課老師名單</h3><p class="note">兩種格式都可以：</p><ol class="note"><li>教務處的<b>教師名單</b>：一列是班級（701、702…），下面每一列是一科（國語文、英語文、數學、理化）和各班的老師。七、八、九年級可以一起貼。</li><li>一列一筆：<b>班級、科目、老師</b>。</li></ol>
  <p class="note">名冊裡沒有的老師會自動新增；同一班同一科已經有老師的會換成新的。</p>
  <textarea id="pasteBox" placeholder="&#9;701&#9;702&#9;703&#10;國語文&#9;王老師&#9;李老師&#9;陳老師&#10;英語文&#9;…"></textarea>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="pasteTLOk()">帶入</button><button class="b" onclick="closeDlg()">取消</button></div>`);}
function pasteTLOk(){const txt=$('pasteBox').value;if(!txt.trim())return;snapshot('貼上任課老師名單之前');const r=importTeacherList(D,txt);
  if(!r.set){toast('沒有讀到任課老師，請確認是從 Excel 複製（欄位之間是 Tab）');return;}
  changed();closeDlg();render();toast(r.classes+' 個班、'+r.set+' 格任課老師'+(r.changed?'，'+r.changed+' 格換了老師':'')+(r.newT.length?'，新增 '+r.newT.length+' 位老師':''));}
function pasteLocks(){openDlg(`<h3>貼上手排鎖課</h3><p class="note">已經手排好的鎖課可以帶進來，排課時會盡量沿用，配鎖課時優先照手排的老師。兩種都可以：</p><ol class="note"><li>「特教鎖課需求」的<b>資料輸入</b>：整張選取（Ctrl+A）複製貼上，格子裡填的是老師名字。</li><li><b>資料輸出</b>：班級名稱、科目名稱、星期、首節、末節、教師姓名。</li></ol>
  <p class="note">貼上後會整份換掉之前的手排鎖課。不想沿用時，到「學期初匯入」按清除。</p>
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
  const what=[o.promote&&'升年級（九年級學生移出名冊；全校課表、各班導師也會清掉）',o.clearAssign&&'清空排課結果',o.clearGroups&&'清空所有課程',o.clearCS&&'清空任課老師',o.clearClassOff&&'清空班級不排課',o.clearTeaOff&&'清空所有老師的不排課'].filter(Boolean);
  if(!confirm('開始新學期：\n'+(what.length?what.map(x=>'・'+x).join('\n'):'只改學期名稱')+'\n\n目前的資料會先自動保留一份；也建議先按「下載備份檔」存一份在電腦裡。確定嗎？'))return;
  snapshot('開始新學期之前');const r=newTerm(D,o);D=normalize(D);undoStack=[];changed();$('title').value=D.title;paintSchool();render();
  toast('已開始新學期'+(o.promote?'：'+r.up+' 位學生升一個年級，'+r.grad+' 位畢業移出名冊。全校課表已清除，請讀入新學年的課表':''));}

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
  let h=`<p class="guide">每學期照下面的順序，把學校本來就有的表格帶進來，就能自己排課，不需要找人幫忙：<b>①</b> 視需要到「資料與備份」按「開始新學期」<b>②</b> 上傳學校的 Excel（或在各列按「貼上」）<b>③</b> 補上資源班老師自己的不排課時段 <b>④</b> 到「排課」按一鍵排課。</p>
  <h3>上傳學校的 Excel</h3><p class="note">可以一次選好幾個檔案。系統會自己認出裡面的<b>學生名單、任課老師名單（教師名單）、課程一覽表、班級不排課、教師不排課、手排鎖課（資料輸入或資料輸出）</b>，其他工作表會略過。Google 試算表請先按「檔案 › 下載 › Microsoft Excel」。檔案只在這台電腦的瀏覽器裡讀，不會上傳到任何地方。</p>
  <div class="bar"><input type="file" id="xlsIn" accept=".xlsx,.xls,.xlsm,.csv,.ods" multiple style="display:none" onchange="readXls(this)"><button class="b pri" onclick="$('xlsIn').click()">選擇 Excel 檔</button></div>`;
  if(XL.length)h+=`<div class="xlbox"><table class="ed"><tr><th></th><th>檔案</th><th>工作表</th><th>認成</th><th>列數</th></tr>${XL.map((x,i)=>`<tr><td><input type="checkbox"${x.on?' checked':''} onchange="XL[${i}].on=this.checked"></td><td class="dim">${esc(x.file)}</td><td>${esc(x.sheet)}</td><td><b>${XLT[x.type]}</b></td><td class="dim">${x.n}</td></tr>`).join('')}</table>
    ${XL.skip?`<p class="note">另外有 ${XL.skip} 張工作表看不出是哪一種，已略過。</p>`:''}
    ${XL.some(x=>x.type==='off')?`${hardPick('xl')}<label class="note"><input type="checkbox" id="xlAdd"> 教師不排課裡名冊沒有的老師也新增（不勾就只帶入名冊裡有的老師）</label>`:''}
    <div class="bar"><button class="b pri" onclick="xlImport()">匯入勾選的工作表</button><button class="b" onclick="XL=[];render()">取消</button></div></div>`;
  h+=`<h3>資料清單</h3><div class="scroll"><table class="ed chklist"><tr><th>資料</th><th>目前</th><th>學校的哪一份表</th><th></th></tr>${rows.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="dim">${r[2]}</td><td class="nw">${r[3]}</td></tr>`).join('')}</table></div>
  <p class="note">開始新學期、下載備份、從備份檔還原、回到自動保留的版本，都在 <a class="lk" onclick="go('roster','backup')">名冊 › 資料與備份</a>。</p>`;
  $('page').innerHTML=h;
}
/* ───── 名冊｜資料與備份：下載備份、還原、自動保留的版本、開始新學期、全部清空，集中在這一頁 ───── */
function renderBackup(){
  let h=`<p class="guide">這台電腦的資料怎麼保存、怎麼救回來，都在這一頁。</p>
  <h3>備份與還原</h3><p class="note">${cloudState==='on'?'目前登入共用中，資料存在雲端，名單裡的老師都看得到同一份。':'目前資料只存在這台電腦的這個瀏覽器。換電腦或清除瀏覽器資料前，請先下載備份檔；想讓幾位老師共用同一份，可以設定學校自己的雲端。'}</p>
  <div class="bar"><button class="b pri" onclick="exportJson()">下載備份檔</button><button class="b" onclick="$('imp').click()">從備份檔還原</button><button class="b" onclick="openShare(1)">共用與學校自己的雲端</button>${(()=>{const lb=+localStorage.getItem(LBKEY)||0;return `<span class="note" style="margin:0">${lb?'上次下載備份：'+fmtTime(lb):'還沒下載過備份檔'}</span>`;})()}</div>
  <h3>開始新學期</h3><p class="note">勾選要清掉的部分，沒勾的會留著。學生、老師、教室、作息、個管老師、年級共同時段都會保留。</p>
  <div class="rules"><label>學期名稱 <input type="text" id="ntTitle" class="w12" value="${esc(D.title||'')}"></label>
    <label><input type="checkbox" id="ntAssign" checked> 清空排課結果（課程留著，重新排）</label>
    <label><input type="checkbox" id="ntGroups"> 清空所有課程（之後重新貼課程一覽表）</label>
    <label><input type="checkbox" id="ntCS"> 清空各班任課老師</label>
    <label><input type="checkbox" id="ntCOff"> 清空班級不排課、不能鎖課</label>
    <label><input type="checkbox" id="ntTOff"> 清空所有老師的不排課時段</label>
    <label><input type="checkbox" id="ntUp"> <b>新學年升年級</b>：七年級變八年級、八年級變九年級（701→801），九年級學生畢業移出名冊。班級號碼會變，所以課程、任課老師、班級不排課會一起清空</label></div>
  <div class="bar"><button class="b pri" onclick="startTerm()">開始新學期</button><button class="b" onclick="exportJson()">先下載備份檔</button></div>
  <h3>自動保留的版本</h3><p class="note">每天第一次修改，以及匯入、開始新學期、還原之前，都會在這台電腦自動留一份（最多 12 份）。改壞了可以回到之前的版本。</p>`;
  const a=snaps();h+=a.length?`<div class="scroll"><table class="ed"><tr><th>時間</th><th>說明</th><th>學生／課程</th><th></th></tr>${a.map((x,i)=>{let n='';try{const o=JSON.parse(x.json);n=(o.students||[]).length+' 位／'+(o.groups||[]).length+' 門';}catch(e){}return `<tr><td>${fmtTime(x.at)}</td><td>${esc(x.label)}</td><td class="dim">${n}</td><td><button class="b sm" onclick="restoreSnap(${i})">回到這個版本</button></td></tr>`;}).reverse().join('')}</table></div>`:'<p class="note">還沒有。</p>';
  h+=`<h3>全部清空</h3><p class="note">把名冊、分組、排法、段考考場與點名紀錄全部清掉，回到空白。清空前會自動保留一份。</p><div class="bar"><button class="b danger" onclick="resetAll()">全部清空</button></div>`;
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
  TTJOB={done:0,total:0,msg:'正在讀取課表…',pages:[]};render();
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
  return arr.map(({s,x})=>`<span class="${x[2]?'warn':''}" title="${esc(s+' '+x[1]+' 節'+(x[2]===2?'（推測的名字，請核對）':x[2]?'（認不出，請核對）':''))}">${esc(x[0])}</span>`).join('<br>');}
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
  // 改成另一個已經有課表的班級，會蓋掉那一班：先問
  if(nc!==c&&D.tt[nc]&&!confirm(nc+' 已經有課表了（'+(D.tt[nc].src||'之前讀進來的')+'）。\n要用這一頁蓋掉 '+nc+' 原本的課表嗎？'))return;
  [...$('ttRows').querySelectorAll('tr')].slice(1).forEach(tr=>{const v=[...tr.querySelectorAll('input')].map(i=>i.value.trim());if(v[0]&&v[1])list.push({sj:v[0],t:v[1],n:+v[2]||1,unk:false});});
  snapshot('修改課表之前');const src=D.tt[c].src;delete D.tt[c];if(TTIMG[c]){TTIMG[nc]=TTIMG[c];}ttStore(D,nc,list,src);changed();closeDlg();render();toast('已儲存 '+nc+' 的課表');}
function ttApplyCS(){const tt=D.tt||{};let n=0;const list=[];
  Object.keys(tt).filter(c=>/^\d{3,4}$/.test(c)).forEach(c=>[['國語文','國文'],['英語文','英文'],['數學','數學'],['理化','理化']].forEach(([a,b])=>{const x=(tt[c].subj[a]||[])[0];if(!x||x[2])return;list.push([c,b,x[0]]);}));
  if(!list.length){toast('課表裡沒有可以用的國英數理老師');return;}
  if(!confirm('用課表裡的國英數理老師更新各班任課老師（'+list.length+' 格）？認不出來的名字不會用。'))return;
  snapshot('用課表更新任課老師之前');list.forEach(([c,b,name])=>{const t=findTeacher(D,name,'普通班'),k=c+'|'+canonSubj(D,b);if(D.classSubj[k]!==t.id){D.classSubj[k]=t.id;n++;}});
  D=normalize(D);changed();render();toast('更新了 '+n+' 格任課老師');}
function ttClear(){if(!confirm('清除讀進來的全校課表？'))return;snapshot('清除全校課表之前');D.tt={};changed();render();}

/* ───── 個管分配建議：先看建議、勾選要改的，再套用 ───── */
let CMR=null;
function cmOpen(){const res=D.teachers.filter(t=>t.role==='資源班');if(!res.length){toast('先在「名冊 › 老師」新增資源班老師');return;}
  openDlg(`<h3>建議個管分配</h3><p class="note">系統會依這幾個原則建議：已經有個管的盡量不換；有教到這位學生的老師優先；同年級、同班的學生盡量給同一位，個管要聯絡的導師比較少；人數平均。只是建議，勾選後才會改。</p>
  <div class="scroll"><table class="ed"><tr><th>資源班老師</th><th>目前個管</th><th>最多帶幾位</th><th>不當個管</th></tr>${res.map(t=>`<tr><td>${esc(t.name)}</td><td class="dim">${D.students.filter(s=>s.caseMgr===t.id).length} 位</td>
    <td><input type="number" min="0" max="60" class="w3" value="${+t.cmCap>0?t.cmCap:''}" placeholder="平均" onchange="cmSetT('${t.id}','cmCap',this.value)"></td>
    <td><input type="checkbox"${t.noCM?' checked':''} onchange="cmSetT('${t.id}','noCM',this.checked)"></td></tr>`).join('')}</table></div>
  <label class="note" style="display:block;margin:8px 0"><input type="checkbox" id="cmKeep" checked> 已經有個管的學生盡量不換（取消勾選＝全部重新分配）</label>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="cmRun()">產生建議</button><button class="b" onclick="closeDlg()">取消</button></div><div id="cmOut"></div>`);}
function cmSetT(id,k,v){const t=D.teachers.find(x=>x.id===id);if(!t)return;if(k==='cmCap'){if(+v>0)t.cmCap=+v;else delete t.cmCap;}else{if(v)t.noCM=true;else delete t.noCM;}changed();}
function cmRun(){CMR=suggestCaseMgr(D,{keep:$('cmKeep').checked});const out=$('cmOut');if(!CMR.list.length){out.innerHTML='<p class="note">'+esc(CMR.note||'沒有學生')+'</p>';return;}
  const ch=CMR.list.filter(x=>x.change);
  out.innerHTML=`<h3>分配後每位老師</h3><div class="scroll"><table class="ed"><tr><th>老師</th><th>人數</th><th>年級</th><th>要聯絡的班級</th><th>有教到的</th></tr>${CMR.summary.map(s=>`<tr><td>${esc(s.name)}</td><td>${s.n}<span class="dim"> / ${s.capSet?'上限 ':'約 '}${s.cap}</span>${s.n>s.cap?' <span class="warn">超過</span>':''}</td><td>${s.grades.map(g=>g+' 年級').join('、')||'－'}</td><td>${s.classes} 班</td><td>${s.taught} 位</td></tr>`).join('')}</table></div>
  <h3>要改的學生 <span class="note" style="font-weight:normal">${ch.length} 位${ch.length?'，勾選的才會改':''}</span></h3>`+
  (ch.length?`<div class="scroll" style="max-height:40vh"><table class="ed"><tr><th><input type="checkbox" checked onchange="document.querySelectorAll('.cmChk').forEach(c=>c.checked=this.checked)"></th><th>班級座號</th><th>姓名</th><th>目前</th><th>建議</th><th>理由</th></tr>${ch.map(x=>`<tr><td><input type="checkbox" class="cmChk" value="${esc(x.sid)}" checked></td><td>${esc(x.cls)}${x.seat?'-'+esc(String(x.seat).padStart(2,'0')):''}</td><td>${esc(x.name)}</td><td class="dim">${esc(x.fromName||'沒有')}</td><td><b>${esc(x.toName)}</b></td><td class="dim">${esc(x.why.join('、')||'平均人數')}</td></tr>`).join('')}</table></div>
  <div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="cmApply()">套用勾選的</button></div>`:'<p class="note">目前的分配已經符合原則，不需要改。</p>');}
function cmApply(){if(!CMR)return;const ids=new Set([...document.querySelectorAll('.cmChk:checked')].map(c=>c.value));if(!ids.size){toast('沒有勾選');return;}
  snapshot('個管分配之前');let n=0;CMR.list.forEach(x=>{if(!ids.has(x.sid))return;const s=D.students.find(y=>y.id===x.sid);if(s&&s.caseMgr!==x.to){s.caseMgr=x.to;n++;}});
  CMR=null;changed();closeDlg();render();toast('已更新 '+n+' 位學生的個管老師；要退回可以到「匯入與新學期」的自動保留版本');}
/* ───── Gemini（AI 設定、AI 排課候選、用文字調整、說明問題、看圖核對全校課表）─────
   連線在 gemini.js、題目與檢查在 ai.js，伺服器端代理在 functions/ai.js，這裡只有畫面。
   原則：本機排課程式是裁判，AI 只提候選；送出前去識別化；第一次送出前給老師看內容；每次使用都記在這台瀏覽器。
   AI 回來的文字一律用 textContent 放進畫面（gmEl），不放進 innerHTML、也不放進 onclick 字串。
   為了不和別的分支改同一行，原本的 aiOpen、renderBoard、renderTT、ttEdit、ttEditOk 不直接改，在這裡包一層。 */
let gmCtl=null,GMTT=null,gmTTCtl=null;const TTSUG={};
GEMINI.config({   // 代理模式用 Firebase 登入：有沒有登入、ID token、目前的專案
  signedIn:()=>typeof CLOUD!=='undefined'&&!!CLOUD&&!!CLOUD.user&&cloudState==='on',
  idToken:()=>CLOUD&&CLOUD.user?CLOUD.user.getIdToken():'',
  projectId:()=>(window.FIREBASE_CONFIG&&window.FIREBASE_CONFIG.projectId)||''
});
// 安全地建立畫面元素：文字一律當文字，事件用 addEventListener
function gmEl(tag,attrs,...kids){const e=document.createElement(tag);
  for(const k in attrs||{}){const v=attrs[k];if(v==null||v===false)continue;
    if(/^on/.test(k))e.addEventListener(k.slice(2),v);else if(k==='class')e.className=v;else if(['value','checked','disabled','hidden','type','src','href','htmlFor','title','placeholder'].includes(k))e[k]=v;else e.setAttribute(k,v===true?'':String(v));}
  kids.flat(9).forEach(c=>{if(c==null||c===false)return;e.append(c instanceof Node?c:String(c));});return e;}
const gmReady=()=>typeof GEMINI!=='undefined'&&GEMINI.ready();
const gmMsg=e=>e&&e.name==='GeminiError'?e.message:'發生錯誤：'+((e&&e.message)||e);
const gmLabel=id=>{const c=GEMINI.cached(),m=c&&c.list.find(x=>x.id===id);return m?m.label:id;};
const gmModeText=()=>GEMINI.getMode()==='proxy'?'學校的 AI 服務':'你自己的金鑰';
const GM_KIND={sched:'AI 排課',adj:'用文字調整',explain:'說明問題',tt:'看圖核對課表',paste:'複製貼上的 AI 排法'};
function gmSetStatus(t,bad){const el=$('gmSt');if(el){el.textContent=t||'';el.className='gmst'+(bad?' bad':'');}}
function gmStart(t){if(gmCtl)gmCtl.abort();gmCtl=new AbortController();gmSetStatus(t);const b=$('gmStop');if(b)b.hidden=false;document.querySelectorAll('.gmgo').forEach(x=>{x.disabled=true;});return gmCtl.signal;}
function gmEnd(){gmCtl=null;const b=$('gmStop');if(b)b.hidden=true;document.querySelectorAll('.gmgo').forEach(x=>{x.disabled=false;});}
$('dlg').addEventListener('close',()=>{if(gmCtl)gmCtl.abort();});   // 關掉對話框就不等了，免得回覆回來時改到別的畫面
// 「狀態列＋取消」：每個 AI 對話框共用
const gmBar=(label,go)=>gmEl('div',{class:'bar'},gmEl('button',{class:'b pri gmgo',onclick:go},label),gmEl('button',{class:'b',id:'gmStop',hidden:true,onclick:()=>{if(gmCtl)gmCtl.abort();}},'取消'),gmEl('span',{id:'gmSt',class:'gmst'}));
// 每個 AI 功能底下的一行提醒：資料去哪裡、送了什麼
function gmNotice(what){return gmEl('p',{class:'aisafe'},'資料會送到 Google 的 Gemini 處理（'+gmModeText()+'）。'+what+(GEMINI.getMode()==='browser'?'用自己的金鑰時，免費方案的內容可能被 Google 用來改進服務；正式的學生資料請用學校的 AI 服務或付費金鑰。':''));}
function gmNoReady(what){return gmEl('p',{class:'aisafe'},'接上 Gemini 之後，'+what+'。',gmEl('button',{class:'b sm',onclick:gmSettings},'AI 設定'));}
// 快照的時間：寫進使用紀錄，之後可以「回到這次之前」
function gmSnap(label){snapshot(label);const a=snaps();return a.length?a[a.length-1].at:0;}

/* 第一次送出某一種資料前，先給老師看會送出什麼；按「送出」才送，之後同一種就不再問（使用紀錄裡隨時可以再看） */
function gmPreview(kind,req,host){
  if(GEMINI.seen(kind))return Promise.resolve(true);
  return new Promise(done=>{const box=gmEl('div',{class:'gmprev'},
    gmEl('b',null,'第一次使用「'+GM_KIND[kind]+'」：下面是會送給 Gemini 的全部內容'),
    gmEl('p',{class:'note'},'學生姓名一律換成代號'+(GEMINI.namesOk()?'；你已同意送出老師姓名':'，老師姓名也換成代號')+(req.scrubbed?'（這次換掉 '+req.scrubbed+' 處）':'')+'。確認沒有不該送的資料再按「送出」。'),
    (req.images||[]).map(src=>gmEl('img',{src,class:'gmimg',alt:'要送出的圖片'})),
    gmEl('pre',{class:'gmpre'},(req.system?'【系統說明】\n'+req.system+'\n\n':'')+req.prompt),
    gmEl('div',{class:'bar'},gmEl('button',{class:'b pri',onclick:()=>{GEMINI.setSeen(kind);box.remove();done(true);}},'送出'),gmEl('button',{class:'b',onclick:()=>{box.remove();done(false);}},'不要送')));
    host.replaceChildren(box);});
}
// 送出：預覽 → 呼叫 → 回傳結果（取消或失敗時回 null，狀態列會寫原因）
async function gmAsk(kind,req,host,msg){
  if(!(await gmPreview(kind,req,host))){gmSetStatus('沒有送出');return null;}
  const signal=gmStart(msg||'Gemini 想想看…');
  try{const r=await GEMINI.generate(Object.assign({},req,{kind,signal,names:kind==='tt'||GEMINI.namesOk(),onWait:e=>gmSetStatus(e.message+' 系統會自動再試一次…')}));gmEnd();gmSetStatus('');return r;}
  catch(e){gmEnd();gmSetStatus(gmMsg(e),e.code!=='cancel');return null;}
}

/* ───── AI 設定：放在側邊欄，因為它是「這台瀏覽器」的設定，不屬於學校的名冊資料 ───── */
function gmSettings(){openDlg('');const B=$('dlgBody'),c=GEMINI.cached(),mode=GEMINI.getMode(),signed=GEMINI.config&&typeof CLOUD!=='undefined'&&!!CLOUD&&!!CLOUD.user&&cloudState==='on';
  const cur=GEMINI.getModel(),def=c?GEMINI.defaultModel(c.list):'',add=new Set((c&&c.added)||[]);
  const radio=(v,label,sub)=>gmEl('label',{class:'gmmode'},gmEl('input',{type:'radio',name:'gmMode',value:v,checked:mode===v,onchange:()=>{GEMINI.setMode(v);gmSettings();}}),gmEl('b',null,label),gmEl('small',null,sub));
  const keyIn=gmEl('input',{type:'password',id:'gmKey',class:'gmkey',value:GEMINI.getKey(),placeholder:'貼上 Gemini API 金鑰',autocomplete:'off',spellcheck:'false'});
  const sel=gmEl('select',{id:'gmModel',disabled:!(c&&c.list.length),onchange:e=>{GEMINI.setModel(e.target.value);toast('改用 '+gmLabel(e.target.value));}},
    c&&c.list.length?c.list.map(m=>gmEl('option',{value:m.id,selected:m.id===cur},m.label+(m.id===def?'（建議）':'')+(m.preview?'（預覽版）':'')+(add.has(m.id)?'（新）':''))):gmEl('option',null,'先按「測試連線」，系統會查出可以用的模型'));
  B.append(gmEl('h3',null,'AI 設定（Google Gemini）'),
    gmEl('p',{class:'note'},'接上 Gemini 之後：排課頁可以請 AI 提一份候選排法（系統檢查過比現在好才給你選）、用文字加限制或調整、請 AI 用白話說明排不開的原因；全校課表頁可以請 AI 看圖核對認不出的老師。不接也沒關係，原本的功能都照常。'),
    gmEl('h4',null,'1. 連線方式'),
    radio('proxy','學校的 AI 服務（建議）','登入雲端後使用，經過學校的 Firebase 伺服器呼叫 Google Vertex AI；瀏覽器裡沒有金鑰，每次使用都有稽核紀錄。'+(signed?'':'（現在沒有登入雲端，不能用）')),
    radio('browser','自己的金鑰（個人試用）','瀏覽器直接呼叫 Google，適合沒有雲端時自己試用。'),
    mode==='browser'?gmEl('div',null,
      gmEl('div',{class:'aisafe warnbox'},gmEl('b',null,'請注意：'),'資料會直接送到 Google。免費金鑰的內容可能被 Google 用來改進服務；有真實學生資料時，請改用「學校的 AI 服務」或已開通付費的金鑰。金鑰只存在這台電腦的這個瀏覽器（不進名冊、不跟著雲端或備份出去），但網頁若被植入惡意程式就可能被偷，公用電腦用完請按「清除金鑰」。'),
      gmEl('p',{class:'note'},'到 ',gmEl('a',{href:GEMINI.AI_STUDIO,target:'_blank',rel:'noopener'},'Google AI Studio'),' 用 Google 帳號登入，按「Create API key」（建立 API 金鑰），把那一串 AIza 開頭的字貼到下面。'),
      gmEl('div',{class:'bar'},keyIn,gmEl('button',{class:'b sm',onclick:()=>{keyIn.type=keyIn.type==='password'?'text':'password';}},'顯示'))):
      gmEl('p',{class:'note'},'服務網址：'+(GEMINI.getProxy()||'（還沒有：請先登入雲端）')+'。只有共用名單裡「編輯」以上的老師可以用，每人每分鐘、每天有次數上限。'),
    gmEl('div',{class:'bar'},gmEl('button',{class:'b pri gmgo',onclick:gmTest},mode==='browser'?'儲存並測試連線':'測試連線'),
      GEMINI.getKey()?gmEl('button',{class:'b',onclick:()=>{if(!confirm('清除這個瀏覽器裡的 Gemini 金鑰？'))return;GEMINI.setKey('');gmSettings();toast('已清除金鑰');}},'清除金鑰'):null,
      gmEl('button',{class:'b',id:'gmStop',hidden:true,onclick:()=>{if(gmCtl)gmCtl.abort();}},'取消'),gmEl('span',{id:'gmSt',class:'gmst'})),
    gmEl('h4',null,'2. 模型'),
    gmEl('div',{class:'bar'},sel,gmEl('button',{class:'b gmgo',onclick:gmRefresh,disabled:!GEMINI.ready()},'重新整理模型清單')),
    gmEl('p',{class:'note'},'清單是直接向 Google 查的，新模型出來會自動出現（每天自動檢查一次）'+(c?'；上次檢查 '+fmtTime(c.at)+'，有 '+c.list.length+' 個可以用':'')+'。建議用標「建議」的；pro 比較聰明但比較慢、額度比較少；預覽版可能隨時被換掉。'),
    gmEl('h4',null,'3. 送出哪些資料'),
    gmEl('label',{class:'note'},gmEl('input',{type:'checkbox',checked:GEMINI.namesOk(),onchange:e=>{GEMINI.setNamesOk(e.target.checked);}}),' 可以送出老師姓名（不勾的話，老師也換成代號 T1、T2…；看圖核對課表一定要勾，因為圖上就有名字）'),
    gmEl('ul',{class:'note gmul'},gmEl('li',null,'學生姓名一律換成代號（S1、S2…），不會送出。'),gmEl('li',null,'每一種功能第一次送出前，會先給你看完整內容。'),gmEl('li',null,'學校的 AI 服務在伺服器上會再換一次姓名，並記下誰、何時、用途、用量（不記內容）。')),
    gmEl('h4',null,'4. 這台瀏覽器的使用紀錄'),gmLogView(),
    gmEl('div',{class:'bar',style:'margin:12px 0 0'},gmEl('button',{class:'b',onclick:()=>{if(!confirm('清除這個瀏覽器裡所有 Gemini 設定與使用紀錄？'))return;GEMINI.forget();gmSettings();toast('已清除');}},'全部清除'),gmEl('button',{class:'b',onclick:closeDlg},'關閉')));}
// 使用紀錄：每次送了什麼、回了什麼、最後套用了什麼；套用過的可以回到那次之前
function gmLogView(){const a=GEMINI.logList().slice().reverse();if(!a.length)return gmEl('p',{class:'note'},'還沒有使用紀錄。');
  return gmEl('ul',{class:'gmlog'},a.map(x=>{const det=(t,s)=>gmEl('details',null,gmEl('summary',null,t),gmEl('pre',{class:'gmpre'},s||'（沒有）'));
    const i=x.snapAt?snaps().findIndex(s=>s.at===x.snapAt):-1;
    return gmEl('li',null,gmEl('div',null,gmEl('b',null,fmtTime(x.at)+' '+(GM_KIND[x.kind]||x.kind)),' '+(x.model||'')+(x.images?'（含 '+x.images+' 張圖）':'')),
      x.error?gmEl('div',{class:'warn'},'失敗：'+x.error):null,x.applied?gmEl('div',{class:'ok'},'已套用：'+x.applied):gmEl('div',{class:'dim'},x.error?'':'沒有套用'),
      det('送出的內容',x.prompt),det('Gemini 的回覆',x.reply),
      i>=0?gmEl('button',{class:'b sm',onclick:()=>{closeDlg();restoreSnap(i);}},'回到這次之前'):null);}));}
async function gmTest(){const k=$('gmKey');if(k){if(!k.value.trim()){toast('請先貼上金鑰');return;}GEMINI.setKey(k.value);}
  gmStart('連線中…');
  try{const r=await GEMINI.test();gmEnd();gmSettings();
    gmSetStatus(r.err?'找到 '+r.list.length+' 個模型；但試用「'+gmLabel(r.model)+'」時：'+gmMsg(r.err):'連線成功：找到 '+r.list.length+' 個模型，「'+gmLabel(r.model)+'」回覆「'+r.reply.slice(0,20)+'」',!!r.err);gmNews(r);}
  catch(e){gmEnd();gmSetStatus(gmMsg(e),true);}}
async function gmRefresh(){gmStart('查詢模型中…');
  try{const r=await GEMINI.ensureModels({force:true});gmEnd();gmSettings();gmSetStatus('已更新：有 '+r.list.length+' 個可以用'+(r.added.length?'，新的有 '+r.added.length+' 個':'，沒有新的'));gmNews(r);}
  catch(e){gmEnd();gmSetStatus(gmMsg(e),true);}}
function gmNews(r){if(r.added&&r.added.length)toast('Gemini 有新模型：'+r.added.slice(0,3).map(gmLabel).join('、')+(r.added.length>3?' 等 '+r.added.length+' 個':'')+'，可以到 AI 設定改用');
  if(r.dropped)toast('原本選的模型「'+r.dropped+'」已經下架，改用「'+gmLabel(GEMINI.getModel())+'」');}

/* ───── (a) AI 排課：Gemini 或複製貼上的 AI 排法都只是「候選」，本機檢查後比現在好才給選 ───── */
if(typeof aiOpen==='function'){const aiOpen0=aiOpen;aiOpen=function(){aiOpen0();const h=$('dlgBody').querySelector('h3');if(!h)return;
  const box=gmReady()?gmEl('div',{class:'gmbox'},gmEl('b',null,'直接請 Gemini 提一份排法（'+gmLabel(GEMINI.getModel())+'）'),
    gmEl('p',{class:'note'},'按一下就送出，不用複製貼上。回來的排法會先用系統的衝堂檢查比過：衝突沒有變多、而且比現在的好，才會讓你套用；不然會說明為什麼不採用。'),
    gmEl('label',{class:'note'},gmEl('input',{type:'checkbox',id:'gmFix',checked:true}),' Gemini 排好的先保留，衝突的那幾節交給系統修'),
    gmBar('請 Gemini 排',gmSched),gmEl('div',{id:'gmRes'}),gmNotice('學生、老師都換成代號，不送姓名。')):gmNoReady('可以按一下直接請 AI 排，不用複製貼上');
  h.after(box,gmEl('h4',null,'或用複製貼上'));};}
async function gmSched(){if(!M.L.length){toast('還沒有要排的組，請先到「老師開課」建立');return;}
  const D0=JSON.parse(JSON.stringify(D)),req=AI.schedRequest(D0,{names:GEMINI.namesOk()}),fix=$('gmFix')&&$('gmFix').checked,host=$('gmRes');host.replaceChildren();
  const r=await gmAsk('sched',req,host,'Gemini 排課中（題目 '+req.prompt.length+' 字）；pro 類的模型可能要想一兩分鐘…');if(!r)return;
  gmOffer(D0,r.json,req.v,fix,r.logId,host);}
// 評估候選排法並顯示：比現在好才有「套用」按鈕
function gmOffer(D0,reply,v,fix,logId,host){let K;
  try{K=AI.schedCheck(D0,reply,v);}catch(e){host.replaceChildren(gmEl('div',{class:'probs'},e.code==='stale'?e.message:'看不懂這份排法：'+(e.message||e)));if(logId)GEMINI.logUpdate(logId,{error:'無法套用：'+(e.message||e)});return;}
  let slot=K.S.slot,moved=0;if(fix&&K.viol){const R=AI.schedRepair(K.M,K.S,K.out,{seed:D.settings.seed||1});slot=R.slot;moved=R.moved;}
  const J=AI.schedJudge(M,ST.slot,K.M,slot),bad=K.out.filter(o=>o.k!=='un').length,tot=K.M.L.length;
  const line=t=>gmEl('div',null,t);
  const box=gmEl('div',{class:'probs'+(J.ok?' ok':'')},
    line('AI 排了 '+(tot-K.un)+' / '+tot+' 節'+(bad?'，其中 '+bad+' 個衝突':'，沒有衝突')+(K.un?'，'+K.un+' 節沒排':'')+'；新編入 '+K.r.members+' 人次。'),
    K.r.bad.length?gmEl('details',null,gmEl('summary',null,'有 '+K.r.bad.length+' 項不符合規則，沒有採用'),gmEl('ul',null,K.r.bad.slice(0,40).map(t=>gmEl('li',null,t)))):null,
    moved?line('系統修改了 '+moved+' 節衝突的課。'):null,
    line('和現在比：問題 '+J.cand.viol+'（現在 '+J.cur.viol+'）、待安排的學生 '+J.cand.pend+' 人次（現在 '+J.cur.pend+'）、分數 '+J.cand.cost.toFixed(1)+'（現在 '+J.cur.cost.toFixed(1)+'，越小越好）'+(K.M.flex?'、鎖不到課 '+J.cand.open+'（現在 '+J.cur.open+'）':'')+'。'),
    K.note?gmEl('div',{class:'dim'},'AI 的說明：'+AI.unscrub(D0,K.note)):null,
    J.ok?null:gmEl('div',{class:'err'},'不採用：'+J.why.join('；')+'。目前的課表不會被改動。'));
  const draft=typeof window.setDraft==='function';
  host.replaceChildren(box,J.ok?gmEl('div',{class:'bar'},gmEl('button',{class:'b pri',onclick:()=>gmSchedApply(K,slot,v,logId)},draft?'放進試排':'套用到課表'),
    gmEl('span',{class:'note',style:'margin:0'},draft?'放進試排後可以和目前的課表比較，再決定要不要確定。':'套用前會自動保留一份，可以按「復原」或在使用紀錄裡回到這次之前。')):null);
  if(logId)GEMINI.logUpdate(logId,{judged:J.ok?'比現在好':'不採用：'+J.why.join('；')});}
function gmSchedApply(K,slot,v,logId){if(isRO()){toast('你是檢視權限，不能修改');return;}
  if(aiProblem(D).v!==v){toast('資料在等待的時候被改過了，請重新請 AI 排');return;}
  const diff=AI.schedDiff(D,M,ST.slot,K.X,slot);pushUndo();const snapAt=gmSnap('AI 排課之前');
  K.X.groups.forEach(g=>{const d=D.groups.find(x=>x.id===g.id);if(d)d.students=g.students.slice();});   // AI 新編進課裡的學生
  rebuild();closeDlg();
  if(logId)GEMINI.logUpdate(logId,{applied:diff+(typeof window.setDraft==='function'?'（放進試排）':''),snapAt});
  if(typeof window.setDraft==='function'){D.assign=fromState(M,ST);save();window.setDraft(Int16Array.from(slot),'AI 排課');render();toast('AI 的排法放進試排了');return;}
  setST({slot:Int16Array.from(slot),pin:Uint8Array.from(K.S.pin),rfix:ST.rfix});commit();
  const o=[];evaluate(M,ST.slot,o);toast('已套用 AI 的排法（'+diff+'）；'+(o.length?'還有 '+o.length+' 個問題':'沒有衝堂'));}

/* ───── (b) 用文字加限制、調整：AI 只把文字拆成動作，每一項附原文那一句；系統檢查後老師逐項勾選 ───── */
/* ───── (d) 說明問題：系統先算出可以協商的選項，AI 用白話說明、建議先問誰 ───── */
if(typeof renderBoard==='function'){const rb0=renderBoard;renderBoard=function(){rb0();if(isRO())return;
  const a=document.querySelector('#page button[onclick="aiOpen()"]');if(!a)return;
  const o=[];evaluate(M,ST.slot,o);
  a.after(gmEl('button',{class:'b',onclick:gmAdjOpen},'用文字調整'),o.length?gmEl('button',{class:'b',onclick:gmExplain},'請 AI 說明問題'):'');};}
function gmAdjOpen(){openDlg('');const B=$('dlgBody');
  const ta=gmEl('textarea',{id:'gmAdjTxt',class:'gmadj',placeholder:'想怎麼改？可以貼一段會議紀錄（Ctrl+Enter 送出）'});
  ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))gmAdjAsk();});
  B.append(gmEl('h3',null,'用文字加限制、調整課表'),
    gmEl('p',{class:'note'},'例如「王老師週三下午不能排」「把七國移到早上」「八數固定用資源教室二」「701 週五第7節不要抽」，也可以貼一段會議紀錄。AI 會拆成一項一項，每一項附上原文是哪一句；系統檢查過後列給你逐項勾選，按「套用」才會改。'),
    ...(gmReady()?[ta,gmBar('請 AI 整理',gmAdjAsk),gmEl('div',{id:'gmRes'}),gmNotice('只送'+(GEMINI.namesOk()?'老師名字':'老師代號')+'、課名、教室和目前的時段，不送學生資料。')]:[gmNoReady('就可以用文字調整課表')]),
    gmEl('div',{class:'bar',style:'margin:12px 0 0'},gmEl('button',{class:'b',onclick:closeDlg},'關閉')));
  if(gmReady())ta.focus();}
async function gmAdjAsk(){const txt=($('gmAdjTxt')||{}).value||'';if(!txt.trim()){toast('請先寫下想怎麼改');return;}if(gmCtl)return;
  const v=aiProblem(D).v,req=AI.adjRequest(D,M,ST,txt,{names:GEMINI.namesOk()}),host=$('gmRes');host.replaceChildren();
  const r=await gmAsk('adj',req,host);if(!r)return;
  if(aiProblem(D).v!==v){gmSetStatus('等待的時候課表被改過了，請再按一次',true);return;}
  const items=AI.adjCheck(D,M,ST,r.json.actions,req.said),checks=[];
  host.replaceChildren(r.json.reply?gmEl('p',{class:'gmreply'},AI.unscrub(D,r.json.reply)):'',
    items.length?gmEl('ul',{class:'gmacts'},items.map(it=>{const cb=gmEl('input',{type:'checkbox',checked:it.ok,disabled:!it.ok});checks.push([cb,it]);
      return gmEl('li',{class:it.ok?'':'no'},gmEl('label',null,cb,' '+it.text),it.quote?gmEl('small',{class:'q'},'原文：「'+it.quote+'」'):null,it.why?gmEl('small',null,it.why):null,it.warn?gmEl('small',{class:'warn'},'注意：'+it.warn):null);})):gmEl('p',{class:'note'},'AI 沒有整理出可以做的動作，換個說法試試。'),
    items.some(x=>x.ok)?gmEl('div',{class:'bar'},gmEl('button',{class:'b pri',onclick:()=>gmAdjApply(checks,v,r.logId)},'套用勾選的'),gmEl('span',{class:'note',style:'margin:0'},'灰色的是找不到、或本來就是這樣的，不會套用。')):null);}
function gmAdjApply(checks,v,logId){if(isRO()){toast('你是檢視權限，不能修改');return;}
  if(aiProblem(D).v!==v){toast('課表被改過了，請再請 AI 整理一次');return;}
  const pick=checks.filter(([cb,it])=>cb.checked&&it.ok).map(([cb,it])=>it);if(!pick.length){toast('沒有勾選要套用的');return;}
  pushUndo();const snapAt=gmSnap('用文字調整之前');const ops=AI.adjApply(D,pick.map(it=>it.act));changed();   // 先改不排課時段、教室，重新整理後再移課
  const n=ops.length?AI.adjLessons(M,ST,ops):0;closeDlg();commit();
  if(logId)GEMINI.logUpdate(logId,{applied:pick.map(it=>it.text).join('；'),snapAt});
  const o=[];evaluate(M,ST.slot,o);toast('已套用 '+pick.length+' 項'+(n?'（動到 '+n+' 節）':'')+'；'+(o.length?'目前有 '+o.length+' 個問題，請看上方說明':'沒有衝堂'));}
async function gmExplain(){openDlg('');const B=$('dlgBody'),out=[];evaluate(M,ST.slot,out);
  B.append(gmEl('h3',null,'請 AI 說明排不開的原因'),gmEl('p',{class:'note'},'系統先算出「哪一位老師哪一節如果可以排，就多一個位置」，AI 只用這些選項用白話說明、建議先跟誰商量；不會改動課表。'),
    ...(gmReady()?[gmBar('請 AI 說明',gmExplainGo),gmEl('div',{id:'gmRes'}),gmNotice('只送課和老師的代號、時段與問題種類，不送姓名。')]:[gmNoReady('可以請 AI 用白話說明排不開的原因')]),
    gmEl('div',{class:'bar',style:'margin:12px 0 0'},gmEl('button',{class:'b',onclick:closeDlg},'關閉')));
  if(gmReady()&&GEMINI.seen('explain'))gmExplainGo();}
async function gmExplainGo(){if(gmCtl)return;const out=[];evaluate(M,ST.slot,out);if(!out.length){gmSetStatus('現在沒有問題');return;}
  const req=AI.explainRequest(D,M,ST,out,{names:GEMINI.namesOk()}),host=$('gmRes');host.replaceChildren();
  const r=await gmAsk('explain',req,host);if(!r)return;const U=t=>AI.unscrub(D,t||''),byId={};req.options.forEach(o=>{byId[o.id]=o;});
  const opt=id=>{const o=byId[id];return o?'若 '+D.teachers[o.t].name+' '+o.slotName+' 可以排，'+M.G[o.gi].name+' 就多一個位置':'';};
  host.replaceChildren(gmEl('p',{class:'gmreply'},U(r.json.summary)),gmEl('ul',{class:'gmacts'},(r.json.items||[]).map(it=>gmEl('li',null,
    gmEl('b',null,U(it.course)),' '+U(it.explain),it.suggest?gmEl('small',null,'建議：'+U(it.suggest)):null,
    (it.options||[]).filter(id=>byId[id]).map(id=>gmEl('small',{class:'q'},'系統算過：'+opt(id)))))),
    gmEl('p',{class:'note'},'「系統算過」的選項是本機排課程式算出來的；AI 的說明僅供參考，要不要協商請自己判斷。'));
  if(r.logId)GEMINI.logUpdate(r.logId,{applied:'（只有說明，沒有改課表）'});}

/* ───── (c) 全校課表：文字辨識認不出的（橘色），把截下來的統計區圖片給 Gemini 看 ─────
   AI 只能從已知的老師名單裡挑、附把握程度，不准自己編名字；結果只是建議，打開班級核對、按儲存才寫入 */
const gmTTTodo=()=>Object.keys(D.tt||{}).filter(c=>TTIMG[c]&&!TTSUG[c]&&(c[0]==='?'||D.tt[c].guessCls||Object.values(D.tt[c].subj).flat().some(x=>x[2])));
const gmTTGate=()=>!gmReady()?'接上 Gemini（側邊欄「AI 設定」）可以請它看圖核對橘色的名字。':!GEMINI.namesOk()?'要請 AI 看圖核對，請先到「AI 設定」勾選「可以送出老師姓名」（圖上就有老師名字）。':'';
if(typeof renderTT==='function'){const rt0=renderTT;renderTT=function(){rt0();const bar=document.querySelector('#page .bar');if(!bar)return;
  const todo=gmTTTodo(),ns=Object.keys(TTSUG).filter(c=>D.tt&&D.tt[c]).length,gate=gmTTGate();
  if(GMTT)bar.after(gmEl('div',{class:'chk'},gmEl('b',null,'Gemini 看圖中'),gmEl('span',{class:'mid'},GMTT.done+' / '+GMTT.total+' 班'),gmEl('button',{class:'b sm',onclick:()=>{GMTT.stop=1;if(gmTTCtl)gmTTCtl.abort();}},'停止')));
  else if(todo.length||ns)bar.append(gate?gmEl('span',{class:'note',style:'margin:0'},gate):'',!gate&&todo.length?gmEl('button',{class:'b',onclick:gmTTAll},'請 AI 看圖核對（'+todo.length+' 班）'):'',
    ns?gmEl('span',{class:'note gmst',style:'margin:0'},ns+' 班有 AI 的建議，點標色的班級核對後按儲存'):'');
  Object.keys(TTSUG).forEach(c=>{const b=[...document.querySelectorAll('#page button')].find(x=>x.getAttribute('onclick')==="ttEdit('"+c+"')");if(b)b.classList.add('gmsugb');});};}
async function gmTTOne(c,signal){const r=await GEMINI.generate(Object.assign({},AI.ttRequest(TTIMG[c],c,ttKnown(D)),{kind:'tt',signal,names:true}));TTSUG[c]={json:r.json,logId:r.logId};return TTSUG[c];}
async function gmTTAll(){const todo=gmTTTodo();if(!todo.length||GMTT||gmTTGate())return;
  if(!GEMINI.seen('tt')){ttEdit(todo[0]);toast('第一次使用：請先在這一班看過要送出的內容');gmTTAsk(todo[0]);return;}   // 第一次先單獨給老師看
  GMTT={done:0,total:todo.length};gmTTCtl=new AbortController();render();let err=null;
  for(const c of todo){if(GMTT.stop)break;   // 一班一班來：每分鐘有次數上限，一次全丟會被擋
    try{await gmTTOne(c,gmTTCtl.signal);}catch(e){if(e.code!=='safety'&&e.code!=='format'&&e.code!=='empty'){err=e;break;}}
    GMTT.done++;if(page==='roster'&&sub==='tt'&&!$('dlg').open)render();}
  const n=GMTT.done;GMTT=null;gmTTCtl=null;if(page==='roster'&&sub==='tt')render();
  toast(err&&err.code!=='cancel'?'看到第 '+(n+1)+' 班時停下來：'+gmMsg(err):'AI 看完 '+n+' 班；標色的班級點進去核對，按儲存才會寫入');}
if(typeof ttEdit==='function'){const te0=ttEdit;ttEdit=function(c){te0(c);if(!TTIMG[c])return;const bar=$('dlgBody').querySelector('.bar');if(!bar)return;
  const gate=gmTTGate();bar.append(gate?gmEl('span',{class:'note',style:'margin:0'},gate):gmEl('button',{class:'b sm gmgo',onclick:()=>gmTTAsk(c)},'請 AI 看圖'),
    gmEl('button',{class:'b sm',id:'gmStop',hidden:true,onclick:()=>{if(gmCtl)gmCtl.abort();}},'取消'),gmEl('span',{id:'gmSt',class:'gmst'}));
  bar.after(gmEl('div',{id:'gmRes'}));if(TTSUG[c])gmTTFill(c,TTSUG[c]);};}
async function gmTTAsk(c){if(gmCtl||gmTTGate())return;const req=AI.ttRequest(TTIMG[c],c,ttKnown(D)),host=$('gmRes');if(!host)return;
  const r=await gmAsk('tt',Object.assign(req,{scrubbed:0}),host,'AI 看圖中…');if(!r)return;TTSUG[c]={json:r.json,logId:r.logId};gmTTFill(c,TTSUG[c]);}
// 把建議填進核對表：換掉的格子標色並寫出原本認成什麼、把握多少；老師可以再改，按「儲存」才算數
function gmTTFill(c,sug){const o=D.tt[c],tb=$('ttRows');if(!o||!tb)return;
  const rows=Object.keys(o.subj).flatMap(s=>o.subj[s].map(x=>[s,x[0],x[1],x[2]])),R=AI.ttMerge(rows,sug.json,ttKnown(D));
  const inp=(cls,v)=>gmEl('td',null,gmEl('input',{type:'text',class:cls,value:v==null?'':String(v)}));
  tb.replaceChildren(gmEl('tr',null,['科目','老師','節數','AI'].map(t=>gmEl('th',null,t))),
    ...R.rows.concat([{sj:'',t:'',n:''}]).map(r=>gmEl('tr',{class:r.was?'gmsug':''},inp('w8',r.sj),inp('w5'+(r.unk?' warn':''),r.t),inp('w3',r.n),
      gmEl('td',{class:'dim'},(r.sug||'')+(r.was?'（原本認成「'+r.was+'」）':'')))));
  const ci=$('ttCls');if(ci&&!ci.value&&R.cls)ci.value=R.cls;
  gmSetStatus((R.changed?'AI 建議改 '+R.changed+' 格（標色），核對後按儲存':'AI 沒有把握的建議，維持原本的')+(R.rejected?'；有 '+R.rejected+' 個名字不在名單上，已略過':''));
  tb.dataset.gmLog=sug.logId||'';}
if(typeof ttEditOk==='function'){const tk0=ttEditOk;ttEditOk=function(c){const tb=$('ttRows'),id=tb&&tb.dataset.gmLog;const snapAt=id?gmSnap('AI 核對課表之前'):0;
  tk0(c);if(id)GEMINI.logUpdate(id,{applied:c+' 班的課表（核對後儲存）',snapAt});delete TTSUG[c];};}

// 背景每天檢查一次有沒有新模型（不擋畫面；失敗就算了，下次再試）。代理模式要等登入完成
setTimeout(()=>{if(gmReady())GEMINI.ensureModels().then(gmNews).catch(()=>{});},8000);
/* ═════════════ IEP 會議（feat/iep）開始 ═════════════
   時間調查、出席名單、線上連結與 QR、回覆情形、排定與通知、直接開會。邏輯都在 iep.js，這裡只有畫面。
   安全：畫面上的資料一律 esc；事件不用 inline onclick，按鈕帶 data-a（點擊）／data-c（改值）由下面統一處理 */
const IV={per:4,all:false,priv:'full',pm:'qr',nm:'cut',only:false,cm:'',qr:'',pullAt:0,un:{}};
PAGES.iep={t:'IEP 會議',subs:[['survey','建立調查'],['ppl','出席名單'],['link','線上連結與 QR'],['ans','回覆情形'],['plan','排定與通知'],['quick','直接開會'],['set','設定']],render:ivRender};
function ivRender(){IEP.ensure(D);({survey:ivSurvey,ppl:ivPpl,link:ivLink,ans:ivAns,plan:ivPlan,quick:ivQuick,set:ivSet})[sub]();}
function ivR(){const I=IEP.ensure(D),rs=I.rounds.filter(r=>!r.quick);return rs.find(r=>r.id===I.cur)||rs[rs.length-1]||null;}
function ivFind(mid){for(const R of D.iep.rounds){const m=R.meets.find(x=>x.id===mid);if(m)return {R,m};}return {};}
function ivBusy(R){try{return IEP.busyOf(D,R,{M,slot:ST.slot,room:ROOM});}catch(e){return {};}}
function ivCloud(){return cloudState==='on'&&!!(CLOUD&&CLOUD.db&&CLOUD.user)&&!isRO();}
function ivBase(){return location.origin+location.pathname.replace(/[^/]*$/,'')+'iep.html?k=';}
function ivUrl(R,pk){return R.tok&&R.tok[pk]?ivBase()+R.tok[pk]:'';}
function ivSave(){save();render();}
const ivA=(a,o)=>' data-a="'+a+'"'+Object.keys(o||{}).map(k=>' data-'+k+'="'+esc(o[k])+'"').join('');
const ivC=(a,o)=>' data-c="'+a+'"'+Object.keys(o||{}).map(k=>' data-'+k+'="'+esc(o[k])+'"').join('');
const ivSel=(c,o,list,cur)=>'<select'+ivC(c,o)+'>'+list.map(x=>{const v=Array.isArray(x)?x[0]:x,n=Array.isArray(x)?x[1]:x;return '<option value="'+esc(v)+'"'+(String(v)===String(cur)?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</select>';
function ivPick(R){const rs=D.iep.rounds.filter(r=>!r.quick);
  return '<div class="bar iepui">'+(rs.length?ivSel('pick',{},rs.map(r=>[r.id,r.name||'未命名的調查']),R&&R.id):'')+'<button class="b"'+ivA('newR')+'>新增一次調查</button>'+(R?'<button class="b danger"'+ivA('delR')+'>刪除這次調查</button>':'')+'</div>';}
function ivNoR(){return '<p class="guide">還沒有調查。按「新增一次調查」，選學生和日期範圍，系統會自動帶出每場會議要出席的人。</p>';}
function ivTitle(){return esc(D.title||'');}

/* ── 建立調查 ── */
function ivSurvey(){const R=ivR();let h='<p class="guide">一次調查可以包含很多位學生的 IEP 會議。選好<b>日期範圍</b>和<b>可以開會的節次</b>，再勾學生；每位出席的老師會拿到<b>一個</b>專屬連結，一次填完他被邀請的所有會議。</p>'+ivPick(R);
  if(!R){$('page').innerHTML=h+ivNoR();return;}
  const ps=R.ps||[],per=D.periods;
  h+='<div class="iepcard"><h4>基本資料</h4><div class="iepf">'+
    '<span>名稱</span><input type="text" value="'+esc(R.name)+'"'+ivC('rset',{f:'name'})+'>'+
    '<span>會議</span>'+ivSel('rset',{f:'kind'},IEP.KINDS,R.kind||IEP.KINDS[0])+
    '<span>回覆期限</span><input type="date" value="'+esc(R.due)+'"'+ivC('rset',{f:'due'})+'>'+
    '<span>承辦</span><input type="text" value="'+esc(R.host||'')+'" placeholder="例：特教組"'+ivC('rset',{f:'host'})+'>'+
    '<span>開會地點</span><input type="text" value="'+esc(R.rooms.join('、'))+'" placeholder="例：會議室、資源教室一（可以填好幾間，用頓號分開）"'+ivC('rooms')+'>'+
    '<span>線上頁的學生</span>'+ivSel('rset',{f:'priv'},[['cls','只顯示班級座號'],['mask','班級座號＋遮住的姓名（王○明）']],R.priv||'cls')+
    '<span>家長</span><label class="iepchk"><input type="checkbox"'+(R.par?' checked':'')+ivC('rset',{f:'par'})+'> 家長、專業人員也發線上連結（家長的連結只能送出一次）</label>'+
    '<span>保存期間</span><input type="text" value="'+esc(R.keep||'')+'" placeholder="會議時間排定後由特教組刪除，最晚保留到本學期結束"'+ivC('rset',{f:'keep'})+'>'+
    '</div></div>';
  h+='<div class="iepcard"><h4>日期範圍與節次<small>週一到週五；共 '+R.slots.length+' 個時段</small></h4><div class="bar" style="margin:0 0 8px">'+
    '<input type="date" id="ivD1" value="'+esc(R.d1||'')+'"'+ivC('range')+'> 到 <input type="date" id="ivD2" value="'+esc(R.d2||'')+'"'+ivC('range')+'></div><div>'+
    per.map(p=>'<label class="iepchk"><input type="checkbox" class="ivps" value="'+esc(p.id)+'"'+(ps.includes(p.id)?' checked':'')+ivC('range')+'> '+esc(p.name)+' <small class="dim">'+esc(p.start)+'</small></label>').join('')+
    '</div><p class="note">老師在手機上會看到這個範圍的每一天、每一節，點選有空的。資源班的課和老師登記的不排課時段會先標成「有課」。</p></div>';
  const cms=[...new Set(D.students.map(s=>s.caseMgr).filter(Boolean))],inR=new Set(R.meets.map(m=>m.s));
  const S=D.students.slice().sort(sortStu).filter(s=>!IV.cm||s.caseMgr===IV.cm),by={};S.forEach(s=>{(by[s.cls]=by[s.cls]||[]).push(s);});
  h+='<div class="iepcard"><h4>學生<small>已選 '+R.meets.length+' 位</small></h4><div class="bar" style="margin:0 0 8px">只看個管：'+ivSel('cmf',{},[['','全部']].concat(cms.map(id=>[id,IEP.pName(D,null,'t:'+id)])),IV.cm)+
    '<button class="b sm"'+ivA('stuAll')+'>全選目前顯示的</button><button class="b sm"'+ivA('stuNone')+'>全不選</button></div>'+
    Object.keys(by).sort().map(c=>'<div class="iepcls"><b>'+esc(c)+'</b>'+by[c].map(s=>'<label class="iepchk"><input type="checkbox"'+(inR.has(s.id)?' checked':'')+ivC('stu',{s:s.id})+'> '+esc(s.seat)+' '+esc(s.name)+'</label>').join('')+'</div>').join('')+
    (D.students.length?'':'<p class="note">名冊還沒有學生。</p>')+'</div>';
  h+='<p class="note">改了日期、節次或學生之後，如果已經發出線上連結，請到「線上連結與 QR」按「更新線上內容」，老師的頁面才會跟著變。</p>';
  $('page').innerHTML=h;}

/* ── 出席名單（每場會議可改） ── */
function ivPE(R,m){const opts=IEP.subjOptions(D,m.s).filter(o=>!m.p.some(x=>x[0]===o.k)),mid=m.id;
  return '<table class="ed"><tr><th>姓名</th><th>身分</th><th>必要出席</th><th></th></tr>'+m.p.map((x,i)=>'<tr><td>'+(x[0][0]==='x'?'<input type="text" class="w5" value="'+esc(IEP.pName(D,R,x[0]))+'"'+ivC('pname',{m:mid,i})+'>':esc(IEP.pName(D,R,x[0])))+'</td>'+
    '<td><input type="text" class="w8" value="'+esc(x[1])+'"'+ivC('prole',{m:mid,i})+'></td><td><label class="iepchk"><input type="checkbox"'+(x[2]?' checked':'')+ivC('preq',{m:mid,i})+'> 必要</label></td>'+
    '<td><button class="x" title="移除"'+ivA('pdel',{m:mid,i})+'>✕</button></td></tr>').join('')+'</table>'+
    '<div class="bar" style="margin:4px 0"><select id="ivT_'+esc(mid)+'">'+tOpts('','res')+'</select>'+ivSelRaw('ivTR_'+mid,['資源班','任課','導師','行政','專業'])+'<button class="b sm"'+ivA('paddT',{m:mid})+'>加入老師</button>'+
    '<input type="text" class="w5" id="ivO_'+esc(mid)+'" placeholder="家長或其他人姓名">'+ivSelRaw('ivOR_'+mid,['家長','專業','行政','其他'])+'<button class="b sm"'+ivA('paddO',{m:mid})+'>加入</button>'+
    '<button class="b sm"'+ivA('prederive',{m:mid})+'>照名冊重新帶入</button></div>'+
    (opts.length?'<div class="note">也可以加入原班任課老師：'+opts.map((o,j)=>'<button class="b sm"'+ivA('paddK',{m:mid,j:IEP.subjOptions(D,m.s).indexOf(o)})+'>'+esc(o.sj+' '+o.name)+'</button>').join(' ')+'</div>':'');}
function ivSelRaw(id,list){return '<select id="'+esc(id)+'">'+list.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select>';}
function ivPpl(){const R=ivR();let h='<p class="guide">每場會議的出席名單是照名冊自動帶出來的：<b>個管老師、導師、教這位學生的資源班老師、設定裡的行政人員</b>，以及學生在資源班上的那幾科的<b>原班任課老師</b>（預設是邀請、不是必要）。家長、專業人員請自己加。勾「必要」的人一定要能來才會排那個時段。</p>'+ivPick(R);
  if(!R){$('page').innerHTML=h+ivNoR();return;}
  if(!R.meets.length){$('page').innerHTML=h+'<p class="note">這次調查還沒有學生，請到「建立調查」勾選。</p>';return;}
  const noHr=[...new Set(R.meets.map(m=>{const s=IEP.stuOf(D,m.s);return s&&!D.classHead[String(s.cls)]?String(s.cls):'';}).filter(Boolean))];
  if(noHr.length)h+='<p class="note iepwarn">這些班級還沒設定導師：'+esc(noHr.join('、'))+'。到「設定」填好後，按各場的「照名冊重新帶入」。</p>';
  R.meets.slice().sort((a,b)=>sortStu(IEP.stuOf(D,a.s)||{},IEP.stuOf(D,b.s)||{})).forEach(m=>{const s=IEP.stuOf(D,m.s);
    h+='<div class="iepcard"><h4>'+esc(IEP.stuLabel(s))+'<small>個管：'+esc(s&&s.caseMgr?IEP.pName(D,R,'t:'+s.caseMgr):'未指定')+'・'+m.p.length+' 人，必要 '+m.p.filter(x=>x[2]).length+' 人</small></h4>'+ivPE(R,m)+'</div>';});
  $('page').innerHTML=h;}

/* ── 線上連結與 QR ── */
function ivSlipQR(R,o){const url=ivUrl(R,o.k),max=7,ms=o.meets.slice(0,max);
  return '<div class="slip"><div class="hd"><b>'+esc(R.kind||'IEP 會議')+'時間調查</b><span>'+ivTitle()+'</span></div><div class="qs"><div class="qt">'+
    '<div class="to">'+esc(IEP.salute(o.name,o.meets.map(x=>x.role).join('、'),o.teacher))+' 您好：</div>'+
    '<p>請用手機掃描右邊的 QR Code，點選您<b>有空</b>的節次後送出。</p>'+
    '<p>學生：'+ms.map(x=>esc(IEP.stuShow(x.s,IV.priv))).join('、')+(o.meets.length>max?' 等 '+o.meets.length+' 位':'')+'</p>'+
    '<p>調查範圍：'+esc(IEP.fmtDate(R.d1))+'～'+esc(IEP.fmtDate(R.d2))+'</p><p>請於 <b>'+esc(IEP.fmtDate(R.due))+'</b> 前填寫'+(R.host?'　'+esc(R.host):'')+'</p>'+
    '<p class="url">'+esc(url)+'</p></div><div class="iepqr" data-t="'+esc(url)+'"></div></div><span class="cut">✂</span></div>';}
function ivCut(items,fn){const n=IV.per===3?3:4;let h='';for(let i=0;i<items.length;i+=n)h+='<div class="pg iepcut n'+n+'">'+items.slice(i,i+n).map(fn).join('')+'</div>';return h;}
function ivPaper(R,o,busy){const G=IEP.grid(D,o.keys),b=busy[o.k]||{};
  const bz=w=>/上課/.test(w)?'有課':/IEP/.test(w)?'已有會議':'已登記有事';
  return '<div class="pg iepA4"><h2>'+ivTitle()+'　'+esc(R.kind||'IEP 會議')+'時間調查表</h2><p>'+esc(IEP.salute(o.name,o.meets.map(x=>x.role).join('、'),o.teacher))+' 您好：</p>'+
    '<p>下列學生的會議需要您參與。請在您可以的時段打「○」、不行的打「╳」，'+(R.due?'於 '+esc(IEP.fmtDate(R.due))+' 前':'')+'交回'+esc(R.host||'個管老師')+'。表上標「有課」的是系統查到您那一節有課或已登記不排課；如果可以調課，仍請打○。</p>'+
    '<table><tr><th>班級座號</th><th>學生</th><th>個管老師</th><th>您的身分</th><th>出席</th></tr>'+o.meets.map(x=>'<tr><td>'+esc(IEP.stuShow(x.s,'cls'))+'</td><td>'+esc(IV.priv==='full'?(x.s?x.s.name:''):IEP.stuShow(x.s,IV.priv).split(' ')[1]||'')+'</td><td>'+esc(x.cm)+'</td><td>'+esc(x.role)+'</td><td>'+(x.req?'必要':'邀請')+'</td></tr>').join('')+'</table>'+
    '<table><tr><th>日期</th>'+G.cols.map(c=>'<th>'+esc(c.name)+'<span class="bz">'+esc(c.time)+'</span></th>').join('')+'</tr>'+
    G.dates.map(d=>'<tr><th>'+esc(d.label)+'</th>'+G.cols.map(c=>{const k=G.cell(d.date,c.p);return k?'<td>'+(b[k]?'<span class="bz">'+bz(b[k])+'</span>':'')+'</td>':'<td class="x"></td>';}).join('')+'</tr>').join('')+'</table>'+
    '<p>備註：<span class="ln" style="min-width:30em"></span></p><p class="sg">填表人：<span class="ln"></span></p></div>';}
function ivLink(){const R=ivR();let h='<p class="guide">每位出席的人一個專屬連結（同一位老師被好幾場邀請也只有一個）。<b>發布</b>之後可以複製連結用 LINE 傳，或印 QR 小單發下去（一張 A4 裁 3～4 張）。連結到回覆期限當天晚上就失效。</p>'+ivPick(R);
  if(!R){$('page').innerHTML=h+ivNoR();return;}
  const busy=ivBusy(R),list=IEP.webPeople(D,R),pg=IEP.progress(D,R),st=new Map(pg.people.map(o=>[o.k,o.done])),pub=(R.pub||[]).length;
  if(!ivCloud())h+='<div class="probs iepui">線上調查需要先開啟<b>雲端共用</b>：到左下角登入共用後才能發布連結。'+(isRO()?'（你是檢視權限，不能發布）':'')+'沒有開也可以在下面改印「紙本時段表」，收回來後到「回覆情形」手動登錄。</div>';
  const miss=[!R.due&&'回覆期限',!R.slots.length&&'日期範圍與節次',!R.meets.length&&'學生'].filter(Boolean);
  if(miss.length)h+='<p class="note iepwarn iepui">還沒填：'+esc(miss.join('、'))+'（在「建立調查」）。</p>';
  h+='<div class="bar iepui"><button class="b pri"'+ivA('publish')+(ivCloud()&&!miss.length?'':' disabled')+'>'+(pub?'更新線上內容':'發布線上調查')+'</button>'+
    (pub?'<button class="b danger"'+ivA('unpub')+(ivCloud()?'':' disabled')+'>結束調查並刪除線上資料</button><span class="note" style="margin:0">已發布 '+pub+' 份'+(R.pubAt?'，'+esc(new Date(R.pubAt).toLocaleString('zh-TW'))+' 更新':'')+'</span>':'')+'</div>';
  h+='<div class="scroll iepui"><table class="ed"><tr><th>姓名</th><th>身分</th><th>學生</th><th>狀態</th><th>連結</th></tr>'+list.map(o=>{const url=pub?ivUrl(R,o.k):'';
    return '<tr><td>'+esc(o.name)+'</td><td class="dim">'+esc([...new Set(o.meets.map(x=>x.role.split('、')[0]))].join('、'))+'</td><td class="dim">'+esc(o.meets.map(x=>IEP.stuShow(x.s,'cls')).join('、'))+'</td><td>'+(st.get(o.k)?'<span class="iepok">填了</span>':'還沒填')+'</td>'+
      '<td class="nw">'+(url?'<button class="b sm"'+ivA('copyUrl',{k:o.k})+'>複製連結</button><button class="b sm"'+ivA('showQR',{k:o.k})+'>QR</button>':'<span class="dim">尚未發布</span>')+'</td></tr>'+
      (IV.qr===o.k&&url?'<tr><td colspan="5"><div class="iepqr big" data-t="'+esc(url)+'"></div><div class="note">'+esc(url)+'</div></td></tr>':'');}).join('')+'</table></div>';
  // 列印
  const pick=list.filter(o=>!IV.only||!st.get(o.k));
  h+='<h3 class="iepui">列印</h3><div class="bar iepui">'+ivSel('iv',{f:'pm'},[['qr','QR 小單（裁開發給每個人）'],['paper','紙本時段表（給不方便用手機的人，A4 每人一張）']],IV.pm)+
    (IV.pm==='qr'?ivSel('iv',{f:'per'},[[4,'一張 A4 裁 4 張'],[3,'一張 A4 裁 3 張']],IV.per):'')+ivSel('iv',{f:'priv'},[['full','學生印班級座號＋姓名'],['cls','只印班級座號'],['mask','姓名中間遮住']],IV.priv)+
    '<label class="iepchk"><input type="checkbox"'+(IV.only?' checked':'')+ivC('iv',{f:'only'})+'> 只印還沒填的</label><button class="b"'+ivA('print')+'>列印</button><span class="note" style="margin:0">'+pick.length+' 人</span></div>';
  if(IV.pm==='qr'&&!pub)h+='<p class="note iepui">發布之後才有連結和 QR Code。</p>';
  else h+='<div id="outArea">'+(IV.pm==='qr'?ivCut(pick,o=>ivSlipQR(R,o)):pick.map(o=>ivPaper(R,o,busy)).join(''))+'</div>';
  $('page').innerHTML=h;ivDrawQR();}
function ivDrawQR(){const els=[...document.querySelectorAll('#page .iepqr')];if(!els.length)return;
  libLoad(()=>window.QRCode,'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(()=>{els.forEach(el=>{el.innerHTML='';new QRCode(el,{text:el.dataset.t,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});});})
    .catch(()=>{els.forEach(el=>{el.textContent='QR Code 元件載入失敗，請確認網路連線';});});}
// 發布：每位出席者一份 iepTok/{鑰匙的雜湊}（用戶端讀不到，公開頁只能經過 Cloud Function 拿內容）
async function ivPublish(){const R=ivR();if(!R||!ivCloud())return;
  if(IEP.expMs(R)<Date.now()){toast('回覆期限已經過了，請先改期限');return;}
  const list=IEP.ensureTokens(D,R),busy=ivBusy(R),db=CLOUD.db,F=firebase.firestore,keep=new Set(list.map(o=>R.tok[o.k]));
  const fields=['v','who','once','name','title','round','kind','d1','d2','due','host','keys','ps','busy','stu','keep','exp','r','pk','by','pubAt'];
  try{for(const o of list){const d=IEP.publicDoc(D,R,o,busy);d.exp=F.Timestamp.fromMillis(d.expMs);delete d.expMs;d.r=R.id;d.pk=o.k;d.by=CLOUD.user.email;d.pubAt=F.FieldValue.serverTimestamp();
      await db.doc('iepTok/'+await IEP.tokHash(R.tok[o.k])).set(d,{mergeFields:fields});}
    for(const t of (R.pub||[]))if(!keep.has(t))await db.doc('iepTok/'+await IEP.tokHash(t)).delete().catch(()=>{});   // 已經不在名單上的人：連結作廢
    Object.keys(R.tok).forEach(k=>{if(!list.some(o=>o.k===k))delete R.tok[k];});
    R.pub=[...keep];R.pubAt=Date.now();ivSave();toast('已發布 '+list.length+' 份線上調查');}
  catch(e){toast('發布失敗：'+(e.code||e.message));}}
// 結束調查：連結作廢，線上的回覆也刪掉（已經抓回來的留在名冊資料裡）
async function ivUnpub(R,quiet){if(!R||!(R.pub||[]).length)return true;if(!ivCloud()){toast('要先登入雲端共用才能刪除線上資料');return false;}
  try{for(const t of R.pub)await CLOUD.db.doc('iepTok/'+await IEP.tokHash(t)).delete();
    const rs=await CLOUD.db.collection('iepResp/'+R.id+'/r').get();for(const d of rs.docs)await d.ref.delete();
    R.pub=[];R.tok={};if(!quiet)ivSave();toast('已刪除線上資料，舊連結都失效了');return true;}
  catch(e){toast('刪除失敗：'+(e.code||e.message));return false;}}

/* ── 回覆情形 ── */
// 抓回覆：iepResp/{調查}/r 只有成員讀得到；每一份帶 pk（出席者代號）對回名單
async function ivPull(R,quiet){if(!R||!ivCloud()||!(R.pub||[]).length)return;IV.pullAt=Date.now();let n=0;
  try{const by=new Map(IEP.webPeople(D,R).map(o=>[o.k,o])),rs=await CLOUD.db.collection('iepResp/'+R.id+'/r').get();
    rs.forEach(d=>{const x=d.data(),o=by.get(x.pk);if(o&&IEP.applyWeb(R,o,{free:x.free,note:x.note,at:x.at&&x.at.toMillis?x.at.toMillis():+x.at||0}))n++;});}
  catch(e){if(!quiet)toast('抓取回覆失敗：'+(e.code||e.message));return;}
  if(n)save();if(page==='iep')render();if(!quiet||n)toast(n?'收到 '+n+' 份新的回覆':'沒有新的回覆');}
function ivAns(){const R=ivR();let h='<p class="guide">誰填了、誰還沒填。還沒填的可以按「複製提醒」，貼到 LINE 傳給他。紙本收回來的或電話問到的，在下面「手動登錄」點格子。</p>'+ivPick(R);
  if(!R){$('page').innerHTML=h+ivNoR();return;}
  if(ivCloud()&&(R.pub||[]).length&&Date.now()-IV.pullAt>60000)setTimeout(()=>ivPull(R,true),0);
  const pg=IEP.progress(D,R),wait=pg.people.filter(o=>!o.done&&(o.teacher||R.par));
  h+='<div class="bar"><span class="stat">填了 <b>'+pg.people.filter(o=>o.done).length+'</b> / '+pg.people.length+' 人</span><span class="stat">必要的人都回了：<b>'+pg.ready+'</b> / '+pg.meets.length+' 場</span>'+
    (ivCloud()&&(R.pub||[]).length?'<button class="b"'+ivA('pull')+'>抓取最新回覆</button>':'')+(wait.length&&(R.pub||[]).length?'<button class="b"'+ivA('copyAll')+'>複製全部提醒（'+wait.length+' 人）</button>':'')+'</div>';
  h+='<div class="scroll"><table class="ed"><tr><th>姓名</th><th>會議</th><th>狀態</th><th>備註</th><th></th></tr>'+pg.people.map(o=>'<tr><td>'+esc(o.name)+'</td><td class="dim">'+o.meets.length+' 場'+(o.meets.some(x=>x.req)?'（必要）':'')+'</td>'+
    '<td>'+(o.done==='web'?'<span class="iepok">填了</span> <small class="dim">線上 '+esc(new Date(o.at).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))+'</small>':o.done==='paper'?'<span class="iepok">填了</span> <small class="dim">手動登錄</small>':'還沒填')+'</td>'+
    '<td class="dim">'+esc(o.note||'')+'</td><td class="nw">'+(!o.done&&ivUrl(R,o.k)?'<button class="b sm"'+ivA('copyRem',{k:o.k})+'>複製提醒</button>':'')+'</td></tr>').join('')+'</table></div>';
  // 手動登錄
  const busy=ivBusy(R),keys=IEP.keysOf(R),inf=keys.map(k=>IEP.slotInfo(D,k));IV.busy=busy;
  const sym={y:'○',n:'╳',m:'△'};
  h+='<details class="more"'+(IV.open?' open':'')+'><summary>手動登錄（紙本收回的、電話問到的）</summary><p class="ieplegend">點格子依序切換：○ 可 → ╳ 不可 → △ 不確定 → 空白。灰色「課」是系統查到有課、還沒有人回覆。</p>'+
    '<div class="scroll"><table class="iepans"><tr><th>姓名</th>'+inf.map(f=>'<th>'+esc(IEP.fmtDate(f.date))+'<br>'+esc(f.name)+'</th>').join('')+'<th></th></tr>'+
    pg.people.map(o=>{const ks=new Set(o.keys);return '<tr><td class="nm">'+esc(o.name)+'</td>'+keys.map(k=>{if(!ks.has(k))return '<td></td>';const s=IEP.status(R,busy,o.k,k);
      return '<td><button class="c '+(s.auto?'a':s.v)+'" title="'+esc(s.why||'')+'"'+ivA('cyc',{k:o.k,s:k})+'>'+(s.auto?'課':sym[s.v]||'')+'</button></td>';}).join('')+
      '<td class="nw"><button class="b sm"'+ivA('rest',{k:o.k})+'>其餘都可</button></td></tr>';}).join('')+'</table></div></details>';
  $('page').innerHTML=h;}

/* ── 排定與通知 ── */
function ivPlan(){const R=ivR();let h='<p class="guide">必要出席的人都回覆之後，按「排出建議時間」：每場會議挑<b>必要的人都能來、能來的人最多</b>的時段，而且同一位老師、同一間教室不會同時排兩場。可以自己改時間，改過的會固定住。</p>'+ivPick(R);
  if(!R){$('page').innerHTML=h+ivNoR();return;}
  const busy=ivBusy(R),pg=IEP.progress(D,R),cf=IEP.conflicts(D,R),ready=new Map(pg.meets.map(x=>[x.m.id,x]));
  h+='<div class="bar iepui"><button class="b pri"'+ivA('run')+'>排出建議時間</button><button class="b"'+ivA('clearPlan')+'>清除還沒固定的時間</button><span class="stat">必要的人都回了：<b>'+pg.ready+'</b> / '+pg.meets.length+' 場</span></div>';
  if(cf.length)h+='<div class="probs iepui">'+cf.map(c=>esc(c.m)).join('<br>')+'</div>';
  h+='<div class="scroll iepui"><table class="ed"><tr><th>學生</th><th>回覆</th><th>時間</th><th>地點</th><th>固定</th><th>情形</th></tr>'+
    R.meets.slice().sort((a,b)=>String(a.at||'~').localeCompare(String(b.at||'~'))).map(m=>{const s=IEP.stuOf(D,m.s),rk=IEP.rank(D,R,m,busy),cur=rk.find(r=>r.k===m.at),rd=ready.get(m.id);
      const opts=[['','（未排）']].concat(rk.map(r=>[r.k,(r.ok?'':'✗ ')+IEP.slotInfo(D,r.k).label+'　'+(r.ok?r.yes+'/'+r.tot+' 人確定可':r.bad.join('、')+' 不行')]));
      const rooms=[['','（未定）']].concat(R.rooms.map(x=>[x,x]));if(m.room&&!R.rooms.includes(m.room))rooms.push([m.room,m.room]);
      return '<tr><td>'+esc(IEP.stuLabel(s))+'</td><td>'+(rd&&rd.ready?'<span class="iepok">齊了</span>':'<small class="dim">等 '+esc((rd?rd.wait:[]).join('、'))+'</small>')+'</td><td>'+ivSel('at',{m:m.id},opts,m.at||'')+'</td><td>'+ivSel('room',{m:m.id},rooms,m.room||'')+'</td>'+
        '<td><input type="checkbox"'+(m.pin?' checked':'')+ivC('pin',{m:m.id})+'></td><td class="dim">'+(IV.un[m.id]?'<span class="iepwarn">'+esc(IV.un[m.id])+'</span>':cur?esc([cur.miss.length?'不能來：'+cur.miss.join('、'):'',cur.unk.length?'沒回：'+cur.unk.join('、'):''].filter(Boolean).join('；'))||'大家都可以':'')+'</td></tr>';}).join('')+'</table></div>';
  h+=ivNoticeUI(R);$('page').innerHTML=h;}
function ivNoticeUI(R){const fixed=R.meets.filter(m=>m.at);
  let h='<h3 class="iepui">開會通知</h3>';if(!fixed.length)return h+'<p class="note">排好時間之後，這裡可以印通知。</p>';
  h+='<div class="bar iepui">'+ivSel('iv',{f:'nm'},[['cut','小通知單（每人每場一張，一張 A4 裁 3～4 張）'],['sum','會議安排總表'],['each','每人一張彙整通知']],IV.nm)+
    (IV.nm==='cut'?ivSel('iv',{f:'per'},[[4,'裁 4 張'],[3,'裁 3 張']],IV.per):'')+(IV.nm!=='sum'?ivSel('iv',{f:'priv'},[['full','班級座號＋姓名'],['cls','只印班級座號'],['mask','姓名中間遮住']],IV.priv)+'<label class="iepchk"><input type="checkbox"'+(IV.all?' checked':'')+ivC('iv',{f:'all'})+'> 家長、專業人員也印</label>':'')+
    '<label class="note" style="margin:0">回條交回 <input type="date" value="'+esc(R.cdue||'')+'"'+ivC('rset',{f:'cdue'})+'></label><button class="b"'+ivA('print')+'>列印</button></div>';
  return h+'<div id="outArea">'+ivNotices(R)+'</div>';}
function ivSlipC(x){const t=x.time;
  return '<div class="slip"><div class="hd"><b>'+esc(x.kind)+'開會通知</b><span>'+ivTitle()+'</span></div><div class="to">'+esc(x.to)+' 您好：</div>'+
    '<p>學生 <b>'+esc(x.stu)+'</b> 的'+esc(x.kind)+'訂於：</p><p class="big"><b>'+esc(IEP.fmtDate(t.date))+'　'+esc(t.custom?'':t.name)+(t.time?'（'+esc(t.time)+'）':'')+'</b></p>'+
    '<p>地點：<b>'+(x.room?esc(x.room):'<span class="ln"></span>')+'</b>　　個管老師：'+esc(x.cm)+'</p><p>敬請'+(x.req?'出席':'撥冗參加')+'。'+(x.host?'　'+esc(x.host)+' 敬啟':'')+'</p>'+
    '<div class="rt">回條：□可以出席　□無法出席，原因：<span class="ln"></span><br>簽名：<span class="ln"></span>'+(x.due?'　請於 '+esc(IEP.fmtDate(x.due))+' 前交回個管老師':'')+'</div><span class="cut">✂</span></div>';}
function ivNotices(R){
  if(IV.nm==='cut')return ivCut(IEP.slipItems(D,R,{all:IV.all,privacy:IV.priv}),ivSlipC);
  if(IV.nm==='sum'){const ms=R.meets.filter(m=>m.at).sort((a,b)=>a.at.localeCompare(b.at));
    return '<div class="pg iepA4"><h2>'+ivTitle()+'　'+esc(R.kind||'IEP 會議')+'安排表</h2><table><tr><th>日期</th><th>時間</th><th>地點</th><th>學生</th><th>個管</th><th>出席人員</th></tr>'+
      ms.map(m=>{const f=IEP.slotInfo(D,m.at),s=IEP.stuOf(D,m.s);return '<tr><td>'+esc(IEP.fmtDate(f.date))+'</td><td>'+esc((f.custom?'':f.name+' ')+f.time)+'</td><td>'+esc(m.room||'')+'</td><td>'+esc(IEP.stuLabel(s))+'</td><td>'+esc(s&&s.caseMgr?IEP.pName(D,R,'t:'+s.caseMgr):'')+'</td>'+
        '<td class="l">'+m.p.map(x=>esc(IEP.pName(D,R,x[0]))+(x[2]?'':'（邀）')).join('、')+'</td></tr>';}).join('')+'</table></div>';}
  return IEP.notices(D,R,{all:IV.all}).map(o=>'<div class="pg iepA4"><h2>'+ivTitle()+'　'+esc(R.kind||'IEP 會議')+'開會通知</h2><p>'+esc(IEP.salute(o.name,o.meets.map(x=>x.role).join('、'),o.teacher))+' 您好：</p><p>下列會議時間已經排定，敬請準時出席。</p>'+
    '<table><tr><th>日期</th><th>時間</th><th>地點</th><th>學生</th><th>個管老師</th><th>您的身分</th></tr>'+o.meets.map(x=>{const f=IEP.slotInfo(D,x.m.at);
      return '<tr><td>'+esc(IEP.fmtDate(f.date))+'</td><td>'+esc((f.custom?'':f.name+' ')+f.time)+'</td><td>'+esc(x.m.room||'')+'</td><td>'+esc(IEP.stuShow(x.s,IV.priv))+'</td><td>'+esc(x.cm)+'</td><td>'+esc(x.role)+(x.req?'':'（邀請）')+'</td></tr>';}).join('')+'</table>'+
    '<p class="sg">'+esc(R.host||'特教組')+' 敬啟</p></div>').join('');}

/* ── 直接開會（已經知道時間） ── */
function ivQuick(){const I=D.iep,Q=IV.q=IV.q||{sid:'',kind:IEP.KINDS[0],date:'',p:'',room:''},R=I.rounds.find(r=>r.id===IV.qr&&r.quick);
  const S=D.students.slice().sort(sortStu),per=D.periods;
  let h='<p class="guide">已經和大家約好時間時用這裡：選學生、填日期時間地點，按「帶入出席名單」，確認名單後就能印小通知單（一張 A4 裁 3～4 張），發給每位出席的人。</p>';
  h+='<div class="iepcard iepui"><div class="iepf"><span>學生</span>'+ivSel('q',{f:'sid'},[['','（請選擇）']].concat(S.map(s=>[s.id,IEP.stuLabel(s)])),Q.sid)+
    '<span>會議</span>'+ivSel('q',{f:'kind'},IEP.KINDS,Q.kind)+'<span>日期</span><input type="date" value="'+esc(Q.date)+'"'+ivC('q',{f:'date'})+'>'+
    '<span>時間</span><div>'+ivSel('q',{f:'p'},[['','（請選擇）']].concat(per.map(p=>[p.id,p.name+' '+p.start+'–'+p.end])).concat([['*','自訂時間']]),Q.p==='*'||/:/.test(Q.p)?'*':Q.p)+
      (Q.p==='*'||/:/.test(Q.p)?' <input type="text" class="w8" placeholder="15:10-16:00" value="'+esc(/:/.test(Q.p)?Q.p:'')+'"'+ivC('q',{f:'pt'})+'>':'')+'</div>'+
    '<span>地點</span><input type="text" value="'+esc(Q.room)+'" placeholder="例：會議室"'+ivC('q',{f:'room'})+'>'+
    '</div><div class="bar" style="margin:10px 0 0"><button class="b pri"'+ivA('qgo')+'>帶入出席名單</button></div></div>';
  if(R){const m=R.meets[0],s=m&&IEP.stuOf(D,m.s);
    h+='<div class="iepcard iepui"><h4>'+esc(R.name)+'<small>'+esc(m&&m.at?IEP.slotInfo(D,m.at).label+' '+IEP.slotInfo(D,m.at).time:'')+(m&&m.room?'・'+esc(m.room):'')+'</small></h4>'+(m?ivPE(R,m):'')+'</div>'+ivNoticeUI(R);}
  const qs=I.rounds.filter(r=>r.quick).slice().reverse();
  if(qs.length)h+='<h3 class="iepui">最近開的會</h3><table class="ed iepui">'+qs.slice(0,20).map(r=>{const m=r.meets[0];return '<tr><td>'+esc(r.name)+'</td><td class="dim">'+esc(m&&m.at?IEP.slotInfo(D,m.at).label:'')+'</td><td class="nw"><button class="b sm"'+ivA('qopen',{r:r.id})+'>開啟</button><button class="x" title="刪除"'+ivA('qdel',{r:r.id})+'>✕</button></td></tr>';}).join('')+'</table>';
  $('page').innerHTML=h;}

/* ── 設定 ── */
function ivSet(){const c=D.iep.cfg,cls=[...new Set(D.students.map(s=>String(s.cls)))].sort();
  let h='<h3>哪些身分算「必要出席」</h3><p class="note">必要出席的人一定要能來，系統才會排那個時段；其他人是邀請，能來最好。每場會議也可以個別改。</p><div>'+
    IEP.ROLES.map(r=>'<label class="iepchk"><input type="checkbox"'+(c.req[r]?' checked':'')+ivC('req',{r})+'> '+esc(r)+'</label>').join('')+'</div>'+
    '<p><label class="iepchk"><input type="checkbox"'+(c.subj?' checked':'')+ivC('subj')+'> 自動邀請學生在資源班上的那幾科的原班任課老師</label></p>';
  h+='<h3>每場都邀請的行政人員</h3><table class="ed"><tr><th>姓名</th><th>職稱</th><th>必要</th><th></th></tr>'+c.admin.map((a,i)=>'<tr><td>'+esc(IEP.pName(D,null,a[0]))+'</td><td><input type="text" class="w5" value="'+esc(a[1]||'')+'"'+ivC('adm',{i,f:1})+'></td><td><input type="checkbox"'+(a[2]?' checked':'')+ivC('adm',{i,f:2})+'></td><td><button class="x"'+ivA('admDel',{i})+'>✕</button></td></tr>').join('')+'</table>'+
    '<div class="bar"><select id="ivAdmT">'+tOpts('','res')+'</select><input type="text" class="w5" id="ivAdmN" placeholder="或直接打姓名"><input type="text" class="w5" id="ivAdmR" placeholder="職稱，例：特教組長"><button class="b sm"'+ivA('admAdd')+'>加入</button></div>';
  h+='<h3>導師</h3><p class="note">IEP 會議要請導師出席。在名冊裡的老師打姓名就會對上；不在名冊裡的也可以直接打姓名。</p><datalist id="ivTN">'+D.teachers.map(t=>'<option value="'+esc(t.name)+'">').join('')+'</datalist>'+
    '<table class="ed"><tr><th>班級</th><th>導師</th></tr>'+cls.map(k=>{const v=D.classHead[k]||'',t=null;return '<tr><td>'+esc(k)+'</td><td><input type="text" class="w5" list="ivTN" value="'+esc(t?t.name:v||'')+'"'+ivC('hr',{c:k})+'></td></tr>';}).join('')+'</table>';
  $('page').innerHTML=h;}

/* ── 事件（點擊） ── */
const IVA={
  newR(){const R=IEP.newRound(D,{name:'IEP 會議時間調查',stu:[]});R.kind=IEP.KINDS[0];R.priv='cls';R.host='特教組';
    R.ps=D.periods.filter(p=>!p.extra).map(p=>p.id);ivSave();go('iep','survey');},
  async delR(){const R=ivR();if(!R||!confirm('刪除「'+(R.name||'這次調查')+'」？出席名單和回覆都會刪掉。'))return;
    if((R.pub||[]).length&&!(await ivUnpub(R,true))&&!confirm('線上資料沒有刪掉（要登入雲端共用），連結會到期限才失效。仍要刪除這次調查嗎？'))return;
    snapshot('刪除 IEP 調查之前');D.iep.rounds=D.iep.rounds.filter(r=>r!==R);ivSave();},
  stuAll(){const R=ivR();D.students.filter(s=>!IV.cm||s.caseMgr===IV.cm).forEach(s=>IEP.addMeet(D,R,s.id));ivSave();},
  stuNone(){const R=ivR();if(R.meets.length&&!confirm('移除全部學生？出席名單的修改也會一起清掉。'))return;R.meets.slice().forEach(m=>IEP.delMeet(R,m.id));ivSave();},
  pdel(el){const {R,m}=ivFind(el.dataset.m);if(!m)return;IEP.removePerson(R,m,m.p[+el.dataset.i][0]);ivSave();},
  paddT(el){const {R,m}=ivFind(el.dataset.m);const id=$('ivT_'+el.dataset.m).value,role=$('ivTR_'+el.dataset.m).value;if(!id){toast('請先選老師');return;}IEP.addPerson(D,R,m,'t:'+id,role,D.iep.cfg.req[role]);ivSave();},
  paddO(el){const {R,m}=ivFind(el.dataset.m);const n=$('ivO_'+el.dataset.m).value.trim(),role=$('ivOR_'+el.dataset.m).value;if(!n){toast('請先填姓名');return;}IEP.addOther(D,R,m,n,role,D.iep.cfg.req[role]);ivSave();},
  paddK(el){const {R,m}=ivFind(el.dataset.m);const o=IEP.subjOptions(D,m.s)[+el.dataset.j];if(o)IEP.addPerson(D,R,m,o.k,'任課',0);ivSave();},
  prederive(el){const {R,m}=ivFind(el.dataset.m);IEP.rederive(D,R,m);ivSave();toast('已照名冊重新帶入');},
  publish(){ivPublish();},
  async unpub(){const R=ivR();if(!confirm('結束這次線上調查？所有人的連結會立刻失效，線上的回覆會刪掉（已經抓回來的回覆會留著）。'))return;await ivPull(R,true);await ivUnpub(R);},
  copyUrl(el){const R=ivR();copyText(ivUrl(R,el.dataset.k),'已複製連結');},
  showQR(el){IV.qr=IV.qr===el.dataset.k?'':el.dataset.k;render();},
  copyRem(el){const R=ivR(),o=IEP.webPeople(D,R).find(x=>x.k===el.dataset.k);if(o)copyText(IEP.remindText(D,R,o,ivUrl(R,o.k)),'已複製提醒訊息');},
  copyAll(){const R=ivR(),pg=IEP.progress(D,R);copyText(pg.people.filter(o=>!o.done&&ivUrl(R,o.k)).map(o=>IEP.remindText(D,R,o,ivUrl(R,o.k))).join('\n\n'),'已複製提醒訊息');},
  pull(){ivPull(ivR());},
  cyc(el){const R=ivR();IEP.cycle(R,IV.busy,el.dataset.k,el.dataset.s);IV.open=1;ivSave();},
  rest(el){const R=ivR();IEP.fillRest(R,el.dataset.k,'y',null,IV.busy);IV.open=1;ivSave();},
  run(){const R=ivR();const res=IEP.schedule(D,R,{busy:ivBusy(R)});IEP.applyPlan(R,res);IV.un={};res.un.forEach(u=>{IV.un[u.id]=u.why;});ivSave();
    toast('排好 '+Object.keys(res.at).length+' 場'+(res.un.length?'，'+res.un.length+' 場排不進去':''));},
  clearPlan(){const R=ivR();R.meets.forEach(m=>{if(!m.pin){m.at='';m.room='';}});IV.un={};ivSave();},
  print(){window.print();},
  qgo(){const Q=IV.q;if(!Q.sid||!Q.date||!Q.p||Q.p==='*'){toast('請選學生、日期和時間');return;}
    const R=IEP.quickMeet(D,{sid:Q.sid,date:Q.date,p:Q.p,room:Q.room,kind:Q.kind,host:'特教組'});IV.qr=R.id;ivSave();},
  qopen(el){IV.qr=el.dataset.r;render();},
  qdel(el){if(!confirm('刪除這場會議的通知資料？'))return;D.iep.rounds=D.iep.rounds.filter(r=>r.id!==el.dataset.r);if(IV.qr===el.dataset.r)IV.qr='';ivSave();},
  admDel(el){D.iep.cfg.admin.splice(+el.dataset.i,1);ivSave();},
  admAdd(){const id=$('ivAdmT').value,n=$('ivAdmN').value.trim(),r=$('ivAdmR').value.trim()||'行政';const k=id?'t:'+id:n?IEP.tKey(D,n):'';if(!k){toast('請選老師或打姓名');return;}
    if(D.iep.cfg.admin.some(a=>a[0]===k)){toast('已經在名單裡了');return;}D.iep.cfg.admin.push([k,r,0]);ivSave();}
};
/* ── 事件（改值） ── */
const IVC={
  pick(el){D.iep.cur=el.value;IV.un={};ivSave();},
  rset(el){const R=el.dataset.f==='cdue'&&IV.qr&&sub==='quick'?D.iep.rounds.find(r=>r.id===IV.qr):ivR();if(!R)return;const f=el.dataset.f;R[f]=el.type==='checkbox'?(el.checked?1:0):el.value.trim();ivSave();},
  rooms(el){const R=ivR();R.rooms=el.value.split(/[、,，;；\s]+/).map(x=>x.trim()).filter(Boolean);ivSave();},
  range(){const R=ivR(),ps=[...document.querySelectorAll('#page .ivps')].filter(x=>x.checked).map(x=>x.value);IEP.setRange(D,R,$('ivD1').value,$('ivD2').value,ps);ivSave();},
  cmf(el){IV.cm=el.value;render();},
  stu(el){const R=ivR(),sid=el.dataset.s;if(el.checked)IEP.addMeet(D,R,sid);else{const m=R.meets.find(x=>x.s===sid);if(m)IEP.delMeet(R,m.id);}save();},
  pname(el){const {R,m}=ivFind(el.dataset.m);const x=m&&m.p[+el.dataset.i];if(x&&R.ppl[x[0].slice(2)])R.ppl[x[0].slice(2)].n=el.value.trim();save();},
  prole(el){const {m}=ivFind(el.dataset.m);const x=m&&m.p[+el.dataset.i];if(x)x[1]=el.value.trim()||'其他';save();},
  preq(el){const {m}=ivFind(el.dataset.m);const x=m&&m.p[+el.dataset.i];if(x)IEP.setReq(m,x[0],el.checked);ivSave();},
  iv(el){const f=el.dataset.f;IV[f]=el.type==='checkbox'?el.checked:f==='per'?+el.value:el.value;render();},
  at(el){const {m}=ivFind(el.dataset.m);if(!m)return;m.at=el.value;m.pin=el.value?1:0;delete IV.un[m.id];ivSave();},
  room(el){const {m}=ivFind(el.dataset.m);if(m){m.room=el.value;ivSave();}},
  pin(el){const {m}=ivFind(el.dataset.m);if(m){m.pin=el.checked?1:0;ivSave();}},
  q(el){const Q=IV.q,f=el.dataset.f;if(f==='pt'){const v=el.value.trim().replace(/[~～－—]/g,'-');if(!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v)){toast('時間請寫成 15:10-16:00');return;}Q.p=v;}else Q[f]=el.value;if(f==='p')render();},
  req(el){D.iep.cfg.req[el.dataset.r]=el.checked?1:0;save();},
  subj(el){D.iep.cfg.subj=el.checked?1:0;save();},
  adm(el){const a=D.iep.cfg.admin[+el.dataset.i];if(!a)return;if(el.dataset.f==='2')a[2]=el.checked?1:0;else a[1]=el.value.trim();save();},
  hr(el){const v=el.value.trim();if(!v)delete D.classHead[el.dataset.c];else D.classHead[el.dataset.c]=v;save();}
};
$('page').addEventListener('click',e=>{if(page!=='iep')return;const el=e.target.closest('[data-a]');if(!el||el.disabled||!IVA[el.dataset.a])return;e.preventDefault();IVA[el.dataset.a](el,e);});
$('page').addEventListener('change',e=>{if(page!=='iep')return;const el=e.target.closest('[data-c]');if(!el||!IVC[el.dataset.c])return;IVC[el.dataset.c](el,e);});
/* ═════════════ IEP 會議 結束 ═════════════ */
/* ═════ 排課引擎的畫面：試排草稿、老師偏好教室、拖曳調整（這一段整塊是同一個功能，方便合併） ═════ */

/* ───── 試排、確定、重排 ─────
   正式課表是 D.assign：總覽、課表輸出、點名都讀它。試排的結果先放在 D.sched.draft，按「確定採用」才換成正式的，
   所以老師在排課頁反覆試，其他人看到的課表不會跟著跳。確定時留一個版本（D.sched.vers，最多 VERMAX 份）可以拿回來。
   D.sched={draft:{a,label,at,seed},vers:[{a,label,at}]}；a 是 core 的 packAssign 壓縮過的排法，一份只有幾百字 */
const VERMAX=6;
var draftST=null;   // ST 正在顯示草稿時，兩個是同一個物件；ST 被換掉（rebuild 等）就自動不算草稿
function schedBox(){if(!D.sched||typeof D.sched!=='object')D.sched={};if(!Array.isArray(D.sched.vers))D.sched.vers=[];return D.sched;}
function hasDraft(){return !!(D.sched&&D.sched.draft&&D.sched.draft.a);}
function onDraftST(){return !!draftST&&ST===draftST;}
function draftState(){return toState(M,Object.assign({},D,{assign:unpackAssign(D.sched.draft.a)}));}
// 排課頁有草稿時，看的、拖的、固定的都是草稿；其他頁一律是正式課表
function syncST(){const want=hasDraft()&&page==='sched'&&sub==='board';
  if(want&&!onDraftST()){draftST=draftState();setST(draftST);ROOM=assignRooms(M,ST.slot);}
  else if(!want&&onDraftST()){draftST=null;setST(toState(M,D));ROOM=assignRooms(M,ST.slot);}}
function writeDraft(a,label,seed){const box=schedBox();box.draft={a:packAssign(a),label:String(label||'試排'),at:Date.now()};if(seed)box.draft.seed=seed;draftST=null;}
function placedOf(p){let n=0;for(const id in p||{})String(p[id]).split(',').forEach(e=>{if(e&&e[0]!=='*'&&e[0]!=='@')n++;});return n;}

/* 給其他功能（例如 AI 排課）用的入口：把任何一份排法放進草稿，不動正式課表，回傳和正式課表的比較。
   x 可以是：(1) 和 M.L 對齊的陣列，每格是時段編號（0～M.NS-1）或時段代碼（'0-1'＝週一第1節），-1、null、'' 表示不排；
             (2) assign 格式 {組id:[{s:'0-1',pin:true}]}。
   opt.pin：和 M.L 對齊的固定旗標；沒給的話，時段和正式課表一樣的那幾節沿用正式課表的固定。 */
function setDraft(x,label,opt){opt=opt||{};let a;
  if(x&&(Array.isArray(x)||ArrayBuffer.isView(x))){const base=toState(M,D),n=M.L.length,S={slot:new Int16Array(n).fill(-1),pin:new Uint8Array(n),rfix:base.rfix};
    for(let l=0;l<n;l++){const v=x[l];let s=typeof v==='string'?(v?M.key2s(v):-1):v==null?-1:+v;if(!(s>=0&&s<M.NS))s=-1;S.slot[l]=s;
      S.pin[l]=s<0?0:opt.pin?(opt.pin[l]?1:0):(base.pin[l]&&base.slot[l]===s?1:0);}
    a=fromState(M,S);}
  else if(x&&typeof x==='object')a=x;
  else throw new Error('setDraft：要給時段陣列或 assign 物件');
  writeDraft(a,label||'外部排法');save();render();return draftCompare();}

// 正式課表和草稿並排比較；movedL 是換了時段的節（排課板上會加虛線框）
function draftCompare(){if(!hasDraft())return null;const A=toState(M,D),B=draftState(),movedL=[];
  for(let l=0;l<M.L.length;l++)if(A.slot[l]!==B.slot[l])movedL.push(l);
  return {main:schedStats(M,A.slot,A.rfix),draft:schedStats(M,B.slot,B.rfix),moved:schedDiff(A.slot,B.slot),movedL,total:M.L.length,label:D.sched.draft.label,at:D.sched.draft.at};}

// mode：'try' 試排（有草稿時從草稿出發）、'again' 重排（換亂數，固定的不動）、'all' 全部重排（連固定的也重排）
function trySolve(mode){
  if(isRO()){toast('你是檢視權限，不能排課');return;}
  if(!M.L.length){toast('還沒有要排的組，請先到「老師開課」建立');return;}
  const part=view.slice(0,2)==='g:',gv=part?+view.slice(2):0,only=part?shownL:null,base=hasDraft()?draftState():toState(M,D);
  if(mode==='all'&&base.pin.some((x,l)=>x&&(!part||shownL(l)))&&!confirm('全部重排會連已經固定的也一起重排，確定嗎？\n排出來一樣先放在草稿，正式課表不會變。'))return;
  pushUndo();$('busy').style.display='flex';
  setTimeout(()=>{try{
    if(mode==='all')base.pin.forEach((x,l)=>{if(!part||shownL(l))base.pin[l]=0;});
    D.settings.seed=(D.settings.seed||1)+1;const seed=D.settings.seed;
    const run=S=>{M.lroom=S.rfix;const R=solve(M,S,{seed,only});return {slot:R.slot,pin:S.pin,rfix:S.rfix};};
    let S=run(base),pl=null;
    // 「待安排」的學生照樣編進課裡（這是名冊資料，放棄草稿也會留著；要退回可以按復原）。編的時候看的是草稿的時段
    if(needList(D).length){const a=fromState(M,S);pl=placeStudents(Object.assign({},D,{assign:a}),gv?{filter:s=>gradeOfCls(s.cls)===gv}:null);
      if(pl.placed){M=compile(D);S=toState(M,Object.assign({},D,{assign:a}));M.lroom=S.rfix;evaluate(M,S.slot);if(M.viol)S=run(S);}}
    if(M.flex){M.lroom=S.rfix;const R2=refineLocks(M,S,{only});S={slot:R2.slot,pin:S.pin,rfix:S.rfix};}
    writeDraft(fromState(M,S),(mode==='again'?'重排':mode==='all'?'全部重排':'試排')+(part?'（'+GRADE[gv]+'）':'')+' '+fmtTime(Date.now()),seed);
    rebuild();selL=-1;save();render();
    const c=draftCompare(),pm=pl&&pl.placed?'；把 '+pl.placed+' 人次的學生編進課裡':'';
    toast('草稿排好了：'+(c.draft.probs?'還有 '+c.draft.probs+' 個衝突':'沒有衝突')+'，和正式課表比換了 '+c.moved+' 節'+pm+'。滿意了按「確定採用」');}
  finally{$('busy').style.display='none';}},40);}
function solveBtns(gv,gname){const d=hasDraft();
  return `<button class="b pri big" onclick="trySolve('${d?'again':'try'}')" title="${d?'用新的亂數重排草稿，固定的不動':'排出一份草稿，不會動到正式課表'}">${d?(gv?gname+'重排':'重排'):(gv?'試排'+gname:'一鍵試排')}</button>`+
    `<button class="b" onclick="trySolve('all')" title="連固定的也一起重排，結果一樣先放在草稿">${gv?gname+'全部重排':'全部重排'}</button>`+(d?`<button class="b pri" onclick="confirmDraft()">確定採用</button>`:'');}

function confirmDraft(){if(!hasDraft()||isRO())return;const d=D.sched.draft,c=draftCompare();
  openDlg(`<h3>確定採用這份草稿</h3><p class="note">確定之後，總覽、課表輸出、點名都會改用這份課表。現在的正式課表會留在「已確定的版本」裡，之後可以拿回來。</p>
    ${c.draft.probs>c.main.probs?`<p class="note warn">注意：這份草稿的衝突（${c.draft.probs} 個）比正式課表（${c.main.probs} 個）多。</p>`:''}
    <div class="bar"><label class="note" style="margin:0">這一版的名稱 <input type="text" id="verName" class="w12" value="${esc(d.label)}"></label></div>
    <div class="bar" style="margin:12px 0 0"><button class="b pri" onclick="confirmDraftOk()">確定採用</button><button class="b" onclick="closeDlg()">再想想</button></div>`);}
function confirmDraftOk(){if(!hasDraft())return;const box=schedBox(),d=box.draft,name=($('verName')&&$('verName').value.trim())||d.label;
  pushUndo();
  // 現在的正式課表如果不在版本清單裡（例如功能上線前排的、或之後手動改過），先留一份，確定之後還拿得回來
  const cur=packAssign(D.assign),last=box.vers[box.vers.length-1];
  if(placedOf(cur)&&(!last||JSON.stringify(last.a)!==JSON.stringify(cur)))box.vers.push({a:cur,label:'確定前的課表',at:Date.now()});
  D.assign=unpackAssign(d.a);box.vers.push({a:d.a,label:name,at:Date.now()});box.vers=box.vers.slice(-VERMAX);delete box.draft;draftST=null;
  closeDlg();rebuild();save();render();toast('已確定採用「'+name+'」，各頁的課表都換成這一份了');}
function discardDraft(){if(!hasDraft())return;if(!confirm('放棄這份草稿？正式課表不會變。（可以按「復原」救回來）'))return;
  pushUndo();delete D.sched.draft;draftST=null;rebuild();save();render();toast('已放棄草稿，回到正式課表');}
function restoreVer(i){const v=schedBox().vers[i];if(!v||isRO())return;if(hasDraft()&&!confirm('現在的草稿會被換掉，確定嗎？'))return;
  pushUndo();writeDraft(unpackAssign(v.a),'拿回：'+v.label);save();go('sched','board');toast('已把「'+v.label+'」放進草稿，比較過後按「確定採用」');}

// 草稿提示：排課頁顯示比較與按鈕；其他頁只提醒一行，說明這一頁還是正式課表
function draftBanner(){const P=$('page');if(!P||page==='exam')return;const board=page==='sched'&&sub==='board';
  if(board)verList(P);
  if(!hasDraft())return;const d=D.sched.draft,ro=isRO();
  if(!board){P.insertAdjacentHTML('afterbegin',`<div class="draftline"><b>有一份試排草稿還沒確定</b><span>（${esc(d.label)}）這一頁顯示的仍是正式課表。</span><button class="b sm" onclick="go('sched','board')">去看草稿</button></div>`);return;}
  const c=draftCompare(),noMain=!c.main.placed;
  const row=(n,f,low,fmt)=>{const a=f(c.main),b=f(c.draft),cls=noMain||a===b?'':(low?b<a:b>a)?'ok':'warn';return `<tr><td>${n}</td><td>${noMain?'<span class="dim">－</span>':fmt(a,c.main)}</td><td class="${cls}">${fmt(b,c.draft)}</td></tr>`;};
  const rows=[row('已排節數',x=>x.placed,false,v=>v+' / '+c.total),row('衝突',x=>x.probs,true,v=>v+' 個')];
  if(c.draft.locks)rows.push(row('原班鎖得到課',x=>x.locks?x.locks.pulled-x.locks.open:0,false,(v,x)=>x.locks?v+' / '+x.locks.pulled:'－'));
  rows.push(row('不理想程度<small>（越低越好）</small>',x=>x.soft,true,v=>String(v)));
  P.insertAdjacentHTML('afterbegin',`<div class="draft"><h4>試排草稿：${esc(d.label)}</h4>
    <p class="note">還沒確定。總覽、課表輸出和點名仍然用正式課表；在下面拖曳、固定的都是這份草稿。${noMain?'目前還沒有正式課表。':`和正式課表比，<b>${c.moved}</b> 節換了時段（板上虛線框的）。`}</p>
    <table class="ed cmp"><tr><th></th><th>正式課表</th><th>這份草稿</th></tr>${rows.join('')}</table>
    ${ro?'':`<div class="bar" style="margin:10px 0 0"><button class="b pri" onclick="confirmDraft()">確定採用</button><button class="b" onclick="trySolve('again')">重排（固定的不動）</button><button class="b" onclick="discardDraft()">放棄草稿</button></div>`}</div>`);
  c.movedL.forEach(l=>{const el=P.querySelector('.chip[data-l="'+l+'"]');if(el)el.classList.add('moved');});}
function verList(P){const v=(D.sched&&D.sched.vers)||[];if(!v.length)return;const cur=JSON.stringify(packAssign(D.assign)),ro=isRO();
  P.insertAdjacentHTML('beforeend',`<h3>已確定的版本</h3><p class="note">每次按「確定採用」都會留一份（最多 ${VERMAX} 份，舊的自動刪掉）。拿回來會先放進草稿，比較過再確定。</p>
    <div class="scroll"><table class="ed"><tr><th>確定的時間</th><th>名稱</th><th>已排</th><th></th></tr>${v.map((x,i)=>({x,i})).reverse().map(({x,i})=>`<tr><td>${fmtTime(x.at)}</td><td>${esc(x.label)}</td><td class="dim">${placedOf(x.a)} 節</td><td>${JSON.stringify(x.a)===cur?'<span class="note">目前的正式課表</span>':ro?'':`<button class="b sm" onclick="restoreVer(${i})">拿回來當草稿</button>`}</td></tr>`).join('')}</table></div>`);}

/* ───── 老師偏好的教室 ─────
   存在老師身上：t.prefRooms=[教室id,…]，依志願序。沒設定的老師不存這個欄位。分教室的順序見 core 的 assignRooms */
function prefList(t){const a=(Array.isArray(t.prefRooms)?t.prefRooms:[]).filter(id=>D.rooms.some(r=>r.id===id));if(a.length)t.prefRooms=a;else delete t.prefRooms;return a;}
function prefCell(ti){const t=D.teachers[ti];if(!t)return '';if(!D.rooms.length)return '<span class="note">先新增教室</span>';
  const a=(Array.isArray(t.prefRooms)?t.prefRooms:[]).filter(id=>D.rooms.some(r=>r.id===id)),rn=id=>D.rooms.find(r=>r.id===id).name,rest=D.rooms.filter(r=>!a.includes(r.id));
  return `<span class="prefs">${a.map((id,k)=>`<span class="stu" title="第 ${k+1} 志願">${k+1}. ${esc(rn(id))}${k?`<button class="x" title="往前移" onclick="movePref(${ti},${k})">↑</button>`:''}<button class="x" title="拿掉" onclick="delPref(${ti},${k})">✕</button></span>`).join('')}`+
    (rest.length?`<select onchange="addPref(${ti},this.value)"><option value="">${a.length?'再加一間…':'不限'}</option>${rest.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}${r.spare?'（備用）':''}</option>`).join('')}</select>`:'')+'</span>';}
function addPref(ti,id){const t=D.teachers[ti];if(!t||!id)return;t.prefRooms=prefList(t).filter(x=>x!==id).concat([id]);changed();render();}
function delPref(ti,k){const t=D.teachers[ti];if(!t)return;const a=prefList(t);a.splice(k,1);t.prefRooms=a;prefList(t);changed();render();}
function movePref(ti,k){const t=D.teachers[ti];if(!t)return;const a=prefList(t);if(k<1||k>=a.length)return;[a[k-1],a[k]]=[a[k],a[k-1]];t.prefRooms=a;changed();render();}
function prefBox(){const res=D.teachers.map((t,i)=>({t,i})).filter(o=>o.t.role==='資源班');if(!res.length||!D.rooms.length)return '';
  return `<h3>老師偏好的教室</h3><p class="note">例如王老師習慣在資源教室二上課，就替她選資源教室二；可以選好幾間，照順序當第一、第二志願。分教室時先照課程指定的教室，再照老師的偏好，接著是平常用的教室，備用教室最後。兩位老師想要同一間時，排課會盡量把他們排在不同節。</p>
  <div class="scroll"><table class="ed"><tr><th>老師</th><th>偏好的教室（依順序）</th></tr>${res.map(o=>`<tr><td>${esc(o.t.name)}</td><td>${prefCell(o.i)}</td></tr>`).join('')}</table></div>`;}
// 排課板上滑鼠停在組別上：說明這一節在哪間教室、為什麼不是老師偏好的那間
function roomNote(l){if(!ROOM||ST.slot[l]<0)return '';const r=ROOM[l];if(r==null)return '';if(r<0)return '\n教室：這一節沒有空的教室';
  const g=M.G[M.L[l].g],p=g.t>=0&&M.pref?M.pref[g.t]:[];let t='\n教室：'+D.rooms[r].name;
  if(ST.rfix[l]===r||g.room===r)t+='（指定）';else if(p.length&&p[0]!==r)t+='（偏好的'+D.rooms[p[0]].name+'這一節已經有人用）';else if(p.length)t+='（老師偏好）';
  return t;}

/* ───── 排課｜拖曳調整 ─────
   原本用 HTML5 拖放，平板上拖不動；改成自己追蹤 pointer 事件，滑鼠、觸控筆、手指都可以。
   按下後移動超過 6px 才算拖曳，沒移動就還是原本的「點一下選取、再點格子」。放下就移過去並固定（moveLesson，可以復原）。 */
// 放到 s 會怎樣：ok 和 canPlace 同一個判斷（不會多出衝突），t 是格子上顯示的原因
function probSet(){const o=[];evaluate(M,ST.slot,o);return new Set(o.map(x=>x.m));}
function cellInfo(l,s,before){const ok=canPlace(M,ST.slot,l,s),o=ST.slot[l];
  if(!ok){const r=why(M,M.L[l].g,s);if(r.length)return {ok,t:'不能排：'+r.join('、')};
    ST.slot[l]=s;const out=[];evaluate(M,ST.slot,out);ST.slot[l]=o;
    const nw=[...new Set(out.filter(x=>x.k!=='un'&&!before.has(x.m)).map(x=>x.m.replace(/^[^：]*：/,'')))];
    return {ok,t:'會衝突：'+(nw.length?nw.slice(0,3).join('；'):'和別組撞在一起')};}
  ST.slot[l]=s;const rm=assignRooms(M,ST.slot)[l];ST.slot[l]=o;
  return {ok,t:'可以放，不會衝堂'+(rm>=0?'（'+D.rooms[rm].name+'）':'')};}
(function(){let d=null,justAt=0;
  const onBoard=()=>page==='sched'&&sub==='board'&&!isRO();
  const tipEl=()=>$('dragTip')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'dragTip'}));
  function begin(){d.on=true;const g=d.el.cloneNode(true);g.classList.add('ghost');g.classList.remove('sel','moved');g.removeAttribute('title');document.body.appendChild(g);d.ghost=g;
    d.el.classList.add('lift');document.body.classList.add('dragging');clearMarks();markCells(d.l);}
  function end(){const x=d;d=null;if(!x)return null;if(x.ghost)x.ghost.remove();const t=$('dragTip');if(t)t.remove();
    document.body.classList.remove('dragging');if(x.el)x.el.classList.remove('lift');if(x.over)x.over.classList.remove('over');return x;}
  $('page').addEventListener('pointerdown',e=>{if(!onBoard()||e.button>0||!e.isPrimary)return;const c=e.target.closest('.chip[data-l]');if(!c)return;
    d={l:+c.dataset.l,x:e.clientX,y:e.clientY,el:c,id:e.pointerId,on:false,over:null};});
  window.addEventListener('pointermove',e=>{if(!d||e.pointerId!==d.id)return;
    if(!d.on){if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)<6)return;begin();}
    e.preventDefault();d.ghost.style.left=e.clientX+'px';d.ghost.style.top=e.clientY+'px';
    const el=document.elementFromPoint(e.clientX,e.clientY),td=el&&el.closest?el.closest('#page [data-s]'):null;
    if(td!==d.over){if(d.over)d.over.classList.remove('over');d.over=td;if(td)td.classList.add('over');}
    const T=tipEl();if(!td){T.style.display='none';return;}
    const s=+td.dataset.s,here=s===ST.slot[d.l];
    T.className=s<0||here?'':td.classList.contains('ok')?'ok':'no';T.textContent=s<0?'放回「還沒排」，拿下來':here?'原來的位置':(td.title||'');
    T.style.display=T.textContent?'block':'none';T.style.left=Math.max(8,Math.min(innerWidth-300,e.clientX+16))+'px';T.style.top=Math.min(innerHeight-60,e.clientY+20)+'px';},{passive:false});
  window.addEventListener('pointerup',e=>{if(!d||e.pointerId!==d.id)return;const x=end();if(!x.on)return;justAt=Date.now();
    const s=x.over?+x.over.dataset.s:null;if(s!=null&&s!==ST.slot[x.l])moveLesson(x.l,s);else render();});
  window.addEventListener('pointercancel',e=>{if(d&&e.pointerId===d.id){const x=end();if(x&&x.on)render();}});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&d){const x=end();if(x&&x.on)render();}});
  // 拖完放開時瀏覽器還會送一個 click，不擋的話會被當成「點格子移動」或「選取」
  window.addEventListener('click',e=>{if(Date.now()-justAt<400){e.stopImmediatePropagation();e.preventDefault();}},true);
})();
/* ═════ 排課引擎的畫面到這裡 ═════ */

/* ───── 啟動 ───── */
D=normalize(load()||emptyData());rebuild();$('title').value=D.title;paintSchool();if(!load())localSave();snapInit();
(function(){const a=location.hash.slice(1).split('/');go(a[0]||'home',a[1]);})();
cloudInit();

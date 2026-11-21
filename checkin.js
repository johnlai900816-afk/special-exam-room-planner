/* 資源班管理系統｜簽到退：照課表知道這一節該誰來，點名、掃碼、出缺席紀錄、學生卡 */
'use strict';
const AKEY='resource-class-att-v1';
// ATT＝{ 日期: { 組別id@節次id: { 學生id: {st,tin,tout,note} } } }　st：in 已到、late 遲到、leave 請假、abs 缺席
let ATT=(function(){try{return JSON.parse(localStorage.getItem(AKEY))||{};}catch(e){return {};}})();
let ciDate='',ciPid='',ciAuto=true,ciFlash=null,cam=null,camLast='',camAt=0,ciTimer=null;
let logRange='week',logFrom='',logTo='',logGroup='',cardFilter='';
const STN={in:'已到',late:'遲到',leave:'請假',abs:'缺席'};
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function today(){return ymd(new Date());}
function hmNow(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function hm2m(s){const a=String(s||'0:0').split(':');return (+a[0])*60+(+a[1]||0);}
function dowOf(date){const d=new Date(date+'T00:00:00').getDay();return d>=1&&d<=5?d-1:-1;}
function dateLabel(date){const d=new Date(date+'T00:00:00');return (d.getMonth()+1)+' 月 '+d.getDate()+' 日 週'+'日一二三四五六'[d.getDay()];}
function attSave(){try{localStorage.setItem(AKEY,JSON.stringify(ATT));}catch(e){}}
function attGet(date,key,sid){return ((ATT[date]||{})[key]||{})[sid]||null;}
function attSet(date,key,sid,rec){
  if(isRO()){toast('你是檢視權限，不能點名');return false;}
  const day=ATT[date]=ATT[date]||{},s=day[key]=day[key]||{};
  if(rec)s[sid]=rec;else{delete s[sid];if(!Object.keys(s).length)delete day[key];if(!Object.keys(day).length)delete ATT[date];}
  attSave();attPush(date,key,sid,rec);return true;
}
// 某一天照課表有哪些課
function sessionsOn(date){
  const d=dowOf(date),r=[];if(d<0)return r;
  M.L.forEach((x,l)=>{const s=ST.slot[l];if(s<0||Math.floor(s/M.NP)!==d)return;const p=M.P[s%M.NP],g=M.G[x.g];r.push({pi:s%M.NP,p,g,l,key:g.ref.id+'@'+p.id});});
  return r.sort((a,b)=>a.pi-b.pi||a.g.gi-b.g.gi);
}
function isOver(date,p){const t=today();return date<t||(date===t&&hmNow()>=p.end);}
function countIn(date,ses){let n=0;ses.g.stu.forEach(i=>{const r=attGet(date,ses.key,D.students[i].id);if(r&&(r.st==='in'||r.st==='late'))n++;});return n;}
function nowPid(date,list){
  const ps=[...new Map(list.map(s=>[s.p.id,s.p])).values()];if(!ps.length)return '';
  if(date!==today())return ps[0].id;const t=hmNow();return (ps.find(p=>t<p.end)||ps[ps.length-1]).id;
}
function grace(){const g=+D.settings.grace;return g>=0?g:5;}

/* ───── 點名 ───── */
function renderCheckin(){
  if(!ciDate||ciAuto)ciDate=ciDate&&!ciAuto?ciDate:today();
  const list=sessionsOn(ciDate),placed=[...ST.slot].some(s=>s>=0);
  if(ciAuto||!list.some(s=>s.p.id===ciPid))ciPid=nowPid(ciDate,list);
  const isToday=ciDate===today(),cur=list.filter(s=>s.p.id===ciPid),ps=[...new Map(list.map(s=>[s.p.id,s.p])).values()];
  let h=`<div class="bar"><input type="date" value="${ciDate}" onchange="ciDate=this.value||today();ciAuto=false;ciPid='';render()">
    <button class="b${isToday&&ciAuto?' pri':''}" onclick="ciAuto=true;ciDate=today();render()">現在</button>
    <span class="stat">${esc(dateLabel(ciDate))}${isToday?'　'+hmNow():'　補登'}</span><span class="grow"></span>
    <input type="text" id="ciIn" class="scanin" placeholder="掃學生卡，或輸入姓名、班級座號（例 70103）" onkeydown="if(event.key==='Enter'){ciScan(this.value);this.value='';}">
    <button class="b" onclick="camToggle()">${cam?'關閉鏡頭':'鏡頭掃碼'}</button></div>`;
  if(ciFlash&&Date.now()-ciFlash.at<7000)h+=`<div class="flash ${ciFlash.c}">${ciFlash.h}</div>`;
  h+=`<div id="camBox"${cam?'':' hidden'}></div>`;
  if(!placed)h+=`<div class="probs">還沒有課表。請先到「排課」排好課，這裡就會知道每一節該誰來。 <a class="lk" onclick="go('sched','board')">前往排課</a></div>`;
  else if(!list.length)h+=`<div class="probs ok">${esc(dateLabel(ciDate))}沒有資源班的課。</div>`;
  else{
    h+=`<div class="pills">`+ps.map(p=>{const ss=list.filter(s=>s.p.id===p.id),tot=ss.reduce((n,s)=>n+s.g.stu.length,0),inn=ss.reduce((n,s)=>n+countIn(ciDate,s),0);
      return `<button class="${p.id===ciPid?'on':''}" data-p="${esc(p.id)}" onclick="ciPid=this.dataset.p;ciAuto=false;render()">${esc(p.name)}<small>${esc(p.start)}　${inn}/${tot}</small></button>`;}).join('')+`</div>`;
    cur.forEach(ses=>{const g=ses.g,over=isOver(ciDate,ses.p);
      h+=`<section class="ses"><div class="seshd"><span class="dotc b${colorOf(g)}"></span><h3>${esc(g.name)}</h3><span class="note" style="margin:0">${esc([g.t>=0?M.T[g.t].name:'',ROOM[ses.l]>=0?D.rooms[ROOM[ses.l]].name:'',ses.p.start+'～'+ses.p.end].filter(Boolean).join('・'))}</span>
        <span class="grow"></span><span class="stat">到 <b>${countIn(ciDate,ses)}</b> / ${g.stu.length}</span><button class="b sm" data-k="${esc(ses.key)}" onclick="ciAll(this.dataset.k,'in')">全部簽到</button>${isToday?`<button class="b sm" data-k="${esc(ses.key)}" onclick="ciAll(this.dataset.k,'out')">全部簽退</button>`:''}</div><div class="tiles">`+
        g.stu.map(i=>D.students[i]).sort(sortStu).map(s=>{const r=attGet(ciDate,ses.key,s.id),st=r?r.st:'',out=r&&r.tout;
          const line=r?(STN[st]||'')+(r.tin?' '+r.tin:'')+(out?'　'+r.tout+' 簽退':''):(over?'未到':'尚未簽到');
          return `<div class="tile ${st||(over?'none':'')}${out?' out':''}" data-k="${esc(ses.key)}" data-id="${esc(s.id)}" onclick="ciTap(this.dataset.k,this.dataset.id)">
            <small>${esc(s.cls)}　${esc(s.seat)}</small><b>${esc(s.name)}</b><span>${esc(line)}</span>${r&&r.note?`<em>${esc(r.note)}</em>`:s.note?`<em>${esc(s.note)}</em>`:''}
            <button class="more" title="請假、缺席、備註" onclick="event.stopPropagation();ciMenu(this.parentNode.dataset.k,this.parentNode.dataset.id)">⋯</button></div>`;}).join('')+`</div></section>`;});
    h+=`<p class="note">點一下名字＝簽到，再點一下＝簽退；右上角「⋯」可以改成請假、缺席或加備註。上課超過 <input type="number" min="0" max="60" class="w2" value="${grace()}" onchange="D.settings.grace=+this.value;save()"> 分鐘才到算遲到。</p>`;
  }
  $('page').innerHTML=h;
  clearInterval(ciTimer);ciTimer=setInterval(()=>{if(page==='checkin'&&sub==='now'&&ciAuto&&!$('dlg').open&&document.activeElement!==$('ciIn')&&!cam)render();},30000);
}
function findSes(key){return sessionsOn(ciDate).find(s=>s.key===key);}
function flash(c,html){ciFlash={c,h:html,at:Date.now()};}
function signIn(ses,s){const isT=ciDate===today(),tin=isT?hmNow():'',late=isT&&hm2m(tin)>hm2m(ses.p.start)+grace();
  if(attSet(ciDate,ses.key,s.id,{st:late?'late':'in',tin,tout:'',note:''}))flash(late?'warn':'ok',`<b>${esc(stuLabel(s))}</b>　${late?'遲到':'已簽到'} ${tin}${s.note?'　<em>'+esc(s.note)+'</em>':''}`);}
function signOut(ses,s,r){const o=Object.assign({},r,{tout:hmNow()});if(attSet(ciDate,ses.key,s.id,o))flash('ok',`<b>${esc(stuLabel(s))}</b>　已簽退 ${o.tout}`);}
function ciTap(key,sid){const ses=findSes(key),s=D.students.find(x=>x.id===sid);if(!ses||!s)return;const r=attGet(ciDate,key,sid);
  if(!r)signIn(ses,s);else if((r.st==='in'||r.st==='late')&&!r.tout&&ciDate===today())signOut(ses,s,r);else{ciMenu(key,sid);return;}
  render();}
function ciAll(key,mode){const ses=findSes(key);if(!ses)return;let n=0;
  ses.g.stu.forEach(i=>{const s=D.students[i],r=attGet(ciDate,key,s.id);
    if(mode==='in'&&!r){signIn(ses,s);n++;}else if(mode==='out'&&r&&(r.st==='in'||r.st==='late')&&!r.tout){signOut(ses,s,r);n++;}});
  flash('ok',n?`<b>${esc(ses.g.name)}</b>　${mode==='in'?'簽到':'簽退'} ${n} 人`:'沒有需要'+(mode==='in'?'簽到':'簽退')+'的學生');render();}
function ciMenu(key,sid){const ses=findSes(key),s=D.students.find(x=>x.id===sid);if(!ses||!s)return;const r=attGet(ciDate,key,sid)||{};
  const btn=(st,n)=>`<button class="b${r.st===st?' pri':''}" onclick="ciSetSt('${st}')">${n}</button>`;
  ciMenu.k=key;ciMenu.id=sid;
  openDlg(`<h3>${esc(stuLabel(s))}</h3><p class="lead">${esc(ses.g.name)}・${esc(dateLabel(ciDate))} ${esc(ses.p.name)}${r.tin?'　簽到 '+esc(r.tin):''}${r.tout?'　簽退 '+esc(r.tout):''}</p>
    <div class="bar">${btn('in','已到')}${btn('late','遲到')}${btn('leave','請假')}${btn('abs','缺席')}<button class="b danger" onclick="ciSetSt('')">清除紀錄</button></div>
    <div class="bar"><span class="note" style="margin:0">備註</span><input type="text" id="ciNote" style="flex:1;min-width:0" value="${esc(r.note||'')}" placeholder="例：病假、公假、導師帶來" onkeydown="if(event.key==='Enter')ciSetNote()"><button class="b" onclick="ciSetNote()">存備註</button></div>
    <div class="bar" style="margin:0"><span class="grow"></span><button class="b" onclick="closeDlg()">關閉</button></div>`,render);}
function ciSetSt(st){const key=ciMenu.k,sid=ciMenu.id,r=attGet(ciDate,key,sid),note=$('ciNote')?$('ciNote').value.trim():'';
  if(!st)attSet(ciDate,key,sid,null);
  else{const keep=r&&(st==='in'||st==='late');attSet(ciDate,key,sid,{st,tin:keep?r.tin:(st==='in'||st==='late')&&ciDate===today()?hmNow():'',tout:keep?r.tout:'',note});}
  closeDlg();}
function ciSetNote(){const key=ciMenu.k,sid=ciMenu.id,r=attGet(ciDate,key,sid),note=$('ciNote').value.trim();
  if(!r){toast('請先選一個狀態，再存備註');return;}attSet(ciDate,key,sid,Object.assign({},r,{note}));closeDlg();}
// 掃到學生卡，或在輸入框打姓名、班級座號
function ciScan(text){
  const q=String(text||'').trim().replace(/^RC:/,'');if(!q)return;
  let hit=D.students.filter(s=>s.id===q);
  if(!hit.length&&/^\d{4,6}$/.test(q))hit=D.students.filter(s=>String(s.cls)+String(s.seat).padStart(2,'0')===q||String(s.cls)+String(+s.seat)===q);
  if(!hit.length)hit=D.students.filter(s=>s.name===q);
  if(!hit.length)hit=D.students.filter(s=>s.name&&s.name.includes(q));
  if(hit.length!==1){flash('warn',hit.length?`「${esc(q)}」有 ${hit.length} 位學生符合，請輸入班級座號`:`找不到「${esc(q)}」`);render();return;}
  const s=hit[0],list=sessionsOn(ciDate),mine=list.filter(x=>x.g.stu.some(i=>D.students[i].id===s.id)),ses=mine.find(x=>x.p.id===ciPid);
  if(!ses){const nx=mine.find(x=>ciDate!==today()||hmNow()<x.p.end);
    flash('warn',`<b>${esc(stuLabel(s))}</b>　這一節沒有課${nx?'，'+esc(nx.p.name+' 有'+nx.g.name):mine.length?'，今天的課都結束了':'，'+(ciDate===today()?'今天':'這一天')+'沒有資源班的課'}`);render();return;}
  const r=attGet(ciDate,ses.key,s.id);
  if(!r)signIn(ses,s);else if((r.st==='in'||r.st==='late')&&!r.tout&&ciDate===today())signOut(ses,s,r);
  else flash('warn',`<b>${esc(stuLabel(s))}</b>　已經是「${STN[r.st]}${r.tout?'、已簽退':''}」，要改請點名字旁的「⋯」`);
  render();const el=$('ciIn');if(el&&!cam)el.focus();
}
function libLoad(test,src){return test()?Promise.resolve():loadScript(src);}
function camToggle(){
  if(cam){camStop();render();return;}
  libLoad(()=>window.Html5Qrcode,'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js').then(()=>{
    cam=true;render();const c=new Html5Qrcode('camBox');cam=c;
    return c.start({facingMode:'environment'},{fps:10,qrbox:220},t=>{const now=Date.now();if(t===camLast&&now-camAt<3000)return;camLast=t;camAt=now;ciScan(t);});
  }).catch(e=>{cam=null;render();toast('鏡頭打不開：'+(e&&e.message?e.message:'請確認已允許使用鏡頭，且網址是 https'));});
}
function camStop(){const c=cam;cam=null;if(c&&c.stop)try{c.stop().then(()=>c.clear()).catch(()=>{});}catch(e){}}

/* ───── 出缺席紀錄 ───── */
function logSpan(){const t=new Date(),td=today();
  if(logRange==='day')return [td,td];
  if(logRange==='week'){const m=new Date(t);m.setDate(t.getDate()-((t.getDay()+6)%7));return [ymd(m),td];}
  if(logRange==='month')return [td.slice(0,8)+'01',td];
  if(logRange==='all')return ['0000-00-00','9999-99-99'];
  return [logFrom||td,logTo||td];}
// 只計算「有點過名」的節次，所以放假、停課不會被算成缺席
function attStats(from,to,gid){
  const by={};
  Object.keys(ATT).filter(d=>d>=from&&d<=to).sort().forEach(date=>{const day=ATT[date];
    for(const key in day){const at=key.lastIndexOf('@'),g=D.groups.find(x=>x.id===key.slice(0,at)),p=D.periods.find(x=>x.id===key.slice(at+1));
      if(!g||(gid&&g.id!==gid))continue;const done=!p||isOver(date,p);
      new Set(g.students.concat(Object.keys(day[key]))).forEach(sid=>{const r=day[key][sid];if(!r&&!done)return;
        const o=by[sid]=by[sid]||{exp:0,in:0,late:0,leave:0,abs:0,rows:[]},st=r?r.st:'abs';
        o.exp++;if(st==='in'||st==='late')o.in++;if(st==='late')o.late++;if(st==='leave')o.leave++;if(st==='abs')o.abs++;
        o.rows.push({date,p:p?p.name:'',g:g.name,st:r?STN[r.st]:'未到',tin:r?r.tin:'',tout:r?r.tout:'',note:r?r.note:''});});}});
  return by;
}
function renderAttLog(){
  const [from,to]=logSpan(),by=attStats(from,to,logGroup),ranges=[['day','今天'],['week','本週'],['month','本月'],['all','全部'],['custom','自訂']];
  if(cloudState==='on'&&renderAttLog.got!==from+to){renderAttLog.got=from+to;attFetch(from,to).then(ch=>{if(ch&&page==='checkin'&&sub==='log')render();});}
  let h=`<p class="guide">每位學生的出缺席統計。只計算<b>有點過名</b>的節次，所以放假或停課不會被算成缺席；有點名但沒簽到、也沒請假的，算缺席。</p>
  <div class="bar"><div class="seg">${ranges.map(([k,n])=>`<button class="${logRange===k?'on':''}" onclick="logRange='${k}';render()">${n}</button>`).join('')}</div>
    ${logRange==='custom'?`<input type="date" value="${esc(logFrom)}" onchange="logFrom=this.value;render()"> ～ <input type="date" value="${esc(logTo)}" onchange="logTo=this.value;render()">`:''}
    <select onchange="logGroup=this.value;render()"><option value="">全部組別</option>${D.groups.map(g=>`<option value="${esc(g.id)}"${g.id===logGroup?' selected':''}>${esc(g.name)}</option>`).join('')}</select>
    <span class="grow"></span><button class="b" onclick="copyOut()">複製</button><button class="b" onclick="window.print()">列印</button></div>`;
  const rows=D.students.filter(s=>by[s.id]).sort(sortStu);
  if(!rows.length){$('page').innerHTML=h+`<div class="probs">這段期間還沒有點名紀錄。</div>`;return;}
  const tot=rows.reduce((a,s)=>{const o=by[s.id];a.exp+=o.exp;a.in+=o.in;a.leave+=o.leave;return a;},{exp:0,in:0,leave:0});
  const rate=o=>o.exp-o.leave>0?Math.round(o.in/(o.exp-o.leave)*100)+'%':'—';
  h+=`<div id="outArea"><div class="pg"><h2>${esc(D.title||'資源班')}｜出缺席統計${logRange==='all'?'':'（'+esc(from)+' ～ '+esc(to)+'）'}</h2>
    <table class="out"><tr><th>班級</th><th>座號</th><th>姓名</th><th>應到</th><th>實到</th><th>遲到</th><th>請假</th><th>缺席</th><th>出席率</th></tr>`+
    rows.map(s=>{const o=by[s.id];return `<tr class="click" data-id="${esc(s.id)}" onclick="logDetail(this.dataset.id)"><td class="c">${esc(s.cls)}</td><td class="c">${esc(s.seat)}</td><td>${esc(s.name)}</td><td class="c">${o.exp}</td><td class="c">${o.in}</td><td class="c">${o.late||''}</td><td class="c">${o.leave||''}</td><td class="c${o.abs?' bad':''}">${o.abs||''}</td><td class="c"><b>${rate(o)}</b></td></tr>`;}).join('')+
    `<tr><th colspan="3">合計</th><th>${tot.exp}</th><th>${tot.in}</th><th colspan="3"></th><th>${rate(tot)}</th></tr></table></div></div><p class="note">點一位學生可以看每一節的明細。</p>`;
  $('page').innerHTML=h;
}
function logDetail(sid){const [from,to]=logSpan(),o=attStats(from,to,logGroup)[sid],s=D.students.find(x=>x.id===sid);if(!o||!s)return;
  openDlg(`<h3>${esc(stuLabel(s))}</h3><div class="pick"><table class="ed" style="width:100%"><tr><th>日期</th><th>節次</th><th>組別</th><th>狀態</th><th>簽到</th><th>簽退</th><th>備註</th></tr>`+
    o.rows.slice().reverse().map(r=>`<tr><td>${esc(r.date.slice(5))}</td><td>${esc(r.p)}</td><td>${esc(r.g)}</td><td>${esc(r.st)}</td><td>${esc(r.tin)}</td><td>${esc(r.tout)}</td><td class="dim">${esc(r.note)}</td></tr>`).join('')+
    `</table></div><div class="bar" style="margin:0"><span class="grow"></span><button class="b" onclick="closeDlg()">關閉</button></div>`);}

/* ───── 學生卡 ───── */
function renderCards(){
  const cls=[...new Set(D.students.map(s=>String(s.cls)))].sort();
  const list=D.students.filter(s=>s.name&&(!cardFilter||(cardFilter[0]==='g'&&cardFilter[1]===':'?(D.groups.find(g=>g.id===cardFilter.slice(2))||{students:[]}).students.includes(s.id):String(s.cls)===cardFilter))).sort(sortStu);
  let h=`<p class="guide">每位學生一張卡，印出來護貝後發給學生。上課時在「點名」頁掃卡就能簽到、簽退；用鏡頭或接電腦的條碼掃描器都可以。</p>
  <div class="bar"><select onchange="cardFilter=this.value;render()"><option value="">全部學生</option>${cls.map(c=>`<option value="${esc(c)}"${c===cardFilter?' selected':''}>${esc(c)} 班</option>`).join('')}${D.groups.map(g=>`<option value="g:${esc(g.id)}"${'g:'+g.id===cardFilter?' selected':''}>${esc(g.name)}</option>`).join('')}</select>
    <span class="stat">共 <b>${list.length}</b> 張</span><span class="grow"></span><button class="b pri" onclick="window.print()">列印</button></div>
  <div id="outArea" class="cardsheet">`+list.map(s=>`<div class="scard"><div class="qr" data-t="RC:${esc(s.id)}"></div><div><small>${esc(s.cls)} 班　${esc(s.seat)} 號</small><b>${esc(s.name)}</b><span>${esc(D.title||'資源班')}</span></div></div>`).join('')+`</div>`;
  $('page').innerHTML=h;
  libLoad(()=>window.QRCode,'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(()=>{
    document.querySelectorAll('#page .qr').forEach(el=>{new QRCode(el,{text:el.dataset.t,width:96,height:96,correctLevel:QRCode.CorrectLevel.M});});
  }).catch(()=>{document.querySelectorAll('#page .qr').forEach(el=>{el.textContent='QR 元件載入失敗';});toast('QR Code 元件載入失敗，請確認網路連線');});
}

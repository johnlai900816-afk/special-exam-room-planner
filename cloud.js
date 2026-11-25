/* 資源班管理系統｜登入與多人共用（Firebase）。firebase-config.js 沒有填設定時就是單機模式 */
'use strict';
let attUnsub=null,attWatched='';
const PID=()=>(window.FIREBASE_CONFIG&&window.FIREBASE_CONFIG.projectId)||'';
let CLOUD=null,cloudTimer=null,lastPushed='',cloudReady=false,cloudState=PID()?'wait':'local',presTimer=null,shareOpen=false;
// cloudRev＝lastPushed 對應的雲端版本號；cloudErr：''、retry（重試中）、perm（沒權限）、big（太大）
let cloudRev=0,pushTry=0,pushBusy=false,cloudErr='',sizeWarned=false,PENDING=window.PENDING_SCHOOL_CLOUD||null;
const FBSDK='https://www.gstatic.com/firebasejs/10.14.1/firebase-';
// 外部元件的完整性檢查碼（SRI）：CDN 上的檔案被換掉時瀏覽器會拒絕執行。升級版本時要一起重算：
// curl -sL 網址 | openssl dgst -sha384 -binary | openssl base64 -A
const SRI={
  'app-compat.js':'sha384-ZaR6mWzmJtrRibZ1Vm7SoHFr8OXjyAuGAXalGDKqbxFT18oi/z+oZLIRFkpeNor1',
  'auth-compat.js':'sha384-I1LYojsZ5RM1cOda44Z2h42Qa6YfsQ1XkXxREnhp4ueYBR/4d1pG1K+NZM537Vsj',
  'firestore-compat.js':'sha384-Ke0FJhH7LyRqDxZ0wt+/OXV38yfQVu7g9VPEEGjYmB4RVOY/ta04uecRhsMwT7V3'
};
const who=e=>String(e||'').split('@')[0];
// 老師信箱：只允許一般信箱會用到的字元（不能有引號、括號、空白）
const EMAIL_RE=/^[a-z0-9._%+\-]{1,64}@[a-z0-9\-]{1,63}(\.[a-z0-9\-]{1,63})+$/;
// 權限：主持人（admin）、編輯、檢視。emails＝全部成員；viewers＝其中只能檢視的人
const viewersOf=()=>(CLOUD&&CLOUD.access&&CLOUD.access.viewers)||[];
function isRO(){return cloudState==='on'&&!!CLOUD.user&&viewersOf().includes(CLOUD.user.email);}
function isAdmin(){return cloudState==='on'&&!!(CLOUD&&CLOUD.user&&CLOUD.access)&&CLOUD.access.admin===CLOUD.user.email;}
function roRevert(){if(!lastPushed)return;try{D=normalize(JSON.parse(lastPushed));}catch(e){return;}rebuild();$('title').value=D.title||'';paintSchool();render();toast('你是檢視權限，不能修改');}
function fmtAt(ts){if(!ts)return '';const d=ts.toDate?ts.toDate():new Date(ts),p=n=>String(n).padStart(2,'0');return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes());}
function onlineList(){const now=Date.now(),p=(CLOUD&&CLOUD.presence)||{};return Object.values(p).filter(x=>x&&typeof x.email==='string'&&now-(+x.at||0)<150000).sort((a,b)=>a.email.localeCompare(b.email));}
function avatar(x){const nm=x.name||who(x.email);return '<span class="av" title="'+esc(nm+'（'+x.email+'）')+'">'+esc(nm.slice(0,1).toUpperCase())+'</span>';}
// integrity：有固定版本的 CDN 檔案就帶檢查碼
function loadScript(src,integrity){return new Promise((ok,no)=>{const s=document.createElement('script');if(integrity){s.integrity=integrity;s.crossOrigin='anonymous';}s.src=src;s.onload=ok;s.onerror=()=>no(new Error(src));document.head.appendChild(s);});}

/* ───── 這台電腦上的資料：公用電腦模式、登出時清除 ───── */
const PCKEY='rc-pc-mode',USEDKEY='rc-cloud-used',SEENKEY='rc-cloud-seen',SYNCKEY='rc-cloud-sync';
// 會存學生資料的鍵（含段考考場 exam.html 與通知單 notice.html 用的）
const LOCAL_KEYS=['resource-class-v1','resource-class-snap','resource-class-lastbackup','resource-class-att-v1','special-exam-room-v1','exam-notice-v1',SYNCKEY];
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);return true;}catch(e){return false;}}
function pcMode(){return lsGet(PCKEY)==='1';}
function cloudUsed(){return lsGet(USEDKEY)==='1';}
function hasData(o){return !!o&&((o.students||[]).length+(o.groups||[]).length)>0;}
function setPcMode(on){
  if(on){lsSet(PCKEY,'1');if(typeof snapWipe==='function')snapWipe();toast('已開啟公用電腦模式：不再自動保留版本'+(PID()?'，關掉分頁或登出時會清除這台電腦上的資料':''));}
  else{try{localStorage.removeItem(PCKEY);}catch(e){}toast('已關閉公用電腦模式');}
  if(shareOpen)renderShare();}
// 清掉這台電腦上的學生資料（雲端上的不受影響）
function wipeLocal(){LOCAL_KEYS.forEach(k=>{try{localStorage.removeItem(k);}catch(e){}});try{sessionStorage.clear();}catch(e){}
  if(typeof snapWipe==='function')snapWipe();}
function wipeAsk(){if(!confirm('要清除這台電腦上的名冊、排課、點名、段考考場、通知單和自動保留的版本嗎？\n雲端上大家共用的那一份不受影響。清除後沒辦法復原。'))return;
  wipeLocal();toast('已清除這台電腦上的資料');setTimeout(()=>location.reload(),600);}
// 有改了還沒存上雲端的內容
function unsynced(){return cloudState==='on'&&!isRO()&&typeof D!=='undefined'&&JSON.stringify(D)!==lastPushed;}
// 登入雲端前：不顯示學生資料（用過雲端或公用電腦模式的電腦）
function gateOn(){return !!PID()&&(cloudUsed()||pcMode())&&(cloudState==='out'||cloudState==='denied'||cloudState==='wait');}
function cloudGateHtml(){
  if(!gateOn())return '';
  if(cloudState==='wait')return '<div class="probs">連線中…</div>';
  const u=CLOUD&&CLOUD.user,loc=hasData(typeof D!=='undefined'?D:null)||!!lsGet('special-exam-room-v1');
  return '<section class="ses"><h3>請先登入</h3><p class="lead">這台電腦設定成和其他老師共用雲端「'+esc(PID())+'」上的資料。為了保護學生資料，沒有登入時不顯示名冊、排課和點名。</p>'+
    (cloudState==='denied'?'<div class="box bad">你登入的帳號 <b>'+esc(u?u.email:'')+'</b> 不在共用名單裡。請主持人把你加進去，或換一個帳號。</div>':'')+
    '<div class="bar">'+(cloudState==='denied'?'<button class="b pri" onclick="cloudLogout()">換一個帳號</button>':'<button class="b pri" onclick="cloudLogin()">用 Google 帳號登入</button>')+
    (loc?'<button class="b danger" onclick="wipeAsk()">清除這台電腦上的資料</button>':'')+'</div>'+
    (loc?'<p class="note">這台電腦上還留著上次的資料。如果這是學校的公用電腦，建議清除。</p>':'')+'</section>';
}
// 登出：問要不要一起清除這台電腦上的資料；公用電腦模式預設勾選
function cloudLogout(){
  shareOpen=false;const pend=unsynced();
  openDlg('<h3>登出</h3><p class="lead">登出後，這台電腦就不會再同步雲端上的資料。</p>'+
    '<label class="note" style="display:block"><input type="checkbox" id="wipeChk"'+(pcMode()?' checked':'')+'> 同時清除這台電腦上的資料（建議學校公用電腦勾選）</label>'+
    '<p class="note">會清掉這台電腦上的名冊、排課、點名、段考考場、通知單和自動保留的版本；雲端上大家共用的那一份不受影響。</p>'+
    (pend?'<div class="box bad">還有修改沒存上雲端。清除的話，這些修改就沒了。</div>':'')+
    '<div class="bar" style="margin:12px 0 0"><span class="grow"></span><button class="b pri" onclick="doLogout($(\'wipeChk\').checked)">登出</button><button class="b" onclick="closeDlg()">取消</button></div>');
}
async function doLogout(wipe){
  if(wipe&&unsynced()&&!confirm('還有修改沒存上雲端，清除後就沒了。確定要清除嗎？'))return;
  closeDlg();await presBeat(true);try{await CLOUD.auth.signOut();}catch(e){}
  if(wipe){wipeLocal();toast('已登出，並清除這台電腦上的資料');setTimeout(()=>location.reload(),600);}
  else toast('已登出');
}
// 被移出共用名單：問要不要清除這台電腦上的資料
function deniedOffer(){if(!cloudUsed()||(!hasData(D)&&!lsGet('special-exam-room-v1')))return;shareOpen=false;
  openDlg('<h3>你已經不在共用名單裡</h3><p class="lead">主持人把你移出了共用名單，或你的帳號沒有權限。這台電腦上還留著之前的資料。</p>'+
    '<div class="bar" style="margin:12px 0 0"><span class="grow"></span><button class="b danger" onclick="closeDlg();wipeLocal();location.reload()">清除這台電腦上的資料</button><button class="b" onclick="closeDlg()">先不要</button></div>');}
window.addEventListener('beforeunload',e=>{if(unsynced()){e.preventDefault();e.returnValue='';}});
// 公用電腦模式：關掉分頁時，資料都已存上雲端就清掉這台電腦上的資料
window.addEventListener('pagehide',()=>{if(pcMode()&&PID()&&cloudState==='on'&&!unsynced())wipeLocal();});

/* ───── 狀態列與學校雲端標示 ───── */
function paintBadge(){const pid=window.SCHOOL_CLOUD_ACTIVE,c=$('cloud');let el=$('scBadge');
  if(!pid||!c){if(el)el.remove();return;}
  if(!el){el=document.createElement('div');el.id='scBadge';el.style.cssText='margin:6px 0;padding:4px 8px;border-radius:6px;font-size:12px;line-height:1.4;background:#fff4d6;color:#6b4e00;border:1px solid #e6c768;word-break:break-all';c.parentNode.insertBefore(el,c);}
  el.textContent='使用學校雲端：'+pid;el.title='登入網域：'+((window.FIREBASE_CONFIG||{}).authDomain||'');}
function setCloudUI(state){
  const g0=gateOn();
  cloudState=state;const el=$('cloud'),st=(c,t)=>'<div class="cs"><span class="dot '+c+'"></span><span>'+t+'</span></div>';
  if(state==='local')el.innerHTML=st('','資料存在這台電腦')+'<button class="b" onclick="openShare()">備份與還原</button>';
  else if(state==='out')el.innerHTML=st('',gateOn()?'尚未登入':'資料存在這台電腦')+'<button class="b pri" onclick="'+(gateOn()?'cloudLogin()':'openShare()')+'">'+(gateOn()?'登入':'與其他老師共用')+'</button>';
  else if(state==='wait')el.innerHTML=st('','連線中…');
  else if(state==='offline')el.innerHTML=st('bad','連不上雲端，先用這台電腦的資料')+'<button class="b" onclick="openShare()">備份與還原</button>';
  else if(state==='part')el.innerHTML=st('','名冊與排課存在這台電腦')+'<button class="b" onclick="openShare()">共用與備份</button>';
  else if(state==='denied')el.innerHTML=st('bad','尚未加入共用')+'<button class="b" onclick="openShare()">共用</button>';
  else{const L=CLOUD.last,bad=cloudErr==='big'?'資料太大，沒有存上雲端':cloudErr==='perm'?'沒有權限存上雲端':cloudErr==='retry'?'還沒存上雲端，重試中…':'';
    el.innerHTML='<div class="avs" title="現在在線上的老師">'+onlineList().map(avatar).join('')+'</div>'+
    (bad?st('bad',bad):st('ok',(isRO()?'檢視・':'')+'已同步'+(L&&L.by?'<br><small>'+esc(who(L.by))+'　'+fmtAt(L.at)+'</small>':'')))+'<button class="b" onclick="openShare()">共用（'+((CLOUD.access&&CLOUD.access.emails)||[]).length+' 人）</button>';}
  document.body.classList.toggle('ro',isRO());
  paintBadge();
  if(shareOpen)renderShare();
  if(typeof page!=='undefined'&&typeof M!=='undefined'&&M&&(g0!==gateOn()||page==='home'))render();
}
// 學校自己的雲端（設定存在這台瀏覽器，school.js 讀）
function schoolCloud(){try{return JSON.parse(localStorage.getItem(window.SCHOOL_CLOUD_KEY||'rc-school-cloud')||'null');}catch(e){return null;}}
function parseFbConfig(t){const o={};String(t).replace(/["']?(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["']?\s*:\s*["']([^"']+)["']/g,(m,k,v)=>{o[k]=v;});return o.apiKey&&o.projectId&&o.authDomain?o:null;}
function setSchoolCloud(c,msg){if(c)localStorage.setItem(window.SCHOOL_CLOUD_KEY,JSON.stringify(c));else localStorage.removeItem(window.SCHOOL_CLOUD_KEY);
  try{if(CLOUD&&CLOUD.auth)CLOUD.auth.signOut();}catch(e){}toast(msg||'已套用，重新整理中…');setTimeout(()=>location.reload(),700);}
// 套用：一定要老師自己按，並看過專案名稱與登入網域
function applySchoolCloud(){const raw=parseFbConfig($('fbIn').value),c=raw&&window.cleanFbConfig?window.cleanFbConfig(raw):raw;
  if(!raw){toast('讀不出設定，請把 Firebase 給的 firebaseConfig 整段貼上（要有 apiKey、authDomain、projectId）');return;}
  if(!c){toast('這組設定的格式不對：登入網域（authDomain）必須是「專案名稱.firebaseapp.com」或「.web.app」');return;}
  const odd=c.authDomain.split('.')[0]!==c.projectId;
  if(!confirm('要讓這台電腦改用下面這個雲端嗎？\n\n專案名稱（projectId）：'+c.projectId+'\n登入網域（authDomain）：'+c.authDomain+
    (odd?'\n\n注意：登入網域和專案名稱不一樣，請先和學校的管理者確認。':'')+
    '\n\n只有學校管理者親自給你的設定才套用。套用後要用 Google 帳號登入；要不要把這台電腦的資料傳上去，登入後會再問你。'))return;
  PENDING=null;setSchoolCloud(c);}
function schoolLink(){const c=schoolCloud();if(!c||!c.apiKey)return;const b=btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  copyText(location.origin+location.pathname+'#cloud='+b,'已複製設定連結：同事點開後，在「學校自己的雲端」核對專案名稱、按「套用」，再用 Google 登入；主持人把他的信箱加進共用名單就可以了');}
// 安全規則：把主持人信箱填進規則再複製（只有這個信箱能第一次建立共用名單）
const ADMIN_PH='CHANGE-ME@example.com';
function copyRules(){const u=(CLOUD&&CLOUD.user&&CLOUD.user.email)||'';
  const e=(prompt('請輸入主持人的 Gmail。\n會寫進安全規則：只有這個帳號能第一次登入建立共用名單。',u)||'').trim().toLowerCase();if(!e)return;
  if(!EMAIL_RE.test(e)){toast('信箱格式不對，例如 teacher@gmail.com');return;}
  fetch('firestore.rules',{cache:'no-store'}).then(r=>{if(!r.ok)throw 0;return r.text();}).then(t=>copyText(t.split(ADMIN_PH).join(e),'已複製安全規則（主持人：'+e+'），貼到 Firebase 的 Firestore「規則」分頁後按「發布」'),()=>toast('拿不到規則檔，請稍後再試'));}
function schoolCloudHtml(open){const c=schoolCloud(),cur=window.FIREBASE_CONFIG,b=window.BUILTIN_FIREBASE,P=PENDING;
  const now=c&&c.local?'不使用雲端（單機）':window.SCHOOL_CLOUD_ACTIVE?'學校自己的雲端「'+esc(window.SCHOOL_CLOUD_ACTIVE)+'」（登入網域 '+esc(cur.authDomain)+'）':cur&&cur.projectId?'網站內建的雲端「'+esc(cur.projectId)+'」':'不使用雲端（單機）';
  const pend=!P?'':P.bad?'<div class="box bad">你點開的設定連結格式不對（或登入網域不是 Firebase 的網域），已經略過，沒有套用。</div>':
    '<div class="box bad"><b>你點開了一個雲端設定連結，還沒有套用。</b><br>專案名稱：<b>'+esc(P.projectId)+'</b><br>登入網域：<b>'+esc(P.authDomain)+'</b>'+
    '<br>只有學校管理者親自給你的連結才套用：核對上面的名稱沒問題，再按下面的「套用」。不認得就按「不要套用」。<div class="bar" style="margin:8px 0 0"><button class="b" onclick="PENDING=null;renderShare()">不要套用</button></div></div>';
  return '<details class="more"'+(open||P?' open':'')+'><summary>學校自己的雲端</summary><p class="note">這台電腦目前：<b>'+now+'</b></p>'+pend+
  '<p class="note">讓資料存在<b>你們學校自己的 Google 帳號</b>底下，幾位老師用自己的 Gmail 登入共用同一份，帳號和資料都由學校自己管理。Firebase 免費方案就夠用。用學校或處室的公用 Google 帳號建立最好，人事異動時交接帳號就好。</p>'+
  '<ol class="note"><li>到 <b>console.firebase.google.com</b> 用 Google 帳號「建立專案」（不用開 Google Analytics）。</li>'+
  '<li>左邊「建構 › Firestore Database › 建立資料庫」，選「正式版模式」，位置選 <b>asia-east1（台灣）</b>。</li>'+
  '<li>按下面「複製安全規則」，輸入主持人的 Gmail；到 Firestore 的「規則」分頁，把內容全部換成複製的規則，按「發布」。</li>'+
  '<li>「建構 › Authentication › 開始使用」，登入方式啟用 <b>Google</b>；再到「設定 › 已授權網域」新增 <b>'+esc(location.hostname)+'</b>。</li>'+
  '<li>齒輪「專案設定 › 一般」最下面，按網頁圖示 <b>&lt;/&gt;</b> 註冊應用程式，把出現的 <b>firebaseConfig</b> 整段複製，貼到下面，按「套用」。</li>'+
  '<li>用剛才填進規則的主持人 Gmail 登入，成為主持人；系統會問你要不要把這台電腦的資料傳上去當第一份。</li>'+
  '<li>按「複製給同事的設定連結」傳給同事；主持人在共用名單加入他們的 Gmail。</li></ol>'+
  '<div class="bar"><button class="b" onclick="copyRules()">複製安全規則</button></div>'+
  '<textarea id="fbIn" style="width:100%;height:110px" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;…&quot;,&#10;  authDomain: &quot;…&quot;,&#10;  projectId: &quot;…&quot;, …">'+(P&&!P.bad?esc(JSON.stringify(P,null,1)):'')+'</textarea>'+
  '<div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="applySchoolCloud()">套用</button>'+
  (c&&c.projectId?'<button class="b" onclick="schoolLink()">複製給同事的設定連結</button>':'')+
  (c?'<button class="b" onclick="setSchoolCloud(null,\'已改回網站內建的設定\')">改回網站內建的設定</button>':'')+
  (!(c&&c.local)&&(b||c)?'<button class="b" onclick="setSchoolCloud({local:true},\'已改成單機，不連雲端\')">不使用雲端（單機）</button>':'')+'</div></details>';}
function backupHtml(open){const pc=pcMode();return '<details class="more"'+(open?' open':'')+'><summary>備份與還原</summary><p class="note">資料會自動儲存'+(cloudState==='on'?'並同步給共用的老師':'在這台電腦的這個瀏覽器')+'。換電腦、清瀏覽器資料之前，或想留一份存檔時再下載備份檔。</p>'+
  '<p class="note"><b>備份檔含學生姓名與特教資料</b>。一般備份檔是沒有加密的文字檔，任何人拿到都打得開；要存到隨身碟、雲端硬碟或寄出去，請用「下載加密備份檔」並設一組密碼（密碼忘了就打不開）。</p>'+
  '<p class="note">'+(pc?'公用電腦模式：這台電腦不自動保留版本。':'另外，每天第一次修改和每次匯入之前，這台電腦都會自動保留一份，可以在「名冊 › 匯入與新學期」回到之前的版本。')+'</p>'+
  '<div class="bar" style="margin:0"><button class="b" onclick="exportJson()">下載備份檔</button><button class="b" onclick="exportEnc()">下載加密備份檔</button><button class="b" onclick="$(\'imp\').click()">從備份檔還原</button>'+
  ((cloudState!=='on'||isAdmin())?'<button class="b danger" onclick="resetAll()">全部清空</button>':'')+'</div>'+
  '<h4>公用電腦模式</h4><label class="note" style="display:block"><input type="checkbox"'+(pc?' checked':'')+' onchange="setPcMode(this.checked)"> 這是學校的公用電腦</label>'+
  '<p class="note" style="margin-top:0">開啟後不再自動保留版本'+(PID()?'；登出時預設清除這台電腦上的資料，資料都存上雲端後關掉分頁也會清除':'')+'。單機使用時資料仍存在這台電腦，用完請按下面的「清除」。</p>'+
  '<div class="bar" style="margin:0"><button class="b danger" onclick="wipeAsk()">清除這台電腦上的資料</button></div></details>';}
function renderShare(){
  const st=cloudState,u=CLOUD&&CLOUD.user;let h='';
  if(st==='local')h+='<h3>資料存在這台電腦</h3><p class="lead">這一份還沒有連接雲端，資料只存在這台電腦的這個瀏覽器。要讓幾位老師共用同一份，請看下面的「學校自己的雲端」。</p>';
  else if(st==='offline')h+='<h3>連不上雲端</h3><p class="lead">可能是沒有網路。現在看到的是這台電腦上的資料，連上線後重新整理就會同步；離線時改的內容會在連上後再存上去。</p>';
  else if(st==='out')h+='<h3>與其他老師共用</h3><p class="lead">登入後，幾位老師可以<b>同時打開同一份</b>：任何人改名冊、分組或拖課表，其他人的畫面都會立刻跟著變，不用互傳檔案。</p>'+
    '<ol><li>用你的 Google 帳號登入（第一次由主持人登入）。</li><li>主持人輸入其他老師的 Gmail，選「編輯」或「檢視」。</li><li>把網址傳給他們，他們登入後就會看到同一份。</li></ol>'+
    '<button class="b pri big" onclick="cloudLogin()">用 Google 帳號登入</button><p class="note">登入後會改用雲端上大家共用的那一份（這台電腦現在的資料會先自動保留一份）；如果雲端還沒有資料，會先問你要不要把這台電腦的資料傳上去。</p>';
  else if(st==='part')h+='<h3>部分共用</h3><p class="lead">你已經登入（'+esc(u?u.email:'')+'）。<b>段考考場</b>和以前一樣是大家共用的；<b>名冊、排課、簽到退</b>在雲端還沒開通，目前先存在這台電腦，請記得備份。</p><div class="bar" style="margin:0"><button class="b" onclick="cloudLogout()">登出</button></div>';
  else if(st==='wait')h+='<h3>共用與協作</h3><p class="lead">連線中…</p>';
  else if(st==='denied')h+='<h3>還沒被加入共用</h3><div class="box bad">你登入的帳號 <b>'+esc(u?u.email:'')+'</b> 不在共用名單裡，所以看不到大家共用的那一份。</div>'+
    '<ol><li>把上面這個信箱傳給主持人。</li><li>請主持人按「共用」，把你的信箱加進去。</li><li>加好之後回來重新整理這一頁。</li></ol>'+
    '<div class="bar" style="margin:0"><button class="b pri" data-t="'+esc(u?u.email:'')+'" onclick="copyText(this.dataset.t,\'已複製信箱\')">複製我的信箱</button><button class="b" onclick="location.reload()">重新整理</button><button class="b" onclick="cloudLogout()">換一個帳號</button></div>';
  else{
    const A=CLOUD.access||{},emails=A.emails||[],admin=A.admin===u.email,onSet=new Set(onlineList().map(x=>x.email)),L=CLOUD.last,V=A.viewers||[];
    const roleSel=e=>'<select data-e="'+esc(e)+'" onchange="setRole(this.dataset.e,this.value)"><option value="e"'+(V.includes(e)?'':' selected')+'>編輯</option><option value="v"'+(V.includes(e)?' selected':'')+'>檢視</option></select>';
    h+='<h3>共用與協作</h3><div class="box '+(cloudErr?'bad':'ok')+'"><div class="bar" style="margin:0"><b>'+(cloudErr?'還沒存上雲端':'已同步')+'</b><span class="grow"></span><span>'+esc(u.email)+'</span><button class="b sm" onclick="cloudLogout()">登出</button></div>'+
      '<div>'+(isRO()?'主持人和編輯的老師一改，你的畫面會即時更新。':'所有修改都會自動儲存，名單內的老師會即時看到。')+(L&&L.by?'<br>最後更新：<b>'+esc(who(L.by))+'</b>　'+fmtAt(L.at):'')+'</div></div>';
    if(isRO())h+='<div class="box bad">你是「檢視」權限：可以看、列印，不能修改。</div>';
    h+='<h4>可以使用的老師（'+emails.length+' 人）</h4><p class="note" style="margin-top:0">編輯＝可以改；檢視＝每一頁都看得到，但不能改。這份名單同時管名冊、排課與段考考場。</p><div>'+
      emails.map(e=>'<div class="mem">'+avatar({email:e})+'<span class="e">'+esc(e)+(e===u.email?'（我）':'')+'</span>'+(onSet.has(e)?'<span class="tag on">在線上</span>':'')+
        (e===A.admin?'<span class="tag">主持人</span>':admin?roleSel(e)+'<button class="b sm" data-e="'+esc(e)+'" onclick="transferAdmin(this.dataset.e)">交給他當主持人</button><button class="b sm danger" data-e="'+esc(e)+'" onclick="removeMember(this.dataset.e)">移除</button>':'<span class="tag">'+(V.includes(e)?'檢視':'編輯')+'</span>')+'</div>').join('')+'</div>';
    if(admin)h+='<div class="addrow"><input id="memIn" type="email" placeholder="輸入老師的 Gmail，例：teacher@gmail.com" onkeydown="if(event.key===\'Enter\')addMember()"><select id="memRole"><option value="e">編輯</option><option value="v">檢視</option></select><button class="b pri" onclick="addMember()">加入</button></div>'+
      '<p class="note">加入後把網址傳給對方，對方用同一個 Gmail 登入就可以了。權限隨時可以改。</p><button class="b" onclick="copyText(location.href.split(\'#\')[0],\'已複製網址，貼給老師就可以了\')">複製網址</button>';
    else h+='<p class="note">要增減老師或改權限，請找主持人 '+esc(A.admin||'')+'。</p>';
    h+='<p class="note">兩位老師同時改到同一部分（例如都改了學生名冊）時，系統會問後存的人要保留哪一份；兩份都會先自動保留一份。改到不同部分時會自動合併。</p>';
  }
  $('dlgBody').innerHTML=h+backupHtml(st==='local'||st==='offline'||st==='part')+schoolCloudHtml(shareOpen===2)+'<div class="bar" style="margin:16px 0 0"><span class="grow"></span><button class="b" onclick="closeDlg()">關閉</button></div>';
}
function openShare(x){shareOpen=x?2:true;openDlg('',()=>{shareOpen=false;});renderShare();}
function copyText(t,msg){(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast(msg),()=>prompt('請手動複製：',t));}
async function setMembers(emails,viewers,msg,admin){admin=admin||CLOUD.access.admin;viewers=viewers.filter(e=>emails.includes(e)&&e!==admin);
  const o={emails,viewers};if(admin!==CLOUD.access.admin)o.admin=admin;
  try{await CLOUD.db.doc('config/access').update(o);Object.assign(CLOUD.access,o);setCloudUI('on');toast(msg);}catch(e){toast('更新失敗：'+(e.code||e.message));}}
function setRole(e,r){const v=viewersOf().filter(x=>x!==e);if(r==='v')v.push(e);setMembers(CLOUD.access.emails||[],v,e+' 已改成「'+(r==='v'?'檢視':'編輯')+'」');}
function addMember(){const el=$('memIn'),v=el.value.trim().toLowerCase();
  if(!EMAIL_RE.test(v)||v.length>120){toast('請輸入完整的信箱，例如 teacher@gmail.com（不能有空白、引號或括號）');el.focus();return;}
  const cur=CLOUD.access.emails||[];if(cur.includes(v)){toast('這位老師已經在名單裡了');return;}
  if(cur.length>=100){toast('共用名單最多 100 人');return;}
  const ro=$('memRole').value==='v';setMembers(cur.concat([v]),viewersOf().concat(ro?[v]:[]),'已加入 '+v+'（'+(ro?'檢視':'編輯')+'），把網址傳給對方就可以了');}
function removeMember(e){if(!confirm('確定把 '+e+' 移出共用名單？對方之後就看不到這一份了。'))return;setMembers((CLOUD.access.emails||[]).filter(x=>x!==e),viewersOf(),'已移除 '+e);}
// 主持人交接：交給名單裡的另一位老師，自己變成「編輯」
function transferAdmin(e){if(!confirm('把主持人交給 '+e+' 嗎？\n交出去之後你會變成「編輯」，共用名單和權限改由對方管理，你自己沒辦法拿回來。'))return;
  setMembers(CLOUD.access.emails||[],viewersOf().filter(x=>x!==e),'已把主持人交給 '+e,e);}
function cloudLogin(){if(!CLOUD){toast('還在連線，請稍候');return;}CLOUD.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e=>toast('登入失敗：'+(e.code||e.message)));}
function presBeat(gone){if(!CLOUD||!CLOUD.user||!CLOUD.access)return Promise.resolve();const u=CLOUD.user;
  return CLOUD.db.doc('rc/presence').set({[u.uid]:gone?firebase.firestore.FieldValue.delete():{email:u.email,name:String(u.displayName||'').slice(0,60),at:Date.now()}},{merge:true}).catch(()=>{});}
function cloudStop(){if(attUnsub){attUnsub();attUnsub=null;}attWatched='';['unsub','unsubP','unsubA'].forEach(k=>{if(CLOUD[k]){CLOUD[k]();CLOUD[k]=null;}});clearInterval(presTimer);clearTimeout(cloudTimer);cloudReady=false;lastPushed='';cloudRev=0;cloudErr='';pushTry=0;CLOUD.access=null;CLOUD.presence={};CLOUD.last=null;}
async function cloudInit(){
  if(PENDING)setTimeout(()=>openShare(1),300);
  const cfg=window.FIREBASE_CONFIG;if(!cfg||!cfg.projectId){setCloudUI('local');return;}
  setCloudUI('wait');
  try{if(typeof firebase==='undefined'){for(const f of ['app-compat.js','auth-compat.js','firestore-compat.js'])await loadScript(FBSDK+f,SRI[f]);}}
  catch(e){setCloudUI('offline');return;}
  if(!firebase.apps||!firebase.apps.length)firebase.initializeApp(cfg);
  CLOUD={auth:firebase.auth(),db:firebase.firestore(),user:null,unsub:null,unsubP:null,unsubA:null,access:null,presence:{},last:null};
  CLOUD.auth.onAuthStateChanged(u=>{cloudStop();CLOUD.user=u;if(!u){setCloudUI('out');return;}setCloudUI('wait');cloudConnect();});
  window.addEventListener('pagehide',()=>{presBeat(true);});
  window.addEventListener('online',()=>{if(cloudReady&&unsynced())pushNow();});
}
async function cloudConnect(){
  const db=CLOUD.db,user=CLOUD.user,acc=db.doc('config/access');
  let a;
  try{a=await acc.get();}catch(e){setCloudUI('denied');deniedOffer();return;}
  if(!a.exists){
    if(!confirm('這一份還沒有主持人。\n要讓 '+user.email+' 成為主持人嗎？（之後由你決定哪些老師可以編輯、哪些只能檢視）')){setCloudUI('denied');return;}
    try{await acc.set({admin:user.email,emails:[user.email],viewers:[]});a=await acc.get();}
    catch(e){toast('沒辦法成為主持人：這個雲端的安全規則只允許指定的主持人信箱建立共用名單，請用那個帳號登入');setCloudUI('denied');return;}
  }
  CLOUD.access=a.data();
  // 名單與權限：主持人一改，大家的畫面立刻跟著變；被移除就看不到
  CLOUD.unsubA=acc.onSnapshot(a=>{if(!a.exists)return;const was=isRO();CLOUD.access=a.data();
    if(cloudState==='on'){setCloudUI('on');if(was!==isRO())toast(isRO()?'主持人把你改成「檢視」權限':'主持人把你改成「編輯」權限');}},()=>{cloudStop();setCloudUI('denied');deniedOffer();});
  // 名冊與排課
  CLOUD.unsub=db.doc('rc/main').onSnapshot(snap=>{
    if(snap.metadata&&snap.metadata.hasPendingWrites)return;
    const first=!cloudReady;cloudReady=true;
    if(!snap.exists){setCloudUI('on');attWatch(today());if(first&&!isRO())firstUpload();return;}
    const x=snap.data();CLOUD.last={by:x.by,at:x.at};setCloudUI('on');attWatch(today());
    onRemote(x,first);
  },()=>{cloudStop();CLOUD.user=user;setCloudUI('part');});
  // 誰在線上
  CLOUD.unsubP=db.doc('rc/presence').onSnapshot(snap=>{CLOUD.presence=snap.data()||{};if(cloudState==='on')setCloudUI('on');},()=>{});
  presBeat();presTimer=setInterval(()=>{presBeat();if(cloudState==='on')setCloudUI('on');},60000);
}

/* ───── 同步：版本號＋交易寫入；有人同時改時不會默默蓋掉 ───── */
// 這台電腦的同步紀錄：{p:專案, rev:最後同步的版本, dirty:有沒有還沒存上去的修改}
function syncInfo(){try{const o=JSON.parse(lsGet(SYNCKEY)||'null');return o&&o.p===PID()?o:null;}catch(e){return null;}}
function setSync(rev,dirty){lsSet(SYNCKEY,JSON.stringify({p:PID(),rev,dirty:!!dirty}));}
function seenProject(){try{return (JSON.parse(lsGet(SEENKEY)||'[]')||[]).includes(PID());}catch(e){return false;}}
function markSeen(){lsSet(USEDKEY,'1');try{const a=JSON.parse(lsGet(SEENKEY)||'[]')||[];if(!a.includes(PID())){a.push(PID());lsSet(SEENKEY,JSON.stringify(a.slice(-20)));}}catch(e){}}
// 雲端還沒有資料：先問過才上傳
function firstUpload(){
  if(!hasData(D)){markSeen();cloudPush();return;}
  if(confirm('要把這台電腦上的 '+D.students.length+' 位學生資料上傳到「'+PID()+'」專案嗎？\n\n上傳後，共用名單裡的老師都看得到。按「取消」會登出，不上傳。')){markSeen();cloudPush();}
  else{toast('沒有上傳，已登出');presBeat(true).then(()=>CLOUD.auth.signOut());}
}
// 雲端資料（json 字串＋版本號）放進畫面
function applyRemote(x,msg){
  let o;try{o=normalize(JSON.parse(x.json));}catch(e){return false;}
  D=o;lastPushed=x.json;cloudRev=x.rev|0;setSync(cloudRev,false);cloudErr='';
  localSave();rebuild();undoStack=[];$('title').value=D.title||'';paintSchool();if(page!=='exam')render();
  if(msg)toast(msg);return true;
}
const KEYNAME={students:'學生名冊',teachers:'老師',groups:'課程',assign:'排課',classSubj:'任課老師',offBy:'不排課時段',sets:'學生群組',rooms:'教室',periods:'作息',settings:'排課規則',title:'學期名稱',tt:'全校課表',lockFix:'手排鎖課',blocked:'不排課時段'};
const keyNames=ks=>ks.map(k=>KEYNAME[k]||k).filter((v,i,a)=>a.indexOf(v)===i).join('、');
// 依最上層的欄位合併：兩邊改到不同欄位就合併，改到同一欄位就是衝突
function mergeTop(base,mine,theirs){
  const keys=new Set([].concat(Object.keys(base||{}),Object.keys(mine||{}),Object.keys(theirs||{}))),merged={},conflicts=[],mineK=[],theirK=[];
  const J=v=>JSON.stringify(v===undefined?null:v);
  keys.forEach(k=>{const b=J((base||{})[k]),m=J((mine||{})[k]),t=J((theirs||{})[k]),cm=m!==b,ct=t!==b;
    if(cm)mineK.push(k);if(ct)theirK.push(k);if(cm&&ct&&m!==t)conflicts.push(k);
    const v=cm?(mine||{})[k]:(theirs||{})[k];if(v!==undefined)merged[k]=v;});
  return {ok:!conflicts.length,merged,conflicts,mineK,theirK};
}
// 收到雲端的版本：自己沒有還沒存的修改就直接用；有的話合併或問要留哪一份
function onRemote(x,first){
  const json=x.json,rrev=x.rev|0,mine=JSON.stringify(D),by=x.by&&CLOUD.user&&x.by!==CLOUD.user.email?who(x.by):'';
  if(typeof json!=='string')return;
  if(json===lastPushed&&!first){cloudRev=rrev;return;}
  if(json===mine){lastPushed=json;cloudRev=rrev;setSync(rrev,false);markSeen();return;}
  if(first){
    const loc=syncInfo();
    if(loc&&loc.dirty&&!isRO()){
      if(loc.rev===rrev){lastPushed=json;cloudRev=rrev;markSeen();toast('把上次還沒存上雲端的修改存上去');pushNow();return;}
      lastPushed=json;cloudRev=rrev;markSeen();conflictAsk(x,[],'上次在這台電腦改的內容還沒存上雲端，之後雲端又被'+(by||'別人')+'改過了。');return;
    }
    if(!seenProject()&&hasData(D)){
      let n='?';try{n=(JSON.parse(json).students||[]).length;}catch(e){}
      if(!confirm('雲端「'+PID()+'」已經有資料（'+n+' 位學生）。\n要改用雲端的資料嗎？\n\n這台電腦現在的資料（'+D.students.length+' 位學生）會先自動保留一份，在「名冊 › 匯入與新學期 › 自動保留的版本」可以找回。\n按「取消」會登出，不會動到這台電腦的資料。')){
        toast('已登出，這台電腦的資料沒有變動');presBeat(true).then(()=>CLOUD.auth.signOut());return;}
      snapshot('改用雲端「'+PID()+'」之前');
    }
    markSeen();applyRemote(x,'已載入雲端最新資料');return;
  }
  if(mine===lastPushed||isRO()){applyRemote(x,by?by+' 更新了內容':'已載入雲端最新資料');return;}
  // 自己有還沒存上去的修改，雲端又被別人改過
  let base=null,theirs=null;try{base=JSON.parse(lastPushed);theirs=JSON.parse(json);}catch(e){}
  const r=base&&theirs?mergeTop(base,JSON.parse(mine),theirs):null;
  if(r&&r.ok){D=normalize(r.merged);lastPushed=json;cloudRev=rrev;localSave();rebuild();$('title').value=D.title||'';paintSchool();if(page!=='exam')render();
    toast((by||'別人')+' 剛改了'+keyNames(r.theirK)+'，已經和你的修改合併');pushNow();return;}
  lastPushed=json;cloudRev=rrev;conflictAsk(x,r?r.conflicts:[],'');
}
function conflictAsk(x,keys,why){
  const by=x.by?who(x.by):'別人';snapshot('雲端衝突：我的版本');
  const keep=confirm((why||'雲端有別人剛改過（'+by+(keys.length?'改了'+keyNames(keys):'')+'），和你還沒存上去的修改改到同一部分。')+
    '\n\n按「確定」：保留我的版本（蓋掉對方剛剛的修改）\n按「取消」：改用雲端的版本（放棄我剛剛的修改）\n\n兩個版本都會先自動保留一份，在「名冊 › 匯入與新學期 › 自動保留的版本」可以找回。');
  if(keep){snapshot('雲端衝突：'+by+' 的版本',x.json);pushNow();toast('已保留你的版本');}
  else applyRemote(x,'已改用雲端的版本，你的版本保留在「自動保留的版本」');
}
// 一份文件最多 1 MiB：700KB 提醒，接近 1MB 就不存
const SIZE_WARN=700*1024,SIZE_MAX=1000*1000;
function docBytes(json){return new Blob([json]).size+200;}
function sizeLevel(b){return b>=SIZE_MAX?'block':b>=SIZE_WARN?'warn':'ok';}
function cloudPush(){
  if(isRO())return;
  if(CLOUD&&CLOUD.user&&cloudReady){const i=syncInfo();if(!i||!i.dirty)setSync(cloudRev,true);clearTimeout(cloudTimer);cloudTimer=setTimeout(pushNow,800);return;}
  // 還沒連上雲端（離線或連線中），但這台電腦用過雲端：記下有修改，連上後先比對版本再存
  if(PID()&&cloudUsed()&&(cloudState==='offline'||cloudState==='wait')){const i=syncInfo();if(!i||!i.dirty)setSync(i?i.rev:0,true);}
}
async function pushNow(){
  clearTimeout(cloudTimer);
  if(pushBusy){cloudTimer=setTimeout(pushNow,500);return;}
  if(!CLOUD||!CLOUD.user||!cloudReady||isRO())return;
  const json=JSON.stringify(D);if(json===lastPushed){setSync(cloudRev,false);return;}
  const sz=docBytes(json),lv=sizeLevel(sz),kb=Math.round(sz/1024);
  if(lv==='block'){if(cloudErr!=='big'){cloudErr='big';setCloudUI('on');}
    toast('資料太大（約 '+kb+' KB），雲端一份最多 1 MB，這次沒有存上雲端。請清除全校課表或刪掉不用的課程、老師後再試；這台電腦上的資料還在');return;}
  if(lv==='warn'&&!sizeWarned){sizeWarned=true;toast('提醒：資料已經約 '+kb+' KB，接近雲端一份 1 MB 的上限。可以清除不用的全校課表、課程或老師');}
  pushBusy=true;const base=cloudRev,ref=CLOUD.db.doc('rc/main'),me=CLOUD.user.email,hadErr=cloudErr;
  try{
    const nr=await CLOUD.db.runTransaction(async tx=>{const s=await tx.get(ref),r=s.exists?(s.data().rev|0):0;
      if(s.exists&&r!==base){const e=new Error('conflict');e.code='rc-conflict';e.remote=s.data();throw e;}
      tx.set(ref,{json,by:me,at:firebase.firestore.FieldValue.serverTimestamp(),rev:base+1});return base+1;});
    pushBusy=false;lastPushed=json;cloudRev=nr;pushTry=0;cloudErr='';const more=JSON.stringify(D)!==json;setSync(nr,more);
    if(hadErr)setCloudUI('on');if(more)cloudPush();
  }catch(e){pushBusy=false;
    if(e.code==='rc-conflict'){onRemote(e.remote,false);return;}
    if(e.code==='permission-denied'){if(cloudErr!=='perm'){cloudErr='perm';setCloudUI('on');}toast('雲端儲存失敗：沒有權限（'+(e.message||'')+'）');return;}
    pushTry++;if(cloudErr!=='retry'){cloudErr='retry';setCloudUI('on');}
    if(pushTry===1)toast('雲端儲存失敗，會自動重試：'+(e.code||e.message));
    cloudTimer=setTimeout(pushNow,Math.min(60000,2000*Math.pow(2,pushTry-1)));
  }
}

/* 點名紀錄：rc/att-日期，一天一份文件；逐筆合併寫入，兩台裝置同時點名不會互相蓋掉 */
function attClean(x){const o={};for(const k in x||{}){const v=x[k];if(v&&typeof v==='object'&&Object.keys(v).length)o[k]=v;}return o;}
function attPush(date,key,sid,rec){
  if(!CLOUD||!CLOUD.user||!cloudReady||isRO())return;
  CLOUD.db.doc('rc/att-'+date).set({[key]:{[sid]:rec||firebase.firestore.FieldValue.delete()}},{merge:true}).catch(e=>toast('點名紀錄雲端儲存失敗：'+(e.code||e.message)));
}
// 即時跟著今天的點名：別台裝置一簽到，這裡就更新
function attWatch(date){
  if(!CLOUD||!CLOUD.user||!cloudReady||(attWatched===date&&attUnsub))return;
  if(attUnsub)attUnsub();attWatched=date;const ref=CLOUD.db.doc('rc/att-'+date);
  attUnsub=ref.onSnapshot(snap=>{
    if(snap.metadata&&snap.metadata.hasPendingWrites)return;
    if(!snap.exists){if(ATT[date]&&!isRO())ref.set(ATT[date],{merge:true}).catch(()=>{});return;}
    const c=attClean(snap.data());if(JSON.stringify(c)===JSON.stringify(ATT[date]||{}))return;
    if(Object.keys(c).length)ATT[date]=c;else delete ATT[date];attSave();
    if((page==='checkin'||page==='home')&&!$('dlg').open)render();
  },()=>{});
}
// 看出缺席紀錄時，把那段期間的點名從雲端抓回來
async function attFetch(from,to){
  if(!CLOUD||!CLOUD.user||!cloudReady)return false;
  const t=today(),end=to>t?t:to,d=new Date((from<'2000'?t:from)+'T00:00:00');if(from<'2000')d.setDate(d.getDate()-180);
  let ch=false,n=0;
  for(;ymd(d)<=end&&n<200;d.setDate(d.getDate()+1)){const wd=d.getDay();if(wd<1||wd>5)continue;n++;const date=ymd(d);
    try{const s=await CLOUD.db.doc('rc/att-'+date).get();if(!s.exists)continue;const c=attClean(s.data());
      if(JSON.stringify(c)!==JSON.stringify(ATT[date]||{})){if(Object.keys(c).length)ATT[date]=c;else delete ATT[date];ch=true;}}catch(e){}}
  if(ch)attSave();return ch;
}

// 給段考考場頁問：名冊現在是不是雲端共用的那一份
window.rcCloudOn=()=>cloudState==='on';

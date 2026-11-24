/* 資源班管理系統｜登入與多人共用（Firebase）。firebase-config.js 沒有填設定時就是單機模式 */
'use strict';
let attUnsub=null,attWatched='';
let CLOUD=null,cloudTimer=null,lastPushed='',cloudReady=false,cloudState='local',presTimer=null,shareOpen=false;
const FBSDK='https://www.gstatic.com/firebasejs/10.14.1/firebase-';
const who=e=>String(e||'').split('@')[0];
// 權限：主持人（admin）、編輯、檢視。emails＝全部成員；viewers＝其中只能檢視的人
const viewersOf=()=>(CLOUD&&CLOUD.access&&CLOUD.access.viewers)||[];
function isRO(){return cloudState==='on'&&!!CLOUD.user&&viewersOf().includes(CLOUD.user.email);}
function roRevert(){if(!lastPushed)return;try{D=normalize(JSON.parse(lastPushed));}catch(e){return;}rebuild();$('title').value=D.title||'';paintSchool();render();toast('你是檢視權限，不能修改');}
function fmtAt(ts){if(!ts)return '';const d=ts.toDate?ts.toDate():new Date(ts),p=n=>String(n).padStart(2,'0');return (d.getMonth()+1)+'/'+d.getDate()+' '+p(d.getHours())+':'+p(d.getMinutes());}
function onlineList(){const now=Date.now(),p=(CLOUD&&CLOUD.presence)||{};return Object.values(p).filter(x=>x&&x.email&&now-(x.at||0)<150000).sort((a,b)=>a.email.localeCompare(b.email));}
function avatar(x){const nm=x.name||who(x.email);return '<span class="av" title="'+esc(nm+'（'+x.email+'）')+'">'+esc(nm.slice(0,1).toUpperCase())+'</span>';}
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error(src));document.head.appendChild(s);});}

function setCloudUI(state){
  cloudState=state;const el=$('cloud'),st=(c,t)=>'<div class="cs"><span class="dot '+c+'"></span><span>'+t+'</span></div>';
  if(state==='local')el.innerHTML=st('','資料存在這台電腦')+'<button class="b" onclick="openShare()">備份與還原</button>';
  else if(state==='out')el.innerHTML=st('','資料存在這台電腦')+'<button class="b pri" onclick="openShare()">與其他老師共用</button>';
  else if(state==='wait')el.innerHTML=st('','連線中…');
  else if(state==='offline')el.innerHTML=st('bad','連不上雲端，先用這台電腦的資料')+'<button class="b" onclick="openShare()">備份與還原</button>';
  else if(state==='part')el.innerHTML=st('','名冊與排課存在這台電腦')+'<button class="b" onclick="openShare()">共用與備份</button>';
  else if(state==='denied')el.innerHTML=st('bad','尚未加入共用')+'<button class="b" onclick="openShare()">共用</button>';
  else{const L=CLOUD.last;el.innerHTML='<div class="avs" title="現在在線上的老師">'+onlineList().map(avatar).join('')+'</div>'+
    st('ok',(isRO()?'檢視・':'')+'已同步'+(L&&L.by?'<br><small>'+esc(who(L.by))+'　'+fmtAt(L.at)+'</small>':''))+'<button class="b" onclick="openShare()">共用（'+((CLOUD.access&&CLOUD.access.emails)||[]).length+' 人）</button>';}
  document.body.classList.toggle('ro',isRO());
  if(shareOpen)renderShare();
  if(typeof page!=='undefined'&&page==='home'&&typeof M!=='undefined'&&M)render();
}
// 學校自己的雲端（設定存在這台瀏覽器，school.js 讀）
function schoolCloud(){try{return JSON.parse(localStorage.getItem(window.SCHOOL_CLOUD_KEY||'rc-school-cloud')||'null');}catch(e){return null;}}
function parseFbConfig(t){const o={};String(t).replace(/["']?(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["']?\s*:\s*["']([^"']+)["']/g,(m,k,v)=>{o[k]=v;});return o.apiKey&&o.projectId&&o.authDomain?o:null;}
function setSchoolCloud(c,msg){if(c)localStorage.setItem(window.SCHOOL_CLOUD_KEY,JSON.stringify(c));else localStorage.removeItem(window.SCHOOL_CLOUD_KEY);
  try{if(CLOUD&&CLOUD.auth)CLOUD.auth.signOut();}catch(e){}toast(msg||'已套用，重新整理中…');setTimeout(()=>location.reload(),700);}
function applySchoolCloud(){const c=parseFbConfig($('fbIn').value);if(!c){toast('讀不出設定，請把 Firebase 給的 firebaseConfig 整段貼上（要有 apiKey、authDomain、projectId）');return;}
  if(!confirm('要讓這台電腦改用雲端「'+c.projectId+'」嗎？\n套用後請用 Google 帳號登入：第一位登入的人會成為主持人，這台電腦現在的資料會傳上去當第一份。'))return;setSchoolCloud(c);}
function schoolLink(){const c=schoolCloud();if(!c||!c.apiKey)return;const b=btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  copyText(location.origin+location.pathname+'#cloud='+b,'已複製設定連結：同事點開、按確定、再用 Google 登入，主持人把他的信箱加進共用名單就可以了');}
function copyRules(){fetch('firestore.rules',{cache:'no-store'}).then(r=>{if(!r.ok)throw 0;return r.text();}).then(t=>copyText(t,'已複製安全規則，貼到 Firebase 的 Firestore「規則」分頁後按「發布」'),()=>toast('拿不到規則檔，請稍後再試'));}
function schoolCloudHtml(open){const c=schoolCloud(),cur=window.FIREBASE_CONFIG,b=window.BUILTIN_FIREBASE;
  const now=c&&c.local?'不使用雲端（單機）':c&&c.projectId?'學校自己的雲端「'+esc(c.projectId)+'」':cur&&cur.projectId?'網站內建的雲端「'+esc(cur.projectId)+'」':'不使用雲端（單機）';
  return '<details class="more"'+(open?' open':'')+'><summary>學校自己的雲端</summary><p class="note">這台電腦目前：<b>'+now+'</b></p>'+
  '<p class="note">讓資料存在<b>你們學校自己的 Google 帳號</b>底下，幾位老師用自己的 Gmail 登入共用同一份，帳號和資料都由學校自己管理。Firebase 免費方案就夠用。用學校或處室的公用 Google 帳號建立最好，人事異動時交接帳號就好。</p>'+
  '<ol class="note"><li>到 <b>console.firebase.google.com</b> 用 Google 帳號「建立專案」（不用開 Google Analytics）。</li>'+
  '<li>左邊「建構 › Firestore Database › 建立資料庫」，選「正式版模式」，位置選 <b>asia-east1（台灣）</b>。</li>'+
  '<li>在 Firestore 的「規則」分頁，把內容全部換成下面按鈕複製的規則，按「發布」。</li>'+
  '<li>「建構 › Authentication › 開始使用」，登入方式啟用 <b>Google</b>；再到「設定 › 已授權網域」新增 <b>'+esc(location.hostname)+'</b>。</li>'+
  '<li>齒輪「專案設定 › 一般」最下面，按網頁圖示 <b>&lt;/&gt;</b> 註冊應用程式，把出現的 <b>firebaseConfig</b> 整段複製，貼到下面，按「套用」。</li>'+
  '<li>按「用 Google 帳號登入」：第一位登入的人是主持人，這台電腦的資料會傳上去當第一份。</li>'+
  '<li>按「複製給同事的設定連結」傳給同事；主持人在共用名單加入他們的 Gmail。</li></ol>'+
  '<div class="bar"><button class="b" onclick="copyRules()">複製安全規則</button></div>'+
  '<textarea id="fbIn" style="width:100%;height:110px" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;…&quot;,&#10;  authDomain: &quot;…&quot;,&#10;  projectId: &quot;…&quot;, …"></textarea>'+
  '<div class="bar" style="margin:8px 0 0"><button class="b pri" onclick="applySchoolCloud()">套用</button>'+
  (c&&c.projectId?'<button class="b" onclick="schoolLink()">複製給同事的設定連結</button>':'')+
  (c&&!c.local?'':'')+(c?'<button class="b" onclick="setSchoolCloud(null,\'已改回網站內建的設定\')">改回網站內建的設定</button>':'')+
  (!(c&&c.local)&&(b||c)?'<button class="b" onclick="setSchoolCloud({local:true},\'已改成單機，不連雲端\')">不使用雲端（單機）</button>':'')+'</div></details>';}
function backupHtml(open){return '<details class="more"'+(open?' open':'')+'><summary>備份與還原</summary><p class="note">資料會自動儲存'+(cloudState==='on'?'並同步給共用的老師':'在這台電腦的這個瀏覽器')+'。換電腦、清瀏覽器資料之前，或想留一份存檔時再下載備份檔。備份檔含名冊、排課、段考考場與通知單，有學生姓名，請自行保管。</p>'+
  '<p class="note">另外，每天第一次修改和每次匯入之前，這台電腦都會自動保留一份，可以在「名冊 › 匯入與新學期」回到之前的版本。</p><div class="bar" style="margin:0"><button class="b" onclick="exportJson()">下載備份檔</button><button class="b" onclick="$(\'imp\').click()">從備份檔還原</button><button class="b danger" onclick="resetAll()">全部清空</button></div></details>';}
function renderShare(){
  const st=cloudState,u=CLOUD&&CLOUD.user;let h='';
  if(st==='local')h+='<h3>資料存在這台電腦</h3><p class="lead">這一份還沒有連接雲端，資料只存在這台電腦的這個瀏覽器。要讓幾位老師共用同一份，請看下面的「學校自己的雲端」。</p>';
  else if(st==='offline')h+='<h3>連不上雲端</h3><p class="lead">可能是沒有網路。現在看到的是這台電腦上的資料，連上線後重新整理就會同步。</p>';
  else if(st==='out')h+='<h3>與其他老師共用</h3><p class="lead">登入後，幾位老師可以<b>同時打開同一份</b>：任何人改名冊、分組或拖課表，其他人的畫面都會立刻跟著變，不用互傳檔案。</p>'+
    '<ol><li>用你的 Google 帳號登入（第一位登入的人是主持人）。</li><li>主持人輸入其他老師的 Gmail，選「編輯」或「檢視」。</li><li>把網址傳給他們，他們登入後就會看到同一份。</li></ol>'+
    '<button class="b pri big" onclick="cloudLogin()">用 Google 帳號登入</button><p class="note">登入後會改用雲端上大家共用的那一份；如果雲端還沒有資料，會把這台電腦現在的資料傳上去當第一份。</p>';
  else if(st==='part')h+='<h3>部分共用</h3><p class="lead">你已經登入（'+esc(u?u.email:'')+'）。<b>段考考場</b>和以前一樣是大家共用的；<b>名冊、排課、簽到退</b>在雲端還沒開通，目前先存在這台電腦，請記得備份。</p><div class="bar" style="margin:0"><button class="b" onclick="cloudLogout()">登出</button></div>';
  else if(st==='wait')h+='<h3>共用與協作</h3><p class="lead">連線中…</p>';
  else if(st==='denied')h+='<h3>還沒被加入共用</h3><div class="box bad">你登入的帳號 <b>'+esc(u?u.email:'')+'</b> 不在共用名單裡，所以看不到大家共用的那一份。</div>'+
    '<ol><li>把上面這個信箱傳給主持人。</li><li>請主持人按「共用」，把你的信箱加進去。</li><li>加好之後回來重新整理這一頁。</li></ol>'+
    '<div class="bar" style="margin:0"><button class="b pri" data-t="'+esc(u?u.email:'')+'" onclick="copyText(this.dataset.t,\'已複製信箱\')">複製我的信箱</button><button class="b" onclick="location.reload()">重新整理</button><button class="b" onclick="cloudLogout()">換一個帳號</button></div>';
  else{
    const A=CLOUD.access||{},emails=A.emails||[],admin=A.admin===u.email,onSet=new Set(onlineList().map(x=>x.email)),L=CLOUD.last,V=A.viewers||[];
    const roleSel=e=>'<select data-e="'+esc(e)+'" onchange="setRole(this.dataset.e,this.value)"><option value="e"'+(V.includes(e)?'':' selected')+'>編輯</option><option value="v"'+(V.includes(e)?' selected':'')+'>檢視</option></select>';
    h+='<h3>共用與協作</h3><div class="box ok"><div class="bar" style="margin:0"><b>已同步</b><span class="grow"></span><span>'+esc(u.email)+'</span><button class="b sm" onclick="cloudLogout()">登出</button></div>'+
      '<div>'+(isRO()?'主持人和編輯的老師一改，你的畫面會即時更新。':'所有修改都會自動儲存，名單內的老師會即時看到。')+(L&&L.by?'<br>最後更新：<b>'+esc(who(L.by))+'</b>　'+fmtAt(L.at):'')+'</div></div>';
    if(isRO())h+='<div class="box bad">你是「檢視」權限：可以看、列印，不能修改。</div>';
    h+='<h4>可以使用的老師（'+emails.length+' 人）</h4><p class="note" style="margin-top:0">編輯＝可以改；檢視＝每一頁都看得到，但不能改。這份名單同時管名冊、排課與段考考場。</p><div>'+
      emails.map(e=>'<div class="mem">'+avatar({email:e})+'<span class="e">'+esc(e)+(e===u.email?'（我）':'')+'</span>'+(onSet.has(e)?'<span class="tag on">在線上</span>':'')+
        (e===A.admin?'<span class="tag">主持人</span>':admin?roleSel(e)+'<button class="b sm danger" data-e="'+esc(e)+'" onclick="removeMember(this.dataset.e)">移除</button>':'<span class="tag">'+(V.includes(e)?'檢視':'編輯')+'</span>')+'</div>').join('')+'</div>';
    if(admin)h+='<div class="addrow"><input id="memIn" type="email" placeholder="輸入老師的 Gmail，例：teacher@gmail.com" onkeydown="if(event.key===\'Enter\')addMember()"><select id="memRole"><option value="e">編輯</option><option value="v">檢視</option></select><button class="b pri" onclick="addMember()">加入</button></div>'+
      '<p class="note">加入後把網址傳給對方，對方用同一個 Gmail 登入就可以了。權限隨時可以改。</p><button class="b" onclick="copyText(location.href.split(\'#\')[0],\'已複製網址，貼給老師就可以了\')">複製網址</button>';
    else h+='<p class="note">要增減老師或改權限，請找主持人 '+esc(A.admin||'')+'。</p>';
    h+='<p class="note">兩位老師同時改同一個地方時，以最後存檔的人為準。</p>';
  }
  $('dlgBody').innerHTML=h+backupHtml(st==='local'||st==='offline'||st==='part')+schoolCloudHtml(shareOpen===2)+'<div class="bar" style="margin:16px 0 0"><span class="grow"></span><button class="b" onclick="closeDlg()">關閉</button></div>';
}
function openShare(x){shareOpen=x?2:true;openDlg('',()=>{shareOpen=false;});renderShare();}
function copyText(t,msg){(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast(msg),()=>prompt('請手動複製：',t));}
async function setMembers(emails,viewers,msg){viewers=viewers.filter(e=>emails.includes(e)&&e!==CLOUD.access.admin);
  try{await CLOUD.db.doc('config/access').update({emails,viewers});CLOUD.access.emails=emails;CLOUD.access.viewers=viewers;setCloudUI('on');toast(msg);}catch(e){toast('更新失敗：'+(e.code||e.message));}}
function setRole(e,r){const v=viewersOf().filter(x=>x!==e);if(r==='v')v.push(e);setMembers(CLOUD.access.emails||[],v,e+' 已改成「'+(r==='v'?'檢視':'編輯')+'」');}
function addMember(){const el=$('memIn'),v=el.value.trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){toast('請輸入完整的信箱，例如 teacher@gmail.com');el.focus();return;}
  const cur=CLOUD.access.emails||[];if(cur.includes(v)){toast('這位老師已經在名單裡了');return;}
  const ro=$('memRole').value==='v';setMembers(cur.concat([v]),viewersOf().concat(ro?[v]:[]),'已加入 '+v+'（'+(ro?'檢視':'編輯')+'），把網址傳給對方就可以了');}
function removeMember(e){if(!confirm('確定把 '+e+' 移出共用名單？對方之後就看不到這一份了。'))return;setMembers((CLOUD.access.emails||[]).filter(x=>x!==e),viewersOf(),'已移除 '+e);}
function cloudLogin(){CLOUD.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e=>toast('登入失敗：'+(e.code||e.message)));}
function presBeat(gone){if(!CLOUD||!CLOUD.user||!CLOUD.access)return Promise.resolve();const u=CLOUD.user;
  return CLOUD.db.doc('rc/presence').set({[u.uid]:gone?firebase.firestore.FieldValue.delete():{email:u.email,name:u.displayName||'',at:Date.now()}},{merge:true}).catch(()=>{});}
function cloudLogout(){presBeat(true).then(()=>CLOUD.auth.signOut());}
function cloudStop(){if(attUnsub){attUnsub();attUnsub=null;}attWatched='';['unsub','unsubP','unsubA'].forEach(k=>{if(CLOUD[k]){CLOUD[k]();CLOUD[k]=null;}});clearInterval(presTimer);clearTimeout(cloudTimer);cloudReady=false;lastPushed='';CLOUD.access=null;CLOUD.presence={};CLOUD.last=null;}
async function cloudInit(){
  const cfg=window.FIREBASE_CONFIG;if(!cfg||!cfg.projectId){setCloudUI('local');return;}
  setCloudUI('wait');
  try{if(typeof firebase==='undefined'){await loadScript(FBSDK+'app-compat.js');await loadScript(FBSDK+'auth-compat.js');await loadScript(FBSDK+'firestore-compat.js');}}
  catch(e){setCloudUI('offline');return;}
  if(!firebase.apps||!firebase.apps.length)firebase.initializeApp(cfg);
  CLOUD={auth:firebase.auth(),db:firebase.firestore(),user:null,unsub:null,unsubP:null,unsubA:null,access:null,presence:{},last:null};
  CLOUD.auth.onAuthStateChanged(u=>{cloudStop();CLOUD.user=u;if(!u){setCloudUI('out');return;}setCloudUI('wait');cloudConnect();});
  window.addEventListener('pagehide',()=>{presBeat(true);});
}
async function cloudConnect(){
  const db=CLOUD.db,user=CLOUD.user,acc=db.doc('config/access');
  try{
    let a=await acc.get();
    if(!a.exists){
      if(!confirm('這一份還沒有主持人。\n要讓 '+user.email+' 成為主持人嗎？（之後由你決定哪些老師可以編輯、哪些只能檢視）')){setCloudUI('denied');return;}
      await acc.set({admin:user.email,emails:[user.email],viewers:[]});a=await acc.get();
    }
    CLOUD.access=a.data();
  }catch(e){setCloudUI('denied');return;}
  // 名單與權限：主持人一改，大家的畫面立刻跟著變；被移除就看不到
  CLOUD.unsubA=acc.onSnapshot(a=>{if(!a.exists)return;const was=isRO();CLOUD.access=a.data();
    if(cloudState==='on'){setCloudUI('on');if(was!==isRO())toast(isRO()?'主持人把你改成「檢視」權限':'主持人把你改成「編輯」權限');}},()=>{cloudStop();setCloudUI('denied');});
  // 名冊與排課
  CLOUD.unsub=db.doc('rc/main').onSnapshot(snap=>{
    if(snap.metadata&&snap.metadata.hasPendingWrites)return;
    if(!snap.exists){cloudReady=true;setCloudUI('on');attWatch(today());if(!isRO())cloudPush();return;}
    const x=snap.data(),json=x.json;cloudReady=true;CLOUD.last={by:x.by,at:x.at};setCloudUI('on');attWatch(today());
    if(json===lastPushed||json===JSON.stringify(D)){lastPushed=json;return;}
    try{D=normalize(JSON.parse(json));}catch(e){return;}
    lastPushed=json;localSave();rebuild();undoStack=[];$('title').value=D.title||'';paintSchool();if(page!=='exam')render();
    toast(x.by&&x.by!==user.email?who(x.by)+' 更新了內容':'已載入雲端最新資料');
  },()=>{cloudStop();CLOUD.user=user;setCloudUI('part');});
  // 誰在線上
  CLOUD.unsubP=db.doc('rc/presence').onSnapshot(snap=>{CLOUD.presence=snap.data()||{};if(cloudState==='on')setCloudUI('on');},()=>{});
  presBeat();presTimer=setInterval(()=>{presBeat();if(cloudState==='on')setCloudUI('on');},60000);
}
function cloudPush(){
  if(!CLOUD||!CLOUD.user||!cloudReady||isRO())return;
  clearTimeout(cloudTimer);
  cloudTimer=setTimeout(()=>{const json=JSON.stringify(D);if(json===lastPushed)return;lastPushed=json;
    CLOUD.db.doc('rc/main').set({json,by:CLOUD.user.email,at:firebase.firestore.FieldValue.serverTimestamp()}).catch(e=>toast('雲端儲存失敗：'+(e.code||e.message)));},800);
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

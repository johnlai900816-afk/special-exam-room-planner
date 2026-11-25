/* 學校自己的雲端：這台瀏覽器設定過學校自己的 Firebase，就用它取代內建的設定；設成「單機」就不連雲端。
   同事拿到的設定連結長這樣：網址#cloud=＜設定＞。連結只會「帶入」設定表單，不會自動套用：
   打開後會在「學校自己的雲端」顯示專案名稱與登入網域，要老師自己再按「套用」並確認才會生效（cloud.js）。 */
(function(){
  var K='rc-school-cloud';window.BUILTIN_FIREBASE=window.FIREBASE_CONFIG||null;
  // 只留 Firebase 網頁設定會用到的欄位；格式不對就不用（避免被塞進奇怪的登入網域）
  function clean(c){
    if(!c||typeof c!=='object')return null;
    var o={},keys=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId'];
    for(var i=0;i<keys.length;i++){var v=c[keys[i]];if(v!=null){if(typeof v!=='string'||v.length>200)return null;o[keys[i]]=v;}}
    if(!/^AIza[0-9A-Za-z_\-]{30,45}$/.test(o.apiKey||''))return null;
    if(!/^[a-z0-9][a-z0-9\-]{3,38}[a-z0-9]$/.test(o.projectId||''))return null;
    // 登入網域只接受 Firebase 自己的網域（＜專案＞.firebaseapp.com 或 ＜專案＞.web.app）
    if(!/^[a-z0-9][a-z0-9\-]{0,62}\.(firebaseapp\.com|web\.app)$/.test(o.authDomain||''))return null;
    return o;
  }
  window.cleanFbConfig=clean;
  // 設定連結：只記在這一頁的記憶體裡，等老師在設定表單確認；不寫進這台電腦
  try{var m=location.hash.match(/[#&]cloud=([A-Za-z0-9_\-]+)/);
    if(m){history.replaceState(null,'',location.pathname+location.search);
      var c=null;try{c=clean(JSON.parse(atob(m[1].replace(/-/g,'+').replace(/_/g,'/'))));}catch(e){}
      window.PENDING_SCHOOL_CLOUD=c||{bad:true};}}catch(e){}
  try{var o=JSON.parse(localStorage.getItem(K)||'null');
    if(o&&o.local)window.FIREBASE_CONFIG=null;
    else if(o){var ok=clean(o);if(ok){window.FIREBASE_CONFIG=ok;window.SCHOOL_CLOUD_ACTIVE=ok.projectId;}}}catch(e){}
  window.SCHOOL_CLOUD_KEY=K;
})();

/* 學校自己的雲端：這台瀏覽器設定過學校自己的 Firebase，就用它取代內建的設定；設成「單機」就不連雲端。
   同事拿到的設定連結長這樣：網址#cloud=＜設定＞，打開時會先問過才套用 */
(function(){
  var K='rc-school-cloud';window.BUILTIN_FIREBASE=window.FIREBASE_CONFIG||null;
  try{var m=location.hash.match(/[#&]cloud=([A-Za-z0-9_\-]+)/);
    if(m){history.replaceState(null,'',location.pathname+location.search);
      var c=JSON.parse(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')));
      if(c&&c.apiKey&&c.projectId&&c.authDomain&&confirm('這個連結會讓這台電腦的資源班管理系統改用雲端「'+c.projectId+'」。\n\n只有在你們學校的管理者給你這個連結時才按「確定」。登入之後，名冊和排課會存在這個雲端。'))
        localStorage.setItem(K,JSON.stringify(c));}}catch(e){}
  try{var o=JSON.parse(localStorage.getItem(K)||'null');
    if(o&&o.local)window.FIREBASE_CONFIG=null;else if(o&&o.apiKey&&o.projectId)window.FIREBASE_CONFIG=o;}catch(e){}
  window.SCHOOL_CLOUD_KEY=K;
})();

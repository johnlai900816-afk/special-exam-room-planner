/* 資源班管理系統｜額外功能的畫面：導師週報、學年交接檢查、老師工作量、教室使用率、鎖課異動紀錄、家長聯絡紀錄、段考服務（IEP）
   計算都在 core.js（weeklySummary、handoverCheck、teacherLoad、roomUsage、lockDiff、contactDigest…），這裡只畫畫面、存資料。
   接點（app.js 有呼叫才會出現；沒有呼叫時這個檔什麼都不做）：
   ・window.EXT_PAGES[鍵](#page)：'checkin/weekly'、'settings/handover'、'stats/load'、'stats/rooms'、'stats/locklog'
   ・window.STU_SECTIONS／STU_SECTIONS_AFTER：個案頁的「家長聯絡紀錄」「段考服務（IEP）」
   ・window.TODO_HOOKS：今天的待辦
   ・window.onScheduleConfirmed(版本名稱)：確定採用課表之後記一筆鎖課異動
   新的資料欄位：D.weekly、D.handoverBase、D.lockLog、D.lockLast、D.contacts、學生的 examSvc */
(function(root){
'use strict';
const C=(typeof CORE!=='undefined'&&CORE)||root.CORE||(typeof require==='function'?(()=>{try{return require('./core.js');}catch(e){return null;}})():null);

/* ───── 取用 app.js 的東西（都可能不存在：先檢查再用） ───── */
const XD=()=>(typeof D!=='undefined'&&D)?D:null;                       // eslint-disable-line no-undef
const XATT=()=>(typeof ATT!=='undefined'&&ATT)?ATT:{};                  // eslint-disable-line no-undef
const fn=n=>typeof root[n]==='function'?root[n]:null;
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const say=(m,o)=>{const t=fn('toast');if(t)t(m,o);};
const ro=()=>{const f=fn('isRO');try{return !!(f&&f());}catch(e){return false;}};
function store(){const s=fn('save')||fn('changed');if(s)s();}
const DAYW=['一','二','三','四','五'];
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const todayS=()=>ymd(new Date());
const md=s=>{const m=String(s||'').match(/^\d{4}-(\d{2})-(\d{2})/);return m?(+m[1])+'/'+(+m[2]):String(s||'');};
const fmtAt=t=>{const d=new Date(+t||0);return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes());};
const role=()=>root.APPROLE==='teacher'?'teacher':'admin';
const meTid=()=>String(root.ME_TID||'');
// 私密區段：老師身分時只有這位學生的個管看得到；管理者都看得到。ctx 是個案頁傳來的 {canPriv}：說不行就一定不行
function canSee(s,ctx){if(!s)return false;if(ctx&&ctx.canPriv===false)return false;if(role()!=='teacher')return true;return !!meTid()&&s.caseMgr===meTid();}
function canEdit(s){return canSee(s)&&!ro();}
// 正式課表（D.assign）。app 的 ST 在排課頁可能是草稿，所以這裡自己算
function official(){const d=XD();if(!d||!C)return null;const M=C.compile(d),S=C.toState(M,d);return {M,S};}
function examData(){try{const o=JSON.parse(root.localStorage.getItem('special-exam-room-v1'));return o&&typeof o==='object'?o:null;}catch(e){return null;}}
function copyText(text,ta){const ok=()=>say('已複製'),fb=()=>{try{if(ta){ta.focus();ta.select();}const r=document.execCommand&&document.execCommand('copy');if(r)ok();else say('沒辦法自動複製，請手動複製');}catch(e){say('沒辦法自動複製，請手動複製');}};
  if(root.navigator&&navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(ok,fb);else fb();}
// 前往其他頁：新版的頁面鍵優先，沒有就試舊版的
const PG=()=>(typeof PAGES!=='undefined'&&PAGES)?PAGES:{};               // eslint-disable-line no-undef
function nav(to,id){const go=fn('go');if(!go)return;
  if(to==='stu'&&id&&fn('stuOpen')){root.stuOpen(id);return;}
  const cand={stu:[['stu'],['roster','stu']],stulist:[['stu'],['roster','stu']],tt:[['set','tt'],['roster','tt']],group:[['sched','groups']],tea:[['set','tea'],['roster','tea']],
    weekly:[['checkin','weekly']],handover:[['set','handover'],['settings','handover']]}[to]||[[to]];
  const P=PG(),hit=cand.find(c=>P[c[0]]&&(!c[1]||!P[c[0]].subs||P[c[0]].subs.some(x=>x[0]===c[1])))||cand[0];go(hit[0],hit[1]);}
function slotName(d,k){const m=String(k||'').match(/^(\d)-(.+)$/);if(!m)return String(k||'');const p=((d&&d.periods)||[]).find(x=>String(x.id)===m[2]);return '週'+(DAYW[+m[1]]||'?')+(p?p.name:m[2]);}
const chip=(t,c)=>`<span class="xx-chip${c?' '+c:''}">${E(t)}</span>`;
const btn=(label,a,o,cls)=>`<button type="button" class="b${cls?' '+cls:''}" data-xa="${E(a)}"${Object.keys(o||{}).map(k=>` data-${k}="${E(o[k])}"`).join('')}>${E(label)}</button>`;
const card=(no,title,body,extra)=>`<section class="xx-card">${title?`<h3 class="xx-h">${no?`<span class="xx-no">${pad(no)}</span>`:''}${E(title)}${extra||''}</h3>`:''}${body}</section>`;
const empty=(t,b)=>`<div class="xx-empty"><p>${E(t)}</p>${b||''}</div>`;
// 一頁畫在 #page 裡的一個 div；事件綁在這個 div（重畫時整個換掉，不會越綁越多）
function mount(el,key,html,on){if(!el)return null;css();el.innerHTML=`<div class="xx" data-xx="${E(key)}">${html}</div>`;const w=el.firstElementChild;
  if(on){w.addEventListener('click',e=>{const b=e.target.closest('[data-xa]');if(b&&w.contains(b)&&!b.disabled)on(b.dataset.xa,b,e);});
    w.addEventListener('change',e=>{const t=e.target;if(t&&t.dataset&&t.dataset.xc)on('c:'+t.dataset.xc,t,e);});}
  return w;}

/* ───── 樣式：只用 DESIGN.md 的變數，名稱前面都加 xx- ───── */
function css(){if(typeof document==='undefined'||document.getElementById('xx-css'))return;const st=document.createElement('style');st.id='xx-css';st.textContent=`
.xx{color:var(--ink,#1f2430)}
.xx-card{background:var(--card,#fff);border:1px solid var(--line,#e7e3db);border-radius:16px;padding:20px 22px;margin:0 0 16px;box-shadow:0 1px 2px rgba(31,36,48,.04);min-width:0}
.xx-h{font-size:17px;font-weight:700;letter-spacing:-.02em;margin:0 0 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.xx-no{font-size:13px;color:var(--red,#b8423a);letter-spacing:.08em;font-weight:700}
.xx-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
.xx-bar .grow,.xx-grow{flex:1}
.xx-hint{font-size:14px;color:var(--mute,#6b6f7a);margin:0 0 12px}
.xx-dim{color:var(--mute,#6b6f7a);font-size:14px}
.xx-num{font-variant-numeric:tabular-nums;font-weight:700}
.xx input[type=text],.xx input[type=date],.xx input[type=number],.xx select,.xx textarea{font:inherit;font-size:16px;color:var(--ink,#1f2430);background:var(--card,#fff);border:1px solid var(--line2,#d6d0c5);border-radius:10px;min-height:40px;padding:0 10px;box-sizing:border-box;max-width:100%}
.xx textarea{width:100%;min-height:150px;padding:10px;line-height:1.6;resize:vertical}
.xx input:focus-visible,.xx select:focus-visible,.xx textarea:focus-visible,.xx button:focus-visible,.xx summary:focus-visible{outline:2px solid var(--focus,#2f5c8a);outline-offset:1px}
.xx .b{min-height:40px}
.xx-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
.xx-t{border-collapse:collapse;width:100%;font-size:15px}
.xx-t th{background:var(--sunk,#efece6);color:var(--mute,#6b6f7a);font-size:13px;font-weight:600;text-align:left;padding:8px 10px;white-space:nowrap}
.xx-t td{border-top:1px solid var(--line,#e7e3db);padding:8px 10px;vertical-align:middle}
.xx-t td:first-child{white-space:nowrap}
.xx-t td.wide{min-width:180px}
.xx-t td.n,.xx-t th.n{text-align:right;font-variant-numeric:tabular-nums}
.xx-t tr.over td:first-child{box-shadow:inset 3px 0 var(--bad,#b3382d)}
.xx-t tr.under td:first-child{box-shadow:inset 3px 0 var(--warn,#9a5b0b)}
.xx-t th button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;min-height:28px}
.xx-t th button[aria-sort]::after{content:'';border:4px solid transparent;margin-left:2px}
.xx-t th button[aria-sort=ascending]::after{border-bottom-color:currentColor;margin-top:-4px}
.xx-t th button[aria-sort=descending]::after{border-top-color:currentColor;margin-top:4px}
.xx-chip{display:inline-flex;align-items:center;border-radius:999px;font-size:13px;padding:2px 10px;background:var(--sunk,#efece6);color:var(--ink2,#4a5060);white-space:nowrap;line-height:1.6}
.xx-chip.ok{background:var(--ok-l,#e6f2ec);color:var(--ok,#2f7a5b)}
.xx-chip.warn{background:var(--warn-l,#fbf0dc);color:var(--warn,#9a5b0b)}
.xx-chip.bad{background:var(--bad-l,#fbe8e5);color:var(--bad,#b3382d)}
.xx-meter{position:relative;height:8px;border-radius:999px;background:var(--sunk,#efece6);min-width:80px}
.xx-meter i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--ink2,#4a5060)}
.xx-meter i.over{background:var(--bad,#b3382d)}
.xx-meter i.under{background:var(--warn,#9a5b0b)}
.xx-meter b{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink,#1f2430);border-radius:1px}
.xx-list{list-style:none;margin:0;padding:0}
.xx-list li{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line,#e7e3db)}
.xx-list li:first-child{border-top:0}
.xx-list li>span{flex:1;min-width:160px}
.xx-list li small{display:block;color:var(--mute,#6b6f7a);font-size:14px}
.xx-empty{padding:12px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.xx-empty p{margin:0;color:var(--mute,#6b6f7a)}
.xx details{margin-top:8px}
.xx summary{cursor:pointer;color:var(--blue,#2f5c8a);font-size:14px;min-height:32px;display:flex;align-items:center}
.xx-pre{white-space:pre-wrap;background:var(--sunk,#efece6);border-radius:10px;padding:12px;font-size:14px;line-height:1.6;max-height:260px;overflow:auto;margin:8px 0}
.xx-grid{border-collapse:separate;border-spacing:3px;width:100%;table-layout:fixed;min-width:420px}
.xx-grid th{font-size:13px;color:var(--mute,#6b6f7a);font-weight:600;padding:2px}
.xx-grid th.p{width:64px;text-align:right;padding-right:6px;white-space:nowrap}
.xx-grid td{height:40px;border-radius:8px;font-size:13px;text-align:center;padding:2px 4px;line-height:1.3;overflow:hidden;text-overflow:ellipsis}
.xx-grid td.busy{background:var(--card,#fff);border:1px solid var(--line2,#d6d0c5);color:var(--ink,#1f2430)}
.xx-grid td.busy small{display:block;color:var(--mute,#6b6f7a);font-size:12px}
.xx-grid td.free{background:var(--ok-l,#e6f2ec);color:var(--ok,#2f7a5b);font-weight:600}
.xx-grid td.off{background:var(--sunk,#efece6);color:var(--mute,#6b6f7a)}
.xx-grid td.pick{outline:2px solid var(--blue,#2f5c8a);outline-offset:-2px}
.xx-rooms{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px 24px;margin:0;padding:0;list-style:none}
.xx-rooms li{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center}
.xx-rooms li .xx-meter{grid-column:1/-1}
.xx-tl{list-style:none;margin:0;padding:0 0 0 18px;border-left:2px solid var(--line,#e7e3db)}
.xx-tl>li{position:relative;padding:0 0 18px 8px}
.xx-tl>li::before{content:'';position:absolute;left:-25px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--card,#fff);border:2px solid var(--ink2,#4a5060)}
.xx-tl>li.sent::before{background:var(--ok,#2f7a5b);border-color:var(--ok,#2f7a5b)}
.xx-tl .when{font-size:14px;color:var(--mute,#6b6f7a)}
.xx-add{color:var(--ok,#2f7a5b)}.xx-del{color:var(--bad,#b3382d)}
.xx-svc{display:grid;grid-template-columns:84px 1fr;gap:8px 12px;align-items:start}
.xx-svc>b{padding-top:9px;font-weight:600}
.xx-subj{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.xx-subj label{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line2,#d6d0c5);border-radius:999px;padding:4px 10px;font-size:14px;min-height:32px;cursor:pointer}
.xx-subj input{margin:0}
.xx-sec{min-width:0;max-width:100%}
.xx-form{display:grid;grid-template-columns:170px 120px minmax(0,1fr);gap:8px;margin:12px 0 0}
.xx-form>*{width:100%;min-width:0}
.xx-form .wide{grid-column:1/-1}
@media (max-width:600px){.xx-card{padding:16px}.xx-form{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.xx-form .wide,.xx-form .nt{grid-column:1/-1}.xx-svc{grid-template-columns:1fr}.xx-svc>b{padding-top:0}}
@media print{.xx-card{border:0;box-shadow:none}.xx .b{display:none}}`;
  document.head.appendChild(st);}

/* ═════ 1. 導師週報（點名 › 導師週報） ═════ */
const WK={ws:'',draft:{},ai:{}};
function weeklyPage(el){
  const d=XD();if(!d||!C){mount(el,'weekly',empty('資料還沒載入。'));return;}
  const t=todayS();if(!WK.ws)WK.ws=C.weekStartOf(C.addDays(t,-7));
  const ws=WK.ws,we=C.addDays(ws,4),o=official();
  // 雲端的出缺席紀錄是分開抓的（checkin.js），這一週還沒抓過就抓一次
  try{if(typeof cloudState!=='undefined'&&cloudState==='on'&&fn('attFetch')&&weeklyPage.got!==ws){weeklyPage.got=ws;root.attFetch(ws,we).then(ch=>{if(ch&&el.querySelector('[data-xx="weekly"]'))weeklyPage(el);}).catch(()=>{});}}catch(e){}   // eslint-disable-line no-undef
  let W=C.weeklySummary(d,XATT(),ws,{today:t,M:o.M,slot:o.S.slot});
  if(role()==='teacher'){const mine=new Set(d.groups.filter(g=>g.teacher===meTid()).map(g=>g.id));
    W.classes=W.classes.map(c=>Object.assign({},c,{students:c.students.map(s=>Object.assign({},s,{rows:s.rows.filter(r=>mine.has(r.gid))})).filter(s=>s.rows.length)})).filter(c=>c.students.length);}
  const sent=!!(d.weekly&&d.weekly[ws]),from=role()==='teacher'?((d.teachers.find(x=>x.id===meTid())||{}).name||''):'資源班';
  const gm=typeof GEMINI!=='undefined'&&GEMINI&&typeof GEMINI.ready==='function'&&(()=>{try{return GEMINI.ready();}catch(e){return false;}})();   // eslint-disable-line no-undef
  let h=`<div class="xx-bar">${btn('上一週','wk',{d:-7})}<input type="date" value="${E(ws)}" data-xc="wk" aria-label="選一週">${btn('下一週','wk',{d:7})}
    <span class="xx-num">${E(md(ws)+'～'+md(we))}</span>${sent?chip('已發送','ok'):''}<span class="xx-grow"></span>
    ${ro()?'':sent?btn('改成還沒發','sent',{v:0}):btn('已發送','sent',{v:1},'pri')}</div>`;
  if(!W.classes.length)h+=empty(o.S.slot.some(s=>s>=0)?'這一週沒有抽離課。':'還沒有正式課表。');
  W.classes.forEach((c,ci)=>{const k=ws+'|'+c.cls,txt=WK.draft[k]!=null?WK.draft[k]:C.weeklyText(W,c,{from});
    const rows=c.students.map(s=>{const x=s.c,notes=s.rows.filter(r=>r.note||r.st==='late'||r.st==='abs'||r.st==='leave');
      return `<tr><td>${E(s.seat?pad(s.seat)+' ':'')}${E(s.name)}</td><td class="n">${x.n}</td><td class="n">${x.in}</td><td class="n">${x.late||''}</td><td class="n">${x.leave||''}</td><td class="n">${x.abs?`<b class="xx-del">${x.abs}</b>`:''}</td><td class="n">${x.none?`<span class="xx-dim">${x.none}</span>`:''}</td>
        <td class="wide">${notes.map(r=>E(md(r.date)+' '+r.pname+' '+({late:'遲到',leave:'請假',abs:'缺席'}[r.st]||'')+(r.note?' '+r.note:''))).join('<br>')}</td></tr>`;}).join('');
    const det=c.students.map(s=>`<li><span><b>${E(s.name)}</b><small>${s.rows.map(r=>E(md(r.date)+' '+r.pname+' '+(r.gname||r.subject)+' '+(r.future?'還沒上':({in:'已到',late:'遲到',leave:'請假',abs:'缺席'}[r.st]||'未點名')))).join('、')}</small></span></li>`).join('');
    h+=card(ci+1,c.cls+' 班',`<div class="xx-scroll"><table class="xx-t"><thead><tr><th>學生</th><th class="n">節數</th><th class="n">出席</th><th class="n">遲到</th><th class="n">請假</th><th class="n">缺席</th><th class="n">未點名</th><th>特別的事</th></tr></thead><tbody>${rows}</tbody></table></div>
      <details><summary>逐節明細</summary><ul class="xx-list">${det}</ul></details>
      <div style="margin-top:12px"><textarea data-xc="draft" data-k="${E(k)}" aria-label="${E(c.cls)} 班的週報草稿">${E(txt)}</textarea></div>
      <div class="xx-bar" style="margin:8px 0 0">${btn('複製','copy',{k})}${gm&&!ro()?btn('用 AI 潤飾','ai',{k,ci}):''}${WK.draft[k]!=null?btn('還原草稿','reset',{k}):''}</div>
      <div data-aibox="${E(k)}"></div>`,
      ' '+(c.head?chip('導師 '+c.head):chip('還沒填導師','warn')));});
  const w=mount(el,'weekly',h,(a,b)=>{
    if(a==='wk'){WK.ws=C.weekStartOf(C.addDays(WK.ws,+b.dataset.d));weeklyPage(el);}
    else if(a==='c:wk'){if(b.value){WK.ws=C.weekStartOf(b.value);weeklyPage(el);}}
    else if(a==='c:draft'){WK.draft[b.dataset.k]=b.value;}
    else if(a==='sent'){if(ro())return;const dd=XD();if(!dd.weekly||typeof dd.weekly!=='object')dd.weekly={};if(+b.dataset.v)dd.weekly[ws]=true;else delete dd.weekly[ws];store();weeklyPage(el);}
    else if(a==='copy'){const ta=w.querySelector('textarea[data-k="'+cssq(b.dataset.k)+'"]');if(ta)copyText(ta.value,ta);}
    else if(a==='reset'){delete WK.draft[b.dataset.k];weeklyPage(el);}
    else if(a==='ai'){const ta=w.querySelector('textarea[data-k="'+cssq(b.dataset.k)+'"]'),box=w.querySelector('[data-aibox="'+cssq(b.dataset.k)+'"]');if(ta&&box)aiPolish(W.classes[+b.dataset.ci],ta,box,b.dataset.k);}
  });
  if(w)w.addEventListener('input',e=>{const x=e.target;if(x&&x.dataset&&x.dataset.xc==='draft')WK.draft[x.dataset.k]=x.value;});
}
const cssq=s=>String(s).replace(/["\\]/g,'\\$&');
// 用 AI 潤飾：學生和導師換成代號 → 給老師看要送出的全文 → 按「送出」才送 → 回來再換回名字
function aiPolish(c,ta,box,k){const d=XD();if(!c||!d||typeof GEMINI==='undefined')return;    // eslint-disable-line no-undef
  const pairs=[];c.students.forEach((s,i)=>{if(s.name)pairs.push([String(s.name),'學生'+String.fromCharCode(65+i%26)+(i>=26?Math.floor(i/26):'')]);});
  if(c.head)pairs.push([String(c.head),'導師']);
  pairs.sort((a,b)=>b[0].length-a[0].length);
  let text=ta.value;pairs.forEach(([n,code])=>{text=text.split(n).join(code);});
  let req={system:'你是國中資源班老師的文書助理。把老師寫好的週報改成要用 LINE 傳給導師的訊息：口吻親切有禮、精簡、條列清楚。不可以加入原文沒有的事實或建議；「學生A」「導師」這類代號和日期、節次照抄不要改。只回覆改好的訊息本文。',prompt:text};
  try{if(root.AI&&typeof root.AI.finalize==='function')req=root.AI.finalize(d,req,{names:GEMINI.namesOk&&GEMINI.namesOk()});}catch(e){}   // eslint-disable-line no-undef
  box.innerHTML=`<div class="xx-card" style="margin:12px 0 0;background:var(--sunk,#efece6)"><b>會送給 Gemini 的內容</b><p class="xx-hint" style="margin:4px 0 0">姓名已換成代號。</p><div class="xx-pre"></div>
    <div class="xx-bar" style="margin:0">${btn('送出','go',{},'pri')}${btn('不要送','no')}<span class="xx-dim" data-st></span></div></div>`;
  box.querySelector('.xx-pre').textContent=req.prompt;
  const st=box.querySelector('[data-st]');
  box.onclick=async e=>{const b=e.target.closest('[data-xa]');if(!b)return;e.stopPropagation();
    if(b.dataset.xa==='no'){box.innerHTML='';return;}
    if(b.dataset.xa!=='go')return;b.disabled=true;st.textContent='Gemini 想想看…';
    try{const r=await GEMINI.generate(Object.assign({},req,{kind:'weekly',temperature:.4,names:GEMINI.namesOk&&GEMINI.namesOk()}));   // eslint-disable-line no-undef
      let out=String(r.text||'').trim();pairs.slice().sort((a,b)=>b[1].length-a[1].length).forEach(([n,code])=>{out=out.split(code).join(n);});
      try{if(root.AI&&root.AI.unscrub)out=root.AI.unscrub(d,out);}catch(e2){}
      ta.value=out;WK.draft[k]=out;box.innerHTML='';say('已潤飾，看過再複製');}
    catch(err){b.disabled=false;st.textContent=(err&&err.message)||'沒有成功';}};
}
function weeklyTodo(){const d=XD();if(!d||!C||role()==='teacher')return [];const now=new Date();if(now.getDay()!==1)return [];
  const ws=C.weekStartOf(C.addDays(todayS(),-7));if(d.weekly&&d.weekly[ws])return [];
  if(!Object.keys(d.assign||{}).some(id=>(d.assign[id]||[]).some(e=>e&&e.s)))return [];
  return [{t:'上週導師週報還沒發',n:'點名',level:'warn',go:()=>{WK.ws=ws;nav('weekly');}}];}

/* ═════ 2. 學年交接檢查（設定 › 學校資料） ═════ */
const HK=[['moved','班級、座號異動'],['in','轉入'],['out','轉出'],['tt','全校課表'],['cm','個管'],['due','IEP 與鑑定到期（60 天內）'],['grade','年級不合']];
function handoverPage(el){
  const d=XD();if(!d||!C){mount(el,'handover',empty('資料還沒載入。'));return;}
  const R=C.handoverCheck(d,d.handoverBase,todayS());
  let h=`<div class="xx-bar">${R.hasBase?chip('基準 '+fmtAt(R.at).split(' ')[0]):chip('還沒設基準','warn')}<span class="xx-num">${R.items.length}</span><span class="xx-dim">項</span><span class="xx-grow"></span>${ro()?'':btn('設為新學年基準','base',{},'pri')}</div>`;
  if(!R.items.length)h+=empty('都沒問題。');
  let no=0;HK.forEach(([k,n])=>{const its=R.items.filter(x=>x.k===k);if(!its.length)return;
    const bad=its.filter(x=>x.level==='bad').length;
    h+=card(++no,n,`<ul class="xx-list">${its.slice(0,200).map(x=>`<li><span>${E(x.t)}<small>${E(x.d)}</small></span>${x.level==='bad'?chip('要處理','bad'):''}${btn('前往','go',{to:x.go.to,id:x.go.id||''},'sm')}</li>`).join('')}</ul>${its.length>200?`<p class="xx-dim">還有 ${its.length-200} 項</p>`:''}`,
      ' '+chip(String(its.length),bad?'bad':'warn'));});
  mount(el,'handover',h,(a,b)=>{
    if(a==='go')nav(b.dataset.to,b.dataset.id);
    else if(a==='base'){if(ro())return;if(d.handoverBase&&!root.confirm('換成現在的名冊當基準？之前的基準會被取代。'))return;
      const ss=fn('snapshot');if(ss)try{ss('設學年交接基準之前');}catch(e){}
      d.handoverBase=C.handoverBase(d);store();handoverPage(el);say('已設為新學年基準');}});
}
function handoverTodo(){const d=XD();if(!d||!C||role()==='teacher')return [];
  let R;try{R=C.handoverCheck(d,d.handoverBase,todayS());}catch(e){return [];}
  const n=R.items.filter(x=>x.k==='moved'||x.k==='in'||x.k==='out'||x.k==='grade'||(x.k==='cm'&&x.level==='bad')).length;
  return n?[{t:'學年交接檢查：'+n+' 項',n:'設定',level:'warn',go:()=>nav('handover')}]:[];}

/* ═════ 3. 老師工作量（統計） ═════ */
const LD={k:'per',dir:-1};
function loadPage(el){
  const d=XD(),o=official();if(!d||!o){mount(el,'load',empty('資料還沒載入。'));return;}
  const rows=C.teacherLoad(d,o.M,o.S.slot,examData());
  if(!rows.length){mount(el,'load',empty('還沒有資源班老師。',btn('老師名冊','go',{to:'tea'})),a=>{if(a==='go')nav('tea');});return;}
  const cols=[['name','老師'],['hours','基本鐘點'],['per','已排'],['groups','課'],['cases','個管'],['proctor','監考'],['iep','IEP 會議']];
  const k=LD.k,dir=LD.dir;rows.sort((a,b)=>(k==='name'?String(a.name).localeCompare(String(b.name)):(a[k]-b[k]))*dir||String(a.name).localeCompare(String(b.name)));
  const max=Math.max(1,...rows.map(r=>Math.max(r.per,r.hours))),over=rows.filter(r=>r.flag==='over').length,under=rows.filter(r=>r.flag==='under').length;
  const th=([c,n])=>`<th${c==='name'?'':' class="n"'}><button type="button" data-xa="sort" data-k="${c}"${c===k?` aria-sort="${dir>0?'ascending':'descending'}"`:''}>${E(n)}</button></th>`;
  const tr=r=>`<tr class="${r.flag}"><td>${E(r.name)}${r.flag==='over'?' '+chip('多 '+r.diff,'bad'):r.flag==='under'?' '+chip('少 '+(-r.diff),'warn'):''}</td><td class="n">${r.hours||'<span class="xx-dim">—</span>'}</td>
    <td class="n"><span class="xx-num">${r.per}</span></td><td style="min-width:120px"><div class="xx-meter" title="${E(r.per+(r.hours?' / '+r.hours:'')+' 節')}"><i class="${r.flag}" style="width:${Math.round(r.per/max*100)}%"></i>${r.hours?`<b style="left:calc(${Math.round(r.hours/max*100)}% - 1px)"></b>`:''}</div></td>
    <td class="n">${r.groups}</td><td class="n">${r.cases}</td><td class="n">${r.proctor+(r.support?`<small class="xx-dim">＋${r.support}</small>`:'')}</td><td class="n">${r.iep}</td></tr>`;
  const h=`<div class="xx-bar">${over?chip('超過 '+over+' 位','bad'):''}${under?chip('不足 '+under+' 位','warn'):''}${!over&&!under?chip('鐘點都剛好','ok'):''}</div>`+
    card(0,'',`<div class="xx-scroll"><table class="xx-t"><thead><tr>${cols.slice(0,3).map(th).join('')}<th><span class="xx-dim">每週節數</span></th>${cols.slice(3).map(th).join('')}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`);
  mount(el,'load',h,(a,b)=>{if(a==='sort'){const c=b.dataset.k;if(LD.k===c)LD.dir=-LD.dir;else{LD.k=c;LD.dir=c==='name'?1:-1;}loadPage(el);}});
}

/* ═════ 4. 教室使用率（統計） ═════ */
const RM={d:-1,p:'',room:''};
function roomsPage(el){
  const d=XD(),o=official();if(!d||!o){mount(el,'rooms',empty('資料還沒載入。'));return;}
  const M=o.M;if(!d.rooms.length){mount(el,'rooms',empty('還沒有教室。'));return;}
  const U=C.roomUsage(M,o.S.slot,o.S.rfix),now=new Date();
  if(RM.d<0){RM.d=now.getDay()>=1&&now.getDay()<=5?now.getDay()-1:0;}
  if(!RM.p||!d.periods.some(p=>p.id===RM.p)){const hm=pad(now.getHours())+':'+pad(now.getMinutes()),reg=d.periods.filter(p=>!p.extra);RM.p=((reg.find(p=>hm<p.end)||reg[0]||d.periods[0])||{}).id||'';}
  const pi=d.periods.findIndex(p=>p.id===RM.p),s=pi>=0?RM.d*M.NP+pi:-1,free=s>=0?C.freeRooms(U,s):[];
  const tot=U.rooms.reduce((n,r)=>n+r.used,0),cap=U.rooms.reduce((n,r)=>n+r.total,0);
  let h=card(1,'找空教室',`<div class="xx-bar"><select data-xc="d" aria-label="星期">${DAYW.map((x,i)=>`<option value="${i}"${i===RM.d?' selected':''}>週${x}</option>`).join('')}</select>
      <select data-xc="p" aria-label="節次">${d.periods.map(p=>`<option value="${E(p.id)}"${p.id===RM.p?' selected':''}>${E(p.name)}</option>`).join('')}</select></div>
    ${free.length?`<div class="xx-bar" style="margin:0">${free.map(r=>chip(r.name,'ok')).join('')}</div>`:empty('這一節沒有空教室。')}`);
  h+=card(2,'使用率',`<ul class="xx-rooms">${U.rooms.map(r=>`<li><span>${E(r.name)}${r.spare?' '+chip('備用'):''}</span><span class="xx-num">${r.pct}%</span><div class="xx-meter"><i style="width:${r.pct}%"></i></div><small class="xx-dim">${r.used} / ${r.total} 節</small></li>`).join('')}</ul>`,
    ' <span class="xx-dim">全部 '+(cap?Math.round(tot/cap*100):0)+'%</span>');
  if(U.none.length)h+=card(0,'沒有分到教室',`<ul class="xx-list">${U.none.map(x=>`<li><span>${E(x.name)}<small>${E(M.sn(x.s)+(x.teacher?'・'+x.teacher:''))}</small></span></li>`).join('')}</ul>`,' '+chip(String(U.none.length),'bad'));
  const show=U.rooms.filter(r=>!RM.room||r.id===RM.room);
  h+=`<div class="xx-bar" style="margin-top:8px"><select data-xc="room" aria-label="教室"><option value="">全部教室</option>${U.rooms.map(r=>`<option value="${E(r.id)}"${r.id===RM.room?' selected':''}>${E(r.name)}</option>`).join('')}</select></div>`;
  show.forEach((r,ri)=>{const rowsH=d.periods.map((p,pj)=>`<tr><th class="p">${E(p.name)}</th>${DAYW.map((x,dd)=>{const ss=dd*M.NP+pj,ls=U.cells[r.i][ss]||[],off=p.extra||M.blocked[ss],pk=ss===s?' pick':'';
      if(ls.length)return `<td class="busy${pk}" title="${E(ls.map(l=>l.name+(l.teacher?' '+l.teacher:'')).join('、'))}">${E(ls[0].name)}<small>${E(ls[0].teacher)}</small></td>`;
      return off?`<td class="off${pk}">—</td>`:`<td class="free${pk}">空</td>`;}).join('')}</tr>`).join('');
    h+=card(ri+3,r.name,`<div class="xx-scroll"><table class="xx-grid"><thead><tr><th class="p"></th>${DAYW.map(x=>`<th>週${x}</th>`).join('')}</tr></thead><tbody>${rowsH}</tbody></table></div>`,' '+chip(r.pct+'%'));});
  mount(el,'rooms',h,(a,b)=>{if(a==='c:d')RM.d=+b.value;else if(a==='c:p')RM.p=b.value;else if(a==='c:room')RM.room=b.value;else return;roomsPage(el);});
}

/* ═════ 5. 鎖課異動紀錄（統計）＋確定課表時記一筆 ═════ */
function userEmail(){try{return (typeof CLOUD!=='undefined'&&CLOUD&&CLOUD.user&&CLOUD.user.email)||'';}catch(e){return '';}}   // eslint-disable-line no-undef
function recordLocks(label){const d=XD(),o=official();if(!d||!o)return null;
  // 第一次記：拿上一個確定的版本當比較對象（有的話），不然整份都算新增
  if(!d.lockLast){const v=(d.sched&&Array.isArray(d.sched.vers))?d.sched.vers:[],pv=v[v.length-2];
    if(pv&&pv.a&&label!=null)try{const S0=C.toState(o.M,Object.assign({},d,{assign:C.unpackAssign(pv.a)}));d.lockLast={at:pv.at||0,list:C.lockPack(C.lockList(o.M,S0.slot))};}catch(e){}}
  const e=C.lockLogAdd(d,C.lockList(o.M,o.S.slot),{label:label==null?'目前的課表':label,by:userEmail()||'本機'});store();return e;}
const prevConfirmed=root.onScheduleConfirmed;
root.onScheduleConfirmed=function(label){try{if(typeof prevConfirmed==='function')prevConfirmed(label);}catch(e){}
  try{if(!ro())recordLocks(label);}catch(e){}};
function lockTSV(d,e){const L=[['異動','班級','時段','科目','老師'].join('\t')];
  e.added.forEach(x=>L.push(['新增',x.cls,slotName(d,x.k),x.sj,x.t].join('\t')));e.removed.forEach(x=>L.push(['取消',x.cls,slotName(d,x.k),x.sj,x.t].join('\t')));return L.join('\n');}
function locklogPage(el){
  const d=XD();if(!d||!C){mount(el,'locklog',empty('資料還沒載入。'));return;}
  const log=Array.isArray(d.lockLog)?d.lockLog:[];
  if(!log.length){mount(el,'locklog',empty('還沒有紀錄。',ro()?'':btn('記錄目前的鎖課','rec',{},'pri')),a=>{if(a==='rec'){recordLocks(null);locklogPage(el);}});return;}
  const h=`<div class="xx-bar"><span class="xx-dim">確定採用課表時自動記一筆</span><span class="xx-grow"></span>${ro()?'':btn('記錄目前的鎖課','rec')}</div>`+card(0,'',`<ol class="xx-tl">${log.map((e,i)=>({e,i})).reverse().map(({e,i})=>{
    const byC={};e.added.forEach(x=>{(byC[x.cls]=byC[x.cls]||[]).push(['+',x]);});e.removed.forEach(x=>{(byC[x.cls]=byC[x.cls]||[]).push(['-',x]);});
    const det=Object.keys(byC).sort().map(c=>`<li><span><b>${E(c)} 班</b><small>${byC[c].sort((a,b)=>String(a[1].k).localeCompare(String(b[1].k))).map(([m,x])=>`<span class="${m==='+'?'xx-add':'xx-del'}">${m==='+'?'新增':'取消'} ${E(slotName(d,x.k))} ${E(x.sj)} ${E(x.t)}</span>`).join('<br>')}</small></span></li>`).join('');
    const n=e.added.length+e.removed.length;
    return `<li class="${e.sentAt?'sent':''}"><div class="when">${E(fmtAt(e.at))}・${E(e.by||'本機')}</div>
      <div class="xx-bar" style="margin:4px 0"><b>${E(e.label||'（沒有名稱）')}</b>${e.first?chip('第一次記錄・共 '+(e.n||e.added.length)+' 節'):`<span>新增 <b class="xx-num">${e.added.length}</b>／取消 <b class="xx-num">${e.removed.length}</b></span>`}${e.sentAt?chip('已交教務處 '+fmtAt(e.sentAt).split(' ')[0],'ok'):''}</div>
      ${n?`<details><summary>明細</summary><ul class="xx-list">${det}</ul></details>`:''}
      <div class="xx-bar" style="margin:8px 0 0">${n?btn('匯出這次異動','tsv',{i},'sm'):''}${ro()?'':e.sentAt?btn('取消標記','sent',{i,v:0},'sm'):btn('標記為已交教務處','sent',{i,v:1},'sm')}</div></li>`;}).join('')}</ol>`);
  mount(el,'locklog',h,(a,b)=>{const e=log[+b.dataset.i];
    if(a==='rec'){recordLocks(null);locklogPage(el);}
    else if(a==='tsv'&&e)copyText(lockTSV(d,e));
    else if(a==='sent'&&e&&!ro()){if(+b.dataset.v)e.sentAt=Date.now();else delete e.sentAt;store();locklogPage(el);}});
}

/* ═════ 6. 個案頁：家長聯絡紀錄、段考服務（IEP） ═════ */
const CT={edit:{},since:{},dig:{}};
// 畫面裡的資料一律經過 E()（轉義）才放進 HTML
function contactsHtml(s,ctx){const d=XD();if(!d||!C||!canSee(s,ctx))return '';
  const list=((d.contacts&&d.contacts[s.id])||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))),ed=canEdit(s),cur=list.find(x=>x.id===CT.edit[s.id])||null,t=todayS();
  let h=`<div class="xx xx-sec" data-xsec="contacts" data-sid="${E(s.id)}">`;
  h+=list.length?`<ul class="xx-list">${list.map(x=>`<li><span><b>${E(md(x.date))}</b> ${chip(x.how||'其他')} ${E(x.who||'')}<small>${E(x.note||'')}</small></span>${ed?btn('編輯','edit',{id:x.id},'sm')+btn('刪除','del',{id:x.id},'sm danger'):''}</li>`).join('')}</ul>`:`<p class="xx-dim" style="margin:0">還沒有紀錄。</p>`;
  if(ed){const v=cur||{date:t,how:'電話',who:'',note:''};
    h+=`<div class="xx-form"><input type="date" data-f="date" value="${E(v.date)}" aria-label="日期"><select data-f="how" aria-label="方式">${C.CONTACT_HOW.map(o=>`<option${o===v.how?' selected':''}>${E(o)}</option>`).join('')}</select>
      <input type="text" data-f="who" class="nt" value="${E(v.who)}" placeholder="對象（例：母親）" aria-label="對象"><input type="text" data-f="note" class="wide" value="${E(v.note)}" placeholder="內容" aria-label="內容"></div>
      <div class="xx-bar" style="margin:8px 0 0">${btn(cur?'存檔':'新增','save',{},'sm')}${cur?btn('取消','cancel',{},'sm'):''}</div>`;}
  if(list.length){const since=CT.since[s.id]!=null?CT.since[s.id]:(s.iepDate&&String(s.iepDate)<=t?String(s.iepDate):'');
    h+=`<details${CT.dig[s.id]?' open':''} data-dig><summary>整理給 IEP 會議</summary><div class="xx-bar" style="margin:8px 0"><input type="date" data-f="since" value="${E(since)}" aria-label="從哪一天起"><span class="xx-dim">起</span></div>
      <textarea readonly data-f="digest" aria-label="整理好的聯絡紀錄">${E(C.contactDigest(d,s.id,since).text)}</textarea><div class="xx-bar" style="margin:8px 0 0">${btn('複製','copy',{},'sm')}</div></details>`;}
  return h+'</div>';}
const SVC=[['ext','延長'],['read','誦讀'],['oral','口頭'],['pc','電腦'],['small','獨立']];
function svcSubjects(s){const E0=examData(),set=new Set();
  ((E0&&E0.sessions)||[]).forEach(x=>String(x.subject||'').split(/[\/／、,，]/).forEach(y=>{y=y.trim();if(y)set.add(y);}));
  if(!set.size)['國文','英文','數學','社會','自然','作文','英聽'].forEach(x=>set.add(x));
  const v=s.examSvc||{};SVC.forEach(([k])=>{if(Array.isArray(v[k]))v[k].forEach(x=>set.add(String(x)));});return [...set];}
function svcHtml(s,ctx){const d=XD();if(!d||!canSee(s,ctx))return '';const v=s.examSvc||{},ed=canEdit(s),subs=svcSubjects(s),dis=ed?'':' disabled';
  let h=`<div class="xx xx-sec" data-xsec="examsvc" data-sid="${E(s.id)}"><div class="xx-svc">`;
  SVC.forEach(([k,n])=>{const x=v[k],mode=x==='*'?'all':Array.isArray(x)?'some':'';
    h+=`<b>${E(n)}</b><div><select data-f="mode" data-k="${k}" aria-label="${E(n)}"${dis}><option value=""${mode?'':' selected'}>不需要</option><option value="all"${mode==='all'?' selected':''}>全部科目</option><option value="some"${mode==='some'?' selected':''}>指定科目</option></select>
      ${mode==='some'?`<div class="xx-subj">${subs.map(sj=>`<label><input type="checkbox" data-f="sj" data-k="${k}" value="${E(sj)}"${x.includes(sj)?' checked':''}${dis}>${E(sj)}</label>`).join('')}</div>`:''}</div>`;});
  h+=`<b>備註</b><div><input type="text" data-f="note" value="${E(v.note||'')}" style="width:100%" placeholder="例：數學可用計算機" aria-label="段考服務備註"${dis}></div></div></div>`;
  return h;}
function svcSave(s,box){const o={};
  SVC.forEach(([k])=>{const m=box.querySelector('select[data-f="mode"][data-k="'+k+'"]');if(!m||!m.value)return;
    if(m.value==='all'){o[k]='*';return;}
    const cks=[...box.querySelectorAll('input[data-f="sj"][data-k="'+k+'"]')];o[k]=cks.length?cks.filter(c=>c.checked).map(c=>c.value):((s.examSvc&&Array.isArray(s.examSvc[k]))?s.examSvc[k]:[]);});
  const n=box.querySelector('input[data-f="note"]'),note=n?n.value.trim():'';if(note)o.note=note;
  if(Object.keys(o).length)s.examSvc=o;else delete s.examSvc;store();}
// app.js 傳來的 s 是依身分過濾過的副本：要改資料時照 id 找回名冊裡原本那一筆
function sectionsAfter(s0,container,ctx){if(!container||!s0||!canSee(s0,ctx))return;
  const s=((XD()||{}).students||[]).find(x=>x&&x.id===s0.id);if(!s)return;
  const bind=sec=>{const box=container.querySelector('.xx-sec[data-xsec="'+sec+'"][data-sid="'+cssq(s.id)+'"]');if(!box||box._xx)return;box._xx=1;
    const redraw=()=>{const h=sec==='contacts'?contactsHtml(s):svcHtml(s);const tmp=document.createElement('div');tmp.innerHTML=h;const nb=tmp.firstElementChild;if(nb){box.replaceWith(nb);bind(sec);}else box.remove();};
    if(sec==='contacts'){
      box.addEventListener('click',e=>{const b=e.target.closest('[data-xa]');if(!b||!box.contains(b))return;const a=b.dataset.xa,d=XD();if(!d)return;
        if(a==='copy'){const ta=box.querySelector('[data-f="digest"]');if(ta)copyText(ta.value,ta);return;}
        if(!canEdit(s))return;const arr=()=>{if(!d.contacts||typeof d.contacts!=='object')d.contacts={};return d.contacts[s.id]=Array.isArray(d.contacts[s.id])?d.contacts[s.id]:[];};
        if(a==='edit'){CT.edit[s.id]=b.dataset.id;redraw();}
        else if(a==='cancel'){delete CT.edit[s.id];redraw();}
        else if(a==='del'){const x=arr().find(y=>y.id===b.dataset.id);if(!x||!root.confirm('刪除 '+md(x.date)+' 的紀錄？'))return;d.contacts[s.id]=arr().filter(y=>y!==x);if(!d.contacts[s.id].length)delete d.contacts[s.id];if(CT.edit[s.id]===x.id)delete CT.edit[s.id];store();redraw();}
        else if(a==='save'){const f=k=>{const el=box.querySelector('[data-f="'+k+'"]');return el?el.value.trim():'';},date=f('date'),note=f('note'),who=f('who'),how=f('how')||'其他';
          if(!date){say('請填日期');return;}if(!note&&!who){say('請填內容');return;}
          const list=arr(),x=list.find(y=>y.id===CT.edit[s.id]);
          if(x)Object.assign(x,{date,how,who,note});else list.push({id:C.uid?C.uid('c'):'c'+Date.now().toString(36),date,how,who,note});
          delete CT.edit[s.id];store();redraw();}});
      box.addEventListener('change',e=>{const t=e.target;if(t&&t.dataset.f==='since'){CT.since[s.id]=t.value;CT.dig[s.id]=1;redraw();}});
      box.addEventListener('toggle',e=>{if(e.target&&e.target.matches&&e.target.matches('details[data-dig]'))CT.dig[s.id]=e.target.open?1:0;},true);
    }else{
      box.addEventListener('change',e=>{if(!canEdit(s))return;const t=e.target;if(!t||!t.dataset.f)return;svcSave(s,box);if(t.dataset.f==='mode')redraw();});}};
  bind('contacts');bind('examsvc');}

/* ───── 登記 ───── */
root.EXT_PAGES=Object.assign(root.EXT_PAGES||{},{'checkin/weekly':weeklyPage,'settings/handover':handoverPage,'stats/load':loadPage,'stats/rooms':roomsPage,'stats/locklog':locklogPage});
root.STU_SECTIONS=(Array.isArray(root.STU_SECTIONS)?root.STU_SECTIONS:[]).filter(x=>x&&x.id!=='contacts'&&x.id!=='examsvc').concat([
  {id:'contacts',t:'家長聯絡紀錄',render:contactsHtml},
  {id:'examsvc',t:'段考服務（IEP）',render:svcHtml}]);
const prevAfter=root.STU_SECTIONS_AFTER;
root.STU_SECTIONS_AFTER=function(s,container){try{if(typeof prevAfter==='function')prevAfter(s,container);}catch(e){}sectionsAfter(s,container);};
root.TODO_HOOKS=(Array.isArray(root.TODO_HOOKS)?root.TODO_HOOKS:[]).concat([weeklyTodo,handoverTodo]);

const X={canSee,canEdit,weeklyPage,handoverPage,loadPage,roomsPage,locklogPage,contactsHtml,svcHtml,recordLocks,weeklyTodo,handoverTodo,nav,slotName};
root.EXTRAS=X;
if(typeof module!=='undefined'&&module.exports)module.exports=X;
})(typeof window!=='undefined'?window:globalThis);

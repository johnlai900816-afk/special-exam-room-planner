/* 資源班管理系統｜全校課表（設定 › 學校資料 › 全校課表）：讀每班一頁的課表 PDF，得到整張格子（星期 × 節次 → 科目＋老師）
   - 預設請 Gemini 看圖（學校的 AI 服務，或自己的金鑰），一頁一次，同時兩頁，失敗自動等一下再試。
   - 不能用 AI 時，用原本的離線文字辨識（app.js 的 readTT：只讀下方統計，準確度較低）。
   - 檢查、存檔、給別的功能查詢的函式在 core.js 最後的「全校課表：整張格子」區塊；這裡是題目、排隊和畫面。
   - 課表上有老師姓名、沒有學生資料：要老師在「AI 設定」勾選「可以送出老師姓名」才送；每次開網頁第一次送出前先給老師看內容。
   - AI 回來的字只經過 esc() 放進畫面；事件一律用 data-tt＋addEventListener，不把資料放進 onclick。
   這個檔在 app.js 之後載入，把 app.js 的 renderTT、readTT、ttEdit 換成這裡的（原本的留著當離線辨識、只有統計的班級用）。 */
(function(root){
'use strict';
const C=typeof CORE!=='undefined'?CORE:require('./core.js');
const G=()=>root.GEMINI||(typeof require==='function'?require('./gemini.js'):null);

/* ───── 純粹的部分（node 測試也用）───── */
const PERIODS=['早自習','第1節','第2節','第3節','第4節','第5節','第6節','第7節','第8節','第9節'];
function schema(){const S=G().S;
  return S.obj({
    class:S.str('班級編號，例如 701：頁首「班級：」後面，或左下角「編號：」後面'),
    homeroom:S.str('頁首「導師：」後面的姓名；沒有就空字串'),
    grid:S.arr(S.obj({day:S.int('星期幾：1～5'),period:S.str('節次',{enum:PERIODS}),subject:S.str('科目（格子第一行）'),
      teacher:S.str('老師（格子第二行）；沒有就空字串'),unsure:S.bool('看不清楚，或名單上找不到這位老師')},['day','period','subject','teacher','unsure']),'有字的格子，空白的不要列'),
    summary:S.arr(S.obj({subject:S.str('科目'),teacher:S.str('老師'),periods:S.int('每週節數')},['subject','teacher','periods']),'下方統計區的每一組'),
    confidence:{type:'NUMBER',description:'整頁抄得多確定，0～1'},
    notes:S.str('看不清楚的地方，簡短說明；沒有就空字串')
  },['class','homeroom','grid','summary','confidence']);
}
// 一頁一個請求。names：名單（老師姓名），subjects：科目用詞
function request(img,names,subjects){
  const N=[...(names||[])].slice(0,400),SJ=[...(subjects||C.TT_SUBJ)];
  return {images:[img],schema:schema(),temperature:0,
    system:'你是仔細的資料登打員，把國中課表的掃描圖逐格抄成 JSON。只抄圖上看得到的字，不要推測、不要補、不要編造。',
    prompt:'這是一所國中某一班的課表（每班一頁）。請抄出：\n'+
      '1. class：頁首「班級：」後面的班級編號（例如 701）；看不到就看左下角「編號：」。\n'+
      '2. homeroom：頁首「導師：」後面的姓名。\n'+
      '3. grid：課表格子。欄是星期一到星期五（day 1～5），列是早自習、第一節到第八節（period 寫成「早自習」「第1節」…「第8節」）。每一格第一行是科目、第二行是老師。空白的格子不要列。\n'+
      '4. summary：課表下方統計區的每一組「科目、老師、節數」。\n'+
      '5. confidence：整頁抄得多確定（0～1）；notes：看不清楚的地方。\n'+
      '老師姓名：圖上的字和下面名單裡的某一位很像時，寫名單上的寫法；名單上找不到就照圖上抄，並把那一格的 unsure 設成 true。看不清楚的格子也設 unsure: true。\n'+
      '科目用詞：'+SJ.join('、')+'；不在這裡的照圖上的字抄。\n'+
      '老師名單：'+(N.length?N.join('、'):'（沒有）')};
}
// 估計：一頁一次呼叫；同時兩頁、一頁大約 25 秒；學校的 AI 服務每人每分鐘最多 10 次。
// 費用用 flash 模型粗估：一頁大約輸入 3,000、輸出 3,000 token（US$0.3／US$2.5 每百萬），約 NT$0.3
function estimate(n,mode){n=Math.max(0,n|0);let sec=Math.ceil(n/2)*25;if(mode==='proxy')sec=Math.max(sec,n*6);
  const usd=n*(3000*0.3+3000*2.5)/1e6;return {req:n,min:Math.max(1,Math.round(sec/60)),ntd:Math.max(1,Math.ceil(usd*32))};}
// 排隊：同時 conc 個；可以再試的錯誤等一下再試（照伺服器說的秒數，不然 4、12、30 秒）；登入、金鑰、每日額度這類就整批停下
const RETRY=new Set(['busy','quota','network','timeout','format','empty']);
const FATAL=new Set(['login','key','perm','nokey','noproxy','model','region']);
async function runQueue(items,fn,o){o=o||{};const conc=Math.max(1,o.conc||2),max=o.retries==null?2:o.retries,res=new Array(items.length),up=o.onUpdate||(()=>{});
  const sleep=o.sleep||(ms=>new Promise(r=>setTimeout(r,ms))),gone=()=>!!(o.signal&&o.signal.aborted);let next=0,halt=null;
  async function worker(){while(next<items.length){const i=next++;if(halt||gone()){res[i]={ok:false,skip:true,e:halt};up(i,'skip',halt);continue;}
    for(let tries=0;;tries++){up(i,'run',null,tries);
      try{res[i]={ok:true,v:await fn(items[i],i)};up(i,'done',res[i].v);break;}
      catch(e){e=e||{};
        if(gone()||e.code==='cancel'){res[i]={ok:false,skip:true,e};up(i,'skip',e);break;}
        const daily=e.code==='quota'&&e.daily;
        if(FATAL.has(e.code)||daily){halt=e;res[i]={ok:false,e};up(i,'fail',e);break;}
        if(RETRY.has(e.code)&&tries<max){const w=Math.max(+e.retryAfter||0,[4,12,30][tries]||30);up(i,'wait',e,w);await sleep(w*1000);if(gone()){res[i]={ok:false,skip:true,e};up(i,'skip',e);break;}continue;}
        res[i]={ok:false,e};up(i,'fail',e);break;}}}}
  await Promise.all(Array.from({length:Math.min(conc,items.length)},worker));
  return {res,halt};}
// 一頁：送出、整理成 D.tt 的格式（還沒存）
async function readPage(img,names,o){o=o||{};
  const r=await G().generate(Object.assign({},request(img,names,o.subjects),{kind:'ttgrid',signal:o.signal,names:true,retries:0,timeout:o.timeout||180000,mode:o.mode}));
  return {e:C.ttGridCheck(o.D,r.json),logId:r.logId,model:r.model};}
const TTR={PERIODS,schema,request,estimate,runQueue,readPage};
root.TTR=TTR;
if(typeof module!=='undefined'&&module.exports)module.exports=TTR;
if(typeof document==='undefined'||typeof renderTT!=='function')return;

/* ───── 畫面 ───── */
const TTP={};          // 各班那一頁的圖（只留在這次開著的網頁，方便核對）
let JOB=null,PREV=false,CUR='',ASK=null;
if(typeof GM_KIND==='object')GM_KIND.ttgrid='讀全校課表';
const ocrRead=readTT,sumEdit=ttEdit;   // 原本的：離線辨識、只有統計的班級的核對
const onTT=()=>page==='set'&&sub==='tt';
const repaint=()=>{if(onTT())render();};
const aiState=()=>!(typeof gmReady==='function'&&gmReady())?'off':!GEMINI.namesOk()?'names':'on';
const clsSort=(a,b)=>(a[0]==='?')-(b[0]==='?')||a.localeCompare(b,undefined,{numeric:true});
const pend=(c,o)=>o.grid?(o.ok?0:(o.flags||[]).length):Object.values(o.subj||{}).flat().filter(x=>x[2]).length+(c[0]==='?'||o.guessCls?1:0);
const hints=()=>C.ttHintNames(D);
function recheckAll(){const K=hints();Object.keys(D.tt||{}).forEach(c=>C.ttGridRecheck(D,c,K));}
const pname=id=>{const p=D.periods.find(x=>String(x.id)===String(id));return p?p.name:String(id);};

(function css(){const s=document.createElement('style');s.textContent=`
.ttchips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}
.ttchips .chipb{font-variant-numeric:tabular-nums}
.ttpgs{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.ttpgs span{border-radius:999px;padding:2px 10px;font-size:13px;background:var(--sunk);color:var(--mute)}
.ttpgs span.run{background:var(--card);color:var(--ink);box-shadow:0 0 0 1px var(--line2)}
.ttpgs span.done{background:var(--ok-l);color:var(--ok)}.ttpgs span.fail{background:var(--bad-l);color:var(--bad)}
dialog.ttwide{width:min(1320px,97vw)}
.ttrev{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px;align-items:start}
.ttrev .ttimg{position:sticky;top:0;max-height:76vh;overflow:auto;border:1px solid var(--line);border-radius:10px;background:#fff}
.ttrev .ttimg img{width:100%;display:block}
.ttrev .ttnoimg{padding:24px;color:var(--mute);font-size:14px}
.ttgw{max-height:76vh;overflow:auto}
table.ttg{border-collapse:collapse;width:100%;table-layout:fixed}
table.ttg th{background:var(--sunk);color:var(--mute);font-weight:500;font-size:13px;padding:6px 4px}
table.ttg th:first-child{width:62px}
table.ttg td{border-bottom:1px solid var(--line);padding:3px;vertical-align:top}
table.ttg td input{display:block;width:100%;min-width:0;height:30px;padding:2px 6px;border-radius:6px;font-size:13px;margin:1px 0}
table.ttg td input+input{color:var(--ink2)}
table.ttg td.f{background:var(--warn-l)}table.ttg td.f input{border:1.5px solid var(--warn);background:var(--warn-l)}
table.ttg td.c{box-shadow:inset 0 0 0 2px var(--warn)}
.ttfl{margin:8px 0 0;padding-left:18px;font-size:14px;color:var(--warn)}
.ttprev img{max-width:100%;max-height:36vh;border:1px solid var(--line);border-radius:8px;display:block;margin:8px 0}
.ttprev pre{max-height:26vh;overflow:auto;white-space:pre-wrap;font-size:12px;background:var(--sunk);padding:10px;border-radius:8px}
@media(max-width:900px){.ttrev{grid-template-columns:1fr}.ttrev .ttimg{position:static;max-height:40vh}}`;document.head.appendChild(s);})();

function render(){const tt=D.tt||{},cls=Object.keys(tt).sort(clsSort),st=aiState(),busy=!!(JOB&&JOB.run)||!!TTJOB;
  const n=cls.reduce((a,c)=>a+pend(c,tt[c]),0);
  let h=`<div class="bar"><input type="file" id="ttIn" accept=".pdf,application/pdf${st==='on'?',image/png,image/jpeg':''}" multiple hidden>
    <button type="button" class="b pri" data-tt="pick"${busy?' disabled':''}>讀課表 PDF</button>
    <span class="tagv${st==='on'?'':' warn'}">${st==='on'?'Gemini 看圖':'離線辨識（準確度較低）'}</span>
    ${st==='on'?`<button type="button" class="b sm" data-tt="pickOcr"${busy?' disabled':''}>改用離線辨識</button>`:''}
    <span class="grow"></span>
    ${cls.length?`<button type="button" class="b" data-tt="applyCS">用課表更新任課老師</button><button type="button" class="b" data-tt="clear">清除課表</button>`:''}
    ${tip('每班一頁的全校課表 PDF（掃描檔也可以）。用 AI 時每一頁的圖會送到 Gemini，讀出每一格的科目和老師，再和下方的統計、老師名單核對；離線辨識只讀下方統計。重讀同一班會蓋掉舊的。')}</div>`;
  if(st==='names')h+=`<p class="hint">用 AI 讀課表要先在 AI 設定勾選「可以送出老師姓名」。 <button type="button" class="b sm" data-tt="aiSet">AI 設定</button></p>`;
  else if(st==='off')h+=`<p class="hint">接上 AI 可以讀出整張課表。 <button type="button" class="b sm" data-tt="aiSet">AI 設定</button></p>`;
  if(JOB)h+=jobHtml();
  if(TTJOB)h+=`<div class="chk"><b>${esc(TTJOB.msg)}</b>${TTJOB.total?`<span class="mid">${TTJOB.done} / ${TTJOB.total} 頁</span>`:''}</div>`;
  if(!cls.length&&!JOB&&!TTJOB)h+=emptyBox('還沒有全校課表。','');
  let no=1;
  if(cls.length){
    h+=secH(no++,'各班課表',` <small>${cls.length} 班${n?`・<span class="warn">${n} 處待核對</span>`:'・<span class="ok">✓ 都核對過</span>'}</small>`)+
      `<div class="card"><div class="ttchips">${cls.map(c=>{const k=pend(c,tt[c]),g=!!tt[c].grid;
        return `<button type="button" class="chipb ${k?'warn':'ok'}" data-tt="open" data-c="${esc(c)}" title="${esc((g?'':'只有統計（離線辨識）・')+(tt[c].src||''))}">${esc(c)}${k?' ・ '+k:' ✓'}${g?'':' <small>統計</small>'}</button>`;}).join('')}</div>
      <div class="bar">${n?`<button type="button" class="b pri" data-tt="next">下一個待核對</button><button type="button" class="b" data-tt="acceptAll">全部接受</button>`:''}</div></div>`;
    const L=C.ttNameList(D,hints()),K=[...hints()].sort();
    if(L.length)h+=secH(no++,'名字一次改',` <small>${L.length} 個名單上沒有的名字</small>`)+`<div class="card flush"><div class="scroll"><table class="ed"><tr><th>讀到的</th><th>出現</th><th>改成</th><th></th></tr>${L.map(x=>`<tr>
      <td><b>${esc(x.t)}</b></td><td class="dim">${x.n} 格・${x.cls.slice(0,6).map(esc).join('、')}${x.cls.length>6?'…':''}</td>
      <td><input type="text" class="w6" list="ttNames" value="${esc(x.sug)}" placeholder="正確的名字" data-from="${esc(x.t)}" aria-label="${esc(x.t)} 改成"></td>
      <td><button type="button" class="b sm" data-tt="ren" data-from="${esc(x.t)}">全部改</button> <button type="button" class="b sm" data-tt="keep" data-from="${esc(x.t)}" title="名字沒錯（新老師），以後不再標出來">名字沒錯</button></td></tr>`).join('')}</table></div></div>
      <datalist id="ttNames">${K.map(k=>`<option value="${esc(k)}">`).join('')}</datalist>`;
    h+=rosterHtml(no++,tt,cls);}
  $('page').innerHTML=h;}
function jobHtml(){const J=JOB,P=J.pages,done=P.filter(p=>p.st==='done').length,fail=P.filter(p=>p.st==='fail').length;
  const lab=p=>p.st==='done'?'✓ '+p.cls:p.st==='fail'?'✗ '+(p.n):p.st==='run'?'讀取中 '+p.n:p.st==='wait'?'等一下 '+p.n:p.st==='skip'?'沒讀 '+p.n:String(p.n);
  return `<div class="chk"><b>${J.run?(J.phase==='img'?'準備圖片…':J.phase==='ask'?'等你確認':'Gemini 讀課表中'):J.stopped?'已停止':'讀完了'}</b><span class="mid">${done} / ${P.length} 頁${fail?`・<span class="warn">${fail} 頁失敗</span>`:''}</span>
    ${J.run?`<button type="button" class="b sm" data-tt="stop">取消</button>`:`${fail||P.some(p=>p.st==='skip')?`<button type="button" class="b sm" data-tt="retry">重試沒讀到的</button>`:''}<button type="button" class="b sm" data-tt="jobOff">收起</button>`}
    ${J.err?`<span class="warn">${esc(J.err)}</span>`:''}
    <div class="ttpgs">${P.map(p=>`<span class="${esc(p.st||'')}" title="${esc(p.src+(p.msg?'：'+p.msg:''))}">${esc(lab(p))}</span>`).join('')}</div></div>`;}
// 和名冊對照、每位學生的任課老師（原本 renderTT 的下半部）
function rosterHtml(no,tt,cls){const stuCls=[...new Set(D.students.map(s=>String(s.cls)).filter(c=>/^\d{3,4}$/.test(c)))].sort(),noTT=stuCls.filter(c=>!tt[c]);
  const diff=[],tn=id=>{const t=D.teachers.find(x=>x.id===id);return t?t.name:'';};
  cls.forEach(c=>[['國語文','國文'],['英語文','英文'],['數學','數學'],['理化','理化']].forEach(([a,b])=>{const k=c+'|'+canonSubj(D,b),x=((tt[c].subj||{})[a]||[])[0];if(!x||x[2])return;const cur=D.classSubj[k]?tn(D.classSubj[k]):'';if(cur!==x[0])diff.push({c,s:b,cur,tt:x[0]});}));
  let h=secH(no,'和名冊對照')+`<ul class="plain">
    <li>${noTT.length?`<span class="warn">課表沒有的班級：${noTT.map(esc).join('、')}</span>`:`<span class="ok">✓ 名冊的 ${stuCls.length} 個班都有課表</span>`}</li>
    <li>${diff.length?`<span class="warn">任課老師和課表不同 ${diff.length} 格：</span>${diff.slice(0,30).map(d=>esc(d.c+d.s+'：'+(d.cur||'沒填')+' → '+d.tt)).join('；')}${diff.length>30?'…':''}`:'<span class="ok">✓ 任課老師和課表一致</span>'}</li></ul>`;
  const S=D.students.slice().sort((a,b)=>String(a.cls).localeCompare(String(b.cls))||String(a.seat||'').localeCompare(String(b.seat||''),undefined,{numeric:true}));
  const cell=(o,x)=>ttCell(Object.assign({subj:{}},o),x[1]==='國文'||x[1]==='英文'||x[1]==='數學'?x[0]:x[1]);
  h+=`<details class="more"><summary>每位學生的任課老師</summary><div class="scroll"><table class="ed"><tr><th>班級座號</th><th>姓名</th>${TT_COL.map(x=>`<th>${x[0]}</th>`).join('')}</tr>`+S.map(s=>{const o=tt[String(s.cls)];
    return `<tr><td>${esc(s.cls)}${s.seat?'-'+esc(String(s.seat).padStart(2,'0')):''}</td><td>${esc(s.name)}</td>${o?TT_COL.map(x=>`<td>${cell(o,x)}</td>`).join(''):`<td colspan="${TT_COL.length}" class="warn">課表沒有這一班</td>`}</tr>`;}).join('')+`</table></div></details>`;
  return h;}

/* ── 讀檔：PDF 每頁轉成圖（寬約 1600px 的 JPEG），圖片檔直接縮放 ── */
function toJpeg(src,w0,h0){const k=Math.min(1,1600/w0)||1,c=document.createElement('canvas');c.width=Math.round(w0*k);c.height=Math.round(h0*k);
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(src,0,0,c.width,c.height);const u=c.toDataURL('image/jpeg',0.85);c.width=c.height=0;return u;}
async function pagesOf(files){const out=[];
  for(const f of files){
    if(/^image\//.test(f.type)){const b=await createImageBitmap(f);out.push({img:toJpeg(b,b.width,b.height),src:f.name});b.close&&b.close();continue;}
    await ttPdf();const pdf=await pdfjsLib.getDocument(Object.assign({data:new Uint8Array(await f.arrayBuffer())},PDF_OPT)).promise;
    for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n),v1=pg.getViewport({scale:1}),vp=pg.getViewport({scale:Math.min(4,1600/v1.width)});
      const c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
      await pg.render({canvasContext:x,viewport:vp}).promise;out.push({img:c.toDataURL('image/jpeg',0.85),src:f.name+' 第 '+n+' 頁'});c.width=c.height=0;}
    if(pdf.destroy)pdf.destroy();}
  return out.map((p,i)=>Object.assign(p,{n:i+1,st:''}));}
async function readAI(files){if(JOB&&JOB.run)return;
  JOB={run:true,phase:'img',pages:[],ctl:null};repaint();
  try{JOB.pages=await pagesOf(files);}catch(e){JOB=null;repaint();toast('課表讀不出來：'+(e.message||e));return;}
  if(!JOB.pages.length){JOB=null;repaint();return;}
  JOB.phase='ask';repaint();
  if(!(await confirmRun(JOB.pages))){JOB=null;repaint();return;}
  await runJob(JOB.pages);}
// 開始前：估計要幾次、多久、多少錢；這次開網頁第一次送出時，連同要送出的內容（第一頁的圖＋文字）一起給老師看
function confirmRun(P){const E=TTR.estimate(P.length,GEMINI.getMode()),req=TTR.request(P[0].img,hints());
  const cost=GEMINI.getMode()==='proxy'?'費用約 NT$'+E.ntd+'（flash）':'用你自己金鑰的額度';
  openDlg(`<h3>讀課表</h3><p class="lead"><b>${P.length}</b> 頁 → ${E.req} 次 AI 呼叫・約 ${E.min} 分鐘・${esc(cost)}</p>
    ${PREV?'':`<div class="ttprev"><b>要送給 Gemini 的內容</b>（每頁一張圖＋這段文字；只有老師姓名，沒有學生資料）<img src="${esc(P[0].img)}" alt="第一頁"><pre>${esc('【系統說明】\n'+req.system+'\n\n'+req.prompt)}</pre></div>`}
    <div class="bar end"><button type="button" class="b" data-tt="runNo">取消</button><button type="button" class="b pri" data-tt="runGo">${PREV?'開始':'送出'}</button></div>`);
  return new Promise(done=>{ASK=v=>{ASK=null;done(v);};$('dlg').addEventListener('close',()=>{if(ASK)ASK(false);},{once:true});});}
async function runJob(P){const J=JOB;J.run=true;J.phase='run';J.err='';J.ctl=new AbortController();PREV=true;GEMINI.setSeen('ttgrid');
  const K=hints(),used=new Set();let snap=false;repaint();
  P.forEach(p=>{if(p.st!=='done')p.st='';});
  const todo=P.filter(p=>p.st!=='done');
  const r=await TTR.runQueue(todo,p=>TTR.readPage(p.img,K,{D,signal:J.ctl.signal}),{conc:2,signal:J.ctl.signal,onUpdate:(i,st,v,w)=>{const p=todo[i];
    if(st==='done'){let c=v.e.cls||'?'+p.n;if(used.has(c))c='?'+p.n;used.add(c);
      if(!snap){snapshot('讀入全校課表之前');snap=true;}
      C.ttGridStore(D,c,v.e,{src:p.src,known:K});TTP[c]=p.img;p.cls=c;p.msg='';if(v.logId)GEMINI.logUpdate(v.logId,{applied:c+' 班的課表'});save();}
    else if(st==='wait')p.msg=(v&&v.message||'')+'（'+w+' 秒後再試）';
    else if(st==='fail'||st==='skip')p.msg=v&&v.message||'';
    p.st=st==='wait'?'wait':st;repaint();}});
  J.run=false;J.phase='';J.stopped=J.ctl.signal.aborted;if(r.halt)J.err=gmMsg(r.halt);
  if(snap){recheckAll();changed();}
  const ok=P.filter(p=>p.st==='done').length,bad=P.length-ok,n=Object.keys(D.tt||{}).reduce((a,c)=>a+pend(c,D.tt[c]),0);
  repaint();toast('讀了 '+ok+' 頁'+(bad?'、'+bad+' 頁沒讀到':'')+(n?'；'+n+' 處待核對':''));}

/* ── 核對：左邊是那一頁的圖，右邊是可以改的格子 ── */
function rowsOf(o){const R=[],seen=new Set(),P=o.pids||[];
  D.periods.forEach(p=>{const id=String(p.id);R.push(id);seen.add(id);});   // 作息的每一節都列出來（早自習沒讀到也可以補）
  P.forEach(id=>{if(!seen.has(id)){R.push(id);seen.add(id);}});Object.keys(o.gridExtra||{}).forEach(k=>{if(!seen.has(k)){R.push(k);seen.add(k);}});return R;}
function open(c){const o=D.tt[c];if(!o)return;if(!o.grid){sumEdit(c);return;}CUR=c;
  const F=o.flags||[],at={},cnt=F.filter(f=>f.k==='count');F.forEach(f=>{if(f.d!=null)(at[f.d+'|'+f.p]=at[f.d+'|'+f.p]||[]).push(f.m);});
  const other=F.filter(f=>f.d==null),img=TTP[c]||TTIMG[c]||'';
  const td=(d,p)=>{const x=C.ttCellAt(D,c,d+'-'+p)||{s:'',t:''},m=at[d+'|'+p],hc=cnt.some(f=>f.s===x.s&&f.t===x.t&&x.s);
    return `<td class="${m?'f':''}${hc?' c':''}"${m?` title="${esc(m.join('；'))}"`:''}><input type="text" data-d="${d}" data-p="${esc(p)}" data-f="s" value="${esc(x.s)}" aria-label="星期${DAYS[d]} ${esc(pname(p))} 科目"><input type="text" data-d="${d}" data-p="${esc(p)}" data-f="t" list="ttNames2" value="${esc(x.t)}" aria-label="星期${DAYS[d]} ${esc(pname(p))} 老師"></td>`;};
  openDlg(`<h3>核對課表</h3>
    <div class="bar"><label class="inl">班級 <input type="text" id="ttC" class="w5" value="${esc(c[0]==='?'?'':c)}" placeholder="例：701"></label><label class="inl">導師 <input type="text" id="ttH" class="w5" list="ttNames2" value="${esc(o.head||'')}"></label><span class="dim">${esc(o.src||'')}</span></div>
    <div class="ttrev"><div class="ttimg">${img?`<img src="${esc(img)}" alt="${esc(c)} 的課表">`:`<div class="ttnoimg">重新整理後不保留圖片；要對照請重讀這一頁。</div>`}</div>
    <div class="ttgw"><table class="ttg"><tr><th></th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr>${rowsOf(o).map(p=>`<tr><th>${esc(pname(p))}</th>${[0,1,2,3,4].map(d=>td(d,p)).join('')}</tr>`).join('')}</table>
    ${other.length?`<ul class="ttfl">${other.map(f=>`<li>${esc(f.m)}</li>`).join('')}</ul>`:''}${o.notes?`<p class="hint">AI：${esc(o.notes)}</p>`:''}</div></div>
    <datalist id="ttNames2">${[...hints()].sort().map(k=>`<option value="${esc(k)}">`).join('')}</datalist>
    <div class="bar end"><button type="button" class="b" data-tt="close">取消</button><button type="button" class="b" data-tt="save">儲存</button><button type="button" class="b pri" data-tt="accept">接受，下一個</button></div>`);
  const dl=$('dlg');dl.classList.add('ttwide');dl.addEventListener('close',()=>dl.classList.remove('ttwide'),{once:true});}
function saveCur(accept){const c=CUR,o=D.tt[c];if(!o||!$('ttC'))return false;const nc=$('ttC').value.trim()||c,head=$('ttH').value.trim();
  if(nc!==c&&D.tt[nc]&&!confirm(nc+' 已經有課表了（'+(D.tt[nc].src||'之前讀的')+'）。\n要用這一頁蓋掉嗎？'))return false;
  snapshot('核對課表之前');const cell={};
  $('dlgBody').querySelectorAll('table.ttg input').forEach(i=>{const k=i.dataset.d+'|'+i.dataset.p;(cell[k]=cell[k]||{s:'',t:''})[i.dataset.f]=i.value.trim();});
  const edited=new Set();
  Object.keys(cell).forEach(k=>{const [d,p]=k.split('|'),v=cell[k],nv=v.s||v.t?{s:C.ttSubjNorm(v.s),t:v.t.replace(/\s+/g,'')}:null,old=C.ttCellAt(D,c,d+'-'+p);
    if((old?old.s+'|'+old.t:'')===(nv?nv.s+'|'+nv.t:''))return;edited.add(k);const i=(o.pids||[]).indexOf(p);
    if(i>=0)o.grid[+d][i]=nv;else{o.gridExtra=o.gridExtra||{};const r=o.gridExtra[p]=o.gridExtra[p]||[null,null,null,null,null];r[+d]=nv;if(!r.some(Boolean))delete o.gridExtra[p];}});
  o.unsure=(o.unsure||[]).filter(k=>!edited.has(k));o.dups=(o.dups||[]).filter(k=>!edited.has(k));
  if(head!==(o.head||'')){D.classHead=D.classHead||{};if(/^\d{3,4}$/.test(nc)&&(!D.classHead[nc]||D.classHead[nc]===o.head))D.classHead[nc]=head;o.head=head;}
  if(nc!==c){delete D.tt[c];D.tt[nc]=o;if(TTP[c]){TTP[nc]=TTP[c];delete TTP[c];}CUR=nc;}
  if(o.head&&/^\d{3,4}$/.test(nc)){D.classHead=D.classHead||{};if(!D.classHead[nc])D.classHead[nc]=o.head;}
  if(accept)o.ok=1;else if(edited.size)delete o.ok;
  recheckAll();changed();return true;}
function nextPending(after){const cls=Object.keys(D.tt||{}).sort(clsSort).filter(c=>pend(c,D.tt[c]));if(!cls.length)return '';
  return cls.find(c=>clsSort(c,after||'')>0)||cls[0];}
function acceptAll(){const tt=D.tt||{},cls=Object.keys(tt).filter(c=>pend(c,tt[c]));if(!cls.length)return;
  if(!confirm('把 '+cls.length+' 班待核對的地方都當作正確？'))return;snapshot('全部接受課表之前');
  cls.forEach(c=>{const o=tt[c];if(o.grid)o.ok=1;else Object.values(o.subj||{}).forEach(a=>a.forEach(x=>{x[2]=0;}));});
  recheckAll();changed();render();toast('已接受 '+cls.length+' 班');}

/* ── 事件 ── */
let MODE='ai';
function pick(m){MODE=m;const i=$('ttIn');if(!i)return;i.accept=m==='ai'?'.pdf,application/pdf,image/png,image/jpeg':'.pdf,application/pdf';i.click();}
$('page').addEventListener('change',e=>{const i=e.target;if(i.id!=='ttIn'||!onTT())return;const fs=[...i.files];i.value='';if(!fs.length)return;
  if(MODE==='ai'&&aiState()==='on')readAI(fs);else ocrRead({files:fs.filter(f=>/pdf$/i.test(f.type)||/\.pdf$/i.test(f.name)),value:''});});
$('page').addEventListener('click',e=>{const b=e.target.closest('[data-tt]');if(!b||!onTT())return;const a=b.dataset.tt;
  if(a==='pick')pick(aiState()==='on'?'ai':'ocr');else if(a==='pickOcr')pick('ocr');
  else if(a==='aiSet')gmSettings();
  else if(a==='open')open(b.dataset.c);
  else if(a==='next'){const c=nextPending('');if(c)open(c);}
  else if(a==='acceptAll')acceptAll();
  else if(a==='applyCS')ttApplyCS();
  else if(a==='clear'){if(!confirm('清除全校課表？'))return;snapshot('清除全校課表之前');D.tt={};Object.keys(TTP).forEach(k=>delete TTP[k]);JOB=null;changed();render();}
  else if(a==='stop'){if(JOB&&JOB.ctl)JOB.ctl.abort();}
  else if(a==='retry'){if(JOB&&!JOB.run)runJob(JOB.pages);}
  else if(a==='jobOff'){JOB=null;render();}
  else if(a==='ren'||a==='keep'){const from=b.dataset.from,inp=[...b.closest('tr').querySelectorAll('input')].find(x=>x.dataset.from===from);
    if(a==='keep'){snapshot('課表名字之前');D.ttOk=[...new Set((D.ttOk||[]).concat([from]))];recheckAll();changed();render();toast('「'+from+'」以後不再標出來');return;}
    const to=(inp&&inp.value||'').trim();if(!to){if(inp)inp.focus();toast('先填正確的名字');return;}
    snapshot('課表名字之前');const n=C.ttRename(D,from,to);recheckAll();changed();render();toast('「'+from+'」→「'+to+'」改了 '+n+' 格');}});
document.getElementById('dlgBody').addEventListener('click',e=>{const b=e.target.closest('[data-tt]');if(!b)return;const a=b.dataset.tt;
  if(a==='runGo'||a==='runNo'){const f=ASK;closeDlg();if(f)f(a==='runGo');}
  else if(a==='close')closeDlg();
  else if(a==='save'){if(saveCur(false)){closeDlg();render();toast('已儲存 '+CUR);}}
  else if(a==='accept'){const was=CUR;if(!saveCur(true))return;render();const nx=nextPending(was);if(nx&&nx!==CUR)open(nx);else{closeDlg();toast('都核對過了');}}});

// 換掉 app.js 的同名函式（app.js 的 render 每次都照名字找，所以換了就生效）
renderTT=render;
readTT=inp=>{const fs=[...inp.files];inp.value='';if(!fs.length)return;if(aiState()==='on')readAI(fs);else ocrRead({files:fs,value:''});};
ttEdit=open;
root.TTUI={render,open,readAI,runJob,TTP,get job(){return JOB;}};
})(typeof window!=='undefined'?window:globalThis);

/* IEP 會議線上時間調查｜Cloud Functions 的核心邏輯（不依賴 firebase 套件，方便用假的資料庫在本機測）
   iepGetSurvey：用連結裡的鑰匙拿公開內容（稱呼、班級座號、日期、節次、已知有課）與自己上次的回覆
   iepSubmit   ：檢查鑰匙、期限、格式之後寫入回覆
   資料：
     iepTok/{sha256(鑰匙)}          公開內容＋r(調查id)、pk(出席者代號)、exp(到期)。用戶端完全讀不到，只能經過 Function
     iepResp/{調查id}/r/{sha256}     回覆：pk, who, free, note, at, n。只有成員（個管、管理者）讀得到，只有 Function 寫
     iepRate/{tok_…|ip_…}            次數限制，用戶端讀寫都不行（設 TTL 讓它自己清掉） */
'use strict';
const crypto=require('crypto');

const TOKEN_RE=/^[A-Za-z0-9]{24,64}$/;
const ROUND_RE=/^[A-Za-z0-9_-]{1,60}$/;
const SLOT_RE=/^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_:\-]{1,20}$/;
// 同一個鑰匙 10 分鐘 30 次、同一個 IP 10 分鐘 120 次（學校常共用一個對外 IP，所以放寬）
const LIMIT={tok:{n:30,ms:10*60e3},ip:{n:120,ms:10*60e3}};
const PUBLIC=['v','who','once','name','title','round','kind','d1','d2','due','host','keys','ps','busy','stu','keep'];
const MAX_KEYS=400,MAX_NOTE=300;

const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const toMs=t=>t==null?0:typeof t.toMillis==='function'?t.toMillis():+t||0;
const cleanNote=s=>String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0,MAX_NOTE);

/* deps：db（Firestore 介面：doc(path)、runTransaction(fn)）、now()、stamp(ms)→時間戳記、fail(code,msg)→丟出錯誤 */
function makeIep(deps){
  const db=deps.db,now=deps.now||(()=>Date.now()),stamp=deps.stamp||(ms=>ms);
  const fail=deps.fail||((code,msg)=>{const e=new Error(msg);e.code=code;throw e;});
  const ipKey=ip=>'ip_'+sha('ip:'+String(ip||'unknown')).slice(0,40);

  // 次數限制：在交易裡讀、算、寫；超過就記下來，等交易結束再丟錯（不然計數不會存進去）
  function rate(tx,snap,ref,lim,t){const d=snap.exists?snap.data():null;
    const w=d&&t-toMs(d.w)<lim.ms?toMs(d.w):t,c=(d&&w===toMs(d.w)?(+d.c||0):0)+1;
    tx.set(ref,{w:stamp(w),c,exp:stamp(w+lim.ms*2)});return c>lim.n;}

  async function guarded(k,ip,body){
    if(typeof k!=='string'||!TOKEN_RE.test(k))fail('invalid-argument','連結不完整');
    const h=sha(k),t=now(),rT=db.doc('iepRate/tok_'+h.slice(0,40)),rI=db.doc('iepRate/'+ipKey(ip)),tok=db.doc('iepTok/'+h);
    const out=await db.runTransaction(async tx=>{
      const [a,b,s]=[await tx.get(rT),await tx.get(rI),await tx.get(tok)];
      const r=s.exists?s.data():null;const respRef=r&&ROUND_RE.test(String(r.r||''))?db.doc('iepResp/'+r.r+'/r/'+h):null;
      const resp=respRef?await tx.get(respRef):null;      // 交易裡所有讀取都要在寫入之前
      const over=rate(tx,a,rT,LIMIT.tok,t)|rate(tx,b,rI,LIMIT.ip,t);
      if(over)return {err:['resource-exhausted','太多次了，請過幾分鐘再試']};
      if(!r||!respRef||toMs(r.exp)<=t)return {err:['not-found','這個連結已經過期或已關閉，如果還需要回覆，請聯絡個管老師']};
      return body(tx,r,resp&&resp.exists?resp.data():null,respRef,t);});
    if(out&&out.err)fail(out.err[0],out.err[1]);
    return out;}

  async function getSurvey(data,ctx){const k=data&&data.k;
    return guarded(k,ctx&&ctx.ip,(tx,r,resp)=>{const o={};PUBLIC.forEach(f=>{if(r[f]!==undefined)o[f]=r[f];});o.exp=toMs(r.exp);
      o.resp=resp?{free:Array.isArray(resp.free)?resp.free:[],note:String(resp.note||''),at:toMs(resp.at),n:+resp.n||0}:null;return o;});}

  async function submit(data,ctx){data=data||{};const k=data.k,free=data.free,note=cleanNote(data.note);
    if(!Array.isArray(free)||free.length>MAX_KEYS||!free.every(x=>typeof x==='string'&&SLOT_RE.test(x)))fail('invalid-argument','回覆的格式不對');
    if(data.note!=null&&typeof data.note!=='string')fail('invalid-argument','備註的格式不對');
    return guarded(k,ctx&&ctx.ip,(tx,r,resp,respRef,t)=>{
      const n=resp?+resp.n||0:0;
      if(r.once===1&&n>0)return {err:['failed-precondition','這個連結只能送出一次，已經送出了；如果要改，請聯絡個管老師']};
      const keys=new Set(Array.isArray(r.keys)?r.keys:[]),f=[...new Set(free)];
      if(!f.every(x=>keys.has(x)))return {err:['invalid-argument','有不在調查範圍的節次']};
      tx.set(respRef,{pk:String(r.pk||''),who:r.who==='p'?'p':'t',free:f,note,at:stamp(t),n:n+1});
      return {ok:true,at:t,n:n+1};});}

  return {getSurvey,submit};
}

module.exports={makeIep,sha,toMs,cleanNote,TOKEN_RE,SLOT_RE,LIMIT,PUBLIC};

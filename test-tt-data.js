/* 全校課表的測試資料（虛構）：三個班的課表、假的 Gemini 回覆（故意放幾個錯），瀏覽器裡還可以畫成掃描檔樣子的 PDF。
   node：require('./test-tt-data.js')；瀏覽器：<script src="test-tt-data.js"> 之後用 window.TTFIX */
(function(root){
'use strict';
const SUBJ_T={'國語文':['李惠婷','陳美玲'],'英語文':['郭嘉琳','房素琴'],'數學':['蔡依珊','王大明'],'生物':['林志豪'],'歷史':['嚴于涵'],'地理':['吳佩珍'],
  '公民與社會':['張家豪'],'健康教育':['李次萍'],'體育':['李次萍'],'音樂':['周雅雯'],'視覺藝術':['許文彬'],'表演藝術':['黃詩涵'],'家政':['鄭淑芬'],
  '童軍':['謝明哲'],'輔導':['洪麗玲'],'生活科技':['曾國峰'],'資訊科技':['曾國峰'],'本土語文':['邱秀英']};
const WEEK=[['國語文',5],['英語文',5],['數學',4],['生物',3],['歷史',1],['地理',1],['公民與社會',1],['健康教育',1],['體育',2],['音樂',1],['視覺藝術',1],
  ['表演藝術',1],['家政',1],['童軍',1],['輔導',1],['生活科技',1],['資訊科技',1],['本土語文',1],['彈性學習',2],['班會',1]];   // 35 節＝5 天 × 7 節
const CLASSES={'701':{head:'李惠婷',k:0},'702':{head:'郭嘉琳',k:1},'801':{head:'蔡依珊',k:0}};
const TEACHERS=[...new Set(Object.values(SUBJ_T).flat())];
const LAB=['早自習','第一節','第二節','第三節','第四節','第五節','第六節','第七節','第八節'];
const TIME=['07:40-08:10','08:20-09:05','09:15-10:00','10:10-10:55','11:05-11:50','13:10-13:55','14:05-14:50','15:10-15:55','16:05-16:50'];
function rnd(seed){let a=seed>>>0;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// 真正的課表：cells[星期 0～4][列 0～8]（列 0 早自習、1～8 第一～八節）＝{s,t} 或 null
function truth(cls){const c=CLASSES[cls],r=rnd(+cls*7+1),head=c.head;
  const pick=s=>s==='彈性學習'||s==='班會'?head:(SUBJ_T[s][s==='國語文'&&cls==='702'?0:c.k]||SUBJ_T[s][0]);
  const bag=[];WEEK.forEach(([s,n])=>{for(let i=0;i<n;i++)bag.push({s,t:pick(s)});});
  for(let i=bag.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
  const cells=[0,1,2,3,4].map(()=>Array(9).fill(null));let k=0;
  for(let d=0;d<5;d++)for(let p=1;p<=7;p++)cells[d][p]=bag[k++];
  [0,2,3].forEach((d,i)=>{cells[d][8]={s:'課業指導',t:i===1?pick('數學'):pick('國語文')};});   // 第八節：週一、三、四
  cells[2][0]={s:'閱讀',t:head};                                                             // 週三早自習
  const sum={};cells.forEach(row=>row.forEach(x=>{if(!x)return;const k2=x.s+'|'+x.t;sum[k2]=(sum[k2]||0)+1;}));
  return {cls,head,cells,summary:Object.keys(sum).map(k2=>{const [s,t]=k2.split('|');return {subject:s,teacher:t,periods:sum[k2]};})};}
const PER=['早自習','第1節','第2節','第3節','第4節','第5節','第6節','第7節','第8節'];
// 假的 Gemini 回覆。inject：701、702 各有一格把「李惠婷」看成「李惠亭」；702 有一格數學看成生物；801 有一格說沒把握
function answer(cls,inject){const T=truth(cls),grid=[];
  T.cells.forEach((row,d)=>row.forEach((x,p)=>{if(x)grid.push({day:d+1,period:PER[p],subject:x.s,teacher:x.t,unsure:false});}));
  if(inject!==false){
    if(cls==='701'||cls==='702'){const g=grid.find(x=>x.teacher==='李惠婷'&&x.subject==='國語文');g.teacher='李惠亭';}
    if(cls==='702'){const g=grid.find(x=>x.subject==='數學');g.subject='生物';g.teacher='林志豪';}
    if(cls==='801'){grid.find(x=>x.subject==='音樂').unsure=true;}}
  return {class:cls,homeroom:T.head,grid,summary:T.summary,confidence:cls==='801'?0.82:0.95,notes:''};}
// Gemini generateContent 的回覆外殼
const reply=obj=>({candidates:[{content:{parts:[{text:JSON.stringify(obj)}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:2900,candidatesTokenCount:2600,totalTokenCount:5500},modelVersion:'gemini-3-flash'});

/* ── 瀏覽器：畫一頁「掃描」課表（1240×1754，A4 150dpi），版面照學校系統：頁首班級導師、格子、左下編號、下方統計 ── */
function drawPage(cv,cls){const T=truth(cls),W=1240,H=1754;cv.width=W;cv.height=H;const x=cv.getContext('2d'),F='"Microsoft JhengHei","Noto Sans TC",sans-serif';
  x.fillStyle='#fbfaf7';x.fillRect(0,0,W,H);x.save();x.translate(W/2,H/2);x.rotate(0.004);x.translate(-W/2,-H/2);x.fillStyle='#111';x.strokeStyle='#222';
  x.textAlign='center';x.font='bold 34px '+F;x.fillText('○○市立○○國民中學 115 學年度第 1 學期 班級課表',W/2,70);
  x.textAlign='left';x.font='28px '+F;x.fillText('班級：'+cls+'　　導師：'+T.head,70,125);
  const X0=60,X1=1180,Y0=150,HD=50,RH=124,LW=170,CW=(X1-X0-LW)/5;x.lineWidth=2;
  for(let r=0;r<=10;r++){const y=r===0?Y0:Y0+HD+(r-1)*RH;x.beginPath();x.moveTo(X0,y);x.lineTo(X1,y);x.stroke();}
  [X0,X0+LW,X0+LW+CW,X0+LW+2*CW,X0+LW+3*CW,X0+LW+4*CW,X1].forEach(v=>{x.beginPath();x.moveTo(v,Y0);x.lineTo(v,Y0+HD+9*RH);x.stroke();});
  x.textAlign='center';x.font='bold 26px '+F;['一','二','三','四','五'].forEach((d,i)=>x.fillText(d,X0+LW+CW*(i+0.5),Y0+35));
  for(let p=0;p<9;p++){const y=Y0+HD+p*RH;x.font='bold 24px '+F;x.fillText(LAB[p],X0+LW/2,y+52);x.font='18px '+F;x.fillText(TIME[p],X0+LW/2,y+82);
    for(let d=0;d<5;d++){const c=T.cells[d][p];if(!c)continue;const cx=X0+LW+CW*(d+0.5);x.font='bold 28px '+F;x.fillText(c.s,cx,y+52);x.font='26px '+F;x.fillText(c.t,cx,y+92);}}
  x.textAlign='left';x.font='28px '+F;x.fillText('編號：',100,1372);x.fillText(cls,236,1372);
  x.font='26px '+F;const S=T.summary,per=4;
  for(let i=0;i<S.length;i++){const r=Math.floor(i/per),c=i%per,y=1410+r*30;if(y>1566)break;x.fillText(S[i].subject+' '+S[i].teacher+' '+S[i].periods,70+c*282,y);}
  x.font='20px '+F;x.fillText('總時數：'+S.reduce((a,s)=>a+s.periods,0),70,1640);x.restore();
  const im=x.getImageData(0,0,W,H),a=im.data,r=rnd(+cls);for(let i=0;i<a.length;i+=4){const n=(r()-0.5)*26;a[i]+=n;a[i+1]+=n;a[i+2]+=n;}x.putImageData(im,0,0);return cv;}
// 幾張 JPEG（Uint8Array＋寬高）→ 每頁一張圖的 PDF（掃描檔就是這樣）
function makePdf(imgs){const enc=new TextEncoder(),parts=[],off=[];let len=0;const put=b=>{if(typeof b==='string')b=enc.encode(b);parts.push(b);len+=b.length;};
  const obj=(n,body,stream)=>{off[n]=len;put(n+' 0 obj\n'+body+'\n');if(stream){put('stream\n');put(stream);put('\nendstream\n');}put('endobj\n');};
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');const N=imgs.length,kids=imgs.map((m,i)=>(3+i*3)+' 0 R').join(' ');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids ['+kids+'] /Count '+N+' >>');
  imgs.forEach((m,i)=>{const p=3+i*3,cs='q 595 0 0 842 0 0 cm /Im0 Do Q';
    obj(p,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 '+(p+2)+' 0 R >> >> /Contents '+(p+1)+' 0 R >>');
    obj(p+1,'<< /Length '+cs.length+' >>',enc.encode(cs));
    obj(p+2,'<< /Type /XObject /Subtype /Image /Width '+m.w+' /Height '+m.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+m.data.length+' >>',m.data);});
  const total=3+N*3,x0=len;let xr='xref\n0 '+total+'\n0000000000 65535 f \n';for(let i=1;i<total;i++)xr+=String(off[i]).padStart(10,'0')+' 00000 n \n';
  put(xr+'trailer\n<< /Size '+total+' /Root 1 0 R >>\nstartxref\n'+x0+'\n%%EOF\n');
  const out=new Uint8Array(len);let k=0;parts.forEach(b=>{out.set(b,k);k+=b.length;});return out;}
async function pdfFile(list){list=list||Object.keys(CLASSES);const imgs=[];
  for(const c of list){const cv=drawPage(document.createElement('canvas'),c),b=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.85));imgs.push({w:cv.width,h:cv.height,data:new Uint8Array(await b.arrayBuffer())});}
  return new File([makePdf(imgs)],'synthetic-timetable.pdf',{type:'application/pdf'});}

const TTFIX={SUBJ_T,TEACHERS,CLASSES,truth,answer,reply,drawPage,makePdf,pdfFile};
root.TTFIX=TTFIX;
if(typeof module!=='undefined'&&module.exports)module.exports=TTFIX;
})(typeof window!=='undefined'?window:globalThis);

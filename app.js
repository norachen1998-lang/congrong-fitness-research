/* 从容：设计审阅稿的网页化、可点击研究流程原型。所有记录只保存在本机浏览器。 */
const STORE = 'congrong-web-prototype-v1';
const LIKERT = ['非常不同意', '不同意', '说不清', '同意', '非常同意'];
const S1 = [
  '我能在触摸屏上找到需要的功能。','我能用屏幕上的键盘打字。','我能把手机或平板的声音调大、调小。','我能把手机或平板连上无线网络，也就是 Wi-Fi。','我能把手机或平板上的字调大、调小。','我能把手机或平板的屏幕调亮、调暗。',
  '使用这项功能，能帮助我练得更好。','使用这项功能，能帮助我达到锻炼的目的。','总的来说，这项功能对我的锻炼有用。','学会使用这项功能，对我来说很容易。','我很容易让这项功能完成我想做的操作。','使用这项功能时，我容易明白该怎样操作。','总的来说，这项功能用起来很容易。',
  '旁边的人能看到或听到我的运动结果。','旁边的人能知道这些运动结果是我的。','我担心别人从运动结果中，发现我练得不好的地方。','我担心别人根据运动结果，挑我的毛病。','我担心这些运动结果，会给别人留下不好的印象。','从这些结果中找出重要的内容，对我来说很费劲。','器材这样显示或播报结果，让我不容易弄明白。','把这些结果联系起来，弄明白自己练得怎么样，对我来说很难。','以后有机会，我打算继续使用这项功能。','以后有机会，我认为自己还会继续使用这项功能。'
];
const S2 = [
  '完成刚才的屏幕设置，需要我花很多心力。','刚才的设置步骤，让我不容易弄明白。','我需要记住很多操作内容，才能完成设置。','我担心别人从刚才的运动结果中，发现我练得不好的地方。','我担心别人根据刚才的运动结果，挑我的毛病。','我担心刚才的运动结果，会给别人留下不好的印象。','以后有机会，我打算继续使用刚才这种智慧反馈。','以后有机会，我认为自己还会继续使用刚才这种智慧反馈。','刚才反馈时，旁边的人能看到或听到我的运动结果。','旁边的人能知道刚才这些运动结果是我的。','刚才的屏幕操作步骤比较复杂。','刚才我觉得有人在关注我的表现。'
];
const REASONS = ['能了解锻炼情况','操作容易学会','屏幕清楚好懂','担心别人看到结果','担心别人评价','步骤多、记不住','有人帮助更愿意用','没有明显影响'];
const CONDITIONS = {
  A:{name:'简单设置 · 私密反馈',short:'简单 × 私密',simple:true,public:false},
  B:{name:'复杂设置 · 私密反馈',short:'复杂 × 私密',simple:false,public:false},
  C:{name:'简单设置 · 公开反馈',short:'简单 × 公开',simple:true,public:true},
  D:{name:'复杂设置 · 公开反馈',short:'复杂 × 公开',simple:false,public:true}
};
const REFS = [60,56,52,48,44,40,36,32,28,24];
const ORDERS = ['ABCD','BDAC','DCBA','CADB'];
const OBSERVER = [[false,true,true,false],[true,false,false,true],[false,true,false,true],[true,false,true,false]];
const app = document.querySelector('#app');
const initial = {seq:0,people:{},currentId:null,view:'welcome',q:0,error:'',timerEnd:null,timerKind:null,resultPlayed:false,mode:'participant'};
let state;
try { state = {...initial,...JSON.parse(localStorage.getItem(STORE) || '{}')}; } catch { state = {...initial}; }
if (!state.people || typeof state.people !== 'object') state.people = {};
if (!state.people[state.currentId]) state.currentId = null;
if (state.view === 'consent1') state.view = 's1q';
if (state.view === 'consent2') state.view = 'baseline-choice';
if (!state.currentId && ['s1q','baseline-choice'].includes(state.view)) state.view = 'home';
let ticking = null;

/* —— 数据回收：本机暂存 + 实时上传到研究服务器 —— */
/* 数据接口基址：优先用同源（如 EdgeOne 已绑定 KV）；
   同源不可用时自动回退到备用研究服务器，保证随时能收数。 */
const FALLBACK_API = 'https://a4b02c069c2929baf.sg2.agentos-app.run';
let apiBase = '', apiProbed = false;
async function ensureApi(){
  if(apiProbed) return apiBase;
  apiProbed = true;
  try{
    const r = await fetch('./api/status',{cache:'no-store'});
    const d = await r.json();
    if(r.ok && d && d.ok === true) return (apiBase = '');
  }catch{}
  return (apiBase = FALLBACK_API);
}
function apiRoot(){return apiBase || '.';}

const OUTBOX = 'congrong-outbox-v1';
const TOKENKEY = 'congrong-token';
let syncTimer = null, onlineData = null, onlineBusy = false, onlineError = '';
const sync = {pending:0,lastAt:null,error:'',serverCount:null,failed:false};
function readOutbox(){try{const a=JSON.parse(localStorage.getItem(OUTBOX)||'[]');return Array.isArray(a)?a:[];}catch{return [];}}
function writeOutbox(a){try{localStorage.setItem(OUTBOX,JSON.stringify(a));}catch{}sync.pending=a.length;updateSyncBadge();}
function queueEvent(ev){
  const a=readOutbox();a.push({...ev,clientAt:new Date().toISOString()});writeOutbox(a);
  clearTimeout(syncTimer);syncTimer=setTimeout(flushOutbox,150);
}
/* 进度上传节流：内容没实质变化时不要反复回传，避免产生海量重复记录 */
let lastProgressSig='', lastProgressAt=0;
function progressSig(p){
  const parts=(p.s2&&p.s2.parts)||[];
  const s1=p.s1||{};
  return JSON.stringify([p.id,state.view,s1.status,s1.answers,s1.reasons,s1.background,s1.usage,
    parts.map(x=>[x.status,x.condition,x.observerActual,x.meters,x.seconds,x.rank,x.answers])]);
}
function scheduleSync(){
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{
    const p=person();if(!p)return;
    const sig=progressSig(p), now=Date.now();
    if(sig===lastProgressSig && now-lastProgressAt<20000)return;
    lastProgressSig=sig;lastProgressAt=now;
    queueEvent({type:'progress',id:p.id,person:JSON.parse(JSON.stringify(p)),view:state.view});
  },1200);
}
async function flushOutbox(){
  const a=readOutbox();sync.pending=a.length;
  if(!a.length){updateSyncBadge();return Promise.resolve();}
  await ensureApi();
  const batch=a.slice(0,60);
  return fetch(`${apiRoot()}/api/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:batch})})
    .then(r=>r.json().then(d=>({ok:r.ok,d})))
    .then(({ok,d})=>{
      if(!ok)throw new Error(d?.error||'服务器拒绝了提交');
      writeOutbox(a.slice(batch.length));
      sync.lastAt=new Date().toISOString();sync.error='';sync.failed=false;sync.serverCount=d.count??sync.serverCount;
      updateSyncBadge();
      if(state.view==='online')loadOnline();
      if(readOutbox().length)return flushOutbox();
    })
    .catch(err=>{sync.error='未连上服务器，已在本机排队';sync.failed=true;updateSyncBadge();});
}
function syncBadgeText(){
  if(sync.pending)return `待上传 ${sync.pending} 条`;
  if(sync.lastAt){const t=new Date(sync.lastAt);return `已回收 · ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;}
  return '本机暂存 · 待联网上传';
}
function updateSyncBadge(){const el=document.getElementById('sync-badge');if(el)el.textContent=syncBadgeText();}
async function loadOnline(){
  const token=localStorage.getItem(TOKENKEY)||'';
  if(!token){onlineError='请填写研究者口令后再读取。';onlineData=null;render();return;}
  onlineBusy=true;onlineError='';render();
  await ensureApi();
  fetch(`${apiRoot()}/api/records?token=${encodeURIComponent(token)}`)
    .then(r=>r.json().then(d=>({ok:r.ok,d})))
    .then(({ok,d})=>{if(!ok)throw new Error(d?.error||'读取失败');onlineData=d;onlineBusy=false;render();})
    .catch(e=>{onlineBusy=false;onlineError='读取失败：'+e.message;render();});
}
window.addEventListener('online',flushOutbox);

function esc(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state));scheduleSync();return true;}catch{state.view='save-error';return false;}}
function go(view){state.view=view;state.error='';save();render();window.scrollTo(0,0);}
function person(){return state.people[state.currentId];}
function part(){let p=person();return p?.s2?.parts[p.s2.partIndex];}
function act(name,label,extra='',klass='btn'){return `<button class="${klass}" data-action="${name}" ${extra}>${label}</button>`;}
function hero(title,lead='',tag='研究流程原型'){return `<span class="eyebrow">${esc(tag)}</span><h1 class="h1">${title}</h1>${lead?`<p class="lead">${lead}</p>`:''}`;}
function notice(){return `<div class="notice"><strong>演示版提示：</strong>本页不是经批准的正式知情同意书。作答会实时回传到研究服务器，并同时暂存于本机浏览器；请勿在未核对伦理批准文本、保存方案、数据存放位置及设备设置前用于正式收数。</div>`;}
function panel(content,head='参与者界面'){
  return `<div class="topline"><div class="brandline">从容 <span class="muted">· 社区公园智慧健身</span></div><div class="status">iPad 网页原型 · 本机暂存</div></div><div class="shell"><div class="shell-head"><span>${head}</span><span>${state.currentId?`匿名编号 ${esc(state.currentId)}`:'双界面设计'}</span></div><div class="shell-body">${content}</div><div class="shell-foot"><span>从容 / SMART FITNESS LAB</span><span id="sync-badge" class="sync-badge">本机暂存 · 待联网上传</span></div></div>`;
}
function admin(content,active='admin'){
  return `<div class="topline"><div class="brandline">从容 <span class="muted">· 研究者工作台</span></div><div class="status">本机数据 · 演示版</div></div><div class="admin"><aside class="sidebar"><div class="logo">从容</div><div class="sub">研究者界面</div><button class="sidebtn ${active==='admin'?'active':''}" data-action="admin">总览</button><button class="sidebtn ${active==='records'?'active':''}" data-action="records">参与者记录</button><button class="sidebtn ${active==='online'?'active':''}" data-action="online">在线回收数据</button><button class="sidebtn" data-action="new-person">新建匿名编号</button><button class="sidebtn" data-action="export-json">备份 JSON</button><button class="sidebtn" data-action="export-csv">导出 CSV</button><button class="sidebtn" data-action="home">参与者界面</button><div class="side-bottom">实验原型 · 不含云端同步或权限控制</div></aside><main class="admin-main">${content}</main></div>`;
}
function choices(value){return `<div class="likert" role="radiogroup" aria-label="同意程度">${LIKERT.map((x,i)=>`<button class="option ${value===i+1?'selected':''}" data-action="answer" data-value="${i+1}" role="radio" aria-checked="${value===i+1}">${x}<strong>${i+1}</strong></button>`).join('')}</div>`;}
function progress(n,total){return `<div class="q-top"><span class="pill">第 ${n} / ${total} 题</span><span class="muted">请选择一个答案</span></div><div class="progress"><span style="width:${n/total*100}%"></span></div>`;}
function questionView(items,answers,title,group=''){
  const q=state.q, value=answers[q];
  return panel(`<span class="eyebrow">${esc(title)}${group?` · ${esc(group)}`:''}</span><h2 class="h2">请根据刚才的体验作答</h2>${progress(q+1,items.length)}<div class="question">${esc(items[q])}</div>${choices(value)}<div class="error">${esc(state.error)}</div><div class="section-foot">${act('q-prev','上一题',q===0?'disabled':'')}${act('q-next',q===items.length-1?'完成本组':'下一题','','btn primary')}</div><div class="footer-nav"><span>选项不会预先选中</span>${act('withdraw','退出研究','','textlink')}</div>`);
}
function createPerson(destination='new-id'){
  state.seq+=1;const id=`P${String(state.seq).padStart(3,'0')}`;
  state.people[id]={id,createdAt:new Date().toISOString(),s1:{status:'not-started',answers:Array(23).fill(null),background:{},usage:{},reasons:[]},s2:{status:'not-started',baselineChoice:null,baseline:Array(6).fill(null),plan:null,partIndex:0,parts:[]}};
  state.currentId=id;state.mode=destination==='new-id'?'researcher':'participant';go(destination);
}
function setPlan(p){
  if(p.s2.plan)return;
  const k=(Number(p.id.slice(1))-1)%4, order=ORDERS[k], observers=OBSERVER[k];
  p.s2.plan=order.split('').map((code,i)=>({code,observerPlanned:observers[i]}));
  p.s2.parts=p.s2.plan.map(x=>({condition:x.code,observerPlanned:x.observerPlanned,observerActual:null,answers:Array(12).fill(null),preAnswers:Array(3).fill(null),meters:null,seconds:null,rank:null,status:'not-started'}));
  p.s2.status='in-progress';
}
function rankFor(m){return 1+REFS.filter(x=>x>m).length;}
function speakResult(){
  const x=part();if(!x)return;
  if(!('speechSynthesis' in window)){state.resultPlayed=true;render();return;}
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(`本次运动距离 ${x.meters} 米。你在十一人中排名第 ${x.rank} 名。`);
  utterance.lang='zh-CN';utterance.rate=.85;
  utterance.onend=()=>{state.resultPlayed=true;save();render();};
  utterance.onerror=()=>{state.resultPlayed=true;save();render();};
  speechSynthesis.speak(utterance);
}
function startTimer(seconds,kind){
  state.timerKind=kind;state.timerEnd=Date.now()+seconds*1000;save();tick();
  if(kind==='exercise' && 'speechSynthesis' in window){const u=new SpeechSynthesisUtterance('开始。请保持自己的节奏。');u.lang='zh-CN';speechSynthesis.speak(u);}
}
function remaining(){return Math.max(0,Math.ceil((state.timerEnd-Date.now())/1000));}
function tick(){
  clearInterval(ticking);
  if(!state.timerEnd)return;
  ticking=setInterval(()=>{
    const n=remaining();const el=document.querySelector('[data-timer]');if(el)el.textContent=String(n).padStart(2,'0');
    if(n===0){clearInterval(ticking);if(state.timerKind==='exercise'){let x=part();if(x&&x.seconds==null)x.seconds=60;go('distance');}else go('prep');}
  },250);
}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function csv(rows){return '\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');}
/* 题项元数据：[起始题号, 结束题号, 维度, 是否反向计分]。Study 1 与 Study 2 题号体系各自独立，不可横向比较。 */
const S1_DIMS=[[1,6,'日常数字操作',false],[7,9,'有用性',false],[10,13,'易用性',false],[14,15,'结果公开与可识别',false],[16,18,'担心被评价',false],[19,21,'理解结果的难易',true],[22,23,'继续使用意愿',false]];
const S2_DIMS=[[1,3,'设置认知负荷',true],[4,6,'担心被评价',false],[7,8,'继续使用意愿',false],[9,10,'结果公开与可识别',false],[11,11,'设置复杂度感知',true],[12,12,'被关注感',false]];
function dimOf(dims,n){const f=dims.find(([a,b])=>n>=a&&n<=b);return f?{dim:f[2],rev:f[3]}:{dim:'',rev:false};}
function wideHeader(){return ['匿名编号','研究','次序','条件代码','条件名称','设置复杂度','反馈方式','计划观察者','实际观察者','观察者是否一致','状态','运动距离(米)','运动秒数','排名','最后回收时间',...Array.from({length:23},(_,i)=>`S1-Q${i+1}`),...Array.from({length:12},(_,i)=>`S2-Q${i+1}`)];}
function itemsRows(){
  const rows=[['研究','题号','题项标签','作答时点','所属维度','是否反向计分','计分方式','题目原文']];
  S1.forEach((t,i)=>{const m=dimOf(S1_DIMS,i+1);rows.push(['Study 1',i+1,`S1-Q${i+1}`,'问卷中作答',m.dim,m.rev?'是':'否',m.rev?'反向题：分析时用 6 − 原始分':'正向题：1–5 直接计分',t]);});
  S2.forEach((t,i)=>{const m=dimOf(S2_DIMS,i+1);rows.push(['Study 2',i+1,`S2-Q${i+1}`,i<3?'设置完成后、运动前':'运动反馈完成后',m.dim,m.rev?'是':'否',m.rev?'反向题：分析时用 6 − 原始分':'正向题：1–5 直接计分',t]);});
  rows.push(['','','','','','','计分：1=非常不同意，2=不同意，3=说不清，4=同意，5=非常同意','']);
  rows.push(['','','','','','','说明：Study 1 与 Study 2 题号体系各自独立，S1-Q1 与 S2-Q1 不是同一道题，不能横向比较','']);
  return rows;
}
function buildWideRows(people,stampOf){
  const rows=[wideHeader()];
  Object.values(people).forEach(p=>{
    const s1=p.s1||{}, s2=p.s2||{}, parts=s2.parts||[];
    rows.push([p.id,'Study 1','—','','','','','','','—',statusText(s1.status||''),'','','',stampOf(p),
      ...Array.from({length:23},(_,i)=>s1.answers?.[i]??''),...Array(12).fill('')]);
    parts.forEach((x,i)=>{
      const c=CONDITIONS[x.condition]||{};
      rows.push([p.id,'Study 2',`Study 2-${i+1}`,x.condition,c.short||'',c.simple?'简单':'复杂',c.public?'公开':'私密',
        x.observerPlanned?'有':'无',x.observerActual==null?'未记录':(x.observerActual?'有':'无'),
        x.observerActual==null?'—':(x.observerActual===x.observerPlanned?'一致':'不一致'),
        statusText(x.status||''),x.meters??'',x.seconds??'',x.rank??'',stampOf(p),
        ...Array(23).fill(''),...Array.from({length:12},(_,j)=>x.answers?.[j]??'')]);
    });
  });
  return rows;
}
function exportCsv(){
  const day=new Date().toISOString().slice(0,10), now=new Date().toISOString();
  download(`congrong-records-${day}.csv`,csv(buildWideRows(state.people,()=>now)),'text/csv;charset=utf-8');
  setTimeout(()=>download(`congrong-items-${day}.csv`,csv(itemsRows()),'text/csv;charset=utf-8'),500);
}
function statusText(x){return ({'not-started':'未开始','in-progress':'进行中','complete':'已完成','withdrawn':'已退出'})[x]||x;}

function render(){
  let p=person(), x=part(), v=state.view, html='';
  if(v==='welcome') html=panel(`${hero('适合在 iPad 上操作的研究流程','参与者逐步完成问卷与运动反馈；研究者管理编号、记录和导出。','双界面网页原型')}<div class="grid2"><button class="choice-card" data-action="home"><h3>参与者入口 →</h3><p>大字、逐题作答、清楚的操作步骤。</p></button><button class="choice-card blue" data-action="admin"><h3>研究者入口 →</h3><p>建立编号、准备实验、查看进度和备份。</p></button></div><div class="actions"><a class="btn small" href="./assets.html">查看网页素材板 →</a></div>${notice()}`,'欢迎使用');
  else if(v==='home') html=panel(`${hero(p?`你好，${esc(p.id)}`:'欢迎使用从容','请选择研究流程。每一步均可在本机暂存。','参与者入口')}<div class="grid2"><button class="choice-card" data-action="start-s1"><h3>Study 1 · 独立问卷 →</h3><p>点击后直接进入第 1 题，共 23 道体验题。</p></button><button class="choice-card blue" data-action="start-s2"><h3>Study 2 · 四次运动体验 →</h3><p>四种反馈条件，每次设置、运动、反馈和问卷。</p></button></div><div class="actions">${act('admin','研究者入口','','btn small')}${p?act('resume','继续上次进度','','btn small'):''}</div>${notice()}`);
  else if(v==='admin'){
    const people=Object.values(state.people), s1=people.filter(a=>a.s1.status==='complete').length,s2=people.filter(a=>a.s2.status==='complete').length;
    html=admin(`<span class="eyebrow">研究者总览</span><h1 class="h1">今天的研究流程</h1><div class="mini-grid"><div class="mini">匿名编号<strong>${people.length}</strong></div><div class="mini">Study 1 完成<strong>${s1}</strong></div><div class="mini">Study 2 完成<strong>${s2}</strong></div></div><div class="actions">${act('new-person','＋ 建立匿名编号','','btn primary')}${act('records','查看参与者记录')}</div><h2 class="h2">实验条件</h2>${Object.entries(CONDITIONS).map(([c,d])=>`<div class="condition ${c}"><strong>${c}</strong> · ${d.name}</div>`).join('')}<p class="tiny">条件顺序与观察者安排在建立研究计划后固定保存；本原型使用示例平衡序列。</p>${notice()}`);
  }
  else if(v==='new-id') html=admin(`${hero(`已建立匿名编号 ${esc(p.id)}`,'请研究者确认编号，再将 iPad 交给参与者。','新建参与者')}<div class="summary">编号：<strong>${esc(p.id)}</strong><br>数据仅保存在当前浏览器。</div><div class="actions">${act('home','交给参与者','','btn primary')}${act('admin','返回研究者工作台')}</div>`);
  else if(v==='records'){
    const people=Object.values(state.people).reverse();
    html=admin(`<span class="eyebrow">研究者界面</span><h1 class="h1">参与者记录</h1><p class="copy muted">点击编号可继续该参与者的流程。请定期备份，清除浏览器数据会丢失本机记录。</p><div class="table-wrap"><table class="data-table"><thead><tr><th>编号</th><th>Study 1</th><th>Study 2</th><th>当前条件</th><th>操作</th></tr></thead><tbody>${people.map(a=>`<tr><td>${esc(a.id)}</td><td>${statusText(a.s1.status)}</td><td>${statusText(a.s2.status)}</td><td>${a.s2.parts[a.s2.partIndex]?.condition||'—'}</td><td><button class="textlink" data-action="select-person" data-id="${a.id}">打开</button></td></tr>`).join('')||'<tr><td colspan="5">还没有记录</td></tr>'}</tbody></table></div><div class="actions">${act('export-json','备份 JSON')}${act('export-csv','导出 CSV（宽表+题项表）')}${act('new-person','新建匿名编号','','btn primary')}</div>${notice()}`,'records');
  }
  else if(v==='online'){
    const token=localStorage.getItem(TOKENKEY)||'', queued=readOutbox().length;
    const records=onlineData?.records||[], agg={};
    records.forEach(r=>{if(!r.id||!r.person)return;const cur=agg[r.id];if(!cur||(r.receivedAt||'')>=(cur.receivedAt||''))agg[r.id]=r;});
    const rows=Object.values(agg).reverse();
    html=admin(`<span class="eyebrow">研究者界面</span><h1 class="h1">在线回收数据</h1><p class="copy muted">参与者每答一题就会向服务器回传一次进度；断网时先存在本机，联网后自动补传。</p><div class="mini-grid"><div class="mini">服务器累计事件<strong>${onlineData?onlineData.count:'—'}</strong></div><div class="mini">已回收参与者<strong>${rows.length}</strong></div><div class="mini">本机待上传<strong>${queued}</strong></div></div><div class="field" style="max-width:360px"><label>研究者口令</label><input id="token-input" type="password" autocomplete="current-password" placeholder="请输入口令" value="${esc(token)}"></div><p class="tiny" id="token-tip"></p><div class="actions">${act('save-token','保存口令并读取','','btn primary')}${act('online-refresh','重新读取')}${act('flush','立即上传本机队列')}${token?act('reset-server','清空服务器数据'):''}</div><div class="error">${esc(onlineError||sync.error)}</div>${onlineBusy?'<p class="copy muted">正在读取服务器…</p>':''}<div class="table-wrap"><table class="data-table"><thead><tr><th>编号</th><th>Study 1</th><th>Study 2</th><th>完成次数</th><th>最后回收时间</th></tr></thead><tbody>${rows.map(r=>{const pp=r.person,ss1=pp.s1||{},ss2=pp.s2||{},parts=ss2.parts||[];return `<tr><td>${esc(r.id)}</td><td>${statusText(ss1.status||'')}</td><td>${statusText(ss2.status||'')}</td><td>${parts.filter(z=>z.status==='complete').length} / ${parts.length}</td><td>${esc(String(r.receivedAt||'').replace('T',' ').slice(0,19))}</td></tr>`;}).join('')||'<tr><td colspan="5">服务器上还没有数据</td></tr>'}</tbody></table></div><div class="actions">${token?`<a class="btn" href="${apiRoot()}/api/export?format=wide&token=${encodeURIComponent(token)}">下载 CSV 宽表</a><a class="btn" href="${apiRoot()}/api/export?format=items&token=${encodeURIComponent(token)}">下载题项对照表</a><a class="btn" href="${apiRoot()}/api/export?format=xlsx&token=${encodeURIComponent(token)}">下载 Excel（三张表）</a><a class="btn" href="${apiRoot()}/api/export?format=json&token=${encodeURIComponent(token)}">下载原始 JSON</a>`:''}${act('records','查看本机记录')}</div><p class="tiny">服务端按事件保存每条记录（自托管版为数据文件；EdgeOne 版存在 KV 中）。请定期下载备份；口令只存在本机浏览器。</p><p class="tiny">当前数据回收接口：<strong>${esc(apiRoot()==="."?"同源（本站）":apiRoot())}</strong>${apiRoot()==="."?"":"（本站未绑定存储，已自动切换到备用研究服务器）"}</p>${notice()}`,'online');
  }
  else if(v==='consent1'||v==='consent2') html=panel(`${hero('参加前请先确认','这里是流程演示，没有放入正式的研究同意书。','研究说明')}<div class="summary">研究目的、负责单位、联系人、数据保留期限、退出和删除方式，均须以最终获批的伦理审查版本为准。</div>${notice()}<div class="actions">${act('home','返回首页')}${act('consent-next','我明白这是演示，继续','','btn primary')}</div>`);
  else if(v==='background') html=panel(`${hero('先了解一点基本情况','请按实际情况选择；演示版不要求姓名或电话号码。','Study 1 · 背景')}<div class="grid2"><div class="field"><label>年龄段</label><select data-field="age"><option value="">请选择</option>${['50–59 岁','60–69 岁','70–79 岁','80 岁及以上','不愿回答'].map(y=>`<option ${p.s1.background.age===y?'selected':''}>${y}</option>`).join('')}</select></div><div class="field"><label>您平时使用手机或平板的频率</label><select data-field="device"><option value="">请选择</option>${['几乎不用','偶尔使用','每周多次','每天使用'].map(y=>`<option ${p.s1.background.device===y?'selected':''}>${y}</option>`).join('')}</select></div></div><div class="error">${esc(state.error)}</div><div class="actions end">${act('background-next','继续','','btn primary')}</div>`);
  else if(v==='usage') html=panel(`${hero('您平时怎样锻炼？','这些问题用于了解使用背景。','Study 1 · 使用情况')}<div class="grid2"><div class="field"><label>您来社区公园运动的频率</label><select data-field="park"><option value="">请选择</option>${['很少','每月几次','每周几次','几乎每天'].map(y=>`<option ${p.s1.usage.park===y?'selected':''}>${y}</option>`).join('')}</select></div><div class="field"><label>您是否用过智慧健身设备</label><select data-field="smart"><option value="">请选择</option>${['用过','没有用过','不确定'].map(y=>`<option ${p.s1.usage.smart===y?'selected':''}>${y}</option>`).join('')}</select></div></div><p class="tiny">此处为交互原型；正式研究应逐字核对获批问卷。</p><div class="error">${esc(state.error)}</div><div class="actions end">${act('usage-next','开始问卷','','btn primary')}</div>`);
  else if(v==='s1q'){
    const group=state.q<6?'日常数字操作':state.q<9?'有没有帮助':state.q<13?'好不好操作':state.q<15?'结果公开与识别':state.q<18?'使用时的担心':state.q<21?'看懂结果的难易':'继续使用';
    html=questionView(S1,p.s1.answers,'Study 1 · 体验问卷',group);
  }
  else if(v==='s1reasons') html=panel(`${hero('哪些原因影响了您的选择？','可以选择多项，至少选一项。','Study 1 · 主要原因')}<div class="grid2">${REASONS.map((r,i)=>`<label class="check"><input type="checkbox" data-reason="${i}" ${p.s1.reasons.includes(r)?'checked':''}><span>${r}</span></label>`).join('')}</div><div class="error">${esc(state.error)}</div><div class="actions end">${act('s1-complete','提交 Study 1','','btn primary')}</div>`);
  else if(v==='s1done') html=panel(`${hero('Study 1 已完成','感谢您完成问卷。','完成')}<div class="summary">答案已保存于当前 iPad 浏览器。研究者可从工作台备份。</div><div class="actions">${act('start-s2','继续 Study 2','','btn primary')}${act('home','返回首页')}</div>`);
  else if(v==='baseline-choice') html=panel(`${hero('开始 Study 2','研究者请确认：这是否为刚才完成 Study 1 的同一位参与者？','Study 2 · 基线')}<div class="grid2"><button class="choice-card" data-action="baseline-reuse"><h3>是，同一位参与者</h3><p>使用已完成的前六道数字操作题答案。</p></button><button class="choice-card blue" data-action="baseline-new"><h3>否 / 未完成 Study 1</h3><p>先回答六道数字操作题。</p></button></div><div class="error">${esc(state.error)}</div>${notice()}`,'研究者确认');
  else if(v==='baseline-q') html=questionView(S1.slice(0,6),p.s2.baseline,'Study 2 · 数字操作基线');
  else if(v==='plan') html=admin(`${hero('四次体验已安排','顺序和观察者安排已固定，不会在继续时重新排列。','Study 2 · 研究计划')}<div class="grid2">${p.s2.plan.map((a,i)=>`<div class="condition ${a.code}"><strong>第 ${i+1} 次 · ${a.code}</strong><br>${CONDITIONS[a.code].name}<br><span class="tiny">计划观察者：${a.observerPlanned?'有':'无'}</span></div>`).join('')}</div><div class="actions">${act('prep','准备第 1 次体验','','btn primary')}${act('admin','返回工作台')}</div>${notice()}`);
  else if(v==='prep'){
    const c=CONDITIONS[x.condition];
    html=admin(`${hero(`第 ${p.s2.partIndex+1} 次 · ${c.name}`,'请研究者先完成现场检查，再将 iPad 交给参与者。','实验准备')}<div class="summary">反馈方式：${c.public?'公开（扬声器、可见屏幕）':'私密（耳机、遮挡屏幕）'}<br>计划观察者：${x.observerPlanned?'在场':'不在场'}<br>操作复杂度：${c.simple?'简单':'复杂'}</div><div class="notice">网页无法检测耳机、屏幕遮挡或现场人员是否就位。正式收数需研究者现场核对。</div><label class="check"><input type="checkbox" id="prep-check"><span>我已核对设备、音量、屏幕及观察者安排</span></label><div class="error">${esc(state.error)}</div><div class="actions">${act('prep-next','交给参与者，开始设置','','btn primary')}${act('records','暂时离开')}</div>`);
  }
  else if(v==='simple-setup') html=panel(`${hero('选择反馈方式','请按屏幕提示完成设置。','步骤 1 / 1')}<div class="summary">本次使用<strong>${x&&CONDITIONS[x.condition].public?'公开':'私密'}</strong>反馈。${x&&CONDITIONS[x.condition].public?'请确认扬声器可用、屏幕可见。':'请确认耳机可用、屏幕不对旁人开放。'}</div><div class="grid2"><button class="choice-card" data-action="setup-choose" data-value="correct"><h3>我已经准备好</h3><p>进入运动前的问题。</p></button><button class="choice-card blue" data-action="setup-choose" data-value="help"><h3>我需要帮助</h3><p>请研究者协助检查现场设置。</p></button></div><div class="error">${esc(state.error)}</div>`);
  else if(v.startsWith('complex-')){
    const steps=[['complex-menu','选择菜单','请找到“运动反馈设置”。'],['complex-project','选择项目','请选择“基础推手练习”。'],['complex-time','设置时间','请将练习时间设为 60 秒。'],['complex-check','核对设置','请检查项目、时间和反馈方式。']];
    let idx=steps.findIndex(s=>s[0]===v), st=steps[idx];
    const right=idx===0?'运动反馈设置':'基础推手练习', wrong=idx===0?'其他功能':'其他项目';
    const picked=x?.setup?.[v]||'';
    const pickBody=`<div class="grid2"><button class="choice-card ${picked==='correct'?'selected':''}" data-action="complex-choose" data-value="correct"><h3>${right}</h3><p>点一下这里，选中它。</p></button><button class="choice-card blue ${picked==='wrong'?'selected':''}" data-action="complex-choose" data-value="wrong"><h3>${wrong}</h3><p>点一下这里，选中它。</p></button></div><p class="tiny">${picked?`已选中：${picked==='correct'?right:wrong}。确认后点“下一步”。`:'请先在上面点选一项，再点“下一步”。'}</p>`;
    html=panel(`${hero(st[1],st[2],`复杂设置 · 步骤 ${idx+1} / 4`)}<div class="progress"><span style="width:${(idx+1)*25}%"></span></div>${idx===2?`<div class="field"><label>练习时间（秒）</label><input type="number" min="1" max="300" id="complex-time-input" inputmode="numeric" value="${esc(x?.setupTime??'')}"></div>`:idx===3?`<div class="summary">项目：基础推手练习<br>时间：${esc(x?.setupTime??60)} 秒<br>反馈：${CONDITIONS[x.condition].public?'公开':'私密'}</div>`:pickBody}<div class="error">${esc(state.error)}</div><div class="actions">${act('complex-prev','上一步',idx===0?'disabled':'')}${act('complex-next',idx===3?'确认设置':'下一步','','btn primary')}</div>`);
  }
  else if(v==='s2preq') html=questionView(S2.slice(0,3),x.preAnswers,`第 ${p.s2.partIndex+1} 次 · 设置体验`);
  else if(v==='ready') html=panel(`${hero('准备开始 60 秒练习','请按研究者提示进行基础推手练习。','运动前')}<div class="summary">练习时请按自己的节奏，身体不适时立即停止并告知研究者。</div><div class="actions">${act('timer-start','开始 60 秒计时','','btn primary')}${act('prep','返回研究者准备')}</div>`);
  else if(v==='timer') html=panel(`${hero('基础推手练习','按照自己的节奏进行。','60 秒计时')}<div class="timer"><span data-timer>${String(remaining()).padStart(2,'0')}</span> 秒</div><div class="summary">如有不适，请立即停止；研究者可随时结束计时。</div><div class="actions">${act('timer-stop','停止计时','','btn danger')}</div>`);
  else if(v==='distance') html=admin(`${hero('录入本次运动结果','请研究者填写实际距离，然后让参与者查看反馈。','研究者录入')}<div class="grid2"><div class="field"><label>运动距离（米）</label><input id="distance-input" type="number" min="0" max="9999" step="0.1" inputmode="decimal" value="${esc(x?.meters??'')}"></div><div class="field"><label>实际运动秒数</label><input id="seconds-input" type="number" min="0" max="60" step="1" inputmode="numeric" value="${esc(x?.seconds??'')}"></div></div><p class="tiny">排名参照十条固定演示数据，不是真实参与者数据。</p><div class="error">${esc(state.error)}</div><div class="actions">${act('distance-save','保存并显示反馈','','btn primary')}</div>`);
  else if(v==='result'){
    const rank=x.rank, cls=rank<=5?'gold':rank>=7?'blue':'';
    const ranked=[...REFS.map((meters,i)=>({name:`参考 ${i+1}`,meters})),{name:'我',meters:x.meters,you:true}].sort((a,b)=>b.meters-a.meters);
    html=panel(`${hero('本次运动反馈','完成啦！一起看看刚才的结果。','运动结果')}<div class="rank-layout"><div><div class="summary ${cls}">你的距离</div><div class="score">${esc(x.meters)} <small>米</small></div><div class="summary ${cls}">在 11 人中排名第 <strong>${rank}</strong> 名</div><p class="copy muted">表格中的其他 10 人为固定模拟数据。</p></div><div class="table-wrap"><table class="rank-table"><tbody>${ranked.map((r,i)=>`<tr class="${r.you?'you':''}"><td>${i+1}</td><td>${r.you?'我':r.name}</td><td>${r.meters} 米</td></tr>`).join('')}</tbody></table></div></div><div class="actions">${act('result-replay','重播反馈')}${act('result-next','继续',!state.resultPlayed?'disabled':'','btn primary')}</div><p class="tiny">浏览器语音只是原型演示；网页无法保证实际只从耳机或扬声器输出。</p>`);
  }
  else if(v==='observer') html=admin(`${hero('核对现场观察者','请依据实际情况记录，不能只沿用计划安排。','研究者核对')}<div class="summary">计划：${x.observerPlanned?'有观察者':'无观察者'}</div><div class="grid2"><button class="choice-card" data-action="observer-set" data-value="yes"><h3>实际有人在场</h3></button><button class="choice-card blue" data-action="observer-set" data-value="no"><h3>实际无人</h3></button></div>`);
  else if(v==='s2postq') html=questionView(S2.slice(3),x.answers.slice(3),`第 ${p.s2.partIndex+1} 次 · 反馈体验`);
  else if(v==='rest') html=panel(`${hero('休息一下','下一次体验开始前，请放松片刻。','两次体验之间')}<div class="rest-time"><span data-timer>${String(remaining()).padStart(2,'0')}</span> 秒</div><div class="summary">本次记录已暂存。休息结束后由研究者准备下一项。</div><div class="actions">${act('admin','研究者工作台')}</div>`);
  else if(v==='s2done') html=panel(`${hero('四次体验全部完成','感谢您参与。','Study 2 完成')}<div class="summary">已完成四种条件的体验与反馈。请将 iPad 交回研究者。</div><div class="actions">${act('home','返回首页','','btn primary')}${act('records','研究者查看记录')}</div>`);
  else if(v==='withdrawn') html=panel(`${hero('已退出当前流程','已保存此前记录，并标记为“已退出”。','退出')}<div class="actions">${act('home','返回首页','','btn primary')}${act('records','研究者查看记录')}</div>`);
  else if(v==='save-error') html=panel(`${hero('保存没有成功','当前浏览器可能已没有可用空间。请联系研究者。','保存提醒')}<div class="notice">请不要关闭此页。可先尝试导出 JSON 备份；如下载也失败，请手工记录当前结果。</div><div class="actions">${act('export-json','立即备份 JSON','','btn primary')}${act('records','查看记录')}</div>`);
  else html=panel(`${hero('返回开始页')}<div class="actions">${act('welcome','返回','','btn primary')}</div>`);
  app.innerHTML=html;
  updateSyncBadge();
  if(v==='online'&&!onlineData&&!onlineBusy&&!onlineError&&localStorage.getItem(TOKENKEY))setTimeout(loadOnline,0);
  if(v==='timer'||v==='rest')tick();
}

app.addEventListener('input',e=>{
  if(e.target.id!=='token-input')return;
  localStorage.setItem(TOKENKEY,e.target.value||'');
  const tip=document.getElementById('token-tip');
  if(tip)tip.textContent=e.target.value?'已记在本机，按回车或点「保存口令并读取」':'';
});
app.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.id==='token-input'){
    localStorage.setItem(TOKENKEY,e.target.value||'');loadOnline();
  }
});
app.addEventListener('change',e=>{
  const p=person();if(!p)return;
  if(e.target.dataset.field){const f=e.target.dataset.field;if(['age','device'].includes(f))p.s1.background[f]=e.target.value;else p.s1.usage[f]=e.target.value;save();}
  if(e.target.dataset.reason!=null){const r=REASONS[Number(e.target.dataset.reason)];p.s1.reasons=e.target.checked?[...new Set([...p.s1.reasons,r])]:p.s1.reasons.filter(a=>a!==r);save();}
});
app.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const a=b.dataset.action;let p=person();const x=part();
  if(a==='welcome'||a==='home'||a==='admin'||a==='records'||a==='online'){state.mode=a==='home'||a==='welcome'?'participant':'researcher';go(a);if(a==='online')loadOnline();return;}
  if(a==='save-token'){localStorage.setItem(TOKENKEY,document.querySelector('#token-input')?.value||'');loadOnline();return;}
  if(a==='reset-server'){
    if(!confirm('确定清空服务器上的全部回收数据？此操作不可恢复。建议先导出 CSV / Excel 备份。'))return;
    onlineBusy=true;onlineError='';render();
    fetch(`${apiRoot()}/api/reset`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:localStorage.getItem(TOKENKEY)||''})})
      .then(r=>r.json().then(d=>({ok:r.ok,d})))
      .then(({ok,d})=>{if(!ok)throw new Error(d&&d.error||'清空失败');onlineBusy=false;loadOnline();})
      .catch(err=>{onlineBusy=false;onlineError='清空失败：'+err.message;render();});
    return;
  }
  if(a==='online-refresh'){loadOnline();return;}
  if(a==='flush'){flushOutbox();render();return;}
  if(a==='new-person'){createPerson();return;}
  if(a==='select-person'){state.currentId=b.dataset.id;go('home');return;}
  if(a==='export-json'){download(`congrong-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({exportedAt:new Date().toISOString(),people:state.people},null,2),'application/json');return;}
  if(a==='export-csv'){exportCsv();return;}
  if(a==='resume'){if(p.s2.status==='in-progress')go(p.s2.plan?'prep':'baseline-choice');else if(p.s1.status==='in-progress')go('s1q');else go('home');return;}
  if(a==='start-s1'||a==='start-s2'){
    if(!p){createPerson(a==='start-s1'?'s1q':'baseline-choice');p=person();}
    if(a==='start-s1'){
      if(p.s1.status==='complete')go('s1done');
      else {p.s1.status='in-progress';state.q=Math.max(0,p.s1.answers.findIndex(value=>value==null));go('s1q');}
    } else {
      if(p.s2.status==='complete')go('s2done');
      else {p.s2.status='in-progress';go(p.s2.plan?'prep':'baseline-choice');}
    }
    return;
  }
  if(a==='consent-next'){if(state.view==='consent1'){p.s1.status='in-progress';go('background');}else{p.s2.status='in-progress';go('baseline-choice');}return;}
  if(a==='background-next'){if(!p.s1.background.age||!p.s1.background.device){state.error='请先完成两项选择。';render();return;}go('usage');return;}
  if(a==='usage-next'){if(!p.s1.usage.park||!p.s1.usage.smart){state.error='请先完成两项选择。';render();return;}state.q=0;go('s1q');return;}
  if(a==='answer'){
    const val=Number(b.dataset.value),q=state.q;
    if(state.view==='s1q')p.s1.answers[q]=val;
    if(state.view==='baseline-q')p.s2.baseline[q]=val;
    if(state.view==='s2preq'){x.preAnswers[q]=val;x.answers[q]=val;}
    if(state.view==='s2postq')x.answers[q+3]=val;
    state.error='';save();render();return;
  }
  if(a==='q-prev'){state.q=Math.max(0,state.q-1);go(state.view);return;}
  if(a==='q-next'){
    let arr,total,next;
    if(state.view==='s1q'){arr=p.s1.answers;total=23;next='s1reasons';}
    else if(state.view==='baseline-q'){arr=p.s2.baseline;total=6;next='plan';}
    else if(state.view==='s2preq'){arr=x.preAnswers;total=3;next='ready';}
    else {arr=x.answers.slice(3);total=9;next='post-complete';}
    if(arr[state.q]==null){state.error='请先选择一个答案。';render();return;}
    if(state.q<total-1){state.q++;go(state.view);return;}
    if(next==='plan')setPlan(p);
    if(next==='post-complete'){
      x.status='complete';
      queueEvent({type:'complete',study:'s2',id:p.id,partIndex:p.s2.partIndex,condition:x.condition,person:JSON.parse(JSON.stringify(p))});
      p.s2.partIndex++;
      if(p.s2.partIndex===4){p.s2.status='complete';go('s2done');}
      else {go('rest');startTimer(20,'rest');}
      return;
    }
    go(next);return;
  }
  if(a==='s1-complete'){if(!p.s1.reasons.length){state.error='请至少选择一项。';render();return;}p.s1.status='complete';queueEvent({type:'complete',study:'s1',id:p.id,person:JSON.parse(JSON.stringify(p))});go('s1done');return;}
  if(a==='baseline-reuse'){if(p.s1.status!=='complete'){state.error='只有同一人已完成 Study 1 才可复用。';render();return;}p.s2.baselineChoice='reused';p.s2.baseline=p.s1.answers.slice(0,6);setPlan(p);go('plan');return;}
  if(a==='baseline-new'){p.s2.baselineChoice='new';state.q=0;go('baseline-q');return;}
  if(a==='prep'){go(p?.s2?.plan?'prep':'baseline-choice');return;}
  if(a==='prep-next'){if(!document.querySelector('#prep-check')?.checked){state.error='请先核对现场安排。';render();return;}x.status='in-progress';go(CONDITIONS[x.condition].simple?'simple-setup':'complex-menu');return;}
  if(a==='setup-choose'){if(b.dataset.value==='help'){state.error='请研究者协助后再继续。';render();return;}state.q=0;go('s2preq');return;}
  if(a==='complex-choose'){
    if(!x)return;
    if(!x.setup||typeof x.setup!=='object')x.setup={};
    x.setup[state.view]=b.dataset.value;state.error='';save();render();return;
  }
  if(a==='complex-prev'){const steps=['complex-menu','complex-project','complex-time','complex-check'];go(steps[Math.max(0,steps.indexOf(state.view)-1)]);return;}
  if(a==='complex-next'){
    const steps=['complex-menu','complex-project','complex-time','complex-check'],i=steps.indexOf(state.view);
    if(i===0||i===1){
      const picked=x?.setup?.[state.view];
      if(!picked){state.error='请先在屏幕上点选一项，再点下一步。';render();return;}
      if(picked!=='correct'){state.error=i===0?'这不是本次要找的功能，请在菜单中找到“运动反馈设置”。':'这不是本次要练的项目，请选择“基础推手练习”。';render();return;}
    }
    if(i===2){const val=Number(document.querySelector('#complex-time-input')?.value);if(val!==60){state.error='请将时间设为 60 秒后重试。';render();return;}x.setupTime=60;}
    if(i===3){state.q=0;go('s2preq');}else go(steps[i+1]);return;
  }
  if(a==='timer-start'){go('timer');startTimer(60,'exercise');return;}
  if(a==='timer-stop'){x.seconds=Math.max(0,60-remaining());clearInterval(ticking);state.timerEnd=null;go('distance');return;}
  if(a==='distance-save'){
    const meters=Number(document.querySelector('#distance-input')?.value),seconds=Number(document.querySelector('#seconds-input')?.value);
    if(!Number.isFinite(meters)||meters<0||document.querySelector('#distance-input')?.value===''){state.error='请输入有效距离。';render();return;}
    if(!Number.isFinite(seconds)||seconds<0||seconds>60){state.error='运动秒数应为 0–60。';render();return;}
    x.meters=meters;x.seconds=seconds;x.rank=rankFor(meters);state.resultPlayed=false;go('result');speakResult();return;
  }
  if(a==='result-replay'){state.resultPlayed=false;render();speakResult();return;}
  if(a==='result-next'){if(!state.resultPlayed)return;go('observer');return;}
  if(a==='observer-set'){x.observerActual=b.dataset.value==='yes';state.q=0;go('s2postq');return;}
  if(a==='withdraw'){if(p){if(state.view==='s1q')p.s1.status='withdrawn';else p.s2.status='withdrawn';queueEvent({type:'withdraw',id:p.id,person:JSON.parse(JSON.stringify(p))});}go('withdrawn');return;}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&'speechSynthesis'in window)speechSynthesis.cancel();});
if(new URLSearchParams(location.search).get('direct')==='study1'){
  const sessionKey='congrong-direct-study1-id';
  const sessionId=sessionStorage.getItem(sessionKey);
  if(sessionId && state.people[sessionId]) state.currentId=sessionId;
  else {createPerson('s1q');sessionStorage.setItem(sessionKey,state.currentId);}
  const current=person();
  if(current.s1.status==='complete') state.view='s1done';
  else {current.s1.status='in-progress';state.q=Math.max(0,current.s1.answers.findIndex(value=>value==null));state.view='s1q';}
  save();
}
sync.pending=readOutbox().length;
ensureApi().then(()=>{render();flushOutbox();});

// Candidate review keeps rows and the reader mounted during status/metadata updates.
let reviewActive='',reviewListMode=false,reviewPreviousIds=[];
// Yield a paint before optional network work. Recheck visibility when the task runs.
function afterSelectionPaint(task){
  const next=()=>setTimeout(task,0);
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(next);else next();
}
let reviewWorkScheduled=false;
function scheduleReviewWork(){
  if(reviewWorkScheduled)return;reviewWorkScheduled=true;
  afterSelectionPaint(()=>{
    reviewWorkScheduled=false;
    if(!choiceListOpen||drawerTab!=='later')return;
    if(reviewActive&&!reviewLoadState.has(reviewActive))loadReviewBook(reviewActive);
    drainReviewCovers();
  });
}
const reviewNodes=new Map(),reviewData=new Map(),reviewLoadState=new Map(),reviewFetches=new Map(),noteDrafts=new Map(),noteSaving=new Set();
const reviewQueue=new Set(),reviewHydrationTried=new Set();let reviewHydrating=0;
const reviewSearch=document.createElement('div');reviewSearch.id='review-search';cq('query').before(reviewSearch);reviewSearch.append(cq('query'));
const reviewFilter=document.createElement('div');reviewFilter.id='review-filter';
reviewFilter.innerHTML='<label>同步状态 <select id="review-status"><option value="all">全部候选</option><option value="pending">未同步</option><option value="success">已同步</option><option value="failed">同步失败</option></select></label><span id="review-count"></span>';
reviewSearch.append(reviewFilter);
const reviewToolbar=document.createElement('div');reviewToolbar.id='review-toolbar';
reviewSearch.before(reviewToolbar);reviewToolbar.append(reviewSearch,cq('official-tools'));
const reviewFeedback=document.createElement('div');reviewFeedback.id='review-feedback';
reviewFeedback.append(cq('msg'),cq('sync-message'),cq('review-count'));cq('box').append(reviewFeedback);
// Feedback has a fixed slot so progress and undo messages never move the reading area.
const feedbackTitles=new MutationObserver(()=>{for(const id of ['msg','sync-message'])cq(id).title=cq(id).textContent;});
feedbackTitles.observe(reviewFeedback,{childList:true,subtree:true,characterData:true});
const reviewLayout=document.createElement('div');reviewLayout.id='review-layout';
cq('rows').before(reviewLayout);reviewLayout.append(cq('rows'));cq('rows').setAttribute('data-review-scroll','');
cq('rows').setAttribute('aria-label','候选书籍列表');
const reader=document.createElement('section');reader.id='review-reader';reader.setAttribute('aria-label','候选简介阅读区');
reader.innerHTML='<div id="review-empty">从左侧选择一本候选，查看完整简介</div><div id="review-content" hidden><header><div id="review-book-head"><div class="review-cover reader-cover"><span class="cover-placeholder">暂无封面</span><img id="review-cover" alt="" hidden><span id="review-badge" class="review-badge"></span></div><div><span class="review-eyebrow">候选复筛</span><h2 id="review-title"></h2><p id="review-author"></p><p id="review-meta"></p></div></div><div class="review-statusline"><span id="review-load" role="status"></span><button id="review-reload">重试读取</button></div></header><div id="review-text" data-review-scroll tabindex="0" aria-label="完整简介"></div><div id="review-note"><button id="note-toggle" aria-expanded="false">＋ 留下一句备注（可选）</button><div id="note-editor" hidden><textarea id="note-input" maxlength="2000" placeholder="为什么留下它？例如：设定感兴趣，想先试几章。" aria-label="候选备注"></textarea><div class="note-toolbar"><span id="note-message" role="status"></span><button id="note-latest" hidden>载入另一页的备注</button><button id="note-save">保存备注</button></div></div></div><footer><button id="review-sync" class="primary">加入官方待看</button><button id="review-skip">不想看</button><button id="review-remove">移出候选</button><a id="review-detail" target="_blank" rel="noopener noreferrer">查看详情 ↗</a></footer></div>';
reviewLayout.append(reader);for(const id of ['note-input','review-title','review-meta','review-book-head'])cq(id).setAttribute('data-review-scroll','');
const reviewStyle=document.createElement('style');
reviewStyle.textContent=[
  ':host([data-review=true]) #review-search{display:flex;align-items:center;gap:10px;flex:1;min-width:260px;margin:0}:host([data-review=true]) #review-filter{margin:0;flex-shrink:0}#review-count{white-space:nowrap}#review-filter label{white-space:nowrap}:host([data-review=true]) .sync-toolbar button{font-size:12px;padding:5px 8px;margin:0}',
  ':host([data-review=true]) #box{height:100%;display:flex;flex-direction:column;padding:0!important;min-height:0}',
  ':host([data-review=true]) #query{margin:0!important;padding:5px 9px;flex:1;min-width:120px;width:auto;font-size:12px;height:32px}',
  '#review-filter{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:#887b71;margin-bottom:6px}#review-filter select{padding:5px 10px;border:1px solid #e8ded7;border-radius:6px;background:#fff;color:#51463f}',
  ':host([data-review=true]) #official-tools{flex-shrink:0;padding:0}:host([data-review=true]) #official-tools>p:first-child{display:none}',
  ':host([data-review=true]) #review-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;padding:9px 0;flex-shrink:0}.sync-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
  '#review-feedback{display:flex;align-items:center;gap:12px;min-height:26px;flex-shrink:0;border-top:1px solid #eee8e3;font-size:11px;color:#95867b}#review-feedback #msg,#review-feedback #sync-message{flex:1;min-width:0;margin:0;height:26px;line-height:26px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#review-feedback #msg:empty{display:none}#review-feedback #msg:not(:empty){flex:0 1 auto;max-width:50%}#review-feedback #msg button{padding:0 6px;line-height:20px;margin:0 4px;font-size:11px}#review-count{margin-left:auto;font-size:11px}:host(:not([data-review=true])) #sync-message,:host(:not([data-review=true])) #review-count{display:none}',
  ':host([data-review=true]) #review-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(300px,42%) minmax(0,1fr);border-top:1px solid #eee8e3}',
  ':host([data-review=true]) #rows{overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-gutter:stable;min-height:0;padding-right:12px}',
  ':host([data-review=true]) #rows>.review-row{display:grid;grid-template-columns:20px 76px minmax(0,1fr);grid-template-rows:1fr;gap:6px 10px;padding:14px 8px!important;min-height:140px;border-bottom:1px solid #eee8e3;border-left:3px solid transparent;background:white}',
  ':host([data-review=true]) #rows>.review-row[data-active=true]{background:#fff7f0;border-left-color:#ed6b32}:host([data-review=true]) #rows>.review-row:hover{background:#fffbf7}',
  '.review-row>.candidate-check{grid-column:1;grid-row:1;align-self:start;margin:5px 0;width:15px;height:15px}',
  '.review-cover{position:relative;display:block;width:76px;height:104px;overflow:hidden;flex-shrink:0;background:linear-gradient(145deg,#f0e4d7,#e0d2c5);border:1px solid #e8dfd8;border-radius:6px;padding:0!important;margin:0!important;box-shadow:0 3px 8px #3925140d}',
  '.review-row>.review-cover{grid-column:2;grid-row:1}.review-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.cover-placeholder{height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#8a7767}',
  '.review-badge{position:absolute;right:3px;top:4px;max-width:calc(100% - 6px);border:1px solid #ffffffb3;border-radius:5px;padding:2px 5px;line-height:1.5;font-size:10px;font-weight:600;color:#514a42;background:#ffffffe6;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 1px 5px #0002;white-space:nowrap}',
  '.review-badge[data-status=success]{color:#21573e;background:#e5f7ede6}.review-badge[data-status=failed]{color:#a23e29;background:#fff0e8ed}.review-badge[data-status=syncing],.review-badge[data-status=queued]{color:#a3571f;background:#fff2dce6}',
  '.review-row-main{grid-column:3;min-width:0}.review-open{display:block;text-align:left;border:0;background:transparent!important;margin:0!important;padding:0!important;color:#302721;font-size:14px;line-height:1.6;font-weight:600;max-width:100%;overflow-wrap:anywhere}',
  '.review-row-author,.review-row-meta{font-size:12px;color:#8b8077;line-height:1.6;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.review-row-meta{color:#a0958c}.review-row-snippet{font-size:12px;color:#71675f;margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.6}.review-row-note{min-height:18px;font-size:11px;color:#ad6d43;margin-top:4px}',
  '.review-row>.sync-state{display:none}',
  '#review-reader{min-width:0;min-height:0;border-left:1px solid #eee8e3;padding-left:20px;overflow:hidden}#review-empty{display:grid;height:100%;place-content:center;text-align:center;color:#9b8d82;padding:20px}',
  '#review-content{height:100%;display:flex;flex-direction:column;min-height:0}#review-content>header{padding:10px 0 6px;flex-shrink:0}#review-book-head{display:flex;gap:12px;align-items:center;min-width:0;max-height:96px;overflow:auto;overscroll-behavior:contain}#review-book-head>div:last-child{min-width:0}',
  '.reader-cover{width:60px;height:82px}.review-eyebrow{display:none}#review-title{display:block!important;font-size:16px;line-height:1.5;color:#33291f;margin:0 0 4px;max-height:48px;overflow:auto;overscroll-behavior:contain}#review-author,#review-meta{font-size:12px;color:#897b70;margin:3px 0}#review-meta{max-height:38px;overflow:auto;overscroll-behavior:contain}',
  '.review-statusline{display:flex;align-items:center;justify-content:space-between;height:20px;font-size:11px;color:#a29285}#review-reload{border:0;font-size:11px;padding:0 3px;background:transparent;color:#ba653b}',
  '#review-text{flex:1;min-height:30px;overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.95;font-size:14px;color:#4b4037;padding:12px 12px 12px 0;scrollbar-gutter:stable;border-top:1px solid #f1e9e2}',
  '#review-content footer{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex-shrink:0;padding:10px 0 0;border-top:1px solid #eee8e3}#review-content footer button{margin:0;font-size:12px;padding:7px 10px}#review-content .primary{background:#f36b2a;color:white;border-color:#f36b2a}#review-content footer a{font-size:11px;margin-left:auto;color:#a75b32;text-decoration:none}',
  '#review-note{flex-shrink:0;padding:8px 0;position:relative}#note-toggle{border:0;background:transparent;padding:0;margin:0;font-size:12px;color:#a57857}#note-input{width:100%;height:62px;resize:none;border:1px solid #e6d9cc;border-radius:6px;padding:8px;font:12px/1.6 inherit;background:#fffcf8;color:#594638;overscroll-behavior:contain}#note-editor{position:absolute;left:0;right:0;bottom:100%;padding:12px;background:#fffcf8;border:1px solid #e6d9cc;border-radius:8px;box-shadow:0 -4px 20px #35241414;z-index:2}.note-toolbar{display:flex;align-items:center;gap:6px;min-height:28px}#note-message{font-size:11px;color:#a57857;flex:1}#note-save,#note-latest{font-size:11px;padding:3px 7px;margin:0}',
  '#official-tools{position:relative}#sync-review{position:absolute;left:0;right:0;top:100%;z-index:4;max-height:190px;box-shadow:0 8px 24px #0002;overflow:auto;overscroll-behavior:contain}#sync-review ul{max-height:70px}button:focus-visible,a:focus-visible,textarea:focus-visible{outline:2px solid #ed884f;outline-offset:2px}',
  '@media(max-width:760px){:host([data-review=true]) #review-search{gap:6px}#review-count{display:none}:host([data-review=true]) #review-layout{grid-template-columns:minmax(160px,36%) minmax(0,1fr)}:host([data-review=true]) #rows>.review-row{grid-template-columns:17px minmax(0,1fr);gap:6px}.review-row>.review-cover{grid-column:2;grid-row:1}.review-row-main{grid-column:2}.review-row>.candidate-check{grid-column:1}.review-row-snippet,.review-row-meta{display:none}#review-reader{padding-left:12px}.reader-cover{width:60px;height:82px}#review-title{font-size:15px}}',
  '@media(max-height:760px){#review-book-head{max-height:74px;overflow:auto;overscroll-behavior:contain}.review-eyebrow{display:none}.review-statusline{height:20px}#review-meta{max-height:19px}.reader-cover{width:44px;height:60px}#review-content>header{padding-top:8px}#review-title{font-size:16px;max-height:48px}#note-input{height:48px}#review-content footer{padding-top:6px}#review-content footer button{padding:5px 7px}}'
].join('\n');cs.append(reviewStyle);
cq('sync-review').setAttribute('data-review-scroll','');
function reviewMatches(row){const filter=cq('review-status')?.value||'all',status=syncStatus(row.id).status;return filter==='all'||(filter==='pending'?status!=='success':status===filter);}
cq('review-status').onchange=()=>{selectedCandidates.clear();renderChoices();};
function reviewSet(el,text){if(el.textContent!==text)el.textContent=text;}
function paintCover(img,url){const next=safeCover(url);if(img.dataset.source===next)return;img.dataset.source=next;img.hidden=!next;if(next){img.loading='lazy';img.referrerPolicy='no-referrer';img.onload=()=>{img.hidden=false;};img.onerror=()=>{img.hidden=true;};img.src=next;}else img.removeAttribute('src');}
function paintBadge(el,status){el.dataset.status=status.status;reviewSet(el,({success:'已同步',failed:'同步失败',queued:'等待同步',syncing:'同步中',pending:'未同步'})[status.status]||'未同步');el.title=status.label;}
function makeReviewRow(row){
  const el=document.createElement('div');el.className='review-row';el.dataset.id=row.id;
  el.innerHTML='<button class="review-cover"><span class="cover-placeholder">暂无封面</span><img alt="" hidden><span class="review-badge"></span></button><div class="review-row-main"><button class="review-open"></button><div class="review-row-author"></div><div class="review-row-meta"></div><div class="review-row-snippet"></div><div class="review-row-note"></div></div>';
  addSyncControls(row,el);
  for(const b of el.querySelectorAll('.review-cover,.review-open'))b.onclick=()=>selectReview(row.id);
  el.onclick=e=>{if(!e.target.closest('button,input,a')&&!window.getSelection()?.toString())selectReview(row.id);};
  reviewNodes.set(row.id,el);return el;
}
function renderCandidateReview(){
  const rows=candidateRows().sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id)),ids=rows.map(r=>r.id),list=cq('rows'),top=list.scrollTop;
  if(!reviewListMode){list.replaceChildren();reviewListMode=true;}
  const visibleAnchor=[...list.children].find(el=>!el.hidden&&el.getBoundingClientRect().bottom>list.getBoundingClientRect().top);
  const anchor=visibleAnchor?{el:visibleAnchor,top:visibleAnchor.getBoundingClientRect().top}:null;
  const idSet=new Set(ids);
  for(const el of [...list.children])if(!idSet.has(el.dataset.id))el.remove();
  for(const [index,row] of rows.entries()){
    const el=reviewNodes.get(row.id)||makeReviewRow(row),status=syncStatus(row.id);
    if(list.children[index]!==el)list.insertBefore(el,list.children[index]||null);
    const title=el.querySelector('.review-open');reviewSet(title,row.title);el.querySelector('.review-cover').setAttribute('aria-label','查看简介：'+row.title);
    reviewSet(el.querySelector('.review-row-author'),row.author||'作者信息待补充');
    reviewSet(el.querySelector('.review-row-meta'),row.meta||'字数与状态待补充');
    reviewSet(el.querySelector('.review-row-snippet'),row.abstract||'点击查看完整简介');
    reviewSet(el.querySelector('.review-row-note'),noteDrafts.get(row.id)?.dirty?'有未保存的备注':row.note?'有备注':'');
    paintCover(el.querySelector('img'),row.cover);paintBadge(el.querySelector('.review-badge'),status);
    const check=el.querySelector('.candidate-check');check.checked=selectedCandidates.has(row.id);check.disabled=syncBusy||syncLoading||status.status==='success';
    const line=el.querySelector('.sync-state');line.dataset.status=status.status;reviewSet(line,status.label);
    if(choiceListOpen&&drawerTab==='later'&&!safeCover(row.cover)&&!reviewHydrationTried.has(row.id)){if(reviewCoverObserver)reviewCoverObserver.observe(el);else if(index<6){reviewQueue.add(row.id);}}
  }
  list.scrollTop=top;if(anchor?.el.isConnected)list.scrollTop+=anchor.el.getBoundingClientRect().top-anchor.top;
  reviewSet(cq('review-count'),'当前 '+rows.length+' 本 · 已勾选 '+selectedCandidates.size+' 本');
  const oldIndex=Math.max(0,reviewPreviousIds.indexOf(reviewActive));
  if(!ids.includes(reviewActive))reviewActive=ids[Math.min(oldIndex,ids.length-1)]||'';
  reviewPreviousIds=ids;reviewSet(cq('review-empty'),rows.length?'从左侧选择一本候选，查看完整简介':'当前条件下没有候选。可切换筛选，或回书库继续选书。');renderReviewReader();
  for(const [id,el] of reviewNodes){el.dataset.active=String(id===reviewActive);el.querySelector('.review-open').setAttribute('aria-pressed',String(id===reviewActive));}
  if(choiceListOpen&&drawerTab==='later')scheduleReviewWork();
}
const reviewCoverObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){reviewQueue.add(e.target.dataset.id);reviewCoverObserver.unobserve(e.target);}scheduleReviewWork();},{root:cq('rows'),rootMargin:'100px'}):null;
function drainReviewCovers(){
  if(!choiceListOpen||drawerTab!=='later')return;
  while(reviewHydrating<2&&reviewQueue.size){const id=reviewQueue.values().next().value;reviewQueue.delete(id);if(reviewHydrationTried.has(id)||!choices.get(id)||safeCover(choices.get(id).cover))continue;reviewHydrationTried.add(id);reviewHydrating++;loadReviewBook(id).finally(()=>{reviewHydrating--;drainReviewCovers();});}
}
async function loadReviewBook(id,force=false){
  if(reviewFetches.has(id))return reviewFetches.get(id);
  reviewLoadState.set(id,'loading');if(reviewActive===id)renderReviewReader();
  const task=(async()=>{try{
    const full=await appServices.bookDetails.load(id,force);reviewData.set(id,full);reviewLoadState.set(id,'ready');
    try{const result=await historyCall({action:'choiceMeta',id,book:full});choices.set(id,result.row);}catch{reviewLoadState.set(id,'memory');}
  }catch{reviewLoadState.set(id,'failed');}
  finally{reviewFetches.delete(id);if(drawerTab==='later')renderChoices();}
  })();reviewFetches.set(id,task);return task;
}
function selectReview(id){if(!choices.has(id))return;reviewActive=id;renderCandidateReview();}
function draftFor(row){let draft=noteDrafts.get(row.id);if(!draft||(!draft.dirty&&!noteSaving.has(row.id))){draft={value:row.note||'',revision:row.noteRevision||0,dirty:false,open:draft?.open||false,message:''};noteDrafts.set(row.id,draft);}return draft;}
function renderReviewReader(){
  const row=choices.get(reviewActive),content=cq('review-content');cq('review-empty').hidden=!!row;content.hidden=!row;if(!row)return;
  const changed=content.dataset.id!==row.id;content.dataset.id=row.id;
  const full=reviewData.get(row.id),status=syncStatus(row.id),draft=draftFor(row),load=reviewLoadState.get(row.id);
  reviewSet(cq('review-title'),full?.title||row.title);reviewSet(cq('review-author'),full?.author||row.author||'作者信息待补充');reviewSet(cq('review-meta'),full?.meta||row.meta||'字数与连载状态待补充');
  paintCover(cq('review-cover'),full?.cover||row.cover);paintBadge(cq('review-badge'),status);
  reviewSet(cq('review-text'),full?.abstract||row.abstract||'暂无简介，点击重试读取。');if(changed)cq('review-text').scrollTop=0;
  reviewSet(cq('review-load'),load==='loading'?'正在读取完整简介…':load==='failed'?'读取失败，保留已有简介。':load==='ready'?'完整简介':load==='memory'?'完整简介已读取，信息暂未保存到本地。':'已保存的简介');
  cq('review-reload').hidden=!['failed','memory'].includes(load);cq('review-reload').disabled=load==='loading';
  cq('review-sync').disabled=syncBusy||syncLoading||status.status==='success';reviewSet(cq('review-sync'),status.status==='success'?'已同步到官方待看':status.status==='failed'?'重试加入官方待看':'加入官方待看');
  cq('review-sync').title=status.label;cq('review-detail').href='/page/'+row.id;
  cq('review-skip').disabled=choiceBusy;cq('review-remove').disabled=choiceBusy;
  cq('note-editor').hidden=!draft.open;cq('note-toggle').setAttribute('aria-expanded',String(draft.open));reviewSet(cq('note-toggle'),draft.open?'－ 收起备注':draft.dirty?'＋ 有未保存的备注':row.note?'＋ 查看备注':'＋ 留下一句备注（可选）');
  if((changed||(!draft.dirty&&!noteSaving.has(row.id)))&&cq('note-input').value!==draft.value)cq('note-input').value=draft.value;
  cq('note-save').disabled=noteSaving.has(row.id)||!draft.dirty;
  cq('note-latest').hidden=!draft.conflict;
  reviewSet(cq('note-message'),noteSaving.has(row.id)?'正在保存…':draft.message||(draft.dirty?'未保存；切换书籍会保留草稿。':row.note?'已保存在本地':'备注仅保存在本地。'));
}
cq('review-reload').onclick=()=>loadReviewBook(reviewActive,true);
cq('review-sync').onclick=()=>prepareSync([reviewActive]);
cq('review-skip').onclick=()=>{const row=choices.get(reviewActive);if(row)choose(row,'skip');};
cq('review-remove').onclick=()=>{const row=choices.get(reviewActive);if(row)choose(row,'none');};
cq('note-toggle').onclick=()=>{const row=choices.get(reviewActive);if(!row)return;const draft=draftFor(row);draft.open=!draft.open;renderReviewReader();};
cq('note-input').oninput=()=>{const row=choices.get(reviewActive);if(!row)return;const draft=draftFor(row);draft.value=cq('note-input').value;draft.dirty=draft.value!==(row.note||'');draft.message='';renderReviewReader();};
cq('note-save').onclick=async()=>{
  const id=reviewActive,row=choices.get(id);if(!row||noteSaving.has(id))return;const draft=draftFor(row),value=draft.value;noteSaving.add(id);renderReviewReader();
  try{const result=await historyCall({action:'note',id,note:value,revision:draft.revision});choices.set(id,result.row);
    if(result.conflict){draft.conflict=true;draft.message='另一页面已修改备注。草稿已保留，请先核对最新备注。';}
    else{draft.revision=result.row.noteRevision;draft.dirty=draft.value!==value;draft.conflict=false;draft.message=draft.dirty?'仍有未保存修改。':'已保存';}
  }catch{draft.message='保存失败，草稿已保留，请重试。';}
  finally{noteSaving.delete(id);renderChoices();}
};
cq('note-latest').onclick=()=>{const row=choices.get(reviewActive);if(!row)return;const latest=row.note||'';cq('note-input').value=latest;noteDrafts.set(row.id,{value:latest,revision:row.noteRevision||0,dirty:false,open:true,message:'已载入最新备注。'});renderReviewReader();};


const wiredChoices=new WeakSet();

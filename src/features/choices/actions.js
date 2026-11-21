function choiceButtons(book,parent) {
  for(const [state,label] of [['later','候选'],['skip','不想看'],['none','清除标记']]){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.choice=state;b.style.cssText='font:12px/1.4 system-ui;cursor:pointer;padding:2px 5px;margin:2px;border:1px solid #d6d3d1;border-radius:5px;background:#fff;color:#54443b';
    b.onclick=async e=>{e.preventDefault();e.stopPropagation();await choose(book,state);};parent.append(b);
  }
}
async function choose(book,state,{quiet=false}={}) {
  if(choiceBusy)return false;choiceBusy=true;
  const prior=choices.get(book.id)?.state||'none';
  if(!book.cover){const source=[...document.querySelectorAll(CARD)].find(c=>c.querySelector('a[href*="/page/"]')?.getAttribute('href')?.match(/\/page\/(\d+)/)?.[1]===book.id);book={...book,cover:safeCover(source?.querySelector('img')?.getAttribute('src')||document.querySelector('.page-header .book-cover-img')?.getAttribute('src'))};}
  try {
    const row=await historyCall({action:'choose',book,state});choices.set(book.id,row);
    suppressAutoUntil=Date.now()+1500;scan();renderChoices();
    cq('msg').replaceChildren(document.createTextNode('已保存：'+stateLabel(state)+'。'));
    const undo=document.createElement('button');undo.textContent='撤销';undo.onclick=()=>choose(book,prior);cq('msg').append(undo);
    if(detailBook()){detailFeedback.replaceChildren(document.createTextNode('已保存：'+stateLabel(state)+'。'));const back=undo.cloneNode(true);back.onclick=()=>choose(book,prior);detailFeedback.append(back);}
    return true;
  } catch {if(quiet)return false;const error='保存失败，请重试；原标记未改变。';cq('msg').textContent=error;if(detailBook())detailFeedback.textContent=error;else if(drawerReady){if(isSelectionPage())openDrawer(prior==='skip'?'skip':'later');else {introNotice.textContent=error;introNotice.hidden=false;}}else{choiceListOpen=true;renderChoices();}}
  finally{choiceBusy=false;}
}
function detailBook(){const id=location.pathname.match(/^\/page\/(\d+)/)?.[1];const title=document.querySelector('h1')?.textContent.trim();return id&&title?{id,title,abstract:document.querySelector('.page-abstract-content')?.textContent||'',author:document.querySelector('.author-name')?.textContent.trim()||''}:null;}
function renderChoices(){
  const detail=detailBook();
  const libraryLink=document.querySelector('a[href="/library"]');
  if(libraryLink?.parentElement?.parentElement&&!navChoice.isConnected)libraryLink.parentElement.after(navChoice);
  const anchor=drawerReady?null:detail?(document.querySelector('.page-header')||document.querySelector('.page-header-info')):document.querySelector('.muye-stack-book-list:not([data-fq-stream])');
  if(anchor&&!choiceHost.isConnected)anchor.before(choiceHost);
  if(anchor&&choiceHost.parentElement!==anchor.parentElement)anchor.before(choiceHost);
  choiceHost.hidden=drawerReady?!['later','skip'].includes(drawerTab):!choiceListOpen||(!supportedPage()&&!detail);choiceHost.style.display=choiceHost.hidden?'none':'block';cq('box').hidden=false;cq('open').hidden=true;cq('current').hidden=true;
  detailActions.replaceChildren();
  const original=document.querySelector('.add-bookshelf-btn');
  if(detail&&original){
    if(detailActions.previousElementSibling!==original)original.after(detailActions);
    if(!detailFeedback.isConnected||detailFeedback.parentElement!==original.parentElement)original.parentElement.append(detailFeedback);
    choiceButtons(detail,detailActions);
    const state=choices.get(detail.id)?.state||'none';
    detailActions.querySelectorAll('button').forEach(b=>{b.className='byte-btn byte-btn-default byte-btn-size-large byte-btn-shape-square muye-button';b.style.cssText='position:static;padding:0 14px;min-width:70px;width:auto!important;margin:0;height:32px;cursor:pointer;background:#f6f6f6;color:#333;border:1px solid #dedede';b.setAttribute('aria-pressed',String(b.dataset.choice===state));if(b.dataset.choice===state&&state!=='none'){b.textContent=state==='later'?'已加入候选':'已设为不想看';b.style.color='#fa6725';b.style.borderColor='#fa6725';}if(b.dataset.choice==='none'){b.hidden=state==='none';if(b.hidden)b.style.display='none';}});
  }else{detailActions.remove();detailFeedback.remove();}
  const mode=cq('filter').value,q=cq('query').value.trim().toLowerCase();
  choiceHost.dataset.review=String(mode==='later');
  cq('review-filter').hidden=mode!=='later';cq('review-reader').hidden=mode!=='later';
  if(mode==='later'){renderCandidateReview();renderSyncTools();return;}
  reviewListMode=false;
  const fragment=document.createDocumentFragment();
  for(const row of [...choices.values()].filter(r=>r.state===mode&&(!q||(r.title+' '+r.author).toLowerCase().includes(q))).sort((a,b)=>b.updatedAt-a.updatedAt)){
    const el=document.createElement('div'),a=document.createElement('a');a.href='/page/'+row.id;a.target='_blank';a.rel='noopener noreferrer';a.textContent=row.title;el.append(a);
    const meta=document.createElement('div');const matched=matchFilterWords([row.title,config.abstract?row.abstract||'':'']);meta.textContent=(row.author||'')+(matched.length?' · 命中关键词：'+matched.join('、'):'');el.append(meta);choiceButtons(row,el);if(mode==='later')addSyncControls(row,el);fragment.append(el);
  }cq('rows').replaceChildren(fragment);if(!cq('rows').children.length)cq('rows').textContent='暂无记录';renderSyncTools();
}
cq('open').onclick=()=>{choiceListOpen=true;renderChoices();};cq('close').onclick=()=>{if(drawerReady)closeDrawer();else{choiceListOpen=false;renderChoices();}};
cq('filter').onchange=renderChoices;cq('query').oninput=renderChoices;

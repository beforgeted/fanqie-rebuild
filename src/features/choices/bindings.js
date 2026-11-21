const choicePaintState=new WeakMap();
function attachChoices(card,book=libraryBook(card)){
  const id=book.id;if(!id)return;
  if(!wiredChoices.has(card)){card.querySelectorAll('.fq-choice-actions').forEach(e=>e.remove());const controls=document.createElement('div');controls.className='fq-choice-actions';controls.style.cssText='font:12px/1.5 system-ui;clear:both;padding:6px 0;position:relative';const badge=document.createElement('span');badge.className='fq-choice-state';controls.append(badge);choiceButtons(book,controls);if(card.matches('.stack-book-item')){card.classList.add('fq-intro-card');card.append(controls);
    const text=card.querySelector('.book-item-text');
    if(text){text.classList.add('fq-intro-hitarea');text.tabIndex=0;text.setAttribute('role','group');text.setAttribute('aria-label','书籍信息，点击或按回车查看完整简介');text.setAttribute('aria-haspopup','dialog');text.setAttribute('aria-expanded','false');text.onclick=e=>{
      if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.target.closest('a,button,input,select,textarea,[contenteditable=true]')||window.getSelection()?.toString())return;
      e.preventDefault();e.stopPropagation();if(intro?.card!==card)openIntro(card,text);
    };text.onkeydown=e=>{if(e.target===text&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();openIntro(card,text);}};}
    }else (card.querySelector('.book-item-text')||card).append(controls);wiredChoices.add(card);}
  const paintState=(choices.get(id)?.state||'none')+'|'+id;
  if(choicePaintState.get(card)!==paintState){
  choicePaintState.set(card,paintState);
  const badge=card.querySelector('.fq-choice-state'),text=stateLabel(choices.get(id)?.state);if(badge.textContent!==text)badge.textContent=text;
  if(card.matches('.stack-book-item')){const state=choices.get(id)?.state||'none';const clear=card.querySelector('[data-choice=none]');clear.hidden=state==='none';clear.textContent='清除';const later=card.querySelector('[data-choice=later]');later.textContent=state==='later'?'已候选':'候选';later.setAttribute('aria-pressed',String(state==='later'));}
  }
  if(intro?.book.id===id)updateIntroState();
  return id;
}
async function refreshChoices(){try{const rows=await historyCall({action:'choices'});const stamp=JSON.stringify(rows);if(stamp!==choiceStamp){choiceStamp=stamp;choices=new Map(rows.map(r=>[r.id,r]));suppressAutoUntil=Date.now()+1500;scan();renderChoices();}}catch{}}
if(typeof FQ_CHOICE_WATCH==='function')FQ_CHOICE_WATCH(async()=>{await refreshChoices();try{await loadSyncRecords();renderChoices();}catch{}});
else setInterval(async()=>{await refreshChoices();try{await loadSyncRecords();if(choiceListOpen)renderChoices();}catch{}},2000);
window.addEventListener('focus',refreshChoices);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshChoices();});
let detailKey='';setInterval(()=>{const key=location.pathname+'|'+(document.querySelector('h1')?.textContent||'');if(key!==detailKey){detailKey=key;renderChoices();}},700);

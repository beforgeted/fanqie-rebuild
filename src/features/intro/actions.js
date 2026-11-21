async function loadIntro(record,force=false){
  iq('status-text').textContent='正在核对完整简介…';iq('retry').hidden=true;
  try{const full=await appServices.bookDetails.load(record.book.id,force);if(intro!==record)return;
    iq('title').textContent=full.title||record.book.title;iq('body').textContent=full.abstract;iq('status-text').textContent='完整简介';
  }catch{if(intro!==record)return;iq('status-text').textContent=record.book.abstract?'核对失败，当前显示列表简介。':'暂时无法取得简介，可打开详情查看。';iq('retry').hidden=false;}
}

function openIntro(card,trigger){
  if(intro?.card===card)return;closeIntro(false);if(drawerTab)closeDrawer();
  const book=introBook(card);if(!book)return;
  const record={book,card,trigger,saving:false};intro=record;card.setAttribute('data-fq-intro-active','');trigger.setAttribute('aria-expanded','true');
  iq('title').textContent=book.title;iq('meta').textContent=book.meta;iq('body').textContent=book.abstract||'正在读取简介…';iq('body').scrollTop=0;iq('detail').href='/page/'+book.id;introHost.hidden=false;updateIntroState();positionIntro();iq('close').focus({preventScroll:true});loadIntro(record);
}
function closeIntro(restoreFocus=true){if(!intro)return;const previous=intro;intro=null;introHost.hidden=true;previous.card.removeAttribute('data-fq-intro-active');previous.trigger.setAttribute('aria-expanded','false');if(restoreFocus&&previous.trigger.isConnected&&previous.card.getAttribute(MARK)!=='hide')previous.trigger.focus({preventScroll:true});}
function nearbyAnchor(card){const cards=[...document.querySelectorAll('[data-fq-stream] .stack-book-item,.muye-stack-book-list:not([data-fq-native-hidden])>.stack-book-item')].filter(e=>e!==card&&e.getBoundingClientRect().height&&e.getAttribute(MARK)!=='hide');const y=card.getBoundingClientRect().top;const el=cards.sort((a,b)=>Math.abs(a.getBoundingClientRect().top-y)-Math.abs(b.getBoundingClientRect().top-y))[0];return el?{el,top:el.getBoundingClientRect().top}:null;}
function preserveNearby(anchor){if(anchor?.el.isConnected){const delta=anchor.el.getBoundingClientRect().top-anchor.top;if(Math.abs(delta)>.5)window.scrollBy(0,delta);}}
function introUndo(book,prior){const box=bs.getElementById('intro-notice');box.replaceChildren(document.createTextNode('已设为不想看。'));box.hidden=false;const undo=document.createElement('button');undo.textContent='撤销';undo.onclick=async()=>{undo.disabled=true;const visible=[...document.querySelectorAll('.stack-book-item')].find(e=>e.getBoundingClientRect().top>=80&&e.getBoundingClientRect().height&&e.getAttribute(MARK)!=='hide');const anchor=visible?{el:visible,top:visible.getBoundingClientRect().top}:null;if(await choose(book,prior,{quiet:true})){preserveNearby(anchor);box.hidden=true;}else{undo.disabled=false;box.firstChild.textContent='撤销失败，请重试。';}};const dismiss=document.createElement('button');dismiss.textContent='关闭';dismiss.onclick=()=>box.hidden=true;box.append(undo,dismiss);}
async function setIntroChoice(state){
  const record=intro;if(!record||record.saving)return;record.saving=true;updateIntroState();const prior=choices.get(record.book.id)?.state||'none',anchor=state==='skip'?nearbyAnchor(record.card):null;
  const saved=await choose(record.book,state,{quiet:true});record.saving=false;
  if(!saved){if(intro===record){iq('status-text').textContent='保存失败，请重试；原标记未改变。';updateIntroState();}return;}
  if(state==='skip'){if(intro===record)closeIntro(false);preserveNearby(anchor);introUndo(record.book,prior);}
  else if(intro===record){updateIntroState();iq('status-text').textContent=state==='later'?'已加入候选':'已清除标记';}
}
iq('close').onclick=()=>closeIntro();iq('retry').onclick=()=>{if(intro)loadIntro(intro,true);};iq('later').onclick=()=>setIntroChoice('later');iq('skip').onclick=()=>setIntroChoice('skip');iq('clear').onclick=()=>setIntroChoice('none');
document.addEventListener('pointerdown',e=>{if(intro&&!e.composedPath().includes(introHost)&&!e.target.closest?.('.fq-intro-hitarea'))closeIntro(false);});
introRoot.addEventListener('wheel',e=>{const scroller=e.composedPath().find(el=>['body','title','meta'].includes(el.id));if(!scroller||scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();},{passive:false});
introRoot.addEventListener('touchmove',e=>{const scroller=e.composedPath().find(el=>['body','title','meta'].includes(el.id));if(!scroller||scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();},{passive:false});
introRoot.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeIntro();return;}
  if(e.key==='Tab'){const items=[...introRoot.querySelectorAll('button,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length),index=items.indexOf(introRoot.activeElement);if(items.length){e.preventDefault();items[(index+(e.shiftKey?-1:1)+items.length)%items.length].focus({preventScroll:true});}}
  if(e.key===' '&&e.target.tagName!=='BUTTON'){e.preventDefault();iq('body').scrollTop+=(e.shiftKey?-1:1)*iq('body').clientHeight*.85;}
  if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key)){e.preventDefault();const body=iq('body');if(e.key==='Home')body.scrollTop=0;else if(e.key==='End')body.scrollTop=body.scrollHeight;else body.scrollTop+=(e.key.endsWith('Up')?-1:1)*(e.key.startsWith('Arrow')?40:body.clientHeight*.85);}
});
window.addEventListener('scroll',()=>{if(intro)closeIntro(false);},{passive:true});window.addEventListener('resize',positionIntro);

// One in-page management drawer; existing storage keys and panel handlers are retained.
const filterBar=document.createElement('div');filterBar.id='fq-filter-bar';
filterBar.style.cssText='position:fixed;z-index:2147483550;width:340px;max-width:calc(100vw - 24px);left:12px;top:92px';
const bs=filterBar.attachShadow({mode:'open'});
bs.innerHTML='<style>:host{font:14px/1.6 system-ui;color:#333}#bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 8px;background:#fff}button{font:inherit;color:#555;background:#fff;border:1px solid #ddd;border-radius:6px;padding:5px 10px;cursor:pointer}label{white-space:nowrap}input{accent-color:#ff5f16}#summary{font-size:12px;color:#777}#error{color:#a33}#keyword-tags{display:flex;gap:6px;flex-wrap:wrap;padding:0 8px 12px;max-height:84px;overflow:auto;overscroll-behavior:contain}#keyword-tags:empty{display:none}.keyword-tag{background:#fff2e9;color:#a54313;border-radius:5px;padding:2px 8px;overflow-wrap:anywhere;max-width:100%}#words{max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style><div id="bar"><label><input id="enabled" type="checkbox">关键词过滤</label><button id="words"></button><label><input id="abstract" type="checkbox">匹配简介</label><button id="reveal">临时显示隐藏书籍</button><button id="records">屏蔽记录</button><button id="browse">浏览设置</button><span id="summary"></span><span id="error" role="status"></span></div><div id="keyword-tags" role="list" aria-label="当前生效的屏蔽词"></div>';
const bq=id=>bs.getElementById(id);
const quickProfile=document.createElement('label');quickProfile.id='profile-quick-label';quickProfile.innerHTML='选书方案 <select id="profile-quick" aria-label="切换选书方案"></select>';bq('bar').prepend(quickProfile);
bq('profile-quick').onchange=()=>switchProfile(bq('profile-quick').value);
const quickStyle=document.createElement('style');quickStyle.textContent='#profile-quick-label{grid-column:1/-1;display:flex;align-items:center;gap:10px}#profile-quick{flex:1;min-width:0;font:inherit;border:1px solid #ddd2c9;border-radius:6px;padding:6px;background:white;color:#514337}';bs.append(quickStyle);
let displayedProfileSignature='';
const introNotice=document.createElement('div');introNotice.id='intro-notice';introNotice.hidden=true;introNotice.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 32px);padding:8px 12px;background:#fff7ef;border:1px solid #ffd8b9;border-radius:6px;box-shadow:0 4px 12px #0001';bs.append(introNotice);
// Reuse the site's right-hand tools; controls expand beside it without moving the book list.
let filterToolsOpen=false;
const filterPopup=document.createElement('section');filterPopup.id='filter-popover';filterPopup.hidden=true;filterPopup.setAttribute('role','dialog');filterPopup.setAttribute('aria-label','筛书设置');
filterPopup.innerHTML='<header><strong>筛书设置</strong><button id="tools-close" aria-label="收起筛书设置">×</button></header>';
bs.prepend(filterPopup);filterPopup.append(bq('bar'),bq('keyword-tags'));bq('enabled').parentElement.after(bq('abstract').parentElement);
const toolStyle=document.createElement('style');toolStyle.textContent='[hidden]{display:none!important}#filter-popover{background:#fff;border:1px solid #eee0d7;border-radius:10px;box-shadow:0 8px 32px #0002;max-height:calc(100dvh - 110px);overflow:auto;overscroll-behavior:contain}#filter-popover header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #f1e9e3}#tools-close{border:0;padding:0 5px;font-size:20px;background:transparent}#bar{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px}#bar label{font-size:13px}#words,#reveal,#records,#browse{max-width:none;width:100%;font-size:13px}#words,#reveal,#summary,#error{grid-column:1/-1}#keyword-tags{padding:0 14px 14px;max-height:150px}#summary{border-top:1px solid #eee;padding-top:10px}';
bs.append(toolStyle);
document.body.append(filterBar);
const filterTool=document.createElement('button');filterTool.id='fq-filter-tool';filterTool.type='button';filterTool.className='float-wrapper-item';filterTool.setAttribute('aria-label','打开筛书设置');filterTool.setAttribute('aria-haspopup','dialog');filterTool.setAttribute('aria-expanded','false');
filterTool.innerHTML='<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="9" cy="18" r="2" fill="white"/></svg><span>筛书设置</span>';
const toolPageStyle=document.createElement('style');toolPageStyle.textContent='#fq-filter-tool{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;width:64px;height:64px;border:0;border-radius:6px;background:white;color:#333;font-family:inherit;font-size:12px;line-height:1.4;cursor:pointer;padding:6px;box-sizing:border-box}#fq-filter-tool:hover,#fq-filter-tool[aria-expanded=true]{background:#fff4ec;color:#ff681f}#fq-filter-tool:focus-visible{outline:2px solid #ff742b;outline-offset:2px}#fq-filter-tool[hidden],#fq-filter-bar[hidden]{display:none!important}#fq-tools-fallback{position:fixed;right:12px;bottom:120px;z-index:1000;padding:4px;background:white;border-radius:10px;box-shadow:0 6px 24px #0001}';
document.head.append(toolPageStyle);
const toolFallback=document.createElement('div');toolFallback.id='fq-tools-fallback';
function positionFilterTools(){if(!filterToolsOpen)return;const r=filterTool.getBoundingClientRect(),width=Math.min(340,innerWidth-24),height=filterPopup.getBoundingClientRect().height;filterBar.style.width=width+'px';filterBar.style.left=Math.max(12,Math.min(r.left-width-12,innerWidth-width-12))+'px';filterBar.style.top=Math.max(92,Math.min(r.top,innerHeight-height-12))+'px';}
function closeFilterTools(focus=false){filterToolsOpen=false;filterPopup.hidden=true;filterTool.setAttribute('aria-expanded','false');if(focus&&filterTool.isConnected)filterTool.focus({preventScroll:true});}
filterTool.onclick=()=>{if(filterToolsOpen){closeFilterTools(true);return;}if(drawerTab)closeDrawer();closeIntro(false);filterToolsOpen=true;filterPopup.hidden=false;filterTool.setAttribute('aria-expanded','true');positionFilterTools();bq('tools-close').focus({preventScroll:true});};
bq('tools-close').onclick=()=>closeFilterTools(true);
bs.addEventListener('keydown',e=>{if(e.key==='Escape'&&filterToolsOpen){e.preventDefault();closeFilterTools(true);}});
for(const type of ['wheel','touchmove'])bs.addEventListener(type,e=>{const scroller=e.composedPath().includes(bq('keyword-tags'))?bq('keyword-tags'):filterPopup;if(filterToolsOpen&&scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();},{passive:false});
document.addEventListener('pointerdown',e=>{if(filterToolsOpen&&!e.composedPath().includes(filterBar)&&!e.composedPath().includes(filterTool))closeFilterTools();});
window.addEventListener('resize',positionFilterTools);


const overlayStyle=document.createElement('style');
overlayStyle.textContent=`
  #fq-drawer[hidden]{display:none!important}
  #fq-drawer{position:fixed;inset:0;z-index:2147483600;background:#0004;font:14px/1.6 system-ui;color:#333}
  #fq-drawer-dialog{position:absolute;top:80px;left:50%;transform:translateX(-50%);width:min(1120px,calc(100vw - 40px));max-height:min(75dvh,calc(100dvh - 104px));display:flex;flex-direction:column;background:#fff;border-radius:0 0 12px 12px;box-shadow:0 12px 40px #0002;overflow:hidden}
  #fq-drawer-head{display:flex;align-items:center;gap:24px;padding:0 20px;border-bottom:1px solid #eee;flex-shrink:0;min-height:46px}#fq-drawer-title{white-space:nowrap;font-size:14px}
  #fq-drawer-tabs{display:flex;align-self:stretch;align-items:stretch;gap:8px;flex:1;min-width:0;overflow-x:auto;overscroll-behavior:contain}
  #fq-drawer button{font:inherit;cursor:pointer}
  #fq-drawer-tabs button{border:0;background:transparent;padding:10px 12px;color:#666;white-space:nowrap}
  #fq-drawer-tabs button[aria-selected=true]{color:#ee642d;border-bottom:2px solid #ee642d}
  #fq-drawer-close{border:0;background:transparent;padding:4px 8px;font-size:20px;flex-shrink:0}
  #fq-drawer[data-review=true] #fq-drawer-dialog{height:calc(100dvh - 96px);max-height:none;width:min(1220px,calc(100vw - 40px))}
  @media(max-width:760px){#fq-drawer-head{gap:10px;padding:0 12px}#fq-drawer-tabs{gap:0}#fq-drawer-title{font-size:12px}#fq-drawer #fq-drawer-tabs button{padding:8px;font-size:12px}}
  #fq-drawer[data-review=true] #fq-drawer-tabs button{padding:8px 12px}
  #fq-drawer[data-review=true] #fq-drawer-body{flex:1;overflow:hidden;padding:0 20px;display:flex}
  #fq-drawer[data-review=true] #fq-choice-host{height:100%;min-height:0}
  #fq-drawer-body{overflow:auto;overscroll-behavior:contain;min-height:0;padding:4px 24px 20px}
  #fq-drawer-body>#fq-keyword-filter-host,#fq-drawer-body>#fq-choice-host{position:static!important;margin:0!important;width:100%!important;max-width:none!important}
`;document.head.append(overlayStyle);
drawer=document.createElement('div');drawer.id='fq-drawer';drawer.hidden=true;
drawer.innerHTML='<section id="fq-drawer-dialog" role="dialog" aria-modal="true" aria-labelledby="fq-drawer-title"><div id="fq-drawer-head"><strong id="fq-drawer-title">我的选书</strong><button id="fq-drawer-close" aria-label="关闭">×</button></div><div id="fq-drawer-tabs" role="tablist"></div><div id="fq-drawer-body"></div></section>';
drawer.querySelector('#fq-drawer-head').insertBefore(drawer.querySelector('#fq-drawer-tabs'),drawer.querySelector('#fq-drawer-close'));
document.body.append(drawer);
const drawerBody=drawer.querySelector('#fq-drawer-body');drawerBody.append(choiceHost,host);
host.style.cssText='display:none';choiceHost.style.cssText='display:none';
const ruleStyle=document.createElement('style');ruleStyle.textContent='#open,h2,#history-back,#history-close,#close{display:none!important}#panel,#panel[data-view=history]{width:100%;max-height:none;overflow:visible;border:0;box-shadow:none;background:white;padding:16px 0;margin:0}#history-list{max-height:none;overflow:visible}#save{background:#ff5f16;border-color:#ff5f16}input{accent-color:#ff5f16}textarea{overscroll-behavior:contain}#history-open{display:none}#word-tags{display:flex;flex-wrap:wrap;gap:8px;max-height:180px;overflow:auto;overscroll-behavior:contain;padding:3px}.word-tag{display:inline-flex;align-items:center;gap:8px;background:#fff2e9;border:1px solid #ffdcc3;border-radius:6px;padding:4px 8px;color:#a54313;max-width:100%;overflow-wrap:anywhere}.word-tag button{border:0;background:transparent;color:#a54313;padding:0 4px;line-height:24px}.word-tag button:hover{background:#ffddc7}#words{height:86px}#word-preview,#word-feedback,.empty-words{font-size:13px;color:#777}';shadow.append(ruleStyle);
const listStyle=document.createElement('style');listStyle.textContent='#box{border:0;padding:16px 0}#box>strong,#close,#filter{display:none!important}#query{padding:9px;border:1px solid #ddd;border-radius:6px;margin:8px 0}#rows>div{padding:14px 0}';cs.append(listStyle);
for(const [key,label] of [['later','候选'],['skip','不想看'],['rules','关键词规则'],['history','屏蔽记录']]){const button=document.createElement('button');button.textContent=label;button.dataset.tab=key;button.setAttribute('role','tab');button.onclick=()=>openDrawer(key);drawer.querySelector('#fq-drawer-tabs').append(button);}
function openDrawer(tab){
  closeFilterTools();closeIntro(false);
  const opening=!drawerTab;
  if(opening){drawerReturn=document.activeElement;while(drawerReturn?.shadowRoot?.activeElement)drawerReturn=drawerReturn.shadowRoot.activeElement;}
  drawerTab=tab;drawer.dataset.review=String(tab==='later');drawer.hidden=false;host.hidden=false;host.style.display=['rules','history','backup'].includes(tab)?'block':'none';choiceListOpen=['later','skip'].includes(tab);
  drawer.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
  if(choiceListOpen){cq('filter').value=tab;renderChoices();if(tab==='later'&&(opening||!syncAccount))refreshOfficial();}
  else {choiceHost.style.display='none';$('panel').hidden=false;showHistory(tab==='history');if(tab==='backup'){$('settings-view').hidden=true;$('backup-view').hidden=false;}if(tab==='rules'&&!drawerRulesLoaded){resetWordDraft();$('enabled').checked=config.enabled;$('abstract').checked=config.abstract;drawerRulesLoaded=true;}}
  drawerBody.scrollTop=0;
  if(opening)drawer.querySelector('#fq-drawer-close').focus({preventScroll:true});
}
function closeDrawer(){
  if(!drawerTab)return;if(!cq('sync-review').hidden){cq('sync-review').hidden=true;syncBusy=false;}drawerTab=null;drawerRulesLoaded=false;drawer.hidden=true;choiceListOpen=false;historyView=false;
  host.style.display='none';choiceHost.style.display='none';$('panel').hidden=true;
  drawerReturn?.focus?.({preventScroll:true});
}
drawer.querySelector('#fq-drawer-close').onclick=closeDrawer;
drawer.onclick=e=>{if(e.target===drawer)closeDrawer();};
// Do not change root overflow: the site's scroll container resets when it changes.
// Only the drawer may consume scrolling while it is open.
drawer.addEventListener('wheel',e=>{
  const scroller=e.composedPath().find(el=>el?.matches?.('[data-review-scroll]'))||drawerBody;if(!e.composedPath().includes(scroller)||scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();
},{passive:false});
drawer.addEventListener('touchmove',e=>{
  const scroller=e.composedPath().find(el=>el?.matches?.('[data-review-scroll]'))||drawerBody;if(!e.composedPath().includes(scroller)||scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();
},{passive:false});
drawer.addEventListener('keydown',e=>{
  const target=e.composedPath()[0];
  const editable=target.matches?.('input,textarea,select,[contenteditable=true]');
  if(!editable&&['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key)&&!(e.key===' '&&target.matches?.('button,summary'))){
    e.preventDefault();const scrollArea=target.closest?.('[data-review-scroll]')||drawerBody,step=e.key.startsWith('Arrow')?40:scrollArea.clientHeight*0.85;
    if(e.key==='Home')scrollArea.scrollTop=0;else if(e.key==='End')scrollArea.scrollTop=scrollArea.scrollHeight;
    else scrollArea.scrollTop+=(['ArrowUp','PageUp'].includes(e.key)||(e.key===' '&&e.shiftKey)?-step:step);
  }
  if(e.key==='Escape'){e.preventDefault();closeDrawer();}
  if(e.key==='Tab'){
    const roots=[drawer,shadow,cs];const items=roots.flatMap(r=>[...r.querySelectorAll('button,input,textarea,select,summary,a[href],[tabindex="0"]')]).filter(el=>!el.disabled&&el.getClientRects().length);
    const current=shadow.activeElement||cs.activeElement||document.activeElement,index=items.indexOf(current);
    if(items.length){e.preventDefault();const next=items[(index+(e.shiftKey?-1:1)+items.length)%items.length];next.focus({preventScroll:true});if(next.getRootNode()!==document){const area=next.closest('[data-review-scroll]')||drawerBody,rect=next.getBoundingClientRect(),bounds=area.getBoundingClientRect();if(rect.bottom>bounds.bottom)area.scrollTop+=rect.bottom-bounds.bottom;else if(rect.top<bounds.top)area.scrollTop+=rect.top-bounds.top;}}
  }
});
$('history-open').onclick=()=>openDrawer('history');$('history-back').onclick=()=>openDrawer('rules');
bq('words').onclick=()=>openDrawer('rules');bq('records').onclick=()=>openDrawer('history');bq('browse').onclick=()=>{openDrawer('rules');$('rule-more').open=true;drawerBody.scrollTop+=toggle.getBoundingClientRect().top-drawerBody.getBoundingClientRect().top;toggle.focus({preventScroll:true});};
bq('reveal').onclick=()=>{$('reveal').click();};
for(const field of ['enabled','abstract'])bq(field).onchange=async()=>{
  const next=cloneProfile(profileState);next.profiles.find(p=>p.id===next.activeId)[field]=bq(field).checked;bq(field).disabled=true;
  try{await persistProfiles(next);bq('error').textContent='';}
  catch{bq(field).checked=config[field];bq('error').textContent='保存失败，请重试';}finally{bq(field).disabled=false;}
};
let displayedWordSignature='';
function updateFilterBar(total,hits){
  const profileSignature=JSON.stringify([profileState.activeId,profileState.profiles.map(p=>[p.id,p.name])]);
  if(profileSignature!==displayedProfileSignature){displayedProfileSignature=profileSignature;profileOptions(bq('profile-quick'),profileState.profiles,profileState.activeId);}
  const signature=JSON.stringify(config.words);if(signature!==displayedWordSignature){displayedWordSignature=signature;const tags=config.words.map(word=>{const tag=document.createElement('span');tag.className='keyword-tag';tag.setAttribute('role','listitem');tag.textContent=word;return tag;});bq('keyword-tags').replaceChildren(...tags);}
  bq('enabled').checked=config.enabled;bq('abstract').checked=config.abstract;
  bq('words').title=config.words.join('、');const words='屏蔽词 '+config.words.length+' 个 · 编辑';if(bq('words').textContent!==words)bq('words').textContent=words;
  const summary='已加载 '+total+' 本 · '+(reveal?'命中':'隐藏')+' '+hits+' 本';if(bq('summary').textContent!==summary)bq('summary').textContent=summary;
  bq('reveal').textContent=reveal?'恢复隐藏':'临时显示隐藏书籍';
}
function mountFilterBar(){
  if(intro){if(!supportedPage()||!intro.card.isConnected||intro.card.getAttribute(MARK)==='hide')closeIntro(false);else positionIntro();}
  const active=supportedPage(),native=document.querySelector('.float-wrapper');
  filterBar.hidden=!active;filterTool.hidden=!active;
  if(!active){closeFilterTools();toolFallback.remove();}
  else if(native){if(filterTool.parentElement!==native)native.append(filterTool);toolFallback.remove();}
  else{if(!toolFallback.isConnected)document.body.append(toolFallback);if(filterTool.parentElement!==toolFallback)toolFallback.append(filterTool);}
  if(filterToolsOpen)positionFilterTools();
  if(!supportedPage()&&!detailBook()&&!/^\/bookshelf(?:\/|$)/.test(location.pathname)&&drawerTab)closeDrawer();
}

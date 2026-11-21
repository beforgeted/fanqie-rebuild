// A dedicated same-origin page keeps official navigation and account-backed APIs.
// /library remains a valid server route, so bookmarks and refresh need no server changes.
const renderManagementView=openDrawer,hideManagementView=closeDrawer;
let selectionMounted=false,selectionTitle='',selectionInitial=true;
const selectionViews=new Map();
const originalNavTarget=navLink.target;
const selectionStyles=document.createElement('style');
selectionStyles.textContent=`
  body[data-fq-selection-page] .muye-stack,body[data-fq-selection-page] [data-fq-selection-native],body[data-fq-selection-page] .muye-footer,body[data-fq-selection-page] .zone-footer,body[data-fq-selection-page] .float-wrapper{display:none!important}
  body[data-fq-selection-page] .muye-library{padding-top:80px;display:flow-root;min-width:0;width:100%}
  #fq-selection-nav>a{white-space:nowrap;text-decoration:none}
  body[data-fq-selection-page]>.muye-header~#fq-drawer,body[data-fq-selection-page] #fq-drawer[data-native-host=bookshelf]{margin-top:88px}
  #fq-drawer[data-selection-page=true]{position:relative;inset:auto;z-index:auto;display:block;background:#fff;width:min(1440px,calc(100% - 64px));height:calc(100dvh - var(--fq-page-top,88px) - 12px);min-height:420px;margin:8px auto 0;font-family:inherit;box-sizing:border-box}
  #fq-drawer[data-selection-page=true] #fq-drawer-dialog{position:static;transform:none;width:100%;height:100%;max-height:none;border-radius:0;box-shadow:none;overflow:hidden}
  #fq-drawer[data-selection-page=true] #fq-drawer-head{padding:0;gap:12px;min-height:46px}
  #fq-drawer[data-selection-page=true] #fq-drawer-title{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  #fq-drawer[data-selection-page=true] #fq-drawer-tabs{flex:0 0 auto;gap:12px}
  #fq-drawer[data-selection-page=true] #fq-drawer-tabs button{font-size:14px;padding:10px 8px}
  #fq-drawer[data-selection-page=true] #fq-drawer-close{display:none}
  #fq-drawer[data-selection-page=true] #fq-drawer-body{padding:0;flex:1;min-height:0;display:flex;overflow:hidden}
  #fq-drawer[data-selection-page=true] #fq-choice-host{height:100%;min-height:0}
  #fq-drawer[data-selection-page=true][data-backup=true] #fq-drawer-body{display:block;overflow:auto;padding:24px 0}
  #fq-data-management{border:1px solid #e9e2dd!important;border-radius:6px;background:white!important;color:#71675f!important;padding:6px 12px!important;font-size:13px!important;white-space:nowrap;margin-left:auto}
  #fq-data-management[aria-selected=true]{color:#ec6425!important;background:#fff7f0!important}
  #fq-drawer:not([data-selection-page=true]){background:#0001}
  #fq-drawer:not([data-selection-page=true]) #fq-drawer-dialog{left:auto;right:0;top:0;bottom:0;transform:none;width:min(460px,100vw);height:100dvh;max-height:none;border-radius:0;box-shadow:-8px 0 32px #0001}
  #fq-drawer:not([data-selection-page=true]) #fq-drawer-head{flex-wrap:wrap;padding:14px 20px 0;gap:0}
  #fq-drawer:not([data-selection-page=true]) #fq-drawer-title{font-size:18px;flex:1;padding:0 0 10px}
  #fq-drawer:not([data-selection-page=true]) #fq-drawer-close{order:0;padding:0 0 10px 14px}
  #fq-drawer:not([data-selection-page=true]) #fq-drawer-tabs{order:1;flex-basis:100%;gap:16px;min-height:42px}
  #fq-drawer:not([data-selection-page=true]) #fq-drawer-tabs button{padding:8px 0}
  #fq-drawer:not([data-selection-page=true]) #fq-drawer-body{padding:0 20px 16px;flex:1;scrollbar-gutter:stable;scroll-padding-bottom:90px}
  #fq-drawer button[hidden]{display:none!important}
  @media(max-width:760px){#fq-drawer[data-selection-page=true]{width:calc(100% - 24px);margin-top:8px;min-height:420px}#fq-drawer[data-selection-page=true] #fq-drawer-head{gap:12px}#fq-drawer[data-selection-page=true] #fq-drawer-title{font-size:18px}#fq-drawer[data-selection-page=true] #fq-drawer-tabs{gap:4px}#fq-drawer[data-selection-page=true] #fq-drawer-tabs button{font-size:13px}#fq-data-management{font-size:12px!important;padding:5px 8px!important}}
`;
document.head.append(selectionStyles);
const pageReviewStyle=document.createElement('style');pageReviewStyle.textContent=`
  :host([data-page=true]) #review-toolbar{display:flex;align-items:center;gap:6px 12px;padding:6px 0;min-height:44px;box-sizing:border-box}
  :host([data-page=true]) #review-search{flex:1;min-width:0;align-items:center;gap:10px}
  :host([data-page=true]) #query{margin:0!important;min-width:120px;flex:1}
  :host([data-page=true]) #review-filter label{font-size:0}
  :host([data-page=true]) #review-status{font-size:12px;height:30px}
  /* Keep controls in their original shadow root; on wide screens they share the tab row visually. */
  @media(min-width:1180px){:host([data-page=true]) #review-toolbar{position:absolute;top:0;left:160px;right:112px;height:46px;min-height:46px;padding:6px 0;flex-wrap:nowrap;z-index:1}:host([data-page=true]) .sync-toolbar{flex-wrap:nowrap}:host([data-page=true]) #review-search{min-width:240px}}
  @media(max-width:1179px){:host([data-page=true]) #review-toolbar{flex-wrap:wrap}:host([data-page=true]) #review-search{min-width:min(100%,280px)}}
  :host([data-page=true]) #query{height:30px;font-size:13px;max-width:320px}
  :host([data-page=true]) #review-layout{grid-template-columns:minmax(320px,39%) minmax(0,1fr)}
  :host([data-page=true]) #review-reader{padding-left:28px}
  :host([data-page=true]) #review-content>header{padding:18px 0 8px}
  :host([data-page=true]) #review-book-head{max-height:116px;gap:16px}
  :host([data-page=true]) .reader-cover{width:72px;height:98px}
  :host([data-page=true]) #review-title{font-size:20px;max-height:60px}
  :host([data-page=true]) #review-text{font-size:16px;line-height:2;padding:18px 20px 18px 0}
  :host([data-page=true]) #review-content>footer{padding:12px 0}
  :host([data-page=true]):not([data-review=true]) #box{height:100%;display:flex;flex-direction:column;min-height:0;padding:0}
  :host([data-page=true]):not([data-review=true]) #review-layout{flex:1;min-height:0;overflow:hidden}
  :host([data-page=true]):not([data-review=true]) #rows{height:100%;overflow:auto;overscroll-behavior:contain}
  :host([data-page=true]):not([data-review=true]) #review-search{display:flex;margin:0}
  :host([data-page=true]) #sync-review{max-height:180px;overflow:auto;overscroll-behavior:contain}
  :host([data-page=true]) #review-toolbar:has(#sync-review:not([hidden])){align-items:flex-start}
  @media(max-height:760px){:host([data-page=true]) #review-book-head{max-height:70px}:host([data-page=true]) .reader-cover{width:44px;height:60px}:host([data-page=true]) #review-content>header{padding-top:8px}:host([data-page=true]) #review-title{font-size:17px;max-height:48px}:host([data-page=true]) #review-content>footer{padding:8px 0}}
  @media(max-width:900px){:host([data-page=true]) #review-layout{grid-template-columns:minmax(260px,40%) minmax(0,1fr)}:host([data-page=true]) #review-reader{padding-left:16px}:host([data-page=true]) #review-text{font-size:14px}:host([data-page=true]) #review-title{font-size:17px}}
  @media(max-width:650px){:host([data-page=true]) #review-layout{display:flex;flex-direction:column}:host([data-page=true]) #rows{height:30%;min-height:110px;flex-shrink:0}:host([data-page=true]) #review-reader{flex:1;min-height:0;border-left:0;border-top:1px solid #eee8e3;padding-left:0}:host([data-page=true]) #review-book-head{max-height:68px}:host([data-page=true]) .reader-cover{width:44px;height:60px}:host([data-page=true]) #review-content>header{padding-top:8px}:host([data-page=true]) #review-title{font-size:15px}:host([data-page=true]):not([data-review=true]) #rows{height:100%}}
`;cs.append(pageReviewStyle);
const sideRuleStyle=document.createElement('style');sideRuleStyle.textContent=`
  :host([data-side=true]) #panel{padding:18px 0 0}
  :host([data-side=true]) #settings-view{max-width:none}
  :host([data-side=true]) #profile-manager{margin-bottom:18px;padding-bottom:12px}
  :host([data-side=true]) #profile-select{min-width:100px;max-width:200px}
  :host([data-side=true]) #rule-input-block>label{font-size:19px}
  :host([data-side=true]) #words{height:92px}
  :host([data-side=true]) #word-tags{max-height:220px}
  :host([data-side=true]) #rule-save-row{position:sticky;bottom:-16px;z-index:2;gap:10px;padding:12px 0 16px;box-shadow:0 -6px 14px #fff}
  :host([data-side=true]) #rule-save-row .profile-toggles{flex-basis:100%;font-size:13px;gap:16px}
  :host([data-side=true]) #save{width:100%;margin:0}
  :host([data-side=true]) .profile-toolbar{flex-wrap:wrap}
  :host([data-side=true]) input:not([type=checkbox]),:host([data-side=true]) select{max-width:100%;min-width:0}
  :host([data-side=true]) #history-list{overflow-wrap:anywhere}
  :host([data-side=true]) #history-search{width:100%;box-sizing:border-box}
  :host([data-side=true]) #backup-onboarding{display:none}
`;shadow.append(sideRuleStyle);
backupTab.id='fq-data-management';backupTab.textContent='数据管理';backupTab.setAttribute('role','button');
drawer.querySelector('#fq-drawer-head').insertBefore(backupTab,drawer.querySelector('#fq-drawer-close'));
// Hidden compatibility controls still feed statistics and undo; the visible entry opens rules directly.
backupEntry.hidden=true;
filterTool.onclick=()=>{if(drawerTab)closeDrawer();else {openDrawer('rules');drawerReturn=filterTool;}};
drawer.querySelector('#fq-drawer-close').onclick=()=>closeDrawer();
function rememberSelectionView(){
  if(['later','skip'].includes(drawerTab))selectionViews.set(drawerTab,{query:cq('query').value,listTop:cq('rows').scrollTop,textTop:cq('review-text').scrollTop,active:reviewActive});
}
openDrawer=function(tab){
  const page=isSelectionPage(),personal=['later','skip','backup'].includes(tab);
  if(personal&&!page){navigateSelection(tab);return;}
  if(!personal&&page){
    if(!location.pathname.startsWith('/library')){location.assign('/library#fq-'+tab);return;}
    returnToLibrary();openDrawer(tab);return;
  }
  if(page&&drawerTab===tab)return;
  if(page){rememberSelectionView();const previous=selectionViews.get(tab);if(['later','skip'].includes(tab)){cq('query').value=previous?.query||'';if(previous?.active)reviewActive=previous.active;}}
  const opening=!drawerTab;
  renderManagementView(tab);
  drawer.dataset.selectionPage=String(page);drawer.dataset.backup=String(tab==='backup');
  filterToolsOpen=!page;filterTool.setAttribute('aria-expanded',String(!page));
  drawer.querySelector('#fq-drawer-title').textContent=page?'我的选书':'筛书设置';
  drawer.querySelectorAll('[data-tab]').forEach(button=>button.hidden=page?!['later','skip','backup'].includes(button.dataset.tab):!['rules','history'].includes(button.dataset.tab));
  const dialog=drawer.querySelector('#fq-drawer-dialog');dialog.setAttribute('role',page?'region':'dialog');
  if(page)dialog.removeAttribute('aria-modal');else dialog.setAttribute('aria-modal','true');
  host.dataset.side=String(!page);choiceHost.dataset.page=String(page);
  if(page){
    const previous=selectionViews.get(tab);if(previous){cq('rows').scrollTop=previous.listTop;cq('review-text').scrollTop=previous.textTop;}
    history.replaceState(history.state,'',selectionURL(tab));
    if(!selectionInitial)drawer.querySelector('[data-tab="'+tab+'"]').focus({preventScroll:true});
  }else if(opening)drawer.querySelector('#fq-drawer-close').focus({preventScroll:true});
};
closeDrawer=function(){
  if(isSelectionPage())return;
  hideManagementView();filterToolsOpen=false;filterTool.setAttribute('aria-expanded','false');
};
// Use the site's own active class and hover bar, including its 400 ms transition.
const selectionNativeActive=new Set();let selectionNativePath='';
function selectionNativeContent(){
  return /^\/bookshelf(?:\/|$)/.test(location.pathname)?document.querySelector('.muye-bookshelf'):document.querySelector('.muye-stack')||document.querySelector('main:not(#fq-drawer)');
}
function updateSelectionNavigation(active){
  if(active){
    if(!selectionNativePath)selectionNativePath=location.pathname;
    for(const item of navChoice.parentElement?.querySelectorAll('.nav-item_active')||[])if(item!==navChoice){selectionNativeActive.add(item);item.classList.remove('nav-item_active');}
    navChoice.classList.add('nav-item_active');
  }else{
    navChoice.classList.remove('nav-item_active');
    if(location.pathname===selectionNativePath)for(const item of selectionNativeActive)if(item.isConnected)item.classList.add('nav-item_active');
    selectionNativeActive.clear();selectionNativePath='';
  }
  // The website changes navigation colors with the header theme.
  const source=navChoice.parentElement?.querySelector('.nav-item:not(#fq-selection-nav) .nav-item-bar');
  const border=source?.style.borderTop||'1px solid currentColor';if(navBar.style.borderTop!==border)navBar.style.borderTop=border;
}
function unmountSelectionPage(){
  if(!selectionMounted)return;
  selectionMounted=false;document.body.removeAttribute('data-fq-selection-page');
  document.querySelectorAll('[data-fq-selection-native]').forEach(el=>el.removeAttribute('data-fq-selection-native'));
  hideManagementView();drawer.dataset.selectionPage='false';document.body.append(drawer);
  if(document.title==='我的选书 · 番茄小说')document.title=selectionTitle;
  navLink.removeAttribute('aria-current');navLink.target=originalNavTarget;updateSelectionNavigation(false);
}
function mountSelectionPage(){
  const libraryLink=document.querySelector('a[href="/library"]');if(libraryLink?.parentElement?.parentElement&&!navChoice.isConnected)libraryLink.parentElement.after(navChoice);
  const active=isSelectionPage();navLink.href=selectionURL('later');
  if(!active){
    unmountSelectionPage();
    return;
  }
  if(!selectionMounted){suspendLibrary();selectionMounted=true;selectionTitle=document.title;document.body.dataset.fqSelectionPage='';document.title='我的选书 · 番茄小说';navLink.setAttribute('aria-current','page');navLink.target='_self';}
  if(document.title!=='我的选书 · 番茄小说')document.title='我的选书 · 番茄小说';
  updateSelectionNavigation(true);
  drawer.dataset.nativeHost=location.pathname.startsWith('/bookshelf')?'bookshelf':'library';
  const native=selectionNativeContent();
  if(native&&!native.contains(drawer)&&!native.querySelector('nav,.muye-header')){if(!native.hasAttribute('data-fq-selection-native'))native.setAttribute('data-fq-selection-native','');if(drawer.nextElementSibling!==native)native.before(drawer);}
  if(!['later','skip','backup'].includes(drawerTab)){openDrawer(selectionTab());selectionInitial=false;}
  const top=Math.max(0,drawer.getBoundingClientRect().top+scrollY);const value=Math.round(top)+'px';if(drawer.style.getPropertyValue('--fq-page-top')!==value)drawer.style.setProperty('--fq-page-top',value);
}
window.addEventListener('hashchange',()=>{if(isSelectionPage()){mountFilterBar();openDrawer(selectionTab());}else if(selectionMounted)restoreLibraryView();});
// A deep link can also open rules/history in a fresh library tab.
setTimeout(()=>{if(supportedPage()&&['#fq-rules','#fq-history'].includes(location.hash))openDrawer(location.hash.slice(4));},0);

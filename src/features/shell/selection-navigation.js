// Keep the current library DOM and stream in memory while the personal page is shown.
// Nothing here is persisted: refreshing starts from the URL's native library page.
let libraryVisit=null,navigationFrame=0;
const nativeLibraryURL=()=>{const url=new URL(location.href);url.searchParams.delete('fq_view');if(/^#fq-selection\//.test(url.hash)||['#later','#skip','#backup'].includes(url.hash))url.hash='';return url;};
function captureLibraryVisit(){
  const native=selectionNativeContent()||document.querySelector('.muye-stack-book-list');
  const anchors=[...document.querySelectorAll(CARD)].filter(el=>!el.closest('[data-fq-native-hidden]')&&el.getAttribute(MARK)!=='hide').map(el=>({el,top:el.getBoundingClientRect().top})).filter(item=>item.top>=0&&item.top<innerHeight).slice(0,6);
  const containers=[];for(let el=native;el&&el!==document.body;el=el.parentElement)if(el.scrollHeight>el.clientHeight&&/auto|scroll/.test(getComputedStyle(el).overflowY))containers.push({el,top:el.scrollTop,left:el.scrollLeft});
  const url=nativeLibraryURL();
  libraryVisit={url:url.href,key:url.pathname+url.search,native,x:scrollX,y:scrollY,anchors,containers};
}
function suspendLibrary(){
  if(stream&&!stream.suspended){stream.suspended=true;stream.requestEpoch=(stream.requestEpoch||0)+1;stream.controller?.abort();}
}
function resumeLibraryPosition(){
  const visit=libraryVisit;
  if(!visit||visit.key!==routeKey()||!visit.native?.isConnected)return;
  const restore=()=>{
    if(isSelectionPage()||visit!==libraryVisit||visit.key!==routeKey())return;
    for(const item of visit.containers)if(item.el.isConnected){item.el.scrollTop=item.top;item.el.scrollLeft=item.left;}
    window.scrollTo({left:visit.x,top:visit.y,behavior:'instant'});
    const anchor=visit.anchors.find(item=>item.el.isConnected&&item.el.getAttribute(MARK)!=='hide'&&item.el.getClientRects().length);
    if(anchor)window.scrollTo({left:visit.x,top:scrollY+anchor.el.getBoundingClientRect().top-anchor.top,behavior:'instant'});
  };
  restore();cancelAnimationFrame(navigationFrame);navigationFrame=requestAnimationFrame(restore);
}
function navigateSelection(tab='later'){
  if(isSelectionPage()){openDrawer(tab);return;}
  if(!selectionHostRoute()){location.assign(selectionURL(tab));return;}
  captureLibraryVisit();closeIntro(false);if(drawerTab)closeDrawer();suspendLibrary();
  history.pushState(history.state,'',selectionURL(tab));
  window.scrollTo({left:0,top:0,behavior:'instant'});mountFilterBar();openDrawer(tab);
}
function returnToLibrary(){
  if(!isSelectionPage())return;
  rememberSelectionView();
  const url=libraryVisit?.native?.isConnected&&new URL(libraryVisit.url).pathname.startsWith('/library')?libraryVisit.url:nativeLibraryURL().href;
  history.pushState(history.state,'',url);restoreLibraryView();
}
function restoreLibraryView(){
  mountFilterBar();if(stream)stream.suspended=false;
  suppressAutoUntil=Date.now()+1500;syncStream();scan();renderChoices();resumeLibraryPosition();
}
const unmodifiedClick=e=>e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey;
// Returning to the retained native route reuses its DOM. Other navigation stays native.
document.addEventListener('click',e=>{
  if(!isSelectionPage()||!unmodifiedClick(e))return;
  const link=e.target.closest?.('a[href]');if(!link||link===navLink||!link.closest('.nav-item,nav,.muye-header'))return;
  const target=new URL(link.href,location.href);if(target.origin!==location.origin)return;
  const base=libraryVisit?new URL(libraryVisit.url):nativeLibraryURL();
  const retained=target.pathname===base.pathname||(target.pathname==='/library'&&base.pathname.startsWith('/library/'));
  if(retained){
    e.preventDefault();e.stopImmediatePropagation();rememberSelectionView();
    history.pushState(history.state,'',base.href);restoreLibraryView();
  }else{rememberSelectionView();unmountSelectionPage();}
},true);
window.addEventListener('popstate',e=>{
  if(!isSelectionPage()&&!selectionMounted)return;
  const base=nativeLibraryURL(),ownRoute=selectionHostRoute()&&(libraryVisit?libraryVisit.native?.isConnected&&base.pathname+base.search===new URL(libraryVisit.url).pathname+new URL(libraryVisit.url).search:!!selectionNativeContent());
  if(!ownRoute){mountFilterBar();return;}
  // Our hash-only entries did not notify the website router; do not make it reload the library now.
  e.stopImmediatePropagation();
  if(isSelectionPage()){
    if(!selectionMounted){captureLibraryVisit();suspendLibrary();window.scrollTo({left:0,top:0,behavior:'instant'});}
    mountFilterBar();openDrawer(selectionTab());
  }else{rememberSelectionView();restoreLibraryView();}
},true);

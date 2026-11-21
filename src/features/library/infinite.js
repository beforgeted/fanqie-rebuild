// Infinite library stream. Native React list remains available as a fallback.
let stream = null;
let streamStarted = false;
let infiniteEnabled = GM_getValue('fq-infinite-enabled', true) !== false;
const streamStyle = document.createElement('style');
streamStyle.textContent = '[data-fq-native-hidden]{display:none!important}.fq-stream-controls{padding:24px;text-align:center;clear:both}.fq-stream-controls button{margin:8px;padding:8px 16px;cursor:pointer}';
document.head.append(streamStyle);
const toggleLabel = document.createElement('label');
const toggle = document.createElement('input'); toggle.type='checkbox'; toggle.checked=infiniteEnabled;
toggleLabel.append(toggle,' 启用书库无限滚动');
$('settings-view').prepend(toggleLabel);
const routeKey = () => location.pathname + location.search;
const setText = (el,text) => { if(el.textContent!==text) el.textContent=text; };
function disposeStream() {
  if(!stream) return;
  stream.controller?.abort(); stream.io.disconnect(); stream.list.remove(); stream.controls.remove();
  stream.native.removeAttribute('data-fq-native-hidden'); stream.pagination?.removeAttribute('data-fq-native-hidden');
  stream=null;
}
toggle.onchange=async()=>{
  try { await GM_setValue('fq-infinite-enabled',toggle.checked); infiniteEnabled=toggle.checked; disposeStream(); syncStream(); scan(); }
  catch {toggle.checked=infiniteEnabled; $('warning').textContent='无限滚动设置保存失败，请重试。';}
};
function updateStreamStatus() {
  if(!stream) return;
  const s=stream, cards=[...s.list.children], hidden=cards.filter(c=>c.getAttribute(MARK)==='hide').length;
  const suffix=s.loading?'加载中…':s.error?'加载失败：'+s.error:s.done?'没有更多了':s.paused?'已暂停自动加载':'向下滚动加载更多';
  setText(s.status,'已加载 '+s.pages+' 页 · 展示 '+(cards.length-hidden)+' 本 · 已隐藏 '+hidden+' 本 · '+suffix);
  setText(s.pause,s.paused?'恢复自动加载':'暂停自动加载');
  s.more.disabled=s.loading||s.done;
  setText(s.more,s.error?'重试':s.empty>=3?'继续查找':'加载下一页');
}
function streamParams(key,page) {
  const url=new URL(key,location.origin), path=url.pathname;
  const val=re=>path.match(re)?.[1]??'-1';
  const sort={hottes:'0',newest:'1',count:'2'}[url.searchParams.get('sort')||'hottes'];
  if(sort===undefined) throw Error('无法识别当前排序，请关闭无限滚动后重试');
  return new URLSearchParams({page_count:'18',page_index:String(page-1),gender:val(/audience(\d+)/),category_id:val(/cat\d+-(\d+)/),creation_status:val(/stat(\d+)/),word_count:val(/count(\d+)/),book_type:'-1',sort});
}
function makeStreamCard(book,s) {
  const card=s.template.cloneNode(true);
  card.removeAttribute(MARK);card.removeAttribute('data-fq-intro-active');
  // Use textContent for all remote metadata; never execute response markup.
  const title=card.querySelector('.book-item-title');
  title.textContent=book.book_name; title.href='/page/'+book.book_id; title.target='_blank'; title.rel='noopener noreferrer';
  const text=card.querySelector('.book-item-text');
  const desc=text.querySelectorAll(':scope > .book-item-desc');
  if(desc[0]) {desc[0].textContent='作者：'+(book.author||'');desc[0].classList.add(s.font);}
  if(desc[1]) {desc[1].textContent=(Number(book.creation_status)===0?'已完结':'连载中')+' · '+(book.word_count||'字数未知');desc[1].classList.add(s.font);}
  const abstract=card.querySelector('.book-item-abstract'); if(abstract) abstract.textContent=book.abstract||'';
  const footer=card.querySelector('.book-item-footer'); if(footer) footer.textContent=book.last_chapter_time?'更新：'+new Date(Number(book.last_chapter_time)*1000).toLocaleDateString('zh-CN'):'';
  const img=card.querySelector('img');
  if(img){const u=new URL(book.thumb_url||'',location.origin); img.removeAttribute('srcset');img.removeAttribute('data-src');img.loading='lazy';img.alt=book.book_name; if(['https:','http:'].includes(u.protocol)) {u.protocol='https:';img.src=u.href;}else img.removeAttribute('src');}
  const cover=card.querySelector('.book-item-cover');if(cover) {cover.style.cursor='pointer';cover.onclick=()=>window.open('/page/'+book.book_id,'_blank','noopener');}
  card.querySelectorAll('[style]').forEach(el=>{if(el.style.opacity==='0')el.style.opacity='1';});
  return card;
}
async function loadStream(manual=false) {
  const s=stream;
  if(!s||isSelectionPage()||s.suspended||s.loading||s.done||(!manual&&(s.paused||document.hidden||drawerTab||intro||filterToolsOpen||Date.now()<suppressAutoUntil)))return;
  if(s.key!==routeKey())return;
  const requestEpoch=s.requestEpoch||0;
  if(manual){s.empty=0;s.error='';}
  s.loading=true;updateStreamStatus();
  const delay=Math.max(0,600-(Date.now()-(s.lastRequest||0)));
  if(delay)await new Promise(r=>setTimeout(r,delay));
  if(stream!==s||s.key!==routeKey()||isSelectionPage()||requestEpoch!==(s.requestEpoch||0)){s.loading=false;return;}
  s.lastRequest=Date.now();
  s.controller=new AbortController();
  const timeout=setTimeout(()=>s.controller.abort(),20000);
  try {
    const response=await fetch('/api/author/library/book_list/v0/?'+streamParams(s.key,s.page+1),{signal:s.controller.signal});
    if(!response.ok)throw Error('请求失败（'+response.status+'）');
    const json=await response.json();
    if(json.code!==0||!Array.isArray(json.data?.book_list))throw Error('书库返回异常，请稍后重试');
    if(stream!==s||s.key!==routeKey()||requestEpoch!==(s.requestEpoch||0)||!s.native.isConnected)return;
    const books=json.data.book_list;
    const more=json.data.has_more;
    const ended=more===false||more===0||more==='0'||(books.length===0&&more!==true&&more!==1);
    if(!books.length&&!ended)throw Error('接口未返回书籍，请重试');
    if(books.some(b=>!/^\d{5,25}$/.test(String(b.book_id))||typeof b.book_name!=='string'))throw Error('无法识别书籍信息');
    const fresh=books.filter(b=>!s.ids.has(String(b.book_id)));
    const fragment=document.createDocumentFragment();
    const pendingIds=new Set(s.ids);
    let visible=0;
    for(const book of fresh){const id=String(book.book_id);if(pendingIds.has(id))continue;const card=makeStreamCard(book,s);const fields=[readText(card.querySelector(TITLE)),config.abstract?readText(card.querySelector(ABSTRACT)):''];const hit=choices.get(id)?.state==='skip'||(config.enabled&&matchFilterWords(fields).length>0);if(hit)card.setAttribute(MARK,reveal?'show':'hide');if(!hit||reveal)visible++;fragment.append(card);pendingIds.add(id);}
    s.list.append(fragment);s.ids=pendingIds;s.page++;s.pages++;s.error='';
    s.empty=visible?0:s.empty+1;
    s.done=ended;
    if(s.empty>=3)s.paused=true;
    scan();
  } catch(e) {
    if(stream===s&&s.key===routeKey()&&requestEpoch===(s.requestEpoch||0)){s.error=e.name==='AbortError'?'请求超时，请重试':e.message;s.paused=true;}
  } finally {
    clearTimeout(timeout);s.loading=false;
    if(stream===s){updateStreamStatus();setTimeout(()=>{if(stream===s&&s.controls.getBoundingClientRect().top<innerHeight+500)loadStream();},800);}
  }
}
function syncStream() {
  if(isSelectionPage())return; // Keep an existing stream dormant; direct entry creates none.
  if(typeof IntersectionObserver==='undefined')return;
  const native=document.querySelector('.muye-stack-book-list:not([data-fq-stream])');
  const key=routeKey();
  if(stream&&(stream.key!==key||stream.native!==native||!stream.list.isConnected))disposeStream();
  if(isSelectionPage()||!infiniteEnabled||!/^\/library(?:\/|$)/.test(location.pathname)||!native?.querySelector('.stack-book-item')) {if(stream)disposeStream();return;}
  if(stream)return;
  const reseed=streamStarted; streamStarted=true;
  const list=native.cloneNode(true);list.setAttribute('data-fq-stream','');list.removeAttribute('data-fq-native-hidden');
  const cards=[...list.querySelectorAll('.stack-book-item')];
  const template=cards[0].cloneNode(true);
  const font=[...template.querySelector('.book-item-title').classList].find(c=>c.startsWith('font-'));
  if(!font||!FONTS[font.slice(5)])return;
  if(reseed)list.replaceChildren();
  else cards.forEach(card=>{const cover=card.querySelector('.book-item-cover'),link=card.querySelector('.book-item-title');if(cover&&link){cover.style.cursor='pointer';cover.onclick=()=>window.open(link.href,'_blank','noopener');}});
  const pagination=document.querySelector('.muye-stack-pagination');
  const controls=document.createElement('div');controls.className='fq-stream-controls';
  const status=document.createElement('div');status.setAttribute('role','status');
  const pause=document.createElement('button'),more=document.createElement('button');
  controls.append(status,pause,more);
  native.after(list,controls);native.setAttribute('data-fq-native-hidden','');pagination?.setAttribute('data-fq-native-hidden','');
  const ids=new Set((reseed?[]:cards).map(c=>c.querySelector('a[href*="/page/"]')?.getAttribute('href')?.match(/\/page\/(\d+)/)?.[1]).filter(Boolean));
  const page=Number(location.pathname.match(/page_(\d+)/)?.[1]||1);
  const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))loadStream();},{rootMargin:'500px'});
  stream={key,native,list,controls,status,pause,more,pagination,ids,page:reseed?page-1:page,pages:reseed?0:1,template,font,io,paused:false,loading:false,done:!reseed&&!!pagination?.querySelector('.byte-pagination-item-icon:last-child.disabled'),empty:0,error:''};
  pause.onclick=()=>{stream.paused=!stream.paused;updateStreamStatus();if(!stream.paused)loadStream();};
  more.onclick=()=>loadStream(true);
  io.observe(controls);scan();updateStreamStatus();if(reseed)loadStream(true);
}
setInterval(syncStream,700);

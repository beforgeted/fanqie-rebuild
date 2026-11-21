const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.resolve(__dirname,'../../fanqie-keyword-filter.user.js'),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await wait(20);}throw Error('Timed out');};
async function verify(route){
 const library=route==='/library',nativeClass=library?'muye-stack':'muye-bookshelf';
 const w=new JSDOM('<header class="muye-header"><nav><div class="nav-item'+(library?' nav-item_active':'')+'"><a href="/library">书库</a><div class="nav-item-bar"></div></div><div class="nav-item'+(!library?' nav-item_active':'')+'"><a href="/bookshelf">书架</a><div class="nav-item-bar"></div></div></nav></header><main class="'+nativeClass+'"></main>',{url:'https://fanqienovel.com'+route,runScripts:'outside-only'}).window;
 const values={'fq-choice-200001':{id:'200001',title:'本地候选',author:'作者',abstract:'未联网也能看的已有简介',state:'later',updatedAt:1,cover:'https://example.invalid/cover.jpg'}};
 const requests=[],frames=[],pending=[];let y=760;
 w.GM_getValue=(k,d)=>values[k]??d;w.GM_setValue=async(k,v)=>{values[k]=structuredClone(v);};w.GM_listValues=()=>Object.keys(values);w.GM_registerMenuCommand=()=>{};
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};w.cancelAnimationFrame=()=>{};
 Object.defineProperty(w,'scrollY',{get:()=>y});w.scrollTo=arg=>{y=arg.top;};
 w.fetch=url=>{requests.push(String(url));return new Promise((resolve,reject)=>pending.push({resolve,reject,url}));};
 try{
  w.eval(source);await until(()=>w.document.querySelector('#fq-selection-nav'));
  const nav=w.document.querySelector('#fq-selection-nav'),sh=w.document.querySelector('#fq-choice-host').shadowRoot,q=id=>sh.getElementById(id),native=w.document.querySelector('main'),nativeNav=w.document.querySelector('a[href="'+route+'"]').parentElement;
  const flush=()=>{const callbacks=frames.splice(0);callbacks.forEach(fn=>fn());};
  assert.equal(q('rows').children.length,0,'closed candidate list is not built');assert.equal(requests.length,0);
  nav.querySelector('a').click();
  assert.equal(w.location.pathname,route);assert.equal(w.location.hash,'#fq-selection/later');
  assert.equal(q('review-title').textContent,'本地候选');assert.equal(q('review-text').textContent,'未联网也能看的已有简介');
  assert.equal(requests.length,0,'remote reads wait until after first paint');
  assert.equal(nav.classList.contains('nav-item_active'),true);assert.equal(nativeNav.classList.contains('nav-item_active'),false);assert.ok(nav.querySelector('.nav-item-bar'));
  w.document.querySelector('a[href="'+route+'"]').click();flush();await wait(20);
  assert.equal(requests.length,0,'leaving before scheduled work prevents requests');assert.equal(y,760);assert.equal(native,w.document.querySelector('main'));
  assert.equal(nativeNav.classList.contains('nav-item_active'),true);assert.equal(nav.classList.contains('nav-item_active'),false);
  nav.querySelector('a').click();flush();await until(()=>requests.length===2);
  assert.equal(q('review-text').textContent,'未联网也能看的已有简介','slow detail and account requests do not block reading');
  const row=q('rows').firstElementChild;q('rows').scrollTop=240;q('review-text').scrollTop=60;
  for(const task of pending)task.reject(Error('模拟离线'));await until(()=>q('review-load').textContent.includes('读取失败'));
  assert.equal(q('rows').firstElementChild,row);assert.equal(q('rows').scrollTop,240);assert.equal(q('review-text').scrollTop,60);assert.equal(q('review-text').textContent,'未联网也能看的已有简介');
  w.document.querySelector('a[href="'+route+'"]').click();flush();assert.equal(y,760);
  // Once the native router has replaced the page, a later history entry must reach it.
  native.remove();w.history.pushState({},'','/library#fq-selection/later');
  let routed=false;w.addEventListener('popstate',()=>{routed=true;});w.dispatchEvent(new w.PopStateEvent('popstate'));
  assert.equal(routed,true,'do not swallow native navigation after the retained DOM is gone');
  console.log('PASS progressive selection',route,': native active classes, retained DOM/position, no hidden rendering, cached first paint, deferred/cancelled reads, slow/offline fallback');
 }finally{w.close();}
}
(async()=>{await verify('/library');await verify('/bookshelf');})().catch(e=>{console.error(e);process.exitCode=1;});

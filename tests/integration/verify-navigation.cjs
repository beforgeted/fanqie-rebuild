const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.resolve(__dirname,'../../fanqie-keyword-filter.user.js'),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async test=>{for(let i=0;i<150;i++){if(test())return;await wait(20);}throw Error('Timed out');};
const card=(id,title)=>'<div class="stack-book-item"><div class="book-item-cover"><img></div><div class="book-item-text"><a class="book-item-title font-fKts9tCXDjS49UhH" href="/page/'+id+'">'+title+'</a><div class="book-item-desc">作者：测试</div><div class="book-item-abstract font-fKts9tCXDjS49UhH">简介</div></div></div>';
const html='<nav><div class="nav-item"><a href="/library">书库</a></div><div class="nav-item"><a href="/bookshelf">书架</a></div></nav><div class="muye-library"><main class="muye-stack"><div class="muye-stack-book-list">'+card('100001','普通书')+card('100002','原神测试')+'</div><div class="muye-stack-pagination"></div></main></div>';
const w=new JSDOM(html,{url:'https://fanqienovel.com/library/audience1-cat2-718/page_6?sort=newest',runScripts:'outside-only'}).window;
const values={},requests=[],opened=[];let scrollY=0,release,signal,delayed=false;
w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
w.GM_getValue=(k,d)=>values[k]??d;w.GM_setValue=async(k,v)=>{values[k]=JSON.parse(JSON.stringify(v));};w.GM_listValues=()=>Object.keys(values);w.GM_registerMenuCommand=()=>{};
Object.defineProperty(w,'scrollY',{get:()=>scrollY});Object.defineProperty(w,'scrollX',{get:()=>0});w.scrollTo=(x,y)=>{scrollY=typeof x==='object'?x.top:y;};w.requestAnimationFrame=f=>w.setTimeout(f,0);w.cancelAnimationFrame=id=>w.clearTimeout(id);w.open=(...args)=>opened.push(args);
w.fetch=async(url,options)=>{if(!String(url).includes('/library/book_list/'))throw Error('离线');requests.push(String(url));signal=options.signal;return {ok:true,json:async()=>delayed?new Promise(r=>{release=r;}):{code:0,data:{book_list:[{book_id:'100003',book_name:'后续书籍',author:'作者',abstract:'简介'}],has_more:true}}};};
const nativeURL=w.location.href,more=()=>w.document.querySelector('.fq-stream-controls button:last-child'),list=()=>w.document.querySelector('[data-fq-stream]');
(async()=>{try{
 w.eval(source);await until(()=>more());more().click();await until(()=>list().children.length===3);await wait(30);
 const node=list(),nodes=[...node.children];assert.match(requests[0],/page_index=6/);assert.match(requests[0],/sort=1/);
 w.scrollTo(0,1350);w.document.querySelector('#fq-selection-nav a').click();
 assert.equal(w.location.hash,'#fq-selection/later');assert.equal(opened.length,0);assert.equal(w.scrollY,0);
 await wait(800);assert.equal(list(),node);assert.deepEqual([...list().children],nodes);assert.equal(nodes[1].getAttribute('data-fq-keyword-blocked'),'hide');
 const count=requests.length;more().click();await wait(30);assert.equal(requests.length,count,'no library loading while selection is shown');
 w.document.querySelector('a[href="/library"]').click();await wait(30);assert.equal(w.location.href,nativeURL);assert.equal(w.scrollY,1350);assert.equal(list(),node);assert.deepEqual([...list().children],nodes);
 // A provider may finish even after abort; its response must not append while away or after returning.
 delayed=true;more().click();await until(()=>release);w.scrollTo(0,1400);w.document.querySelector('#fq-selection-nav a').click();assert.ok(signal.aborted);
 w.document.querySelector('a[href="/library"]').click();await wait(20);release({code:0,data:{book_list:[{book_id:'100004',book_name:'迟到请求'}],has_more:true}});await until(()=>!more().disabled);
 assert.equal(list().children.length,3);assert.equal(w.scrollY,1400);assert.ok(!w.document.querySelector('.fq-stream-controls').textContent.includes('加载失败'));
 delayed=false;more().click();await until(()=>requests.length>count+1&&!more().disabled);assert.match(requests.at(-1),/page_index=7/,'cancelled page is retried, not skipped');
 // Browser back/forward must use the same live DOM and preserve the native URL's filters/page.
 w.history.back();await until(()=>w.document.body.hasAttribute('data-fq-selection-page'));
 w.history.back();await until(()=>!w.document.body.hasAttribute('data-fq-selection-page'));await wait(20);assert.equal(w.location.href,nativeURL);assert.equal(w.scrollY,1400);assert.equal(list(),node);
 w.history.forward();await until(()=>w.document.body.hasAttribute('data-fq-selection-page'));w.history.forward();await until(()=>!w.document.body.hasAttribute('data-fq-selection-page'));await wait(20);assert.equal(w.scrollY,1400);assert.equal(list(),node);
 console.log('PASS same-tab navigation: native URL/filter/page, accumulated DOM, scroll restoration, hidden filtering, suspended fetch, late response rejection, back/forward');
}finally{w.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/fanqie-keyword-filter.user.js','utf8');
const card=(id,title,abstract)=>'<div class="stack-book-item"><div class="book-item-cover"><img></div><div class="book-item-text"><a class="book-item-title font-fKts9tCXDjS49UhH" href="/page/'+id+'">'+title+'</a><div class="book-item-desc">作者：测试作者</div><div class="book-item-desc">连载中 · 10万字</div><div class="book-item-desc book-item-abstract">'+abstract+'</div><div class="book-item-footer"></div></div></div>';
const dom=new JSDOM('<main><div class="muye-stack-book-list">'+card('100001','第一本','列表简介甲')+card('100002','第二本','列表简介乙')+card('100003','原神测试','关键词隐藏书')+'</div><div class="muye-stack-pagination"></div></main>',{url:'https://fanqienovel.com/library/audience1/page_1?sort=hottes',runScripts:'outside-only'});
const w=dom.window,values={},requests=[],scrollCalls=[],focusCalls=[];
w.IntersectionObserver=class {observe(){}disconnect(){}};
w.GM_getValue=(k,d)=>values[k]??d;w.GM_listValues=()=>Object.keys(values);w.GM_registerMenuCommand=()=>{};
let failSave=false;
w.GM_setValue=async(k,v)=>{if(failSave&&k.startsWith('fq-choice-'))throw Error('模拟存储失败');values[k]=v;};
Object.defineProperty(w,'scrollY',{value:360,writable:true});
w.scrollBy=(x,y)=>{scrollCalls.push([x,y]);w.scrollY+=y;};
const originalFocus=w.HTMLElement.prototype.focus;
w.HTMLElement.prototype.focus=function(options){focusCalls.push(options);return originalFocus.call(this,options);};
w.HTMLElement.prototype.getBoundingClientRect=function(){const hidden=this.hidden||this.getAttribute('data-fq-keyword-blocked')==='hide';return {x:60,y:240,left:60,top:240,right:388,bottom:hidden?240:370,width:hidden?0:328,height:hidden?0:130};};
w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[this.getBoundingClientRect()];};
let reply=async id=>({ok:true,text:async()=>'<h1>详情书名'+id+'</h1><div class="page-abstract-content">完整简介：'+id+'\n&lt;img src=x onerror=alert(1)&gt;</div>'});
w.fetch=async(url,options)=>{requests.push({url,options});if(String(url).startsWith('/page/'))return reply(String(url).split('/').pop());return {ok:true,json:async()=>({code:0,data:{book_list:[{book_id:'100004',book_name:'追加新书',author:'新作者',abstract:'新简介',creation_status:1}],has_more:false}})};};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let n=0;n<150;n++){if(fn())return;await wait(20);}throw Error('Timed out');};
const cards=()=>[...w.document.querySelectorAll('[data-fq-stream] .stack-book-item')];
const host=()=>w.document.getElementById('fq-intro-host');
const root=()=>host().shadowRoot;
const q=id=>root().getElementById(id);
const open=i=>cards()[i].querySelector('.fq-intro-hitarea').click();
const snapshot=()=>({y:w.scrollY,url:w.location.href,html:w.document.documentElement.getAttribute('style'),body:w.document.body.getAttribute('style')});
(async()=>{
 w.eval(source);await until(()=>cards().length===3&&cards()[0].querySelector('.fq-intro-hitarea'));
 assert.equal(w.document.querySelector('.fq-intro-open'),null,'small preview button removed');
 assert.equal(cards()[2].getAttribute('data-fq-keyword-blocked'),'hide');assert.ok(values['fq-history-book-100003']);
 const before=snapshot();open(0);await until(()=>q('status-text').textContent==='完整简介');
 assert.equal(host().hidden,false);assert.deepEqual(snapshot(),before);
 assert.equal(q('meta').textContent,'作者：测试作者 · 连载中 · 10万字','abstract must not duplicate in metadata');
 assert.ok(q('body').textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(q('body').querySelector('img'),null,'untrusted introduction is text');
 assert.equal(q('detail').target,'_blank');assert.equal(q('detail').getAttribute('href'),'/page/100001');
 assert.equal(requests.filter(r=>r.url==='/page/100001').length,1);
 q('close').click();assert.equal(host().hidden,true);assert.deepEqual(snapshot(),before);
 assert.equal(w.document.activeElement,cards()[0].querySelector('.fq-intro-hitarea'));
 open(0);await until(()=>q('status-text').textContent==='完整简介');assert.equal(requests.filter(r=>r.url==='/page/100001').length,1,'cache on reopen');
 const wheel=new w.WheelEvent('wheel',{bubbles:true,cancelable:true});q('close').dispatchEvent(wheel);assert.ok(wheel.defaultPrevented);
 const space=new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});q('body').dispatchEvent(space);assert.ok(space.defaultPrevented);assert.deepEqual(snapshot(),before);
 root().dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(host().hidden,true);
 // Larger text-area target, including nested text, must preserve link and selection behavior.
 for(const selector of ['.book-item-desc','.book-item-abstract','.book-item-footer','.book-item-text']){
  cards()[0].querySelector(selector).click();assert.equal(host().hidden,false);q('close').click();
 }
 cards()[0].querySelector('.book-item-abstract').click();cards()[0].querySelector('.book-item-desc').click();assert.equal(host().hidden,false,'same card remains open');q('close').click();
 const title=cards()[0].querySelector('a');title.addEventListener('click',e=>e.preventDefault(),{once:true});title.click();assert.equal(host().hidden,true,'title keeps original action');
 const selection=w.getSelection(),range=w.document.createRange();range.selectNodeContents(cards()[0].querySelector('.book-item-abstract'));selection.removeAllRanges();selection.addRange(range);assert.ok(selection.toString(),'selection fixture is active');cards()[0].querySelector('.book-item-abstract').click();assert.equal(host().hidden,true,'selecting text must not open preview');selection.removeAllRanges();
 assert.deepEqual(snapshot(),before);
 let release;
 reply=()=>new Promise(r=>release=r);
 open(1);await until(()=>!!release);open(0);await until(()=>q('status-text').textContent==='完整简介');
 release({ok:true,text:async()=>'<h1>过期书名</h1><div class="page-abstract-content">过期简介</div>'});await wait(50);
 assert.equal(q('title').textContent,'详情书名100001','late result cannot overwrite current book');
 // Persisted candidate, failed save rollback, skip + undo restoring the prior candidate.
 q('later').click();await until(()=>values['fq-choice-100001']?.state==='later'&&!q('later').disabled);
 assert.equal(host().hidden,false);assert.equal(q('later').textContent,'已加入候选');assert.equal(cards()[0].querySelector('[data-choice=later]').textContent,'已候选');
 failSave=true;q('skip').click();await until(()=>q('status-text').textContent.includes('保存失败'));assert.equal(host().hidden,false);assert.equal(values['fq-choice-100001'].state,'later');failSave=false;
 q('skip').click();await until(()=>host().hidden);assert.equal(values['fq-choice-100001'].state,'skip');assert.equal(cards()[0].getAttribute('data-fq-keyword-blocked'),'hide');
 const notice=w.document.getElementById('fq-filter-bar').shadowRoot.getElementById('intro-notice');
 await until(()=>!notice.hidden);notice.querySelector('button').click();await until(()=>notice.hidden);assert.equal(values['fq-choice-100001'].state,'later');assert.notEqual(cards()[0].getAttribute('data-fq-keyword-blocked'),'hide');
 // Appended books receive the same preview controls, including retry on fetch failure.
 const more=w.document.querySelectorAll('.fq-stream-controls button')[1];more.click();await until(()=>cards().length===4&&cards()[3].querySelector('.fq-intro-hitarea'));
 reply=async()=>{throw Error('模拟断网');};open(3);await until(()=>!q('retry').hidden);assert.equal(q('body').textContent,'新简介');
 reply=async()=>({ok:true,text:async()=>'<h1>新书全名</h1><div class="page-abstract-content">追加完整简介</div>'});q('retry').click();await until(()=>q('status-text').textContent==='完整简介');assert.equal(q('body').textContent,'追加完整简介');
 w.document.body.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.equal(host().hidden,true);
 assert.deepEqual(snapshot(),before);assert.equal(scrollCalls.length,0);assert.ok(focusCalls.every(o=>o?.preventScroll===true),'script focus must never scroll the page');
 assert.ok(requests.every(r=>!r.options?.method||r.options.method==='GET'),'preview and local choices must not write official shelf');
 console.log('PASS intro: stable open/close, text-safe detail/cache, metadata, stale-result isolation, candidate persistence, failure rollback, skip/undo, appended cards, retry and keyboard/wheel containment');
})().catch(e=>{console.error(e,{cards:cards().length,controls:cards().map(c=>c.querySelector('.fq-intro-hitarea')?.textContent),status:q('status-text')?.textContent,requests:requests.map(r=>r.url)});process.exitCode=1;}).finally(()=>w.close());


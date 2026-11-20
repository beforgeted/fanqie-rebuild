const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/fanqie-keyword-filter.user.js','utf8');
const html='<main><div class="muye-stack-book-list"><div class="stack-book-item"><div class="book-item-cover"><img></div><div class="book-item-text"><a class="book-item-title font-fKts9tCXDjS49UhH" href="/page/100001">火影</a><div class="book-item-desc">作者：作者</div><div class="book-item-desc">连载中</div><div class="book-item-abstract font-fKts9tCXDjS49UhH">忍者</div><div class="book-item-footer"></div></div></div></div><div class="muye-stack-pagination"></div></main>';
const dom=new JSDOM(html,{url:'https://fanqienovel.com/library/audience1-cat2-718/page_6?sort=hottes',runScripts:'outside-only'});
const w=dom.window,values={},requests=[];
w.IntersectionObserver=class {observe(){}disconnect(){}};
w.GM_getValue=(k,d)=>values[k]??d;w.GM_setValue=async(k,v)=>values[k]=v;w.GM_listValues=()=>Object.keys(values);w.GM_registerMenuCommand=()=>{};
let reply=async()=>({code:0,data:{book_list:[book('100002','原神测试'),book('100003','火影测试')],has_more:true}});
function book(id,title){return {book_id:id,book_name:title,author:'测试',abstract:'简介',word_count:'10万字',creation_status:1};}
w.fetch=async(url,options)=>{requests.push(url);return {ok:true,json:()=>reply(url,options)};};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<80;i++){if(fn())return;await wait(50);}throw Error('Timed out');};
const controls=()=>w.document.querySelector('.fq-stream-controls');
const more=()=>controls().querySelectorAll('button')[1];
const cards=()=>[...w.document.querySelectorAll('[data-fq-stream] .stack-book-item')];
(async()=>{
 w.eval(source);await until(()=>!!controls());
 more().click();await until(()=>cards().length===3);await wait(100);
 assert.match(requests[0],/page_index=6/);assert.match(requests[0],/category_id=718/);
 assert.equal(cards()[1].getAttribute('data-fq-keyword-blocked'),'hide');
 assert.ok(values['fq-history-book-100002']);
 more().click();await until(()=>!more().disabled);assert.equal(cards().length,3,'dedup across pages');
 reply=async()=>{throw Error('模拟网络异常');};more().click();await until(()=>controls().textContent.includes('加载失败'));
 assert.equal(cards().length,3,'failure retains existing books');
 reply=async()=>({code:0,data:{book_list:[book('100004','新书')],has_more:false}});
 more().click();await until(()=>controls().textContent.includes('没有更多'));assert.equal(cards().length,4);
 // Sort-only navigation must request the correct current page, without cloning old cards.
 reply=async()=>({code:0,data:{book_list:[book('200001','新排序')],has_more:true}});
 w.history.pushState({},'', '/library/audience1-cat2-718/page_1?sort=newest');
 await until(()=>cards().length===1&&cards()[0].textContent.includes('新排序'));
 assert.match(requests.at(-1),/sort=1/);assert.match(requests.at(-1),/page_index=0/);
 // Late results must never enter a new category.
 let release;
 reply=()=>new Promise(r=>release=r);more().click();await until(()=>!!release);
 w.history.pushState({},'', '/library/audience1-cat2-719/page_1?sort=count');
 reply=async()=>({code:0,data:{book_list:[book('300001','新分类')],has_more:true}});
 await until(()=>cards().some(c=>c.textContent.includes('新分类')));
 release({code:0,data:{book_list:[book('299999','过期书籍')],has_more:true}});await wait(150);
 assert.ok(!cards().some(c=>c.textContent.includes('过期书籍')));
 reply=async()=>({code:0,data:{book_list:[book(String(400000+requests.length),'原神隐藏')],has_more:true}});
 // Automatic repeated all-hidden pages pause after three batches.
 Object.defineProperty(w.document,'hidden',{value:false,configurable:true});
 more().click();await until(()=>controls().textContent.includes('已暂停自动加载'));
 assert.ok(controls().textContent.includes('继续查找'),'three all-hidden pages pause automatic loading');
 const sh=w.document.getElementById('fq-keyword-filter-host').shadowRoot;
 const toggle=sh.querySelector('#settings-view label input');toggle.checked=false;await toggle.onchange();
 assert.equal(w.document.querySelector('[data-fq-stream]'),null);
 assert.equal(w.document.querySelector('[data-fq-native-hidden]'),null);
 assert.ok(values['fq-history-book-100002'],'history preserved on disable');
 console.log('PASS infinite: pagination parameters, filtering/history, dedup, retry/end, sort/category reset, stale response rejection, native fallback');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>w.close());

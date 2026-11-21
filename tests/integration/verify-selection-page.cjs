const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'fanqie-keyword-filter.user.js'),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await wait(20);}throw Error('wait timed out');};
const windows=[],requests=[];
const values={'fq-infinite-enabled':true,'fq-choice-123456':{id:'123456',title:'候选测试',state:'later',abstract:'原有简介',updatedAt:1,cover:'https://example.invalid/cover.jpg',note:'保留备注',noteRevision:1}};
const html='<header class="muye-header"><nav><div class="nav-item"><a href="/">首页</a></div><div class="nav-item"><a href="/library">书库</a></div><div class="nav-item"><a href="/bookshelf">书架</a></div></nav></header><div class="muye-library"><div class="muye-stack"><div class="muye-stack-book-list"><div class="stack-book-item"><div class="book-item-text"><a class="book-item-title" href="/page/234567">原神测试</a><div class="book-item-abstract">简介</div></div></div></div></div></div>';
function page(url){
 const w=new JSDOM(html,{url,runScripts:'outside-only'}).window;windows.push(w);w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.GM_getValue=(k,d)=>values[k]??d;w.GM_setValue=async(k,v)=>{values[k]=JSON.parse(JSON.stringify(v));};w.GM_listValues=()=>Object.keys(values);w.GM_registerMenuCommand=()=>{};
 w.fetch=async url=>{requests.push(String(url));throw Error('离线');};w.open=(...args)=>{w.opened=args;};w.eval(source);return w;
}
(async()=>{try{
 const library=page('https://fanqienovel.com/library');await until(()=>library.document.getElementById('fq-filter-tool'));
 const link=library.document.querySelector('#fq-selection-nav a'),originalURL=library.location.href;
 assert.equal(link.target,'_self');assert.equal(new URL(link.href).hash,'#fq-selection/later');assert.equal(library.document.querySelector('#fq-drawer').hidden,true);
 const view=page(link.href);await until(()=>view.document.body.hasAttribute('data-fq-selection-page'));
 const drawer=view.document.getElementById('fq-drawer'),shadow=view.document.getElementById('fq-choice-host').shadowRoot;
 assert.equal(drawer.hidden,false);assert.equal(drawer.querySelector('[role=region]').getAttribute('aria-modal'),null);
 assert.equal(view.document.querySelector('nav').isConnected,true);assert.ok(view.document.querySelector('.muye-library').hasAttribute('data-fq-selection-native'));
 assert.equal(view.document.querySelector('[data-fq-stream]'),null,'independent page never starts an infinite library stream');
 assert.deepEqual([...drawer.querySelectorAll('[data-tab]')].filter(e=>!e.hidden).map(e=>e.dataset.tab),['later','skip','backup']);
 assert.equal(shadow.getElementById('sync-batch').hidden,true,'batch write action appears only after selection');
 assert.equal(library.location.href,originalURL,'source library remains untouched');
 assert.equal(values['fq-choice-123456'].note,'保留备注');
 shadow.getElementById('query').value='候选';shadow.getElementById('query').oninput();shadow.getElementById('rows').scrollTop=123;
 drawer.querySelector('#fq-data-management').click();assert.equal(view.location.hash,'#fq-selection/backup');
 drawer.querySelector('[data-tab=later]').click();assert.equal(shadow.getElementById('query').value,'候选');assert.equal(shadow.getElementById('rows').scrollTop,123);
 const reloaded=page(view.location.href);await until(()=>reloaded.document.body.hasAttribute('data-fq-selection-page'));assert.equal(reloaded.document.getElementById('fq-drawer').hidden,false,'direct URL survives refresh');
 const backup=page('https://fanqienovel.com/library?fq_view=selection#backup');await until(()=>backup.document.body.hasAttribute('data-fq-selection-page'));assert.equal(backup.document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('backup-view').hidden,false);
 values['fq-choice-123456']={...values['fq-choice-123456'],state:'skip'};view.dispatchEvent(new view.Event('focus'));await until(()=>!shadow.querySelector('.review-row'));
 drawer.querySelector('[data-tab=skip]').click();assert.match(shadow.getElementById('rows').textContent,/候选测试/,'other-tab choices refresh');
 view.history.pushState({},'','/library');await until(()=>!view.document.body.hasAttribute('data-fq-selection-page'));assert.equal(view.document.querySelector('[data-fq-selection-native]'),null);assert.equal(drawer.hidden,true,'leaving selection route restores the native page');
 assert.ok(!requests.some(url=>/\/bookshelf\/(?:add|move|create|delete)/.test(url)),'opening pages never writes official shelf');
 console.log('PASS independent selection page: direct/reload URLs, native navigation, no background book stream, view state, cross-tab updates, native-route restoration');
}finally{windows.forEach(w=>w.close());}})().catch(error=>{console.error(error);process.exitCode=1;});

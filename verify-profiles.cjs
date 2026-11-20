const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {JSDOM}=require('jsdom');
const root=__dirname,source=fs.readFileSync(root+'/chrome-extension/content.js','utf8');
const clone=x=>JSON.parse(JSON.stringify(x)),wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await wait(20);}throw Error('等待超时');};
const key='fq-keyword-filter-v1',values={[key]:{words:['原神','崩铁','星铁','星穹铁道','Hello World'],enabled:true,abstract:false},'fq-choice-100003':{id:'100003',title:'保留候选',state:'later',note:'保留备注'},'fq-history-book-100004':{id:'100004',title:'保留记录',matches:['原神'],firstSeen:1,lastSeen:1,handledAt:2}},initial=clone(values);
const watches=[],windows=[];let listener,fail=false;
const storage={async get(k){return clone(k===null?values:typeof k==='string'?{[k]:values[k]}:Object.fromEntries(k.filter(x=>values[x]!==undefined).map(x=>[x,values[x]])));},async set(patch){await wait(3);if(fail)throw Error('quota');const changes={};for(const [k,v]of Object.entries(patch)){changes[k]={oldValue:values[k],newValue:clone(v)};values[k]=clone(v);}for(const fn of watches)fn(changes,'local');}};
const ctx=vm.createContext({URL,chrome:{runtime:{id:'test',onMessage:{addListener:fn=>listener=fn}},storage:{local:storage}}});
ctx.importScripts=n=>vm.runInContext(fs.readFileSync(root+'/chrome-extension/'+n,'utf8'),ctx);
vm.runInContext(fs.readFileSync(root+'/history-background.js','utf8'),ctx);
const send=msg=>new Promise(resolve=>listener({channel:'fq-filter-history',...msg},{id:'test',url:'https://fanqienovel.com/library'},resolve));
function page(){const w=new JSDOM('<nav><div class="nav-item"><a href="/library">书库</a></div></nav><main class="muye-stack-book-list"><div class="stack-book-item"><div class="book-item-text"><a class="book-item-title" href="/page/100001">崩铁：测试</a><div class="book-item-abstract">原神简介</div></div></div><div class="stack-book-item"><div class="book-item-text"><a class="book-item-title" href="/page/100002">普通故事</a><div class="book-item-abstract">原神设定</div></div></div></main>',{url:'https://fanqienovel.com/library',runScripts:'outside-only'}).window;windows.push(w);w.chrome={storage:{local:storage,onChanged:{addListener:f=>watches.push(f)}},runtime:{sendMessage:send}};w.fetch=async()=>{throw Error('无网络');};w.eval(source);return w;}
const sh=w=>w.document.getElementById('fq-keyword-filter-host').shadowRoot;
const open=w=>{w.document.getElementById('fq-filter-bar').shadowRoot.getElementById('words').click();return sh(w);};
const click=async(s,id)=>{const result=s.getElementById(id).onclick();if(result?.then)await result;await wait(40);};
(async()=>{
 const a=page(),b=page();await until(()=>a.document.getElementById('fq-drawer')&&b.document.getElementById('fq-drawer'));
 const sa=open(a),sb=open(b),book=a.document.querySelector('.stack-book-item'),list=book.parentElement;
 assert.equal(sa.getElementById('profile-name').value,'默认方案');assert.equal(sa.getElementById('abstract').checked,false);
 assert.deepEqual(values[key],initial[key],'opening does not overwrite legacy store');
 sa.getElementById('profile-new-name').value='动漫衍生';await click(sa,'profile-copy');
 assert.equal(values[key].schema,2);assert.equal(values[key].profiles.length,2);assert.deepEqual(values[key].profiles[0].groups[0].words,initial[key].words);assert.equal(values[key].profiles[0].abstract,false);
 const copied=values[key].activeId;assert.notEqual(copied,'default');
 await until(()=>sb.getElementById('profile-name').value==='动漫衍生');
 await click(sa,'group-add');sa.getElementById('group-name').value='星穹铁道别名';
 sa.getElementById('group-select').value='original';sa.getElementById('group-select').onchange();
 for(const tag of sa.querySelectorAll('.word-tag'))if(['崩铁','星铁','星穹铁道'].includes(tag.querySelector('span').textContent)){const check=tag.querySelector('input');check.checked=true;check.onchange();}
 await click(sa,'word-move');const groupId=sa.getElementById('word-target').value;
 sa.getElementById('group-select').value=groupId;sa.getElementById('group-select').onchange();sa.getElementById('group-enabled').checked=false;
 await click(sa,'save');
 assert.deepEqual(values[key].words,['原神','Hello World']);assert.equal(book.getAttribute('data-fq-keyword-blocked'),null,'disabled group is excluded and abstract setting respected');
 assert.equal(a.document.querySelector('.muye-stack-book-list'),list,'switching filters retains book list DOM');assert.equal(list.children.length,2);
 assert.deepEqual(values[key].profiles[0].groups[0].words,initial[key].words,'editing copy does not touch original');
 assert.equal(values[key].profiles[1].groups[1].name,'星穹铁道别名');assert.equal(values[key].profiles[1].groups[1].words.length,3);
 // Switching with pending input neither loses the input nor applies it silently.
 sa.getElementById('words').value='未保存词';sa.getElementById('profile-select').value='default';await sa.getElementById('profile-select').onchange();
 assert.equal(sa.getElementById('profile-confirm').hidden,false);assert.equal(values[key].activeId,copied);assert.equal(sa.getElementById('words').value,'未保存词');
 await click(sa,'profile-cancel');assert.equal(sa.getElementById('words').value,'未保存词');
 sa.getElementById('profile-select').value='default';await sa.getElementById('profile-select').onchange();await click(sa,'profile-save-switch');
 assert.equal(values[key].activeId,'default');assert.ok(values[key].profiles[1].groups[1].words.includes('未保存词'));assert.equal(book.getAttribute('data-fq-keyword-blocked'),'hide');
 // Dirty drafts survive another tab saving; stale writes cannot overwrite it.
 sb.getElementById('words').value='另一页草稿';sa.getElementById('words').value='本页新词';await click(sa,'save');await wait(60);
 assert.equal(sb.getElementById('words').value,'另一页草稿');assert.equal(sb.getElementById('profile-latest').hidden,false);
 await click(sb,'save');assert.match(sb.getElementById('word-feedback').textContent,/保存失败/);assert.ok(!values[key].words.includes('另一页草稿'));assert.ok(values[key].words.includes('本页新词'));
 await click(sb,'profile-latest');assert.ok(sb.getElementById('word-tags').textContent.includes('本页新词'));
 // Failed saves preserve the draft and the active matching rules.
 sa.getElementById('words').value='失败草稿';const snapshot=clone(values[key]);fail=true;await click(sa,'save');fail=false;
 assert.deepEqual(values[key],snapshot);assert.ok(sa.getElementById('word-tags').textContent.includes('失败草稿'));await click(sa,'save');assert.ok(values[key].words.includes('失败草稿'));
 // Blank profiles preserve explicit empty words across reload and leave candidates alone.
 sa.getElementById('profile-new-name').value='原创小说';await click(sa,'profile-empty');assert.deepEqual(values[key].words,[]);
 const c=page();await until(()=>c.document.getElementById('fq-drawer'));const sc=open(c);assert.equal(sc.getElementById('profile-name').value,'原创小说');assert.equal(sc.querySelectorAll('.word-tag').length,0);
 assert.deepEqual(values['fq-choice-100003'],initial['fq-choice-100003']);assert.deepEqual(values['fq-history-book-100004'],initial['fq-history-book-100004']);
 sa.getElementById('profile-new-name').value='默认方案';const before=clone(values[key]);await click(sa,'profile-copy');assert.deepEqual(values[key],before,'duplicate names rejected');
 await click(sa,'profile-delete');await click(sa,'profile-delete-no');assert.deepEqual(values[key],before);await click(sa,'profile-delete');await click(sa,'profile-delete-yes');assert.equal(values[key].profiles.length,2);assert.equal(values[key].activeId,'default');
 // Serialized optimistic writes: exactly one concurrent edit at the same revision succeeds.
 const state=(await send({action:'filterRead'})).result;
 const x=clone(state),y=clone(state);x.profiles[0].name='并发甲';y.profiles[0].name='并发乙';
 const writes=await Promise.all([send({action:'filterSave',state:x,revision:state.revision}),send({action:'filterSave',state:y,revision:state.revision})]);assert.equal(writes.filter(r=>r.result?.conflict).length,1);
 const malformed=clone(values[key]);malformed.profiles=[];assert.equal((await send({action:'filterSave',state:malformed,revision:values[key].revision})).ok,false);
 // Matching keeps punctuation/fullwidth/phrase semantics and reports every hit.
 const norm=vm.runInContext('filterNormalize',ctx),compile=vm.runInContext('compileFilterWords',ctx);
 const words=['崩坏3','Hello World','星铁','崩坏'];const match=compile(words);const fields=['崩坏－３ / HELLO, WORLD','星 铁'];
 const legacy=(terms,texts)=>terms.filter(w=>norm(w)&&texts.some(t=>norm(t).includes(norm(w))));
 assert.deepEqual(Array.from(match(fields)),legacy(words,fields));
 const many=Array.from({length:1000},(_,i)=>'题材'+i+'结尾'),texts=['一个普通冒险故事'.repeat(20),'另一个世界的旅程'.repeat(50)],fast=compile(many);
 let t=performance.now();for(let i=0;i<100;i++)legacy(many,texts);const oldMs=performance.now()-t;t=performance.now();for(let i=0;i<100;i++)fast(texts);const newMs=performance.now()-t;
 console.log('PASS profiles: legacy migration, independent copies, group move/toggle, empty rules, save/switch/cancel, failed writes, multi-tab conflicts, validation, deletion and data preservation');
 console.log('Matching microbenchmark (100 books × 1000 words, excluding DOM/network): '+oldMs.toFixed(1)+' ms -> '+newMs.toFixed(1)+' ms');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>windows.forEach(w=>w.close()));

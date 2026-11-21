const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../..')+'/fanqie-keyword-filter.user.js','utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<180;i++){if(fn())return;await wait(20);}throw Error('Timed out');};
(async()=>{
 const context=vm.createContext({});vm.runInContext(source.split('// HISTORY_CORE_BEGIN')[1].split('// HISTORY_CORE_END')[0],context);
 const store={'fq-choice-200001':{id:'200001',title:'旧候选',state:'later',updatedAt:123,note:'旧备注',noteRevision:1,custom:'保留字段'}};
 const storage={get:async k=>store[k],all:async()=>store,set:async v=>Object.assign(store,v)};
 await context.historyOperation(storage,{action:'choose',book:{id:'200001',title:'更新标题'},state:'skip'});
 assert.equal(store['fq-choice-200001'].note,'旧备注');assert.equal(store['fq-choice-200001'].custom,'保留字段');
 const timestamp=store['fq-choice-200001'].updatedAt;
 await context.historyOperation(storage,{action:'choiceMeta',id:'200001',book:{cover:'javascript:alert(1)',abstract:'补充简介',meta:'连载中'}});
 assert.equal(store['fq-choice-200001'].cover,'');assert.equal(store['fq-choice-200001'].updatedAt,timestamp);
 const conflict=await context.historyOperation(storage,{action:'note',id:'200001',note:'覆盖',revision:0});assert.ok(conflict.conflict);assert.equal(store['fq-choice-200001'].note,'旧备注');
 await context.historyOperation(storage,{action:'note',id:'200001',note:'新备注',revision:1});assert.equal(store['fq-choice-200001'].state,'skip');assert.equal(store['fq-choice-200001'].updatedAt,timestamp);
 console.log('PASS review storage: legacy fields, note revisions/conflicts, metadata validation, stable ordering');
 const values={};for(let i=1;i<=12;i++){const id=String(200000+i);values['fq-choice-'+id]={id,title:'候选'+i,author:'测试作者',abstract:'原有简介'+i,state:'later',updatedAt:100-i};}
 values['fq-official-sync-12345-200003']={id:'200003',status:'failed',message:'测试失败'};
 const rows=[{book_id:'200001',group_id:'7888888888888888888',group_name:'待看'}],requests=[],writes=[];
 let failSave=false,failDetails='',delayId='',release;
 const queues=new Map(),locks={request(name,fn){const task=(queues.get(name)||Promise.resolve()).then(fn);queues.set(name,task.catch(()=>{}));return task;}};
 const w=new JSDOM('<nav><div class="nav-item"><a href="/library">书库</a></div></nav>',{url:'https://fanqienovel.com/library',runScripts:'outside-only'}).window;
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.navigator.locks=locks;w.document.cookie='passport_csrf_token=test';
 w.GM_getValue=(k,d)=>values[k]??d;w.GM_listValues=()=>Object.keys(values);w.GM_registerMenuCommand=()=>{};
 w.GM_setValue=async(k,v)=>{if(failSave&&k.startsWith('fq-choice-'))throw Error('模拟存储失败');values[k]=structuredClone(v);};
 w.fetch=async(url,options={})=>{
  requests.push(url);const ok=data=>({ok:true,text:async()=>JSON.stringify({code:0,data})});
  if(url.startsWith('/page/')){const id=url.split('/').pop();if(id===failDetails)throw Error('模拟读取失败');if(id===delayId)await new Promise(r=>release=r);
   return {ok:true,text:async()=>'<h1>完整标题'+id+'</h1><div class="author-name">测试作者</div><div class="info-label"><span>连载中</span><span>同人</span></div><div class="info-count">30万字</div><div class="book-cover"><img class="book-cover-img" src="//p1-tt.byteimg.com/origin/novel-static/5cb03bd354145bc7815a5e09d4b15cfc"></div><div class="page-abstract-content">完整简介'+id+'&lt;img onerror=alert(1)&gt;</div><script>window.__INITIAL_STATE__='+JSON.stringify({page:{bookId:id,thumbUri:'https://example.invalid/cover-'+id+'.jpg'}})+';</script>'};
  }
  if(url==='/api/user/info/v2')return ok({id:'12345'});
  if(url.includes('/info/'))return ok({book_shelf_info:rows});
  const body=JSON.parse(options.body);writes.push(body);
  if(url.includes('/add/')){for(const b of body.identify_data)if(!rows.some(r=>r.book_id===b.book_id))rows.push({book_id:b.book_id});return ok({});}
  for(const b of body.book_data){const row=rows.find(r=>r.book_id===b.book_id);row.group_name='待看';row.group_id='7888888888888888888';}return ok({});
 };
 try{
  w.eval(source);await until(()=>w.document.getElementById('fq-drawer'));const sh=w.document.getElementById('fq-choice-host').shadowRoot,q=id=>sh.getElementById(id);
  [...w.document.querySelectorAll('.nav-item a')].find(e=>e.textContent==='我的选书').click();await until(()=>q('sync-message').textContent.includes('已核对')&&q('review-load').textContent==='完整简介');
  const select=id=>sh.querySelector('[data-id="'+id+'"] .review-open').click();
  assert.equal(sh.querySelectorAll('.review-row').length,12);assert.equal(sh.querySelectorAll('.sync-one').length,0,'single-book sync stays in the reader, not duplicated in rows');assert.equal(q('review-cover').src,'https://example.invalid/cover-200001.jpg','extract actual cover, never spinner');
  assert.equal(q('review-text').querySelector('img'),null);assert.equal(q('review-badge').textContent,'已同步');assert.equal(w.document.querySelector('#fq-intro-host').hidden,true,'no second popup');
  assert.deepEqual(requests.filter(x=>x.startsWith('/page/')),['/page/200001'],'do not fetch entire library');
  const initial={url:w.location.href,html:w.document.documentElement.getAttribute('style'),body:w.document.body.getAttribute('style')};
  const firstNode=sh.querySelector('[data-id="200001"]');q('rows').scrollTop=420;
  select('200002');await until(()=>q('review-load').textContent==='完整简介');assert.equal(q('rows').scrollTop,420);assert.equal(sh.querySelector('[data-id="200001"]'),firstNode,'status changes keep row DOM');
  q('note-toggle').click();q('note-input').value='本页草稿';q('note-input').dispatchEvent(new w.Event('input'));select('200001');select('200002');assert.equal(q('note-input').value,'本页草稿');
  failSave=true;q('note-save').click();await until(()=>q('note-message').textContent.includes('保存失败'));assert.equal(q('note-input').value,'本页草稿');failSave=false;
  const oldOrder=values['fq-choice-200002'].updatedAt;q('note-save').click();await until(()=>values['fq-choice-200002'].note==='本页草稿');assert.equal(values['fq-choice-200002'].updatedAt,oldOrder);assert.equal(q('rows').scrollTop,420);
  q('note-input').value='本页未保存修改';q('note-input').dispatchEvent(new w.Event('input'));
  values['fq-choice-200002']={...values['fq-choice-200002'],note:'另一页修改',noteRevision:2};w.dispatchEvent(new w.Event('focus'));await wait(80);
  q('note-save').click();await until(()=>!q('note-latest').hidden);assert.equal(values['fq-choice-200002'].note,'另一页修改');assert.equal(q('note-input').value,'本页未保存修改');
  q('note-latest').click();assert.equal(q('note-input').value,'另一页修改');
  // An old detail response cannot replace the currently selected reader.
  delayId='200002';q('review-reload').onclick();await until(()=>!!release);select('200001');release();await wait(80);assert.equal(q('review-content').dataset.id,'200001');assert.match(q('review-title').textContent,/200001/);delayId='';
  failDetails='200003';select('200003');await until(()=>q('review-load').textContent.includes('读取失败'));assert.equal(q('review-text').textContent,'原有简介3');failDetails='';q('review-reload').click();await until(()=>q('review-load').textContent==='完整简介');
  q('review-status').value='success';q('review-status').dispatchEvent(new w.Event('change'));assert.equal(sh.querySelectorAll('.review-row').length,1);assert.equal(q('review-badge').textContent,'已同步');
  q('review-status').value='failed';q('review-status').dispatchEvent(new w.Event('change'));assert.equal(sh.querySelectorAll('.review-row').length,1);assert.equal(q('review-content').dataset.id,'200003');
  q('sync-select').click();assert.equal(q('sync-batch').textContent,'加入官方待看（1）');q('sync-batch').click();await until(()=>values['fq-official-sync-12345-200003']?.status==='success');
  assert.equal(writes.length,2);assert.ok(writes.every(b=>(b.book_data||b.identify_data)[0].book_id==='200003'),'batch uses filtered selection');
  q('review-status').value='all';q('review-status').dispatchEvent(new w.Event('change'));select('200002');q('review-remove').click();await until(()=>values['fq-choice-200002'].state==='none');assert.equal(values['fq-choice-200002'].note,'另一页修改');assert.equal(rows.some(r=>r.book_id==='200002'),false);
  q('msg').querySelector('button').click();await until(()=>values['fq-choice-200002'].state==='later');assert.equal(values['fq-choice-200002'].note,'另一页修改');
  select('200002');q('review-skip').click();await until(()=>values['fq-choice-200002'].state==='skip');q('msg').querySelector('button').click();await until(()=>values['fq-choice-200002'].state==='later');
  w.document.querySelector('#fq-drawer-close').click();assert.equal(w.document.querySelector('#fq-drawer').hidden,true);
  assert.deepEqual({url:w.location.href,html:w.document.documentElement.getAttribute('style'),body:w.document.body.getAttribute('style')},initial);
  console.log('PASS candidate review: covers/badges, on-demand fetch, stable rows/scroll, drafts, failed save/retry, cross-tab conflicts, stale response, filters/batch sync, remove/skip/undo and data retention');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


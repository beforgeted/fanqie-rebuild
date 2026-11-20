const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/fanqie-keyword-filter.user.js','utf8');
const context=vm.createContext({AbortController,setTimeout,clearTimeout});
vm.runInContext(source.split('// OFFICIAL_CORE_BEGIN')[1].split('// OFFICIAL_CORE_END')[0],context);
function fixture(initial=[]){
 const f={rows:structuredClone(initial),writes:[],account:'12345',failId:'',ignore:false,loseReply:false};
 f.fetch=async(url,options={})=>{
  const ok=data=>({ok:true,status:200,text:async()=>JSON.stringify({code:0,data})});
  if(url==='/api/user/info/v2')return ok({id:f.account});
  if(url.includes('/info/'))return ok({book_shelf_info:structuredClone(f.rows)});
  const body=JSON.parse(options.body);f.writes.push({url,body});
  if(url.includes('/add/')){for(const b of body.identify_data)if(!f.rows.some(r=>r.book_id===b.book_id))f.rows.push({book_id:b.book_id,book_type:0});return ok({});}
  const item=body.book_data[0];
  if(item.book_id===f.failId)return {ok:true,status:200,text:async()=>JSON.stringify({code:101,message:'模拟拒绝'})};
  if(!f.ignore){const book=f.rows.find(r=>r.book_id===item.book_id);book.group_id=item.group_id||'7888888888888888888';book.group_name=item.group_name;}
  if(f.loseReply){f.loseReply=false;throw Error('模拟响应丢失');}
  return ok({error_update_info:[]});
 };
 f.client=context.createOfficialShelfClient({fetchImpl:f.fetch,csrf:()=> 'test',delay:async()=>{}});return f;
}
const opts={accountId:'12345'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let n=0;n<120;n++){if(fn())return;await wait(20);}throw Error('Timed out');};
(async()=>{
 vm.runInContext(source.split('// HISTORY_CORE_BEGIN')[1].split('// HISTORY_CORE_END')[0],context);
 const state={},storage={all:async()=>state,get:async key=>state[key],set:async values=>Object.assign(state,values)};
 await context.historyOperation(storage,{action:'syncSave',accountId:'12345',id:'100001',status:'success',groupId:'7888888888888888888'});
 assert.equal((await context.historyOperation(storage,{action:'syncList',accountId:'67890'})).length,0,'account isolation');
 assert.equal((await context.historyOperation(storage,{action:'syncList',accountId:'12345'}))[0].groupId,'7888888888888888888');
 const parsed=context.parseOfficialJSON('{"group_id":7888888888888888888,"title":"数字7888888888888888888与\\\"引号","n":1.23}');
 assert.equal(parsed.group_id,'7888888888888888888');assert.equal(parsed.n,1.23);assert.match(parsed.title,/7888888888888888888/);
 const f=fixture();await f.client.syncOne('100001',opts);assert.equal(f.writes.length,2);assert.equal(f.rows[0].group_name,'待看');
 await f.client.syncOne('100001',opts);assert.equal(f.writes.length,2,'retry deduplicates verified book');
 await f.client.syncOne('100002',opts);assert.equal(f.writes.at(-1).body.book_data[0].group_id,'7888888888888888888','reuse exact existing group ID');
 const conflict=fixture([{book_id:'100001',group_id:'7999999999999999999',group_name:'原分组'}]);
 await assert.rejects(conflict.client.syncOne('100001',opts),/确认移动/);assert.equal(conflict.writes.length,0);
 await assert.rejects(conflict.client.syncOne('100001',{...opts,allowedGroup:'other'}),/确认移动/);
 await conflict.client.syncOne('100001',{...opts,allowedGroup:'7999999999999999999'});assert.equal(conflict.rows[0].group_name,'待看');
 const partial=fixture();partial.failId='100001';await assert.rejects(partial.client.syncOne('100001',opts),/模拟拒绝/);
 partial.failId='';await partial.client.syncOne('100001',opts);assert.equal(partial.writes.filter(w=>w.url.includes('/add/')).length,1,'partial retry does not add twice');
 const silent=fixture([{book_id:'100001'}]);silent.ignore=true;await assert.rejects(silent.client.syncOne('100001',opts),/尚未确认/);
 const lost=fixture([{book_id:'100001'}]);lost.loseReply=true;await assert.rejects(lost.client.syncOne('100001',opts),/响应丢失/);await lost.client.syncOne('100001',opts);assert.equal(lost.writes.length,1,'lost response reconciles without duplicate write');
 const switched=fixture();switched.account='67890';await assert.rejects(switched.client.syncOne('100001',opts),/账号已切换/);assert.equal(switched.writes.length,0);
 console.log('PASS official API: exact IDs, add/create/reuse, dedup, move approval, partial failure retry, readback verification, lost response, account switch');
 // Exercise the actual UI and persisted statuses with a fake official server.
 const server=fixture([{book_id:'200003',group_id:'7000000000000000001',group_name:'其他组'}]);server.failId='200002';
 const values={};for(const id of ['200001','200002','200003'])values['fq-choice-'+id]={id,title:'候选书'+id,author:'作者',state:'later',updatedAt:1};
 const queues=new Map();const locks={request(name,fn){const job=(queues.get(name)||Promise.resolve()).then(fn);queues.set(name,job.catch(()=>{}));return job;}};
 const windows=[];
 function page(){const dom=new JSDOM('<nav><div class="nav-item"><a href="/library">书库</a></div></nav>',{url:'https://fanqienovel.com/library',runScripts:'outside-only'});const w=dom.window;windows.push(w);w.fetch=server.fetch;w.navigator.locks=locks;w.document.cookie='passport_csrf_token=test';w.GM_getValue=(k,d)=>values[k]??d;w.GM_setValue=async(k,v)=>{values[k]=structuredClone(v);};w.GM_listValues=()=>Object.keys(values);w.GM_registerMenuCommand=()=>{};w.eval(source);return w;}
 try{
  const w=page();await until(()=>w.document.querySelector('#fq-drawer'));const sh=w.document.getElementById('fq-choice-host').shadowRoot;
  const nav=[...w.document.querySelectorAll('.nav-item a')].find(e=>e.textContent==='我的选书');nav.click();await until(()=>sh.getElementById('sync-message').textContent.includes('已核对'));
  assert.equal(sh.querySelectorAll('.candidate-check').length,3,'legacy later records appear as candidates');
  sh.getElementById('sync-select').click();sh.getElementById('sync-batch').click();await until(()=>!sh.getElementById('sync-review').hidden);
  assert.equal(server.writes.length,0,'conflict waits before any batch writes');
  sh.getElementById('sync-review').querySelectorAll('button')[1].click();assert.equal(server.writes.length,0,'cancel leaves official shelf intact');
  sh.getElementById('sync-batch').click();await until(()=>!sh.getElementById('sync-review').hidden);sh.getElementById('sync-review').querySelector('button').click();
  await until(()=>sh.getElementById('sync-message').textContent.includes('成功 2 本，失败 1 本'));
  assert.equal(values['fq-official-sync-12345-200001'].status,'success');assert.equal(values['fq-official-sync-12345-200002'].status,'failed');assert.equal(values['fq-choice-200001'].state,'later','sync keeps local candidate');
  server.failId='';sh.getElementById('sync-retry').click();await until(()=>values['fq-official-sync-12345-200002']?.status==='success');
  assert.equal(server.writes.filter(w=>w.url.includes('/add/')&&w.body.identify_data[0].book_id==='200002').length,1);
  const reloaded=page();await until(()=>reloaded.document.querySelector('#fq-drawer'));[...reloaded.document.querySelectorAll('.nav-item a')].find(e=>e.textContent==='我的选书').click();const sr=reloaded.document.getElementById('fq-choice-host').shadowRoot;await until(()=>sr.getElementById('sync-message').textContent.includes('已核对'));assert.equal(sr.querySelectorAll('.sync-state[data-status=success]').length,3,'persisted/remote statuses survive reload');
  // Concurrent tabs request the same newly added candidate; the lock + readback allow one write pair.
  values['fq-choice-200004']={id:'200004',title:'跨页候选',state:'later',updatedAt:2};w.dispatchEvent(new w.Event('focus'));reloaded.dispatchEvent(new reloaded.Event('focus'));await until(()=>sh.querySelectorAll('.sync-one').length===4&&sr.querySelectorAll('.sync-one').length===4);
  [...sh.querySelectorAll('#rows>div')].find(e=>e.textContent.includes('跨页候选')).querySelector('.sync-one').click();[...sr.querySelectorAll('#rows>div')].find(e=>e.textContent.includes('跨页候选')).querySelector('.sync-one').click();
  await until(()=>sh.getElementById('sync-message').textContent.includes('成功 1 本')&&sr.getElementById('sync-message').textContent.includes('成功 1 本'));
  assert.equal(server.writes.filter(w=>(w.body.book_data||w.body.identify_data)[0].book_id==='200004').length,2,'two tabs add/move once');
  console.log('PASS official UI: candidate compatibility, batch confirmation/cancel, mixed results, retry, durable statuses, cross-tab dedup, local data preservation');
 }finally{windows.forEach(w=>w.close());}
})().catch(error=>{console.error(error);process.exitCode=1;});

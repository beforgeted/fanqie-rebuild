import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),version=JSON.parse(await fs.readFile(path.join(root,'package.json'))).version;
const {puppeteer}=await import(pathToFileURL(path.join(root,'devtools-runtime/node_modules/chrome-devtools-mcp/build/src/third_party/index.js')).href);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fanqie-release-qa-')),report={version,scope:'Isolated profiles, historical builds, extracted ZIP, intercepted network only',cases:[]};console.log('验收资料：',temp);
const quote=s=>"'"+s.replaceAll("'","''")+"'",wait=ms=>new Promise(r=>setTimeout(r,ms));
const archive=path.join(root,'dist','番茄书库重构-v'+version+'-Chrome-Edge.zip'),unpacked=path.join(temp,'unpacked');
const digest=crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex');assert.ok((await fs.readFile(archive+'.sha256','utf8')).startsWith(digest));report.sha256=digest;
execFileSync('powershell.exe',['-NoProfile','-Command','Expand-Archive -LiteralPath '+quote(archive)+' -DestinationPath '+quote(unpacked)],{windowsHide:true});
const released=path.join(unpacked,'番茄书库重构-v'+version,'chrome-extension');
assert.deepEqual((await fs.readdir(released)).sort(),['manifest.json','content.js','background.js','history-core.js','LICENSE.txt','第三方来源与许可.md'].sort());
for(const file of await fs.readdir(released))assert.equal(await fs.readFile(path.join(released,file),'utf8'),await fs.readFile(path.join(root,'chrome-extension',file),'utf8'));
const marker='旧版本备注：希望升级后保留',seed={
 'fq-keyword-filter-v1':{words:['原神','崩铁'],enabled:true,abstract:true},'fq-infinite-enabled':true,
 'fq-choice-900001':{id:'900001',title:'旧候选',state:'later',note:marker,noteRevision:3,updatedAt:100},
 'fq-choice-900002':{id:'900002',title:'旧不想看',state:'skip',updatedAt:99},
 'fq-choice-900003':{id:'900003',title:'已移出但有备注',state:'none',note:'不能删除',noteRevision:1,updatedAt:98},
 'fq-history-book-900001':{id:'900001',title:'候选的屏蔽记录',matches:['原神'],firstSeen:1,lastSeen:2,handledAt:0},
 'fq-history-book-900003':{id:'900003',title:'备注的屏蔽记录',matches:['原神'],firstSeen:1,lastSeen:2,handledAt:0},
 'fq-history-book-900004':{id:'900004',title:'可清理旧记录',matches:['原神'],firstSeen:1,lastSeen:2,handledAt:1},
 'fq-official-sync-12345-900001':{id:'900001',status:'failed',message:'模拟上次失败',groupId:'',updatedAt:10}
};
const title=id=>id==='800001'?'完整流程冒险':id==='800002'?'原神衍生测试':'普通冒险'+id;
const summary=id=>'完整简介 '+title(id)+'\n少年踏上旅途，探索未知世界。'.repeat(24);
const card=id=>'<div class="stack-book-item"><div class="book-item-cover"><img src="https://fixture.invalid/cover.svg"></div><div class="book-item-text"><a class="book-item-title font-fKts9tCXDjS49UhH" href="/page/'+id+'">'+title(id)+'</a><div class="book-item-desc">作者：模拟作者</div><div class="book-item-desc">连载中 · 30万字</div><div class="book-item-abstract">列表简介</div><div class="book-item-footer">1小时前</div></div></div>';
const nav='<header class="muye-header"><nav><div class="nav-item"><a href="/">首页</a></div><div class="nav-item nav-item_active"><a href="/library">书库</a></div><div class="nav-item"><a href="/bookshelf">书架</a></div></nav></header>';
const css='<style>body{margin:0;font:16px/1.6 "Microsoft YaHei",sans-serif}.muye-header{position:fixed;top:0;height:76px;width:100%;background:white;z-index:30}.nav-item{display:inline-block;padding:16px 24px}.muye-library{padding-top:100px}.muye-stack{width:1120px;margin:auto}.muye-stack-book-list{display:flex;flex-wrap:wrap;gap:0}.stack-book-item{display:flex;width:360px;min-height:200px;margin:0 20px 35px 0}.stack-book-item:nth-child(3n){margin-right:0}.book-item-cover img{width:90px;height:120px}.book-item-text{width:250px;padding-left:10px}.book-item-abstract{max-height:48px;overflow:hidden}.page-header{padding:110px 60px 20px}.info{max-width:800px}a{color:inherit;text-decoration:none}</style>';
const library='<!doctype html><html lang="zh-CN"><meta charset="utf-8">'+css+nav+'<div class="muye-library"><main class="muye-stack"><div class="muye-stack-book-list">'+Array.from({length:18},(_,i)=>card(String(800001+i))).join('')+'</div><div class="muye-stack-pagination"></div></main></div></html>';
const detail=id=>'<!doctype html><html lang="zh-CN"><meta charset="utf-8">'+css+nav+'<div class="page-header"><div class="page-header-info"><div class="info"><h1 class="info-name">'+title(id)+'</h1><div class="author-name">模拟作者</div><div class="info-label"><span>连载中</span><span>冒险</span></div><div class="info-count">30万字</div><div class="info-last">最近更新</div><button class="info-btn">开始阅读</button><button class="add-bookshelf-btn">加入书架</button></div></div></div><div class="page-abstract-content">'+summary(id)+'</div></html>';
let edgePath=process.env.FQ_EDGE_PATH;if(!edgePath){const dir='C:/Program Files (x86)/Microsoft/Edge/Application';const versions=(await fs.readdir(dir)).filter(x=>/^\d+\.\d+\.\d+\.\d+$/.test(x)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));edgePath=path.join(dir,versions[0]||'','msedge.exe');}
async function launch(name,profile){
 if(name==='chrome')return puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,enableExtensions:true,userDataDir:profile,args:['--no-first-run','--no-default-browser-check']});
 const args=['--remote-debugging-port=0','--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','"--user-data-dir='+profile+'"','about:blank'];
 // A stale port file from the preceding clean shutdown must not be reused.
 await fs.unlink(path.join(profile,'DevToolsActivePort')).catch(()=>{});
 execFileSync('powershell.exe',['-NoProfile','-Command','Start-Process -WindowStyle Hidden -FilePath '+quote(edgePath)+' -ArgumentList '+args.map(quote).join(',')],{windowsHide:true});
 for(let i=0;i<150;i++){try{const [port,url]=String(await fs.readFile(path.join(profile,'DevToolsActivePort'))).trim().split(/\r?\n/);return await puppeteer.connect({browserWSEndpoint:'ws://127.0.0.1:'+port+url});}catch{await wait(100);}}throw Error('Edge 启动超时');
}
async function getWorker(browser,id){return (await browser.waitForTarget(t=>t.type()==='service_worker'&&t.url().startsWith('chrome-extension://'+id),{timeout:20000})).worker();}
async function interceptedPage(browser,server){
 const page=await browser.newPage();page.setDefaultTimeout(12000);await page.setViewport({width:1366,height:768});await page.setRequestInterception(true);
 page.on('request',async req=>{try{
  const url=new URL(req.url()),json=data=>req.respond({status:200,contentType:'application/json',body:JSON.stringify({code:0,data})});
  if(url.pathname.startsWith('/page/'))return req.respond({status:200,contentType:'text/html;charset=utf-8',body:detail(url.pathname.split('/')[2])});
  if(req.isNavigationRequest())return req.respond({status:200,contentType:'text/html;charset=utf-8',body:url.pathname==='/bookshelf'?'<!doctype html>'+css+nav+'<main></main>':library});
  if(url.pathname==='/api/user/info/v2')return json({id:'12345'});
  if(url.pathname.includes('/bookshelf/info/'))return json({book_shelf_info:server.rows});
  if(url.pathname.includes('/bookshelf/add/')){const body=JSON.parse(req.postData());server.writes.push({kind:'add',body});for(const book of body.identify_data)if(!server.rows.some(r=>r.book_id===book.book_id))server.rows.push({book_id:book.book_id,book_type:0});return json({});}
  if(url.pathname.includes('/bookshelf/update/')){const body=JSON.parse(req.postData());server.writes.push({kind:'move',body});if(server.failMove){server.failMove=false;return req.respond({status:503,body:'模拟分组请求失败'});}const item=body.book_data[0],row=server.rows.find(r=>r.book_id===item.book_id);Object.assign(row,{group_id:item.group_id||'7888888888888888888',group_name:item.group_name});return json({error_update_info:[]});}
  if(url.pathname.includes('/library/book_list/'))return json({book_list:Array.from({length:18},(_,i)=>({book_id:String(800019+i),book_name:title(String(800019+i)),author:'模拟作者',abstract:'分页简介',word_count:'30万字',creation_status:1})),has_more:false});
  if(url.pathname.endsWith('cover.svg'))return req.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="#897a63"/></svg>'});
  return req.respond({status:404,body:'Blocked by isolated release test'});
 }catch(error){console.error('Fixture error',error);await req.abort().catch(()=>{});}});
 return page;
}
const host=(name)=>({'choice':'fq-choice-host','rules':'fq-keyword-filter-host','intro':'fq-intro-host'}[name]);
async function click(page,name,id){await page.evaluate((h,id)=>document.getElementById(h).shadowRoot.getElementById(id).click(),host(name),id);}
async function textWait(page,name,id,part){await page.waitForFunction((h,id,part)=>document.getElementById(h)?.shadowRoot.getElementById(id)?.textContent&&(part==='完整简介'?document.getElementById(h).shadowRoot.getElementById(id).textContent===part:document.getElementById(h).shadowRoot.getElementById(id).textContent.includes(part)),{},host(name),id,part);}
async function storage(worker){return worker.evaluate(()=>chrome.storage.local.get(null));}
async function verifyFlow(browser,worker,result){
 const server={rows:[],writes:[],failMove:true},p=await interceptedPage(browser,server);
 await p.setCookie({name:'passport_csrf_token',value:'simulated-test-token',domain:'fanqienovel.com',path:'/'});
 await p.goto('https://fanqienovel.com/library?sort=hottes',{waitUntil:'domcontentloaded'});await p.waitForSelector('.fq-intro-hitarea');
 await p.waitForFunction(()=>document.querySelector('a[href="/page/800002"]').closest('.stack-book-item').getAttribute('data-fq-keyword-blocked')==='hide');
 await p.waitForFunction(()=>document.querySelector('.fq-stream-controls button:last-child'));
 await p.evaluate(()=>{document.querySelector('.fq-stream-controls button').click();document.querySelector('.fq-stream-controls button:last-child').click();});
 await p.waitForFunction(()=>document.querySelector('[data-fq-stream]')?.children.length===36);
 console.log('Pagination appended');const unique=await p.evaluate(()=>new Set([...document.querySelectorAll('[data-fq-stream] .book-item-title')].map(a=>a.href)).size);assert.equal(unique,36);
 await p.evaluate(()=>{scrollTo(0,0);window.__libraryNode=document.querySelector('[data-fq-stream]');window.__libraryURL=location.href;window.__libraryY=scrollY;document.querySelector('[data-fq-stream] a[href="/page/800001"]').closest('.stack-book-item').querySelector('.fq-intro-hitarea').click();});
 await textWait(p,'intro','status-text','完整简介');await click(p,'intro','later');await textWait(p,'intro','status-text','已加入候选');await click(p,'intro','close');
 await p.evaluate(()=>document.querySelector('#fq-selection-nav a').click());await p.waitForFunction(()=>document.body.hasAttribute('data-fq-selection-page'));
 await p.waitForFunction(()=>document.getElementById('fq-choice-host').shadowRoot.querySelector('[data-id="800001"] .review-open'));
 await p.evaluate(()=>document.getElementById('fq-choice-host').shadowRoot.querySelector('[data-id="800001"] .review-open').click());await textWait(p,'choice','review-load','完整简介');
 await click(p,'choice','note-toggle');await p.evaluate(()=>{const e=document.getElementById('fq-choice-host').shadowRoot.getElementById('note-input');e.value='完整流程备注';e.dispatchEvent(new Event('input',{bubbles:true}));});await click(p,'choice','note-save');await textWait(p,'choice','note-message','已保存');
 await textWait(p,'choice','sync-message','已核对');assert.equal(server.writes.length,0);
 await click(p,'choice','review-sync');await textWait(p,'choice','sync-message','失败 1 本');await click(p,'choice','sync-retry');await textWait(p,'choice','sync-message','成功 2 本，失败 0 本');
 assert.equal(server.rows.find(r=>r.book_id==='800001').group_name,'待看');assert.equal(server.writes.filter(w=>w.kind==='add'&&w.body.identify_data[0].book_id==='800001').length,1);assert.equal(server.writes.filter(w=>w.kind==='move'&&w.body.book_data[0].book_id==='800001').length,2);
 console.log('Candidate/note/official retry passed');await p.screenshot({path:path.join(temp,result.browser+'-'+result.from+'-candidate.png')});
 // Unsaved draft and active reader survive data-management round trips.
 await p.evaluate(()=>{const s=document.getElementById('fq-choice-host').shadowRoot;s.getElementById('note-input').value='未保存草稿';s.getElementById('note-input').dispatchEvent(new Event('input',{bubbles:true}));s.getElementById('rows').scrollTop=50;window.__reviewTop=s.getElementById('rows').scrollTop;document.querySelector('#fq-data-management').click();});
 await p.waitForFunction(()=>!document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('backup-view').hidden);
 await p.evaluate(()=>document.querySelector('#fq-drawer-tabs [data-tab="later"]').click());
 assert.deepEqual(await p.evaluate(()=>{const s=document.getElementById('fq-choice-host').shadowRoot;return [s.getElementById('note-input').value,s.getElementById('rows').scrollTop===window.__reviewTop];}),['未保存草稿',true]);
 // Sizes exercise the actual rendered footer; no forced clicks through clipped controls.
 result.viewports=[];for(const [width,height]of [[1366,768],[1280,720],[1024,768]]){await p.setViewport({width,height});await wait(80);const rects=await p.evaluate(()=>{const s=document.getElementById('fq-choice-host').shadowRoot;return ['review-text','review-sync','review-next'].map(id=>{const r=s.getElementById(id).getBoundingClientRect();return {id,left:r.left,top:r.top,right:r.right,bottom:r.bottom,height:r.height};});});for(const r of rects){assert.ok(r.height>0&&r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=height,JSON.stringify({width,height,r}));}result.viewports.push([width,height]);}
 await p.setViewport({width:1366,height:768});await p.evaluate(()=>document.querySelector('a[href="/library"]').click());await p.waitForFunction(()=>!document.body.hasAttribute('data-fq-selection-page'));
 assert.equal(await p.evaluate(()=>window.__libraryNode===document.querySelector('[data-fq-stream]')&&window.__libraryURL===location.href&&window.__libraryY===scrollY),true);
 // Detail-page choice propagates into the retained library in the other tab.
 const detailPage=await interceptedPage(browser,server);await detailPage.goto('https://fanqienovel.com/page/800003',{waitUntil:'domcontentloaded'});await detailPage.waitForSelector('.fq-detail-choices [data-choice="skip"]');await detailPage.click('.fq-detail-choices [data-choice="skip"]');await p.bringToFront();
 await p.waitForFunction(()=>document.querySelector('[data-fq-stream] a[href="/page/800003"]').closest('.stack-book-item').getAttribute('data-fq-keyword-blocked')==='hide');await detailPage.close();
 // Real downloads -> explicit acknowledgement -> clean only old automatic records -> real file import restore.
 await p.evaluate(()=>document.querySelector('#fq-selection-nav a').click());await p.waitForFunction(()=>document.body.hasAttribute('data-fq-selection-page'));await p.evaluate(()=>document.querySelector('#fq-data-management').click());
 const out=path.join(temp,result.browser+'-'+result.from+'-downloads');await fs.mkdir(out);const cdp=await browser.target().createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
 await click(p,'rules','cleanup-preview');await p.waitForFunction(()=>!document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('cleanup-confirm').hidden);
 assert.ok((await storage(worker))['fq-history-book-900004']);
 const links=await p.evaluate(()=>document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('cleanup-downloads').children.length);
 for(let i=0;i<links;i++){await p.evaluate(i=>document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('cleanup-downloads').children[i].click(),i);for(let n=0;n<100;n++){if((await fs.readdir(out)).filter(f=>f.endsWith('.json')).length>i)break;await wait(50);}}
 const files=(await fs.readdir(out)).filter(f=>f.endsWith('.json'));assert.equal(files.length,links);
 await p.evaluate(()=>{const s=document.getElementById('fq-keyword-filter-host').shadowRoot;const e=s.getElementById('cleanup-ack');e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));});await click(p,'rules','cleanup-confirm');await textWait(p,'rules','cleanup-status','已清理 1 条');
 const cleaned=await storage(worker);assert.equal(cleaned['fq-history-book-900004'],undefined);assert.ok(cleaned['fq-history-book-900001']);assert.ok(cleaned['fq-history-book-900003']);assert.equal(cleaned['fq-choice-900001'].note,marker);assert.equal(cleaned['fq-choice-800001'].note,'完整流程备注');
 for(const file of files){const input=await p.evaluateHandle(()=>document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('backup-file'));await input.asElement().uploadFile(path.join(out,file));await textWait(p,'rules','backup-status','导入完成');}
 assert.ok((await storage(worker))['fq-history-book-900004']);await p.screenshot({path:path.join(temp,result.browser+'-'+result.from+'-management.png')});
 result.flow={appendUnique:unique,keywordHidden:true,introCandidateNote:true,officialRetryDeduplicated:true,managementDraftRetained:true,nativeDOMRetained:true,detailCrossTab:true,cleanupDownloadRestore:true};await p.close();
}
try{
 for(const name of ['chrome','edge'])for(const [from,ref]of [['1.11.0','2c9383f'],['1.13.7','50703de']]){
  const initial=structuredClone(seed);if(from==='1.13.7')initial['fq-keyword-filter-v1']={schema:2,revision:4,activeId:'anime',profiles:[{id:'anime',name:'动漫衍生',enabled:true,abstract:true,groups:[{id:'games',name:'二游',enabled:true,words:['原神','崩铁']},{id:'paused',name:'停用词组',enabled:false,words:['普通冒险']}]},{id:'other',name:'备用方案',enabled:false,abstract:false,groups:[{id:'g',name:'其他',enabled:true,words:['其他词']}]}]};
  const result={browser:name,from,to:version,settings:from==='1.11.0'?'legacy words':'multiple profiles and disabled group'},folder=path.join(temp,name+'-'+from),profile=path.join(folder,'profile'),install=path.join(folder,'installation');await fs.mkdir(install,{recursive:true});
  const oldTar=path.join(folder,'old.tar');execFileSync('git',['archive','--format=tar','--output='+oldTar,ref,'chrome-extension'],{cwd:root});execFileSync('tar.exe',['-xf',oldTar,'-C',install]);const extension=path.join(install,'chrome-extension');
  console.log('START',name,from);let browser=await launch(name,profile);try{
   const setup=await browser.newPage();await setup.goto(name==='edge'?'edge://extensions/':'chrome://extensions/');await setup.evaluate(()=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true}));await setup.close();
   const id=await browser.installExtension(extension);console.log('Installed historical build',id);let worker=await getWorker(browser,id);assert.equal(await worker.evaluate(()=>chrome.runtime.getManifest().version),from);await worker.evaluate(seed=>chrome.storage.local.set(seed),initial);
   // Historical code must read the seeded records, not just hold opaque bytes.
   const historical=await worker.evaluate(()=>historyOperation(historyStorage,{action:'choices'}));assert.equal(historical.find(r=>r.id==='900001').note,marker);
   // Match the documented update: replace files in place, then invoke the browser's Reload action.
   await fs.cp(released,extension,{recursive:true,force:true});
   const manager=await browser.newPage();await manager.goto(name==='edge'?'edge://extensions/':'chrome://extensions/');
   assert.equal(await manager.evaluate(()=>typeof chrome.developerPrivate?.reload),'function');await manager.evaluate(()=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true}));
   await manager.evaluate(id=>chrome.developerPrivate.reload(id),id);await manager.waitForFunction(async(id,version)=>{const info=(await chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true})).find(r=>r.id===id);return info?.state==='ENABLED'&&info.version===version&&!info.manifestErrors.length&&!info.runtimeErrors.length;},{timeout:20000},id,version);await manager.close();
   await wait(800);console.log('Reload requested, restarting browser');await browser.close();browser=await launch(name,profile);
   const resumedId=await browser.installExtension(extension);assert.equal(resumedId,id);
   const activation=await interceptedPage(browser,{rows:[],writes:[]});await activation.goto('https://fanqienovel.com/bookshelf',{waitUntil:'domcontentloaded'});await activation.waitForSelector('#fq-selection-nav');
   worker=await getWorker(browser,id);assert.equal(await worker.evaluate(()=>typeof cleanupOperation),'function');
   assert.equal(await worker.evaluate(()=>chrome.runtime.getManifest().version),version);assert.deepEqual(await storage(worker),initial);await activation.close();
   result.sameId=id;result.inPlaceReload=true;result.restartRetained=true;result.engine=await browser.version();
   console.log('Restart retained storage; starting flow');try{await verifyFlow(browser,worker,result);}catch(error){console.log('FLOW FAILED',error.message);for(const p of await browser.pages())if(p.url().includes('fanqie')){console.log(await p.evaluate(()=>({url:location.href,intro:document.getElementById('fq-intro-host')?.shadowRoot.getElementById('status-text')?.textContent,sync:document.getElementById('fq-choice-host')?.shadowRoot.getElementById('sync-message')?.textContent,backup:document.getElementById('fq-keyword-filter-host')?.shadowRoot.getElementById('backup-status')?.textContent})));await p.bringToFront();await p.screenshot({path:path.join(temp,'failure.png'),waitForFonts:false,timeout:5000}).catch(()=>{});}throw error;}report.cases.push(result);console.log('PASS',name,from,'原位升级、重启、完整流程、清理备份恢复');
  }finally{await browser.close();}
 }
 report.fresh=[];
 for(const name of ['chrome','edge']){const browser=await launch(name,path.join(temp,'fresh-'+name));try{const id=await browser.installExtension(released),worker=await getWorker(browser,id);assert.deepEqual(await storage(worker),{});const page=await interceptedPage(browser,{rows:[],writes:[]});await page.goto('https://fanqienovel.com/bookshelf');await page.waitForSelector('#fq-selection-nav');await page.evaluate(()=>document.querySelector('#fq-selection-nav a').click());await page.waitForFunction(()=>document.body.hasAttribute('data-fq-selection-page'));report.fresh.push({browser:name,emptyStorageBeforePage:true,selectionInitialized:true});console.log('PASS',name,'安装包全新安装');}finally{await browser.close();}}
 report.passed=true;
}finally{await fs.mkdir(path.join(root,'.local'),{recursive:true});await fs.writeFile(path.join(root,'.local','release-qa.json'),JSON.stringify({...report,artifacts:temp},null,2));}

import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));const {puppeteer}=await import(pathToFileURL(path.join(root,'devtools-runtime/node_modules/chrome-devtools-mcp/build/src/third_party/index.js')).href);
const wait=ms=>new Promise(r=>setTimeout(r,ms));const browsers=[];const artifacts=await fs.mkdtemp(path.join(os.tmpdir(),'fanqie-migration-qa-'));console.log('Test artifacts:',artifacts);
const card='<main class="muye-stack-book-list"><div class="stack-book-item"><div class="book-item-text"><a class="book-item-title" href="/page/123456">普通冒险</a><div class="book-item-abstract">测试简介</div></div></div></main>';
async function start(name,executablePath){
 const profile=path.join(artifacts,name);let browser;
 if(name==='edge'){
   const quote=s=>"'"+s.replaceAll("'","''")+"'";
   const argList=['--remote-debugging-port=0','--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','"--user-data-dir='+profile+'"','about:blank'];
   execFileSync('powershell.exe',['-NoProfile','-Command','Start-Process -WindowStyle Hidden -FilePath '+quote(executablePath)+' -ArgumentList '+argList.map(quote).join(',')],{windowsHide:true});
   let address;for(let i=0;i<100;i++){try{const [port,url]=String(await fs.readFile(path.join(profile,'DevToolsActivePort'))).trim().split(/\r?\n/);address='ws://127.0.0.1:'+port+url;break;}catch{await wait(100);}}
   if(!address)throw Error('Edge hidden-window launch did not expose debugging endpoint');browser=await puppeteer.connect({browserWSEndpoint:address});
 }else browser=await puppeteer.launch({executablePath,headless:true,pipe:false,enableExtensions:true,userDataDir:profile,args:['--no-first-run','--no-default-browser-check']});browsers.push(browser);
 const id=await browser.installExtension(path.join(root,'chrome-extension'));const target=await browser.waitForTarget(t=>t.type()==='service_worker'&&t.url().startsWith('chrome-extension://'+id),{timeout:15000}),worker=await target.worker();
 const page=await browser.newPage();await page.setViewport({width:1366,height:768});await page.setRequestInterception(true);page.on('request',req=>{if(req.isNavigationRequest())req.respond({status:200,contentType:'text/html;charset=utf-8',body:'<html><body><nav><div class="nav-item"><a href="/library">书库</a></div></nav>'+card+'</body></html>'});else req.respond({status:200,contentType:'application/json',body:'{"code":1,"message":"测试环境未登录"}'});});
 const out=path.join(artifacts,name+'-downloads');await fs.mkdir(out);const cdp=await browser.target().createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
 const item={name,browser,worker,page,out};await reload(item);console.log(name,await browser.version(),'extension loaded',id);return item;
}
async function reload(item){await item.page.goto('https://fanqienovel.com/library?fq_view=selection#backup',{waitUntil:'domcontentloaded'});await item.page.waitForFunction(()=>document.getElementById('fq-filter-bar')?.shadowRoot.getElementById('backup-entry'));await item.page.evaluate(()=>document.getElementById('fq-filter-bar').shadowRoot.getElementById('backup-entry').click());}
async function exportFile(item){await item.page.evaluate(()=>document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('backup-export').click());for(let i=0;i<100;i++){const files=(await fs.readdir(item.out)).filter(f=>f.endsWith('.json'));if(files.length)return path.join(item.out,files[0]);await wait(100);}throw Error('download timed out');}
async function importDrop(item,file){const text=await fs.readFile(file,'utf8');await item.page.evaluate(text=>{const s=document.getElementById('fq-keyword-filter-host').shadowRoot;const dt=new DataTransfer();dt.items.add(new File([text],'配置.json',{type:'application/json'}));s.getElementById('backup-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));},text);await item.page.waitForFunction(()=>/导入完成|无需重复/.test(document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('backup-status').textContent));}
async function verifyNavigation(item){
 const p=item.page;await p.goto('https://fanqienovel.com/library?navigation-test',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('#fq-selection-nav a'));
 await p.evaluate(()=>{document.querySelector('main').style.minHeight='2600px';document.querySelector('nav').style.cssText='position:fixed;top:0;z-index:1000;background:white';window.__qaNode=document.querySelector('main');scrollTo(0,700);});
 await p.evaluate(()=>document.querySelector('#fq-selection-nav a').click());await p.waitForFunction(()=>document.body.hasAttribute('data-fq-selection-page'));
 assert.equal(await p.evaluate(()=>location.hash),'#fq-selection/later');
 await p.evaluate(()=>document.querySelector('a[href="/library"]').click());await p.waitForFunction(()=>!document.body.hasAttribute('data-fq-selection-page')&&scrollY===700);
 assert.equal(await p.evaluate(()=>window.__qaNode===document.querySelector('main')),true);
 await p.evaluate(()=>history.back());await p.waitForFunction(()=>document.body.hasAttribute('data-fq-selection-page'));
 await p.evaluate(()=>history.back());await p.waitForFunction(()=>!document.body.hasAttribute('data-fq-selection-page')&&scrollY===700);
 assert.equal(await p.evaluate(()=>window.__qaNode===document.querySelector('main')),true);
 console.log('PASS',item.name,'same-tab navigation, same DOM, back and scroll restoration');await reload(item);
}

try{
 const chrome=await start('chrome','C:/Program Files/Google/Chrome/Application/chrome.exe');await verifyNavigation(chrome);
 await chrome.worker.evaluate(async()=>{await chrome.storage.local.set({'fq-keyword-filter-v1':{words:['原神','崩铁'],enabled:true,abstract:false},'fq-infinite-enabled':false,'fq-choice-123456':{id:'123456',title:'跨浏览器测试书',state:'later',note:'保留我的备注',noteRevision:1,updatedAt:100},'fq-history-book-345678':{id:'345678',title:'测试屏蔽书',author:'测试',matches:['原神'],firstSeen:1,lastSeen:2,handledAt:3}});});await reload(chrome);
 const chromeFile=await exportFile(chrome);assert.equal(JSON.parse(await fs.readFile(chromeFile,'utf8')).data.choices[0].note,'保留我的备注');
 const edgeRoot='C:/Program Files (x86)/Microsoft/Edge/Application';const edgeVersions=(await fs.readdir(edgeRoot)).filter(n=>/^\d+\.\d+\.\d+\.\d+$/.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 const edge=await start('edge',process.env.FQ_EDGE_PATH||path.join(edgeRoot,edgeVersions[0]||'', 'msedge.exe'));await verifyNavigation(edge);await importDrop(edge,chromeFile);
 const edgeData=await edge.worker.evaluate(()=>chrome.storage.local.get(null));assert.equal(edgeData['fq-choice-123456'].note,'保留我的备注');assert.equal(edgeData['fq-keyword-filter-v1'].words.length,2);assert.equal(edgeData['fq-infinite-enabled'],false);await importDrop(edge,chromeFile);
 await edge.page.screenshot({path:path.join(artifacts,'edge-import.png')});
 const edgeFile=await exportFile(edge);await chrome.worker.evaluate(()=>chrome.storage.local.clear());await reload(chrome);
 const input=await chrome.page.evaluateHandle(()=>document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('backup-file'));await input.asElement().uploadFile(edgeFile);
 await chrome.page.waitForFunction(()=>document.getElementById('fq-keyword-filter-host').shadowRoot.getElementById('backup-status').textContent.includes('导入完成'));
 const restored=await chrome.worker.evaluate(()=>chrome.storage.local.get(null));assert.equal(restored['fq-choice-123456'].note,'保留我的备注');assert.equal(restored['fq-history-book-345678'].handledAt,3);
 await chrome.page.screenshot({path:path.join(artifacts,'chrome-import.png')});console.log('PASS real Chrome -> Edge drag/drop -> Edge export -> Chrome file picker; data, notes, history and settings restored. No official account/network writes.');
}finally{await Promise.allSettled(browsers.map(b=>b.close()));}

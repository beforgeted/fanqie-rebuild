const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const clone=x=>JSON.parse(JSON.stringify(x)),wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await wait(20);}throw Error('等待超时');};
function backend(initial={}){
 const values=clone(initial);let listener,fail=false;const watches=[];
 const storage={async get(k){return clone(k===null?values:typeof k==='string'?{[k]:values[k]}:Object.fromEntries(k.filter(x=>values[x]!==undefined).map(x=>[x,values[x]])));},async set(patch){if(fail)throw Error('测试存储失败');const changes={};for(const [k,v]of Object.entries(patch)){changes[k]={oldValue:values[k],newValue:clone(v)};values[k]=clone(v);}for(const fn of watches)fn(changes,'local');}};
 const context=vm.createContext({URL,chrome:{runtime:{id:'test',onMessage:{addListener:f=>listener=f}},storage:{local:storage}}});context.importScripts=f=>vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname,'../..')+'/chrome-extension/'+f,'utf8'),context);vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname,'../..')+'/src/platform/chrome/background.js','utf8'),context);
 return {values,storage,watches,context,set fail(v){fail=v;},send:message=>new Promise(resolve=>listener({channel:'fq-filter-history',...message},{id:'test',url:'https://fanqienovel.com/library'},resolve))};
}
const key='fq-keyword-filter-v1',choice={id:'123456',title:'迁移测试书',author:'作者',state:'later',note:'想看设定',noteRevision:3,updatedAt:100,noteUpdatedAt:90};
const source=backend({[key]:{words:['原神','崩铁'],enabled:true,abstract:false},'fq-infinite-enabled':false,'fq-choice-123456':choice,'fq-history-book-345678':{id:'345678',title:'屏蔽测试',author:'作者',matches:['原神'],firstSeen:20,lastSeen:30,handledAt:40},'fq-official-sync-777-123456':{id:'123456',status:'success',groupId:'666'},cookie:'secret',accountToken:'secret'});
const windows=[];
(async()=>{
 const exported=await source.send({action:'backupExport'});assert.equal(exported.ok,true);const pack=exported.result;
 assert.equal(pack.version,1);assert.equal(pack.data.choices[0].note,choice.note);assert.equal(pack.data.settings.profiles[0].name,'默认方案');assert.ok(!JSON.stringify(pack).includes('secret'));assert.ok(!JSON.stringify(pack).includes('groupId'));assert.ok(!JSON.stringify(pack).includes('noteRevision'));
 const target=backend();let result=await target.send({action:'backupImport',pack});assert.equal(result.result.ok,true);
 assert.equal(target.values[key].words.length,2);assert.equal(target.values['fq-infinite-enabled'],false);assert.equal(target.values['fq-choice-123456'].note,'想看设定');assert.equal(target.values['fq-history-book-345678'].handledAt,40);assert.ok(!Object.keys(target.values).some(k=>k.startsWith('fq-official-sync-')));
 const after=clone(target.values);result=await target.send({action:'backupImport',pack});assert.equal(result.result.changed,0);assert.deepEqual(target.values,after,'re-import is idempotent');
 // Unknown credentials and official records are discarded, never imported as storage keys.
 const extra=clone(pack);extra.data.cookie='leak';extra.data.choices[0].officialStatus='success';extra.data.officialSync=[{id:'123456',status:'success'}];await target.send({action:'backupImport',pack:extra});assert.deepEqual(target.values,after);
 const invalid=clone(pack);invalid.data.choices[0].id=123456;result=await target.send({action:'backupImport',pack:invalid});assert.equal(result.ok,false);assert.deepEqual(target.values,after);
 for(const mutate of [p=>p.version=99,p=>p.data.settings.profiles=[],p=>p.data.choices[0].cover='javascript:alert(1)',p=>p.data.choices.push(clone(p.data.choices[0]))]){const bad=clone(pack);mutate(bad);assert.equal((await target.send({action:'backupImport',pack:bad})).ok,false);assert.deepEqual(target.values,after);}
 target.values['fq-choice-123456'].state='skip';target.values['fq-choice-123456'].note='本机备注';target.values[key].profiles[0].groups[0].words.push('鸣潮');target.values['fq-infinite-enabled']=true;
 const conflictBefore=clone(target.values);result=await target.send({action:'backupImport',pack});assert.equal(result.result.needsChoice,true);assert.equal(result.result.conflicts.length,3);assert.deepEqual(target.values,conflictBefore,'no writes before all conflicts resolved');
 let decisions=Object.fromEntries(result.result.conflicts.map(c=>[c.key,{signature:c.signature,choice:c.kind==='profile'?'both':'file'}]));
 // Another tab changes a note during preview: require a fresh decision instead of overwriting it.
 target.values['fq-choice-123456'].note='预览后的新备注';result=await target.send({action:'backupImport',pack,decisions});assert.equal(result.result.needsChoice,true);assert.equal(result.result.conflicts.length,1);assert.equal(target.values[key].profiles.length,1);
 for(const c of result.result.conflicts)decisions[c.key]={signature:c.signature,choice:'file'};
 target.fail=true;const failBefore=clone(target.values);result=await target.send({action:'backupImport',pack,decisions});assert.equal(result.ok,false);assert.deepEqual(target.values,failBefore);target.fail=false;
 result=await target.send({action:'backupImport',pack,decisions});assert.equal(result.result.ok,true);assert.equal(target.values[key].profiles.length,2);assert.equal(target.values['fq-choice-123456'].state,'later');assert.equal(target.values['fq-choice-123456'].note,choice.note);assert.ok(target.values['fq-choice-123456'].noteRevision>failBefore['fq-choice-123456'].noteRevision);assert.ok(target.values[key].profiles.some(p=>p.name.includes('导入')));
 result=await target.send({action:'backupImport',pack});assert.equal(result.result.changed,0,'previously imported second copy is deduplicated');
 const emptied=clone(pack);emptied.data.choices[0].note='';emptied.data.choices[0].noteUpdatedAt=200;result=await target.send({action:'backupImport',pack:emptied});assert.equal(result.result.needsChoice,true);const noteDecisions=Object.fromEntries(result.result.conflicts.map(c=>[c.key,{signature:c.signature,choice:'file'}]));await target.send({action:'backupImport',pack:emptied,decisions:noteDecisions});assert.equal(target.values['fq-choice-123456'].note,'','explicit file choice can restore an intentionally empty note');
 // History merge keeps earliest discovery, latest encounters and manual handled progress.
 const historyPack=clone(pack);historyPack.data.history[0].firstSeen=10;historyPack.data.history[0].lastSeen=100;historyPack.data.history[0].handledAt=0;historyPack.data.history[0].matches.push('崩铁');
 const historyTarget=backend(after);await historyTarget.send({action:'backupImport',pack:historyPack});assert.deepEqual(historyTarget.values['fq-history-book-345678'].matches,['原神','崩铁']);assert.equal(historyTarget.values['fq-history-book-345678'].handledAt,40);assert.equal(historyTarget.values['fq-history-book-345678'].firstSeen,10);
 // Actual UI drop and file-picker handlers run against the real background core.
 const uiStore=backend(),dom=new JSDOM('<nav><div class="nav-item"><a href="/library">书库</a></div></nav><main></main>',{url:'https://fanqienovel.com/library',runScripts:'outside-only'}),w=dom.window;windows.push(w);
 w.chrome={runtime:{sendMessage:uiStore.send},storage:{local:uiStore.storage,onChanged:{addListener:f=>uiStore.watches.push(f)}}};w.Blob=Blob;w.URL.createObjectURL=blob=>{w.exportBlob=blob;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};w.fetch=async()=>{throw Error('禁止网络');};w.eval(fs.readFileSync(require('node:path').resolve(__dirname,'../..')+'/chrome-extension/content.js','utf8'));
 await until(()=>w.document.getElementById('fq-drawer'));const s=w.document.getElementById('fq-keyword-filter-host').shadowRoot,bar=w.document.getElementById('fq-filter-bar').shadowRoot;
 bar.getElementById('backup-entry').click();assert.equal(s.getElementById('backup-view').hidden,false);assert.equal(s.getElementById('settings-view').hidden,true);
 const drop=text=>{const e=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:{files:[{size:text.length,text:async()=>text}],types:['Files']}});s.getElementById('backup-drop').dispatchEvent(e);assert.ok(e.defaultPrevented);};
 drop('wrong');await until(()=>s.getElementById('backup-status').textContent.includes('无法导入'));assert.equal(uiStore.values[key],undefined);
 drop(JSON.stringify(pack));await until(()=>s.getElementById('backup-status').textContent.includes('导入完成'));assert.equal(uiStore.values['fq-choice-123456'].note,choice.note);
 await s.getElementById('backup-export').onclick();assert.equal(JSON.parse(await w.exportBlob.text()).data.choices[0].note,choice.note);
 const modified=clone(pack);modified.data.choices[0].note='备份新备注';drop(JSON.stringify(modified));await until(()=>!s.getElementById('backup-conflicts').hidden);s.getElementById('backup-cancel').click();assert.equal(uiStore.values['fq-choice-123456'].note,choice.note);
 drop(JSON.stringify(modified));await until(()=>!s.getElementById('backup-conflicts').hidden);s.getElementById('backup-all-file').click();await s.getElementById('backup-confirm').onclick();assert.equal(uiStore.values['fq-choice-123456'].note,'备份新备注');
 console.log('PASS backup: portable roundtrip, whitelist, validation, idempotency, profile-copy dedup, conflict choices/races, atomic failure, history merge, drag/drop, export and cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>windows.forEach(w=>w.close()));

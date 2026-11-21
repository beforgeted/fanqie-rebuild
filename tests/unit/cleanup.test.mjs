import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupPreview,cleanupOperation} from '../../src/core/cleanup.mjs';
import {backupParts,backupPlan} from '../../src/core/backup.mjs';
test('清理保护候选、不想看、移出候选的备注与规则，重验变化，失败可重试',async()=>{
 const all={};for(let i=10000;i<10008;i++)all['fq-history-book-'+i]={id:String(i),title:'书'+i,matches:['原神'],firstSeen:1,lastSeen:1,handledAt:0};
 all['fq-choice-10000']={id:'10000',title:'候选',state:'later'};
 all['fq-choice-10001']={id:'10001',title:'不想看',state:'skip'};
 all['fq-choice-10002']={id:'10002',title:'旧备注',state:'none',note:'保留我'};
 all['fq-history-book-10007'].lastSeen=0;
 const before=structuredClone(all),plan=cleanupPreview(all,{days:90});assert.equal(plan.protectedCount,3);assert.equal(plan.rows.length,4);
 const packs=backupParts(all);all['fq-choice-10003']={state:'later'};all['fq-history-book-10004'].lastSeen=Date.now();
 let fail=true;const storage={atomicBackup:true,all:async()=>all,remove:async key=>{if(key.endsWith('10005')&&fail)throw Error('disk');delete all[key];}};
 const result=await cleanupOperation(storage,{action:'cleanupCommit',...plan});assert.deepEqual(result,{removed:1,skipped:2,failed:1});
 for(const id of ['10000','10001','10002','10003','10004','10005','10007'])assert.ok(all['fq-history-book-'+id]);
 for(const id of ['10000','10001','10002'])assert.deepEqual(all['fq-choice-'+id],before['fq-choice-'+id]);
 fail=false;assert.deepEqual(await cleanupOperation(storage,{action:'cleanupCommit',...plan}),{removed:1,skipped:3,failed:0});
 for(const pack of packs)Object.assign(all,backupPlan(all,pack).patch);
 assert.ok(all['fq-history-book-10006']);assert.equal(all['fq-choice-10002'].note,'保留我');
 await assert.rejects(cleanupOperation({all:async()=>all},{action:'cleanupCommit'}));
});
test('大备份分包均可独立导入，中文按字节控制，未知数据不导出',()=>{
 const all={secret:'不可导出'};for(let i=10000;i<13000;i++)all['fq-history-book-'+i]={id:String(i),title:'书名'.repeat(200),author:'作者',matches:['词'.repeat(200)],firstSeen:1,lastSeen:1,handledAt:0};
 const packs=backupParts(all);assert.ok(packs.length>1);const restored={};for(const pack of packs){assert.ok(Buffer.byteLength(JSON.stringify(pack))<10*1024*1024);Object.assign(restored,backupPlan(restored,pack).patch);}
 assert.equal(Object.keys(restored).filter(k=>k.startsWith('fq-history-book-')).length,3000);assert.equal(restored.secret,undefined);
});

function cleanupPreview(all, options={}, now=Date.now()) {
  const days=Number(options.days??90);if(![0,30,90,180].includes(days))throw Error('无效清理范围');
  const rows=[];let protectedCount=0;
  for(const [key,row] of Object.entries(all)){
    if(!row||!/^\d{5,25}$/.test(row.id||'')||key!=='fq-history-book-'+row.id)continue;
    const choice=all['fq-choice-'+row.id];
    if(choice&&(['later','skip'].includes(choice.state)||String(choice.note||'').trim())){protectedCount++;continue;}
    if(!Number.isSafeInteger(row.lastSeen)||row.lastSeen<=0||row.lastSeen>now)continue;
    if(days&&row.lastSeen>=now-days*86400000)continue;
    if(options.handledOnly&&!row.handledAt)continue;
    rows.push({id:row.id,title:row.title,signature:JSON.stringify(row)});
  }
  return {rows,protectedCount,options:{days,handledOnly:!!options.handledOnly}};
}
async function cleanupOperation(storage,message){
  if(!storage.remove||!storage.atomicBackup)throw Error('请使用 Chrome／Edge 扩展版进行安全清理');
  const all=await storage.all(),plan=cleanupPreview(all,message.options);
  if(message.action==='cleanupPreview')return plan;
  if(!Array.isArray(message.rows)||message.rows.length>50000)throw Error('请重新预览');
  const eligible=new Map(plan.rows.map(r=>[r.id,r.signature]));let removed=0,skipped=0,failed=0;
  for(const row of new Map(message.rows.map(r=>[r.id,r])).values()){
    if(!eligible.has(row.id)||eligible.get(row.id)!==row.signature){skipped++;continue;}
    try{await storage.remove('fq-history-book-'+row.id);removed++;}catch{failed++;}
  }
  return {removed,skipped,failed};
}
export {cleanupPreview,cleanupOperation};

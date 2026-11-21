const official=createOfficialShelfClient({fetchImpl:(...args)=>fetch(...args),csrf:()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('passport_csrf_token='))?.split('=').slice(1).join('=')||''});
let syncAccount='',syncRows=new Map(),officialRows=null,syncBusy=false,syncLoading=false,syncGeneration=0;
const selectedCandidates=new Set();
const candidateRows=()=>[...choices.values()].filter(r=>r.state==='later'&&(!cq('query').value.trim()||(r.title+' '+r.author).toLowerCase().includes(cq('query').value.trim().toLowerCase()))&&reviewMatches(r));
function syncStatus(id){
  const known=syncRows.get(id),remote=officialRows?.find(r=>String(r.book_id)===id);
  if(official.inTarget(remote))return {status:'success',label:'已同步到官方待看'};
  if(known?.status==='success')return officialRows?{status:'pending',label:'待同步'}:{status:'success',label:'已同步（上次核验）'};
  if(known?.status==='failed')return {status:'failed',label:known.message||'同步失败，请重试'};
  if(['queued','syncing'].includes(known?.status))return {status:syncBusy?known.status:'failed',label:syncBusy?(known.message||'等待同步'):'上次同步未完成，点击重试核验'};
  return {status:'pending',label:'待同步'};
}
async function loadSyncRecords(){const accountId=syncAccount;if(accountId){const rows=await historyCall({action:'syncList',accountId});if(accountId===syncAccount)syncRows=new Map(rows.map(r=>[r.id,r]));}}
async function refreshOfficial(){
  if(syncBusy||syncLoading)return;syncLoading=true;const generation=++syncGeneration;renderChoices();
  try{const accountId=await official.account();const rows=await official.read();if(generation!==syncGeneration)return;if(syncAccount!==accountId)selectedCandidates.clear();syncAccount=accountId;officialRows=rows;await loadSyncRecords();cq('sync-message').textContent='已核对官方书架；仅点击同步时才会写入。';}
  catch(error){syncAccount='';officialRows=null;syncRows.clear();cq('sync-message').textContent=error.message;}
  finally{syncLoading=false;renderChoices();}
}
async function syncRecord(id,status,message='',groupId=''){const row=await historyCall({action:'syncSave',accountId:syncAccount,id,status,message,groupId});syncRows.set(id,row);renderChoices();}
function renderSyncTools(){
  cq('official-tools').hidden=cq('filter').value!=='later';
  for(const id of selectedCandidates)if(choices.get(id)?.state!=='later')selectedCandidates.delete(id);
  cq('sync-batch').textContent='加入官方待看（'+selectedCandidates.size+'）';
  cq('sync-batch').disabled=syncBusy||syncLoading||!selectedCandidates.size;
  cq('sync-select').disabled=syncBusy||syncLoading;
  cq('sync-refresh').disabled=syncBusy||syncLoading;
  cq('sync-retry').disabled=syncBusy||syncLoading||!candidateRows().some(r=>syncStatus(r.id).status==='failed');
}
function addSyncControls(row,el){
  const current=syncStatus(row.id),check=document.createElement('input');check.type='checkbox';check.className='candidate-check';check.checked=selectedCandidates.has(row.id);check.disabled=syncBusy||syncLoading||current.status==='success';check.setAttribute('aria-label','选择候选：'+row.title);check.onchange=()=>{check.checked?selectedCandidates.add(row.id):selectedCandidates.delete(row.id);renderChoices();};el.prepend(check);
  const line=document.createElement('div');line.className='sync-state';line.dataset.status=current.status;line.textContent=current.label;el.append(line);
}
async function prepareSync(ids){
  if(syncBusy||syncLoading)return;
  ids=[...new Set(ids)].filter(id=>choices.get(id)?.state==='later');if(!ids.length)return;
  if(!navigator.locks?.request){cq('sync-message').textContent='当前浏览器不支持安全的跨标签页同步，请使用新版 Chrome。';return;}
  syncBusy=true;cq('sync-review').hidden=true;renderChoices();
  try{
    const accountId=await official.account();const rows=await official.read();syncAccount=accountId;officialRows=rows;await loadSyncRecords();
    const allowed=new Map(),conflicts=[];
    for(const id of ids){const row=rows.find(r=>String(r.book_id)===id);if(row?.group_id&&!official.inTarget(row)){allowed.set(id,String(row.group_id));conflicts.push({title:choices.get(id).title,group:row.group_name||'未命名分组'});}}
    if(conflicts.length){
      const panel=cq('sync-review');panel.replaceChildren();const text=document.createElement('p');text.textContent='以下 '+conflicts.length+' 本已在其他官方分组。继续会移到“待看”：';panel.append(text);
      const list=document.createElement('ul');for(const item of conflicts){const li=document.createElement('li');li.textContent=item.title+'（'+item.group+'）';list.append(li);}panel.append(list);
      const yes=document.createElement('button');yes.textContent='移动并继续';yes.onclick=()=>{panel.hidden=true;runSync(ids,accountId,allowed);};
      const no=document.createElement('button');no.textContent='取消';no.onclick=()=>{panel.hidden=true;syncBusy=false;cq('sync-message').textContent='已取消，官方书架未改动。';renderChoices();};panel.append(yes,no);panel.hidden=false;
      cq('sync-message').textContent='等待确认移动分组';renderChoices();return;
    }
    await runSync(ids,accountId,allowed);
  }catch(error){cq('sync-message').textContent=error.message;syncBusy=false;renderChoices();}
}
async function runSync(ids,accountId,allowed){
  let done=0,failed=0;cq('sync-message').textContent='正在等待同步，请保持此页面打开…';
  try{
    await navigator.locks.request('fq-official-shelf-sync',async()=>{
      for(const id of ids)await syncRecord(id,'queued','等待同步');
      for(const id of ids){
        try{
          const current=(await historyCall({action:'choices'})).find(r=>r.id===id);if(current?.state!=='later')throw Error('已不在候选清单，本次未同步。');
          await syncRecord(id,'syncing','正在核对官方书架');
          const result=await official.syncOne(id,{accountId,allowedGroup:allowed.get(id)||'',onStage:stage=>syncRecord(id,'syncing',({adding:'正在加入官方书架',moving:'正在移入官方待看',verifying:'正在核验保存结果'})[stage])});
          if(officialRows){officialRows=officialRows.filter(r=>String(r.book_id)!==id);officialRows.push({book_id:id,group_id:result.groupId,group_name:'待看'});}await syncRecord(id,'success','已同步到官方待看',result.groupId);selectedCandidates.delete(id);done++;
        }catch(error){failed++;try{await syncRecord(id,'failed',error.message);}catch{cq('sync-message').textContent='本地同步状态保存失败，请刷新后核对官方书架。';throw error;}}
        cq('sync-message').textContent='已处理 '+(done+failed)+' / '+ids.length+' 本；成功 '+done+' 本，失败 '+failed+' 本。';
      }
    });
    officialRows=null;
  }catch(error){cq('sync-message').textContent='同步已停止：'+error.message;officialRows=null;}
  finally{syncBusy=false;renderChoices();}
}
cq('sync-select').onclick=()=>{const ids=candidateRows().filter(r=>syncStatus(r.id).status!=='success').map(r=>r.id),all=ids.every(id=>selectedCandidates.has(id));for(const id of ids)all?selectedCandidates.delete(id):selectedCandidates.add(id);renderChoices();};
cq('sync-batch').onclick=()=>prepareSync([...selectedCandidates]);
cq('sync-retry').onclick=()=>prepareSync(candidateRows().filter(r=>syncStatus(r.id).status==='failed').map(r=>r.id));
cq('sync-refresh').onclick=refreshOfficial;
const syncStyle=document.createElement('style');syncStyle.textContent='.candidate-check{width:auto;margin-right:8px;accent-color:#ff5f16}.sync-toolbar{display:flex;flex-wrap:wrap;gap:6px}.sync-one{color:#d64c0b!important}.sync-state{font-size:12px;color:#777;margin:8px 0 2px}.sync-state[data-status=success]{color:#287541}.sync-state[data-status=failed]{color:#b23b2b}#sync-review{background:#fff5ec;border:1px solid #ffdcc3;border-radius:8px;padding:12px}#sync-review ul{max-height:180px;overflow:auto}#official-tools p{font-size:13px;color:#777}';cs.append(syncStyle);
const stateLabel=state=>({later:'已加入候选',skip:'不想看',none:'未标记'}[state]||'未标记');

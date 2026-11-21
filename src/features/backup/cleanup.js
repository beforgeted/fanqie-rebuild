const cleanupSection=document.createElement('section');cleanupSection.style.cssText='border-top:1px solid #eadfd6;margin-top:24px;padding-top:20px';
cleanupSection.innerHTML='<h3>清理屏蔽记录</h3><p>候选、不想看、备注和屏蔽词始终保留。不会修改官方书架。</p><div class="backup-actions"><select id="cleanup-days" aria-label="清理时间范围"><option value="90">90 天未再次遇到</option><option value="30">30 天未再次遇到</option><option value="180">180 天未再次遇到</option><option value="0">全部可清理记录</option></select><label><input type="checkbox" id="cleanup-handled">只清理我已处理的记录</label><button id="cleanup-preview">预览</button></div><p id="cleanup-status" role="status"></p><details id="cleanup-details" hidden><summary>查看可清理书籍</summary><ul id="cleanup-list" style="max-height:180px;overflow:auto"></ul></details><div id="cleanup-downloads" class="backup-actions"></div><label id="cleanup-ack-row" hidden><input type="checkbox" id="cleanup-ack">我已保存全部备份文件</label><div class="backup-actions"><button id="cleanup-confirm" hidden disabled>确认清理</button></div>';
backupView.append(cleanupSection);
let cleanupPlan=null,cleanupBusy=false,cleanupUrls=[];
function cleanupReset(){cleanupPlan=null;for(const url of cleanupUrls)URL.revokeObjectURL(url);cleanupUrls=[];$('cleanup-downloads').replaceChildren();$('cleanup-details').hidden=true;$('cleanup-ack-row').hidden=true;$('cleanup-ack').checked=false;$('cleanup-confirm').hidden=true;$('cleanup-confirm').disabled=true;}
function cleanupLock(value){cleanupBusy=value;for(const id of ['cleanup-days','cleanup-handled','cleanup-preview'])$(id).disabled=value;}
$('cleanup-days').onchange=$('cleanup-handled').onchange=()=>{cleanupReset();$('cleanup-status').textContent='条件已改变，请重新预览。';};
$('cleanup-preview').onclick=async()=>{
 if(cleanupBusy)return;cleanupReset();cleanupLock(true);$('cleanup-status').textContent='正在核对记录并准备备份…';
 try{const options={days:Number($('cleanup-days').value),handledOnly:$('cleanup-handled').checked};const plan=await historyCall({action:'cleanupPreview',options});
 $('cleanup-status').textContent='可清理 '+plan.rows.length+' 条，受保护 '+plan.protectedCount+' 条。';if(!plan.rows.length)return;
 const packs=await historyCall({action:'backupParts'});cleanupPlan=plan;
 $('cleanup-list').replaceChildren(...plan.rows.map(row=>{const li=document.createElement('li');li.textContent=row.title;return li;}));$('cleanup-details').hidden=false;
 packs.forEach((pack,i)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(pack)],{type:'application/json'}));cleanupUrls.push(url);const a=document.createElement('a');a.href=url;a.download='番茄清理前备份-'+new Date().toISOString().slice(0,10)+'-'+(i+1)+'.json';a.textContent='下载备份 '+(i+1)+' / '+packs.length;a.onclick=()=>{a.dataset.downloaded='true';};$('cleanup-downloads').append(a);});
 $('cleanup-ack-row').hidden=false;$('cleanup-confirm').hidden=false;
 }catch(error){cleanupReset();$('cleanup-status').textContent='无法准备清理：'+error.message;}finally{cleanupLock(false);}
};
$('cleanup-ack').onchange=()=>{$('cleanup-confirm').disabled=!$('cleanup-ack').checked||[...$('cleanup-downloads').children].some(a=>!a.dataset.downloaded);if($('cleanup-ack').checked&&$('cleanup-confirm').disabled){$('cleanup-ack').checked=false;$('cleanup-status').textContent='请先逐个下载并保存全部备份。';}};
$('cleanup-confirm').onclick=async()=>{if(cleanupBusy||!cleanupPlan||!$('cleanup-ack').checked)return;cleanupLock(true);$('cleanup-confirm').disabled=true;
 try{const result=await historyCall({action:'cleanupCommit',...cleanupPlan});cleanupReset();$('cleanup-status').textContent='已清理 '+result.removed+' 条，因变化跳过 '+result.skipped+' 条，失败 '+result.failed+' 条。'+(result.failed?'请重新预览后重试。':'需要恢复时可导入刚才的备份。');if(historyView)await refreshHistory();}
 catch(error){$('cleanup-status').textContent='清理未完成，请重新预览核对后重试。'+error.message;cleanupReset();}finally{cleanupLock(false);}
};
let cleanupHistoryTimer;
if(typeof FQ_HISTORY_WATCH==='function')FQ_HISTORY_WATCH(()=>{clearTimeout(cleanupHistoryTimer);cleanupHistoryTimer=setTimeout(()=>{if(historyView)refreshHistory();},150);});
